// Simulation: Find optimal food/farm strategy for AI
class ON {
  constructor(v){this.value=v instanceof ON?v.value:typeof v==='bigint'?v:BigInt(Math.max(0,Math.floor(v||0)))}
  add(o){return new ON(this.value+(o instanceof ON?o:new ON(o)).value)}
  sub(o){const ov=(o instanceof ON?o:new ON(o)).value;return new ON(this.value>ov?this.value-ov:0n)}
  mul(n){return new ON(n instanceof ON?this.value*n.value:this.value*BigInt(Math.floor(n)))}
  mulFraction(num,den){return new ON(this.value*BigInt(num)/BigInt(den))}
  gte(o){return this.value>=(o instanceof ON?o:new ON(o)).value}
  lt(o){return !this.gte(o)}
  toNumber(){return Number(this.value)}
}

const C = {
  recruitCost: 20,
  squadLeader_baseCost: 400,
  barracks_baseCost: 1600,
  militaryBase_baseCost: 30000,
  kingdom_baseCost: 400000,
  empire_baseCost: 40000000,
  train_baseCost: 160,
  train_multiplier: 1.01,
  food_perTroopDay: 1,
  farm_baseCost: 1000,
  farm_production: 100,
  colony_baseCost: 5000,  // economy colony
};

function createAI() {
  return {
    coins: new ON(0), troops: new ON(1), food: new ON(500), ppt: 1, rp: 1, fp: 1,
    squadLeaderPower: 1, barracksPower: 1, militaryBasePower: 1, kingdomPower: 1, empirePower: 1,
    trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0, _economyClicks: 0,
    starvationStreak: 0, totalDeserters: 0, daysStarved: 0
  };
}

