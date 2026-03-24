/**
 * Detailed Game Viewer
 *
 * Shows state before/after each battle between two WAIT_DECAY strategies.
 * Uses the main ai.js logic by modifying PARAMS.WAIT_DECAY.
 */

const fs = require('fs');
const { ON } = require('./ordinal');
const { C, PARAMS } = require('./constants');
const { createAIState } = require('./state');
const { getCount, getEmpireCost } = require('./costs');
const { simDayWithDecay, simulateBattle } = require('./tournament');

const DAYS = 500;
const CLICKS_PER_DAY = 25;
const BATTLE_CHANCE = 0.03;

// Deterministic random for reproducibility
let seed = 12345;
function seededRandom() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function setSeed(s) {
  seed = s;
}

// Clone state for snapshots
function cloneState(ai) {
  return {
    troops: ai.troops.toNumber(),
    coins: ai.coins.toNumber(),
    ppt: ai.ppt,
    rp: ai.rp,
    food: ai.food.toNumber(),
    farms: getCount(ai, 'farm'),
    plantations: getCount(ai, 'plantation'),
    colonies: getCount(ai, 'colony'),
    squadLeaders: getCount(ai, 'squad_leader'),
    barracks: getCount(ai, 'barracks'),
    militaryBases: getCount(ai, 'military_base'),
    kingdoms: getCount(ai, 'kingdom'),
    empires: getCount(ai, 'empire'),
    starvationStreak: ai.starvationStreak || 0,
    lossStreak: ai.lossStreak || 0,
    winStreak: ai.winStreak || 0
  };
}

function runDetailedGame(decay1, decay2, gameSeed) {
  setSeed(gameSeed);

  const ai1 = createAIState();
  const ai2 = createAIState();
  ai1.name = decay1.toFixed(3);
  ai2.name = decay2.toFixed(3);
  ai1.winStreak = 0;
  ai1.lossStreak = 0;
  ai2.winStreak = 0;
  ai2.lossStreak = 0;

  const events = [];
  let winner = null;
  let endDay = DAYS;

  for (let day = 1; day <= DAYS; day++) {
    // AI decisions using the main ai.js via simDayWithDecay
    simDayWithDecay(ai1, CLICKS_PER_DAY, decay1);
    simDayWithDecay(ai2, CLICKS_PER_DAY, decay2);

    // Battle check (use seeded random for reproducibility)
    if (seededRandom() < BATTLE_CHANCE) {
      const troops1Before = ai1.troops.toNumber();
      const troops2Before = ai2.troops.toNumber();
      const power1 = troops1Before * ai1.ppt;
      const power2 = troops2Before * ai2.ppt;

      if (power1 > 0 && power2 > 0) {
        const before1 = cloneState(ai1);
        const before2 = cloneState(ai2);

        const result = simulateBattle(ai1, ai2);

        const after1 = cloneState(ai1);
        const after2 = cloneState(ai2);

        events.push({
          day,
          type: 'battle',
          result,
          ai1: { before: before1, after: after1 },
          ai2: { before: before2, after: after2 }
        });

        // Check vanquish
        const troops1After = ai1.troops.toNumber();
        const troops2After = ai2.troops.toNumber();

        if (troops1Before > 0 && troops1After < 1 && troops2After >= 1) {
          winner = 2;
          endDay = day;
          break;
        } else if (troops2Before > 0 && troops2After < 1 && troops1After >= 1) {
          winner = 1;
          endDay = day;
          break;
        } else if (troops1After < 1 && troops2After < 1) {
          winner = 0;
          endDay = day;
          break;
        }
      }
    }
  }

  // Final state
  const final1 = cloneState(ai1);
  const final2 = cloneState(ai2);

  // Determine winner if not vanquished
  if (!winner) {
    const power1 = final1.troops * final1.ppt;
    const power2 = final2.troops * final2.ppt;
    if (power1 > power2 * 1.1) winner = 1;
    else if (power2 > power1 * 1.1) winner = 2;
    else winner = 0;
  }

  return {
    ai1Name: ai1.name,
    ai2Name: ai2.name,
    decay1,
    decay2,
    events,
    final1,
    final2,
    winner,
    endDay,
    empireCost1: getEmpireCost(ai1),
    empireCost2: getEmpireCost(ai2),
    ai1,
    ai2
  };
}

