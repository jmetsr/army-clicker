// ================================================================
//  RENDER - UI building and updating
// ================================================================

// Button element references
var btnEls = {};

// Build UI buttons
function buildButtons() {
  var containers = {
    army: document.getElementById("armyButtons"),
    economy: document.getElementById("economyButtons"),
    training: document.getElementById("trainingButtons"),
    command: document.getElementById("commandButtons"),
    magic: document.getElementById("magicButtons")
  };

  BUTTONS.forEach(function(btn) {
    var c = containers[btn.s];
    if (!c) return;

    var row = document.createElement("div");
    row.className = "btn-row";
    row.id = "row_" + btn.id;

    var el = document.createElement("button");
    el.className = "game-btn" + (btn.id === "dark_ritual" ? " ritual-btn" : "");
    el.innerHTML = '<span class="btn-count" id="cnt_' + btn.id + '"></span><span class="btn-name">' + btn.name + '</span><div class="btn-desc"></div><div class="btn-cost"></div>';

    el.addEventListener("click", function() {
      var mult = getUpgradeMult(btn.id);
      var isOrdMult = mult instanceof OrdinalNumber;
      var multGt1 = isOrdMult ? mult.gt(1) : mult > 1;
      var baseCost = btn.costFn();

      if (G.costsFrozen && G._frozenCosts && G._frozenCosts[btn.id] !== undefined) {
        baseCost = G._frozenCosts[btn.id];
      }

      var cost;
      if (btn.isMagic) {
        cost = baseCost;
      } else if (G.costsFrozen) {
        if (isOrdMult) {
          cost = baseCost instanceof OrdinalNumber ? baseCost.mul(mult) : mult.mul(baseCost);
        } else {
          cost = baseCost instanceof OrdinalNumber ? baseCost.mul(mult) : baseCost * mult;
        }
      } else if (!multGt1) {
        cost = baseCost;
      } else {
        var rate = (btn.s === "army") ? 1.04 : 1.02;
        cost = compoundedCost(baseCost instanceof OrdinalNumber ? baseCost.toNumber() : baseCost, rate, mult);
      }

      if (btn.isMagic) {
        if (G.magic >= cost) {
          logClick(btn.id);
          G.magic -= cost;
          btn.effectFn();
        }
      } else {
        if (G.coins.gte(cost)) {
          logClick(btn.id);
          G.coins = G.coins.sub(cost);
          btn.effectFn(mult);
        }
      }
      updateUI();
    });

    row.appendChild(el);

    c.appendChild(row);
    btnEls[btn.id] = { row: row, el: el };
  });
}

