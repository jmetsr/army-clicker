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
 * These weights determine how the AI values different actions.
 * Higher values = AI prioritizes that action more.
 *
 * The 10x ratio between tiers (not 3x) captures the TRUE compound value
 * of multipliers. Each barracks gives +1 SL per click, and each SL gives +1 rp,
 * so barracks value compounds over time.
 */
const PARAMS = {
  // --- ECONOMY CHAIN VALUES ---
  // 10x per tier (same as army) so higher tiers are properly valued
  VAL_FARM: 4,                  // Base value for farms
  VAL_PLANTATION: 40,           // Plantations worth 10x farms
  VAL_COLONY: 400,              // Colonies worth 10x plantations

  // --- ARMY CHAIN VALUES ---
  // 10x per tier to properly weight multiplier chain
  VAL_SL: 10,                   // Squad leaders
  VAL_BARRACKS: 100,            // Barracks (10x SL)
  VAL_MB: 1000,                 // Military bases (10x barracks)
  VAL_KINGDOM: 10000,           // Kingdoms (10x MB)

  // --- SCORING MODIFIERS ---
  K_CLOSENESS: 0.5,             // Army bonus when battle is close
  K_STRAIN: 2.0,                // Economy bonus when food constrained
  NO_INFLATE_BONUS: 1.2,        // Bonus for train/recruit (don't inflate building costs)

  // --- DECAY ---
  WAIT_DECAY: 0.99,             // Score multiplied by this per day of waiting

  // --- PPT SCALING FIX ---
  // When true, building values scale with ppt (fixes late-game undervaluation)
  // Tuned with trainMult=0.3 via simulation testing
  USE_PPT_SCALING: true,
};

module.exports = { C, PARAMS };
