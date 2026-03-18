// Find optimal Hard mode strategy (>50% win rate)
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
}
function ON(val) { return new OrdinalNumber(val); }

const C = { recruitCost: 10, squadLeader_baseCost: 200, barracks_baseCost: 800, colony_baseCost: 15000, kingdom_baseCost: 200000, train_baseCost: 80, train_multiplier: 1.01 };

function simulate(clicksPerDay, strategyFn, maxDays = 400) {
  let G = {
    coins: ON(0), troops: ON(1), ppt: 1, rp: 1,
    squadLeaderPower: 1, barracksPower: 1, colonyPower: 1, kingdomPower: 1,
    trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0,
    enemyTroops: ON(0), enemyPower: ON(0), enemyVanquished: false,
    winStreak: 0, lossStreak: 0, day: 0
  };

  function cnt(id) { return G.counts[id] || 0; }
  function tp() { return G.troops.mul(G.ppt); }
  function armyCost(base) { return Math.floor(base * Math.pow(1.03, G._armyClicks)); }
  function recruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, cnt("recruit"))); }
  function expCost(base) {
    const total = G._trainClicks;
    if (total >= 111) return Math.floor(base * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(base * Math.pow(1.02, total));
  }

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
      if (G.enemyTroops.lt(1)) { G.enemyTroops = ON(0); G.enemyPower = ON(0); G.enemyVanquished = true; }
      return "win";
    } else {
      G.lossStreak++; G.winStreak = 0;
      const lossPct = Math.min(G.lossStreak * 10, 100);
      G.troops = G.troops.mulFraction(100 - lossPct, 100);
      G.coins = G.coins.mulFraction(100 - lossPct, 100);
      G.ppt = Math.max(1, G.ppt * (100 - lossPct) / 100);
      ["squad_leader", "barracks", "colony", "kingdom"].forEach(id => {
        if (G.counts[id] > 0) G.counts[id] = Math.max(0, G.counts[id] - Math.ceil(G.counts[id] * lossPct / 100));
      });
      G.rp = 1 + cnt("squad_leader");
      return "loss";
    }
  }

  let battles = { wins: 0, losses: 0 }, gameOver = false, victory = false;

  while (G.day < maxDays && !gameOver) {
    for (let i = 0; i < clicksPerDay; i++) strategyFn(actions, G, cnt, tp);
    G.day++;

    if (!G.enemyVanquished) {
      // Hard mode: X² dragons per day
      G.enemyTroops = G.enemyTroops.add(G.day * G.day);
      G.enemyPower = G.enemyTroops.mul(500);

      if (Math.random() < 0.03) {
        if (doBattle() === "win") battles.wins++; else battles.losses++;
        if (G.troops.lt(1)) gameOver = true;
        if (G.enemyVanquished) victory = true;
      }
    }
  }

  return { victory, gameOver, days: G.day, battles, ppt: G.ppt };
}

function test(name, fn, clicks, runs = 60) {
  let wins = 0, losses = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulate(clicks, fn, 400);
    if (r.victory) wins++;
    else if (r.gameOver) losses++;
  }
  const winRate = Math.round(wins/runs*100);
  const loseRate = Math.round(losses/runs*100);
  console.log(`${name.padEnd(30)} | Win: ${String(winRate).padStart(3)}% | Lose: ${String(loseRate).padStart(3)}%`);
  return winRate;
}

console.log("FINDING OPTIMAL HARD MODE STRATEGY");
console.log("=".repeat(60));
console.log("\nTesting at 30 clicks/sec (fast enter-spam)\n");

// Strategy variations to test

// 1. Super Train (baseline)
const superTrain = (a, G, cnt) => {
  if (a.train()) return;
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
};

// 2. Adaptive: Build army early, then pure train
const adaptive = (a, G, cnt) => {
  // First 30 days: build army infrastructure
  if (G.day < 30) {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
    return;
  }
  // After: pure train
  if (a.train()) return;
  if (a.recruit()) return; a.loot();
};

