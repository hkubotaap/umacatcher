import { Sim, terrainHeightAt, type Input, type TerrainKind } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const g = GENRES.find((x) => x.id === 'seafood')!;
const sim = await Sim.create(expandPlan(g), false);
sim.setTerrain('steps'); sim.setWater(0.3); sim.refill(expandPlan(g), false);
const pos = () => sim.prizes.map((p) => { const t = p.parts[0].body.translation(); return [t.x, t.y, t.z]; });
const p0 = pos();
let events: Record<string, number> = {};
for (let i = 0; i < 60 * 12; i++) { sim.advance(1 / 60, none); for (const e of sim.events) events[e.type] = (events[e.type] ?? 0) + 1; sim.events.length = 0; }
const p1 = pos();
let moved = 0, inHole = 0, wins = sim.won;
p0.forEach((a, i) => { if (p1[i] && Math.hypot(a[0] - p1[i][0], a[2] - p1[i][2]) > 0.03) moved++; if (p1[i] && p1[i][0] > 0.25 && p1[i][2] > 0.25) inHole++; });
console.log('creatures', sim.prizes.length, 'moved>3cm in 12s:', moved, 'near-hole:', inHole, 'spontaneous wins:', wins, 'events', JSON.stringify(events));
console.log('heights y: min', Math.min(...p1.map((a) => a[1])).toFixed(3), 'max', Math.max(...p1.map((a) => a[1])).toFixed(3));

// 地形コライダーと terrainHeightAt の一致を、球を落として確認
for (const kind of ['steps', 'slope', 'rocks'] as TerrainKind[]) {
  const s2 = await Sim.create([], false);
  s2.setTerrain(kind);
  const bad: string[] = [];
  for (const [x, z] of [[-0.3, -0.4], [0.2, -0.3], [-0.1, 0.0], [0.1, 0.1], [-0.4, 0.2], [0.0, 0.3]]) {
    // 球は dynamic ボディを直接作れないので、景品 'ball' を 1 個生成して測る
    const s3 = await Sim.create([], false);
    s3.setTerrain(kind);
    (s3 as any).spawn('ball', 0, x, 0.4, z);
    for (let i = 0; i < 240; i++) (s3 as any).simStep();
    const y = (s3 as any).prizes[0].parts[0].body.translation().y;
    const expect = terrainHeightAt(kind, x, z) + 0.05;
    if (Math.abs(y - expect) > 0.02 && kind !== 'rocks') bad.push(`(${x},${z}) y=${y.toFixed(3)} expect≈${expect.toFixed(3)}`);
  }
  console.log(kind, bad.length ? 'MISMATCH ' + bad.join(' ') : 'collider matches terrainHeightAt');
}
