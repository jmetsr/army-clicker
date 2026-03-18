// Test longer games to see if kingdoms become worth it
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

function sim(strat, cps, days) {
  let G={coins:new ON(0),troops:new ON(1),ppt:1,rp:1,slPow:1,bPow:1,cPow:1,kPow:1,counts:{},_army:0,_train:0};
  const cnt=id=>G.counts[id]||0;
  const tp=()=>G.troops.mul(G.ppt);
  const aCost=b=>Math.floor(b*Math.pow(1.03,G._army));
  const rCost=()=>Math.floor(C.recruitCost*Math.pow(1.02,cnt('r')));
  const tCost=()=>{const t=G._train;return t>=111?Math.floor(C.train_baseCost*Math.pow(1.02,111)*Math.pow(1.03,t-111)):Math.floor(C.train_baseCost*Math.pow(1.02,t))};
  const act={
    loot:()=>{if(G.troops.lt(1))return false;G.coins=G.coins.add(tp().lt(1)?new ON(1):tp());return true},
    recruit:()=>{const c=rCost();if(G.coins.lt(c))return false;G.coins=G.coins.sub(c);G.troops=G.troops.add(G.rp);G.counts.r=(G.counts.r||0)+1;return true},
    train:()=>{const c=tCost();if(G.coins.lt(c)||G.troops.lt(5))return false;G.coins=G.coins.sub(c);G.ppt*=C.train_multiplier;G.counts.t=(G.counts.t||0)+1;G._train++;return true},
    sl:()=>{const c=aCost(C.squadLeader_baseCost);if(G.coins.lt(c)||G.troops.lt(2))return false;G.coins=G.coins.sub(c);G.counts.sl=(G.counts.sl||0)+G.slPow;G._army++;G.rp=1+cnt('sl');return true},
    bar:()=>{const c=aCost(C.barracks_baseCost);if(G.coins.lt(c)||cnt('sl')<3)return false;G.coins=G.coins.sub(c);G.counts.bar=(G.counts.bar||0)+G.bPow;G._army++;G.slPow+=G.bPow;return true},
    col:()=>{const c=aCost(C.colony_baseCost);if(G.coins.lt(c)||cnt('bar')<3)return false;G.coins=G.coins.sub(c);G.counts.col=(G.counts.col||0)+G.cPow;G._army++;G.bPow+=G.cPow;return true},
    king:()=>{const c=aCost(C.kingdom_baseCost);if(G.coins.lt(c)||cnt('col')<3)return false;G.coins=G.coins.sub(c);G.counts.king=(G.counts.king||0)+G.kPow;G._army++;G.cPow+=G.kPow;return true},
  };
  for(let d=0;d<days;d++) for(let i=0;i<cps;i++) strat(act,G,cnt);
  return {power:tp().toNumber(),troops:G.troops.toNumber(),ppt:G.ppt,k:cnt('king'),c:cnt('col'),b:cnt('bar'),sl:cnt('sl'),t:cnt('t')};
}

// Strategies
const trainFirst=(a,G,cnt)=>{if(a.train())return;if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot()};
const armyFirst=(a,G,cnt)=>{if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.train())return;if(a.recruit())return;a.loot()};

// Push for X kingdoms first, then train
const makeKingdomsFirst = (targetKings) => (a,G,cnt)=>{
  if(cnt('king')<targetKings){
    if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot();return;
  }
  if(a.train())return;if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot();
};

function report(name, r) {
  console.log(name.padEnd(22) + ' Power:' + r.power.toExponential(2).padStart(12) +
    ' | K:' + String(r.k).padStart(3) +
    ' C:' + String(r.c).padStart(3) +
    ' B:' + String(r.b).padStart(5) +
    ' SL:' + String(r.sl).padStart(7) +
    ' T:' + r.t);
}

const strats = [
  ['Train First', trainFirst],
  ['Army First', armyFirst],
  ['1 Kingdom First', makeKingdomsFirst(1)],
  ['3 Kingdoms First', makeKingdomsFirst(3)],
  ['5 Kingdoms First', makeKingdomsFirst(5)],
  ['10 Kingdoms First', makeKingdomsFirst(10)],
];

for (const [days, cps] of [[200, 10], [200, 20], [500, 20], [1000, 20]]) {
  console.log(`\n=== ${days} DAYS @ ${cps} CPS ===`);
  for (const [n, s] of strats) {
    report(n, sim(s, cps, days));
  }
}
