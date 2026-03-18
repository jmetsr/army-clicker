/**
 * Scoring & Decision Logic
 *
 * This module contains the core AI decision-making logic:
 * - calcScore: Unified scoring formula for all actions
 * - Food emergency detection
 * - Helper functions for determining when actions "help" reach goals
 */

const { C, PARAMS } = require('./constants');
const { getFarmCost, getRecruitCost, getTrainCost, getSLCost, getBarracksCost,
        getMBCost, getKingdomCost, getEmpireCost, getCount } = require('./costs');

// =============================================================================
// CORE SCORING FUNCTION
// =============================================================================

/**
 * Calculate the score for a potential action
 *
 * MATCHES GAME LOGIC EXACTLY:
 *   baseScore = value / sqrt(costPct)
 *   if unaffordable: baseScore *= decay^daysToWait
 *   if isImmediate: baseScore *= NO_INFLATE_BONUS
 *
 * @param {number} cost - Cost of the action
 * @param {number} value - Value of the action
 * @param {number} coins - Current coins
 * @param {number} incomePerDay - Expected daily income
 * @param {boolean} isImmediate - True if train/recruit (no cost pool inflation)
 * @returns {number} Score (higher = better action)
 */
function calcScore(cost, value, coins, incomePerDay, isImmediate) {
  if (cost <= 0) return -1;

  const currentCoins = Math.max(coins, 1);
  const costPct = cost / currentCoins;

  const penalty = Math.sqrt(costPct);
  let baseScore = value / penalty;

  if (costPct > 1) {
    const coinsNeeded = cost - currentCoins;
    const daysToWait = coinsNeeded / Math.max(incomePerDay, 1);
    baseScore *= Math.pow(PARAMS.WAIT_DECAY, daysToWait);
  }

  if (isImmediate) {
    baseScore *= PARAMS.NO_INFLATE_BONUS;
  }

  return baseScore;
}

// =============================================================================
// FOOD EMERGENCY DETECTION
// =============================================================================

/**
 * Calculate food situation metrics
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Clicks available this day
 * @returns {Object} Food metrics
 */
