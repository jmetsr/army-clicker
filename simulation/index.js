#!/usr/bin/env node
/**
 * Army Clicker AI Simulation
 *
 * Main entry point for running simulations and tests.
 *
 * Usage:
 *   node simulation/index.js              # Run default test
 *   node simulation/index.js 200 25       # Run 200 days at 25 cps
 */

const { createAIState } = require('./state');
const { runSimulation, simDay } = require('./sim');
const { getCount } = require('./costs');
const { C, PARAMS } = require('./constants');

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

/**
 * Basic test - run simulation and show results
 */
function testBasic() {
  console.log('=== Basic Simulation Test ===\n');

  for (const cps of [10, 25]) {
    console.log(`--- ${cps} cps, 200 days ---`);

    const ai = runSimulation(200, cps, 0);

    const power = Math.floor(ai.troops.toNumber() * ai.ppt);
    console.log(`Power: ${power}`);
    console.log(`Troops: ${ai.troops.toNumber()}, PPT: ${ai.ppt.toFixed(2)}`);
    console.log(`SL=${getCount(ai, "squad_leader")}, Bar=${getCount(ai, "barracks")}, MB=${getCount(ai, "military_base")}, King=${getCount(ai, "kingdom")}`);
    console.log(`Farms=${getCount(ai, "farm")}, Recruits=${getCount(ai, "recruit")}, Trains=${getCount(ai, "train")}`);
    console.log('');
  }
}

/**
 * Debug progression - show when buildings are purchased
 */
function debugProgression() {
  console.log('=== Building Progression ===\n');

  const ai = createAIState();
  const clicks = 25;

  let prevSL = 0, prevBar = 0, prevMB = 0, prevKing = 0;

  for (let day = 1; day <= 200; day++) {
    simDay(ai, clicks, 0);

    const sl = getCount(ai, "squad_leader");
    const bar = getCount(ai, "barracks");
    const mb = getCount(ai, "military_base");
    const king = getCount(ai, "kingdom");

    if (sl > prevSL) {
      console.log(`Day ${day}: SL #${sl} (Troops: ${ai.troops.toNumber()}, Coins: ${ai.coins.toNumber()})`);
      prevSL = sl;
    }
    if (bar > prevBar) {
      console.log(`Day ${day}: Barracks #${bar}`);
      prevBar = bar;
    }
    if (mb > prevMB) {
      console.log(`Day ${day}: MB #${mb}`);
      prevMB = mb;
    }
    if (king > prevKing) {
      console.log(`Day ${day}: Kingdom #${king}`);
      prevKing = king;
    }
  }

  console.log(`\nFinal: SL=${prevSL}, Bar=${prevBar}, MB=${prevMB}, King=${prevKing}`);
  console.log(`Troops: ${ai.troops.toNumber()}, Power: ${Math.floor(ai.troops.toNumber() * ai.ppt)}`);
}

/**
 * Show current parameter settings
 */
function showParams() {
  console.log('=== Current Parameters ===\n');
  console.log('Game Constants (C):');
  for (const [key, value] of Object.entries(C)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('\nAI Parameters (PARAMS):');
  for (const [key, value] of Object.entries(PARAMS)) {
    console.log(`  ${key}: ${value}`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

const args = process.argv.slice(2);

if (args[0] === 'params') {
  showParams();
} else if (args[0] === 'debug') {
  debugProgression();
} else if (args.length >= 2) {
  const days = parseInt(args[0]) || 200;
  const cps = parseInt(args[1]) || 25;

  console.log(`Running ${days} days at ${cps} cps...\n`);
  const ai = runSimulation(days, cps, 0);

  const power = Math.floor(ai.troops.toNumber() * ai.ppt);
  console.log(`Power: ${power}`);
  console.log(`Troops: ${ai.troops.toNumber()}, PPT: ${ai.ppt.toFixed(2)}`);
  console.log(`SL=${getCount(ai, "squad_leader")}, Bar=${getCount(ai, "barracks")}, MB=${getCount(ai, "military_base")}, King=${getCount(ai, "kingdom")}`);
  console.log(`Farms=${getCount(ai, "farm")}, Recruits=${getCount(ai, "recruit")}, Trains=${getCount(ai, "train")}`);
} else {
  testBasic();
}
