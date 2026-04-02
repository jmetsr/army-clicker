// ================================================================
//  GAME DATA - Constants, troop names, button definitions
// ================================================================

// TUNING CONSTANTS - Edit in console: C.recruitCost=5; updateUI()
var C = {
  lootBase: 1,
  recruitCost: 20,
  recruitPower: 1,
  // Base costs for exponential scaling: cost = base * 1.04^count
  squadLeader_baseCost: 400,
  barracks_baseCost: 1600,
  militaryBase_baseCost: 30000,
  kingdom_baseCost: 400000,
  empire_baseCost: 40000000,
  barracks_unlock: 3,
  militaryBase_unlock: 3,
  kingdom_unlock: 3,
  empire_unlock: 3,
  // Commander chain (auto-loot) - uses own cost pool
  commander_baseCost: 10000,
  general_baseCost: 200000,
  general_unlock: 3,
  train_baseCost: 160,
  train_multiplier: 1.01,
  train_unlockTroops: 5,
  // Food system
  food_perTroopDay: 1,     // food consumed per troop per day
  farm_baseCost: 1000,     // base cost of a farm
  farm_production: 100,    // food per farm per day (sustains ~100 troops)
  plantation_baseCost: 5000,   // base cost of a plantation (boosts farms per click)
  colony_baseCost: 25000,      // base cost of a colony (boosts plantations per click)
  magic_unlockTP: 1e12,  // 1 trillion coins to unlock magic
  entropy_max: 99,  // Max entropy percentage (1 magic = 1%)
  // Color schemes keyed by power/troop threshold (powers of 10)
  colorSchemes: [
    // ppt=1: Warm earth (thugs)
    [1, {"--bg":"#f5f1ea","--surface":"#fff","--surface2":"#ece8df","--border":"#d4cfc4","--text":"#2a2520","--dim":"#6e655a","--accent":"#b86e1a","--troop":"#5a4020","--power":"#2a6a9e","--magic":"#7b2d8e","--danger":"#c03028","--growth":"#27763a"}],
    // ppt=10: Steel blue (soldiers)
    [10, {"--bg":"#eaeff5","--surface":"#f5f8fc","--surface2":"#dde4ee","--border":"#b8c4d4","--text":"#1a2530","--dim":"#5a6878","--accent":"#3468a0","--troop":"#1a3560","--power":"#2a6a9e","--magic":"#6a3090","--danger":"#b82828","--growth":"#1a6830"}],
    // ppt=100: Dark crimson (swordsmen)
    [100, {"--bg":"#f5eaea","--surface":"#fcf5f5","--surface2":"#eedede","--border":"#d4b8b8","--text":"#301a1a","--dim":"#785a5a","--accent":"#a03030","--troop":"#601a1a","--power":"#8a3030","--magic":"#6a2080","--danger":"#cc2020","--growth":"#306018"}],
    // ppt=1000: Swamp green (ogres)
    [1000, {"--bg":"#eaf0e8","--surface":"#f2f8f0","--surface2":"#dbe6d8","--border":"#a8bea4","--text":"#1a2518","--dim":"#4a5a48","--accent":"#3a6a20","--troop":"#2a4a10","--power":"#306818","--magic":"#5a2878","--danger":"#a83020","--growth":"#2a5a10"}],
    // ppt=10000: Mountain purple (giants)
    [10000, {"--bg":"#edeaf2","--surface":"#f5f2fa","--surface2":"#ddd8e8","--border":"#b8b0c8","--text":"#201a30","--dim":"#605878","--accent":"#5a3a90","--troop":"#3a2060","--power":"#5a3a90","--magic":"#8020a0","--danger":"#a02848","--growth":"#305880"}],
    // ppt=100000: Dark fire (dragons)
    [100000, {"--bg":"#1a1210","--surface":"#2a1e18","--surface2":"#3a2820","--border":"#5a4030","--text":"#e8d8c8","--dim":"#9a8068","--accent":"#e87020","--troop":"#ff9030","--power":"#e86830","--magic":"#c040ff","--danger":"#ff3030","--growth":"#e8a020"}],
    // ppt=1e6: Void purple (demons)
    [1e6, {"--bg":"#0e0818","--surface":"#1a1028","--surface2":"#281838","--border":"#402858","--text":"#d8c8f0","--dim":"#8060a0","--accent":"#b040ff","--troop":"#d060ff","--power":"#9040d0","--magic":"#ff40c0","--danger":"#ff2060","--growth":"#a060ff"}],
    // ppt=1e7: Hellscape red (elder gods)
    [1e7, {"--bg":"#180808","--surface":"#280e0e","--surface2":"#381414","--border":"#582020","--text":"#f0c8b8","--dim":"#a06050","--accent":"#ff4020","--troop":"#ff6030","--power":"#ff3020","--magic":"#ff20a0","--danger":"#ff1020","--growth":"#ff8020"}],
    // ppt=1e8: Cosmic blue (cosmic entities)
    [1e8, {"--bg":"#060610","--surface":"#0e0e20","--surface2":"#161630","--border":"#2a2a50","--text":"#c8c8f0","--dim":"#6060a0","--accent":"#4080ff","--troop":"#60a0ff","--power":"#4080ff","--magic":"#c060ff","--danger":"#ff4060","--growth":"#40ffa0"}],
    // ppt=1e9: Abstract void (abstract forces)
    [1e9, {"--bg":"#030308","--surface":"#080810","--surface2":"#101020","--border":"#202040","--text":"#e0e0f8","--dim":"#8080c0","--accent":"#80c0ff","--troop":"#a0d0ff","--power":"#60a0ff","--magic":"#e080ff","--danger":"#ff6080","--growth":"#80ffc0"}]
  ]
};

