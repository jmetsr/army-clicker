#!/usr/bin/env node
// Command-line test harness for Army Clicker
// Run with: node test-game.js

// Minimal OrdinalNumber implementation for testing
class OrdinalNumber {
  constructor(val) {
    if (val instanceof OrdinalNumber) {
      this.layer = val.layer;
      this.value = val.layer === 0 ? val.value : {...val.value};
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
  static _wrap(x) { return x instanceof OrdinalNumber ? x : new OrdinalNumber(x); }
  gte(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer !== other.layer) return this.layer > other.layer;
    if (this.layer === 0) return this.value >= other.value;
    return this.value.exponent >= other.value.exponent;
  }
  lt(other) { return !this.gte(other); }
  gt(other) { return this.gte(other) && !this.eq(other); }
  eq(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer !== other.layer) return false;
    if (this.layer === 0) return this.value === other.value;
    return false;
  }
  isZero() { return this.layer === 0 && this.value === 0n; }
  add(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer === 0 && other.layer === 0) {
      return new OrdinalNumber(this.value + other.value);
    }
    return this.clone();
  }
  sub(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer === 0 && other.layer === 0) {
      const v = this.value - other.value;
      return new OrdinalNumber(v < 0n ? 0n : v);
    }
    return this.clone();
  }
  mul(other) {
    // Handle plain numbers (floats) without wrapping to preserve decimals
    if (typeof other === 'number') {
      if (this.layer === 0 && this.value < 9007199254740991n) {
        return new OrdinalNumber(Math.floor(Number(this.value) * other));
      }
      return this.clone();
    }
    other = OrdinalNumber._wrap(other);
    if (this.layer === 0 && other.layer === 0) {
      return new OrdinalNumber(this.value * other.value);
    }
    return this.clone();
  }
  mulFraction(num, denom) {
    if (this.layer === 0) {
      return new OrdinalNumber(this.value * BigInt(num) / BigInt(denom));
    }
    return this.clone();
  }
  floor() { return this.clone(); }
  toNumber() {
    if (this.layer === 0) return Number(this.value);
    return Infinity;
  }
  format() {
    if (this.layer === 0) {
      const n = Number(this.value);
      if (n < 1000) return n.toString();
      if (n >= 1e18) return n.toExponential(2);
      const words = [[1e15,'Q'],[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']];
      for (const [t, w] of words) {
        if (n >= t) return (n/t).toFixed(1) + w;
      }
      return n.toString();
    }
    return '10^' + this.value.exponent;
  }
}
function ON(val) { return new OrdinalNumber(val); }

// Game constants - matching army-clicker.html
const C = {
  lootBase: 1,
  recruitCost: 10,
  squadLeader_baseCost: 200,
  barracks_baseCost: 800,
  colony_baseCost: 15000,
  kingdom_baseCost: 500000,
  empire_baseCost: 20000000,
  barracks_unlock: 3, colony_unlock: 3, kingdom_unlock: 3, empire_unlock: 3,
  train_baseCost: 80, train_multiplier: 1.01,
  train_unlockTroops: 5,
};

// Game state
const G = {
  coins: ON(0),
  troops: ON(1),
  ppt: 1,
  rp: 1,
  squadLeaderPower: 1,
  barracksPower: 1,
  colonyPower: 1,
  kingdomPower: 1,
  counts: {},
};

// Helper functions
function tp() { return G.troops.mul(G.ppt); }
function cnt(id) { return G.counts[id] || 0; }
function inc(id) { G.counts[id] = (G.counts[id] || 0) + 1; }

// SHARED ARMY COST - army upgrades share pool, recruit is SEPARATE
function armyTotal() {
  return cnt("squad_leader") + cnt("barracks") + cnt("colony") + cnt("kingdom") + cnt("empire");
}
function armyCost(base) {
  return Math.floor(base * Math.pow(1.02, armyTotal()));
}
// Recruit has its own exponential
function recruitCost() {
  return Math.floor(10 * Math.pow(1.02, cnt("recruit")));
}

// Train cost - separate exponential
function trainCost() {
  const count = cnt("train");
  if (count >= 111) {
    return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, count - 111));
  }
  return Math.floor(C.train_baseCost * Math.pow(1.02, count));
}

