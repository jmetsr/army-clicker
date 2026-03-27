// ================================================================
//  CORE GAME LOGIC - Game tick, battle, food, logging
//  VERSION: troop-loss-fix-v2 (2024-03-12)
// ================================================================

// Consolidate dragon cohorts to reduce iteration overhead
// Only runs when: cohorts > 15 AND enemy power < player power / 1000
function consolidateDragonCohorts() {
  if (G.dragonCohorts.length <= 15) return;

  var playerPower = tp();
  var enemyPower = G.enemyPower;

  // Check if enemy is insignificant (< 1/1000 of player power)
  // Use div to get ratio, then check if < 0.001
  if (playerPower.lte(0)) return;
  var ratio = enemyPower.div(playerPower);
  if (ratio.gte(0.001)) return; // Enemy still significant, don't consolidate

  // Group cohorts by troop name tier (based on PPT)
  var grouped = {};
  for (var i = 0; i < G.dragonCohorts.length; i++) {
    var cohort = G.dragonCohorts[i];
    if (cohort.count.lt(1)) continue;

    // Use PPT tier as key (group similar power levels)
    var tierKey = Math.floor(Math.log10(Math.max(1, cohort.ppt)));
    if (!grouped[tierKey]) {
      grouped[tierKey] = { count: ON(0), ppt: cohort.ppt };
    }
    grouped[tierKey].count = grouped[tierKey].count.add(cohort.count);
    // Keep highest PPT in tier
    if (cohort.ppt > grouped[tierKey].ppt) {
      grouped[tierKey].ppt = cohort.ppt;
    }
  }

  // Rebuild cohorts array from groups
  G.dragonCohorts = [];
  var keys = Object.keys(grouped);
  for (var k = 0; k < keys.length; k++) {
    var g = grouped[keys[k]];
    if (g.count.gte(1)) {
      G.dragonCohorts.push({ count: g.count, ppt: g.ppt });
    }
  }
}

// References to functions from other modules (set from main.js)
var runAIRef = null;
var updateUIRef = null;
var checkFlavorEventsRef = null;
var getUpgradeMultRef = null;

function setRunAI(fn) { runAIRef = fn; }
function setUpdateUI(fn) { updateUIRef = fn; }
function setCheckFlavorEvents(fn) { checkFlavorEventsRef = fn; }
function setGetUpgradeMult(fn) { getUpgradeMultRef = fn; }

// Log to event display
var _latestEventTimeout = null;
function log(msg, cls) {
  var el = document.getElementById("logEntries");
  if (!el) return;
  var e = document.createElement("div");
  e.className = "log-entry" + (cls ? " " + cls : "");
  e.textContent = msg;
  el.insertBefore(e, el.firstChild);
  while (el.children.length > 50) el.removeChild(el.lastChild);

  // Also show in latest event banner at top
  var latest = document.getElementById("latestEvent");
  if (latest) {
    latest.textContent = msg;
    latest.className = "latest-event visible" + (cls ? " " + cls : "");
    // Clear previous timeout
    if (_latestEventTimeout) clearTimeout(_latestEventTimeout);
    // Fade out after 4 seconds
    _latestEventTimeout = setTimeout(function() {
      latest.classList.remove("visible");
    }, 4000);
  }
}

// Gameplay logging
function logClick(action) {
  if (!G.logStartTime) G.logStartTime = Date.now();
  var elapsed = Date.now() - G.logStartTime;
  // Get loot multiplier if available
  var lootMult = 1;
  if (typeof getUpgradeMultRef === 'function') {
    var m = getUpgradeMultRef('loot');
    lootMult = (typeof m === 'number') ? m : (m && m.toNumber ? m.toNumber() : 1);
  }
  G.clickLog.push({
    t: elapsed,
    tick: G._totalTicks || 0,  // Global tick counter (increments 4x per day)
    action: action,
    coins: G.coins.toNumber(),
    troops: G.troops.toNumber(),
    ppt: G.ppt,
    rp: G.rp,
    sl: cnt("squad_leader"),
    bar: cnt("barracks"),
    mb: cnt("military_base"),
    king: cnt("kingdom"),
    emp: cnt("empire"),
    train: cnt("train"),
    armyClicks: G._armyClicks || 0,
    farms: cnt("farm"),
    plantations: cnt("plantation"),
    colonies: cnt("colony"),
    lootMult: lootMult,
    magic: G.magic || 0,
    food: G.food ? G.food.toNumber() : 0
  });
}

