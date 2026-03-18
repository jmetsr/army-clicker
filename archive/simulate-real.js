// Real Army Clicker simulation - using actual game code
// Time: 1 second per 10 clicks

// Minimal OrdinalNumber class for simulation
class OrdinalNumber {
  constructor(val) {
    if (val instanceof OrdinalNumber) {
      this.layer = val.layer;
      this.value = val.layer === 0 ? val.value : { ...val.value };
    } else if (typeof val === 'bigint') {
      this.layer = 0;
      this.value = val < 0n ? 0n : val;
    } else if (typeof val === 'number') {
      if (!isFinite(val) || isNaN(val)) {
        this.layer = 1;
        this.value = { mantissa: 9.999, exponent: 999999999999n };
      } else {
        this.layer = 0;
        this.value = BigInt(Math.max(0, Math.floor(val)));
      }
    } else {
      this.layer = 0;
      this.value = 0n;
    }
  }
  clone() { return new OrdinalNumber(this); }
  normalize() {
    if (this.layer === 0) {
      const s = this.value.toString();
      if (s.length > 100) {
        const exp = BigInt(s.length - 1);
        const mant = parseFloat(s.slice(0, 16)) / Math.pow(10, 15);
        this.layer = 1;
        this.value = { mantissa: mant, exponent: exp };
      }
    }
    return this;
  }
  add(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    const r = this.clone();
    if (r.layer === 0 && other.layer === 0) {
      r.value = r.value + other.value;
    } else {
      // Simplified: just take larger
      if (this.gte(other)) return r;
      return other.clone();
    }
    return r.normalize();
  }
  sub(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    const r = this.clone();
    if (r.layer === 0 && other.layer === 0) {
      r.value = r.value > other.value ? r.value - other.value : 0n;
    }
    return r;
  }
  mul(other) {
    if (typeof other === 'number') {
      const r = this.clone();
      if (r.layer === 0) {
        r.value = BigInt(Math.floor(Number(r.value) * other));
      }
      return r.normalize();
    }
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    const r = this.clone();
    if (r.layer === 0 && other.layer === 0) {
      r.value = r.value * other.value;
    }
    return r.normalize();
  }
  floor() { return this.clone(); }
  gte(other) {
    if (!(other instanceof OrdinalNumber)) other = new OrdinalNumber(other);
    if (this.layer !== other.layer) return this.layer > other.layer;
    if (this.layer === 0) return this.value >= other.value;
    return this.value.exponent > other.value.exponent;
  }
  lt(other) { return !this.gte(other); }
  toNumber() {
    if (this.layer === 0) return Number(this.value);
    return Infinity;
  }
  format() {
    if (this.layer === 0) {
      const n = Number(this.value);
      if (n < 1e15) return n.toExponential(2);
      return this.value.toString().length + " digits";
    }
    return "huge";
  }
}

function ON(val) { return new OrdinalNumber(val); }

// Constants (from game)
const C = {
  lootBase: 1, recruitCost: 10,
  squadLeader_baseCost: 200,
  barracks_baseCost: 800,
  colony_baseCost: 15000,
  kingdom_baseCost: 200000,
  empire_baseCost: 20000000,
  barracks_unlock: 3, colony_unlock: 3, kingdom_unlock: 3, empire_unlock: 3,
  commander_baseCost: 5000,
  general_baseCost: 100000,
  general_unlock: 3,
  train_baseCost: 80, train_multiplier: 1.01,
  train_unlockTroops: 5,
};

// Game state
let G;
function resetGame() {
  G = {
    coins: ON(0),
    troops: ON(1),
    ppt: 1,
    rp: 1,
    squadLeaderPower: 1,
    barracksPower: 1,
    colonyPower: 1,
    kingdomPower: 1,
    empirePower: 1,
    commanderPower: 1,
    generalPower: 1,
    trainMult: C.train_multiplier,
    counts: {},
    _armyClicks: 0,
    _cmdClicks: 0,
    _trainClicks: 0,
    time: 0,
  };
}

function cnt(id) { return G.counts[id] || 0; }
function tp() { return G.troops.mul(G.ppt); }

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

// Tick (1 second) - commanders auto-loot
function tick() {
  G.time++;
  const cmdCount = cnt("commander");
  if (cmdCount > 0) {
    const gain = tp().mul(C.lootBase).floor();
    G.coins = G.coins.add(gain.mul(cmdCount));
  }
}

