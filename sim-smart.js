// Test the smart AI strategy vs others
class ON {
  constructor(v){this.value=v instanceof ON?v.value:typeof v==='bigint'?v:BigInt(Math.max(0,Math.floor(v||0)))}
  add(o){return new ON(this.value+(o instanceof ON?o:new ON(o)).value)}
  sub(o){const ov=(o instanceof ON?o:new ON(o)).value;return new ON(this.value>ov?this.value-ov:0n)}
  mul(n){return new ON(n instanceof ON?this.value*n.value:this.value*BigInt(Math.floor(n)))}
  gte(o){return this.value>=(o instanceof ON?o:new ON(o)).value}
  lt(o){return !this.gte(o)}
  toNumber(){return Number(this.value)}
}

const C={recruitCost:10,squadLeader_baseCost:200,barracks_baseCost:800,colony_baseCost:15000,kingdom_baseCost:200000,train_baseCost:80,train_multiplier:1.01};

function createAI() {
  return {
    coins: new ON(0), troops: new ON(1), ppt: 1, rp: 1,
    squadLeaderPower: 1, barracksPower: 1, colonyPower: 1, kingdomPower: 1,
    trainMult: C.train_multiplier, counts: {}, _armyClicks: 0, _trainClicks: 0
  };
}

function runSmartAI(ai, clicks) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiTp() { return ai.troops.mul(ai.ppt); }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.03, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }

  function buyArmy(id, base, power, boostVar) {
    const cost = aiArmyCost(base);
    if(ai.coins.lt(cost)) return false;
    ai.coins = ai.coins.sub(cost);
    ai.counts[id] = (ai.counts[id] || 0) + ai[power];
    ai._armyClicks++;
    if(boostVar) ai[boostVar] += ai[power];
    if(id === "squad_leader") ai.rp = 1 + aiCnt("squad_leader");
    return true;
  }

  for(let i = 0; i < clicks; i++){
    const hasFullChain = aiCnt("kingdom") >= 3;

    if(!hasFullChain){
      // Rush to unlock kingdoms
      if(aiCnt("colony") >= 3 && aiCnt("kingdom") < 3){
        if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")) continue;
      }
      if(aiCnt("barracks") >= 3 && aiCnt("colony") < 3){
        if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")) continue;
      }
      if(aiCnt("squad_leader") >= 3 && aiCnt("barracks") < 3){
        if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")) continue;
      }
      if(ai.troops.gte(2) && aiCnt("squad_leader") < 3){
        if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)) continue;
      }
      const rCost = aiRecruitCost();
      if(ai.coins.gte(rCost)){ ai.coins = ai.coins.sub(rCost); ai.troops = ai.troops.add(ai.rp); ai.counts["recruit"] = (ai.counts["recruit"]||0)+1; continue; }
      if(ai.troops.gte(1)){ let gain = aiTp(); if(gain.lt(1)) gain = new ON(1); ai.coins = ai.coins.add(gain); continue; }
    }

    // Full chain - balance based on efficiency
    const options = [];

    const tCost = aiTrainCost();
    if(ai.troops.gte(5) && ai.coins.gte(tCost)){
      options.push({type:"train", efficiency: 0.01 / tCost, cost: tCost});
    }

    if(aiCnt("colony") >= 3){
      const kCost = aiArmyCost(C.kingdom_baseCost);
      const kMult = ai.kingdomPower / ai.colonyPower;
      if(ai.coins.gte(kCost)) options.push({type:"kingdom", efficiency: kMult / kCost, cost: kCost});
    }
    if(aiCnt("barracks") >= 3){
      const cCost = aiArmyCost(C.colony_baseCost);
      const cMult = ai.colonyPower / ai.barracksPower;
      if(ai.coins.gte(cCost)) options.push({type:"colony", efficiency: cMult / cCost, cost: cCost});
    }
    if(aiCnt("squad_leader") >= 3){
      const bCost = aiArmyCost(C.barracks_baseCost);
      const bMult = ai.barracksPower / ai.squadLeaderPower;
      if(ai.coins.gte(bCost)) options.push({type:"barracks", efficiency: bMult / bCost, cost: bCost});
    }
    if(ai.troops.gte(2)){
      const slCost = aiArmyCost(C.squadLeader_baseCost);
      const slMult = ai.squadLeaderPower / ai.rp;
      if(ai.coins.gte(slCost)) options.push({type:"squad_leader", efficiency: slMult / slCost, cost: slCost});
    }

    options.sort((a,b) => b.efficiency - a.efficiency);

    let acted = false;
    for(const opt of options){
      if(opt.type === "train"){
        ai.coins = ai.coins.sub(opt.cost);
        ai.ppt *= ai.trainMult;
        ai.counts["train"] = (ai.counts["train"]||0) + 1;
        ai._trainClicks++;
        acted = true; break;
      } else if(opt.type === "kingdom"){
        if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")){ acted = true; break; }
      } else if(opt.type === "colony"){
        if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")){ acted = true; break; }
      } else if(opt.type === "barracks"){
        if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")){ acted = true; break; }
      } else if(opt.type === "squad_leader"){
        if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)){ acted = true; break; }
      }
    }
    if(acted) continue;

    const rCost = aiRecruitCost();
    if(ai.coins.gte(rCost)){
      ai.coins = ai.coins.sub(rCost);
      ai.troops = ai.troops.add(ai.rp);
      ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1;
      continue;
    }
    if(ai.troops.gte(1)){
      let gain = aiTp();
      if(gain.lt(1)) gain = new ON(1);
      ai.coins = ai.coins.add(gain);
    }
  }
}

