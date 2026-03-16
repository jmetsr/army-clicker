// ================================================================
//  BUTTON DEFINITIONS - All game button configurations
// ================================================================

// Modal references (set by events.js)
var openUpgradeModal = null;
var openAutoUpgraderModal = null;

function setModalFunctions(upgradeFn, autoUpgraderFn) {
  openUpgradeModal = upgradeFn;
  openAutoUpgraderModal = autoUpgraderFn;
}

// BUTTONS array - all game buttons
var BUTTONS = [];

// Button definition helper
function def(o) {
  BUTTONS.push(o);
}

// DRY helper: define a chain button from data
// b: {id, name, cw, base, unlock, boosts, gainVar, desc, firstMsg, unlockWarn}
// section: "army", "training", "command"
// clickPool: "_armyClicks", "_trainClicks", "_cmdClicks"
// costFn: function(base) that returns cost
// unlockCheck: optional function() for show condition
function defChain(b, section, clickPool, costFnGen, unlockCheck) {
  var gainVar = b.gainVar || b.id.replace(/_/g, '') + "Power";
  // Fix camelCase for gainVar
  if (b.id === "squad_leader") gainVar = "squadLeaderPower";
  else if (b.id === "solar_system") gainVar = "solarSystemPower";
  else if (b.id === "galaxy_cluster") gainVar = "galaxyClusterPower";
  else gainVar = b.id.replace(/_([a-z])/g, function(m, c) { return c.toUpperCase(); }) + "Power";

  def({
    id: b.id,
    name: b.name,
    s: section,
    cw: b.cw,
    descFn: function() {
      var power = G[gainVar];
      if (b.descFn) return b.descFn(power);
      if (b.desc) return b.desc;
      if (b.boosts) return "+" + power + " to " + b.boosts.replace(/Power$/, "").replace(/([A-Z])/g, " $1").trim() + " power";
      return "+" + power + " per click";
    },
    costFn: function() { return costFnGen(b.base, b.id); },
    showFn: function() {
      if (unlockCheck && !unlockCheck()) return false;
      if (b.unlock) return cntGte(b.unlock, 3) || cntGt(b.id, 0);
      if (b.showFn) return b.showFn();
      return cntGt(b.id, 0);
    },
    effectFn: function(mult) {
      var first = (cnt(b.id) === 0);
      var opts = { countId: b.id, gainVar: gainVar, clickPool: clickPool };
      if (b.boosts) opts.boostVar = b.boosts;
      if (b.updateRp) opts.updateRp = true;
      if (b.updateSessionsPerTrain) opts.updateSessionsPerTrain = true;
      if (b.trainMult) opts.trainMult = true;
      if (b.trainMultBoost) opts.trainMultBoost = b.trainMultBoost;
      applyEffect(opts, mult);
      if (first && b.firstMsg) log(b.firstMsg, "milestone");
      // Warn about army cost increase:
      // - Items with unlock (like barracks): warn on 1st purchase
      // - Items without unlock (like SL): warn on 4th purchase (after unlocking next tier)
      if (b.unlockWarn) {
        if (b.unlock && first) log(b.unlockWarn, "danger-msg");
        if (!b.unlock && cnt(b.id) === 4) log(b.unlockWarn, "danger-msg");
      }
    }
  });
}

