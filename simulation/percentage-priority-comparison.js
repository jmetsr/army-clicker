/**
 * Percentage-Based Priority Comparison
 *
 * Tests the hypothesis: when money is abundant, switch to buying
 * whatever gives the highest percentage increase to balance building counts.
 *
 * Threshold variants: switch when recruit + empire cost < coins / threshold
 *
 * CHOSEN DEFAULT: threshold=0.02 (achieved +2696% improvement vs baseline)
 * This is now implemented in html-game/js/ai-strategy.js
 *
 * Run: node percentage-priority-comparison.js
 */

const { C, PARAMS } = require('./constants');
const { ON } = require('./ordinal');
const { createAIState } = require('./state');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost, getEmpireCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom, buyEmpire,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, slBetterThanRecruit, barracksBetterThanSL, findBestMilitaryTarget } = require('./scoring');

// ============================================================================
// PERCENTAGE-BASED PRIORITY LOGIC
// ============================================================================

/**
 * Get percentage increase from buying one more of a building type
 */
function getPercentageIncrease(currentCount) {
  if (currentCount <= 0) return Infinity; // First one is infinite % increase
  return 1 / currentCount;
}

/**
 * Check if we should use percentage-based priority
 * @param {Object} ai - AI state
 * @param {number} threshold - Coins multiplier threshold
 * @returns {boolean}
 */
let debugCounter = 0;
let modeTransitions = [];  // Track when percentage mode is entered/exited
let lastModeState = false;
let currentDay = 0;
let hasEverBeenInPriorityMode = false;  // Track if we've ever entered priority mode

function resetModeTracking() {
  debugCounter = 0;
  modeTransitions = [];
  lastModeState = false;
  currentDay = 0;
  hasEverBeenInPriorityMode = false;
}

function setCurrentDay(day) {
  currentDay = day;
}

function checkPriorityModeEligible(ai, threshold) {
  const coins = ai.coins.toNumber();
  const recruitCost = getRecruitCost(ai);
  const empireCost = getEmpireCost(ai);

  // Both recruit and empire must be affordable at threshold level
  return recruitCost < coins / threshold && empireCost < coins / threshold;
}

function shouldUsePercentagePriority(ai, threshold) {
  const result = checkPriorityModeEligible(ai, threshold);

  // Track mode transitions
  if (result !== lastModeState) {
    const coins = ai.coins.toNumber();
    modeTransitions.push({
      day: currentDay,
      entered: result,
      coins: coins,
      recruitCost: getRecruitCost(ai),
      empireCost: getEmpireCost(ai)
    });
    lastModeState = result;
  }

  if (result) {
    hasEverBeenInPriorityMode = true;
    debugCounter++;
  }

  return result;
}

function getHasEverBeenInPriorityMode() {
  return hasEverBeenInPriorityMode;
}

function getModeTransitions() {
  return modeTransitions.slice();  // Return a copy
}

// Track what percentage mode is choosing
let pctModeChoices = {};

function resetPctModeChoices() {
  pctModeChoices = {};
}

function getPctModeChoices() {
  return { ...pctModeChoices };
}

// Debug logging for specific empire count range
let debugEmpireCount = false;
let debugLogs = [];

function setDebugEmpireCount(enabled) {
  debugEmpireCount = enabled;
  debugLogs = [];
}

function getDebugLogs() {
  return debugLogs;
}

// Track executed actions and urgency for phase analysis
let phaseTracker = {
  executedActions: {},
  urgencyBuckets: {},
  skippedActions: {},
  empireChangeDays: [],
  totalClicks: 0,
};

function resetPhaseTracker() {
  phaseTracker = {
    executedActions: {},
    urgencyBuckets: {},
    skippedActions: {},
    empireChangeDays: [],
    totalClicks: 0,
  };
}

function trackAction(action, urgency, skippedAction = null) {
  phaseTracker.totalClicks++;
  phaseTracker.executedActions[action] = (phaseTracker.executedActions[action] || 0) + 1;

  let bucket;
  if (urgency >= 999) bucket = 'u999';
  else if (urgency >= 50) bucket = 'u50+';
  else if (urgency >= 10) bucket = 'u10-50';
  else if (urgency >= 5) bucket = 'u5-10';
  else if (urgency >= 2) bucket = 'u2-5';
  else bucket = 'u<2';
  phaseTracker.urgencyBuckets[bucket] = (phaseTracker.urgencyBuckets[bucket] || 0) + 1;

  if (skippedAction) {
    phaseTracker.skippedActions[skippedAction] = (phaseTracker.skippedActions[skippedAction] || 0) + 1;
  }
}

function trackEmpireChange(day) {
  phaseTracker.empireChangeDays.push(day);
}

function getPhaseTracker() {
  return phaseTracker;
}

/**
 * Select best BUILDING using percentage-based priority
 * Only chooses among army buildings (SL, barracks, MB, kingdom, empire)
 * Returns the best building action, or null if:
 *   - No buildings available
 *   - The ideal building (highest %) is unaffordable (should save for it)
 */
