#!/usr/bin/env node
// AI Strategy Simulation - Headless Node.js version
// Run: node simulate.js [days] [clicksPerSec] [numSims]

// === MINIMAL ORDINAL NUMBER (just what we need) ===
function ON(n) {
  if (n instanceof ON.constructor) return n;
  return new OrdinalNumber(n);
}

class OrdinalNumber {
  constructor(n) {
    this.layer = 0;
    this.value = BigInt(Math.floor(Number(n) || 0));
  }
  add(other) {
    const o = other instanceof OrdinalNumber ? other : new OrdinalNumber(other);
    const result = new OrdinalNumber(0);
    result.value = this.value + o.value;
    return result;
  }
  sub(other) {
    const o = other instanceof OrdinalNumber ? other : new OrdinalNumber(other);
    const result = new OrdinalNumber(0);
    result.value = this.value - o.value;
    if (result.value < 0n) result.value = 0n;
    return result;
  }
  mul(other) {
    const o = typeof other === 'number' ? BigInt(Math.floor(other)) :
              other instanceof OrdinalNumber ? other.value : BigInt(other);
    const result = new OrdinalNumber(0);
    result.value = this.value * o;
    return result;
  }
  mulFraction(num, denom) {
    const result = new OrdinalNumber(0);
    result.value = this.value * BigInt(num) / BigInt(denom);
    return result;
  }
  lt(other) {
    const o = other instanceof OrdinalNumber ? other.value : BigInt(Math.floor(other));
    return this.value < o;
  }
  gt(other) {
    const o = other instanceof OrdinalNumber ? other.value : BigInt(Math.floor(other));
    return this.value > o;
  }
  gte(other) {
    const o = other instanceof OrdinalNumber ? other.value : BigInt(Math.floor(other));
    return this.value >= o;
  }
  toNumber() {
    return Number(this.value);
  }
}
ON.constructor = OrdinalNumber;

// === GAME CONSTANTS ===
const C = {
  recruitCost: 10,
  train_baseCost: 169,
  train_multiplier: 1.01,
  food_perTroopDay: 1,
  farm_baseCost: 1000,
  farm_production: 100,
  plantation_baseCost: 5000,
  colony_baseCost: 25000,
  squadLeader_baseCost: 500,
  barracks_baseCost: 2500,
  militaryBase_baseCost: 12500,
  kingdom_baseCost: 62500,
};

// === AI STATE FACTORY ===
function createAIState() {
  return {
    coins: ON(0), troops: ON(0), food: ON(500), ppt: 1, rp: 1, fp: 1, pp: 1,
    squadLeaderPower: 1, barracksPower: 1, militaryBasePower: 1, kingdomPower: 1,
    trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0, _economyClicks: 0,
    starvationStreak: 0
  };
}

// === OLD PRIORITY-BASED AI ===
function runAI_Old(ai, clicks, enemyPower) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }
  function doBuyFarm() {
    const cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    return true;
  }
  function doBuyPlantation() {
    const cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    return true;
  }
  function doBuyColony() {
    const cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    return true;
  }
  function doRecruit() {
    const cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    return true;
  }
  function doTrain() {
    const cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    return true;
  }

  const maxIterations = clicks;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    let acted = false;
    const troopCount = ai.troops.toNumber();

    if (troopCount < 1) {
      const recruitCost = aiRecruitCost();
      if (ai.coins.lt(recruitCost)) {
        ai.coins = ai.coins.add(1);
        acted = true; continue;
      }
    }

    const dailyConsume = troopCount * C.food_perTroopDay;
    const farmProd = aiCnt("farm") * C.farm_production;
    const foodBuffer = ai.food.toNumber();
    const fCost = aiFarmCost();
    const newTroopCount = troopCount + ai.rp;
    const newDailyConsume = newTroopCount * C.food_perTroopDay;
    const canSustainMore = farmProd >= newDailyConsume;
    const netConsume = dailyConsume - farmProd;
    const daysOfFood = netConsume > 0 ? Math.floor(foodBuffer / netConsume) : 999;

    if (aiCnt("farm") < 1 && daysOfFood > 10) {
      if (doRecruit()) { acted = true; continue; }
    }
    if (aiCnt("farm") < 1 || farmProd < dailyConsume) {
      if (ai.coins.gte(fCost)) { doBuyFarm(); acted = true; continue; }
      if (daysOfFood <= 30) break;
    }
    if (doTrain()) { acted = true; continue; }
    if (aiCnt("military_base") >= 3 && ai.coins.gte(aiArmyCost(C.kingdom_baseCost))) {
      buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower"); acted = true; continue;
    }
    if (aiCnt("barracks") >= 3 && ai.coins.gte(aiArmyCost(C.militaryBase_baseCost))) {
      buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower"); acted = true; continue;
    }
    if (aiCnt("squad_leader") >= 3 && ai.coins.gte(aiArmyCost(C.barracks_baseCost))) {
      buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower"); acted = true; continue;
    }
    if (ai.troops.gte(2) && ai.coins.gte(aiArmyCost(C.squadLeader_baseCost))) {
      buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null); acted = true; continue;
    }
    const targetFarmProd = dailyConsume * 2;
    if (farmProd < targetFarmProd && ai.coins.gte(fCost)) { doBuyFarm(); acted = true; continue; }
    if (aiCnt("plantation") >= 3 && ai.coins.gte(aiColonyCost())) { doBuyColony(); acted = true; continue; }
    if (aiCnt("farm") >= 3 && ai.coins.gte(aiPlantationCost())) { doBuyPlantation(); acted = true; continue; }
    if (canSustainMore && doRecruit()) { acted = true; continue; }
    if (!acted) ai.coins = ai.coins.add(1);
  }
}

// === NEW SCORE-BASED AI ===
// Tuning parameters (adjust these!)
const PARAMS = {
  K_CLOSENESS: 0.5,      // How much closeness boosts army
  K_STRAIN: 2.0,         // How much strain boosts economy
  NO_INFLATE_BONUS: 1.2, // Bonus for train/recruit
  VAL_FARM: 1,
  VAL_PLANTATION: 3,
  VAL_COLONY: 9,
  VAL_SL: 10,            // 10x per tier - prioritizes multiplier chain
  VAL_BARRACKS: 100,
  VAL_MB: 1000,
  VAL_KINGDOM: 10000,
};

