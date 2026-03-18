/**
 * AI Decision Engine
 *
 * Logic matches html-game/js/ai-strategy.js exactly.
 * Uses modular imports from other simulation files.
 */

const { C, PARAMS } = require('./constants');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost, getEmpireCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost, getArmyCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom, buyEmpire,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, slBetterThanRecruit, findBestMilitaryTarget } = require('./scoring');

/**
 * Run AI for one day (all clicks)
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Clicks per day
 * @param {number} enemyPower - Enemy power (unused currently)
 * @param {boolean} noStarve - If true, skip food/starvation logic (like G.enemyNoStarve)
 */
function runAIDay(ai, clicks, enemyPower = 0, noStarve = false) {

  // === TUNING CONSTANTS (same as game) ===
  const VAL_SL = PARAMS.VAL_SL;
  const FARM_THRESHOLD = PARAMS.FARM_THRESHOLD;
  const trainMult = PARAMS.TRAIN_MULT;
  const tierMult = PARAMS.TIER_MULT;

  const VAL_BARRACKS = tierMult * VAL_SL;
  const VAL_MB = tierMult * VAL_BARRACKS;
  const VAL_KINGDOM = tierMult * VAL_MB;
  const VAL_EMPIRE = tierMult * VAL_KINGDOM;

  // === HELPER FUNCTIONS (match game exactly) ===
  function doesRecruitHelp(targetCost, coins, incomePerDay) {
    const recruitCost = getRecruitCost(ai);
    if (coins < recruitCost) return false;

    const troopCount = ai.troops.toNumber();
    const ppt = ai.ppt;
    const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    const newIncome = ((troopCount + ai.rp) * ppt * 4) + clicks;
    const daysWithRecruit = (targetCost - coins + recruitCost) / Math.max(newIncome, 1);

    return daysWithRecruit < daysToReach;
  }

  function doesSLHelp(targetCost, coins, incomePerDay) {
    if (!doesRecruitHelp(targetCost, coins, incomePerDay)) return false;
    if (!slBetterThanRecruit(ai, targetCost)) return false;
    if (ai.coins.lt(getSLCost(ai))) return false;
    return true;
  }

  function doesTrainHelp(targetCost, coins, incomePerDay) {
    const troopCount = ai.troops.toNumber();
    const trainCost = getTrainCost(ai);
    if (coins < trainCost || troopCount < 5) return false;

    const ppt = ai.ppt;
    const daysToReach = (targetCost - coins) / Math.max(incomePerDay, 1);
    const newIncome = (troopCount * ppt * ai.trainMult * 4) + clicks;
    const daysWithTrain = (targetCost - coins + trainCost) / Math.max(newIncome, 1);

    return daysWithTrain < daysToReach;
  }

  function recruitCausesSuperEmergency(coins, fCost) {
    const troopCount = ai.troops.toNumber();
    const newTroops = troopCount + ai.rp;
    const newConsume = newTroops * C.food_perTroopDay;
    const currentFarmProd = getCount(ai, "farm") * C.farm_production;
    if (currentFarmProd >= newConsume) return false;
    const deficit = newConsume - currentFarmProd;
    const foodBuf = ai.food.toNumber();
    const daysOfBuffer = deficit > 0 ? foodBuf / deficit : 999;
    if (daysOfBuffer > 50) return false;
    const farmsNeeded = Math.ceil(newConsume / C.farm_production);
    const farmsToBuy = farmsNeeded - getCount(ai, "farm");
    const costToBuy = farmsToBuy * fCost;
    if (coins >= costToBuy) return false;
    const incomePerDay = (troopCount * ai.ppt * 4) + clicks;
    const coinsNeeded = costToBuy - coins;
    const daysToAfford = coinsNeeded / Math.max(incomePerDay, 1);
    return daysToAfford > daysOfBuffer;
  }

  // === MAIN LOOP (one iteration per click) ===
  for (let iteration = 0; iteration < clicks; iteration++) {
    // Recalculate state each iteration (like game does)
    let coins = ai.coins.toNumber();
    let troopCount = ai.troops.toNumber();
    let ppt = ai.ppt;
    let incomePerDay = (troopCount * ppt * 4) + clicks;

    // No troops - must recruit or beg
    if (troopCount < 1) {
      if (ai.coins.gte(getRecruitCost(ai))) {
        recruit(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    // Recalculate food metrics each iteration
    let farmProd = getCount(ai, "farm") * C.farm_production;
    let netConsume = (troopCount * C.food_perTroopDay) - farmProd;
    let foodBuffer = ai.food.toNumber();
    let daysOfFood = netConsume > 0 ? foodBuffer / netConsume : 999;
    let fCost = getFarmCost(ai);
    let daysToAffordFarm = fCost > coins ? (fCost - coins) / Math.max(incomePerDay, 1) : 0;
    let foodEmergency = !noStarve && (daysToAffordFarm > daysOfFood || daysOfFood <= 0) && netConsume > 0;

    // Recalculate urgency-based farm value each iteration
    let recruitsUntil1DayStarve = Math.max(1, (foodBuffer + farmProd - troopCount) / Math.max(ai.rp, 1));
    let urgency = Math.min(daysOfFood, recruitsUntil1DayStarve);
    let VAL_FARM = VAL_SL * (FARM_THRESHOLD / Math.max(urgency, 1));
    let VAL_PLANTATION = tierMult * VAL_FARM;
    let VAL_COLONY = tierMult * VAL_PLANTATION;

    // FOOD EMERGENCY
    if (foodEmergency) {
      if (ai.coins.gte(fCost)) {
        buyFarm(ai);
      } else {
        beg(ai);
      }
      continue;
    }

    let isAlmostEmergency = !noStarve && recruitCausesSuperEmergency(coins, fCost);

    // === CALCULATE ALL SCORES ===
    let actions = [];

    if (!isAlmostEmergency) {
      // Train
      if (troopCount >= 5) {
        const cost = getTrainCost(ai);
        const value = troopCount * ppt * trainMult;
        const score = calcScore(cost, value, coins, incomePerDay, true);
        if (score > 0) actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }

      // Recruit
      {
        const cost = getRecruitCost(ai);
        const value = ai.rp * ppt;
        const maxSustainable = farmProd / C.food_perTroopDay;
        const newStrain = (!noStarve && maxSustainable > 0) ? (troopCount + ai.rp) / maxSustainable : 0;
        const strainPenalty = newStrain > 0.9 ? (newStrain - 0.9) * 5 : 0;
        let score = calcScore(cost, value, coins, incomePerDay, true);
        score -= strainPenalty;
        if (score > 0) actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }

      // Squad Leader
      if (troopCount >= 2) {
        const cost = getSLCost(ai);
        const value = ai.squadLeaderPower * VAL_SL * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'squad_leader', score, cost, fn: () => buySL(ai) });
      }

      // Barracks
      if (getCount(ai, "squad_leader") >= 3) {
        const cost = getBarracksCost(ai);
        const value = ai.barracksPower * VAL_BARRACKS * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }

      // Military Base
      if (getCount(ai, "barracks") >= 3) {
        const cost = getMBCost(ai);
        const value = ai.militaryBasePower * VAL_MB * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'military_base', score, cost, fn: () => buyMB(ai) });
      }

      // Kingdom
      if (getCount(ai, "military_base") >= 3) {
        const cost = getKingdomCost(ai);
        const value = ai.kingdomPower * VAL_KINGDOM * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }

      // Empire
      if (getCount(ai, "kingdom") >= 3) {
        const cost = getEmpireCost(ai);
        const value = ai.empirePower * VAL_EMPIRE * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }

    // Economy actions (skip if noStarve)
    if (!noStarve) {
      // Farm
      {
        const cost = getFarmCost(ai);
        const value = ai.fp * VAL_FARM * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
      }

      // Plantation
      if (getCount(ai, "farm") >= 3) {
        const cost = getPlantationCost(ai);
        const value = ai.pp * VAL_PLANTATION * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
      }

      // Colony
      if (getCount(ai, "plantation") >= 3) {
        const cost = getColonyCost(ai);
        const value = 1 * VAL_COLONY * ppt;
        const score = calcScore(cost, value, coins, incomePerDay, false);
        if (score > 0) actions.push({ name: 'colony', score, cost, fn: () => buyColony(ai) });
      }
    }

    if (actions.length === 0) {
      beg(ai);
      continue;
    }

    actions.sort((a, b) => b.score - a.score);

    const best = actions[0];
    const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
    const bestIsUnaffordable = bestIsBuilding && best.cost > coins;

    // Handle waiting for unaffordable building
    if (bestIsUnaffordable) {
      if (isAlmostEmergency) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      const bestIsEconomy = !noStarve && (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');

      if (bestIsEconomy) {
        if (doesTrainHelp(best.cost, coins, incomePerDay)) {
          train(ai);
          continue;
        }
        beg(ai);
        continue;
      }

      // For military buildings, check SL helper first
      if (doesSLHelp(best.cost, coins, incomePerDay)) {
        buySL(ai);
        continue;
      }

      // Fallback to recruit/train
      if (doesRecruitHelp(best.cost, coins, incomePerDay) && !recruitCausesSuperEmergency(coins, fCost)) {
        recruit(ai);
        continue;
      }

      if (doesTrainHelp(best.cost, coins, incomePerDay)) {
        train(ai);
        continue;
      }

      beg(ai);
      continue;
    }

    // Best action is affordable - but check if SL helper is better when recruit wins
    if (best.name === 'recruit') {
      const targetCost = findBestMilitaryTarget(ai);
      if (targetCost > 0 && slBetterThanRecruit(ai, targetCost) && ai.coins.gte(getSLCost(ai))) {
        buySL(ai);
        continue;
      }
    }

    // Execute best affordable action
    // Check wouldSpendingCauseEmergency inline (like game)
    let executed = false;
    for (const action of actions) {
      if (action.name !== 'farm' && !noStarve) {
        // Check if spending would cause emergency
        if (netConsume > 0) {
          const coinsAfterSpend = coins - action.cost;
          const daysToAfford = fCost > coinsAfterSpend
            ? (fCost - coinsAfterSpend) / Math.max(incomePerDay, 1)
            : 0;
          if (daysToAfford > daysOfFood) {
            continue; // Skip this action
          }
        }
      }
      if (action.fn()) {
        executed = true;
        break;
      }
    }

    if (!executed) {
      beg(ai);
    }
  }
}

module.exports = { runAIDay };
