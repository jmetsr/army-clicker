// Simulate Army Clicker game to maximize coins in 3000 clicks
// Time: 1 second passes every 10 clicks

// Game state
const G = {
  coins: 0,
  troops: 1,
  ppt: 1,
  rp: 1,
  squadLeaderPower: 1,
  barracksPower: 1,
  colonyPower: 1,
  kingdomPower: 1,
  empirePower: 1,
  commanderPower: 1,
  generalPower: 1,
  trainMult: 1.01,
  counts: {},
  _armyClicks: 0,
  _trainClicks: 0,
  _cmdClicks: 0,
  time: 0,  // seconds elapsed
};

// Constants
const C = {
  lootBase: 1,
  recruitCost: 10,
  squadLeader_baseCost: 200,
  barracks_baseCost: 800,
  colony_baseCost: 15000,
  kingdom_baseCost: 200000,
  empire_baseCost: 20000000,
  commander_baseCost: 5000,
  general_baseCost: 100000,
  train_baseCost: 80,
  barracks_unlock: 3,
  colony_unlock: 3,
  kingdom_unlock: 3,
  empire_unlock: 3,
  general_unlock: 3,
};

function cnt(id) { return G.counts[id] || 0; }
function inc(id) { G.counts[id] = (G.counts[id] || 0) + 1; }
function tp() { return G.troops * G.ppt; }

// Tick: commanders generate coins, called every 10 clicks (1 second)
function tick() {
  G.time++;
  var cmdCount = cnt("commander");
  if (cmdCount > 0) {
    // Each commander gives 1 loot per second
    G.coins += Math.floor(tp() * C.lootBase * cmdCount);
  }
}

function armyTotal() { return G._armyClicks || 0; }
function armyCost(base) { return Math.floor(base * Math.pow(1.02, armyTotal())); }

function cmdTotal() { return G._cmdClicks || 0; }
function cmdCost(base) { return Math.floor(base * Math.pow(1.02, cmdTotal())); }

function trainTotal() { return G._trainClicks || 0; }
function recruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, cnt("recruit"))); }

