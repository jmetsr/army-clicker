// AI based on human gameplay: ratio-based decisions + phase-based behavior
class ON {
  constructor(v){this.value=v instanceof ON?v.value:typeof v==='bigint'?v:BigInt(Math.max(0,Math.floor(v||0)))}
  add(o){return new ON(this.value+(o instanceof ON?o:new ON(o)).value)}
  sub(o){const ov=(o instanceof ON?o:new ON(o)).value;return new ON(this.value>ov?this.value-ov:0n)}
  mul(n){return new ON(n instanceof ON?this.value*n.value:this.value*BigInt(Math.floor(n)))}
  gte(o){return this.value>=(o instanceof ON?o:new ON(o)).value}
  lt(o){return !this.gte(o)}
  toNumber(){return Number(this.value)}
}

const C={recruitCost:10,squadLeader_baseCost:200,barracks_baseCost:800,colony_baseCost:15000,kingdom_baseCost:200000,empire_baseCost:20000000,train_baseCost:80,train_multiplier:1.01};

function createAI() {
  return {
    coins: new ON(0), troops: new ON(1), ppt: 1, rp: 1,
    squadLeaderPower: 1, barracksPower: 1, colonyPower: 1, kingdomPower: 1, empirePower: 1,
    trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0
  };
}

// Ratio-based AI: buy when cost/coins < threshold
function makeRatioAI(params) {
  const {
    // Phase thresholds (which day to switch)
    midDay = 20,
    lateDay = 50,
    // Early phase: mostly loot
    earlyLootPct = 0.88,
    earlyTrainPct = 0.07,
    // Mid phase ratios (cost/coins thresholds to buy)
    midArmyRatio = 0.20,    // buy army if cost < 20% of coins
    midTrainRatio = 0.15,   // buy train if cost < 15% of coins
    // Late phase ratios
    lateArmyRatio = 0.05,   // buy army if cost < 5% of coins (spam kingdoms)
    lateTrainRatio = 0.30,  // more willing to spend on training
    // General
    recruitRatio = 0.10,    // recruit if cost < 10% of coins
  } = params;

  return function(ai, clicks, day) {
    function aiCnt(id) { return ai.counts[id] || 0; }
    function aiTp() { return ai.troops.mul(ai.ppt); }
    function aiArmyCost(base) { return Math.floor(base * Math.pow(1.03, ai._armyClicks)); }
    function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
    function aiTrainCost() {
      const total = ai._trainClicks;
      if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
      return Math.floor(C.train_baseCost * Math.pow(1.02, total));
    }

    function buyArmy(id, base, power, boostVar) {
      const cost = aiArmyCost(base);
      if(ai.coins.lt(cost)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.counts[id] = (ai.counts[id] || 0) + ai[power];
      ai._armyClicks++;
      if(boostVar) ai[boostVar] += ai[power];
      if(id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
      return true;
    }

    function doLoot() {
      if(ai.troops.lt(1)) return false;
      let gain = aiTp();
      if(gain.lt(1)) gain = new ON(1);
      ai.coins = ai.coins.add(gain);
      return true;
    }

    function doRecruit() {
      const cost = aiRecruitCost();
      if(ai.coins.lt(cost)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.troops = ai.troops.add(ai.rp);
      ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
      return true;
    }

    function doTrain() {
      const cost = aiTrainCost();
      if(ai.coins.lt(cost) || ai.troops.lt(5)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.ppt *= ai.trainMult;
      ai.counts["train"] = (ai.counts["train"] || 0) + 1;
      ai._trainClicks++;
      return true;
    }

    const coins = ai.coins.toNumber();

    for(let i = 0; i < clicks; i++) {
      const currentCoins = ai.coins.toNumber();

      if(day <= midDay) {
        // EARLY PHASE: mostly loot, some train, little recruit
        const r = Math.random();
        if(r < earlyLootPct) {
          doLoot();
        } else if(r < earlyLootPct + earlyTrainPct) {
          if(!doTrain()) doLoot();
        } else {
          if(!doRecruit()) doLoot();
        }
      }
      else if(day <= lateDay) {
        // MID PHASE: diversify, start unlocking chain
        // Check army chain (highest tier first) using ratio
        const armyRatio = midArmyRatio;

        // Empire
        if(aiCnt("kingdom") >= 3) {
          const cost = aiArmyCost(C.empire_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower")) continue;
          }
        }
        // Kingdom
        if(aiCnt("colony") >= 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")) continue;
          }
        }
        // Colony
        if(aiCnt("barracks") >= 3) {
          const cost = aiArmyCost(C.colony_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")) continue;
          }
        }
        // Barracks
        if(aiCnt("squad_leader") >= 3) {
          const cost = aiArmyCost(C.barracks_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")) continue;
          }
        }
        // Squad Leader
        if(ai.troops.gte(2)) {
          const cost = aiArmyCost(C.squadLeader_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)) continue;
          }
        }

        // Train if ratio ok
        const trainCost = aiTrainCost();
        if(currentCoins > 0 && trainCost / currentCoins < midTrainRatio) {
          if(doTrain()) continue;
        }

        // Recruit if ratio ok
        const rCost = aiRecruitCost();
        if(currentCoins > 0 && rCost / currentCoins < recruitRatio) {
          if(doRecruit()) continue;
        }

        // Default: loot
        doLoot();
      }
      else {
        // LATE PHASE: heavy train, spam kingdoms when cheap
        const armyRatio = lateArmyRatio;

        // Spam high-tier army when cheap (ratio < 5%)
        if(aiCnt("kingdom") >= 3) {
          const cost = aiArmyCost(C.empire_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower")) continue;
          }
        }
        if(aiCnt("colony") >= 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")) continue;
          }
        }
        if(aiCnt("barracks") >= 3) {
          const cost = aiArmyCost(C.colony_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")) continue;
          }
        }
        if(aiCnt("squad_leader") >= 3) {
          const cost = aiArmyCost(C.barracks_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")) continue;
          }
        }
        if(ai.troops.gte(2)) {
          const cost = aiArmyCost(C.squadLeader_baseCost);
          if(currentCoins > 0 && cost / currentCoins < armyRatio) {
            if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)) continue;
          }
        }

        // Heavy training in late game
        const trainCost = aiTrainCost();
        if(currentCoins > 0 && trainCost / currentCoins < lateTrainRatio) {
          if(doTrain()) continue;
        }

        // Recruit
        const rCost = aiRecruitCost();
        if(currentCoins > 0 && rCost / currentCoins < recruitRatio) {
          if(doRecruit()) continue;
        }

        // Loot
        doLoot();
      }
    }
  };
}

