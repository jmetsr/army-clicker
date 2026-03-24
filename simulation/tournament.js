/**
 * Discount Rate Tournament
 *
 * Tests different WAIT_DECAY values against each other in simulated battles.
 * Uses the main ai.js logic by modifying PARAMS.WAIT_DECAY before each simDay call.
 *
 * Usage: node tournament.js
 */

const fs = require('fs');
const { ON } = require('./ordinal');
const { C, PARAMS } = require('./constants');
const { createAIState } = require('./state');
const { getCount } = require('./costs');
const { runAIDay } = require('./ai');

// =============================================================================
// SIMULATION DAY (copied from sim.js but allows WAIT_DECAY override)
// =============================================================================

/**
 * Simulate one day with configurable WAIT_DECAY
 */
function simDayWithDecay(ai, clicks, waitDecay) {
  // Set WAIT_DECAY before running AI
  const originalDecay = PARAMS.WAIT_DECAY;
  PARAMS.WAIT_DECAY = waitDecay;

  try {
    // AI takes actions
    runAIDay(ai, clicks, 0, false);
  } finally {
    // Restore original (in case of error)
    PARAMS.WAIT_DECAY = originalDecay;
  }

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
  if (ai.food.lt(0)) {
    ai.food = ON(0);
  }

  // Starvation effects
  if (starving) {
    ai.starvationStreak++;
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) {
      ai.troops = ON(0);
    }
  } else {
    ai.starvationStreak = 0;
  }
}

// =============================================================================
// BATTLE SIMULATION
// =============================================================================

/**
 * Simulate a battle between two AIs (matches actual game mechanics)
 */
function simulateBattle(ai1, ai2, debug = false) {
  const power1 = ai1.troops.toNumber() * ai1.ppt;
  const power2 = ai2.troops.toNumber() * ai2.ppt;

  // Stalemate if equal power
  if (power1 === power2) {
    ai1.winStreak = 0;
    ai1.lossStreak = 0;
    ai2.winStreak = 0;
    ai2.lossStreak = 0;
    if (debug) console.log(`  Stalemate! Both at ${power1.toFixed(0)} power`);
    return { winner: 0 };
  }

  // Higher power wins (deterministic)
  const ai1Wins = power1 > power2;
  const winner = ai1Wins ? ai1 : ai2;
  const loser = ai1Wins ? ai2 : ai1;

  // Update streaks
  winner.winStreak = (winner.winStreak || 0) + 1;
  winner.lossStreak = 0;
  loser.lossStreak = (loser.lossStreak || 0) + 1;
  loser.winStreak = 0;

  // Loss percentage based on loser's loss streak: 5% per consecutive loss, max 100%
  const lossPct = Math.min(loser.lossStreak * 5, 100);
  const keepFraction = 100 - lossPct;

  if (debug) {
    console.log(`  AI${ai1Wins ? '1' : '2'} wins! P1=${power1.toFixed(0)} vs P2=${power2.toFixed(0)}, loser streak=${loser.lossStreak}, loses ${lossPct}%`);
  }

  // Apply losses to loser
  loser.troops = loser.troops.mulFraction(keepFraction, 100);
  if (loser.troops.lt(0)) loser.troops = ON(0);

  loser.coins = loser.coins.mulFraction(keepFraction, 100);
  if (loser.coins.lt(0)) loser.coins = ON(0);

  loser.ppt = Math.max(1, loser.ppt * keepFraction / 100);

  // Army building loss
  ["squad_leader", "barracks", "military_base", "kingdom", "empire"].forEach(function(id) {
    if ((loser.counts[id] || 0) > 0) {
      loser.counts[id] = Math.max(0, loser.counts[id] - Math.round(loser.counts[id] * lossPct / 100));
    }
  });

  // Recalculate rp based on new SL count
  loser.rp = 1 + (loser.counts["squad_leader"] || 0);

  return { winner: ai1Wins ? 1 : 2, lossPct };
}

// =============================================================================
// MATCH SIMULATION
// =============================================================================