function expCost(base) {
  const total = trainTotal();
  if (total >= 111) {
    return Math.floor(base * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
  }
  return Math.floor(base * Math.pow(1.02, total));
}

// Actions
const actions = {
  loot: {
    canDo: () => true,
    cost: () => 0,
    effect: () => { G.coins += Math.floor(tp() * C.lootBase); }
  },
  recruit: {
    canDo: () => G.coins >= recruitCost(),
    cost: recruitCost,
    effect: () => { G.coins -= recruitCost(); G.troops += G.rp; inc("recruit"); }
  },
  train: {
    canDo: () => G.coins >= expCost(C.train_baseCost) && G.troops >= 5,
    cost: () => expCost(C.train_baseCost),
    effect: () => { G.coins -= expCost(C.train_baseCost); G.ppt *= G.trainMult; inc("train"); G._trainClicks++; }
  },
  squad_leader: {
    canDo: () => G.coins >= armyCost(C.squadLeader_baseCost) && G.troops >= 2,
    cost: () => armyCost(C.squadLeader_baseCost),
    effect: () => {
      G.coins -= armyCost(C.squadLeader_baseCost);
      G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower;
      G._armyClicks++;
      G.rp = 1 + cnt("squad_leader");
    }
  },
  barracks: {
    canDo: () => G.coins >= armyCost(C.barracks_baseCost) && cnt("squad_leader") >= C.barracks_unlock,
    cost: () => armyCost(C.barracks_baseCost),
    effect: () => {
      G.coins -= armyCost(C.barracks_baseCost);
      G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower;
      G._armyClicks++;
      G.squadLeaderPower += G.barracksPower;
    }
  },
  colony: {
    canDo: () => G.coins >= armyCost(C.colony_baseCost) && cnt("barracks") >= C.colony_unlock,
    cost: () => armyCost(C.colony_baseCost),
    effect: () => {
      G.coins -= armyCost(C.colony_baseCost);
      G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower;
      G._armyClicks++;
      G.barracksPower += G.colonyPower;
    }
  },
  kingdom: {
    canDo: () => G.coins >= armyCost(C.kingdom_baseCost) && cnt("colony") >= C.colony_unlock,
    cost: () => armyCost(C.kingdom_baseCost),
    effect: () => {
      G.coins -= armyCost(C.kingdom_baseCost);
      G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower;
      G._armyClicks++;
      G.colonyPower += G.kingdomPower;
    }
  },
  commander: {
    canDo: () => G.coins >= cmdCost(C.commander_baseCost) && G.troops >= 50,
    cost: () => cmdCost(C.commander_baseCost),
    effect: () => {
      G.coins -= cmdCost(C.commander_baseCost);
      G.counts["commander"] = (G.counts["commander"] || 0) + G.commanderPower;
      G._cmdClicks++;
    }
  },
  general: {
    canDo: () => G.coins >= cmdCost(C.general_baseCost) && cnt("commander") >= C.general_unlock,
    cost: () => cmdCost(C.general_baseCost),
    effect: () => {
      G.coins -= cmdCost(C.general_baseCost);
      G.counts["general"] = (G.counts["general"] || 0) + G.generalPower;
      G._cmdClicks++;
      G.commanderPower += G.generalPower;
    }
  }
};

// Strategy: evaluate best action based on value per click
function getBestAction() {
  const lootValue = tp();

  // Check each action's value
  let best = 'loot';
  let bestScore = lootValue;

  // Recruit: more troops = more loot
  if (actions.recruit.canDo()) {
    const futureLoot = (G.troops + G.rp) * G.ppt;
    const gain = futureLoot - lootValue;
    // Worth it if we recoup cost quickly
    const clicksToRecoup = actions.recruit.cost() / gain;
    if (clicksToRecoup < 20) {
      const score = gain * 100 / Math.max(1, clicksToRecoup);
      if (score > bestScore) { best = 'recruit'; bestScore = score; }
    }
  }

  // Train: more ppt = more loot per troop
  if (actions.train.canDo()) {
    const futureLoot = G.troops * (G.ppt * G.trainMult);
    const gain = futureLoot - lootValue;
    const clicksToRecoup = actions.train.cost() / gain;
    if (clicksToRecoup < 30) {
      const score = gain * 100 / Math.max(1, clicksToRecoup);
      if (score > bestScore) { best = 'train'; bestScore = score; }
    }
  }

  // Squad leader: more rp = more troops per recruit
  if (actions.squad_leader.canDo()) {
    // Value: future recruits give more troops
    const extraTroopsPerRecruit = G.squadLeaderPower;
    const valuePerFutureRecruit = extraTroopsPerRecruit * G.ppt;
    const score = valuePerFutureRecruit * 50;
    if (score > bestScore) { best = 'squad_leader'; bestScore = score; }
  }

  // Barracks: boosts squad leader power
  if (actions.barracks.canDo()) {
    const score = G.barracksPower * G.ppt * 100;
    if (score > bestScore) { best = 'barracks'; bestScore = score; }
  }

  // Colony: boosts barracks power
  if (actions.colony.canDo()) {
    const score = G.colonyPower * G.ppt * 200;
    if (score > bestScore) { best = 'colony'; bestScore = score; }
  }

  // Kingdom: boosts colony power
  if (actions.kingdom.canDo()) {
    const score = G.kingdomPower * G.ppt * 400;
    if (score > bestScore) { best = 'kingdom'; bestScore = score; }
  }

  return best;
}

// Reset game state
function resetGame() {
  G.coins = 0;
  G.troops = 1;
  G.ppt = 1;
  G.rp = 1;
  G.squadLeaderPower = 1;
  G.barracksPower = 1;
  G.colonyPower = 1;
  G.kingdomPower = 1;
  G.empirePower = 1;
  G.commanderPower = 1;
  G.generalPower = 1;
  G.trainMult = 1.01;
  G.counts = {};
  G._armyClicks = 0;
  G._trainClicks = 0;
  G._cmdClicks = 0;
  G.time = 0;
}

// Balanced strategy: prioritize upgrades when affordable
function playBalanced(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    // Time passes: 1 second every 10 clicks
    if (clicks > 0 && clicks % 10 === 0) tick();

    let action = 'loot';

    // Priority order: highest tier first if affordable
    if (actions.kingdom.canDo()) action = 'kingdom';
    else if (actions.colony.canDo()) action = 'colony';
    else if (actions.barracks.canDo()) action = 'barracks';
    else if (actions.squad_leader.canDo() && cnt("squad_leader") < 20) action = 'squad_leader';
    else if (actions.general.canDo()) action = 'general';
    else if (actions.commander.canDo() && cnt("commander") < 10) action = 'commander';
    else if (actions.train.canDo() && G.ppt < 100) action = 'train';
    else if (actions.recruit.canDo() && G.troops < 500) action = 'recruit';
    // else loot

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Aggressive training strategy
function playTrainHeavy(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Get troops first, then train hard
    if (G.troops < 10 && actions.recruit.canDo()) action = 'recruit';
    else if (actions.train.canDo()) action = 'train';
    else if (actions.recruit.canDo() && G.troops < 100) action = 'recruit';
    else if (actions.squad_leader.canDo()) action = 'squad_leader';
    else if (actions.barracks.canDo()) action = 'barracks';
    else if (actions.colony.canDo()) action = 'colony';
    else if (actions.kingdom.canDo()) action = 'kingdom';
    // else loot

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Army-focused strategy
function playArmyHeavy(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Build army chain aggressively
    if (actions.kingdom.canDo()) action = 'kingdom';
    else if (actions.colony.canDo()) action = 'colony';
    else if (actions.barracks.canDo()) action = 'barracks';
    else if (actions.squad_leader.canDo()) action = 'squad_leader';
    else if (actions.recruit.canDo()) action = 'recruit';
    else if (actions.train.canDo() && cnt("train") < 50) action = 'train';
    // else loot

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Simple greedy strategy
function playGreedy(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    const action = getBestAction();
    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Run all strategies
function runStrategy(name, fn) {
  console.log(`\n=== ${name} ===`);
  const result = fn(3000);
  console.log("Progress:");
  result.log.forEach(l => console.log("  " + l));
  console.log(`FINAL: Coins=${result.coins.toExponential(3)}, TP=${(result.troops * result.ppt).toExponential(3)}, Time=${result.time}s`);
  console.log("Counts:", Object.entries(result.counts).filter(([k,v])=>v>0).map(([k,v])=>`${k}:${v}`).join(", "));
  return result.coins;
}

// Optimized hybrid strategy (with commander focus)
function playOptimized(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Phase 1: Bootstrap (first 200 clicks) - get troops fast
    if (clicks < 200) {
      if (actions.recruit.canDo()) action = 'recruit';
      else if (actions.squad_leader.canDo()) action = 'squad_leader';
    }
    // Phase 2: Build army chain, commanders, and train
    else {
      // Commanders are valuable for passive income!
      if (actions.general.canDo()) action = 'general';
      else if (actions.commander.canDo()) action = 'commander';
      else if (actions.kingdom.canDo()) action = 'kingdom';
      else if (actions.colony.canDo()) action = 'colony';
      else if (actions.barracks.canDo()) action = 'barracks';
      else if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
      // Sprinkle in some training
      else if (actions.train.canDo() && cnt("train") < 100 && clicks % 10 === 0) action = 'train';
    }

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Pure recruit spam after initial SL
function playRecruitSpam(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Get some squad leaders first
    if (cnt("squad_leader") < 50 && actions.squad_leader.canDo()) action = 'squad_leader';
    else if (actions.barracks.canDo() && cnt("barracks") < 20) action = 'barracks';
    else if (actions.colony.canDo() && cnt("colony") < 5) action = 'colony';
    else if (actions.recruit.canDo()) action = 'recruit';

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

// Commander-focused strategy: maximize passive income
function playCommanderHeavy(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Phase 1: Get 50 troops to unlock commanders
    if (G.troops < 50) {
      if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }
    // Phase 2: Rush commanders and generals
    else {
      if (actions.general.canDo()) action = 'general';
      else if (actions.commander.canDo()) action = 'commander';
      // Keep building troops to boost tp (which commanders multiply)
      else if (actions.kingdom.canDo()) action = 'kingdom';
      else if (actions.colony.canDo()) action = 'colony';
      else if (actions.barracks.canDo()) action = 'barracks';
      else if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.toExponential(2)}, troops=${G.troops}, ppt=${G.ppt.toFixed(4)}, tp=${tp().toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return { coins: G.coins, troops: G.troops, ppt: G.ppt, log, counts: {...G.counts}, time: G.time };
}

const results = [
  ["BALANCED", () => playBalanced(3000)],
  ["TRAIN-HEAVY", () => playTrainHeavy(3000)],
  ["ARMY-HEAVY", () => playArmyHeavy(3000)],
  ["OPTIMIZED", () => playOptimized(3000)],
  ["RECRUIT-SPAM", () => playRecruitSpam(3000)],
  ["COMMANDER-HEAVY", () => playCommanderHeavy(3000)],
];

const scores = results.map(([name, fn]) => [name, runStrategy(name, fn)]);
console.log("\n=== RANKING ===");
scores.sort((a,b) => b[1] - a[1]).forEach(([name, coins], i) => {
  console.log(`${i+1}. ${name}: ${coins.toExponential(3)} coins`);
});
