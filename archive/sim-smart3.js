// Test different unlock boost values
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

// Configurable smart AI with unlock boost parameter
function makeSmartAI(unlockBoost) {
  return function(ai, clicks) {
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
      const options = [];

      const tCost = aiTrainCost();
      if(ai.troops.gte(5) && ai.coins.gte(tCost)){
        options.push({type:"train", efficiency: 0.01 / tCost, cost: tCost});
      }

      if(aiCnt("colony") >= 3){
        const kCost = aiArmyCost(C.kingdom_baseCost);
        const kMult = ai.kingdomPower / ai.colonyPower;
        const kBoost = aiCnt("kingdom") < 3 ? unlockBoost : 1;
        if(ai.coins.gte(kCost)) options.push({type:"kingdom", efficiency: (kMult * kBoost) / kCost, cost: kCost});
      }

      if(aiCnt("barracks") >= 3){
        const cCost = aiArmyCost(C.colony_baseCost);
        const cMult = ai.colonyPower / ai.barracksPower;
        const cBoost = aiCnt("colony") < 3 ? unlockBoost : 1;
        if(ai.coins.gte(cCost)) options.push({type:"colony", efficiency: (cMult * cBoost) / cCost, cost: cCost});
      }

      if(aiCnt("squad_leader") >= 3){
        const bCost = aiArmyCost(C.barracks_baseCost);
        const bMult = ai.barracksPower / ai.squadLeaderPower;
        const bBoost = aiCnt("barracks") < 3 ? unlockBoost : 1;
        if(ai.coins.gte(bCost)) options.push({type:"barracks", efficiency: (bMult * bBoost) / bCost, cost: bCost});
      }

      if(ai.troops.gte(2)){
        const slCost = aiArmyCost(C.squadLeader_baseCost);
        const slMult = ai.squadLeaderPower / ai.rp;
        const slBoost = aiCnt("squad_leader") < 3 ? unlockBoost : 1;
        if(ai.coins.gte(slCost)) options.push({type:"squad_leader", efficiency: (slMult * slBoost) / slCost, cost: slCost});
      }

      options.sort((a,b) => b.efficiency - a.efficiency);

      let acted = false;
      for(const opt of options){
        if(opt.type === "train"){
          ai.coins = ai.coins.sub(opt.cost); ai.ppt *= ai.trainMult; ai.counts["train"] = (ai.counts["train"]||0) + 1; ai._trainClicks++; acted = true; break;
        } else if(opt.type === "kingdom"){ if(buyArmy("kingdom", C.kingdom_baseCost, "kingdomPower", "colonyPower")){ acted = true; break; }
        } else if(opt.type === "colony"){ if(buyArmy("colony", C.colony_baseCost, "colonyPower", "barracksPower")){ acted = true; break; }
        } else if(opt.type === "barracks"){ if(buyArmy("barracks", C.barracks_baseCost, "barracksPower", "squadLeaderPower")){ acted = true; break; }
        } else if(opt.type === "squad_leader"){ if(buyArmy("squad_leader", C.squadLeader_baseCost, "squadLeaderPower", null)){ acted = true; break; }
        }
      }
      if(acted) continue;

      const rCost = aiRecruitCost();
      if(ai.coins.gte(rCost)){ ai.coins = ai.coins.sub(rCost); ai.troops = ai.troops.add(ai.rp); ai.counts["recruit"] = (ai.counts["recruit"] || 0) + 1; continue; }
      if(ai.troops.gte(1)){ let gain = aiTp(); if(gain.lt(1)) gain = new ON(1); ai.coins = ai.coins.add(gain); }
    }
  };
}

function simulate(runner, cps, days) {
  const ai = createAI();
  for(let d = 0; d < days; d++) runner(ai, cps);
  const cnt = id => ai.counts[id] || 0;
  return {
    power: ai.troops.mul(ai.ppt).toNumber(),
    k: cnt("kingdom"), c: cnt("colony"), b: cnt("barracks"), sl: cnt("squad_leader"),
    t: cnt("train")
  };
}

console.log("TESTING DIFFERENT UNLOCK BOOST VALUES\n");
console.log("Higher boost = more priority on unlocking the chain\n");

const boosts = [1, 10, 100, 1000, 10000, 100000];
const cps = 20;
const days = 300;

console.log(`${days} days @ ${cps} cps\n`);
console.log("Boost".padStart(8) + " | Power".padStart(14) + " | K  C  B   SL | Trains");
console.log("-".repeat(55));

for (const boost of boosts) {
  const r = simulate(makeSmartAI(boost), cps, days);
  console.log(
    String(boost).padStart(8) +
    " | " + r.power.toExponential(2).padStart(12) +
    " | " + String(r.k).padStart(2) +
    " " + String(r.c).padStart(2) +
    " " + String(r.b).padStart(3) +
    " " + String(r.sl).padStart(4) +
    " | " + r.t
  );
}

console.log("\n\nDoes high boost ever reach kingdoms?");
for (const days of [100, 200, 300, 500, 1000]) {
  const r = simulate(makeSmartAI(100000), 20, days);
  console.log(`${days} days: K=${r.k} C=${r.c} B=${r.b} SL=${r.sl} Power=${r.power.toExponential(2)}`);
}