// Other strategies for comparison
function runTrainFirst(ai, clicks) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiTp() { return ai.troops.mul(ai.ppt); }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.03, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }
  function aiTrainCost() {
    const total = ai._trainClicks;
    if (total >= 111) return Math.floor(C.train_baseCost * Math.pow(1.02, 111) * Math.pow(1.03, total - 111));
    return Math.floor(C.train_baseCost * Math.pow(1.02, total));
  }

  for(let i = 0; i < clicks; i++){
    // Train first
    const tCost = aiTrainCost();
    if(ai.troops.gte(5) && ai.coins.gte(tCost)){
      ai.coins = ai.coins.sub(tCost); ai.ppt *= ai.trainMult; ai.counts["train"]=(ai.counts["train"]||0)+1; ai._trainClicks++; continue;
    }
    // Then army chain
    if(aiCnt("colony")>=3){ const c=aiArmyCost(C.kingdom_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["kingdom"]=(ai.counts["kingdom"]||0)+ai.kingdomPower; ai._armyClicks++; ai.colonyPower+=ai.kingdomPower; continue; }}
    if(aiCnt("barracks")>=3){ const c=aiArmyCost(C.colony_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["colony"]=(ai.counts["colony"]||0)+ai.colonyPower; ai._armyClicks++; ai.barracksPower+=ai.colonyPower; continue; }}
    if(aiCnt("squad_leader")>=3){ const c=aiArmyCost(C.barracks_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["barracks"]=(ai.counts["barracks"]||0)+ai.barracksPower; ai._armyClicks++; ai.squadLeaderPower+=ai.barracksPower; continue; }}
    if(ai.troops.gte(2)){ const c=aiArmyCost(C.squadLeader_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["squad_leader"]=(ai.counts["squad_leader"]||0)+ai.squadLeaderPower; ai._armyClicks++; ai.rp=1+aiCnt("squad_leader"); continue; }}
    // Recruit
    const rCost = aiRecruitCost();
    if(ai.coins.gte(rCost)){ ai.coins=ai.coins.sub(rCost); ai.troops=ai.troops.add(ai.rp); ai.counts["recruit"]=(ai.counts["recruit"]||0)+1; continue; }
    // Loot
    if(ai.troops.gte(1)){ let g=aiTp(); if(g.lt(1))g=new ON(1); ai.coins=ai.coins.add(g); }
  }
}

