// Final test of best Hard mode strategies
class ON { constructor(v){this.value=v instanceof ON?v.value:typeof v==='bigint'?v:BigInt(Math.max(0,Math.floor(v||0)))} add(o){return new ON(this.value+(o instanceof ON?o:new ON(o)).value)} sub(o){const ov=(o instanceof ON?o:new ON(o)).value;return new ON(this.value>ov?this.value-ov:0n)} mul(n){return new ON(n instanceof ON?this.value*n.value:this.value*BigInt(Math.floor(n)))} mulFraction(n,d){return new ON(this.value*BigInt(n)/BigInt(d))} gte(o){return this.value>=(o instanceof ON?o:new ON(o)).value} lt(o){return !this.gte(o)} toNumber(){return Number(this.value)} }

const C={recruitCost:10,squadLeader_baseCost:200,barracks_baseCost:800,colony_baseCost:15000,kingdom_baseCost:200000,train_baseCost:80,train_multiplier:1.01};

function sim(cps,strat,maxDays=400){
  let G={coins:new ON(0),troops:new ON(1),ppt:1,rp:1,slPow:1,bPow:1,cPow:1,kPow:1,trainMult:C.train_multiplier,counts:{},_army:0,_train:0,enemy:new ON(0),ePow:new ON(0),vanq:false,winS:0,lossS:0,day:0};
  const cnt=id=>G.counts[id]||0;
  const tp=()=>G.troops.mul(G.ppt);
  const aCost=b=>Math.floor(b*Math.pow(1.03,G._army));
  const rCost=()=>Math.floor(C.recruitCost*Math.pow(1.02,cnt("r")));
  const tCost=()=>{const t=G._train;return t>=111?Math.floor(C.train_baseCost*Math.pow(1.02,111)*Math.pow(1.03,t-111)):Math.floor(C.train_baseCost*Math.pow(1.02,t))};
  const act={
    loot:()=>{if(G.troops.lt(1))return false;G.coins=G.coins.add(tp().lt(1)?new ON(1):tp());return true},
    recruit:()=>{const c=rCost();if(G.coins.lt(c))return false;G.coins=G.coins.sub(c);G.troops=G.troops.add(G.rp);G.counts.r=(G.counts.r||0)+1;return true},
    train:()=>{const c=tCost();if(G.coins.lt(c)||G.troops.lt(5))return false;G.coins=G.coins.sub(c);G.ppt*=G.trainMult;G.counts.t=(G.counts.t||0)+1;G._train++;return true},
    sl:()=>{const c=aCost(C.squadLeader_baseCost);if(G.coins.lt(c)||G.troops.lt(2))return false;G.coins=G.coins.sub(c);G.counts.sl=(G.counts.sl||0)+G.slPow;G._army++;G.rp=1+cnt("sl");return true},
    bar:()=>{const c=aCost(C.barracks_baseCost);if(G.coins.lt(c)||cnt("sl")<3)return false;G.coins=G.coins.sub(c);G.counts.bar=(G.counts.bar||0)+G.bPow;G._army++;G.slPow+=G.bPow;return true},
    col:()=>{const c=aCost(C.colony_baseCost);if(G.coins.lt(c)||cnt("bar")<3)return false;G.coins=G.coins.sub(c);G.counts.col=(G.counts.col||0)+G.cPow;G._army++;G.bPow+=G.cPow;return true},
    king:()=>{const c=aCost(C.kingdom_baseCost);if(G.coins.lt(c)||cnt("col")<3)return false;G.coins=G.coins.sub(c);G.counts.king=(G.counts.king||0)+G.kPow;G._army++;G.cPow+=G.kPow;return true},
  };
  const battle=()=>{
    if(tp().gte(G.ePow)){G.winS++;G.lossS=0;const p=Math.min(G.winS*10,100);G.enemy=G.enemy.mulFraction(100-p,100);G.ePow=G.ePow.mulFraction(100-p,100);if(G.enemy.lt(1)){G.enemy=new ON(0);G.ePow=new ON(0);G.vanq=true}return"w"}
    else{G.lossS++;G.winS=0;const p=Math.min(G.lossS*10,100);G.troops=G.troops.mulFraction(100-p,100);G.coins=G.coins.mulFraction(100-p,100);G.ppt=Math.max(1,G.ppt*(100-p)/100);["sl","bar","col","king"].forEach(id=>{if(G.counts[id]>0)G.counts[id]=Math.max(0,G.counts[id]-Math.ceil(G.counts[id]*p/100))});G.rp=1+cnt("sl");return"l"}
  };
  let win=false,lose=false;
  while(G.day<maxDays&&!win&&!lose){
    for(let i=0;i<cps;i++)strat(act,G,cnt);
    G.day++;
    if(!G.vanq){G.enemy=G.enemy.add(G.day*G.day);G.ePow=G.enemy.mul(500);if(Math.random()<0.03){const r=battle();if(G.troops.lt(1))lose=true;if(G.vanq)win=true}}
  }
  return{win,lose};
}

function test(name,fn,cps,runs=100){
  let w=0,l=0;
  for(let i=0;i<runs;i++){const r=sim(cps,fn);if(r.win)w++;else if(r.lose)l++}
  console.log(name.padEnd(25)+"| Win:"+String(Math.round(w/runs*100)).padStart(4)+"% | Lose:"+String(Math.round(l/runs*100)).padStart(4)+"%");
  return Math.round(w/runs*100);
}

// Strategies
const superTrain=(a,G,cnt)=>{if(a.train())return;if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot()};
const ratio1=(a,G,cnt)=>{if((cnt("t")||0)<(cnt("r")||1)*1&&a.train())return;if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot()};
const ratio3=(a,G,cnt)=>{if((cnt("t")||0)<(cnt("r")||1)*3&&a.train())return;if(a.king())return;if(a.col())return;if(a.bar())return;if(a.sl())return;if(a.recruit())return;a.loot()};

console.log("HARD MODE - FINAL RESULTS (100 runs each)\n");
console.log("=== 30 clicks/sec (fast clicking) ===");
test("Super Train",superTrain,30);
test("Train Ratio 1:1",ratio1,30);
test("Train Ratio 3:1",ratio3,30);

console.log("\n=== 40 clicks/sec (very fast) ===");
test("Super Train",superTrain,40);
test("Train Ratio 1:1",ratio1,40);
test("Train Ratio 3:1",ratio3,40);

console.log("\n=== 50 clicks/sec (extreme) ===");
test("Super Train",superTrain,50);
test("Train Ratio 1:1",ratio1,50);
test("Train Ratio 3:1",ratio3,50);

console.log("\n=== 10 clicks/sec (regular clicking) ===");
test("Super Train",superTrain,10);
test("Train Ratio 1:1",ratio1,10);
test("Train Ratio 3:1",ratio3,10);