/**
 * Run a single match between two strategies
 */
function runMatch(decay1, decay2, clicksPerDay = 25, maxDays = 500, battleChance = 0.03, debug = false) {
  const ai1 = createAIState();
  const ai2 = createAIState();

  // Initialize battle streaks
  ai1.winStreak = 0;
  ai1.lossStreak = 0;
  ai2.winStreak = 0;
  ai2.lossStreak = 0;

  let winner = 0;
  let endDay = maxDays;
  let battleCount = 0;

  for (let day = 1; day <= maxDays; day++) {
    // Both AIs take actions with their respective decay rates
    simDayWithDecay(ai1, clicksPerDay, decay1);
    simDayWithDecay(ai2, clicksPerDay, decay2);

    // Random battle chance
    if (Math.random() < battleChance) {
      const troops1Before = ai1.troops.toNumber();
      const troops2Before = ai2.troops.toNumber();
      const power1 = troops1Before * ai1.ppt;
      const power2 = troops2Before * ai2.ppt;

      // Only battle if both sides have troops
      if (power1 > 0 && power2 > 0) {
        battleCount++;

        if (debug) {
          console.log(`Day ${day}: Battle! P1=${power1.toFixed(0)} vs P2=${power2.toFixed(0)}`);
        }

        const battle = simulateBattle(ai1, ai2, debug);

        // Check for vanquish
        const troops1After = ai1.troops.toNumber();
        const troops2After = ai2.troops.toNumber();

        if (troops1Before > 0 && troops1After < 1 && troops2After >= 1) {
          winner = 2;
          endDay = day;
          if (debug) console.log(`Day ${day}: AI 1 vanquished!`);
          break;
        } else if (troops2Before > 0 && troops2After < 1 && troops1After >= 1) {
          winner = 1;
          endDay = day;
          if (debug) console.log(`Day ${day}: AI 2 vanquished!`);
          break;
        } else if (troops1After < 1 && troops2After < 1) {
          winner = 0;
          endDay = day;
          if (debug) console.log(`Day ${day}: Mutual destruction!`);
          break;
        }
      }
    }

    // Debug output every 100 days
    if (debug && day % 100 === 0) {
      console.log(`Day ${day}: T1=${ai1.troops.toNumber().toFixed(0)} ppt=${ai1.ppt.toFixed(1)}, T2=${ai2.troops.toNumber().toFixed(0)} ppt=${ai2.ppt.toFixed(1)}`);
    }
  }

  // If no vanquish, winner by power at end
  if (winner === 0) {
    const finalPower1 = ai1.troops.toNumber() * ai1.ppt;
    const finalPower2 = ai2.troops.toNumber() * ai2.ppt;
    if (finalPower1 > finalPower2 * 1.1) winner = 1;
    else if (finalPower2 > finalPower1 * 1.1) winner = 2;
    // Else draw (within 10%)
  }

  return {
    winner,
    endDay,
    battleCount,
    finalPower1: ai1.troops.toNumber() * ai1.ppt,
    finalPower2: ai2.troops.toNumber() * ai2.ppt,
    troops1: ai1.troops.toNumber(),
    troops2: ai2.troops.toNumber(),
    ai1,
    ai2,
  };
}

// =============================================================================
// TOURNAMENT
// =============================================================================

/**
 * Run a round-robin tournament between multiple strategies
 */
function runTournament(strategies, runsPerMatch = 10, clicksPerDay = 25) {
  const n = strategies.length;
  const results = {};
  const wins = {};
  const matchups = [];

  // Initialize
  for (const s of strategies) {
    wins[s.name] = 0;
    results[s.name] = {};
    for (const t of strategies) {
      if (s.name !== t.name) {
        results[s.name][t.name] = { wins: 0, games: 0 };
      }
    }
  }

  // Generate all matchups
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matchups.push([strategies[i], strategies[j]]);
    }
  }

  // Run all matchups
  let completed = 0;
  for (const [s1, s2] of matchups) {
    for (let run = 0; run < runsPerMatch; run++) {
      const result = runMatch(s1.decay, s2.decay, clicksPerDay);

      results[s1.name][s2.name].games++;
      results[s2.name][s1.name].games++;

      if (result.winner === 1) {
        wins[s1.name]++;
        results[s1.name][s2.name].wins++;
      } else if (result.winner === 2) {
        wins[s2.name]++;
        results[s2.name][s1.name].wins++;
      }
    }
    completed++;
    process.stdout.write(`Progress: ${completed}/${matchups.length} matchups (${Math.round(100 * completed / matchups.length)}%)\r`);
  }

  return { results, wins, strategies };
}