// Configurable AI with food strategy parameters
function makeAI(params) {
  const {
    // Food strategy
    farmRatioWhenNegative = 0.50,   // max % of coins for farms when food-negative
    farmRatioProactive = 0.30,      // max % of coins for proactive farm buying
    foodBufferDays = 3,             // buy farms proactively if buffer < X days
    productionMultTarget = 1.5,     // target farm production as multiple of consumption
    panicBuyFarms = true,           // ignore ratios when starving?
    // Colony (economy) strategy
    colonyRatio = 0.20,             // max % of coins for economy colonies
    // Standard ratios
    unlockRatio = 0.50,
    spamRatio = 0.10,
    trainRatio = 0.15,
    recruitRatio = 0.05,
  } = params;

  return function(ai, clicks, day) {
    function aiCnt(id) { return ai.counts[id] || 0; }
    function aiTp() { return ai.troops.mul(ai.ppt); }
    function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
    function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
    function aiTrainCost() {
      const total = ai._trainClicks;
      if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
      return Math.floor(C.train_baseCost * Math.pow(1.02, total));
    }
    // Economy costs use shared _economyClicks (like army uses _armyClicks)
    function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
    function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
    function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

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

    function doBuyFarm() {
      const cost = aiFarmCost();
      if(ai.coins.lt(cost)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
      ai._economyClicks++;  // Increment per click, not per farm
      return true;
    }

    function doBuyColony() {
      const cost = aiColonyCost();
      if(ai.coins.lt(cost)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
      ai._economyClicks++;  // Increment per click
      ai.fp = 1 + aiCnt("colony");
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

    const chainUnlocked = aiCnt("kingdom") >= 3;

    for(let i = 0; i < clicks; i++) {
      const currentCoins = ai.coins.toNumber();
      const troopCount = ai.troops.toNumber();
      const dailyConsume = troopCount * C.food_perTroopDay;
      const farmProd = aiCnt("farm") * C.farm_production;
      const foodBuffer = ai.food.toNumber();
      const isStarving = ai.starvationStreak > 0;

      // FOOD STRATEGY
      const fCost = aiFarmCost();

      // Priority 1: Panic buy if starving
      if(panicBuyFarms && isStarving && ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      }

      // Priority 2: Buy farms if food-negative
      if(farmProd < dailyConsume) {
        if(currentCoins > 0 && fCost / currentCoins < farmRatioWhenNegative && ai.coins.gte(fCost)) {
          doBuyFarm();
          continue;
        }
      }

      // Priority 3: Proactive farm buying
      if(foodBuffer < dailyConsume * foodBufferDays && farmProd < dailyConsume * productionMultTarget) {
        if(currentCoins > 0 && fCost / currentCoins < farmRatioProactive && ai.coins.gte(fCost)) {
          doBuyFarm();
          continue;
        }
      }

      // Economy colonies
      if(aiCnt("farm") >= 3) {
        const cCost = aiColonyCost();
        if(currentCoins > 0 && cCost / currentCoins < colonyRatio && ai.coins.gte(cCost)) {
          doBuyColony();
          continue;
        }
      }

      // Bootstrap phase
      if(currentCoins < 500) {
        if(doTrain()) continue;
        if(ai.troops.gte(2) && ai.coins.gte(aiArmyCost(C.squadLeader_baseCost))) {
          buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null);
          continue;
        }
        if(doRecruit()) continue;
        doLoot();
        continue;
      }

      if(!chainUnlocked) {
        // Unlock phase
        if(aiCnt("military_base") >= 3 && aiCnt("kingdom") < 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower");
            continue;
          }
        }
        if(aiCnt("barracks") >= 3 && aiCnt("military_base") < 3) {
          const cost = aiArmyCost(C.militaryBase_baseCost);
          if(currentCoins > 0 && cost / currentCoins < unlockRatio && ai.coins.gte(cost)) {
            buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower");
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

        const tCost = aiTrainCost();
        if(currentCoins > 0 && tCost / currentCoins < trainRatio) {
          if(doTrain()) continue;
        }
        const rCost = aiRecruitCost();
        if(currentCoins > 0 && rCost / currentCoins < recruitRatio) {
          if(doRecruit()) continue;
        }
        doLoot();
      }
      else {
        // Post-unlock: spam army
        if(aiCnt("kingdom") >= 3) {
          const cost = aiArmyCost(C.empire_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("empire", C.empire_baseCost, "empirePower", "kingdomPower")) continue;
          }
        }
        if(aiCnt("military_base") >= 3) {
          const cost = aiArmyCost(C.kingdom_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower")) continue;
          }
        }
        if(aiCnt("barracks") >= 3) {
          const cost = aiArmyCost(C.militaryBase_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower")) continue;
          }
        }
        if(aiCnt("squad_leader") >= 3) {
          const cost = aiArmyCost(C.barracks_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")) continue;
          }
        }
        if(ai.troops.gte(2)) {
          const cost = aiArmyCost(C.squadLeader_baseCost);
          if(currentCoins > 0 && cost / currentCoins < spamRatio) {
            if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)) continue;
          }
        }

        const tCost = aiTrainCost();
        if(currentCoins > 0 && tCost / currentCoins < trainRatio) {
          if(doTrain()) continue;
        }
        const rCost = aiRecruitCost();
        if(currentCoins > 0 && rCost / currentCoins < recruitRatio) {
          if(doRecruit()) continue;
        }
        doLoot();
      }
    }
  };
}

function simulate(strategyFn, cps, days) {
  const ai = createAI();
  for(let d = 1; d <= days; d++) {
    // Run AI clicks
    strategyFn(ai, cps, d);

    // Daily food cycle (after clicks)
    const farmProd = (ai.counts["farm"] || 0) * C.farm_production;
    const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
    ai.food = ai.food.add(farmProd);
    const starving = troopConsume > ai.food.toNumber();
    ai.food = ai.food.sub(troopConsume);

    if(starving) {
      ai.starvationStreak++;
      ai.daysStarved++;
      const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
      let deserters = ai.troops.mulFraction(desertPct, 100);
      if(deserters.lt(1)) deserters = new ON(1);
      ai.totalDeserters += deserters.toNumber();
      ai.troops = ai.troops.sub(deserters);
    } else {
      ai.starvationStreak = 0;
    }
  }

  const cnt = id => ai.counts[id] || 0;
  return {
    power: ai.troops.mul(ai.ppt).toNumber(),
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    farms: cnt("farm"),
    colonies: cnt("colony"),
    daysStarved: ai.daysStarved,
    totalDeserters: ai.totalDeserters,
    k: cnt("kingdom"),
    t: cnt("train")
  };
}

