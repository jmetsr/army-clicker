<?php
/**
 * GameReplay - Replay game state step-by-step for validation
 *
 * This replays the game from the click log to verify:
 * 1. Income matches expected (troops × ppt × 4 per day)
 * 2. Spending doesn't exceed balance
 * 3. Building counts match purchases
 *
 * Split into stages:
 * - Early game (07g): Pre-magic, basic army/economy chains
 * - Middle game (07h): Magic, rituals, dragons (not auto-upgraders)
 * - Late game (07i): Auto-upgraders, forbidden ritual tier
 */

require_once __DIR__ . '/OrdinalNumber.php';
require_once __DIR__ . '/LogParser.php';

class GameReplay {
    // Game constants (must match html-game/js/data.js)
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
    const FARM_PRODUCTION = 100;
    const INCOME_PER_POWER = 4;  // coins per power per day
    const FOOD_PER_TROOP_DAY = 1;  // food consumed per troop per day
    const STARTING_FOOD = 500;  // initial food supply

    // Middle game constants
    const DARK_RITUAL_BASE_COST = 1e12;
    const PLANET_COST = 1e9;
    const SOLAR_SYSTEM_COST = 1e11;
    const GALAXY_COST = 1e13;
    const GALAXY_CLUSTER_COST = 1e15;
    const SUPERCLUSTER_COST = 1e17;

    // State
    private int $day = 0;
    private OrdinalNumber $coins;
    private OrdinalNumber $troops;
    private float $ppt = 1.0;
    private OrdinalNumber $food;

    // Magic state (middle game)
    private int $magic = 0;
    private int $darkRituals = 0;
    private bool $magicUnlocked = false;
    private bool $eternalFeast = false;
    private bool $separateCosts = false;
    private bool $costsFrozen = false;

    // Building counts (clicks for cost calculation)
    private int $recruits = 0;
    private int $trains = 0;
    private int $farms = 0;
    private int $plantations = 0;
    private int $colonies = 0;

    // Army chain UNITS (cumulative, for power calculations)
    // These track total units gained, not clicks
    // JS: cnt("squad_leader") = sum of squadLeaderPower at each click
    private int $squadLeaderUnits = 0;
    private int $barracksUnits = 0;
    private int $militaryBaseUnits = 0;
    private int $kingdomUnits = 0;
    private int $empireUnits = 0;

    // Extended army tiers (middle game)
    private int $planets = 0;
    private int $solarSystems = 0;
    private int $galaxies = 0;
    private int $galaxyClusters = 0;
    private int $superclusters = 0;

    // Click pools for cost calculation
    private int $armyClicks = 0;
    private int $economyClicks = 0;
    private int $trainClicks = 0;

    // Derived values
    private int $rp = 1;  // recruits per click
    private int $fp = 1;  // farms per click
    private int $pp = 1;  // plantations per click
    private int $squadLeaderPower = 1;
    private int $barracksPower = 1;
    private int $militaryBasePower = 1;
    private int $kingdomPower = 1;
    private int $empirePower = 1;
    private int $planetPower = 1;
    private int $solarSystemPower = 1;
    private int $galaxyPower = 1;
    private int $galaxyClusterPower = 1;

    // Starvation tracking
    private int $starvationStreak = 0;

    // Validation
    private array $flags = [];
    private bool $verboseLogging = true;  // Detailed day-by-day logs

    public function __construct() {
        $this->coins = new OrdinalNumber(0);
        $this->troops = new OrdinalNumber(0);
        $this->food = new OrdinalNumber(self::STARTING_FOOD);
    }

