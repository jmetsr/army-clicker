/**
 * Compare different barracksBetterThanSL strategies
 *
 * Variants:
 * 1. Base case: no barracks helper (just SL helper)
 * 2. Fixed expectedSLs = 1, 2, 3
 * 3. DIVISOR_BARRACKS = 1, 1.5, 2, 3, 4, 5, 10 (with DIVISOR = 1)
 * 4. Both DIVISOR and DIVISOR_BARRACKS = 2
 */

const { C, PARAMS } = require('../constants');
const { createAIState } = require('../state');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost, getEmpireCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('../costs');
const { buySL, buyBarracks, buyMB, buyKingdom, buyEmpire,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('../actions');
const { calcScore, slBetterThanRecruit, barracksBetterThanSL, findBestMilitaryTarget } = require('../scoring');
const { simDay } = require('../sim');
const fs = require('fs');

// Debug logging for tm70 EST both=1
let debugLogs = [];
let currentDay = 0;
let currentBestName = '';
let currentBestCost = 0;

/**
 * Run AI with configurable barracks helper
 * @param {Object} config - { useBarracksHelper, fixedExpectedSLs, divisor, divisorBarracks, tierMult }
 */
function runAIWithConfig(ai, clicks, config) {
  const VAL_SL = PARAMS.VAL_SL;
  const FARM_THRESHOLD = PARAMS.FARM_THRESHOLD;
  const trainMult = PARAMS.TRAIN_MULT;
  const tierMult = config.tierMult || PARAMS.TIER_MULT;

  const VAL_BARRACKS = tierMult * VAL_SL;
  const VAL_MB = tierMult * VAL_BARRACKS;
  const VAL_KINGDOM = tierMult * VAL_MB;
  const VAL_EMPIRE = tierMult * VAL_KINGDOM;

  function doesRecruitHelp(targetCost, coins, incomePerDay) {
    const recruitCost = getRecruitCost(ai);
    if (coins < recruitCost) return false;
    const troopCount = ai.troops.toNumber();
    const ppt = ai.ppt;
    const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    const newIncome = ((troopCount + ai.rp) * ppt * 4) + clicks;
    const daysWithRecruit = (targetCost - coins + recruitCost) / Math.max(newIncome, 1);
    return daysWithRecruit < daysToReach;
  }

  function slBetterThanRecruitLocal(targetCost) {
    const slCost = getSLCost(ai);
    const recruitCost = getRecruitCost(ai);
    const slPower = ai.rp - 1;
    const barracksPower = ai.squadLeaderPower - 1;
    const ratio = (1 + slPower + 1 + barracksPower) / (1 + slPower);
    const expectedRecruits = targetCost / (recruitCost * config.divisor);
    const gain = (ratio - 1) * expectedRecruits;
    const cost = (slCost + targetCost * 0.04) / recruitCost;
    return gain > cost;
  }

  // Precomputed inflation factors for n=2,4,6,8,10
  const INFLATE_2 = 1.0816000;   // 1.04^2
  const INFLATE_4 = 1.1698586;   // 1.04^4
  const INFLATE_6 = 1.2653190;   // 1.04^6
  const INFLATE_8 = 1.3685691;   // 1.04^8
  const INFLATE_10 = 1.4802443;  // 1.04^10

  // Check if buying SL would still be worth it after n SLs already purchased
  function wouldSLStillHelpAfterN(targetCost, n, inflate, debug = false) {
    const slCost = getSLCost(ai);
    const recruitCost = getRecruitCost(ai);

    const inflatedSlCost = slCost * inflate;
    const inflatedTarget = targetCost * inflate;
    const newSlPower = (ai.rp - 1) + n * ai.squadLeaderPower;
    const barracksPower = ai.squadLeaderPower - 1;

    const ratio = (1 + newSlPower + 1 + barracksPower) / (1 + newSlPower);
    const expectedRecruits = inflatedTarget / (recruitCost * config.divisor);
    const gain = (ratio - 1) * expectedRecruits;
    const cost = (inflatedSlCost + inflatedTarget * 0.04) / recruitCost;

    if (debug) {
      console.log(`    wouldSLStillHelpAfterN(n=${n}, inflate=${inflate.toFixed(2)}): slCost=${slCost.toFixed(0)} recruitCost=${recruitCost.toFixed(0)} | rp=${ai.rp} slPower=${ai.squadLeaderPower} | newSlPower=${newSlPower} ratio=${ratio.toFixed(4)} | expRecruits=${expectedRecruits.toFixed(0)} gain=${gain.toFixed(2)} cost=${cost.toFixed(2)} => ${gain > cost}`);
    }

    return gain > cost;
  }

  // Also check n=0 for comparison
  function slBetterThanRecruitDebug(targetCost) {
    const slCost = getSLCost(ai);
    const recruitCost = getRecruitCost(ai);
    const slPower = ai.rp - 1;
    const barracksPower = ai.squadLeaderPower - 1;
    const ratio = (1 + slPower + 1 + barracksPower) / (1 + slPower);
    const expectedRecruits = targetCost / (recruitCost * config.divisor);
    const gain = (ratio - 1) * expectedRecruits;
    const cost = (slCost + targetCost * 0.04) / recruitCost;
    console.log(`    slBetterThanRecruit(n=0): slCost=${slCost.toFixed(0)} recruitCost=${recruitCost.toFixed(0)} | rp=${ai.rp} slPower=${ai.squadLeaderPower} | ratio=${ratio.toFixed(4)} | expRecruits=${expectedRecruits.toFixed(0)} gain=${gain.toFixed(2)} cost=${cost.toFixed(2)} => ${gain > cost}`);
    return gain > cost;
  }

  // Estimate expectedSLs as 0, 3, 5, 7, 9, or 11 (purchases, not SL count)
  function estimateExpectedSLs(targetCost, debug = false) {
    if (debug) {
      console.log(`  estimateExpectedSLs for targetCost=${Math.floor(targetCost)}:`);
      slBetterThanRecruitDebug(targetCost);
      wouldSLStillHelpAfterN(targetCost, 2, INFLATE_2, true);
      wouldSLStillHelpAfterN(targetCost, 4, INFLATE_4, true);
      wouldSLStillHelpAfterN(targetCost, 6, INFLATE_6, true);
      wouldSLStillHelpAfterN(targetCost, 8, INFLATE_8, true);
      wouldSLStillHelpAfterN(targetCost, 10, INFLATE_10, true);
    }
    if (wouldSLStillHelpAfterN(targetCost, 10, INFLATE_10)) return 11;
    if (wouldSLStillHelpAfterN(targetCost, 8, INFLATE_8)) return 9;
    if (wouldSLStillHelpAfterN(targetCost, 6, INFLATE_6)) return 7;
    if (wouldSLStillHelpAfterN(targetCost, 4, INFLATE_4)) return 5;
    if (wouldSLStillHelpAfterN(targetCost, 2, INFLATE_2)) return 3;
    return 0;
  }

  function barracksBetterThanSLLocal(targetCost, debug = false) {
    const barracksCost = getBarracksCost(ai);
    const slCost = getSLCost(ai);

    let ratio;
    if (config.useFixedRatio) {
      // FIXED: ratio = (squadLeaderPower + barracksPower) / squadLeaderPower
      // This is "how much better is each SL after buying 1 barracks"
      ratio = (ai.squadLeaderPower + ai.barracksPower) / ai.squadLeaderPower;
    } else {
      // OLD (mixed up tiers): uses mbPower instead of barracksPower
      const barracksPower = ai.barracksPower - 1;
      const mbPower = ai.militaryBasePower - 1;
      ratio = (1 + barracksPower + 1 + mbPower) / (1 + barracksPower);
    }

    let expectedSLs;
    if (config.useEstimatedSLs) {
      const shouldDebug = debug && config.name === 'tm70 EST both=1' && debugLogs.length < 3;
      expectedSLs = estimateExpectedSLs(targetCost, shouldDebug);
    } else if (config.fixedExpectedSLs !== null) {
      expectedSLs = config.fixedExpectedSLs;
    } else {
      expectedSLs = targetCost / (slCost * config.divisorBarracks);
    }

    const gain = (ratio - 1) * expectedSLs;
    // No inflation term since both barracks and SL inflate army costs equally
    const cost = barracksCost / slCost;

    if (debug && config.useEstimatedSLs && config.name === 'FIX div=1') {
      debugLogs.push({
        day: currentDay,
        target: currentBestName,
        targetCost,
        slCost,
        barracksCost,
        sls: getCount(ai, "squad_leader"),
        barracks: getCount(ai, "barracks"),
        rp: ai.rp,
        squadLeaderPower: ai.squadLeaderPower,
        barracksPower: ai.barracksPower,
        mbPower: ai.militaryBasePower,
        ratio: ratio.toFixed(4),
        expectedSLs,
        gain: gain.toFixed(2),
        cost: cost.toFixed(2),
        result: gain > cost
      });
    }

    return gain > cost;
  }

  function doesSLHelp(targetCost, coins, incomePerDay) {
    if (!doesRecruitHelp(targetCost, coins, incomePerDay)) return false;
    if (!slBetterThanRecruitLocal(targetCost)) return false;
    if (ai.coins.lt(getSLCost(ai))) return false;
    return true;
  }

  function doesTrainHelp(targetCost, coins, incomePerDay) {
    const troopCount = ai.troops.toNumber();
    const trainCost = getTrainCost(ai);
    if (coins < trainCost || troopCount < 5) return false;
    const ppt = ai.ppt;
    const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    const newIncome = (troopCount * ppt * ai.trainMult * 4) + clicks;
    const daysWithTrain = (targetCost - coins + trainCost) / Math.max(newIncome, 1);
    return daysWithTrain < daysToReach;
  }

  function recruitCausesSuperEmergency(coins, fCost) {
    const troopCount = ai.troops.toNumber();
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = getCount(ai, "farm") * C.farm_production;
    if (currentFarmProd >= newConsume) return false;
    const deficit = newConsume - currentFarmProd;
    const foodBuf = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? foodBuf / deficit : 999;
    if (daysOfBuffer > 50) return false;
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsToBuy = farmsNeeded - getCount(ai, "farm");
    const costToBuy = farmsToBuy * fCost;
    if (coins >= costToBuy) return false;
    const incomePerDay = (troopCount * ai.ppt * 4) + clicks;
    const coinsNeeded = costToBuy - coins;
    const daysToAfford = coinsNeeded / Math.max(incomePerDay, 1);
    return daysToAfford > daysOfBuffer;
  }

  // Determine if target is kingdom or empire (where barracks helper applies)
  function isKingdomOrEmpireTarget() {
    if (getCount(ai, "kingdom") >= 3) return true;  // targeting empire
    if (getCount(ai, "military_base") >= 3) return true;  // targeting kingdom
    return false;
  }

  for (let iteration = 0; iteration < clicks; iteration++) {
    let coins = ai.coins.toNumber();
    let troopCount = ai.troops.toNumber();
    let ppt = ai.ppt;
    let incomePerDay = (troopCount * ppt * 4) + clicks;

    if (troopCount < 1) {
      if (ai.coins.gte(getRecruitCost(ai))) {
        recruit(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    let farmProd = getCount(ai, "farm") * C.farm_production;
    let netConsume = (troopCount * C.food_perTroopDay) - farmProd;
    let foodBuffer = ai.food.toNumber();
    let daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    let fCost = getFarmCost(ai);
    let daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    let foodEmergency = (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

    let recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
    let urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);
    let VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
    let VAL_PLANTATION = tierMult * VAL_FARM;
    let VAL_COLONY = tierMult * VAL_PLANTATION;

    if (foodEmergency) {
      if (ai.coins.gte(fCost)) {
        buyFarm(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    let isAlmostEmergency = recruitCausesSuperEmergency(coins, fCost);

    let actions = [];

    if (!isAlmostEmergency) {
      if (troopCount >= 5) {
        const cost = getTrainCost(ai);
        const value = troopCount * ppt * trainMult;
        const score = calcScore(cost, value, coins, incomePerDay, true);
        if (score > 0) actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }

      {
        const cost = getRecruitCost(ai);
        const value = ai.rp * ppt;
        const maxSustainable = farmProd / C.food_perTroopDay;
        const newStrain = maxSustainable > 0 ? (troopCount + ai.rp) / maxSustainable : 0;
        const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
        let score = calcScore(cost, value, coins, incomePerDay, true);
        score -= strainPenalty;
        if (score > 0) actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }

      if (troopCount >= 2) {
        const cost = getSLCost(ai);
        const value = ai.squadLeaderPower * VAL_SL * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'squad_leader', score, cost, fn: () => buySL(ai) });
      }

      if (getCount(ai, "squad_leader") >= 3) {
        const cost = getBarracksCost(ai);
        const value = ai.barracksPower * VAL_BARRACKS * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }

      if (getCount(ai, "barracks") >= 3) {
        const cost = getMBCost(ai);
        const value = ai.militaryBasePower * VAL_MB * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'military_base', score, cost, fn: () => buyMB(ai) });
      }

      if (getCount(ai, "military_base") >= 3) {
        const cost = getKingdomCost(ai);
        const value = ai.kingdomPower * VAL_KINGDOM * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }

      if (getCount(ai, "kingdom") >= 3) {
        const cost = getEmpireCost(ai);
        const value = ai.empirePower * VAL_EMPIRE * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }

    {
      const cost = getFarmCost(ai);
      const value = ai.fp * VAL_FARM * ppt;
      const score = calcScore(cost, value, coins, incomePerDay, false);
      if (score > 0) actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }

    if (getCount(ai, "farm") >= 3) {
      const cost = getPlantationCost(ai);
      const value = ai.pp * VAL_PLANTATION * ppt;
      const score = calcScore(cost, value, coins, incomePerDay, false);
      if (score > 0) actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }

    if (getCount(ai, "plantation") >= 3) {
      const cost = getColonyCost(ai);
      const value = 1 * VAL_COLONY * ppt;
      const score = calcScore(cost, value, coins, incomePerDay, false);
      if (score > 0) actions.push({ name: 'colony', score, cost, fn: () => buyColony(ai) });
    }

    if (actions.length === 0) {
      beg(ai);
      continue;
    }

    actions.sort((a, b) => b.score - a.score);

    const best = actions[0];
    const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
    const bestIsUnaffordable = bestIsBuilding && best.cost > coins;

    if (bestIsUnaffordable) {
      if (isAlmostEmergency) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      const bestIsEconomy = (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');

      if (bestIsEconomy) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      // For military buildings, check helpers
      if (doesSLHelp(best.cost, coins, incomePerDay)) {
        // Check if barracks helper applies (only for kingdom/empire targets)
        if (config.useBarracksHelper && isKingdomOrEmpireTarget()) {
          currentBestName = best.name;
          currentBestCost = best.cost;
          const barracksResult = barracksBetterThanSLLocal(best.cost, true);
          if (barracksResult && ai.coins.gte(getBarracksCost(ai))) {
            buyBarracks(ai);
            continue;
          }
        }
        buySL(ai);
        continue;
      }

      if (doesRecruitHelp(best.cost, coins, incomePerDay) && !recruitCausesSuperEmergency(coins, fCost)) {
        recruit(ai);
        continue;
      }

      if (doesTrainHelp(best.cost, coins, incomePerDay)) {
        train(ai);
        continue;
      }

      beg(ai);
      continue;
    }

    // Best action is affordable - check SL helper when recruit wins
    if (best.name === 'recruit') {
      const targetCost = findBestMilitaryTarget(ai);
      if (targetCost > 0 && slBetterThanRecruitLocal(targetCost) && ai.coins.gte(getSLCost(ai))) {
        // Check barracks helper for kingdom/empire
        if (config.useBarracksHelper && isKingdomOrEmpireTarget()) {
          currentBestName = 'recruit->military';
          currentBestCost = targetCost;
          if (barracksBetterThanSLLocal(targetCost, true) && ai.coins.gte(getBarracksCost(ai))) {
            buyBarracks(ai);
            continue;
          }
        }
        buySL(ai);
        continue;
      }
    }

    let executed = false;
    for (const action of actions) {
      if (action.name !== 'farm') {
        if (netConsume > 0) {
          const coinsAfterSpend = coins - action.cost;
          const daysToAfford = fCost > coinsAfterSpend
            ? (fCost - coinsAfterSpend) / Math.max(incomePerDay, 1)
            : 0;
          if (daysToAfford > daysOfFood) {
            continue;
          }
        }
      }
      if (action.fn()) {
        executed = true;
        break;
      }
    }

    if (!executed) {
      beg(ai);
    }
  }
}

// Define all test configurations
const configs = [
  // Base case: no barracks helper, tm=70, divisor=1 (current AI behavior)
  { name: 'BASE (no helper)', useBarracksHelper: false, fixedExpectedSLs: null, divisor: 1, divisorBarracks: 1, tierMult: 70 },

  // Old formula (mixed up tiers) with various divisors
  { name: 'OLD div=1', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: false, fixedExpectedSLs: null, divisor: 1, divisorBarracks: 1, tierMult: 70 },
  { name: 'OLD div=1.2', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: false, fixedExpectedSLs: null, divisor: 1.2, divisorBarracks: 1, tierMult: 70 },

  // FIXED formula with various divisors
  { name: 'FIX div=1', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 1, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=1.1', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 1.1, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=1.2', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 1.2, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=1.5', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 1.5, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=2', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 2, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=2.5', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 2.5, divisorBarracks: 1, tierMult: 70 },
  { name: 'FIX div=3', useBarracksHelper: true, useEstimatedSLs: true, useFixedRatio: true, fixedExpectedSLs: null, divisor: 3, divisorBarracks: 1, tierMult: 70 },
];

const DAYS = 500;
const CLICKS = 10;
const checkpoints = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

console.log(`Running ${configs.length} configurations for ${DAYS} days...`);

const results = [];

for (const config of configs) {
  const ai = createAIState();
  let totalStarveDays = 0;
  const snapshots = [];

  // Reset debug logs for each config
  if (config.name === 'FIX div=1') {
    debugLogs = [];
  }

  for (let day = 1; day <= DAYS; day++) {
    currentDay = day;
    runAIWithConfig(ai, CLICKS, config);

    // End of day: loot, food, starvation
    if (ai.troops.gte(1)) {
      const loot = ai.troops.mul(ai.ppt).mul(4);
      ai.coins = ai.coins.add(loot);
    }

    const farmProd = getCount(ai, "farm") * C.farm_production;
    const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
    ai.food = ai.food.add(farmProd);
    const starving = troopConsume > ai.food.toNumber();
    ai.food = ai.food.sub(troopConsume);
    if (ai.food.lt(0)) ai.food = ai.food.sub(ai.food); // set to 0

    if (starving) {
      ai.starvationStreak++;
      totalStarveDays++;
      const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
      const deserters = Math.floor(ai.troops.toNumber() * desertPct / 100);
      ai.troops = ai.troops.sub(deserters);
      if (ai.troops.lt(0)) ai.troops = ai.troops.sub(ai.troops);
    } else {
      ai.starvationStreak = 0;
    }

    if (checkpoints.includes(day)) {
      snapshots.push({
        day,
        power: ai.troops.toNumber() * ai.ppt,
        troops: ai.troops.toNumber(),
        ppt: ai.ppt,
        sls: getCount(ai, "squad_leader"),
        barracks: getCount(ai, "barracks"),
        mbs: getCount(ai, "military_base"),
        kingdoms: getCount(ai, "kingdom"),
        empires: getCount(ai, "empire"),
        farms: getCount(ai, "farm"),
        starveDays: totalStarveDays,
      });
    }
  }

  results.push({ config, snapshots, finalPower: ai.troops.toNumber() * ai.ppt });
  console.log(`  ${config.name}: final power = ${Math.floor(ai.troops.toNumber() * ai.ppt).toLocaleString()}`);
}

// Sort by final power
results.sort((a, b) => b.finalPower - a.finalPower);

// Generate HTML - one table per day, strategies as rows
let dayTables = '';
for (const day of checkpoints) {
  // Gather all strategies' data for this day
  const dayData = results.map(r => {
    const snap = r.snapshots.find(s => s.day === day);
    return { name: r.config.name, ...snap };
  });

  // Find winner (highest power)
  const maxPower = Math.max(...dayData.map(d => d.power));
  const basePower = dayData.find(d => d.name.toLowerCase().includes('base')).power;

  dayTables += `
    <h2>Day ${day}</h2>
    <table>
      <tr>
        <th>Strategy</th>
        <th>Power</th>
        <th>vs Base</th>
        <th>Troops</th>
        <th>PPT</th>
        <th>SLs</th>
        <th>Barracks</th>
        <th>MBs</th>
        <th>Kingdoms</th>
        <th>Empires</th>
        <th>Farms</th>
        <th>Starve</th>
      </tr>
      ${dayData.map(d => {
        const isWinner = d.power === maxPower;
        const pct = ((d.power / basePower - 1) * 100).toFixed(1);
        const pctStr = pct > 0 ? '+' + pct : pct;
        return `<tr class="${isWinner ? 'winner' : ''}">
          <td style="text-align:left">${d.name}</td>
          <td>${Math.floor(d.power).toLocaleString()}</td>
          <td>${d.name.toLowerCase().includes('base') ? '-' : pctStr + '%'}</td>
          <td>${d.troops.toLocaleString()}</td>
          <td>${d.ppt.toFixed(2)}</td>
          <td>${d.sls.toLocaleString()}</td>
          <td>${d.barracks.toLocaleString()}</td>
          <td>${d.mbs}</td>
          <td>${d.kingdoms}</td>
          <td>${d.empires}</td>
          <td>${d.farms.toLocaleString()}</td>
          <td>${d.starveDays}</td>
        </tr>`;
      }).join('')}
    </table>
  `;
}

const html = `<!DOCTYPE html>
<html>
<head>
  <title>Barracks Helper Comparison</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #1a1a2e; color: #eee; }
    h1, h2 { color: #0f0; }
    table { border-collapse: collapse; margin: 10px 0 30px 0; font-size: 12px; }
    th, td { border: 1px solid #444; padding: 4px 8px; text-align: right; }
    th { background: #333; color: #0f0; }
    tr:nth-child(even) { background: #252540; }
    .winner { background: #0a3; color: #fff; }
  </style>
</head>
<body>
  <h1>Barracks Helper Strategy Comparison</h1>
  <p>Testing whether buying barracks instead of SL helps when saving for kingdom/empire.</p>
  <p>Days: ${DAYS}, Clicks/day: ${CLICKS}</p>
  <p>Green = winner for that day (highest power)</p>

  ${dayTables}
</body>
</html>`;

fs.writeFileSync('barracks-helper-comparison.html', html);
console.log(`\nResults written to barracks-helper-comparison.html`);

// Output debug logs for FIX div=1
if (debugLogs.length > 0) {
  console.log(`\n=== DEBUG: FIX div=1 barracks helper calls ===`);
  console.log(`Total calls to barracksBetterThanSL: ${debugLogs.length}`);

  // Show first 10 and last 10
  const toShow = debugLogs.slice(0, 10);
  if (debugLogs.length > 20) {
    toShow.push({ separator: true });
    toShow.push(...debugLogs.slice(-10));
  } else if (debugLogs.length > 10) {
    toShow.push(...debugLogs.slice(10));
  }

  for (const log of toShow) {
    if (log.separator) {
      console.log('... (middle entries omitted) ...');
      continue;
    }
    console.log(`Day ${log.day}: target=${log.target} targetCost=${Math.floor(log.targetCost)} | barracks=${log.barracks} barracksPower=${log.barracksPower} mbPower=${log.mbPower} | ratio=${log.ratio} expectedSLs=${log.expectedSLs} | gain=${log.gain} cost=${log.cost} => ${log.result}`);
  }

  // Count how many times each expectedSLs value appeared
  const estCounts = { 0: 0, 3: 0, 5: 0, 7: 0, 9: 0, 11: 0 };
  for (const log of debugLogs) {
    if (estCounts[log.expectedSLs] !== undefined) {
      estCounts[log.expectedSLs]++;
    }
  }
  console.log(`\nexpectedSLs distribution: 0=${estCounts[0]}, 3=${estCounts[3]}, 5=${estCounts[5]}, 7=${estCounts[7]}, 9=${estCounts[9]}, 11=${estCounts[11]}`);
} else {
  console.log(`\n=== DEBUG: FIX div=1 ===`);
  console.log('No calls to barracksBetterThanSL were recorded. isKingdomOrEmpireTarget() may never be true, or doesSLHelp may be returning false.');
}
