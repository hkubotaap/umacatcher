import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const G = GENRES.find((g) => g.id === 'sticky')!;
const res: Record<string, { n: number; won: number }> = { bag: { n: 0, won: 0 }, sbox: { n: 0, won: 0 } };
for (let n = 0; n < 24; n++) {
  const sim = await Sim.create(expandPlan(G));
  sim.gripRange = G.gripRange; sim.yLow = G.yLow;
  sim.setStickyBars(true); sim.refill(expandPlan(G), false);
  const p = sim.prizes[n % sim.prizes.length];
  const kind = p.type as 'bag' | 'sbox';
  sim.insertCoin();
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    const t = p.parts[0].body.translation();
    const dx = t.x - sim.hubPos.x, dz = t.z - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) sim.advance(1 / 120, none);
  res[kind].n++; res[kind].won += sim.won;
}
console.log(JSON.stringify(res));