function getBestBuildingByPercentage(ai, normalChoice = null) {
  const troops = ai.troops.toNumber();
  const coins = ai.coins.toNumber();
  const slCount = getCount(ai, "squad_leader");
  const barracksCount = getCount(ai, "barracks");
  const mbCount = getCount(ai, "military_base");
  const kingdomCount = getCount(ai, "kingdom");
  const empireCount = getCount(ai, "empire");

  const shouldDebug = debugEmpireCount && empireCount === 13;

  // Helper: percentage increase is infinite when count is 0
  function pctInc(power, count) {
    if (count === 0) return Infinity;
    return power / count;
  }

  // Calculate ALL buildings by percentage (including unaffordable)
  const allOptions = [];

  // Squad Leader (unlocked when troops >= 2)
  if (troops >= 2) {
    allOptions.push({
      name: 'squad_leader',
      pctIncrease: pctInc(ai.squadLeaderPower, slCount),
      cost: getSLCost(ai),
      affordable: ai.coins.gte(getSLCost(ai)),
      fn: () => buySL(ai)
    });
  }

  // Barracks (unlocked when SL >= 3)
  if (slCount >= 3) {
    allOptions.push({
      name: 'barracks',
      pctIncrease: pctInc(ai.barracksPower, barracksCount),
      cost: getBarracksCost(ai),
      affordable: ai.coins.gte(getBarracksCost(ai)),
      fn: () => buyBarracks(ai)
    });
  }

  // Military Base (unlocked when barracks >= 3)
  if (barracksCount >= 3) {
    allOptions.push({
      name: 'military_base',
      pctIncrease: pctInc(ai.militaryBasePower, mbCount),
      cost: getMBCost(ai),
      affordable: ai.coins.gte(getMBCost(ai)),
      fn: () => buyMB(ai)
    });
  }

  // Kingdom (unlocked when MB >= 3)
  if (mbCount >= 3) {
    allOptions.push({
      name: 'kingdom',
      pctIncrease: pctInc(ai.kingdomPower, kingdomCount),
      cost: getKingdomCost(ai),
      affordable: ai.coins.gte(getKingdomCost(ai)),
      fn: () => buyKingdom(ai)
    });
  }

  // Empire (unlocked when kingdom >= 3)
  if (kingdomCount >= 3) {
    allOptions.push({
      name: 'empire',
      pctIncrease: pctInc(ai.empirePower, empireCount),
      cost: getEmpireCost(ai),
      affordable: ai.coins.gte(getEmpireCost(ai)),
      fn: () => buyEmpire(ai)
    });
  }

  if (allOptions.length === 0) {
    return null;
  }

  // Sort by percentage increase (highest first)
  allOptions.sort((a, b) => b.pctIncrease - a.pctIncrease);

  const ideal = allOptions[0];

  if (shouldDebug) {
    debugLogs.push({
      day: currentDay,
      type: 'pct_decision',
      coins: coins,
      ideal: ideal.name,
      idealPct: ideal.pctIncrease,
      idealCost: ideal.cost,
      idealAffordable: ideal.affordable,
      options: allOptions.map(o => ({ name: o.name, pct: o.pctIncrease, cost: o.cost, affordable: o.affordable }))
    });
  }

  // If ideal is unaffordable, don't buy anything - save for it
  if (!ideal.affordable) {
    // Track that we're waiting
    const waitKey = `waiting_for_${ideal.name}`;
    pctModeChoices[waitKey] = (pctModeChoices[waitKey] || 0) + 1;
    return null;
  }

  // Track the choice
  const key = `${ideal.name}`;
  pctModeChoices[key] = (pctModeChoices[key] || 0) + 1;

  // Track when pct choice differs from normal
  if (normalChoice && normalChoice !== ideal.name) {
    const diffKey = `${normalChoice}->${ideal.name}`;
    pctModeChoices[diffKey] = (pctModeChoices[diffKey] || 0) + 1;
  }

  return ideal;
}

/**
 * Select best ECONOMY building using percentage-based priority
 * Chooses among farm, plantation, colony based on which gives highest % increase
 * Returns the best economy action, or null if:
 *   - No economy buildings available
 *   - The ideal building (highest %) is unaffordable (should save for it)
 */
