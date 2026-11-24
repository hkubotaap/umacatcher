import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };

// スタッカー台: hub の x が中心付近(|x| < tol)のときに落とす
const G = GENRES.find((g) => g.id === 'stacker')!;
for (const tol of [0.01, 0.04, 0.12]) {
  let wins = 0, maxLevel = 0;
  const trials = 6;
  for (let n = 0; n < trials; n++) {
    const sim = await Sim.create(expandPlan(G));
    sim.setClawMode('stacker');
    sim.refill(expandPlan(G));
    sim.insertCoin();
    let best = 1;
    for (let i = 0; i < 120 * 200 && sim.state !== 'idle'; i++) {
      sim.advance(1 / 120, { ...none, drop: sim.state === 'ready' && Math.abs(sim.hubPos.x) < tol && Math.abs(sim.hubPos.z) < 0.01 });
      best = Math.max(best, sim.stackLevel);
      sim.events.length = 0;
    }
    wins += sim.won;
    maxLevel = Math.max(maxLevel, best);
  }
  console.log(`stacker tol=${tol}: wins ${wins}/${trials}, max level ${maxLevel}`);
}

// 箱タワー台: 配置の確認と 1 プレイ
const T = GENRES.find((g) => g.id === 'tower')!;
const sim = await Sim.create(expandPlan(T));
sim.towerLayout = true;
sim.yLow = T.yLow;
sim.gripRange = T.gripRange;
sim.refill(expandPlan(T));
const ys = sim.prizes.map((p) => p.parts[0].body.translation().y).sort((a, b) => b - a);
console.log('tower prizes', sim.prizes.length, 'top y', ys[0].toFixed(3), 'min y', ys[ys.length - 1].toFixed(3));
let won = 0;
for (let n = 0; n < 6; n++) {
  sim.insertCoin();
  const tgt = sim.prizes[n % sim.prizes.length].parts[0].body.translation();
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    const dx = tgt.x - sim.hubPos.x, dz = tgt.z - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) sim.advance(1 / 120, none);
  won = sim.won;
}
console.log('tower won after 6 plays:', won);
