// ================================================================
//  UTILITY FUNCTIONS - Formatting, naming, helpers
// ================================================================

// Number formatting
function fmt(n) {
  // Handle OrdinalNumber
  if (n instanceof OrdinalNumber) return n.format();
  if (typeof n === "bigint") n = Number(n);
  if (!isFinite(n) || isNaN(n)) return "???";
  if (n < 0) return "0";
  if (n >= 1e36) return ON(n).format();  // Beyond decillion, use OrdinalNumber format
  if (n < 1e6) return n % 1 === 0 ? Math.floor(n).toLocaleString("en-US") : n.toFixed(1);
  // Use words for millions and above
  for (var i = 0; i < WORDS.length; i++) {
    var t = WORDS[i][0], w = WORDS[i][1];
    if (n >= t) {
      var v = n / t;
      if (v < 10) return v.toFixed(2) + " " + w;
      if (v < 100) return v.toFixed(1) + " " + w;
      return Math.floor(v).toLocaleString("en-US") + " " + w;
    }
  }
  return Math.floor(n).toLocaleString("en-US");
}

// Power formatting
function fmtP(n) {
  if (n instanceof OrdinalNumber) {
    var num = n.toNumber();
    if (!isFinite(num)) return n.format();
    n = num; // Convert to number for formatting
  }
  if (!isFinite(n) || isNaN(n)) return "???";
  return n < 10 ? n.toFixed(2) : n < 1000 ? n.toFixed(1) : fmt(n);
}

// Percentage formatting
function fmtPct(n) {
  return n >= 0.01 ? (n * 100).toFixed(1) + "%" : n >= 0.001 ? (n * 100).toFixed(2) + "%" : (n * 100).toExponential(1) + "%";
}

// Get troop name based on power per troop
function getTN(pptOverride) {
  var ppt = pptOverride !== undefined ? pptOverride : (typeof G.ppt === 'number' ? G.ppt : G.ppt.toNumber());
  if (typeof ppt !== 'number') ppt = ppt.toNumber ? ppt.toNumber() : Number(ppt);
  for (var i = 0; i < TROOP_NAMES.length; i++) {
    if (ppt >= TROOP_NAMES[i][0]) return TROOP_NAMES[i][1];
  }
  return "Thugs";
}

// Get troop icon path
function getTroopIcon(troopName) {
  if (TROOP_ICONS[troopName]) return TROOP_ICONS[troopName];
  // For higher tiers without icons, use Ogres (highest we have)
  return "icons/Ogres.png";
}

// Pluralization
function plural(n, singular, pluralForm) {
  if (n instanceof OrdinalNumber) n = n.toNumber();
  if (!pluralForm) pluralForm = singular + "s";
  return n === 1 ? singular : pluralForm;
}

// Singularize a troop name
function singularize(name) {
  // Handle special cases and compound names
  var irregulars = {
    "Thugs": "Thug", "Dragons": "Dragon", "Giants": "Giant", "Ogres": "Ogre", "Trolls": "Troll",
    "Orcs": "Orc", "Swordsmen": "Swordsman", "Archers": "Archer", "Pikemen": "Pikeman",
    "War Orcs": "War Orc", "Knights on Horseback": "Knight on Horseback",
    "Armored Swordsmen": "Armored Swordsman", "Soldiers with Katanas": "Soldier with Katana",
    "Soldiers with Nunchucks": "Soldier with Nunchucks", "Soldiers with Daggers": "Soldier with Dagger",
    "Giant Pikemen": "Giant Pikeman", "Giants With Nunchucks": "Giant With Nunchucks",
    "Giant Knights on Giant Horses": "Giant Knight on Giant Horse",
    "Wyrms": "Wyrm", "Elder Dragons": "Elder Dragon", "Archdemons": "Archdemon",
    "Balrogs": "Balrog", "Demon Lords": "Demon Lord", "Fallen Angels": "Fallen Angel",
    "Titans": "Titan", "Elder Gods": "Elder God", "Celestial Forces": "Celestial Force",
    "Dyson Sphere Powered Planet Sized Tornadoes": "Dyson Sphere Powered Planet Sized Tornado",
    "Ultra Macro Agentic Galaxies": "Ultra Macro Agentic Galaxy",
    "Chuck Norrises": "Chuck Norris"
  };
  if (irregulars[name]) return irregulars[name];
  if (name.endsWith("s")) return name.slice(0, -1);
  return name;
}

// Get troop name with correct plurality
function troopName(n, name) {
  if (n instanceof OrdinalNumber) n = n.toNumber();
  return n === 1 ? singularize(name) : name;
}