function getBestEconomyByPercentage(ai, normalChoice = null) {
  const farmCount = getCount(ai, "farm");
  const plantationCount = getCount(ai, "plantation");
  const colonyCount = getCount(ai, "colony");

  // Helper: percentage increase is infinite when count is 0
  function pctInc(power, count) {
    if (count === 0) return Infinity;
    return power / count;
  }

  // Calculate ALL economy buildings by percentage (including unaffordable)
  const allOptions = [];

  // Farm (always available)
  allOptions.push({
    name: 'farm',
    pctIncrease: pctInc(ai.fp, farmCount),
    cost: getFarmCost(ai),
    affordable: ai.coins.gte(getFarmCost(ai)),
    fn: () => buyFarm(ai)
  });

  // Plantation (unlocked when farm >= 3)
  if (farmCount >= 3) {
    allOptions.push({
      name: 'plantation',
      pctIncrease: pctInc(ai.pp, plantationCount),
      cost: getPlantationCost(ai),
      affordable: ai.coins.gte(getPlantationCost(ai)),
      fn: () => buyPlantation(ai)
    });
  }

  // Colony (unlocked when plantation >= 3)
  if (plantationCount >= 3) {
    allOptions.push({
      name: 'colony',
      pctIncrease: pctInc(1, colonyCount),
      cost: getColonyCost(ai),
      affordable: ai.coins.gte(getColonyCost(ai)),
      fn: () => buyColony(ai)
    });
  }

  if (allOptions.length === 0) {
    return null;
  }

  // Sort by percentage increase (highest first)
  allOptions.sort((a, b) => b.pctIncrease - a.pctIncrease);

  const ideal = allOptions[0];

  // If ideal is unaffordable, don't buy anything - save for it
  if (!ideal.affordable) {
    const waitKey = `waiting_for_${ideal.name}`;
    pctModeChoices[waitKey] = (pctModeChoices[waitKey] || 0) + 1;
    return null;
  }

  // Track the choice
  const key = `econ_${ideal.name}`;
  pctModeChoices[key] = (pctModeChoices[key] || 0) + 1;

  // Track when pct choice differs from normal
  if (normalChoice && normalChoice !== ideal.name) {
    const diffKey = `${normalChoice}->${ideal.name}`;
    pctModeChoices[diffKey] = (pctModeChoices[diffKey] || 0) + 1;
  }

  return ideal;
}

// ============================================================================
// MODIFIED AI (with percentage priority mode)
// ============================================================================

/**
 * Run AI for one day with optional percentage priority mode
 * @param {number} trainOverrideRatio - if train score > recruit score * this, train overrides priority mode (0 = disabled)
 */
