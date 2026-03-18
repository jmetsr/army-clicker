#!/usr/bin/env node
/**
 * Compare different "helps" strategies for affording high-tier buildings
 *
 * Strategies:
 * 1. baseline: just train + recruit helps
 * 2. +SL: also check if SL helps
 * 3. +Barracks: also check if Barracks helps
 * 4. +MB: also check if MB helps
 * 5. +Kingdom: also check if Kingdom helps
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
const { getFoodMetrics, wouldSpendingCauseEmergency,
        wouldRecruitCauseSuperEmergency, doesRecruitHelp, doesTrainHelp } = require('./scoring');

// =============================================================================
// HELPER FUNCTIONS - does buying X help afford target faster?
// =============================================================================

function doesSLHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Above RP=25, SL is counterproductive (4% cost increase > RP boost)
  if (ai.rp >= 25) return false;

  // SL only helps if we'll actually recruit
  if (!doesRecruitHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;

  const slCost = getSLCost(ai);
  if (ai.coins.lt(slCost)) return false;

  return true;
}

function doesBarracksHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Above squadLeaderPower=25, Barracks is counterproductive
  if (ai.squadLeaderPower >= 25) return false;

  // Barracks only helps if SL helps (chain dependency)
  if (!doesSLHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;

  const cost = getBarracksCost(ai);
  if (ai.coins.lt(cost)) return false;

  // Must have unlocked barracks
  if (getCount(ai, "squad_leader") < 3) return false;

  return true;
}

function doesMBHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Above barracksPower=25, MB is counterproductive
  if (ai.barracksPower >= 25) return false;

  // MB only helps if Barracks helps
  if (!doesBarracksHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;

  const cost = getMBCost(ai);
  if (ai.coins.lt(cost)) return false;

  // Must have unlocked MB
  if (getCount(ai, "barracks") < 3) return false;

  return true;
}

function doesKingdomHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Above militaryBasePower=25, Kingdom is counterproductive
  if (ai.militaryBasePower >= 25) return false;

  // Kingdom only helps if MB helps
  if (!doesMBHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;

  const cost = getKingdomCost(ai);
  if (ai.coins.lt(cost)) return false;

  // Must have unlocked Kingdom
  if (getCount(ai, "military_base") < 3) return false;

  return true;
}

// =============================================================================
// AI RUNNER with configurable helper level
// =============================================================================

// Helper levels:
// 0 = baseline (train + recruit only)
// 1 = +SL
// 2 = +Barracks
// 3 = +MB
// 4 = +Kingdom

function runAIWithConfig(ai, clicks, enemyPower, helperLevel) {
  const tierMult = 20;
  const VAL_SL = 5;
  const FARM_THRESHOLD = 6;
  const trainMult = 0.01;
  const usePptScaling = true;

  // Building values with tier multiplier
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
  const incomePerDay = food.incomePerDay;

  const actions = [];
  const pptMult = usePptScaling ? ppt : 1;

  function scoreAction(cost, value, isImmediate) {
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
      const score = scoreAction(cost, value, true);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

    {
      const cost = getRecruitCost(ai);
      const value = ai.rp * ppt;
      let score = scoreAction(cost, value, true);
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
      const score = scoreAction(cost, value, false);
      if (score > 0) {
        actions.push({ name: 'sl', score, cost, fn: () => buySL(ai) });
      }
    }

    if (getCount(ai, "squad_leader") >= 3) {
      const cost = getBarracksCost(ai);
      const value = ai.barracksPower * VAL_BARRACKS * pptMult;
      const score = scoreAction(cost, value, false);
      if (score > 0) {
        actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }
    }

    if (getCount(ai, "barracks") >= 3) {
      const cost = getMBCost(ai);
      const value = ai.militaryBasePower * VAL_MB * pptMult;
      const score = scoreAction(cost, value, false);
      if (score > 0) {
        actions.push({ name: 'mb', score, cost, fn: () => buyMB(ai) });
      }
    }

    if (getCount(ai, "military_base") >= 3) {
      const cost = getKingdomCost(ai);
      const value = ai.kingdomPower * VAL_KINGDOM * pptMult;
      const score = scoreAction(cost, value, false);
      if (score > 0) {
        actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }
    }

    if (getCount(ai, "kingdom") >= 3) {
      const cost = getEmpireCost(ai);
      const value = ai.empirePower * VAL_EMPIRE * pptMult;
      const score = scoreAction(cost, value, false);
      if (score > 0) {
        actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }
  }

  // Economy actions
  {
    const cost = getFarmCost(ai);
    const value = ai.fp * VAL_FARM * pptMult;
    const score = scoreAction(cost, value, false);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * VAL_PLANTATION * pptMult;
    const score = scoreAction(cost, value, false);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * VAL_COLONY * pptMult;
    const score = scoreAction(cost, value, false);
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

    // For economy buildings, just use train helps
    if (bestIsEconomy) {
      const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);
      if (trainHelps) {
        train(ai);
        return;
      }
      beg(ai);
      return;
    }

    // For military buildings, use helper chain based on helperLevel
    const recruitHelps = doesRecruitHelp(ai, best.cost, coins, incomePerDay, clicks);
    const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);

    // Check helper chain based on level
    const slHelps = helperLevel >= 1 && doesSLHelp(ai, best.cost, coins, incomePerDay, clicks);
    const barracksHelps = helperLevel >= 2 && doesBarracksHelp(ai, best.cost, coins, incomePerDay, clicks);
    const mbHelps = helperLevel >= 3 && doesMBHelp(ai, best.cost, coins, incomePerDay, clicks);
    const kingdomHelps = helperLevel >= 4 && doesKingdomHelp(ai, best.cost, coins, incomePerDay, clicks);

    // Buy highest tier that helps (most efficient)
    if (kingdomHelps) {
      buyKingdom(ai);
      return;
    }
    if (mbHelps) {
      buyMB(ai);
      return;
    }
    if (barracksHelps) {
      buyBarracks(ai);
      return;
    }
    if (slHelps) {
      buySL(ai);
      return;
    }
    if (recruitHelps) {
      recruit(ai);
      return;
    }
    if (trainHelps) {
      train(ai);
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
    rp: ai.rp,
    slPower: ai.squadLeaderPower,
    barPower: ai.barracksPower,
    mbPower: ai.militaryBasePower,
    kingPower: ai.kingdomPower,
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

function runSimulation(maxDays, clicks, helperLevel, checkpoints) {
  const ai = createAIState();
  const stats = { starveDays: 0, maxStreak: 0 };
  const snapshots = {};

  for (let day = 1; day <= maxDays; day++) {
    for (let i = 0; i < clicks; i++) {
      runAIWithConfig(ai, clicks, 0, helperLevel);
    }

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
const helperLevels = [
  { level: 0, name: 'baseline (train+recruit)' },
  { level: 1, name: '+SL helps' },
  { level: 2, name: '+Barracks helps' },
  { level: 3, name: '+MB helps' },
  { level: 4, name: '+Kingdom helps' },
];
const clicks = 25;

// Run all simulations
const allResults = {};
for (const h of helperLevels) {
  console.log(`Running ${h.name}...`);
  allResults[h.level] = runSimulation(500, clicks, h.level, checkpoints);
}

// Generate HTML
let html = `<!DOCTYPE html>
<html>
<head>
  <title>Helper Strategy Comparison</title>
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
      font-size: 12px;
    }
    th, td {
      border: 1px solid #444;
      padding: 5px 8px;
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
  <h1>Helper Strategy Comparison</h1>

  <div class="config">
    <p><strong>Fixed:</strong> tierMult=20, VAL_SL=5, FARM_THRESHOLD=6, trainMult=0.01, CPS=25</p>
    <p><strong>Testing:</strong> What "helps" functions to use when waiting for unaffordable military buildings</p>
    <p><strong>Logic:</strong> SL helps if RP &lt; 25 (4% breakeven), Barracks helps if SL power &lt; 25, etc.</p>
  </div>
`;

for (const day of checkpoints) {
  let maxPower = 0;
  let winnerLevel = null;
  for (const h of helperLevels) {
    if (allResults[h.level][day].power > maxPower) {
      maxPower = allResults[h.level][day].power;
      winnerLevel = h.level;
    }
  }

  html += `
  <h2>Day ${day}</h2>
  <table>
    <tr>
      <th>Strategy</th>
      <th>Power</th>
      <th>Troops</th>
      <th>PPT</th>
      <th>RP</th>
      <th>SL Pwr</th>
      <th>Bar Pwr</th>
      <th>MB Pwr</th>
      <th>Train</th>
      <th>SL</th>
      <th>Bar</th>
      <th>MB</th>
      <th>King</th>
      <th>Emp</th>
      <th>Farms</th>
      <th>Starve</th>
    </tr>
`;

  for (const h of helperLevels) {
    const s = allResults[h.level][day];
    const isWinner = h.level === winnerLevel;

    html += `    <tr class="${isWinner ? 'winner' : ''}">
      <td>${h.name}</td>
      <td>${s.power.toExponential(2)}</td>
      <td>${s.troops.toLocaleString()}</td>
      <td>${s.ppt.toFixed(1)}</td>
      <td>${s.rp.toFixed(1)}</td>
      <td>${s.slPower.toFixed(2)}</td>
      <td>${s.barPower.toFixed(2)}</td>
      <td>${s.mbPower.toFixed(2)}</td>
      <td>${s.trains}</td>
      <td>${s.sl.toLocaleString()}</td>
      <td>${s.bar}</td>
      <td>${s.mb}</td>
      <td>${s.king}</td>
      <td>${s.empire}</td>
      <td>${s.farms.toLocaleString()}</td>
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
      <tr><th>Day</th><th>Winner</th><th>Power</th><th>Margin vs Baseline</th></tr>
`;

for (const day of checkpoints) {
  const sorted = helperLevels
    .map(h => ({ ...h, ...allResults[h.level][day] }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  const baseline = allResults[0][day].power;
  const margin = baseline > 0 ? ((best.power - baseline) / baseline * 100).toFixed(1) : 'N/A';
  html += `      <tr><td>${day}</td><td>${best.name}</td><td>${best.power.toExponential(2)}</td><td>+${margin}%</td></tr>
`;
}

html += `    </table>
  </div>

</body>
</html>
`;

fs.writeFileSync('helper-comparison.html', html);
console.log('\nSaved to helper-comparison.html');

// Console summary
console.log(`\n----- POWER RANKINGS -----`);
for (const day of checkpoints) {
  const sorted = helperLevels
    .map(h => ({ ...h, ...allResults[h.level][day] }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  const baseline = allResults[0][day].power;
  const margin = baseline > 0 ? ((best.power - baseline) / baseline * 100).toFixed(1) : 'N/A';
  console.log(`Day ${day}: ${best.name} (${best.power.toExponential(2)}, +${margin}% vs baseline)`);
}
