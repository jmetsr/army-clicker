// Battle Mode Simulation
// 10 clicks per second, battle chance checked every 10 clicks (1 day)

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

// Game constants
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

// Enemy config per difficulty
const ENEMY_CONFIG = {
  easy: { name: "Town Police Force", troopType: "Pikemen", ppt: 3, battleChance: 0.01, growthFn: (day) => 1 },
  medium: { name: "Imperial Forces", troopType: "Knights", ppt: 15, battleChance: 0.02, growthFn: (day) => day },
  hard: { name: "Forces of Dark Lord", troopType: "Dragons", ppt: 500, battleChance: 0.03, growthFn: (day) => day * day },
};

function simulate(difficulty, maxDays = 1000, verbose = false) {
  const config = ENEMY_CONFIG[difficulty];

  // Game state
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

  // Actions
  function loot() {
    if (G.troops.lt(1)) return false;
    let gain = tp().mul(C.lootBase);
    if (gain.lt(1)) gain = ON(1);
    G.coins = G.coins.add(gain);
    return true;
  }

  function recruit() {
    const cost = recruitCost();
    if (G.coins.lt(cost)) return false;
    G.coins = G.coins.sub(cost);
    G.troops = G.troops.add(G.rp);
    G.counts["recruit"] = (G.counts["recruit"] || 0) + 1;
    return true;
  }

  function buySquadLeader() {
    const cost = armyCost(C.squadLeader_baseCost);
    if (G.coins.lt(cost) || G.troops.lt(2)) return false;
    G.coins = G.coins.sub(cost);
    G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower;
    G._armyClicks++;
    G.rp = 1 + cnt("squad_leader");
    return true;
  }

  function buyBarracks() {
    const cost = armyCost(C.barracks_baseCost);
    if (G.coins.lt(cost) || cnt("squad_leader") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower;
    G._armyClicks++;
    G.squadLeaderPower += G.barracksPower;
    return true;
  }

  function buyColony() {
    const cost = armyCost(C.colony_baseCost);
    if (G.coins.lt(cost) || cnt("barracks") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower;
    G._armyClicks++;
    G.barracksPower += G.colonyPower;
    return true;
  }

  function buyKingdom() {
    const cost = armyCost(C.kingdom_baseCost);
    if (G.coins.lt(cost) || cnt("colony") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower;
    G._armyClicks++;
    G.colonyPower += G.kingdomPower;
    return true;
  }

  function train() {
    const cost = expCost(C.train_baseCost);
    if (G.coins.lt(cost) || G.troops.lt(5)) return false;
    G.coins = G.coins.sub(cost);
    G.ppt *= G.trainMult;
    G.counts["train"] = (G.counts["train"] || 0) + 1;
    G._trainClicks++;
    return true;
  }

  // Battle
  function doBattle() {
    const playerPower = tp();
    const enemyPower = G.enemyPower;
    const playerWins = playerPower.gte(enemyPower);

    if (playerWins) {
      G.winStreak++;
      G.lossStreak = 0;
      const lossPct = Math.min(G.winStreak * 10, 100);
      const keepFraction = 100 - lossPct;
      G.enemyTroops = G.enemyTroops.mulFraction(keepFraction, 100);
      G.enemyPower = G.enemyPower.mulFraction(keepFraction, 100);
      if (verbose) console.log(`  VICTORY! Enemy loses ${lossPct}%. Streak: ${G.winStreak}`);
      return "win";
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
      if (verbose) console.log(`  DEFEAT! You lose ${lossPct}%. Streak: ${G.lossStreak}`);
      return "loss";
    }
  }

  // Strategy: prioritize army chain, then recruit, then loot
  // Better strategy: balance army growth with training
  function playClick() {
    if (buyKingdom()) return "kingdom";
    if (buyColony()) return "colony";
    if (buyBarracks()) return "barracks";
    if (buySquadLeader()) return "squad_leader";
    // Train occasionally for ppt boost
    if (cnt("recruit") > 5 && cnt("train") < cnt("recruit") / 3 && train()) return "train";
    if (recruit()) return "recruit";
    if (loot()) return "loot";
    return "nothing";
  }

  // Run simulation
  let clicks = 0;
  let battles = { wins: 0, losses: 0 };
  let gameOver = false;
  let victory = false;

  while (G.day < maxDays && !gameOver) {
    // 10 clicks per day
    for (let i = 0; i < 10; i++) {
      playClick();
      clicks++;
    }

    // End of day
    G.day++;

    // Enemy grows
    const enemyGain = config.growthFn(G.day);
    G.enemyTroops = G.enemyTroops.add(enemyGain);
    G.enemyPower = G.enemyTroops.mul(config.ppt);

    // Battle chance
    if (Math.random() < config.battleChance) {
      const result = doBattle();
      if (result === "win") battles.wins++;
      else battles.losses++;

      // Check game over conditions
      if (G.troops.lt(1)) {
        gameOver = true;
        if (verbose) console.log(`\nGAME OVER: Your army was destroyed on day ${G.day}`);
      }
      if (G.enemyTroops.lt(1)) {
        gameOver = true;
        victory = true;
        if (verbose) console.log(`\nVICTORY: Enemy vanquished on day ${G.day}!`);
      }
    }

    // Progress log
    if (verbose && G.day % 100 === 0) {
      console.log(`Day ${G.day}: Your power=${tp().format()}, Enemy power=${G.enemyPower.format()}, Battles: ${battles.wins}W/${battles.losses}L`);
    }
  }

  return {
    difficulty,
    days: G.day,
    clicks,
    victory,
    gameOver,
    finalTroops: G.troops.toNumber(),
    finalPower: tp().toNumber(),
    enemyTroops: G.enemyTroops.toNumber(),
    enemyPower: G.enemyPower.toNumber(),
    battles,
    counts: { ...G.counts },
  };
}

// Run multiple simulations for each difficulty
function testDifficulty(difficulty, runs = 20) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing ${difficulty.toUpperCase()} mode (${runs} runs)`);
  console.log(`${"=".repeat(60)}`);

  let wins = 0, losses = 0, survivals = 0;
  let totalDays = 0;

  for (let i = 0; i < runs; i++) {
    const result = simulate(difficulty, 500, false);
    totalDays += result.days;

    if (result.victory) {
      wins++;
    } else if (result.gameOver) {
      losses++;
    } else {
      survivals++;
    }
  }

  console.log(`Results after ${runs} runs:`);
  console.log(`  Victories (enemy vanquished): ${wins} (${(wins/runs*100).toFixed(1)}%)`);
  console.log(`  Defeats (army destroyed): ${losses} (${(losses/runs*100).toFixed(1)}%)`);
  console.log(`  Survived 500 days: ${survivals} (${(survivals/runs*100).toFixed(1)}%)`);
  console.log(`  Average days: ${(totalDays/runs).toFixed(1)}`);

  // Run one verbose example
  console.log(`\n--- Sample run (verbose) ---`);
  const sample = simulate(difficulty, 500, true);
  console.log(`Final state: ${sample.finalPower.toExponential(2)} power vs ${sample.enemyPower.toExponential(2)} enemy power`);
  console.log(`Battles: ${sample.battles.wins} wins, ${sample.battles.losses} losses`);
}

// Test with different click speeds
function testWithClickRate(clicksPerSecond) {
  console.log(`\n${"#".repeat(70)}`);
  console.log(`TESTING WITH ${clicksPerSecond} CLICKS PER SECOND (enter-spam technique)`);
  console.log(`${"#".repeat(70)}`);

  ["easy", "medium", "hard"].forEach(diff => {
    testDifficultyWithRate(diff, clicksPerSecond, 20);
  });
}

function testDifficultyWithRate(difficulty, clicksPerDay, runs = 50) {
  const config = ENEMY_CONFIG[difficulty];

  console.log(`\n--- ${difficulty.toUpperCase()} (${clicksPerDay} clicks/day) ---`);

  let wins = 0, losses = 0, survivals = 0;
  let totalDays = 0;
  let sampleResult = null;

  for (let i = 0; i < runs; i++) {
    const result = simulateWithRate(difficulty, clicksPerDay, 500, false);
    totalDays += result.days;

    if (result.victory) wins++;
    else if (result.gameOver) losses++;
    else survivals++;

    if (i === 0) sampleResult = result;
  }

  console.log(`  Victories: ${wins}/${runs} (${(wins/runs*100).toFixed(0)}%) | Defeats: ${losses}/${runs} (${(losses/runs*100).toFixed(0)}%) | Survived: ${survivals}/${runs}`);
  console.log(`  Sample: ${sampleResult.finalPower.toExponential(2)} power vs ${sampleResult.enemyPower.toExponential(2)} enemy, ${sampleResult.battles.wins}W/${sampleResult.battles.losses}L`);
}

function simulateWithRate(difficulty, clicksPerDay, maxDays = 500, verbose = false) {
  const config = ENEMY_CONFIG[difficulty];

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

  function loot() {
    if (G.troops.lt(1)) return false;
    let gain = tp().mul(C.lootBase);
    if (gain.lt(1)) gain = ON(1);
    G.coins = G.coins.add(gain);
    return true;
  }

  function recruit() {
    const cost = recruitCost();
    if (G.coins.lt(cost)) return false;
    G.coins = G.coins.sub(cost);
    G.troops = G.troops.add(G.rp);
    G.counts["recruit"] = (G.counts["recruit"] || 0) + 1;
    return true;
  }

  function buySquadLeader() {
    const cost = armyCost(C.squadLeader_baseCost);
    if (G.coins.lt(cost) || G.troops.lt(2)) return false;
    G.coins = G.coins.sub(cost);
    G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower;
    G._armyClicks++;
    G.rp = 1 + cnt("squad_leader");
    return true;
  }

  function buyBarracks() {
    const cost = armyCost(C.barracks_baseCost);
    if (G.coins.lt(cost) || cnt("squad_leader") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower;
    G._armyClicks++;
    G.squadLeaderPower += G.barracksPower;
    return true;
  }

  function buyColony() {
    const cost = armyCost(C.colony_baseCost);
    if (G.coins.lt(cost) || cnt("barracks") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower;
    G._armyClicks++;
    G.barracksPower += G.colonyPower;
    return true;
  }

  function buyKingdom() {
    const cost = armyCost(C.kingdom_baseCost);
    if (G.coins.lt(cost) || cnt("colony") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower;
    G._armyClicks++;
    G.colonyPower += G.kingdomPower;
    return true;
  }

  function train() {
    const cost = expCost(C.train_baseCost);
    if (G.coins.lt(cost) || G.troops.lt(5)) return false;
    G.coins = G.coins.sub(cost);
    G.ppt *= G.trainMult;
    G.counts["train"] = (G.counts["train"] || 0) + 1;
    G._trainClicks++;
    return true;
  }

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
      return "win";
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
      return "loss";
    }
  }

  // Better strategy: balance army growth with training
  function playClick() {
    if (buyKingdom()) return "kingdom";
    if (buyColony()) return "colony";
    if (buyBarracks()) return "barracks";
    if (buySquadLeader()) return "squad_leader";
    // Train occasionally for ppt boost
    if (cnt("recruit") > 5 && cnt("train") < cnt("recruit") / 3 && train()) return "train";
    if (recruit()) return "recruit";
    if (loot()) return "loot";
    return "nothing";
  }

  let clicks = 0;
  let battles = { wins: 0, losses: 0 };
  let gameOver = false;
  let victory = false;

  while (G.day < maxDays && !gameOver) {
    for (let i = 0; i < clicksPerDay; i++) {
      playClick();
      clicks++;
    }

    G.day++;

    const enemyGain = config.growthFn(G.day);
    G.enemyTroops = G.enemyTroops.add(enemyGain);
    G.enemyPower = G.enemyTroops.mul(config.ppt);

    if (Math.random() < config.battleChance) {
      const result = doBattle();
      if (result === "win") battles.wins++;
      else battles.losses++;

      if (G.troops.lt(1)) gameOver = true;
      if (G.enemyTroops.lt(1)) { gameOver = true; victory = true; }
    }
  }

  return {
    difficulty,
    days: G.day,
    clicks,
    victory,
    gameOver,
    finalTroops: G.troops.toNumber(),
    finalPower: tp().toNumber(),
    enemyTroops: G.enemyTroops.toNumber(),
    enemyPower: G.enemyPower.toNumber(),
    battles,
    counts: { ...G.counts },
  };
}

// Test with different click speeds (50 runs each for better stats)
console.log("ARMY CLICKER BATTLE SIMULATION - CLICK SPEED COMPARISON");
console.log("(50 runs per test, 500 days max)\n");

testWithClickRate(10);   // Normal clicking
testWithClickRate(20);   // Moderate enter spam
testWithClickRate(30);   // Fast enter spam