// 3. Power threshold: Train until we're ahead of enemy, then army
const powerThreshold = (a, G, cnt, tp) => {
  const myPower = tp().toNumber();
  const enemyPower = G.enemyPower.toNumber();

  // If we're behind enemy, prioritize training
  if (myPower < enemyPower * 1.5) {
    if (a.train()) return;
  }
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return;
  if (a.train()) return;
  if (a.recruit()) return; a.loot();
};

// 4. Aggressive train with minimum troops
const minTroopsTrain = (a, G, cnt) => {
  // Keep at least 50 troops for safety
  if (G.troops.toNumber() < 50) {
    if (a.recruit()) return;
  }
  if (a.train()) return;
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
};

// 5. Train ratio: Maintain train:recruit ratio
const trainRatio2to1 = (a, G, cnt) => {
  const trains = cnt("train") || 0;
  const recruits = cnt("recruit") || 0;

  if (trains < recruits * 2) {
    if (a.train()) return;
  }
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
};

// 6. Train ratio 3:1
const trainRatio3to1 = (a, G, cnt) => {
  const trains = cnt("train") || 0;
  const recruits = cnt("recruit") || 0;

  if (trains < recruits * 3) {
    if (a.train()) return;
  }
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
};

// 7. Early colony then pure train
const colonyThenTrain = (a, G, cnt) => {
  if (cnt("colony") < 3) {
    if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
    return;
  }
  if (a.train()) return;
  if (a.recruit()) return; a.loot();
};

// 8. Kingdom then pure train
const kingdomThenTrain = (a, G, cnt) => {
  if (cnt("kingdom") < 3) {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
    return;
  }
  if (a.train()) return;
  if (a.recruit()) return; a.loot();
};

// 9. Hybrid: army + train interleaved
const hybrid = (a, G, cnt) => {
  // Try train first
  if (a.train()) return;
  // Then army
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return;
  // Then recruit
  if (a.recruit()) return;
  a.loot();
};

// 10. Super aggressive: train every possible click, build army only when can't train
const superAggressive = (a, G, cnt) => {
  // Always try train first
  if (a.train()) return;
  // Build army to boost income for more training
  if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
  if (a.squad_leader()) return;
  // Recruit for more troops
  if (a.recruit()) return;
  a.loot();
};

console.log("--- 30 clicks/sec ---");
test("Super Train (baseline)", superTrain, 30);
test("Adaptive (army 30d, then train)", adaptive, 30);
test("Power Threshold", powerThreshold, 30);
test("Min 50 Troops + Train", minTroopsTrain, 30);
test("Train Ratio 2:1", trainRatio2to1, 30);
test("Train Ratio 3:1", trainRatio3to1, 30);
test("Colony Then Train", colonyThenTrain, 30);
test("Kingdom Then Train", kingdomThenTrain, 30);
test("Hybrid", hybrid, 30);

console.log("\n--- 40 clicks/sec ---");
test("Super Train", superTrain, 40);
test("Adaptive", adaptive, 40);
test("Train Ratio 3:1", trainRatio3to1, 40);
test("Min 50 Troops + Train", minTroopsTrain, 40);

console.log("\n--- 50 clicks/sec ---");
test("Super Train", superTrain, 50);
test("Adaptive", adaptive, 50);
test("Train Ratio 3:1", trainRatio3to1, 50);
test("Min 50 Troops + Train", minTroopsTrain, 50);

// Find best combo of parameters
console.log("\n" + "=".repeat(60));
console.log("PARAMETER SEARCH: Adaptive strategy with different switch days");
console.log("=".repeat(60) + "\n");

for (const switchDay of [10, 20, 30, 40, 50, 60]) {
  const strat = (a, G, cnt) => {
    if (G.day < switchDay) {
      if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
      if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
      return;
    }
    if (a.train()) return;
    if (a.recruit()) return; a.loot();
  };
  test(`Adaptive (switch day ${switchDay})`, strat, 40);
}

console.log("\n" + "=".repeat(60));
console.log("PARAMETER SEARCH: Train ratio variations");
console.log("=".repeat(60) + "\n");

for (const ratio of [1, 2, 3, 4, 5, 6]) {
  const strat = (a, G, cnt) => {
    if ((cnt("train")||0) < (cnt("recruit")||1) * ratio) {
      if (a.train()) return;
    }
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
  };
  test(`Train Ratio ${ratio}:1`, strat, 40);
}
