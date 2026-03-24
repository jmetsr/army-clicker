<?php
/**
 * MiddleGameValidator - Validates middle game (magic stage) via replay
 *
 * Task 07h: Replay validation for middle game
 * - Magic generation (dark ritual) and spending
 * - Rituals and magic upgrades (1-9 magic cost)
 * - Extended army tiers (planet through supercluster)
 * - Dragon mechanics (spawned by dark ritual)
 * - Excludes: Auto-upgraders, forbidden ritual tier (10+ magic)
 */

require_once __DIR__ . '/GameReplay.php';
require_once __DIR__ . '/LogParser.php';

class MiddleGameValidator {
    private LogParser $parser;
    private GameReplay $replay;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
        $this->replay = new GameReplay();
    }

    /**
     * Run middle game validation
     * Returns array of flags (issues found)
     */
    public function validate(): array {
        $flags = [];

        // Check if we have click log data
        $clicks = $this->parser->getClickLog();
        if (empty($clicks)) {
            return ['No click log available for middle game validation'];
        }

        // Check if game reached magic stage
        if (!$this->checkMagicStageReached()) {
            // Game didn't reach magic - nothing to validate for middle game
            return [];
        }

        // Run middle game replay validation
        $replayFlags = $this->replay->validateMiddleGame($this->parser);
        $flags = array_merge($flags, $replayFlags);

        // Additional middle-game specific checks
        $flags = array_merge($flags, $this->checkMiddleGameConsistency());

        return $flags;
    }

    /**
     * Check if game reached magic stage (coins >= 1 trillion)
     */
    private function checkMagicStageReached(): bool {
        $snapshots = $this->parser->getSnapshots();
        foreach ($snapshots as $snap) {
            $coins = $snap['player']['coins'] ?? 0;
            if (LogParser::ordinalGte($coins, 1e12)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Additional consistency checks for middle game
     */
    private function checkMiddleGameConsistency(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();

        if (empty($clicks)) {
            return $flags;
        }

        // Count magic-related actions
        $darkRituals = 0;
        $magicSpent = 0;

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';

            if ($action === 'dark_ritual') {
                $darkRituals++;
            }

            // Count magic spent on various unlocks/upgrades
            $magicCosts = [
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
            ];

            if (isset($magicCosts[$action])) {
                $magicSpent += $magicCosts[$action];
            }
        }

        // Check: magic spent shouldn't exceed magic earned
        // Each dark ritual gives 1 magic
        if ($magicSpent > $darkRituals) {
            $flags[] = "Magic spent ($magicSpent) exceeds dark rituals performed ($darkRituals)";
        }

        // Check dark ritual cost progression is reasonable
        // Each ritual costs 5x more than the last (1T, 5T, 25T, 125T, ...)
        // If they have many rituals but low coins, that's suspicious
        // (This is already checked in replay, but add a sanity check here)

        return $flags;
    }

    /**
     * Get replay state for debugging
     */
    public function getReplayState(): array {
        return $this->replay->getState();
    }
}
