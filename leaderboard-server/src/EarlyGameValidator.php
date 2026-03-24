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
     */
    private function checkEarlyGameConsistency(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();
        $snapshots = $this->parser->getSnapshots();

        if (empty($clicks) || empty($snapshots)) {
            return $flags;
        }

        // Count actions from click log
        $actionCounts = [];
        foreach ($clicks as $click) {
            $action = $click['action'] ?? 'unknown';
            $actionCounts[$action] = ($actionCounts[$action] ?? 0) + 1;
        }

        // Get final snapshot
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));
        $final = end($snapshots);
        $finalPlayer = $final['player'] ?? [];

        // Check: if they claim many farms, they should have clicked farm
        $snapFarms = $finalPlayer['farms'] ?? 0;
        $clickFarms = $actionCounts['farm'] ?? 0;
        // Allow for plantations boosting farm count
        $clickPlantations = $actionCounts['plantation'] ?? 0;
        $maxPossibleFarms = $clickFarms + ($clickFarms * $clickPlantations);
        if ($snapFarms > $maxPossibleFarms * 2 && $snapFarms > 10) {
            $flags[] = "Farm count ($snapFarms) exceeds what's possible from clicks (farm: $clickFarms, plantation: $clickPlantations)";
        }

        // Check: troop growth rate should be reasonable
        $firstSnap = reset($snapshots);
        $firstDay = $firstSnap['day'] ?? 0;
        $finalDay = $final['day'] ?? 0;
        $daysPassed = $finalDay - $firstDay;

        if ($daysPassed > 10) {
            $finalTroops = LogParser::ordinalToFloat($finalPlayer['troops'] ?? 0);
            $firstTroops = LogParser::ordinalToFloat($firstSnap['player']['troops'] ?? 0);

            // Rough check: troops shouldn't grow faster than exponentially reasonable
            // Even with max clicking, troop growth is limited by coin income
            $recruits = $actionCounts['recruit'] ?? 0;

            // If they have way more troops than recruits could provide
            // (allowing for some SL boosting), that's suspicious
            $maxReasonableTroops = $recruits * 1000;  // Very generous multiplier for SL effects
            if ($finalTroops > $maxReasonableTroops && $finalTroops > 1e6) {
                $flags[] = "Troop count (" . number_format($finalTroops) . ") seems too high for $recruits recruit clicks";
            }
        }

        return $flags;
    }

    /**
     * Get replay state for debugging
     */
    public function getReplayState(): array {
        return $this->replay->getState();
    }
}