function runAI_New(ai, clicks, enemyPower) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }
  function doBuyFarm() {
    const cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    return true;
  }
  function doBuyPlantation() {
    const cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    return true;
  }
  function doBuyColony() {
    const cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    return true;
  }
  function doRecruit() {
    const cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    return true;
  }
  function doTrain() {
    const cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    return true;
  }

  // Scoring
  let coins = ai.coins.toNumber();
  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const closeness = Math.min(myPower, enemyPower) / Math.max(myPower, enemyPower, 1);
  const farmProd = aiCnt("farm") * C.farm_production;
  const maxSustainable = farmProd / C.food_perTroopDay;
  let strain = maxSustainable > 0 ? troopCount / maxSustainable : 1;
  strain = Math.min(strain, 1);

  // Pre-calculate income for wait penalty
  const incomePerDayCalc = (troopCount * ppt * 4) + clicks;

  // calcScore with multiplicative decay for wait penalty
  // Each day of waiting reduces value by 1% (decay = 0.99)
  function calcScore(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;
    const currentCoins = ai.coins.toNumber();
    const costPct = cost / Math.max(currentCoins, 1);

    // Base penalty: sqrt(costPct) - handles cost relative to current coins
    const penalty = Math.sqrt(costPct);
    let baseScore = value / penalty;

    // Wait penalty: if unaffordable, multiply by decay^daysToWait
    if (costPct > 1) {
      const coinsNeeded = cost - currentCoins;
      const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
      const decay = 0.99; // 1% reduction per day
      baseScore *= Math.pow(decay, daysToWait);
    }

    if (isImmediate) baseScore *= PARAMS.NO_INFLATE_BONUS;
    if (isArmy) baseScore *= (1 + closeness * PARAMS.K_CLOSENESS);
    else baseScore *= (1 + strain * PARAMS.K_STRAIN);
    return baseScore;
  }

  // Food emergency check
  const dailyConsume = troopCount * C.food_perTroopDay;
  const netConsume = dailyConsume - farmProd;
  const foodBuffer = ai.food.toNumber();
  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const incomePerDay = (troopCount * ppt * 4) + clicks;
  const fCost = aiFarmCost();
  const daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
  const foodEmergency = daysToAffordFarm > daysOfFood && netConsume > 0;

  function recruitCausesSuperEmergency() {
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;

    // If farms already sustain new consumption, we're fine
    if (currentFarmProd >= newConsume) return false;

    // Check if we have enough food buffer to survive until we can afford farms
    const deficit = newConsume - currentFarmProd;
    const foodBuffer = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? foodBuffer / deficit : 999;

    // If we have 50+ days of food buffer, not an emergency
    if (daysOfBuffer > 50) return false;

    // Check if we can ever afford enough farms
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsHave = aiCnt("farm");
    const farmsToBuy = farmsNeeded - farmsHave;
    const costToBuyFarms = farmsToBuy * fCost; // Simplified

    // If we can afford the farms needed, not an emergency
    if (coins >= costToBuyFarms) return false;

    // If we need to buy farms but have good buffer, not super emergency
    return daysOfBuffer < 20;
  }

  const maxIterations = clicks;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    coins = ai.coins.toNumber();
    const currentTroops = ai.troops.toNumber();

    // Beg if no troops
    if (currentTroops < 1) {
      const recruitCost = aiRecruitCost();
      if (ai.coins.lt(recruitCost)) {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    // Recalculate emergency
    const currentDailyConsume = currentTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;
    const currentNetConsume = currentDailyConsume - currentFarmProd;
    const currentFoodBuffer = ai.food.toNumber();
    const currentDaysOfFood = currentNetConsume > 0 ? currentFoodBuffer / currentNetConsume : 999;
    const currentDaysToAfford = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    // Emergency: can't afford farm before food runs out, OR already at 0 food and still need farms
    const currentEmergency = (currentDaysToAfford > currentDaysOfFood || currentDaysOfFood <= 0) && currentNetConsume > 0;

    if (currentEmergency) {
      if (ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      } else {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }


    // Calculate scores for all actions
    const actions = [];

    // Train
    if (currentTroops >= 5) {
      const trainCost = aiTrainCost();
      const trainValue = currentTroops * ppt * 0.01;
      const trainScore = calcScore(trainCost, trainValue, true, true);
      if (trainScore > 0) actions.push({ name: 'train', score: trainScore, fn: doTrain });
    }

    // Recruit
    if (!recruitCausesSuperEmergency()) {
      const recruitCost = aiRecruitCost();
      const recruitValue = ai.rp * ppt;
      const newStrain = maxSustainable > 0 ? (currentTroops + ai.rp) / maxSustainable : 1;
      const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
      let recruitScore = calcScore(recruitCost, recruitValue, true, true);
      recruitScore -= strainPenalty;
      if (recruitScore > 0) actions.push({ name: 'recruit', score: recruitScore, fn: doRecruit });
    }

    // Squad Leader
    if (currentTroops >= 2) {
      const slCost = aiArmyCost(C.squadLeader_baseCost);
      const slValue = ai.squadLeaderPower * PARAMS.VAL_SL;
      const slScore = calcScore(slCost, slValue, true, false);
      if (slScore > 0) actions.push({ name: 'sl', score: slScore, fn: () => buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null) });
    }

    // Barracks
    if (aiCnt("squad_leader") >= 3) {
      const barCost = aiArmyCost(C.barracks_baseCost);
      const barValue = ai.barracksPower * PARAMS.VAL_BARRACKS;
      const barScore = calcScore(barCost, barValue, true, false);
      if (barScore > 0) actions.push({ name: 'barracks', score: barScore, fn: () => buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower") });
    }

    // Military Base
    if (aiCnt("barracks") >= 3) {
      const mbCost = aiArmyCost(C.militaryBase_baseCost);
      const mbValue = ai.militaryBasePower * PARAMS.VAL_MB;
      const mbScore = calcScore(mbCost, mbValue, true, false);
      if (mbScore > 0) actions.push({ name: 'mb', score: mbScore, fn: () => buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower") });
    }

    // Kingdom
    if (aiCnt("military_base") >= 3) {
      const kingCost = aiArmyCost(C.kingdom_baseCost);
      const kingValue = ai.kingdomPower * PARAMS.VAL_KINGDOM;
      const kingScore = calcScore(kingCost, kingValue, true, false);
      if (kingScore > 0) actions.push({ name: 'kingdom', score: kingScore, fn: () => buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower") });
    }

    // Farm
    const farmCost = aiFarmCost();
    const farmValue = ai.fp * PARAMS.VAL_FARM;
    const farmScore = calcScore(farmCost, farmValue, false, false);
    if (farmScore > 0) actions.push({ name: 'farm', score: farmScore, fn: doBuyFarm });

    // Plantation
    if (aiCnt("farm") >= 3) {
      const plantCost = aiPlantationCost();
      const plantValue = ai.pp * PARAMS.VAL_PLANTATION;
      const plantScore = calcScore(plantCost, plantValue, false, false);
      if (plantScore > 0) actions.push({ name: 'plantation', score: plantScore, fn: doBuyPlantation });
    }

    // Colony
    if (aiCnt("plantation") >= 3) {
      const colCost = aiColonyCost();
      const colValue = 1 * PARAMS.VAL_COLONY;
      const colScore = calcScore(colCost, colValue, false, false);
      if (colScore > 0) actions.push({ name: 'colony', score: colScore, fn: doBuyColony });
    }

    // Execute best action
    if (actions.length > 0) {
      actions.sort((a, b) => b.score - a.score);

      // === COST POOL AWARENESS ===
      // Only filter lower-tier buildings when we're CLOSE to affording higher-tier
      const armyTiers = ['sl', 'barracks', 'mb', 'kingdom'];
      const econTiers = ['farm', 'plantation', 'colony'];

      // Find highest-tier UNLOCKED building in each pool and its cost
      let highestArmyTier = -1;
      let highestEconTier = -1;
      let armyTargetCost = 0;
      let econTargetCost = 0;

      const armyCosts = {
        'sl': aiArmyCost(C.squadLeader_baseCost),
        'barracks': aiArmyCost(C.barracks_baseCost),
        'mb': aiArmyCost(C.militaryBase_baseCost),
        'kingdom': aiArmyCost(C.kingdom_baseCost)
      };
      const econCosts = {
        'farm': aiFarmCost(),
        'plantation': aiPlantationCost(),
        'colony': aiColonyCost()
      };

      for (let i = 0; i < actions.length; i++) {
        const tier = armyTiers.indexOf(actions[i].name);
        if (tier > highestArmyTier) {
          highestArmyTier = tier;
          armyTargetCost = armyCosts[armyTiers[tier]];
        }
        const eTier = econTiers.indexOf(actions[i].name);
        if (eTier > highestEconTier) {
          highestEconTier = eTier;
          econTargetCost = econCosts[econTiers[eTier]];
        }
      }

      // Calculate days to reach targets
      const SAVE_THRESHOLD = 20; // Only "save" if target is within N days
      const armyDaysToReach = armyTargetCost > coins ? (armyTargetCost - coins) / Math.max(incomePerDay, 1) : 0;
      const econDaysToReach = econTargetCost > coins ? (econTargetCost - coins) / Math.max(incomePerDay, 1) : 0;
      const shouldSaveForArmy = armyTargetCost > coins && armyDaysToReach <= SAVE_THRESHOLD;
      const shouldSaveForEcon = econTargetCost > coins && econDaysToReach <= SAVE_THRESHOLD;

      // Find the BEST action overall (highest score)
      const best = actions[0]; // Already sorted

      // Is best an unaffordable building?
      const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
      let bestCost = 0;
      if (bestIsBuilding) {
        bestCost = armyCosts[best.name] || econCosts[best.name] || 0;
      }
      const bestIsUnaffordable = bestIsBuilding && bestCost > coins;

      if (bestIsUnaffordable) {
        // Best is an unaffordable building - we're "saving" for it
        // Filter out lower-tier buildings in same pool
        const bestArmyTier = armyTiers.indexOf(best.name);
        const bestEconTier = econTiers.indexOf(best.name);

        let acted = false;
        for (let i = 0; i < actions.length; i++) {
          const a = actions[i];
          if (a.name === 'train' || a.name === 'recruit') continue;
          const armyTier = armyTiers.indexOf(a.name);
          const econTier = econTiers.indexOf(a.name);
          if (bestArmyTier >= 0 && armyTier >= 0 && armyTier < bestArmyTier) continue;
          if (bestEconTier >= 0 && econTier >= 0 && econTier < bestEconTier) continue;
          if (a.fn()) { acted = true; break; }
        }
        if (acted) continue;

        // Check if train/recruit HELPS reach best
        const daysToReach = (bestCost - coins) / Math.max(incomePerDay, 1);

        const recruitCost = aiRecruitCost();
        const newIncomeWithRecruit = ((currentTroops + ai.rp) * ppt * 4) + clicks;
        const daysWithRecruit = (bestCost - coins + recruitCost) / Math.max(newIncomeWithRecruit, 1);
        const superEmergency = recruitCausesSuperEmergency();
        const canAffordRecruit = ai.coins.gte(recruitCost);
        const recruitHelps = daysWithRecruit < daysToReach && !superEmergency && canAffordRecruit;

        // DEBUG
        if (ai._debug && ai.counts["squad_leader"] === 3 && ai.counts["barracks"] === 0) {
          console.log(`DEBUG recruitHelps: daysWithRecruit=${daysWithRecruit.toFixed(2)}, daysToReach=${daysToReach.toFixed(2)}, superEmergency=${superEmergency}, canAffordRecruit=${canAffordRecruit}, recruitHelps=${recruitHelps}`);
        }

        const trainCost = aiTrainCost();
        const newIncomeWithTrain = (currentTroops * ppt * ai.trainMult * 4) + clicks;
        const daysWithTrain = (bestCost - coins + trainCost) / Math.max(newIncomeWithTrain, 1);
        const trainHelps = daysWithTrain < daysToReach && currentTroops >= 5 && ai.coins.gte(trainCost);

        if (recruitHelps || trainHelps) {
          if (recruitHelps && trainHelps) {
            if (daysWithRecruit < daysWithTrain) {
              if (doRecruit()) continue;
            } else {
              if (doTrain()) continue;
            }
          } else if (recruitHelps) {
            if (doRecruit()) continue;
          } else {
            if (doTrain()) continue;
          }
        }
      } else {
        // Best is affordable or is train/recruit - just try actions in score order
        for (let i = 0; i < actions.length; i++) {
          if (actions[i].fn()) break;
        }
      }
    }

    // Nothing affordable or helpful - beg
    ai.coins = ai.coins.add(1);
  }
}

// === SIMULATION ===
function simDay(ai, clicks, enemyPower, runFn) {
  runFn(ai, clicks, enemyPower);

  // Passive loot
  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  // Food
  const farmProd = (ai.counts["farm"] || 0) * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  // Starvation
  if (starving) {
    ai.starvationStreak++;
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function runSimulation(days, clicksPerSec, verbose = false) {
  const oldAI = createAIState();
  const newAI = createAIState();

  const snapshots = [];

  for (let day = 1; day <= days; day++) {
    const oldPower = oldAI.troops.toNumber() * oldAI.ppt;
    const newPower = newAI.troops.toNumber() * newAI.ppt;

    simDay(oldAI, clicksPerSec, newPower, runAI_Old);
    simDay(newAI, clicksPerSec, oldPower, runAI_New);

    if (day % 50 === 0 || day === days) {
      snapshots.push({
        day,
        old: { power: oldAI.troops.toNumber() * oldAI.ppt, troops: oldAI.troops.toNumber(), farms: oldAI.counts["farm"] || 0 },
        new: { power: newAI.troops.toNumber() * newAI.ppt, troops: newAI.troops.toNumber(), farms: newAI.counts["farm"] || 0 }
      });
    }
  }

  const final = snapshots[snapshots.length - 1];
  return {
    winner: final.new.power > final.old.power ? 'NEW' : final.old.power > final.new.power ? 'OLD' : 'TIE',
    oldPower: final.old.power,
    newPower: final.new.power,
    ratio: final.new.power / Math.max(final.old.power, 1),
    snapshots
  };
}

function runBatch(numSims, days, clicks) {
  let newWins = 0, oldWins = 0, ties = 0;
  let totalRatio = 0;

  for (let i = 0; i < numSims; i++) {
    const result = runSimulation(days, clicks);
    if (result.winner === 'NEW') newWins++;
    else if (result.winner === 'OLD') oldWins++;
    else ties++;
    totalRatio += result.ratio;
  }

  return {
    numSims,
    days,
    clicks,
    newWins,
    oldWins,
    ties,
    newWinRate: (newWins / numSims * 100).toFixed(1) + '%',
    avgRatio: (totalRatio / numSims).toFixed(2)
  };
}

// === DEBUG: Trace emergency logic for new AI ===
function debugEmergency() {
  const ai = createAIState();
  const clicks = 10;

  console.log('=== DEBUG: Tracing emergency logic ===\n');

  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }

  for (let day = 1; day <= 25; day++) {
    const enemyPower = 0;

    // Run AI for this day
    runAI_New(ai, clicks, enemyPower);

    // Calculate emergency vars AFTER AI runs (same as start of next day)
    const troops = ai.troops.toNumber();
    const coins = ai.coins.toNumber();
    const ppt = ai.ppt;
    const farmProd = aiCnt("farm") * C.farm_production;
    const dailyConsume = troops * C.food_perTroopDay;
    const netConsume = dailyConsume - farmProd;
    const foodBuffer = ai.food.toNumber();
    const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    const fCost = aiFarmCost();
    const incomePerDay = (troops * ppt * 4) + clicks;
    const daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    const emergency = daysToAffordFarm > daysOfFood && netConsume > 0;

    // Apply day-end (passive loot, food consumption)
    if (ai.troops.gte(1)) {
      ai.coins = ai.coins.add(ai.troops.mul(ai.ppt).mul(4));
    }
    ai.food = ai.food.add(farmProd);
    const starving = dailyConsume > ai.food.toNumber();
    ai.food = ai.food.sub(dailyConsume);
    if (ai.food.lt(0)) ai.food = ON(0);
    if (starving) {
      ai.starvationStreak++;
      const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
      ai.troops = ai.troops.sub(ai.troops.mulFraction(Math.floor(desertPct), 100));
    } else {
      ai.starvationStreak = 0;
    }

    console.log(`Day ${day.toString().padStart(2)}: troops=${troops.toString().padStart(2)}, coins=${coins.toString().padStart(4)}, food=${foodBuffer.toString().padStart(3)}, farms=${aiCnt("farm")}`);
    console.log(`        netConsume=${netConsume}, daysOfFood=${daysOfFood.toFixed(1)}, daysToAfford=${daysToAffordFarm.toFixed(1)}, EMERGENCY=${emergency}`);
  }
}

// Re-run comparison after bug fix
function revalidate() {
  const numSims = 100;
  const days = 200;
  const clicks = 10;

  // Set combined best params
  PARAMS.K_CLOSENESS = 0.5;
  PARAMS.K_STRAIN = 2.0;
  PARAMS.NO_INFLATE_BONUS = 1.2;
  PARAMS.VAL_SL = 3;
  PARAMS.VAL_BARRACKS = 9;
  PARAMS.VAL_MB = 27;
  PARAMS.VAL_KINGDOM = 81;

  console.log('=== Re-validation after bug fix ===');
  console.log(`${numSims} sims, ${days} days, ${clicks} clicks/sec`);
  console.log('Params:', PARAMS);
  console.log('');

  const results = runBatch(numSims, days, clicks);
  console.log('Results:', results);

  // Show sample run
  console.log('\nSample run snapshots:');
  const sample = runSimulation(days, clicks, true);
  console.table(sample.snapshots.map(s => ({
    Day: s.day,
    'Old Power': Math.floor(s.old.power),
    'New Power': Math.floor(s.new.power),
    'Old Troops': Math.floor(s.old.troops),
    'New Troops': Math.floor(s.new.troops),
    Winner: s.new.power > s.old.power ? 'NEW' : s.old.power > s.new.power ? 'OLD' : 'TIE'
  })));
}

// Test with different click rates to verify
function testClickRates() {
  const numSims = 50;
  const days = 200;

  PARAMS.K_CLOSENESS = 0.5;
  PARAMS.K_STRAIN = 2.0;
  PARAMS.NO_INFLATE_BONUS = 1.2;
  PARAMS.VAL_SL = 3;
  PARAMS.VAL_BARRACKS = 9;
  PARAMS.VAL_MB = 27;
  PARAMS.VAL_KINGDOM = 81;

  console.log('=== Testing with corrected iteration count (clicks, not clicks*10) ===\n');

  for (const clicks of [4, 8, 25]) {
    const r = runBatch(numSims, days, clicks);
    console.log(`${clicks} cps: winRate=${r.newWinRate}, avgRatio=${r.avgRatio}`);
  }
}

// === NEW: Test different army multiplier ratios head-to-head ===
function runAI_WithParams(ai, clicks, enemyPower, params) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }
  function doBuyFarm() {
    const cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    return true;
  }
  function doBuyPlantation() {
    const cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    return true;
  }
  function doBuyColony() {
    const cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    return true;
  }
  function doRecruit() {
    const cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    return true;
  }
  function doTrain() {
    const cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    return true;
  }

  // Scoring
  let coins = ai.coins.toNumber();
  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const closeness = Math.min(myPower, enemyPower) / Math.max(myPower, enemyPower, 1);
  const farmProd = aiCnt("farm") * C.farm_production;
  const maxSustainable = farmProd / C.food_perTroopDay;
  let strain = maxSustainable > 0 ? troopCount / maxSustainable : 1;
  strain = Math.min(strain, 1);

  function calcScore(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;
    if (ai.coins.lt(cost)) return -1;
    const currentCoins = ai.coins.toNumber();
    const costPct = cost / currentCoins;
    let baseScore = value / Math.sqrt(costPct);
    if (isImmediate) baseScore *= params.NO_INFLATE_BONUS;
    if (isArmy) baseScore *= (1 + closeness * params.K_CLOSENESS);
    else baseScore *= (1 + strain * params.K_STRAIN);
    return baseScore;
  }

  // Food emergency check
  const dailyConsume = troopCount * C.food_perTroopDay;
  const netConsume = dailyConsume - farmProd;
  const foodBuffer = ai.food.toNumber();
  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const incomePerDay = (troopCount * ppt * 4) + clicks;
  const fCost = aiFarmCost();
  const daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;

  function recruitCausesSuperEmergency() {
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;
    if (currentFarmProd >= newConsume) return false;
    const deficit = newConsume - currentFarmProd;
    const foodBuffer = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? foodBuffer / deficit : 999;
    if (daysOfBuffer > 50) return false;
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsHave = aiCnt("farm");
    const farmsToBuy = farmsNeeded - farmsHave;
    const costToBuyFarms = farmsToBuy * fCost;
    if (coins >= costToBuyFarms) return false;
    return daysOfBuffer < 20;
  }

  const maxIterations = clicks;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    coins = ai.coins.toNumber();
    const currentTroops = ai.troops.toNumber();

    if (currentTroops < 1) {
      const recruitCost = aiRecruitCost();
      if (ai.coins.lt(recruitCost)) {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    const currentDailyConsume = currentTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;
    const currentNetConsume = currentDailyConsume - currentFarmProd;
    const currentFoodBuffer = ai.food.toNumber();
    const currentDaysOfFood = currentNetConsume > 0 ? currentFoodBuffer / currentNetConsume : 999;
    const currentDaysToAfford = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    const currentEmergency = (currentDaysToAfford > currentDaysOfFood || currentDaysOfFood <= 0) && currentNetConsume > 0;

    if (currentEmergency) {
      if (ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      } else {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    const actions = [];

    // Train
    if (currentTroops >= 5) {
      const trainCost = aiTrainCost();
      const trainValue = currentTroops * ppt * 0.01;
      const trainScore = calcScore(trainCost, trainValue, true, true);
      if (trainScore > 0) actions.push({ name: 'train', score: trainScore, fn: doTrain });
    }

    // Recruit
    if (!recruitCausesSuperEmergency()) {
      const recruitCost = aiRecruitCost();
      const recruitValue = ai.rp * ppt;
      const newStrain = maxSustainable > 0 ? (currentTroops + ai.rp) / maxSustainable : 1;
      const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
      let recruitScore = calcScore(recruitCost, recruitValue, true, true);
      recruitScore -= strainPenalty;
      if (recruitScore > 0) actions.push({ name: 'recruit', score: recruitScore, fn: doRecruit });
    }

    // Squad Leader
    if (currentTroops >= 2) {
      const slCost = aiArmyCost(C.squadLeader_baseCost);
      const slValue = ai.squadLeaderPower * params.VAL_SL;
      const slScore = calcScore(slCost, slValue, true, false);
      if (slScore > 0) actions.push({ name: 'sl', score: slScore, fn: () => buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null) });
    }

    // Barracks
    if (aiCnt("squad_leader") >= 3) {
      const barCost = aiArmyCost(C.barracks_baseCost);
      const barValue = ai.barracksPower * params.VAL_BARRACKS;
      const barScore = calcScore(barCost, barValue, true, false);
      if (barScore > 0) actions.push({ name: 'barracks', score: barScore, fn: () => buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower") });
    }

    // Military Base
    if (aiCnt("barracks") >= 3) {
      const mbCost = aiArmyCost(C.militaryBase_baseCost);
      const mbValue = ai.militaryBasePower * params.VAL_MB;
      const mbScore = calcScore(mbCost, mbValue, true, false);
      if (mbScore > 0) actions.push({ name: 'mb', score: mbScore, fn: () => buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower") });
    }

    // Kingdom
    if (aiCnt("military_base") >= 3) {
      const kingCost = aiArmyCost(C.kingdom_baseCost);
      const kingValue = ai.kingdomPower * params.VAL_KINGDOM;
      const kingScore = calcScore(kingCost, kingValue, true, false);
      if (kingScore > 0) actions.push({ name: 'kingdom', score: kingScore, fn: () => buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower") });
    }

    // Farm
    const farmCost = aiFarmCost();
    const farmValue = ai.fp * params.VAL_FARM;
    const farmScore = calcScore(farmCost, farmValue, false, false);
    if (farmScore > 0) actions.push({ name: 'farm', score: farmScore, fn: doBuyFarm });

    // Plantation
    if (aiCnt("farm") >= 3) {
      const plantCost = aiPlantationCost();
      const plantValue = ai.pp * params.VAL_PLANTATION;
      const plantScore = calcScore(plantCost, plantValue, false, false);
      if (plantScore > 0) actions.push({ name: 'plantation', score: plantScore, fn: doBuyPlantation });
    }

    // Colony
    if (aiCnt("plantation") >= 3) {
      const colCost = aiColonyCost();
      const colValue = 1 * params.VAL_COLONY;
      const colScore = calcScore(colCost, colValue, false, false);
      if (colScore > 0) actions.push({ name: 'colony', score: colScore, fn: doBuyColony });
    }

    if (actions.length > 0) {
      actions.sort((a, b) => b.score - a.score);
      if (actions[0].fn()) continue;
    }

    ai.coins = ai.coins.add(1);
  }
}

// Head-to-head simulation with different params
function simDayWithParams(ai, clicks, enemyPower, params) {
  runAI_WithParams(ai, clicks, enemyPower, params);

  if (ai.troops.gte(1)) {
    const loot = ai.troops.mul(ai.ppt).mul(4);
    ai.coins = ai.coins.add(loot);
  }

  const farmProd = (ai.counts["farm"] || 0) * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  if (starving) {
    ai.starvationStreak++;
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    const deserters = ai.troops.mulFraction(Math.floor(desertPct), 100);
    ai.troops = ai.troops.sub(deserters);
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function compareMultipliers(mult1, mult2, days, clicks) {
  const params1 = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: mult1, VAL_BARRACKS: mult1 * mult1, VAL_MB: mult1 * mult1 * mult1, VAL_KINGDOM: mult1 * mult1 * mult1 * mult1
  };
  const params2 = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: mult2, VAL_BARRACKS: mult2 * mult2, VAL_MB: mult2 * mult2 * mult2, VAL_KINGDOM: mult2 * mult2 * mult2 * mult2
  };

  const ai1 = createAIState();
  const ai2 = createAIState();

  for (let day = 1; day <= days; day++) {
    const power1 = ai1.troops.toNumber() * ai1.ppt;
    const power2 = ai2.troops.toNumber() * ai2.ppt;

    simDayWithParams(ai1, clicks, power2, params1);
    simDayWithParams(ai2, clicks, power1, params2);
  }

  const finalPower1 = ai1.troops.toNumber() * ai1.ppt;
  const finalPower2 = ai2.troops.toNumber() * ai2.ppt;

  return {
    mult1, mult2,
    power1: finalPower1,
    power2: finalPower2,
    winner: finalPower2 > finalPower1 ? mult2 : finalPower1 > finalPower2 ? mult1 : 'TIE',
    ratio: finalPower2 / Math.max(finalPower1, 1),
    troops1: ai1.troops.toNumber(),
    troops2: ai2.troops.toNumber(),
    sl1: ai1.counts["squad_leader"] || 0,
    sl2: ai2.counts["squad_leader"] || 0,
    bar1: ai1.counts["barracks"] || 0,
    bar2: ai2.counts["barracks"] || 0
  };
}

function testMultiplierRatios() {
  const days = 200;
  const clicks = 20; // realistic human click rate

  console.log('=== Testing Army Multiplier Ratios ===');
  console.log(`${days} days, ${clicks} cps\n`);

  // Test 3x vs various others
  const testPairs = [
    [3, 5],
    [3, 10],
    [3, 20],
    [3, 30],
    [3, 50],
    [3, 100],
  ];

  console.log('3x vs others:');
  for (const [m1, m2] of testPairs) {
    const r = compareMultipliers(m1, m2, days, clicks);
    console.log(`  ${m1}x vs ${m2}x: winner=${r.winner}x, ratio=${r.ratio.toFixed(2)}, troops: ${r.troops1} vs ${r.troops2}, SL: ${r.sl1} vs ${r.sl2}, Bar: ${r.bar1} vs ${r.bar2}`);
  }

  console.log('\nFinding optimal range:');
  // Find the best multiplier by testing a range
  const baseline = 3;
  for (const test of [10, 15, 20, 25, 30, 40, 50]) {
    const r = compareMultipliers(baseline, test, days, clicks);
    console.log(`  ${baseline}x vs ${test}x: ${r.winner}x wins (${r.ratio.toFixed(2)}x power)`);
  }

  // Test winners against each other
  console.log('\nHead-to-head between winners:');
  const winners = [10, 20, 30, 50];
  for (let i = 0; i < winners.length; i++) {
    for (let j = i + 1; j < winners.length; j++) {
      const r = compareMultipliers(winners[i], winners[j], days, clicks);
      console.log(`  ${winners[i]}x vs ${winners[j]}x: ${r.winner}x wins (${r.ratio.toFixed(2)}x)`);
    }
  }
}

// testMultiplierRatios();

function findOptimalMultiplier() {
  const days = 200;
  const clicks = 20;

  console.log('=== Finding Optimal Army Multiplier ===');
  console.log(`${days} days, ${clicks} cps\n`);

  // First, confirm 10x is in the right ballpark
  console.log('Testing range 5-15:');
  for (const m of [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const r = compareMultipliers(3, m, days, clicks);
    console.log(`  3x vs ${m}x: ${m}x ${r.winner === m ? 'wins' : 'loses'} (${r.ratio.toFixed(2)}x), troops: ${r.troops2}, SL: ${r.sl2}, Bar: ${r.bar2}`);
  }

  // Round-robin tournament in promising range
  console.log('\n=== Round Robin Tournament (8x to 15x) ===');
  const candidates = [8, 9, 10, 11, 12, 13, 14, 15];
  const wins = {};
  candidates.forEach(c => wins[c] = 0);

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const r = compareMultipliers(candidates[i], candidates[j], days, clicks);
      if (r.winner === candidates[i]) wins[candidates[i]]++;
      else if (r.winner === candidates[j]) wins[candidates[j]]++;
    }
  }

  console.log('Win counts:');
  Object.entries(wins).sort((a, b) => b[1] - a[1]).forEach(([m, w]) => {
    console.log(`  ${m}x: ${w} wins`);
  });

  // Test at different click rates
  console.log('\n=== Best multipliers at different click rates ===');
  for (const cps of [5, 10, 15, 20, 25]) {
    let bestMult = 3;
    let bestRatio = 1;
    for (const m of [5, 8, 10, 12, 15, 20]) {
      const r = compareMultipliers(3, m, 200, cps);
      if (r.ratio > bestRatio) {
        bestRatio = r.ratio;
        bestMult = m;
      }
    }
    console.log(`  ${cps} cps: best=${bestMult}x (${bestRatio.toFixed(2)}x vs 3x)`);
  }
}

// findOptimalMultiplier();

function deepAnalysis() {
  const days = 200;

  console.log('=== Deep Analysis: 9x vs others across click rates ===\n');

  // Test 9x against key competitors at multiple click rates
  const competitors = [3, 5, 10, 12, 15, 20];

  for (const cps of [5, 10, 15, 20, 25]) {
    console.log(`\n${cps} cps:`);
    for (const m of competitors) {
      if (m === 9) continue;
      const r = compareMultipliers(9, m, days, cps);
      const winnerStr = r.winner === 9 ? '9x WINS' : `${m}x wins`;
      console.log(`  9x vs ${m}x: ${winnerStr} (ratio: ${r.ratio.toFixed(2)}) | 9x troops: ${r.troops1} SL: ${r.sl1} | ${m}x troops: ${r.troops2} SL: ${r.sl2}`);
    }
  }

  // What about a really long game?
  console.log('\n=== Long game (500 days) at 20 cps ===');
  for (const m of [3, 9, 10, 15, 20, 30]) {
    const r = compareMultipliers(9, m, 500, 20);
    const winnerStr = r.winner === 9 ? '9x WINS' : `${m}x wins`;
    console.log(`  9x vs ${m}x: ${winnerStr} (ratio: ${r.ratio.toFixed(2)}) | troops: ${r.troops1} vs ${r.troops2}`);
  }

  // Final recommendation test
  console.log('\n=== Final Recommendation: 9x vs 10x at various conditions ===');
  for (const days of [100, 200, 300]) {
    for (const cps of [10, 20]) {
      const r = compareMultipliers(9, 10, days, cps);
      console.log(`  ${days}d ${cps}cps: ${r.winner}x wins (${r.ratio.toFixed(2)})`);
    }
  }
}

// === AI WITH LOOKAHEAD FORMULA ===
function runAI_WithLookahead(ai, clicks, enemyPower, params, useLookahead) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if (boostVar) ai[boostVar] += ai[power];
    if (id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }
  function doBuyFarm() {
    const cost = aiFarmCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["farm"] = (ai.counts["farm"] || 0) + ai.fp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    return true;
  }
  function doBuyPlantation() {
    const cost = aiPlantationCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["plantation"] = (ai.counts["plantation"] || 0) + ai.pp;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.fp = 1 + aiCnt("plantation");
    return true;
  }
  function doBuyColony() {
    const cost = aiColonyCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts["colony"] = (ai.counts["colony"] || 0) + 1;
    ai._economyClicks = (ai._economyClicks || 0) + 1;
    ai.pp = 1 + aiCnt("colony");
    return true;
  }
  function doRecruit() {
    const cost = aiRecruitCost();
    if (ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.troops = ai.troops.add(ai.rp);
    ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
    return true;
  }
  function doTrain() {
    const cost = aiTrainCost();
    if (ai.coins.lt(cost) || ai.troops.lt(5)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.ppt *= ai.trainMult;
    ai.counts["train"] = (ai.counts["train"] || 0) + 1;
    ai._trainClicks++;
    return true;
  }

  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const closeness = Math.min(myPower, enemyPower) / Math.max(myPower, enemyPower, 1);
  const farmProd = aiCnt("farm") * C.farm_production;
  const maxSustainable = farmProd / C.food_perTroopDay;
  let strain = maxSustainable > 0 ? troopCount / maxSustainable : 1;
  strain = Math.min(strain, 1);

  // Lookahead: effective coins = current + future income with decay
  // Income per tick ≈ (passive loot per day / clicks) + begging
  const incomePerTick = (troopCount * ppt * 4) / clicks + 1;
  const DECAY_WEIGHTS = [0.8, 0.6, 0.4, 0.2];
  const futureIncome = DECAY_WEIGHTS.reduce((sum, w) => sum + incomePerTick * w, 0);

  function getEffectiveCoins() {
    const currentCoins = ai.coins.toNumber();
    if (useLookahead) {
      return currentCoins + futureIncome;
    }
    return currentCoins;
  }

  // Pre-calculate income for wait penalty
  const incomePerDayCalc = (troopCount * ppt * 4) + clicks;

  function calcScore(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;

    // Use current coins (no lookahead), but no binary cutoff
    const currentCoins = ai.coins.toNumber();
    const costPct = cost / Math.max(currentCoins, 1);

    // Try different penalty functions (controlled by params.PENALTY_TYPE)
    let penalty;
    if (params.PENALTY_TYPE === 'linear') {
      penalty = costPct;
    } else if (params.PENALTY_TYPE === 'squared') {
      penalty = costPct * costPct;
    } else if (params.PENALTY_TYPE === 'pow75') {
      penalty = Math.pow(costPct, 0.75);
    } else if (params.PENALTY_TYPE === 'pow25') {
      penalty = Math.pow(costPct, 0.25);
    } else if (params.PENALTY_TYPE === 'wait_penalty') {
      // sqrt penalty + extra penalty for days to wait if unaffordable
      penalty = Math.sqrt(costPct);
      if (costPct > 1) {
        const coinsNeeded = cost - currentCoins;
        const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
        // Add penalty proportional to days waiting
        penalty += daysToWait * (params.WAIT_PENALTY_FACTOR || 0.5);
      }
    } else if (params.PENALTY_TYPE === 'wait_penalty_sqrt') {
      penalty = Math.sqrt(costPct);
      if (costPct > 1) {
        const coinsNeeded = cost - currentCoins;
        const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
        penalty += daysToWait * (params.WAIT_PENALTY_FACTOR || 0.5);
      }
    } else if (params.PENALTY_TYPE === 'wait_penalty_linear') {
      penalty = costPct;
      if (costPct > 1) {
        const coinsNeeded = cost - currentCoins;
        const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
        penalty += daysToWait * (params.WAIT_PENALTY_FACTOR || 0.5);
      }
    } else if (params.PENALTY_TYPE === 'wait_penalty_squared') {
      penalty = costPct * costPct;
      if (costPct > 1) {
        const coinsNeeded = cost - currentCoins;
        const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
        penalty += daysToWait * (params.WAIT_PENALTY_FACTOR || 0.5);
      }
    } else if (params.PENALTY_TYPE === 'decay') {
      // Multiplicative decay: score = (value / sqrt(costPct)) * (decay ^ daysToWait)
      penalty = Math.sqrt(costPct);
      // Apply decay multiplier at the end, not here - store daysToWait for later
      if (costPct > 1) {
        const coinsNeeded = cost - currentCoins;
        const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
        const decay = params.DECAY_RATE || 0.95;
        // Instead of adding to penalty, we'll multiply the final score
        // penalty stays as sqrt(costPct), we return early with decay applied
        let baseScore = value / penalty;
        baseScore *= Math.pow(decay, daysToWait);
        if (isImmediate) baseScore *= params.NO_INFLATE_BONUS;
        if (isArmy) baseScore *= (1 + closeness * params.K_CLOSENESS);
        else baseScore *= (1 + strain * params.K_STRAIN);
        return baseScore;
      }
    } else {
      penalty = Math.sqrt(costPct); // default sqrt
    }
    let baseScore = value / penalty;
    if (isImmediate) baseScore *= params.NO_INFLATE_BONUS;
    if (isArmy) baseScore *= (1 + closeness * params.K_CLOSENESS);
    else baseScore *= (1 + strain * params.K_STRAIN);
    return baseScore;
  }

  // Food emergency check
  const dailyConsume = troopCount * C.food_perTroopDay;
  const netConsume = dailyConsume - farmProd;
  const foodBuffer = ai.food.toNumber();
  const daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
  const incomePerDay = (troopCount * ppt * 4) + clicks;
  const fCost = aiFarmCost();
  const coins = ai.coins.toNumber();
  const daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;

  function recruitCausesSuperEmergency() {
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;

    // If farms already sustain the new troop count, no emergency
    if (currentFarmProd >= newConsume) return false;

    const deficit = newConsume - currentFarmProd;
    const fb = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? fb / deficit : 999;

    // Plenty of buffer, no emergency
    if (daysOfBuffer > 50) return false;

    // Can afford farm now, no emergency
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsHave = aiCnt("farm");
    const farmsToBuy = farmsNeeded - farmsHave;
    const costToBuyFarms = farmsToBuy * fCost;
    if (coins >= costToBuyFarms) return false;

    // FIXED: Check if we can afford farm BEFORE food runs out
    const coinsNeeded = costToBuyFarms - coins;
    const daysToAffordFarm = coinsNeeded / Math.max(incomePerDay, 1);

    // Emergency only if we CAN'T afford farm before starving
    return daysToAffordFarm > daysOfBuffer;
  }

  const maxIterations = clicks;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    const currentCoins = ai.coins.toNumber();
    const currentTroops = ai.troops.toNumber();

    if (currentTroops < 1) {
      const recruitCost = aiRecruitCost();
      if (ai.coins.lt(recruitCost)) {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    const currentDailyConsume = currentTroops * C.food_perTroopDay;
    const currentFarmProd = aiCnt("farm") * C.farm_production;
    const currentNetConsume = currentDailyConsume - currentFarmProd;
    const currentFoodBuffer = ai.food.toNumber();
    const currentDaysOfFood = currentNetConsume > 0 ? currentFoodBuffer / currentNetConsume : 999;
    const currentDaysToAfford = fCost > currentCoins ? (fCost - currentCoins) / Math.max(incomePerDay, 1) : 0;
    const currentEmergency = (currentDaysToAfford > currentDaysOfFood || currentDaysOfFood <= 0) && currentNetConsume > 0;

    if (currentEmergency) {
      if (ai.coins.gte(fCost)) {
        doBuyFarm();
        continue;
      } else {
        ai.coins = ai.coins.add(1);
        continue;
      }
    }

    const actions = [];

    // Train
    if (currentTroops >= 5) {
      const trainCost = aiTrainCost();
      const trainValue = currentTroops * ppt * 0.01;
      const trainScore = calcScore(trainCost, trainValue, true, true);
      if (trainScore > 0) actions.push({ name: 'train', score: trainScore, fn: doTrain });
    }

    // Recruit
    if (!recruitCausesSuperEmergency()) {
      const recruitCost = aiRecruitCost();
      const recruitValue = ai.rp * ppt;
      const newStrain = maxSustainable > 0 ? (currentTroops + ai.rp) / maxSustainable : 1;
      const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
      let recruitScore = calcScore(recruitCost, recruitValue, true, true);
      recruitScore -= strainPenalty;
      if (recruitScore > 0) actions.push({ name: 'recruit', score: recruitScore, fn: doRecruit });
    }

    // Squad Leader
    if (currentTroops >= 2) {
      const slCost = aiArmyCost(C.squadLeader_baseCost);
      const slValue = ai.squadLeaderPower * params.VAL_SL;
      const slScore = calcScore(slCost, slValue, true, false);
      if (slScore > 0) actions.push({ name: 'sl', score: slScore, fn: () => buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null) });
    }

    // Barracks
    if (aiCnt("squad_leader") >= 3) {
      const barCost = aiArmyCost(C.barracks_baseCost);
      const barValue = ai.barracksPower * params.VAL_BARRACKS;
      const barScore = calcScore(barCost, barValue, true, false);
      if (barScore > 0) actions.push({ name: 'barracks', score: barScore, fn: () => buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower") });
    }

    // Military Base
    if (aiCnt("barracks") >= 3) {
      const mbCost = aiArmyCost(C.militaryBase_baseCost);
      const mbValue = ai.militaryBasePower * params.VAL_MB;
      const mbScore = calcScore(mbCost, mbValue, true, false);
      if (mbScore > 0) actions.push({ name: 'mb', score: mbScore, fn: () => buyArmy("military_base", C.militaryBase_baseCost, "militaryBasePower", "barracksPower") });
    }

    // Kingdom
    if (aiCnt("military_base") >= 3) {
      const kingCost = aiArmyCost(C.kingdom_baseCost);
      const kingValue = ai.kingdomPower * params.VAL_KINGDOM;
      const kingScore = calcScore(kingCost, kingValue, true, false);
      if (kingScore > 0) actions.push({ name: 'kingdom', score: kingScore, fn: () => buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "militaryBasePower") });
    }

    // Farm
    const farmCost = aiFarmCost();
    const farmValue = ai.fp * params.VAL_FARM;
    const farmScore = calcScore(farmCost, farmValue, false, false);
    if (farmScore > 0) actions.push({ name: 'farm', score: farmScore, fn: doBuyFarm });

    // Plantation
    if (aiCnt("farm") >= 3) {
      const plantCost = aiPlantationCost();
      const plantValue = ai.pp * params.VAL_PLANTATION;
      const plantScore = calcScore(plantCost, plantValue, false, false);
      if (plantScore > 0) actions.push({ name: 'plantation', score: plantScore, fn: doBuyPlantation });
    }

    // Colony
    if (aiCnt("plantation") >= 3) {
      const colCost = aiColonyCost();
      const colValue = 1 * params.VAL_COLONY;
      const colScore = calcScore(colCost, colValue, false, false);
      if (colScore > 0) actions.push({ name: 'colony', score: colScore, fn: doBuyColony });
    }

    if (actions.length > 0) {
      actions.sort((a, b) => b.score - a.score);
      // Try best action - if it fails, beg (wait for it)
      if (actions[0].fn()) continue;
    }

    ai.coins = ai.coins.add(1);
  }
}

function simDayLookahead(ai, clicks, enemyPower, params, useLookahead) {
  runAI_WithLookahead(ai, clicks, enemyPower, params, useLookahead);

  if (ai.troops.gte(1)) {
    ai.coins = ai.coins.add(ai.troops.mul(ai.ppt).mul(4));
  }

  const farmProd = (ai.counts["farm"] || 0) * C.farm_production;
  const troopConsume = Math.floor(ai.troops.toNumber() * C.food_perTroopDay);
  ai.food = ai.food.add(farmProd);
  const starving = troopConsume > ai.food.toNumber();
  ai.food = ai.food.sub(troopConsume);
  if (ai.food.lt(0)) ai.food = ON(0);

  if (starving) {
    ai.starvationStreak++;
    const desertPct = Math.min(5 * Math.pow(2, ai.starvationStreak - 1), 100);
    ai.troops = ai.troops.sub(ai.troops.mulFraction(Math.floor(desertPct), 100));
    if (ai.troops.lt(0)) ai.troops = ON(0);
  } else {
    ai.starvationStreak = 0;
  }
}

function compareLookahead(mult1, lookahead1, mult2, lookahead2, days, clicks) {
  const params1 = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: mult1, VAL_BARRACKS: mult1 * mult1, VAL_MB: mult1 * mult1 * mult1, VAL_KINGDOM: mult1 * mult1 * mult1 * mult1
  };
  const params2 = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: mult2, VAL_BARRACKS: mult2 * mult2, VAL_MB: mult2 * mult2 * mult2, VAL_KINGDOM: mult2 * mult2 * mult2 * mult2
  };

  const ai1 = createAIState();
  const ai2 = createAIState();

  for (let day = 1; day <= days; day++) {
    const power1 = ai1.troops.toNumber() * ai1.ppt;
    const power2 = ai2.troops.toNumber() * ai2.ppt;

    simDayLookahead(ai1, clicks, power2, params1, lookahead1);
    simDayLookahead(ai2, clicks, power1, params2, lookahead2);
  }

  const finalPower1 = ai1.troops.toNumber() * ai1.ppt;
  const finalPower2 = ai2.troops.toNumber() * ai2.ppt;

  return {
    power1: finalPower1,
    power2: finalPower2,
    winner: finalPower2 > finalPower1 ? 2 : finalPower1 > finalPower2 ? 1 : 0,
    ratio: finalPower2 / Math.max(finalPower1, 1),
    troops1: ai1.troops.toNumber(),
    troops2: ai2.troops.toNumber(),
    sl1: ai1.counts["squad_leader"] || 0,
    sl2: ai2.counts["squad_leader"] || 0,
    bar1: ai1.counts["barracks"] || 0,
    bar2: ai2.counts["barracks"] || 0
  };
}

function testLookahead() {
  const days = 200;

  console.log('=== LOOKAHEAD TEST: 3x+lookahead vs 9x without ===\n');

  for (const cps of [10, 15, 20, 25]) {
    console.log(`${cps} cps:`);

    // 3x with lookahead vs 9x without
    const r1 = compareLookahead(3, true, 9, false, days, cps);
    const winner1 = r1.winner === 1 ? '3x+LA' : r1.winner === 2 ? '9x' : 'TIE';
    console.log(`  3x+lookahead vs 9x: ${winner1} wins (ratio: ${r1.ratio.toFixed(2)})`);
    console.log(`    3x+LA: troops=${r1.troops1}, SL=${r1.sl1}, Bar=${r1.bar1}`);
    console.log(`    9x:    troops=${r1.troops2}, SL=${r1.sl2}, Bar=${r1.bar2}`);

    // 3x with lookahead vs 10x without
    const r2 = compareLookahead(3, true, 10, false, days, cps);
    const winner2 = r2.winner === 1 ? '3x+LA' : r2.winner === 2 ? '10x' : 'TIE';
    console.log(`  3x+lookahead vs 10x: ${winner2} wins (ratio: ${r2.ratio.toFixed(2)})`);

    // 3x with lookahead vs 3x without (pure lookahead effect)
    const r3 = compareLookahead(3, true, 3, false, days, cps);
    const winner3 = r3.winner === 1 ? '3x+LA' : r3.winner === 2 ? '3x' : 'TIE';
    console.log(`  3x+lookahead vs 3x: ${winner3} wins (ratio: ${r3.ratio.toFixed(2)})`);
    console.log(`    3x+LA: troops=${r3.troops1}, SL=${r3.sl1}, Bar=${r3.bar1}`);
    console.log(`    3x:    troops=${r3.troops2}, SL=${r3.sl2}, Bar=${r3.bar2}`);
    console.log('');
  }

  // Best combo test
  console.log('=== BEST COMBO: 10x + lookahead ===\n');
  for (const cps of [15, 20]) {
    const r = compareLookahead(10, true, 10, false, days, cps);
    const winner = r.winner === 1 ? '10x+LA' : r.winner === 2 ? '10x' : 'TIE';
    console.log(`${cps} cps: 10x+lookahead vs 10x: ${winner} wins (${r.ratio.toFixed(2)}x)`);
    console.log(`  10x+LA: troops=${r.troops1}, SL=${r.sl1}, Bar=${r.bar1}`);
    console.log(`  10x:    troops=${r.troops2}, SL=${r.sl2}, Bar=${r.bar2}`);
  }
}

// testLookahead();

function testPenaltyFunctions() {
  const days = 200;
  const cps = 20;

  console.log('=== PENALTY FUNCTION COMPARISON ===');
  console.log('No binary cutoff, testing: sqrt vs linear vs squared\n');

  for (const penaltyType of ['sqrt', 'linear', 'squared']) {
    console.log(`--- ${penaltyType.toUpperCase()} penalty (10x multiplier) ---`);

    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: penaltyType
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayLookahead(ai, cps, 0, params, true);
    }

    console.log(`Day ${days}: troops=${ai.troops.toNumber()}, SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}`);
    console.log(`Recruits: ${ai.counts["recruit"]||0}, Farms: ${ai.counts["farm"]||0}`);
    console.log('');
  }

  // Also test with 3x multiplier
  console.log('=== WITH 3x MULTIPLIER ===\n');

  for (const penaltyType of ['sqrt', 'linear', 'squared']) {
    console.log(`--- ${penaltyType.toUpperCase()} penalty (3x multiplier) ---`);

    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 3, VAL_BARRACKS: 9, VAL_MB: 27, VAL_KINGDOM: 81,
      PENALTY_TYPE: penaltyType
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayLookahead(ai, cps, 0, params, true);
    }

    console.log(`Day ${days}: troops=${ai.troops.toNumber()}, SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}`);
    console.log(`Recruits: ${ai.counts["recruit"]||0}, Farms: ${ai.counts["farm"]||0}`);
    console.log('');
  }
}

// testPenaltyFunctions();

function testNewVsOldAI() {
  const days = 200;

  console.log('=== NEW AI (linear + no binary + lookahead) vs OLD AI (sqrt + binary) ===\n');

  for (const cps of [10, 15, 20, 25]) {
    console.log(`${cps} cps:`);

    // New AI: linear penalty, no binary cutoff, lookahead
    const paramsNew = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'linear'
    };

    // Old AI: sqrt penalty, binary cutoff (useLookahead=false uses original calcScore with binary)
    const paramsOld = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'sqrt'  // doesn't matter since binary cutoff will use original
    };

    const aiNew = createAIState();
    const aiOld = createAIState();

    for (let day = 1; day <= days; day++) {
      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

      // New AI with lookahead (linear, no binary)
      simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
      // Old AI without lookahead (uses runAI_WithParams which has binary cutoff)
      simDayWithParams(aiOld, cps, newPower, paramsOld);
    }

    const newPower = aiNew.troops.toNumber() * aiNew.ppt;
    const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
    const winner = newPower > oldPower ? 'NEW' : oldPower > newPower ? 'OLD' : 'TIE';
    const ratio = newPower / Math.max(oldPower, 1);

    console.log(`  Winner: ${winner} (${ratio.toFixed(2)}x power ratio)`);
    console.log(`  NEW: troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}`);
    console.log(`  OLD: troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}`);
    console.log('');
  }
}

// testNewVsOldAI();

function testPow75() {
  const days = 200;

  console.log('=== TESTING costPct^0.75 (between sqrt and linear) ===\n');

  for (const cps of [10, 15, 20, 25]) {
    console.log(`${cps} cps:`);

    // New AI: pow75 penalty, no binary cutoff, lookahead
    const paramsNew = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'pow75'
    };

    // Old AI: sqrt penalty, binary cutoff
    const paramsOld = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'sqrt'
    };

    const aiNew = createAIState();
    const aiOld = createAIState();

    for (let day = 1; day <= days; day++) {
      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

      simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
      simDayWithParams(aiOld, cps, newPower, paramsOld);
    }

    const newPower = aiNew.troops.toNumber() * aiNew.ppt;
    const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
    const winner = newPower > oldPower ? 'NEW' : oldPower > newPower ? 'OLD' : 'TIE';
    const ratio = newPower / Math.max(oldPower, 1);

    console.log(`  Winner: ${winner} (${ratio.toFixed(2)}x)`);
    console.log(`  NEW (pow75): troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}`);
    console.log(`  OLD (sqrt):  troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}`);
    console.log('');
  }

  // Quick comparison of penalty values
  console.log('=== PENALTY COMPARISON ===');
  console.log('costPct\t\tsqrt\t\tpow75\t\tlinear');
  for (const cp of [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]) {
    console.log(`${cp}\t\t${Math.sqrt(cp).toFixed(3)}\t\t${Math.pow(cp, 0.75).toFixed(3)}\t\t${cp.toFixed(3)}`);
  }
}

// testPow75();

function testPow25() {
  const days = 200;

  console.log('=== TESTING costPct^0.25 (compresses cheap things) ===\n');

  // Show penalty values first
  console.log('PENALTY COMPARISON:');
  console.log('costPct\t\tpow25\t\tsqrt\t\tpow75');
  for (const cp of [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0]) {
    console.log(`${cp}\t\t${Math.pow(cp, 0.25).toFixed(3)}\t\t${Math.sqrt(cp).toFixed(3)}\t\t${Math.pow(cp, 0.75).toFixed(3)}`);
  }
  console.log('');

  for (const cps of [10, 15, 20, 25]) {
    console.log(`${cps} cps:`);

    const paramsNew = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'pow25'
    };

    const paramsOld = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'sqrt'
    };

    const aiNew = createAIState();
    const aiOld = createAIState();

    for (let day = 1; day <= days; day++) {
      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

      simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
      simDayWithParams(aiOld, cps, newPower, paramsOld);
    }

    const newPower = aiNew.troops.toNumber() * aiNew.ppt;
    const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
    const winner = newPower > oldPower ? 'NEW' : oldPower > newPower ? 'OLD' : 'TIE';
    const ratio = newPower / Math.max(oldPower, 1);

    console.log(`  Winner: ${winner} (${ratio.toFixed(2)}x)`);
    console.log(`  NEW (pow25): troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}`);
    console.log(`  OLD (sqrt):  troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}`);
    console.log('');
  }
}

// testPow25();

function test3xNoBinary() {
  const days = 200;

  console.log('=== 3x MULTIPLIER + NO BINARY CUTOFF ===\n');

  // Test different penalty functions with 3x multiplier
  for (const penaltyType of ['sqrt', 'pow25', 'linear']) {
    console.log(`--- ${penaltyType} penalty ---`);

    for (const cps of [15, 20]) {
      const paramsNew = {
        K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
        VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
        VAL_SL: 3, VAL_BARRACKS: 9, VAL_MB: 27, VAL_KINGDOM: 81,
        PENALTY_TYPE: penaltyType
      };

      const paramsOld = {
        K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
        VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
        VAL_SL: 3, VAL_BARRACKS: 9, VAL_MB: 27, VAL_KINGDOM: 81,
        PENALTY_TYPE: 'sqrt'
      };

      const aiNew = createAIState();
      const aiOld = createAIState();

      for (let day = 1; day <= days; day++) {
        const newPower = aiNew.troops.toNumber() * aiNew.ppt;
        const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

        simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
        simDayWithParams(aiOld, cps, newPower, paramsOld);
      }

      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
      const winner = newPower > oldPower ? 'NEW' : oldPower > newPower ? 'OLD' : 'TIE';
      const ratio = newPower / Math.max(oldPower, 1);

      console.log(`  ${cps} cps: ${winner} wins (${ratio.toFixed(2)}x)`);
      console.log(`    NEW: troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}`);
      console.log(`    OLD: troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}`);
    }
    console.log('');
  }
}

// test3xNoBinary();

function debugNewAI() {
  const days = 50;
  const cps = 20;

  console.log('=== DEBUG: What is NEW AI doing? ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 3, VAL_BARRACKS: 9, VAL_MB: 27, VAL_KINGDOM: 81,
    PENALTY_TYPE: 'sqrt'
  };

  const ai = createAIState();
  let actionCounts = { beg: 0, recruit: 0, sl: 0, bar: 0, farm: 0, other: 0 };

  // Patch the AI to track actions
  for (let day = 1; day <= days; day++) {
    const startCoins = ai.coins.toNumber();
    const startTroops = ai.troops.toNumber();

    simDayLookahead(ai, cps, 0, params, true);

    // Count what happened by checking state changes
    const endCoins = ai.coins.toNumber();
    const recruitsDone = (ai.counts["recruit"] || 0);
    const slDone = (ai.counts["squad_leader"] || 0);

    if (day <= 10 || day % 10 === 0) {
      console.log(`Day ${day}: coins=${endCoins}, troops=${ai.troops.toNumber()}, recruits=${recruitsDone}, SL=${slDone}, farms=${ai.counts["farm"]||0}`);
    }
  }

  console.log('\nFinal state:');
  console.log('Counts:', ai.counts);
}

// debugNewAI();

function debugScores() {
  console.log('=== DEBUG: Score calculations ===\n');

  // Simulate day 7 scenario: 116 coins, 27 troops
  const coins = 116;
  const troops = 27;
  const ppt = 1;
  const clicks = 20;

  const incomePerTick = (troops * ppt * 4) / clicks + 1;
  const futureIncome = incomePerTick * 2;
  const effectiveCoins = coins + futureIncome;

  console.log(`Scenario: ${coins} coins, ${troops} troops`);
  console.log(`incomePerTick: ${incomePerTick.toFixed(1)}, futureIncome: ${futureIncome.toFixed(1)}, effectiveCoins: ${effectiveCoins.toFixed(1)}`);
  console.log('');

  // Calculate recruit cost (after 27 recruits)
  const recruitCost = Math.floor(10 * Math.pow(1.02, 27));
  const slCost = 500;
  const barCost = 2500;

  function calcScore(cost, value, name) {
    const costPct = cost / effectiveCoins;
    const penalty = Math.sqrt(costPct);
    const score = value / penalty;
    console.log(`${name}: cost=${cost}, costPct=${costPct.toFixed(2)}, penalty=${penalty.toFixed(3)}, score=${score.toFixed(2)}`);
    return score;
  }

  calcScore(recruitCost, 1, 'Recruit');
  calcScore(slCost, 3, 'SL');
  calcScore(barCost, 9, 'Barracks');

  console.log('\n--- With NO_INFLATE_BONUS 1.2 on recruit ---');
  const recruitScore = calcScore(recruitCost, 1, 'Recruit') * 1.2;
  console.log(`Recruit adjusted: ${recruitScore.toFixed(2)}`);
}

// debugScores();

function traceDay7() {
  console.log('=== TRACING DAY 7 ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 3, VAL_BARRACKS: 9, VAL_MB: 27, VAL_KINGDOM: 81,
    PENALTY_TYPE: 'sqrt'
  };

  const ai = createAIState();

  // Run to day 6
  for (let day = 1; day <= 6; day++) {
    simDayLookahead(ai, 20, 0, params, true);
  }

  console.log('After day 6:', {
    coins: ai.coins.toNumber(),
    troops: ai.troops.toNumber(),
    food: ai.food.toNumber(),
    recruits: ai.counts["recruit"] || 0
  });

  // Now trace day 7 tick by tick
  console.log('\n--- Day 7 ticks ---');

  // Manually run a few ticks with debug output
  const clicks = 20;
  const C = { recruitCost: 10, squadLeader_baseCost: 500 };

  for (let tick = 0; tick < 5; tick++) {
    const currentCoins = ai.coins.toNumber();
    const currentTroops = ai.troops.toNumber();
    const recruitCount = ai.counts["recruit"] || 0;
    const recruitCost = Math.floor(10 * Math.pow(1.02, recruitCount));

    const incomePerTick = (currentTroops * 1 * 4) / clicks + 1;
    const futureIncome = incomePerTick * 2;
    const effectiveCoins = currentCoins + futureIncome;

    const recruitCostPct = recruitCost / effectiveCoins;
    const recruitPenalty = Math.sqrt(recruitCostPct);
    const recruitScore = (1 * 1 * 1.2) / recruitPenalty;

    console.log(`Tick ${tick}: coins=${currentCoins}, effective=${effectiveCoins.toFixed(1)}, recruitCost=${recruitCost}, recruitScore=${recruitScore.toFixed(2)}`);
    console.log(`  Can afford recruit? ${currentCoins >= recruitCost}`);

    // Try to recruit manually
    if (currentCoins >= recruitCost) {
      ai.coins = ai.coins.sub(recruitCost);
      ai.troops = ai.troops.add(1);
      ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
      console.log(`  -> Recruited! troops=${ai.troops.toNumber()}`);
    } else {
      ai.coins = ai.coins.add(1);
      console.log(`  -> Begged, coins now ${ai.coins.toNumber()}`);
    }
  }
}

// traceDay7();

function debugSuperEmergency() {
  console.log('=== DEBUG: Super Emergency Logic ===\n');

  const C = { food_perTroopDay: 1, farm_production: 100 };

  function checkSuperEmergency(troops, rp, farms, food, coins, farmCost) {
    const newTroops = troops + rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = farms * C.farm_production;

    console.log(`\nScenario: ${troops} troops, rp=${rp}, ${farms} farms, ${food} food, ${coins} coins`);
    console.log(`  newTroops=${newTroops}, newConsume=${newConsume}, farmProd=${currentFarmProd}`);

    if (currentFarmProd >= newConsume) {
      console.log(`  -> FALSE: farms can sustain (${currentFarmProd} >= ${newConsume})`);
      return false;
    }

    const deficit = newConsume - currentFarmProd;
    const daysOfBuffer = deficit > 0 ? food / deficit : 999;
    console.log(`  deficit=${deficit}, daysOfBuffer=${daysOfBuffer.toFixed(1)}`);

    if (daysOfBuffer > 50) {
      console.log(`  -> FALSE: plenty of buffer (${daysOfBuffer.toFixed(1)} > 50)`);
      return false;
    }

    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsToBuy = farmsNeeded - farms;
    const costToBuyFarms = farmsToBuy * farmCost;
    console.log(`  farmsNeeded=${farmsNeeded}, farmsToBuy=${farmsToBuy}, costToBuyFarms=${costToBuyFarms}`);

    if (coins >= costToBuyFarms) {
      console.log(`  -> FALSE: can afford farms (${coins} >= ${costToBuyFarms})`);
      return false;
    }

    const result = daysOfBuffer < 20;
    console.log(`  daysOfBuffer < 20? ${daysOfBuffer.toFixed(1)} < 20 = ${result}`);
    console.log(`  -> ${result ? 'TRUE: SUPER EMERGENCY!' : 'FALSE: not emergency'}`);
    return result;
  }

  // Test various scenarios
  checkSuperEmergency(21, 1, 0, 400, 50, 1000);   // Day 6ish
  checkSuperEmergency(27, 1, 0, 300, 100, 1000);  // Day 8ish
  checkSuperEmergency(27, 1, 0, 300, 1100, 1000); // Day 8 with enough coins for farm
  checkSuperEmergency(27, 1, 1, 300, 100, 1000);  // Day 8 with 1 farm
  checkSuperEmergency(50, 1, 0, 200, 100, 1000);  // More troops, less food

  console.log('\n=== The Problem ===');
  console.log('At 27 troops with 0 farms and ~300 food (~11 days buffer),');
  console.log('the AI blocks recruitment because:');
  console.log('  1. It needs 1 farm to sustain 28 troops');
  console.log('  2. It cant afford the farm (100 < 1000)');
  console.log('  3. Buffer < 20 days triggers emergency');
  console.log('');
  console.log('This is too conservative - AI should recruit AND save for farm.');
}

// debugSuperEmergency();

function fullComparison() {
  const days = 200;
  const cps = 20;

  console.log('=== FULL COMPARISON: 3x vs 10x, sqrt vs linear vs squared ===');
  console.log(`${days} days, ${cps} cps, NO binary cutoff, WITH lookahead`);
  console.log('');

  const results = [];

  for (const mult of [3, 10]) {
    for (const penaltyType of ['sqrt', 'linear', 'squared']) {
      const params = {
        K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
        VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
        VAL_SL: mult,
        VAL_BARRACKS: mult * mult,
        VAL_MB: mult * mult * mult,
        VAL_KINGDOM: mult * mult * mult * mult,
        PENALTY_TYPE: penaltyType
      };

      const ai = createAIState();
      for (let day = 1; day <= days; day++) {
        simDayLookahead(ai, cps, 0, params, true);
      }

      results.push({
        mult,
        penalty: penaltyType,
        troops: ai.troops.toNumber(),
        power: ai.troops.toNumber() * ai.ppt,
        recruits: ai.counts["recruit"] || 0,
        sl: ai.counts["squad_leader"] || 0,
        bar: ai.counts["barracks"] || 0,
        mb: ai.counts["military_base"] || 0,
        king: ai.counts["kingdom"] || 0,
        farms: ai.counts["farm"] || 0,
        train: ai.counts["train"] || 0
      });
    }
  }

  // Print table
  console.log('Mult\tPenalty\t\tTroops\tPower\tRecruits\tSL\tBar\tMB\tKing\tFarms\tTrain');
  console.log('─'.repeat(100));
  for (const r of results) {
    console.log(`${r.mult}x\t${r.penalty}\t\t${r.troops}\t${Math.floor(r.power)}\t${r.recruits}\t\t${r.sl}\t${r.bar}\t${r.mb}\t${r.king}\t${r.farms}\t${r.train}`);
  }
}

// fullComparison();

function fullComparisonWithOld() {
  const days = 200;
  const cps = 20;

  console.log('=== FULL COMPARISON: New (no binary) vs Old (binary) ===');
  console.log(`${days} days, ${cps} cps`);
  console.log('');

  const results = [];

  // New AI variants (no binary cutoff, with lookahead)
  for (const mult of [3, 10]) {
    for (const penaltyType of ['sqrt', 'linear', 'squared', 'wait_penalty']) {
      const params = {
        K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
        VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
        VAL_SL: mult,
        VAL_BARRACKS: mult * mult,
        VAL_MB: mult * mult * mult,
        VAL_KINGDOM: mult * mult * mult * mult,
        PENALTY_TYPE: penaltyType,
        WAIT_PENALTY_FACTOR: 0.5
      };

      const ai = createAIState();
      for (let day = 1; day <= days; day++) {
        simDayLookahead(ai, cps, 0, params, true);
      }

      results.push({
        type: 'NEW',
        mult,
        penalty: penaltyType,
        troops: ai.troops.toNumber(),
        power: Math.floor(ai.troops.toNumber() * ai.ppt),
        recruits: ai.counts["recruit"] || 0,
        sl: ai.counts["squad_leader"] || 0,
        bar: ai.counts["barracks"] || 0,
        mb: ai.counts["military_base"] || 0,
        king: ai.counts["kingdom"] || 0,
        farms: ai.counts["farm"] || 0,
        train: ai.counts["train"] || 0
      });
    }
  }

  // Old AI (binary cutoff, sqrt penalty)
  for (const mult of [3, 10]) {
    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: mult,
      VAL_BARRACKS: mult * mult,
      VAL_MB: mult * mult * mult,
      VAL_KINGDOM: mult * mult * mult * mult,
      PENALTY_TYPE: 'sqrt'
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayWithParams(ai, cps, 0, params);  // Uses binary cutoff
    }

    results.push({
      type: 'OLD',
      mult,
      penalty: 'sqrt+binary',
      troops: ai.troops.toNumber(),
      power: Math.floor(ai.troops.toNumber() * ai.ppt),
      recruits: ai.counts["recruit"] || 0,
      sl: ai.counts["squad_leader"] || 0,
      bar: ai.counts["barracks"] || 0,
      mb: ai.counts["military_base"] || 0,
      king: ai.counts["kingdom"] || 0,
      farms: ai.counts["farm"] || 0,
      train: ai.counts["train"] || 0
    });
  }

  // Print table
  console.log('Type\tMult\tPenalty\t\tTroops\tPower\t\tRecruits  SL\tBar\tMB\tKing\tFarms\tTrain');
  console.log('─'.repeat(110));
  for (const r of results) {
    const penaltyStr = r.penalty.padEnd(12);
    console.log(`${r.type}\t${r.mult}x\t${penaltyStr}\t${r.troops}\t${r.power}\t\t${r.recruits}\t  ${r.sl}\t${r.bar}\t${r.mb}\t${r.king}\t${r.farms}\t${r.train}`);
  }
}

// fullComparisonWithOld();

function testWaitPenalty() {
  const days = 200;

  console.log('=== WAIT_PENALTY vs OLD BINARY at various CPS ===');
  console.log(`${days} days, 10x multiplier`);
  console.log('');

  for (const cps of [10, 15, 20, 25, 30]) {
    // New AI with wait_penalty
    const paramsNew = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'wait_penalty',
      WAIT_PENALTY_FACTOR: 0.5
    };

    // Old AI with binary cutoff
    const paramsOld = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'sqrt'
    };

    const aiNew = createAIState();
    const aiOld = createAIState();

    for (let day = 1; day <= days; day++) {
      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

      simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
      simDayWithParams(aiOld, cps, newPower, paramsOld);
    }

    const newPower = aiNew.troops.toNumber() * aiNew.ppt;
    const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
    const winner = newPower > oldPower ? 'WAIT' : oldPower > newPower ? 'OLD' : 'TIE';
    const ratio = newPower / Math.max(oldPower, 1);

    console.log(`${cps} cps: ${winner} wins (${ratio.toFixed(2)}x)`);
    console.log(`  WAIT: power=${Math.floor(newPower)}, troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}, trains=${aiNew.counts["train"]||0}`);
    console.log(`  OLD:  power=${Math.floor(oldPower)}, troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}, trains=${aiOld.counts["train"]||0}`);
    console.log('');
  }
}

// testWaitPenalty();

function testWaitPenaltyFactors() {
  const days = 200;
  const cps = 20;

  console.log('=== TUNING WAIT_PENALTY_FACTOR ===');
  console.log(`${days} days, ${cps} cps, 10x multiplier`);
  console.log('');

  const results = [];

  for (const factor of [0.1, 0.25, 0.5, 1.0, 2.0, 5.0]) {
    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'wait_penalty',
      WAIT_PENALTY_FACTOR: factor
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayLookahead(ai, cps, 0, params, true);
    }

    const power = ai.troops.toNumber() * ai.ppt;
    results.push({ factor, power, ai });
  }

  // Also run OLD for comparison
  const paramsOld = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'sqrt'
  };
  const aiOld = createAIState();
  for (let day = 1; day <= days; day++) {
    simDayWithParams(aiOld, cps, 0, paramsOld);
  }
  const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

  console.log('Factor\tPower\t\tvs OLD\tTroops\tSL\tBar\tMB\tKing\tTrains');
  console.log('─'.repeat(80));

  for (const r of results) {
    const ratio = (r.power / oldPower).toFixed(2);
    console.log(`${r.factor}\t${Math.floor(r.power)}\t\t${ratio}x\t${r.ai.troops.toNumber()}\t${r.ai.counts["squad_leader"]||0}\t${r.ai.counts["barracks"]||0}\t${r.ai.counts["military_base"]||0}\t${r.ai.counts["kingdom"]||0}\t${r.ai.counts["train"]||0}`);
  }

  console.log('─'.repeat(80));
  console.log(`OLD\t${Math.floor(oldPower)}\t\t1.00x\t${aiOld.troops.toNumber()}\t${aiOld.counts["squad_leader"]||0}\t${aiOld.counts["barracks"]||0}\t${aiOld.counts["military_base"]||0}\t${aiOld.counts["kingdom"]||0}\t${aiOld.counts["train"]||0}`);
}

