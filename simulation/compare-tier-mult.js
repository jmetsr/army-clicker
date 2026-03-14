#!/usr/bin/env node
/**
 * Compare different tier multipliers (how much more valuable each tier is vs previous)
 * Currently 10x - testing 3,5,10,20,50,100,150,200,500,1000
 */

const fs = require('fs');
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
// AI RUNNER with configurable tier multiplier
// =============================================================================

function runAIWithConfig(ai, clicks, enemyPower, tierMult) {
  const VAL_SL = 5;
  const FARM_THRESHOLD = 6;
  const trainMult = 0.01;
  const usePptScaling = true;

  // Building values with configurable tier multiplier
  const VAL_BARRACKS = tierMult * VAL_SL;
  const VAL_MB = tierMult * VAL_BARRACKS;
  const VAL_KINGDOM = tierMult * VAL_MB;
  const VAL_EMPIRE = tierMult * VAL_KINGDOM;

  // Farm value based on urgency
  const troopCount = ai.troops.toNumber();
  const foodBuffer = ai.food.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const netConsume = (troopCount * C.food_perTroopDay) - farmProd;

  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
  const urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);

  const VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
  const VAL_PLANTATION = tierMult * VAL_FARM;
  const VAL_COLONY = tierMult * VAL_PLANTATION;

  // Scoring modifiers
  const NO_INFLATE_BONUS = 1.2;
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

  const closeness = calculateCloseness(myPower, enemyPower);
  const incomePerDay = food.incomePerDay;

  const actions = [];
  const pptMult = usePptScaling ? ppt : 1;

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

function processEndOfDay(ai, stats) {
  // Passive loot (once per day)
  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  // Food production and consumption (once per day)
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);

  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  // Starvation (once per day)
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

function runSimulation(maxDays, clicks, tierMult, checkpoints) {
  const ai = createAIState();
  const stats = { starveDays: 0, maxStreak: 0 };
  const snapshots = {};

  for (let day = 1; day <= maxDays; day++) {
    // AI takes multiple actions per day (urgency recalculated each click)
    for (let i = 0; i < clicks; i++) {
      runAIWithConfig(ai, clicks, 0, tierMult);
    }

    // End of day: loot, food, starvation (once per day)
    processEndOfDay(ai, stats);

    if (checkpoints.includes(day)) {
      snapshots[day] = getSnapshot(ai, stats);
    }
  }

  return snapshots;
}

// =============================================================================
// MAIN
// =============================================================================

const checkpoints = [100, 200, 300, 400, 500];
const tierMults = [3, 5, 10, 20, 50, 100, 150, 200, 500, 1000];
const clicks = 25;

// Run all simulations
const allResults = {};
for (const tm of tierMults) {
  console.log(`Running tierMult=${tm}...`);
  allResults[tm] = runSimulation(500, clicks, tm, checkpoints);
}

// Generate HTML
let html = `<!DOCTYPE html>
<html>
<head>
  <title>Tier Multiplier Comparison</title>
  <style>
    body {
      font-family: 'Consolas', 'Monaco', monospace;
      background: #1a1a2e;
      color: #eee;
      padding: 20px;
      max-width: 1800px;
      margin: 0 auto;
    }
    h1 { color: #00d4ff; text-align: center; }
    h2 { color: #ff6b6b; margin-top: 40px; border-bottom: 2px solid #ff6b6b; padding-bottom: 10px; }
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
      font-size: 13px;
    }
    th, td {
      border: 1px solid #444;
      padding: 6px 10px;
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
    .summary {
      background: #2d2d44;
      padding: 15px;
      border-radius: 8px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <h1>Tier Multiplier Comparison</h1>

  <div class="config">
    <p><strong>Fixed:</strong> VAL_SL=5, FARM_THRESHOLD=6, trainMult=0.01, CPS=25</p>
    <p><strong>Testing:</strong> How much more valuable is each tier vs previous?</p>
    <p>VAL_BARRACKS = tierMult × VAL_SL</p>
    <p>VAL_MB = tierMult × VAL_BARRACKS</p>
    <p>VAL_KINGDOM = tierMult × VAL_MB</p>
    <p>etc.</p>
  </div>
`;

for (const day of checkpoints) {
  let maxPower = 0;
  let winnerTM = null;
  for (const tm of tierMults) {
    if (allResults[tm][day].power > maxPower) {
      maxPower = allResults[tm][day].power;
      winnerTM = tm;
    }
  }

  html += `
  <h2>Day ${day}</h2>
  <table>
    <tr>
      <th>TierMult</th>
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
      <th>Starve</th>
    </tr>
`;

  for (const tm of tierMults) {
    const s = allResults[tm][day];
    const isWinner = tm === winnerTM;

    html += `    <tr class="${isWinner ? 'winner' : ''}">
      <td>${tm}x</td>
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
  const sorted = tierMults
    .map(tm => ({ tierMult: tm, power: allResults[tm][day].power }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  html += `      <tr><td>${day}</td><td>${best.tierMult}x</td><td>${best.power.toExponential(2)}</td></tr>
`;
}

html += `    </table>
  </div>

</body>
</html>
`;

// Write HTML file
fs.writeFileSync('tier-mult-comparison.html', html);
console.log('\nSaved to tier-mult-comparison.html');

// Console summary
console.log(`\n----- POWER RANKINGS -----`);
for (const day of checkpoints) {
  const sorted = tierMults
    .map(tm => ({ tierMult: tm, power: allResults[tm][day].power }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  console.log(`Day ${day.toString().padStart(3)}: Best = ${best.tierMult}x (${best.power.toExponential(2)})`);
}
