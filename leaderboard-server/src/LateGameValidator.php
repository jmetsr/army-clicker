<?php
/**
 * LateGameValidator - Validates late game (auto-upgraders, forbidden ritual tier)
 *
 * Task 07i: Validation for late game
 * - Auto-upgraders (10+ magic cost)
 * - Forbidden ritual tier (sapphire, emerald, ruby)
 * - Tower notation numbers (arrows >= 2)
 *
 * Note: Full replay is extremely complex for late game due to:
 * - Auto-upgrader cascade effects
 * - Tower notation arithmetic
 * - OrdinalNumber operations
 *
 * This validator focuses on sanity checks rather than full replay.
 */

require_once __DIR__ . '/LogParser.php';
require_once __DIR__ . '/OrdinalNumber.php';

class LateGameValidator {
    private LogParser $parser;

    // Late game magic costs
    const SAPPHIRE_UNLOCK_COST = 10;
    const EMERALD_UNLOCK_COST = 20;
    const RUBY_UNLOCK_COST = 50;
    const AUTO_UPGRADER_COST = 10;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Run late game validation
     * Returns array of flags (issues found)
     */
    public function validate(): array {
        $flags = [];

        // Check if we have click log data
        $clicks = $this->parser->getClickLog();
        if (empty($clicks)) {
            return ['No click log available for late game validation'];
        }

        // Check if game reached late game (10+ magic spent)
        if (!$this->checkLateGameReached($clicks)) {
            // Game didn't reach late game - nothing to validate
            return [];
        }

        // Sanity checks for late game
        $flags = array_merge($flags, $this->checkMagicConsistency($clicks));
        $flags = array_merge($flags, $this->checkAutoUpgraderConsistency($clicks));
        $flags = array_merge($flags, $this->checkTowerNotationSanity());

        return $flags;
    }

    /**
     * Check if game reached late game stage
     */
    private function checkLateGameReached(array $clicks): bool {
        $lateGameActions = [
            'unlock_sapphire',
            'unlock_emerald',
            'unlock_ruby',
            'auto_upgrader',
            'sapphire',
            'emerald',
            'ruby',
        ];

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';
            if (in_array($action, $lateGameActions)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check magic spent vs earned for late game purchases
     */
    private function checkMagicConsistency(array $clicks): array {
        $flags = [];

        // Count dark rituals (magic earned)
        $darkRituals = 0;
        // Count magic spent
        $magicSpent = 0;

        // Magic costs for all actions
        $magicCosts = [
            // Middle game (1-9 magic)
            'unlock_planet' => 1,
            'unlock_solar_system' => 1,
            'unlock_galaxy' => 1,
            'unlock_galaxy_cluster' => 1,
            'unlock_supercluster' => 1,
            'unlock_observable_universe' => 1,
            'unlock_full_universe' => 1,
            'unlock_quantum_multiverse' => 1,
            'unlock_cosmological_multiverse' => 1,
            'unlock_mathematical_multiverse' => 1,
            'upgrade_button' => 2,
            'separate_costs' => 3,
            'freeze_costs' => 4,
            'eternal_feast' => 1,
            // Late game (10+ magic)
            'unlock_sapphire' => 10,
            'unlock_emerald' => 20,
            'unlock_ruby' => 50,
            'auto_upgrader' => 10,
        ];

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';

            if ($action === 'dark_ritual') {
                $darkRituals++;
            }

            if (isset($magicCosts[$action])) {
                $magicSpent += $magicCosts[$action];
            }
        }

        // Check magic balance
        if ($magicSpent > $darkRituals) {
            $flags[] = "Total magic spent ($magicSpent) exceeds dark rituals performed ($darkRituals)";
        }

        // Late game specific: check unlock order
        $this->checkUnlockOrder($clicks, $flags);

        return $flags;
    }

    /**
     * Check that unlocks happen in correct order with sufficient magic
     */
    private function checkUnlockOrder(array $clicks, array &$flags): void {
        $magicBalance = 0;
        $sapphireUnlocked = false;
        $emeraldUnlocked = false;

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';

            if ($action === 'dark_ritual') {
                $magicBalance++;
            }

            // Check unlock_sapphire requires 10 magic
            if ($action === 'unlock_sapphire') {
                if ($magicBalance < 10) {
                    $flags[] = "unlock_sapphire clicked with only $magicBalance magic (needs 10)";
                }
                $magicBalance -= 10;
                $sapphireUnlocked = true;
            }

            // Check unlock_emerald requires sapphire first and 20 magic
            if ($action === 'unlock_emerald') {
                if (!$sapphireUnlocked) {
                    $flags[] = "unlock_emerald clicked before sapphire was unlocked";
                }
                if ($magicBalance < 20) {
                    $flags[] = "unlock_emerald clicked with only $magicBalance magic (needs 20)";
                }
                $magicBalance -= 20;
                $emeraldUnlocked = true;
            }

            // Check unlock_ruby requires emerald first and 50 magic
            if ($action === 'unlock_ruby') {
                if (!$emeraldUnlocked) {
                    $flags[] = "unlock_ruby clicked before emerald was unlocked";
                }
                if ($magicBalance < 50) {
                    $flags[] = "unlock_ruby clicked with only $magicBalance magic (needs 50)";
                }
                $magicBalance -= 50;
            }
        }
    }

