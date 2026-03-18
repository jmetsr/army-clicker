#!/usr/bin/env node
/**
 * Compare different VAL_SL values
 *
 * All other values are derived from VAL_SL:
 * - VAL_FARM = 0.4 * VAL_SL
 * - VAL_PLANTATION = 10 * VAL_FARM
 * - VAL_COLONY = 10 * VAL_PLANTATION
 * - VAL_BARRACKS = 10 * VAL_SL
 * - VAL_MB = 10 * VAL_BARRACKS
 * - VAL_KINGDOM = 10 * VAL_MB
 * - VAL_EMPIRE = 10 * VAL_KINGDOM
 */

const { ON } = require('./ordinal');
const { C } = require('./constants');
const { createAIState } = require('./state');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost, getEmpireCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom, buyEmpire,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, getFoodMetrics, wouldSpendingCauseEmergency,
        wouldRecruitCauseSuperEmergency, doesRecruitHelp, doesTrainHelp,
        calculateStrain, calculateCloseness } = require('./scoring');

// =============================================================================
// AI RUNNER with configurable VAL_SL
// =============================================================================

function runAIWithConfig(ai, clicks, enemyPower, valSL, farmThreshold, trainMultParam) {
  // Derive all values from VAL_SL
  const VAL_SL = valSL;
  const VAL_BARRACKS = 10 * VAL_SL;
  const VAL_MB = 10 * VAL_BARRACKS;
  const VAL_KINGDOM = 10 * VAL_MB;
  const VAL_EMPIRE = 10 * VAL_KINGDOM;

  // Farm value based on urgency
  const FARM_THRESHOLD = farmThreshold;
  const troopCount = ai.troops.toNumber();
  const foodBuffer = ai.food.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const netConsume = (troopCount * C.food_perTroopDay) - farmProd;

  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
  const urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);

  const VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
  const VAL_PLANTATION = 10 * VAL_FARM;
  const VAL_COLONY = 10 * VAL_PLANTATION;

  const trainMult = trainMultParam;
  const usePptScaling = true;

  // Scoring modifiers (fixed)
  const NO_INFLATE_BONUS = 1.2;
  const K_STRAIN = 2.0;
  const WAIT_DECAY = 0.99;

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

  // Custom calcScore that uses our parameters
  function scoreAction(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;
    const currentCoins = Math.max(coins, 1);
    const costPct = cost / currentCoins;
    const penalty = Math.sqrt(costPct);
    let baseScore = value / penalty;

    if (costPct > 1) {
      const coinsNeeded = cost - currentCoins;
      const daysToWait = coinsNeeded / Math.max(incomePerDay, 1);
      baseScore *= Math.pow(WAIT_DECAY, daysToWait);
    }

    if (isImmediate) baseScore *= NO_INFLATE_BONUS;
    // Removed strain bonus - farm value now captures urgency directly

    return baseScore;
  }

  if (!isAlmostEmergency) {
    if (troopCount >= 5) {
      const cost = getTrainCost(ai);
      const value = troopCount * ppt * trainMult;
      const score = scoreAction(cost, value, true, true);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

    {
      const cost = getRecruitCost(ai);
      const value = ai.rp * ppt;
      let score = scoreAction(cost, value, true, true);
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
      const value = ai.squadLeaderPower * VAL_SL * pptMult;
      const score = scoreAction(cost, value, true, false);
      if (score > 0) {
        actions.push({ name: 'sl', score, cost, fn: () => buySL(ai) });
      }
    }

    if (getCount(ai, "squad_leader") >= 3) {
      const cost = getBarracksCost(ai);
      const value = ai.barracksPower * VAL_BARRACKS * pptMult;
      const score = scoreAction(cost, value, true, false);
      if (score > 0) {
        actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }
    }

    if (getCount(ai, "barracks") >= 3) {
      const cost = getMBCost(ai);
      const value = ai.militaryBasePower * VAL_MB * pptMult;
      const score = scoreAction(cost, value, true, false);
      if (score > 0) {
        actions.push({ name: 'mb', score, cost, fn: () => buyMB(ai) });
      }
    }

    if (getCount(ai, "military_base") >= 3) {
      const cost = getKingdomCost(ai);
      const value = ai.kingdomPower * VAL_KINGDOM * pptMult;
      const score = scoreAction(cost, value, true, false);
      if (score > 0) {
        actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }
    }

    if (getCount(ai, "kingdom") >= 3) {
      const cost = getEmpireCost(ai);
      const value = ai.empirePower * VAL_EMPIRE * pptMult;
      const score = scoreAction(cost, value, true, false);
      if (score > 0) {
        actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }
  }

  // Economy actions
  {
    const cost = getFarmCost(ai);
    const value = ai.fp * VAL_FARM * pptMult;
    const score = scoreAction(cost, value, false, false);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * VAL_PLANTATION * pptMult;
    const score = scoreAction(cost, value, false, false);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * VAL_COLONY * pptMult;
    const score = scoreAction(cost, value, false, false);
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

function simDay(ai, clicks, enemyPower, valSL, farmThreshold, trainMultParam, stats) {
  runAIWithConfig(ai, clicks, enemyPower, valSL, farmThreshold, trainMultParam);

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
    stats.starveDays++;
    ai.starvationStreak++;
    if (ai.starvationStreak > stats.maxStreak) {
      stats.maxStreak = ai.starvationStreak;
    }
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function getSnapshot(ai, stats) {
  return {
    power: Math.floor(ai.troops.toNumber() * ai.ppt),
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    trains: getCount(ai, "train"),
    sl: getCount(ai, "squad_leader"),
    bar: getCount(ai, "barracks"),
    mb: getCount(ai, "military_base"),
    king: getCount(ai, "kingdom"),
    empire: getCount(ai, "empire"),
    farms: getCount(ai, "farm"),
    plant: getCount(ai, "plantation"),
    colony: getCount(ai, "colony"),
    starveDays: stats.starveDays,
    maxStreak: stats.maxStreak,
  };
}

function runSimulation(maxDays, clicks, valSL, farmThreshold, trainMultParam, checkpoints) {
  const ai = createAIState();
  const stats = { starveDays: 0, maxStreak: 0 };
  const snapshots = {};

  for (let day = 1; day <= maxDays; day++) {
    for (let i = 0; i < clicks; i++) {
      simDay(ai, clicks, 0, valSL, farmThreshold, trainMultParam, stats);
    }

    if (checkpoints.includes(day)) {
      snapshots[day] = getSnapshot(ai, stats);
    }
  }

  return snapshots;
}

// =============================================================================
// MAIN
// =============================================================================

const fs = require('fs');

const checkpoints = [100, 200, 300, 400, 500];
const VAL_SL_FIXED = 5;
const FARM_THRESHOLD_FIXED = 6;
const trainMults = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 1, 2, 5, 10, 20];
const clicks = 25;

// Run all simulations
const allResults = {};
for (const tm of trainMults) {
  console.log(`Running trainMult=${tm}...`);
  allResults[tm] = runSimulation(500, clicks, VAL_SL_FIXED, FARM_THRESHOLD_FIXED, tm, checkpoints);
}

// Generate HTML
let html = `<!DOCTYPE html>
<html>
<head>
  <title>TrainMult Comparison</title>
  <style>
    body {
      font-family: 'Consolas', 'Monaco', monospace;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
      max-width: 1600px;
      margin: 0 auto;
    }
    h1 { color: #00d4ff; text-align: center; }
    h2 { color: #ff6b6b; margin-top: 40px; border-bottom: 2px solid #ff6b6b; padding-bottom: 10px; }
    h3 { color: #ffd93d; margin-top: 30px; }
    .config {
      background: #2d2d44;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .config p { margin: 5px 0; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 15px 0;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #444;
      padding: 8px 12px;
      text-align: right;
    }
    th {
      background: #2d2d44;
      color: #00d4ff;
    }
    td:first-child {
      text-align: left;
      font-weight: bold;
    }
    tr:nth-child(even) { background: #252538; }
    tr:nth-child(odd) { background: #1e1e30; }
    tr:hover { background: #3a3a55; }
    .winner { background: #1a4a1a !important; }
    .broken { background: #4a1a1a !important; color: #ff6b6b; }
    .starving { background: #4a3a1a !important; }
    .summary {
      background: #2d2d44;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .summary table { margin: 0; }
    .summary th { background: #3d3d55; }
  </style>
</head>
<body>
  <h1>TrainMult Comparison</h1>

  <div class="config">
    <p><strong>Configuration:</strong></p>
    <p>VAL_SL = ${VAL_SL_FIXED} (fixed)</p>
    <p>FARM_THRESHOLD = ${FARM_THRESHOLD_FIXED} (fixed)</p>
    <p>pptScaling = true</p>
    <p>CPS = ${clicks}</p>
    <p><strong>Formula:</strong></p>
    <p>trainValue = troops × ppt × trainMult</p>
  </div>
`;

for (const day of checkpoints) {
  // Find winner for this day
  let maxPower = 0;
  let winnerTM = null;
  for (const tm of trainMults) {
    if (allResults[tm][day].power > maxPower) {
      maxPower = allResults[tm][day].power;
      winnerTM = tm;
    }
  }

  html += `
  <h2>Day ${day}</h2>
  <table>
    <tr>
      <th>trainMult</th>
      <th>Power</th>
      <th>Troops</th>
      <th>PPT</th>
      <th>Train</th>
      <th>SL</th>
      <th>Bar</th>
      <th>MB</th>
      <th>King</th>
      <th>Emp</th>
      <th>Farms</th>
      <th>Plant</th>
      <th>Col</th>
      <th>Starve Days</th>
      <th>Max Streak</th>
    </tr>
`;

  for (const tm of trainMults) {
    const s = allResults[tm][day];
    const isBroken = s.troops <= 1 && s.sl === 0;
    const isStarving = s.maxStreak >= 3;
    const isWinner = tm === winnerTM && !isBroken;

    let rowClass = '';
    if (isBroken) rowClass = 'broken';
    else if (isWinner) rowClass = 'winner';
    else if (isStarving) rowClass = 'starving';

    html += `    <tr class="${rowClass}">
      <td>${tm}</td>
      <td>${s.power.toExponential(2)}</td>
      <td>${s.troops.toLocaleString()}</td>
      <td>${s.ppt.toFixed(1)}</td>
      <td>${s.trains}</td>
      <td>${s.sl.toLocaleString()}</td>
      <td>${s.bar}</td>
      <td>${s.mb}</td>
      <td>${s.king}</td>
      <td>${s.empire}</td>
      <td>${s.farms.toLocaleString()}</td>
      <td>${s.plant}</td>
      <td>${s.colony}</td>
      <td>${s.starveDays}</td>
      <td>${s.maxStreak}</td>
    </tr>
`;
  }

  html += `  </table>
`;
}

// Summary
html += `
  <h2>Power Rankings Summary</h2>
  <div class="summary">
    <table>
      <tr><th>Day</th><th>Winner</th><th>Power</th></tr>
`;

for (const day of checkpoints) {
  const sorted = trainMults
    .map(tm => ({ trainMult: tm, power: allResults[tm][day].power }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  html += `      <tr><td>${day}</td><td>trainMult=${best.trainMult}</td><td>${best.power.toExponential(2)}</td></tr>
`;
}

html += `    </table>
  </div>

  <div class="summary">
    <h3>Legend</h3>
    <p><span style="background: #1a4a1a; padding: 2px 8px;">Green</span> = Winner for that day</p>
    <p><span style="background: #4a1a1a; padding: 2px 8px;">Red</span> = Broken (stuck at 1 troop)</p>
    <p><span style="background: #4a3a1a; padding: 2px 8px;">Orange</span> = Starving (max streak >= 3 days)</p>
  </div>

</body>
</html>
`;

// Write HTML file
fs.writeFileSync('trainmult-comparison.html', html);
console.log('\nSaved to trainmult-comparison.html');

// Also print summary to console
console.log(`\n----- POWER RANKINGS -----`);
for (const day of checkpoints) {
  const sorted = trainMults
    .map(tm => ({ trainMult: tm, power: allResults[tm][day].power }))
    .sort((a, b) => b.power - a.power);

  const best = sorted[0];
  console.log(`Day ${day.toString().padStart(3)}: Best = trainMult=${best.trainMult} (${best.power.toExponential(2)})`);
}
