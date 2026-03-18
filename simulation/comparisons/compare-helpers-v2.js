#!/usr/bin/env node
/**
 * Compare helper strategies v2 - with proper "is X better than Y" logic
 *
 * Key insight: SL costs ~20x recruit. Each future recruit gives +1 troop.
 * SL worth it if (ratio - 1) * expectedRecruits > cost
 * Same logic chains up: Barracks worth it if SLs expected > cost ratio, etc.
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
// HELPER FUNCTIONS - "is X better than Y for reaching target?"
// =============================================================================

// SL is better than recruit if gain > cost
// Gain: EXTRA power boost × expected recruits (ratio - 1, not ratio)
// Cost: (slCost + 4% target increase) in recruit-equivalents
function slBetterThanRecruit(ai, targetCost, divisor = 5) {
  const slCost = getSLCost(ai);
  const recruitCost = getRecruitCost(ai);

  const slPower = ai.rp - 1;  // total SL contribution to rp
  const barracksPower = ai.squadLeaderPower - 1;  // barracks boost per SL

  // Percentage power gain from buying 1 more SL
  // As slPower grows large, this ratio approaches 1 (no benefit)
  const ratio = (1 + slPower + 1 + barracksPower) / (1 + slPower);

  const expectedRecruits = targetCost / (recruitCost * divisor);
  // EXTRA gain, not total - subtract baseline of 1
  const gain = (ratio - 1) * expectedRecruits;

  // Cost in recruit-equivalents
  const cost = (slCost + targetCost * 0.04) / recruitCost;

  return gain > cost;
}

// Full helper check - does SL help reach target?
function doesSLHelp(ai, targetCost, coins, incomePerDay, clicks, divisor = 1) {
  if (!doesRecruitHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;
  if (!slBetterThanRecruit(ai, targetCost, divisor)) return false;
  if (ai.coins.lt(getSLCost(ai))) return false;
  return true;
}

// Barracks helper - same formula structure as SL
function barracksBetterThanSL(ai, targetCost, divisor = 1) {
  if (getCount(ai, "squad_leader") < 3) return false;

  const barracksCost = getBarracksCost(ai);
  const slCost = getSLCost(ai);

  const barracksPower = ai.squadLeaderPower - 1;
  const mbPower = ai.barracksPower - 1;

  const ratio = (1 + barracksPower + 1 + mbPower) / (1 + barracksPower);
  const expectedSLs = targetCost / (slCost * divisor);
  const gain = (ratio - 1) * expectedSLs;

  // Cost includes barracks + 4% penalty + expected SLs each adding 4%
  const cost = (barracksCost + targetCost * 0.04 * (1 + expectedSLs)) / slCost;

  return gain > cost;
}

function doesBarracksHelp(ai, targetCost, coins, incomePerDay, clicks, divisor = 1) {
  if (!doesSLHelp(ai, targetCost, coins, incomePerDay, clicks, divisor)) return false;
  if (!barracksBetterThanSL(ai, targetCost, divisor)) return false;
  if (ai.coins.lt(getBarracksCost(ai))) return false;
  return true;
}

// MB helper
function mbBetterThanBarracks(ai, targetCost, divisor = 1) {
  if (getCount(ai, "barracks") < 3) return false;

  const mbCost = getMBCost(ai);
  const barracksCost = getBarracksCost(ai);
  const slCost = getSLCost(ai);

  const mbPower = ai.barracksPower - 1;
  const kingdomPower = ai.militaryBasePower - 1;

  const ratio = (1 + mbPower + 1 + kingdomPower) / (1 + mbPower);
  const expectedBarracks = targetCost / (barracksCost * divisor);
  const expectedSLs = targetCost / (slCost * divisor);
  const gain = (ratio - 1) * expectedBarracks;

  const cost = (mbCost + targetCost * 0.04 * (1 + expectedBarracks + expectedSLs)) / barracksCost;

  return gain > cost;
}

function doesMBHelp(ai, targetCost, coins, incomePerDay, clicks, divisor = 1) {
  if (!doesBarracksHelp(ai, targetCost, coins, incomePerDay, clicks, divisor)) return false;
  if (!mbBetterThanBarracks(ai, targetCost, divisor)) return false;
  if (ai.coins.lt(getMBCost(ai))) return false;
  return true;
}

// Kingdom helper
function kingdomBetterThanMB(ai, targetCost, divisor = 1) {
  if (getCount(ai, "military_base") < 3) return false;

  const kingdomCost = getKingdomCost(ai);
  const mbCost = getMBCost(ai);
  const barracksCost = getBarracksCost(ai);
  const slCost = getSLCost(ai);

  const kingdomPower = ai.militaryBasePower - 1;
  const empirePower = ai.kingdomPower - 1;

  const ratio = (1 + kingdomPower + 1 + empirePower) / (1 + kingdomPower);
  const expectedMBs = targetCost / (mbCost * divisor);
  const expectedBarracks = targetCost / (barracksCost * divisor);
  const expectedSLs = targetCost / (slCost * divisor);
  const gain = (ratio - 1) * expectedMBs;

  const cost = (kingdomCost + targetCost * 0.04 * (1 + expectedMBs + expectedBarracks + expectedSLs)) / mbCost;

  return gain > cost;
}

function doesKingdomHelp(ai, targetCost, coins, incomePerDay, clicks, divisor = 1) {
  if (!doesMBHelp(ai, targetCost, coins, incomePerDay, clicks, divisor)) return false;
  if (!kingdomBetterThanMB(ai, targetCost, divisor)) return false;
  if (ai.coins.lt(getKingdomCost(ai))) return false;
  return true;
}

// =============================================================================
// AI RUNNER with configurable divisor for SL helps formula
// =============================================================================

// divisor controls expectedRecruits = targetCost / (recruitCost * divisor)
// 0 = baseline (no SL helps)
// Higher divisor = more conservative (less SL buying)
// Lower divisor = more aggressive (more SL buying)

// helperLevel: 0=none, 1=SL, 2=+barracks, 3=+MB, 4=+kingdom
function runAIWithConfig(ai, clicks, enemyPower, divisor, tierMult = 70, helperLevel = 1) {
  const VAL_SL = 5;
  const FARM_THRESHOLD = 6;
  const trainMult = 0.01;
  const usePptScaling = true;

  const VAL_BARRACKS = tierMult * VAL_SL;
  const VAL_MB = tierMult * VAL_BARRACKS;
  const VAL_KINGDOM = tierMult * VAL_MB;
  const VAL_EMPIRE = tierMult * VAL_KINGDOM;

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

    // All military tiers use normal scoring - divisor only affects the
    // "waiting for expensive building" logic, not normal scoring
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

  // Economy actions - always use normal scoring
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

  // Handle waiting for unaffordable building
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

    // For military buildings, check helpers from highest to lowest
    const recruitHelps = doesRecruitHelp(ai, best.cost, coins, incomePerDay, clicks);
    const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);

    if (helperLevel >= 4) {
      if (doesKingdomHelp(ai, best.cost, coins, incomePerDay, clicks, divisor)) {
        buyKingdom(ai);
        return;
      }
    }
    if (helperLevel >= 3) {
      if (doesMBHelp(ai, best.cost, coins, incomePerDay, clicks, divisor)) {
        buyMB(ai);
        return;
      }
    }
    if (helperLevel >= 2) {
      if (doesBarracksHelp(ai, best.cost, coins, incomePerDay, clicks, divisor)) {
        buyBarracks(ai);
        return;
      }
    }
    if (helperLevel >= 1) {
      if (doesSLHelp(ai, best.cost, coins, incomePerDay, clicks, divisor)) {
        buySL(ai);
        return;
      }
    }

    // Fallback to recruit/train
    if (recruitHelps) {
      recruit(ai);
      return;
    }
    if (trainHelps) {
      train(ai);
      return;
    }

    beg(ai);
    return;
  }

  // Best action is affordable - but we may still want to buy helpers
  // if they're better than what normal scoring suggests
  if (helperLevel >= 1 && best.name === 'recruit') {
    const targetCost = findBestMilitaryTarget(ai);
    if (targetCost > 0) {
      // Check helpers from highest to lowest
      if (helperLevel >= 4 && kingdomBetterThanMB(ai, targetCost, divisor) && ai.coins.gte(getKingdomCost(ai))) {
        buyKingdom(ai);
        return;
      }
      if (helperLevel >= 3 && mbBetterThanBarracks(ai, targetCost, divisor) && ai.coins.gte(getMBCost(ai))) {
        buyMB(ai);
        return;
      }
      if (helperLevel >= 2 && barracksBetterThanSL(ai, targetCost, divisor) && ai.coins.gte(getBarracksCost(ai))) {
        buyBarracks(ai);
        return;
      }
      if (helperLevel >= 1 && slBetterThanRecruit(ai, targetCost, divisor) && ai.coins.gte(getSLCost(ai))) {
        buySL(ai);
        return;
      }
    }
  }

  // Execute best affordable action
  for (const action of actions) {
    if (action.name !== 'farm' && wouldSpendingCauseEmergency(ai, action.cost, clicks)) {
      continue;
    }
    if (action.fn()) return;
  }
  beg(ai);
}

// Find the target we're building toward (for helper calculations)
function findBestMilitaryTarget(ai) {
  // Find the highest military tier that's unlocked
  if (getCount(ai, "kingdom") >= 3) {
    return getEmpireCost(ai);
  }
  if (getCount(ai, "military_base") >= 3) {
    return getKingdomCost(ai);
  }
  if (getCount(ai, "barracks") >= 3) {
    return getMBCost(ai);
  }
  if (getCount(ai, "squad_leader") >= 3) {
    return getBarracksCost(ai);
  }
  return 0;
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

function runSimulation(maxDays, clicks, divisor, tierMult, helperLevel, checkpoints) {
  const ai = createAIState();
  const stats = { starveDays: 0, maxStreak: 0 };
  const snapshots = {};

  for (let day = 1; day <= maxDays; day++) {
    for (let i = 0; i < clicks; i++) {
      runAIWithConfig(ai, clicks, 0, divisor, tierMult, helperLevel);
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
const clicks = 25;

// Test tierMult × divisor combinations with SL helps
// Testing around div=0.9 with both 70 and 100 tierMult
const tierMultValues = [70, 100];
const divisorValues = [0.85, 0.9, 0.95, 1.0, 1.1, 1.2];

const configs = [];
for (const tierMult of tierMultValues) {
  for (const divisor of divisorValues) {
    configs.push({
      tierMult,
      divisor,
      helperLevel: 1,
      name: `tm=${tierMult} div=${divisor}`
    });
  }
}

// Run all simulations
const allResults = {};
for (const c of configs) {
  console.log(`Running ${c.name}...`);
  allResults[c.name] = runSimulation(500, clicks, c.divisor, c.tierMult, c.helperLevel, checkpoints);
}

// Generate HTML
let html = `<!DOCTYPE html>
<html>
<head>
  <title>Helper Strategy Comparison v2</title>
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
  <h1>Helper Strategy Comparison v2</h1>

  <div class="config">
    <p><strong>Fixed:</strong> VAL_SL=5, FARM_THRESHOLD=6, trainMult=0.01, CPS=25</p>
    <p><strong>Testing:</strong> tierMult × divisor combinations</p>
  </div>
`;

for (const day of checkpoints) {
  let maxPower = 0;
  let winnerName = null;
  for (const c of configs) {
    if (allResults[c.name][day].power > maxPower) {
      maxPower = allResults[c.name][day].power;
      winnerName = c.name;
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

  for (const c of configs) {
    const s = allResults[c.name][day];
    const isWinner = c.name === winnerName;

    html += `    <tr class="${isWinner ? 'winner' : ''}">
      <td>${c.name}</td>
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
      <tr><th>Day</th><th>Winner</th><th>Power</th></tr>
`;

for (const day of checkpoints) {
  const sorted = configs
    .map(c => ({ ...c, ...allResults[c.name][day] }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  html += `      <tr><td>${day}</td><td>${best.name}</td><td>${best.power.toExponential(2)}</td></tr>
`;
}

html += `    </table>
  </div>

`;

// Worst-day analysis: for each strategy, find their worst ratio vs best performer
// Then rank by who has the best "worst day"
const worstDayAnalysis = [];

for (const c of configs) {
  let worstRatio = Infinity;
  let worstDay = null;

  for (const day of checkpoints) {
    // Find best power for this day
    let bestPower = 0;
    for (const c2 of configs) {
      if (allResults[c2.name][day].power > bestPower) {
        bestPower = allResults[c2.name][day].power;
      }
    }

    const myPower = allResults[c.name][day].power;
    const ratio = myPower / bestPower;

    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstDay = day;
    }
  }

  worstDayAnalysis.push({
    name: c.name,
    worstRatio,
    worstDay,
    worstPower: allResults[c.name][worstDay].power
  });
}

// Sort by worst ratio (higher is better = less bad worst day)
worstDayAnalysis.sort((a, b) => b.worstRatio - a.worstRatio);

html += `
  <h2>Worst-Day Robustness Ranking</h2>
  <p>Ranked by best "worst performance" - ratio vs day's best performer</p>
  <div class="summary">
    <table>
      <tr><th>Rank</th><th>Strategy</th><th>Worst Ratio</th><th>Worst Day</th><th>Power That Day</th></tr>
`;

for (let i = 0; i < worstDayAnalysis.length; i++) {
  const w = worstDayAnalysis[i];
  html += `      <tr><td>${i + 1}</td><td>${w.name}</td><td>${(w.worstRatio * 100).toFixed(2)}%</td><td>${w.worstDay}</td><td>${w.worstPower.toExponential(2)}</td></tr>
`;
}

html += `    </table>
  </div>

</body>
</html>
`;

fs.writeFileSync('helper-comparison-v2.html', html);
console.log('\nSaved to helper-comparison-v2.html');

// Console summary
console.log(`\n----- POWER RANKINGS -----`);
for (const day of checkpoints) {
  const sorted = configs
    .map(c => ({ ...c, ...allResults[c.name][day] }))
    .sort((a, b) => b.power - a.power);
  const best = sorted[0];
  console.log(`Day ${day}: ${best.name} (${best.power.toExponential(2)})`);
}
