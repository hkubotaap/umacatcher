import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sim, CHIPS_XL, FINGER_LEN, FINGER_R, terrainHeightAt, type Input, type Prize, type TerrainKind, STICKY_BARS } from './sim.ts';
import { GENRES, expandPlan, prizeName, type Genre } from './genres.ts';
import { BLADES, GPU_MODELS, GPU_PRICES, PRICE_DATE, PRICE_SOURCE, GPU_BRAND, GPU_BRAND_UP, gpuShowName, fanLayout, shroudSegments, wellHalf, type GpuModel } from './gpu.ts';
import { GameAudio } from './audio.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// 起動エラーを画面に表示(原因調査用)
function showError(msg: string) {
  const el = $('start');
  el.style.display = 'flex';
  el.innerHTML = '<h1>⚠ 起動エラー</h1><pre style="max-width:80vw;white-space:pre-wrap;text-align:left;font-size:13px">' + msg.replace(/</g, '&lt;') + '</pre>';
}
addEventListener('error', (e) => showError(String(e.error?.stack ?? e.message)));
addEventListener('unhandledrejection', (e) => showError(String(e.reason?.stack ?? e.reason)));
if (location.search.includes('skip')) $('start').style.display = 'none';
let audioRef: { start(): void } | null = null;
$('startBtn').addEventListener('click', () => {
  $('start').style.display = 'none';
  try { audioRef?.start(); } catch (err) { console.error(err); }
});

// ---------- renderer / scene ----------
const canvas = $<HTMLCanvasElement>('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // 高解像度ディスプレイでの負荷を抑える
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a0d33');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.5;
controls.maxDistance = 4.5;
controls.maxPolarAngle = Math.PI * 0.56;

const VIEWS: Record<string, { p: [number, number, number]; t: [number, number, number] }> = {
  front: { p: [0, 0.75, 2.5], t: [0, 0.15, 0.4] },
  play: { p: [0, 1.15, 1.55], t: [0, 0.3, 0.0] },
  left: { p: [-1.9, 0.6, 0.7], t: [0, 0.35, 0.1] },
  right: { p: [1.9, 0.6, 0.7], t: [0, 0.35, 0.1] },
  top: { p: [0, 2.3, 0.45], t: [0, 0, 0.05] },
  panel: { p: [0, 0.45, 1.55], t: [0, -0.1, 0.7] },
};
let tween: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
function setView(name: string, instant = false) {
  const v = VIEWS[name];
  tween = { p: new THREE.Vector3(...v.p), t: new THREE.Vector3(...v.t) };
  if (instant) {
    camera.position.copy(tween.p);
    controls.target.copy(tween.t);
    tween = null;
  }
}
controls.addEventListener('start', () => (tween = null));
setView('front', true);

// ---------- helpers ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, g, c };
}
const std = (color: THREE.ColorRepresentation, rough = 0.6, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------- cabinet ----------
const purple = std('#6a3fd1', 0.45, 0.1);
const pink = std('#ff6fb5', 0.4, 0.1);
const dark = std('#1b1030', 0.8);

let genre: Genre = GENRES[0];
// 床 (落下口付き)
const floorC = canvasTex(256, 256, () => {});
const floorTex = floorC.tex;
function drawFloor() {
  const g = floorC.g;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? genre.theme.floorA : genre.theme.floorB;
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  floorTex.needsUpdate = true;
}
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(2, 2);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 });
box(0.75, 0.1, 1.0, floorMat, -0.125, -0.05, 0);
box(0.25, 0.1, 0.75, floorMat, 0.375, -0.05, -0.125);
// 落下口
box(0.25, 0.004, 0.25, dark, 0.375, -0.017, 0.375, scene, false);
const yellow = std('#ffd84a', 0.4, 0, { emissive: '#7a5a00', emissiveIntensity: 0.4 });
box(0.25, 0.02, 0.012, yellow, 0.375, 0.006, 0.256, scene, false);
box(0.012, 0.02, 0.25, yellow, 0.256, 0.006, 0.375, scene, false);

// 本体
box(1.2, 0.88, 1.2, purple, 0, -0.46, 0); // 土台(上面を床より 2cm 下げて Z ファイト回避)
box(1.2, 0.76, 0.5, purple, 0, -0.51, 0.75); // 操作パネル下部
const panelMat = std('#2d1b5e', 0.5, 0.2);
box(1.2, 0.04, 0.4, panelMat, 0, -0.14, 0.8);
box(1.22, 0.08, 1.22, pink, 0, -0.92, 0.1); // 台座
// ポスト
for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.098, 1.4, 0.098, pink, sx * 0.545, 0.65, sz * 0.545);
// ヘッダー + 看板
box(1.2, 0.4, 1.2, purple, 0, 1.5, 0);
const sign = canvasTex(1024, 256, () => {});
function drawSign() {
  const g = sign.g, t = genre.theme;
  const gr = g.createLinearGradient(0, 0, 1024, 0);
  gr.addColorStop(0, t.signA);
  gr.addColorStop(0.5, t.signB);
  gr.addColorStop(1, t.signC);
  g.fillStyle = gr;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#fff';
  g.font = '900 112px "Yu Gothic UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = t.signShadow;
  g.shadowBlur = 14;
  g.fillText(genre.title, 512, 112);
  g.font = '700 40px "Yu Gothic UI", sans-serif';
  g.fillText(genre.sub + '  ★ 100円 / 1プレイ ★', 512, 212);
  g.shadowBlur = 0;
  sign.tex.needsUpdate = true;
}
const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshStandardMaterial({ map: sign.tex, emissiveMap: sign.tex, emissive: '#ffffff', emissiveIntensity: 0.9 }));
signMesh.position.set(0, 1.5, 0.605);
scene.add(signMesh);
// 背面・側面パネル(景品エリア)
const backC = canvasTex(256, 256, () => {});
const backTex = backC.tex;
function drawBack() {
  const g = backC.g, t = genre.theme;
  g.fillStyle = t.backBase;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.22)';
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 8, 0, 7); g.fill(); }
  g.font = '40px sans-serif';
  g.textBaseline = 'alphabetic';
  g.globalAlpha = 0.7;
  for (let i = 0; i < 6; i++) g.fillText(t.backIcons[i % t.backIcons.length], 20 + (i % 3) * 80, 70 + Math.floor(i / 3) * 110);
  g.globalAlpha = 1;
  backTex.needsUpdate = true;
}
const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8 });
box(1.0, 1.3, 0.02, backMat, 0, 0.65, -0.49);
// 左右の側面は全面ガラス。支柱(ポスト)と細い枠だけにして、横からも中が見える
const sideMat = std('#b494ff', 0.5, 0.2);
for (const sx of [-1, 1]) {
  box(0.016, 0.02, 1.0, sideMat, sx * 0.492, 0.01, 0, scene, false); // 下枠
  box(0.016, 0.02, 1.0, sideMat, sx * 0.492, 1.29, 0, scene, false); // 上枠
}
function applyTheme() {
  const t = genre.theme;
  purple.color.set(t.body);
  pink.color.set(t.accent);
  sideMat.color.set(t.side);
  panelMat.color.set(t.panel ?? '#2d1b5e');
  renderer.toneMappingExposure = t.exposure ?? 1.05;
  drawFloor();
  drawSign();
  drawBack();
}
applyTheme();
// ガラス
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, envMapIntensity: 1.5, side: THREE.DoubleSide, depthWrite: false });
glassMat.alphaTest = 0;
const gf = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), glassMat);
gf.position.set(0, 0.65, 0.5);
scene.add(gf);
for (const sx of [-1, 1]) {
  const g2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), glassMat);
  g2.rotation.y = Math.PI / 2;
  g2.position.set(sx * 0.5, 0.65, 0);
  scene.add(g2);
}
// ライト
scene.add(new THREE.HemisphereLight('#ffffff', '#7a5cff', 0.4));
const key = new THREE.SpotLight('#fff1dc', 15, 6, 0.68, 0.5, 1.2);
key.position.set(0, 1.12, 0.55);
key.target.position.set(0, 0, -0.05);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
key.shadow.bias = -0.0008;
key.shadow.normalBias = 0.012;
key.shadow.camera.near = 0.3;
key.shadow.camera.far = 3;
key.shadow.radius = 2;
scene.add(key, key.target);
const fill = new THREE.PointLight('#ffb0e0', 2.2, 3);
fill.position.set(-0.3, 1.1, -0.2);
scene.add(fill);

// 地面
const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), std('#241043', 0.9));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.975;
ground.receiveShadow = true;
scene.add(ground);

// ---------- gantry & claw (visual) ----------
const metal = std('#d8d8e6', 0.25, 0.9);
const rail = box(1.1, 0.04, 0.05, metal, 0, 1.2, 0);
const trolley = box(0.1, 0.06, 0.1, std('#ff4f6a', 0.4, 0.3), 0, 1.2, 0);
box(0.04, 0.05, 1.1, metal, -0.5, 1.2, 0);
box(0.04, 0.05, 1.1, metal, 0.5, 1.2, 0);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 8), std('#222', 0.5, 0.6));
cable.castShadow = true;
scene.add(cable);
const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), metal);
hubMesh.castShadow = true;
scene.add(hubMesh);
const fingerGroups: THREE.Group[] = [];
// 1 本フック(J 字): sim.ts の addHook と同じ寸法。ハブの子にして、傾きも一緒に動かす
const hookMesh = (() => {
  const pts: THREE.Vector3[] = [new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0, -0.125, 0)];
  for (let i = 1; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    pts.push(new THREE.Vector3(0.035 + 0.035 * Math.cos(a), -0.125 + 0.035 * Math.sin(a), 0));
  }
  pts.push(new THREE.Vector3(0.07, -0.085, 0));
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 64, 0.0075, 10, false), std('#e8e8f2', 0.2, 0.95));
  m.castShadow = true;
  m.visible = false;
  return m;
})();
hubMesh.add(hookMesh);
// 固定粘着バー: 台の左右の壁に渡したレール + 上面の粘着テープ(sim.ts の STICKY_BARS と同じ寸法)
const stickyGroup = (() => {
  const g = new THREE.Group();
  const tapeMat = new THREE.MeshPhysicalMaterial({ color: '#ffd23f', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.92 });
  for (const z of STICKY_BARS.zs) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(STICKY_BARS.hx * 2, STICKY_BARS.hy * 2, STICKY_BARS.hz * 2), metal);
    rail.position.set(0, STICKY_BARS.y, z);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(STICKY_BARS.hx * 2 - 0.04, 0.004, STICKY_BARS.hz * 2 - 0.006), tapeMat);
    tape.position.set(0, STICKY_BARS.y + STICKY_BARS.hy + 0.002, z);
    rail.castShadow = rail.receiveShadow = tape.castShadow = true;
    g.add(rail, tape);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, STICKY_BARS.y + STICKY_BARS.hy, STICKY_BARS.hz * 2), metal);
      post.position.set(sx * (STICKY_BARS.hx - 0.015), (STICKY_BARS.y + STICKY_BARS.hy) / 2, z);
      post.castShadow = true;
      g.add(post);
    }
  }
  g.visible = false;
  scene.add(g);
  return g;
})();
const fingerMat = std('#f2f2fa', 0.2, 0.95);

