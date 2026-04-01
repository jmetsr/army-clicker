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

  // Astronomical tier - check individual unlocks or legacy full unlock
  if (G.planetUnlocked || G.astronomicalUnlocked) upgradeableIds.push('planet');
  if (G.solarSystemUnlocked || G.astronomicalUnlocked) upgradeableIds.push('solar_system');
  if (G.galaxyUnlocked || G.astronomicalUnlocked) upgradeableIds.push('galaxy');
  if (G.galaxyClusterUnlocked || G.astronomicalUnlocked) upgradeableIds.push('galaxy_cluster');
  if (G.superclusterUnlocked || G.astronomicalUnlocked) upgradeableIds.push('supercluster');

  // Multiversal tier - check individual unlocks or legacy full unlock
  if (G.observableUniverseUnlocked || G.multiversalUnlocked) upgradeableIds.push('observable_universe');
  if (G.fullUniverseUnlocked || G.multiversalUnlocked) upgradeableIds.push('full_universe');
  if (G.quantumMultiverseUnlocked || G.multiversalUnlocked) upgradeableIds.push('quantum_multiverse');
  if (G.cosmologicalMultiverseUnlocked || G.multiversalUnlocked) upgradeableIds.push('cosmological_multiverse');
  if (G.mathematicalMultiverseUnlocked || G.multiversalUnlocked) upgradeableIds.push('mathematical_multiverse');

  // Mystical tier - check individual unlocks or legacy full unlock
  if (G.sapphireUnlocked || G.mysticalUnlocked) upgradeableIds.push('sapphire');
  if (G.emeraldUnlocked || G.mysticalUnlocked) upgradeableIds.push('emerald');
  if (G.rubyUnlocked || G.mysticalUnlocked) upgradeableIds.push('ruby');

  upgradeableIds.forEach(function(id) {
    var name = id.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var btn = BUTTONS.find(function(b) { return b.id === id; });
    if (btn) name = btn.name;

    var desc = '';
    if (id === 'loot') desc = '<div style="font-size:.85em;opacity:.7;margin-top:2px">Passive coin income (\u00d710 per upgrade)</div>';

    var level = G.upgradeLevels[id] || 0;
    var mult = fmtMult(level);

    var el = document.createElement("button");
    el.className = "modal-btn" + (level > 0 ? " upgraded" : "");
    el.innerHTML = name + '<span class="upgrade-level">' + (level > 0 ? mult + 'x' : '\u2014') + '</span>' + desc;
    el.addEventListener("click", function() {
      if (G.magic < 2) {
        log("Not enough magic! (need 2)", "danger-msg");
        return;
      }
      G.magic -= 2;
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

function setupEventListeners() {
  // Modal close
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
  });

  // Beg button
  document.getElementById("begBtn").addEventListener("click", function() {
    logClick("beg");
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
      var rpIsOrd = G.rp instanceof OrdinalNumber;
      var recruitsGained = rpIsOrd ? G.rp.mul(mult) : ON(G.rp * mult);
      G.troops = G.troops.add(recruitsGained);
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
      // Log game start for leaderboard validation
      G.gameLog.push({ type: "start", day: 0, mode: mode, startTime: G.startTime });
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

  // Leaderboard modal handling
  var leaderboardBtn = document.getElementById("leaderboardBtn");
  var leaderboardOverlay = document.getElementById("leaderboardOverlay");
  var leaderboardSubmit = document.getElementById("leaderboardSubmit");
  var leaderboardCancel = document.getElementById("leaderboardCancel");
  var playerNameInput = document.getElementById("playerName");
  var nameError = document.getElementById("nameError");
  var leaderboardStats = document.getElementById("leaderboardStats");
  var leaderboardStatus = document.getElementById("leaderboardStatus");

  function showLeaderboardModal() {
    // Populate current stats
    var stats = '<div><strong>Day:</strong> ' + G.day + '</div>';
    stats += '<div><strong>Mode:</strong> ' + (G.difficulty || 'unknown') + '</div>';
    stats += '<div><strong>Power:</strong> ' + tp().format() + '</div>';
    stats += '<div><strong>Coins:</strong> ' + G.coins.format() + '</div>';
    if (G.enemyVanquished) {
      stats += '<div><strong>Status:</strong> <span style="color:var(--growth)">Victory!</span></div>';
    } else if (G.enemySurrendered) {
      stats += '<div><strong>Status:</strong> <span style="color:var(--growth)">Enemy Surrendered!</span></div>';
    } else {
      stats += '<div><strong>Status:</strong> In Progress</div>';
    }
    leaderboardStats.innerHTML = stats;

    // Reset form
    nameError.textContent = '';
    leaderboardStatus.textContent = '';
    leaderboardStatus.className = 'form-status';
    leaderboardSubmit.disabled = false;

    leaderboardOverlay.classList.add('visible');
    playerNameInput.focus();
  }

  function hideLeaderboardModal() {
    leaderboardOverlay.classList.remove('visible');
  }

  function validateName(name) {
    if (!name || name.trim().length === 0) {
      return 'Name is required';
    }
    if (name.length > 50) {
      return 'Name must be 50 characters or less';
    }
    // Allow letters, numbers, spaces, and common punctuation
    if (!/^[a-zA-Z0-9 _\-'.!]+$/.test(name)) {
      return 'Name contains invalid characters';
    }
    return null;
  }

  function submitToLeaderboard() {
    var name = playerNameInput.value.trim();
    var error = validateName(name);
    if (error) {
      nameError.textContent = error;
      return;
    }
    nameError.textContent = '';

    // Disable submit while processing
    leaderboardSubmit.disabled = true;
    leaderboardStatus.textContent = 'Submitting...';
    leaderboardStatus.className = 'form-status loading';

    // Capture final snapshot before submission for validation
    logSnapshot();

    // Gather submission data
    var submissionData = {
      playerName: name,
      mode: G.difficulty || 'unknown',
      day: G.day,
      power: tp().format(),
      coins: G.coins.format(),
      vanquished: G.enemyVanquished || false,
      surrendered: G.enemySurrendered || false,
      gameLog: getGameLog()
    };

    // Submit to leaderboard server
    var apiUrl = window.LEADERBOARD_API_URL || 'http://leaderboard.localhost/api/submit-run';

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(submissionData)
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Server returned ' + response.status);
      }
      return response.json();
    })
    .then(function(data) {
      if (data.success && !data.cheated) {
        leaderboardStatus.textContent = data.message || 'Submitted successfully!';
        leaderboardStatus.className = 'form-status success';
        // Close modal after brief delay so user sees success
        setTimeout(hideLeaderboardModal, 1000);
      } else if (data.cheated) {
        leaderboardStatus.textContent = 'Flagged: ' + (data.cheatReason || 'suspicious activity');
        leaderboardStatus.className = 'form-status error';
        leaderboardSubmit.disabled = false;
      } else {
        leaderboardStatus.textContent = data.message || 'Submission failed';
        leaderboardStatus.className = 'form-status error';
        leaderboardSubmit.disabled = false;
      }
    })
    .catch(function(err) {
      console.error('Leaderboard submission error:', err);
      leaderboardStatus.textContent = 'Network error - is server running?';
      leaderboardStatus.className = 'form-status error';
      leaderboardSubmit.disabled = false;
    });
  }

  if (leaderboardBtn) {
    leaderboardBtn.addEventListener('click', showLeaderboardModal);
  }

  if (leaderboardCancel) {
    leaderboardCancel.addEventListener('click', hideLeaderboardModal);
  }

  if (leaderboardSubmit) {
    leaderboardSubmit.addEventListener('click', submitToLeaderboard);
  }

  // Allow Enter key to submit
  if (playerNameInput) {
    playerNameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        submitToLeaderboard();
      }
    });
  }

  // Close on overlay click
  if (leaderboardOverlay) {
    leaderboardOverlay.addEventListener('click', function(e) {
      if (e.target === leaderboardOverlay) {
        hideLeaderboardModal();
      }
    });
  }

}
