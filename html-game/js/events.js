// ================================================================
//  EVENT HANDLERS - Click handlers, modals, difficulty selection
// ================================================================

// Modal state
var currentModalMode = null;

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("visible");
  currentModalMode = null;
}

function openUpgradeModal() {
  currentModalMode = 'upgrade';
  document.getElementById("modalTitle").textContent = "Upgrade Button (10x power, 10x cost)";
  var container = document.getElementById("modalButtons");
  container.innerHTML = '';

  // Upgradeable buttons
  var upgradeableIds = ['loot', 'recruit', 'train', 'squad_leader', 'barracks', 'military_base', 'kingdom', 'empire', 'farm', 'plantation', 'colony'];

  if (G.astronomicalUnlocked) {
    upgradeableIds = upgradeableIds.concat(['planet', 'solar_system', 'galaxy', 'galaxy_cluster', 'supercluster']);
  }
  if (G.multiversalUnlocked) {
    upgradeableIds = upgradeableIds.concat(['observable_universe', 'full_universe', 'quantum_multiverse', 'cosmological_multiverse', 'mathematical_multiverse']);
  }
  if (G.mysticalUnlocked) {
    upgradeableIds = upgradeableIds.concat(['sapphire', 'emerald', 'ruby']);
  }
  // Add installed auto-upgraders
  Object.keys(G.autoUpgraders).forEach(function(id) {
    if (G.autoUpgraders[id] && !G.autoUpgraders['auto_' + id]) {
      upgradeableIds.push('auto_' + id);
    }
  });

  upgradeableIds.forEach(function(id) {
    var name = id.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var btn = BUTTONS.find(function(b) { return b.id === id; });
    if (btn) name = btn.name;

    var desc = '';
    if (id === 'loot') desc = '<div style="font-size:.85em;opacity:.7;margin-top:2px">Passive coin income (\u00d710 per upgrade)</div>';
    var isAutoUpgrader = id.startsWith('auto_');
    if (isAutoUpgrader) {
      var targetId = id.replace(/^(auto_)+/, '');
      var targetBtn = BUTTONS.find(function(b) { return b.id === targetId; });
      var targetName = targetBtn ? targetBtn.name : targetId.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      var autoCount = (id.match(/auto_/g) || []).length;
      var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
      var sup = autoCount < 10 ? superscripts[autoCount] : '^' + autoCount;
      name = '\u26a1' + sup + ' ' + targetName;
      desc = '<div style="font-size:.85em;opacity:.7;margin-top:2px">Upgrade auto-upgrader power (\u00d710 per upgrade)</div>';
    }

    var level = G.upgradeLevels[id] || 0;
    var mult = fmtMult(level);

    var el = document.createElement("button");
    el.className = "modal-btn" + (level > 0 ? " upgraded" : "");
    el.innerHTML = name + '<span class="upgrade-level">' + (level > 0 ? mult + 'x' : '\u2014') + '</span>' + desc;
    el.addEventListener("click", function() {
      if (G.magic < 1) {
        log("Not enough magic!", "danger-msg");
        return;
      }
      G.magic -= 1;
      G.upgradeLevels[id] = (G.upgradeLevels[id] || 0) + 1;
      var newMult = fmtMult(G.upgradeLevels[id]);
      log("\u2b06 " + name + " upgraded to " + newMult + "x!", "magic-msg");
      closeModal();
      updateUI();
    });
    container.appendChild(el);
  });

  document.getElementById("modalOverlay").classList.add("visible");
}