function report(name, r) {
  const starveInfo = r.daysStarved > 0 ? ` STARVED:${r.daysStarved}d, lost ${r.totalDeserters}` : '';
  console.log(
    name.padEnd(30) +
    ' Power:' + r.power.toExponential(2).padStart(10) +
    ' | Farms:' + String(r.farms).padStart(3) +
    ' Col:' + String(r.colonies).padStart(2) +
    ' K:' + String(r.k).padStart(3) +
    ' T:' + String(r.t).padStart(4) +
    starveInfo
  );
}

console.log("=== FOOD STRATEGY SIMULATION ===\n");
console.log("Testing different farm buying strategies at 20 cps for 200 days\n");

// Test variations
const variations = [
  { name: "Current (broken)", params: { farmRatioWhenNegative: 0.50, farmRatioProactive: 0.30, foodBufferDays: 3, productionMultTarget: 1.5 } },
  { name: "No proactive buying", params: { farmRatioProactive: 0 } },
  { name: "Very aggressive farms", params: { farmRatioWhenNegative: 0.80, farmRatioProactive: 0.50, foodBufferDays: 10 } },
  { name: "Higher buffer target", params: { foodBufferDays: 10, productionMultTarget: 2.0 } },
  { name: "Lower buffer target", params: { foodBufferDays: 1, productionMultTarget: 1.2 } },
  { name: "Max farm priority", params: { farmRatioWhenNegative: 1.0, farmRatioProactive: 0.80, foodBufferDays: 20, productionMultTarget: 3.0 } },
  { name: "No panic buy", params: { panicBuyFarms: false } },
];

console.log("200 days @ 20 cps:\n");
for (const v of variations) {
  const ai = makeAI(v.params);
  report(v.name, simulate(ai, 20, 200));
}

// Parameter search for optimal food strategy
console.log("\n\n=== PARAMETER SEARCH ===\n");

let bestPower = 0;
let bestParams = {};

for (const farmRatioWhenNegative of [0.30, 0.50, 0.70, 0.90, 1.0]) {
  for (const farmRatioProactive of [0.10, 0.20, 0.30, 0.50]) {
    for (const foodBufferDays of [1, 3, 5, 10]) {
      for (const productionMultTarget of [1.2, 1.5, 2.0, 3.0]) {
        const params = { farmRatioWhenNegative, farmRatioProactive, foodBufferDays, productionMultTarget };
        const ai = makeAI(params);
        const r = simulate(ai, 20, 200);
        if (r.power > bestPower) {
          bestPower = r.power;
          bestParams = params;
        }
      }
    }
  }
}

console.log("Best food parameters:");
console.log(JSON.stringify(bestParams, null, 2));
console.log("\nBest result:");
const bestAI = makeAI(bestParams);
report("Best Food Strategy", simulate(bestAI, 20, 200));

// Test at different CPS
console.log("\n\n=== BEST STRATEGY @ DIFFERENT CPS ===\n");
for (const cps of [5, 10, 15, 20, 25]) {
  console.log(`${cps} cps:`);
  report("  Best", simulate(bestAI, cps, 200));
}

// Compare: what if we start buying farms earlier?
console.log("\n\n=== BOOTSTRAP STRATEGY TEST ===\n");
console.log("Key insight: Use food buffer to recruit, then buy farms before starving\n");

