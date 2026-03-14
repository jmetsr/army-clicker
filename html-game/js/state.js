// ================================================================
//  GAME STATE - G object and related state functions
// ================================================================

// G = global state object, exposed to window for console debugging
var G = {
  // Core resources (OrdinalNumber for large value support)
  coins: ON(0),
  troops: ON(0),  // Start with 0 - must beg for coins to recruit first troop
  food: ON(500),  // Start with enough to survive until first farm

  // Power stats
  ppt: 1,                           // Power per troop (regular number until very large)
  rp: 1,                            // Recruits per click (troops gained when recruiting)
  fp: 1,                            // Farms per click (farms gained when building farms)
  pp: 1,                            // Plantations per click (plantations gained when building plantations)

  // Army upgrade chain powers (accumulation model: each tier boosts the button below)
  // Empire -> Kingdom -> Military Base -> Barracks -> Squad Leader
  squadLeaderPower: 1,              // Squad leaders gained per click
  barracksPower: 1,                 // Barracks gained per click (also adds to squadLeaderPower)
  militaryBasePower: 1,             // Military bases gained per click (also adds to barracksPower)
  kingdomPower: 1,                  // Kingdoms gained per click (also adds to militaryBasePower)
  empirePower: 1,                   // Empires gained per click (also adds to kingdomPower)

  // Astronomical tier powers
  planetPower: 1,
  solarSystemPower: 1,
  galaxyPower: 1,
  galaxyClusterPower: 1,
  superclusterPower: 1,

  // Multiversal tier powers
  observableUniversePower: 1,
  fullUniversePower: 1,
  quantumMultiversePower: 1,
  cosmologicalMultiversePower: 1,
  mathematicalMultiversePower: 1,

  // Mystical gem tier powers
  sapphirePower: 1,
  emeraldPower: 1,
  rubyPower: 1,

  // Training multipliers
  trainMult: C.train_multiplier,    // Multiplier applied to ppt each train session

  // Enemy system
  difficulty: null,                 // 'practice', 'easy', 'medium', 'hard'
  enemyTroops: ON(0),               // Enemy troop count (non-dragon)
  enemyPower: ON(0),                // Enemy total power
  enemyDragons: ON(0),              // Enemy dragon count - DEPRECATED, use dragonCohorts
  enemyDragonPpt: 60000,            // DEPRECATED, use dragonCohorts
  dragonCohorts: [],                // Array of {count: ON, ppt: number} - dragons at different power levels
  day: 0,                           // Current day (each second = 1 day)
  gameStarted: false,               // Whether difficulty has been selected
  winStreak: 0,                     // Consecutive victories
  lossStreak: 0,                    // Consecutive defeats
  starvationStreak: 0,              // Consecutive days starving (escalates desertion)
  enemyVanquished: false,           // Whether enemy has been completely defeated
  enemyUnvanquishable: false,       // After first dark ritual, enemy can always respawn
  darkRitualDays: [],               // Days when dark rituals were bought
  enemyNoStarve: false,             // After first dark ritual, enemy doesn't need food

  // AI state for Super Hard mode
  ai: null,                         // AI state object (null if not super hard)
  playerClicks: 0,                  // Track player clicks per day for AI to match

  // Gameplay logging
  clickLog: [],                     // Array of {time, day, action, state} objects
  logStartTime: null,               // When logging started
  gameLog: [],                      // Combined log for all events

  // Upgrade counts (how many of each upgrade purchased)
  counts: {},
  _buttonClicks: {},                // Track clicks per button (for separateCosts)

  // Magic system
  magic: 0,                         // Current magic (spendable)
  ltMagic: 0,                       // Lifetime magic (determines entropy, never decreases)
  magicOn: false,                   // Whether magic section is unlocked

  // New magic upgrades
  upgradeLevels: {},                // Button upgrade levels (0=none, 1=10x, 2=100x, etc.)
  astronomicalUnlocked: false,      // Whether astronomical tier is unlocked
  multiversalUnlocked: false,       // Whether multiversal tier is unlocked
  mysticalUnlocked: false,          // Whether mystical gem tier is unlocked
  costsFrozen: false,               // Whether all costs are frozen
  separateCosts: false,             // Whether each button has separate cost (no tier sharing)
  eternalFeast: false,              // Whether troops need food (magic ability)
  autoUpgraders: {},                // Which buttons have auto-upgraders

  // Timer
  startTime: Date.now(),            // When game started
  _lastEventTime: 0,                // Last time a flavor event was shown
  _shownEvents: new Set(),          // Track shown events to avoid repeats

  // UI state tracking (prefixed with _ to indicate internal)
  _milestones: new Set(),           // Shown milestones (prevent duplicates)
  _troopName: "Thugs",              // Current troop name (detect changes)
  _groupName: "Crew",               // Current group name (detect changes)
  _colorScheme: 0,                  // Current color scheme index
  _notation: "Standard",            // Current notation type

  // Click tracking
  _armyClicks: 0,
  _trainClicks: 0,
  _economyClicks: 0,
  _frozenCosts: {}
};

