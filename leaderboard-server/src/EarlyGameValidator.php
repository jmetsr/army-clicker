<?php
/**
 * EarlyGameValidator - Validates early game (pre-magic) via replay
 *
 * Task 07g: Replay validation for early game
 * - Army chain: Recruits, SL, Barracks, MB, Kingdom, Empire
 * - Economy chain: Farms, Plantations, Colonies
 * - Food/starvation mechanics
 * - Income verification (troops × ppt × 4)
 * - Spending verification (costs don't exceed balance)
 */

require_once __DIR__ . '/GameReplay.php';
require_once __DIR__ . '/LogParser.php';

class EarlyGameValidator {
    private LogParser $parser;
    private GameReplay $replay;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
        $this->replay = new GameReplay();
    }

    /**
     * Run early game validation
     * Returns array of flags (issues found)
     */
    public function validate(): array {
        $flags = [];

        error_log("=== EarlyGameValidator::validate() START ===");

        // Check if we have click log data
        $clicks = $this->parser->getClickLog();
        error_log("Click log count: " . count($clicks));

        if (empty($clicks)) {
            // No click log - can't do replay validation
            // This isn't necessarily cheating, might be old log format
            error_log("No click log available!");
            return ['No click log available for replay validation'];
        }

        // Log first few clicks for debugging
        error_log("First 5 clicks: " . json_encode(array_slice($clicks, 0, 5)));

        // Check if game reached magic (early game ends at magic unlock)
        $magicUnlocked = $this->checkMagicUnlocked();
        error_log("Magic unlocked: " . ($magicUnlocked ? "yes" : "no"));

        // Run replay validation
        error_log("Running replay validation...");
        $replayFlags = $this->replay->validateEarlyGame($this->parser);
        error_log("Replay flags: " . json_encode($replayFlags));
        $flags = array_merge($flags, $replayFlags);

        // Additional early-game specific checks
        error_log("Running consistency checks...");
        $consistencyFlags = $this->checkEarlyGameConsistency();
        error_log("Consistency flags: " . json_encode($consistencyFlags));
        $flags = array_merge($flags, $consistencyFlags);

        error_log("=== EarlyGameValidator::validate() END - Total flags: " . count($flags) . " ===");

        return $flags;
    }

    /**
     * Check if magic was unlocked (marks end of "early game")
     */
    private function checkMagicUnlocked(): bool {
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
     * Additional consistency checks for early game
     *
     * Note: Most heuristic checks removed - the replay validation in GameReplay
     * now properly tracks all game mechanics (army chain, economy chain, etc.)
     * and compares against snapshots. Heuristic checks were causing false positives
     * because they didn't account for the exponential boosting mechanics.
     */
    private function checkEarlyGameConsistency(): array {
        // All validation now done by GameReplay with proper mechanic simulation
        return [];
    }

    /**
     * Get replay state for debugging
     */
    public function getReplayState(): array {
        return $this->replay->getState();
    }
}
