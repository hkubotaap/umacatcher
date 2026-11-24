import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
for (const id of ['rice', 'chips', 'plush']) {
  const g = GENRES.find((x) => x.id === id)!;
  const base = expandPlan(g);
  const plan = id === 'plush' ? base : [...base, ...base];
  const t0 = performance.now();
  const sim = await Sim.create(plan, true);
  const tCreate = performance.now() - t0;
  const bodies = sim.prizes.reduce((a, p) => a + p.parts.length, 0);
  const asleep = sim.prizes.reduce((a, p) => a + p.parts.filter((x) => x.body.isSleeping()).length, 0);
  const t1 = performance.now();
  for (let i = 0; i < 60; i++) sim.advance(1 / 60, none);
  const idle = performance.now() - t1;
  // 1 プレイ分(降下→掴む→運ぶ)の最大スパイクと最大速度
  sim.insertCoin();
  let maxV = 0, maxFrame = 0, sum = 0, n = 0;
  for (let i = 0; i < 60 * 30 && sim.state !== 'idle'; i++) {
    const t = performance.now();
    sim.advance(1 / 60, { ...none, drop: i === 5 });
    const d = performance.now() - t; maxFrame = Math.max(maxFrame, d); sum += d; n++;
    for (const p of sim.prizes) for (const pt of p.parts) { const v = pt.body.linvel(); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
  }
  console.log(id, `bodies=${bodies} asleep=${asleep} create=${tCreate.toFixed(0)}ms idle1s=${idle.toFixed(0)}ms play: avgFrame=${(sum / n).toFixed(1)}ms maxFrame=${maxFrame.toFixed(1)}ms maxV=${maxV.toFixed(1)}m/s`);
}
