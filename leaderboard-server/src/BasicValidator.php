<?php
/**
 * BasicValidator - Catch obvious cheating with simple sanity checks
 */

require_once __DIR__ . '/IncomeVerifier.php';
require_once __DIR__ . '/SpendingVerifier.php';

class ValidationResult {
    public bool $passed;
    public array $flags;

    public function __construct(bool $passed = true, array $flags = []) {
        $this->passed = $passed;
        $this->flags = $flags;
    }

    public function addFlag(string $flag): void {
        $this->flags[] = $flag;
        $this->passed = false;
    }

    public function merge(ValidationResult $other): void {
        $this->flags = array_merge($this->flags, $other->flags);
        if (!$other->passed) {
            $this->passed = false;
        }
    }
}

class BasicValidator {
    private LogParser $parser;
    private array $flags = [];

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Run all basic validation checks
     */
    public function validate(): ValidationResult {
        $result = new ValidationResult();

        // Run all checks
        $this->checkLogNotEmpty($result);
        $this->checkHasStartEvent($result);
        $this->checkDaySequence($result);
        $this->checkNoNegativeValues($result);
        $this->checkReasonableDayCount($result);
        $this->checkMilestoneConsistency($result);
        $this->checkIncomeVerification($result);
        $this->checkSpendingVerification($result);

        return $result;
    }

    /**
     * Check that spending/gains are plausible
     */
    private function checkSpendingVerification(ValidationResult $result): void {
        $verifier = new SpendingVerifier($this->parser);

        $spendingFlags = $verifier->verify();
        foreach ($spendingFlags as $flag) {
            $result->addFlag($flag);
        }
    }

    /**
     * Check that income matches expected values
     */
    private function checkIncomeVerification(ValidationResult $result): void {
        $verifier = new IncomeVerifier($this->parser);

        // Check day-by-day income
        $incomeFlags = $verifier->verify();
        foreach ($incomeFlags as $flag) {
            $result->addFlag($flag);
        }

        // Check final coins plausibility
        $finalCheck = $verifier->checkFinalCoinsPlausible();
        if ($finalCheck !== null) {
            $result->addFlag($finalCheck);
        }
    }

    /**
     * Check that log isn't empty
     */
    private function checkLogNotEmpty(ValidationResult $result): void {
        $events = $this->parser->getEvents();
        if (empty($events)) {
            $result->addFlag('Log is empty - no game events recorded');
        }
    }

    /**
     * Check for game start event
     */
    private function checkHasStartEvent(ValidationResult $result): void {
        $startEvents = $this->parser->getEventsOfType('start');
        if (empty($startEvents)) {
            $result->addFlag('Missing game start event');
        }
    }

    /**
     * Check that days are sequential and don't go backwards
     */
    private function checkDaySequence(ValidationResult $result): void {
        $snapshots = $this->parser->getSnapshots();
        if (count($snapshots) < 2) {
            return; // Not enough data to check
        }

        // Sort by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        $prevDay = -1;
        $gapCount = 0;
        $maxGap = 0;

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;

            // Check for backwards movement
            if ($day < $prevDay) {
                $result->addFlag("Days go backwards: day $prevDay followed by day $day");
            }

            // Check for large gaps (snapshots should be every 10 days)
            if ($prevDay >= 0) {
                $gap = $day - $prevDay;
                if ($gap > 20) { // More than 2 snapshot intervals
                    $gapCount++;
                    $maxGap = max($maxGap, $gap);
                }
            }

            $prevDay = $day;
        }