// testWaitPenaltyFactors();

function testFactor1AcrossCPS() {
  const days = 200;

  console.log('=== WAIT_PENALTY (factor=0.5) vs OLD across CPS ===');
  console.log(`${days} days, 10x multiplier`);
  console.log('');

  for (const cps of [10, 15, 20, 25, 30]) {
    // New AI with wait_penalty factor=1.0
    const paramsNew = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'wait_penalty',
      WAIT_PENALTY_FACTOR: 0.5
    };

    // Old AI with binary cutoff
    const paramsOld = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: 'sqrt'
    };

    const aiNew = createAIState();
    const aiOld = createAIState();

    for (let day = 1; day <= days; day++) {
      const newPower = aiNew.troops.toNumber() * aiNew.ppt;
      const oldPower = aiOld.troops.toNumber() * aiOld.ppt;

      simDayLookahead(aiNew, cps, oldPower, paramsNew, true);
      simDayWithParams(aiOld, cps, newPower, paramsOld);
    }

    const newPower = aiNew.troops.toNumber() * aiNew.ppt;
    const oldPower = aiOld.troops.toNumber() * aiOld.ppt;
    const winner = newPower > oldPower ? 'NEW' : oldPower > newPower ? 'OLD' : 'TIE';
    const ratio = newPower / Math.max(oldPower, 1);

    console.log(`${cps} cps: ${winner} wins (${ratio.toFixed(2)}x)`);
    console.log(`  NEW: power=${Math.floor(newPower)}, troops=${aiNew.troops.toNumber()}, SL=${aiNew.counts["squad_leader"]||0}, Bar=${aiNew.counts["barracks"]||0}, MB=${aiNew.counts["military_base"]||0}, King=${aiNew.counts["kingdom"]||0}`);
    console.log(`  OLD: power=${Math.floor(oldPower)}, troops=${aiOld.troops.toNumber()}, SL=${aiOld.counts["squad_leader"]||0}, Bar=${aiOld.counts["barracks"]||0}, MB=${aiOld.counts["military_base"]||0}, King=${aiOld.counts["kingdom"]||0}`);
    console.log('');
  }
}

