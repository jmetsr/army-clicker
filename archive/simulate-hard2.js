// Hard Mode - Better Strategies
class OrdinalNumber {
  constructor(val) {
    if (val instanceof OrdinalNumber) this.value = val.value;
    else if (typeof val === 'bigint') this.value = val < 0n ? 0n : val;
    else if (typeof val === 'number') this.value = BigInt(Math.max(0, Math.floor(val)));
    else this.value = 0n;
  }
  add(other) { if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other); return new OrdinalNumber(this.value + other.value); }
  sub(other) { if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other); return new OrdinalNumber(this.value > other.value ? this.value - other.value : 0n); }
  mul(n) { if (n instanceof OrdinalNumber) return new OrdinalNumber(this.value * n.value); return new OrdinalNumber(this.value * BigInt(Math.floor(n))); }
  mulFraction(num, denom) { return new OrdinalNumber(this.value * BigInt(num) / BigInt(denom)); }
  gte(other) { if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other); return this.value >= other.value; }
  lt(other) { return !this.gte(other); }
  toNumber() { return Number(this.value); }
  format() { const n = this.toNumber(); return n < 1e6 ? n.toLocaleString() : n.toExponential(2); }
}
function ON(val) { return new OrdinalNumber(val); }

const C = { recruitCost: 10, squadLeader_baseCost: 200, barracks_baseCost: 800, colony_baseCost: 15000, kingdom_baseCost: 200000, empire_baseCost: 20000000, train_baseCost: 80, train_multiplier: 1.01 };

function simulate(clicksPerDay, strategyFn, maxDays = 300) {
  let G = { coins: ON(0), troops: ON(1), ppt: 1, rp: 1, squadLeaderPower: 1, barracksPower: 1, colonyPower: 1, kingdomPower: 1, empirePower: 1, trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0, enemyTroops: ON(0), enemyPower: ON(0), winStreak: 0, lossStreak: 0, day: 0 };
  function cnt(id) { return G.counts[id] || 0; }
  function tp() { return G.troops.mul(G.ppt); }
  function armyCost(base) { return Math.floor(base * Math.pow(1.03, G._armyClicks)); }
  function recruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, cnt("recruit"))); }
  function expCost(base) { const total = G._trainClicks; if (total >= 111) return Math.floor(base * Math.pow(1.02, 111) * Math.pow(1.03, total - 111)); return Math.floor(base * Math.pow(1.02, total)); }

  const actions = {
    loot: () => { if (G.troops.lt(1)) return false; let gain = tp(); if (gain.lt(1)) gain = ON(1); G.coins = G.coins.add(gain); return true; },
    recruit: () => { const cost = recruitCost(); if (G.coins.lt(cost)) return false; G.coins = G.coins.sub(cost); G.troops = G.troops.add(G.rp); G.counts["recruit"] = (G.counts["recruit"] || 0) + 1; return true; },
    train: () => { const cost = expCost(C.train_baseCost); if (G.coins.lt(cost) || G.troops.lt(5)) return false; G.coins = G.coins.sub(cost); G.ppt *= G.trainMult; G.counts["train"] = (G.counts["train"] || 0) + 1; G._trainClicks++; return true; },
    squad_leader: () => { const cost = armyCost(C.squadLeader_baseCost); if (G.coins.lt(cost) || G.troops.lt(2)) return false; G.coins = G.coins.sub(cost); G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower; G._armyClicks++; G.rp = 1 + cnt("squad_leader"); return true; },
    barracks: () => { const cost = armyCost(C.barracks_baseCost); if (G.coins.lt(cost) || cnt("squad_leader") < 3) return false; G.coins = G.coins.sub(cost); G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower; G._armyClicks++; G.squadLeaderPower += G.barracksPower; return true; },
    colony: () => { const cost = armyCost(C.colony_baseCost); if (G.coins.lt(cost) || cnt("barracks") < 3) return false; G.coins = G.coins.sub(cost); G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower; G._armyClicks++; G.barracksPower += G.colonyPower; return true; },
    kingdom: () => { const cost = armyCost(C.kingdom_baseCost); if (G.coins.lt(cost) || cnt("colony") < 3) return false; G.coins = G.coins.sub(cost); G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower; G._armyClicks++; G.colonyPower += G.kingdomPower; return true; },
  };

  function doBattle() {
    const playerPower = tp(), enemyPower = G.enemyPower;
    if (playerPower.gte(enemyPower)) {
      G.winStreak++; G.lossStreak = 0;
      const lossPct = Math.min(G.winStreak * 10, 100);
      G.enemyTroops = G.enemyTroops.mulFraction(100 - lossPct, 100);
      G.enemyPower = G.enemyPower.mulFraction(100 - lossPct, 100);
      return "win";
    } else {
      G.lossStreak++; G.winStreak = 0;
      const lossPct = Math.min(G.lossStreak * 10, 100);
      G.troops = G.troops.mulFraction(100 - lossPct, 100);
      G.coins = G.coins.mulFraction(100 - lossPct, 100);
      ["squad_leader", "barracks", "colony", "kingdom"].forEach(id => { if (G.counts[id] > 0) { G.counts[id] = Math.max(0, G.counts[id] - Math.ceil(G.counts[id] * lossPct / 100)); } });
      G.rp = 1 + cnt("squad_leader");
      return "loss";
    }
  }

  let battles = { wins: 0, losses: 0 }, gameOver = false, victory = false;
  while (G.day < maxDays && !gameOver) {
    for (let i = 0; i < clicksPerDay; i++) strategyFn(actions, G, cnt);
    G.day++;
    G.enemyTroops = G.enemyTroops.add(G.day * G.day);
    G.enemyPower = G.enemyTroops.mul(500);
    if (Math.random() < 0.03) {
      if (doBattle() === "win") battles.wins++; else battles.losses++;
      if (G.troops.lt(1)) gameOver = true;
      if (G.enemyTroops.lt(1)) { gameOver = true; victory = true; }
    }
  }
  return { victory, gameOver, days: G.day, battles, ppt: G.ppt, trains: G.counts["train"] || 0 };
}