function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return Math.floor(n).toLocaleString();
}

function generateHTML(gameData) {
  const { ai1Name, ai2Name, events, final1, final2, winner, decay1, decay2, endDay } = gameData;

  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Detailed Game: ${ai1Name} vs ${ai2Name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #00d4ff; }
    h2 { color: #ff6b6b; margin-top: 30px; }
    .battle {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
    }
    .battle-header {
      font-size: 1.2em;
      font-weight: bold;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #0f3460;
    }
    .battle-result {
      padding: 5px 10px;
      border-radius: 4px;
      display: inline-block;
      margin-left: 10px;
    }
    .win { background: #2d5a27; }
    .lose { background: #5a2727; }
    .draw { background: #5a5a27; }
    .comparison {
      display: flex;
      gap: 30px;
    }
    .player {
      flex: 1;
      background: #0f3460;
      padding: 15px;
      border-radius: 8px;
    }
    .player h3 {
      margin-top: 0;
      color: #00d4ff;
    }
    .player.winner h3 { color: #4eff4e; }
    .player.loser h3 { color: #ff6b6b; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #16213e; }
    th { color: #888; font-weight: normal; width: 40%; }
    .change { font-size: 0.85em; margin-left: 5px; }
    .change.negative { color: #ff6b6b; }
    .change.positive { color: #4eff4e; }
    .summary {
      background: #0f3460;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .final-state {
      background: #16213e;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
    }
    .winner-banner {
      text-align: center;
      font-size: 1.5em;
      padding: 15px;
      background: linear-gradient(90deg, #2d5a27, #1a4a1a);
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .section-header {
      background: #0f3460;
      padding: 5px 10px;
      margin: 10px -10px;
      font-weight: bold;
      color: #00d4ff;
    }
  </style>
</head>
<body>
  <h1>Detailed Game: ${ai1Name} vs ${ai2Name}</h1>

  <div class="summary">
    <strong>Settings:</strong> WAIT_DECAY=${decay1} vs WAIT_DECAY=${decay2}, ${CLICKS_PER_DAY} clicks/day<br>
    <strong>Total Battles:</strong> ${events.length}<br>
    <strong>Game Length:</strong> ${endDay} days
  </div>

  <div class="winner-banner">
    Winner: ${winner === 1 ? ai1Name : winner === 2 ? ai2Name : 'DRAW'}
    ${winner !== 0 ? `(WAIT_DECAY=${winner === 1 ? decay1 : decay2})` : ''}
  </div>

  <h2>Battle Log</h2>
`;

  for (const event of events) {
    if (event.type === 'battle') {
      const { day, result, ai1: p1, ai2: p2 } = event;
      const winnerNum = result.winner;
      const p1Class = winnerNum === 1 ? 'winner' : winnerNum === 2 ? 'loser' : '';
      const p2Class = winnerNum === 2 ? 'winner' : winnerNum === 1 ? 'loser' : '';

      html += `
  <div class="battle">
    <div class="battle-header">
      Day ${day}
      <span class="battle-result ${winnerNum === 0 ? 'draw' : winnerNum === 1 ? 'win' : 'lose'}">
        ${winnerNum === 0 ? 'Stalemate' : winnerNum === 1 ? ai1Name + ' wins' : ai2Name + ' wins'}
        ${result.lossPct ? ` (${result.lossPct}% loss)` : ''}
      </span>
    </div>
    <div class="comparison">
      <div class="player ${p1Class}">
        <h3>${ai1Name} ${winnerNum === 1 ? '(Winner)' : winnerNum === 2 ? '(Loser)' : ''}</h3>
        ${renderPlayerState(p1.before, p1.after)}
      </div>
      <div class="player ${p2Class}">
        <h3>${ai2Name} ${winnerNum === 2 ? '(Winner)' : winnerNum === 1 ? '(Loser)' : ''}</h3>
        ${renderPlayerState(p2.before, p2.after)}
      </div>
    </div>
  </div>
`;
    }
  }

  html += `
  <div class="final-state">
    <h2>Final State (Day ${endDay})</h2>
    <div class="comparison">
      <div class="player ${winner === 1 ? 'winner' : winner === 2 ? 'loser' : ''}">
        <h3>${ai1Name} ${winner === 1 ? '(Winner)' : ''}</h3>
        ${renderFinalState(final1)}
      </div>
      <div class="player ${winner === 2 ? 'winner' : winner === 1 ? 'loser' : ''}">
        <h3>${ai2Name} ${winner === 2 ? '(Winner)' : ''}</h3>
        ${renderFinalState(final2)}
      </div>
    </div>
  </div>
</body>
</html>`;

  return html;
}

function renderPlayerState(before, after) {
  function change(b, a, format = true) {
    const diff = a - b;
    if (Math.abs(diff) < 0.5) return '';
    const formatted = format ? formatNumber(Math.abs(diff)) : Math.abs(diff);
    if (diff < 0) return `<span class="change negative">(-${formatted})</span>`;
    if (diff > 0) return `<span class="change positive">(+${formatted})</span>`;
    return '';
  }

  const powerBefore = before.troops * before.ppt;
  const powerAfter = after.troops * after.ppt;

  return `
    <div class="section-header">Combat Stats</div>
    <table>
      <tr><th>Troops</th><td>${formatNumber(before.troops)} → ${formatNumber(after.troops)} ${change(before.troops, after.troops)}</td></tr>
      <tr><th>Power</th><td>${formatNumber(powerBefore)} → ${formatNumber(powerAfter)} ${change(powerBefore, powerAfter)}</td></tr>
      <tr><th>PPT</th><td>${before.ppt.toFixed(1)} → ${after.ppt.toFixed(1)} ${change(before.ppt, after.ppt, false)}</td></tr>
      <tr><th>Loss Streak</th><td>${before.lossStreak} → ${after.lossStreak}</td></tr>
    </table>
    <div class="section-header">Resources</div>
    <table>
      <tr><th>Coins</th><td>${formatNumber(before.coins)} → ${formatNumber(after.coins)} ${change(before.coins, after.coins)}</td></tr>
      <tr><th>Food</th><td>${formatNumber(before.food)}</td></tr>
      <tr><th>Days Starved</th><td>${before.starvationStreak}</td></tr>
    </table>
    <div class="section-header">Army Buildings</div>
    <table>
      <tr><th>Squad Leaders</th><td>${formatNumber(before.squadLeaders)} → ${formatNumber(after.squadLeaders)} ${change(before.squadLeaders, after.squadLeaders, false)}</td></tr>
      <tr><th>Barracks</th><td>${formatNumber(before.barracks)} → ${formatNumber(after.barracks)} ${change(before.barracks, after.barracks, false)}</td></tr>
      <tr><th>Military Bases</th><td>${formatNumber(before.militaryBases)} → ${formatNumber(after.militaryBases)} ${change(before.militaryBases, after.militaryBases, false)}</td></tr>
      <tr><th>Kingdoms</th><td>${formatNumber(before.kingdoms)} → ${formatNumber(after.kingdoms)} ${change(before.kingdoms, after.kingdoms, false)}</td></tr>
      <tr><th>Empires</th><td>${formatNumber(before.empires)} → ${formatNumber(after.empires)} ${change(before.empires, after.empires, false)}</td></tr>
    </table>
    <div class="section-header">Economy Buildings</div>
    <table>
      <tr><th>Farms</th><td>${formatNumber(before.farms)}</td></tr>
      <tr><th>Plantations</th><td>${formatNumber(before.plantations)}</td></tr>
      <tr><th>Colonies</th><td>${formatNumber(before.colonies)}</td></tr>
    </table>
  `;
}

function renderFinalState(state) {
  const power = state.troops * state.ppt;
  return `
    <div class="section-header">Combat Stats</div>
    <table>
      <tr><th>Troops</th><td>${formatNumber(state.troops)}</td></tr>
      <tr><th>Power</th><td>${formatNumber(power)}</td></tr>
      <tr><th>PPT</th><td>${state.ppt.toFixed(1)}</td></tr>
      <tr><th>RP</th><td>${formatNumber(state.rp)}</td></tr>
    </table>
    <div class="section-header">Resources</div>
    <table>
      <tr><th>Coins</th><td>${formatNumber(state.coins)}</td></tr>
      <tr><th>Food</th><td>${formatNumber(state.food)}</td></tr>
      <tr><th>Days Starved (current)</th><td>${state.starvationStreak}</td></tr>
    </table>
    <div class="section-header">Army Buildings</div>
    <table>
      <tr><th>Squad Leaders</th><td>${formatNumber(state.squadLeaders)}</td></tr>
      <tr><th>Barracks</th><td>${formatNumber(state.barracks)}</td></tr>
      <tr><th>Military Bases</th><td>${formatNumber(state.militaryBases)}</td></tr>
      <tr><th>Kingdoms</th><td>${formatNumber(state.kingdoms)}</td></tr>
      <tr><th>Empires</th><td>${formatNumber(state.empires)}</td></tr>
    </table>
    <div class="section-header">Economy Buildings</div>
    <table>
      <tr><th>Farms</th><td>${formatNumber(state.farms)}</td></tr>
      <tr><th>Plantations</th><td>${formatNumber(state.plantations)}</td></tr>
      <tr><th>Colonies</th><td>${formatNumber(state.colonies)}</td></tr>
    </table>
  `;
}

// Run the game
console.log('Running detailed game: 0.990 vs 0.995 (25 clicks/day)...\n');
const gameData = runDetailedGame(0.99, 0.995, 33333);

console.log(`Battles: ${gameData.events.length}`);
console.log(`Winner: ${gameData.winner === 1 ? gameData.ai1Name : gameData.winner === 2 ? gameData.ai2Name : 'DRAW'}`);
console.log(`Game ended on day: ${gameData.endDay}`);

if (gameData.events.length > 0) {
  console.log('\nBattle summary:');
  for (const e of gameData.events) {
    const winnerName = e.result.winner === 1 ? gameData.ai1Name : e.result.winner === 2 ? gameData.ai2Name : 'Stalemate';
    console.log(`  Day ${e.day}: ${winnerName}${e.result.lossPct ? ` (${e.result.lossPct}% loss)` : ''}`);
  }
}

// Show final building counts
console.log('\nFinal buildings:');
console.log(`  ${gameData.ai1Name}: SL=${formatNumber(gameData.final1.squadLeaders)}, Bar=${formatNumber(gameData.final1.barracks)}, MB=${formatNumber(gameData.final1.militaryBases)}, King=${gameData.final1.kingdoms}, Emp=${gameData.final1.empires}`);
console.log(`  ${gameData.ai2Name}: SL=${formatNumber(gameData.final2.squadLeaders)}, Bar=${formatNumber(gameData.final2.barracks)}, MB=${formatNumber(gameData.final2.militaryBases)}, King=${gameData.final2.kingdoms}, Emp=${gameData.final2.empires}`);

// Show empire costs (endgame readiness)
console.log('\nEmpire costs (endgame readiness):');
console.log(`  ${gameData.ai1Name}: ${formatNumber(gameData.empireCost1)} coins`);
console.log(`  ${gameData.ai2Name}: ${formatNumber(gameData.empireCost2)} coins`);
console.log(`\nFinal coins:`);
console.log(`  ${gameData.ai1Name}: ${formatNumber(gameData.final1.coins)}`);
console.log(`  ${gameData.ai2Name}: ${formatNumber(gameData.final2.coins)}`);

const html = generateHTML(gameData);
const outputPath = '/home/jjsclaude/Desktop/fun/simulation/detailed-game.html';
fs.writeFileSync(outputPath, html);
console.log(`\nHTML report saved to: ${outputPath}`);
