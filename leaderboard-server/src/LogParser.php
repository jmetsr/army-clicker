<?php
/**
 * LogParser - Parse game logs and extract milestones
 *
 * Log format (from getGameLog()):
 * {
 *   "version": "1.0",
 *   "mode": "ai25" | "hard" | "practice" | etc,
 *   "startTime": timestamp,
 *   "playerClicks": [...],
 *   "gameEvents": [
 *     { type: "start", day: 0, mode: "...", startTime: ... },
 *     { type: "snapshot", day: N, player: { troops, ppt, power, coins, food, farms }, ai?: {...} },
 *     { type: "battle", day: N, result: "win"|"lose"|"tie", playerPower, enemyPower },
 *     { type: "vanquish", day: N, coins, power },
 *     { type: "surrender", day: N, coins, power }
 *   ]
 * }
 *
 * OrdinalNumber values are stored as { arrows: N, height: M }
 */

class LogParser {
    private ?array $log = null;
    private array $events = [];
    private ?string $error = null;

    /**
     * Parse raw log JSON string
     */
    public function parse(string $rawLog): bool {
        $this->log = null;
        $this->events = [];
        $this->error = null;

        if (empty($rawLog)) {
            $this->error = 'Empty log';
            return false;
        }

        $data = json_decode($rawLog, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->error = 'Invalid JSON: ' . json_last_error_msg();
            return false;
        }

        if (!is_array($data)) {
            $this->error = 'Log must be an object';
            return false;
        }

        $this->log = $data;
        $this->events = $data['gameEvents'] ?? [];
        return true;
    }

    /**
     * Parse from already-decoded array (e.g., from JSON request body)
     */
    public function parseArray(array $data): bool {
        $this->log = null;
        $this->events = [];
        $this->error = null;

        $this->log = $data;
        $this->events = $data['gameEvents'] ?? [];
        return true;
    }

    public function getError(): ?string {
        return $this->error;
    }

    public function getVersion(): string {
        return $this->log['version'] ?? 'unknown';
    }

    public function getMode(): string {
        return $this->log['mode'] ?? 'unknown';
    }

    public function getStartTime(): ?int {
        return $this->log['startTime'] ?? null;
    }

    public function getEvents(): array {
        return $this->events;
    }

    public function getEventsOfType(string $type): array {
        return array_filter($this->events, fn($e) => ($e['type'] ?? '') === $type);
    }

    public function getSnapshots(): array {
        return $this->getEventsOfType('snapshot');
    }

    public function getDayCount(): int {
        $maxDay = 0;
        foreach ($this->events as $event) {
            $day = $event['day'] ?? 0;
            if ($day > $maxDay) {
                $maxDay = $day;
            }
        }
        return $maxDay;
    }

    /**
     * Convert OrdinalNumber {arrows, height} to a comparable float
     * For arrows=0: just the height (plain number)
     * For arrows=1: 10^height (scientific notation) - return log10 value for comparison
     * For arrows>=2: return a very large number (tetration+)
     */
    public static function ordinalToFloat($value): float {
        if (is_numeric($value)) {
            return (float)$value;
        }
        if (!is_array($value)) {
            return 0.0;
        }

        $arrows = $value['arrows'] ?? 0;
        $height = $value['height'] ?? 0;

        // Handle nested OrdinalNumber heights
        if (is_array($height)) {
            $height = self::ordinalToFloat($height);
        }

        if ($arrows === 0) {
            return (float)$height;
        } elseif ($arrows === 1) {
            // 10^height - for comparison purposes, return log10 value scaled
            // If height < 308, we can compute the actual value
            if ($height < 308) {
                return pow(10, $height);
            }
            // Return INF for huge numbers
            return INF;
        } else {
            // Tetration or higher - effectively infinite for milestone purposes
            return INF;
        }
    }

    /**
     * Compare two OrdinalNumber values
     * Returns: -1 if a < b, 0 if equal, 1 if a > b
     */
    public static function compareOrdinal($a, $b): int {
        $aFloat = self::ordinalToFloat($a);
        $bFloat = self::ordinalToFloat($b);
        return $aFloat <=> $bFloat;
    }

    /**
     * Check if OrdinalNumber value >= threshold
     */
    public static function ordinalGte($value, float $threshold): bool {
        return self::ordinalToFloat($value) >= $threshold;
    }

