/**
 * Action Functions
 *
 * These functions execute game actions: buying buildings, recruiting, training.
 * Each function:
 *   - Checks if the AI can afford the action
 *   - Deducts the cost
 *   - Applies the effect (add troops, buildings, etc.)
 *   - Returns true if successful, false if unaffordable
 */

const { C } = require('./constants');
const {
  getSLCost, getBarracksCost, getMBCost, getKingdomCost,
  getFarmCost, getPlantationCost, getColonyCost,
  getRecruitCost, getTrainCost, getCount
} = require('./costs');

// =============================================================================
// ARMY CHAIN ACTIONS
// =============================================================================

/**
 * Generic army building purchase
 *
 * @param {Object} ai - AI state
 * @param {string} id - Building identifier (e.g., "squad_leader")
 * @param {number} baseCost - Base cost before scaling
 * @param {string} powerKey - Which power stat to use (e.g., "squadLeaderPower")
 * @param {string|null} boostKey - Which power stat this building boosts (null for SL)
 * @returns {boolean} True if purchase successful
 */
function buyArmy(ai, id, baseCost, powerKey, boostKey) {
  const cost = Math.floor(baseCost * Math.pow(1.04, ai._armyClicks));

  if (ai.coins.lt(cost)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.counts[id] = (ai.counts[id] || 0) + ai[powerKey];
  ai._armyClicks++;

  // This building boosts the power of the tier below
  if (boostKey) {
    ai[boostKey] += ai[powerKey];
  }

  // SLs also update rp (recruits per click)
  if (id === "squad_leader") {
    ai.rp = 1 + getCount(ai, "squad_leader");
  }

  return true;
}

/**
 * Buy a Squad Leader
 * - Increases rp (recruits per click)
 * - Unlocks: available when troops >= 2
 * - Unlocks next tier: 3 SLs unlock Barracks
 */
function buySL(ai) {
  return buyArmy(ai, "squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null);
}

/**
 * Buy a Barracks
 * - Increases squadLeaderPower (SLs per click)
 * - Unlocks: 3 Squad Leaders
 * - Unlocks next tier: 3 Barracks unlock Military Base
 */
function buyBarracks(ai) {
  return buyArmy(ai, "barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower");
}

/**
 * Buy a Military Base
 * - Increases barracksPower (Barracks per click)
 * - Unlocks: 3 Barracks
 * - Unlocks next tier: 3 MBs unlock Kingdom
 */
function buyMB(ai) {
  return buyArmy(ai, "military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower");
}

/**
 * Buy a Kingdom
 * - Increases militaryBasePower (MBs per click)
 * - Unlocks: 3 Military Bases
 */
function buyKingdom(ai) {
  return buyArmy(ai, "kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower");
}

/**
 * Buy an Empire
 * - Increases kingdomPower (Kingdoms per click)
 * - Unlocks: 3 Kingdoms
 */
function buyEmpire(ai) {
  return buyArmy(ai, "empire", C.empire_baseCost, "empirePower", "kingdomPower");
}

// =============================================================================
// ECONOMY CHAIN ACTIONS
// =============================================================================

/**
 * Buy a Farm
 * - Produces food to feed troops
 * - Always available
 */
function buyFarm(ai) {
  const cost = getFarmCost(ai);
  if (ai.coins.lt(cost)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
  ai._economyClicks = (ai._economyClicks || 0) + 1;
  return true;
}

/**
 * Buy a Plantation
 * - Increases fp (farms per click)
 * - Unlocks: 3 Farms
 */
function buyPlantation(ai) {
  const cost = getPlantationCost(ai);
  if (ai.coins.lt(cost)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
  ai._economyClicks = (ai._economyClicks || 0) + 1;
  ai.fp = 1 + getCount(ai, "plantation");
  return true;
}

/**
 * Buy a Colony
 * - Increases pp (plantations per click)
 * - Unlocks: 3 Plantations
 */
function buyColony(ai) {
  const cost = getColonyCost(ai);
  if (ai.coins.lt(cost)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
  ai._economyClicks = (ai._economyClicks || 0) + 1;
  ai.pp = 1 + getCount(ai, "colony");
  return true;
}

// =============================================================================
// RECRUIT & TRAIN ACTIONS
// =============================================================================

/**
 * Recruit troops
 * - Adds rp troops to army
 * - Troops generate passive loot and require food
 */
function recruit(ai) {
  const cost = getRecruitCost(ai);
  if (ai.coins.lt(cost)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.troops = ai.troops.add(ai.rp);
  ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
  return true;
}

/**
 * Train troops
 * - Multiplies ppt (power per troop) by trainMult
 * - Requires at least 5 troops
 */
function train(ai) {
  const cost = getTrainCost(ai);
  if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;

  ai.coins = ai.coins.sub(cost);
  ai.ppt *= ai.trainMult;
  ai.counts["train"] = (ai.counts["train"] || 0) + 1;
  ai._trainClicks++;
  return true;
}

/**
 * Beg for coins
 * - Free action, grants 1 coin
 * - Used when nothing else is affordable
 */
function beg(ai) {
  ai.coins = ai.coins.add(1);
  return true;
}

module.exports = {
  // Army chain
  buyArmy,
  buySL,
  buyBarracks,
  buyMB,
  buyKingdom,
  buyEmpire,

  // Economy chain
  buyFarm,
  buyPlantation,
  buyColony,

  // Recruit & Train
  recruit,
  train,
  beg,
};
