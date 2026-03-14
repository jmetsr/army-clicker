// AI v2: Unlock chain first, THEN use ratio-based decisions
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

// V2: Unlock chain aggressively, then use ratios
function makeRatioAI_v2(params) {
  const {
    // Unlock thresholds (willing to spend more % to unlock new tiers)
    unlockRatio = 0.50,    // spend up to 50% of coins to unlock next tier
    // Post-unlock ratios (spam when cheap)
    spamRatio = 0.05,      // spam army when cost < 5% of coins
    trainRatio = 0.20,     // train when cost < 20% of coins
    recruitRatio = 0.10,   // recruit when cost < 10% of coins
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

    // Check if chain is unlocked (have 3 of each tier up to kingdoms)
    const chainUnlocked = aiCnt("kingdom") >= 3;

    for(let i = 0; i < clicks; i++) {
      const currentCoins = ai.coins.toNumber();

      if(!chainUnlocked) {
        // UNLOCK PHASE: Aggressively unlock the chain
        // Buy next tier if we can afford it (up to unlockRatio of coins)

        // Check what we need to unlock next
        if(aiCnt("colony") >= 3 && aiCnt("kingdom") < 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower");
            continue;
          }
        }
        if(aiCnt("barracks") >= 3 && aiCnt("colony") < 3) {
          const cost = aiArmyCost(C.colony_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower");
            continue;
          }
        }
        if(aiCnt("squad_leader") >= 3 && aiCnt("barracks") < 3) {
          const cost = aiArmyCost(C.barracks_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower");
            continue;
          }
        }
        if(ai.troops.gte(2) && aiCnt("squad_leader") < 3) {
          const cost = aiArmyCost(C.squadLeader_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null);
            continue;
          }
        }

        // Train if affordable
        const tCost = aiTrainCost();
        if(currentCoins > 0 && tCost / currentCoins < trainRatio) {
          if(doTrain()) continue;
        }

        // Recruit if affordable
        const rCost = aiRecruitCost();
        if(currentCoins > 0 && rCost / currentCoins < recruitRatio) {
          if(doRecruit()) continue;
        }

        // Default: loot
        doLoot();
      }
      else {
        // POST-UNLOCK PHASE: Spam army when cheap, train heavily

        // Spam empire when very cheap
        if(aiCnt("kingdom") >= 3) {
          const cost = aiArmyCost(C.empire_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower")) continue;
          }
        }
        // Spam kingdom when very cheap
        if(aiCnt("colony") >= 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")) continue;
          }
        }
        // Spam colony
        if(aiCnt("barracks") >= 3) {
          const cost = aiArmyCost(C.colony_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")) continue;
          }
        }
        // Spam barracks
        if(aiCnt("squad_leader") >= 3) {
          const cost = aiArmyCost(C.barracks_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")) continue;
          }
        }
        // Spam SL
        if(ai.troops.gte(2)) {
          const cost = aiArmyCost(C.squadLeader_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)) continue;
          }
        }

        // Heavy training
        const tCost = aiTrainCost();
        if(currentCoins > 0 && tCost / currentCoins < trainRatio) {
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

// Train First for comparison
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

console.log("=== RATIO AI v2 (unlock first, then ratio spam) ===\n");

const trainFirst = makeTrainFirst();

// Test variations
const variations = [
  { name: "Baseline", params: {} },
  { name: "Higher unlock ratio", params: { unlockRatio: 0.70 } },
  { name: "Lower spam ratio", params: { spamRatio: 0.03 } },
  { name: "Higher spam ratio", params: { spamRatio: 0.10 } },
  { name: "Higher train ratio", params: { trainRatio: 0.30 } },
  { name: "Lower train ratio", params: { trainRatio: 0.15 } },
];

console.log("200 days @ 20 cps:\n");
for (const v of variations) {
  const ai = makeRatioAI_v2(v.params);
  report(v.name, simulate(ai, 20, 200));
}
console.log("---");
report("Train First (old)", simulate(trainFirst, 20, 200));

// Parameter search
console.log("\n\n=== PARAMETER SEARCH ===\n");

let bestPower = 0;
let bestParams = {};

for (const unlockRatio of [0.30, 0.50, 0.70, 0.90]) {
  for (const spamRatio of [0.03, 0.05, 0.08, 0.10]) {
    for (const trainRatio of [0.15, 0.20, 0.25, 0.30]) {
      for (const recruitRatio of [0.05, 0.10, 0.15]) {
        const params = { unlockRatio, spamRatio, trainRatio, recruitRatio };
        const ai = makeRatioAI_v2(params);
        const r = simulate(ai, 20, 200);
        if (r.power > bestPower) {
          bestPower = r.power;
          bestParams = params;
        }
      }
    }
  }
}

console.log("Best parameters:");
console.log(JSON.stringify(bestParams, null, 2));
console.log("\nBest vs Train First @ 20 cps:");
const bestAI = makeRatioAI_v2(bestParams);
report("Best Ratio AI", simulate(bestAI, 20, 200));
report("Train First", simulate(trainFirst, 20, 200));

console.log("\n\n=== FINAL COMPARISON ===\n");
for (const days of [100, 150, 200]) {
  console.log(`${days} days @ 20 cps:`);
  const ratio = simulate(bestAI, 20, days);
  const train = simulate(trainFirst, 20, days);
  report("  Ratio AI", ratio);
  report("  Train First", train);
  const winner = ratio.power > train.power ? "RATIO" : "TRAIN";
  const factor = Math.max(ratio.power, train.power) / Math.min(ratio.power, train.power);
  console.log(`  >>> ${winner} wins (${factor.toFixed(1)}x)\n`);
}
