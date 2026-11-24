import { Sim, type Input } from '../src/sim.ts';
import { GENRES, expandPlan } from '../src/genres.ts';
const GID = process.argv[2] ?? 'plush';
const G = GENRES.find((g) => g.id === GID)!;
const none: Input = { left: false, right: false, back: false, front: false, drop: false };
const trials = Number(process.env.TRIALS ?? 20);
let wins = 0, slips = 0, played = 0;
for (let n = 0; n < trials; n++) {
  const sim = await Sim.create(expandPlan(G));
  if (process.env.NOASSIST) (sim as any).settleAssist = () => {};
  sim.gripRange = G.gripRange;
  sim.yLow = G.yLow;
  if (G.claw) sim.setClawMode(G.claw);
  if (process.env.ITERS) sim.world.numSolverIterations = Number(process.env.ITERS);
  if (G.terrain) sim.setTerrain(G.terrain);
  if (G.water !== undefined) sim.setWater(G.water);
  sim.setStickyBars(!!G.bars);
  sim.towerLayout = G.layout === 'tower';
  sim.refill(expandPlan(G), G.pile); // ゲームと同じ流れ: 台を切り替えてから、その台の配置で景品を入れ直す
  sim.insertCoin();
  // 景品の1つの真上へ移動して落とす
  const pp = sim.prizes[n % sim.prizes.length].parts; const tgt = pp[pp.length >> 1].body.translation();
  const t0 = performance.now();
  for (let i = 0; i < 120 * 40 && sim.state === 'ready'; i++) {
    if (!sim.prizes.some((q) => q.parts === pp)) break; // 狙った景品が既に落ちて消えていたら終了(消えた物体にアクセスすると wasm が落ちる)
    const tl = pp[pp.length >> 1].body.translation(); // 生き物は動くので、毎回現在位置を狙う
    const dx = tl.x - sim.hubPos.x, dz = tl.z - sim.hubPos.z;
    sim.advance(1 / 120, { ...none, right: dx > 0.01, left: dx < -0.01, front: dz > 0.01, back: dz < -0.01, drop: Math.hypot(dx, dz) < 0.02 });
  }
  const ang0 = sim.fingerAngles().map((a) => a.toFixed(2));
  for (let i = 0; i < 120 * 40 && sim.state !== 'idle'; i++) sim.advance(1 / 120, none);
  const w = sim.won;
  wins += w;
  if (w > 0) played++;
  console.log(`trial ${n}: won=${w} grip=${sim.gripLift.toFixed(2)} fingerAtDrop=${ang0} ms=${(performance.now() - t0) | 0}`);
}
console.log('wins', wins, '/', trials, '| trials with a win', played);
