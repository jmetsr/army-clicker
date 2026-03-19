/**
 * Game Constants
 *
 * These define the core game mechanics - costs, production rates, and scaling factors.
 * All costs use exponential scaling based on total purchases.
 */

const C = {
  // --- RECRUITING ---
  recruitCost: 20,              // Base cost to recruit troops (scales with recruits)

  // --- TRAINING ---
  train_baseCost: 160,          // Base cost to train (increases PPT) - SYNCED WITH GAME
  train_multiplier: 1.01,       // PPT multiplier per train click

  // --- FOOD SYSTEM ---
  food_perTroopDay: 1,          // Food consumed per troop per day
  farm_baseCost: 1000,          // Base cost of farms
  farm_production: 100,         // Food produced per farm per day
  plantation_baseCost: 5000,    // Plantations boost farm output
  colony_baseCost: 25000,       // Colonies boost plantation output

  // --- ARMY CHAIN --- SYNCED WITH GAME (html-game/js/data.js)
  // Each tier unlocks at 3 of previous tier
  // Each tier boosts the power of the tier below it
  squadLeader_baseCost: 400,    // SLs increase rp (recruits per click)
  barracks_baseCost: 1600,      // Barracks boost SL power
  militaryBase_baseCost: 30000, // MBs boost Barracks power
  kingdom_baseCost: 400000,     // Kingdoms boost MB power
  empire_baseCost: 40000000,    // Empires boost Kingdom power
};

/**
 * AI Scoring Parameters
 *
 * TUNED VERSION: urgency-farm-v1 (2026-03-12)
 * Synced with html-game/js/ai-strategy.js
 *
 * Key changes from old system:
 * - tierMult=70 (not 10) for proper tier valuation
 * - Urgency-based farm valuation (not static)
 * - SL helper logic for smarter building decisions
 */
const PARAMS = {
  // --- TUNING CONSTANTS (synced with game) ---
  VAL_SL: 5,                    // Anchor value for squad leaders
  TIER_MULT: 70,                // Each tier worth 70x the previous
  FARM_THRESHOLD: 6,            // Urgency level where farms = SL value
  TRAIN_MULT: 0.01,             // Train value multiplier (low but train still dominates)
  DIVISOR: 1,                   // For SL helper formula
  DIVISOR_BARRACKS: 1,          // For barracks helper formula

  // --- DERIVED VALUES (computed from VAL_SL and TIER_MULT) ---
  // VAL_BARRACKS = TIER_MULT * VAL_SL = 350
  // VAL_MB = TIER_MULT * VAL_BARRACKS = 24500
  // VAL_KINGDOM = TIER_MULT * VAL_MB = 1715000
  // VAL_EMPIRE = TIER_MULT * VAL_KINGDOM = 120050000
  // VAL_FARM is dynamic based on urgency

  // --- SCORING MODIFIERS ---
  NO_INFLATE_BONUS: 1.2,        // Bonus for train/recruit (don't inflate building costs)
  WAIT_DECAY: 0.99,             // Score multiplied by this per day of waiting

  // --- PPT SCALING ---
  USE_PPT_SCALING: true,        // Building values scale with ppt
};

module.exports = { C, PARAMS };