// Initialize all buttons
function initButtons() {
  // Clear existing buttons
  BUTTONS.length = 0;

  // ARMY CHAIN
  var ARMY_WARN = "\u26a0 WARNING: All army costs just rose! Every upgrade makes EVERYTHING more expensive.";
  [
    {id:"squad_leader", name:"Squad Leader", cw:"owned", base:C.squadLeader_baseCost,
     showFn:function(){return G.troops.gte(2)||cntGt("squad_leader",0)}, updateRp:true,
     firstMsg:"Squad Leader recruited.", unlockWarn:ARMY_WARN},
    {id:"barracks", name:"Barracks", cw:"built", base:C.barracks_baseCost, unlock:"squad_leader", boosts:"squadLeaderPower",
     firstMsg:"Barracks built.", unlockWarn:ARMY_WARN},
    {id:"military_base", name:"Military Base", cw:"established", base:C.militaryBase_baseCost, unlock:"barracks", boosts:"barracksPower",
     firstMsg:"Military base established."},
    {id:"kingdom", name:"Kingdom", cw:"united", base:C.kingdom_baseCost, unlock:"military_base", boosts:"militaryBasePower",
     firstMsg:"A kingdom rises."},
    {id:"empire", name:"Empire", cw:"forged", base:C.empire_baseCost, unlock:"kingdom", boosts:"kingdomPower",
     firstMsg:"An empire forged."}
  ].forEach(function(b) { defChain(b, "army", "_armyClicks", armyCost); });

  // ECONOMY CHAIN
  var ECON_WARN = "\u26a0 WARNING: All economy costs just rose! Every upgrade makes farms, plantations & colonies more expensive.";

  // FARM (produces food passively)
  def({id:"farm", name:"Farm", s:"economy", cw:"built",
    descFn:function(){return G.fp + " farm" + (G.fp > 1 ? "s" : "") + " \u00d7 " + C.farm_production + " food/day"},
    costFn:function(){return farmCost()},
    showFn:function(){return true},  // Always visible
    effectFn:function(mult){
      mult = mult || 1;
      var first=(cnt("farm")===0);
      G.counts["farm"] = (G.counts["farm"] || 0) + G.fp * mult;
      G._buttonClicks["farm"] = (G._buttonClicks["farm"] || 0) + mult;
      G._economyClicks = (G._economyClicks || 0) + mult;
      if(first)log("Farm built. Your people can eat.","milestone");
      // Warn on 4th farm (after unlocking plantation)
      if(cntGte("farm",4) && !cntGte("farm",4+G.fp*mult)) log(ECON_WARN,"danger-msg");
    }});

  // PLANTATION (boosts farms per click, like squad leaders boost recruits)
  def({id:"plantation", name:"Plantation", s:"economy", cw:"established",
    descFn:function(){return G.pp + " plantation" + (G.pp > 1 ? "s" : "") + ", +1 farm/click each"},
    costFn:function(){return plantationCost()},
    showFn:function(){return cntGte("farm",3) || cntGt("plantation",0)},
    effectFn:function(mult){
      mult = mult || 1;
      var first=(cnt("plantation")===0);
      G.counts["plantation"] = (G.counts["plantation"] || 0) + G.pp * mult;
      G._buttonClicks["plantation"] = (G._buttonClicks["plantation"] || 0) + mult;
      G._economyClicks = (G._economyClicks || 0) + mult;
      G.fp = 1 + cnt("plantation");
      if(first){
        log("Plantation established. Farm production boosted.","milestone");
        log(ECON_WARN,"danger-msg");
      }
    }});

  // COLONY (boosts plantations per click, like barracks boost squad leaders)
  def({id:"colony", name:"Colony", s:"economy", cw:"founded",
    descFn:function(){return "+1 plantation per click"},
    costFn:function(){return colonyCost()},
    showFn:function(){return cntGte("plantation",3) || cntGt("colony",0)},
    effectFn:function(mult){
      mult = mult || 1;
      var first=(cnt("colony")===0);
      G.counts["colony"] = (G.counts["colony"] || 0) + mult;
      G._buttonClicks["colony"] = (G._buttonClicks["colony"] || 0) + mult;
      G._economyClicks = (G._economyClicks || 0) + mult;
      G.pp = 1 + cnt("colony");
      if(first){
        log("Colony founded. Plantation growth boosted.","milestone");
        log(ECON_WARN,"danger-msg");
      }
    }});

  // ASTRONOMICAL TIER (army extension)
  [
    {id:"planet", name:"Planet", cw:"colonized", base:1e9, unlock:"empire", boosts:"empirePower"},
    {id:"solar_system", name:"Solar System", cw:"unified", base:1e11, unlock:"planet", boosts:"planetPower"},
    {id:"galaxy", name:"Galaxy", cw:"conquered", base:1e13, unlock:"solar_system", boosts:"solarSystemPower"},
    {id:"galaxy_cluster", name:"Galaxy Cluster", cw:"absorbed", base:1e15, unlock:"galaxy", boosts:"galaxyPower"},
    {id:"supercluster", name:"Supercluster", cw:"dominated", base:1e17, unlock:"galaxy_cluster", boosts:"galaxyClusterPower"}
  ].forEach(function(b){ defChain(b, "army", "_armyClicks", armyCost, function(){return G.astronomicalUnlocked}); });

  // MULTIVERSAL TIER (army extension beyond astronomical)
  [
    {id:"observable_universe", name:"Observable Universe", cw:"encompassed", base:1e19, unlock:"supercluster", boosts:"superclusterPower"},
    {id:"full_universe", name:"Full Universe", cw:"transcended", base:1e21, unlock:"observable_universe", boosts:"observableUniversePower"},
    {id:"quantum_multiverse", name:"Quantum Multiverse", cw:"collapsed", base:1e23, unlock:"full_universe", boosts:"fullUniversePower"},
    {id:"cosmological_multiverse", name:"Cosmological Multiverse", cw:"unified", base:1e25, unlock:"quantum_multiverse", boosts:"quantumMultiversePower"},
    {id:"mathematical_multiverse", name:"Mathematical Multiverse", cw:"realized", base:1e27, unlock:"cosmological_multiverse", boosts:"cosmologicalMultiversePower"}
  ].forEach(function(b){ defChain(b, "army", "_armyClicks", armyCost, function(){return G.multiversalUnlocked}); });

  // TRAIN (special - not a chain, but uses sessionsPerTrain like recruit uses rp)
  def({id:"train", name:"Train", s:"training", cw:"sessions",
    descFn:function(){
      var tm = G.trainMult;
      return "Power/troop \u00d7" + (tm instanceof OrdinalNumber ? tm.format() : tm.toFixed(3));
    },
    costFn:function(){return expCost(C.train_baseCost,"train")},
    showFn:function(){return G.troops.gte(C.train_unlockTroops)||cntGt("train",0)},
    effectFn:function(mult){
      var first=(cnt("train")===0);
      applyEffect({countId:"train",gainVar:"sessionsPerTrain",trainMult:true,clickPool:"_trainClicks"},mult);
      if(first)log("Training begins.","milestone");
    }});

  // POWER GEM TIER (training boosters)
  [
    {id:"sapphire", name:"Forbidden Ritual", cw:"preformed", base:1e10,
     showFn:function(){return G.mysticalUnlocked&&(cntGte("train",50)||cntGt("sapphire",0))},
     trainMultBoost:0.005, updateSessionsPerTrain:true, descFn:function(power){return "Train mult +"+(0.005*power).toFixed(4)+" per click"}},
    {id:"emerald", name:"School for the Mystic Arts", cw:"built", base:1e13, unlock:"sapphire", boosts:"sapphirePower"},
    {id:"ruby", name:"Mystical Dimension", cw:"conquered", base:1e17, unlock:"emerald", boosts:"emeraldPower"},
  ].forEach(function(b){
    defChain(b, "training", "_trainClicks", function(base, id){return expCost(base, id)}, function(){return G.mysticalUnlocked});
  });

  // DARK RITUAL
  def({id:"dark_ritual",name:"\u2620 Dark Ritual",s:"magic",isMagic:false,isRitual:true,
    desc:"Pay coins for 1 magic. WARNING: Helps enemies!",cw:"performed",
    descFn:function(){
      var cost = ON(1e12).mul(Math.pow(5, cnt("dark_ritual")));
      var warn = G.darkRitualDays.length === 0 ? " \u26a0 EMPOWERS YOUR ENEMIES" : "";
      return"Cost: " + fmt(cost) + " coins \u2192 +1 magic" + warn;
    },
    costFn:function(){
      var cost = ON(1e12).mul(Math.pow(5, cnt("dark_ritual")));
      return G.coins.gte(cost) ? 0 : Infinity;
    },
    showFn:function(){return G.magicOn},
    effectFn:function(){
      var cost = ON(1e12).mul(Math.pow(5, cnt("dark_ritual")));
      G.coins=G.coins.sub(cost);
      G.magic+=1;G.ltMagic+=1;inc("dark_ritual");

      // Track the day this ritual was bought
      G.darkRitualDays.push(G.day);

      // First dark ritual effects
      if(G.darkRitualDays.length === 1) {
        log("\u26a0 The enemy stirs! They no longer need food and will spawn dragons!","danger-msg");
        G.enemyUnvanquishable = true;
        G.enemyNoStarve = true;
        // Un-vanquish enemy if vanquished (but not if permanently surrendered)
        if(G.enemyVanquished && !G.enemySurrendered) {
          G.enemyVanquished = false;
          log("The vanquished enemy rises again!","danger-msg");
        }
        // Practice mode now has an enemy
        if(G.difficulty === 'practice') {
          document.getElementById("enemyCol").style.display = "";
          document.getElementById("enemyName").textContent = "Dark Ritual Dragons";
          document.getElementById("enemyTroopType").textContent = "Dragons";
          document.getElementById("battleChance").textContent = "3";
          log("Dark forces give form to a new enemy!","danger-msg");
        }
      } else {
        log("\u2620 Another ritual completed. Enemy dragons grow stronger!","danger-msg");
        // Un-vanquish if vanquished (can always respawn after first ritual, unless permanently surrendered)
        if(G.enemyVanquished && !G.enemySurrendered) {
          G.enemyVanquished = false;
          log("The enemy rises once more!","danger-msg");
        }
      }
    }});

  // Magic upgrade button
  def({id:"upgrade_button",name:"\u2b06 Upgrade Button",s:"magic",isMagic:true,
    desc:"Make any button 10x more powerful (stacks multiplicatively)",cw:"purchased",
    descFn:function(){return"Pick a button \u2192 10x effect (costs 10x too)"},
    costFn:function(){return 0},
    displayCost:1,
    showFn:function(){return G.magicOn},
    effectFn:function(){openUpgradeModal()}});

  // Astronomical tier unlock
  def({id:"astronomical_tier",name:"\u2605 Astronomical Tier",s:"magic",isMagic:true,
    desc:"Unlock 5 cosmic army levels: Planet, Solar System, Galaxy...",cw:"unlocked",
    descFn:function(){return G.astronomicalUnlocked?"UNLOCKED":"Unlock cosmic army chain"},
    costFn:function(){return 4},
    showFn:function(){return G.magicOn&&!G.astronomicalUnlocked},
    effectFn:function(){
      G.astronomicalUnlocked=true;
      log("\u2605 The cosmos opens. Astronomical tier unlocked!","magic-msg");
    }});

  // Multiversal tier unlock
  def({id:"multiversal_tier",name:"\ud83c\udf0c Multiversal Tier",s:"magic",isMagic:true,
    desc:"Unlock 5 multiverse levels: Observable Universe, Full Universe, Quantum Multiverse...",cw:"unlocked",
    descFn:function(){return G.multiversalUnlocked?"UNLOCKED":"Unlock multiversal army chain"},
    costFn:function(){return 4},
    showFn:function(){return G.magicOn&&G.astronomicalUnlocked&&!G.multiversalUnlocked},
    effectFn:function(){
      G.multiversalUnlocked=true;
      log("\ud83c\udf0c Reality fractures. The multiverse reveals itself!","magic-msg");
    }});

  // Power Gem tier unlock
  def({id:"mystical_tier",name:"\ud83d\udc8e Forbidden Rituals",s:"magic",isMagic:true,
    desc:"Unlock Forbidden rituals to boost troop power.",cw:"unlocked",
    descFn:function(){return G.mysticalUnlocked?"UNLOCKED":"Unlock rituals to boost training"},
    costFn:function(){return 5},
    showFn:function(){return G.magicOn&&!G.mysticalUnlocked},
    effectFn:function(){
      G.mysticalUnlocked=true;
      log("\ud83d\udc8e Ancient gems resonate. Mystical tier unlocked!","magic-msg");
    }});

  // Separate Cost Tiers
  def({id:"separate_costs",name:"\u2694 Separate Cost Tiers",s:"magic",isMagic:true,
    desc:"Each button's cost only increases from its own clicks, not tier siblings",cw:"activated",
    descFn:function(){return G.separateCosts?"COSTS SEPARATED":"Break tier cost sharing"},
    costFn:function(){return 2},
    showFn:function(){return G.magicOn&&!G.separateCosts},
    effectFn:function(){
      // Initialize each button's click count to current pool total so costs don't change
      var armyPool = G._armyClicks || 0;
      var econPool = G._economyClicks || 0;
      var trainPool = G._trainClicks || 0;
      // Army buttons
      ["squad_leader","barracks","military_base","kingdom","empire",
       "planet","solar_system","galaxy","galaxy_cluster","supercluster",
       "observable_universe","full_universe","quantum_multiverse","cosmological_multiverse","mathematical_multiverse"
      ].forEach(function(id){ G._buttonClicks[id] = armyPool; });
      // Economy buttons
      ["farm","plantation","colony"].forEach(function(id){ G._buttonClicks[id] = econPool; });
      // Training buttons
      ["train","sapphire","emerald","ruby"].forEach(function(id){ G._buttonClicks[id] = trainPool; });

      G.separateCosts=true;
      log("\u2694 The chains break. Each button now controls its own destiny.","magic-msg");
    }});

  // Freeze costs
  def({id:"freeze_costs",name:"\u2744 Freeze All Costs",s:"magic",isMagic:true,
    desc:"Permanently freeze all button costs at current values (except Dark Ritual)",cw:"activated",
    descFn:function(){return G.costsFrozen?"COSTS FROZEN":"Stop exponential cost growth forever"},
    costFn:function(){return 3},
    showFn:function(){return G.magicOn&&G.separateCosts&&!G.costsFrozen},
    effectFn:function(){
      G.costsFrozen=true;
      G._frozenCosts={};
      // Snapshot all current costs (except dark_ritual)
      BUTTONS.forEach(function(btn){
        if(btn.id !== 'dark_ritual') G._frozenCosts[btn.id]=btn.costFn();
      });
      G._frozenCosts['recruit']=G.counts["recruit"] ? Math.floor(C.recruitCost * Math.pow(1.02, G.counts["recruit"])) : C.recruitCost;
      log("\u2744 Time freezes. Costs will never rise again (except Dark Ritual).","magic-msg");
    }});

  // Eternal Feast
  def({id:"eternal_feast",name:"\ud83c\udf56 Eternal Feast",s:"magic",isMagic:true,
    desc:"Troops no longer consume food. Economy tier disappears.",cw:"cast",
    descFn:function(){return G.eternalFeast?"HUNGER BANISHED":"End starvation & hide economy tier"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.eternalFeast},
    effectFn:function(){
      G.eternalFeast=true;
      G.starvationStreak=0;
      log("\ud83c\udf56 The Eternal Feast begins. Your armies shall never hunger again.","magic-msg");
    }});

  // Auto-upgrader
  def({id:"auto_upgrader",name:"\u26a1 Auto-Upgrader",s:"magic",isMagic:true,
    desc:"Auto-upgrade a button each click (requires 3 upgrades first)",cw:"installed",
    descFn:function(){return"Pick a button \u2192 auto-upgrades when clicked [10 magic]"},
    costFn:function(){return 0},
    displayCost:10,
    showFn:function(){return G.magicOn && Object.keys(G.upgradeLevels).some(function(k){return G.upgradeLevels[k]>=3})},
    effectFn:function(){openAutoUpgraderModal()}});
}