        // Flag if too many gaps (might indicate log tampering)
        if ($gapCount > 5) {
            $result->addFlag("Suspicious gaps in day sequence: $gapCount gaps, max gap of $maxGap days");
        }
    }

    /**
     * Check for negative values (impossible in normal gameplay)
     */
    private function checkNoNegativeValues(ValidationResult $result): void {
        $snapshots = $this->parser->getSnapshots();

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? '?';
            $player = $snap['player'] ?? [];

            // Check troops
            if ($this->isNegative($player['troops'] ?? 0)) {
                $result->addFlag("Negative troops at day $day");
            }

            // Check coins
            if ($this->isNegative($player['coins'] ?? 0)) {
                $result->addFlag("Negative coins at day $day");
            }

            // Check food
            if ($this->isNegative($player['food'] ?? 0)) {
                $result->addFlag("Negative food at day $day");
            }

            // Check farms
            if (($player['farms'] ?? 0) < 0) {
                $result->addFlag("Negative farm count at day $day");
            }
        }
    }

    /**
     * Check if an OrdinalNumber or plain number is negative
     */
    private function isNegative($value): bool {
        if (is_numeric($value)) {
            return $value < 0;
        }
        if (is_array($value)) {
            // OrdinalNumber format: {arrows, height}
            // arrows >= 0 means positive (it's 10^something)
            // Only arrows=0 with negative height would be negative
            $arrows = $value['arrows'] ?? 0;
            $height = $value['height'] ?? 0;
            if ($arrows === 0 && is_numeric($height) && $height < 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check that day count is reasonable for the time played
     */
    private function checkReasonableDayCount(ValidationResult $result): void {
        $dayCount = $this->parser->getDayCount();
        $clickCount = $this->parser->getClickCount();

        // If we have click timestamps, check rate
        $clickLog = $this->parser->getClickLog();
        if (count($clickLog) >= 2) {
            $firstClick = $clickLog[0]['t'] ?? 0;
            $lastClick = $clickLog[count($clickLog) - 1]['t'] ?? 0;
            $elapsedMs = $lastClick - $firstClick;
            $elapsedSeconds = $elapsedMs / 1000;

            if ($elapsedSeconds > 0) {
                // Each day requires at least 1 click, game runs ~10 days/second max
                // So 1000 days in 10 seconds = 100 days/sec is suspicious
                $daysPerSecond = $dayCount / $elapsedSeconds;

                if ($daysPerSecond > 50) {
                    $result->addFlag("Impossible game speed: $dayCount days in " . round($elapsedSeconds) . " seconds ($daysPerSecond days/sec)");
                }
            }
        }

        // Sanity check: more than 100k days is suspicious
        if ($dayCount > 100000) {
            $result->addFlag("Unrealistic day count: $dayCount days");
        }
    }

    /**
     * Check that claimed milestones are roughly consistent with log
     */
    private function checkMilestoneConsistency(ValidationResult $result): void {
        $milestones = $this->parser->extractMilestones();
        $snapshots = $this->parser->getSnapshots();

        if (empty($snapshots)) {
            return;
        }

        // Sort snapshots by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        // Check coin milestones - verify we see appropriate coin values
        $this->checkCoinMilestone($result, $snapshots, $milestones['dayMillionCoins'], 1e6, 'million');
        $this->checkCoinMilestone($result, $snapshots, $milestones['dayBillionCoins'], 1e9, 'billion');
        $this->checkCoinMilestone($result, $snapshots, $milestones['dayTrillionCoins'], 1e12, 'trillion');

        // Check vanquish/surrender - should have corresponding event
        if ($milestones['dayVanquish'] !== null) {
            $vanquishEvents = $this->parser->getEventsOfType('vanquish');
            if (empty($vanquishEvents)) {
                $result->addFlag("Claims vanquish at day {$milestones['dayVanquish']} but no vanquish event in log");
            }
        }

        if ($milestones['daySurrender'] !== null) {
            $surrenderEvents = $this->parser->getEventsOfType('surrender');
            if (empty($surrenderEvents)) {
                $result->addFlag("Claims surrender at day {$milestones['daySurrender']} but no surrender event in log");
            }
        }
    }

    /**
     * Check a specific coin milestone
     */
    private function checkCoinMilestone(ValidationResult $result, array $snapshots, ?int $claimedDay, float $threshold, string $name): void {
        if ($claimedDay === null) {
            return; // Not claimed
        }

        // Find snapshot at or near claimed day
        $foundThreshold = false;
        $beforeDay = null;
        $afterDay = null;

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;
            $coins = $snap['player']['coins'] ?? 0;
            $coinValue = LogParser::ordinalToFloat($coins);

            if ($coinValue >= $threshold) {
                $foundThreshold = true;
                if ($afterDay === null || $day < $afterDay) {
                    $afterDay = $day;
                }
            } else {
                if ($beforeDay === null || $day > $beforeDay) {
                    $beforeDay = $day;
                }
            }
        }

        if (!$foundThreshold) {
            $result->addFlag("Claims $name coins at day $claimedDay but log never shows coins >= $threshold");
        } elseif ($afterDay !== null && abs($afterDay - $claimedDay) > 20) {
            // Allow some tolerance (snapshots are every 10 days)
            $result->addFlag("Claims $name coins at day $claimedDay but log shows it at day $afterDay (off by " . abs($afterDay - $claimedDay) . " days)");
        }
    }
}
