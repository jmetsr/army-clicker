/**
 * AI Decision Engine
 *
 * VERSION: urgency-farm-v1 (synced with html-game/js/ai-strategy.js)
 * TUNED: tierMult=70, divisor=1, VAL_SL=5, FARM_THRESHOLD=6
 *
 * STRATEGY OVERVIEW:
 * 1. Handle emergencies (starvation prevention)
 * 2. Score all possible actions using urgency-based farm valuation
 * 3. If best action is unaffordable building, check SL helper logic
 * 4. Execute best affordable action, or beg
 */

const { C, PARAMS } = require('./constants');
const { getCount, getSLCost, getBarracksCost, getMBCost, getKingdomCost, getEmpireCost,
        getFarmCost, getPlantationCost, getColonyCost,
        getRecruitCost, getTrainCost } = require('./costs');
const { buySL, buyBarracks, buyMB, buyKingdom, buyEmpire,
        buyFarm, buyPlantation, buyColony,
        recruit, train, beg } = require('./actions');
const { calcScore, getFoodMetrics, getUrgencyMetrics,
        wouldSpendingCauseEmergency, wouldRecruitCauseSuperEmergency,
        doesRecruitHelp, doesTrainHelp, slBetterThanRecruit, doesSLHelp,
        findBestMilitaryTarget } = require('./scoring');

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
  const isAlmostEmergency = wouldRecruitCauseSuperEmergency(ai);

  // =========================================================================
  // STEP 2: Calculate context for scoring
  // =========================================================================
  const coins = ai.coins.toNumber();
  const ppt = ai.ppt;
  const myPower = troopCount * ppt;

  // Get urgency-based farm values
  const urgency = getUrgencyMetrics(ai, clicks);
  const incomePerDay = food.incomePerDay;

  // Army chain values (derived from PARAMS)
  const VAL_BARRACKS = PARAMS.TIER_MULT * PARAMS.VAL_SL;
  const VAL_MB = PARAMS.TIER_MULT * VAL_BARRACKS;
  const VAL_KINGDOM = PARAMS.TIER_MULT * VAL_MB;
  const VAL_EMPIRE = PARAMS.TIER_MULT * VAL_KINGDOM;

  // PPT scaling for building values
  const pptMult = PARAMS.USE_PPT_SCALING ? ppt : 1;

  // =========================================================================
  // STEP 3: Score all possible actions
  // =========================================================================
  const actions = [];

  // In "almost emergency", skip army actions - focus on economy to unlock recruiting
  if (!isAlmostEmergency) {
    // --- TRAIN ---
    if (troopCount >= 5) {
      const cost = getTrainCost(ai);
      const value = troopCount * ppt * PARAMS.TRAIN_MULT;
      const score = calcScore(cost, value, coins, incomePerDay, true, true, 0, 0);
      if (score > 0) {
        actions.push({ name: 'train', score, cost, fn: () => train(ai) });
      }
    }

    // --- RECRUIT ---
    {
      const cost = getRecruitCost(ai);
      const value = ai.rp * ppt;
      let score = calcScore(cost, value, coins, incomePerDay, true, true, 0, 0);

      // Penalize recruiting when near food capacity
      const maxSustainable = food.farmProd / C.food_perTroopDay;
      const newStrain = maxSustainable > 0 ? (troopCount + ai.rp) / maxSustainable : 0;
      if (newStrain > 0.9) {
        score -= (newStrain - 0.9) * 5;
      }

      if (score > 0) {
        actions.push({ name: 'recruit', score, cost, fn: () => recruit(ai) });
      }
    }

    // --- SQUAD LEADER ---
    if (troopCount >= 2) {
      const cost = getSLCost(ai);
      const value = ai.squadLeaderPower * PARAMS.VAL_SL * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, 0, 0);
      if (score > 0) {
        actions.push({ name: 'sl', score, cost, fn: () => buySL(ai) });
      }
    }

    // --- BARRACKS ---
    if (getCount(ai, "squad_leader") >= 3) {
      const cost = getBarracksCost(ai);
      const value = ai.barracksPower * VAL_BARRACKS * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, 0, 0);
      if (score > 0) {
        actions.push({ name: 'barracks', score, cost, fn: () => buyBarracks(ai) });
      }
    }

    // --- MILITARY BASE ---
    if (getCount(ai, "barracks") >= 3) {
      const cost = getMBCost(ai);
      const value = ai.militaryBasePower * VAL_MB * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, 0, 0);
      if (score > 0) {
        actions.push({ name: 'mb', score, cost, fn: () => buyMB(ai) });
      }
    }

    // --- KINGDOM ---
    if (getCount(ai, "military_base") >= 3) {
      const cost = getKingdomCost(ai);
      const value = ai.kingdomPower * VAL_KINGDOM * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, 0, 0);
      if (score > 0) {
        actions.push({ name: 'kingdom', score, cost, fn: () => buyKingdom(ai) });
      }
    }

    // --- EMPIRE ---
    if (getCount(ai, "kingdom") >= 3) {
      const cost = getEmpireCost(ai);
      const value = ai.empirePower * VAL_EMPIRE * pptMult;
      const score = calcScore(cost, value, coins, incomePerDay, true, false, 0, 0);
      if (score > 0) {
        actions.push({ name: 'empire', score, cost, fn: () => buyEmpire(ai) });
      }
    }
  }

  // --- FARM --- (always available, critical for almost emergency)
  {
    const cost = getFarmCost(ai);
    const value = ai.fp * urgency.VAL_FARM * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, 0, 0);
    if (score > 0) {
      actions.push({ name: 'farm', score, cost, fn: () => buyFarm(ai) });
    }
  }

  // --- PLANTATION ---
  if (getCount(ai, "farm") >= 3) {
    const cost = getPlantationCost(ai);
    const value = ai.pp * urgency.VAL_PLANTATION * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, 0, 0);
    if (score > 0) {
      actions.push({ name: 'plantation', score, cost, fn: () => buyPlantation(ai) });
    }
  }

  // --- COLONY ---
  if (getCount(ai, "plantation") >= 3) {
    const cost = getColonyCost(ai);
    const value = 1 * urgency.VAL_COLONY * pptMult;
    const score = calcScore(cost, value, coins, incomePerDay, false, false, 0, 0);
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
    // -----------------------------------------------------------------------

    if (isAlmostEmergency) {
      // In almost emergency, only check if train helps
      const trainHelps = doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks);
      if (trainHelps) {
        train(ai);
        return;
      }
      beg(ai);
      return;
    }

    const bestIsEconomy = (best.name === 'farm' || best.name === 'plantation' || best.name === 'colony');

    // For economy buildings, just use train helps
    if (bestIsEconomy) {
      if (doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks)) {
        train(ai);
        return;
      }
      beg(ai);
      return;
    }

    // For military buildings, check SL helper first
    if (doesSLHelp(ai, best.cost, coins, incomePerDay, clicks)) {
      buySL(ai);
      return;
    }

    // Fallback to recruit/train
    if (doesRecruitHelp(ai, best.cost, coins, incomePerDay, clicks)) {
      recruit(ai);
      return;
    }

    if (doesTrainHelp(ai, best.cost, coins, incomePerDay, clicks)) {
      train(ai);
      return;
    }

    beg(ai);

  } else {
    // -----------------------------------------------------------------------
    // Best action is affordable (or is train/recruit)
    // -----------------------------------------------------------------------

    // Check if SL helper is better when recruit wins
    if (best.name === 'recruit') {
      const targetCost = findBestMilitaryTarget(ai);
      if (targetCost > 0 && slBetterThanRecruit(ai, targetCost) && ai.coins.gte(getSLCost(ai))) {
        buySL(ai);
        return;
      }
    }

    // Execute best affordable action
    for (const action of actions) {
      // CRITICAL: Before spending, check if it would cause food emergency
      // Exception: farms are always OK to buy
      if (action.name !== 'farm' && wouldSpendingCauseEmergency(ai, action.cost, clicks)) {
        continue;
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