    /**
     * Check auto-upgrader consistency
     */
    private function checkAutoUpgraderConsistency(array $clicks): array {
        $flags = [];

        // Count auto-upgrader purchases
        $autoUpgraders = 0;
        $magicBalance = 0;

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';

            if ($action === 'dark_ritual') {
                $magicBalance++;
            }

            if ($action === 'auto_upgrader') {
                $autoUpgraders++;
                if ($magicBalance < 10) {
                    $flags[] = "auto_upgrader #$autoUpgraders clicked with only $magicBalance magic (needs 10)";
                }
                $magicBalance -= 10;
            }
        }

        // Auto-upgrader sanity: can't have more than ~20 auto-upgraders realistically
        // (would need 200+ dark rituals at astronomical coin costs)
        if ($autoUpgraders > 50) {
            $flags[] = "Suspicious number of auto-upgraders: $autoUpgraders";
        }

        return $flags;
    }

    /**
     * Check tower notation numbers for obvious impossibilities
     */
    private function checkTowerNotationSanity(): array {
        $flags = [];
        $snapshots = $this->parser->getSnapshots();

        if (empty($snapshots)) {
            return $flags;
        }

        // Sort by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        $prevSnapshot = null;
        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;
            $player = $snap['player'] ?? [];

            $coins = $player['coins'] ?? 0;
            $troops = $player['troops'] ?? 0;
            $power = $player['power'] ?? 0;

            // Check for impossible jumps in arrow count
            if ($prevSnapshot !== null) {
                $prevDay = $prevSnapshot['day'] ?? 0;
                $prevCoins = $prevSnapshot['player']['coins'] ?? 0;

                $coinsON = new OrdinalNumber($coins);
                $prevCoinsON = new OrdinalNumber($prevCoins);

                // Check for suspicious arrow jumps
                // Arrows shouldn't increase by more than 1 in a short period
                // (unless auto-upgraders are active, which can cascade)
                $arrowDiff = $coinsON->arrows - $prevCoinsON->arrows;
                $dayDiff = $day - $prevDay;

                // More than 2 arrow jumps in < 100 days is suspicious
                // (without extensive auto-upgrader setup)
                if ($arrowDiff > 2 && $dayDiff < 100) {
                    $flags[] = "Day $day: Suspicious arrow jump (+" . $arrowDiff . " arrows in $dayDiff days)";
                }
            }

            $prevSnapshot = $snap;
        }

        return $flags;
    }
}