function runAIDayWithPriority(ai, clicks, threshold, noStarve = false, trainOverrideRatio = 50000) {
  const VAL_SL = PARAMS.VAL_SL;
  const FARM_THRESHOLD = PARAMS.FARM_THRESHOLD;
  const trainMult = PARAMS.TRAIN_MULT;
  const tierMult = PARAMS.TIER_MULT;

  const VAL_BARRACKS = tierMult * VAL_SL;
  const VAL_MB = tierMult * VAL_BARRACKS;
  const VAL_KINGDOM = tierMult * VAL_MB;
  const VAL_EMPIRE = tierMult * VAL_KINGDOM;

  // Helper functions (same as regular AI)
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

  function doesSLHelp(targetCost, coins, incomePerDay) {
    if (!doesRecruitHelp(targetCost, coins, incomePerDay)) return false;
    if (!slBetterThanRecruit(ai, targetCost)) return false;
    if (ai.coins.lt(getSLCost(ai))) return false;
    return true;
  }

  function doesBarracksHelp(targetCost, coins, incomePerDay) {
    if (!doesSLHelp(targetCost, coins, incomePerDay)) return false;
    if (!barracksBetterThanSL(ai, targetCost)) return false;
    if (ai.coins.lt(getBarracksCost(ai))) return false;
    if (getCount(ai, "squad_leader") < 3) return false;
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

  // Main loop
  for (let iteration = 0; iteration < clicks; iteration++) {
    let coins = ai.coins.toNumber();
    let troopCount = ai.troops.toNumber();
    let ppt = ai.ppt;
    let incomePerDay = (troopCount * ppt * 4) + clicks;

    // No troops - must recruit or beg
    if (troopCount < 1) {
      if (ai.coins.gte(getRecruitCost(ai))) {
        recruit(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    // Food metrics
    let farmProd = getCount(ai, "farm") * C.farm_production;
    let netConsume = (troopCount * C.food_perTroopDay) - farmProd;
    let foodBuffer = ai.food.toNumber();
    let daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    let fCost = getFarmCost(ai);
    let daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    let foodEmergency = !noStarve && (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

    // Food emergency - always handle normally
    if (foodEmergency) {
      if (ai.coins.gte(fCost)) {
        buyFarm(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    // CHECK: Are we in percentage-based priority mode?
    const inPriorityMode = threshold > 0 && shouldUsePercentagePriority(ai, threshold);
    const hasBeenInPriority = threshold > 0 && getHasEverBeenInPriorityMode();

    // Otherwise use normal strategy...
    let recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
    let urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);
    let VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
    let VAL_PLANTATION = tierMult * VAL_FARM;
    let VAL_COLONY = tierMult * VAL_PLANTATION;

    let isAlmostEmergency = !noStarve && recruitCausesSuperEmergency(coins, fCost);

    let actions = [];

    if (!isAlmostEmergency) {
      // Train
      if (troopCount >= 5) {
        const cost = getTrainCost(ai);
        const value = troopCount * ppt * trainMult;
        const score = calcScore(cost, value, coins, incomePerDay, true);
        if (score > 0) actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }

      // Recruit
      {
        const cost = getRecruitCost(ai);
        const value = ai.rp * ppt;
        const maxSustainable = farmProd / C.food_perTroopDay;
        const newStrain = (!noStarve && maxSustainable > 0) ? (troopCount + ai.rp) / maxSustainable : 0;
        const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
        let score = calcScore(cost, value, coins, incomePerDay, true);
        score -= strainPenalty;
        if (score > 0) actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }

      // Squad Leader
      if (troopCount >= 2) {
        const cost = getSLCost(ai);
        const value = ai.squadLeaderPower * VAL_SL * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'squad_leader', score, cost, fn: () => buySL(ai) });
      }

      // Barracks
      if (getCount(ai, "squad_leader") >= 3) {
        const cost = getBarracksCost(ai);
        const value = ai.barracksPower * VAL_BARRACKS * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }

      // Military Base
      if (getCount(ai, "barracks") >= 3) {
        const cost = getMBCost(ai);
        const value = ai.militaryBasePower * VAL_MB * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'military_base', score, cost, fn: () => buyMB(ai) });
      }

      // Kingdom
      if (getCount(ai, "military_base") >= 3) {
        const cost = getKingdomCost(ai);
        const value = ai.kingdomPower * VAL_KINGDOM * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }

      // Empire
      if (getCount(ai, "kingdom") >= 3) {
        const cost = getEmpireCost(ai);
        const value = ai.empirePower * VAL_EMPIRE * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }

    // Economy actions
    if (!noStarve) {
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
    }

    if (actions.length === 0) {
      beg(ai);
      continue;
    }

    actions.sort((a, b) => b.score - a.score);

    const best = actions[0];
    const bestIsArmyBuilding = ['squad_leader', 'barracks', 'military_base', 'kingdom', 'empire'].includes(best.name);
    const bestIsEconomy = ['farm', 'plantation', 'colony'].includes(best.name);
    const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
    const bestIsUnaffordable = bestIsBuilding && best.cost > coins;

    // Debug logging for when we have 13 empires
    const empireCount = getCount(ai, "empire");
    if (debugEmpireCount && empireCount === 13) {
      debugLogs.push({
        day: currentDay,
        type: 'main_decision',
        coins: coins,
        bestAction: best.name,
        bestScore: best.score,
        bestCost: best.cost,
        bestIsArmyBuilding,
        bestIsEconomy,
        bestIsUnaffordable,
        inPriorityMode,
        hasBeenInPriority,
        empireCost: getEmpireCost(ai),
        empireAffordable: ai.coins.gte(getEmpireCost(ai)),
        actions: actions.slice(0, 5).map(a => ({ name: a.name, score: a.score, cost: a.cost }))
      });
    }

    // PERCENTAGE PRIORITY MODE LOGIC:
    // 1. If normal mode wants economy, use percentage-based economy selection
    // 2. If normal mode wants army, use percentage-based army selection
    // 3. After leaving priority mode: only allow train/economy, army buildings force re-entry

    if (inPriorityMode && bestIsEconomy && !bestIsUnaffordable) {
      // In priority mode and normal mode wants economy - use percentage-based economy selection
      const pctBest = getBestEconomyByPercentage(ai, best.name);
      if (pctBest && pctBest.fn()) {
        continue;
      }
    }

    if (inPriorityMode && !bestIsEconomy && !bestIsUnaffordable) {
      // In priority mode and normal mode wants army - use percentage-based army selection
      const pctBest = getBestBuildingByPercentage(ai, best.name);
      if (pctBest && pctBest.fn()) {
        continue;
      }
    }

    if (!inPriorityMode && hasBeenInPriority && bestIsArmyBuilding && !bestIsUnaffordable) {
      // Left priority mode, but want to buy army building
      // Check if we can re-enter priority mode for this purchase
      if (checkPriorityModeEligible(ai, threshold)) {
        // Re-enter and use percentage selection
        const pctBest = getBestBuildingByPercentage(ai, best.name);
        if (pctBest && pctBest.fn()) {
          continue;
        }
      } else {
        // Can't re-enter - do train instead if possible, otherwise skip to next action
        if (troopCount >= 5 && ai.coins.gte(getTrainCost(ai))) {
          train(ai);
          continue;
        }
        // Fall through to try other actions (economy, etc.)
      }
    }

    if (bestIsUnaffordable) {
      if (isAlmostEmergency) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      const bestIsEconomy = !noStarve && (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');

      if (bestIsEconomy) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      if (doesBarracksHelp(best.cost, coins, incomePerDay)) {
        buyBarracks(ai);
        continue;
      }

      if (doesSLHelp(best.cost, coins, incomePerDay)) {
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

    if (best.name === 'recruit') {
      const targetCost = findBestMilitaryTarget(ai);
      if (targetCost > 0) {
        if (doesBarracksHelp(targetCost, coins, incomePerDay)) {
          buyBarracks(ai);
          continue;
        }
        if (slBetterThanRecruit(ai, targetCost) && ai.coins.gte(getSLCost(ai))) {
          buySL(ai);
          continue;
        }
      }
    }

    let executed = false;
    for (const action of actions) {
      if (action.name !== 'farm' && !noStarve) {
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

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

function simDayWithPriority(ai, clicks, threshold, trainOverrideRatio = 50000) {
  runAIDayWithPriority(ai, clicks, threshold, false, trainOverrideRatio);

  // Passive loot
  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  // Food production and consumption
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);

  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  // Starvation
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

function runSimWithPriority(days, clicksPerDay, threshold) {
  const ai = createAIState();

  for (let day = 1; day <= days; day++) {
    simDayWithPriority(ai, clicksPerDay, threshold);
  }

  return ai;
}

// ============================================================================
// MAIN COMPARISON
// ============================================================================

function formatNumber(n) {
  if (n >= 1e15) return n.toExponential(2);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(0);
}

function getSnapshot(ai) {
  const power = ai.troops.toNumber() * ai.ppt;
  return {
    power,
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    sl: getCount(ai, "squad_leader"),
    barracks: getCount(ai, "barracks"),
    mb: getCount(ai, "military_base"),
    kingdom: getCount(ai, "kingdom"),
    empire: getCount(ai, "empire"),
    farms: getCount(ai, "farm"),
    plantations: getCount(ai, "plantation"),
    colonies: getCount(ai, "colony"),
  };
}

function runSimWithSnapshots(days, clicksPerDay, threshold, snapshotInterval = 100, trainOverrideRatio = 50000) {
  const ai = createAIState();
  const snapshots = [];
  resetModeTracking();
  resetPctModeChoices();
  resetPhaseTracker();

  for (let day = 1; day <= days; day++) {
    setCurrentDay(day);
    simDayWithPriority(ai, clicksPerDay, threshold, trainOverrideRatio);

    if (day % snapshotInterval === 0) {
      snapshots.push({
        day,
        ...getSnapshot(ai)
      });
    }
  }

  return { ai, snapshots, transitions: getModeTransitions(), pctChoices: getPctModeChoices(), phaseStats: getPhaseTracker() };
}

function runFullComparison() {
  const fs = require('fs');

  const DAYS = 1000;
  const CLICKS = 25;
  const SNAPSHOT_INTERVAL = 100;

  // Strategy configurations: [threshold, trainOverrideRatio, label]
  // threshold=0 means baseline (no priority switching)
  // Lower threshold = more aggressive (easier to enter priority mode)
  // e.g., x0.5 means enter when recruit+empire < coins/0.5 = coins*2
  const strategies = [
    [0, 0, 'Baseline'],
    [0.1, 0, 'x0.1'],
    [0.09, 0, 'x0.09'],
    [0.08, 0, 'x0.08'],
    [0.07, 0, 'x0.07'],
    [0.06, 0, 'x0.06'],
    [0.05, 0, 'x0.05'],
    [0.04, 0, 'x0.04'],
    [0.03, 0, 'x0.03'],
    [0.02, 0, 'x0.02'],
    [0.01, 0, 'x0.01'],
  ];

  console.log(`\n=== Percentage-Based Priority Comparison ===`);
  console.log(`Days: ${DAYS}, Clicks/day: ${CLICKS}, Snapshot every: ${SNAPSHOT_INTERVAL} days`);
  console.log(`\nThreshold: switch to % priority when recruit + empire cost < coins / threshold`);
  console.log(`+T suffix: train overrides priority when trainScore > recruitScore * 50000`);
  console.log(`+T10k/T100k: train override at 10000/100000 ratio\n`);

  const allResults = {};
  const allTransitions = {};
  const labels = strategies.map(s => s[2]);

  const allPctChoices = {};

  for (const [threshold, trainOverride, label] of strategies) {
    debugCounter = 0;
    process.stdout.write(`Running ${label}...`);

    const { ai, snapshots, transitions, pctChoices } = runSimWithSnapshots(DAYS, CLICKS, threshold, SNAPSHOT_INTERVAL, trainOverride);

    allResults[label] = snapshots;
    allTransitions[label] = transitions;
    allPctChoices[label] = pctChoices;

    let debugInfo = '';
    if (debugCounter > 0) {
      debugInfo = ` (priority mode: ${debugCounter} clicks, ${transitions.length} transitions)`;
      // Show what percentage mode chose
      const choices = Object.entries(pctChoices)
        .filter(([k, v]) => !k.includes('->'))
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      if (choices) {
        debugInfo += `\n    Pct choices: ${choices}`;
      }
      // Show overrides (where pct differed from normal)
      const overrides = Object.entries(pctChoices)
        .filter(([k, v]) => k.includes('->'))
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      if (overrides) {
        debugInfo += `\n    Overrides: ${overrides}`;
      }
    }
    console.log(` Done (${snapshots.length} snapshots)${debugInfo}`);
  }

  // Build output data
  const output = {
    config: {
      days: DAYS,
      clicksPerDay: CLICKS,
      snapshotInterval: SNAPSHOT_INTERVAL,
      strategies: strategies.map(s => ({ threshold: s[0], trainOverride: s[1], label: s[2] }))
    },
    snapshots: allResults
  };

  // Save to JSON
  const jsonPath = __dirname + '/percentage-priority-results.json';
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved JSON to: ${jsonPath}`);

  // Also save a readable text table
  const txtPath = __dirname + '/percentage-priority-results.txt';
  let txt = `Percentage-Based Priority Comparison\n`;
  txt += `Days: ${DAYS}, Clicks/day: ${CLICKS}, Snapshot every: ${SNAPSHOT_INTERVAL} days\n`;
  txt += `${'='.repeat(160)}\n\n`;

  // Header
  txt += `${'Day'.padStart(6)} | `;
  for (const label of labels) {
    txt += `${label.padStart(14)} | `;
  }
  txt += '\n' + '-'.repeat(160) + '\n';

  // Data rows (power comparison)
  txt += '\nPOWER:\n';
  const numSnapshots = allResults['Baseline'].length;
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].power).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nTROOPS:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].troops).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nPPT:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].ppt).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nSQUAD LEADERS:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].sl).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nBARRACKS:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].barracks).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nMILITARY BASES:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].mb).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nKINGDOMS:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].kingdom).padStart(14)} | `;
    }
    txt += '\n';
  }

  txt += '\n\nEMPIRES:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      txt += `${formatNumber(allResults[label][i].empire).padStart(14)} | `;
    }
    txt += '\n';
  }

  // Power ratio vs baseline
  txt += '\n\nPOWER RATIO vs BASELINE:\n';
  for (let i = 0; i < numSnapshots; i++) {
    const day = allResults['Baseline'][i].day;
    const basePower = allResults['Baseline'][i].power;
    txt += `${day.toString().padStart(6)} | `;
    for (const label of labels) {
      const ratio = allResults[label][i].power / basePower;
      const pct = ((ratio - 1) * 100).toFixed(1);
      const str = ratio >= 1 ? `+${pct}%` : `${pct}%`;
      txt += `${str.padStart(14)} | `;
    }
    txt += '\n';
  }

  fs.writeFileSync(txtPath, txt);
  console.log(`Saved TXT to: ${txtPath}`);

  // Save HTML version
  const htmlPath = __dirname + '/percentage-priority-results.html';
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Percentage-Based Priority Comparison</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1, h2, h3 { color: #fff; }
    .config {
      background: #16213e;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 30px;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #333;
      padding: 8px 12px;
      text-align: right;
    }
    th {
      background: #0f3460;
      color: #fff;
      position: sticky;
      top: 0;
    }
    td:first-child, th:first-child {
      text-align: left;
      background: #16213e;
      font-weight: bold;
    }
    tr:nth-child(even) { background: #1a1a2e; }
    tr:nth-child(odd) { background: #16213e; }
    tr:hover { background: #0f3460; }
    .positive { color: #4ade80; }
    .negative { color: #f87171; }
    .neutral { color: #94a3b8; }
    .best { background: #166534 !important; }
    .worst { background: #991b1b !important; }
    .section { margin-top: 40px; }
    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .tab {
      padding: 10px 20px;
      background: #16213e;
      border: none;
      color: #fff;
      cursor: pointer;
      border-radius: 5px;
    }
    .tab:hover { background: #0f3460; }
    .tab.active { background: #e94560; }
    .data-section { display: none; }
    .data-section.active { display: block; }
  </style>
</head>
<body>
  <h1>Percentage-Based Priority Comparison</h1>

  <div class="config">
    <strong>Configuration:</strong> ${DAYS} days, ${CLICKS} clicks/day, snapshot every ${SNAPSHOT_INTERVAL} days<br>
    <strong>Threshold meaning:</strong> Switch to % priority when recruit + empire cost &lt; coins / threshold
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showSection('power')">Power</button>
    <button class="tab" onclick="showSection('ratio')">vs Baseline</button>
    <button class="tab" onclick="showSection('troops')">Troops</button>
    <button class="tab" onclick="showSection('ppt')">PPT</button>
    <button class="tab" onclick="showSection('sl')">Squad Leaders</button>
    <button class="tab" onclick="showSection('barracks')">Barracks</button>
    <button class="tab" onclick="showSection('mb')">Military Bases</button>
    <button class="tab" onclick="showSection('kingdom')">Kingdoms</button>
    <button class="tab" onclick="showSection('empire')">Empires</button>
    <button class="tab" onclick="showSection('transitions')">Mode Transitions</button>
  </div>
`;

  function generateTable(metric, title, formatter = formatNumber) {
    let tableHtml = `<div id="${metric}" class="data-section${metric === 'power' ? ' active' : ''}">
    <h2>${title}</h2>
    <table>
      <tr><th>Day</th>`;

    for (const label of labels) {
      tableHtml += `<th>${label}</th>`;
    }
    tableHtml += '</tr>\n';

    for (let i = 0; i < numSnapshots; i++) {
      const day = allResults['Baseline'][i].day;
      tableHtml += `<tr><td>${day}</td>`;

      // Find best and worst for this row
      let bestVal = -Infinity, worstVal = Infinity;
      let bestLabel = '', worstLabel = '';

      for (const label of labels) {
        const val = allResults[label][i][metric];
        if (val > bestVal) { bestVal = val; bestLabel = label; }
        if (val < worstVal) { worstVal = val; worstLabel = label; }
      }

      for (const label of labels) {
        const val = allResults[label][i][metric];
        let cls = '';
        if (label === bestLabel && bestVal !== worstVal) cls = 'best';
        else if (label === worstLabel && bestVal !== worstVal) cls = 'worst';
        tableHtml += `<td class="${cls}">${formatter(val)}</td>`;
      }
      tableHtml += '</tr>\n';
    }
    tableHtml += '</table></div>\n';
    return tableHtml;
  }

  function generateRatioTable() {
    let tableHtml = `<div id="ratio" class="data-section">
    <h2>Power Ratio vs Baseline</h2>
    <table>
      <tr><th>Day</th>`;

    for (const label of labels) {
      tableHtml += `<th>${label}</th>`;
    }
    tableHtml += '</tr>\n';

    for (let i = 0; i < numSnapshots; i++) {
      const day = allResults['Baseline'][i].day;
      const basePower = allResults['Baseline'][i].power;
      tableHtml += `<tr><td>${day}</td>`;

      for (const label of labels) {
        const val = allResults[label][i].power;
        const ratio = val / basePower;
        const pct = ((ratio - 1) * 100).toFixed(1);
        let cls = ratio > 1 ? 'positive' : ratio < 1 ? 'negative' : 'neutral';
        const str = ratio >= 1 ? `+${pct}%` : `${pct}%`;
        tableHtml += `<td class="${cls}">${str}</td>`;
      }
      tableHtml += '</tr>\n';
    }
    tableHtml += '</table></div>\n';
    return tableHtml;
  }

  html += generateTable('power', 'Power');
  html += generateRatioTable();
  html += generateTable('troops', 'Troops');
  html += generateTable('ppt', 'PPT (Power Per Troop)');
  html += generateTable('sl', 'Squad Leaders');
  html += generateTable('barracks', 'Barracks');
  html += generateTable('mb', 'Military Bases');
  html += generateTable('kingdom', 'Kingdoms');
  html += generateTable('empire', 'Empires');

  // Generate transitions section
  let transitionsHtml = `<div id="transitions" class="data-section">
    <h2>Percentage Priority Mode Transitions</h2>
    <p>Shows when each strategy entered/exited percentage priority mode.</p>
`;

  for (const label of labels) {
    const transitions = allTransitions[label] || [];
    transitionsHtml += `<h3>${label}</h3>`;

    if (transitions.length === 0) {
      transitionsHtml += `<p style="color: #94a3b8;">No transitions (never entered percentage priority mode)</p>`;
    } else {
      transitionsHtml += `<table style="width: auto;">
        <tr><th>Day</th><th>Action</th><th>Coins</th><th>Recruit Cost</th><th>Empire Cost</th></tr>`;

      for (const t of transitions) {
        const action = t.entered ? '<span class="positive">ENTER</span>' : '<span class="negative">EXIT</span>';
        transitionsHtml += `<tr>
          <td>${t.day}</td>
          <td>${action}</td>
          <td>${formatNumber(t.coins)}</td>
          <td>${formatNumber(t.recruitCost)}</td>
          <td>${formatNumber(t.empireCost)}</td>
        </tr>`;
      }
      transitionsHtml += `</table>`;
    }
  }
  transitionsHtml += `</div>`;
  html += transitionsHtml;

  html += `
  <script>
    function showSection(id) {
      document.querySelectorAll('.data-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`Saved HTML to: ${htmlPath}`);

  // Print final summary to console
  console.log(`\n${'='.repeat(120)}`);
  console.log(`FINAL RESULTS (Day ${DAYS})`);
  console.log(`${'='.repeat(120)}`);

  const finalResults = labels.map(label => ({
    label,
    ...allResults[label][numSnapshots - 1]
  }));
  finalResults.sort((a, b) => b.power - a.power);

  const baseline = finalResults.find(r => r.label === 'Baseline');

  console.log(`\n${'Strategy'.padEnd(12)} | ${'Power'.padStart(15)} | ${'vs Base'.padStart(8)} | ${'Troops'.padStart(12)} | ${'PPT'.padStart(12)} | ${'SL'.padStart(8)} | ${'Bar'.padStart(6)} | ${'MB'.padStart(6)} | ${'King'.padStart(6)} | ${'Emp'.padStart(6)}`);
  console.log('-'.repeat(120));

  for (const r of finalResults) {
    const ratio = r.power / baseline.power;
    const ratioStr = ratio >= 1 ? `+${((ratio - 1) * 100).toFixed(1)}%` : `${((ratio - 1) * 100).toFixed(1)}%`;

    console.log(
      `${r.label.padEnd(12)} | ` +
      `${formatNumber(r.power).padStart(15)} | ` +
      `${ratioStr.padStart(8)} | ` +
      `${formatNumber(r.troops).padStart(12)} | ` +
      `${formatNumber(r.ppt).padStart(12)} | ` +
      `${formatNumber(r.sl).padStart(8)} | ` +
      `${formatNumber(r.barracks).padStart(6)} | ` +
      `${formatNumber(r.mb).padStart(6)} | ` +
      `${formatNumber(r.kingdom).padStart(6)} | ` +
      `${formatNumber(r.empire).padStart(6)}`
    );
  }
}

// Check command line args
const args = process.argv.slice(2);
if (args.includes('--debug-empire')) {
  // Run debug mode for x1 strategy
  const fs = require('fs');
  console.log('Running x1 with empire debug logging enabled...');

  setDebugEmpireCount(true);
  resetModeTracking();
  resetPctModeChoices();

  const ai = createAIState();
  const DAYS = 1000;
  const CLICKS = 25;
  const threshold = 1;  // x1 strategy

  for (let day = 1; day <= DAYS; day++) {
    setCurrentDay(day);
    simDayWithPriority(ai, CLICKS, threshold, 0);
  }

  const logs = getDebugLogs();
  console.log(`\nCollected ${logs.length} debug entries when empireCount=13`);

  // Group by day
  const byDay = {};
  for (const log of logs) {
    if (!byDay[log.day]) byDay[log.day] = [];
    byDay[log.day].push(log);
  }

  // Find interesting patterns
  const days = Object.keys(byDay).map(Number).sort((a,b) => a-b);
  console.log(`\nDays with empireCount=13: ${days[0]} to ${days[days.length-1]}`);
  console.log(`Total clicks in this range: ${logs.length}`);

  // Summarize what actions are being taken
  const actionCounts = {};
  const waitingCounts = {};
  for (const log of logs) {
    if (log.type === 'main_decision') {
      actionCounts[log.bestAction] = (actionCounts[log.bestAction] || 0) + 1;
    }
    if (log.type === 'pct_decision' && !log.idealAffordable) {
      const key = `waiting_for_${log.ideal}`;
      waitingCounts[key] = (waitingCounts[key] || 0) + 1;
    }
  }

  console.log('\nWhat normal strategy wants to do:');
  for (const [action, count] of Object.entries(actionCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${action}: ${count}`);
  }

  console.log('\nWaiting periods in percentage mode:');
  for (const [action, count] of Object.entries(waitingCounts).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${action}: ${count}`);
  }

  // Show first few and last few decisions at each boundary
  console.log('\n--- First 5 decisions at day ' + days[0] + ' ---');
  const firstDay = byDay[days[0]] || [];
  for (const log of firstDay.slice(0, 5)) {
    if (log.type === 'main_decision') {
      console.log(`  Best: ${log.bestAction} (score: ${log.bestScore?.toFixed(2)}, cost: ${log.bestCost})`);
      console.log(`    inPriorityMode: ${log.inPriorityMode}, hasBeenInPriority: ${log.hasBeenInPriority}`);
      console.log(`    Empire cost: ${log.empireCost}, affordable: ${log.empireAffordable}`);
    } else if (log.type === 'pct_decision') {
      console.log(`  Pct ideal: ${log.ideal} (${log.idealPct.toFixed(4)} = ${(log.idealPct*100).toFixed(2)}%), affordable: ${log.idealAffordable}`);
    }
  }

  console.log('\n--- Last 5 decisions before buying empire 14 ---');
  const lastDay = byDay[days[days.length-1]] || [];
  for (const log of lastDay.slice(-5)) {
    if (log.type === 'main_decision') {
      console.log(`  Best: ${log.bestAction} (score: ${log.bestScore?.toFixed(2)}, cost: ${log.bestCost})`);
      console.log(`    inPriorityMode: ${log.inPriorityMode}, hasBeenInPriority: ${log.hasBeenInPriority}`);
      console.log(`    Empire cost: ${log.empireCost}, affordable: ${log.empireAffordable}`);
    } else if (log.type === 'pct_decision') {
      console.log(`  Pct ideal: ${log.ideal} (${log.idealPct.toFixed(4)} = ${(log.idealPct*100).toFixed(2)}%), affordable: ${log.idealAffordable}`);
    }
  }

  // Save full debug logs to file
  const debugPath = __dirname + '/debug-empire-13.json';
  fs.writeFileSync(debugPath, JSON.stringify(logs.slice(0, 200), null, 2));  // First 200 entries
  console.log(`\nSaved first 200 debug entries to: ${debugPath}`);

} else {
  runFullComparison();
}
