/**
 * Cost Calculation Functions
 *
 * All costs in the game scale exponentially with purchases.
 * There are three cost pools:
 *
 * 1. ARMY POOL (_armyClicks): SL, Barracks, MB, Kingdom share scaling
 *    - Buying any army building makes ALL army buildings more expensive
 *    - Scale factor: 1.04^clicks (4% per click)
 *
 * 2. ECONOMY POOL (_economyClicks): Farm, Plantation, Colony share scaling
 *    - Scale factor: 1.02^clicks (2% per click)
 *
 * 3. TRAIN POOL (_trainClicks): Training scales separately
 *    - Scale factor: 1.02^clicks up to 111, then 1.03^clicks
 *
 * 4. RECRUIT: Scales with number of recruits (not shared)
 *    - Scale factor: 1.02^recruits
 */

const { C } = require('./constants');

// =============================================================================
// ARMY CHAIN COSTS (shared pool)
// =============================================================================

/**
 * Calculate cost of any army building based on total army clicks
 */
function getArmyCost(ai, baseCost) {
  return Math.floor(baseCost * Math.pow(1.04, ai._armyClicks));
}

function getSLCost(ai) {
  return getArmyCost(ai, C.squadLeader_baseCost);
}

function getBarracksCost(ai) {
  return getArmyCost(ai, C.barracks_baseCost);
}

function getMBCost(ai) {
  return getArmyCost(ai, C.militaryBase_baseCost);
}

function getKingdomCost(ai) {
  return getArmyCost(ai, C.kingdom_baseCost);
}

function getEmpireCost(ai) {
  return getArmyCost(ai, C.empire_baseCost);
}

// =============================================================================
// ECONOMY CHAIN COSTS (shared pool)
// =============================================================================

/**
 * Calculate cost of any economy building based on total economy clicks
 */
function getEconomyCost(ai, baseCost) {
  return Math.floor(baseCost * Math.pow(1.02, ai._economyClicks || 0));
}

function getFarmCost(ai) {
  return getEconomyCost(ai, C.farm_baseCost);
}

function getPlantationCost(ai) {
  return getEconomyCost(ai, C.plantation_baseCost);
}

function getColonyCost(ai) {
  return getEconomyCost(ai, C.colony_baseCost);
}

// =============================================================================
// RECRUIT & TRAIN COSTS (separate scaling)
// =============================================================================

/**
 * Recruit cost scales with number of recruits done
 */
function getRecruitCost(ai) {
  const recruits = ai.counts["recruit"] || 0;
  return Math.floor(C.recruitCost * Math.pow(1.02, recruits));
}

/**
 * Train cost has two phases:
 * - First 111 trains: 2% scaling
 * - After 111 trains: 3% scaling (steeper)
 */
function getTrainCost(ai) {
  const total = ai._trainClicks;
  if (total >= 111) {
    return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
  }
  return Math.floor(C.train_baseCost * Math.pow(1.02, total));
}

// =============================================================================
// HELPER: Get count of a building type
// =============================================================================

function getCount(ai, id) {
  return ai.counts[id] || 0;
}

module.exports = {
  // Army
  getArmyCost,
  getSLCost,
  getBarracksCost,
  getMBCost,
  getKingdomCost,
  getEmpireCost,

  // Economy
  getEconomyCost,
  getFarmCost,
  getPlantationCost,
  getColonyCost,

  // Recruit & Train
  getRecruitCost,
  getTrainCost,

  // Utility
  getCount,
};