// Total power
function tp() {
  if (typeof G.ppt === 'number') return G.troops.mul(G.ppt);
  return G.troops.mul(G.ppt);
}

// Recruit cost
function rCost() {
  return recruitCost();
}

// Get count of an upgrade (returns number for small values, OrdinalNumber for large)
function cnt(id) {
  var c = G.counts[id];
  if (c === undefined || c === null) return 0;
  // Convert layer 0 OrdinalNumber back to number for easy comparison
  if (c instanceof OrdinalNumber && c.layer === 0) return c.value;
  return c;
}

// Check if count >= threshold (handles OrdinalNumber)
function cntGte(id, threshold) {
  var c = cnt(id);
  if (c instanceof OrdinalNumber) return c.gte(threshold);
  return c >= threshold;
}

// Check if count > threshold (handles OrdinalNumber)
function cntGt(id, threshold) {
  var c = cnt(id);
  if (c instanceof OrdinalNumber) return c.gt(threshold);
  return c > threshold;
}

// Increment count
function inc(id) {
  G.counts[id] = (G.counts[id] || 0) + 1;
}

// Check if AI mode
function isAIMode() {
  return G.difficulty && G.difficulty.startsWith('ai');
}

// Get AI clicks per second
function getAICps() {
  if (!isAIMode()) return 0;
  return parseInt(G.difficulty.substring(2)) || 0;
}

// Entropy percentage
function ePct() {
  return Math.min(G.ltMagic, C.entropy_max);
}

// Calculate total power from all dragon cohorts
function getDragonPower() {
  var total = ON(0);
  for (var i = 0; i < G.dragonCohorts.length; i++) {
    var cohort = G.dragonCohorts[i];
    // Ensure ppt is valid (at least 1)
    if (!cohort.ppt || cohort.ppt < 1 || isNaN(cohort.ppt)) {
      cohort.ppt = 1;
    }
    var cohortPower = cohort.count.mul(cohort.ppt);
    total = total.add(cohortPower);
  }
  return total;
}

// Helper: calculate base * rate^total, handling OrdinalNumber total
function expCostHelper(base, rate, total) {
  if (total instanceof OrdinalNumber) {
    // cost = base * rate^total = 10^(log10(base) + total * log10(rate))
    var logRate = Math.log10(rate);
    var logBase = Math.log10(base);
    var exponent = total.mul(logRate).add(ON(logBase));
    var expNum = exponent.toNumber();
    if (expNum > 1e15) {
      return OrdinalNumber.fromTower([expNum]);
    } else if (expNum > 308) {
      return OrdinalNumber.fromSci(1, expNum);
    } else {
      return Math.floor(Math.pow(10, expNum));
    }
  }
  return Math.floor(base * Math.pow(rate, total));
}

// Total army upgrades (for shared exponential cost) - counts CLICKS not units gained
function armyTotal() {
  var t = G._armyClicks;
  if (t === undefined || t === null) return 0;
  return t;
}

// Army cost: base * 1.04^(total army upgrades) - preserves ratios between tiers
// When separateCosts is true, uses individual button clicks instead of pool
function armyCost(base, id) {
  var total = G.separateCosts && id ? (G._buttonClicks[id] || 0) : armyTotal();
  return expCostHelper(base, 1.04, total);
}

// Recruit cost: separate exponential
function recruitCost() {
  var count = cnt("recruit");
  return expCostHelper(C.recruitCost, 1.02, count);
}

// Economy pool (farms + colonies share costs, like army chain)
function economyTotal() {
  var t = G._economyClicks;
  if (t === undefined || t === null) return 0;
  return t;
}

// When separateCosts is true, uses individual button clicks instead of pool
function economyCost(base, id) {
  var total = G.separateCosts && id ? (G._buttonClicks[id] || 0) : economyTotal();
  return expCostHelper(base, 1.02, total);
}

function farmCost() {
  return economyCost(C.farm_baseCost, "farm");
}

function plantationCost() {
  return economyCost(C.plantation_baseCost, "plantation");
}

function colonyCost() {
  return economyCost(C.colony_baseCost, "colony");
}

// Training pool total - counts CLICKS not sessions
function trainTotal() {
  var t = G._trainClicks;
  if (t === undefined || t === null) return 0;
  return t;
}

