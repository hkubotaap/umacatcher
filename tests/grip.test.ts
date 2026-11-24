import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const GID = process.argv[2] ?? 'plush';
const G = GENRES.find((g) => g.id === GID)!;
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const trials = 20;
let wins = 0, slips = 0;
for (let n = 0; n < trials; n++) {
  const sim = await Sim.create(expandPlan(G));
  sim.gripRange = G.gripRange;
  sim.yLow = G.yLow;
  if (G.claw) sim.setClawMode(G.claw);
  if (G.terrain) sim.setTerrain(G.terrain);
  if (G.water !== undefined) sim.setWater(G.water);
  if (G.terrain || G.water !== undefined) sim.refill(expandPlan(G), false);
  sim.insertCoin();
  // 景品の1つの真上へ移動して落とす
  const pp = sim.prizes[n % sim.prizes.length].parts; const tgt = pp[pp.length >> 1].body.translation();
  const t0 = performance.now();
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    const tl = pp[pp.length >> 1].body.translation(); // 生き物は動くので、毎回現在位置を狙う
    const dx = tl.x - sim.hubPos.x, dz = tl.z - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  const ang0 = sim.fingerAngles().map((a) => a.toFixed(2));
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) sim.advance(1 / 120, none);
  const w = sim.won;
  wins += w;
  console.log(`trial ${n}: won=${w} grip=${sim.gripLift.toFixed(2)} fingerAtDrop=${ang0} ms=${(performance.now() - t0) | 0}`);
}
console.log('wins', wins, '/', trials);