// Old strategies for comparison
function makeTrainFirst() {
  return function(ai, clicks, day) {
    function aiCnt(id) { return ai.counts[id] || 0; }
    function aiTp() { return ai.troops.mul(ai.ppt); }
    function aiArmyCost(base) { return Math.floor(base * Math.pow(1.03, ai._armyClicks)); }
    function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
    function aiTrainCost() {
      const total = ai._trainClicks;
      if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
      return Math.floor(C.train_baseCost * Math.pow(1.02, total));
    }

    for(let i = 0; i < clicks; i++){
      const tCost = aiTrainCost();
      if(ai.troops.gte(5) && ai.coins.gte(tCost)){
        ai.coins = ai.coins.sub(tCost); ai.ppt *= ai.trainMult; ai.counts["train"]=(ai.counts["train"]||0)+1; ai._trainClicks++; continue;
      }
      if(aiCnt("colony")>=3){ const c=aiArmyCost(C.kingdom_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["kingdom"]=(ai.counts["kingdom"]||0)+ai.kingdomPower; ai._armyClicks++; ai.colonyPower+=ai.kingdomPower; continue; }}
      if(aiCnt("barracks")>=3){ const c=aiArmyCost(C.colony_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["colony"]=(ai.counts["colony"]||0)+ai.colonyPower; ai._armyClicks++; ai.barracksPower+=ai.colonyPower; continue; }}
      if(aiCnt("squad_leader")>=3){ const c=aiArmyCost(C.barracks_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["barracks"]=(ai.counts["barracks"]||0)+ai.barracksPower; ai._armyClicks++; ai.squadLeaderPower+=ai.barracksPower; continue; }}
      if(ai.troops.gte(2)){ const c=aiArmyCost(C.squadLeader_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["squad_leader"]=(ai.counts["squad_leader"]||0)+ai.squadLeaderPower; ai._armyClicks++; ai.rp=1+aiCnt("squad_leader"); continue; }}
      const rCost = aiRecruitCost();
      if(ai.coins.gte(rCost)){ ai.coins=ai.coins.sub(rCost); ai.troops=ai.troops.add(ai.rp); ai.counts["recruit"]=(ai.counts["recruit"]||0)+1; continue; }
      if(ai.troops.gte(1)){ let g=aiTp(); if(g.lt(1))g=new ON(1); ai.coins=ai.coins.add(g); }
    }
  };
}