function openAutoUpgraderModal() {
  currentModalMode = 'auto-upgrader';
  document.getElementById("modalTitle").textContent = "Install Auto-Upgrader (costs Googol per use)";
  var container = document.getElementById("modalButtons");
  container.innerHTML = '';

  // Show buttons with 3+ upgrades that don't already have auto-upgrader
  Object.keys(G.upgradeLevels).forEach(function(id) {
    if (G.upgradeLevels[id] >= 3 && !G.autoUpgraders[id]) {
      var name = id.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      var btn = BUTTONS.find(function(b) { return b.id === id; });
      if (btn) name = btn.name;

      var isAutoUpgrader = id.startsWith('auto_');
      if (isAutoUpgrader) {
        var autoCount = (id.match(/auto_/g) || []).length;
        var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
        var sup = autoCount < 10 ? superscripts[autoCount] : '^' + autoCount;
        var targetId = id.replace(/^(auto_)+/, '');
        var targetBtn = BUTTONS.find(function(b) { return b.id === targetId; });
        var targetName = targetBtn ? targetBtn.name : targetId.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        name = '\u26a1' + sup + ' ' + targetName;
      }

      var el = document.createElement("button");
      el.className = "modal-btn";
      el.innerHTML = name + ' <span style="color:var(--dim)">(' + G.upgradeLevels[id] + ' upgrades) \u2014 1 Googol</span>';
      el.addEventListener("click", function() {
        if (G.magic < 10) {
          log("Not enough magic!", "danger-msg");
          return;
        }
        G.magic -= 10;
        G.autoUpgraders[id] = true;
        var tierNum = isAutoUpgrader ? ((id.match(/auto_/g) || []).length + 1) : 1;
        var logMsg = isAutoUpgrader ? "\u26a1 Auto" + tierNum + " installed on " + name + "!" : "\u26a1 Auto-upgrader installed on " + name + "!";
        log(logMsg, "magic-msg");
        closeModal();
        updateUI();
      });
      container.appendChild(el);
    }
  });

  if (container.children.length === 0) {
    container.innerHTML = '<div style="color:var(--dim);padding:10px">No eligible buttons. Need 3+ upgrades and no existing auto-upgrader.</div>';
  }

  document.getElementById("modalOverlay").classList.add("visible");
}

// Main auto-upgrader wrappers
var mainAutoWrappers = {};
var mainAutoTiers = { recruit: {}, loot: {} };