// FORMATTING WORDS
var WORDS = [
  [1e33,"decillion"],[1e30,"nonillion"],[1e27,"octillion"],[1e24,"septillion"],
  [1e21,"sextillion"],[1e18,"quintillion"],[1e15,"quadrillion"],[1e12,"trillion"],
  [1e9,"billion"],[1e6,"million"],[1e3,"thousand"]
];

// TROOP NAMES by power per troop threshold
var TROOP_NAMES = [
  [1e1000,"Chuck Norrises"],
  [1e100,"Ultra Macro Agentic Galaxies"],
  [1e26,"Dyson Sphere Powered Planet Sized Tornadoes"],
  [1e23,"Celestial Forces"],
  [1e20,"Elder Gods"],
  [4.5e16,"Titans"],
  [1e14,"Fallen Angels"],
  [5e11,"Demon Lords"],
  [2e10,"Balrogs"],
  [5e8,"Archdemons"],
  [2e6,"Elder Dragons"],
  [6e4,"Dragons"],
  [5e4,"Wyrms"],
  [12000,"Giant Knights on Giant Horses"],
  [3600,"Giants With Nunchucks"],
  [1800,"Giant Pikemen"],
  [600,"Giants"],
  [200,"Ogres"],
  [100,"Trolls"],
  [75,"War Orcs"],
  [60,"Orcs"],
  [20,"Knights on Horseback"],
  [18,"Armored Swordsmen"],
  [16,"Swordsmen"],
  [13,"Archers"],
  [8,"Soldiers with Katanas"],
  [6,"Soldiers with Nunchucks"],
  [3,"Pikemen"],
  [2,"Soldiers with Daggers"],
  [1.5,"Thugs with Knives"],
  [0,"Thugs"]
];

