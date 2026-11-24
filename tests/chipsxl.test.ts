import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const G = GENRES.find((g) => g.id === 'chips')!;
const res = { xl: { n: 0, won: 0 }, norm: { n: 0, won: 0 } };
for (let n = 0; n < 24; n++) {
  const sim = await Sim.create(expandPlan(G), G.pile);
  sim.gripRange = G.gripRange; sim.yLow = G.yLow;
  sim.refill(expandPlan(G), G.pile);
  const xls = sim.prizes.filter((p) => p.variant === 3), norms = sim.prizes.filter((p) => p.variant !== 3);
  if (n === 0) console.log('xl count', xls.length, 'mass xl', xls[0].parts.reduce((s, q) => s + q.body.mass(), 0).toFixed(3), 'mass norm', norms[0].parts.reduce((s, q) => s + q.body.mass(), 0).toFixed(3));
  const useXl = n % 2 === 0;
  const p = (useXl ? xls : norms)[0];
  const mid = p.parts[1].body;
  sim.insertCoin();
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    const t = mid.translation();
    const dx = t.x - sim.hubPos.x, dz = t.z - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) sim.advance(1 / 120, none);
  const r = useXl ? res.xl : res.norm;
  r.n++; r.won += sim.won > 0 ? 1 : 0;
}
console.log(JSON.stringify(res));
