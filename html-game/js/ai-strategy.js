// ================================================================
//  AI STRATEGY - AI decision making and strategy
//  VERSION: pct-priority-v1 (2026-03-25)
//  TUNED: tierMult=70, divisor=1, VAL_SL=5, FARM_THRESHOLD=6
//  NEW: Percentage-priority mode with threshold=0.02
// ================================================================

// AI LOGIC - Score-based strategy
function runAI(clicks) {
  var ai = G.ai;
  if (!ai) return;

  // === ACTION COUNTERS (for consolidated logging) ===
  var actionCounts = {};
  function countAction(action, count) {
    actionCounts[action] = (actionCounts[action] || 0) + (count || 1);
  }

  // === BEG OPTIMIZATION ===
  // If AI has 1M+ coins and begs, it's waiting for something expensive.
  // Skip remaining iterations and beg for all of them at once.
  var BEG_SKIP_THRESHOLD = 1000000;

  // === TUNING CONSTANTS ===
  var VAL_SL = 5;
  var FARM_THRESHOLD = 6;
  var trainMult = 0.01;
  var tierMult = 70;
  var divisor = 1;  // for SL helper formula
  var PCT_PRIORITY_THRESHOLD = 0.02;  // Enter percentage priority when recruit + empire < coins / threshold

  var VAL_BARRACKS = tierMult * VAL_SL;
  var VAL_MB = tierMult * VAL_BARRACKS;
  var VAL_KINGDOM = tierMult * VAL_MB;
  var VAL_EMPIRE = tierMult * VAL_KINGDOM;

  // Astronomical tier values (each 70x the previous)
  var VAL_PLANET = tierMult * VAL_EMPIRE;
  var VAL_SOLAR_SYSTEM = tierMult * VAL_PLANET;
  var VAL_GALAXY = tierMult * VAL_SOLAR_SYSTEM;
  var VAL_GALAXY_CLUSTER = tierMult * VAL_GALAXY;
  var VAL_SUPERCLUSTER = tierMult * VAL_GALAXY_CLUSTER;

  // Multiversal tier values (each 70x the previous)
  var VAL_OBSERVABLE_UNIVERSE = tierMult * VAL_SUPERCLUSTER;
  var VAL_FULL_UNIVERSE = tierMult * VAL_OBSERVABLE_UNIVERSE;
  var VAL_QUANTUM_MULTIVERSE = tierMult * VAL_FULL_UNIVERSE;
  var VAL_COSMOLOGICAL_MULTIVERSE = tierMult * VAL_QUANTUM_MULTIVERSE;
  var VAL_MATHEMATICAL_MULTIVERSE = tierMult * VAL_COSMOLOGICAL_MULTIVERSE;

  // Base costs for extended tiers
  var PLANET_BASE = 1e9;
  var SOLAR_SYSTEM_BASE = 1e11;
  var GALAXY_BASE = 1e13;
  var GALAXY_CLUSTER_BASE = 1e15;
  var SUPERCLUSTER_BASE = 1e17;
  var OBSERVABLE_UNIVERSE_BASE = 1e19;
  var FULL_UNIVERSE_BASE = 1e21;
  var QUANTUM_MULTIVERSE_BASE = 1e23;
  var COSMOLOGICAL_MULTIVERSE_BASE = 1e25;
  var MATHEMATICAL_MULTIVERSE_BASE = 1e27;

  var NO_INFLATE_BONUS = 1.2;
  var WAIT_DECAY = 0.99;

  // === HELPER FUNCTIONS ===
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiTp() { return ai.troops.mul(ai.ppt); }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    var total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }
  function aiSLCost() { return aiArmyCost(C.squadLeader_baseCost); }
  function aiBarracksCost() { return aiArmyCost(C.barracks_baseCost); }

  // === ACTION FUNCTIONS ===
  function buyArmy(id, base, power, boostVar) {
    var cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    countAction(id);
    logAI("buy_" + id);
    return true;
  }

  function doBuySL() {
    return buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null);
  }

  function doBuyBarracks() {
    return buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower");
  }

  function doBuyFarm() {
    var cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    countAction("farm");
    logAI("buy_farm");
    return true;
  }

  function doBuyPlantation() {
    var cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    countAction("plantation");
    logAI("buy_plantation");
    return true;
  }

  function doBuyColony() {
    var cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    countAction("colony");
    logAI("buy_colony");
    return true;
  }

  function doRecruit() {
    var cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    countAction("recruit");
    logAI("recruit");
    return true;
  }

  function doTrain() {
    var cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    // All dragon cohorts also get trained
    for (var c = 0; c < G.dragonCohorts.length; c++) {
      G.dragonCohorts[c].ppt *= ai.trainMult;
    }
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    countAction("train");
    logAI("train");
    return true;
  }

  // === SCORING CONTEXT ===
  var coins = ai.coins.toNumber();
  var troopCount = ai.troops.toNumber();
  var ppt = ai.ppt;
  var farmProd = aiCnt("farm") * C.farm_production;

  // Include dragon income in calculations
  var currentDragonIncome = getDragonPower().toNumber() * 4;
  var incomePerDay = (troopCount * ppt * 4) + currentDragonIncome + clicks;

  // === DRAGON INCOME PROJECTION ===
  // Project future dragon income to better estimate time-to-afford for expensive buildings
  // Dragons spawn polynomially: ritual #i (0-indexed) spawns day^(i+1) total dragons
  // NOTE: Training only boosts existing dragon ppt, new dragons always spawn at base 60000
  function projectDragonIncomeInDays(days) {
    if (G.darkRitualDays.length === 0) return 0;

    var futureDragons = 0;
    for (var i = 0; i < G.darkRitualDays.length; i++) {
      var futureDaysSince = (G.day + days) - G.darkRitualDays[i];
      if (futureDaysSince > 0) {
        var power = i + 1;
        futureDragons += Math.pow(futureDaysSince, power);
      }
    }

    // Use base 60000 ppt since new dragons spawn at base ppt regardless of training
    // Trained dragons are already counted in currentDragonIncome
    var basePpt = 60000;

    return futureDragons * basePpt * 4;  // * 4 for coins per power
  }

  // Effective income averaging current and 10-day projected (simple approximation)
  // Used for estimating time-to-afford expensive buildings when dragon income is growing
  function getEffectiveIncome() {
    if (G.darkRitualDays.length === 0) {
      return incomePerDay;
    }
    var futureIncome = (troopCount * ppt * 4) + projectDragonIncomeInDays(10) + clicks;
    return (incomePerDay + futureIncome) / 2;
  }

  var effectiveIncomePerDay = getEffectiveIncome();

  // === URGENCY-BASED FARM VALUATION ===
  // (replaces old strain-based system)
  var foodBuffer = ai.food.toNumber();
  var netConsume = (troopCount * C.food_perTroopDay) - farmProd;
  var daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  var recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
  var urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);

  var VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
  var VAL_PLANTATION = tierMult * VAL_FARM;
  var VAL_COLONY = tierMult * VAL_PLANTATION;

  // === SL HELPER LOGIC ===
  // When saving for expensive building, is buying SL better than just recruiting?
  //
  // RATIO EXPLANATION:
  // When you buy 1 SL, rp increases by squadLeaderPower.
  // Ratio = (rp + squadLeaderPower) / rp = "how much does rp multiply?"
  // The formula (1 + slPower + 1 + barracksPower) / (1 + slPower) simplifies to this
  // because slPower = rp - 1 and barracksPower = squadLeaderPower - 1.
  function slBetterThanRecruit(targetCost) {
    var slCost = aiSLCost();
    var recruitCost = aiRecruitCost();

    var slPower = ai.rp - 1;  // rp minus base (so 1 + slPower = rp)
    var slBoost = ai.squadLeaderPower - 1;  // squadLeaderPower minus base

    // Ratio: (rp + squadLeaderPower) / rp
    var ratio = (1 + slPower + 1 + slBoost) / (1 + slPower);

    var expectedRecruits = targetCost / (recruitCost * divisor);
    // EXTRA gain, not total - subtract baseline of 1
    var gain = (ratio - 1) * expectedRecruits;

    // Cost in recruit-equivalents
    var cost = (slCost + targetCost * 0.04) / recruitCost;

    return gain > cost;
  }

  // === BARRACKS HELPER LOGIC ===
  // When saving for kingdom/empire, is buying barracks better than buying SL?

  // Precomputed inflation factors for n=2,4,6,8,10 SL purchases
  var INFLATE_2 = 1.0816000;   // 1.04^2
  var INFLATE_4 = 1.1698586;   // 1.04^4
  var INFLATE_6 = 1.2653190;   // 1.04^6
  var INFLATE_8 = 1.3685691;   // 1.04^8
  var INFLATE_10 = 1.4802443;  // 1.04^10

  // Check if buying SL would still be worth it after n SLs already purchased
  function wouldSLStillHelpAfterN(targetCost, n, inflate) {
    var slCost = aiSLCost();
    var recruitCost = aiRecruitCost();

    var inflatedSlCost = slCost * inflate;
    var inflatedTarget = targetCost * inflate;
    var newSlPower = (ai.rp - 1) + n * ai.squadLeaderPower;
    var slBoost = ai.squadLeaderPower - 1;

    var ratio = (1 + newSlPower + 1 + slBoost) / (1 + newSlPower);
    var expectedRecruits = inflatedTarget / (recruitCost * divisor);
    var gain = (ratio - 1) * expectedRecruits;
    var cost = (inflatedSlCost + inflatedTarget * 0.04) / recruitCost;

    return gain > cost;
  }

  // Estimate how many SLs we'll buy while saving for target (returns 0, 3, 5, 7, 9, or 11)
  function estimateExpectedSLs(targetCost) {
    if (wouldSLStillHelpAfterN(targetCost, 10, INFLATE_10)) return 11;
    if (wouldSLStillHelpAfterN(targetCost, 8, INFLATE_8)) return 9;
    if (wouldSLStillHelpAfterN(targetCost, 6, INFLATE_6)) return 7;
    if (wouldSLStillHelpAfterN(targetCost, 4, INFLATE_4)) return 5;
    if (wouldSLStillHelpAfterN(targetCost, 2, INFLATE_2)) return 3;
    return 0;
  }

  // RATIO EXPLANATION:
  // When you buy 1 barracks, squadLeaderPower increases by barracksPower.
  // Ratio = (squadLeaderPower + barracksPower) / squadLeaderPower
  // This is "how much does squadLeaderPower multiply?"
  //
  // COST EXPLANATION:
  // Both barracks and SL inflate army costs equally (1.04^armyClicks),
  // so we just compare barracksCost / slCost directly.
  function barracksBetterThanSL(targetCost) {
    var barracksCost = aiBarracksCost();
    var slCost = aiSLCost();

    // Ratio: how much does buying 1 barracks multiply squadLeaderPower?
    var ratio = (ai.squadLeaderPower + ai.barracksPower) / ai.squadLeaderPower;

    // How many SLs do we expect to buy while saving for target?
    var expectedSLs = estimateExpectedSLs(targetCost);

    // EXTRA gain from barracks (ratio - 1, not ratio)
    var gain = (ratio - 1) * expectedSLs;

    // Cost in SL-equivalents (no inflation term - both inflate equally)
    var cost = barracksCost / slCost;

    return gain > cost;
  }

  // Does barracks help reach target (full check)?
  function doesBarracksHelp(targetCost) {
    if (!doesSLHelp(targetCost)) return false;  // SL must help first
    if (!barracksBetterThanSL(targetCost)) return false;
    if (ai.coins.lt(aiBarracksCost())) return false;
    if (aiCnt("squad_leader") < 3) return false;  // Need 3 SLs to unlock barracks
    return true;
  }

  // === PERCENTAGE PRIORITY MODE ===
  // When rich enough, switch to buying whatever gives highest % increase
  // This balances building counts more efficiently at high income levels

  function checkPriorityModeEligible() {
    var c = ai.coins.toNumber();
    var recruitCost = aiRecruitCost();
    var empireCost = aiArmyCost(C.empire_baseCost);
    // Both recruit and empire must be affordable at threshold level
    return recruitCost < c / PCT_PRIORITY_THRESHOLD && empireCost < c / PCT_PRIORITY_THRESHOLD;
  }

  // Get best ARMY building by percentage increase
  // Returns { name, cost, fn } or null if should save for unaffordable ideal
  function getBestArmyByPercentage() {
    var c = ai.coins.toNumber();
    var slCount = aiCnt("squad_leader");
    var barracksCount = aiCnt("barracks");
    var mbCount = aiCnt("military_base");
    var kingdomCount = aiCnt("kingdom");
    var empireCount = aiCnt("empire");

    function pctInc(power, count) {
      if (count === 0) return Infinity;
      return power / count;
    }

    var options = [];

    // Squad Leader
    if (troopCount >= 2) {
      options.push({
        name: 'squad_leader',
        pctIncrease: pctInc(ai.squadLeaderPower, slCount),
        cost: aiSLCost(),
        affordable: ai.coins.gte(aiSLCost()),
        fn: doBuySL
      });
    }

    // Barracks
    if (slCount >= 3) {
      options.push({
        name: 'barracks',
        pctIncrease: pctInc(ai.barracksPower, barracksCount),
        cost: aiBarracksCost(),
        affordable: ai.coins.gte(aiBarracksCost()),
        fn: doBuyBarracks
      });
    }

    // Military Base
    if (barracksCount >= 3) {
      var mbCost = aiArmyCost(C.militaryBase_baseCost);
      options.push({
        name: 'military_base',
        pctIncrease: pctInc(ai.militaryBasePower, mbCount),
        cost: mbCost,
        affordable: ai.coins.gte(mbCost),
        fn: function() { return buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower"); }
      });
    }

    // Kingdom
    if (mbCount >= 3) {
      var kingCost = aiArmyCost(C.kingdom_baseCost);
      options.push({
        name: 'kingdom',
        pctIncrease: pctInc(ai.kingdomPower, kingdomCount),
        cost: kingCost,
        affordable: ai.coins.gte(kingCost),
        fn: function() { return buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower"); }
      });
    }

    // Empire
    if (kingdomCount >= 3) {
      var empCost = aiArmyCost(C.empire_baseCost);
      options.push({
        name: 'empire',
        pctIncrease: pctInc(ai.empirePower, empireCount),
        cost: empCost,
        affordable: ai.coins.gte(empCost),
        fn: function() { return buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower"); }
      });
    }

    // === ASTRONOMICAL TIER ===
    var planetCount = aiCnt("planet");
    var solarSystemCount = aiCnt("solar_system");
    var galaxyCount = aiCnt("galaxy");
    var galaxyClusterCount = aiCnt("galaxy_cluster");
    var superclusterCount = aiCnt("supercluster");

    // Planet
    if ((G.planetUnlocked || G.astronomicalUnlocked) && empireCount >= 3) {
      var cost = aiArmyCost(PLANET_BASE);
      options.push({
        name: 'planet',
        pctIncrease: pctInc(ai.planetPower, planetCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("planet", PLANET_BASE, "planetPower", "empirePower"); }
      });
    }

    // Solar System
    if ((G.solarSystemUnlocked || G.astronomicalUnlocked) && planetCount >= 3) {
      var cost = aiArmyCost(SOLAR_SYSTEM_BASE);
      options.push({
        name: 'solar_system',
        pctIncrease: pctInc(ai.solarSystemPower, solarSystemCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("solar_system", SOLAR_SYSTEM_BASE, "solarSystemPower", "planetPower"); }
      });
    }

    // Galaxy
    if ((G.galaxyUnlocked || G.astronomicalUnlocked) && solarSystemCount >= 3) {
      var cost = aiArmyCost(GALAXY_BASE);
      options.push({
        name: 'galaxy',
        pctIncrease: pctInc(ai.galaxyPower, galaxyCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("galaxy", GALAXY_BASE, "galaxyPower", "solarSystemPower"); }
      });
    }

    // Galaxy Cluster
    if ((G.galaxyClusterUnlocked || G.astronomicalUnlocked) && galaxyCount >= 3) {
      var cost = aiArmyCost(GALAXY_CLUSTER_BASE);
      options.push({
        name: 'galaxy_cluster',
        pctIncrease: pctInc(ai.galaxyClusterPower, galaxyClusterCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("galaxy_cluster", GALAXY_CLUSTER_BASE, "galaxyClusterPower", "galaxyPower"); }
      });
    }

    // Supercluster
    if ((G.superclusterUnlocked || G.astronomicalUnlocked) && galaxyClusterCount >= 3) {
      var cost = aiArmyCost(SUPERCLUSTER_BASE);
      options.push({
        name: 'supercluster',
        pctIncrease: pctInc(ai.superclusterPower, superclusterCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("supercluster", SUPERCLUSTER_BASE, "superclusterPower", "galaxyClusterPower"); }
      });
    }

    // === MULTIVERSAL TIER ===
    var observableUniverseCount = aiCnt("observable_universe");
    var fullUniverseCount = aiCnt("full_universe");
    var quantumMultiverseCount = aiCnt("quantum_multiverse");
    var cosmologicalMultiverseCount = aiCnt("cosmological_multiverse");
    var mathematicalMultiverseCount = aiCnt("mathematical_multiverse");

    // Observable Universe
    if ((G.observableUniverseUnlocked || G.multiversalUnlocked) && superclusterCount >= 3) {
      var cost = aiArmyCost(OBSERVABLE_UNIVERSE_BASE);
      options.push({
        name: 'observable_universe',
        pctIncrease: pctInc(ai.observableUniversePower, observableUniverseCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("observable_universe", OBSERVABLE_UNIVERSE_BASE, "observableUniversePower", "superclusterPower"); }
      });
    }

    // Full Universe
    if ((G.fullUniverseUnlocked || G.multiversalUnlocked) && observableUniverseCount >= 3) {
      var cost = aiArmyCost(FULL_UNIVERSE_BASE);
      options.push({
        name: 'full_universe',
        pctIncrease: pctInc(ai.fullUniversePower, fullUniverseCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("full_universe", FULL_UNIVERSE_BASE, "fullUniversePower", "observableUniversePower"); }
      });
    }

    // Quantum Multiverse
    if ((G.quantumMultiverseUnlocked || G.multiversalUnlocked) && fullUniverseCount >= 3) {
      var cost = aiArmyCost(QUANTUM_MULTIVERSE_BASE);
      options.push({
        name: 'quantum_multiverse',
        pctIncrease: pctInc(ai.quantumMultiversePower, quantumMultiverseCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("quantum_multiverse", QUANTUM_MULTIVERSE_BASE, "quantumMultiversePower", "fullUniversePower"); }
      });
    }

    // Cosmological Multiverse
    if ((G.cosmologicalMultiverseUnlocked || G.multiversalUnlocked) && quantumMultiverseCount >= 3) {
      var cost = aiArmyCost(COSMOLOGICAL_MULTIVERSE_BASE);
      options.push({
        name: 'cosmological_multiverse',
        pctIncrease: pctInc(ai.cosmologicalMultiversePower, cosmologicalMultiverseCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("cosmological_multiverse", COSMOLOGICAL_MULTIVERSE_BASE, "cosmologicalMultiversePower", "quantumMultiversePower"); }
      });
    }

    // Mathematical Multiverse
    if ((G.mathematicalMultiverseUnlocked || G.multiversalUnlocked) && cosmologicalMultiverseCount >= 3) {
      var cost = aiArmyCost(MATHEMATICAL_MULTIVERSE_BASE);
      options.push({
        name: 'mathematical_multiverse',
        pctIncrease: pctInc(ai.mathematicalMultiversePower, mathematicalMultiverseCount),
        cost: cost,
        affordable: ai.coins.gte(cost),
        fn: function() { return buyArmy("mathematical_multiverse", MATHEMATICAL_MULTIVERSE_BASE, "mathematicalMultiversePower", "cosmologicalMultiversePower"); }
      });
    }

    if (options.length === 0) return null;

    // Sort by percentage increase (highest first)
    // Tie-breaker: prefer affordable, then prefer cheaper
    options.sort(function(a, b) {
      if (b.pctIncrease !== a.pctIncrease) return b.pctIncrease - a.pctIncrease;
      // Both Infinity or same pct - prefer affordable
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      // Both same affordability - prefer cheaper
      return a.cost - b.cost;
    });

    var ideal = options[0];

    // If ideal is unaffordable, save for it (return null)
    if (!ideal.affordable) return null;

    return ideal;
  }

  // Get best ECONOMY building by percentage increase
  function getBestEconomyByPercentage() {
    var farmCount = aiCnt("farm");
    var plantationCount = aiCnt("plantation");
    var colonyCount = aiCnt("colony");

    function pctInc(power, count) {
      if (count === 0) return Infinity;
      return power / count;
    }

    var options = [];

    // Farm (always available)
    options.push({
      name: 'farm',
      pctIncrease: pctInc(ai.fp, farmCount),
      cost: aiFarmCost(),
      affordable: ai.coins.gte(aiFarmCost()),
      fn: doBuyFarm
    });

    // Plantation (unlocked when farm >= 3)
    if (farmCount >= 3) {
      options.push({
        name: 'plantation',
        pctIncrease: pctInc(ai.pp, plantationCount),
        cost: aiPlantationCost(),
        affordable: ai.coins.gte(aiPlantationCost()),
        fn: doBuyPlantation
      });
    }

    // Colony (unlocked when plantation >= 3)
    if (plantationCount >= 3) {
      options.push({
        name: 'colony',
        pctIncrease: pctInc(1, colonyCount),
        cost: aiColonyCost(),
        affordable: ai.coins.gte(aiColonyCost()),
        fn: doBuyColony
      });
    }

    // Sort by percentage increase (highest first)
    // Tie-breaker: prefer affordable, then prefer cheaper
    options.sort(function(a, b) {
      if (b.pctIncrease !== a.pctIncrease) return b.pctIncrease - a.pctIncrease;
      if (a.affordable !== b.affordable) return a.affordable ? -1 : 1;
      return a.cost - b.cost;
    });

    var ideal = options[0];

    // If ideal is unaffordable, save for it
    if (!ideal.affordable) return null;

    return ideal;
  }

  // Does recruiting help reach target faster?
  function doesRecruitHelp(targetCost) {
    var recruitCost = aiRecruitCost();
    if (coins < recruitCost) return false;

    var daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    var newIncome = ((troopCount + ai.rp) * ppt * 4) + currentDragonIncome + clicks;
    var daysWithRecruit = (targetCost - coins + recruitCost) / Math.max(newIncome, 1);

    return daysWithRecruit < daysToReach;
  }

  // Does SL help reach target (full check)?
  function doesSLHelp(targetCost) {
    if (!doesRecruitHelp(targetCost)) return false;
    if (!slBetterThanRecruit(targetCost)) return false;
    if (ai.coins.lt(aiSLCost())) return false;
    return true;
  }

  // Find best military target we're building toward
  function findBestMilitaryTarget() {
    if (aiCnt("kingdom") >= 3) return aiArmyCost(C.empire_baseCost);
    if (aiCnt("military_base") >= 3) return aiArmyCost(C.kingdom_baseCost);
    if (aiCnt("barracks") >= 3) return aiArmyCost(C.militaryBase_baseCost);
    if (aiCnt("squad_leader") >= 3) return aiBarracksCost();
    return 0;
  }

  // === SCORING FUNCTION ===
  function calcScore(cost, value, isImmediate) {
    if (cost <= 0) return -1;
    var currentCoins = ai.coins.toNumber();
    var costPct = cost / Math.max(currentCoins, 1);

    var penalty = Math.sqrt(costPct);
    var baseScore = value / penalty;

    if (costPct > 1) {
      var coinsNeeded = cost - currentCoins;
      // Use effective income (accounts for dragon growth) for better wait time estimates
      var daysToWait = coinsNeeded / Math.max(effectiveIncomePerDay, 1);
      baseScore *= Math.pow(WAIT_DECAY, daysToWait);
    }

    if (isImmediate) baseScore *= NO_INFLATE_BONUS;

    return baseScore;
  }

  // === FOOD EMERGENCY DETECTION ===
  var fCost = aiFarmCost();
  var daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;

  function wouldSpendingCauseEmergency(spendAmount) {
    if (netConsume <= 0) return false;
    var coinsAfterSpend = coins - spendAmount;
    var daysToAfford = fCost > coinsAfterSpend
      ? (fCost - coinsAfterSpend) / Math.max(incomePerDay, 1)
      : 0;
    return daysToAfford > daysOfFood;
  }

  function recruitCausesSuperEmergency() {
    var newTroops = troopCount + ai.rp;
    var newConsume = newTroops * C.food_perTroopDay;
    var currentFarmProd = aiCnt("farm") * C.farm_production;
    if (currentFarmProd >= newConsume) return false;
    var deficit = newConsume - currentFarmProd;
    var foodBuf = ai.food.toNumber();
    var daysOfBuffer = deficit > 0 ? foodBuf / deficit : 999;
    if (daysOfBuffer > 50) return false;
    var farmsNeeded = Math.ceil(newConsume / C.farm_production);
    var farmsToBuy = farmsNeeded - aiCnt("farm");
    var costToBuy = farmsToBuy * fCost;
    if (coins >= costToBuy) return false;
    var coinsNeeded = costToBuy - coins;
    var daysToAfford = coinsNeeded / Math.max(incomePerDay, 1);
    return daysToAfford > daysOfBuffer;
  }

  // Does training help reach target faster?
  function doesTrainHelp(targetCost) {
    var trainCost = aiTrainCost();
    if (coins < trainCost || troopCount < 5) return false;

    var daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    // Training also boosts dragon ppt, so dragon income would multiply too
    var newDragonIncome = currentDragonIncome * ai.trainMult;
    var newIncome = (troopCount * ppt * ai.trainMult * 4) + newDragonIncome + clicks;
    var daysWithTrain = (targetCost - coins + trainCost) / Math.max(newIncome, 1);

    return daysWithTrain < daysToReach;
  }

  // === MAIN LOOP ===
  var maxIterations = clicks;
  var iterations = 0;

  // Beg optimization helper - beg for all remaining iterations at once
  function begForRemaining() {
    var remaining = maxIterations - iterations;
    if (remaining > 0) {
      ai.coins = ai.coins.add(remaining);
      countAction("beg", remaining);
    }
  }

  while (iterations < maxIterations) {
    iterations++;
    coins = ai.coins.toNumber();
    troopCount = ai.troops.toNumber();
    ppt = ai.ppt;
    currentDragonIncome = getDragonPower().toNumber() * 4;
    incomePerDay = (troopCount * ppt * 4) + currentDragonIncome + clicks;
    effectiveIncomePerDay = getEffectiveIncome();

    // No troops - must recruit or beg
    if (troopCount < 1) {
      var recruitCost = aiRecruitCost();
      if (ai.coins.gte(recruitCost)) {
        doRecruit();
      } else {
        ai.coins = ai.coins.add(1);
        countAction("beg");
        logAI("beg");
        if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
      }
      continue;
    }

    // Recalculate food metrics
    farmProd = aiCnt("farm") * C.farm_production;
    netConsume = (troopCount * C.food_perTroopDay) - farmProd;
    foodBuffer = ai.food.toNumber();
    daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    fCost = aiFarmCost();
    daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    var foodEmergency = !G.enemyNoStarve && (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

    // Recalculate urgency-based farm value
    recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
    urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);
    VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
    VAL_PLANTATION = tierMult * VAL_FARM;
    VAL_COLONY = tierMult * VAL_PLANTATION;

    // FOOD EMERGENCY
    if (foodEmergency) {
      if (ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      } else {
        ai.coins = ai.coins.add(1);
        countAction("beg");
        logAI("beg");
        if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
        continue;
      }
    }

    var isAlmostEmergency = !G.enemyNoStarve && recruitCausesSuperEmergency();

    // === CALCULATE ALL SCORES ===
    var actions = [];

    if (!isAlmostEmergency) {
      // Train
      if (troopCount >= 5) {
        var trainCost = aiTrainCost();
        var trainValue = troopCount * ppt * trainMult;
        var trainScore = calcScore(trainCost, trainValue, true);
        if (trainScore > 0) actions.push({ name: 'train', score: trainScore, cost: trainCost, fn: doTrain });
      }

      // Recruit
      {
        var recruitCost = aiRecruitCost();
        var recruitValue = ai.rp * ppt;
        var maxSustainable = farmProd / C.food_perTroopDay;
        var newStrain = (!G.enemyNoStarve && maxSustainable > 0) ? (troopCount + ai.rp) / maxSustainable : 0;
        var strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
        var recruitScore = calcScore(recruitCost, recruitValue, true);
        recruitScore -= strainPenalty;
        if (recruitScore > 0) actions.push({ name: 'recruit', score: recruitScore, cost: recruitCost, fn: doRecruit });
      }

      // Squad Leader
      if (troopCount >= 2) {
        var slCost = aiSLCost();
        var slValue = ai.squadLeaderPower * VAL_SL * ppt;
        var slScore = calcScore(slCost, slValue, false);
        if (slScore > 0) actions.push({ name: 'squad_leader', score: slScore, cost: slCost, fn: doBuySL });
      }

      // Barracks
      if (aiCnt("squad_leader") >= 3) {
        var barCost = aiBarracksCost();
        var barValue = ai.barracksPower * VAL_BARRACKS * ppt;
        var barScore = calcScore(barCost, barValue, false);
        if (barScore > 0) actions.push({ name: 'barracks', score: barScore, cost: barCost, fn: doBuyBarracks });
      }

      // Military Base
      if (aiCnt("barracks") >= 3) {
        var mbCost = aiArmyCost(C.militaryBase_baseCost);
        var mbValue = ai.militaryBasePower * VAL_MB * ppt;
        var mbScore = calcScore(mbCost, mbValue, false);
        if (mbScore > 0) actions.push({ name: 'military_base', score: mbScore, cost: mbCost, fn: function() { return buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower"); } });
      }

      // Kingdom
      if (aiCnt("military_base") >= 3) {
        var kingCost = aiArmyCost(C.kingdom_baseCost);
        var kingValue = ai.kingdomPower * VAL_KINGDOM * ppt;
        var kingScore = calcScore(kingCost, kingValue, false);
        if (kingScore > 0) actions.push({ name: 'kingdom', score: kingScore, cost: kingCost, fn: function() { return buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower"); } });
      }

      // Empire
      if (aiCnt("kingdom") >= 3) {
        var empCost = aiArmyCost(C.empire_baseCost);
        var empValue = ai.empirePower * VAL_EMPIRE * ppt;
        var empScore = calcScore(empCost, empValue, false);
        if (empScore > 0) actions.push({ name: 'empire', score: empScore, cost: empCost, fn: function() { return buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower"); } });
      }

      // === ASTRONOMICAL TIER (if unlocked) ===
      // Planet
      if ((G.planetUnlocked || G.astronomicalUnlocked) && aiCnt("empire") >= 3) {
        var planetCost = aiArmyCost(PLANET_BASE);
        var planetValue = ai.planetPower * VAL_PLANET * ppt;
        var planetScore = calcScore(planetCost, planetValue, false);
        if (planetScore > 0) actions.push({ name: 'planet', score: planetScore, cost: planetCost, fn: function() { return buyArmy("planet", PLANET_BASE, "planetPower", "empirePower"); } });
      }

      // Solar System
      if ((G.solarSystemUnlocked || G.astronomicalUnlocked) && aiCnt("planet") >= 3) {
        var ssCost = aiArmyCost(SOLAR_SYSTEM_BASE);
        var ssValue = ai.solarSystemPower * VAL_SOLAR_SYSTEM * ppt;
        var ssScore = calcScore(ssCost, ssValue, false);
        if (ssScore > 0) actions.push({ name: 'solar_system', score: ssScore, cost: ssCost, fn: function() { return buyArmy("solar_system", SOLAR_SYSTEM_BASE, "solarSystemPower", "planetPower"); } });
      }

      // Galaxy
      if ((G.galaxyUnlocked || G.astronomicalUnlocked) && aiCnt("solar_system") >= 3) {
        var galCost = aiArmyCost(GALAXY_BASE);
        var galValue = ai.galaxyPower * VAL_GALAXY * ppt;
        var galScore = calcScore(galCost, galValue, false);
        if (galScore > 0) actions.push({ name: 'galaxy', score: galScore, cost: galCost, fn: function() { return buyArmy("galaxy", GALAXY_BASE, "galaxyPower", "solarSystemPower"); } });
      }

      // Galaxy Cluster
      if ((G.galaxyClusterUnlocked || G.astronomicalUnlocked) && aiCnt("galaxy") >= 3) {
        var gcCost = aiArmyCost(GALAXY_CLUSTER_BASE);
        var gcValue = ai.galaxyClusterPower * VAL_GALAXY_CLUSTER * ppt;
        var gcScore = calcScore(gcCost, gcValue, false);
        if (gcScore > 0) actions.push({ name: 'galaxy_cluster', score: gcScore, cost: gcCost, fn: function() { return buyArmy("galaxy_cluster", GALAXY_CLUSTER_BASE, "galaxyClusterPower", "galaxyPower"); } });
      }

      // Supercluster
      if ((G.superclusterUnlocked || G.astronomicalUnlocked) && aiCnt("galaxy_cluster") >= 3) {
        var scCost = aiArmyCost(SUPERCLUSTER_BASE);
        var scValue = ai.superclusterPower * VAL_SUPERCLUSTER * ppt;
        var scScore = calcScore(scCost, scValue, false);
        if (scScore > 0) actions.push({ name: 'supercluster', score: scScore, cost: scCost, fn: function() { return buyArmy("supercluster", SUPERCLUSTER_BASE, "superclusterPower", "galaxyClusterPower"); } });
      }

      // === MULTIVERSAL TIER (if unlocked) ===
      // Observable Universe
      if ((G.observableUniverseUnlocked || G.multiversalUnlocked) && aiCnt("supercluster") >= 3) {
        var ouCost = aiArmyCost(OBSERVABLE_UNIVERSE_BASE);
        var ouValue = ai.observableUniversePower * VAL_OBSERVABLE_UNIVERSE * ppt;
        var ouScore = calcScore(ouCost, ouValue, false);
        if (ouScore > 0) actions.push({ name: 'observable_universe', score: ouScore, cost: ouCost, fn: function() { return buyArmy("observable_universe", OBSERVABLE_UNIVERSE_BASE, "observableUniversePower", "superclusterPower"); } });
      }

      // Full Universe
      if ((G.fullUniverseUnlocked || G.multiversalUnlocked) && aiCnt("observable_universe") >= 3) {
        var fuCost = aiArmyCost(FULL_UNIVERSE_BASE);
        var fuValue = ai.fullUniversePower * VAL_FULL_UNIVERSE * ppt;
        var fuScore = calcScore(fuCost, fuValue, false);
        if (fuScore > 0) actions.push({ name: 'full_universe', score: fuScore, cost: fuCost, fn: function() { return buyArmy("full_universe", FULL_UNIVERSE_BASE, "fullUniversePower", "observableUniversePower"); } });
      }

      // Quantum Multiverse
      if ((G.quantumMultiverseUnlocked || G.multiversalUnlocked) && aiCnt("full_universe") >= 3) {
        var qmCost = aiArmyCost(QUANTUM_MULTIVERSE_BASE);
        var qmValue = ai.quantumMultiversePower * VAL_QUANTUM_MULTIVERSE * ppt;
        var qmScore = calcScore(qmCost, qmValue, false);
        if (qmScore > 0) actions.push({ name: 'quantum_multiverse', score: qmScore, cost: qmCost, fn: function() { return buyArmy("quantum_multiverse", QUANTUM_MULTIVERSE_BASE, "quantumMultiversePower", "fullUniversePower"); } });
      }

      // Cosmological Multiverse
      if ((G.cosmologicalMultiverseUnlocked || G.multiversalUnlocked) && aiCnt("quantum_multiverse") >= 3) {
        var cmCost = aiArmyCost(COSMOLOGICAL_MULTIVERSE_BASE);
        var cmValue = ai.cosmologicalMultiversePower * VAL_COSMOLOGICAL_MULTIVERSE * ppt;
        var cmScore = calcScore(cmCost, cmValue, false);
        if (cmScore > 0) actions.push({ name: 'cosmological_multiverse', score: cmScore, cost: cmCost, fn: function() { return buyArmy("cosmological_multiverse", COSMOLOGICAL_MULTIVERSE_BASE, "cosmologicalMultiversePower", "quantumMultiversePower"); } });
      }

      // Mathematical Multiverse
      if ((G.mathematicalMultiverseUnlocked || G.multiversalUnlocked) && aiCnt("cosmological_multiverse") >= 3) {
        var mmCost = aiArmyCost(MATHEMATICAL_MULTIVERSE_BASE);
        var mmValue = ai.mathematicalMultiversePower * VAL_MATHEMATICAL_MULTIVERSE * ppt;
        var mmScore = calcScore(mmCost, mmValue, false);
        if (mmScore > 0) actions.push({ name: 'mathematical_multiverse', score: mmScore, cost: mmCost, fn: function() { return buyArmy("mathematical_multiverse", MATHEMATICAL_MULTIVERSE_BASE, "mathematicalMultiversePower", "cosmologicalMultiversePower"); } });
      }
    }

    // Economy actions
    if (!G.enemyNoStarve) {
      // Farm
      {
        var farmCost = aiFarmCost();
        var farmValue = ai.fp * VAL_FARM * ppt;
        var farmScore = calcScore(farmCost, farmValue, false);
        if (farmScore > 0) actions.push({ name: 'farm', score: farmScore, cost: farmCost, fn: doBuyFarm });
      }

      // Plantation
      if (aiCnt("farm") >= 3) {
        var plantCost = aiPlantationCost();
        var plantValue = ai.pp * VAL_PLANTATION * ppt;
        var plantScore = calcScore(plantCost, plantValue, false);
        if (plantScore > 0) actions.push({ name: 'plantation', score: plantScore, cost: plantCost, fn: doBuyPlantation });
      }

      // Colony
      if (aiCnt("plantation") >= 3) {
        var colCost = aiColonyCost();
        var colValue = 1 * VAL_COLONY * ppt;
        var colScore = calcScore(colCost, colValue, false);
        if (colScore > 0) actions.push({ name: 'colony', score: colScore, cost: colCost, fn: doBuyColony });
      }
    }

    if (actions.length === 0) {
      ai.coins = ai.coins.add(1);
      countAction("beg");
      logAI("beg");
      if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
      continue;
    }

    actions.sort(function(a, b) { return b.score - a.score; });

    var best = actions[0];
    var bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
    var bestIsUnaffordable = bestIsBuilding && best.cost > coins;
    var bestIsEconomy = !G.enemyNoStarve && (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');
    var armyBuildingNames = ['squad_leader', 'barracks', 'military_base', 'kingdom', 'empire',
                              'planet', 'solar_system', 'galaxy', 'galaxy_cluster', 'supercluster',
                              'observable_universe', 'full_universe', 'quantum_multiverse',
                              'cosmological_multiverse', 'mathematical_multiverse'];
    var bestIsArmyBuilding = armyBuildingNames.indexOf(best.name) >= 0;

    // === PERCENTAGE PRIORITY MODE ===
    // When rich enough, use percentage-based selection for more balanced building
    var inPriorityMode = checkPriorityModeEligible();
    if (inPriorityMode) {
      ai._hasBeenInPriorityMode = true;
    }
    var hasBeenInPriority = ai._hasBeenInPriorityMode || false;

    // PERCENTAGE PRIORITY MODE LOGIC (matches simulation):
    // 1. If normal mode wants economy, use percentage-based economy selection
    // 2. If normal mode wants army/train/recruit, use percentage-based army selection
    // 3. After leaving priority mode: only allow train/economy, army buildings force re-entry

    if (inPriorityMode && bestIsEconomy && !bestIsUnaffordable) {
      // In priority mode and normal mode wants economy - use percentage-based economy selection
      var pctBest = getBestEconomyByPercentage();
      if (pctBest && pctBest.fn()) {
        continue;
      }
    }

    if (inPriorityMode && !bestIsEconomy && !bestIsUnaffordable) {
      // In priority mode and normal mode wants army/train/recruit - use percentage-based army selection
      var pctBest = getBestArmyByPercentage();
      if (pctBest && pctBest.fn()) {
        continue;
      }
    }

    if (!inPriorityMode && hasBeenInPriority && bestIsArmyBuilding && !bestIsUnaffordable) {
      // Left priority mode, but want to buy army building
      // Check if we can re-enter priority mode for this purchase
      if (checkPriorityModeEligible()) {
        // Re-enter and use percentage selection
        var pctBest = getBestArmyByPercentage();
        if (pctBest && pctBest.fn()) {
          continue;
        }
      } else {
        // Can't re-enter - do train instead if possible, otherwise skip to next action
        if (troopCount >= 5 && ai.coins.gte(aiTrainCost())) {
          doTrain();
          continue;
        }
        // Fall through to try other actions (economy, etc.)
      }
    }

    // Handle waiting for unaffordable building
    if (bestIsUnaffordable) {
      if (isAlmostEmergency) {
        if (doesTrainHelp(best.cost)) {
          doTrain();
          continue;
        }
        ai.coins = ai.coins.add(1);
        countAction("beg");
        logAI("beg");
        if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
        continue;
      }

      var bestIsEconomy = !G.enemyNoStarve && (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');

      // For economy buildings, just use train helps
      if (bestIsEconomy) {
        if (doesTrainHelp(best.cost)) {
          doTrain();
          continue;
        }
        ai.coins = ai.coins.add(1);
        countAction("beg");
        logAI("beg");
        if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
        continue;
      }

      // For military buildings, check barracks helper first, then SL helper
      if (doesBarracksHelp(best.cost)) {
        doBuyBarracks();
        continue;
      }

      if (doesSLHelp(best.cost)) {
        doBuySL();
        continue;
      }

      // Fallback to recruit/train
      if (doesRecruitHelp(best.cost) && !recruitCausesSuperEmergency()) {
        doRecruit();
        continue;
      }

      if (doesTrainHelp(best.cost)) {
        doTrain();
        continue;
      }

      ai.coins = ai.coins.add(1);
      countAction("beg");
      logAI("beg");
      if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
      continue;
    }

    // Best action is affordable - but check if barracks/SL helper is better when recruit wins
    if (best.name === 'recruit') {
      var targetCost = findBestMilitaryTarget();
      if (targetCost > 0) {
        // Check barracks helper first (higher tier)
        if (doesBarracksHelp(targetCost)) {
          doBuyBarracks();
          continue;
        }
        // Then SL helper
        if (slBetterThanRecruit(targetCost) && ai.coins.gte(aiSLCost())) {
          doBuySL();
          continue;
        }
      }
    }

    // Execute best affordable action
    for (var i = 0; i < actions.length; i++) {
      var action = actions[i];
      if (action.name !== 'farm' && wouldSpendingCauseEmergency(action.cost)) {
        continue;
      }
      if (action.fn()) break;
    }

    // If nothing worked, beg
    if (i >= actions.length) {
      ai.coins = ai.coins.add(1);
      countAction("beg");
      logAI("beg");
      if (coins > BEG_SKIP_THRESHOLD) { begForRemaining(); break; }
    }
  }

  // === LOG SUMMARY OF AI ACTIONS ===
  var actionList = Object.keys(actionCounts);
  // Don't show beg in summary if AI has > 1000 coins (reduces spam once established)
  if (ai.coins.gte(1000)) {
    actionList = actionList.filter(function(a) { return a !== 'beg'; });
  }
  if (actionList.length > 0) {
    var summary = actionList.map(function(action) {
      var count = actionCounts[action];
      return action + (count > 1 ? " x" + count : "");
    }).join(", ");
    log("[AI] " + summary);
  }
}

// Simulation functions for AI comparison
function simDay(ai, clicks, enemyPower, runFn) {
  runFn(ai, clicks, enemyPower);

  if (ai.troops.gte(1)) {
    var loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  var farmProd = (ai.counts["farm"] || 0) * C.farm_production;
  var troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
  ai.food = ai.food.add(farmProd);
  var starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  if (starving) {
    ai.starvationStreak++;
    var desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    var deserters = ai.troops.mulFraction(desertPct, 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function runSimulation(days, clicksPerSec) {
  var oldAI = createAIState();
  var newAI = createAIState();

  var results = { days: days, clicks: clicksPerSec, snapshots: [] };

  for (var day = 1; day <= days; day++) {
    var oldPower = oldAI.troops.toNumber() * oldAI.ppt;
    var newPower = newAI.troops.toNumber() * newAI.ppt;

    // For old AI, we'd need a reference to runAI_Old - skipped for simplicity

    if (day % 10 === 0 || day === days) {
      results.snapshots.push({
        day: day,
        old: {
          troops: oldAI.troops.toNumber(),
          ppt: oldAI.ppt,
          power: oldAI.troops.toNumber() * oldAI.ppt,
          coins: oldAI.coins.toNumber(),
          farms: oldAI.counts["farm"] || 0
        },
        new: {
          troops: newAI.troops.toNumber(),
          ppt: newAI.ppt,
          power: newAI.troops.toNumber() * newAI.ppt,
          coins: newAI.coins.toNumber(),
          farms: newAI.counts["farm"] || 0
        }
      });
    }
  }

  return results;
}
