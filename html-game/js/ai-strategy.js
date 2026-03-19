// ================================================================
//  AI STRATEGY - AI decision making and strategy
//  VERSION: urgency-farm-v1 (2026-03-12)
//  TUNED: tierMult=70, divisor=1, VAL_SL=5, FARM_THRESHOLD=6
// ================================================================

// AI LOGIC - Score-based strategy
function runAI(clicks) {
  var ai = G.ai;
  if (!ai) return;

  // === ACTION COUNTERS (for consolidated logging) ===
  var actionCounts = {};
  function countAction(action) {
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  }

  // === TUNING CONSTANTS ===
  var VAL_SL = 5;
  var FARM_THRESHOLD = 6;
  var trainMult = 0.01;
  var tierMult = 70;
  var divisor = 1;  // for SL helper formula

  var VAL_BARRACKS = tierMult * VAL_SL;
  var VAL_MB = tierMult * VAL_BARRACKS;
  var VAL_KINGDOM = tierMult * VAL_MB;
  var VAL_EMPIRE = tierMult * VAL_KINGDOM;

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
  var incomePerDay = (troopCount * ppt * 4) + clicks;

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
  //
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
    var expectedSLs = targetCost / (slCost * divisor);

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

  // Does recruiting help reach target faster?
  function doesRecruitHelp(targetCost) {
    var recruitCost = aiRecruitCost();
    if (coins < recruitCost) return false;

    var daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    var newIncome = ((troopCount + ai.rp) * ppt * 4) + clicks;
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
      var daysToWait = coinsNeeded / Math.max(incomePerDay, 1);
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
    var newIncome = (troopCount * ppt * ai.trainMult * 4) + clicks;
    var daysWithTrain = (targetCost - coins + trainCost) / Math.max(newIncome, 1);

    return daysWithTrain < daysToReach;
  }

  // === MAIN LOOP ===
  var maxIterations = clicks;
  var iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    coins = ai.coins.toNumber();
    troopCount = ai.troops.toNumber();
    ppt = ai.ppt;
    incomePerDay = (troopCount * ppt * 4) + clicks;

    // No troops - must recruit or beg
    if (troopCount < 1) {
      var recruitCost = aiRecruitCost();
      if (ai.coins.gte(recruitCost)) {
        doRecruit();
      } else {
        ai.coins = ai.coins.add(1);
        countAction("beg");
        logAI("beg");
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
      continue;
    }

    actions.sort(function(a, b) { return b.score - a.score; });

    var best = actions[0];
    var bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
    var bestIsUnaffordable = bestIsBuilding && best.cost > coins;

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
    }
  }

  // === LOG SUMMARY OF AI ACTIONS ===
  var actionList = Object.keys(actionCounts);
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
