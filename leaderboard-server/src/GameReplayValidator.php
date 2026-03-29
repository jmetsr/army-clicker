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
require_once __DIR__ . '/OrdinalNumber.php';

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
            'troops' => OrdinalNumber::from(0),  // Track troops via recruit actions
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
            // Separate cost tracking (when separate_costs magic is active)
            'separateCosts' => false,
            'slClicks' => 0,
            'barClicks' => 0,
            'mbClicks' => 0,
            'kingClicks' => 0,
            'empClicks' => 0,
        ];

        $prevClick = null;

        // Check first click for impossible starting state
        $firstClickFlags = $this->checkFirstClick($clicks[0]);
        foreach ($firstClickFlags as $flag) {
            $flags[] = $flag;
        }

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

            // Check troop count
            $troopFlags = $this->checkTroops($state, $click);
            foreach ($troopFlags as $flag) {
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

        $prevCoins = $this->toOrdinal($prev['coins'] ?? 0);
        $currCoins = $this->toOrdinal($curr['coins'] ?? 0);
        $prevTick = $prev['tick'] ?? 0;
        $currTick = $curr['tick'] ?? 0;
        $prevAction = $prev['action'] ?? '';

        // Use CURRENT click's state for post-previous-action values
        // BUT use max(prev, curr) for troops to handle starvation (troops can desert between clicks)
        $prevTroops = $this->toOrdinal($prev['troops'] ?? 0);
        $currTroops = $this->toOrdinal($curr['troops'] ?? 0);
        $currPpt = $this->toOrdinal($curr['ppt'] ?? 1);
        $currLootMult = $this->toOrdinal($curr['lootMult'] ?? 1);

        // Use higher troop count - if previous action was recruit, currTroops is higher
        // If starvation happened, prevTroops is higher. Give benefit of the doubt.
        $effectiveTroops = $prevTroops->gt($currTroops) ? $prevTroops : $currTroops;

        $ticksPassed = max(0, $currTick - $prevTick);

        // Passive income: troops × ppt × lootMult per tick
        $passiveIncome = $effectiveTroops->multiply($currPpt)->multiply($currLootMult)->multiply($ticksPassed);

        // Cost of previous action
        $actionCost = $this->toOrdinal($this->getActionCost($prevAction, $state));

        // Beg gives +1
        $begIncome = $this->toOrdinal(($prevAction === 'beg') ? 1 : 0);

        // Expected coins after previous action: prevCoins - actionCost + begIncome + passiveIncome
        $expectedCoins = $prevCoins->subtract($actionCost)->add($begIncome)->add($passiveIncome);

        // Allow tolerance (10% or 1000, whichever is larger)
        $tolerance = $expectedCoins->multiply(0.1);
        $minTolerance = $this->toOrdinal(1000);
        if ($minTolerance->gt($tolerance)) {
            $tolerance = $minTolerance;
        }

        // If current coins are WAY higher than expected, flag it
        $threshold = $expectedCoins->add($tolerance);
        if ($currCoins->gt($threshold)) {
            $excess = $currCoins->subtract($expectedCoins);
            $minExcess = $this->toOrdinal(10000);
            $ratio = $expectedCoins->multiply(1.5);
            if ($excess->gt($minExcess) && $currCoins->gt($ratio)) {
                $flags[] = "Tick $currTick: Coins jumped from {$prevCoins->toString()} to {$currCoins->toString()} (expected ~{$expectedCoins->toString()}, lootMult={$currLootMult->toString()})";
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
        $tick = $click['tick'] ?? 0;

        // Check logged magic doesn't exceed dark rituals performed
        // (logged state is BEFORE action, so current dark_ritual hasn't added yet)
        $loggedMagic = $click['magic'] ?? 0;
        if ($loggedMagic > $state['darkRituals']) {
            $flags[] = "Tick $tick: Logged magic ($loggedMagic) exceeds dark rituals performed ({$state['darkRituals']})";
        }

        // Note: darkRituals is incremented in applyAction, not here

        // Check lootMult consistency
        $clickLootMult = $click['lootMult'] ?? 1;
        if ($clickLootMult > 1 && $state['darkRituals'] === 0) {
            // Only flag if significantly boosted without any dark rituals
            if ($clickLootMult > 10) {
                $flags[] = "Tick $tick: lootMult=$clickLootMult but no dark rituals performed";
            }
        }

        return $flags;
    }

    /**
     * Check if logged troops exceed what's possible from recruiting
     */
    private function checkTroops(array $state, array $click): array {
        $flags = [];
        $tick = $click['tick'] ?? 0;

        $loggedTroops = $this->toOrdinal($click['troops'] ?? 0);
        $trackedTroops = $state['troops'];

        // Allow tolerance for starvation (troops can die, reducing count)
        // But logged troops should never EXCEED tracked troops
        // Use 10% tolerance + 100 buffer
        $tolerance = $trackedTroops->multiply(0.1)->add(100);
        $maxAllowed = $trackedTroops->add($tolerance);

        if ($loggedTroops->gt($maxAllowed)) {
            $flags[] = "Tick $tick: Logged troops ({$loggedTroops->toString()}) exceeds max possible ({$trackedTroops->toString()})";
        }

        return $flags;
    }

    /**
     * Check first click for impossible starting state
     */
    private function checkFirstClick(array $click): array {
        $flags = [];
        $tick = $click['tick'] ?? 0;
        $coins = $this->toOrdinal($click['coins'] ?? 0);
        $troops = $this->toOrdinal($click['troops'] ?? 0);
        $ppt = $this->toOrdinal($click['ppt'] ?? 1);
        $magic = $click['magic'] ?? 0;

        // Max possible coins at first click:
        // - Passive income: troops * ppt * ticks (but troops is usually 0 at start)
        // - Begging: at most ~tick begs = tick coins
        $maxPassiveIncome = $troops->multiply($ppt)->multiply($tick);
        $maxBegIncome = $this->toOrdinal($tick); // Can't beg more than once per tick
        $maxPlausible = $maxPassiveIncome->add($maxBegIncome)->add(100); // Small buffer

        $minThreshold = $this->toOrdinal(1000);
        if ($coins->gt($maxPlausible) && $coins->gt($minThreshold)) {
            $flags[] = "Tick $tick (first click): Has {$coins->toString()} coins (max plausible ~{$maxPlausible->toString()})";
        }

        // Shouldn't have magic before any dark rituals
        if ($magic > 0) {
            $flags[] = "Tick $tick (first click): Has $magic magic before any dark rituals";
        }

        // Shouldn't have troops before recruiting (game starts with 0 troops)
        $minTroopThreshold = $this->toOrdinal(100);
        if ($troops->gt($minTroopThreshold)) {
            $flags[] = "Tick $tick (first click): Has {$troops->toString()} troops before any recruiting";
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
                // Add rp troops (rp is logged in the click)
                $rp = $this->toOrdinal($click['rp'] ?? 1);
                $state['troops'] = $state['troops']->add($rp);
                break;
            case 'squad_leader':
                $state['armyClicks']++;
                $state['slClicks']++;
                break;
            case 'barracks':
                $state['armyClicks']++;
                $state['barClicks']++;
                break;
            case 'military_base':
                $state['armyClicks']++;
                $state['mbClicks']++;
                break;
            case 'kingdom':
                $state['armyClicks']++;
                $state['kingClicks']++;
                break;
            case 'empire':
                $state['armyClicks']++;
                $state['empClicks']++;
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
            case 'separate_costs':
                // When separate_costs is activated, ALL button click counters are
                // initialized to the current shared pool total (so costs don't drop)
                $state['slClicks'] = $state['armyClicks'];
                $state['barClicks'] = $state['armyClicks'];
                $state['mbClicks'] = $state['armyClicks'];
                $state['kingClicks'] = $state['armyClicks'];
                $state['empClicks'] = $state['armyClicks'];
                $state['separateCosts'] = true;
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
        $trainClicks = $state['trainClicks'];
        $recruitCount = $state['recruitCount'];
        $econClicks = $state['econClicks'];

        // When separate_costs is active, each army building has its own inflation counter
        // Otherwise, they all share the same armyClicks pool
        $separateCosts = $state['separateCosts'];

        switch ($action) {
            case 'beg':
                return 0;
            case 'recruit':
                return floor(self::RECRUIT_COST * pow(1.02, $recruitCount));
            case 'squad_leader':
                $clicks = $separateCosts ? $state['slClicks'] : $state['armyClicks'];
                return floor(self::SQUAD_LEADER_COST * pow(1.04, $clicks));
            case 'barracks':
                $clicks = $separateCosts ? $state['barClicks'] : $state['armyClicks'];
                return floor(self::BARRACKS_COST * pow(1.04, $clicks));
            case 'military_base':
                $clicks = $separateCosts ? $state['mbClicks'] : $state['armyClicks'];
                return floor(self::MILITARY_BASE_COST * pow(1.04, $clicks));
            case 'kingdom':
                $clicks = $separateCosts ? $state['kingClicks'] : $state['armyClicks'];
                return floor(self::KINGDOM_COST * pow(1.04, $clicks));
            case 'empire':
                $clicks = $separateCosts ? $state['empClicks'] : $state['armyClicks'];
                return floor(self::EMPIRE_COST * pow(1.04, $clicks));
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
     * Convert value to OrdinalNumber
     */
    private function toOrdinal($val): OrdinalNumber {
        return OrdinalNumber::from($val);
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
        $finalCoins = $this->toOrdinal($finalSnapshot['player']['coins'] ?? 0);

        $lastClickCoins = $this->toOrdinal($lastClick['coins'] ?? 0);
        $lastClickTroops = $this->toOrdinal($lastClick['troops'] ?? 0);
        $lastClickPpt = $this->toOrdinal($lastClick['ppt'] ?? 1);
        $lastClickLootMult = $this->toOrdinal($lastClick['lootMult'] ?? 1);
        $lastAction = $lastClick['action'] ?? '';

        // Account for last action effect
        $lastActionEffect = $this->toOrdinal(($lastAction === 'beg') ? 1 : 0);

        // If last action was upgrade_button, lootMult increased after the click
        // Click log records state BEFORE action, so we need to account for the increase
        $effectiveLootMult = $lastClickLootMult;
        if ($lastAction === 'upgrade_button') {
            $effectiveLootMult = $lastClickLootMult->multiply(10);
        }

        // Income per tick with loot multiplier
        $incomePerTick = $lastClickTroops->multiply($lastClickPpt)->multiply($effectiveLootMult);

        // Allow 1000 ticks (~4 minutes) of passive income before submit
        $maxReasonableIncome = $incomePerTick->multiply(1000);
        $maxExpected = $lastClickCoins->add($lastActionEffect)->add($maxReasonableIncome);

        if ($finalCoins->gt($maxExpected)) {
            $flags[] = "Final coins ({$finalCoins->toString()}) exceeds max possible ({$lastClickCoins->toString()} + {$maxReasonableIncome->toString()} from ~4min passive income, lootMult={$effectiveLootMult->toString()})";
        }

        return $flags;
    }
}
