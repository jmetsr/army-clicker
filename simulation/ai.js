/**
 * AI Decision Engine
 *
 * This is the main AI logic. It decides what action to take each click.
 *
 * STRATEGY OVERVIEW:
 * 1. Handle emergencies (starvation prevention)
 * 2. Score all possible actions
 * 3. If best action is unaffordable building, check if train/recruit helps
 * 4. Execute best affordable action, or beg
 *
 * The AI uses a unified scoring system that compares all actions on the same scale.
 * Higher-tier buildings get higher values (10x per tier) to properly weight
 * the multiplier chain.
 */

const { C, PARAMS } = require('./constants');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, getFoodMetrics, wouldSpendingCauseEmergency,
        wouldRecruitCauseSuperEmergency, doesRecruitHelp, doesTrainHelp,
        calculateStrain, calculateCloseness } = require('./scoring');

/**
 * Run AI for one click
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Total clicks this day (for income calculation)
 * @param {number} enemyPower - Enemy's current power
 */
function runAI(ai, clicks, enemyPower) {
  // =========================================================================
  // STEP 0: Early game - need troops to do anything
  // =========================================================================
  const troopCount = ai.troops.toNumber();
  if (troopCount < 1) {
    // No troops - must recruit or beg for coins
    if (ai.coins.gte(getRecruitCost(ai))) {
      recruit(ai);
    } else {
      beg(ai);
    }
    return;
  }

  // =========================================================================
  // STEP 1: Check for food emergency
  // =========================================================================
  const food = getFoodMetrics(ai, clicks);

  if (food.isEmergency) {
    // EMERGENCY: Buy farm if affordable, otherwise beg
    if (ai.coins.gte(food.farmCost)) {
      buyFarm(ai);
    } else {
      beg(ai);
    }
    return;
  }

  // =========================================================================
  // STEP 1.5: Check for "almost emergency" - recruit blocked by food constraints
  // =========================================================================
  // If recruiting would cause starvation, we're food-constrained.
  // In this state, prioritize economy buildings to increase food capacity.
  // Otherwise, AI gets stuck spamming SLs forever while unable to grow troops.
  const isAlmostEmergency = wouldRecruitCauseSuperEmergency(ai);

  // =========================================================================
  // STEP 2: Calculate context for scoring
  // =========================================================================
  const coins = ai.coins.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  const strain = calculateStrain(ai);
  const closeness = calculateCloseness(myPower, enemyPower);
  const incomePerDay = food.incomePerDay;

  // =========================================================================
  // STEP 3: Score all possible actions
  // =========================================================================
  const actions = [];

  // In "almost emergency", skip army actions - focus on economy to unlock recruiting
  if (!isAlmostEmergency) {
    // --- TRAIN ---
    if (troopCount >= 5) {
      const cost = getTrainCost(ai);
      const value = troopCount * ppt * 0.3;  // Immediate power gain (tuned via simulation)
      const score = calcScore(cost, value, coins, incomePerDay, true, true, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

    // --- RECRUIT ---
    {
      const cost = getRecruitCost(ai);
      const value = ai.rp * ppt;  // Immediate power gain
      let score = calcScore(cost, value, coins, incomePerDay, true, true, closeness, strain);

      // Penalize recruiting when near food capacity
      const newStrain = food.farmProd > 0 ? (troopCount + ai.rp) / (food.farmProd / C.food_perTroopDay) : 1;
      if (newStrain > 0.9) {
        score -= (newStrain - 0.9) * 5;
      }

      if (score > 0) {
        actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }
    }

    // --- SQUAD LEADER ---
    // PPT scaling: buildings that boost troop recruitment should scale with ppt
    const pptMult = PARAMS.USE_PPT_SCALING ? ppt : 1;

    if (troopCount >= 2) {
      const cost = getSLCost(ai);
      const value = ai.squadLeaderPower * PARAMS.VAL_SL * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'sl', score, cost, fn: () => buySL(ai) });
      }
    }

    // --- BARRACKS ---
    if (getCount(ai, "squad_leader") >= 3) {
      const cost = getBarracksCost(ai);
      const value = ai.barracksPower * PARAMS.VAL_BARRACKS * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }
    }

    // --- MILITARY BASE ---
    if (getCount(ai, "barracks") >= 3) {
      const cost = getMBCost(ai);
      const value = ai.militaryBasePower * PARAMS.VAL_MB * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'mb', score, cost, fn: () => buyMB(ai) });
      }
    }

    // --- KINGDOM ---
    if (getCount(ai, "military_base") >= 3) {
      const cost = getKingdomCost(ai);
      const value = ai.kingdomPower * PARAMS.VAL_KINGDOM * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, closeness, strain);
      if (score > 0) {
        actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }
    }
  }

  // --- FARM --- (always available, critical for almost emergency)
  // Economy also scales with ppt - higher ppt troops need more food support
  const econPptMult = PARAMS.USE_PPT_SCALING ? ppt : 1;

  {
    const cost = getFarmCost(ai);
    const value = ai.fp * PARAMS.VAL_FARM * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  // --- PLANTATION ---
  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * PARAMS.VAL_PLANTATION * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  // --- COLONY ---
  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * PARAMS.VAL_COLONY * econPptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, closeness, strain);
    if (score > 0) {
      actions.push({ name: 'colony', score, cost, fn: () => buyColony(ai) });
    }
  }

  // =========================================================================
  // STEP 4: Execute best action
  // =========================================================================
  if (actions.length === 0) {
    beg(ai);
    return;
  }

  // Sort by score (highest first)
  actions.sort((a, b) => b.score - a.score);

  const best = actions[0];
  const bestIsBuilding = (best.name !== 'train' && best.name !== 'recruit');
  const bestIsUnaffordable = bestIsBuilding && best.cost > coins;

  if (bestIsUnaffordable) {
    // -----------------------------------------------------------------------
    // Best action is an unaffordable building - save for it
    // Skip ALL other buildings (score already accounts for cost/delay)
    // Only train/recruit if they help reach best faster
    // -----------------------------------------------------------------------

    if (isAlmostEmergency) {
      // In almost emergency, only check if train helps (recruit would make food worse)
      // But train increases income without increasing food consumption
      const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);
      if (trainHelps) {
        train(ai);
        return;
      }
      // Can't train - just beg
      beg(ai);
      return;
    }

    // Normal case: check if train/recruit helps reach best faster
    // But if saving for ECONOMY building, don't recruit - it increases food strain
    const bestIsEconomy = (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');
    const recruitHelps = !bestIsEconomy && doesRecruitHelp(ai, best.cost, coins, incomePerDay, clicks);
    const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);

    if (recruitHelps || trainHelps) {
      if (recruitHelps && trainHelps) {
        // Both help - pick whichever gets us there faster
        const recruitCost = getRecruitCost(ai);
        const trainCost = getTrainCost(ai);
        const newIncomeRecruit = ((troopCount + ai.rp) * ppt * 4) + clicks;
        const newIncomeTrain = (troopCount * ppt * ai.trainMult * 4) + clicks;
        const daysRecruit = (best.cost - coins + recruitCost) / newIncomeRecruit;
        const daysTrain = (best.cost - coins + trainCost) / newIncomeTrain;

        if (daysRecruit < daysTrain) {
          recruit(ai);
        } else {
          train(ai);
        }
      } else if (recruitHelps) {
        recruit(ai);
      } else {
        train(ai);
      }
      return;
    }

    // Nothing helps - just beg
    beg(ai);

  } else {
    // -----------------------------------------------------------------------
    // Best action is affordable (or is train/recruit) - execute in score order
    // -----------------------------------------------------------------------
    for (const action of actions) {
      // CRITICAL: Before spending, check if it would cause food emergency
      // Exception: farms are always OK to buy (they help the food situation)
      if (action.name !== 'farm' && wouldSpendingCauseEmergency(ai, action.cost, clicks)) {
        continue;  // Skip this action, try next one
      }
      if (action.fn()) return;
    }

    // Fallback: beg
    beg(ai);
  }
}

/**
 * Run AI for multiple clicks (one day)
 *
 * @param {Object} ai - AI state
 * @param {number} clicks - Number of clicks to simulate
 * @param {number} enemyPower - Enemy's current power
 */
function runAIDay(ai, clicks, enemyPower) {
  for (let i = 0; i < clicks; i++) {
    runAI(ai, clicks, enemyPower);
  }
}

module.exports = { runAI, runAIDay };
