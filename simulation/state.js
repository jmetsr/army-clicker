/**
 * AI State Factory
 *
 * Creates a fresh AI state object. This represents all the game state
 * that the AI tracks: resources, troops, buildings, and multipliers.
 */

const { ON } = require('./ordinal');
const { C } = require('./constants');

/**
 * Create a new AI state with starting values
 *
 * @returns {Object} Fresh AI state object
 */
function createAIState() {
  return {
    // --- RESOURCES ---
    coins: ON(0),               // Current coins (used to buy everything)
    troops: ON(0),              // Current troop count (generates loot)
    food: ON(500),              // Food buffer (troops starve without it)

    // --- POWER MULTIPLIERS ---
    ppt: 1,                     // Power per troop (increased by training)
    rp: 1,                      // Recruits per click (increased by SLs)
    fp: 1,                      // Farms per click (increased by plantations)
    pp: 1,                      // Plantations per click (increased by colonies)

    // --- ARMY CHAIN POWER ---
    // Each tier boosts the tier below it
    squadLeaderPower: 1,        // SLs added per click (boosted by barracks)
    barracksPower: 1,           // Barracks added per click (boosted by MBs)
    militaryBasePower: 1,       // MBs added per click (boosted by kingdoms)
    kingdomPower: 1,            // Kingdoms added per click (boosted by empires)
    empirePower: 1,             // Empires added per click

    // --- TRAINING ---
    trainMult: C.train_multiplier,  // PPT multiplier per train

    // --- BUILDING COUNTS ---
    counts: {},                 // Tracks count of each building type

    // --- COST TRACKING ---
    // Costs scale based on total clicks in each pool
    _armyClicks: 0,             // Total army chain clicks (SL, barracks, MB, kingdom)
    _trainClicks: 0,            // Total train clicks
    _economyClicks: 0,          // Total economy clicks (farm, plantation, colony)

    // --- STARVATION ---
    starvationStreak: 0,        // Consecutive days of starvation (increases desertion)
  };
}

module.exports = { createAIState };
