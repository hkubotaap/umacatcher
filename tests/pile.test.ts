import { Sim } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
for (const g of GENRES) {
  const base = expandPlan(g);
  const target = Math.min(48, Math.round(base.length * (g.id === 'rice' ? 1.6 : 1.7)));
  const plan = [...base];
  while (plan.length < target) plan.push(base[Math.floor(Math.random() * base.length)]);
  const t0 = performance.now();
  const sim = await Sim.create(plan, true);
  const ys = sim.prizes.map((p) => p.parts[0].body.translation().y);
  const maxY = Math.max(...ys);
  const stacked = ys.filter((y) => y > 0.12).length;
  console.log(g.id, 'n=', sim.prizes.length, '/', target, 'maxY', maxY.toFixed(2), 'stacked(>12cm)', stacked, 'ms', (performance.now() - t0) | 0);
}