function logAI(action) {
  if (!G.ai) return;
  G.gameLog.push({
    type: "ai",
    day: G.day,
    action: action,
    coins: G.ai.coins.toNumber(),
    troops: G.ai.troops.toNumber(),
    ppt: G.ai.ppt,
    food: G.ai.food.toNumber(),
    farms: G.ai.counts["farm"] || 0
  });
}

// Serialize OrdinalNumber as {arrows, height} for JSON
function serializeON(on) {
  if (!on || typeof on !== 'object') return on;
  return { arrows: on.arrows, height: on.height };
}

function logSnapshot() {
  var snap = { type: "snapshot", day: G.day };
  snap.player = {
    troops: serializeON(G.troops),
    ppt: G.ppt,
    power: serializeON(tp()),
    coins: serializeON(G.coins),
    food: serializeON(G.food),
    farms: cnt("farm")
  };
  if (G.ai) {
    snap.ai = {
      troops: serializeON(G.ai.troops),
      ppt: G.ai.ppt,
      power: serializeON(G.ai.troops.mul(G.ai.ppt)),
      coins: serializeON(G.ai.coins),
      food: serializeON(G.ai.food),
      farms: G.ai.counts["farm"] || 0
    };
  }
  G.gameLog.push(snap);
}

function logVanquish(type) {
  G.gameLog.push({
    type: type, // "vanquish" or "surrender"
    day: G.day,
    coins: serializeON(G.coins),
    power: serializeON(tp())
  });
}

function getGameLog() {
  return {
    version: "1.0",
    mode: G.difficulty || "unknown",
    startTime: G.startTime || null,
    playerClicks: G.clickLog,
    gameEvents: G.gameLog
  };
}

function logBattle(result, playerPower, enemyPower, lossPct) {
  G.gameLog.push({
    type: "battle",
    tick: G._totalTicks || 0,
    result: result,
    playerPower: serializeON(playerPower),
    enemyPower: serializeON(enemyPower),
    lossPct: lossPct || 0,
    // State AFTER the battle (for validator to know current state)
    troops: G.troops.toNumber(),
    ppt: G.ppt,
    coins: G.coins.toNumber(),
    farms: cnt("farm"),
    plantations: cnt("plantation"),
    colonies: cnt("colony"),
    sl: cnt("squad_leader"),
    barracks: cnt("barracks"),
    mb: cnt("military_base")
  });
}