// Button actions (exactly as in game)
const actions = {
  loot: {
    canDo: () => true,
    cost: () => ON(0),
    effect: () => {
      const gain = tp().mul(C.lootBase).floor();
      G.coins = G.coins.add(gain);
    }
  },
  recruit: {
    canDo: () => G.coins.gte(recruitCost()),
    cost: () => recruitCost(),
    effect: () => {
      G.coins = G.coins.sub(recruitCost());
      G.troops = G.troops.add(G.rp);
      G.counts["recruit"] = (G.counts["recruit"] || 0) + 1;
    }
  },
  train: {
    canDo: () => G.coins.gte(expCost(C.train_baseCost)) && G.troops.gte(5),
    cost: () => expCost(C.train_baseCost),
    effect: () => {
      G.coins = G.coins.sub(expCost(C.train_baseCost));
      G.ppt *= G.trainMult;
      G.counts["train"] = (G.counts["train"] || 0) + 1;
      G._trainClicks++;
    }
  },
  squad_leader: {
    canDo: () => G.coins.gte(armyCost(C.squadLeader_baseCost)) && G.troops.gte(2),
    cost: () => armyCost(C.squadLeader_baseCost),
    effect: () => {
      const gain = G.squadLeaderPower;
      G.coins = G.coins.sub(armyCost(C.squadLeader_baseCost));
      G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + gain;
      G._armyClicks++;
      G.rp = 1 + cnt("squad_leader");
    }
  },
  barracks: {
    canDo: () => G.coins.gte(armyCost(C.barracks_baseCost)) && cnt("squad_leader") >= C.barracks_unlock,
    cost: () => armyCost(C.barracks_baseCost),
    effect: () => {
      const gain = G.barracksPower;
      G.coins = G.coins.sub(armyCost(C.barracks_baseCost));
      G.counts["barracks"] = (G.counts["barracks"] || 0) + gain;
      G._armyClicks++;
      G.squadLeaderPower += gain;
    }
  },
  colony: {
    canDo: () => G.coins.gte(armyCost(C.colony_baseCost)) && cnt("barracks") >= C.colony_unlock,
    cost: () => armyCost(C.colony_baseCost),
    effect: () => {
      const gain = G.colonyPower;
      G.coins = G.coins.sub(armyCost(C.colony_baseCost));
      G.counts["colony"] = (G.counts["colony"] || 0) + gain;
      G._armyClicks++;
      G.barracksPower += gain;
    }
  },
  kingdom: {
    canDo: () => G.coins.gte(armyCost(C.kingdom_baseCost)) && cnt("colony") >= C.colony_unlock,
    cost: () => armyCost(C.kingdom_baseCost),
    effect: () => {
      const gain = G.kingdomPower;
      G.coins = G.coins.sub(armyCost(C.kingdom_baseCost));
      G.counts["kingdom"] = (G.counts["kingdom"] || 0) + gain;
      G._armyClicks++;
      G.colonyPower += gain;
    }
  },
  empire: {
    canDo: () => G.coins.gte(armyCost(C.empire_baseCost)) && cnt("kingdom") >= C.kingdom_unlock,
    cost: () => armyCost(C.empire_baseCost),
    effect: () => {
      const gain = G.empirePower;
      G.coins = G.coins.sub(armyCost(C.empire_baseCost));
      G.counts["empire"] = (G.counts["empire"] || 0) + gain;
      G._armyClicks++;
      G.kingdomPower += gain;
    }
  },
  commander: {
    canDo: () => G.coins.gte(cmdCost(C.commander_baseCost)) && G.troops.gte(50),
    cost: () => cmdCost(C.commander_baseCost),
    effect: () => {
      const gain = G.commanderPower;
      G.coins = G.coins.sub(cmdCost(C.commander_baseCost));
      G.counts["commander"] = (G.counts["commander"] || 0) + gain;
      G._cmdClicks++;
    }
  },
  general: {
    canDo: () => G.coins.gte(cmdCost(C.general_baseCost)) && cnt("commander") >= C.general_unlock,
    cost: () => cmdCost(C.general_baseCost),
    effect: () => {
      const gain = G.generalPower;
      G.coins = G.coins.sub(cmdCost(C.general_baseCost));
      G.counts["general"] = (G.counts["general"] || 0) + gain;
      G._cmdClicks++;
      G.commanderPower += gain;
    }
  }
};

