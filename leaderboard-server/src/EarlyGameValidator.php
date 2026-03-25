<?php
/**
 * EarlyGameValidator - Simple click-by-click validation
 *
 * Each click in the log includes the game state at that moment.
 * We just verify:
 * 1. Each action was affordable (had enough coins)
 * 2. State transitions make sense between clicks
 */

require_once __DIR__ . '/LogParser.php';

class EarlyGameValidator {
    private LogParser $parser;

    // Base costs (must match game)
    const RECRUIT_COST = 20;
    const SQUAD_LEADER_COST = 400;
    const BARRACKS_COST = 1600;
    const MILITARY_BASE_COST = 30000;
    const KINGDOM_COST = 400000;
    const EMPIRE_COST = 40000000;
    const TRAIN_COST = 160;
    const FARM_COST = 1000;
    const PLANTATION_COST = 5000;
    const COLONY_COST = 25000;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Click-by-click validation with transition verification
     */
    public function validate(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();

        if (empty($clicks)) {
            return ['No click log available'];
        }

        error_log("=== EarlyGameValidator: checking " . count($clicks) . " clicks ===");

        // Sort by time
        usort($clicks, fn($a, $b) => ($a['t'] ?? 0) <=> ($b['t'] ?? 0));

        // Track counts that aren't in click log
        $recruitCount = 0;
        $econClicks = 0;
        $prevClick = null;

        foreach ($clicks as $i => $click) {
            $action = $click['action'] ?? '';
            $coins = $click['coins'] ?? 0;
            $tick = $click['tick'] ?? 0;
            $armyClicks = $click['armyClicks'] ?? 0;
            $trainClicks = $click['train'] ?? 0;

            // Check if action was affordable
            $cost = $this->getActionCost($action, $armyClicks, $trainClicks, $recruitCount, $econClicks);
            if ($cost > 0 && $coins < $cost) {
                $flags[] = "Tick $tick: $action with $coins coins (needs $cost)";
            }

            // Check transition from previous click
            if ($prevClick !== null) {
                $transitionFlags = $this->checkTransition($prevClick, $click);
                $flags = array_merge($flags, $transitionFlags);
            }

            // Stop after too many flags
            if (count($flags) >= 10) {
                error_log("Stopping after 10 flags");
                break;
            }

            // Update state for next iteration
            if ($action === 'recruit') $recruitCount++;
            if (in_array($action, ['farm', 'plantation', 'colony'])) $econClicks++;
            $prevClick = $click;
        }

        // Check final state against last click (catches cheating AFTER last click)
        $lastClick = end($clicks);
        $finalStateFlags = $this->checkFinalState($lastClick);
        $flags = array_merge($flags, $finalStateFlags);

        error_log("EarlyGameValidator found " . count($flags) . " issues");
        return $flags;
    }

    /**
     * Check if transition between two clicks is plausible
     */
    private function checkTransition(array $prev, array $curr): array {
        $flags = [];

        $prevCoins = $prev['coins'] ?? 0;
        $currCoins = $curr['coins'] ?? 0;
        $prevTroops = $prev['troops'] ?? 0;
        $prevPpt = $prev['ppt'] ?? 1;
        $prevTick = $prev['tick'] ?? 0;
        $currTick = $curr['tick'] ?? 0;
        $prevAction = $prev['action'] ?? '';

        // Ticks passed (simple subtraction - tick is a monotonic counter)
        $ticksPassed = max(0, $currTick - $prevTick);

        // Passive income: troops × ppt × 1 per tick
        $passiveIncome = $prevTroops * $prevPpt * $ticksPassed;

        // Cost of previous action
        $prevArmyClicks = $prev['armyClicks'] ?? 0;
        $prevTrainClicks = $prev['train'] ?? 0;
        $actionCost = $this->getActionCost($prevAction, $prevArmyClicks, $prevTrainClicks, 0, 0);

        // Beg gives +1
        $begIncome = ($prevAction === 'beg') ? 1 : 0;

        // Expected coins after previous action
        $expectedCoins = $prevCoins - $actionCost + $begIncome + $passiveIncome;

        // Allow some tolerance (10% or 100 coins, whichever is larger)
        $tolerance = max(100, $expectedCoins * 0.1);

        // If current coins are WAY higher than expected, that's cheating
        if ($currCoins > $expectedCoins + $tolerance) {
            $excess = $currCoins - $expectedCoins;
            // Only flag significant discrepancies
            if ($excess > 1000 && $currCoins > $expectedCoins * 1.5) {
                $flags[] = "[EarlyGame] Tick $currTick: Coins jumped from $prevCoins to $currCoins (expected ~" . round($expectedCoins) . ")";
            }
        }

        return $flags;
    }