// ---------- sim ----------
let pileMode = genre.pile;
/** 景品構成。山積みの時は個数を増やして深い山にする */
function planFor(g: Genre, pile: boolean) {
  const base = expandPlan(g);
  if (!pile) return base;
  const target = Math.min(48, Math.round(base.length * (g.id === 'rice' || g.id === 'hook' ? 1.6 : 1.7)));
  const out = [...base];
  while (out.length < target) out.push(base[Math.floor(Math.random() * base.length)]);
  return out;
}
const sim = await Sim.create(planFor(genre, pileMode), pileMode);
sim.gripRange = genre.gripRange;
sim.yLow = genre.yLow;
sim.setClawMode(genre.claw ?? 'claw');
let terrainKind: TerrainKind = genre.terrain ?? 'flat';
let waterOn = genre.water !== undefined;
for (const f of sim.fingers) {
  const g = new THREE.Group();
  const d = { x: Math.cos(f.theta), z: Math.sin(f.theta) };
  const link = new THREE.Mesh(new THREE.BoxGeometry(0.014, FINGER_LEN, 0.028), fingerMat);
  link.rotation.y = -f.theta;
  link.position.set(0, -FINGER_LEN / 2, 0);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.016, 0.028), fingerMat);
  tip.rotation.y = -f.theta;
  tip.position.set(-0.03 * d.x, -FINGER_LEN, -0.03 * d.z);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), std('#ff4f6a', 0.4, 0.3));
  for (const m of [link, tip, pin]) m.castShadow = true;
  g.add(link, tip, pin);
  scene.add(g);
  fingerGroups.push(g);
}
void FINGER_R;

// ---------- prize visuals ----------
const PLUSH_COL = ['#f4e3d0', '#b5733c', '#ffb3d1', '#8fd3ff', '#e8c3ff'];
const MANE_COL = ['#ff8fb8', '#4a2a14', '#ffffff', '#ffffff', '#7b3fb0'];
const BOX_COL = [
  ['#ff6fb5', '#ffe36f'],
  ['#5fc8ff', '#ffffff'],
  ['#7be37b', '#fff3a0'],
];
const BALL_COL = ['#ff5a6a', '#4fa8ff', '#ffd84a'];
const eyeMat = std('#151515', 0.3);
const boxTexCache = new Map<string, THREE.CanvasTexture>();

function mkMesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 有名ゲーム機風(携帯機)。当たり判定(約 0.136 x 0.032 x 0.076)に収まる大きさで作る。
function consoleVisual(variant: number): THREE.Object3D {
  const g = new THREE.Group();
  const gl = (c: string, r = 0.3) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, clearcoat: 0.8 });
  const screen = (w: number, d: number, x: number, z: number, y: number, c = '#0c1018', em = '#1a2a44') =>
    mkMesh(new THREE.BoxGeometry(w, 0.002, d), new THREE.MeshStandardMaterial({ color: c, emissive: em, emissiveIntensity: 0.6, roughness: 0.15 }), g, x, y, z);
  const btn = (r: number, c: string, x: number, z: number, y: number) => mkMesh(new THREE.CylinderGeometry(r, r, 0.004, 14), gl(c, 0.4), g, x, y, z);
  const v = variant % 5;
  const top = 0.0165;
  if (v === 0 || v === 4) { // ニンテンドースイッチ / スイッチライト
    const lite = v === 4;
    mkMesh(new THREE.BoxGeometry(0.136, 0.028, 0.076), gl(lite ? '#f5d300' : '#1b1b20'), g, 0, 0, 0);
    if (!lite) {
      mkMesh(new THREE.BoxGeometry(0.034, 0.032, 0.076), gl('#ff3c28'), g, -0.07, 0, 0);
      mkMesh(new THREE.BoxGeometry(0.034, 0.032, 0.076), gl('#0ab9e6'), g, 0.07, 0, 0);
    }
    screen(lite ? 0.092 : 0.1, 0.062, 0, 0, 0.015);
    const xo = lite ? 0.057 : 0.07;
    btn(0.007, '#222', -xo, -0.012, 0.016); btn(0.005, '#222', xo, 0.012, 0.016);
    for (const [dx, dz] of [[0, -0.01], [0, 0.01], [-0.01, 0], [0.01, 0]] as const) btn(0.003, '#eee', xo + dx * 0.5, -0.012 + dz * 0.6 - 0.0, 0.016);
  } else if (v === 1) { // PSP
    mkMesh(new THREE.BoxGeometry(0.136, 0.026, 0.066), gl('#15151a', 0.2), g, 0, 0, 0);
    screen(0.082, 0.046, 0, 0, 0.0135, '#10202c', '#2a6a9a');
    btn(0.006, '#555', -0.056, 0.0, 0.0135);
    ([[0, -0.01, '#2ec27e'], [0, 0.01, '#3a86ff'], [-0.01, 0, '#ff6fb5'], [0.01, 0, '#e63946']] as const).forEach(([dx, dz, c]) => btn(0.0035, c, 0.056 + dx, dz, 0.0135));
  } else if (v === 2) { // ゲームボーイアドバンス(パープル)
    mkMesh(new THREE.BoxGeometry(0.136, 0.024, 0.06), gl('#6f4bc8', 0.35), g, 0, 0, 0);
    mkMesh(new THREE.BoxGeometry(0.06, 0.002, 0.044), gl('#3a3a48', 0.4), g, 0, 0, 0).position.y = 0.0125;
    screen(0.05, 0.034, 0, 0, 0.0135, '#8aa860', '#5d7a3a');
    btn(0.006, '#222', -0.05, 0, 0.0125); btn(0.005, '#d04070', 0.05, 0.004, 0.0125); btn(0.005, '#d04070', 0.04, -0.008, 0.0125);
  } else { // ニンテンドーDS(ホワイト・開いた状態)
    mkMesh(new THREE.BoxGeometry(0.1, 0.014, 0.076), gl('#f2f2f4', 0.35), g, 0, -0.003, -0.0);
    screen(0.062, 0.03, 0, -0.022, 0.0075, '#101820', '#2a4a6a');
    screen(0.062, 0.03, 0, 0.018, 0.0075, '#101820', '#2a4a6a');
    btn(0.005, '#e63946', 0.042, 0.016, 0.0075); btn(0.005, '#3a86ff', 0.052, 0.024, 0.0075); btn(0.005, '#ffd23f', 0.052, 0.008, 0.0075); btn(0.005, '#2ec27e', 0.062, 0.016, 0.0075);
  }
  return g;
}

// 有名キャラ風フィギュア(台座つき・プリミティブ形状で簡易再現)。当たり判定は sim.ts の figure と共通。
function characterFigure(variant: number): THREE.Object3D {
  const g = new THREE.Group();
  const glossy = (c: string) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const ball = (r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const b = mkMesh(new THREE.SphereGeometry(r, 18, 14), m, g, x, y, z);
    b.scale.set(sx, sy, sz);
    return b;
  };
  const eyes = (y: number, x: number, dz: number, r = 0.005) => { for (const sz of [-dz, dz]) ball(r, eyeMat, x, y, sz); };
  mkMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 28), std('#2a2a3a', 0.3, 0.4), g, 0, 0.008, 0);
  const v = variant % 5;
  if (v === 0) { // ピカチュウ
    const y = glossy('#ffd91f'), blk = std('#1a1a1a', 0.4), red = glossy('#e63232');
    ball(0.03, y, 0, 0.06, 0, 1, 1.15, 1);
    ball(0.032, y, 0.004, 0.115, 0);
    for (const sz of [-1, 1]) {
      const e = mkMesh(new THREE.ConeGeometry(0.01, 0.06, 8), y, g, -0.004, 0.17, sz * 0.026); e.rotation.x = sz * 0.35;
      const t = mkMesh(new THREE.ConeGeometry(0.0065, 0.022, 8), blk, g, -0.004, 0.19, sz * 0.033); t.rotation.x = sz * 0.35;
      ball(0.007, red, 0.024, 0.104, sz * 0.026);
    }
    eyes(0.123, 0.03, 0.013, 0.0045);
    ball(0.004, blk, 0.035, 0.115, 0);
    const tail = mkMesh(new THREE.BoxGeometry(0.008, 0.07, 0.03), y, g, -0.04, 0.07, 0); tail.rotation.z = 0.5;
    const tail2 = mkMesh(new THREE.BoxGeometry(0.008, 0.05, 0.045), glossy('#c98a2b'), g, -0.06, 0.1, 0); tail2.rotation.z = -0.3;
  } else if (v === 1) { // マリオ
    const red = glossy('#e0242a'), blue = glossy('#2a4bd1'), skin = glossy('#f4c28e');
    ball(0.024, blue, 0, 0.05, 0, 1, 1.4, 1);
    mkMesh(new THREE.BoxGeometry(0.052, 0.026, 0.056), red, g, 0, 0.082, 0);
    for (const sz of [-1, 1]) { ball(0.011, skin, 0, 0.074, sz * 0.034); ball(0.005, glossy('#ffd23f'), 0.022, 0.058, sz * 0.012); }
    ball(0.03, skin, 0.003, 0.125, 0);
    mkMesh(new THREE.SphereGeometry(0.032, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), red, g, 0, 0.133, 0);
    mkMesh(new THREE.BoxGeometry(0.03, 0.004, 0.034), red, g, 0.03, 0.134, 0);
    ball(0.006, skin, 0.032, 0.122, 0);
    mkMesh(new THREE.BoxGeometry(0.006, 0.006, 0.03), std('#3a2410', 0.7), g, 0.03, 0.113, 0);
    eyes(0.128, 0.029, 0.01, 0.004);
  } else if (v === 2) { // ドラえもん
    const bl = glossy('#1296e0'), wh = glossy('#fafafa'), red = glossy('#e63232');
    ball(0.027, bl, 0, 0.05, 0, 1, 1.1, 1);
    ball(0.018, wh, 0.012, 0.045, 0, 1, 1.1, 1);
    mkMesh(new THREE.TorusGeometry(0.025, 0.005, 8, 24), red, g, 0.0, 0.082, 0).rotation.x = Math.PI / 2;
    ball(0.006, glossy('#ffd23f'), 0.025, 0.074, 0);
    ball(0.036, bl, 0, 0.125, 0);
    ball(0.03, wh, 0.01, 0.118, 0, 1, 0.95, 1);
    ball(0.006, red, 0.038, 0.123, 0);
    eyes(0.14, 0.03, 0.008, 0.007);
    for (const sz of [-1, 1]) ball(0.0035, eyeMat, 0.036, 0.14, sz * 0.008);
    mkMesh(new THREE.BoxGeometry(0.004, 0.003, 0.05), eyeMat, g, 0.034, 0.108, 0);
    for (const sz of [-1, 1]) ball(0.01, wh, 0.01, 0.045, sz * 0.029);
  } else if (v === 3) { // ソニック
    const bl = glossy('#1f5bd8'), sk = glossy('#f4c28e');
    ball(0.025, bl, 0, 0.055, 0, 1, 1.2, 1);
    ball(0.015, sk, 0.013, 0.05, 0, 1, 1.2, 1);
    ball(0.033, bl, 0, 0.12, 0);
    ball(0.02, sk, 0.016, 0.113, 0, 1, 0.9, 1.15);
    for (const [dy, dz] of [[0.04, -0.01], [0.015, 0.012], [0.0, -0.03], [-0.01, 0.025]] as const) {
      const sp = mkMesh(new THREE.ConeGeometry(0.01, 0.06, 8), bl, g, -0.03, 0.13 + dy, dz);
      sp.rotation.z = Math.PI / 2 + 0.25;
    }
    for (const sz of [-1, 1]) {
      ball(0.0105, glossy('#fafafa'), 0.025, 0.128, sz * 0.013, 0.9, 1.3, 0.9);
      ball(0.004, eyeMat, 0.033, 0.126, sz * 0.012);
      const sh = mkMesh(new THREE.BoxGeometry(0.03, 0.012, 0.016), glossy('#e63232'), g, 0.006, 0.01 + 0.012, sz * 0.015); sh.position.y = 0.026;
    }
    ball(0.005, eyeMat, 0.036, 0.113, 0);
  } else { // カービィ
    const pk = glossy('#ff9fc2'), rd = glossy('#d92f4a');
    ball(0.04, pk, 0, 0.06, 0);
    for (const sz of [-1, 1]) {
      ball(0.012, pk, 0.002, 0.065, sz * 0.043);
      ball(0.014, rd, 0.01, 0.022, sz * 0.026, 1.4, 0.6, 1);
      ball(0.0055, glossy('#1a1a4a'), 0.037, 0.075, sz * 0.012, 0.6, 1.8, 0.8);
      ball(0.006, glossy('#ff6a90'), 0.034, 0.057, sz * 0.025, 0.5, 0.7, 1);
    }
    ball(0.005, rd, 0.039, 0.05, 0, 0.5, 0.8, 1.3);
  }
  return g;
}