// TROOP ICONS
var TROOP_ICONS = {
  "Thugs": "icons/Thug.png",
  "Thugs with Knives": "icons/Thug with Knife.png",
  "Soldiers with Daggers": "icons/Soldiers with Dagger.png",
  "Pikemen": "icons/Pikeman.png",
  "Soldiers with Nunchucks": "icons/Soldiers with Nunchucks.png",
  "Soldiers with Katanas": "icons/Soldiers with Katanas.png",
  "Archers": "icons/Archers.png",
  "Swordsmen": "icons/Swordsmen.png",
  "Armored Swordsmen": "icons/Armored Swordsmen.png",
  "Knights on Horseback": "icons/Knights on Horseback.png",
  "Orcs": "icons/Orcs.png",
  "War Orcs": "icons/War Orcs.png",
  "Trolls": "icons/Trolls.png",
  "Ogres": "icons/Ogres.png",
  "Giants": "icons/Giants.png",
  "Giant Pikemen": "icons/Giant Pikeman.png",
  "Giants With Nunchucks": "icons/Giant with nunchucks.png",
  "Giant Knights on Giant Horses": "icons/Giant Knight on Giant Horse.png",
  "Wyrms": "icons/Wrym.png",
  "Dragons": "icons/dragon.png",
  "Elder Dragons": "icons/elder dragon.png",
  "Archdemons": "icons/archdemon.png",
  "Balrogs": "icons/Balrog.png",
  "Demon Lords": "icons/Demon Lord.png",
  "Fallen Angels": "icons/Fallen Angels.png"
};

// GROUP NAMES by troop count
var GROUP_NAMES = [
  [1e15,"Tide"],[1e12,"Swarm"],[1e9,"Horde"],[1e6,"Army"],
  [1e5,"Legion"],[1e4,"Regiment"],[1000,"Battalion"],
  [200,"Company"],[50,"Band"],[10,"Gang"],[0,"Crew"]
];

