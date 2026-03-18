// Hard Mode Strategy Optimization
// Testing different strategies to beat Hard mode

class OrdinalNumber {
  constructor(val) {
    if (val instanceof OrdinalNumber) {
      this.value = val.value;
    } else if (typeof val === 'bigint') {
      this.value = val < 0n ? 0n : val;
    } else if (typeof val === 'number') {
      this.value = BigInt(Math.max(0, Math.floor(val)));
    } else {
      this.value = 0n;
    }
  }
  clone() { return new OrdinalNumber(this); }
  add(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    return new OrdinalNumber(this.value + other.value);
  }
  sub(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    return new OrdinalNumber(this.value > other.value ? this.value - other.value : 0n);
  }
  mul(n) {
    if (n instanceof OrdinalNumber) return new OrdinalNumber(this.value * n.value);
    return new OrdinalNumber(this.value * BigInt(Math.floor(n)));
  }
  mulFraction(num, denom) {
    return new OrdinalNumber(this.value * BigInt(num) / BigInt(denom));
  }
  gte(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    return this.value >= other.value;
  }
  lt(other) { return !this.gte(other); }
  toNumber() { return Number(this.value); }
  format() {
    const n = this.toNumber();
    if (n < 1e6) return n.toLocaleString();
    return n.toExponential(2);
  }
}

function ON(val) { return new OrdinalNumber(val); }

const C = {
  lootBase: 1,
  recruitCost: 10,
  squadLeader_baseCost: 200,
  barracks_baseCost: 800,
  colony_baseCost: 15000,
  kingdom_baseCost: 200000,
  empire_baseCost: 20000000,
  train_baseCost: 80,
  train_multiplier: 1.01,
};

function simulate(clicksPerDay, strategyFn, maxDays = 300, verbose = false) {
  let G = {
    coins: ON(0),
    troops: ON(1),
    ppt: 1,
    rp: 1,
    squadLeaderPower: 1,
    barracksPower: 1,
    colonyPower: 1,
    kingdomPower: 1,
    empirePower: 1,
    trainMult: C.train_multiplier,
    counts: {},
    _armyClicks: 0,
    _trainClicks: 0,
    enemyTroops: ON(0),
    enemyPower: ON(0),
    winStreak: 0,
    lossStreak: 0,
    day: 0,
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
    loot: () => {
      if (G.troops.lt(1)) return false;
      let gain = tp().mul(C.lootBase);
      if (gain.lt(1)) gain = ON(1);
      G.coins = G.coins.add(gain);
      return true;
    },
    recruit: () => {
      const cost = recruitCost();
      if (G.coins.lt(cost)) return false;
      G.coins = G.coins.sub(cost);
      G.troops = G.troops.add(G.rp);
      G.counts["recruit"] = (G.counts["recruit"] || 0) + 1;
      return true;
    },
    train: () => {
      const cost = expCost(C.train_baseCost);
      if (G.coins.lt(cost) || G.troops.lt(5)) return false;
      G.coins = G.coins.sub(cost);
      G.ppt *= G.trainMult;
      G.counts["train"] = (G.counts["train"] || 0) + 1;
      G._trainClicks++;
      return true;
    },
    squad_leader: () => {
      const cost = armyCost(C.squadLeader_baseCost);
      if (G.coins.lt(cost) || G.troops.lt(2)) return false;
      G.coins = G.coins.sub(cost);
      G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower;
      G._armyClicks++;
      G.rp = 1 + cnt("squad_leader");
      return true;
    },
    barracks: () => {
      const cost = armyCost(C.barracks_baseCost);
      if (G.coins.lt(cost) || cnt("squad_leader") < 3) return false;
      G.coins = G.coins.sub(cost);
      G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower;
      G._armyClicks++;
      G.squadLeaderPower += G.barracksPower;
      return true;
    },
    colony: () => {
      const cost = armyCost(C.colony_baseCost);
      if (G.coins.lt(cost) || cnt("barracks") < 3) return false;
      G.coins = G.coins.sub(cost);
      G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower;
      G._armyClicks++;
      G.barracksPower += G.colonyPower;
      return true;
    },
    kingdom: () => {
      const cost = armyCost(C.kingdom_baseCost);
      if (G.coins.lt(cost) || cnt("colony") < 3) return false;
      G.coins = G.coins.sub(cost);
      G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower;
      G._armyClicks++;
      G.colonyPower += G.kingdomPower;
      return true;
    },
    empire: () => {
      const cost = armyCost(C.empire_baseCost);
      if (G.coins.lt(cost) || cnt("kingdom") < 3) return false;
      G.coins = G.coins.sub(cost);
      G.counts["empire"] = (G.counts["empire"] || 0) + G.empirePower;
      G._armyClicks++;
      G.kingdomPower += G.empirePower;
      return true;
    },
  };

  function doBattle() {
    const playerPower = tp();
    const enemyPower = G.enemyPower;
    const playerWins = playerPower.gte(enemyPower);

    if (playerWins) {
      G.winStreak++;
      G.lossStreak = 0;
      const lossPct = Math.min(G.winStreak * 10, 100);
      G.enemyTroops = G.enemyTroops.mulFraction(100 - lossPct, 100);
      G.enemyPower = G.enemyPower.mulFraction(100 - lossPct, 100);
      return { result: "win", pct: lossPct };
    } else {
      G.lossStreak++;
      G.winStreak = 0;
      const lossPct = Math.min(G.lossStreak * 10, 100);
      G.troops = G.troops.mulFraction(100 - lossPct, 100);
      G.coins = G.coins.mulFraction(100 - lossPct, 100);
      ["squad_leader", "barracks", "colony", "kingdom", "empire"].forEach(id => {
        if (G.counts[id] > 0) {
          const lost = Math.ceil(G.counts[id] * lossPct / 100);
          G.counts[id] = Math.max(0, G.counts[id] - lost);
        }
      });
      G.rp = 1 + cnt("squad_leader");
      G.squadLeaderPower = 1 + cnt("barracks");
      G.barracksPower = 1 + cnt("colony");
      G.colonyPower = 1 + cnt("kingdom");
      G.kingdomPower = 1 + cnt("empire");
      return { result: "loss", pct: lossPct };
    }
  }

  let battles = { wins: 0, losses: 0 };
  let gameOver = false;
  let victory = false;
  let peakPower = 0;

  while (G.day < maxDays && !gameOver) {
    for (let i = 0; i < clicksPerDay; i++) {
      strategyFn(actions, G, cnt);
    }

    G.day++;

    // Hard mode: X² dragons per day (ppt = 500)
    const enemyGain = G.day * G.day;
    G.enemyTroops = G.enemyTroops.add(enemyGain);
    G.enemyPower = G.enemyTroops.mul(500);

    const currentPower = tp().toNumber();
    if (currentPower > peakPower) peakPower = currentPower;

    // 3% battle chance
    if (Math.random() < 0.03) {
      const battle = doBattle();
      if (battle.result === "win") {
        battles.wins++;
        if (verbose) console.log(`Day ${G.day}: WIN! (-${battle.pct}% enemy) Your: ${tp().format()} vs Enemy: ${G.enemyPower.format()}`);
      } else {
        battles.losses++;
        if (verbose) console.log(`Day ${G.day}: LOSS (-${battle.pct}%) Your: ${tp().format()} vs Enemy: ${G.enemyPower.format()}`);
      }

      if (G.troops.lt(1)) gameOver = true;
      if (G.enemyTroops.lt(1)) { gameOver = true; victory = true; }
    }

    if (verbose && G.day % 50 === 0) {
      console.log(`Day ${G.day}: Power=${tp().format()}, ppt=${G.ppt.toFixed(2)}, troops=${G.troops.format()}, Enemy=${G.enemyPower.format()}`);
    }
  }

  return { victory, gameOver, days: G.day, battles, peakPower, finalPower: tp().toNumber(), enemyPower: G.enemyPower.toNumber(), counts: {...G.counts}, ppt: G.ppt };
}

