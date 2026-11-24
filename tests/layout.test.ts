import { Sim } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
for (const g of GENRES) {
  const sim = await Sim.create(expandPlan(g));
  const out = sim.prizes.map((p) => { const t = p.parts[0].body.translation(); return `${p.type}(${t.x.toFixed(2)},${t.y.toFixed(2)},${t.z.toFixed(2)})`; });
  console.log(g.id, sim.prizes.length, out.join(' '));
}
