import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const g = GENRES.find((x) => x.id === 'gpu')!;
const rot = (q: any, v: any) => { const { x, y, z, w } = q; const ix = w * v.x + y * v.z - z * v.y, iy = w * v.y + z * v.x - x * v.z, iz = w * v.z + x * v.y - y * v.x, iw = -x * v.x - y * v.y - z * v.z; return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x }; };
const stats: Record<string, { n: number; win: number; broken: number; snaps: number; blades: number }> = { gpubox: { n: 0, win: 0, broken: 0, snaps: 0, blades: 0 }, gpucard: { n: 0, win: 0, broken: 0, snaps: 0, blades: 0 } };
for (let n = 0; n < 24; n++) {
  const sim = await Sim.create(expandPlan(g), false);
  sim.gripRange = g.gripRange; sim.yLow = g.yLow;
  sim.insertCoin();
  const prize = sim.prizes[n % sim.prizes.length];
  const st = stats[prize.type];
  st.n++;
  const b = prize.parts[0].body; const t = b.translation();
  // カードはファンの井戸(最初のファン位置)を狙う
  let tx = t.x, tz = t.z;
  if (prize.blades) { const o = rot(b.rotation(), { x: prize.fans === 3 ? 0 : -0.05, y: 0, z: 0 }); tx += o.x; tz += o.z; }
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    const dx = tx - sim.hubPos.x, dz = tz - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) {
    sim.advance(1 / 120, none);
    for (const e of sim.events) {
      if (e.type === 'win' && e.prize === prize) { st.win++; }
      if (e.type === 'snap') st.snaps += e.n;
    }
    sim.events.length = 0;
  }
  if (prize.blades) { st.broken += prize.blades.filter((x) => !x).length; st.blades += prize.blades.length; }
}
console.log(JSON.stringify(stats));
