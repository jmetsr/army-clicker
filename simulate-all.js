// Full simulation with ppt loss on defeat
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

const DIFFICULTIES = {
  easy: { name: "Easy", ppt: 3, battleChance: 0.01, growth: (day) => 1 },
  medium: { name: "Medium", ppt: 15, battleChance: 0.02, growth: (day) => day },
  hard: { name: "Hard", ppt: 500, battleChance: 0.03, growth: (day) => day * day },
};

function simulate(difficulty, clicksPerDay, strategyFn, maxDays = 400) {
  const diff = DIFFICULTIES[difficulty];
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
      // Lose troops
      G.troops = G.troops.mulFraction(100 - lossPct, 100);
      // Lose coins
      G.coins = G.coins.mulFraction(100 - lossPct, 100);
      // Lose ppt (NEW!)
      G.ppt = Math.max(1, G.ppt * (100 - lossPct) / 100);
      // Lose army chain
      ["squad_leader", "barracks", "colony", "kingdom"].forEach(id => {
        if (G.counts[id] > 0) G.counts[id] = Math.max(0, G.counts[id] - Math.ceil(G.counts[id] * lossPct / 100));
      });
      G.rp = 1 + cnt("squad_leader");
      return "loss";
    }
  }

  let battles = { wins: 0, losses: 0 }, gameOver = false, victory = false;

  while (G.day < maxDays && !gameOver) {
    for (let i = 0; i < clicksPerDay; i++) strategyFn(actions, G, cnt);
    G.day++;

    if (!G.enemyVanquished) {
      G.enemyTroops = G.enemyTroops.add(diff.growth(G.day));
      G.enemyPower = G.enemyTroops.mul(diff.ppt);

      if (Math.random() < diff.battleChance) {
        if (doBattle() === "win") battles.wins++; else battles.losses++;
        if (G.troops.lt(1)) gameOver = true;
        if (G.enemyVanquished) victory = true;
      }
    }
  }

  return { victory, gameOver, days: G.day, battles, ppt: G.ppt };
}

// STRATEGIES
const strategies = {
  "Army Rush": (a, G, cnt) => {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
  },
  "Balanced": (a, G, cnt) => {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return;
    if (cnt("recruit") > 5 && cnt("train") < cnt("recruit") / 3 && a.train()) return;
    if (a.recruit()) return; a.loot();
  },
  "Train Focus": (a, G, cnt) => {
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return;
    if (cnt("recruit") > 5 && cnt("train") < cnt("recruit") && a.train()) return;
    if (a.recruit()) return; a.loot();
  },
  "Super Train": (a, G, cnt) => {
    if (a.train()) return;
    if (a.kingdom()) return; if (a.colony()) return; if (a.barracks()) return;
    if (a.squad_leader()) return; if (a.recruit()) return; a.loot();
  },
};

function test(difficulty, clickRate, runs = 40) {
  const results = {};

  for (const [name, fn] of Object.entries(strategies)) {
    let wins = 0, losses = 0;
    for (let i = 0; i < runs; i++) {
      const r = simulate(difficulty, clickRate, fn, 400);
      if (r.victory) wins++;
      else if (r.gameOver) losses++;
    }
    results[name] = { win: Math.round(wins/runs*100), lose: Math.round(losses/runs*100) };
  }

  return results;
}

// Run all tests
console.log("ARMY CLICKER SIMULATION - WITH PPT LOSS ON DEFEAT");
console.log("=".repeat(70));

const clickRates = [10, 20, 30];
const difficulties = ["easy", "medium", "hard"];

for (const diff of difficulties) {
  console.log(`\n${"#".repeat(70)}`);
  console.log(`  ${DIFFICULTIES[diff].name.toUpperCase()} MODE`);
  console.log(`${"#".repeat(70)}`);

  for (const clicks of clickRates) {
    console.log(`\n  ${clicks} clicks/sec:`);
    const results = test(diff, clicks);

    for (const [name, r] of Object.entries(results)) {
      const bar = "█".repeat(Math.floor(r.win/5)) + "░".repeat(20 - Math.floor(r.win/5));
      console.log(`    ${name.padEnd(14)} Win: ${String(r.win).padStart(3)}% ${bar} Lose: ${r.lose}%`);
    }
  }
}

console.log("\n" + "=".repeat(70));
console.log("SUMMARY: Best strategy per mode");
console.log("=".repeat(70));

for (const diff of difficulties) {
  const r30 = test(diff, 30);
  const best = Object.entries(r30).sort((a,b) => b[1].win - a[1].win)[0];
  console.log(`${DIFFICULTIES[diff].name.padEnd(8)}: ${best[0]} (${best[1].win}% win at 30 clicks/sec)`);
}