// UPDATE UI
function updateUI() {
  var tn = getTN(), gn = getGN(), tpow = tp();

  if (tn !== G._troopName) {
    log("Your troops evolve into " + tn + ".", "milestone");
    G._troopName = tn;
    document.getElementById("troopIcon").src = getTroopIcon(tn);
  }
  if (gn !== G._groupName) {
    log("Your force becomes a " + gn + ".", "milestone");
    G._groupName = gn;
  }

  var notation = G.coins.notationName();
  if (notation !== G._notation) {
    log("Notation shifts to " + notation + ". Numbers strain against comprehension.", "milestone");
    G._notation = notation;
  }

  applyScheme(log);
  document.getElementById("coinCount").textContent = fmt(G.coins);

  // Food display (hidden when eternal feast is active)
  if (G.eternalFeast) {
    document.getElementById("foodBox").style.display = "none";
    document.getElementById("economyCol").style.display = "none";
  } else {
    document.getElementById("foodBox").style.display = "flex";
    document.getElementById("economyCol").style.display = "";
    document.getElementById("foodCount").textContent = fmt(G.food);
    var farmProduction = cnt("farm") * C.farm_production;
    var troopConsumption = G.troops.toNumber() * C.food_perTroopDay;
    var foodBalance = farmProduction - troopConsumption;
    var balanceStr = (foodBalance >= 0 ? "+" : "-") + fmt(Math.abs(Math.floor(foodBalance))) + "/day";
    document.getElementById("foodSub").textContent = balanceStr;
    document.getElementById("foodSub").style.color = foodBalance >= 0 ? "var(--growth)" : "var(--danger)";
  }

  document.getElementById("groupName").textContent = gn.toUpperCase();
  document.getElementById("troopLine").textContent = fmt(G.troops.floor()) + " " + troopName(G.troops, tn);
  document.getElementById("powerPerTroop").textContent = fmtP(G.ppt);
  document.getElementById("totalPower").textContent = fmt(tpow.floor());

  var lootPerTick = tpow.mul(C.lootBase).floor();
  if (lootPerTick.lt(1)) lootPerTick = ON(1);
  var lootMult = getUpgradeMult('loot');
  var lootPerSec = lootPerTick.mul(lootMult).mul(4);
  document.getElementById("coinSub").textContent = G.troops.lt(1) ? "No troops!" : "+" + fmt(lootPerSec) + "/sec";

  // Recruit button
  var recruitMult = getUpgradeMult('recruit');
  var recruitMultIsOrd = recruitMult instanceof OrdinalNumber;
  var recruitMultGt1 = recruitMultIsOrd ? recruitMult.gt(1) : recruitMult > 1;
  var recruitBaseCost = G.costsFrozen && G._frozenCosts && G._frozenCosts['recruit'] ? G._frozenCosts['recruit'] : rCost();
  var recruitDisplayCost;
  if (!recruitMultGt1) {
    recruitDisplayCost = recruitBaseCost;
  } else if (G.costsFrozen) {
    recruitDisplayCost = recruitMultIsOrd ? ON(recruitBaseCost).mul(recruitMult) : recruitBaseCost * recruitMult;
  } else {
    recruitDisplayCost = compoundedCost(recruitBaseCost, 1.02, recruitMult);
  }
  var recruitBtn = document.getElementById("recruitBtn");
  recruitBtn.disabled = G.coins.lt(recruitDisplayCost);
  recruitBtn.classList.toggle("upgraded", recruitMultGt1);
  var rpIsOrd = G.rp instanceof OrdinalNumber;
  var recruitCount = (rpIsOrd || recruitMultIsOrd) ? ON(G.rp).mul(recruitMult) : G.rp * recruitMult;
  var recruitMultStr = recruitMultIsOrd ? recruitMult.format() : recruitMult;
  var recruitSubText = (recruitMultGt1 ? recruitMultStr + "x: " : "") + fmt(recruitCount) + " " + troopName(recruitCount, tn).toLowerCase() + " \u00b7 " + fmt(recruitDisplayCost) + " coins";
  document.getElementById("recruitSub").textContent = recruitSubText;

  // Magic unlock
  if (!G.magicOn && G.coins.gte(C.magic_unlockTP)) {
    G.magicOn = true;
    log("Dark forces stir. Magic whispers...", "magic-msg");
  }
  document.getElementById("magicBox").classList.toggle("hidden", !G.magicOn);
  document.getElementById("magicSections").classList.toggle("visible", G.magicOn);
  if (G.magicOn) {
    document.getElementById("magicCount").textContent = fmt(G.magic);
    document.getElementById("lifetimeMagic").textContent = fmt(G.ltMagic);
  }

  // Training column visibility
  var tVis = BUTTONS.some(function(b) { return b.s === "training" && b.showFn(); });
  document.getElementById("trainingCol").style.display = tVis ? "" : "none";

  // Enemy display
  var showEnemy = G.difficulty && (G.difficulty !== 'practice' || G.darkRitualDays.length > 0);
  if (showEnemy) {
    // Check for permanent surrender
    if (G.enemySurrendered) {
      document.getElementById("enemyTroops").textContent = "\ud83c\udff3\ufe0f SURRENDERED";
      document.getElementById("enemyTroops").style.whiteSpace = "normal";
      document.getElementById("enemyTroopType").style.display = "none";
      document.getElementById("enemyPower").textContent = "0";
      document.getElementById("dayCounter").textContent = G.day;
      var aiStatsDiv = document.getElementById("aiStats");
      if (aiStatsDiv) aiStatsDiv.style.display = "none";
    } else {
    var enemyTroopName = "Troops";
    if (isAIMode() && G.ai) {
      enemyTroopName = getTN(G.ai.ppt);
    } else {
      var modeNames = { easy: "Pikemen", medium: "Knights", hard: "Dragons", practice: "Troops" };
      enemyTroopName = modeNames[G.difficulty] || "Troops";
    }

    var hasDragons = G.dragonCohorts.length > 0;
    var hasTroops = G.enemyTroops.gte(1);

    // Build dragon groups first
    var typeGroups = {};
    if (hasDragons) {
      for (var c = 0; c < G.dragonCohorts.length; c++) {
        var cohort = G.dragonCohorts[c];
        if (cohort.count.gte(1)) {
          var typeName = getTN(cohort.ppt);
          if (!typeGroups[typeName]) {
            typeGroups[typeName] = { count: ON(0), maxPpt: cohort.ppt };
          }
          typeGroups[typeName].count = typeGroups[typeName].count.add(cohort.count);
          if (cohort.ppt > typeGroups[typeName].maxPpt) {
            typeGroups[typeName].maxPpt = cohort.ppt;
          }
        }
      }
    }
    var typeNames = Object.keys(typeGroups).sort(function(a, b) {
      return typeGroups[b].maxPpt - typeGroups[a].maxPpt;
    });
    var hasDragonDisplay = typeNames.length > 0;

    // Build display string - skip "0 Troops" if only dragons
    var troopStr;
    if (hasTroops) {
      troopStr = fmt(G.enemyTroops) + " " + enemyTroopName;
      for (var t = 0; t < typeNames.length; t++) {
        var typeName = typeNames[t];
        troopStr += "\nand " + fmt(typeGroups[typeName].count) + " " + typeName;
      }
    } else if (hasDragonDisplay) {
      // Only dragons, no troops
      troopStr = fmt(typeGroups[typeNames[0]].count) + " " + typeNames[0];
      for (var t = 1; t < typeNames.length; t++) {
        var typeName = typeNames[t];
        troopStr += "\nand " + fmt(typeGroups[typeName].count) + " " + typeName;
      }
    } else {
      troopStr = fmt(G.enemyTroops) + " " + enemyTroopName;
    }
    document.getElementById("enemyTroops").textContent = troopStr;
    document.getElementById("enemyTroops").style.whiteSpace = "pre-line";
    document.getElementById("enemyTroopType").style.display = "none";
    document.getElementById("enemyPower").textContent = fmt(G.enemyPower);
    document.getElementById("dayCounter").textContent = G.day;

    // AI stats
    var aiStatsDiv = document.getElementById("aiStats");
    if (isAIMode() && G.ai) {
      aiStatsDiv.style.display = "block";
      document.getElementById("aiCoins").textContent = fmt(G.ai.coins);
      var aiFarms = G.ai.counts["farm"] || 0;
      var aiTroopCount = G.ai.troops.toNumber();
      var aiFarmProd = aiFarms * C.farm_production;
      var aiConsume = Math.floor(aiTroopCount * C.food_perTroopDay);
      var aiNetFood = aiFarmProd - aiConsume;
      document.getElementById("aiFood").textContent = fmt(G.ai.food);
      document.getElementById("aiFoodRate").textContent = (aiNetFood >= 0 ? "+" : "") + fmt(aiNetFood);
      var aiPlant = G.ai.counts["plantation"] || 0;
      var aiColony = G.ai.counts["colony"] || 0;
      var aiSL = G.ai.counts["squad_leader"] || 0;
      var aiBar = G.ai.counts["barracks"] || 0;
      var aiMB = G.ai.counts["military_base"] || 0;
      var aiKing = G.ai.counts["kingdom"] || 0;
      var aiEmp = G.ai.counts["empire"] || 0;
      var aiPlanet = G.ai.counts["planet"] || 0;
      var aiSolar = G.ai.counts["solar_system"] || 0;
      var aiGalaxy = G.ai.counts["galaxy"] || 0;
      var aiCluster = G.ai.counts["galaxy_cluster"] || 0;
      var aiSuper = G.ai.counts["supercluster"] || 0;
      var aiObs = G.ai.counts["observable_universe"] || 0;
      var aiFull = G.ai.counts["full_universe"] || 0;
      var aiQuantum = G.ai.counts["quantum_multiverse"] || 0;
      var aiCosmo = G.ai.counts["cosmological_multiverse"] || 0;
      var aiMath = G.ai.counts["mathematical_multiverse"] || 0;

      document.getElementById("aiFarms").textContent = fmt(aiFarms);
      document.getElementById("aiPlant").textContent = fmt(aiPlant);
      document.getElementById("aiColony").textContent = fmt(aiColony);
      document.getElementById("aiPpt").textContent = fmtP(G.ai.ppt);
      document.getElementById("aiSL").textContent = fmt(aiSL);
      document.getElementById("aiBar").textContent = fmt(aiBar);
      document.getElementById("aiMB").textContent = fmt(aiMB);
      document.getElementById("aiKing").textContent = fmt(aiKing);
      document.getElementById("aiEmp").textContent = fmt(aiEmp);
      document.getElementById("aiPlanet").textContent = fmt(aiPlanet);
      document.getElementById("aiSolar").textContent = fmt(aiSolar);
      document.getElementById("aiGalaxy").textContent = fmt(aiGalaxy);
      document.getElementById("aiCluster").textContent = fmt(aiCluster);
      document.getElementById("aiSuper").textContent = fmt(aiSuper);
      document.getElementById("aiObs").textContent = fmt(aiObs);
      document.getElementById("aiFull").textContent = fmt(aiFull);
      document.getElementById("aiQuantum").textContent = fmt(aiQuantum);
      document.getElementById("aiCosmo").textContent = fmt(aiCosmo);
      document.getElementById("aiMath").textContent = fmt(aiMath);

      document.getElementById("aiFarmsRow").style.display = aiFarms > 0 ? "" : "none";
      document.getElementById("aiPlantRow").style.display = aiPlant > 0 ? "" : "none";
      document.getElementById("aiColonyRow").style.display = aiColony > 0 ? "" : "none";
      document.getElementById("aiSLRow").style.display = aiSL > 0 ? "" : "none";
      document.getElementById("aiBarRow").style.display = aiBar > 0 ? "" : "none";
      document.getElementById("aiMBRow").style.display = aiMB > 0 ? "" : "none";
      document.getElementById("aiKingRow").style.display = aiKing > 0 ? "" : "none";
      document.getElementById("aiEmpRow").style.display = aiEmp > 0 ? "" : "none";
      document.getElementById("aiPlanetRow").style.display = aiPlanet > 0 ? "" : "none";
      document.getElementById("aiSolarRow").style.display = aiSolar > 0 ? "" : "none";
      document.getElementById("aiGalaxyRow").style.display = aiGalaxy > 0 ? "" : "none";
      document.getElementById("aiClusterRow").style.display = aiCluster > 0 ? "" : "none";
      document.getElementById("aiSuperRow").style.display = aiSuper > 0 ? "" : "none";
      document.getElementById("aiObsRow").style.display = aiObs > 0 ? "" : "none";
      document.getElementById("aiFullRow").style.display = aiFull > 0 ? "" : "none";
      document.getElementById("aiQuantumRow").style.display = aiQuantum > 0 ? "" : "none";
      document.getElementById("aiCosmoRow").style.display = aiCosmo > 0 ? "" : "none";
      document.getElementById("aiMathRow").style.display = aiMath > 0 ? "" : "none";
      document.getElementById("enemyTroopType").textContent = getTN(G.ai.ppt);
    } else {
      aiStatsDiv.style.display = "none";
    }
    } // end else (not surrendered)
  }

  // Update timer
  var days = G.day;
  var years = Math.floor(days / 365);
  var remainingDays = days % 365;
  if (years > 0) {
    document.getElementById("gameTimer").textContent = "Year " + years + ", Day " + remainingDays;
  } else {
    document.getElementById("gameTimer").textContent = "Day " + days;
  }

  // Update buttons
  BUTTONS.forEach(function(btn) {
    var r = btnEls[btn.id];
    if (!r) return;
    var show = btn.showFn();
    r.row.classList.toggle("visible", show);
    if (!show) return;

    var baseCost = btn.costFn();
    if (G.costsFrozen && G._frozenCosts && G._frozenCosts[btn.id] !== undefined) {
      baseCost = G._frozenCosts[btn.id];
    }

    var mult = getUpgradeMult(btn.id);
    var isOrdMult = mult instanceof OrdinalNumber;
    var multGt1 = isOrdMult ? mult.gt(1) : mult > 1;
    var cost;
    if (btn.isMagic) {
      cost = baseCost;
    } else if (G.costsFrozen) {
      if (isOrdMult) {
        cost = baseCost instanceof OrdinalNumber ? baseCost.mul(mult) : mult.mul(baseCost);
      } else {
        cost = baseCost instanceof OrdinalNumber ? baseCost.mul(mult) : baseCost * mult;
      }
    } else if (!multGt1) {
      cost = baseCost;
    } else {
      var rate = (btn.s === "army") ? 1.04 : 1.02;
      cost = compoundedCost(baseCost instanceof OrdinalNumber ? baseCost.toNumber() : baseCost, rate, mult);
    }

    var displayCost = btn.displayCost !== undefined ? btn.displayCost : cost;
    var afford = btn.isMagic ? G.magic >= displayCost : G.coins.gte(displayCost);
    r.el.disabled = !afford;
    r.el.classList.toggle("upgraded", multGt1 && !btn.isMagic);

    var desc = btn.descFn ? btn.descFn() : (btn.desc || "");
    var multStr = isOrdMult ? mult.format() : mult;
    if (multGt1 && !btn.isMagic) desc = multStr + "x: " + desc;
    r.el.querySelector(".btn-desc").textContent = desc;

    var costStr = displayCost instanceof OrdinalNumber ? fmt(displayCost) : fmt(Math.ceil(displayCost));
    r.el.querySelector(".btn-cost").textContent = (btn.isMagic ? costStr + " magic" : costStr + " coins");
    var c = cnt(btn.id);
    var hasCount = c instanceof OrdinalNumber ? c.gt(0) : c > 0;
    document.getElementById("cnt_" + btn.id).textContent = hasCount ? fmt(c) + " " + (btn.cw || "") : "";
  });

  // Update log count
  document.getElementById("logCount").textContent = G.clickLog.length;

  // Show leaderboard button once game has started
  var lbBtn = document.getElementById("leaderboardBtn");
  if (lbBtn && G.gameStarted) {
    lbBtn.style.display = "inline";
  }
}