    /**
     * Validate early game (pre-magic) from click log
     */
    public function validateEarlyGame(LogParser $parser): array {
        $this->flags = [];
        $clicks = $parser->getClickLog();
        $snapshots = $parser->getSnapshots();

        error_log("GameReplay::validateEarlyGame() - clicks: " . count($clicks) . ", snapshots: " . count($snapshots));

        if (empty($clicks)) {
            $this->flags[] = "No click log to validate";
            return $this->flags;
        }

        // Sort clicks by time/day
        usort($clicks, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        // Sort snapshots by day for comparison
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        // Log snapshot info
        if (!empty($snapshots)) {
            $firstSnap = $snapshots[0];
            $lastSnap = end($snapshots);
            error_log("Snapshots range: day " . ($firstSnap['day'] ?? '?') . " to day " . ($lastSnap['day'] ?? '?'));
        }

        // Process each click
        $prevDay = 0;
        $actionCounts = [];
        $clickNum = 0;
        foreach ($clicks as $click) {
            $clickNum++;
            $clickDay = $click['day'] ?? 0;
            $action = $click['action'] ?? '';
            $actionCounts[$action] = ($actionCounts[$action] ?? 0) + 1;

            // Advance day and add income
            if ($clickDay > $prevDay) {
                $this->advanceToDay($clickDay, $prevDay);
                $prevDay = $clickDay;
            }

            // Debug: log first 20 clicks
            if ($clickNum <= 20) {
                error_log("Click #$clickNum: day=$clickDay, action=$action, coins_before={$this->coins->toString()}, recruits_count={$this->recruits}");
            }

            // Process the action
            $this->processAction($action, $click);

            if ($clickNum <= 20) {
                error_log("  -> coins_after={$this->coins->toString()}, troops={$this->troops->toString()}");
            }
        }

        error_log("Action counts: " . json_encode($actionCounts));
        error_log("Final replay state: day={$this->day}, coins={$this->coins->toString()}, troops={$this->troops->toString()}, farms={$this->farms}");

        // Compare final state to snapshots
        $this->validateAgainstSnapshots($snapshots);

        error_log("Flags after validation: " . json_encode($this->flags));

        return $this->flags;
    }

    /**
     * Advance game state to a new day, simulating each day individually
     * This properly handles income, food production/consumption, and starvation
     */
    private function advanceToDay(int $newDay, int $oldDay): void {
        if ($newDay <= $oldDay) return;

        // Simulate each day individually for accurate starvation tracking
        for ($d = $oldDay + 1; $d <= $newDay; $d++) {
            $this->simulateDay($d);
        }

        $this->day = $newDay;
    }

    /**
     * Simulate a single day: income, food, starvation
     */
    private function simulateDay(int $day): void {
        $troopCount = $this->troops->toFloat();
        $foodBefore = $this->food->toFloat();

        // 1. Add passive income (power × 4)
        $power = $troopCount * $this->ppt;
        $income = $power * self::INCOME_PER_POWER;
        $this->coins = $this->coins->add(new OrdinalNumber($income));

        // 2. Food production from farms
        $foodProduced = $this->farms * self::FARM_PRODUCTION;
        $this->food = $this->food->add(new OrdinalNumber($foodProduced));

        // 3. Food consumption (if not eternal feast)
        if (!$this->eternalFeast) {
            $foodConsumed = floor($troopCount * self::FOOD_PER_TROOP_DAY);
            $foodAfterProd = $this->food->toFloat();
            $foodShortage = $foodConsumed > $foodAfterProd;

            $this->food = $this->food->subtract(new OrdinalNumber($foodConsumed));

            // 4. Starvation check
            if ($foodShortage) {
                $this->starvationStreak++;
                // 5% day 1, 10% day 2, 20% day 3, 40% day 4, 80% day 5, 100% day 6+
                $desertPct = min(5 * pow(2, $this->starvationStreak - 1), 100);
                $deserters = floor($troopCount * $desertPct / 100);
                $this->troops = $this->troops->subtract(new OrdinalNumber($deserters));

                if ($this->verboseLogging) {
                    error_log("  Day $day: STARVATION streak={$this->starvationStreak}, " .
                        "{$desertPct}% deserted ({$deserters} troops), " .
                        "troops now: {$this->troops->toString()}");
                }
            } else {
                if ($this->starvationStreak > 0 && $this->verboseLogging) {
                    error_log("  Day $day: Starvation ended (was streak {$this->starvationStreak})");
                }
                $this->starvationStreak = 0;
            }
        }

        // Verbose logging for debugging
        if ($this->verboseLogging && ($day <= 20 || $day % 10 === 0)) {
            $troopNow = $this->troops->toFloat();
            $foodNow = $this->food->toFloat();
            $coinsNow = $this->coins->toFloat();
            error_log("  Day $day summary: troops=$troopNow, food=$foodNow (produced $foodProduced), " .
                "coins=$coinsNow (+$income), farms={$this->farms}, ppt={$this->ppt}");
        }
    }

    /**
     * Process a player action (click)
     */
    private function processAction(string $action, array $clickData): void {
        switch ($action) {
            case 'beg':
                $this->doBeg();
                break;
            case 'loot':
                // Loot is passive income, already handled in advanceToDay
                // But if explicitly logged, it might mean an active loot click
                // For now, treat as +1 coin (same as beg) for simplicity
                $this->doBeg();
                break;
            case 'recruit':
                $this->doRecruit();
                break;
            case 'squad_leader':
                $this->doBuySquadLeader();
                break;
            case 'barracks':
                $this->doBuyBarracks();
                break;
            case 'military_base':
                $this->doBuyMilitaryBase();
                break;
            case 'kingdom':
                $this->doBuyKingdom();
                break;
            case 'empire':
                $this->doBuyEmpire();
                break;
            case 'train':
                $this->doTrain();
                break;
            case 'farm':
                $this->doBuyFarm();
                break;
            case 'plantation':
                $this->doBuyPlantation();
                break;
            case 'colony':
                $this->doBuyColony();
                break;

            // Middle game actions (magic stage)
            case 'dark_ritual':
                $this->doDarkRitual();
                break;
            case 'planet':
                $this->doBuyPlanet();
                break;
            case 'solar_system':
                $this->doBuySolarSystem();
                break;
            case 'galaxy':
                $this->doBuyGalaxy();
                break;
            case 'galaxy_cluster':
                $this->doBuyGalaxyCluster();
                break;
            case 'supercluster':
                $this->doBuySupercluster();
                break;
            case 'eternal_feast':
                $this->doEternalFeast();
                break;
            case 'separate_costs':
                $this->doSeparateCosts();
                break;
            case 'freeze_costs':
                $this->doFreezeCosts();
                break;
            // Magic unlock actions (1 magic each) - just track magic spent
            case 'unlock_planet':
            case 'unlock_solar_system':
            case 'unlock_galaxy':
            case 'unlock_galaxy_cluster':
            case 'unlock_supercluster':
            case 'unlock_observable_universe':
            case 'unlock_full_universe':
            case 'unlock_quantum_multiverse':
            case 'unlock_cosmological_multiverse':
            case 'unlock_mathematical_multiverse':
                $this->trySpendMagic(1, $action);
                break;
            case 'upgrade_button':
                $this->trySpendMagic(2, $action);
                break;

            // Late-game actions (10+ magic) - handled in 07i
            case 'unlock_sapphire':
            case 'auto_upgrader':
                // Skip for middle game - these are 10+ magic
                break;
        }
    }

    /**
     * Calculate exponential cost: floor(base * multiplier^count)
     * Must match JS: Math.floor(base * Math.pow(rate, total))
     */
    private function expCost(float $base, float $multiplier, int $count): float {
        return floor($base * pow($multiplier, $count));
    }

    /**
     * Try to spend coins, return true if successful
     */
    private function trySpend(float $cost, string $action): bool {
        $costON = new OrdinalNumber($cost);
        if ($this->coins->lt($costON)) {
            error_log("SPEND FAILED: Day {$this->day}, action=$action, need=" . number_format($cost) . ", have=" . $this->coins->toString());
            $this->flags[] = "Day {$this->day}: Insufficient coins for $action (need " .
                number_format($cost) . ", have " . $this->coins->toString() . ")";
            return false;
        }
        $this->coins = $this->coins->subtract($costON);
        return true;
    }

    private function doBeg(): void {
        // Beg gives 1 coin per click
        $this->coins = $this->coins->add(new OrdinalNumber(1));
    }

    private function doRecruit(): void {
        $cost = $this->expCost(self::RECRUIT_COST, 1.02, $this->recruits);
        if ($this->trySpend($cost, 'recruit')) {
            $this->troops = $this->troops->add(new OrdinalNumber($this->rp));
            $this->recruits++;
        }
    }

    private function doBuySquadLeader(): void {
        $cost = $this->expCost(self::SQUAD_LEADER_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'squad_leader')) {
            // JS: cnt("squad_leader") += squadLeaderPower
            $this->squadLeaderUnits += $this->squadLeaderPower;
            $this->armyClicks++;
            // JS: rp = 1 + cnt("squad_leader")
            $this->rp = 1 + $this->squadLeaderUnits;
        }
    }