// FLAVOR EVENTS
var FLAVOR_EVENTS = [
  // Time-based events (seconds = days)
  {t:7, msg:"Day 7. A week of conquest behind you."},
  {t:14, msg:"Day 14. Two weeks. The locals grow wary."},
  {t:21, msg:"Day 21. Three weeks. Your name spreads."},
  {t:30, msg:"Day 30. A month passes. Winter approaches."},
  {t:45, msg:"Day 45. Six weeks of war. Supplies run low."},
  {t:60, msg:"Day 60. Two months. The first snow falls."},
  {t:90, msg:"Day 90. Three months. A harsh winter grips the land."},
  {t:120, msg:"Day 120. Four months. The snow begins to melt."},
  {t:150, msg:"Day 150. Five months. Spring brings new recruits."},
  {t:180, msg:"Day 180. Half a year. The campaign continues."},
  {t:210, msg:"Day 210. Seven months. Summer heat bakes the battlefield."},
  {t:240, msg:"Day 240. Eight months. Harvest season - villages burn."},
  {t:270, msg:"Day 270. Nine months. Children born this war have never known peace."},
  {t:300, msg:"Day 300. Ten months. Veterans forget their old lives."},
  {t:330, msg:"Day 330. Eleven months. The anniversary approaches."},
  {t:365, msg:"Day 365. ONE YEAR of endless conquest."},
  {t:400, msg:"Day 400. The second year begins."},
  {t:450, msg:"Day 450. Fifteen months. New legends replace old ones."},
  {t:500, msg:"Day 500. Five hundred days of war."},
  {t:548, msg:"Day 548. Eighteen months. A generation grows up fighting."},
  {t:600, msg:"Day 600. Twenty months. The old maps are obsolete."},
  {t:650, msg:"Day 650. Some soldiers have fought longer than they lived before."},
  {t:730, msg:"Day 730. TWO YEARS. The war has no memory of peace."},
  {t:800, msg:"Day 800. Borders are theoretical."},
  {t:900, msg:"Day 900. Nine hundred days. The world reshapes itself."},
  {t:1000, msg:"Day 1000. A THOUSAND DAYS of conquest."},
  {t:1095, msg:"Day 1095. THREE YEARS. Children born at war's start now walk."},
  {t:1200, msg:"Day 1200. Languages blend on the battlefield."},
  {t:1400, msg:"Day 1400. Nearly four years. Empires have risen and fallen faster."},
  {t:1460, msg:"Day 1460. FOUR YEARS of unbroken war."},
  {t:1600, msg:"Day 1600. The old world is a fading memory."},
  {t:1825, msg:"Day 1825. FIVE YEARS. Half a decade of dominion."},
  {t:2000, msg:"Day 2000. Two thousand days. History takes note."},
  {t:2190, msg:"Day 2190. SIX YEARS. New soldiers were children when this began."},
  {t:2500, msg:"Day 2500. The war has its own culture now."},
  {t:2555, msg:"Day 2555. SEVEN YEARS. A biblical span."},
  {t:2920, msg:"Day 2920. EIGHT YEARS of endless conquest."},
  {t:3000, msg:"Day 3000. Three thousand days of blood and gold."},
  {t:3285, msg:"Day 3285. NINE YEARS. A decade approaches."},
  {t:3650, msg:"Day 3650. TEN YEARS. A DECADE of war. The world before is myth."},
  {t:4000, msg:"Day 4000. Eleven years. Your army is a nation unto itself."},
  {t:4500, msg:"Day 4500. Twelve years. Veterans' children join the ranks."},
  {t:5000, msg:"Day 5000. Nearly fourteen years. The war is eternal."},
  {t:5475, msg:"Day 5475. FIFTEEN YEARS. Half a generation."},
  {t:6000, msg:"Day 6000. Sixteen years. Some soldiers have known nothing else."},
  {t:7300, msg:"Day 7300. TWENTY YEARS. Those born at start now fight."},
  {t:9125, msg:"Day 9125. TWENTY-FIVE YEARS. A quarter century of conquest."},
  {t:10950, msg:"Day 10950. THIRTY YEARS. A generational war."},
  {t:14600, msg:"Day 14600. FORTY YEARS. Two generations."},
  {t:18250, msg:"Day 18250. FIFTY YEARS. Half a century. You are legend."},

  // Atmospheric events (also time-based)
  {t:10, msg:"Your thugs look restless."},
  {t:25, msg:"A cold wind blows through the camp."},
  {t:40, msg:"Someone mutters about better pay."},
  {t:55, msg:"The smell of copper fills the air."},
  {t:75, msg:"Rumors spread of distant treasure."},
  {t:85, msg:"A crow watches from a dead tree."},
  {t:100, msg:"The moon rises, blood-red."},
  {t:115, msg:"Distant drums echo across the hills."},
  {t:135, msg:"A messenger arrives, says nothing, leaves."},
  {t:165, msg:"The fire crackles with strange colors."},
  {t:195, msg:"Your shadow seems to move independently."},
  {t:225, msg:"A raven brings an unsigned letter."},
  {t:255, msg:"The stars align in an unfamiliar pattern."},
  {t:285, msg:"Someone claims to see ghosts in the mist."},
  {t:315, msg:"The ground shakes. Something stirs below."},
  {t:345, msg:"A merchant offers wares you've never seen."},
  {t:380, msg:"An old woman curses your banner."},
  {t:420, msg:"A comet streaks across the sky."},
  {t:470, msg:"The rivers run red after the last battle."},
  {t:520, msg:"A prophet predicts your doom. You ignore him."},
  {t:570, msg:"Strange lights dance on the horizon."},
  {t:620, msg:"A foreign emissary requests audience."},
  {t:680, msg:"The blacksmiths work through the night."},
  {t:750, msg:"Songs are sung of your conquests."},
  {t:820, msg:"A library burns. Knowledge is lost."},
  {t:880, msg:"Earthquakes trouble the eastern provinces."},
  {t:950, msg:"A plague sweeps through enemy lands."},
  {t:1050, msg:"Eclipse. The sun vanishes for minutes."},
  {t:1150, msg:"A volcano erupts in distant mountains."},
  {t:1250, msg:"The ocean swallows a coastal city."},
  {t:1350, msg:"A dragon is rumored in the north."},
  {t:1500, msg:"The currency changes. Old coins are melted."},
  {t:1700, msg:"A new religion emerges among the conquered."},
  {t:1900, msg:"The calendar is reformed. Time itself bends to your will."},
  {t:2100, msg:"Ancient tombs are unsealed. Secrets emerge."},
  {t:2300, msg:"A tower is built to touch the heavens."},
  {t:2600, msg:"The last independent city surrenders."},
  {t:2800, msg:"Scholars debate whether peace ever existed."},
  {t:3100, msg:"A monument is carved into a mountainside."},
  {t:3400, msg:"The concept of 'abroad' becomes meaningless."},
  {t:3800, msg:"New stars appear in the sky. Or are they?"},
  {t:4200, msg:"The ocean freezes for a winter."},
  {t:4700, msg:"A second moon is observed. Then denied."},
  {t:5200, msg:"The trees grow in strange patterns."},
  {t:5800, msg:"Animals behave oddly. Migration patterns shift."},
  {t:6500, msg:"The northern lights are seen everywhere."},
  {t:7500, msg:"Time feels different. Days stretch."},
  {t:8500, msg:"Reality becomes negotiable."},
  {t:10000, msg:"The very concept of history warps around you."}
];

