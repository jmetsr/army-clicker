/**
 * Simulation Runner
 *
 * Handles the day-by-day simulation loop:
 * - Run AI clicks
 * - Apply passive loot
 * - Process food consumption and starvation
 */

const { C } = require('./constants');
const { getCount } = require('./costs');
const { runAIDay } = require('./ai');

/**
 * Simulate one day
 *
 * A day consists of:
 * 1. AI takes all its clicks (decisions)
 * 2. Passive loot is generated (troops * ppt * 4)
 * 3. Food is produced and consumed
 * 4. Starvation is applied if food runs out
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Clicks per day
 * @param {number} enemyPower - Enemy's current power
 */
function simDay(ai, clicks, enemyPower) {
  // =========================================================================
  // PHASE 1: AI takes actions
  // =========================================================================
  runAIDay(ai, clicks, enemyPower);

  // =========================================================================
  // PHASE 2: Passive loot (troops generate coins)
  // =========================================================================
  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  // =========================================================================
  // PHASE 3: Food production and consumption
  // =========================================================================
  const farmProd = getCount(ai, "farm") * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);

  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) {
    const { ON } = require('./ordinal');
    ai.food = ON(0);
  }

  // =========================================================================
  // PHASE 4: Starvation effects
  // =========================================================================
  if (starving) {
    ai.starvationStreak++;
    // Desertion rate doubles each consecutive day of starvation
    // Day 1: 5%, Day 2: 10%, Day 3: 20%, etc., max 100%
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) {
      const { ON } = require('./ordinal');
      ai.troops = ON(0);
    }
  } else {
    ai.starvationStreak = 0;
  }
}

/**
 * Run a full simulation
 *
 * @param {number} days - Number of days to simulate
 * @param {number} clicksPerDay - Clicks per day
 * @param {number} enemyPower - Static enemy power (0 for solo test)
 * @returns {Object} Final AI state
 */
function runSimulation(days, clicksPerDay, enemyPower = 0) {
  const { createAIState } = require('./state');
  const ai = createAIState();

  for (let day = 1; day <= days; day++) {
    simDay(ai, clicksPerDay, enemyPower);
  }

  return ai;
}

/**
 * Run two AIs against each other
 *
 * @param {number} days - Number of days to simulate
 * @param {number} clicksPerDay - Clicks per day
 * @returns {Object} Final states and comparison
 */
function runVsSimulation(days, clicksPerDay) {
  const { createAIState } = require('./state');
  const ai1 = createAIState();
  const ai2 = createAIState();

  for (let day = 1; day <= days; day++) {
    const power1 = ai1.troops.toNumber() * ai1.ppt;
    const power2 = ai2.troops.toNumber() * ai2.ppt;

    simDay(ai1, clicksPerDay, power2);
    simDay(ai2, clicksPerDay, power1);
  }

  const finalPower1 = ai1.troops.toNumber() * ai1.ppt;
  const finalPower2 = ai2.troops.toNumber() * ai2.ppt;

  return {
    ai1,
    ai2,
    power1: finalPower1,
    power2: finalPower2,
    ratio: finalPower1 / Math.max(finalPower2, 1),
    winner: finalPower1 > finalPower2 ? 1 : finalPower1 < finalPower2 ? 2 : 0,
  };
}

module.exports = { simDay, runSimulation, runVsSimulation };