    /**
     * Check if final submitted state is consistent with last logged click
     * Catches cheating that happens AFTER the last click (before submit)
     */
    private function checkFinalState(array $lastClick): array {
        $flags = [];

        // Get the final snapshot from game events
        $snapshots = $this->parser->getSnapshots();
        if (empty($snapshots)) {
            return $flags; // No snapshot to compare against
        }

        // Get last snapshot (final state)
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));
        $finalSnapshot = end($snapshots);
        $finalCoins = $finalSnapshot['player']['coins'] ?? 0;

        // Handle OrdinalNumber format
        if (is_array($finalCoins)) {
            $finalCoins = LogParser::ordinalToFloat($finalCoins);
        }

        $lastClickCoins = $lastClick['coins'] ?? 0;
        $lastClickTroops = $lastClick['troops'] ?? 0;
        $lastClickPpt = $lastClick['ppt'] ?? 1;

        // Income per tick = troops × ppt
        $incomePerTick = $lastClickTroops * $lastClickPpt;

        // Max expected = last click coins + 1000 ticks of passive income
        // 1000 ticks = 250 seconds = ~4 minutes of waiting before submit
        // We can't trust time logs (could be manipulated), so use fixed generous buffer
        $maxReasonableIncome = $incomePerTick * 1000;
        $maxExpected = $lastClickCoins + $maxReasonableIncome;

        if ($finalCoins > $maxExpected) {
            $flags[] = "[EarlyGame] Final coins ($finalCoins) exceeds max possible ($lastClickCoins + $maxReasonableIncome from ~4min passive income)";
        }

        return $flags;
    }

    /**
     * Get cost of an action based on current counts
     */
    private function getActionCost(string $action, int $armyClicks, int $trainClicks, int $recruitCount, int $econClicks): float {
        switch ($action) {
            case 'beg':
                return 0;
            case 'recruit':
                return floor(self::RECRUIT_COST * pow(1.02, $recruitCount));
            case 'squad_leader':
                return floor(self::SQUAD_LEADER_COST * pow(1.04, $armyClicks));
            case 'barracks':
                return floor(self::BARRACKS_COST * pow(1.04, $armyClicks));
            case 'military_base':
                return floor(self::MILITARY_BASE_COST * pow(1.04, $armyClicks));
            case 'kingdom':
                return floor(self::KINGDOM_COST * pow(1.04, $armyClicks));
            case 'empire':
                return floor(self::EMPIRE_COST * pow(1.04, $armyClicks));
            case 'train':
                // Train uses 1.02 inflation (not 1.04 like army), then 1.03 after 111
                if ($trainClicks >= 111) {
                    return floor(self::TRAIN_COST * pow(1.02, 111) * pow(1.03, $trainClicks - 111));
                }
                return floor(self::TRAIN_COST * pow(1.02, $trainClicks));
            case 'farm':
                return floor(self::FARM_COST * pow(1.02, $econClicks));
            case 'plantation':
                return floor(self::PLANTATION_COST * pow(1.02, $econClicks));
            case 'colony':
                return floor(self::COLONY_COST * pow(1.02, $econClicks));
            default:
                return 0; // Unknown action, don't flag
        }
    }

}