    /**
     * Format OrdinalNumber for display/storage
     */
    public static function formatOrdinal($value): string {
        if (is_numeric($value)) {
            return number_format((float)$value, 0, '', '');
        }
        if (!is_array($value)) {
            return '0';
        }

        $arrows = $value['arrows'] ?? 0;
        $height = $value['height'] ?? 0;

        if ($arrows === 0) {
            return number_format((float)$height, 0, '', '');
        } elseif ($arrows === 1) {
            return '10^' . round($height, 2);
        } elseif ($arrows === 2) {
            return '10^^' . round($height, 2);
        } else {
            return '10^' . $arrows . '^' . round($height, 2);
        }
    }

    /**
     * Get snapshot closest to (but not after) a given day
     */
    public function getSnapshotAtDay(int $targetDay): ?array {
        $snapshots = $this->getSnapshots();
        $closest = null;
        $closestDay = -1;

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;
            if ($day <= $targetDay && $day > $closestDay) {
                $closest = $snap;
                $closestDay = $day;
            }
        }

        return $closest;
    }

    /**
     * Extract all milestones from the log
     */
    public function extractMilestones(): array {
        $milestones = [
            'gameMode' => $this->normalizeGameMode($this->getMode()),
            'dayMillionCoins' => null,
            'dayBillionCoins' => null,
            'dayTrillionCoins' => null,
            'dayQuadrillionCoins' => null,
            'dayQuintillionCoins' => null,
            'dayVanquish' => null,
            'daySurrender' => null,
            'coinsAtYear1' => null,
            'coinsAtYear2' => null,
            'finalCoins' => null,
            'finalDay' => $this->getDayCount(),
        ];

        // Coin thresholds
        $thresholds = [
            'dayMillionCoins' => 1e6,
            'dayBillionCoins' => 1e9,
            'dayTrillionCoins' => 1e12,
            'dayQuadrillionCoins' => 1e15,
            'dayQuintillionCoins' => 1e18,
        ];

        // Track which thresholds we've found
        $foundThresholds = [];

        // Process snapshots in order
        $snapshots = $this->getSnapshots();
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        $lastSnapshot = null;
        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;
            $coins = $snap['player']['coins'] ?? 0;

            // Check each threshold
            foreach ($thresholds as $milestone => $threshold) {
                if (!isset($foundThresholds[$milestone]) && self::ordinalGte($coins, $threshold)) {
                    $milestones[$milestone] = $day;
                    $foundThresholds[$milestone] = true;
                }
            }

            // Year snapshots
            if ($day === 365 || ($day > 365 && $milestones['coinsAtYear1'] === null)) {
                $milestones['coinsAtYear1'] = self::formatOrdinal($coins);
            }
            if ($day === 730 || ($day > 730 && $milestones['coinsAtYear2'] === null)) {
                $milestones['coinsAtYear2'] = self::formatOrdinal($coins);
            }

            $lastSnapshot = $snap;
        }

        // Final coins from last snapshot
        if ($lastSnapshot) {
            $milestones['finalCoins'] = self::formatOrdinal($lastSnapshot['player']['coins'] ?? 0);
        }

        // Victory events
        foreach ($this->events as $event) {
            $type = $event['type'] ?? '';
            if ($type === 'vanquish' && $milestones['dayVanquish'] === null) {
                $milestones['dayVanquish'] = $event['day'] ?? null;
            }
            if ($type === 'surrender' && $milestones['daySurrender'] === null) {
                $milestones['daySurrender'] = $event['day'] ?? null;
            }
        }

        return $milestones;
    }

    /**
     * Normalize game mode to standard format
     */
    private function normalizeGameMode(string $mode): string {
        $mode = strtolower(trim($mode));

        // AI modes
        if (preg_match('/^ai(\d+)$/', $mode, $m)) {
            return 'ai_' . $m[1] . 'cps';
        }

        // Standard modes
        $mapping = [
            'practice' => 'practice',
            'easy' => 'easy',
            'medium' => 'medium',
            'normal' => 'medium',
            'hard' => 'hard',
        ];

        return $mapping[$mode] ?? $mode;
    }

    /**
     * Get click log (for validation)
     */
    public function getClickLog(): array {
        return $this->log['playerClicks'] ?? [];
    }

    /**
     * Get total click count
     */
    public function getClickCount(): int {
        return count($this->getClickLog());
    }
}
