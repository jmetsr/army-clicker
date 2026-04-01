// ================================================================
//  BUTTON DEFINITIONS - All game button configurations
// ================================================================

// Modal references (set by events.js)
var openUpgradeModal = null;

function setModalFunctions(upgradeFn) {
  openUpgradeModal = upgradeFn;
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

  // ASTRONOMICAL TIER (army extension) - each building unlocks individually
  [
    {id:"planet", name:"Planet", cw:"colonized", base:1e9, unlock:"empire", boosts:"empirePower",
     unlockCheck: function(){return G.planetUnlocked || G.astronomicalUnlocked}},
    {id:"solar_system", name:"Solar System", cw:"unified", base:1e11, unlock:"planet", boosts:"planetPower",
     unlockCheck: function(){return G.solarSystemUnlocked || G.astronomicalUnlocked}},
    {id:"galaxy", name:"Galaxy", cw:"conquered", base:1e13, unlock:"solar_system", boosts:"solarSystemPower",
     unlockCheck: function(){return G.galaxyUnlocked || G.astronomicalUnlocked}},
    {id:"galaxy_cluster", name:"Galaxy Cluster", cw:"absorbed", base:1e15, unlock:"galaxy", boosts:"galaxyPower",
     unlockCheck: function(){return G.galaxyClusterUnlocked || G.astronomicalUnlocked}},
    {id:"supercluster", name:"Supercluster", cw:"dominated", base:1e17, unlock:"galaxy_cluster", boosts:"galaxyClusterPower",
     unlockCheck: function(){return G.superclusterUnlocked || G.astronomicalUnlocked}}
  ].forEach(function(b){ defChain(b, "army", "_armyClicks", armyCost, b.unlockCheck); });

  // MULTIVERSAL TIER (army extension beyond astronomical) - each building unlocks individually
  [
    {id:"observable_universe", name:"Observable Universe", cw:"encompassed", base:1e19, unlock:"supercluster", boosts:"superclusterPower",
     unlockCheck: function(){return G.observableUniverseUnlocked || G.multiversalUnlocked}},
    {id:"full_universe", name:"Full Universe", cw:"transcended", base:1e21, unlock:"observable_universe", boosts:"observableUniversePower",
     unlockCheck: function(){return G.fullUniverseUnlocked || G.multiversalUnlocked}},
    {id:"quantum_multiverse", name:"Quantum Multiverse", cw:"collapsed", base:1e23, unlock:"full_universe", boosts:"fullUniversePower",
     unlockCheck: function(){return G.quantumMultiverseUnlocked || G.multiversalUnlocked}},
    {id:"cosmological_multiverse", name:"Cosmological Multiverse", cw:"unified", base:1e25, unlock:"quantum_multiverse", boosts:"quantumMultiversePower",
     unlockCheck: function(){return G.cosmologicalMultiverseUnlocked || G.multiversalUnlocked}},
    {id:"mathematical_multiverse", name:"Mathematical Multiverse", cw:"realized", base:1e27, unlock:"cosmological_multiverse", boosts:"cosmologicalMultiversePower",
     unlockCheck: function(){return G.mathematicalMultiverseUnlocked || G.multiversalUnlocked}}
  ].forEach(function(b){ defChain(b, "army", "_armyClicks", armyCost, b.unlockCheck); });

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

  // POWER GEM TIER (training boosters) - each unlocks individually for 3 magic
  [
    {id:"sapphire", name:"Forbidden Ritual", cw:"preformed", base:1e10,
     showFn:function(){return (G.sapphireUnlocked||G.mysticalUnlocked)&&(cntGte("train",50)||cntGt("sapphire",0))},
     trainMultBoost:0.005, updateSessionsPerTrain:true, descFn:function(power){return "Train mult +"+(0.005*power).toFixed(4)+" per click"},
     unlockCheck: function(){return G.sapphireUnlocked || G.mysticalUnlocked}},
    {id:"emerald", name:"School for the Mystic Arts", cw:"built", base:1e13, unlock:"sapphire", boosts:"sapphirePower",
     unlockCheck: function(){return G.emeraldUnlocked || G.mysticalUnlocked}},
    {id:"ruby", name:"Mystical Dimension", cw:"conquered", base:1e17, unlock:"emerald", boosts:"emeraldPower",
     unlockCheck: function(){return G.rubyUnlocked || G.mysticalUnlocked}},
  ].forEach(function(b){
    defChain(b, "training", "_trainClicks", function(base, id){return expCost(base, id)}, b.unlockCheck);
  });

  // DARK RITUAL
  // Cost = 1e12 * 5^n = 10^(12 + n*log10(5)) - use fromSci to avoid Math.pow overflow
  function darkRitualCost() {
    var exponent = 12 + cnt("dark_ritual") * Math.log10(5);
    return OrdinalNumber.fromSci(1, exponent);
  }
  def({id:"dark_ritual",name:"\u2620 Dark Ritual",s:"magic",isMagic:false,isRitual:true,
    desc:"Pay coins for 1 magic. WARNING: Helps enemies!",cw:"performed",
    descFn:function(){
      var cost = darkRitualCost();
      var warn = G.darkRitualDays.length === 0 ? " \u26a0 EMPOWERS YOUR ENEMIES" : "";
      return"Cost: " + fmt(cost) + " coins \u2192 +1 magic" + warn;
    },
    costFn:function(){
      return darkRitualCost();
    },
    showFn:function(){return G.magicOn},
    effectFn:function(){
      // Note: coins already deducted by click handler
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

  // Magic upgrade button - costs 2 magic
  def({id:"upgrade_button",name:"\u2b06 Upgrade Button",s:"magic",isMagic:true,
    desc:"Make any button 10x more powerful (stacks multiplicatively)",cw:"purchased",
    descFn:function(){return"Pick a button \u2192 10x effect (costs 10x too)"},
    costFn:function(){return 0},
    displayCost:2,
    showFn:function(){return G.magicOn},
    effectFn:function(){openUpgradeModal()}});

  // ASTRONOMICAL TIER - Individual building unlocks (1 magic each)
  def({id:"unlock_planet",name:"\u2605 Planet",s:"magic",isMagic:true,
    desc:"Unlock Planet army building",cw:"unlocked",
    descFn:function(){return G.planetUnlocked||G.astronomicalUnlocked?"UNLOCKED":"Unlock Planet"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.planetUnlocked&&!G.astronomicalUnlocked&&cntGte("empire",3)},
    effectFn:function(){
      G.planetUnlocked=true;
      log("\u2605 Planet unlocked! Colonize the cosmos.","magic-msg");
    }});

  def({id:"unlock_solar_system",name:"\u2605 Solar System",s:"magic",isMagic:true,
    desc:"Unlock Solar System army building",cw:"unlocked",
    descFn:function(){return G.solarSystemUnlocked||G.astronomicalUnlocked?"UNLOCKED":"Unlock Solar System"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.solarSystemUnlocked&&!G.astronomicalUnlocked&&(G.planetUnlocked||G.astronomicalUnlocked)&&cntGte("planet",3)},
    effectFn:function(){
      G.solarSystemUnlocked=true;
      log("\u2605 Solar System unlocked! Unify the stars.","magic-msg");
    }});

  def({id:"unlock_galaxy",name:"\u2605 Galaxy",s:"magic",isMagic:true,
    desc:"Unlock Galaxy army building",cw:"unlocked",
    descFn:function(){return G.galaxyUnlocked||G.astronomicalUnlocked?"UNLOCKED":"Unlock Galaxy"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.galaxyUnlocked&&!G.astronomicalUnlocked&&(G.solarSystemUnlocked||G.astronomicalUnlocked)&&cntGte("solar_system",3)},
    effectFn:function(){
      G.galaxyUnlocked=true;
      log("\u2605 Galaxy unlocked! Conquer the spiral arms.","magic-msg");
    }});

  def({id:"unlock_galaxy_cluster",name:"\u2605 Galaxy Cluster",s:"magic",isMagic:true,
    desc:"Unlock Galaxy Cluster army building",cw:"unlocked",
    descFn:function(){return G.galaxyClusterUnlocked||G.astronomicalUnlocked?"UNLOCKED":"Unlock Galaxy Cluster"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.galaxyClusterUnlocked&&!G.astronomicalUnlocked&&(G.galaxyUnlocked||G.astronomicalUnlocked)&&cntGte("galaxy",3)},
    effectFn:function(){
      G.galaxyClusterUnlocked=true;
      log("\u2605 Galaxy Cluster unlocked! Absorb galactic masses.","magic-msg");
    }});

  def({id:"unlock_supercluster",name:"\u2605 Supercluster",s:"magic",isMagic:true,
    desc:"Unlock Supercluster army building",cw:"unlocked",
    descFn:function(){return G.superclusterUnlocked||G.astronomicalUnlocked?"UNLOCKED":"Unlock Supercluster"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.superclusterUnlocked&&!G.astronomicalUnlocked&&(G.galaxyClusterUnlocked||G.astronomicalUnlocked)&&cntGte("galaxy_cluster",3)},
    effectFn:function(){
      G.superclusterUnlocked=true;
      log("\u2605 Supercluster unlocked! Dominate cosmic structures.","magic-msg");
    }});

  // MULTIVERSAL TIER - Individual building unlocks (1 magic each)
  def({id:"unlock_observable_universe",name:"\ud83c\udf0c Observable Universe",s:"magic",isMagic:true,
    desc:"Unlock Observable Universe army building",cw:"unlocked",
    descFn:function(){return G.observableUniverseUnlocked||G.multiversalUnlocked?"UNLOCKED":"Unlock Observable Universe"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.observableUniverseUnlocked&&!G.multiversalUnlocked&&(G.superclusterUnlocked||G.astronomicalUnlocked)&&cntGte("supercluster",3)},
    effectFn:function(){
      G.observableUniverseUnlocked=true;
      log("\ud83c\udf0c Observable Universe unlocked! Encompass all that is seen.","magic-msg");
    }});

  def({id:"unlock_full_universe",name:"\ud83c\udf0c Full Universe",s:"magic",isMagic:true,
    desc:"Unlock Full Universe army building",cw:"unlocked",
    descFn:function(){return G.fullUniverseUnlocked||G.multiversalUnlocked?"UNLOCKED":"Unlock Full Universe"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.fullUniverseUnlocked&&!G.multiversalUnlocked&&(G.observableUniverseUnlocked||G.multiversalUnlocked)&&cntGte("observable_universe",3)},
    effectFn:function(){
      G.fullUniverseUnlocked=true;
      log("\ud83c\udf0c Full Universe unlocked! Transcend the observable.","magic-msg");
    }});

  def({id:"unlock_quantum_multiverse",name:"\ud83c\udf0c Quantum Multiverse",s:"magic",isMagic:true,
    desc:"Unlock Quantum Multiverse army building",cw:"unlocked",
    descFn:function(){return G.quantumMultiverseUnlocked||G.multiversalUnlocked?"UNLOCKED":"Unlock Quantum Multiverse"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.quantumMultiverseUnlocked&&!G.multiversalUnlocked&&(G.fullUniverseUnlocked||G.multiversalUnlocked)&&cntGte("full_universe",3)},
    effectFn:function(){
      G.quantumMultiverseUnlocked=true;
      log("\ud83c\udf0c Quantum Multiverse unlocked! Collapse infinite possibilities.","magic-msg");
    }});

  def({id:"unlock_cosmological_multiverse",name:"\ud83c\udf0c Cosmological Multiverse",s:"magic",isMagic:true,
    desc:"Unlock Cosmological Multiverse army building",cw:"unlocked",
    descFn:function(){return G.cosmologicalMultiverseUnlocked||G.multiversalUnlocked?"UNLOCKED":"Unlock Cosmological Multiverse"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.cosmologicalMultiverseUnlocked&&!G.multiversalUnlocked&&(G.quantumMultiverseUnlocked||G.multiversalUnlocked)&&cntGte("quantum_multiverse",3)},
    effectFn:function(){
      G.cosmologicalMultiverseUnlocked=true;
      log("\ud83c\udf0c Cosmological Multiverse unlocked! Unify parallel cosmoses.","magic-msg");
    }});

  def({id:"unlock_mathematical_multiverse",name:"\ud83c\udf0c Mathematical Multiverse",s:"magic",isMagic:true,
    desc:"Unlock Mathematical Multiverse army building",cw:"unlocked",
    descFn:function(){return G.mathematicalMultiverseUnlocked||G.multiversalUnlocked?"UNLOCKED":"Unlock Mathematical Multiverse"},
    costFn:function(){return 1},
    showFn:function(){return G.magicOn&&!G.mathematicalMultiverseUnlocked&&!G.multiversalUnlocked&&(G.cosmologicalMultiverseUnlocked||G.multiversalUnlocked)&&cntGte("cosmological_multiverse",3)},
    effectFn:function(){
      G.mathematicalMultiverseUnlocked=true;
      log("\ud83c\udf0c Mathematical Multiverse unlocked! Realize all logically consistent structures.","magic-msg");
    }});

  // FORBIDDEN RITUALS - Individual unlocks (10/20/50 magic)
  def({id:"unlock_sapphire",name:"\ud83d\udc8e Forbidden Ritual",s:"magic",isMagic:true,
    desc:"Unlock Forbidden Ritual to boost training",cw:"unlocked",
    descFn:function(){return G.sapphireUnlocked||G.mysticalUnlocked?"UNLOCKED":"Unlock Forbidden Ritual"},
    costFn:function(){return 10},
    showFn:function(){return G.magicOn&&!G.sapphireUnlocked&&!G.mysticalUnlocked},
    effectFn:function(){
      G.sapphireUnlocked=true;
      log("\ud83d\udc8e Forbidden Ritual unlocked! Dark power awaits.","magic-msg");
    }});

  def({id:"unlock_emerald",name:"\ud83d\udc8e School for the Mystic Arts",s:"magic",isMagic:true,
    desc:"Unlock School for the Mystic Arts",cw:"unlocked",
    descFn:function(){return G.emeraldUnlocked||G.mysticalUnlocked?"UNLOCKED":"Unlock School for the Mystic Arts"},
    costFn:function(){return 20},
    showFn:function(){return G.magicOn&&!G.emeraldUnlocked&&!G.mysticalUnlocked&&(G.sapphireUnlocked||G.mysticalUnlocked)&&cntGte("sapphire",3)},
    effectFn:function(){
      G.emeraldUnlocked=true;
      log("\ud83d\udc8e School for the Mystic Arts unlocked! Train your mystics.","magic-msg");
    }});

  def({id:"unlock_ruby",name:"\ud83d\udc8e Mystical Dimension",s:"magic",isMagic:true,
    desc:"Unlock Mystical Dimension",cw:"unlocked",
    descFn:function(){return G.rubyUnlocked||G.mysticalUnlocked?"UNLOCKED":"Unlock Mystical Dimension"},
    costFn:function(){return 50},
    showFn:function(){return G.magicOn&&!G.rubyUnlocked&&!G.mysticalUnlocked&&(G.emeraldUnlocked||G.mysticalUnlocked)&&cntGte("emerald",3)},
    effectFn:function(){
      G.rubyUnlocked=true;
      log("\ud83d\udc8e Mystical Dimension unlocked! Conquer the arcane realm.","magic-msg");
    }});

  // Separate Cost Tiers - costs 3 magic
  def({id:"separate_costs",name:"\u2694 Separate Cost Tiers",s:"magic",isMagic:true,
    desc:"Each button's cost only increases from its own clicks, not tier siblings",cw:"activated",
    descFn:function(){return G.separateCosts?"COSTS SEPARATED":"Break tier cost sharing"},
    costFn:function(){return 3},
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

  // Freeze costs - costs 4 magic
  def({id:"freeze_costs",name:"\u2744 Freeze All Costs",s:"magic",isMagic:true,
    desc:"Permanently freeze all button costs at current values (except Dark Ritual)",cw:"activated",
    descFn:function(){return G.costsFrozen?"COSTS FROZEN":"Stop exponential cost growth forever"},
    costFn:function(){return 4},
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
}