function makeBootstrapAI(params) {
  const {
    panicDays = 30,  // Start focusing on farm when food buffer < X days
  } = params;

  return function(ai, clicks, day) {
    function aiCnt(id) { return ai.counts[id] || 0; }
    function aiTp() { return ai.troops.mul(ai.ppt); }
    function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
    function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
    function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
    function aiTrainCost() {
      const total = ai._trainClicks;
      if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
      return Math.floor(C.train_baseCost * Math.pow(1.02, total));
    }
    function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }

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

    function doBuyFarm() {
      const cost = aiFarmCost();
      if(ai.coins.lt(cost)) return false;
      ai.coins = ai.coins.sub(cost);
      ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
      ai._economyClicks++;
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

    for(let i = 0; i < clicks; i++) {
      const troopCount = ai.troops.toNumber();
      const dailyConsume = troopCount * C.food_perTroopDay;
      const farmProd = aiCnt("farm") * C.farm_production;
      const foodBuffer = ai.food.toNumber();
      const fCost = aiFarmCost();

      // Calculate days of food remaining
      const netConsume = dailyConsume - farmProd;
      const daysOfFood = netConsume > 0 ? Math.floor(foodBuffer / netConsume) : 999;

      // Calculate sustainability
      const newTroopCount = troopCount + ai.rp;
      const newDailyConsume = newTroopCount * C.food_perTroopDay;
      const canSustainMore = farmProd >= newDailyConsume;

      // BOOTSTRAP: No farms yet - use food buffer to recruit, then buy farm
      if(aiCnt("farm") < 1) {
        if(ai.coins.gte(fCost)) {
          doBuyFarm();
          continue;
        }
        // If food buffer low, focus on looting for farm money
        if(daysOfFood < panicDays) {
          doLoot();
          continue;
        }
        // Otherwise recruit to build income
        if(doRecruit()) continue;
        doLoot();
        continue;
      }

      // SUSTAINABILITY: Have farms, grow sustainably
      if(farmProd < dailyConsume) {
        if(ai.coins.gte(fCost)) {
          doBuyFarm();
          continue;
        }
        doLoot();
        continue;
      }

      // GROWTH PHASE
      if(doTrain()) continue;

      // Army chain
      if(aiCnt("military_base") >= 3) {
        if(ai.coins.gte(aiArmyCost(C.kingdom_baseCost))) {
          buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower");
          continue;
        }
      }
      if(aiCnt("barracks") >= 3) {
        if(ai.coins.gte(aiArmyCost(C.militaryBase_baseCost))) {
          buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower");
          continue;
        }
      }
      if(aiCnt("squad_leader") >= 3) {
        if(ai.coins.gte(aiArmyCost(C.barracks_baseCost))) {
          buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower");
          continue;
        }
      }
      if(ai.troops.gte(2)) {
        if(ai.coins.gte(aiArmyCost(C.squadLeader_baseCost))) {
          buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null);
          continue;
        }
      }

      // Recruit if sustainable
      if(canSustainMore && doRecruit()) continue;

      // Buy farms if can't sustain more
      if(!canSustainMore && ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      }

      doLoot();
    }
  };
}

console.log("200 days @ 20 cps:\n");
for (const panicDays of [10, 20, 30, 50, 100]) {
  const ai = makeBootstrapAI({ panicDays });
  const r = simulate(ai, 20, 200);
  report(`Panic at ${panicDays} days`, r);
}

// Find best bootstrap params
console.log("\n=== BEST BOOTSTRAP PARAMS ===\n");
let bestSafePower = 0;
let bestSafeParams = {};

for (const panicDays of [5, 10, 15, 20, 30, 50, 100]) {
  const params = { panicDays };
  const ai = makeBootstrapAI(params);
  const r = simulate(ai, 20, 200);
  if (r.power > bestSafePower && r.daysStarved === 0) {
    bestSafePower = r.power;
    bestSafeParams = params;
  }
}

console.log("Best bootstrap parameters (no starvation):");
console.log(JSON.stringify(bestSafeParams, null, 2));
const bestSafeAI = makeBootstrapAI(bestSafeParams);
report("Best Bootstrap", simulate(bestSafeAI, 20, 200));

console.log("\n=== BOOTSTRAP @ DIFFERENT CPS ===\n");
for (const cps of [5, 10, 15, 20, 25]) {
  report(`${cps} cps`, simulate(bestSafeAI, cps, 200));
}
