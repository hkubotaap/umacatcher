import { Sim } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
// 起こした景品を放置したときの位置のばらつき(2 秒間の最大 - 最小, mm)。ビチビチの目安
const id = process.argv[2] ?? 'rice';
const G = GENRES.find((g) => g.id === id)!;
const sim = await Sim.create(expandPlan(G), G.pile);
sim.refill(expandPlan(G), G.pile);
for (const p of sim.prizes) for (const pt of p.parts) pt.body.wakeUp();
const step = () => { (sim as any).simStep(); (sim as any).postStep(1 / 120); };
for (let i = 0; i < 360; i++) step();
const tr: number[][][] = sim.prizes.map((p) => p.parts.map(() => []));
for (let i = 0; i < 240; i++) { step(); sim.prizes.forEach((p, a) => p.parts.forEach((pt, b) => { const t = pt.body.translation(); tr[a][b].push(t.x, t.y, t.z); })); }
const mm = (arr: number[], o: number) => { let lo = 1e9, hi = -1e9; for (let i = o; i < arr.length; i += 3) { lo = Math.min(lo, arr[i]); hi = Math.max(hi, arr[i]); } return hi - lo; };
const rows: number[] = [];
tr.forEach((pp) => pp.forEach((a) => rows.push(Math.max(mm(a, 0), mm(a, 1), mm(a, 2)) * 1000)));
rows.sort((a, b) => b - a);
console.log(id, 'p90', rows[Math.floor(rows.length * 0.1)].toFixed(2), 'median', rows[rows.length >> 1].toFixed(2), 'top3', rows.slice(0, 3).map((r) => r.toFixed(1)).join(' '));