// testFactor1AcrossCPS();

function testAllCombinations() {
  const days = 200;
  const cps = 20;

  console.log('=== ALL COMBINATIONS: sqrt/linear/squared x 3x/10x multiplier ===');
  console.log(`${days} days, ${cps} cps, wait_penalty (factor=0.5)`);
  console.log('');

  const results = [];

  // Test all 6 combinations
  for (const mult of [3, 10]) {
    for (const baseType of ['sqrt', 'linear', 'squared']) {
      const params = {
        K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
        VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
        VAL_SL: mult,
        VAL_BARRACKS: mult * mult,
        VAL_MB: mult * mult * mult,
        VAL_KINGDOM: mult * mult * mult * mult,
        PENALTY_TYPE: 'wait_penalty_' + baseType,
        WAIT_PENALTY_FACTOR: 0.5
      };

      const ai = createAIState();
      for (let day = 1; day <= days; day++) {
        simDayLookahead(ai, cps, 0, params, true);
      }

      const power = ai.troops.toNumber() * ai.ppt;
      results.push({
        mult,
        base: baseType,
        power,
        troops: ai.troops.toNumber(),
        ppt: ai.ppt,
        sl: ai.counts["squad_leader"] || 0,
        bar: ai.counts["barracks"] || 0,
        mb: ai.counts["military_base"] || 0,
        king: ai.counts["kingdom"] || 0,
        farms: ai.counts["farm"] || 0,
        train: ai.counts["train"] || 0
      });
    }
  }

  // Also add OLD binary for comparison
  for (const mult of [3, 10]) {
    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: mult,
      VAL_BARRACKS: mult * mult,
      VAL_MB: mult * mult * mult,
      VAL_KINGDOM: mult * mult * mult * mult,
      PENALTY_TYPE: 'sqrt'
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayWithParams(ai, cps, 0, params);  // Uses binary cutoff
    }

    const power = ai.troops.toNumber() * ai.ppt;
    results.push({
      mult,
      base: 'OLD-binary',
      power,
      troops: ai.troops.toNumber(),
      ppt: ai.ppt,
      sl: ai.counts["squad_leader"] || 0,
      bar: ai.counts["barracks"] || 0,
      mb: ai.counts["military_base"] || 0,
      king: ai.counts["kingdom"] || 0,
      farms: ai.counts["farm"] || 0,
      train: ai.counts["train"] || 0
    });
  }

  // Sort by power descending
  results.sort((a, b) => b.power - a.power);

  console.log('Mult\tBase\t\tPower\t\tTroops\tPPT\tSL\tBar\tMB\tKing\tFarms\tTrain');
  console.log('─'.repeat(100));
  for (const r of results) {
    const baseStr = r.base.padEnd(10);
    console.log(`${r.mult}x\t${baseStr}\t${Math.floor(r.power)}\t\t${r.troops}\t${r.ppt}\t${r.sl}\t${r.bar}\t${r.mb}\t${r.king}\t${r.farms}\t${r.train}`);
  }
}