// STRATEGIES

// Strategy 1: Army Rush (original)
function armyRush(actions, G, cnt) {
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  if (actions.recruit()) return;
  actions.loot();
}

// Strategy 2: Balanced (train every few recruits)
function balanced(actions, G, cnt) {
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  if (cnt("recruit") > 5 && cnt("train") < cnt("recruit") / 3) {
    if (actions.train()) return;
  }
  if (actions.recruit()) return;
  actions.loot();
}

// Strategy 3: Heavy Training (prioritize ppt)
function heavyTrain(actions, G, cnt) {
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  // Train more aggressively - try train before recruit if we have enough troops
  if (cnt("recruit") > 3 && cnt("train") < cnt("recruit")) {
    if (actions.train()) return;
  }
  if (actions.recruit()) return;
  actions.loot();
}

// Strategy 4: Empire Rush (get to empire ASAP)
function empireRush(actions, G, cnt) {
  if (actions.empire()) return;
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  if (actions.recruit()) return;
  actions.loot();
}

// Strategy 5: Train-Heavy with Empire
function trainEmpire(actions, G, cnt) {
  if (actions.empire()) return;
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  // Alternate train and recruit
  if (cnt("train") < cnt("recruit") / 2 && actions.train()) return;
  if (actions.recruit()) return;
  actions.loot();
}

// Strategy 6: Super aggressive training
function superTrain(actions, G, cnt) {
  // Try to train whenever possible
  if (actions.train()) return;
  if (actions.empire()) return;
  if (actions.kingdom()) return;
  if (actions.colony()) return;
  if (actions.barracks()) return;
  if (actions.squad_leader()) return;
  if (actions.recruit()) return;
  actions.loot();
}

// Test a strategy
function testStrategy(name, strategyFn, clicksPerDay, runs = 30) {
  let wins = 0, losses = 0, survived = 0;
  let totalPeakPower = 0;

  for (let i = 0; i < runs; i++) {
    const result = simulate(clicksPerDay, strategyFn, 300, false);
    if (result.victory) wins++;
    else if (result.gameOver) losses++;
    else survived++;
    totalPeakPower += result.peakPower;
  }

  const avgPeak = totalPeakPower / runs;
  console.log(`  ${name.padEnd(20)} | Win: ${(wins/runs*100).toFixed(0).padStart(3)}% | Lose: ${(losses/runs*100).toFixed(0).padStart(3)}% | Peak: ${avgPeak.toExponential(2)}`);
  return { wins, losses, survived, avgPeak };
}

// Run tests
console.log("HARD MODE STRATEGY OPTIMIZATION");
console.log("================================\n");

[20, 30, 40, 50].forEach(clickRate => {
  console.log(`\n=== ${clickRate} CLICKS/SECOND ===`);
  console.log("Strategy             | Win   | Lose  | Avg Peak Power");
  console.log("-".repeat(60));

  testStrategy("Army Rush", armyRush, clickRate);
  testStrategy("Balanced", balanced, clickRate);
  testStrategy("Heavy Train", heavyTrain, clickRate);
  testStrategy("Empire Rush", empireRush, clickRate);
  testStrategy("Train+Empire", trainEmpire, clickRate);
  testStrategy("Super Train", superTrain, clickRate);
});

// Run one verbose example of best strategy
console.log("\n\n=== VERBOSE RUN: Train+Empire @ 50 clicks/sec ===");
simulate(50, trainEmpire, 200, true);