// Exponential cost: 2% per purchase, then 3% after pikemen (train #111)
// When separateCosts is true, uses individual button clicks instead of pool
function expCost(base, id) {
  var total = G.separateCosts && id ? (G._buttonClicks[id] || 0) : trainTotal();

  // Handle OrdinalNumber total
  if (total instanceof OrdinalNumber) {
    // Use 1.02 rate for simplicity (ignoring the 1.03 transition at 111)
    return expCostHelper(base, 1.02, total);
  }

  if (total >= 111) {
    // First 111 at 1.02, then 1.03 after
    return Math.floor(base * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
  }
  return Math.floor(base * Math.pow(1.02, total));
}

// DRY helper: apply multiplied effect for any button
// opts: { countId, gainVar, boostVar, clickPool, updateRp, trainMult, trainMultBoost }
// mult: how many times this effect is being applied (from button upgrade level)
function applyEffect(opts, mult) {
  mult = mult || 1;
  var isOrdMult = mult instanceof OrdinalNumber;

  // Calculate gain - handle OrdinalNumber mult
  var baseGain = opts.gainVar ? G[opts.gainVar] : 1;
  var gain = isOrdMult ? mult.mul(baseGain) : baseGain * mult;

  // Add to count - handle OrdinalNumber gain
  if (opts.countId) {
    var oldCount = G.counts[opts.countId] || 0;
    if (isOrdMult || gain instanceof OrdinalNumber) {
      G.counts[opts.countId] = ON(oldCount).add(gain instanceof OrdinalNumber ? gain : ON(gain));
    } else {
      G.counts[opts.countId] = oldCount + gain;
    }
    // Track clicks separately (for separateCosts feature)
    var oldClicks = G._buttonClicks[opts.countId] || 0;
    if (isOrdMult) {
      G._buttonClicks[opts.countId] = ON(oldClicks).add(mult);
    } else {
      G._buttonClicks[opts.countId] = oldClicks + mult;
    }
  }
  // Boost a power variable - handle OrdinalNumber gain
  if (opts.boostVar) {
    var oldVal = G[opts.boostVar];
    if (isOrdMult || gain instanceof OrdinalNumber) {
      G[opts.boostVar] = ON(oldVal).add(gain instanceof OrdinalNumber ? gain : ON(gain));
    } else {
      G[opts.boostVar] += gain;
    }
  }
  // Increment click pool - handle OrdinalNumber mult
  if (opts.clickPool) {
    var oldPool = G[opts.clickPool] || 0;
    if (isOrdMult) {
      G[opts.clickPool] = ON(oldPool).add(mult);
    } else {
      G[opts.clickPool] = oldPool + mult;
    }
  }
  // Update recruits per click (for squad_leader)
  if (opts.updateRp) {
    G.rp = 1 + cnt("squad_leader");
  }
  // Training: multiply ppt by trainMult^mult
  if (opts.trainMult) {
    var factor;
    var tmIsOrd = G.trainMult instanceof OrdinalNumber;

    if (isOrdMult || tmIsOrd) {
      // For OrdinalNumber mult or trainMult, compute trainMult^mult using logarithms
      // trainMult^mult = 10^(mult * log10(trainMult))
      var logTM;
      if (tmIsOrd) {
        // log10 of a large OrdinalNumber is approximately its exponent
        var sci = G.trainMult.toSci();
        logTM = sci.exponent + Math.log10(sci.mantissa);
      } else {
        logTM = Math.log10(G.trainMult);
      }
      // mult * logTM gives the exponent of the factor
      var expVal;
      if (isOrdMult) {
        expVal = mult.mul(logTM);
      } else {
        expVal = ON(mult * logTM);
      }
      // expVal is the exponent; factor = 10^expVal
      var expNum = expVal instanceof OrdinalNumber ? expVal.toNumber() : expVal;
      if (expNum > 1e15) {
        // Layer 2 territory - create tower
        factor = OrdinalNumber.fromTower([expNum]);
      } else if (expNum > 308) {
        factor = OrdinalNumber.fromSci(1, expNum);
      } else {
        factor = Math.pow(10, expNum);
      }
    } else {
      factor = Math.pow(G.trainMult, mult);
    }

    if (typeof G.ppt === 'number') {
      if (factor instanceof OrdinalNumber) {
        G.ppt = ON(G.ppt).mul(factor);
      } else {
        G.ppt *= factor;
        if (G.ppt > 1e15) G.ppt = ON(G.ppt);
      }
    } else {
      G.ppt = G.ppt.mul(factor);
    }
  }
  // Boost trainMult (for sapphire)
  if (opts.trainMultBoost) {
    if (gain instanceof OrdinalNumber) {
      // For huge gains, trainMult becomes an OrdinalNumber
      var boost = gain.mul(opts.trainMultBoost);
      if (typeof G.trainMult === 'number') {
        G.trainMult = ON(G.trainMult).add(boost);
      } else {
        G.trainMult = G.trainMult.add(boost);
      }
    } else {
      G.trainMult += opts.trainMultBoost * gain;
    }
  }
  return gain; // Return for logging if needed
}

// Create fresh AI state
function createAIState() {
  return {
    coins: ON(0),
    troops: ON(0),
    food: ON(500),
    ppt: 1,
    rp: 1,
    fp: 1,
    pp: 1,
    squadLeaderPower: 1,
    barracksPower: 1,
    militaryBasePower: 1,
    kingdomPower: 1,
    empirePower: 1,
    trainMult: C.train_multiplier,
    counts: {},
    _armyClicks: 0,
    _trainClicks: 0,
    _economyClicks: 0,
    starvationStreak: 0
  };
}
