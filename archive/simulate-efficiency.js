// Simulation: Efficiency-based AI vs other strategies
class ON {
  constructor(v) {
    this.value = v instanceof ON ? v.value : typeof v === 'bigint' ? v : BigInt(Math.max(0, Math.floor(v || 0)));
  }
  add(o) { return new ON(this.value + (o instanceof ON ? o : new ON(o)).value); }
  sub(o) { const ov = (o instanceof ON ? o : new ON(o)).value; return new ON(this.value > ov ? this.value - ov : 0n); }
  mul(n) { return new ON(n instanceof ON ? this.value * n.value : this.value * BigInt(Math.floor(n))); }
  mulFraction(n, d) { return new ON(this.value * BigInt(n) / BigInt(d)); }
  gte(o) { return this.value >= (o instanceof ON ? o : new ON(o)).value; }
  lt(o) { return !this.gte(o); }
  toNumber() { return Number(this.value); }
}

const C = {
  recruitCost: 10,
  squadLeader_baseCost: 200,
  barracks_baseCost: 800,
  colony_baseCost: 15000,
  kingdom_baseCost: 200000,
  train_baseCost: 80,
  train_multiplier: 1.01
};

function createState() {
  return {
    coins: new ON(0), troops: new ON(1), ppt: 1, rp: 1,
    slPow: 1, bPow: 1, cPow: 1, kPow: 1,
    trainMult: C.train_multiplier,
    counts: {}, _army: 0, _train: 0
  };
}

function cnt(G, id) { return G.counts[id] || 0; }
function tp(G) { return G.troops.mul(G.ppt); }
function armyCost(G, base) { return Math.floor(base * Math.pow(1.03, G._army)); }
function recruitCost(G) { return Math.floor(C.recruitCost * Math.pow(1.02, cnt(G, "r"))); }
function trainCost(G) {
  const t = G._train;
  return t >= 111
    ? Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, t - 111))
    : Math.floor(C.train_baseCost * Math.pow(1.02, t));
}