function getFoodMetrics(ai, clicks) {
  const troopCount = ai.troops.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const dailyConsume = troopCount * C.food_perTroopDay;
  const netConsume = dailyConsume - farmProd;
  const foodBuffer = ai.food.toNumber();
  const coins = ai.coins.toNumber();
  const ppt = ai.ppt;

  // How many days until we run out of food?
  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;

  // How much income do we generate per day?
  const incomePerDay = (troopCount * ppt * 4) + clicks;

  // How many days until we can afford a farm?
  const farmCost = getFarmCost(ai);
  const daysToAffordFarm = farmCost > coins ? (farmCost - coins) / Math.max(incomePerDay, 1) : 0;

  // Emergency: can't afford farm before food runs out
  const isEmergency = (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

  return {
    coins,
    troopCount,
    farmProd,
    dailyConsume,
    netConsume,
    foodBuffer,
    daysOfFood,
    incomePerDay,
    farmCost,
    daysToAffordFarm,
    isEmergency,
  };
}

/**
 * Check if spending X coins would cause a food emergency
 *
 * This prevents the AI from buying something expensive (like an SL)
 * when it should be saving for a farm.
 *
 * @param {Object} ai - AI state
 * @param {number} spendAmount - Amount of coins to spend
 * @param {number} clicks - Clicks per day (for income calculation)
 * @returns {boolean} True if spending would cause emergency
 */
function wouldSpendingCauseEmergency(ai, spendAmount, clicks) {
  const troopCount = ai.troops.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const netConsume = (troopCount * C.food_perTroopDay) - farmProd;

  // If we're not consuming more than we produce, no emergency possible
  if (netConsume <= 0) return false;

  const foodBuffer = ai.food.toNumber();
  const daysOfFood = foodBuffer / netConsume;

  const coins = ai.coins.toNumber();
  const coinsAfterSpend = coins - spendAmount;
  const incomePerDay = (troopCount * ai.ppt * 4) + clicks;

  const farmCost = getFarmCost(ai);
  const daysToAffordFarm = farmCost > coinsAfterSpend
    ? (farmCost - coinsAfterSpend) / Math.max(incomePerDay, 1)
    : 0;

  // Would we be unable to afford farm before food runs out?
  return daysToAffordFarm > daysOfFood;
}

/**
 * Check if recruiting would cause a SUPER emergency
 *
 * Super emergency = recruiting would make it impossible to buy enough farms
 * to survive. This is a hard veto on recruiting.
 *
 * @param {Object} ai - AI state
 * @returns {boolean} True if recruiting would cause super emergency
 */
function wouldRecruitCauseSuperEmergency(ai) {
  const troopCount = ai.troops.toNumber();
  const coins = ai.coins.toNumber();
  const farmCost = getFarmCost(ai);

  // Calculate state AFTER recruiting
  const newTroops = troopCount + ai.rp;
  const newConsume = newTroops * C.food_perTroopDay;
  const currentFarmProd = getCount(ai, "farm") * C.farm_production;

  // If farms already sustain new consumption, we're fine
  if (currentFarmProd >= newConsume) return false;

  // Check food buffer
  const deficit = newConsume - currentFarmProd;
  const foodBuffer = ai.food.toNumber();
  const daysOfBuffer = deficit > 0 ? foodBuffer / deficit : 999;

  // If we have 50+ days of food buffer, not an emergency
  if (daysOfBuffer > 50) return false;

  // Check if we can afford enough farms
  const farmsNeeded = Math.ceil(newConsume / C.farm_production);
  const farmsHave = getCount(ai, "farm");
  const farmsToBuy = farmsNeeded - farmsHave;
  const costToBuyFarms = farmsToBuy * farmCost; // Simplified estimate

  // If we can afford the farms needed, not an emergency
  if (coins >= costToBuyFarms) return false;

  // If buffer is low and can't afford farms, it's a super emergency
  return daysOfBuffer < 20;
}

// =============================================================================
// "HELPS REACH TARGET" CALCULATIONS
// =============================================================================

/**
 * Check if recruiting would help reach a target cost faster
 *
 * Logic: Does the increased income from more troops offset the recruit cost?
 *
 * @param {Object} ai - AI state
 * @param {number} targetCost - Cost we're trying to reach
 * @param {number} coins - Current coins
 * @param {number} incomePerDay - Current income per day
 * @param {number} clicks - Clicks per day
 * @returns {boolean} True if recruiting helps
 */
function doesRecruitHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Check if we can afford to recruit
  const recruitCost = getRecruitCost(ai);
  if (ai.coins.lt(recruitCost)) return false;

  // Check if recruiting would cause emergency
  if (wouldRecruitCauseSuperEmergency(ai)) return false;

  // Days to reach target without recruiting
  const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);

  // Days to reach target WITH recruiting
  const troopCount = ai.troops.toNumber();
  const newIncomeWithRecruit = ((troopCount + ai.rp) * ai.ppt * 4) + clicks;
  const daysWithRecruit = (targetCost - coins + recruitCost) / Math.max(newIncomeWithRecruit, 1);

  // Recruiting helps if it gets us there faster
  return daysWithRecruit < daysToReach;
}

/**
 * Check if training would help reach a target cost faster
 *
 * Logic: Does the increased ppt (more loot per troop) offset the train cost?
 *
 * @param {Object} ai - AI state
 * @param {number} targetCost - Cost we're trying to reach
 * @param {number} coins - Current coins
 * @param {number} incomePerDay - Current income per day
 * @param {number} clicks - Clicks per day
 * @returns {boolean} True if training helps
 */
function doesTrainHelp(ai, targetCost, coins, incomePerDay, clicks) {
  // Need at least 5 troops to train
  const troopCount = ai.troops.toNumber();
  if (troopCount < 5) return false;

  // Check if we can afford to train
  const { getTrainCost } = require('./costs');
  const trainCost = getTrainCost(ai);
  if (ai.coins.lt(trainCost)) return false;

  // Days to reach target without training
  const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);

  // Days to reach target WITH training
  const newIncomeWithTrain = (troopCount * ai.ppt * ai.trainMult * 4) + clicks;
  const daysWithTrain = (targetCost - coins + trainCost) / Math.max(newIncomeWithTrain, 1);

  // Training helps if it gets us there faster
  return daysWithTrain < daysToReach;
}

// =============================================================================
// URGENCY-BASED FARM VALUATION
// =============================================================================

/**
 * Calculate urgency metrics for food situation
 *
 * Urgency combines two factors:
 * 1. daysOfFood - how many days until current food buffer runs out
 * 2. recruitsUntil1DayStarve - how many recruits before we're 1 day from starving
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Clicks per day
 * @returns {Object} Urgency metrics including dynamic farm value
 */
