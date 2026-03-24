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

    // Building counts
    private int $recruits = 0;
    private int $squadLeaders = 0;
    private int $barracks = 0;
    private int $militaryBases = 0;
    private int $kingdoms = 0;
    private int $empires = 0;
    private int $trains = 0;
    private int $farms = 0;
    private int $plantations = 0;
    private int $colonies = 0;

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

    // Validation
    private array $flags = [];
    private float $tolerance = 1.5;  // Allow 50% variance for timing issues

    public function __construct() {
        $this->coins = new OrdinalNumber(0);
        $this->troops = new OrdinalNumber(0);
        $this->food = new OrdinalNumber(0);
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
     * Advance game state to a new day, adding income
     */
    private function advanceToDay(int $newDay, int $oldDay): void {
        $daysPassed = $newDay - $oldDay;
        if ($daysPassed <= 0) return;

        // Calculate income for these days
        $power = $this->troops->multiply(new OrdinalNumber($this->ppt));
        $income = $power->multiply(new OrdinalNumber(self::INCOME_PER_POWER * $daysPassed));
        $this->coins = $this->coins->add($income);

        // Food production and consumption
        $foodProduced = $this->farms * self::FARM_PRODUCTION * $daysPassed;
        $this->food = $this->food->add(new OrdinalNumber($foodProduced));

        $troopCount = $this->troops->toFloat();
        $foodConsumed = $troopCount * $daysPassed;
        $this->food = $this->food->subtract(new OrdinalNumber($foodConsumed));

        // Note: We're not simulating starvation here - that would require
        // more detailed day-by-day simulation. We'll catch major issues
        // through snapshot comparison.

        $this->day = $newDay;
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
            $this->squadLeaders++;
            $this->armyClicks++;
            $this->updateRp();
        }
    }

    private function doBuyBarracks(): void {
        $cost = $this->expCost(self::BARRACKS_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'barracks')) {
            $this->barracks++;
            $this->armyClicks++;
            $this->updateSquadLeaderPower();
        }
    }

    private function doBuyMilitaryBase(): void {
        $cost = $this->expCost(self::MILITARY_BASE_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'military_base')) {
            $this->militaryBases++;
            $this->armyClicks++;
            $this->updateBarracksPower();
        }
    }

    private function doBuyKingdom(): void {
        $cost = $this->expCost(self::KINGDOM_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'kingdom')) {
            $this->kingdoms++;
            $this->armyClicks++;
            $this->updateMilitaryBasePower();
        }
    }

    private function doBuyEmpire(): void {
        $cost = $this->expCost(self::EMPIRE_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'empire')) {
            $this->empires++;
            $this->armyClicks++;
            $this->updateKingdomPower();
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

    // Update derived values
    private function updateRp(): void {
        $this->rp = 1 + $this->squadLeaders * $this->squadLeaderPower;
    }

    private function updateSquadLeaderPower(): void {
        $this->squadLeaderPower = 1 + $this->barracks * $this->barracksPower;
        $this->updateRp();
    }

    private function updateBarracksPower(): void {
        $this->barracksPower = 1 + $this->militaryBases * $this->militaryBasePower;
        $this->updateSquadLeaderPower();
    }

    private function updateMilitaryBasePower(): void {
        $this->militaryBasePower = 1 + $this->kingdoms * $this->kingdomPower;
        $this->updateBarracksPower();
    }

    private function updateKingdomPower(): void {
        $this->kingdomPower = 1 + $this->empires * $this->empirePower;
        $this->updateMilitaryBasePower();
    }

    /**
     * Compare replay state against logged snapshots
     */
    private function validateAgainstSnapshots(array $snapshots): void {
        error_log("validateAgainstSnapshots: " . count($snapshots) . " snapshots to check");

        if (empty($snapshots)) {
            error_log("WARNING: No snapshots to validate against!");
        }

        foreach ($snapshots as $snap) {
            $snapDay = $snap['day'] ?? 0;
            $player = $snap['player'] ?? [];

            error_log("Checking snapshot day $snapDay: coins=" . json_encode($player['coins'] ?? 'missing'));

            // Skip if we haven't reached this day
            if ($snapDay > $this->day) continue;

            // Compare troops - very loose tolerance because replay doesn't simulate starvation
            // Starvation can cause 90%+ troop loss, so we allow up to 100x divergence
            // This still catches impossible cheats like 10^20000 troops
            $snapTroops = new OrdinalNumber($player['troops'] ?? 0);
            $ratio = $this->safeRatio($this->troops, $snapTroops);
            if ($ratio < 0.01 || $ratio > 100.0) {
                $this->flags[] = "Day $snapDay: Troop mismatch - replay has " .
                    $this->troops->toString() . ", log shows " . $snapTroops->toString();
            }

            // Compare coins - very loose because income depends on troop count over time
            // and replay doesn't track starvation effects on income
            $snapCoins = new OrdinalNumber($player['coins'] ?? 0);
            $coinRatio = $this->safeRatio($this->coins, $snapCoins);
            error_log("  Coin comparison: replay={$this->coins->toString()}, snapshot={$snapCoins->toString()}, ratio=$coinRatio");
            if ($coinRatio < 0.001 || $coinRatio > 1000.0) {
                error_log("  -> FLAGGING coin discrepancy!");
                $this->flags[] = "Day $snapDay: Major coin discrepancy - replay has " .
                    $this->coins->toString() . ", log shows " . $snapCoins->toString();
            }

            // Compare farms
            $snapFarms = $player['farms'] ?? 0;
            if (abs($this->farms - $snapFarms) > 5) {
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
            $this->planets++;
            $this->armyClicks++;
            $this->updateEmpirePower();
        }
    }

    private function doBuySolarSystem(): void {
        $cost = $this->expCost(self::SOLAR_SYSTEM_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'solar_system')) {
            $this->solarSystems++;
            $this->armyClicks++;
            $this->updatePlanetPower();
        }
    }

    private function doBuyGalaxy(): void {
        $cost = $this->expCost(self::GALAXY_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'galaxy')) {
            $this->galaxies++;
            $this->armyClicks++;
            $this->updateSolarSystemPower();
        }
    }

    private function doBuyGalaxyCluster(): void {
        $cost = $this->expCost(self::GALAXY_CLUSTER_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'galaxy_cluster')) {
            $this->galaxyClusters++;
            $this->armyClicks++;
            $this->updateGalaxyPower();
        }
    }

    private function doBuySupercluster(): void {
        $cost = $this->expCost(self::SUPERCLUSTER_COST, 1.04, $this->armyClicks);
        if ($this->trySpend($cost, 'supercluster')) {
            $this->superclusters++;
            $this->armyClicks++;
            $this->updateGalaxyClusterPower();
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

    // Extended army chain update methods

    private function updateEmpirePower(): void {
        $this->empirePower = 1 + $this->planets * $this->planetPower;
        $this->updateKingdomPower();
    }

    private function updatePlanetPower(): void {
        $this->planetPower = 1 + $this->solarSystems * $this->solarSystemPower;
        $this->updateEmpirePower();
    }

    private function updateSolarSystemPower(): void {
        $this->solarSystemPower = 1 + $this->galaxies * $this->galaxyPower;
        $this->updatePlanetPower();
    }

    private function updateGalaxyPower(): void {
        $this->galaxyPower = 1 + $this->galaxyClusters * $this->galaxyClusterPower;
        $this->updateSolarSystemPower();
    }

    private function updateGalaxyClusterPower(): void {
        $this->galaxyClusterPower = 1 + $this->superclusters;
        $this->updateGalaxyPower();
    }

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
            'squadLeaders' => $this->squadLeaders,
            'barracks' => $this->barracks,
            'militaryBases' => $this->militaryBases,
            'kingdoms' => $this->kingdoms,
            'empires' => $this->empires,
            'planets' => $this->planets,
            'solarSystems' => $this->solarSystems,
            'galaxies' => $this->galaxies,
            'magic' => $this->magic,
            'darkRituals' => $this->darkRituals,
            'rp' => $this->rp,
        ];
    }
}