// Get group name based on troop count
function getGN() {
  for (var i = 0; i < GROUP_NAMES.length; i++) {
    if (G.troops.gte(GROUP_NAMES[i][0])) return GROUP_NAMES[i][1];
  }
  return "Crew";
}

// Apply color scheme based on power per troop
function applyScheme(logFn) {
  var ppt = typeof G.ppt === 'number' ? G.ppt : G.ppt.toNumber();
  var idx = 0;
  for (var j = C.colorSchemes.length - 1; j >= 0; j--) {
    if (ppt >= C.colorSchemes[j][0]) {
      idx = j;
      break;
    }
  }
  if (idx !== G._colorScheme) {
    G._colorScheme = idx;
    var vars = C.colorSchemes[idx][1];
    for (var k in vars) {
      document.documentElement.style.setProperty(k, vars[k]);
    }
    if (idx > 0 && logFn) {
      logFn("The world shifts. Your power transforms reality.", "milestone");
    }
  }
}

// Initialize default color scheme
function initColorScheme() {
  var vars = C.colorSchemes[0][1];
  for (var k in vars) {
    document.documentElement.style.setProperty(k, vars[k]);
  }
}

// Helper: get upgrade multiplier for a button (returns ON for large values)
function getUpgradeMult(id) {
  var level = G.upgradeLevels[id] || 0;
  if (level > 300) return OrdinalNumber.fromSci(1, level);
  return Math.pow(10, level);
}

// Helper: format a multiplier for display (handles large numbers)
function fmtMult(level) {
  if (level instanceof OrdinalNumber) return level.format();
  if (!isFinite(level) || isNaN(level)) return "10^???";
  if (level > 1e12) {
    // Very large exponent - use OrdinalNumber formatting
    return ON({arrows: 1, height: level}).format();
  }
  if (level > 1e6) return "10^" + Math.floor(level).toLocaleString();
  if (level > 300) return "10^" + Math.floor(level);
  if (level > 15) return fmt(Math.pow(10, level));
  return Math.pow(10, level) + "";
}

// Helper: googol constant (10^100)
function googol() {
  return OrdinalNumber.fromSci(1, 100);
}

// Helper: calculate compounded cost for N clicks with exponential scaling
// Sum = base * (rate^N - 1) / (rate - 1)
// When N is large, use log math: rate^N = 10^(N * log10(rate))
function compoundedCost(baseCost, rate, numClicks) {
  // Handle OrdinalNumber numClicks
  if (numClicks instanceof OrdinalNumber) {
    // Sum ~ base * rate^N / (rate - 1)
    var log10rate = Math.log10(rate);
    var divisor = rate - 1;
    var mantissa = baseCost / divisor;
    // exponent = N * log10(rate)
    var exponent = numClicks.mul(log10rate);
    // Normalize mantissa
    var mantissaExp = 0;
    while (mantissa >= 10) { mantissa /= 10; mantissaExp += 1; }
    while (mantissa < 1 && mantissa > 0) { mantissa *= 10; mantissaExp -= 1; }
    // Add mantissa exponent adjustment
    var finalExp = exponent.add(ON(mantissaExp));
    var expNum = finalExp.toNumber();
    if (expNum > 1e15) {
      return OrdinalNumber.fromTower([expNum]);
    }
    return OrdinalNumber.fromSci(mantissa, Math.floor(expNum));
  }

  if (numClicks <= 1) return baseCost;
  if (numClicks <= 1000) {
    // For small N, calculate exactly
    var sum = 0;
    var cost = baseCost;
    for (var i = 0; i < numClicks; i++) {
      sum += cost;
      cost *= rate;
    }
    return Math.floor(sum);
  }
  // For large N, use geometric series formula with log math
  // Sum ~ base * rate^N / (rate - 1)
  var log10rate = Math.log10(rate);
  var exponent = numClicks * log10rate;
  // rate^N / (rate-1) ~ rate^N / 0.02 for rate=1.02
  var divisor = rate - 1;
  // Result = base * 10^exponent / divisor
  // = (base / divisor) * 10^exponent
  var mantissa = baseCost / divisor;
  // Normalize mantissa
  while (mantissa >= 10) { mantissa /= 10; exponent += 1; }
  while (mantissa < 1 && mantissa > 0) { mantissa *= 10; exponent -= 1; }
  return OrdinalNumber.fromSci(mantissa, Math.floor(exponent));
}

// Helper: format cost for display
function fmtCost(cost) {
  if (cost instanceof OrdinalNumber) return cost.format();
  return fmt(cost);
}
