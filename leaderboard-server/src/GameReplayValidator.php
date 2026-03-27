<?php
/**
 * GameReplayValidator - Unified game replay validation
 *
 * Replays the game from start, tracking all state and verifying:
 * 1. Each action was affordable
 * 2. State transitions are consistent
 * 3. Magic/upgrades were earned before being used
 */

require_once __DIR__ . '/LogParser.php';

class GameReplayValidator {
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

    // Magic costs
    const MAGIC_COSTS = [
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

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    public function validate(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();

        if (empty($clicks)) {
            return ['No click log available'];
        }

        // Sort by time
        usort($clicks, fn($a, $b) => ($a['t'] ?? 0) <=> ($b['t'] ?? 0));

        // Initialize replay state
        $state = [
            'coins' => 0,
            'troops' => 0,
            'ppt' => 1,
            'rp' => 1,
            'armyClicks' => 0,
            'trainClicks' => 0,
            'econClicks' => 0,
            'recruitCount' => 0,
            'magic' => 0,
            'darkRituals' => 0,
            'lootMult' => 1,
            'tick' => 0,
        ];

        $prevClick = null;

        foreach ($clicks as $i => $click) {
            $action = $click['action'] ?? '';
            $clickCoins = $click['coins'] ?? 0;
            $clickTick = $click['tick'] ?? 0;

            // Calculate expected state based on previous click
            if ($prevClick !== null) {
                $transitionFlags = $this->checkTransition($state, $prevClick, $click);
                foreach ($transitionFlags as $flag) {
                    $flags[] = $flag;
                }
            }

            // Check if action was affordable
            $affordFlags = $this->checkAffordable($state, $click);
            foreach ($affordFlags as $flag) {
                $flags[] = $flag;
            }

            // Check magic-related actions
            $magicFlags = $this->checkMagicAction($state, $click);
            foreach ($magicFlags as $flag) {
                $flags[] = $flag;
            }

            // Update state based on action
            $this->applyAction($state, $click);

            // Stop after too many flags
            if (count($flags) >= 10) {
                break;
            }

            $prevClick = $click;
        }

        // Check final state
        $finalFlags = $this->checkFinalState($prevClick);
        $flags = array_merge($flags, $finalFlags);

        return $flags;
    }

    /**
     * Check if transition between clicks is plausible
     */
    private function checkTransition(array $state, array $prev, array $curr): array {
        $flags = [];

        $prevCoins = $prev['coins'] ?? 0;
        $currCoins = $curr['coins'] ?? 0;
        $prevTroops = $prev['troops'] ?? 0;
        $prevPpt = $prev['ppt'] ?? 1;
        $prevTick = $prev['tick'] ?? 0;
        $currTick = $curr['tick'] ?? 0;
        $prevAction = $prev['action'] ?? '';

        // Use CURRENT lootMult, not previous - click log records state BEFORE action,
        // so if prev action was upgrade_button, lootMult changed after that click
        $effectiveLootMult = $curr['lootMult'] ?? 1;

        $ticksPassed = max(0, $currTick - $prevTick);

        // Passive income: troops × ppt × lootMult per tick
        $passiveIncome = $prevTroops * $prevPpt * $effectiveLootMult * $ticksPassed;

        // Cost of previous action
        $actionCost = $this->getActionCost($prevAction, $state);

        // Beg gives +1
        $begIncome = ($prevAction === 'beg') ? 1 : 0;

        // Expected coins after previous action
        $expectedCoins = $prevCoins - $actionCost + $begIncome + $passiveIncome;

        // Allow tolerance (10% or 1000 coins, whichever is larger)
        $tolerance = max(1000, abs($expectedCoins) * 0.1);

        // If current coins are WAY higher than expected, flag it
        if ($currCoins > $expectedCoins + $tolerance) {
            $excess = $currCoins - $expectedCoins;
            if ($excess > 10000 && $currCoins > $expectedCoins * 1.5) {
                $flags[] = "Tick $currTick: Coins jumped from $prevCoins to $currCoins (expected ~" . round($expectedCoins) . ", lootMult=$effectiveLootMult)";
            }
        }

        return $flags;
    }

    /**
     * Check if action was affordable
     */
    private function checkAffordable(array $state, array $click): array {
        $flags = [];
        $action = $click['action'] ?? '';
        $coins = $click['coins'] ?? 0;
        $magic = $click['magic'] ?? 0;

        // Coin-based actions
        $cost = $this->getActionCost($action, $state);
        if ($cost > 0 && $coins < $cost) {
            $tick = $click['tick'] ?? 0;
            $flags[] = "Tick $tick: $action with $coins coins (needs $cost)";
        }

        // Magic-based actions
        if (isset(self::MAGIC_COSTS[$action])) {
            $magicCost = self::MAGIC_COSTS[$action];
            if ($magic < $magicCost) {
                $tick = $click['tick'] ?? 0;
                $flags[] = "Tick $tick: $action with $magic magic (needs $magicCost)";
            }
        }

        return $flags;
    }

    /**
     * Check magic-related actions for validity
     */
    private function checkMagicAction(array &$state, array $click): array {
        $flags = [];
        $action = $click['action'] ?? '';

        // Track dark rituals (source of magic)
        if ($action === 'dark_ritual') {
            $state['darkRituals']++;
        }

        // Check lootMult consistency
        $clickLootMult = $click['lootMult'] ?? 1;
        if ($clickLootMult > 1 && $state['darkRituals'] === 0) {
            $tick = $click['tick'] ?? 0;
            // Only flag if significantly boosted without any dark rituals
            if ($clickLootMult > 10) {
                $flags[] = "Tick $tick: lootMult=$clickLootMult but no dark rituals performed";
            }
        }

        return $flags;
    }

    /**
     * Apply action effects to state
     */
    private function applyAction(array &$state, array $click): void {
        $action = $click['action'] ?? '';

        switch ($action) {
            case 'recruit':
                $state['recruitCount']++;
                break;
            case 'squad_leader':
            case 'barracks':
            case 'military_base':
            case 'kingdom':
            case 'empire':
                $state['armyClicks']++;
                break;
            case 'train':
                $state['trainClicks']++;
                break;
            case 'farm':
            case 'plantation':
            case 'colony':
                $state['econClicks']++;
                break;
            case 'dark_ritual':
                $state['darkRituals']++;
                break;
        }

        // Update lootMult from click data
        $state['lootMult'] = $click['lootMult'] ?? $state['lootMult'];
        $state['tick'] = $click['tick'] ?? $state['tick'];
    }

    /**
     * Get cost of an action
     */
    private function getActionCost(string $action, array $state): float {
        $armyClicks = $state['armyClicks'];
        $trainClicks = $state['trainClicks'];
        $recruitCount = $state['recruitCount'];
        $econClicks = $state['econClicks'];

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
                return 0;
        }
    }