// Troop names
const TROOP_NAMES = [
  [1e18,"Chuck Norrises"],[1e15,"Ultra Macro Agentic Galaxies"],
  [1e13,"Dyson Sphere Tornadoes"],[1e11,"Celestial Forces"],[1e10,"Elder Gods"],
  [4.5e8,"Titans"],[1e8,"Fallen Angels"],[5e7,"Demon Lords"],[2e7,"Balrogs"],
  [5e6,"Archdemons"],[2e5,"Elder Dragons"],[6e4,"Dragons"],[5e4,"Wyrms"],
  [12000,"Giant Knights"],[3600,"Giants w/ Nunchucks"],[1800,"Giant Pikemen"],
  [600,"Giants"],[200,"Ogres"],[100,"Trolls"],[75,"War Orcs"],[60,"Orcs"],
  [20,"Knights"],[18,"Armored Swordsmen"],[16,"Swordsmen"],[13,"Archers"],
  [8,"Katana Soldiers"],[6,"Nunchuck Soldiers"],[3,"Pikemen"],
  [2,"Dagger Soldiers"],[0,"Thugs"]
];
function getTN() {
  for (const [thresh, name] of TROOP_NAMES) {
    if (G.ppt >= thresh) return name;
  }
  return "Thugs";
}

// Actions
function loot(times = 1) {
  for (let i = 0; i < times; i++) {
    let gain = tp().floor();
    if (gain.lt(1)) gain = ON(1);
    G.coins = G.coins.add(gain);
  }
}

function recruit(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = recruitCost();
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.troops = G.troops.add(G.rp);
      inc("recruit");
    }
  }
}

function train(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = trainCost();
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.ppt *= C.train_multiplier;
      inc("train");
    }
  }
}

function squadLeader(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = armyCost(C.squadLeader_baseCost);
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.counts["squad_leader"] = (G.counts["squad_leader"] || 0) + G.squadLeaderPower;
      G.rp = 1 + cnt("squad_leader");
    }
  }
}

function barracks(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = armyCost(C.barracks_baseCost);
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.counts["barracks"] = (G.counts["barracks"] || 0) + G.barracksPower;
      G.squadLeaderPower += G.barracksPower;
    }
  }
}

function colony(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = armyCost(C.colony_baseCost);
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.counts["colony"] = (G.counts["colony"] || 0) + G.colonyPower;
      G.barracksPower += G.colonyPower;
    }
  }
}

function kingdom(times = 1) {
  for (let i = 0; i < times; i++) {
    const cost = armyCost(C.kingdom_baseCost);
    if (G.coins.gte(cost)) {
      G.coins = G.coins.sub(cost);
      G.counts["kingdom"] = (G.counts["kingdom"] || 0) + G.kingdomPower;
      G.colonyPower += G.kingdomPower;
    }
  }
}

// Display state
function status() {
  const armyT = armyTotal();
  console.log('\n' + '='.repeat(60));
  console.log(`COINS: ${G.coins.format()}  |  TROOPS: ${G.troops.format()} ${getTN()}`);
  console.log(`PPT: ${G.ppt.toFixed(4)}  |  TOTAL POWER: ${tp().format()}`);
  console.log(`Recruits/click: ${G.rp}  |  SL power: ${G.squadLeaderPower}  |  Barracks power: ${G.barracksPower}`);
  console.log('-'.repeat(60));
  console.log(`Recruit: ${cnt("recruit")} (cost: ${recruitCost()}) - SEPARATE pool`);
  console.log(`Army pool: ${armyT} upgrades (shared multiplier: ${Math.pow(1.02, armyT).toFixed(2)}x)`);
  console.log(`  Squad Leaders: ${cnt("squad_leader")} (cost: ${armyCost(C.squadLeader_baseCost)})`);
  console.log(`  Barracks: ${cnt("barracks")} (cost: ${armyCost(C.barracks_baseCost)})`);
  console.log(`  Colony: ${cnt("colony")} (cost: ${armyCost(C.colony_baseCost)})`);
  console.log(`  Kingdom: ${cnt("kingdom")} (cost: ${armyCost(C.kingdom_baseCost)})`);
  console.log(`Train: ${cnt("train")} (cost: ${trainCost()}) - SEPARATE pool`);
  console.log('='.repeat(60));
}

