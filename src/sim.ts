// 物理シミュレーション(Rapier) + アーム状態機械。three.js 非依存。
import RAPIER from '@dimforge/rapier3d-compat';
import { BLADES, GPU_MODELS, fanLayout, shroudSegments, wellHalf } from './gpu.ts';

export type PrizeType = 'plush' | 'box' | 'figure' | 'ball' | 'game' | 'pad' | 'sbox' | 'bag' | 'tin' | 'rice' | 'chips' | 'crab' | 'kingcrab' | 'scallop' | 'gpubox' | 'gpucard';

export interface PrizePart {
  body: RAPIER.RigidBody;
  role: 'torso' | 'head' | 'main';
}
/** 生き物のアニメーション状態(描画側が読む) */
export interface Anim {
  phase: number; // 脚の歩行位相
  walk: number; // 0..1 歩行中の度合い
  open: number; // ホタテの殻の開き(rad)
  claw: number; // ハサミを振る度合い
  dir: number; // 横歩きの向き ±1
  timer: number;
  mode: number; // 0 休む / 1 歩く / 2 向きを変える
  turn: number;
  held: boolean; // アームに掴まれて暴れている
  clapT: number;
  clapped: boolean;
  sT: number;
  sTimer: number;
}

export interface Prize {
  id: number;
  type: PrizeType;
  variant: number;
  parts: PrizePart[];
  cooldown: number;
  anim?: Anim;
  /** グラボ(裸): 各ファンの羽が無事か。false = 折れた */
  blades?: boolean[];
  fans?: number;
  /** ファンの回転角(rad)。動かすと慣性で回る */
  spin?: number;
}

/** 折れて飛んだファンの羽などの破片(短時間だけ存在) */
export interface Debris {
  id: number;
  body: RAPIER.RigidBody;
  born: number;
}

export type TerrainKind = 'flat' | 'steps' | 'slope' | 'rocks';
export interface Rock {
  x: number;
  z: number;
  r: number;
}
/** 地形の高さ(m)。落下口(x,z >= 0.25)は含めない */
export function terrainHeightAt(kind: TerrainKind, x: number, z: number): number {
  switch (kind) {
    case 'steps':
      return z < -0.15 ? 0.12 : z < 0.15 ? 0.06 : 0;
    case 'slope':
      return z < 0.3 ? (0.14 * (0.3 - z)) / 0.8 : 0;
    case 'rocks':
      return 0.022 * (1 + Math.sin(x * 11 + 1.3) * Math.sin(z * 9 + 0.4));
    default:
      return 0;
  }
}

function newAnim(): Anim {
  return { phase: Math.random() * 6, walk: 0, open: 0.3, claw: 0, dir: 1, timer: Math.random() * 2, mode: 0, turn: 0, held: false, clapT: 0, clapped: false, sT: 0, sTimer: 0 };
}

// 水中の浮力係数(水の密度 / 物体の密度。上限あり)と、おおよその半径(m)
const BUOY: Partial<Record<PrizeType, number>> = { plush: 3.5, box: 3.5, figure: 0.9, ball: 3.5, game: 3.3, pad: 1.5, sbox: 3.5, bag: 3.5, tin: 2.8, rice: 3.3, chips: 3.5, crab: 0.93, kingcrab: 0.97, scallop: 0.96 };
const RAD: Partial<Record<PrizeType, number>> = { plush: 0.06, box: 0.05, figure: 0.07, ball: 0.05, game: 0.04, pad: 0.03, sbox: 0.04, bag: 0.04, tin: 0.045, rice: 0.05, chips: 0.1, crab: 0.03, kingcrab: 0.05, scallop: 0.025 };

export interface Input {
  left: boolean;
  right: boolean;
  back: boolean;
  front: boolean;
  drop: boolean;
}

export type SimEvent =
  | { type: 'impact'; mat: PrizeType; strength: number; x: number }
  | { type: 'clawOpen' | 'clawClose' | 'dropStart' | 'bump' | 'lift' | 'release' | 'timeout' | 'end' | 'miss' }
  | { type: 'win'; prize: Prize }
  | { type: 'splash'; strength: number; x: number }
  | { type: 'clap' | 'scuttle'; x: number }
  | { type: 'snap'; x: number; n: number };

export type ArmState = 'idle' | 'ready' | 'descend' | 'close' | 'stick' | 'sweep' | 'lift' | 'carry' | 'release' | 'return';
export type ClawMode = 'claw' | 'hook' | 'bar';

// ---- 寸法 (m) ----
export const HALF = 0.5; // プレイエリア半幅
export const HOLE = { x0: 0.25, z0: 0.25 }; // 景品落下口 (x>x0 && z>z0)
export const HOME = { x: 0.375, z: 0.375 };
export const START = { x: -0.38, z: -0.38 };
export const Y_TOP = 0.92;
export const Y_LOW = 0.2;
export const BOUND = 0.38;
export const FINGER_LEN = 0.115;
export const FINGER_R = 0.04; // ヒンジ半径
export const OPEN = 0.74;
export const CLOSED = -0.42;

const G_ALL = 0x0001ffff; // membership 1, filter all
const G_CLAW = 0x0002fffd; // membership 2, filter all except 2

function qY(a: number) {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}
function qZ(a: number) {
  return { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) };
}
function qMul(a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function qRand() {
  // 一様な乱数クォータニオン(山積みの景品の向き用)
  const u1 = Math.random(), u2 = Math.random() * 2 * Math.PI, u3 = Math.random() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}
function qXm(a: number) {
  return { x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) };
}

export interface Finger {
  body: RAPIER.RigidBody;
  joint: RAPIER.RevoluteImpulseJoint;
  theta: number;
}