// Pre-sort time events
var TIME_EVENTS = [];
var COND_EVENTS = [];
(function() {
  for (var i = 0; i < FLAVOR_EVENTS.length; i++) {
    var ev = FLAVOR_EVENTS[i];
    if (ev.t !== undefined) TIME_EVENTS.push(ev);
  }
  TIME_EVENTS.sort(function(a, b) { return a.t - b.t; });
})();
var _nextTimeEvent = 0;
var _condEventsCache = null;

function checkFlavorEvents() {
  var now = Date.now();
  if (now - G._lastEventTime < 5000) return;

  var elapsed = G.day;

  // Check time events
  if (_nextTimeEvent < TIME_EVENTS.length) {
    var ev = TIME_EVENTS[_nextTimeEvent];
    if (elapsed >= ev.t) {
      log(ev.msg);
      G._lastEventTime = now;
      _nextTimeEvent++;
      return;
    }
  }

  // Check condition events (lazy init)
  if (!_condEventsCache) {
    _condEventsCache = getConditionEvents(G, tp, cnt, function() { return Math.min(G.ltMagic, C.entropy_max); });
  }

  // Cache troop name once per event check cycle (avoid calling getTN() for every event)
  var _cachedTroopName = getTN();

  // Check milestone condition events (from getConditionEvents) - up to 5
  var startIdx = Math.floor(Math.random() * _condEventsCache.length);
  for (var i = 0; i < 5; i++) {
    var idx = (startIdx + i) % _condEventsCache.length;
    var ev = _condEventsCache[idx];
    var key = ev.msg.substring(0, 30);
    if (G._shownEvents.has(key)) continue;
    if (ev.cond(_cachedTroopName)) {
      log(ev.msg);
      G._shownEvents.add(key);
      G._lastEventTime = now;
      return;
    }
  }

  // Handle random events from FLAVOR_EVENTS with single-roll selection
  // 1. Filter to random events whose condition passes (troop type check, etc.)
  var eligible = [];
  for (var i = 0; i < FLAVOR_EVENTS.length; i++) {
    var ev = FLAVOR_EVENTS[i];
    if (ev.random && ev.cond(_cachedTroopName)) {
      eligible.push(ev);
    }
  }

  // 2. Single roll to pick one (or none)
  if (eligible.length > 0) {
    var roll = Math.random();
    var threshold = 0;
    for (var i = 0; i < eligible.length; i++) {
      var chance = eligible[i].chance || 0.02; // Default 2% if not specified
      threshold += chance;
      if (roll < threshold) {
        log(eligible[i].msg);
        G._lastEventTime = now;
        return;
      }
    }
  }
}