// BALANCED strategy - learned from human play
function playtestBalanced(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: BALANCED - train often, recruit often, army when affordable\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");
    const trainCount = cnt("train");

    let action = 'loot';

    // BALANCED: Interleave all three loops
    // Key insight: training compounds, so do it early and often
    // Recruiting converts rp to troops, essential for income
    // Army chain boosts rp, but don't neglect the other loops

    // Priority 1: If we can afford a high-tier army upgrade, take it
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Priority 2: Train when cheap relative to income (compound early!)
    else if (coins >= tCost && tCost < income * 5) {
      action = 'train';
    }
    // Priority 3: Barracks when affordable
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    // Priority 4: SL when affordable
    else if (coins >= slCost) {
      action = 'squad_leader';
    }
    // Priority 5: Recruit to build troops (need troops for income!)
    else if (coins >= rCost && rCost < income * 3) {
      action = 'recruit';
    }
    // Priority 6: Train even if a bit expensive (compounding is worth it)
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    // Priority 7: Recruit even if expensive (need troops)
    else if (coins >= rCost && troops < 50 + slCount * 5) {
      action = 'recruit';
    }
    // Otherwise loot

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks} clicks] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${trainCount}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// Run the playtest
console.log('ARMY CLICKER TEST HARNESS v2');
console.log('Using SHARED ARMY COST system - all army presses increase all army costs');
console.log('');