function getUrgencyMetrics(ai, clicks) {
  const troopCount = ai.troops.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const foodBuffer = ai.food.toNumber();
  const netConsume = (troopCount * C.food_perTroopDay) - farmProd;

  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
  const urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);

  // Dynamic farm value based on urgency
  const VAL_FARM = PARAMS.VAL_SL * (PARAMS.FARM_THRESHOLD / Math.max(urgency, 1));
  const VAL_PLANTATION = PARAMS.TIER_MULT * VAL_FARM;
  const VAL_COLONY = PARAMS.TIER_MULT * VAL_PLANTATION;

  return {
    daysOfFood,
    recruitsUntil1DayStarve,
    urgency,
    VAL_FARM,
    VAL_PLANTATION,
    VAL_COLONY,
  };
}

// =============================================================================
// SL HELPER LOGIC
// =============================================================================

/**
 * Check if buying SL is better than just recruiting when saving for expensive building
 *
 * Logic: SL increases rp, so future recruits add more troops.
 * If we're going to recruit many times while saving, SL investment pays off.
 *
 * @param {Object} ai - AI state
 * @param {number} targetCost - Cost we're saving for
 * @returns {boolean} True if buying SL is better than recruiting
 */
function slBetterThanRecruit(ai, targetCost) {
  const slCost = getSLCost(ai);
  const recruitCost = getRecruitCost(ai);

  const slPower = ai.rp - 1;  // total SL contribution to rp
  const barracksPower = ai.squadLeaderPower - 1;  // barracks boost per SL

  // Percentage power gain from buying 1 more SL
  // As slPower grows large, this ratio approaches 1 (no benefit)
  const ratio = (1 + slPower + 1 + barracksPower) / (1 + slPower);

  const expectedRecruits = targetCost / (recruitCost * PARAMS.DIVISOR);
  // EXTRA gain, not total - subtract baseline of 1
  const gain = (ratio - 1) * expectedRecruits;

  // Cost in recruit-equivalents
  const cost = (slCost + targetCost * 0.04) / recruitCost;

  return gain > cost;
}

/**
 * Check if SL helps reach target (full check)
 * Combines: can afford, recruit helps, and SL is better than recruit
 *
 * @param {Object} ai - AI state
 * @param {number} targetCost - Cost we're saving for
 * @param {number} coins - Current coins
 * @param {number} incomePerDay - Daily income
 * @param {number} clicks - Clicks per day
 * @returns {boolean} True if buying SL helps reach target
 */
function doesSLHelp(ai, targetCost, coins, incomePerDay, clicks) {
  if (!doesRecruitHelp(ai, targetCost, coins, incomePerDay, clicks)) return false;
  if (!slBetterThanRecruit(ai, targetCost)) return false;
  if (ai.coins.lt(getSLCost(ai))) return false;
  return true;
}

/**
 * Find the best military target we're building toward
 * Used to determine if SL helper should kick in
 *
 * @param {Object} ai - AI state
 * @returns {number} Cost of next military target, or 0 if none
 */
function findBestMilitaryTarget(ai) {
  if (getCount(ai, "kingdom") >= 3) return getEmpireCost(ai);
  if (getCount(ai, "military_base") >= 3) return getKingdomCost(ai);
  if (getCount(ai, "barracks") >= 3) return getMBCost(ai);
  if (getCount(ai, "squad_leader") >= 3) return getBarracksCost(ai);
  return 0;
}

// =============================================================================
// STRAIN CALCULATIONS
// =============================================================================

/**
 * Calculate food strain - how constrained is troop growth?
 *
 * @param {Object} ai - AI state
 * @returns {number} Strain value (0-1, higher = more constrained)
 */
function calculateStrain(ai) {
  const troopCount = ai.troops.toNumber();
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const maxSustainable = farmProd / C.food_perTroopDay;

  if (maxSustainable <= 0) return 1;
  return Math.min(troopCount / maxSustainable, 1);
}

/**
 * Calculate battle closeness - how tight is the power race?
 *
 * @param {number} myPower - AI's current power
 * @param {number} enemyPower - Enemy's current power
 * @returns {number} Closeness value (0-1, higher = tighter battle)
 */
function calculateCloseness(myPower, enemyPower) {
  const maxPower = Math.max(myPower, enemyPower, 1);
  const minPower = Math.min(myPower, enemyPower);
  return minPower / maxPower;
}

module.exports = {
  calcScore,
  getFoodMetrics,
  getUrgencyMetrics,
  wouldSpendingCauseEmergency,
  wouldRecruitCauseSuperEmergency,
  doesRecruitHelp,
  doesTrainHelp,
  slBetterThanRecruit,
  doesSLHelp,
  findBestMilitaryTarget,
  calculateStrain,
  calculateCloseness,
};