// Actions return true if successful
const actions = {
  loot: (G) => {
    if (G.troops.lt(1)) return false;
    let gain = tp(G);
    if (gain.lt(1)) gain = new ON(1);
    G.coins = G.coins.add(gain);
    return true;
  },
  recruit: (G) => {
    const cost = recruitCost(G);
    if (G.coins.lt(cost)) return false;
    G.coins = G.coins.sub(cost);
    G.troops = G.troops.add(G.rp);
    G.counts.r = (G.counts.r || 0) + 1;
    return true;
  },
  train: (G) => {
    const cost = trainCost(G);
    if (G.coins.lt(cost) || G.troops.lt(5)) return false;
    G.coins = G.coins.sub(cost);
    G.ppt *= G.trainMult;
    G.counts.t = (G.counts.t || 0) + 1;
    G._train++;
    return true;
  },
  squad_leader: (G) => {
    const cost = armyCost(G, C.squadLeader_baseCost);
    if (G.coins.lt(cost) || G.troops.lt(2)) return false;
    G.coins = G.coins.sub(cost);
    G.counts.sl = (G.counts.sl || 0) + G.slPow;
    G._army++;
    G.rp = 1 + cnt(G, "sl");
    return true;
  },
  barracks: (G) => {
    const cost = armyCost(G, C.barracks_baseCost);
    if (G.coins.lt(cost) || cnt(G, "sl") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts.bar = (G.counts.bar || 0) + G.bPow;
    G._army++;
    G.slPow += G.bPow;
    return true;
  },
  colony: (G) => {
    const cost = armyCost(G, C.colony_baseCost);
    if (G.coins.lt(cost) || cnt(G, "bar") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts.col = (G.counts.col || 0) + G.cPow;
    G._army++;
    G.bPow += G.cPow;
    return true;
  },
  kingdom: (G) => {
    const cost = armyCost(G, C.kingdom_baseCost);
    if (G.coins.lt(cost) || cnt(G, "col") < 3) return false;
    G.coins = G.coins.sub(cost);
    G.counts.king = (G.counts.king || 0) + G.kPow;
    G._army++;
    G.cPow += G.kPow;
    return true;
  }
};

// Calculate efficiency (value per coin) for each action
function calcEfficiency(G) {
  const currentPower = tp(G).toNumber();
  const results = [];

  // Train efficiency: gain 1% power
  const tCost = trainCost(G);
  if (G.troops.gte(5)) {
    const trainGain = currentPower * 0.01; // 1% power increase
    results.push({ action: 'train', efficiency: trainGain / tCost, cost: tCost });
  }

  // Recruit efficiency: gain rp * ppt power
  const rCost = recruitCost(G);
  const recruitGain = G.rp * G.ppt;
  results.push({ action: 'recruit', efficiency: recruitGain / rCost, cost: rCost });

  // Squad leader efficiency: increases rp by slPow
  // Value = future recruits * slPow * ppt
  // Estimate: assume ~100 more recruits, so value = 100 * slPow * ppt
  const slCost = armyCost(G, C.squadLeader_baseCost);
  if (G.troops.gte(2)) {
    const futureRecruits = 100; // estimate
    const slGain = futureRecruits * G.slPow * G.ppt;
    // Also consider: this is a (slPow)/(current rp) multiplier on recruit efficiency
    const slMultiplier = G.slPow / G.rp; // marginal increase ratio
    results.push({ action: 'squad_leader', efficiency: slGain / slCost, cost: slCost, multiplier: slMultiplier });
  }

  // Barracks efficiency: increases slPow by bPow
  // This affects all future squad leaders
  const bCost = armyCost(G, C.barracks_baseCost);
  if (cnt(G, "sl") >= 3) {
    const futureSL = 50; // estimate future squad leaders
    const futureRecruits = 100;
    const bGain = futureSL * G.bPow * futureRecruits * G.ppt / 100; // scaled down
    const bMultiplier = G.bPow / G.slPow;
    results.push({ action: 'barracks', efficiency: bGain / bCost, cost: bCost, multiplier: bMultiplier });
  }

  // Colony efficiency: increases bPow by cPow
  const cCost = armyCost(G, C.colony_baseCost);
  if (cnt(G, "bar") >= 3) {
    const cMultiplier = G.cPow / G.bPow;
    // Higher multiplier = more valuable (first colony doubles bPow)
    const cGain = cMultiplier * 10000; // arbitrary scaling
    results.push({ action: 'colony', efficiency: cGain / cCost, cost: cCost, multiplier: cMultiplier });
  }

  // Kingdom efficiency: increases cPow by kPow
  const kCost = armyCost(G, C.kingdom_baseCost);
  if (cnt(G, "col") >= 3) {
    const kMultiplier = G.kPow / G.cPow;
    const kGain = kMultiplier * 100000; // arbitrary scaling
    results.push({ action: 'kingdom', efficiency: kGain / kCost, cost: kCost, multiplier: kMultiplier });
  }

  return results;
}

// STRATEGIES

// 1. Efficiency-based: pick highest efficiency action
const efficiencyStrategy = (G) => {
  const effs = calcEfficiency(G);
  // Sort by efficiency descending
  effs.sort((a, b) => b.efficiency - a.efficiency);

  // Try each action in efficiency order
  for (const e of effs) {
    if (G.coins.gte(e.cost) && actions[e.action](G)) return;
  }
  // Fallback to loot
  actions.loot(G);
};

// 2. Marginal multiplier strategy: prioritize actions with highest multiplier boost
const multiplierStrategy = (G) => {
  // Calculate marginal multipliers
  const options = [];

  // Kingdom: cPow goes from X to X+kPow, multiplier = (X+kPow)/X
  if (cnt(G, "col") >= 3) {
    const mult = (G.cPow + G.kPow) / G.cPow;
    const cost = armyCost(G, C.kingdom_baseCost);
    options.push({ action: 'kingdom', mult, cost, effPerCoin: mult / cost });
  }

  // Colony
  if (cnt(G, "bar") >= 3) {
    const mult = (G.bPow + G.cPow) / G.bPow;
    const cost = armyCost(G, C.colony_baseCost);
    options.push({ action: 'colony', mult, cost, effPerCoin: mult / cost });
  }

  // Barracks
  if (cnt(G, "sl") >= 3) {
    const mult = (G.slPow + G.bPow) / G.slPow;
    const cost = armyCost(G, C.barracks_baseCost);
    options.push({ action: 'barracks', mult, cost, effPerCoin: mult / cost });
  }

  // Squad leader
  if (G.troops.gte(2)) {
    const mult = (G.rp + G.slPow) / G.rp;
    const cost = armyCost(G, C.squadLeader_baseCost);
    options.push({ action: 'squad_leader', mult, cost, effPerCoin: mult / cost });
  }

  // Train: 1.01x multiplier on ppt
  if (G.troops.gte(5)) {
    const cost = trainCost(G);
    options.push({ action: 'train', mult: 1.01, cost, effPerCoin: 1.01 / cost });
  }

  // Sort by multiplier per coin (higher = better)
  options.sort((a, b) => b.effPerCoin - a.effPerCoin);

  // Try best option
  for (const o of options) {
    if (G.coins.gte(o.cost) && actions[o.action](G)) return;
  }

  // Fallback: recruit or loot
  if (actions.recruit(G)) return;
  actions.loot(G);
};

// 3. Army Rush (baseline)
const armyRush = (G) => {
  if (actions.kingdom(G)) return;
  if (actions.colony(G)) return;
  if (actions.barracks(G)) return;
  if (actions.squad_leader(G)) return;
  if (actions.recruit(G)) return;
  actions.loot(G);
};

// 4. Train Ratio 1:1
const trainRatio = (G) => {
  const trains = cnt(G, "t") || 0;
  const recruits = cnt(G, "r") || 1;
  if (trains < recruits && actions.train(G)) return;
  if (actions.kingdom(G)) return;
  if (actions.colony(G)) return;
  if (actions.barracks(G)) return;
  if (actions.squad_leader(G)) return;
  if (actions.recruit(G)) return;
  actions.loot(G);
};

// 5. Super Train (train first always)
const superTrain = (G) => {
  if (actions.train(G)) return;
  if (actions.kingdom(G)) return;
  if (actions.colony(G)) return;
  if (actions.barracks(G)) return;
  if (actions.squad_leader(G)) return;
  if (actions.recruit(G)) return;
  actions.loot(G);
};

// 6. Balanced: army first until kingdoms, then mix with training
const balanced = (G) => {
  // Build army chain first
  if (cnt(G, "king") < 3) {
    if (actions.kingdom(G)) return;
    if (actions.colony(G)) return;
    if (actions.barracks(G)) return;
    if (actions.squad_leader(G)) return;
  }
  // Then balance training and army
  const trains = cnt(G, "t") || 0;
  const recruits = cnt(G, "r") || 1;
  if (trains < recruits * 0.5 && actions.train(G)) return;
  if (actions.kingdom(G)) return;
  if (actions.colony(G)) return;
  if (actions.barracks(G)) return;
  if (actions.squad_leader(G)) return;
  if (actions.recruit(G)) return;
  actions.loot(G);
};

// Simulate head-to-head battle
function simulate(strat1, strat2, cps1, cps2, maxDays = 300) {
  const G1 = createState();
  const G2 = createState();

  for (let day = 0; day < maxDays; day++) {
    // Each player takes their clicks
    for (let i = 0; i < cps1; i++) strat1(G1);
    for (let i = 0; i < cps2; i++) strat2(G2);
  }

  const power1 = tp(G1).toNumber();
  const power2 = tp(G2).toNumber();

  return {
    p1: { power: power1, troops: G1.troops.toNumber(), ppt: G1.ppt, kings: cnt(G1, "king") },
    p2: { power: power2, troops: G2.troops.toNumber(), ppt: G2.ppt, kings: cnt(G2, "king") },
    winner: power1 > power2 ? 1 : power2 > power1 ? 2 : 0
  };
}

// Run tournament
function tournament(strategies, cps, days = 200) {
  const names = Object.keys(strategies);
  const wins = {};
  names.forEach(n => wins[n] = 0);

  console.log(`\n=== TOURNAMENT @ ${cps} cps, ${days} days ===\n`);

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const n1 = names[i], n2 = names[j];
      const result = simulate(strategies[n1], strategies[n2], cps, cps, days);

      const p1Str = `${result.p1.power.toExponential(2)} (${result.p1.kings}K)`;
      const p2Str = `${result.p2.power.toExponential(2)} (${result.p2.kings}K)`;

      if (result.winner === 1) {
        wins[n1]++;
        console.log(`${n1.padEnd(20)} BEATS ${n2.padEnd(20)} | ${p1Str} vs ${p2Str}`);
      } else if (result.winner === 2) {
        wins[n2]++;
        console.log(`${n2.padEnd(20)} BEATS ${n1.padEnd(20)} | ${p2Str} vs ${p1Str}`);
      } else {
        console.log(`${n1.padEnd(20)} TIES  ${n2.padEnd(20)}`);
      }
    }
  }

  console.log(`\n--- STANDINGS ---`);
  const sorted = names.sort((a, b) => wins[b] - wins[a]);
  sorted.forEach((n, i) => console.log(`${i + 1}. ${n.padEnd(20)} ${wins[n]} wins`));

  return wins;
}

