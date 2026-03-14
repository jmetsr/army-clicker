#!/usr/bin/env node
/**
 * Compare different trainMult values with detailed breakdowns at various days
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
// AI RUNNER (with ppt scaling and trainMult parameter)
// =============================================================================

function runAIWithConfig(ai, clicks, enemyPower, usePptScaling, trainMult) {
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
  const pptMult = usePptScaling ? ppt : 1;

  if (!isAlmostEmergency) {
    if (troopCount >= 5) {
      const cost = getTrainCost(ai);
      const value = troopCount * ppt * trainMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, true, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

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

  const econPptMult = usePptScaling ? ppt : 1;

  {
    const cost = getFarmCost(ai);
    const value = ai.fp * PARAMS.VAL_FARM * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * PARAMS.VAL_PLANTATION * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * PARAMS.VAL_COLONY * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'colony', score, cost, fn: () => buyColony(ai) });
    }
  }

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

function getSnapshot(ai) {
  return {
    power: Math.floor(ai.troops.toNumber() * ai.ppt),
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    trains: getCount(ai, "train"),
    sl: getCount(ai, "squad_leader"),
    bar: getCount(ai, "barracks"),
    mb: getCount(ai, "military_base"),
    king: getCount(ai, "kingdom"),
    farms: getCount(ai, "farm"),
    plant: getCount(ai, "plantation"),
    colony: getCount(ai, "colony"),
  };
}

function runSimulation(maxDays, clicks, usePptScaling, trainMult, checkpoints) {
  const ai = createAIState();
  const snapshots = {};

  for (let day = 1; day <= maxDays; day++) {
    simDay(ai, clicks, 0, (a, c, e) => {
      for (let i = 0; i < c; i++) runAIWithConfig(a, c, e, usePptScaling, trainMult);
    });

    if (checkpoints.includes(day)) {
      snapshots[day] = getSnapshot(ai);
    }
  }

  return snapshots;
}

// =============================================================================
// MAIN
// =============================================================================

const checkpoints = [50, 100, 150, 200, 300, 400];
const trainMults = [0.05, 0.1, 0.15, 0.2, 0.25];
const cpsValues = [25];

// Run all simulations for all CPS values
const allResults = {};
for (const cps of cpsValues) {
  allResults[cps] = {};

  // Run buggy version (no ppt scaling, trainMult=0.01)
  allResults[cps]['BUGGY'] = runSimulation(400, cps, false, 0.01, checkpoints);

  // Run fixed versions with different trainMults
  for (const tm of trainMults) {
    allResults[cps][tm] = runSimulation(400, cps, true, tm, checkpoints);
  }
}

// Print tables for each CPS
for (const cps of cpsValues) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${cps} CPS - BUGGY (no ppt scaling) vs FIXED (ppt scaling, various trainMult)`);
  console.log(`${'='.repeat(80)}`);

  const results = allResults[cps];
  const allKeys = ['BUGGY', ...trainMults];

  for (const day of checkpoints) {
    console.log(`\n----- DAY ${day} -----`);
    console.log('┌───────────┬────────────┬─────────┬────────┬───────┬───────┬─────┬──────┬───────┬───────┬────────┐');
    console.log('│  Strategy │   Power    │  Troops │   PPT  │ Train │  SL   │ Bar │  MB  │ King  │ Farms │ Plant  │');
    console.log('├───────────┼────────────┼─────────┼────────┼───────┼───────┼─────┼──────┼───────┼───────┼────────┤');

    for (const key of allKeys) {
      const s = results[key][day];
      const powerStr = s.power.toExponential(2).padStart(10);
      const troopsStr = s.troops.toString().padStart(7);
      const pptStr = s.ppt.toFixed(1).padStart(6);
      const trainStr = s.trains.toString().padStart(5);
      const slStr = s.sl.toString().padStart(5);
      const barStr = s.bar.toString().padStart(3);
      const mbStr = s.mb.toString().padStart(4);
      const kingStr = s.king.toString().padStart(5);
      const farmStr = s.farms.toString().padStart(5);
      const plantStr = s.plant.toString().padStart(6);

      let label;
      if (key === 'BUGGY') {
        label = '   BUGGY  ';
      } else {
        label = `FIX ${key.toFixed(3)}`;
      }

      console.log(`│${label} │ ${powerStr} │ ${troopsStr} │ ${pptStr} │ ${trainStr} │ ${slStr} │ ${barStr} │ ${mbStr} │ ${kingStr} │ ${farmStr} │ ${plantStr} │`);
    }
    console.log('└───────────┴────────────┴─────────┴────────┴───────┴───────┴─────┴──────┴───────┴───────┴────────┘');
  }

  // Summary for this CPS
  console.log(`\n----- POWER RANKINGS (${cps} CPS) -----`);
  for (const day of checkpoints) {
    const sorted = allKeys
      .map(key => ({ key, power: results[key][day].power }))
      .sort((a, b) => b.power - a.power);

    const best = sorted[0];
    const buggyPower = results['BUGGY'][day].power;
    const bestLabel = best.key === 'BUGGY' ? 'BUGGY' : `FIX ${best.key}`;
    const vsBuggy = best.key === 'BUGGY' ? '' : ` (${(best.power / buggyPower).toFixed(2)}x vs BUGGY)`;

    console.log(`Day ${day.toString().padStart(3)}: Best = ${bestLabel} (${best.power.toExponential(2)})${vsBuggy}`);
  }
}