// NO ARMY strategy - ignore the army chain completely
function playtestNoArmy(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: NO ARMY - only loot, recruit, train\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const tCost = trainCost();

    let action = 'loot';

    // Only three options: loot, recruit, train
    // Train when cheap (compounding)
    if (coins >= tCost && tCost < income * 8) {
      action = 'train';
    }
    // Recruit when cheap
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    // Train even if moderately expensive
    else if (coins >= tCost && tCost < income * 20) {
      action = 'train';
    }
    // Recruit even if moderately expensive
    else if (coins >= rCost && rCost < income * 15) {
      action = 'recruit';
    }
    // Otherwise loot

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks} clicks] Power: ${tp().format()}, Troops: ${G.troops.format()}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// MULTIPLIER-FIRST strategy - learned from human beating me
function playtestMultiplierFirst(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: MULTIPLIER-FIRST - barracks/colony before SL\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    let action = 'loot';

    // MULTIPLIER-FIRST: Always prefer higher-tier multipliers
    // They boost ALL future purchases of lower tiers

    // Kingdom if unlocked and affordable
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    // Colony - PRIORITY when unlocked
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Barracks - PRIORITY when unlocked (this is the key change!)
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    // Train when cheap - compounding is valuable
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    // SL only when barracks isn't close OR we need to unlock barracks
    else if (coins >= slCost && (slCount < 3 || bCost > income * 20)) {
      action = 'squad_leader';
    }
    // Recruit to build troops
    else if (coins >= rCost && rCost < income * 4) {
      action = 'recruit';
    }
    // Train even if moderately expensive
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    // Recruit even if expensive
    else if (coins >= rCost && troops < 100 + slCount * 3) {
      action = 'recruit';
    }
    // Otherwise loot (saving for barracks/colony)

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// BALANCED MULTIPLIER strategy - build AND use multipliers
function playtestBalancedMultiplier(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: BALANCED MULTIPLIER - build multipliers, then use them\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");
    const slPurchases = actions.squad_leader;
    const bPurchases = actions.barracks;

    let action = 'loot';

    // BALANCED: Alternate between building multipliers and using them
    // Key ratio: roughly 3 barracks per 1 SL purchase

    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Barracks if we have room to build (ratio check)
    else if (coins >= bCost && slCount >= 3 && bPurchases < slPurchases * 4 + 20) {
      action = 'barracks';
    }
    // SL to unlock barracks or to use accumulated multiplier
    else if (coins >= slCost && (slCount < 3 || bPurchases >= slPurchases * 3)) {
      action = 'squad_leader';
    }
    // More barracks if affordable
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    // Train when cheap
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    // Recruit
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    // Train even if pricier
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    else if (coins >= rCost && troops < 80 + slCount * 4) {
      action = 'recruit';
    }

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// RUSH COLONY strategy - unlock higher tiers ASAP
function playtestRushColony(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: RUSH COLONY - unlock higher tiers early while cheap\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    let action = 'loot';

    // RUSH COLONY: Prioritize unlocking higher tiers ASAP
    // Then build them up once unlocked

    // Kingdom if possible
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    // Colony - BUY WHENEVER AFFORDABLE (key change!)
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Rush to unlock colony: need 3 barracks
    else if (bCount < 3 && slCount >= 3 && coins >= bCost) {
      action = 'barracks';
    }
    // Rush to unlock barracks: need 3 SL
    else if (slCount < 3 && coins >= slCost) {
      action = 'squad_leader';
    }
    // Now build up: barracks when affordable
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    // SL to use multipliers
    else if (coins >= slCost && bCount >= 3) {
      action = 'squad_leader';
    }
    // Train when cheap
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    // Recruit
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    // Train pricier
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    // Recruit pricier
    else if (coins >= rCost && troops < 100 + slCount * 4) {
      action = 'recruit';
    }

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// RUSH COLONY V2 - stop army once barracks=3, save for colony
function playtestRushColonyV2(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: RUSH COLONY V2 - freeze army at B=3, save for colony\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    let action = 'loot';

    // PHASE 1: Rush to unlock colony (3 SL → 3 B → save for colony)
    // PHASE 2: After first colony, build freely

    const hasColony = cCount > 0;

    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';  // Always buy colony when affordable
    }
    else if (!hasColony && bCount >= 3) {
      // SAVING FOR COLONY - don't buy any army upgrades!
      // Only loot, recruit, train
      if (coins >= tCost && tCost < income * 8) {
        action = 'train';
      } else if (coins >= rCost && rCost < income * 6) {
        action = 'recruit';
      } else if (coins >= tCost && tCost < income * 20) {
        action = 'train';
      } else if (coins >= rCost) {
        action = 'recruit';
      }
      // else loot (saving for colony)
    }
    else if (bCount < 3 && slCount >= 3 && coins >= bCost) {
      action = 'barracks';  // Rush to 3 barracks
    }
    else if (slCount < 3 && coins >= slCost) {
      action = 'squad_leader';  // Rush to 3 SL
    }
    // PHASE 2: After colony, build normally
    else if (hasColony && coins >= bCost) {
      action = 'barracks';
    }
    else if (hasColony && coins >= slCost) {
      action = 'squad_leader';
    }
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    else if (coins >= rCost && troops < 100 + slCount * 4) {
      action = 'recruit';
    }

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// MIMIC HUMAN - 2:1 SL:B ratio, colony when affordable
function playtestMimicHuman(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: MIMIC HUMAN - ~2:1 SL:B ratio, colony when affordable\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    const slPurchases = actions.squad_leader;
    const bPurchases = actions.barracks;

    let action = 'loot';

    // Kingdom when possible
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    // Colony - always buy when affordable
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Need 3 SL to unlock barracks
    else if (slCount < 3 && coins >= slCost) {
      action = 'squad_leader';
    }
    // Need 3 barracks to unlock colony
    else if (bCount < 3 && slCount >= 3 && coins >= bCost) {
      action = 'barracks';
    }
    // Maintain ~2:1 SL:B purchase ratio (like human)
    else if (coins >= slCost && slCount >= 3 && slPurchases < (bPurchases + 1) * 2.5) {
      action = 'squad_leader';
    }
    else if (coins >= bCost && slCount >= 3 && bPurchases < slPurchases * 0.5) {
      action = 'barracks';
    }
    // Default: prefer SL when both affordable
    else if (coins >= slCost && slCount >= 3) {
      action = 'squad_leader';
    }
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    // Train when reasonably cheap
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    // Recruit when reasonably cheap
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    // Train even pricier
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    // Recruit even pricier
    else if (coins >= rCost && troops < 100 + slCount * 3) {
      action = 'recruit';
    }

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// FORCED BARRACKS - buy barracks after every 2-3 SL purchases
function playtestForcedBarracks(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: FORCED BARRACKS - save for barracks after SL purchases\n');

  let clicks = 0;
  let lastStatus = 0;
  let slSinceBarracks = 0;  // Track SL purchases since last barracks

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    let action = 'loot';
    const needBarracks = slCount >= 3 && slSinceBarracks >= 2;  // Force barracks every 2 SLs

    // Kingdom when possible
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    // Colony - always grab it
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // Unlock phase
    else if (slCount < 3 && coins >= slCost) {
      action = 'squad_leader';
    }
    else if (bCount < 3 && slCount >= 3 && coins >= bCost) {
      action = 'barracks';
    }
    // FORCED BARRACKS: if we've bought 2+ SL since last barracks, save for barracks
    else if (needBarracks && coins >= bCost) {
      action = 'barracks';
    }
    else if (needBarracks) {
      // Save for barracks - only loot/recruit/train
      if (coins >= tCost && tCost < income * 8) {
        action = 'train';
      } else if (coins >= rCost && rCost < income * 6) {
        action = 'recruit';
      }
      // else loot (saving)
    }
    // Normal building
    else if (coins >= slCost && slCount >= 3) {
      action = 'squad_leader';
    }
    else if (coins >= bCost && slCount >= 3) {
      action = 'barracks';
    }
    else if (coins >= tCost && tCost < income * 6) {
      action = 'train';
    }
    else if (coins >= rCost && rCost < income * 5) {
      action = 'recruit';
    }
    else if (coins >= tCost && tCost < income * 15) {
      action = 'train';
    }
    else if (coins >= rCost && troops < 100 + slCount * 3) {
      action = 'recruit';
    }

    // Track SL purchases for forced barracks
    if (action === 'squad_leader') slSinceBarracks++;
    if (action === 'barracks') slSinceBarracks = 0;

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// VALUE-BASED - colony 1 is 2x, rush it, then build
function playtestValueBased(totalClicks) {
  console.log(`\n>>> PLAYTESTING with ${totalClicks} clicks <<<`);
  console.log('Strategy: VALUE-BASED - colony 1 is 2x value, rush it\n');

  let clicks = 0;
  let lastStatus = 0;

  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  while (clicks < totalClicks) {
    const coins = G.coins.toNumber();
    const troops = G.troops.toNumber();
    const income = Math.max(1, tp().toNumber());

    const rCost = recruitCost();
    const slCost = armyCost(C.squadLeader_baseCost);
    const bCost = armyCost(C.barracks_baseCost);
    const cCost = armyCost(C.colony_baseCost);
    const kCost = armyCost(C.kingdom_baseCost);
    const tCost = trainCost();

    const slCount = cnt("squad_leader");
    const bCount = cnt("barracks");
    const cCount = cnt("colony");

    let action = 'loot';

    // Kingdom when possible
    if (coins >= kCost && cCount >= 3) {
      action = 'kingdom';
    }
    // Colony - ALWAYS buy, especially first one (2x value!)
    else if (coins >= cCost && bCount >= 3) {
      action = 'colony';
    }
    // PHASE 1: Rush to unlock colony
    else if (slCount < 3 && coins >= slCost) {
      action = 'squad_leader';
    }
    else if (bCount < 3 && slCount >= 3 && coins >= bCost) {
      action = 'barracks';
    }
    // PHASE 2: Before first colony - buy SL for income, skip barracks
    else if (cCount === 0 && bCount >= 3) {
      // Keep buying SL (increases income faster than colony cost)
      if (coins >= slCost) {
        action = 'squad_leader';
      } else if (coins >= tCost && tCost < income * 8) {
        action = 'train';
      } else if (coins >= rCost) {
        action = 'recruit';  // Always recruit when affordable - builds income
      }
      // else loot
    }
    // PHASE 3: After colony, build both with barracks priority
    else if (cCount > 0) {
      if (coins >= bCost) {
        action = 'barracks';  // Barracks now gives 2x value from colony!
      } else if (coins >= slCost) {
        action = 'squad_leader';
      } else if (coins >= tCost && tCost < income * 6) {
        action = 'train';
      } else if (coins >= rCost && rCost < income * 5) {
        action = 'recruit';
      } else if (coins >= tCost && tCost < income * 15) {
        action = 'train';
      } else if (coins >= rCost && troops < 100 + slCount * 3) {
        action = 'recruit';
      }
    }
    // Fallback - basic income building
    else if (coins >= tCost && tCost < income * 10) {
      action = 'train';
    } else if (coins >= rCost) {
      action = 'recruit';
    } else if (coins >= tCost) {
      action = 'train';
    }

    switch(action) {
      case 'loot': loot(1); actions.loot++; break;
      case 'recruit': recruit(1); actions.recruit++; break;
      case 'train': train(1); actions.train++; break;
      case 'squad_leader': squadLeader(1); actions.squad_leader++; break;
      case 'barracks': barracks(1); actions.barracks++; break;
      case 'colony': colony(1); actions.colony++; break;
      case 'kingdom': kingdom(1); actions.kingdom++; break;
    }

    clicks++;

    if (clicks - lastStatus >= 500) {
      console.log(`[${clicks}] Power: ${tp().format()}, SL: ${slCount}, B: ${bCount}, C: ${cCount}, Train: ${cnt("train")}, PPT: ${G.ppt.toFixed(2)}`);
      lastStatus = clicks;
    }
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// BATCH PLAY - checkpoint decisions, not rules
function playtestBatch(totalClicks) {
  console.log(`\n>>> BATCH PLAY with ${totalClicks} clicks <<<`);
  console.log('Making decisions at checkpoints, not following fixed rules\n');

  let clicks = 0;
  const actions = { loot: 0, recruit: 0, train: 0, squad_leader: 0, barracks: 0, colony: 0, kingdom: 0 };

  function doAction(action, times = 1) {
    for (let i = 0; i < times && clicks < totalClicks; i++) {
      switch(action) {
        case 'loot': loot(1); break;
        case 'recruit': recruit(1); break;
        case 'train': train(1); break;
        case 'squad_leader': squadLeader(1); break;
        case 'barracks': barracks(1); break;
        case 'colony': colony(1); break;
        case 'kingdom': kingdom(1); break;
      }
      actions[action]++;
      clicks++;
    }
  }

  function state() {
    return {
      clicks,
      coins: G.coins.toNumber(),
      troops: G.troops.toNumber(),
      power: tp().toNumber(),
      income: Math.max(1, tp().toNumber()),
      ppt: G.ppt,
      sl: cnt("squad_leader"),
      b: cnt("barracks"),
      c: cnt("colony"),
      train: cnt("train"),
      rp: G.rp,
      slCost: armyCost(C.squadLeader_baseCost),
      bCost: armyCost(C.barracks_baseCost),
      cCost: armyCost(C.colony_baseCost),
      rCost: recruitCost(),
      tCost: trainCost()
    };
  }

  function report(note) {
    const s = state();
    console.log(`[${clicks}] Power: ${tp().format()}, SL: ${s.sl}, B: ${s.b}, C: ${s.c}, Train: ${s.train}, PPT: ${s.ppt.toFixed(2)}`);
    if (note) console.log('    → ' + note);
  }

  // === CHECKPOINT 0: Start ===
  // Need coins first. Loot until I can recruit.
  doAction('loot', 15);
  doAction('recruit', 3);
  doAction('loot', 20);
  doAction('recruit', 5);
  report('Built initial troops');

  // === CHECKPOINT 1: ~50 clicks ===
  // Now build toward 3 SL to unlock barracks
  let s = state();
  while (s.sl < 3 && clicks < 150) {
    if (s.coins >= s.slCost) doAction('squad_leader', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('Unlocked barracks');

  // === CHECKPOINT 2: Get to 3 barracks for colony unlock ===
  while (s.b < 3 && clicks < 400) {
    if (s.coins >= s.bCost) doAction('barracks', 1);
    else if (s.coins >= s.slCost && s.sl < 20) doAction('squad_leader', 1);  // Some SL for income
    else if (s.coins >= s.tCost && s.tCost < s.income * 8) doAction('train', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('Unlocked colony');

  // === CHECKPOINT 3: SAVE FOR COLONY ===
  // Colony 1 is 2x value - worth pausing everything
  // Build some more SL for income, then save
  while (s.sl < 100 && clicks < 350) {
    if (s.coins >= s.slCost) doAction('squad_leader', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('Built SL for income, now saving for colony');

  // Now actually save for colony - no more army purchases
  while (s.c === 0 && clicks < 600) {
    if (s.coins >= s.cCost) doAction('colony', 1);
    else if (s.coins >= s.tCost && s.tCost < s.income * 10) doAction('train', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('GOT COLONY 1! Now barracks are 2x value');

  // === CHECKPOINT 4: Build barracks (now 2x value) ===
  // Each barracks now gives +2 to SL power instead of +1
  while (s.b < 50 && clicks < 1200) {
    if (s.coins >= s.cCost) doAction('colony', 1);  // More colonies still good
    else if (s.coins >= s.bCost) doAction('barracks', 1);
    else if (s.coins >= s.slCost) doAction('squad_leader', 1);
    else if (s.coins >= s.tCost && s.tCost < s.income * 6) doAction('train', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('Built up barracks');

  // === CHECKPOINT 5: Balance all loops ===
  while (clicks < 2000) {
    if (s.coins >= s.cCost && s.b >= 3) doAction('colony', 1);
    else if (s.coins >= s.bCost && s.sl >= 3) doAction('barracks', 1);
    else if (s.coins >= s.slCost) doAction('squad_leader', 1);
    else if (s.coins >= s.tCost && s.tCost < s.income * 6) doAction('train', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }
  report('Balanced building');

  // === CHECKPOINT 6: Final stretch - maximize power ===
  while (clicks < totalClicks) {
    if (s.coins >= s.cCost && s.b >= 3) doAction('colony', 1);
    else if (s.coins >= s.bCost && s.sl >= 3) doAction('barracks', 1);
    else if (s.coins >= s.slCost) doAction('squad_leader', 1);
    else if (s.coins >= s.tCost && s.tCost < s.income * 8) doAction('train', 1);
    else if (s.coins >= s.rCost) doAction('recruit', 1);
    else doAction('loot', 1);
    s = state();
  }

  console.log('\n>>> FINAL STATE <<<');
  status();

  console.log('\n>>> ACTION SUMMARY <<<');
  console.log(`Total clicks: ${totalClicks}`);
  for (const [action, count] of Object.entries(actions)) {
    if (count > 0) {
      console.log(`  ${action}: ${count} (${(count/totalClicks*100).toFixed(1)}%)`);
    }
  }

  const power = tp().toNumber();
  console.log('\n>>> VS HUMAN <<<');
  console.log(`My power: ${power.toLocaleString()}`);
  console.log(`Human power: 101,829,824`);
  console.log(power > 101829824 ? '🏆 I WIN!' : '❌ Human wins');

  return { actions, finalState: { coins: G.coins.toNumber(), troops: G.troops.toNumber(), ppt: G.ppt } };
}

// Interactive batch helper - I'll call this manually
function batch(action, times = 1) {
  for (let i = 0; i < times; i++) {
    switch(action) {
      case 'loot': loot(1); break;
      case 'recruit': recruit(1); break;
      case 'train': train(1); break;
      case 'sl': squadLeader(1); break;
      case 'b': barracks(1); break;
      case 'c': colony(1); break;
      case 'k': kingdom(1); break;
    }
  }
}

function s() {
  const armyT = armyTotal();
  console.log('Clicks used: ???');  // Need to track manually
  console.log(`Power: ${tp().format()} | Troops: ${G.troops.format()} | PPT: ${G.ppt.toFixed(2)}`);
  console.log(`SL: ${cnt("squad_leader")} (cost ${armyCost(C.squadLeader_baseCost)}) | B: ${cnt("barracks")} (cost ${armyCost(C.barracks_baseCost)}) | C: ${cnt("colony")} (cost ${armyCost(C.colony_baseCost)})`);
  console.log(`Train: ${cnt("train")} (cost ${trainCost()}) | Recruit cost: ${recruitCost()}`);
  console.log(`Income/loot: ${tp().format()} | rp: ${G.rp} | SL power: ${G.squadLeaderPower} | B power: ${G.barracksPower}`);
  console.log(`Coins: ${G.coins.format()}`);
}

console.log('Interactive batch mode ready.');
console.log('Use: batch("loot", 50) or batch("sl", 5)');
console.log('Use: s() to see state');
console.log('');
s();

console.log('\n>>> ENJOYMENT ASSESSMENT <<<');
const troopType = getTN();
const totalPower = tp().format();
console.log(`Reached: ${G.troops.format()} ${troopType} with ${G.ppt.toFixed(2)} power each`);
console.log(`Total Power: ${totalPower}`);
console.log(`Army upgrades: ${cnt("squad_leader")} SL, ${cnt("barracks")} Barracks, ${cnt("colony")} Colony, ${cnt("kingdom")} Kingdom`);