    private function doBuyBarracks(): void {
        $cost = $this->expCost(self::BARRACKS_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'barracks')) {
            // JS: squadLeaderPower += barracksPower (via boostVar)
            $this->barracksUnits += $this->barracksPower;
            $this->squadLeaderPower += $this->barracksPower;
            $this->armyClicks++;
        }
    }

    private function doBuyMilitaryBase(): void {
        $cost = $this->expCost(self::MILITARY_BASE_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'military_base')) {
            // JS: barracksPower += militaryBasePower
            $this->militaryBaseUnits += $this->militaryBasePower;
            $this->barracksPower += $this->militaryBasePower;
            $this->armyClicks++;
        }
    }

    private function doBuyKingdom(): void {
        $cost = $this->expCost(self::KINGDOM_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'kingdom')) {
            // JS: militaryBasePower += kingdomPower
            $this->kingdomUnits += $this->kingdomPower;
            $this->militaryBasePower += $this->kingdomPower;
            $this->armyClicks++;
        }
    }

    private function doBuyEmpire(): void {
        $cost = $this->expCost(self::EMPIRE_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'empire')) {
            // JS: kingdomPower += empirePower
            $this->empireUnits += $this->empirePower;
            $this->kingdomPower += $this->empirePower;
            $this->armyClicks++;
        }
    }

    private function doTrain(): void {
        $cost = $this->expCost(self::TRAIN_COST, 1.04, $this->trainClicks);
        if ($this->trySpend($cost, 'train')) {
            $this->trains++;
            $this->trainClicks++;
            // Training increases PPT - simplified formula
            // Actual game has complex multiplier system
            $this->ppt *= 1.01;  // Rough approximation
        }
    }

    private function doBuyFarm(): void {
        $cost = $this->expCost(self::FARM_COST, 1.02, $this->economyClicks);
        if ($this->trySpend($cost, 'farm')) {
            $this->farms += $this->fp;
            $this->economyClicks++;
        }
    }

    private function doBuyPlantation(): void {
        $cost = $this->expCost(self::PLANTATION_COST, 1.02, $this->economyClicks);
        if ($this->trySpend($cost, 'plantation')) {
            $this->plantations += $this->pp;
            $this->economyClicks++;
            $this->fp = 1 + $this->plantations;
        }
    }

    private function doBuyColony(): void {
        $cost = $this->expCost(self::COLONY_COST, 1.02, $this->economyClicks);
        if ($this->trySpend($cost, 'colony')) {
            $this->colonies++;
            $this->economyClicks++;
            $this->pp = 1 + $this->colonies;
        }
    }

    // Note: Update functions removed - we now track units and powers incrementally
    // to match JS behavior exactly (see doBuySquadLeader, etc.)

    /**
     * Compare replay state against logged snapshots
     */
    private function validateAgainstSnapshots(array $snapshots): void {
        error_log("=== SNAPSHOT VALIDATION ===");
        error_log("Replay final state: day={$this->day}, troops={$this->troops->toString()}, " .
            "coins={$this->coins->toString()}, food={$this->food->toString()}, farms={$this->farms}");
        error_log("Snapshots to check: " . count($snapshots));

        if (empty($snapshots)) {
            error_log("WARNING: No snapshots to validate against!");
            return;
        }

        foreach ($snapshots as $snap) {
            $snapDay = $snap['day'] ?? 0;
            $player = $snap['player'] ?? [];

            // Skip if we haven't reached this day in replay
            if ($snapDay > $this->day) {
                error_log("Skipping snapshot day $snapDay (replay only at day {$this->day})");
                continue;
            }

            $snapTroops = new OrdinalNumber($player['troops'] ?? 0);
            $snapCoins = new OrdinalNumber($player['coins'] ?? 0);
            $snapFood = new OrdinalNumber($player['food'] ?? 0);
            $snapFarms = $player['farms'] ?? 0;

            error_log("--- Snapshot day $snapDay ---");
            error_log("  Snapshot: troops={$snapTroops->toString()}, coins={$snapCoins->toString()}, " .
                "food={$snapFood->toString()}, farms=$snapFarms");
            error_log("  Replay:   troops={$this->troops->toString()}, coins={$this->coins->toString()}, " .
                "food={$this->food->toString()}, farms={$this->farms}");

            // Compare troops - now with starvation, should be tighter (0.5x to 2x)
            $troopRatio = $this->safeRatio($this->troops, $snapTroops);
            error_log("  Troop ratio: $troopRatio");
            if ($troopRatio < 0.5 || $troopRatio > 2.0) {
                error_log("  -> FLAGGING troop mismatch!");
                $this->flags[] = "Day $snapDay: Troop mismatch - replay has " .
                    $this->troops->toString() . ", log shows " . $snapTroops->toString() .
                    " (ratio: " . round($troopRatio, 3) . ")";
            }

            // Compare coins - allow 0.2x to 5x due to timing/spending differences
            $coinRatio = $this->safeRatio($this->coins, $snapCoins);
            error_log("  Coin ratio: $coinRatio");
            if ($coinRatio < 0.2 || $coinRatio > 5.0) {
                error_log("  -> FLAGGING coin discrepancy!");
                $this->flags[] = "Day $snapDay: Coin discrepancy - replay has " .
                    $this->coins->toString() . ", log shows " . $snapCoins->toString() .
                    " (ratio: " . round($coinRatio, 3) . ")";
            }

            // Compare farms - should be exact or very close
            if (abs($this->farms - $snapFarms) > 2) {
                error_log("  -> FLAGGING farm mismatch!");
                $this->flags[] = "Day $snapDay: Farm count mismatch - replay has " .
                    $this->farms . ", log shows $snapFarms";
            }
        }
    }

    /**
     * Safe ratio calculation for OrdinalNumbers
     */
    private function safeRatio(OrdinalNumber $a, OrdinalNumber $b): float {
        $aFloat = $a->toFloat();
        $bFloat = $b->toFloat();

        if ($bFloat == 0) {
            return $aFloat == 0 ? 1.0 : INF;
        }
        if (!is_finite($aFloat) || !is_finite($bFloat)) {
            // Both infinite = roughly equal, one infinite = huge mismatch
            if (!is_finite($aFloat) && !is_finite($bFloat)) return 1.0;
            return INF;
        }

        return $aFloat / $bFloat;
    }

    /**
     * Validate middle game (magic stage, pre-auto-upgraders) from click log
     */
    public function validateMiddleGame(LogParser $parser): array {
        // First run early game to establish base state
        $this->validateEarlyGame($parser);

        // Continue with middle game specific validation
        // The processAction already handles middle game actions
        // Additional middle game checks:

        // Check magic balance
        if ($this->magic < 0) {
            $this->flags[] = "Magic balance went negative (spent more than earned)";
        }

        // Check dark ritual cost progression
        // (already validated in doDarkRitual)

        return $this->flags;
    }

    // Middle game action methods

    private function doDarkRitual(): void {
        // Dark ritual costs coins, gives magic
        $cost = self::DARK_RITUAL_BASE_COST * pow(5, $this->darkRituals);
        if ($this->trySpendOrdinal(new OrdinalNumber($cost), 'dark_ritual')) {
            $this->magic++;
            $this->darkRituals++;
            $this->magicUnlocked = true;
        }
    }

    private function doBuyPlanet(): void {
        $cost = $this->expCost(self::PLANET_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'planet')) {
            // JS: empirePower += planetPower
            $this->planets++;
            $this->empirePower += $this->planetPower;
            $this->armyClicks++;
        }
    }

    private function doBuySolarSystem(): void {
        $cost = $this->expCost(self::SOLAR_SYSTEM_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'solar_system')) {
            // JS: planetPower += solarSystemPower
            $this->solarSystems++;
            $this->planetPower += $this->solarSystemPower;
            $this->armyClicks++;
        }
    }

    private function doBuyGalaxy(): void {
        $cost = $this->expCost(self::GALAXY_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'galaxy')) {
            // JS: solarSystemPower += galaxyPower
            $this->galaxies++;
            $this->solarSystemPower += $this->galaxyPower;
            $this->armyClicks++;
        }
    }

    private function doBuyGalaxyCluster(): void {
        $cost = $this->expCost(self::GALAXY_CLUSTER_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'galaxy_cluster')) {
            // JS: galaxyPower += galaxyClusterPower
            $this->galaxyClusters++;
            $this->galaxyPower += $this->galaxyClusterPower;
            $this->armyClicks++;
        }
    }

    private function doBuySupercluster(): void {
        $cost = $this->expCost(self::SUPERCLUSTER_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'supercluster')) {
            // JS: galaxyClusterPower += 1 (supercluster is top of chain, no boostVar above it)
            $this->superclusters++;
            $this->galaxyClusterPower += 1;  // Each supercluster adds 1 to galaxyClusterPower
            $this->armyClicks++;
        }
    }

    private function doEternalFeast(): void {
        if ($this->trySpendMagic(1, 'eternal_feast')) {
            $this->eternalFeast = true;
        }
    }

    private function doSeparateCosts(): void {
        if ($this->trySpendMagic(3, 'separate_costs')) {
            $this->separateCosts = true;
        }
    }

    private function doFreezeCosts(): void {
        if ($this->trySpendMagic(4, 'freeze_costs')) {
            $this->costsFrozen = true;
        }
    }

    /**
     * Try to spend magic, return true if successful
     */
    private function trySpendMagic(int $cost, string $action): bool {
        if ($this->magic < $cost) {
            $this->flags[] = "Day {$this->day}: Insufficient magic for $action (need $cost, have {$this->magic})";
            return false;
        }
        $this->magic -= $cost;
        return true;
    }

    /**
     * Try to spend OrdinalNumber coins
     */
    private function trySpendOrdinal(OrdinalNumber $cost, string $action): bool {
        if ($this->coins->lt($cost)) {
            $this->flags[] = "Day {$this->day}: Insufficient coins for $action (need " .
                $cost->toString() . ", have " . $this->coins->toString() . ")";
            return false;
        }
        $this->coins = $this->coins->subtract($cost);
        return true;
    }

    // Note: Extended army chain update functions removed - we now track powers incrementally
    // to match JS behavior exactly (see doBuyPlanet, etc.)

    /**
     * Get current replay state for debugging
     */
    public function getState(): array {
        return [
            'day' => $this->day,
            'coins' => $this->coins->toString(),
            'troops' => $this->troops->toString(),
            'ppt' => $this->ppt,
            'food' => $this->food->toString(),
            'farms' => $this->farms,
            'squadLeaderUnits' => $this->squadLeaderUnits,
            'barracksUnits' => $this->barracksUnits,
            'militaryBaseUnits' => $this->militaryBaseUnits,
            'kingdomUnits' => $this->kingdomUnits,
            'empireUnits' => $this->empireUnits,
            'planets' => $this->planets,
            'solarSystems' => $this->solarSystems,
            'galaxies' => $this->galaxies,
            'magic' => $this->magic,
            'darkRituals' => $this->darkRituals,
            'rp' => $this->rp,
            'squadLeaderPower' => $this->squadLeaderPower,
        ];
    }
}
