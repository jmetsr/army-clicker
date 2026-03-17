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

    // Auto-upgrader button
    var autoBtn = document.createElement("button");
    autoBtn.className = "game-btn auto-upgrade-btn";
    autoBtn.id = "auto_" + btn.id;
    autoBtn.style.display = "none";
    autoBtn.innerHTML = '<span class="btn-name">\u26a1 Auto-Upgrade</span><div class="btn-cost">1 Googol</div>';
    autoBtn.addEventListener("click", function() {
      if (G.coins.gte(googol())) {
        G.coins = G.coins.sub(googol());
        var autoMult = getUpgradeMult('auto_' + btn.id);
        var oldLvl = G.upgradeLevels[btn.id] || 0;
        // Add levels - handle OrdinalNumber autoMult
        if (autoMult instanceof OrdinalNumber) {
          var newLvl = autoMult.add(ON(oldLvl));
          G.upgradeLevels[btn.id] = newLvl.layer === 0 ? newLvl.value : newLvl;
        } else {
          G.upgradeLevels[btn.id] = oldLvl instanceof OrdinalNumber ? oldLvl.add(autoMult) : oldLvl + autoMult;
        }
        var autoMultGt1 = autoMult instanceof OrdinalNumber ? autoMult.gt(1) : autoMult > 1;
        var multStr = autoMult instanceof OrdinalNumber ? autoMult.format() : autoMult;
        log("\u26a1 " + btn.name + " upgraded to " + fmtMult(G.upgradeLevels[btn.id]) + "x!" + (autoMultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
        updateUI();
      }
    });
    row.appendChild(autoBtn);

    // Auto² button
    var auto2Btn = document.createElement("button");
    auto2Btn.className = "game-btn auto-upgrade-btn";
    auto2Btn.id = "auto2_" + btn.id;
    auto2Btn.style.display = "none";
    auto2Btn.innerHTML = '<span class="btn-name">\u26a1\u00b2</span><div class="btn-cost">1 Googol</div>';
    auto2Btn.addEventListener("click", function() {
      if (G.coins.gte(googol())) {
        G.coins = G.coins.sub(googol());
        var auto2Mult = getUpgradeMult('auto_auto_' + btn.id);
        var oldLvl = G.upgradeLevels['auto_' + btn.id] || 0;
        // Add levels - handle OrdinalNumber auto2Mult
        if (auto2Mult instanceof OrdinalNumber) {
          var newLvl = auto2Mult.add(ON(oldLvl));
          G.upgradeLevels['auto_' + btn.id] = newLvl.layer === 0 ? newLvl.value : newLvl;
        } else {
          G.upgradeLevels['auto_' + btn.id] = oldLvl instanceof OrdinalNumber ? oldLvl.add(auto2Mult) : oldLvl + auto2Mult;
        }
        var auto2MultGt1 = auto2Mult instanceof OrdinalNumber ? auto2Mult.gt(1) : auto2Mult > 1;
        var multStr = auto2Mult instanceof OrdinalNumber ? auto2Mult.format() : auto2Mult;
        log("\u26a1\u00b2 Auto-" + btn.name + " upgraded to " + fmtMult(G.upgradeLevels['auto_' + btn.id]) + "x!" + (auto2MultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
        updateUI();
      }
    });
    row.appendChild(auto2Btn);

    c.appendChild(row);
    btnEls[btn.id] = { row: row, el: el, autoBtn: autoBtn, auto2Btn: auto2Btn, autoTiers: {} };
  });
}

// Create auto-tier button dynamically
function ensureAutoTierButton(btnId, tier) {
  var r = btnEls[btnId];
  if (!r) return;

  var tierId = 'auto' + tier + '_' + btnId;
  if (r.autoTiers[tier]) return;

  var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
  var sup = tier < 10 ? superscripts[tier] : '^' + tier;

  var autoBtn = document.createElement("button");
  autoBtn.className = "game-btn auto-upgrade-btn";
  autoBtn.id = tierId;
  autoBtn.style.display = "none";
  autoBtn.innerHTML = '<span class="btn-name">\u26a1' + sup + '</span><div class="btn-cost">1 Googol</div>';

  var targetId = btnId;
  for (var i = 1; i < tier; i++) targetId = 'auto_' + targetId;
  var nextTierId = 'auto_' + targetId;

  autoBtn.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var tierMult = getUpgradeMult(nextTierId);
      G.upgradeLevels[targetId] = (G.upgradeLevels[targetId] || 0) + tierMult;
      log("\u26a1" + sup + " upgraded to " + fmtMult(G.upgradeLevels[targetId]) + "x!" + (tierMult > 1 ? " (+" + tierMult + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  r.row.appendChild(autoBtn);
  r.autoTiers[tier] = autoBtn;
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

  // Food display
  document.getElementById("foodCount").textContent = fmt(G.food);
  var farmProduction = cnt("farm") * C.farm_production;
  if (G.eternalFeast) {
    document.getElementById("foodSub").textContent = "+" + fmt(farmProduction) + "/day (no consumption)";
    document.getElementById("foodSub").style.color = "var(--magic)";
    document.getElementById("economyCol").style.display = "none";
  } else {
    document.getElementById("economyCol").style.display = "";
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
  var recruitBaseCost = G.costsFrozen && G._frozenCosts && G._frozenCosts['recruit'] ? G._frozenCosts['recruit'] : rCost();
  var recruitDisplayCost;
  if (recruitMult <= 1) {
    recruitDisplayCost = recruitBaseCost;
  } else if (G.costsFrozen) {
    recruitDisplayCost = recruitBaseCost * recruitMult;
  } else {
    recruitDisplayCost = compoundedCost(recruitBaseCost, 1.02, recruitMult);
  }
  var recruitBtn = document.getElementById("recruitBtn");
  recruitBtn.disabled = G.coins.lt(recruitDisplayCost);
  recruitBtn.classList.toggle("upgraded", recruitMult > 1);
  var recruitCount = G.rp * recruitMult;
  var recruitSubText = (recruitMult > 1 ? recruitMult + "x: " : "") + fmt(recruitCount) + " " + troopName(recruitCount, tn).toLowerCase() + " \u00b7 " + fmt(recruitDisplayCost) + " coins";
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

    var troopStr = fmt(G.enemyTroops) + " " + enemyTroopName;
    if (G.dragonCohorts.length > 0) {
      var typeGroups = {};
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
      var typeNames = Object.keys(typeGroups).sort(function(a, b) {
        return typeGroups[b].maxPpt - typeGroups[a].maxPpt;
      });
      for (var t = 0; t < typeNames.length; t++) {
        var typeName = typeNames[t];
        troopStr += "\nand " + fmt(typeGroups[typeName].count) + " " + typeName;
      }
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

      document.getElementById("aiFarms").textContent = fmt(aiFarms);
      document.getElementById("aiPlant").textContent = fmt(aiPlant);
      document.getElementById("aiColony").textContent = fmt(aiColony);
      document.getElementById("aiPpt").textContent = fmtP(G.ai.ppt);
      document.getElementById("aiSL").textContent = fmt(aiSL);
      document.getElementById("aiBar").textContent = fmt(aiBar);
      document.getElementById("aiMB").textContent = fmt(aiMB);
      document.getElementById("aiKing").textContent = fmt(aiKing);
      document.getElementById("aiEmp").textContent = fmt(aiEmp);

      document.getElementById("aiFarmsRow").style.display = aiFarms > 0 ? "" : "none";
      document.getElementById("aiPlantRow").style.display = aiPlant > 0 ? "" : "none";
      document.getElementById("aiColonyRow").style.display = aiColony > 0 ? "" : "none";
      document.getElementById("aiSLRow").style.display = aiSL > 0 ? "" : "none";
      document.getElementById("aiBarRow").style.display = aiBar > 0 ? "" : "none";
      document.getElementById("aiMBRow").style.display = aiMB > 0 ? "" : "none";
      document.getElementById("aiKingRow").style.display = aiKing > 0 ? "" : "none";
      document.getElementById("aiEmpRow").style.display = aiEmp > 0 ? "" : "none";
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

    // Auto-upgrader buttons
    if (!btn.isMagic) {
      var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
      for (var tier = 1; tier <= 9; tier++) {
        var checkKey = btn.id;
        for (var t = 1; t < tier; t++) checkKey = 'auto_' + checkKey;

        var isInstalled = G.autoUpgraders[checkKey];
        if (!isInstalled) break;

        if (tier === 1 && r.autoBtn) {
          r.autoBtn.style.display = "inline-block";
          r.autoBtn.disabled = !G.coins.gte(googol());
          var autoLvl = G.upgradeLevels['auto_' + btn.id] || 0;
          var lvl = G.upgradeLevels[btn.id] || 0;
          var addLvls = autoLvl > 300 ? "10^" + autoLvl : Math.pow(10, autoLvl);
          var nextLvl = autoLvl > 50 ? lvl + "+" + addLvls : lvl + Math.pow(10, autoLvl);
          var nextMult = typeof nextLvl === 'number' ? fmtMult(nextLvl) : "10^(" + nextLvl + ")";
          var levelInfo = autoLvl > 0 ? ' (+' + addLvls + ')' : '';
          r.autoBtn.innerHTML = '<span class="btn-name">\u26a1 Upgrade (' + nextMult + 'x)' + levelInfo + '</span><div class="btn-cost">1 Googol</div>';
        } else if (tier === 2 && r.auto2Btn) {
          r.auto2Btn.style.display = "inline-block";
          r.auto2Btn.disabled = !G.coins.gte(googol());
          var auto2Lvl = G.upgradeLevels['auto_' + btn.id] || 0;
          var auto2NextMult = fmtMult(auto2Lvl + 1);
          r.auto2Btn.innerHTML = '<span class="btn-name">\u26a1\u00b2 (' + auto2NextMult + 'x)</span><div class="btn-cost">1 Googol</div>';
        } else if (tier >= 3) {
          ensureAutoTierButton(btn.id, tier);
          var tierBtn = r.autoTiers[tier];
          if (tierBtn) {
            tierBtn.style.display = "inline-block";
            tierBtn.disabled = !G.coins.gte(googol());
            var sup = tier < 10 ? superscripts[tier] : '^' + tier;
            var tierTargetId = btn.id;
            for (var tt = 1; tt < tier; tt++) tierTargetId = 'auto_' + tierTargetId;
            var tierLvl = G.upgradeLevels[tierTargetId] || 0;
            var tierNextMult = fmtMult(tierLvl + 1);
            tierBtn.innerHTML = '<span class="btn-name">\u26a1' + sup + ' (' + tierNextMult + 'x)</span><div class="btn-cost">1 Googol</div>';
          }
        }
      }
      if (!G.autoUpgraders[btn.id] && r.autoBtn) r.autoBtn.style.display = "none";
      if (!G.autoUpgraders['auto_' + btn.id] && r.auto2Btn) r.auto2Btn.style.display = "none";
    }
  });

  // Update log count
  document.getElementById("logCount").textContent = G.clickLog.length;

  // Update main auto-upgraders (recruit & loot)
  updateMainAutoUpgraders();
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

  var startIdx = Math.floor(Math.random() * _condEventsCache.length);
  for (var i = 0; i < 5; i++) {
    var idx = (startIdx + i) % _condEventsCache.length;
    var ev = _condEventsCache[idx];
    var key = ev.msg.substring(0, 30);
    if (G._shownEvents.has(key) && !ev.random) continue;
    if (ev.cond()) {
      log(ev.msg);
      if (!ev.random) G._shownEvents.add(key);
      G._lastEventTime = now;
      return;
    }
  }
}