// STRATEGIES

// Original Super Train
const superTrain = (a, G, cnt) => { if (a.train()) return; if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return; if (a.squad_leader()) return; if (a.recruit()) return; a.loot(); };

// Maintain minimum troops, then train
const safeTrain = (a, G, cnt) => {
  if (G.troops.toNumber() < 20 && a.recruit()) return;
  if (a.train()) return;
  if (a.recruit()) return;
  a.loot();
};

// Build army first 50 days, then pure train
const earlyArmy = (a, G, cnt) => {
  if (G.day < 50) {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return; if (a.squad_leader()) return;
  }
  if (a.train()) return;
  if (a.recruit()) return;
  a.loot();
};

// Alternate: train 3x, recruit 1x
const trainHeavy = (a, G, cnt) => {
  const ratio = (cnt("train") || 0) / Math.max(1, cnt("recruit") || 1);
  if (ratio < 3 && a.train()) return;
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return; if (a.squad_leader()) return;
  if (a.recruit()) return;
  a.loot();
};

// Build to colony, then pure train
const colonyThenTrain = (a, G, cnt) => {
  if (cnt("colony") < 3) {
    if (a.colony()) return; if (a.barracks()) return; if (a.squad_leader()) return; if (a.recruit()) return;
  }
  if (a.train()) return;
  if (a.recruit()) return;
  a.loot();
};

// Pure train, no army at all
const pureTrain = (a, G, cnt) => {
  if (a.train()) return;
  if (a.recruit()) return;
  a.loot();
};

function test(name, fn, clicks, runs = 50) {
  let wins = 0, losses = 0, totalTrains = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulate(clicks, fn, 400);
    if (r.victory) wins++;
    else if (r.gameOver) losses++;
    totalTrains += r.trains;
  }
  console.log(`${name.padEnd(22)} | Win: ${String(Math.round(wins/runs*100)).padStart(3)}% | Lose: ${String(Math.round(losses/runs*100)).padStart(3)}% | Avg trains: ${Math.round(totalTrains/runs)}`);
}

console.log("HARD MODE - STRATEGY COMPARISON @ 40 clicks/sec");
console.log("=".repeat(65));
test("Super Train", superTrain, 40);
test("Safe Train (20 min)", safeTrain, 40);
test("Early Army (50 days)", earlyArmy, 40);
test("Train Heavy (3:1)", trainHeavy, 40);
test("Colony Then Train", colonyThenTrain, 40);
test("Pure Train (no army)", pureTrain, 40);

console.log("\n@ 50 clicks/sec");
console.log("=".repeat(65));
test("Super Train", superTrain, 50);
test("Safe Train (20 min)", safeTrain, 50);
test("Pure Train (no army)", pureTrain, 50);

console.log("\n@ 60 clicks/sec");
console.log("=".repeat(65));
test("Super Train", superTrain, 60);
test("Safe Train (20 min)", safeTrain, 60);
test("Pure Train (no army)", pureTrain, 60);
