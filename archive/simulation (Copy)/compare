#!/usr/bin/env node
/**
 * Compare New AI vs Old AI (from HTML)
 */

const { ON } = require('./ordinal');
const { C, PARAMS } = require('./constants');
const { createAIState } = require('./state');
const { getCount } = require('./costs');

// Import new AI
const { runAI: runNewAI } = require('./ai');

// =============================================================================
// OLD AI (ported from army-clicker.html)
// Uses additive wait penalty, tries same/higher tier buildings
// =============================================================================

function runOldAI(ai, clicks, enemyPower) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }

  function doBuyFarm() {
    const cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    return true;
  }

  function doBuyPlantation() {
    const cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    return true;
  }

  function doBuyColony() {
    const cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    return true;
  }

  function doRecruit() {
    const cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    return true;
  }

  function doTrain() {
    const cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    return true;
  }

  // Scoring context
  let coins = ai.coins.toNumber();
  let troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const closeness = Math.min(myPower, enemyPower) / Math.max(myPower, enemyPower, 1);
  let farmProd = aiCnt("farm") * C.farm_production;
  const maxSustainable = farmProd / C.food_perTroopDay;
  let strain = maxSustainable > 0 ? troopCount / maxSustainable : 1;
  strain = Math.min(strain, 1);

  const K_CLOSENESS = 0.5;
  const K_STRAIN = 2.0;
  const NO_INFLATE_BONUS = 1.2;
  const VAL_FARM = 1, VAL_PLANTATION = 3, VAL_COLONY = 9;
  const VAL_SL = 10, VAL_BARRACKS = 100, VAL_MB = 1000, VAL_KINGDOM = 10000;

  const incomePerDayCalc = (troopCount * ppt * 4) + clicks;

  // OLD calcScore: additive wait penalty
  function calcScore(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;
    const currentCoins = ai.coins.toNumber();
    const costPct = cost / Math.max(currentCoins, 1);
    let penalty = Math.sqrt(costPct);

    // ADDITIVE wait penalty (old behavior)
    if (costPct > 1) {
      const coinsNeeded = cost - currentCoins;
      const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
      penalty += daysToWait * 0.5;
    }

    let baseScore = value / penalty;
    if (isImmediate) baseScore *= NO_INFLATE_BONUS;
    if (isArmy) baseScore *= (1 + closeness * K_CLOSENESS);
    else baseScore *= (1 + strain * K_STRAIN);
    return baseScore;
  }

  // Food emergency
  let dailyConsume = troopCount * C.food_perTroopDay;
  let netConsume = dailyConsume - farmProd;
  let foodBuffer = ai.food.toNumber();
  let daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const incomePerDay = (troopCount * ppt * 4) + clicks;
  let fCost = aiFarmCost();
  let daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;

  function recruitCausesSuperEmergency() {
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;
    if (currentFarmProd >= newConsume) return false;
    const deficit = newConsume - currentFarmProd;
    const foodBuf = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? foodBuf / deficit : 999;
    if (daysOfBuffer > 50) return false;
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsToBuy = farmsNeeded - aiCnt("farm");
    const costToBuy = farmsToBuy * fCost;
    if (coins >= costToBuy) return false;
    const coinsNeeded = costToBuy - coins;
    const daysToAfford = coinsNeeded / Math.max(incomePerDay, 1);
    return daysToAfford > daysOfBuffer;
  }

  const maxIterations = clicks;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    coins = ai.coins.toNumber();
    troopCount = ai.troops.toNumber();

    if (troopCount < 1) {
      const recruitCost = aiRecruitCost();
      if (ai.coins.lt(recruitCost)) {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    // Recalculate emergency
    dailyConsume = troopCount * C.food_perTroopDay;
    farmProd = aiCnt("farm") * C.farm_production;
    netConsume = dailyConsume - farmProd;
    foodBuffer = ai.food.toNumber();
    daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    fCost = aiFarmCost();
    daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    const foodEmergency = (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

    if (foodEmergency) {
      if (ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      } else {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    // Calculate scores
    const actions = [];

    if (troopCount >= 5) {
      const trainCost = aiTrainCost();
      const trainValue = troopCount * ppt * 0.01;
      const trainScore = calcScore(trainCost, trainValue, true, true);
      if (trainScore > 0) actions.push({ name: 'train', score: trainScore, fn: doTrain });
    }

    if (!recruitCausesSuperEmergency()) {
      const recruitCost = aiRecruitCost();
      const recruitValue = ai.rp * ppt;
      const newStrain = maxSustainable > 0 ? (troopCount + ai.rp) / maxSustainable : 1;
      const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
      let recruitScore = calcScore(recruitCost, recruitValue, true, true);
      recruitScore -= strainPenalty;
      if (recruitScore > 0) actions.push({ name: 'recruit', score: recruitScore, fn: doRecruit });
    }

    if (troopCount >= 2) {
      const slCost = aiArmyCost(C.squadLeader_baseCost);
      const slValue = ai.squadLeaderPower * VAL_SL;
      const slScore = calcScore(slCost, slValue, true, false);
      if (slScore > 0) actions.push({ name: 'squad_leader', score: slScore, fn: () => buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null) });
    }

    if (aiCnt("squad_leader") >= 3) {
      const barCost = aiArmyCost(C.barracks_baseCost);
      const barValue = ai.barracksPower * VAL_BARRACKS;
      const barScore = calcScore(barCost, barValue, true, false);
      if (barScore > 0) actions.push({ name: 'barracks', score: barScore, fn: () => buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower") });
    }

    if (aiCnt("barracks") >= 3) {
      const mbCost = aiArmyCost(C.militaryBase_baseCost);
      const mbValue = ai.militaryBasePower * VAL_MB;
      const mbScore = calcScore(mbCost, mbValue, true, false);
      if (mbScore > 0) actions.push({ name: 'military_base', score: mbScore, fn: () => buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower") });
    }

    if (aiCnt("military_base") >= 3) {
      const kingCost = aiArmyCost(C.kingdom_baseCost);
      const kingValue = ai.kingdomPower * VAL_KINGDOM;
      const kingScore = calcScore(kingCost, kingValue, true, false);
      if (kingScore > 0) actions.push({ name: 'kingdom', score: kingScore, fn: () => buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower") });
    }

    {
      const farmCost = aiFarmCost();
      const farmValue = ai.fp * VAL_FARM;
      const farmScore = calcScore(farmCost, farmValue, false, false);
      if (farmScore > 0) actions.push({ name: 'farm', score: farmScore, fn: doBuyFarm });
    }

    if (aiCnt("farm") >= 3) {
      const plantCost = aiPlantationCost();
      const plantValue = ai.pp * VAL_PLANTATION;
      const plantScore = calcScore(plantCost, plantValue, false, false);
      if (plantScore > 0) actions.push({ name: 'plantation', score: plantScore, fn: doBuyPlantation });
    }

    if (aiCnt("plantation") >= 3) {
      const colCost = aiColonyCost();
      const colValue = 1 * VAL_COLONY;
      const colScore = calcScore(colCost, colValue, false, false);
      if (colScore > 0) actions.push({ name: 'colony', score: colScore, fn: doBuyColony });
    }

    if (actions.length > 0) {
      actions.sort((a, b) => b.score - a.score);

      const armyTiers = ['squad_leader', 'barracks', 'military_base', 'kingdom'];
      const econTiers = ['farm', 'plantation', 'colony'];

      const best = actions[0];
      const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');

      const armyCosts = {
        'squad_leader': aiArmyCost(C.squadLeader_baseCost),
        'barracks': aiArmyCost(C.barracks_baseCost),
        'military_base': aiArmyCost(C.militaryBase_baseCost),
        'kingdom': aiArmyCost(C.kingdom_baseCost)
      };
      const econCosts = {
        'farm': aiFarmCost(),
        'plantation': aiPlantationCost(),
        'colony': aiColonyCost()
      };

      let bestCost = 0;
      if (bestIsBuilding) {
        bestCost = armyCosts[best.name] || econCosts[best.name] || 0;
      }
      const bestIsUnaffordable = bestIsBuilding && bestCost > coins;

      if (bestIsUnaffordable) {
        const bestArmyTier = armyTiers.indexOf(best.name);
        const bestEconTier = econTiers.indexOf(best.name);

        let acted = false;
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          if (a.name === 'train' || a.name === 'recruit') continue;
          const armyTier = armyTiers.indexOf(a.name);
          const econTier = econTiers.indexOf(a.name);
          if (bestArmyTier >= 0 && armyTier >= 0 && armyTier < bestArmyTier) continue;
          if (bestEconTier >= 0 && econTier >= 0 && econTier < bestEconTier) continue;
          if (a.fn()) { acted = true; break; }
        }
        if (acted) continue;

        const daysToReach = (bestCost - coins) / Math.max(incomePerDay, 1);
        const recruitCost = aiRecruitCost();
        const newIncomeWithRecruit = ((troopCount + ai.rp) * ppt * 4) + clicks;
        const daysWithRecruit = (bestCost - coins + recruitCost) / Math.max(newIncomeWithRecruit, 1);
        const recruitHelps = daysWithRecruit < daysToReach && !recruitCausesSuperEmergency() && ai.coins.gte(recruitCost);

        const trainCost = aiTrainCost();
        const newIncomeWithTrain = (troopCount * ppt * ai.trainMult * 4) + clicks;
        const daysWithTrain = (bestCost - coins + trainCost) / Math.max(newIncomeWithTrain, 1);
        const trainHelps = daysWithTrain < daysToReach && troopCount >= 5 && ai.coins.gte(trainCost);

        if (recruitHelps || trainHelps) {
          if (recruitHelps && trainHelps) {
            if (daysWithRecruit < daysWithTrain) {
              if (doRecruit()) continue;
            } else {
              if (doTrain()) continue;
            }
          } else if (recruitHelps) {
            if (doRecruit()) continue;
          } else {
            if (doTrain()) continue;
          }
        }
      } else {
        for (let i = 0; i < actions.length; i++) {
          if (actions[i].fn()) break;
        }
      }
    }

    ai.coins = ai.coins.add(1);
  }
}

// =============================================================================
// SIMULATION
// =============================================================================

function simDay(ai, clicks, enemyPower, runFn) {
  runFn(ai, clicks, enemyPower);

  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  const farmProd = getCount(ai, "farm") * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);

  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  if (starving) {
    ai.starvationStreak++;
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function runComparison(days, clicks) {
  const oldAI = createAIState();
  const newAI = createAIState();

  for (let day = 1; day <= days; day++) {
    const oldPower = oldAI.troops.toNumber() * oldAI.ppt;
    const newPower = newAI.troops.toNumber() * newAI.ppt;

    simDay(oldAI, clicks, newPower, runOldAI);
    simDay(newAI, clicks, oldPower, (ai, c, e) => {
      for (let i = 0; i < c; i++) runNewAI(ai, c, e);
    });
  }

  return { oldAI, newAI };
}

// =============================================================================
// MAIN
// =============================================================================

const days = parseInt(process.argv[2]) || 200;

console.log(`=== New AI vs Old AI (from HTML) - ${days} days ===\n`);

for (const cps of [10, 25]) {
  console.log(`--- ${cps} cps, ${days} days ---`);

  const { oldAI, newAI } = runComparison(days, cps);

  const oldPower = Math.floor(oldAI.troops.toNumber() * oldAI.ppt);
  const newPower = Math.floor(newAI.troops.toNumber() * newAI.ppt);

  console.log('OLD AI:');
  console.log(`  Power: ${oldPower}, Troops: ${oldAI.troops.toNumber()}, PPT: ${oldAI.ppt.toFixed(2)}`);
  console.log(`  SL=${getCount(oldAI, "squad_leader")}, Bar=${getCount(oldAI, "barracks")}, MB=${getCount(oldAI, "military_base")}, King=${getCount(oldAI, "kingdom")}`);
  console.log(`  Farms=${getCount(oldAI, "farm")}`);

  console.log('NEW AI:');
  console.log(`  Power: ${newPower}, Troops: ${newAI.troops.toNumber()}, PPT: ${newAI.ppt.toFixed(2)}`);
  console.log(`  SL=${getCount(newAI, "squad_leader")}, Bar=${getCount(newAI, "barracks")}, MB=${getCount(newAI, "military_base")}, King=${getCount(newAI, "kingdom")}`);
  console.log(`  Farms=${getCount(newAI, "farm")}`);

  const ratio = newPower / Math.max(oldPower, 1);
  console.log(`\nRatio: ${ratio.toFixed(2)}x (${ratio > 1 ? 'NEW wins' : 'OLD wins'})`);
  console.log('');
}