function exportLog() {
  var exportData = {
    playerClicks: G.clickLog,
    gameEvents: G.gameLog
  };
  var data = JSON.stringify(exportData, null, 2);
  var blob = new Blob([data], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "army-clicker-log-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return G.clickLog;
}

function clearLog() {
  G.clickLog = [];
  G.logStartTime = null;
}

// GAME TICK
function tick() {
  if (!G.gameStarted) return;
  var ch = false;

  // Increment day
  G.day++;

  // Snapshot only at year milestones (final snapshot taken at submit)
  if (G.day === 365 || G.day === 730) logSnapshot();

  // Food system: farms produce, troops consume daily (unless Eternal Feast active)
  var farmProduction = cnt("farm") * C.farm_production;
  G.food = G.food.add(farmProduction);

  if (!G.eternalFeast) {
    var troopConsumption = Math.floor(G.troops.toNumber() * C.food_perTroopDay);
    var foodShortage = troopConsumption > G.food.toNumber();
    G.food = G.food.sub(troopConsumption);

    // Desertion if out of food - escalates each consecutive day
    if (foodShortage) {
      G.starvationStreak++;
      // Escalating: 5%, 10%, 20%, 40%... doubles each day
      var desertPct = Math.min(5 * Math.pow(2, G.starvationStreak - 1), 100);
      var deserters = G.troops.mulFraction(desertPct, 100);
      G.troops = G.troops.sub(deserters);
      if (G.starvationStreak === 1) {
        log("\u26a0 Troops starving! " + fmt(deserters) + " deserted (" + desertPct + "%).", "danger-msg");
      } else {
        log("\u26a0 STARVATION DAY " + G.starvationStreak + "! " + fmt(deserters) + " deserted (" + desertPct + "%)!", "danger-msg");
      }
    } else {
      G.starvationStreak = 0;
    }
  }
  ch = true;

  // Calculate daily dragon spawn from dark rituals (skip if enemy permanently surrendered)
  if (G.darkRitualDays.length > 0 && !G.enemySurrendered) {
    var newDragons = ON(0);
    for (var i = 0; i < G.darkRitualDays.length; i++) {
      var daysSince = G.day - G.darkRitualDays[i];
      if (daysSince > 0) {
        var power = i + 1;
        var todayTotal = Math.pow(daysSince, power);
        var yesterdayTotal = daysSince > 1 ? Math.pow(daysSince - 1, power) : 0;
        var dailyIncrement = todayTotal - yesterdayTotal;
        if (dailyIncrement > 0) {
          newDragons = newDragons.add(ON(dailyIncrement));
        }
      }
    }
    // Add new dragons to ppt=60000 cohort
    if (newDragons.gt(0)) {
      var found = false;
      for (var c = 0; c < G.dragonCohorts.length; c++) {
        if (G.dragonCohorts[c].ppt === 60000) {
          G.dragonCohorts[c].count = G.dragonCohorts[c].count.add(newDragons);
          found = true;
          break;
        }
      }
      if (!found) {
        G.dragonCohorts.push({ count: newDragons, ppt: 60000 });
      }
    }
    // Update legacy fields
    G.enemyDragons = ON(0);
    G.enemyDragonPpt = 60000;
    for (var c = 0; c < G.dragonCohorts.length; c++) {
      G.enemyDragons = G.enemyDragons.add(G.dragonCohorts[c].count);
    }
    // Consolidate cohorts if too many and enemy is trivial
    consolidateDragonCohorts();
  }

  // Enemy growth based on difficulty
  var hasEnemy = G.difficulty && !G.enemyVanquished &&
                 (G.difficulty !== 'practice' || G.darkRitualDays.length > 0);

  // Auto-vanquish: if player power > enemy power * 1 quadrillion, enemy is irrelevant
  // Only check after magic unlocked (player is powerful enough by then)
  if (hasEnemy && G.magicOn && G.troops.gte(1)) {
    var playerPow = tp();
    var enemyPow = G.enemyPower || ON(0);
    // Check if player power / enemy power > 1e15 (quadrillion)
    if (enemyPow.gt(0)) {
      var ratio = playerPow.div(enemyPow);
      if (ratio.gte(1e33)) {
        G.enemyVanquished = true;
        G.enemySurrendered = true;  // Flag for permanent surrender screen
        G.enemyTroops = ON(0);
        G.enemyPower = ON(0);
        G.enemyDragons = ON(0);
        G.dragonCohorts = [];
        if (G.ai) {
          G.ai.troops = ON(0);
        }
        log("\ud83c\udf1f OVERWHELMING VICTORY! The enemy surrenders permanently.", "milestone");
        logVanquish("surrender");
        hasEnemy = false;
      }
    }
  }

  if (hasEnemy) {
    var enemyGain = ON(0);
    var enemyPptGain = 0;
    if (G.difficulty === 'easy') {
      enemyGain = ON(1);
      enemyPptGain = 3;
    } else if (G.difficulty === 'medium') {
      enemyGain = ON(G.day);
      enemyPptGain = 15;
    } else if (G.difficulty === 'hard') {
      enemyGain = ON(G.day * G.day);
      enemyPptGain = 500;
    } else if (isAIMode() && G.ai) {
      // AI mode: run AI at configured clicks per second
      if (runAIRef) runAIRef(getAICps());
      // AI passive looting
      var totalAiPower = G.ai.troops.mul(G.ai.ppt).add(getDragonPower());
      if (totalAiPower.gte(1)) {
        var aiLootPerTick = totalAiPower;
        if (aiLootPerTick.lt(1)) aiLootPerTick = ON(1);
        G.ai.coins = G.ai.coins.add(aiLootPerTick.mul(4));
      }
      // AI food
      if (!G.enemyNoStarve) {
        var aiFarmProd = (G.ai.counts["farm"] || 0) * C.farm_production;
        var aiTroopConsume = Math.floor(G.ai.troops.toNumber() * C.food_perTroopDay);
        G.ai.food = G.ai.food.add(aiFarmProd);
        var aiStarving = aiTroopConsume > G.ai.food.toNumber();
        G.ai.food = G.ai.food.sub(aiTroopConsume);
        if (aiStarving) {
          G.ai.starvationStreak = (G.ai.starvationStreak || 0) + 1;
          var aiDesertPct = Math.min(5 * Math.pow(2, G.ai.starvationStreak - 1), 100);
          var aiDeserters = G.ai.troops.mulFraction(aiDesertPct, 100);
          G.ai.troops = G.ai.troops.sub(aiDeserters);
          var keepPct = 100 - aiDesertPct;
          for (var c = 0; c < G.dragonCohorts.length; c++) {
            G.dragonCohorts[c].count = G.dragonCohorts[c].count.mulFraction(keepPct, 100);
          }
          G.dragonCohorts = G.dragonCohorts.filter(function(c) { return c.count.gte(1); });
          G.enemyDragons = ON(0);
          for (var c = 0; c < G.dragonCohorts.length; c++) {
            G.enemyDragons = G.enemyDragons.add(G.dragonCohorts[c].count);
          }
        } else {
          G.ai.starvationStreak = 0;
        }
      }
      G.enemyTroops = G.ai.troops;
      var aiBasePower = G.ai.troops.mul(G.ai.ppt);
      var dragonPower = getDragonPower();
      G.enemyPower = aiBasePower.add(dragonPower);
      // Log AI status every 10 days
      if (G.day % 10 === 0) {
        var playerPptStr = (typeof G.ppt === 'number') ? G.ppt.toFixed(2) : G.ppt.format();
        var aiPptStr = (typeof G.ai.ppt === 'number') ? G.ai.ppt.toFixed(2) : G.ai.ppt.format();
        log("[Player Day " + G.day + "] Troops:" + fmt(G.troops) + " PPT:" + playerPptStr + " Power:" + fmt(tp()) + " Coins:" + fmt(G.coins) + " Food:" + fmt(G.food));
        log("[AI Day " + G.day + "] Troops:" + fmt(G.ai.troops) + " PPT:" + aiPptStr + " Power:" + fmt(G.enemyPower) + " Coins:" + fmt(G.ai.coins) + " Food:" + fmt(G.ai.food));
      }
    }
    if (!isAIMode()) {
      G.enemyTroops = G.enemyTroops.add(enemyGain);
      var basePower = G.enemyTroops.mul(enemyPptGain);
      var dragonPower = getDragonPower();
      G.enemyPower = basePower.add(dragonPower);
    }
    ch = true;

    // Battle chance
    var battleChance = G.difficulty === 'easy' ? 0.01 : G.difficulty === 'medium' ? 0.02 : 0.03;
    if (Math.random() < battleChance) {
      doBattle();
    }
  }

  // Check for flavor events
  if (checkFlavorEventsRef) checkFlavorEventsRef();
  if (ch && updateUIRef) updateUIRef();
}

// BATTLE SYSTEM
function doBattle() {
  var playerPower = tp();
  var enemyPower = G.enemyPower;
  var flash = document.getElementById("battleFlash");
  var text = document.getElementById("battleText");

  // Show battle announcement
  flash.className = "battle-flash battle active";
  text.innerHTML = "\u2694\ufe0f BATTLE! \u2694\ufe0f<div class='battle-sub'>Your power: " + playerPower.format() + " vs Enemy: " + enemyPower.format() + "</div>";

  setTimeout(function() {
    var isTie = playerPower.eq(enemyPower);
    var playerWins = playerPower.gt(enemyPower);
    var resultDuration = 500;

    if (isTie) {
      G.winStreak = 0;
      G.lossStreak = 0;
      flash.className = "battle-flash stalemate active";
      text.innerHTML = "\u2694\ufe0f STALEMATE! \u2694\ufe0f<div class='battle-sub'>Forces evenly matched - no victor!</div>";
      log("STALEMATE! Battle ends in a draw.", "milestone");
      logBattle("tie", playerPower, enemyPower);
    } else if (playerWins) {
      G.winStreak++;
      G.lossStreak = 0;
      var lossPct = Math.min(G.winStreak * 5, 100);
      var keepFraction = 100 - lossPct;

      flash.className = "battle-flash victory active";
      // Calculate enemy troop loss with proper rounding (not truncation)
      var enemyTroopCount = G.enemyTroops.toNumber();
      var enemyTroopLoss = Math.round(enemyTroopCount * lossPct / 100);
      G.enemyTroops = G.enemyTroops.sub(enemyTroopLoss);
      if (G.enemyTroops.lt(0)) G.enemyTroops = ON(0);
      G.enemyPower = G.enemyPower.mulFraction(keepFraction, 100);

      // Reduce dragon cohorts
      for (var c = 0; c < G.dragonCohorts.length; c++) {
        G.dragonCohorts[c].count = G.dragonCohorts[c].count.mulFraction(keepFraction, 100);
        G.dragonCohorts[c].ppt = Math.max(1, G.dragonCohorts[c].ppt * keepFraction / 100);
      }
      G.dragonCohorts = G.dragonCohorts.filter(function(c) { return c.count.gte(1); });
      G.enemyDragons = ON(0);
      for (var c = 0; c < G.dragonCohorts.length; c++) {
        G.enemyDragons = G.enemyDragons.add(G.dragonCohorts[c].count);
      }
      // Recalculate enemy power from actual values (not just mulFraction)
      G.enemyPower = G.enemyTroops.mul(isAIMode() && G.ai ? G.ai.ppt : 1).add(getDragonPower());

      // AI mode: reduce AI stats
      if (isAIMode() && G.ai) {
        // Calculate loss with proper rounding (not truncation)
        var aiTroopCount = G.ai.troops.toNumber();
        var aiTroopLoss = Math.round(aiTroopCount * lossPct / 100);
        G.ai.troops = G.ai.troops.sub(aiTroopLoss);
        if (G.ai.troops.lt(0)) G.ai.troops = ON(0);
        G.ai.coins = G.ai.coins.mulFraction(keepFraction, 100);
        G.ai.ppt = Math.max(1, G.ai.ppt * keepFraction / 100);
        ["squad_leader", "barracks", "military_base", "kingdom", "empire"].forEach(function(id) {
          if (G.ai.counts[id] > 0) {
            G.ai.counts[id] = Math.max(0, G.ai.counts[id] - Math.round(G.ai.counts[id] * lossPct / 100));
          }
        });
        G.ai.rp = 1 + (G.ai.counts["squad_leader"] || 0);
      }

      var streakMsg = G.winStreak > 1 ? " (" + G.winStreak + " in a row!)" : "";
      text.innerHTML = "\ud83c\udfc6 VICTORY! \ud83c\udfc6<div class='battle-sub'>Enemy loses " + lossPct + "% of forces!" + streakMsg + "</div>";
      log("VICTORY! Enemy forces reduced by " + lossPct + "%." + streakMsg, "milestone");
      logBattle("win", playerPower, enemyPower);

      // Check if enemy wiped out (non-AI mode only - AI has its own check below)
      if (!isAIMode() && G.enemyTroops.lt(1) && G.dragonCohorts.length === 0) {
        G.enemyTroops = ON(0);
        G.enemyPower = ON(0);
        G.enemyDragons = ON(0);
        G.dragonCohorts = [];
        if (!G.enemyUnvanquishable) {
          G.enemyVanquished = true;
          log("\ud83c\udf89 TOTAL VICTORY! The enemy has been vanquished!", "milestone");
          logVanquish("vanquish");
        } else {
          log("\ud83c\udf89 VICTORY! Enemy forces destroyed... but darkness will bring them back.", "milestone");
        }
      }
      // AI vanquish check - only if AI has recruited at least once (don't vanquish before game starts)
      // Must also check dragonCohorts and enemyUnvanquishable like non-AI mode
      if (isAIMode() && G.ai && G.ai.troops.lt(1) && G.dragonCohorts.length === 0 && (G.ai.counts["recruit"] || 0) > 0) {
        G.ai.troops = ON(0);
        if (!G.enemyUnvanquishable) {
          G.enemyVanquished = true;
          log("\ud83c\udf89 TOTAL VICTORY! The AI opponent has been defeated!", "milestone");
          logVanquish("vanquish");
        } else {
          log("\ud83c\udf89 VICTORY! AI forces destroyed... but darkness will bring them back.", "milestone");
        }
      }
    } else {
      // Defeat
      G.lossStreak++;
      G.winStreak = 0;
      var lossPct = Math.min(G.lossStreak * 5, 100);
      var keepFraction = 100 - lossPct;

      flash.className = "battle-flash defeat active";
      var losses = [];

      // Troop loss
      var troopLoss = G.troops.mulFraction(lossPct, 100);
      G.troops = G.troops.sub(troopLoss);
      losses.push(fmt(troopLoss) + " troops");

      // Coin loss
      var coinLoss = G.coins.mulFraction(lossPct, 100);
      G.coins = G.coins.sub(coinLoss);
      losses.push(fmt(coinLoss) + " coins");

      // Power/troop loss
      var oldTroopName = getTN();
      if (typeof G.ppt === 'number') {
        var pptLoss = G.ppt * lossPct / 100;
        G.ppt = Math.max(1, G.ppt - pptLoss);
        if (pptLoss >= 0.01) losses.push(pptLoss.toFixed(2) + " power/troop");
      } else {
        var pptLoss = G.ppt.mulFraction(lossPct, 100);
        G.ppt = G.ppt.sub(pptLoss);
        if (G.ppt.lt(1)) G.ppt = 1;
        losses.push(fmt(pptLoss) + " power/troop");
      }
      var newTroopName = getTN();
      if (newTroopName !== oldTroopName) {
        log("Your troops devolved from " + oldTroopName + " into " + newTroopName + "!", "danger-msg");
      }

      // Army chain losses
      ["squad_leader", "barracks", "military_base", "kingdom", "empire", "planet", "solar_system", "galaxy", "galaxy_cluster", "supercluster"].forEach(function(id) {
        if (G.counts[id] > 0) {
          var lost = Math.floor(G.counts[id] * lossPct / 100);
          if (lost > 0) {
            G.counts[id] = Math.max(0, G.counts[id] - lost);
            var name = id.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
            if (lost > 1) name += "s";
            losses.push(fmt(lost) + " " + name);
          }
        }
      });
      var slCount = cnt("squad_leader");
      G.rp = slCount instanceof OrdinalNumber ? slCount.add(1) : 1 + slCount;

      var streakMsg = G.lossStreak > 1 ? "<br><b>" + G.lossStreak + " defeats in a row! (-" + lossPct + "%)</b>" : "";
      var lossText = losses.slice(0, 5).join("<br>");
      if (losses.length > 5) lossText += "<br>...and " + (losses.length - 5) + " more";
      text.innerHTML = "\ud83d\udc80 DEFEAT! \ud83d\udc80<div class='battle-sub'>" + lossText + streakMsg + "</div>";
      log("DEFEAT! Lost " + lossPct + "% - " + losses.join(", "), "danger-msg");
      logBattle("lose", playerPower, enemyPower, lossPct);

      if (G.troops.lt(1)) {
        G.troops = ON(0);
        log("\ud83d\udc80 TOTAL DEFEAT! Your army has been destroyed!", "danger-msg");
      }
    }

    setTimeout(function() {
      flash.className = "battle-flash";
      if (updateUIRef) updateUIRef();
    }, resultDuration);
  }, 200);
}

// AUTO-LOOT: runs 4x per second (4x per day)
function lootTick() {
  if (!G.gameStarted) return;

  // Increment global tick counter (for logging precision)
  G._totalTicks = (G._totalTicks || 0) + 1;

  if (G.troops.lt(1)) return;
  var mult = getUpgradeMultRef ? getUpgradeMultRef('loot') : 1;
  var gain = tp().mul(C.lootBase).floor();
  if (gain.lt(1)) gain = ON(1);
  G.coins = G.coins.add(gain.mul(mult));
  // Update coins display
  var el = document.getElementById("coinCount");
  if (el) el.textContent = fmt(G.coins);
}