// Condition-based flavor events (generated dynamically, need G reference)
function getConditionEvents(G, tpFn, cntFn, ePctFn) {
  return [
    // Troop count events
    {cond:function(){return G.troops.gte(10)}, msg:"A proper crew assembles."},
    {cond:function(){return G.troops.gte(25)}, msg:"Your numbers demand attention."},
    {cond:function(){return G.troops.gte(50)}, msg:"The streets clear when you pass."},
    {cond:function(){return G.troops.gte(100)}, msg:"A hundred strong. Fear spreads."},
    {cond:function(){return G.troops.gte(250)}, msg:"Merchants pay tribute willingly."},
    {cond:function(){return G.troops.gte(500)}, msg:"The city guard avoids your district."},
    {cond:function(){return G.troops.gte(1000)}, msg:"A thousand warriors. A true force."},
    {cond:function(){return G.troops.gte(2500)}, msg:"Nobles send nervous emissaries."},
    {cond:function(){return G.troops.gte(5000)}, msg:"Your army rivals the kingdom's."},
    {cond:function(){return G.troops.gte(10000)}, msg:"Ten thousand! The earth shudders at their march."},
    {cond:function(){return G.troops.gte(50000)}, msg:"Your horde darkens the horizon."},
    {cond:function(){return G.troops.gte(100000)}, msg:"One hundred thousand. A tide of steel."},
    {cond:function(){return G.troops.gte(500000)}, msg:"Half a million strong. Nations fall silent."},
    {cond:function(){return G.troops.gte(1e6)}, msg:"A million warriors. History has no precedent."},
    {cond:function(){return G.troops.gte(1e9)}, msg:"A billion souls march under your banner."},
    {cond:function(){return G.troops.gte(1e12)}, msg:"A trillion. The concept of 'army' breaks down."},

    // Power per troop events
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=2}, msg:"Your thugs grow stronger."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=5}, msg:"These are soldiers now, not rabble."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=10}, msg:"Each warrior worth ten ordinary men."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=25}, msg:"Legends spread of your warriors' prowess."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=50}, msg:"Your troops transcend human limits."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=100}, msg:"Giants walk among you now."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=500}, msg:"Dragons answer your call."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=1000}, msg:"Demonic power courses through your ranks."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=10000}, msg:"Reality bends around your warriors."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=100000}, msg:"Your troops exist beyond mortality."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=1e6}, msg:"Each soldier is a walking apocalypse."},
    {cond:function(){var p=typeof G.ppt==='number'?G.ppt:G.ppt.toNumber();return p>=1e9}, msg:"Abstract forces of destruction incarnate."},

    // Total power events
    {cond:function(){return tpFn().gte(1000)}, msg:"A thousand power. You're getting somewhere."},
    {cond:function(){return tpFn().gte(10000)}, msg:"Ten thousand. Respectable."},
    {cond:function(){return tpFn().gte(100000)}, msg:"One hundred thousand. The strong notice you."},
    {cond:function(){return tpFn().gte(1e6)}, msg:"A million power. You are undeniably mighty."},
    {cond:function(){return tpFn().gte(1e7)}, msg:"Ten million. Kings would kneel."},
    {cond:function(){return tpFn().gte(1e8)}, msg:"A hundred million. The world is yours."},
    {cond:function(){return tpFn().gte(1e9)}, msg:"A billion. You approach the divine."},
    {cond:function(){return tpFn().gte(1e10)}, msg:"Ten billion. Gods take notice."},
    {cond:function(){return tpFn().gte(5e10)}, msg:"Fifty billion. The threshold of darkness beckons."},
    {cond:function(){return tpFn().gte(1e11)}, msg:"A hundred billion. You have transcended."},
    {cond:function(){return tpFn().gte(1e12)}, msg:"A trillion. Numbers fail to capture your might."},
    {cond:function(){return tpFn().gte(1e15)}, msg:"A quadrillion. Reality itself strains."},
    {cond:function(){return tpFn().gte(1e18)}, msg:"A quintillion. The universe acknowledges you."},

    // Coin events
    {cond:function(){return G.coins.gte(1e6)}, msg:"Your first million coins. Wealth accumulates."},
    {cond:function(){return G.coins.gte(1e9)}, msg:"A billion coins. The economy bends to you."},
    {cond:function(){return G.coins.gte(1e12)}, msg:"A trillion coins. Money loses meaning."},

    // Upgrade count events
    {cond:function(){return cntFn("train")>=10}, msg:"Ten training sessions. Discipline takes hold."},
    {cond:function(){return cntFn("train")>=25}, msg:"Twenty-five sessions. Your army is hardened."},
    {cond:function(){return cntFn("train")>=50}, msg:"Fifty sessions. Veterans, all."},
    {cond:function(){return cntFn("train")>=100}, msg:"A hundred training sessions. Mastery approaches."},
    {cond:function(){return cntFn("train")>=200}, msg:"Two hundred sessions. Beyond mortal skill."},
    {cond:function(){return cntFn("squad_leader")>=10}, msg:"Ten squad leaders. A proper hierarchy forms."},
    {cond:function(){return cntFn("squad_leader")>=50}, msg:"Fifty squad leaders. Command runs deep."},
    {cond:function(){return cntFn("barracks")>=10}, msg:"Ten barracks. An infrastructure of war."},
    {cond:function(){return cntFn("military_base")>=5}, msg:"Five military bases. An empire takes shape."},
    {cond:function(){return cntFn("kingdom")>=3}, msg:"Three kingdoms united. A continental power."},
    {cond:function(){return cntFn("empire")>=1}, msg:"An empire forged. The world map changes."},

    // Magic events
    {cond:function(){return G.ltMagic>=1}, msg:"You have tasted dark power. It tastes like ash."},
    {cond:function(){return G.ltMagic>=10}, msg:"The darkness grows familiar. Too familiar."},
    {cond:function(){return G.ltMagic>=100}, msg:"One hundred magic. The corruption is permanent."},
    {cond:function(){return G.ltMagic>=500}, msg:"You are more darkness than light now."},
    {cond:function(){return G.ltMagic>=1000}, msg:"A thousand magic. The void stares back."},

    // Train multiplier events
    {cond:function(){return G.trainMult>=1.05}, msg:"Your training regimen intensifies."},
    {cond:function(){return G.trainMult>=1.1}, msg:"Training efficiency doubles the baseline."},
    {cond:function(){return G.trainMult>=1.25}, msg:"Each session transforms your warriors."},
    {cond:function(){return G.trainMult>=1.5}, msg:"Training has become an art form."},
    {cond:function(){return G.trainMult>=2.0}, msg:"Double efficiency. Your methods are legendary."},
    {cond:function(){return G.trainMult>=5.0}, msg:"Five times standard. Science cannot explain it."},
    {cond:function(){return G.trainMult>=10.0}, msg:"Ten times. Training transcends physics."},

    // Random flavor (shown when nothing else triggers)
    {cond:function(){return Math.random()<0.02}, msg:"A scout returns with troubling news.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"The troops share stories around the fire.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A distant horn echoes.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"Someone sharpens their blade.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A dog barks at nothing.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"The wind carries whispers.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A coin flips and lands on edge.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"Two soldiers argue over rations.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A child watches your army pass.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"The map shows lands yet unconquered.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A merchant hawk strange potions.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"The quartermaster complains.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"Vultures circle overhead.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"A soldier prays to forgotten gods.", random:true},
    {cond:function(){return Math.random()<0.02}, msg:"The treasury needs counting.", random:true}
  ];
}