// testAllCombinations();

function debugWhyWaitWins() {
  const days = 200;
  const cps = 20;

  console.log('=== DEBUG: Why does wait_penalty win with fewer kingdoms? ===\n');

  // Run both AIs and track progression
  const paramsWait = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const paramsOld = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'sqrt'
  };

  const aiWait = createAIState();
  const aiOld = createAIState();

  console.log('Day\tWAIT power\tOLD power\tWAIT SL/Bar/MB\tOLD SL/Bar/MB\tWAIT trains\tOLD trains');
  console.log('─'.repeat(100));

  for (let day = 1; day <= days; day++) {
    simDayLookahead(aiWait, cps, 0, paramsWait, true);
    simDayWithParams(aiOld, cps, 0, paramsOld);

    if (day % 20 === 0 || day <= 10) {
      const waitPower = Math.floor(aiWait.troops.toNumber() * aiWait.ppt);
      const oldPower = Math.floor(aiOld.troops.toNumber() * aiOld.ppt);
      const waitChain = `${aiWait.counts["squad_leader"]||0}/${aiWait.counts["barracks"]||0}/${aiWait.counts["military_base"]||0}`;
      const oldChain = `${aiOld.counts["squad_leader"]||0}/${aiOld.counts["barracks"]||0}/${aiOld.counts["military_base"]||0}`;
      console.log(`${day}\t${waitPower}\t\t${oldPower}\t\t${waitChain}\t\t${oldChain}\t\t${aiWait.counts["train"]||0}\t\t${aiOld.counts["train"]||0}`);
    }
  }

  console.log('\n=== FINAL BREAKDOWN ===');
  console.log('\nWAIT_PENALTY:');
  console.log('  Troops:', aiWait.troops.toNumber());
  console.log('  PPT:', aiWait.ppt);
  console.log('  Power:', Math.floor(aiWait.troops.toNumber() * aiWait.ppt));
  console.log('  SL:', aiWait.counts["squad_leader"]||0);
  console.log('  Barracks:', aiWait.counts["barracks"]||0);
  console.log('  MB:', aiWait.counts["military_base"]||0);
  console.log('  Kingdom:', aiWait.counts["kingdom"]||0);
  console.log('  Trains:', aiWait.counts["train"]||0);
  console.log('  Recruits:', aiWait.counts["recruit"]||0);
  console.log('  Farms:', aiWait.counts["farm"]||0);

  console.log('\nOLD BINARY:');
  console.log('  Troops:', aiOld.troops.toNumber());
  console.log('  PPT:', aiOld.ppt);
  console.log('  Power:', Math.floor(aiOld.troops.toNumber() * aiOld.ppt));
  console.log('  SL:', aiOld.counts["squad_leader"]||0);
  console.log('  Barracks:', aiOld.counts["barracks"]||0);
  console.log('  MB:', aiOld.counts["military_base"]||0);
  console.log('  Kingdom:', aiOld.counts["kingdom"]||0);
  console.log('  Trains:', aiOld.counts["train"]||0);
  console.log('  Recruits:', aiOld.counts["recruit"]||0);
  console.log('  Farms:', aiOld.counts["farm"]||0);

  // Calculate where power comes from
  console.log('\n=== POWER SOURCE ANALYSIS ===');
  const waitTrainMult = Math.pow(1.01, aiWait.counts["train"]||0);
  const oldTrainMult = Math.pow(1.01, aiOld.counts["train"]||0);
  console.log('WAIT train multiplier (1.01^trains):', waitTrainMult.toFixed(2));
  console.log('OLD train multiplier (1.01^trains):', oldTrainMult.toFixed(2));
  console.log('');
  console.log('WAIT: troops * trainMult =', aiWait.troops.toNumber(), '*', waitTrainMult.toFixed(2), '=', Math.floor(aiWait.troops.toNumber() * waitTrainMult));
  console.log('OLD:  troops * trainMult =', aiOld.troops.toNumber(), '*', oldTrainMult.toFixed(2), '=', Math.floor(aiOld.troops.toNumber() * oldTrainMult));
}