// =============================================================================
// HTML REPORT GENERATION
// =============================================================================

function generateHTML(tournament) {
  const { results, wins, strategies } = tournament;

  // Sort by wins
  const ranking = strategies.slice().sort((a, b) => wins[b.name] - wins[a.name]);
  const maxGames = (strategies.length - 1) * 10;

  let html = `<!DOCTYPE html>
<html>
<head>
  <title>WAIT_DECAY Tournament Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
    h1, h2 { color: #00d4ff; }
    table { border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 8px 12px; border: 1px solid #0f3460; text-align: center; }
    th { background: #16213e; }
    .current { background: #2d5a27 !important; }
    .win-high { background: #1e5128; }
    .win-mid { background: #5a4a00; }
    .win-low { background: #5a1a1a; }
    .ranking { background: #16213e; }
    .summary { background: #0f3460; padding: 15px; border-radius: 8px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>WAIT_DECAY Tournament Results</h1>

  <div class="summary">
    <strong>Settings:</strong> ${strategies.length} strategies, 10 games per matchup, 25 clicks/day, 500 days max<br>
    <strong>Total games:</strong> ${strategies.length * (strategies.length - 1) / 2 * 10}
  </div>

  <h2>Rankings</h2>
  <table class="ranking">
    <tr><th>Rank</th><th>Strategy</th><th>WAIT_DECAY</th><th>Wins</th><th>Win Rate</th></tr>
`;

  ranking.forEach((s, i) => {
    const isCurrent = s.decay === 0.99;
    const winRate = (100 * wins[s.name] / maxGames).toFixed(1);
    html += `    <tr${isCurrent ? ' class="current"' : ''}>
      <td>${i + 1}${isCurrent ? '*' : ''}</td>
      <td>${s.name}</td>
      <td>${s.decay}</td>
      <td>${wins[s.name]}</td>
      <td>${winRate}%</td>
    </tr>\n`;
  });

  html += `  </table>
  <p>* = current default (0.99)</p>

  <h2>Head-to-Head Matrix</h2>
  <p>Cell shows row's win % against column</p>
  <table>
    <tr><th></th>`;

  for (const s of strategies) {
    html += `<th>${s.name}</th>`;
  }
  html += `</tr>\n`;

  for (const s1 of strategies) {
    html += `    <tr><th>${s1.name}</th>`;
    for (const s2 of strategies) {
      if (s1.name === s2.name) {
        html += `<td>-</td>`;
      } else {
        const r = results[s1.name][s2.name];
        const pct = r.games > 0 ? Math.round(100 * r.wins / r.games) : 0;
        let cls = pct >= 70 ? 'win-high' : pct >= 40 ? 'win-mid' : 'win-low';
        html += `<td class="${cls}">${pct}%</td>`;
      }
    }
    html += `</tr>\n`;
  }

  html += `  </table>

  <h2>Legend</h2>
  <ul>
    <li><span style="background:#1e5128;padding:2px 8px;">Green</span>: 70%+ win rate</li>
    <li><span style="background:#5a4a00;padding:2px 8px;">Yellow</span>: 40-70% win rate</li>
    <li><span style="background:#5a1a1a;padding:2px 8px;">Red</span>: &lt;40% win rate</li>
  </ul>

</body>
</html>`;

  return html;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('='.repeat(60));
  console.log('DISCOUNT RATE TOURNAMENT');
  console.log('='.repeat(60));
  console.log();

  const strategies = [
    { name: '0.00', decay: 0 },
    { name: '0.10', decay: 0.1 },
    { name: '0.20', decay: 0.2 },
    { name: '0.30', decay: 0.3 },
    { name: '0.40', decay: 0.4 },
    { name: '0.50', decay: 0.5 },
    { name: '0.60', decay: 0.6 },
    { name: '0.70', decay: 0.7 },
    { name: '0.80', decay: 0.8 },
    { name: '0.90', decay: 0.9 },
    { name: '0.970', decay: 0.97 },
    { name: '0.975', decay: 0.975 },
    { name: '0.980', decay: 0.98 },
    { name: '0.985', decay: 0.985 },
    { name: '0.990', decay: 0.99 },
    { name: '0.993', decay: 0.993 },
    { name: '0.995', decay: 0.995 },
    { name: '0.997', decay: 0.997 },
    { name: '0.999', decay: 0.999 },
  ];

  console.log('Strategies:');
  for (const s of strategies) {
    const isCurrent = s.decay === 0.99 ? ' (current)' : '';
    console.log(`  ${s.name}: WAIT_DECAY=${s.decay}${isCurrent}`);
  }
  console.log();

  const runsPerMatch = 10;
  const clicksPerDay = 25;

  console.log(`Settings: ${runsPerMatch} runs per matchup, ${clicksPerDay} clicks/day`);
  console.log(`Total matchups: ${strategies.length * (strategies.length - 1) / 2}`);
  console.log(`Total games: ${strategies.length * (strategies.length - 1) / 2 * runsPerMatch}`);
  console.log();

  const startTime = Date.now();
  const tournament = runTournament(strategies, runsPerMatch, clicksPerDay);
  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\nTournament completed in ${elapsed.toFixed(1)}s`);
  console.log();

  // Print ranking
  console.log('='.repeat(60));
  console.log('FINAL RANKING');
  console.log('='.repeat(60));
  console.log();

  const maxGames = (strategies.length - 1) * runsPerMatch;
  const ranking = strategies.slice().sort((a, b) => tournament.wins[b.name] - tournament.wins[a.name]);

  console.log('Rank | Strategy     | Wins | Win Rate');
  console.log('-'.repeat(45));

  ranking.forEach((s, i) => {
    const isCurrent = s.decay === 0.99 ? '*' : ' ';
    const winRate = (100 * tournament.wins[s.name] / maxGames).toFixed(1);
    console.log(`  ${i + 1}${isCurrent} | ${s.name.padEnd(12)} | ${String(tournament.wins[s.name]).padStart(4)} | ${winRate}%`);
  });

  console.log();
  console.log('* = current default (0.99)');

  // Find best and current rank
  const bestStrategy = ranking[0];
  const currentRank = ranking.findIndex(s => s.decay === 0.99) + 1;
  const currentWins = tournament.wins['0.990'];
  const bestWins = tournament.wins[bestStrategy.name];

  console.log();
  console.log('='.repeat(60));
  console.log('RECOMMENDATION');
  console.log('='.repeat(60));
  console.log();
  console.log(`Best strategy: ${bestStrategy.name} (WAIT_DECAY=${bestStrategy.decay})`);
  console.log(`Current (0.99) rank: #${currentRank}`);
  if (bestWins > currentWins) {
    const improvement = ((bestWins - currentWins) / currentWins * 100).toFixed(1);
    console.log(`Potential improvement: +${improvement}% more wins`);
    console.log();
    console.log(`Recommend changing WAIT_DECAY from 0.99 to ${bestStrategy.decay}`);
  } else {
    console.log('Current setting is optimal!');
  }

  // Generate HTML
  const html = generateHTML(tournament);
  const filepath = '/home/jjsclaude/Desktop/fun/simulation/tournament-results.html';
  fs.writeFileSync(filepath, html);
  console.log(`\nHTML report saved to: ${filepath}`);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { runMatch, runTournament, simDayWithDecay, simulateBattle };