function buildPrizeVisual(p: Prize): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  if (p.type === 'plush') {
    const col = PLUSH_COL[p.variant], mane = MANE_COL[p.variant];
    const fur = std(col, 1.0);
    const maneM = std(mane, 1.0);
    const torso = new THREE.Group();
    const body = mkMesh(new THREE.CapsuleGeometry(0.05, 0.07, 8, 16), fur, torso);
    body.rotation.z = Math.PI / 2;
    for (const sx of [-0.05, 0.05]) for (const sz of [-0.03, 0.03]) mkMesh(new THREE.CapsuleGeometry(0.02, 0.03, 4, 8), fur, torso, sx, -0.05, sz);
    mkMesh(new THREE.SphereGeometry(0.022, 10, 8), maneM, torso, -0.1, 0.01, 0); // しっぽ
    mkMesh(new THREE.BoxGeometry(0.1, 0.02, 0.03), maneM, torso, 0, 0.05, 0); // たてがみ背中
    const head = new THREE.Group();
    mkMesh(new THREE.SphereGeometry(0.042, 16, 12), fur, head);
    mkMesh(new THREE.SphereGeometry(0.025, 12, 10), fur, head, 0.04, -0.012, 0);
    for (const sz of [-0.02, 0.02]) {
      const e = mkMesh(new THREE.ConeGeometry(0.014, 0.04, 8), fur, head, -0.005, 0.048, sz);
      e.rotation.x = sz > 0 ? 0.2 : -0.2;
      mkMesh(new THREE.SphereGeometry(0.006, 8, 6), eyeMat, head, 0.03, 0.012, sz * 1.6);
    }
    mkMesh(new THREE.BoxGeometry(0.022, 0.03, 0.026), maneM, head, -0.025, 0.045, 0);
    out.push(torso, head);
  } else if (p.type === 'box') {
    const ckey = genre.id + p.variant;
    let tex = boxTexCache.get(ckey);
    if (!tex) {
      const [a, b] = BOX_COL[p.variant];
      tex = canvasTex(256, 192, (g) => {
        const gr = g.createLinearGradient(0, 0, 256, 192);
        gr.addColorStop(0, a);
        gr.addColorStop(1, b);
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 192);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.font = '900 38px "Yu Gothic UI", sans-serif';
        g.textAlign = 'center';
        g.fillText(genre.boxLabel, 128, 70);
        g.font = '70px sans-serif';
        g.fillText('🐴', 128, 150);
        g.strokeStyle = 'rgba(0,0,0,.25)';
        g.lineWidth = 6;
        g.strokeRect(3, 3, 250, 186);
      }).tex;
      boxTexCache.set(ckey, tex);
    }
    const g = new THREE.Group();
    mkMesh(new THREE.BoxGeometry(0.15, 0.08, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.65 }), g);
    out.push(g);
  } else if (p.type === 'figure') {
    out.push(characterFigure(p.variant));
  } else if (p.type === 'game') {
    const g = new THREE.Group();
    const cols = [['#e63946', '#ffb703'], ['#3a86ff', '#8338ec'], ['#2ec27e', '#ffd166'], ['#ff6fb5', '#6a4cff']][p.variant % 4];
    const title = ['ウマレース', 'ダービーRPG', 'ホースパズル', 'ギャロップ'][p.variant % 4];
    const cover = canvasTex(260, 360, (c) => {
      const gr = c.createLinearGradient(0, 0, 260, 360);
      gr.addColorStop(0, cols[0]);
      gr.addColorStop(1, cols[1]);
      c.fillStyle = gr;
      c.fillRect(0, 0, 260, 360);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(0, 0, 260, 44);
      c.fillStyle = '#fff';
      c.font = '700 26px sans-serif';
      c.textAlign = 'center';
      c.fillText('GAME SOFT', 130, 32);
      c.font = '110px sans-serif';
      c.fillText('🏇', 130, 190);
      c.font = '900 34px "Yu Gothic UI", sans-serif';
      c.fillText(title, 130, 270);
      c.fillStyle = '#111';
      c.fillRect(0, 316, 260, 44);
    }).tex;
    const side = std('#15151c', 0.4);
    const top = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.3 });
    // BoxGeometry の面順: +x, -x, +y, -y, +z, -z
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.18), [side, side, top, side, side, side]);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    out.push(g);
  } else if (p.type === 'pad') {
    out.push(consoleVisual(p.variant));
  } else if (p.type === 'sbox') {
    const g = new THREE.Group();
    const [a, b2, label, emoji] = [
      ['#c9822b', '#f5c87a', 'CARAMEL', '🍬'],
      ['#5a3320', '#c98a5a', 'CHOCO', '🍫'],
      ['#f7e7b4', '#e0a85a', 'COOKIE', '🍪'],
    ][p.variant % 3];
    const tex = canvasTex(256, 192, (c) => {
      c.fillStyle = a;
      c.fillRect(0, 0, 256, 192);
      c.fillStyle = b2;
      for (let i = -2; i < 9; i++) c.fillRect(i * 40, 0, 20, 192);
      c.fillStyle = 'rgba(255,255,255,.92)';
      c.fillRect(24, 40, 208, 112);
      c.fillStyle = '#6a2a10';
      c.font = '900 40px sans-serif';
      c.textAlign = 'center';
      c.fillText(label, 128, 90);
      c.font = '56px sans-serif';
      c.fillText(emoji, 128, 140);
    }).tex;
    mkMesh(new THREE.BoxGeometry(0.1, 0.07, 0.07), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), g);
    out.push(g);
  } else if (p.type === 'bag') {
    const g = new THREE.Group();
    const c = ['#ffd84a', '#2e8bff', '#ff6fb5'][p.variant % 3];
    const foil = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, metalness: 0.5, clearcoat: 0.6 });
    const body = mkMesh(new THREE.SphereGeometry(1, 28, 18), foil, g);
    body.scale.set(0.05, 0.027, 0.074);
    for (const sz of [-1, 1]) mkMesh(new THREE.BoxGeometry(0.1, 0.004, 0.012), foil, g, 0, 0, sz * 0.073);
    const label = canvasTex(128, 128, (cc) => {
      cc.fillStyle = '#fff';
      cc.fillRect(0, 0, 128, 128);
      cc.font = '84px sans-serif';
      cc.textAlign = 'center';
      cc.textBaseline = 'middle';
      cc.fillText(['🥔', '🍘', '🍬'][p.variant % 3], 64, 70);
    }).tex;
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshStandardMaterial({ map: label, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
    lm.rotation.x = -Math.PI / 2;
    lm.position.y = 0.0275;
    g.add(lm);
    out.push(g);
  } else if (p.type === 'rice') {
    // 300g スタンドパウチ(0=ななつぼし 白 / 1=ゆめぴりか 黒)。2 パーツ(本体 + 持ち手側フラップ)
    const white = p.variant % 2 === 0;
    out.push(...riceBagVisual(white));
  } else if (p.type === 'gpubox') {
    out.push(...gpuBoxVisual(p));
  } else if (p.type === 'gpucard') {
    out.push(...gpuCardVisual(p));
  } else if (p.type === 'crab' || p.type === 'kingcrab') {
    out.push(...crabVisual(p, p.type === 'kingcrab'));
    return out;
  } else if (p.type === 'scallop') {
    out.push(...scallopVisual(p));
    return out;
  } else if (p.type === 'chips') {
    out.push(...chipsBagVisual(p.variant % 4));
  } else if (p.type === 'tin') {
    const g = new THREE.Group();
    const c = ['#e63946', '#2ec27e', '#3a86ff'][p.variant % 3];
    const side = canvasTex(256, 128, (cc) => {
      cc.fillStyle = c;
      cc.fillRect(0, 0, 256, 128);
      cc.fillStyle = 'rgba(255,255,255,.9)';
      cc.fillRect(0, 36, 256, 56);
      cc.fillStyle = '#5a2a10';
      cc.font = '900 40px sans-serif';
      cc.textAlign = 'center';
      cc.textBaseline = 'middle';
      cc.fillText('🍪 COOKIES', 128, 66);
    }).tex;
    const lid = new THREE.MeshPhysicalMaterial({ color: '#e8e8f0', roughness: 0.25, metalness: 0.9 });
    mkMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 28), [new THREE.MeshStandardMaterial({ map: side, roughness: 0.4, metalness: 0.3 }), lid, lid], g);
    mkMesh(new THREE.CylinderGeometry(0.047, 0.047, 0.008, 28), lid, g, 0, 0.036, 0);
    out.push(g);
  } else {
    const g = new THREE.Group();
    const top = new THREE.MeshPhysicalMaterial({ color: BALL_COL[p.variant], roughness: 0.15, clearcoat: 1, });
    const bot = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1, });
    mkMesh(new THREE.SphereGeometry(0.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), top, g);
    mkMesh(new THREE.SphereGeometry(0.05, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bot, g);
    mkMesh(new THREE.SphereGeometry(0.02, 12, 8), std('#ffd1e8', 0.8), g);
    out.push(g);
  }
  for (const o of out) scene.add(o);
  return out;
}
// ---- 米袋(ビニールのスタンドパウチ) ----
// 外形 .108x.168 + bevel .006 → 実寸 .12x.18、厚み .012+2*.014 = .04。上下 2 パーツ(ヒンジ高さ y=.02)
const riceTex = new Map<boolean, THREE.CanvasTexture>();
const riceGeo = new Map<boolean, THREE.BufferGeometry>();
const riceMats = new Map<boolean, THREE.Material[]>();
let creaseTex: THREE.CanvasTexture | null = null;
/** 5 節の中心 y(sim.ts の SEG と同じ) */
const SEG_C = [-0.06, 0, 0.04, 0.062, 0.082];
/** 袋の厚み(m)。下 ≒ 4.2cm のふくらみ → 上 ≒ 5mm の平らなフィルム。左右の縁は圧着されて 0 に近づく */
function pouchThickness(x: number, y: number) {
  const t = Math.min(1, Math.max(0, (0.052 - y) / 0.04));
  const s = t * t * (3 - 2 * t);
  const edge = Math.max(0.1, 1 - Math.pow(Math.min(1, Math.abs(x) / 0.06), 4));
  return (0.005 + (0.044 - 0.005) * s) * edge;
}
function pouchGeo() {
  let geo = riceGeo.get(false);
  if (geo) return geo;
  const NX = 40, NY = 64, W = 0.12, H = 0.18;
  const cnt = (NX + 1) * (NY + 1);
  const pos = new Float32Array(cnt * 2 * 3), uv = new Float32Array(cnt * 2 * 2);
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, v = j / NY;
      const x = (u - 0.5) * W, y = (v - 0.5) * H;
      const hz = pouchThickness(x, y) / 2;
      const k = j * (NX + 1) + i;
      pos.set([x, y, hz], k * 3); // 前面
      pos.set([x, y, -hz], (cnt + k) * 3); // 背面
      uv.set([u, v], k * 2);
      uv.set([1 - u, v], (cnt + k) * 2); // 背面は左右反転して、裏から見ても文字が読める向きに
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, d, a, d, c); // 前面
      idx.push(cnt + a, cnt + d, cnt + b, cnt + a, cnt + c, cnt + d); // 背面
    }
  }
  for (let i = 0; i < NX; i++) idx.push(i, cnt + i + 1, i + 1, i, cnt + i, cnt + i + 1); // 底(マチ)を塞ぐ
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // 頂点の高さに応じて隣り合う 2 本のボーンへ線形ブレンド → 折れ曲がりが滑らかに見える
  const n = cnt * 2;
  const si = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  const last = SEG_C.length - 1;
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    if (y <= SEG_C[0]) { si[i * 4] = 0; wt[i * 4] = 1; continue; }
    if (y >= SEG_C[last]) { si[i * 4] = last; wt[i * 4] = 1; continue; }
    let k = 0;
    while (k < last - 1 && y >= SEG_C[k + 1]) k++;
    const t = (y - SEG_C[k]) / (SEG_C[k + 1] - SEG_C[k]);
    si[i * 4] = k; wt[i * 4] = 1 - t;
    si[i * 4 + 1] = k + 1; wt[i * 4 + 1] = t;
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wt, 4));
  riceGeo.set(false, geo);
  return geo;
}
function drawRiceLabel(c: CanvasRenderingContext2D, white: boolean) {
  const W = 256, H = 384;
  c.fillStyle = white ? '#f5f3ec' : '#34343a';
  c.fillRect(0, 0, W, H);
  if (white) {
    // 半透明の袋越しに見える米粒(下 55%)
    c.fillStyle = '#eee3c4';
    c.fillRect(0, 170, W, H - 170);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,251,238,.85)' : 'rgba(204,188,146,.55)';
      c.beginPath();
      c.ellipse(Math.random() * W, 170 + Math.random() * (H - 170), 3.4, 1.7, Math.random() * 3.14, 0, 7);
      c.fill();
    }
    // 上部の注意書き風のうすい印字(QR・マーク)
    c.strokeStyle = 'rgba(120,120,130,.35)';
    c.lineWidth = 1;
    c.strokeRect(118, 104, 34, 34);
    for (let i = 0; i < 40; i++) c.fillRect(120 + (i % 7) * 4.5, 106 + Math.floor(i / 7) * 5, 3, 3);
  } else {
    // 不織布(和紙調)の繊維
    for (let i = 0; i < 650; i++) {
      c.strokeStyle = 'rgba(215,215,226,' + (0.05 + Math.random() * 0.2) + ')';
      c.lineWidth = 0.6 + Math.random() * 1.1;
      c.beginPath();
      const x = Math.random() * W, y = Math.random() * H;
      c.moveTo(x, y);
      c.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
      c.stroke();
    }
  }
  const brush = white ? '#2d2d33' : '#c9b57f';
  const serif = '"Yu Mincho","Hiragino Mincho ProN","MS Mincho",serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // 筆文字ロゴ「う りゅう 米(まい)」: 大きな「う」と「米」、小さなルビ「りゅう」「まい」
  c.save();
  c.translate(100, 150);
  c.rotate(-0.12);
  c.fillStyle = brush;
  c.font = '900 150px ' + serif;
  c.fillText('う', 0, 0);
  c.restore();
  c.fillStyle = white ? '#34343a' : '#e8e2cc';
  c.font = '800 26px "Yu Gothic UI",sans-serif';
  for (let i = 0; i < 3; i++) c.fillText('りゅう'[i], 168, 172 + i * 27);
  c.save();
  c.translate(112, 288);
  c.rotate(0.06);
  c.fillStyle = brush;
  c.font = '900 168px ' + serif;
  c.fillText('米', 0, 0);
  c.restore();
  c.fillStyle = white ? '#34343a' : '#e8e2cc';
  c.font = '800 24px "Yu Gothic UI",sans-serif';
  for (let i = 0; i < 2; i++) c.fillText('まい'[i], 206, 252 + i * 25);
  // 右: 「北海道雨竜町」縦書き + 北海道のシルエット
  c.fillStyle = white ? '#33333a' : '#ece7d4';
  c.font = '800 24px "Yu Mincho","Hiragino Mincho ProN",serif';
  const loc = '北海道雨竜町';
  for (let i = 0; i < loc.length; i++) c.fillText(loc[i], 226, 108 + i * 27);
  c.fillStyle = white ? '#2f8a4c' : '#c9b57f';
  c.beginPath();
  c.moveTo(212, 288);
  c.lineTo(222, 280);
  c.lineTo(236, 284);
  c.lineTo(243, 294);
  c.lineTo(232, 299);
  c.lineTo(224, 308);
  c.lineTo(214, 300);
  c.closePath();
  c.fill();
  // 左: 品種名を縦書き(ななつぼし=緑 / ゆめぴりか=金)
  c.fillStyle = white ? '#2f8a4c' : '#c9b57f';
  c.font = '800 30px "Yu Gothic UI",sans-serif';
  const nm = white ? 'ななつぼし' : 'ゆめぴりか';
  for (let i = 0; i < nm.length; i++) c.fillText(nm[i], 26, 160 + i * 33);
  // 下: 朱色の落款
  c.fillStyle = '#cb2e1f';
  c.fillRect(190, 318, 34, 34);
  c.fillStyle = '#fff';
  c.font = '700 13px "Yu Mincho",serif';
  c.fillText('北海道', 207, 328);
  c.fillText('雨竜町', 207, 343);
  // 量表示
  c.fillStyle = white ? '#555' : '#d8d2bc';
  c.font = '700 18px "Yu Gothic UI",sans-serif';
  c.fillText('300g', 62, 360);
  // 輪郭(肩がすぼまった形)で切り抜く
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = '#000';
  c.beginPath();
  const rb = 30;
  c.moveTo(rb, H);
  c.lineTo(W - rb, H);
  c.quadraticCurveTo(W, H, W, H - rb);
  c.lineTo(W, 230);
  c.lineTo(W - 22, 66);
  c.quadraticCurveTo(W - 23, 0, W - 50, 0);
  c.lineTo(50, 0);
  c.quadraticCurveTo(23, 0, 22, 66);
  c.lineTo(0, 230);
  c.lineTo(0, H - rb);
  c.quadraticCurveTo(0, H, rb, H);
  c.closePath();
  c.fill();
  // 持ち手穴(小判型 66x24mm)をくり抜く。穴の縁は薄いフィルムの断面
  c.globalCompositeOperation = 'destination-out';
  const hx = 70.5, hy = 25.6, hcx = 128, hcy = 59.7;
  c.beginPath();
  c.moveTo(hcx - hx + hy, hcy - hy);
  c.lineTo(hcx + hx - hy, hcy - hy);
  c.arc(hcx + hx - hy, hcy, hy, -Math.PI / 2, Math.PI / 2);
  c.lineTo(hcx - hx + hy, hcy + hy);
  c.arc(hcx - hx + hy, hcy, hy, Math.PI / 2, Math.PI * 1.5);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
}
/** 袋 1 個分の見た目: [スキンメッシュ, ボーン x5]。ボーンは物理ボディの位置・回転に毎フレーム合わせる */
function riceBagVisual(white: boolean): THREE.Object3D[] {
  let tex = riceTex.get(white);
  if (!tex) {
    tex = canvasTex(256, 384, (c) => drawRiceLabel(c, white)).tex;
    riceTex.set(white, tex);
  }
  if (!creaseTex) {
    // ビニールのシワ(バンプ): ランダムな折れ線
    creaseTex = canvasTex(256, 384, (c) => {
      c.fillStyle = '#808080';
      c.fillRect(0, 0, 256, 384);
      for (let i = 0; i < 90; i++) {
        c.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)';
        c.lineWidth = 0.8 + Math.random() * 1.6;
        c.beginPath();
        let x = Math.random() * 256, y = Math.random() * 384;
        c.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (Math.random() - 0.5) * 70;
          y += (Math.random() - 0.5) * 70;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      // 上端の圧着(ヒートシール)のギザギザ
      for (let x = 0; x < 256; x += 4) {
        c.fillStyle = (x / 4) % 2 ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.6)';
        c.fillRect(x, 0, 2, 16);
      }
    }).tex;
    creaseTex.colorSpace = THREE.NoColorSpace;
  }
  let mats = riceMats.get(white);
  if (!mats) {
    // 同色の袋でマテリアルを共有(山積みで数十個になるので、描画負荷を抑える)。穴・輪郭はアルファで抜く
    mats = [
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: creaseTex, bumpScale: 1.4, roughness: white ? 0.28 : 0.8, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide }),
    ];
    riceMats.set(white, mats);
  }
  const bones = SEG_C.map((c) => {
    const b = new THREE.Bone();
    b.position.set(0, c, 0);
    b.updateMatrixWorld(true);
    return b;
  });
  const mesh = new THREE.SkinnedMesh(pouchGeo(), mats[0]);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false; // スキンで動くので、初期姿勢のバウンディングでのカリングを無効化
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  return [mesh, ...bones];
}
// ---- ポテトチップス BIG(空気入りのビニール袋) ----
// 寸法 .20 x .26 m。中央 .19m がふくらんだ本体(最大厚 7cm)、上下 3.5cm がぺらぺらの圧着ひれ
const CHIPS_C = [-0.115, 0, 0.115];
const chipsGeoCache = new Map<string, THREE.BufferGeometry>();
const chipsMat: THREE.Material[] = [];
let chipsCrease: THREE.CanvasTexture | null = null;
function chipsThickness(x: number, y: number, kz = 1) {
  const ay = Math.abs(y);
  if (ay >= 0.095) return 0.007;
  const t = 1 - ay / 0.095;
  const prof = Math.pow(Math.min(1, t * 2.2), 0.6);
  const edge = Math.max(0.12, 1 - Math.pow(Math.min(1, Math.abs(x) / 0.1), 3));
  return (0.007 + (0.072 - 0.007) * prof * kz) * edge;
}
/** ポテチ袋のメッシュ。拡大率 [幅, 高さ, 厚み](ひれの厚みは変えない) */
function chipsGeo(kx = 1, ky = 1, kz = 1) {
  const key = `${kx},${ky},${kz}`;
  const cached = chipsGeoCache.get(key);
  if (cached) return cached;
  const NX = 36, NY = 56, W = 0.2, H = 0.26;
  const cnt = (NX + 1) * (NY + 1);
  const pos = new Float32Array(cnt * 6), uv = new Float32Array(cnt * 4);
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, v = j / NY;
      const x = (u - 0.5) * W, y = (v - 0.5) * H;
      const hz = chipsThickness(x, y, kz) / 2;
      const k = j * (NX + 1) + i;
      pos.set([x, y, hz], k * 3);
      pos.set([x, y, -hz], (cnt + k) * 3);
      uv.set([u, v], k * 2);
      uv.set([1 - u, v], (cnt + k) * 2);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
      idx.push(cnt + a, cnt + d, cnt + b, cnt + a, cnt + c, cnt + d);
    }
  }
  // 左右の縁(圧着部)を閉じる
  for (let j = 0; j < NY; j++) {
    for (const i of [0, NX]) {
      const a = j * (NX + 1) + i, c = a + NX + 1;
      idx.push(a, c, cnt + c, a, cnt + c, cnt + a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const n = cnt * 2;
  const si = new Uint16Array(n * 4), wt = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = pos[i * 3 + 1];
    // 本体の両端(±0.095)で、ひれのボーンから本体のボーンへ切り替える
    if (y <= -0.095) { si[i * 4] = 0; wt[i * 4] = 1; }
    else if (y >= 0.095) { si[i * 4] = 2; wt[i * 4] = 1; }
    else if (y < 0) { const t = (y + 0.095) / 0.095; si[i * 4] = 0; wt[i * 4] = Math.max(0, 1 - t * 4); si[i * 4 + 1] = 1; wt[i * 4 + 1] = 1 - wt[i * 4]; }
    else { const t = (0.095 - y) / 0.095; si[i * 4] = 2; wt[i * 4] = Math.max(0, 1 - t * 4); si[i * 4 + 1] = 1; wt[i * 4 + 1] = 1 - wt[i * 4]; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wt, 4));
  if (kx !== 1 || ky !== 1) geo.scale(kx, ky, 1); // スキン用の重みは拡大前の座標で決めてある
  geo.computeVertexNormals();
  chipsGeoCache.set(key, geo);
  return geo;
}
/** 白黒パッケージ(インク不足で 2 色印刷になった袋)の 4 倍サイズ版 */
function drawMonoChipsLabel(c: CanvasRenderingContext2D) {
  const W = 320, H = 416;
  c.fillStyle = '#f4f4f2';
  c.fillRect(0, 0, W, H);
  const fin = Math.round((0.035 / 0.26) * H);
  for (const y0 of [0, H - fin]) {
    const fg = c.createLinearGradient(0, y0, W, y0);
    fg.addColorStop(0, '#cfd1d6');
    fg.addColorStop(0.5, '#f1f2f5');
    fg.addColorStop(1, '#bfc2c9');
    c.fillStyle = fg;
    c.fillRect(0, y0, W, fin);
  }
  c.fillStyle = '#111';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '900 40px "Yu Gothic UI","Hiragino Sans",sans-serif';
  c.fillText('ポテトチップズ', W / 2, 92);
  c.lineWidth = 8;
  c.strokeStyle = '#111';
  c.beginPath();
  c.ellipse(W / 2, 200, 118, 62, -0.06, 0, 7);
  c.stroke();
  c.font = '900 76px "Arial Black","Yu Gothic UI",sans-serif';
  c.fillText('4倍', W / 2, 196);
  c.font = '900 44px "Yu Gothic UI",sans-serif';
  c.fillText('うすしお味', W / 2, 308);
  c.font = '700 20px "Yu Gothic UI",sans-serif';
  c.fillText('内容量 680g(170g x 4)', W / 2, 352);
  c.font = '600 14px "Yu Gothic UI",sans-serif';
  c.fillText('※ 白黒2色パッケージ', W / 2, 376);
}
function drawChipsLabel(c: CanvasRenderingContext2D, variant: number) {
  if (variant === 3) { drawMonoChipsLabel(c); return; }
  const W = 320, H = 416;
  const pal = [
    ['#ffd84a', '#f2a400', '#8a4b00', 'うす塩味'],
    ['#37b36a', '#14703c', '#0b3d21', 'のりしお味'],
    ['#ef4a56', '#b3161f', '#5e0a10', 'コンソメ味'],
  ][variant];
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal[0]);
  g.addColorStop(1, pal[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // 上下の圧着ひれ(銀色の裏地が見える)
  const fin = Math.round((0.035 / 0.26) * H);
  for (const y0 of [0, H - fin]) {
    const fg = c.createLinearGradient(0, y0, W, y0);
    fg.addColorStop(0, '#d9dbe0');
    fg.addColorStop(0.5, '#f4f5f8');
    fg.addColorStop(1, '#c9ccd3');
    c.fillStyle = fg;
    c.fillRect(0, y0, W, fin);
  }
  // 背景のポテトスライス
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * W, y = fin + 20 + Math.random() * (H - 2 * fin - 40), r = 16 + Math.random() * 22;
    const rg = c.createRadialGradient(x - 4, y - 4, 2, x, y, r);
    rg.addColorStop(0, 'rgba(255,238,170,.95)');
    rg.addColorStop(1, 'rgba(235,170,60,.9)');
    c.fillStyle = rg;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.8, Math.random() * 3, 0, 7);
    c.fill();
  }
  // タイトル
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.font = '900 44px "Yu Gothic UI","Hiragino Sans",sans-serif';
  c.lineWidth = 9;
  c.strokeStyle = pal[2];
  c.strokeText('ポテトチップズ', W / 2, 98);
  c.fillStyle = '#fff';
  c.fillText('ポテトチップズ', W / 2, 98);
  // BIG 爆発マーク
  c.save();
  c.translate(W / 2, 208);
  c.rotate(-0.08);
  c.fillStyle = '#ffe14a';
  c.strokeStyle = '#c4161c';
  c.lineWidth = 7;
  c.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, rr = i % 2 ? 78 : 100;
    c.lineTo(Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.78);
  }
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = '#c4161c';
  c.font = '900 84px "Arial Black","Yu Gothic UI",sans-serif';
  c.fillText('BIG', 0, 4);
  c.restore();
  // 味
  c.fillStyle = '#fff';
  c.strokeStyle = pal[2];
  c.lineWidth = 8;
  c.font = '900 40px "Yu Gothic UI",sans-serif';
  c.strokeText(pal[3], W / 2, 318);
  c.fillText(pal[3], W / 2, 318);
  c.fillStyle = '#fff';
  c.font = '700 20px "Yu Gothic UI",sans-serif';
  c.fillText('内容量 170g', W / 2, 360);
}
function chipsBagVisual(variant: number): THREE.Object3D[] {
  if (!chipsMat[variant]) {
    const tex = canvasTex(320, 416, (c) => drawChipsLabel(c, variant)).tex;
    if (!chipsCrease) {
      chipsCrease = canvasTex(256, 336, (c) => {
        c.fillStyle = '#808080';
        c.fillRect(0, 0, 256, 336);
        for (let i = 0; i < 70; i++) {
          c.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.4)';
          c.lineWidth = 0.8 + Math.random() * 1.4;
          c.beginPath();
          let x = Math.random() * 256, y = Math.random() * 336;
          c.moveTo(x, y);
          for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; c.lineTo(x, y); }
          c.stroke();
        }
        // 上下のひれの圧着ギザギザ(縦の細かい線)
        for (const y0 of [0, 336 - 45]) for (let x = 0; x < 256; x += 3) {
          c.fillStyle = (x / 3) % 2 ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.7)';
          c.fillRect(x, y0, 1.6, 45);
        }
      }).tex;
      chipsCrease.colorSpace = THREE.NoColorSpace;
    }
    chipsMat[variant] = new THREE.MeshStandardMaterial({ map: tex, bumpMap: chipsCrease, bumpScale: 1.2, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide });
  }
  const [kx, ky, kz] = variant === 3 ? CHIPS_XL : [1, 1, 1];
  const bones = CHIPS_C.map((c) => {
    const b = new THREE.Bone();
    b.position.set(0, c * ky, 0);
    b.updateMatrixWorld(true);
    return b;
  });
  const mesh = new THREE.SkinnedMesh(chipsGeo(kx, ky, kz), chipsMat[variant]);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(new THREE.Skeleton(bones), new THREE.Matrix4());
  return [mesh, ...bones];
}
// ---- グラフィックスカード(GeForce RTX) ----
// 参考: NVIDIA 公式の製品画像(FE のガンメタ筐体 / 黒背景に NVIDIA グリーンのリボン / 「GEFORCE RTX」の発光文字)の印象を、独自に描き起こした表現
const GREEN = '#76b900';
function gpuTex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  let t = gpuTexCache.get(key);
  if (!t) {
    t = canvasTex(w, h, draw).tex;
    gpuTexCache.set(key, t);
  }
  return t;
}
const gpuTexCache = new Map<string, THREE.CanvasTexture>();
function drawCardSilhouette(c: CanvasRenderingContext2D, m: GpuModel, cx: number, cy: number, sc: number, rot: number) {
  c.save();
  c.translate(cx, cy);
  c.rotate(rot);
  c.scale(sc, sc);
  const g = c.createLinearGradient(0, -48, 0, 48);
  g.addColorStop(0, '#8a8e95');
  g.addColorStop(0.15, m.shroud);
  g.addColorStop(1, '#15171a');
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-120, -48, 240, 96, 12);
  c.fill();
  const { xs, r } = fanLayout(m.fans);
  for (const fx of xs) {
    const px = (fx / 0.105) * 112, pr = (r / 0.105) * 112 * 1.15;
    c.fillStyle = '#0a0b0c';
    c.beginPath();
    c.arc(px, 0, pr, 0, 7);
    c.fill();
    c.strokeStyle = '#3c3f45';
    c.lineWidth = 2.2;
    for (let k = 0; k < BLADES; k++) {
      const a = (k / BLADES) * Math.PI * 2;
      c.beginPath();
      c.moveTo(px + Math.cos(a) * pr * 0.2, Math.sin(a) * pr * 0.2);
      c.quadraticCurveTo(px + Math.cos(a + 0.5) * pr * 0.6, Math.sin(a + 0.5) * pr * 0.6, px + Math.cos(a + 0.9) * pr * 0.92, Math.sin(a + 0.9) * pr * 0.92);
      c.stroke();
    }
  }
  if (m.fe) {
    c.strokeStyle = '#b9bdc4';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-60, -46);
    c.lineTo(60, 46);
    c.moveTo(60, -46);
    c.lineTo(-60, 46);
    c.stroke();
  }
  c.fillStyle = GREEN;
  c.fillRect(-100, 40, 200, 3);
  c.restore();
}
function gpuBoxMats(m: GpuModel): THREE.Material[] {
  const front = gpuTex('front' + m.name, 512, 282, (c) => {
    const W = 512, H = 282;
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#030405');
    bg.addColorStop(1, '#10151a');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    // NVIDIA グリーンの流れるリボン
    for (let i = 0; i < 48; i++) {
      c.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = H * 0.7 + Math.sin(x * 0.011 + i * 0.33) * 36 + i * 3.6 - 48 + Math.sin(x * 0.034 + i) * 5;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(118,185,0,${0.12 + (i / 48) * 0.7})`;
      c.lineWidth = 2.4;
      c.stroke();
    }
    drawCardSilhouette(c, m, 372, 146, 0.95, -0.2);
    c.fillStyle = '#fff';
    c.font = '800 20px "Yu Gothic UI",Arial,sans-serif';
    c.fillText('NVIDEA', 26, 40);
    c.fillStyle = GREEN;
    c.fillRect(26, 48, 62, 4);
    c.fillStyle = '#fff';
    c.font = '700 18px Arial,sans-serif';
    c.fillText('G E F O R C E', 26, 92);
    c.fillStyle = GREEN;
    c.font = '900 56px Arial,sans-serif';
    c.fillText('RTZ', 26, 146);
    if (m.suffix) {
      c.fillStyle = '#fff';
      c.font = '800 28px Arial,sans-serif';
      c.fillText(m.suffix, 128, 146);
    }
    c.fillStyle = '#fff';
    c.font = '900 104px Arial,sans-serif';
    c.shadowColor = GREEN;
    c.shadowBlur = 14;
    c.fillText(m.num, 22, 236);
    c.shadowBlur = 0;
    c.fillStyle = '#c9ced6';
    c.font = '700 16px Arial,sans-serif';
    c.fillText(m.vram, 28, 268);
    c.textAlign = 'right';
    c.fillStyle = '#8f959e';
    c.font = '600 13px Arial,sans-serif';
    c.fillText(m.arch.toUpperCase(), W - 20, 270);
    c.textAlign = 'left';
    c.strokeStyle = GREEN;
    c.lineWidth = 4;
    c.strokeRect(2, 2, W - 4, H - 4);
  });
  const side = gpuTex('side' + m.name, 512, 112, (c) => {
    c.fillStyle = '#050607';
    c.fillRect(0, 0, 512, 112);
    c.fillStyle = GREEN;
    c.fillRect(0, 0, 512, 10);
    c.fillStyle = '#fff';
    c.font = '800 34px Arial,sans-serif';
    c.fillText(GPU_BRAND_UP + ' RTZ ' + m.num + (m.suffix ? ' ' + m.suffix : ''), 20, 66);
    c.fillStyle = '#8f959e';
    c.font = '600 16px Arial,sans-serif';
    c.fillText(m.vram + '  |  ' + m.arch, 20, 96);
  });
  const end = gpuTex('end' + m.name, 264, 112, (c) => {
    c.fillStyle = '#050607';
    c.fillRect(0, 0, 264, 112);
    c.fillStyle = GREEN;
    c.fillRect(0, 0, 264, 10);
    c.fillStyle = '#fff';
    c.font = '900 40px Arial,sans-serif';
    c.fillText(m.num, 20, 72);
    c.fillStyle = GREEN;
    c.font = '800 24px Arial,sans-serif';
    c.fillText('RTZ', 150, 72);
  });
  const mat = (t: THREE.Texture) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 });
  const dark = std('#0a0b0c', 0.6);
  return [mat(end), mat(end), mat(front), dark, mat(side), mat(side)];
}
function gpuBoxVisual(p: Prize): THREE.Object3D[] {
  const m = GPU_MODELS[p.variant % GPU_MODELS.length];
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.065, 0.132), gpuBoxMats(m));
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return [g];
}
const gpuShared = {
  rim: new THREE.TorusGeometry(1, 0.06, 8, 36),
  hub: new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16),
  blade: new THREE.BoxGeometry(0.017, 0.0012, 0.011),
  bladeMat: new THREE.MeshStandardMaterial({ color: '#2e3136', roughness: 0.4, metalness: 0.25 }),
  pit: std('#0c0d0f', 0.7),
  metal: std('#c9ccd2', 0.25, 0.9),
  gold: std('#d4af37', 0.3, 0.9),
  black: std('#08090a', 0.5),
};
const shroudMats = new Map<string, THREE.Material>();
function gpuCardVisual(p: Prize): THREE.Object3D[] {
  const m = GPU_MODELS[p.variant % GPU_MODELS.length];
  let shroud = shroudMats.get(m.shroud);
  if (!shroud) {
    shroud = new THREE.MeshStandardMaterial({ color: m.shroud, roughness: 0.32, metalness: 0.7 });
    shroudMats.set(m.shroud, shroud);
  }
  const root = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.1), [shroud, shroud, gpuShared.pit, gpuShared.black, shroud, shroud]);
  slab.position.y = 0.01;
  slab.castShadow = slab.receiveShadow = true;
  root.add(slab);
  for (const sz of [-1, 1]) mkMesh(new THREE.BoxGeometry(0.21, 0.02, 0.012), shroud, root, 0, 0.03, sz * 0.044);
  for (const [a, b] of shroudSegments(m.fans)) mkMesh(new THREE.BoxGeometry(b - a, 0.02, 0.076), shroud, root, (a + b) / 2, 0.03, 0);
  const { xs, r } = fanLayout(m.fans);
  const blades: THREE.Object3D[] = [];
  const fanGroups: THREE.Group[] = [];
  xs.forEach((fx) => {
    const fg = new THREE.Group();
    fg.position.set(fx, 0.0215, 0);
    root.add(fg);
    fanGroups.push(fg);
    const rim = mkMesh(gpuShared.rim, gpuShared.bladeMat, fg, 0, 0.004, 0);
    rim.scale.set(r, r, r);
    rim.rotation.x = Math.PI / 2;
    mkMesh(gpuShared.hub, gpuShared.black, fg, 0, 0.003, 0);
    for (let k = 0; k < BLADES; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / BLADES) * Math.PI * 2;
      fg.add(pivot);
      const bl = mkMesh(gpuShared.blade, gpuShared.bladeMat, pivot, r * 0.6, 0.006, 0);
      bl.scale.x = r / 0.03;
      bl.rotation.x = 0.45;
      bl.rotation.y = 0.35;
      blades.push(bl);
    }
  });
  mkMesh(new THREE.BoxGeometry(0.076, 0.0012, 0.012), gpuShared.gold, root, 0.025, 0.0006, 0.056); // PCIe 端子
  mkMesh(new THREE.BoxGeometry(0.003, 0.04, 0.12), gpuShared.metal, root, -0.1085, 0.02, 0); // IO ブラケット
  for (const pz of [-0.036, -0.012, 0.012]) mkMesh(new THREE.BoxGeometry(0.001, 0.006, 0.015), gpuShared.black, root, -0.1103, 0.014, pz); // DP
  mkMesh(new THREE.BoxGeometry(0.001, 0.006, 0.02), gpuShared.black, root, -0.1103, 0.014, 0.04); // HDMI
  // 「GEFORCE RTX」の発光ロゴ(手前の縁)
  const logo = gpuTex('logo' + m.name, 256, 32, (c) => {
    c.fillStyle = '#0b0c0e';
    c.fillRect(0, 0, 256, 32);
    c.fillStyle = '#fff';
    c.font = '800 22px Arial,sans-serif';
    c.fillText(GPU_BRAND_UP + ' RTZ', 12, 24);
    c.fillStyle = GREEN;
    c.fillText(m.num, 160, 24);
  });
  const lg = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0125), new THREE.MeshStandardMaterial({ map: logo, emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.8 }));
  lg.position.set(0, 0.03, 0.0502);
  root.add(lg);
  root.userData = { blades, fanGroups };
  return [root];
}
function animateGpu(p: Prize, root: THREE.Object3D) {
  const ud = root.userData as { blades?: THREE.Object3D[]; fanGroups?: THREE.Group[] };
  if (!ud.blades || !p.blades) return;
  for (let i = 0; i < ud.blades.length; i++) ud.blades[i].visible = p.blades[i] !== false;
  for (let f = 0; f < (ud.fanGroups?.length ?? 0); f++) ud.fanGroups![f].rotation.y = (p.spin ?? 0) * (f % 2 ? 1 : 1);
}
// 折れて飛んだファンの羽(破片)
const debrisVis = new Map<number, THREE.Mesh>();
const debrisGeo = new THREE.BoxGeometry(0.024, 0.005, 0.01);
function syncDebris() {
  const live = new Set<number>();
  for (const d of sim.debris) {
    live.add(d.id);
    let m = debrisVis.get(d.id);
    if (!m) {
      m = new THREE.Mesh(debrisGeo, gpuShared.bladeMat);
      m.castShadow = true;
      scene.add(m);
      debrisVis.set(d.id, m);
    }
    const t = d.body.translation(), q = d.body.rotation();
    m.position.set(t.x, t.y, t.z);
    m.quaternion.set(q.x, q.y, q.z, q.w);
  }
  for (const [id, m] of debrisVis) if (!live.has(id)) { scene.remove(m); debrisVis.delete(id); }
}
let totalYen = 0;
let lastSnapToast = 0;

// ---- 生き物(カニ・タラバガニ・ホタテ) ----
const cGeo = {
  body: new THREE.SphereGeometry(1, 18, 12),
  eye: new THREE.SphereGeometry(0.005, 8, 6),
  stalk: new THREE.CylinderGeometry(0.0028, 0.0028, 0.012, 6),
  seg: new THREE.CylinderGeometry(0.0035, 0.0028, 1, 6),
  arm: new THREE.BoxGeometry(0.011, 0.011, 0.035),
  jaw: new THREE.BoxGeometry(0.008, 0.007, 0.026),
  spike: new THREE.ConeGeometry(0.004, 0.012, 6),
  hemi: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
};
function crabVisual(p: Prize, king: boolean): THREE.Object3D[] {
  const col = king ? '#c23b2a' : p.variant === 0 ? '#e4502f' : '#7a432e';
  const shell = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42 });
  const belly = new THREE.MeshStandardMaterial({ color: king ? '#f3d9c6' : '#ebcfae', roughness: 0.6 });
  const black = std('#101010', 0.3);
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(king ? 1.7 : 1);
  root.add(g);
  const body = mkMesh(cGeo.body, shell, g, 0, 0.022, 0);
  body.scale.set(0.05, 0.02, 0.036);
  const bl = mkMesh(cGeo.body, belly, g, 0, 0.012, 0);
  bl.scale.set(0.046, 0.012, 0.033);
  for (const sx of [-1, 1]) {
    mkMesh(cGeo.stalk, shell, g, sx * 0.014, 0.044, 0.03);
    mkMesh(cGeo.eye, black, g, sx * 0.014, 0.052, 0.03);
  }
  if (king) for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.8;
    const sp = mkMesh(cGeo.spike, shell, g, Math.cos(a) * 0.04 * r, 0.04 - r * 0.012, Math.sin(a) * 0.028 * r);
    sp.scale.setScalar(1.2);
  }
  const claws: Array<{ pivot: THREE.Group; jawA: THREE.Group; jawB: THREE.Group; side: number }> = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.05, 0.024, 0.032);
    g.add(pivot);
    mkMesh(cGeo.arm, shell, pivot, 0, 0, 0.0175);
    const jawA = new THREE.Group(), jawB = new THREE.Group();
    jawA.position.set(0.004, 0, 0.035);
    jawB.position.set(-0.004, 0, 0.035);
    pivot.add(jawA, jawB);
    mkMesh(cGeo.jaw, shell, jawA, 0, 0, 0.013);
    mkMesh(cGeo.jaw, shell, jawB, 0, 0, 0.013);
    claws.push({ pivot, jawA, jawB, side });
  }
  const legs: Array<{ pivot: THREE.Group; g1: THREE.Group; i: number; side: number; base: number }> = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.045, 0.022, -0.022 + i * 0.014);
      pivot.scale.x = side;
      g.add(pivot);
      const g1 = new THREE.Group();
      const base = -(Math.PI / 2 - 0.6);
      g1.rotation.z = base;
      pivot.add(g1);
      const s1 = mkMesh(cGeo.seg, shell, g1, 0, 0.02, 0);
      s1.scale.y = 0.04;
      const g2 = new THREE.Group();
      g2.position.y = 0.04;
      g2.rotation.z = -1.43;
      g1.add(g2);
      const s2 = mkMesh(cGeo.seg, shell, g2, 0, 0.025, 0);
      s2.scale.y = 0.05;
      legs.push({ pivot, g1, i, side, base });
    }
  }
  root.userData = { legs, claws };
  scene.add(root);
  return [root];
}
const shellTex: THREE.CanvasTexture[] = [];
function scallopVisual(p: Prize): THREE.Object3D[] {
  const v = p.variant % 2;
  if (!shellTex[v]) {
    shellTex[v] = canvasTex(256, 128, (c) => {
      const base = v === 0 ? [236, 150, 76] : [236, 150, 160];
      for (let i = 0; i < 24; i++) {
        const k = 0.78 + 0.22 * Math.sin((i / 24) * Math.PI * 2 * 3);
        c.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
        c.fillRect((i / 24) * 256, 0, 256 / 24 + 1, 128);
      }
      c.strokeStyle = 'rgba(90,40,10,.25)';
      c.lineWidth = 1.5;
      for (let y = 10; y < 128; y += 11) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); } // 成長線
    }).tex;
    shellTex[v].wrapS = THREE.RepeatWrapping;
  }
  const mat = new THREE.MeshStandardMaterial({ map: shellTex[v], bumpMap: shellTex[v], bumpScale: 2, roughness: 0.55 });
  const root = new THREE.Group();
  const lower = mkMesh(cGeo.hemi, mat, root, 0, 0.014, 0);
  lower.scale.set(0.052, 0.014, 0.05);
  lower.rotation.x = Math.PI;
  const mantle = mkMesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 24), std('#f4a3a0', 0.7), root, 0, 0.014, 0);
  void mantle;
  mkMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16), std('#ffe3c4', 0.6), root, 0, 0.017, -0.004);
  for (let i = 0; i < 9; i++) mkMesh(cGeo.eye, std('#101010', 0.3), root, -0.036 + i * 0.009, 0.0165, 0.044 - Math.abs(i - 4) * 0.002);
  const upper = new THREE.Group();
  upper.position.set(0, 0.016, -0.048);
  root.add(upper);
  const top = mkMesh(cGeo.hemi, mat, upper, 0, 0, 0.048);
  top.scale.set(0.052, 0.014, 0.05);
  root.userData = { upper };
  scene.add(root);
  return [root];
}
const _clock0 = performance.now();
function animateCreature(p: Prize, root: THREE.Object3D) {
  const a = p.anim;
  if (!a) return;
  const ud = root.userData as { upper?: THREE.Group; legs?: Array<{ pivot: THREE.Group; g1: THREE.Group; i: number; side: number; base: number }>; claws?: Array<{ pivot: THREE.Group; jawA: THREE.Group; jawB: THREE.Group; side: number }> };
  if (ud.upper) {
    ud.upper.rotation.x = -a.open;
    return;
  }
  const t = (performance.now() - _clock0) / 1000;
  const wlk = Math.min(1, a.walk);
  for (const l of ud.legs ?? []) {
    const ph = a.phase + l.i * 1.6 + (l.side > 0 ? 0 : Math.PI);
    l.pivot.rotation.y = Math.sin(ph) * 0.4 * wlk;
    l.g1.rotation.z = l.base + Math.max(0, Math.cos(ph)) * 0.25 * wlk;
  }
  for (const c of ud.claws ?? []) {
    const w = a.claw;
    c.pivot.rotation.x = -0.3 - 0.35 * w * (0.5 + 0.5 * Math.sin(t * 5 + c.side));
    c.pivot.rotation.y = c.side * (0.25 + 0.3 * w * Math.sin(t * 6));
    const open = 0.1 + 0.45 * w * (0.5 + 0.5 * Math.sin(t * 9 + c.side)) + 0.05 * Math.sin(t * 1.3 + c.side);
    c.jawA.rotation.y = open;
    c.jawB.rotation.y = -open;
  }
}

// ---- 地形(段差・坂・岩場) ----
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);
const sandTex = canvasTex(256, 256, (c) => {
  c.fillStyle = '#d9c28c';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(255,240,200,.35)' : 'rgba(120,90,50,.25)';
    c.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
}).tex;
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
sandTex.repeat.set(3, 3);
const sandMat = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95 });
const rockMat = std('#7e8895', 0.9);
function buildTerrainVisual() {
  for (const ch of [...terrainGroup.children]) {
    terrainGroup.remove(ch);
    (ch as THREE.Mesh).geometry?.dispose();
  }
  const k = sim.terrain;
  if (k === 'flat') return;
  if (k === 'steps') {
    box(1.0, 0.12, 0.35, sandMat, 0, 0.06, -0.325, terrainGroup);
    box(1.0, 0.06, 0.3, sandMat, 0, 0.03, 0, terrainGroup);
  } else {
    const geo = new THREE.PlaneGeometry(1, 1, 40, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, x >= 0.25 && z >= 0.25 ? -0.05 : terrainHeightAt(k, x, z) + 0.001);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, sandMat);
    m.receiveShadow = true;
    terrainGroup.add(m);
  }
  for (const r of sim.rocks) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r.r, 1), rockMat);
    m.scale.set(1.1, 0.85, 1);
    m.position.set(r.x, terrainHeightAt('rocks', r.x, r.z) + r.r * 0.45, r.z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    m.castShadow = m.receiveShadow = true;
    terrainGroup.add(m);
  }
}

// ---- 水 ----
const waterGroup = new THREE.Group();
scene.add(waterGroup);
const WN = 36;
const surfGeo = new THREE.PlaneGeometry(0.98, 0.98, WN, WN);
surfGeo.rotateX(-Math.PI / 2);
const surfBase = Float32Array.from(surfGeo.attributes.position.array);
const surf = new THREE.Mesh(surfGeo, new THREE.MeshPhysicalMaterial({ color: '#7fd6f0', transparent: true, opacity: 0.45, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }));
const vol = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1, 0.98), new THREE.MeshPhysicalMaterial({ color: '#2a9fd0', transparent: true, opacity: 0.2, roughness: 0.1, depthWrite: false, side: THREE.BackSide }));
surf.renderOrder = 3;
vol.renderOrder = 2;
const BUB = 70;
const bubGeo = new THREE.BufferGeometry();
const bubPos = new Float32Array(BUB * 3);
for (let i = 0; i < BUB; i++) bubPos.set([(Math.random() - 0.5) * 0.9, Math.random() * 0.3, (Math.random() - 0.5) * 0.9], i * 3);
bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.009, transparent: true, opacity: 0.7, depthWrite: false }));
waterGroup.add(vol, surf, bubbles);
function updateWater(t: number, dt: number) {
  const L = sim.waterLevel;
  waterGroup.visible = L !== null;
  if (L === null) return;
  vol.scale.y = L;
  vol.position.y = L / 2;
  surf.position.y = L;
  const pa = surfGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = surfBase[i * 3], z = surfBase[i * 3 + 2];
    pa.setY(i, 0.0035 * Math.sin(x * 22 + t * 2.1) + 0.003 * Math.sin(z * 17 - t * 1.7));
  }
  pa.needsUpdate = true;
  for (let i = 0; i < BUB; i++) {
    let y = bubPos[i * 3 + 1] + dt * (0.04 + (i % 5) * 0.012);
    if (y > L) y = 0.005;
    bubPos[i * 3 + 1] = y;
    bubPos[i * 3] += Math.sin(t * 2 + i) * dt * 0.01;
  }
  bubGeo.attributes.position.needsUpdate = true;
}
const prizeVisuals = new Map<number, THREE.Object3D[]>();

// ---------- 3D control panel ----------
const buttons: Array<{ cap: THREE.Mesh; action: string; base: number }> = [];
const PANEL_Y = -0.12;
function makeButton(x: number, z: number, color: string, glyph: string, action: string, r = 0.036) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.012, 0.012, 28), std('#bbbbd0', 0.3, 0.8));
  base.position.set(x, PANEL_Y + 0.006, z);
  scene.add(base);
  const tex = canvasTex(128, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.font = '900 ' + (glyph.length > 2 ? 34 : 84) + 'px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(glyph, 64, 68);
  }).tex;
  const top = [std(color, 0.25, 0, { emissive: color, emissiveIntensity: 0.25 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, emissive: color, emissiveIntensity: 0.12 }), std(color, 0.25)];
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.026, 28), top);
  cap.position.set(x, PANEL_Y + 0.025, z);
  cap.castShadow = true;
  cap.userData.action = action;
  scene.add(cap);
  buttons.push({ cap, action, base: PANEL_Y + 0.025 });
}
makeButton(-0.38, 0.8, '#2e8bff', '←', 'left');
makeButton(-0.22, 0.8, '#2e8bff', '→', 'right');
makeButton(-0.3, 0.72, '#2ec27e', '↑', 'back');
makeButton(-0.3, 0.88, '#2ec27e', '↓', 'front');
makeButton(0.05, 0.8, '#ff2d4d', 'DROP', 'drop', 0.058);
// コイン投入口
const coinPlate = canvasTex(256, 256, (g) => {
  g.fillStyle = '#ffd84a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3a2000';
  g.font = '900 70px sans-serif';
  g.textAlign = 'center';
  g.fillText('100円', 128, 90);
  g.font = '700 30px sans-serif';
  g.fillText('COIN', 128, 210);
  g.fillStyle = '#3a2000';
  g.fillRect(100, 110, 56, 70);
}).tex;
const slotPlate = new THREE.Mesh(
  new THREE.BoxGeometry(0.13, 0.012, 0.13),
  [std('#ffd84a'), std('#ffd84a'), new THREE.MeshStandardMaterial({ map: coinPlate, emissive: '#ffcc33', emissiveMap: coinPlate, emissiveIntensity: 0.25, roughness: 0.4 }), std('#ffd84a'), std('#ffd84a'), std('#ffd84a')],
);
slotPlate.position.set(0.36, PANEL_Y + 0.006, 0.8);
slotPlate.userData.action = 'coin';
scene.add(slotPlate);
const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 24), std('#ffe27a', 0.25, 0.9));
coinMesh.rotation.z = Math.PI / 2;
coinMesh.visible = false;
scene.add(coinMesh);
let coinAnim = -1;
// 液晶(クレジット・タイマー)
const lcd = canvasTex(512, 256, (g) => { g.fillStyle = '#021'; g.fillRect(0, 0, 512, 256); });
const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: lcd.tex, toneMapped: false }));
lcdMesh.position.set(0.05, -0.112, 0.655);
lcdMesh.rotation.x = -1.25;
scene.add(lcdMesh);
let lcdKey = '';
function drawLcd(txt1: string, txt2: string) {
  const k = txt1 + txt2;
  if (k === lcdKey) return;
  lcdKey = k;
  const g = lcd.g;
  g.fillStyle = '#031a12';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#5dffb0';
  g.font = '900 78px monospace';
  g.textAlign = 'center';
  g.fillText(txt1, 256, 100);
  g.font = '900 60px monospace';
  g.fillText(txt2, 256, 195);
  lcd.tex.needsUpdate = true;
}

// ---------- input ----------
const audio = new GameAudio();
audioRef = audio;
const pressed = new Set<string>();
let dropPulse = false;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitTargets: THREE.Object3D[] = [...buttons.map((b) => b.cap), slotPlate];
function pick(ev: PointerEvent): string | null {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitTargets, false)[0];
  return hit ? (hit.object.userData.action as string) : null;
}
let wallet = 2000;
function pressAction(a: string) {
  audio.click();
  if (a === 'drop') dropPulse = true;
  else if (a === 'coin') tryCoin();
  else pressed.add(a);
}
function tryCoin() {
  if (sim.state !== 'idle') { toast('プレイ中です', ''); return; }
  if (wallet < 100) { toast('所持金が足りません', ''); return; }
  wallet -= 100;
  sim.insertCoin();
  coinAnim = 0;
  audio.coin();
  hideToast();
}
let capturedAction: string | null = null;
canvas.addEventListener('pointerdown', (ev) => {
  audio.start();
  const a = pick(ev);
  if (a) {
    controls.enabled = false;
    capturedAction = a;
    pressAction(a);
    canvas.setPointerCapture(ev.pointerId);
  }
});
const release = () => {
  if (capturedAction) pressed.delete(capturedAction);
  capturedAction = null;
  controls.enabled = true;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointermove', (ev) => {
  if (ev.buttons === 0) canvas.style.cursor = pick(ev) ? 'pointer' : 'grab';
});
const KEYS: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'back', w: 'back', ArrowDown: 'front', s: 'front' };
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
  if (k) { audio.start(); pressed.add(k); e.preventDefault(); }
  else if (e.key === ' ') { audio.start(); dropPulse = true; audio.click(); e.preventDefault(); }
  else if (e.key.toLowerCase() === 'c') { audio.start(); tryCoin(); }
});
addEventListener('keyup', (e) => {
  const k = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
  if (k) pressed.delete(k);
});
/** 重い景品再生成の前に「準備中」を表示して UI を一度描画させる(固まって見えるのを防ぐ) */
function deferRefill(fn: () => void) {
  toast('景品を準備中…', '', 4000);
  setTimeout(() => { fn(); hideToast(); }, 30);
}
function setGenre(id: string) {
  const g = GENRES.find((x) => x.id === id);
  if (!g || g === genre) return;
  if (sim.state !== 'idle') { toast('プレイ終了後に切り替えられます', ''); return; }
  genre = g;
  sim.gripRange = g.gripRange;
  sim.yLow = g.yLow;
  sim.setClawMode(g.claw ?? 'claw');
  sim.towerLayout = g.layout === 'tower';
  sim.setStickyBars(!!g.bars);
  boxTexCache.clear();
  applyTheme();
  pileMode = g.pile;
  terrainKind = g.terrain ?? 'flat';
  waterOn = g.water !== undefined;
  syncLayoutBtn();
  syncGenreButtons();
  syncEnvButtons();
  deferRefill(() => { applyEnv(); sim.refill(planFor(g, pileMode), pileMode); toast(g.icon + ' ' + g.label, g.desc, 2600); });
  audio.click();
}
function syncGenreButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-genre]').forEach((b) => b.classList.toggle('on', b.dataset.genre === genre.id));
}
document.querySelectorAll<HTMLButtonElement>('[data-genre]').forEach((b) => b.addEventListener('click', () => { audio.start(); setGenre(b.dataset.genre!); }));
syncGenreButtons();
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view!)));
$('mute').addEventListener('click', () => {
  audio.start();
  audio.setMuted(!audio.muted);
  $('mute').textContent = audio.muted ? '🔇 音 OFF' : '🔊 音 ON';
});
$('refill').addEventListener('click', () => {
  if (sim.state !== 'idle') { toast('プレイ終了後に補充できます', ''); return; }
  if (genre.claw === 'stacker') { toast('スタッカー台は補充不要です', ''); return; }
  if (sim.prizes.length >= 60) { toast('景品がいっぱいです', ''); return; }
  // いまある景品はそのままに、構成の約 1/3(最低 4 個)を追加する
  const base = expandPlan(genre);
  const n = Math.min(60 - sim.prizes.length, Math.max(4, Math.round(base.length / 3)));
  audio.click();
  deferRefill(() => {
    const added = sim.addPrizes(base.sort(() => Math.random() - 0.5).slice(0, n));
    setTimeout(() => toast('景品を補充', `${added} 個追加(現在 ${sim.prizes.length} 個)`, 1800), 60); // deferRefill が toast を消した後に出す
  });
});
$('layout').addEventListener('click', () => {
  if (sim.state !== 'idle') { toast('プレイ終了後に切り替えられます', ''); return; }
  pileMode = !pileMode;
  syncLayoutBtn();
  deferRefill(() => sim.refill(planFor(genre, pileMode), pileMode));
  audio.click();
});
const TERRAINS: TerrainKind[] = ['flat', 'steps', 'slope', 'rocks'];
const TLABEL: Record<TerrainKind, string> = { flat: '平地', steps: '段差', slope: '坂', rocks: '岩場' };
function applyEnv() {
  sim.setTerrain(terrainKind);
  sim.setWater(waterOn ? (genre.water ?? 0.28) : null);
  buildTerrainVisual();
}
function syncEnvButtons() {
  $('terrain').textContent = '地形: ' + TLABEL[terrainKind];
  $('water').textContent = '水: ' + (waterOn ? 'あり' : 'なし');
}
$('terrain').addEventListener('click', () => {
  if (sim.state !== 'idle') { toast('プレイ終了後に切り替えられます', ''); return; }
  terrainKind = TERRAINS[(TERRAINS.indexOf(terrainKind) + 1) % TERRAINS.length];
  syncEnvButtons();
  deferRefill(() => { applyEnv(); sim.refill(planFor(genre, pileMode), pileMode); });
  audio.click();
});
$('water').addEventListener('click', () => {
  if (sim.state !== 'idle') { toast('プレイ終了後に切り替えられます', ''); return; }
  waterOn = !waterOn;
  syncEnvButtons();
  deferRefill(() => { applyEnv(); sim.refill(planFor(genre, pileMode), pileMode); });
  audio.click();
});
function syncLayoutBtn() {
  $('layout').textContent = pileMode ? '配置: 山積み' : '配置: 整列';
}
syncLayoutBtn();

// ---------- UI ----------
let toastTimer = 0;
function toast(big: string, small: string, ms = 2600) {
  const el = $('toast');
  el.innerHTML = big + (small ? `<small>${small}</small>` : '');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
}
function hideToast() {
  $('toast').classList.remove('show');
}

// ---------- main loop ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
let lastSec = -1;
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

function handleEvents() {
  let impacts = 0, scuttles = 0;
  for (const e of sim.events) {
    switch (e.type) {
      case 'impact':
        if (impacts++ < 3) audio.impact(e.mat, e.strength, e.x);
        break;
      case 'clawOpen': audio.clawWhir('open'); break;
      case 'clawClose': audio.clawWhir('close'); if (['rice', 'candy', 'chips', 'hook'].includes(genre.id)) audio.crinkle(genre.id === 'chips' ? 1 : 0.9, sim.hubPos.x); break;
      case 'lift': audio.clawWhir('lift'); if (['rice', 'candy', 'chips', 'hook'].includes(genre.id)) audio.crinkle(0.7, sim.hubPos.x); break;
      case 'bump': audio.bump(); break;
      case 'snap':
        audio.snap(e.n);
        if (performance.now() - lastSnapToast > 2500) { lastSnapToast = performance.now(); toast('パキッ! ファンの羽が折れた…', '', 1500); }
        break;
      case 'splash': audio.splash(e.strength, e.x); break;
      case 'clap': audio.clap(e.x); break;
      case 'scuttle': if (scuttles++ < 1) audio.scuttle(e.x); break;
      case 'release': audio.clawWhir('open'); break;
      case 'dropStart': audio.clawWhir('open'); break;
      case 'timeout': toast('タイムアップ!', ''); break;
      case 'win':
        audio.prizeDrop();
        audio.win();
        if (e.prize.type === 'gpubox' || e.prize.type === 'gpucard') {
          const m = GPU_MODELS[e.prize.variant % GPU_MODELS.length];
          const pr = GPU_PRICES[m.name];
          const broken = e.prize.blades ? e.prize.blades.filter((b) => !b).length : 0;
          totalYen += pr.yen;
          const bare = e.prize.type === 'gpucard';
          toast(
            'GET!',
            `${GPU_BRAND} ${gpuShowName(m.name)}${bare ? '(裸・ファン付き)' : '(箱入り)'}<br>現行価格 ¥${pr.yen.toLocaleString('ja-JP')}${pr.note ? '(' + pr.note + ')' : ''}${pr.rough ? ' ※参考値' : ''}` +
              (bare ? `<br><span style="font-size:18px">${broken ? `ファンの羽 ${broken}/${e.prize.blades!.length} 枚が折れている…` : 'ファンの羽は無傷!'}</span>` : '') +
              `<br><span style="font-size:14px;opacity:.8">${PRICE_SOURCE} ${PRICE_DATE} 時点・新品の目安</span>`,
            5200,
          );
        } else toast('GET!', prizeName(genre, e.prize.type, e.prize.variant), 3200);
        break;
      case 'miss': audio.miss(); toast('残念…', 'コインを入れてもう一度', 2200); break;
      default:
    }
  }
  sim.events.length = 0;
}

function frame() {
  const dt = clock.getDelta();
  const input: Input = {
    left: pressed.has('left'),
    right: pressed.has('right'),
    back: pressed.has('back'),
    front: pressed.has('front'),
    drop: dropPulse,
  };
  dropPulse = false;
  sim.advance(dt, input);
  handleEvents();

  // 景品の同期
  const alive = new Set<number>();
  for (const p of sim.prizes) {
    alive.add(p.id);
    let vis = prizeVisuals.get(p.id);
    if (!vis) { vis = buildPrizeVisual(p); prizeVisuals.set(p.id, vis); }
    const off = p.type === 'rice' || p.type === 'chips' ? 1 : 0; // 米袋は [メッシュ, ボーン...] の並び
    p.parts.forEach((pt, i) => {
      const t = pt.body.translation(), q = pt.body.rotation();
      vis![i + off].position.set(t.x, t.y, t.z);
      vis![i + off].quaternion.set(q.x, q.y, q.z, q.w);
    });
    if (p.anim) animateCreature(p, vis[0]);
    if (p.blades) animateGpu(p, vis[0]);
  }
  for (const [id, vis] of prizeVisuals) if (!alive.has(id)) { vis.forEach((o) => scene.remove(o)); prizeVisuals.delete(id); }

  // アーム
  const hp = { x: sim.hubPos.x + sim.bumpOff.x, y: sim.hubPos.y + sim.bumpOff.y, z: sim.hubPos.z + sim.bumpOff.z };
  hubMesh.position.set(hp.x, hp.y, hp.z);
  trolley.position.set(hp.x, 1.2, hp.z);
  rail.position.set(0, 1.2, hp.z);
  const top = 1.2, bot = hp.y + 0.025;
  cable.scale.y = top - bot;
  cable.position.set(hp.x, (top + bot) / 2, hp.z);
  const hookOn = sim.clawMode === 'hook';
  hookMesh.visible = hookOn;
  stickyGroup.visible = sim.stickyBars;
  for (const g of fingerGroups) g.visible = sim.clawMode === 'claw';
  hubMesh.rotation.z = sim.hubTilt;
  sim.fingers.forEach((f, i) => {
    const t = f.body.translation(), q = f.body.rotation();
    fingerGroups[i].position.set(t.x, t.y, t.z);
    fingerGroups[i].quaternion.set(q.x, q.y, q.z, q.w);
  });
  audio.setMotor(sim.moveVel, hp.x);
  updateWater(performance.now() / 1000, dt);
  syncDebris();

  // ボタンの押し込み・コイン
  for (const b of buttons) {
    const on = b.action === 'drop' ? false : pressed.has(b.action);
    b.cap.position.y += ((on ? b.base - 0.012 : b.base) - b.cap.position.y) * 0.5;
  }
  if (coinAnim >= 0) {
    coinAnim += dt;
    coinMesh.visible = true;
    const k = Math.min(1, coinAnim / 0.45);
    coinMesh.position.set(0.36, PANEL_Y + 0.07 - k * 0.075, 0.8);
    if (coinAnim > 0.45) { coinMesh.visible = false; coinAnim = -1; }
  }

  // HUD
  $('wallet').textContent = String(wallet);
  $('credit').textContent = sim.state === 'idle' ? '0' : '1';
  $('won').textContent = String(sim.won);
  if (totalYen > 0) { $('yenRow').style.display = ''; $('yen').textContent = totalYen.toLocaleString('ja-JP'); }
  const sec = Math.ceil(sim.timer);
  $('timerRow').style.visibility = sim.state === 'ready' ? 'visible' : 'hidden';
  $('timer').textContent = String(Math.max(0, sec));
  if (sim.state === 'ready' && sec !== lastSec && sec <= 5 && sec > 0) audio.warn();
  lastSec = sim.state === 'ready' ? sec : -1;
  if (sim.state === 'idle') drawLcd('INSERT', 'COIN ¥100');
  else if (sim.state === 'ready') drawLcd('GO!', 'TIME ' + String(Math.max(0, sec)).padStart(2, '0'));
  else drawLcd('PLAY', '...');

  // カメラ
  if (tween) {
    camera.position.lerp(tween.p, 1 - Math.pow(0.002, dt));
    controls.target.lerp(tween.t, 1 - Math.pow(0.002, dt));
    if (camera.position.distanceTo(tween.p) < 0.005) tween = null;
  }
  controls.update();
  void tmpQ; void tmpV;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
{
  const q = new URLSearchParams(location.search);
  if (q.get('genre')) setGenre(q.get('genre')!);
  if (q.get('terrain')) { terrainKind = q.get('terrain') as TerrainKind; applyEnv(); syncEnvButtons(); sim.refill(planFor(genre, pileMode), pileMode); }
  if (q.get('water') !== null) { waterOn = q.get('water') === '1'; applyEnv(); syncEnvButtons(); sim.refill(planFor(genre, pileMode), pileMode); }
  if (q.get('pile') !== null) { pileMode = q.get('pile') === '1'; syncLayoutBtn(); sim.refill(planFor(genre, pileMode), pileMode); }
  if (q.get('view') && VIEWS[q.get('view')!]) setView(q.get('view')!, true);
}
frame();

// テスト・デバッグ用
(window as unknown as { __game: unknown }).__game = { sim, pressAction, setView, camera };