    /**
     * Check final state against last click
     */
    private function checkFinalState(?array $lastClick): array {
        if ($lastClick === null) {
            return [];
        }

        $flags = [];
        $snapshots = $this->parser->getSnapshots();

        if (empty($snapshots)) {
            return [];
        }

        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));
        $finalSnapshot = end($snapshots);
        $finalCoins = $finalSnapshot['player']['coins'] ?? 0;

        if (is_array($finalCoins)) {
            $finalCoins = LogParser::ordinalToFloat($finalCoins);
        }

        $lastClickCoins = $lastClick['coins'] ?? 0;
        $lastClickTroops = $lastClick['troops'] ?? 0;
        $lastClickPpt = $lastClick['ppt'] ?? 1;
        $lastClickLootMult = $lastClick['lootMult'] ?? 1;
        $lastAction = $lastClick['action'] ?? '';

        // Account for last action effect
        $lastActionEffect = ($lastAction === 'beg') ? 1 : 0;

        // If last action was upgrade_button, lootMult increased after the click
        // Click log records state BEFORE action, so we need to account for the increase
        $effectiveLootMult = $lastClickLootMult;
        if ($lastAction === 'upgrade_button') {
            $effectiveLootMult = $lastClickLootMult * 10; // upgrade_button multiplies by 10
        }

        // Income per tick with loot multiplier
        $incomePerTick = $lastClickTroops * $lastClickPpt * $effectiveLootMult;

        // Allow 1000 ticks (~4 minutes) of passive income before submit
        $maxReasonableIncome = $incomePerTick * 1000;
        $maxExpected = $lastClickCoins + $lastActionEffect + $maxReasonableIncome;

        if ($finalCoins > $maxExpected) {
            $flags[] = "Final coins ($finalCoins) exceeds max possible ($lastClickCoins + $maxReasonableIncome from ~4min passive income, lootMult=$effectiveLootMult)";
        }

        return $flags;
    }
}
