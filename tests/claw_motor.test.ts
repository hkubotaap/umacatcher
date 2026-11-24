import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const GID = process.argv[2] ?? 'plush';
const G = GENRES.find((g) => g.id === GID)!;
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const sim = await Sim.create(expandPlan(G));
sim.prizes.length = 0;
sim.insertCoin();
for (let s = 0; s < 6; s++) { sim.advance(0.05, none); for (let i=0;i<20;i++) sim.advance(0.05, none); console.log('t', s+1, 'open?', sim.fingerAngles().map(a=>a.toFixed(2)).join(' ')); }
sim.advance(0.05, { ...none, drop: true });
for (let s = 0; s < 14; s++) { for (let i=0;i<20;i++) sim.advance(0.05, none); console.log(sim.state, 'y', sim.hubPos.y.toFixed(2), sim.fingerAngles().map(a=>a.toFixed(2)).join(' ')); }