// debugWhyWaitWins();

function debugScoreAtDay100() {
  const days = 100;
  const cps = 20;

  console.log('=== DEBUG: Score comparison at day 100 ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();
  for (let day = 1; day <= days; day++) {
    simDayLookahead(ai, cps, 0, params, true);
  }

  console.log('State at day 100:');
  console.log('  Coins:', ai.coins.toNumber());
  console.log('  Troops:', ai.troops.toNumber());
  console.log('  PPT:', ai.ppt.toFixed(2));
  console.log('  SL:', ai.counts["squad_leader"]||0, '(power:', ai.squadLeaderPower, ')');
  console.log('  Barracks:', ai.counts["barracks"]||0, '(power:', ai.barracksPower, ')');
  console.log('  MB:', ai.counts["military_base"]||0, '(power:', ai.militaryBasePower, ')');
  console.log('  Kingdom:', ai.counts["kingdom"]||0);
  console.log('  Trains:', ai.counts["train"]||0);
  console.log('');

  // Calculate scores for different actions
  const coins = ai.coins.toNumber();
  const troops = ai.troops.toNumber();
  const ppt = ai.ppt;
  const incomePerDay = (troops * ppt * 4) + cps;

  // Costs
  const C = {
    squadLeader_baseCost: 500,
    barracks_baseCost: 2500,
    militaryBase_baseCost: 10000,
    kingdom_baseCost: 50000,
    train_baseCost: 50
  };

  const slCost = Math.floor(C.squadLeader_baseCost * Math.pow(1.07, ai.counts["squad_leader"]||0));
  const barCost = Math.floor(C.barracks_baseCost * Math.pow(1.07, ai.counts["barracks"]||0));
  const mbCost = Math.floor(C.militaryBase_baseCost * Math.pow(1.07, ai.counts["military_base"]||0));
  const kingCost = Math.floor(C.kingdom_baseCost * Math.pow(1.07, ai.counts["kingdom"]||0));
  const trainCost = Math.floor(C.train_baseCost * Math.pow(1.05, ai.counts["train"]||0));

  function calcWaitScore(cost, value) {
    const costPct = cost / Math.max(coins, 1);
    let penalty = Math.sqrt(costPct);
    if (costPct > 1) {
      const daysToWait = (cost - coins) / Math.max(incomePerDay, 1);
      penalty += daysToWait * 0.5;
    }
    return value / penalty;
  }

  console.log('=== SCORE COMPARISON ===');
  console.log('Action\t\tCost\t\tValue\t\tCostPct\t\tScore');
  console.log('─'.repeat(70));

  const trainValue = troops * ppt * 0.01 * params.NO_INFLATE_BONUS;
  console.log(`Train\t\t${trainCost}\t\t${trainValue.toFixed(1)}\t\t${(trainCost/coins).toFixed(2)}\t\t${calcWaitScore(trainCost, trainValue).toFixed(1)}`);

  const slValue = ai.squadLeaderPower * params.VAL_SL;
  console.log(`SL\t\t${slCost}\t\t${slValue}\t\t${(slCost/coins).toFixed(2)}\t\t${calcWaitScore(slCost, slValue).toFixed(1)}`);

  const barValue = ai.barracksPower * params.VAL_BARRACKS;
  console.log(`Barracks\t${barCost}\t\t${barValue}\t\t${(barCost/coins).toFixed(2)}\t\t${calcWaitScore(barCost, barValue).toFixed(1)}`);

  const mbValue = ai.militaryBasePower * params.VAL_MB;
  console.log(`MB\t\t${mbCost}\t\t${mbValue}\t\t${(mbCost/coins).toFixed(2)}\t\t${calcWaitScore(mbCost, mbValue).toFixed(1)}`);

  const kingValue = ai.kingdomPower * params.VAL_KINGDOM;
  console.log(`Kingdom\t\t${kingCost}\t\t${kingValue}\t\t${(kingCost/coins).toFixed(2)}\t\t${calcWaitScore(kingCost, kingValue).toFixed(1)}`);

  console.log('\n=== WHY TRAIN WINS ===');
  console.log('Train value = troops * ppt * 0.01 * 1.2 =', troops, '*', ppt.toFixed(2), '* 0.01 * 1.2 =', trainValue.toFixed(1));
  console.log('Kingdom value = kingdomPower * 10000 = 1 * 10000 =', kingValue);
  console.log('');
  console.log('Train is cheap (costPct =', (trainCost/coins).toFixed(2), ') with value', trainValue.toFixed(1));
  console.log('Kingdom costs', kingCost, '- need to wait', ((kingCost-coins)/incomePerDay).toFixed(1), 'days');
  console.log('Kingdom wait penalty = 0.5 *', ((kingCost-coins)/incomePerDay).toFixed(1), '=', (0.5 * (kingCost-coins)/incomePerDay).toFixed(2));
}

// debugScoreAtDay100();

function traceAIDecisions() {
  const cps = 20;

  console.log('=== TRACING AI DECISIONS (days 95-105) ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();

  // Run to day 94
  for (let day = 1; day <= 94; day++) {
    simDayLookahead(ai, cps, 0, params, true);
  }

  console.log('State at end of day 94:');
  console.log('  Troops:', ai.troops.toNumber(), 'PPT:', ai.ppt.toFixed(2));
  console.log('  SL:', ai.counts["squad_leader"]||0, 'Bar:', ai.counts["barracks"]||0, 'MB:', ai.counts["military_base"]||0);
  console.log('  Trains:', ai.counts["train"]||0);
  console.log('');

  // Now trace days 95-105 in detail
  for (let day = 95; day <= 105; day++) {
    const startMB = ai.counts["military_base"] || 0;
    const startTrain = ai.counts["train"] || 0;
    const startKing = ai.counts["kingdom"] || 0;

    simDayLookahead(ai, cps, 0, params, true);

    const endMB = ai.counts["military_base"] || 0;
    const endTrain = ai.counts["train"] || 0;
    const endKing = ai.counts["kingdom"] || 0;

    if (endMB !== startMB || endKing !== startKing) {
      console.log(`Day ${day}: MB ${startMB}→${endMB}, Kingdom ${startKing}→${endKing}, Train ${startTrain}→${endTrain}`);
    } else if (day === 95 || day === 100 || day === 105) {
      console.log(`Day ${day}: MB=${endMB}, Kingdom=${endKing}, Train=${endTrain}, Power=${Math.floor(ai.troops.toNumber() * ai.ppt)}`);
    }
  }

  // Check when MB was bought
  console.log('\n=== When were MBs bought? ===');
  const ai2 = createAIState();
  for (let day = 1; day <= 200; day++) {
    const startMB = ai2.counts["military_base"] || 0;
    simDayLookahead(ai2, cps, 0, params, true);
    const endMB = ai2.counts["military_base"] || 0;
    if (endMB !== startMB) {
      console.log(`Day ${day}: MB ${startMB}→${endMB}`);
    }
  }
}

// traceAIDecisions();

function debugDay67() {
  const cps = 20;

  console.log('=== DEBUG: State at day 67 (right after buying 2nd MB) ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();

  // Run to day 67
  for (let day = 1; day <= 67; day++) {
    simDayLookahead(ai, cps, 0, params, true);
  }

  const coins = ai.coins.toNumber();
  const troops = ai.troops.toNumber();
  const ppt = ai.ppt;
  const incomePerDay = (troops * ppt * 4) + cps;

  console.log('State at day 67:');
  console.log('  Coins:', coins);
  console.log('  Troops:', troops, 'PPT:', ppt.toFixed(4));
  console.log('  Power:', Math.floor(troops * ppt));
  console.log('  Income/day:', incomePerDay.toFixed(0));
  console.log('  SL:', ai.counts["squad_leader"]||0, '(power:', ai.squadLeaderPower, ')');
  console.log('  Bar:', ai.counts["barracks"]||0, '(power:', ai.barracksPower, ')');
  console.log('  MB:', ai.counts["military_base"]||0, '(power:', ai.militaryBasePower, ')');
  console.log('  Trains:', ai.counts["train"]||0);
  console.log('');

  // Calculate costs
  const slCount = ai.counts["squad_leader"] || 0;
  const barCount = ai.counts["barracks"] || 0;
  const mbCount = ai.counts["military_base"] || 0;
  const trainCount = ai.counts["train"] || 0;

  const slCost = Math.floor(500 * Math.pow(1.07, slCount));
  const barCost = Math.floor(2500 * Math.pow(1.07, barCount));
  const mbCost = Math.floor(10000 * Math.pow(1.07, mbCount));
  const kingCost = 50000;  // 0 kingdoms yet
  const trainCost = Math.floor(50 * Math.pow(1.05, trainCount));

  function calcWaitScore(cost, value, name) {
    const costPct = cost / Math.max(coins, 1);
    let penalty = Math.sqrt(costPct);
    let waitDays = 0;
    if (costPct > 1) {
      waitDays = (cost - coins) / Math.max(incomePerDay, 1);
      penalty += waitDays * 0.5;
    }
    const score = value / penalty;
    console.log(`${name.padEnd(10)} cost=${cost.toString().padStart(8)} costPct=${costPct.toFixed(2).padStart(6)} wait=${waitDays.toFixed(1).padStart(5)}d penalty=${penalty.toFixed(3).padStart(7)} value=${value.toString().padStart(6)} score=${score.toFixed(1).padStart(10)}`);
    return score;
  }

  console.log('=== SCORE COMPARISON ===');
  const trainValue = troops * ppt * 0.01 * params.NO_INFLATE_BONUS;
  calcWaitScore(trainCost, trainValue, 'Train');

  const slValue = ai.squadLeaderPower * params.VAL_SL;
  calcWaitScore(slCost, slValue, 'SL');

  const barValue = ai.barracksPower * params.VAL_BARRACKS;
  calcWaitScore(barCost, barValue, 'Barracks');

  const mbValue = ai.militaryBasePower * params.VAL_MB;
  calcWaitScore(mbCost, mbValue, 'MB');

  // Kingdom not unlocked yet (need 3 MB)
  console.log('Kingdom    (LOCKED - need 3 MB, have 2)');

  console.log('\n=== ANALYSIS ===');
  console.log('The 3rd MB costs', mbCost, 'with value', mbValue);
  console.log('Train costs', trainCost, 'with value', trainValue.toFixed(1));
  console.log('');
  console.log('MB score depends on militaryBasePower which is', ai.militaryBasePower);
  console.log('Each MB gives +1 to barracksPower, not direct military power');
}

// debugDay67();

function traceTickByTick() {
  console.log('=== TRACE: Tick-by-tick at day 68 ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();

  // Run to day 67
  for (let day = 1; day <= 67; day++) {
    simDayLookahead(ai, 20, 0, params, true);
  }

  console.log('State after day 67 (start of day 68):');
  console.log('  Coins:', ai.coins.toNumber(), 'Troops:', ai.troops.toNumber(), 'PPT:', ai.ppt);
  console.log('  MB:', ai.counts["military_base"]||0, 'Trains:', ai.counts["train"]||0);
  console.log('');

  // Now manually run day 68 tick by tick with debug
  const cps = 20;
  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const incomePerDay = (troopCount * ppt * 4) + cps;

  console.log('=== Day 68 ticks ===');
  console.log('Income/day:', incomePerDay.toFixed(0));
  console.log('');

  for (let tick = 0; tick < 10; tick++) {
    const coins = ai.coins.toNumber();
    const trainCount = ai.counts["train"] || 0;
    const mbCount = ai.counts["military_base"] || 0;

    const trainCost = Math.floor(50 * Math.pow(1.05, trainCount));
    const mbCost = Math.floor(10000 * Math.pow(1.07, mbCount));

    const trainValue = troopCount * ppt * 0.01 * 1.2;
    const mbValue = ai.militaryBasePower * 1000;

    // Calculate scores like the AI would
    function calcS(cost, value) {
      const costPct = cost / Math.max(coins, 1);
      let penalty = Math.sqrt(costPct);
      if (costPct > 1) {
        const daysToWait = (cost - coins) / Math.max(incomePerDay, 1);
        penalty += daysToWait * 0.5;
      }
      return value / penalty;
    }

    const trainScore = calcS(trainCost, trainValue);
    const mbScore = calcS(mbCost, mbValue);

    console.log(`Tick ${tick}: coins=${coins}`);
    console.log(`  Train: cost=${trainCost}, value=${trainValue.toFixed(1)}, score=${trainScore.toFixed(1)}`);
    console.log(`  MB:    cost=${mbCost}, value=${mbValue}, score=${mbScore.toFixed(1)} ${mbScore > trainScore ? '(WINS)' : ''}`);

    // Simulate what AI does
    if (mbScore > trainScore) {
      if (coins >= mbCost) {
        console.log(`  -> Bought MB!`);
        ai.coins = ai.coins.sub(mbCost);
        ai.counts["military_base"] = mbCount + 1;
        ai.barracksPower++;
      } else {
        console.log(`  -> MB wins but unaffordable, begging`);
        ai.coins = ai.coins.add(1);
      }
    } else {
      if (coins >= trainCost) {
        console.log(`  -> Train wins, training`);
        ai.coins = ai.coins.sub(trainCost);
        ai.ppt *= 1.01;
        ai.counts["train"] = trainCount + 1;
      } else {
        console.log(`  -> Train wins but unaffordable, begging`);
        ai.coins = ai.coins.add(1);
      }
    }
  }
}

// traceTickByTick();

function traceRealAI() {
  console.log('=== What does REAL AI do days 68-80? ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();

  for (let day = 1; day <= 67; day++) {
    simDayLookahead(ai, 20, 0, params, true);
  }

  console.log('After day 67:');
  console.log('  Coins:', ai.coins.toNumber(), 'Food:', ai.food.toNumber());
  console.log('  Troops:', ai.troops.toNumber(), 'Farms:', ai.counts["farm"]||0);
  console.log('  MB:', ai.counts["military_base"]||0, 'Trains:', ai.counts["train"]||0);
  console.log('');

  for (let day = 68; day <= 80; day++) {
    const b4 = { coins: ai.coins.toNumber(), mb: ai.counts["military_base"]||0, train: ai.counts["train"]||0, farm: ai.counts["farm"]||0 };
    simDayLookahead(ai, 20, 0, params, true);
    const a = { coins: ai.coins.toNumber(), mb: ai.counts["military_base"]||0, train: ai.counts["train"]||0, farm: ai.counts["farm"]||0 };

    const changes = [];
    if (a.mb > b4.mb) changes.push(`MB+${a.mb - b4.mb}`);
    if (a.train > b4.train) changes.push(`Train+${a.train - b4.train}`);
    if (a.farm > b4.farm) changes.push(`Farm+${a.farm - b4.farm}`);

    console.log(`Day ${day}: coins ${b4.coins}→${a.coins}, ${changes.length ? changes.join(', ') : 'begging only'}`);
  }

  // MB costs
  console.log('\nMB cost after 2 MBs:', Math.floor(10000 * Math.pow(1.07, 2)));
}

// traceRealAI();

function compareFood() {
  console.log('=== FOOD COMPARISON: wait_penalty vs OLD ===\n');

  const paramsWait = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const paramsOld = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'sqrt'
  };

  const aiWait = createAIState();
  const aiOld = createAIState();

  console.log('Day\tWAIT food\tOLD food\tWAIT troops\tOLD troops\tWAIT farms\tOLD farms');
  console.log('─'.repeat(90));

  for (let day = 1; day <= 100; day++) {
    simDayLookahead(aiWait, 20, 0, paramsWait, true);
    simDayWithParams(aiOld, 20, 0, paramsOld);

    if (day % 10 === 0 || day <= 10) {
      console.log(`${day}\t${aiWait.food.toNumber()}\t\t${aiOld.food.toNumber()}\t\t${aiWait.troops.toNumber()}\t\t${aiOld.troops.toNumber()}\t\t${aiWait.counts["farm"]||0}\t\t${aiOld.counts["farm"]||0}`);
    }
  }

  console.log('\n=== FINAL STATE at day 100 ===');
  console.log('WAIT: Power=', Math.floor(aiWait.troops.toNumber() * aiWait.ppt), ', MB=', aiWait.counts["military_base"]||0, ', Trains=', aiWait.counts["train"]||0);
  console.log('OLD:  Power=', Math.floor(aiOld.troops.toNumber() * aiOld.ppt), ', MB=', aiOld.counts["military_base"]||0, ', Trains=', aiOld.counts["train"]||0);
}

// compareFood();

function compareRecruits() {
  console.log('=== RECRUIT COMPARISON ===\n');

  const paramsWait = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const paramsOld = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'sqrt'
  };

  const aiWait = createAIState();
  const aiOld = createAIState();

  for (let day = 1; day <= 200; day++) {
    simDayLookahead(aiWait, 20, 0, paramsWait, true);
    simDayWithParams(aiOld, 20, 0, paramsOld);
  }

  console.log('=== FINAL COMPARISON (day 200) ===\n');
  console.log('WAIT_PENALTY:');
  console.log('  Recruits:', aiWait.counts["recruit"]||0);
  console.log('  Troops:', aiWait.troops.toNumber());
  console.log('  Farms:', aiWait.counts["farm"]||0);
  console.log('  SL:', aiWait.counts["squad_leader"]||0);
  console.log('  Bar:', aiWait.counts["barracks"]||0);
  console.log('  MB:', aiWait.counts["military_base"]||0);
  console.log('  King:', aiWait.counts["kingdom"]||0);
  console.log('  Trains:', aiWait.counts["train"]||0);
  console.log('  Power:', Math.floor(aiWait.troops.toNumber() * aiWait.ppt));
  console.log('');
  console.log('OLD BINARY:');
  console.log('  Recruits:', aiOld.counts["recruit"]||0);
  console.log('  Troops:', aiOld.troops.toNumber());
  console.log('  Farms:', aiOld.counts["farm"]||0);
  console.log('  SL:', aiOld.counts["squad_leader"]||0);
  console.log('  Bar:', aiOld.counts["barracks"]||0);
  console.log('  MB:', aiOld.counts["military_base"]||0);
  console.log('  King:', aiOld.counts["kingdom"]||0);
  console.log('  Trains:', aiOld.counts["train"]||0);
  console.log('  Power:', Math.floor(aiOld.troops.toNumber() * aiOld.ppt));

  console.log('\n=== ANALYSIS ===');
  console.log('WAIT recruits:', aiWait.counts["recruit"]||0, 'vs OLD recruits:', aiOld.counts["recruit"]||0);
  console.log('Difference:', (aiWait.counts["recruit"]||0) - (aiOld.counts["recruit"]||0));
  console.log('');
  console.log('WAIT SLs:', aiWait.counts["squad_leader"]||0, 'vs OLD SLs:', aiOld.counts["squad_leader"]||0);
  console.log('OLD spends clicks on SLs instead of recruiting');
}

// compareRecruits();

function checkKingdoms() {
  console.log('=== WHEN DOES AI BUY KINGDOMS? ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'wait_penalty_sqrt',
    WAIT_PENALTY_FACTOR: 0.5
  };

  const ai = createAIState();

  // Track when kingdoms are bought
  let kingdomDays = [];

  for (let day = 1; day <= 500; day++) {
    const startKing = ai.counts["kingdom"] || 0;
    simDayLookahead(ai, 20, 0, params, true);
    const endKing = ai.counts["kingdom"] || 0;

    if (endKing > startKing) {
      kingdomDays.push({ day, count: endKing });
      console.log(`Day ${day}: Kingdom ${startKing} → ${endKing}`);
    }

    if (day === 200 || day === 300 || day === 400 || day === 500) {
      const power = Math.floor(ai.troops.toNumber() * ai.ppt);
      console.log(`\nDay ${day} snapshot:`);
      console.log(`  Power: ${power}`);
      console.log(`  Troops: ${ai.troops.toNumber()}, PPT: ${ai.ppt.toFixed(2)}`);
      console.log(`  SL: ${ai.counts["squad_leader"]||0}, Bar: ${ai.counts["barracks"]||0}, MB: ${ai.counts["military_base"]||0}, King: ${ai.counts["kingdom"]||0}`);
      console.log(`  Trains: ${ai.counts["train"]||0}`);
      console.log('');
    }
  }

  if (kingdomDays.length === 0) {
    console.log('\nAI never bought a kingdom in 500 days!');

    // Check why - what's the score comparison at day 200?
    const ai2 = createAIState();
    for (let day = 1; day <= 200; day++) {
      simDayLookahead(ai2, 20, 0, params, true);
    }

    const coins = ai2.coins.toNumber();
    const troops = ai2.troops.toNumber();
    const ppt = ai2.ppt;
    const incomePerDay = (troops * ppt * 4) + 20;
    const mbCount = ai2.counts["military_base"] || 0;

    console.log('\n=== WHY NO KINGDOMS? (Day 200 analysis) ===');
    console.log(`MB count: ${mbCount} (need 3 to unlock kingdom)`);

    if (mbCount < 3) {
      console.log('>>> Kingdom is LOCKED - need 3 MB, only have', mbCount);
    }
  }
}

// checkKingdoms();

function decayTournament() {
  const days = 300;
  const cps = 20;

  console.log('=== DECAY TOURNAMENT ===');
  console.log(`${days} days, ${cps} cps, 10x multiplier`);
  console.log('Testing: decay 0.95, 0.96, 0.97, 0.98, 0.99 vs current (additive 0.5)\n');

  const contestants = [
    { name: 'current (add 0.5)', type: 'wait_penalty_sqrt', factor: 0.5 },
    { name: 'decay 0.95', type: 'decay', decay: 0.95 },
    { name: 'decay 0.96', type: 'decay', decay: 0.96 },
    { name: 'decay 0.97', type: 'decay', decay: 0.97 },
    { name: 'decay 0.98', type: 'decay', decay: 0.98 },
    { name: 'decay 0.99', type: 'decay', decay: 0.99 },
  ];

  const results = [];

  for (const c of contestants) {
    const params = {
      K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
      VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
      VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
      PENALTY_TYPE: c.type,
      WAIT_PENALTY_FACTOR: c.factor || 0.5,
      DECAY_RATE: c.decay || 0.95
    };

    const ai = createAIState();
    for (let day = 1; day <= days; day++) {
      simDayLookahead(ai, cps, 0, params, true);
    }

    const power = ai.troops.toNumber() * ai.ppt;
    results.push({
      name: c.name,
      power,
      troops: ai.troops.toNumber(),
      ppt: ai.ppt,
      sl: ai.counts["squad_leader"] || 0,
      bar: ai.counts["barracks"] || 0,
      mb: ai.counts["military_base"] || 0,
      king: ai.counts["kingdom"] || 0,
      trains: ai.counts["train"] || 0
    });
  }

  // Sort by power
  results.sort((a, b) => b.power - a.power);

  console.log('Name\t\t\tPower\t\tTroops\tPPT\tSL\tBar\tMB\tKing\tTrains');
  console.log('─'.repeat(100));
  for (const r of results) {
    const name = r.name.padEnd(16);
    console.log(`${name}\t${Math.floor(r.power)}\t\t${r.troops}\t${r.ppt.toFixed(1)}\t${r.sl}\t${r.bar}\t${r.mb}\t${r.king}\t${r.trains}`);
  }

  // Now run head-to-head battles
  console.log('\n=== HEAD TO HEAD (day 300 power comparison) ===\n');

  const grid = [];
  for (let i = 0; i < contestants.length; i++) {
    grid[i] = [];
    for (let j = 0; j < contestants.length; j++) {
      if (i === j) {
        grid[i][j] = '-';
      } else {
        // Find results
        const ri = results.find(r => r.name === contestants[i].name);
        const rj = results.find(r => r.name === contestants[j].name);
        grid[i][j] = ri.power > rj.power ? 'W' : (ri.power < rj.power ? 'L' : 'T');
      }
    }
  }

  // Print grid header
  process.stdout.write('                  ');
  for (const c of contestants) {
    process.stdout.write(c.name.substring(0, 8).padEnd(10));
  }
  console.log();

  for (let i = 0; i < contestants.length; i++) {
    process.stdout.write(contestants[i].name.padEnd(18));
    for (let j = 0; j < contestants.length; j++) {
      process.stdout.write(grid[i][j].padEnd(10));
    }
    console.log();
  }
}

// decayTournament();

function debugDecay99() {
  const cps = 20;

  console.log('=== DEBUG: What does decay 0.99 do? ===\n');

  const params = {
    K_CLOSENESS: 0.5, K_STRAIN: 2.0, NO_INFLATE_BONUS: 1.2,
    VAL_FARM: 1, VAL_PLANTATION: 3, VAL_COLONY: 9,
    VAL_SL: 10, VAL_BARRACKS: 100, VAL_MB: 1000, VAL_KINGDOM: 10000,
    PENALTY_TYPE: 'decay',
    DECAY_RATE: 0.99
  };

  const ai = createAIState();

  for (let day = 1; day <= 100; day++) {
    simDayLookahead(ai, cps, 0, params, true);

    if (day <= 20 || day % 20 === 0) {
      console.log(`Day ${day}: troops=${ai.troops.toNumber()}, food=${ai.food.toNumber()}, coins=${ai.coins.toNumber()}`);
      console.log(`  SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}`);
      console.log(`  Farms=${ai.counts["farm"]||0}, Recruits=${ai.counts["recruit"]||0}, Trains=${ai.counts["train"]||0}`);
    }
  }
}

// debugDecay99();

// Test the new cost-pool-aware AI vs old AI
function testCostPoolAware() {
  console.log('=== Testing Cost-Pool-Aware AI vs Old AI ===\n');

  // Set params to use 10x multipliers like army-clicker.html
  PARAMS.K_CLOSENESS = 0.5;
  PARAMS.K_STRAIN = 2.0;
  PARAMS.NO_INFLATE_BONUS = 1.2;
  PARAMS.VAL_SL = 10;
  PARAMS.VAL_BARRACKS = 100;
  PARAMS.VAL_MB = 1000;
  PARAMS.VAL_KINGDOM = 10000;

  for (const cps of [4, 10, 25]) {
    console.log(`\n--- ${cps} clicks/sec ---`);
    const result = runBatch(5, 300, cps);
    console.log(`New wins: ${result.newWins}/10, avgRatio: ${result.avgRatio}x`);

    // Also show a sample run with detailed stats
    const oldAI = createAIState();
    const newAI = createAIState();

    for (let day = 1; day <= 300; day++) {
      simDay(oldAI, cps, newAI.troops.toNumber() * newAI.ppt, runAI_Old);
      simDay(newAI, cps, oldAI.troops.toNumber() * oldAI.ppt, runAI_New);
    }

    console.log('Old AI stats:');
    console.log(`  Power: ${Math.floor(oldAI.troops.toNumber() * oldAI.ppt)}`);
    console.log(`  Troops: ${oldAI.troops.toNumber()}, PPT: ${oldAI.ppt.toFixed(2)}`);
    console.log(`  SL=${oldAI.counts["squad_leader"]||0}, Bar=${oldAI.counts["barracks"]||0}, MB=${oldAI.counts["military_base"]||0}, King=${oldAI.counts["kingdom"]||0}`);
    console.log(`  Farms=${oldAI.counts["farm"]||0}`);
    console.log(`  Trains=${oldAI.counts["train"]||0}, Recruits=${oldAI.counts["recruit"]||0}`);

    console.log('New AI stats:');
    console.log(`  Power: ${Math.floor(newAI.troops.toNumber() * newAI.ppt)}`);
    console.log(`  Troops: ${newAI.troops.toNumber()}, PPT: ${newAI.ppt.toFixed(2)}`);
    console.log(`  SL=${newAI.counts["squad_leader"]||0}, Bar=${newAI.counts["barracks"]||0}, MB=${newAI.counts["military_base"]||0}, King=${newAI.counts["kingdom"]||0}`);
    console.log(`  Farms=${newAI.counts["farm"]||0}, Plants=${newAI.counts["plantation"]||0}, Colonies=${newAI.counts["colony"]||0}`);
    console.log(`  Trains=${newAI.counts["train"]||0}, Recruits=${newAI.counts["recruit"]||0}`);
  }
}

// testCostPoolAware();

// Debug: trace one iteration of new AI to understand why SL isn't being bought
function debugNewAI() {
  console.log('=== DEBUG: Tracing New AI Decision Making ===\n');

  // Set up AI state like it would be on day 50
  const ai = createAIState();
  ai.coins = ON(5000);
  ai.troops = ON(300);
  ai.food = ON(1000);
  ai.ppt = 3;
  ai.rp = 4; // has 3 SLs
  ai.squadLeaderPower = 4; // boosted by 3 barracks
  ai.barracksPower = 4; // boosted by 3 MBs
  ai.militaryBasePower = 1;
  ai.kingdomPower = 1;
  ai.counts = {
    "squad_leader": 3,
    "barracks": 3,
    "military_base": 3,
    "farm": 10,
    "recruit": 100
  };
  ai._armyClicks = 9;
  ai._economyClicks = 10;
  ai._trainClicks = 0;

  const clicks = 10;
  const enemyPower = 1000;

  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.04, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }
  function aiEconomyCost(base) { return Math.floor(base * Math.pow(1.02, ai._economyClicks || 0)); }
  function aiFarmCost() { return aiEconomyCost(C.farm_baseCost); }
  function aiPlantationCost() { return aiEconomyCost(C.plantation_baseCost); }
  function aiColonyCost() { return aiEconomyCost(C.colony_baseCost); }

  const coins = ai.coins.toNumber();
  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const farmProd = aiCnt("farm") * C.farm_production;
  const incomePerDay = (troopCount * ppt * 4) + clicks;

  console.log('State:');
  console.log(`  Coins: ${coins}, Troops: ${troopCount}, PPT: ${ppt}`);
  console.log(`  Income/day: ${incomePerDay}`);
  console.log(`  Army clicks: ${ai._armyClicks}`);
  console.log('');

  // Calculate costs
  const slCost = aiArmyCost(C.squadLeader_baseCost);
  const barCost = aiArmyCost(C.barracks_baseCost);
  const mbCost = aiArmyCost(C.militaryBase_baseCost);
  const kingCost = aiArmyCost(C.kingdom_baseCost);

  console.log('Army costs after 9 clicks:');
  console.log(`  SL: ${slCost}, Barracks: ${barCost}, MB: ${mbCost}, Kingdom: ${kingCost}`);
  console.log('');

  // Calculate scores
  const incomePerDayCalc = incomePerDay;
  const closeness = Math.min(troopCount * ppt, enemyPower) / Math.max(troopCount * ppt, enemyPower, 1);

  function calcScore(cost, value, isArmy, isImmediate) {
    if (cost <= 0) return -1;
    const currentCoins = coins;
    const costPct = cost / Math.max(currentCoins, 1);
    let penalty = Math.sqrt(costPct);
    if (costPct > 1) {
      const coinsNeeded = cost - currentCoins;
      const daysToWait = coinsNeeded / Math.max(incomePerDayCalc, 1);
      penalty += daysToWait * 0.5;
    }
    let baseScore = value / penalty;
    if (isImmediate) baseScore *= PARAMS.NO_INFLATE_BONUS;
    if (isArmy) baseScore *= (1 + closeness * PARAMS.K_CLOSENESS);
    return baseScore;
  }

  console.log('Scores:');
  const slValue = ai.squadLeaderPower * PARAMS.VAL_SL;
  const slScore = calcScore(slCost, slValue, true, false);
  console.log(`  SL: value=${slValue}, cost=${slCost}, costPct=${(slCost/coins).toFixed(2)}, score=${slScore.toFixed(1)}`);

  const kingValue = ai.kingdomPower * PARAMS.VAL_KINGDOM;
  const kingScore = calcScore(kingCost, kingValue, true, false);
  const kingDaysToWait = (kingCost - coins) / incomePerDayCalc;
  console.log(`  Kingdom: value=${kingValue}, cost=${kingCost}, daysToWait=${kingDaysToWait.toFixed(1)}, score=${kingScore.toFixed(1)}`);

  const trainCost = aiTrainCost();
  const trainValue = troopCount * ppt * 0.01;
  const trainScore = calcScore(trainCost, trainValue, true, true);
  console.log(`  Train: value=${trainValue.toFixed(2)}, cost=${trainCost}, score=${trainScore.toFixed(1)}`);

  const recruitCost = aiRecruitCost();
  const recruitValue = ai.rp * ppt;
  const recruitScore = calcScore(recruitCost, recruitValue, true, true);
  console.log(`  Recruit: value=${recruitValue}, cost=${recruitCost}, score=${recruitScore.toFixed(1)}`);

  console.log('');

  // Sorting
  const actions = [
    { name: 'sl', score: slScore },
    { name: 'kingdom', score: kingScore },
    { name: 'train', score: trainScore },
    { name: 'recruit', score: recruitScore }
  ];
  actions.sort((a, b) => b.score - a.score);
  console.log('Sorted actions:');
  actions.forEach((a, i) => console.log(`  ${i+1}. ${a.name}: ${a.score.toFixed(1)}`));
  console.log('');

  // Cost pool filter
  const highestArmyTier = 3; // kingdom
  const armyTargetCost = kingCost;
  const armyDaysToReach = (armyTargetCost - coins) / Math.max(incomePerDay, 1);
  const SAVE_THRESHOLD = 20;
  const shouldSaveForArmy = armyTargetCost > coins && armyDaysToReach <= SAVE_THRESHOLD;

  console.log('Cost pool filtering:');
  console.log(`  Kingdom cost: ${armyTargetCost}, days to reach: ${armyDaysToReach.toFixed(1)}`);
  console.log(`  Should save for army: ${shouldSaveForArmy} (threshold: ${SAVE_THRESHOLD} days)`);
  console.log('');

  // What gets filtered?
  const filtered = actions.filter(a => {
    if (a.name === 'train' || a.name === 'recruit') return true;
    if (a.name === 'kingdom') return true; // highest tier
    if (shouldSaveForArmy) return false; // filter SL if saving
    return true;
  });
  console.log('Filtered actions:');
  filtered.forEach((a, i) => console.log(`  ${i+1}. ${a.name}: ${a.score.toFixed(1)}`));
  console.log('');

  // What happens?
  console.log('Execution:');
  for (const a of filtered) {
    const affordable = (a.name === 'sl' && coins >= slCost) ||
                       (a.name === 'kingdom' && coins >= kingCost) ||
                       (a.name === 'train' && coins >= trainCost) ||
                       (a.name === 'recruit' && coins >= recruitCost);
    console.log(`  Try ${a.name}: ${affordable ? 'AFFORDABLE' : 'too expensive'}`);
    if (affordable) {
      console.log(`  -> Would execute ${a.name}`);
      break;
    }
  }
}

// debugNewAI();

// Test with higher army values so SL beats recruit
function testHigherArmyValues() {
  console.log('=== Testing Higher Army Values (VAL_SL = 50) ===\n');

  // Set params with higher army values
  PARAMS.K_CLOSENESS = 0.5;
  PARAMS.K_STRAIN = 2.0;
  PARAMS.NO_INFLATE_BONUS = 1.2;
  PARAMS.VAL_SL = 50;          // Was 10
  PARAMS.VAL_BARRACKS = 500;    // Was 100
  PARAMS.VAL_MB = 5000;         // Was 1000
  PARAMS.VAL_KINGDOM = 50000;   // Was 10000

  for (const cps of [10, 25]) {
    console.log(`\n--- ${cps} clicks/sec, 300 days ---`);
    const result = runBatch(3, 300, cps);
    console.log(`New wins: ${result.newWins}/3, avgRatio: ${result.avgRatio}x`);

    const oldAI = createAIState();
    const newAI = createAIState();

    for (let day = 1; day <= 300; day++) {
      simDay(oldAI, cps, newAI.troops.toNumber() * newAI.ppt, runAI_Old);
      simDay(newAI, cps, oldAI.troops.toNumber() * oldAI.ppt, runAI_New);
    }

    console.log('Old AI:');
    console.log(`  Power: ${Math.floor(oldAI.troops.toNumber() * oldAI.ppt)}, Troops: ${oldAI.troops.toNumber()}`);
    console.log(`  SL=${oldAI.counts["squad_leader"]||0}, Bar=${oldAI.counts["barracks"]||0}, MB=${oldAI.counts["military_base"]||0}, King=${oldAI.counts["kingdom"]||0}`);

    console.log('New AI:');
    console.log(`  Power: ${Math.floor(newAI.troops.toNumber() * newAI.ppt)}, Troops: ${newAI.troops.toNumber()}`);
    console.log(`  SL=${newAI.counts["squad_leader"]||0}, Bar=${newAI.counts["barracks"]||0}, MB=${newAI.counts["military_base"]||0}, King=${newAI.counts["kingdom"]||0}`);
    console.log(`  Trains=${newAI.counts["train"]||0}, Recruits=${newAI.counts["recruit"]||0}`);
  }
}

// testHigherArmyValues();

// Test fixed AI
function testFixedAI() {
  console.log('=== Testing Fixed AI ===\n');

  PARAMS.VAL_SL = 10;
  PARAMS.VAL_BARRACKS = 100;
  PARAMS.VAL_MB = 1000;
  PARAMS.VAL_KINGDOM = 10000;

  for (const cps of [10, 25]) {
    console.log(`\n--- ${cps} cps, 200 days ---`);

    const ai = createAIState();
    for (let day = 1; day <= 200; day++) {
      simDay(ai, cps, 0, runAI_New);
    }

    console.log(`Power: ${Math.floor(ai.troops.toNumber() * ai.ppt)}`);
    console.log(`Troops: ${ai.troops.toNumber()}, PPT: ${ai.ppt.toFixed(2)}`);
    console.log(`SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}, King=${ai.counts["kingdom"]||0}`);
    console.log(`Farms=${ai.counts["farm"]||0}, Recruits=${ai.counts["recruit"]||0}, Trains=${ai.counts["train"]||0}`);
  }
}

// Debug: Check what scores are being calculated around day 50
function debugAI() {
  console.log('=== DEBUG AI Scores ===\n');

  PARAMS.VAL_SL = 10;
  PARAMS.VAL_BARRACKS = 100;
  PARAMS.VAL_MB = 1000;
  PARAMS.VAL_KINGDOM = 10000;

  const ai = createAIState();
  const clicks = 25;

  // Simulate first 50 days
  for (let day = 1; day <= 50; day++) {
    simDay(ai, clicks, 0, runAI_New);
  }

  // Now log the state and what scores would be
  console.log('After 50 days:');
  console.log(`Coins: ${ai.coins.toNumber()}`);
  console.log(`Troops: ${ai.troops.toNumber()}, PPT: ${ai.ppt}`);
  console.log(`SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}`);
  console.log(`rp=${ai.rp}, _armyClicks=${ai._armyClicks}`);

  // Calculate what scores would be
  const coins = ai.coins.toNumber();
  const troopCount = ai.troops.toNumber();
  const ppt = ai.ppt;
  const incomePerDay = (troopCount * ppt * 4) + clicks;
  console.log(`Income/day: ${incomePerDay}`);

  // Army costs
  const aiArmyCost = (base) => Math.floor(base * Math.pow(1.04, ai._armyClicks));
  const mbCost = aiArmyCost(C.militaryBase_baseCost);
  const slCost = aiArmyCost(C.squadLeader_baseCost);
  console.log(`\nMB cost: ${mbCost}`);
  console.log(`SL cost: ${slCost}`);

  // MB score calculation
  const mbCostPct = mbCost / Math.max(coins, 1);
  const mbPenalty = Math.sqrt(mbCostPct);
  const mbValue = ai.militaryBasePower * PARAMS.VAL_MB;
  let mbBaseScore = mbValue / mbPenalty;

  console.log(`\nMB value: ${mbValue} (militaryBasePower=${ai.militaryBasePower})`);
  console.log(`MB costPct: ${mbCostPct.toFixed(3)}, penalty: ${mbPenalty.toFixed(3)}`);
  console.log(`MB baseScore before decay: ${mbBaseScore.toFixed(2)}`);

  if (mbCostPct > 1) {
    const daysToWait = (mbCost - coins) / Math.max(incomePerDay, 1);
    const decay = Math.pow(0.99, daysToWait);
    console.log(`MB daysToWait: ${daysToWait.toFixed(1)}, decay: ${decay.toFixed(4)}`);
    mbBaseScore *= decay;
    console.log(`MB score after decay: ${mbBaseScore.toFixed(2)}`);
  }

  // Recruit score
  const recruitCost = Math.floor(10 * Math.pow(1.02, ai.counts["recruit"] || 0));
  const recruitValue = ai.rp * ppt;
  const recruitCostPct = recruitCost / Math.max(coins, 1);
  const recruitPenalty = Math.sqrt(recruitCostPct);
  let recruitScore = recruitValue / recruitPenalty;
  if (recruitCostPct <= 1) {
    recruitScore *= PARAMS.NO_INFLATE_BONUS;
  }

  console.log(`\nRecruit cost: ${recruitCost}, value: ${recruitValue} (rp=${ai.rp})`);
  console.log(`Recruit costPct: ${recruitCostPct.toFixed(4)}, penalty: ${recruitPenalty.toFixed(3)}`);
  console.log(`Recruit score: ${recruitScore.toFixed(2)} (with NO_INFLATE_BONUS=${PARAMS.NO_INFLATE_BONUS})`);

  // Is MB unlocked?
  const barracksCount = ai.counts["barracks"] || 0;
  console.log(`\nBarracks count: ${barracksCount} (needs 3 to unlock MB)`);
}

// debugAI();

// Debug: trace when SLs and Barracks are purchased
function debugBarracks() {
  console.log('=== DEBUG Barracks Decision ===\n');

  PARAMS.VAL_SL = 10;
  PARAMS.VAL_BARRACKS = 100;
  PARAMS.VAL_MB = 1000;
  PARAMS.VAL_KINGDOM = 10000;

  const ai = createAIState();
  const clicks = 25;

  let slPrev = 0, barPrev = 0;

  for (let day = 1; day <= 100; day++) {
    simDay(ai, clicks, 0, runAI_New);

    const slAfter = ai.counts["squad_leader"] || 0;
    const barAfter = ai.counts["barracks"] || 0;

    if (slAfter > slPrev) {
      console.log(`Day ${day}: Bought SL #${slAfter} (Coins: ${ai.coins.toNumber()}, Troops: ${ai.troops.toNumber()})`);
      slPrev = slAfter;
    }

    if (barAfter > barPrev) {
      console.log(`Day ${day}: Bought Barracks #${barAfter}`);
      barPrev = barAfter;
    }

    // After day where we hit 3 SLs, check barracks score
    if (slAfter === 3 && day === 30) {
      console.log(`\nDay 30 analysis (should have 3 SLs by now):`);
      console.log(`  Coins: ${ai.coins.toNumber()}`);
      console.log(`  Troops: ${ai.troops.toNumber()}, rp: ${ai.rp}`);
      console.log(`  _armyClicks: ${ai._armyClicks}`);

      const coins = ai.coins.toNumber();
      const troopCount = ai.troops.toNumber();
      const incomePerDay = (troopCount * ai.ppt * 4) + clicks;

      const aiArmyCost = (base) => Math.floor(base * Math.pow(1.04, ai._armyClicks));
      const barCost = aiArmyCost(C.barracks_baseCost);
      const barCostPct = barCost / Math.max(coins, 1);
      const barValue = ai.barracksPower * PARAMS.VAL_BARRACKS;
      let barScore = barValue / Math.sqrt(barCostPct);
      if (barCostPct > 1) {
        const daysToWait = (barCost - coins) / Math.max(incomePerDay, 1);
        barScore *= Math.pow(0.99, daysToWait);
      }
      console.log(`  Barracks cost: ${barCost}, value: ${barValue}, score: ${barScore.toFixed(2)}`);

      const recruitCost = Math.floor(10 * Math.pow(1.02, ai.counts["recruit"] || 0));
      const recruitCostPct = recruitCost / Math.max(coins, 1);
      let recruitScore = (ai.rp * ai.ppt) / Math.sqrt(recruitCostPct);
      if (recruitCostPct <= 1) recruitScore *= PARAMS.NO_INFLATE_BONUS;
      console.log(`  Recruit cost: ${recruitCost}, score: ${recruitScore.toFixed(2)}`);
      console.log('');
    }
  }

  console.log(`\nFinal: SL=${ai.counts["squad_leader"]||0}, Bar=${ai.counts["barracks"]||0}, MB=${ai.counts["military_base"]||0}`);
  console.log(`Troops: ${ai.troops.toNumber()}, Farms: ${ai.counts["farm"]||0}`);
}

// debugBarracks();

// Debug: trace what actions are taken days 28-35
function debugActions() {
  console.log('=== DEBUG Actions Days 28-35 ===\n');

  PARAMS.VAL_SL = 10;
  PARAMS.VAL_BARRACKS = 100;
  PARAMS.VAL_MB = 1000;
  PARAMS.VAL_KINGDOM = 10000;

  const ai = createAIState();
  const clicks = 25;

  for (let day = 1; day <= 35; day++) {
    const countsBefore = { ...ai.counts };
    const coinsBefore = ai.coins.toNumber();
    simDay(ai, clicks, 0, runAI_New);

    if (day >= 28 && day <= 35) {
      const changes = [];
      for (const key in ai.counts) {
        const before = countsBefore[key] || 0;
        const after = ai.counts[key] || 0;
        if (after > before) {
          changes.push(`${key}: +${after - before}`);
        }
      }
      console.log(`Day ${day}: Coins ${coinsBefore.toFixed(0)} -> ${ai.coins.toNumber().toFixed(0)}, Changes: ${changes.join(', ') || 'none'}`);
    }
  }

  const aiArmyCost = (base) => Math.floor(base * Math.pow(1.04, ai._armyClicks));
  console.log(`\nDay 35: Barracks cost = ${aiArmyCost(C.barracks_baseCost)}, Coins = ${ai.coins.toNumber()}`);
}

debugActions();
// testFixedAI();