function simulate(strategyFn, cps, days) {
  const ai = createAI();
  for(let d = 1; d <= days; d++) {
    strategyFn(ai, cps, d);
  }
  const cnt = id => ai.counts[id] || 0;
  return {
    power: ai.troops.mul(ai.ppt).toNumber(),
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    emp: cnt("empire"), k: cnt("kingdom"), c: cnt("colony"), b: cnt("barracks"), sl: cnt("squad_leader"),
    t: cnt("train")
  };
}

function report(name, r) {
  console.log(
    name.padEnd(25) +
    ' Power:' + r.power.toExponential(2).padStart(10) +
    ' | E:' + String(r.emp).padStart(3) +
    ' K:' + String(r.k).padStart(4) +
    ' C:' + String(r.c).padStart(5) +
    ' B:' + String(r.b).padStart(6) +
    ' SL:' + String(r.sl).padStart(8) +
    ' | T:' + r.t
  );
}

console.log("=== TESTING RATIO-BASED AI (mimicking human play) ===\n");

// Test different parameter variations
const variations = [
  { name: "Human-like (baseline)", params: {} },
  { name: "Higher mid army ratio", params: { midArmyRatio: 0.30 } },
  { name: "Lower late army ratio", params: { lateArmyRatio: 0.03 } },
  { name: "Earlier late phase", params: { lateDay: 40 } },
  { name: "Later late phase", params: { lateDay: 60 } },
  { name: "More early training", params: { earlyTrainPct: 0.15 } },
  { name: "Higher train ratio", params: { lateTrainRatio: 0.40 } },
];

const trainFirst = makeTrainFirst();

console.log("200 days @ 20 cps:\n");
for (const v of variations) {
  const ai = makeRatioAI(v.params);
  report(v.name, simulate(ai, 20, 200));
}
console.log("---");
report("Train First (old)", simulate(trainFirst, 20, 200));

console.log("\n\n=== HEAD TO HEAD @ different CPS ===\n");

const humanLike = makeRatioAI({});

for (const [days, cps] of [[100, 20], [150, 20], [200, 20], [200, 25]]) {
  console.log(`${days} days @ ${cps} cps:`);
  const ratio = simulate(humanLike, cps, days);
  const train = simulate(trainFirst, cps, days);
  report("  Ratio AI", ratio);
  report("  Train First", train);
  const winner = ratio.power > train.power ? "RATIO AI" : "TRAIN FIRST";
  console.log(`  Winner: ${winner} (${(Math.max(ratio.power, train.power) / Math.min(ratio.power, train.power)).toFixed(1)}x)\n`);
}

console.log("\n=== PARAMETER TUNING ===\n");

// Find best parameters
let bestPower = 0;
let bestParams = {};

const testParams = [];
for (const midArmyRatio of [0.15, 0.20, 0.25, 0.30]) {
  for (const lateArmyRatio of [0.03, 0.05, 0.08]) {
    for (const lateTrainRatio of [0.25, 0.30, 0.35, 0.40]) {
      testParams.push({ midArmyRatio, lateArmyRatio, lateTrainRatio });
    }
  }
}

for (const params of testParams) {
  const ai = makeRatioAI(params);
  const r = simulate(ai, 20, 200);
  if (r.power > bestPower) {
    bestPower = r.power;
    bestParams = params;
  }
}

console.log("Best parameters found:");
console.log(JSON.stringify(bestParams, null, 2));
console.log("\nBest result:");
report("Tuned Ratio AI", simulate(makeRatioAI(bestParams), 20, 200));
console.log("---");
report("Train First", simulate(trainFirst, 20, 200));