// Detailed comparison
function compare(strategies, cps, days = 200) {
  const names = Object.keys(strategies);
  console.log(`\n=== FINAL STATS @ ${cps} cps, ${days} days ===\n`);

  const results = [];
  for (const name of names) {
    const G = createState();
    for (let day = 0; day < days; day++) {
      for (let i = 0; i < cps; i++) strategies[name](G);
    }
    results.push({
      name,
      power: tp(G).toNumber(),
      troops: G.troops.toNumber(),
      ppt: G.ppt,
      kings: cnt(G, "king"),
      cols: cnt(G, "col"),
      bars: cnt(G, "bar"),
      sls: cnt(G, "sl"),
      trains: cnt(G, "t")
    });
  }

  results.sort((a, b) => b.power - a.power);

  console.log("Rank | Strategy             | Power          | Troops    | PPT       | K  | C  | B  | SL | Trains");
  console.log("-".repeat(105));
  results.forEach((r, i) => {
    console.log(
      `${(i+1).toString().padStart(4)} | ${r.name.padEnd(20)} | ${r.power.toExponential(2).padStart(14)} | ${r.troops.toExponential(2).padStart(9)} | ${r.ppt.toExponential(2).padStart(9)} | ${String(r.kings).padStart(2)} | ${String(r.cols).padStart(2)} | ${String(r.bars).padStart(2)} | ${String(r.sls).padStart(2)} | ${r.trains}`
    );
  });
}

const strategies = {
  "Efficiency": efficiencyStrategy,
  "Multiplier": multiplierStrategy,
  "Army Rush": armyRush,
  "Train Ratio 1:1": trainRatio,
  "Super Train": superTrain,
  "Balanced": balanced
};

// Run tests at different click speeds
console.log("EFFICIENCY-BASED AI TOURNAMENT");
console.log("=".repeat(60));

compare(strategies, 5, 200);
compare(strategies, 10, 200);
compare(strategies, 20, 200);

tournament(strategies, 10, 200);
tournament(strategies, 20, 200);