function ensureMainAutoTierButton(btnId, tier) {
  if (mainAutoTiers[btnId][tier]) return;

  var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
  var sup = tier < 10 ? superscripts[tier] : '^' + tier;

  var autoBtn = document.createElement("button");
  autoBtn.className = "main-btn auto-upgrade-btn";
  autoBtn.id = 'auto' + tier + '_' + btnId;
  autoBtn.style.display = "none";
  autoBtn.innerHTML = '\u26a1' + sup;

  var targetId = btnId;
  for (var i = 1; i < tier; i++) targetId = 'auto_' + targetId;
  var nextTierId = 'auto_' + targetId;

  autoBtn.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var tierMult = getUpgradeMult(nextTierId);
      G.upgradeLevels[targetId] = (G.upgradeLevels[targetId] || 0) + tierMult;
      log("\u26a1" + sup + " " + btnId + " upgraded to " + fmtMult(G.upgradeLevels[targetId]) + "x!" + (tierMult > 1 ? " (+" + tierMult + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  if (mainAutoWrappers[btnId]) {
    mainAutoWrappers[btnId].appendChild(autoBtn);
  }
  mainAutoTiers[btnId][tier] = autoBtn;
}

function createMainAutoUpgraders() {
  // Recruit auto-upgrader
  var recruitAuto = document.createElement("button");
  recruitAuto.className = "main-btn auto-upgrade-btn";
  recruitAuto.id = "auto_recruit";
  recruitAuto.style.display = "none";
  recruitAuto.style.marginLeft = "10px";
  recruitAuto.style.width = "auto";
  recruitAuto.style.flex = "0";
  recruitAuto.innerHTML = '\u26a1 Upgrade';
  recruitAuto.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var autoMult = getUpgradeMult('auto_recruit');
      var oldLvl = G.upgradeLevels['recruit'] || 0;
      if (autoMult instanceof OrdinalNumber) {
        var newLvl = autoMult.add(ON(oldLvl));
        G.upgradeLevels['recruit'] = newLvl.layer === 0 ? newLvl.value : newLvl.toNumber();
      } else {
        G.upgradeLevels['recruit'] = oldLvl + autoMult;
      }
      var autoMultGt1 = autoMult instanceof OrdinalNumber ? autoMult.gt(1) : autoMult > 1;
      var multStr = autoMult instanceof OrdinalNumber ? autoMult.format() : autoMult;
      log("\u26a1 Recruit upgraded to " + fmtMult(G.upgradeLevels['recruit']) + "x!" + (autoMultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  var recruitAuto2 = document.createElement("button");
  recruitAuto2.className = "main-btn auto-upgrade-btn";
  recruitAuto2.id = "auto2_recruit";
  recruitAuto2.style.display = "none";
  recruitAuto2.innerHTML = '\u26a1\u00b2';
  recruitAuto2.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var auto2Mult = getUpgradeMult('auto_auto_recruit');
      var oldLvl = G.upgradeLevels['auto_recruit'] || 0;
      if (auto2Mult instanceof OrdinalNumber) {
        var newLvl = auto2Mult.add(ON(oldLvl));
        G.upgradeLevels['auto_recruit'] = newLvl.layer === 0 ? newLvl.value : newLvl.toNumber();
      } else {
        G.upgradeLevels['auto_recruit'] = oldLvl + auto2Mult;
      }
      var auto2MultGt1 = auto2Mult instanceof OrdinalNumber ? auto2Mult.gt(1) : auto2Mult > 1;
      var multStr = auto2Mult instanceof OrdinalNumber ? auto2Mult.format() : auto2Mult;
      log("\u26a1\u00b2 Auto-Recruit upgraded to " + fmtMult(G.upgradeLevels['auto_recruit']) + "x!" + (auto2MultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  var recruitBtn = document.getElementById("recruitBtn");
  var wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.gap = "8px";
  wrapper.style.marginBottom = "8px";
  wrapper.style.flexWrap = "wrap";
  recruitBtn.parentNode.insertBefore(wrapper, recruitBtn);
  recruitBtn.style.marginBottom = "0";
  wrapper.appendChild(recruitBtn);
  wrapper.appendChild(recruitAuto);
  wrapper.appendChild(recruitAuto2);
  mainAutoWrappers.recruit = wrapper;

  // Loot auto-upgrader
  var lootAuto = document.createElement("button");
  lootAuto.className = "main-btn auto-upgrade-btn";
  lootAuto.id = "auto_loot";
  lootAuto.style.display = "none";
  lootAuto.innerHTML = '\u26a1 Loot 10x';
  lootAuto.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var autoMult = getUpgradeMult('auto_loot');
      var oldLvl = G.upgradeLevels['loot'] || 0;
      if (autoMult instanceof OrdinalNumber) {
        var newLvl = autoMult.add(ON(oldLvl));
        G.upgradeLevels['loot'] = newLvl.layer === 0 ? newLvl.value : newLvl.toNumber();
      } else {
        G.upgradeLevels['loot'] = oldLvl + autoMult;
      }
      var autoMultGt1 = autoMult instanceof OrdinalNumber ? autoMult.gt(1) : autoMult > 1;
      var multStr = autoMult instanceof OrdinalNumber ? autoMult.format() : autoMult;
      log("\u26a1 Loot upgraded to " + fmtMult(G.upgradeLevels['loot']) + "x!" + (autoMultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  var lootAuto2 = document.createElement("button");
  lootAuto2.className = "main-btn auto-upgrade-btn";
  lootAuto2.id = "auto2_loot";
  lootAuto2.style.display = "none";
  lootAuto2.innerHTML = '\u26a1\u00b2';
  lootAuto2.addEventListener("click", function() {
    if (G.coins.gte(googol())) {
      G.coins = G.coins.sub(googol());
      var auto2Mult = getUpgradeMult('auto_auto_loot');
      var oldLvl = G.upgradeLevels['auto_loot'] || 0;
      if (auto2Mult instanceof OrdinalNumber) {
        var newLvl = auto2Mult.add(ON(oldLvl));
        G.upgradeLevels['auto_loot'] = newLvl.layer === 0 ? newLvl.value : newLvl.toNumber();
      } else {
        G.upgradeLevels['auto_loot'] = oldLvl + auto2Mult;
      }
      var auto2MultGt1 = auto2Mult instanceof OrdinalNumber ? auto2Mult.gt(1) : auto2Mult > 1;
      var multStr = auto2Mult instanceof OrdinalNumber ? auto2Mult.format() : auto2Mult;
      log("\u26a1\u00b2 Auto-Loot upgraded to " + fmtMult(G.upgradeLevels['auto_loot']) + "x!" + (auto2MultGt1 ? " (+" + multStr + " levels)" : ""), "magic-msg");
      updateUI();
    }
  });

  var begBtn = document.getElementById("begBtn");
  var lootWrapper = document.createElement("div");
  lootWrapper.style.display = "flex";
  lootWrapper.style.gap = "8px";
  lootWrapper.style.marginBottom = "8px";
  lootWrapper.style.flexWrap = "wrap";
  begBtn.parentNode.insertBefore(lootWrapper, begBtn);
  lootWrapper.appendChild(begBtn);
  lootWrapper.appendChild(lootAuto);
  lootWrapper.appendChild(lootAuto2);
  mainAutoWrappers.loot = lootWrapper;
}

function updateMainAutoUpgraders() {
  // Recruit auto-upgrader
  var recruitEl = document.getElementById("auto_recruit");
  if (recruitEl) {
    var show = G.autoUpgraders['recruit'];
    recruitEl.style.display = show ? "inline-block" : "none";
    if (show) {
      recruitEl.disabled = !G.coins.gte(googol());
      var autoLvl = G.upgradeLevels['auto_recruit'] || 0;
      var currLvl = G.upgradeLevels['recruit'] || 0;
      // Handle OrdinalNumber levels
      var autoIsON = autoLvl instanceof OrdinalNumber;
      var currIsON = currLvl instanceof OrdinalNumber;
      var addLvls = autoIsON ? autoLvl.format() : (autoLvl > 300 ? "10^" + autoLvl : Math.pow(10, autoLvl));
      var nextMultStr;
      if (currIsON || autoIsON) {
        nextMultStr = currIsON ? currLvl.format() : fmtMult(currLvl);
      } else {
        var nextLvl = autoLvl > 50 ? currLvl + "+" + addLvls : currLvl + Math.pow(10, autoLvl);
        nextMultStr = typeof nextLvl === 'number' ? fmtMult(nextLvl) : "10^(" + nextLvl + ")";
      }
      var levelInfo = (autoLvl > 0 || autoIsON) ? ' (+' + addLvls + ')' : '';
      recruitEl.innerHTML = '\u26a1 ' + nextMultStr + 'x' + levelInfo + '<div style="font-size:.85em;opacity:.7">1 Googol</div>';
    }
  }

  // Loot auto-upgrader
  var lootEl = document.getElementById("auto_loot");
  var begBtn = document.getElementById("begBtn");
  if (lootEl) {
    var showLoot = G.autoUpgraders['loot'];
    lootEl.style.display = showLoot ? "inline-block" : "none";
    begBtn.style.display = showLoot ? "none" : "inline-block";
    if (showLoot) {
      lootEl.disabled = !G.coins.gte(googol());
      var lootAutoLvl = G.upgradeLevels['auto_loot'] || 0;
      var lootCurrLvl = G.upgradeLevels['loot'] || 0;
      // Handle OrdinalNumber levels
      var lootAutoIsON = lootAutoLvl instanceof OrdinalNumber;
      var lootCurrIsON = lootCurrLvl instanceof OrdinalNumber;
      var lootAddLvls = lootAutoIsON ? lootAutoLvl.format() : (lootAutoLvl > 300 ? "10^" + lootAutoLvl : Math.pow(10, lootAutoLvl));
      var lootNextMultStr;
      if (lootCurrIsON || lootAutoIsON) {
        // When either is OrdinalNumber, just show current level format
        lootNextMultStr = lootCurrIsON ? lootCurrLvl.format() : fmtMult(lootCurrLvl);
      } else {
        var lootNextLvl = lootAutoLvl > 50 ? lootCurrLvl + "+" + lootAddLvls : lootCurrLvl + Math.pow(10, lootAutoLvl);
        lootNextMultStr = typeof lootNextLvl === 'number' ? fmtMult(lootNextLvl) : "10^(" + lootNextLvl + ")";
      }
      var lootLevelInfo = (lootAutoLvl > 0 || lootAutoIsON) ? ' (+' + lootAddLvls + ')' : '';
      lootEl.innerHTML = '\u26a1 Loot ' + lootNextMultStr + 'x' + lootLevelInfo + '<div style="font-size:.85em;opacity:.7">1 Googol</div>';
    }
  }

  // Auto² buttons
  var recruitAuto2El = document.getElementById("auto2_recruit");
  if (recruitAuto2El) {
    var showRecruit2 = G.autoUpgraders['auto_recruit'];
    recruitAuto2El.style.display = showRecruit2 ? "inline-block" : "none";
    if (showRecruit2) {
      recruitAuto2El.disabled = !G.coins.gte(googol());
      var r2Lvl = G.upgradeLevels['auto_recruit'] || 0;
      var r2NextMult = fmtMult(r2Lvl + 1);
      recruitAuto2El.innerHTML = '\u26a1\u00b2 ' + r2NextMult + 'x<div style="font-size:.85em;opacity:.7">1 Googol</div>';
    }
  }

  var lootAuto2El = document.getElementById("auto2_loot");
  if (lootAuto2El) {
    var showLoot2 = G.autoUpgraders['auto_loot'];
    lootAuto2El.style.display = showLoot2 ? "inline-block" : "none";
    if (showLoot2) {
      lootAuto2El.disabled = !G.coins.gte(googol());
      var l2Lvl = G.upgradeLevels['auto_loot'] || 0;
      var l2NextMult = fmtMult(l2Lvl + 1);
      lootAuto2El.innerHTML = '\u26a1\u00b2 ' + l2NextMult + 'x<div style="font-size:.85em;opacity:.7">1 Googol</div>';
    }
  }

  // Higher tiers
  var superscripts = ['', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
  ['recruit', 'loot'].forEach(function(btnId) {
    for (var tier = 3; tier <= 9; tier++) {
      var checkKey = btnId;
      for (var t = 1; t < tier; t++) checkKey = 'auto_' + checkKey;

      var isInstalled = G.autoUpgraders[checkKey];
      if (!isInstalled) break;

      ensureMainAutoTierButton(btnId, tier);
      var tierBtn = mainAutoTiers[btnId][tier];
      if (tierBtn) {
        tierBtn.style.display = "inline-block";
        tierBtn.disabled = !G.coins.gte(googol());

        var sup = tier < 10 ? superscripts[tier] : '^' + tier;
        var targetId = btnId;
        for (var tt = 1; tt < tier; tt++) targetId = 'auto_' + targetId;
        var tierLvl = G.upgradeLevels[targetId] || 0;
        var tierNextMult = fmtMult(tierLvl + 1);
        tierBtn.innerHTML = '\u26a1' + sup + ' ' + tierNextMult + 'x<div style="font-size:.85em;opacity:.7">1 Googol</div>';
      }
    }
  });
}

function setupEventListeners() {
  // Modal close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
  });

  // Beg button
  document.getElementById("begBtn").addEventListener("click", function() {
    G.coins = G.coins.add(1);
    document.getElementById("coinCount").textContent = fmt(G.coins);
    updateUI();
  });

  // Recruit button
  document.getElementById("recruitBtn").addEventListener("click", function() {
    var mult = getUpgradeMult('recruit');
    var baseCost = rCost();
    var totalCost;
    if (G.costsFrozen && G._frozenCosts && G._frozenCosts['recruit']) {
      totalCost = G._frozenCosts['recruit'] * mult;
    } else if (mult <= 1) {
      totalCost = baseCost;
    } else {
      totalCost = compoundedCost(baseCost, 1.02, mult);
    }
    if (G.coins.gte(totalCost)) {
      logClick("recruit");
      G.coins = G.coins.sub(totalCost);
      G.troops = G.troops.add(G.rp * mult);
      G.counts["recruit"] = (G.counts["recruit"] || 0) + mult;
      updateUI();
    }
  });

  // Difficulty selection
  document.querySelectorAll(".difficulty-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var mode = btn.getAttribute("data-mode");
      G.difficulty = mode;
      G.gameStarted = true;
      G.startTime = Date.now();
      document.getElementById("difficultyOverlay").classList.add("hidden");

      if (mode === 'practice') {
        document.getElementById("enemyCol").style.display = "none";
        log("Practice mode. No enemies - take your time.");
      } else if (mode.startsWith('ai')) {
        var aiCps = parseInt(mode.substring(2)) || 10;
        document.getElementById("enemyCol").style.display = "block";
        document.getElementById("aiStats").style.display = "block";
        document.getElementById("enemyName").textContent = "AI Opponent (" + aiCps + " cps)";
        document.getElementById("enemyTroopType").textContent = "Thugs";
        document.getElementById("battleChance").textContent = "3";
        G.ai = createAIState();
        log("AI MODE: You vs AI at " + aiCps + " clicks/sec! Battle chance: 3%/day.", "danger-msg");
      } else {
        document.getElementById("enemyCol").style.display = "block";
        document.getElementById("aiStats").style.display = "none";
        var enemyNames = { easy: "Town Police Force", medium: "Imperial Forces", hard: "Forces of Dark Lord" };
        var enemyTroopTypes = { easy: "Pikemen", medium: "Knights", hard: "Dragons" };
        var battleChances = { easy: 1, medium: 2, hard: 3 };
        document.getElementById("enemyName").textContent = enemyNames[mode];
        document.getElementById("enemyTroopType").textContent = enemyTroopTypes[mode];
        document.getElementById("battleChance").textContent = battleChances[mode];
        log("Battle begins against " + enemyNames[mode] + "!");
        if (mode === 'easy') log("Enemy gains 1 Pikeman per day. Battle chance: 1%/day.", "danger-msg");
        if (mode === 'medium') log("Enemy gains X Knights on day X. Battle chance: 2%/day.", "danger-msg");
        if (mode === 'hard') log("Enemy gains X\u00b2 Dragons on day X. Battle chance: 3%/day.", "danger-msg");
      }
      updateUI();
    });
  });

  // Export log button
  var exportBtn = document.getElementById("exportLogBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function() {
      if (window.exportLog) exportLog();
    });
  }
}