function runArmyFirst(ai, clicks) {
  function aiCnt(id) { return ai.counts[id] || 0; }
  function aiTp() { return ai.troops.mul(ai.ppt); }
  function aiArmyCost(base) { return Math.floor(base * Math.pow(1.03, ai._armyClicks)); }
  function aiRecruitCost() { return Math.floor(C.recruitCost * Math.pow(1.02, aiCnt("recruit"))); }

  for(let i = 0; i < clicks; i++){
    // Army first (no training)
    if(aiCnt("colony")>=3){ const c=aiArmyCost(C.kingdom_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["kingdom"]=(ai.counts["kingdom"]||0)+ai.kingdomPower; ai._armyClicks++; ai.colonyPower+=ai.kingdomPower; continue; }}
    if(aiCnt("barracks")>=3){ const c=aiArmyCost(C.colony_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["colony"]=(ai.counts["colony"]||0)+ai.colonyPower; ai._armyClicks++; ai.barracksPower+=ai.colonyPower; continue; }}
    if(aiCnt("squad_leader")>=3){ const c=aiArmyCost(C.barracks_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["barracks"]=(ai.counts["barracks"]||0)+ai.barracksPower; ai._armyClicks++; ai.squadLeaderPower+=ai.barracksPower; continue; }}
    if(ai.troops.gte(2)){ const c=aiArmyCost(C.squadLeader_baseCost); if(ai.coins.gte(c)){ ai.coins=ai.coins.sub(c); ai.counts["squad_leader"]=(ai.counts["squad_leader"]||0)+ai.squadLeaderPower; ai._armyClicks++; ai.rp=1+aiCnt("squad_leader"); continue; }}
    const rCost = aiRecruitCost();
    if(ai.coins.gte(rCost)){ ai.coins=ai.coins.sub(rCost); ai.troops=ai.troops.add(ai.rp); ai.counts["recruit"]=(ai.counts["recruit"]||0)+1; continue; }
    if(ai.troops.gte(1)){ let g=aiTp(); if(g.lt(1))g=new ON(1); ai.coins=ai.coins.add(g); }
  }
}

function simulate(runner, cps, days) {
  const ai = createAI();
  for(let d = 0; d < days; d++) runner(ai, cps);
  const cnt = id => ai.counts[id] || 0;
  return {
    power: ai.troops.mul(ai.ppt).toNumber(),
    troops: ai.troops.toNumber(),
    ppt: ai.ppt,
    k: cnt("kingdom"), c: cnt("colony"), b: cnt("barracks"), sl: cnt("squad_leader"),
    t: cnt("train"), armyClicks: ai._armyClicks
  };
}

function report(name, r) {
  console.log(
    name.padEnd(20) +
    ' Power:' + r.power.toExponential(2).padStart(12) +
    ' | K:' + String(r.k).padStart(3) +
    ' C:' + String(r.c).padStart(3) +
    ' B:' + String(r.b).padStart(4) +
    ' SL:' + String(r.sl).padStart(5) +
    ' | T:' + String(r.t).padStart(4) +
    ' Army:' + String(r.armyClicks).padStart(4)
  );
}

const strats = [
  ['Smart (unlock→eff)', runSmartAI],
  ['Train First', runTrainFirst],
  ['Army First (no train)', runArmyFirst],
];

for (const [days, cps] of [[100, 10], [200, 10], [200, 20], [300, 20], [500, 20]]) {
  console.log(`\n=== ${days} DAYS @ ${cps} CPS ===`);
  for (const [name, runner] of strats) {
    report(name, simulate(runner, cps, days));
  }
}

// Head to head
console.log("\n=== HEAD TO HEAD (200 days @ 20 cps) ===");
const smart = simulate(runSmartAI, 20, 200);
const train = simulate(runTrainFirst, 20, 200);
const army = simulate(runArmyFirst, 20, 200);
console.log("Smart vs Train First: " + (smart.power > train.power ? "SMART WINS" : "TRAIN WINS") +
  " (" + smart.power.toExponential(2) + " vs " + train.power.toExponential(2) + ")");
console.log("Smart vs Army First:  " + (smart.power > army.power ? "SMART WINS" : "ARMY WINS") +
  " (" + smart.power.toExponential(2) + " vs " + army.power.toExponential(2) + ")");
