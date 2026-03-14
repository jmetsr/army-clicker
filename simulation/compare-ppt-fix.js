#!/usr/bin/env node
/**
 * Compare PPT-Scaled AI vs Buggy AI
 *
 * Tests whether scaling building values with ppt helps or hurts AI performance.
 */

const { ON } = require('./ordinal');
const { C, PARAMS } = require('./constants');
const { createAIState } = require('./state');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, getFoodMetrics, wouldSpendingCauseEmergency,
        wouldRecruitCauseSuperEmergency, doesRecruitHelp, doesTrainHelp,
        calculateStrain, calculateCloseness } = require('./scoring');

// =============================================================================
// AI RUNNER (with ppt scaling parameter)
// =============================================================================

function runAIWithConfig(ai, clicks, enemyPower, usePptScaling, trainMult = 0.01) {
  const troopCount = ai.troops.toNumber();
  if (troopCount < 1) {
    if (ai.coins.gte(getRecruitCost(ai))) {
      recruit(ai);
    } else {
      beg(ai);
    }
    return;
  }

  const food = getFoodMetrics(ai, clicks);

  if (food.isEmergency) {
    if (ai.coins.gte(food.farmCost)) {
      buyFarm(ai);
    } else {
      beg(ai);
    }
    return;
  }

  const isAlmostEmergency = wouldRecruitCauseSuperEmergency(ai);

  const coins = ai.coins.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const strain = calculateStrain(ai);
  const closeness = calculateCloseness(myPower, enemyPower);
  const incomePerDay = food.incomePerDay;

  const actions = [];

  // PPT multiplier for buildings (the fix)
  const pptMult = usePptScaling ? ppt : 1;

  if (!isAlmostEmergency) {
    // TRAIN - already scales with ppt correctly
    if (troopCount >= 5) {
      const cost = getTrainCost(ai);
      const value = troopCount * ppt * trainMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, true, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

    // RECRUIT - already scales with ppt correctly
    {
      const cost = getRecruitCost(ai);
      const value = ai.rp * ppt;
      let score = calcScore(cost, value, coins, incomePerDay, true, true, closeness, strain);
      const newStrain = food.farmProd > 0 ? (troopCount + ai.rp) / (food.farmProd / C.food_perTroopDay) : 1;
      if (newStrain > 0.9) {
        score -= (newStrain - 0.9) * 5;
      }
      if (score > 0) {
        actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }
    }

    // ARMY BUILDINGS - apply pptMult fix
    if (troopCount >= 2) {
      const cost = getSLCost(ai);
      const value = ai.squadLeaderPower * PARAMS.VAL_SL * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'sl', score, cost, fn: () => buySL(ai) });
      }
    }

    if (getCount(ai, "squad_leader") >= 3) {
      const cost = getBarracksCost(ai);
      const value = ai.barracksPower * PARAMS.VAL_BARRACKS * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }
    }

    if (getCount(ai, "barracks") >= 3) {
      const cost = getMBCost(ai);
      const value = ai.militaryBasePower * PARAMS.VAL_MB * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'mb', score, cost, fn: () => buyMB(ai) });
      }
    }

    if (getCount(ai, "military_base") >= 3) {
      const cost = getKingdomCost(ai);
      const value = ai.kingdomPower * PARAMS.VAL_KINGDOM * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }
    }
  }

  // ECONOMY BUILDINGS - apply pptMult fix
  {
    const cost = getFarmCost(ai);
    const value = ai.fp * PARAMS.VAL_FARM * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * PARAMS.VAL_PLANTATION * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * PARAMS.VAL_COLONY * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'colony', score, cost, fn: () => buyColony(ai) });
    }
  }

  // Execute best action
  if (actions.length === 0) {
    beg(ai);
    return;
  }

  actions.sort((a, b) => b.score - a.score);

  const best = actions[0];
  const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
  const bestIsUnaffordable = bestIsBuilding && best.cost > coins;

  if (bestIsUnaffordable) {
    if (isAlmostEmergency) {
      const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);
      if (trainHelps) {
        train(ai);
        return;
      }
      beg(ai);
      return;
    }

    const bestIsEconomy = (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');
    const recruitHelps = !bestIsEconomy && doesRecruitHelp(ai, best.cost, coins, incomePerDay, clicks);
    const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);

    if (recruitHelps || trainHelps) {
      if (recruitHelps && trainHelps) {
        const recruitCost = getRecruitCost(ai);
        const trainCost = getTrainCost(ai);
        const newIncomeRecruit = ((troopCount + ai.rp) * ppt * 4) + clicks;
        const newIncomeTrain = (troopCount * ppt * ai.trainMult * 4) + clicks;
        const daysRecruit = (best.cost - coins + recruitCost) / newIncomeRecruit;
        const daysTrain = (best.cost - coins + trainCost) / newIncomeTrain;

        if (daysRecruit < daysTrain) {
          recruit(ai);
        } else {
          train(ai);
        }
      } else if (recruitHelps) {
        recruit(ai);
      } else {
        train(ai);
      }
      return;
    }

    beg(ai);

  } else {
    for (const action of actions) {
      if (action.name !== 'farm' && wouldSpendingCauseEmergency(ai, action.cost, clicks)) {
        continue;
      }
      if (action.fn()) return;
    }
    beg(ai);
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

function runComparison(days, clicks, fixedTrainMult = 0.01) {
  const buggyAI = createAIState();
  const fixedAI = createAIState();

  for (let day = 1; day <= days; day++) {
    const buggyPower = buggyAI.troops.toNumber() * buggyAI.ppt;
    const fixedPower = fixedAI.troops.toNumber() * fixedAI.ppt;

    // Buggy AI (no ppt scaling, trainMult = 0.01)
    simDay(buggyAI, clicks, fixedPower, (ai, c, e) => {
      for (let i = 0; i < c; i++) runAIWithConfig(ai, c, e, false, 0.01);
    });

    // Fixed AI (with ppt scaling, adjustable trainMult)
    simDay(fixedAI, clicks, buggyPower, (ai, c, e) => {
      for (let i = 0; i < c; i++) runAIWithConfig(ai, c, e, true, fixedTrainMult);
    });
  }

  return { buggyAI, fixedAI };
}

// =============================================================================
// MAIN
// =============================================================================

const days = parseInt(process.argv[2]) || 500;

console.log(`=== PPT Scaling Fix Test - ${days} days ===\n`);
console.log('BUGGY = building values use fixed constants (trainMult=0.01)');
console.log('FIXED = building values scale with ppt (trainMult varies)\n');

// Test different trainMult values for the fixed AI
const trainMults = [0.01, 0.012, 0.014, 0.015, 0.016, 0.018, 0.02];

for (const cps of [8, 25]) {
  console.log(`\n========== ${cps} CPS ==========`);

  for (const trainMult of trainMults) {
    const { buggyAI, fixedAI } = runComparison(days, cps, trainMult);

    const buggyPower = Math.floor(buggyAI.troops.toNumber() * buggyAI.ppt);
    const fixedPower = Math.floor(fixedAI.troops.toNumber() * fixedAI.ppt);

    const ratio = fixedPower / Math.max(buggyPower, 1);
    const winner = ratio > 1 ? 'FIXED' : ratio < 1 ? 'BUGGY' : 'TIE';

    console.log(`trainMult=${trainMult}: FIXED ${fixedPower.toExponential(2)} vs BUGGY ${buggyPower.toExponential(2)} = ${ratio.toFixed(3)}x (${winner})`);
    console.log(`  FIXED: Trains=${getCount(fixedAI, "train")}, SL=${getCount(fixedAI, "squad_leader")}, Bar=${getCount(fixedAI, "barracks")}`);
  }
}