export class Sim {
  world: RAPIER.World;
  prizes: Prize[] = [];
  fingers: Finger[] = [];
  hub!: RAPIER.RigidBody;
  hubPos = { x: START.x, y: Y_TOP, z: START.z };
  state: ArmState = 'idle';
  events: SimEvent[] = [];
  timer = 0; // 操作残り時間
  stateT = 0;
  moveVel = 0; // 0..1 現在の移動速度割合(音用)
  won = 0;
  gripLift = 1.0;
  gripClose = 3.5;
  gripRange: [number, number] = [0.45, 1.55];
  yLow = Y_LOW;
  /** 上昇端でのショック(コツン)による hub のオフセット */
  bumpOff = { x: 0, y: 0, z: 0 };
  private bumpT = -1;
  private bumpAmp = 0;
  private acc = 0;
  /** true: 景品を雑然と積み上げた配置(向きもランダム) */
  private pile = false;
  private nextId = 1;
  private prevVel = new Map<number, { x: number; y: number; z: number }>();
  static readonly H = 1 / 120;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = Sim.H;
    this.world.numSolverIterations = 6; // 既定 4 → 積み重なった柔らかい袋の安定性を上げる
    this.buildStatic();
    this.buildClaw();
  }

  static async create(plan: Array<[PrizeType, number]>, pile = false): Promise<Sim> {
    await RAPIER.init();
    const s = new Sim();
    s.refill(plan, pile);
    return s;
  }

  private buildStatic() {
    const w = this.world;
    const add = (hx: number, hy: number, hz: number, x: number, y: number, z: number, fr = 0.7) => {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(fr).setRestitution(0.05).setCollisionGroups(G_ALL), b);
    };
    // 床(落下口を除く)
    add(0.375, 0.05, 0.5, -0.125, -0.05, 0);
    add(0.125, 0.05, 0.375, 0.375, -0.05, -0.125);
    // 壁
    add(0.05, 0.7, 0.55, -0.55, 0.65, 0, 0.2);
    add(0.05, 0.7, 0.55, 0.55, 0.65, 0, 0.2);
    add(0.6, 0.7, 0.05, 0, 0.65, -0.55, 0.2);
    add(0.6, 0.7, 0.05, 0, 0.65, 0.55, 0.2);
    // 落下口の小さな縁(景品ガード)
    add(0.125, 0.012, 0.006, 0.375, 0.012, 0.25 - 0.006, 0.3);
    add(0.006, 0.012, 0.125, 0.25 - 0.006, 0.012, 0.375, 0.3);
  }

  private buildClaw() {
    const w = this.world;
    const hub = w.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.hubPos.x, this.hubPos.y, this.hubPos.z),
    );
    w.createCollider(RAPIER.ColliderDesc.cylinder(0.025, 0.05).setCollisionGroups(G_CLAW), hub);
    this.hub = hub;
    this.buildFingers();
  }

  private buildFingers() {
    const w = this.world;
    const hub = this.hub;
    for (let i = 0; i < 3; i++) {
      const th = (i * 2 * Math.PI) / 3 + Math.PI / 6;
      const d = { x: Math.cos(th), z: Math.sin(th) };
      const t = { x: -Math.sin(th), y: 0, z: Math.cos(th) };
      const hx = this.hubPos.x + FINGER_R * d.x;
      const hz = this.hubPos.z + FINGER_R * d.z;
      const body = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(hx, this.hubPos.y, hz)
          .setLinearDamping(0.2)
          .setAngularDamping(0.5)
          .setCcdEnabled(true),
      );
      const rot = qY(-th);
      const mk = (hxx: number, hyy: number, hzz: number, ox: number, oy: number) =>
        w.createCollider(
          RAPIER.ColliderDesc.cuboid(hxx, hyy, hzz)
            .setTranslation(ox * d.x, oy, ox * d.z)
            .setRotation(rot)
            .setDensity(1500)
            .setFriction(1.4)
            .setRestitution(0)
            .setCollisionGroups(G_CLAW),
          body,
        );
      mk(0.007, FINGER_LEN / 2, 0.014, 0, -FINGER_LEN / 2); // 腕
      mk(0.034, 0.008, 0.014, -0.03, -FINGER_LEN); // 内側に曲がった爪先
      const jd = RAPIER.JointData.revolute({ x: FINGER_R * d.x, y: 0, z: FINGER_R * d.z }, { x: 0, y: 0, z: 0 }, t);
      const joint = w.createImpulseJoint(jd, hub, body, true) as RAPIER.RevoluteImpulseJoint;
      joint.setLimits(-0.75, 0.95);
      joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
      joint.configureMotorPosition(OPEN, 3, 0.08);
      this.fingers.push({ body, joint, theta: th });
    }
  }

  // ---- アーム形式: 3 本爪 / 1 本フック ----
  clawMode: ClawMode = 'claw';
  /** フックが横に開く向き(ハブのローカル +x)で、景品のリングに引っ掛けるための「引き」の距離 */
  hubTilt = 0;
  private tiltTarget = 0;
  private hookColliders: RAPIER.Collider[] = [];
  private sweepX0 = 0;

  setClawMode(mode: ClawMode) {
    if (mode === this.clawMode) return;
    this.releaseGlue();
    if (this.clawMode === 'claw') {
      for (const f of this.fingers) this.world.removeRigidBody(f.body); // 関節ごと削除される
      this.fingers = [];
    } else {
      for (const c of this.hookColliders) this.world.removeCollider(c, false);
      this.hookColliders = [];
    }
    if (mode === 'hook') this.addHook();
    else if (mode === 'bar') this.addBar();
    else this.buildFingers();
    this.clawMode = mode;
    this.hubTilt = 0;
    this.tiltTarget = 0;
  }

  // ---- 粘着バー: 横長の粘着バーを降ろして、触れた景品をくっつけて持ち上げる ----
  private glued: Array<{ p: Prize; joint: RAPIER.ImpulseJoint; thr: number; at: number }> = [];
  private glueDone = false;
  static readonly BAR = { hx: 0.14, hy: 0.008, hz: 0.03, cy: -0.032 };

  private addBar() {
    const B = Sim.BAR;
    const cd = RAPIER.ColliderDesc.cuboid(B.hx, B.hy, B.hz).setTranslation(0, B.cy, 0).setFriction(1.5).setRestitution(0).setCollisionGroups(G_CLAW);
    this.hookColliders.push(this.world.createCollider(cd, this.hub));
  }

  /** バーの底面すぐ下(depth m)にある景品 */
  private barTouching(depth: number): Prize[] {
    const B = Sim.BAR, hp = this.hubPos;
    const bottom = hp.y + B.cy - B.hy;
    const shape = new RAPIER.Cuboid(B.hx, depth / 2, B.hz);
    const hit = new Set<number>();
    this.world.intersectionsWithShape({ x: hp.x, y: bottom - depth / 2, z: hp.z }, { x: 0, y: 0, z: 0, w: 1 }, shape, (c) => {
      const par = c.parent();
      if (par) hit.add(par.handle);
      return true;
    }, undefined, G_CLAW);
    return this.prizes.filter((p) => hit.has(p.parts[0].body.handle));
  }

  private glueTouching() {
    const hp = this.hubPos;
    const list = this.barTouching(0.012).filter((p) => !p.anim);
    if (!list.length) return;
    const avg = this.prizes.reduce((s, p) => s + p.parts[0].body.mass(), 0) / Math.max(1, this.prizes.length);
    for (const p of list.slice(0, 5)) {
      const b = p.parts[0].body, t = b.translation(), q = b.rotation();
      const jd = RAPIER.JointData.fixed({ x: t.x - hp.x, y: t.y - hp.y, z: t.z - hp.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 0 }, { x: -q.x, y: -q.y, z: -q.z, w: q.w });
      b.wakeUp();
      const joint = this.world.createImpulseJoint(jd, this.hub, b, true);
      // 粘着力: 景品が重いほど・粘着力(gripLift)が弱いほど剥がれやすい
      this.glued.push({ p, joint, thr: this.gripLift * avg * (0.8 + Math.random() * 0.8), at: 0.15 + Math.random() * 0.7 });
    }
    this.events.push({ type: 'clawClose' });
  }

  private releaseGlue() {
    for (const g of this.glued) this.world.removeImpulseJoint(g.joint, true);
    this.glued = [];
    this.glueDone = false;
  }

  private updateGlue(shake: boolean) {
    for (let i = this.glued.length - 1; i >= 0; i--) {
      const g = this.glued[i];
      if (!this.prizes.includes(g.p)) { this.glued.splice(i, 1); continue; }
      const m = g.p.parts[0].body.mass();
      const weak = m > g.thr || (shake && m > g.thr * 0.6 && Math.random() < 0.35);
      if (weak && (shake || (this.state === 'lift' && this.stateT > g.at))) {
        this.world.removeImpulseJoint(g.joint, true);
        this.glued.splice(i, 1);
      }
    }
  }

  /** J 字フック(先端が上向き)。ハブの下に固定。シャフト → 半円 → 先端 */
  private addHook() {
    const mk = (hx: number, hy: number, cx: number, cy: number, rotZ = 0) => {
      const cd = RAPIER.ColliderDesc.cuboid(hx, hy, 0.007).setTranslation(cx, cy, 0).setRotation(qZ(rotZ)).setFriction(0.9).setRestitution(0).setCollisionGroups(G_CLAW);
      this.hookColliders.push(this.world.createCollider(cd, this.hub));
    };
    mk(0.007, 0.05, 0, -0.075); // シャフト(y -0.025 .. -0.125)
    const R = 0.035, N = 6;
    for (let i = 0; i < N; i++) {
      const a = Math.PI + ((i + 0.5) / N) * Math.PI; // 下半分の円弧
      mk(0.007, (R * Math.PI) / N / 2 + 0.002, 0.035 + R * Math.cos(a), -0.125 + R * Math.sin(a), a);
    }
    mk(0.007, 0.02, 0.07, -0.105); // 先端(上向き)
  }

  // ---- 景品 ----
  private makeBody(x: number, y: number, z: number, rot: { x: number; y: number; z: number; w: number }, lin: number, ang: number, noSleep = false) {
    return this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(rot).setLinearDamping(lin).setAngularDamping(ang).setCanSleep(!noSleep),
    );
  }

  // ---- 地形 ----
  terrain: TerrainKind = 'flat';
  rocks: Rock[] = [];
  private terrainBodies: RAPIER.RigidBody[] = [];

  /** 地形を作り直す(既存の景品は refill で入れ直すこと) */
  setTerrain(kind: TerrainKind) {
    for (const b of this.terrainBodies) this.world.removeRigidBody(b);
    this.terrainBodies = [];
    this.terrain = kind;
    this.rocks = [];
    const w = this.world;
    const fixed = (cd: RAPIER.ColliderDesc, x = 0, y = 0, z = 0) => {
      const b = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      w.createCollider(cd.setFriction(0.8).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      this.terrainBodies.push(b);
    };
    if (kind === 'steps') {
      // 奥ほど高い 2 段の段差(奥 12cm / 中 6cm / 手前 0)
      fixed(RAPIER.ColliderDesc.cuboid(0.5, 0.06, 0.175), 0, 0.06, -0.325);
      fixed(RAPIER.ColliderDesc.cuboid(0.5, 0.03, 0.15), 0, 0.03, 0);
    } else if (kind === 'slope' || kind === 'rocks') {
      const N = 40;
      const h = new Float32Array((N + 1) * (N + 1)); // 列優先: index = col(x) * (N+1) + row(z)
      for (let c = 0; c <= N; c++) {
        for (let r = 0; r <= N; r++) {
          const x = -0.5 + c / N, z = -0.5 + r / N;
          h[c * (N + 1) + r] = x >= 0.25 && z >= 0.25 ? -0.3 : terrainHeightAt(kind, x, z); // 落下口は深く
        }
      }
      fixed(RAPIER.ColliderDesc.heightfield(N, N, h, { x: 1, y: 1, z: 1 }));
      if (kind === 'rocks') {
        for (let i = 0; i < 6; i++) {
          let x = 0, z = 0;
          do {
            x = -0.38 + Math.random() * 0.76;
            z = -0.38 + Math.random() * 0.76;
          } while (x > 0.12 && z > 0.12);
          const r = 0.04 + Math.random() * 0.03;
          this.rocks.push({ x, z, r });
          fixed(RAPIER.ColliderDesc.ball(r), x, terrainHeightAt('rocks', x, z) + r * 0.45, z);
        }
      }
    }
  }

  // ---- 水 ----
  /** 水面の高さ(m)。null = 水なし */
  waterLevel: number | null = null;
  private wetState = new Map<number, boolean>();
  setWater(level: number | null) {
    this.waterLevel = level;
    this.wetState.clear();
  }

  private simStep() {
    if (this.waterLevel !== null) this.applyWater(Sim.H);
    this.world.step();
  }

  /** 浮力(水の密度 / 物体の密度)・水の抵抗・水しぶき */
  private applyWater(dt: number) {
    const L = this.waterLevel!;
    for (const p of this.prizes) {
      const bf = BUOY[p.type] ?? 1, r = RAD[p.type] ?? 0.05;
      for (let i = 0; i < p.parts.length; i++) {
        const b = p.parts[i].body;
        if (b.isSleeping()) continue;
        const t = b.translation();
        const f = Math.max(0, Math.min(1, (L - (t.y - r)) / (2 * r)));
        const wet = f > 0.5;
        if (wet !== (this.wetState.get(b.handle) ?? false)) {
          this.wetState.set(b.handle, wet);
          const vy = b.linvel().y;
          if (i === 0 && Math.abs(vy) > 0.3) this.events.push({ type: 'splash', strength: Math.min(1, Math.abs(vy) / 2.5), x: t.x });
        }
        if (f <= 0) continue;
        b.applyImpulse({ x: 0, y: b.mass() * 9.81 * bf * f * dt, z: 0 }, false);
        const v = b.linvel(), w = b.angvel();
        const kv = Math.exp(-4.5 * f * dt), kw = Math.exp(-3 * f * dt);
        b.setLinvel({ x: v.x * kv, y: v.y * kv, z: v.z * kv }, false);
        b.setAngvel({ x: w.x * kw, y: w.y * kw, z: w.z * kw }, false);
      }
    }
  }

  // ---- グラボ(裸): ファンの羽が折れる ----
  debris: Debris[] = [];
  private debrisId = 1;

  /** 無事な羽を n 枚折って、破片を飛ばす */
  private breakBlades(p: Prize, n: number, fan = -1) {
    if (!p.blades || n <= 0) return;
    const intact: number[] = [];
    p.blades.forEach((ok, i) => { if (ok && (fan < 0 || Math.floor(i / BLADES) === fan)) intact.push(i); });
    if (!intact.length) return;
    intact.sort(() => Math.random() - 0.5);
    const b = p.parts[0].body;
    const q = b.rotation(), t = b.translation(), v = b.linvel();
    const { xs, r } = fanLayout(p.fans ?? 2);
    let cnt = 0;
    for (const idx of intact.slice(0, n)) {
      p.blades[idx] = false;
      cnt++;
      const f = Math.floor(idx / BLADES), k = idx % BLADES;
      const ang = (k / BLADES) * Math.PI * 2;
      const lp = rotate(q, { x: xs[f] + Math.cos(ang) * r * 0.6, y: 0.026, z: Math.sin(ang) * r * 0.6 });
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(t.x + lp.x, t.y + lp.y, t.z + lp.z)
          .setRotation(q)
          .setLinvel(v.x + (Math.random() - 0.5) * 1.2, v.y + 0.8 + Math.random() * 0.8, v.z + (Math.random() - 0.5) * 1.2)
          .setAngvel({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }),
      );
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.012, 0.0025, 0.005).setDensity(900).setFriction(0.4).setRestitution(0.2).setCollisionGroups(G_ALL), body);
      this.debris.push({ id: this.debrisId++, body, born: this.simTime });
    }
    if (cnt) this.events.push({ type: 'snap', x: t.x, n: cnt });
  }

  private updateGpu(dt: number) {
    const hp = this.hubPos;
    for (const p of this.prizes) {
      if (!p.blades) continue;
      const b = p.parts[0].body;
      if (b.isSleeping()) continue;
      const v = b.linvel(), w = b.angvel();
      p.spin = (p.spin ?? 0) + (Math.hypot(v.x, v.z) * 40 + Math.hypot(w.x, w.y, w.z) * 3) * dt;
    }
    // 爪の先やフックの先が、ファンの井戸に刺さったら、そのファンの羽を折る(刺さると掴みやすいが、羽は壊れる)
    const probes: Array<{ x: number; y: number; z: number }> = [];
    for (const f of this.fingers) {
      const t = f.body.translation(), q = f.body.rotation();
      const dx = Math.cos(f.theta), dz = Math.sin(f.theta);
      for (const k of [0, -0.03, -0.055]) {
        const o = rotate(q, { x: k * dx, y: -FINGER_LEN, z: k * dz });
        probes.push({ x: t.x + o.x, y: t.y + o.y, z: t.z + o.z });
      }
    }
    if (this.clawMode === 'hook') {
      const c = Math.cos(this.hubTilt), sn = Math.sin(this.hubTilt);
      for (const [lx, ly] of [[0, -0.12], [0.07, -0.105], [0.07, -0.085]]) {
        probes.push({ x: hp.x + lx * c - ly * sn, y: hp.y + lx * sn + ly * c, z: hp.z });
      }
    }
    if (probes.length) {
      for (const p of this.prizes) {
        if (!p.blades) continue;
        const b = p.parts[0].body, t = b.translation(), q = b.rotation();
        const qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
        const { xs } = fanLayout(p.fans ?? 2), h = wellHalf(p.fans ?? 2);
        for (const pr of probes) {
          if (Math.abs(pr.x - t.x) > 0.16 || Math.abs(pr.z - t.z) > 0.16) continue;
          const lp = rotate(qi, { x: pr.x - t.x, y: pr.y - t.y, z: pr.z - t.z });
          if (lp.y < 0.012 || lp.y > 0.042 || Math.abs(lp.z) > 0.038) continue; // 井戸の深さ(縁より下)
          const f = xs.findIndex((fx) => Math.abs(lp.x - fx) < h);
          if (f >= 0 && Math.random() < 9 * dt) this.breakBlades(p, 1, f);
        }
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (this.simTime - d.born > 10 || d.body.translation().y < -0.2) {
        this.world.removeRigidBody(d.body);
        this.debris.splice(i, 1);
      }
    }
  }

  // ---- 生き物 ----
  private simTime = 0;
  private updateCreatures(dt: number) {
    this.simTime += dt;
    const hp = this.hubPos;
    const holding = this.state === 'close' || this.state === 'sweep' || this.state === 'lift' || this.state === 'carry';
    // アームが降りてきてから戻るまでの間は、生き物は動き回らない(逃げ回るとアームの下から外れてしまうので、固まる)
    const calm = this.state === 'idle' || this.state === 'ready' || this.state === 'return';
    for (const p of this.prizes) {
      const a = p.anim;
      if (!a) continue;
      const b = p.parts[0].body;
      const t = b.translation(), q = b.rotation(), v = b.linvel();
      const m = b.mass();
      const th = terrainHeightAt(this.terrain, t.x, t.z);
      const wet = this.waterLevel !== null && t.y < this.waterLevel;
      const grounded = t.y < th + 0.07 && Math.abs(v.y) < 0.5;
      const scallop = p.type === 'scallop';
      const I = m * 0.0006; // 慣性モーメントのおおよその値
      a.held = holding && Math.hypot(t.x - hp.x, t.z - hp.z) < 0.2 && hp.y - t.y < 0.35; // 掴まれている(ぶら下がりで吊られて低くなっても判定が切れないように余裕を持たせる)

      // 起き上がり: 体の上方向を世界の上へ戻すトルク(ひっくり返ってもジタバタして戻る)
      const up = rotate(q, { x: 0, y: 1, z: 0 });
      const ti = I * (scallop ? 25 : 70) * dt;
      if (!a.held) b.applyTorqueImpulse({ x: -up.z * ti, y: 0, z: up.x * ti }, true); // 掴まれている間は、アームに逆らって暴れさせない
      if (!a.held && up.y < -0.3) b.applyTorqueImpulse({ x: (Math.random() - 0.5) * I * 30 * dt * 60, y: 0, z: (Math.random() - 0.5) * I * 30 * dt * 60 }, true);
      if (!a.held) {
        const w = b.angvel();
        const dm = Math.exp(-3 * dt);
        b.setAngvel({ x: w.x * dm, y: w.y * Math.exp(-1.2 * dt), z: w.z * dm }, false);
      }

      // 行動の切り替え
      a.timer -= dt;
      if (a.timer <= 0 && !scallop) {
        const r = Math.random();
        if (r < 0.6) { a.mode = 1; a.dir = Math.random() < 0.5 ? -1 : 1; a.timer = 1.5 + Math.random() * 2.5; }
        else if (r < 0.85) { a.mode = 0; a.timer = 1 + Math.random() * 2; }
        else { a.mode = 2; a.timer = 0.5; a.turn = (Math.random() - 0.5) * 2; }
        a.claw = Math.random() < 0.4 ? 1 : 0;
      }
      const hs = Math.hypot(v.x, v.z);

      if (!scallop) {
        // カニ: 体の横(ローカル x)方向に歩く。タラバは遅くて重い
        const vmax = p.type === 'kingcrab' ? 0.07 : 0.12;
        const target = a.held ? 0 : a.mode === 1 ? vmax * (wet ? 0.7 : 1) : 0;
        if (!a.held && calm && (grounded || wet)) {
          const ex = rotate(q, { x: 1, y: 0, z: 0 });
          const hl = Math.hypot(ex.x, ex.z) || 1;
          const k = Math.min(1, 8 * dt);
          b.applyImpulse({ x: m * ((ex.x / hl) * a.dir * target - v.x) * k, y: 0, z: m * ((ex.z / hl) * a.dir * target - v.z) * k }, true);
        }
        if (a.mode === 2 && !a.held) b.applyTorqueImpulse({ x: 0, y: I * a.turn * 40 * dt, z: 0 }, true);
      } else {
        // ホタテ: 殻をパクパク閉じて水を噴き出し、ぴょんと跳ねる/泳ぐ
        if (a.clapT > 0) {
          a.clapT -= dt;
          a.open = Math.max(0, a.open - dt * 7);
          if (!a.clapped && a.open <= 0.05) {
            a.clapped = true;
            const fw = rotate(q, { x: 0, y: 0, z: 1 });
            const fl = Math.hypot(fw.x, fw.z) || 1;
            b.applyImpulse({ x: m * (fw.x / fl) * 0.5, y: m * (wet ? 0.8 : 0.6), z: m * (fw.z / fl) * 0.5 }, true);
            b.applyTorqueImpulse({ x: 0, y: I * (Math.random() - 0.5) * 20, z: 0 }, true);
            this.events.push({ type: 'clap', x: t.x });
          }
        } else {
          const rest = a.held ? 0.05 : 0.28 + 0.1 * Math.sin(this.simTime * 1.6 + p.id);
          a.open += (rest - a.open) * Math.min(1, 6 * dt);
          if (a.timer <= 0) {
            a.clapT = 0.3; a.clapped = false; a.open = 0.8;
            a.timer = a.held ? 0.5 : wet ? 0.8 + Math.random() * 1.4 : 2.5 + Math.random() * 3.5;
          }
        }
      }

      // 落下口(手前右)には近づかない。壁際では中央へ戻る
      if (!a.held && calm) {
        if (t.x > 0.12 && t.z > 0.12) b.applyImpulse({ x: -m * 6 * dt, y: 0, z: -m * 6 * dt }, true);
        if (Math.abs(t.x) > 0.42) b.applyImpulse({ x: -Math.sign(t.x) * m * 5 * dt, y: 0, z: 0 }, true);
        if (Math.abs(t.z) > 0.42) b.applyImpulse({ x: 0, y: 0, z: -Math.sign(t.z) * m * 5 * dt }, true);
      }

      // 掴まれたら暴れる(ハサミを振って、体をよじって、逃げようとする)
      if (a.held) {
        a.sTimer -= dt;
        if (a.sTimer <= 0) {
          a.sTimer = 0.09;
          const f = m * (p.type === 'kingcrab' ? 0.08 : scallop ? 0.06 : 0.07);
          b.applyImpulse({ x: (Math.random() - 0.5) * 2 * f, y: (Math.random() - 0.3) * f, z: (Math.random() - 0.5) * 2 * f }, true);
          b.applyTorqueImpulse({ x: (Math.random() - 0.5) * I * 12, y: (Math.random() - 0.5) * I * 12, z: (Math.random() - 0.5) * I * 12 }, true);
        }
      }

      // アニメーション用の値
      if (!scallop) {
        a.walk += ((a.held ? 1.6 : a.mode === 1 || hs > 0.03 ? 1 : 0) - a.walk) * Math.min(1, 8 * dt);
        a.phase += dt * (hs * 70 + (a.held ? 14 : 0));
        if (a.held) a.claw = 1;
        if (hs > 0.04 && grounded) {
          a.sT -= dt;
          if (a.sT <= 0) { a.sT = 0.12 + Math.random() * 0.1; this.events.push({ type: 'scuttle', x: t.x }); }
        }
      }
    }
  }

  private spawn(type: PrizeType, variant: number, x: number, y: number, z: number) {
    const w = this.world;
    const yaw = Math.random() * Math.PI * 2;
    const rot = this.pile ? qRand() : qY(yaw);
    const prize: Prize = { id: this.nextId++, type, variant, parts: [], cooldown: 0 };
    if (type === 'plush') {
      const torso = this.makeBody(x, y, z, rot, 0.3, 2.5);
      w.createCollider(
        RAPIER.ColliderDesc.capsule(0.035, 0.05).setRotation(qZ(Math.PI / 2)).setDensity(140).setFriction(1.2).setRestitution(0.0).setCollisionGroups(G_ALL),
        torso,
      );
      for (const sx of [-0.05, 0.05])
        for (const sz of [-0.03, 0.03])
          w.createCollider(
            RAPIER.ColliderDesc.capsule(0.012, 0.02).setTranslation(sx, -0.05, sz).setDensity(140).setFriction(1.2).setRestitution(0).setCollisionGroups(G_ALL),
            torso,
          );
      // 頭: 胴体からの相対位置 (0.1, 0.05, 0) をヨー回転
      const ho = rotate(rot, { x: 0.1, y: 0.05, z: 0 });
      const head = this.makeBody(x + ho.x, y + ho.y, z + ho.z, rot, 0.3, 3);
      w.createCollider(RAPIER.ColliderDesc.ball(0.042).setDensity(110).setFriction(1.2).setRestitution(0).setCollisionGroups(G_ALL), head);
      w.createCollider(
        RAPIER.ColliderDesc.ball(0.025).setTranslation(0.04, -0.012, 0).setDensity(110).setFriction(1.2).setRestitution(0).setCollisionGroups(G_ALL),
        head,
      );
      w.createImpulseJoint(RAPIER.JointData.spherical({ x: 0.07, y: 0.04, z: 0 }, { x: -0.03, y: -0.01, z: 0 }), torso, head, true);
      prize.parts.push({ body: torso, role: 'torso' }, { body: head, role: 'head' });
    } else if (type === 'box') {
      const b = this.makeBody(x, y, z, rot, 0.05, 0.4);
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.075, 0.04, 0.05).setDensity(230).setFriction(0.45).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'figure') {
      const b = this.makeBody(x, y, z, rot, 0.05, 0.25);
      const mk = (cd: RAPIER.ColliderDesc) => w.createCollider(cd.setDensity(1100).setFriction(0.3).setRestitution(0.15).setCollisionGroups(G_ALL), b);
      mk(RAPIER.ColliderDesc.cylinder(0.008, 0.05).setTranslation(0, 0.008, 0));
      mk(RAPIER.ColliderDesc.capsule(0.03, 0.022).setTranslation(0, 0.07, 0));
      mk(RAPIER.ColliderDesc.ball(0.022).setTranslation(0.015, 0.13, 0));
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'game') {
      // ゲームソフトのケース(薄い板)
      const b = this.makeBody(x, y, z, rot, 0.05, 0.3);
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.065, 0.02, 0.09).setDensity(300).setFriction(0.35).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'pad') {
      // 携帯ゲーム機
      const b = this.makeBody(x, y, z, rot, 0.05, 0.3);
      w.createCollider(RAPIER.ColliderDesc.roundCuboid(0.06, 0.008, 0.03, 0.008).setDensity(650).setFriction(0.3).setRestitution(0.1).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'sbox') {
      // お菓子の小箱
      const b = this.makeBody(x, y, z, rot, 0.05, 0.4);
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 0.035, 0.035).setDensity(200).setFriction(0.9).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'bag') {
      // お菓子の袋(柔らかいクッション状)
      const b = this.makeBody(x, y, z, rot, 0.3, 2.5);
      w.createCollider(RAPIER.ColliderDesc.roundCuboid(0.039, 0.014, 0.063, 0.011).setDensity(110).setFriction(1.1).setRestitution(0).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'rice') {
      // お米の袋(300g): ビニールのスタンドパウチ 12x18x4cm を、縦に 5 節に分けてヒンジでつないだ「ふにゃふにゃ」の連結体。
      //  - 下 2 節(A,B): 米が詰まっていて比較的硬い。曲がりにくい
      //  - 上 3 節(C,D,E): 空気だけのビニールで、ひらひらと簡単に折れ曲がる
      //  - 節 D には小判型の持ち手穴(66x24mm)があり、左右の柱だけが残る → 爪を通して引っ掛けられる。持ち手側は厚み数mmのぺらぺらのフィルム
      // 山積みでは向きがランダムになり、袋どうしが折れ曲がって絡まる
      const tilts = [0, 0, Math.PI / 2, -Math.PI / 2, Math.PI];
      const tilt = tilts[Math.floor(Math.random() * tilts.length)];
      const q = this.pile ? rot : qMul(qY(yaw), qXm(tilt));
      // 厚みは下(米が詰まった部分 ≒ 4.2cm)から上(薄いフィルム ≒ 1cm)へ向かって急に薄くなる。肩もすぼまる
      const SEG = [
        { c: -0.06, hh: 0.03, hx: 0.06, hz: 0.021, pillars: false },
        { c: 0.0, hh: 0.03, hx: 0.058, hz: 0.015, pillars: false },
        { c: 0.04, hh: 0.01, hx: 0.054, hz: 0.006, pillars: false },
        { c: 0.062, hh: 0.012, hx: 0.0105, hz: 0.004, pillars: true },
        { c: 0.082, hh: 0.008, hx: 0.05, hz: 0.004, pillars: false },
      ];
      // 関節: [位置 y, ばね, 粘り, 可動範囲(rad)]
      const JOINTS: Array<[number, number, number, number]> = [
        [-0.03, 0.05, 0.01, 0.6],
        [0.03, 0.012, 0.004, 1.1],
        [0.05, 0.002, 0.002, 1.5],
        [0.074, 0.0015, 0.0015, 1.5],
      ];
      const bodies = SEG.map((sg) => {
        const o = rotate(q, { x: 0, y: sg.c, z: 0 });
        const b = this.makeBody(x + o.x, y + o.y, z + o.z, q, 0.5, 5); // 粘りを強めて、ふるえ(ジッター)を抑える
        const col = (hx: number, cx: number) =>
          w.createCollider(RAPIER.ColliderDesc.cuboid(hx, sg.hh, sg.hz).setTranslation(cx, 0, 0).setDensity(300).setFriction(1.1).setRestitution(0).setCollisionGroups(G_ALL), b);
        if (sg.pillars) {
          col(sg.hx, -0.0435);
          col(sg.hx, 0.0435);
        } else col(sg.hx, 0);
        return b;
      });
      JOINTS.forEach(([jy, k, d, lim], i) => {
        const jd = RAPIER.JointData.revolute({ x: 0, y: jy - SEG[i].c, z: 0 }, { x: 0, y: jy - SEG[i + 1].c, z: 0 }, { x: 1, y: 0, z: 0 });
        const joint = w.createImpulseJoint(jd, bodies[i], bodies[i + 1], true) as RAPIER.RevoluteImpulseJoint;
        joint.setLimits(-lim, lim);
        joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
        joint.configureMotorPosition(0, k, d * 4);
      });
      for (const b of bodies) prize.parts.push({ body: b, role: 'torso' });
    } else if (type === 'chips') {
      // ポテトチップス BIG: 空気がたっぷり入った大きなビニール袋(約 20x26cm, 厚み最大 7cm)。
      // 3 節: 下の圧着ひれ - ふくらんだ本体 - 上の圧着ひれ。ひれは厚み数 mm のぺらぺらで、つまんで持ち上げられる。
      // 中身はほとんど空気なので超軽く(約 0.15kg)、空気抵抗でふわっと落ちる
      const tilt = Math.random() < 0.75 ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : 0;
      const q = this.pile ? rot : qMul(qY(yaw), qXm(tilt));
      const SEG = [
        { c: -0.115, hh: 0.0175, hz: 0.004, d: 200 },
        { c: 0.0, hh: 0.095, hz: 0.035, d: 60 },
        { c: 0.115, hh: 0.0175, hz: 0.004, d: 200 },
      ];
      const bodies = SEG.map((sg) => {
        const o = rotate(q, { x: 0, y: sg.c, z: 0 });
        const b = this.makeBody(x + o.x, y + o.y, z + o.z, q, 0.6, 2.2);
        w.createCollider(RAPIER.ColliderDesc.cuboid(0.1, sg.hh, sg.hz).setDensity(sg.d).setFriction(1.0).setRestitution(0).setCollisionGroups(G_ALL), b);
        return b;
      });
      for (const [i, jy] of [[0, -0.095], [1, 0.095]] as Array<[number, number]>) {
        const jd = RAPIER.JointData.revolute({ x: 0, y: jy - SEG[i].c, z: 0 }, { x: 0, y: jy - SEG[i + 1].c, z: 0 }, { x: 1, y: 0, z: 0 });
        const joint = w.createImpulseJoint(jd, bodies[i], bodies[i + 1], true) as RAPIER.RevoluteImpulseJoint;
        joint.setLimits(-1.3, 1.3);
        joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
        joint.configureMotorPosition(0, 0.003, 0.002);
      }
      for (const b of bodies) prize.parts.push({ body: b, role: 'torso' });
    } else if (type === 'gpubox') {
      // グラボの箱(実物の約 7 割サイズ 24x6.5x13cm、中身入りでずっしり)
      const b = this.makeBody(x, y, z, rot, 0.05, 0.4);
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 0.0325, 0.066).setDensity(300).setFriction(0.45).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else if (type === 'gpucard') {
      // グラボ(裸筐体): 本体(21x4x10cm、ずっしり重い) + 金属のブラケット。ファンの羽は折れる
      const b = this.makeBody(x, y, z, rot, 0.05, 0.3);
      // 本体は「下の板」+「縁・仕切りの壁」。ファンの上は井戸(穴)として開いていて、爪やフックが刺さって掴める
      const fans = GPU_MODELS[variant % GPU_MODELS.length].fans;
      const solid = (hx: number, hy: number, hz: number, cx: number, cy: number, cz: number) =>
        w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setDensity(700).setFriction(0.4).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      solid(0.105, 0.01, 0.05, 0, 0.01, 0); // 下の板(基板・ヒートシンク)
      solid(0.105, 0.01, 0.006, 0, 0.03, 0.044); // 手前の縁
      solid(0.105, 0.01, 0.006, 0, 0.03, -0.044); // 奥の縁
      for (const [a0, b0] of shroudSegments(fans)) solid((b0 - a0) / 2, 0.01, 0.038, (a0 + b0) / 2, 0.03, 0); // 端と仕切り
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.002, 0.02, 0.06).setTranslation(-0.109, 0.02, 0).setDensity(2500).setFriction(0.3).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
      prize.fans = GPU_MODELS[variant % GPU_MODELS.length].fans;
      prize.blades = new Array(prize.fans * BLADES).fill(true);
      prize.spin = 0;
    } else if (type === 'crab' || type === 'kingcrab') {
      // 生きたカニ。甲羅 + 左右のハサミ。脚は見た目のみ(アニメ)
      const k = type === 'kingcrab' ? 1.7 : 1;
      const b = this.makeBody(x, y, z, rot, 0.6, 3, true);
      const col = (hx: number, hy: number, hz: number, cx: number, cy: number, cz: number) =>
        w.createCollider(
          RAPIER.ColliderDesc.cuboid(hx * k, hy * k, hz * k).setTranslation(cx * k, cy * k, cz * k).setDensity(type === 'kingcrab' ? 950 : 1100).setFriction(0.7).setRestitution(0.05).setCollisionGroups(G_ALL),
          b,
        );
      col(0.05, 0.02, 0.035, 0, 0.022, 0); // 甲羅
      col(0.016, 0.012, 0.02, 0.052, 0.022, 0.045); // 右のハサミ
      col(0.016, 0.012, 0.02, -0.052, 0.022, 0.045); // 左のハサミ
      prize.parts.push({ body: b, role: 'main' });
      prize.anim = newAnim();
    } else if (type === 'scallop') {
      // 生きたホタテ。平らな円盤(殻)
      const b = this.makeBody(x, y, z, rot, 0.6, 2.5, true);
      w.createCollider(RAPIER.ColliderDesc.cylinder(0.014, 0.05).setTranslation(0, 0.014, 0).setDensity(1000).setFriction(0.5).setRestitution(0.05).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
      prize.anim = newAnim();
      prize.anim.timer = 1 + Math.random() * 4;
    } else if (type === 'tin') {
      // お菓子の缶(円柱、転がる)
      const b = this.makeBody(x, y, z, rot, 0.05, 0.15);
      w.createCollider(RAPIER.ColliderDesc.cylinder(0.04, 0.045).setDensity(350).setFriction(0.6).setRestitution(0.2).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    } else {
      const b = this.makeBody(x, y, z, rot, 0.05, 0.1);
      w.createCollider(RAPIER.ColliderDesc.ball(0.05).setDensity(160).setFriction(0.3).setRestitution(0.45).setCollisionGroups(G_ALL), b);
      prize.parts.push({ body: b, role: 'main' });
    }
    this.prizes.push(prize);
    return prize;
  }

  /** 景品をすべて入れ直し、静止するまで先行シミュレーション */
  refill(plan: Array<[PrizeType, number]>, pile = false) {
    this.releaseGlue();
    for (const p of this.prizes) for (const pt of p.parts) this.world.removeRigidBody(pt.body);
    for (const d of this.debris) this.world.removeRigidBody(d.body);
    this.debris = [];
    this.prizes = [];
    this.prevVel.clear();
    this.pile = pile;
    plan = [...plan].sort(() => Math.random() - 0.5);
    const cols = 4;
    plan.forEach(([t, v], i) => {
      let x: number, z: number;
      if (pile) {
        // 雑然と積み上げ: ランダムな位置・向きで落として自然な山を作る
        do {
          x = -0.4 + Math.random() * 0.8;
          z = -0.4 + Math.random() * 0.8;
        } while (x > 0.1 && z > 0.1); // 落下口(x,z > 0.25)に袋がはみ出して引っ掛からないよう、手前に余白を取る
      } else {
        const gx = (i % cols) - 1.5;
        const gz = Math.floor(i / cols) - 1.5;
        x = Math.max(-0.4, Math.min(0.1, gx * 0.2 + (Math.random() - 0.5) * 0.04 - 0.05));
        z = Math.max(-0.4, Math.min(0.1, gz * 0.19 + (Math.random() - 0.5) * 0.04 - 0.05));
      }
      // 隣の景品と重なって生成されると、押し出しで暴れるので、少し高い所から 1 個ずつ落とす
      this.spawn(t, v, x, terrainHeightAt(this.terrain, x, z) + (pile ? 0.45 + Math.random() * 0.1 : 0.3 + Math.random() * 0.05), z);
      for (let k = 0; k < 20; k++) this.simStep();
    });
    // 全景品がほぼ静止するまで(最大 900 ステップ)。静止前に眠らせると、起きた瞬間に暴れるため
    for (let i = 0; i < 700; i++) {
      this.simStep();
      if (i >= 120 && i % 30 === 0 && this.settledSpeed() < 0.06) break;
    }
    // 先行シミュレーション中に落下口へ落ちた景品は片付ける(獲得扱いにしない)
    for (const p of [...this.prizes]) {
      if (p.parts[0].body.translation().y < -0.2) {
        for (const pt of p.parts) this.world.removeRigidBody(pt.body);
        this.prizes.splice(this.prizes.indexOf(p), 1);
      }
    }
    // 静止した景品は眠らせる(触れられるまで物理計算の負荷がほぼゼロ)
    for (const p of this.prizes) if (!p.anim) for (const pt of p.parts) {
      pt.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      pt.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      pt.body.sleep();
    }
    this.events = [];
    this.prevVel.clear();
  }

  /** 全景品の最大速度(線速度 + 角速度 x 0.1m)。静止判定用 */
  private settledSpeed() {
    let m = 0;
    for (const p of this.prizes) if (!p.anim) for (const pt of p.parts) {
      const v = pt.body.linvel(), w = pt.body.angvel();
      m = Math.max(m, Math.hypot(v.x, v.y, v.z) + 0.1 * Math.hypot(w.x, w.y, w.z));
    }
    return m;
  }

  insertCoin() {
    if (this.state !== 'idle') return false;
    this.state = 'ready';
    this.timer = 20;
    this.stateT = 0;
    this.setClaw(OPEN, 3);
    this.tiltTarget = 0;
    this.events.push({ type: 'clawOpen' });
    return true;
  }

  private setClaw(target: number, stiff: number) {
    for (const f of this.fingers) f.joint.configureMotorPosition(target, stiff, stiff * 0.04 + 0.04);
  }

  private moveToward(tx: number, tz: number, sp: number, dt: number) {
    const dx = tx - this.hubPos.x, dz = tz - this.hubPos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.004) return true;
    const st = Math.min(dist, sp * dt);
    this.hubPos.x += (dx / dist) * st;
    this.hubPos.z += (dz / dist) * st;
    this.moveVel = 1;
    return false;
  }

  private stepArm(dt: number, inp: Input) {
    const hp = this.hubPos;
    const prevState = this.state;
    this.moveVel = 0;
    this.stateT += dt;
    switch (this.state) {
      case 'ready': {
        const sp = 0.5;
        let mx = 0, mz = 0;
        if (inp.left) mx -= 1;
        if (inp.right) mx += 1;
        if (inp.back) mz -= 1;
        if (inp.front) mz += 1;
        if (mx || mz) {
          const n = Math.hypot(mx, mz);
          hp.x = Math.max(-BOUND, Math.min(BOUND, hp.x + (mx / n) * sp * dt));
          hp.z = Math.max(-BOUND, Math.min(BOUND, hp.z + (mz / n) * sp * dt));
          this.moveVel = 1;
        }
        this.timer -= dt;
        if (inp.drop || this.timer <= 0) {
          if (this.timer <= 0) this.events.push({ type: 'timeout' });
          this.events.push({ type: 'dropStart' });
          this.won0 = this.won; // この1プレイ開始時点の獲得数(落下はキャリー/リリース中に起きるため、ここで記録)
          this.state = 'descend';
          this.stateT = 0;
          this.gripLift = this.gripRange[0] + Math.random() * (this.gripRange[1] - this.gripRange[0]); // 持ち上げ時の握力(確率要素)
        }
        break;
      }
      case 'descend':
        hp.y -= 0.5 * dt;
        this.moveVel = 0.5;
        const low = this.yLow + terrainHeightAt(this.terrain, hp.x, hp.z);
        if (this.clawMode === 'bar' && hp.y > low && this.barTouching(0.004).length) {
          // 粘着バーが景品に触れた
          this.state = 'stick';
          this.stateT = 0;
          this.glueDone = false;
          break;
        }
        if (hp.y <= low) {
          hp.y = low;
          this.stateT = 0;
          if (this.clawMode === 'bar') {
            this.state = 'stick';
            this.glueDone = false;
          } else if (this.clawMode === 'hook') {
            // フックは閉じない。降りたあと少し横(+x)に引いて、リングや持ち手の穴の下へ爪先を潜り込ませる
            this.state = 'sweep';
            this.sweepX0 = hp.x;
          } else {
            this.state = 'close';
            this.setClaw(CLOSED, this.gripClose);
            this.events.push({ type: 'clawClose' });
          }
        }
        break;
      case 'stick':
        // 少し押し付けて貼り付ける
        if (this.stateT < 0.3) { hp.y -= 0.02 * dt; this.moveVel = 0.2; }
        if (!this.glueDone && this.stateT > 0.35) { this.glueDone = true; this.glueTouching(); }
        if (this.stateT > 0.9) {
          this.state = 'lift';
          this.stateT = 0;
          this.events.push({ type: 'lift' });
        }
        break;
      case 'sweep': {
        const goal = Math.min(BOUND, this.sweepX0 + 0.07);
        hp.x = Math.min(goal, hp.x + 0.12 * dt);
        this.moveVel = 0.4;
        if (hp.x >= goal - 1e-6 && this.stateT > 0.2) {
          this.state = 'lift';
          this.stateT = 0;
          this.events.push({ type: 'lift' });
        }
        break;
      }
      case 'close':
        if (this.stateT > 1.1) {
          this.state = 'lift';
          this.stateT = 0;
          this.setClaw(CLOSED, this.gripLift);
          this.events.push({ type: 'lift' });
        }
        break;
      case 'lift':
        hp.y += (this.clawMode === 'hook' ? 0.3 : this.clawMode === 'bar' ? 0.35 : 0.45) * dt;
        this.moveVel = 0.5;
        if (this.glued.length) this.updateGlue(false);
        if (hp.y >= Y_TOP) {
          hp.y = Y_TOP;
          this.state = 'carry';
          this.stateT = 0;
          // 上端ストッパーに当たる衝撃。握力が弱い時ほど景品が振り落とされやすい
          this.bumpT = 0;
          this.bumpAmp = 0.007 + Math.random() * 0.006;
          if (this.glued.length) this.updateGlue(true);
          this.events.push({ type: 'bump' });
        }
        break;
      case 'carry':
        if (this.stateT < 0.45) break; // ショックが収まるまで待つ
        if (this.moveToward(HOME.x, HOME.z, 0.5, dt)) {
          this.state = 'release';
          this.stateT = 0;
          if (this.clawMode === 'hook') this.tiltTarget = -1.9; // 先端を下に向けて、引っ掛けた輪を外す
          else if (this.clawMode === 'bar') this.releaseGlue();
          else this.setClaw(OPEN, 3);
          this.events.push({ type: 'release' });
        }
        break;
      case 'release':
        if (this.stateT > (this.clawMode === 'hook' ? 2.0 : 1.4)) {
          this.state = 'return';
          this.stateT = 0;
          this.tiltTarget = 0;
        }
        break;
      case 'return':
        if (this.moveToward(START.x, START.z, 0.7, dt)) {
          this.state = 'idle';
          this.events.push({ type: 'end' });
          if (this.won === this.won0) this.events.push({ type: 'miss' });
        }
        break;
      default:
    }
    void prevState;
    if (this.bumpT >= 0) {
      this.bumpT += dt;
      const k = Math.exp(-this.bumpT * 16) * Math.sin(2 * Math.PI * 17 * this.bumpT);
      this.bumpOff.y = -this.bumpAmp * k; // 一瞬下に弾かれて揺れる
      this.bumpOff.x = this.bumpAmp * 0.4 * k;
      this.bumpOff.z = this.bumpAmp * 0.25 * k;
      if (this.bumpT > 0.5) { this.bumpT = -1; this.bumpOff = { x: 0, y: 0, z: 0 }; }
    }
    this.hubTilt += (this.tiltTarget - this.hubTilt) * Math.min(1, dt * 5);
    this.hub.setNextKinematicRotation({ x: 0, y: 0, z: Math.sin(this.hubTilt / 2), w: Math.cos(this.hubTilt / 2) });
    this.hub.setNextKinematicTranslation({ x: hp.x + this.bumpOff.x, y: hp.y + this.bumpOff.y, z: hp.z + this.bumpOff.z });
  }
  private won0 = 0;

  /** 実時間 dt (秒) 分だけ進める */
  advance(dt: number, inp: Input) {
    this.acc += Math.min(dt, 0.05);
    let n = 0;
    while (this.acc >= Sim.H && n < 3) {
      this.acc -= Sim.H;
      this.stepArm(Sim.H, inp);
      this.simStep();
      n++;
    }
    if (this.acc >= Sim.H) this.acc = 0; // 3 ステップで追いつけなければ遅れを捨てる
    if (n > 0) this.postStep(n * Sim.H);
  }

  private static readonly MAX_V = 5; // m/s
  private static readonly MAX_W = 30; // rad/s

  private postStep(dt: number) {
    this.updateCreatures(dt);
    this.updateGpu(dt);
    const out: Prize[] = [];
    for (const p of this.prizes) {
      p.cooldown -= dt;
      for (const pt of p.parts) {
        const b = pt.body;
        if (b.isSleeping()) continue;
        const v = b.linvel();
        // 暴走対策: 速度の上限。押し出しで弾け飛ぶ(あらぶる)のを防ぐ
        const sp = Math.hypot(v.x, v.y, v.z);
        if (sp > Sim.MAX_V) {
          const k = Sim.MAX_V / sp;
          b.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
          v.x *= k; v.y *= k; v.z *= k;
        }
        const w = b.angvel();
        const wp = Math.hypot(w.x, w.y, w.z);
        if (wp > Sim.MAX_W) {
          const k = Sim.MAX_W / wp;
          b.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
        }
        const pv = this.prevVel.get(b.handle);
        if (pv && p.cooldown <= 0) {
          const dv = Math.hypot(v.x - pv.x, v.y - pv.y, v.z - pv.z);
          const soft = p.type === 'rice' || p.type === 'bag' || p.type === 'chips';
          if (dv > (soft ? 0.45 : 0.6)) {
            const t = b.translation();
            if (t.y > -0.1) {
              p.cooldown = soft ? 0.09 : 0.08;
              this.events.push({ type: 'impact', mat: p.type, strength: Math.min(1, dv / (soft ? 2 : 3)), x: t.x });
            }
          }
        }
        if (pv) { pv.x = v.x; pv.y = v.y; pv.z = v.z; } else this.prevVel.set(b.handle, { x: v.x, y: v.y, z: v.z });
      }
      if (p.parts[0].body.translation().y < -0.2) out.push(p);
    }
    for (const p of out) {
      this.prizes.splice(this.prizes.indexOf(p), 1);
      this.won++;
      this.events.push({ type: 'win', prize: p });
      for (const pt of p.parts) {
        this.prevVel.delete(pt.body.handle);
        this.world.removeRigidBody(pt.body);
      }
    }
  }

  /** 爪の開き量(平均, 描画・音用) */
  fingerAngles(): number[] {
    return this.fingers.map((f) => {
      const q = f.body.rotation();
      // ヒンジ軸まわりの回転角を、下向きベクトルの回転から推定
      const v = rotate(q, { x: 0, y: -1, z: 0 });
      const d = { x: Math.cos(f.theta), z: Math.sin(f.theta) };
      return Math.atan2(v.x * d.x + v.z * d.z, -v.y);
    });
  }
}

function rotate(q: { x: number; y: number; z: number; w: number }, v: { x: number; y: number; z: number }) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}
void qXm;