// Strategy: OPTIMIZED with commanders
function playOptimized(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Phase 1: Bootstrap (first 150 clicks) - get 50 troops for commanders
    if (clicks < 150) {
      if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }
    // Phase 2: Rush commanders then army
    else {
      if (actions.general.canDo()) action = 'general';
      else if (actions.commander.canDo()) action = 'commander';
      else if (actions.empire.canDo()) action = 'empire';
      else if (actions.kingdom.canDo()) action = 'kingdom';
      else if (actions.colony.canDo()) action = 'colony';
      else if (actions.barracks.canDo()) action = 'barracks';
      else if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.format()}, troops=${G.troops.format()}, ppt=${G.ppt.toFixed(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return {
    coins: G.coins.toNumber(),
    troops: G.troops.toNumber(),
    ppt: G.ppt,
    log,
    counts: {...G.counts},
    time: G.time
  };
}

// Strategy: Mixed - train every 20 clicks
function playMixed(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();
    let action = 'loot';

    // Train every 20 clicks if possible
    if (clicks % 20 === 0 && actions.train.canDo()) {
      action = 'train';
    }
    // Phase 1: Bootstrap
    else if (clicks < 150) {
      if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }
    // Phase 2: Commanders + army
    else {
      if (actions.general.canDo()) action = 'general';
      else if (actions.commander.canDo()) action = 'commander';
      else if (actions.empire.canDo()) action = 'empire';
      else if (actions.kingdom.canDo()) action = 'kingdom';
      else if (actions.colony.canDo()) action = 'colony';
      else if (actions.barracks.canDo()) action = 'barracks';
      else if (actions.squad_leader.canDo()) action = 'squad_leader';
      else if (actions.recruit.canDo()) action = 'recruit';
    }

    actions[action].effect();
    clicks++;

    if (clicks % 500 === 0) {
      log.push(`Click ${clicks}: coins=${G.coins.format()}, troops=${G.troops.format()}, ppt=${G.ppt.toFixed(2)}, tp=${(G.troops.toNumber()*G.ppt).toExponential(2)}, cmdr=${cnt("commander")}`);
    }
  }

  return {
    coins: G.coins.toNumber(),
    troops: G.troops.toNumber(),
    ppt: G.ppt,
    log,
    counts: {...G.counts},
    time: G.time
  };
}

// Strategy: Pick cheapest affordable button (true optimal)
function playCheapest(maxClicks) {
  resetGame();
  let clicks = 0;
  const log = [];

  while (clicks < maxClicks) {
    if (clicks > 0 && clicks % 10 === 0) tick();

    // Find cheapest affordable action (excluding loot)
    let best = 'loot';
    let bestCost = Infinity;

    const candidates = ['recruit', 'train', 'squad_leader', 'barracks', 'colony', 'kingdom', 'empire', 'commander', 'general'];

    for (const id of candidates) {
      if (actions[id].canDo()) {
        const cost = typeof actions[id].cost() === 'number' ? actions[id].cost() : actions[id].cost().toNumber();
        if (cost < bestCost) {
          bestCost = cost;
          best = id;
        }
      }
    }

    actions[best].effect();
    clicks++;

    if (clicks % 500 === 0) {
      const tpVal = G.troops.toNumber() * G.ppt;
      log.push(`Click ${clicks}: coins=${G.coins.format()}, tp=${tpVal.toExponential(2)}, ppt=${G.ppt.toFixed(2)}, cmdr=${cnt("commander")}, train=${cnt("train")}`);
    }
  }

  return {
    coins: G.coins.toNumber(),
    troops: G.troops.toNumber(),
    ppt: G.ppt,
    log,
    counts: {...G.counts},
    time: G.time
  };
}

// Run
function runStrategy(name, fn) {
  console.log(`\n=== ${name} ===`);
  const result = fn(3000);
  console.log("Progress:");
  result.log.forEach(l => console.log("  " + l));
  const totalPower = result.troops * result.ppt;
  console.log(`FINAL: TP=${totalPower.toExponential(3)} (${result.troops.toExponential(2)} troops × ${result.ppt.toFixed(2)} ppt)`);
  console.log("Clicks by button:", Object.entries(result.counts).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(", "));
  return totalPower;
}

const tp1 = runStrategy("COMMANDER RUSH (old strategy)", playOptimized);
const tp2 = runStrategy("CHEAPEST BUTTON (should be optimal)", playCheapest);

console.log("\n=== COMPARISON ===");
console.log(`Commander Rush: ${tp1.toExponential(3)} total power`);
console.log(`Cheapest Button: ${tp2.toExponential(3)} total power`);
