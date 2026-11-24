import { Sim, HOME, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
// 成功プレイで 'miss' が出ないこと / 失敗プレイで 'miss' が出ることを確認
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
let bad = 0, wins = 0, misses = 0;
for (let n = 0; n < 12; n++) {
  const g = GENRES[0];
  const sim = await Sim.create(expandPlan(g));
  sim.gripRange = g.gripRange; sim.yLow = g.yLow;
  sim.insertCoin();
  const t = sim.prizes[n % sim.prizes.length].parts[0].body.translation();
  const ev: string[] = [];
  for (let i = 0; i < 120 * 90 && !(sim.state === 'idle' && i > 10); i++) {
    const dx = t.x - sim.hubPos.x, dz = t.z - sim.hubPos.z;
    sim.advance(1 / 120, sim.state === 'ready' ? { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 } : none);
    for (const e of sim.events) ev.push(e.type);
    sim.events.length = 0;
  }
  const won = ev.includes('win'), miss = ev.includes('miss');
  if (won) wins++;
  if (miss) misses++;
  if (won === miss) bad++;
}
console.log({ wins, misses, bad });
void HOME;
