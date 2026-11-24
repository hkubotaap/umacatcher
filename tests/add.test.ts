import { Sim } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
for (const id of ['plush', 'rice', 'tower', 'seafood']) {
  const G = GENRES.find((g) => g.id === id)!;
  const sim = await Sim.create(expandPlan(G));
  sim.yLow = G.yLow;
  if (G.claw) sim.setClawMode(G.claw);
  sim.towerLayout = G.layout === 'tower';
  if (G.terrain) sim.setTerrain(G.terrain);
  if (G.water !== undefined) sim.setWater(G.water);
  sim.refill(expandPlan(G), G.pile);
  const before = sim.prizes.length;
  const ids = new Set(sim.prizes.map((p) => p.id));
  const pos = sim.prizes.map((p) => p.parts[0].body.translation().y);
  const t0 = performance.now();
  const n = sim.addPrizes(expandPlan(G).slice(0, 6));
  const kept = [...ids].filter((i) => sim.prizes.some((p) => p.id === i)).length;
  console.log(id, 'before', before, 'added', n, 'after', sim.prizes.length, 'originals kept', kept, 'ms', (performance.now() - t0) | 0, 'maxY', Math.max(...sim.prizes.map((p) => p.parts[0].body.translation().y)).toFixed(2), pos.length);
}
