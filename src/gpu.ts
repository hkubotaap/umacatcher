// グラフィックスカード(GeForce RTX)の型番データ。物理(sim.ts)・見た目(main.ts)・名前(genres.ts)で共有する。
// 見た目は NVIDIA 公式サイトの製品画像(Founders Edition: ガンメタ/シルバーの筐体、ダークな 2 連ファン、
// NVIDIA グリーンのリボン状の背景、「GEFORCE RTX」の発光文字)の印象をもとに、独自に描き起こした簡易表現。

export interface GpuModel {
  name: string; // 例: 'RTX 5090'
  num: string; // 例: '5090'
  suffix: string; // 'SUPER' | 'Ti' | ''
  arch: string; // アーキテクチャ名
  vram: string;
  fans: 2 | 3;
  fe: boolean; // Founders Edition 風(ガンメタ)か、ボードパートナー風(黒)か
  shroud: string;
}

/** 1 ファンあたりの羽の枚数 */
export const BLADES = 7;

export const GPU_MODELS: GpuModel[] = [
  { name: 'RTX 5090', num: '5090', suffix: '', arch: 'Blackwell', vram: '32GB GDDR7', fans: 2, fe: true, shroud: '#4b4e54' },
  { name: 'RTX 5080', num: '5080', suffix: '', arch: 'Blackwell', vram: '16GB GDDR7', fans: 2, fe: true, shroud: '#4b4e54' },
  { name: 'RTX 5070 Ti', num: '5070', suffix: 'Ti', arch: 'Blackwell', vram: '16GB GDDR7', fans: 2, fe: true, shroud: '#4b4e54' },
  { name: 'RTX 5070', num: '5070', suffix: '', arch: 'Blackwell', vram: '12GB GDDR7', fans: 2, fe: true, shroud: '#4b4e54' },
  { name: 'RTX 5060 Ti', num: '5060', suffix: 'Ti', arch: 'Blackwell', vram: '16GB GDDR7', fans: 2, fe: false, shroud: '#26282d' },
  { name: 'RTX 5060', num: '5060', suffix: '', arch: 'Blackwell', vram: '8GB GDDR7', fans: 2, fe: false, shroud: '#26282d' },
  { name: 'RTX 4090', num: '4090', suffix: '', arch: 'Ada Lovelace', vram: '24GB GDDR6X', fans: 3, fe: false, shroud: '#2b2d32' },
  { name: 'RTX 4080 SUPER', num: '4080', suffix: 'SUPER', arch: 'Ada Lovelace', vram: '16GB GDDR6X', fans: 3, fe: false, shroud: '#2b2d32' },
  { name: 'RTX 4070 Ti SUPER', num: '4070', suffix: 'Ti SUPER', arch: 'Ada Lovelace', vram: '16GB GDDR6X', fans: 3, fe: false, shroud: '#2b2d32' },
  { name: 'RTX 4070 SUPER', num: '4070', suffix: 'SUPER', arch: 'Ada Lovelace', vram: '12GB GDDR6X', fans: 2, fe: true, shroud: '#5b5e64' },
  { name: 'RTX 4060 Ti', num: '4060', suffix: 'Ti', arch: 'Ada Lovelace', vram: '8GB GDDR6', fans: 2, fe: false, shroud: '#2b2d32' },
  { name: 'RTX 4060', num: '4060', suffix: '', arch: 'Ada Lovelace', vram: '8GB GDDR6', fans: 2, fe: false, shroud: '#2b2d32' },
  { name: 'RTX 3090 Ti', num: '3090', suffix: 'Ti', arch: 'Ampere', vram: '24GB GDDR6X', fans: 3, fe: false, shroud: '#34363b' },
  { name: 'RTX 3080', num: '3080', suffix: '', arch: 'Ampere', vram: '10GB GDDR6X', fans: 2, fe: true, shroud: '#6a6d73' },
  { name: 'RTX 3070', num: '3070', suffix: '', arch: 'Ampere', vram: '8GB GDDR6', fans: 2, fe: true, shroud: '#6a6d73' },
  { name: 'RTX 3060', num: '3060', suffix: '', arch: 'Ampere', vram: '12GB GDDR6', fans: 2, fe: false, shroud: '#34363b' },
  { name: 'RTX 2080 Ti', num: '2080', suffix: 'Ti', arch: 'Turing', vram: '11GB GDDR6', fans: 2, fe: true, shroud: '#9aa0a8' },
  { name: 'RTX 2070 SUPER', num: '2070', suffix: 'SUPER', arch: 'Turing', vram: '8GB GDDR6', fans: 2, fe: true, shroud: '#9aa0a8' },
  { name: 'RTX 2060', num: '2060', suffix: '', arch: 'Turing', vram: '6GB GDDR6', fans: 2, fe: false, shroud: '#34363b' },
  { name: 'RTX 2080 SUPER', num: '2080', suffix: 'SUPER', arch: 'Turing', vram: '8GB GDDR6', fans: 2, fe: true, shroud: '#9aa0a8' },
];

/** カード(裸)の上面のファン配置。x は長手方向(m)、r はファン半径(m) */
export function fanLayout(fans: number): { xs: number[]; r: number } {
  return fans === 3 ? { xs: [-0.07, 0, 0.07], r: 0.027 } : { xs: [-0.05, 0.05], r: 0.04 };
}

/** ファンの井戸(穴)の半幅(m)。ここに爪やフックが刺さる */
export function wellHalf(fans: number): number {
  return fanLayout(fans).r + 0.003;
}

/** 本体の長手方向(x)で、ファンの井戸以外の「壁」になる区間 [a, b] */
export function shroudSegments(fans: number): Array<[number, number]> {
  const { xs } = fanLayout(fans), h = wellHalf(fans), L = 0.105;
  const edges: number[] = [-L];
  for (const x of xs) edges.push(x - h, x + h);
  edges.push(L);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 0.0005) out.push([edges[i], edges[i + 1]]);
  return out;
}

/** 現行価格(新品の最安値・税込、円)。価格.com の最安価格(チップセット別)を 2026-11-23 18:55 時点で取得した目安。
 *  rough: 掲載内容が不自然/在庫がわずかで、あくまで参考値 */
export const PRICE_DATE = '2026-11-23';
export const PRICE_SOURCE = '価格.com 最安価格(新品)';
export const GPU_PRICES: Record<string, { yen: number; note?: string; rough?: boolean }> = {
  'RTX 5090': { yen: 1149800 },
  'RTX 5080': { yen: 316162 },
  'RTX 5070 Ti': { yen: 229800 },
  'RTX 5070': { yen: 146234 },
  'RTX 5060 Ti': { yen: 89800, note: '8GB版の最安' },
  'RTX 5060': { yen: 82800 },
  'RTX 4090': { yen: 998800 },
  'RTX 4080 SUPER': { yen: 338523 },
  'RTX 4070 Ti SUPER': { yen: 334769 },
  'RTX 4070 SUPER': { yen: 232800 },
  'RTX 4060 Ti': { yen: 107897 },
  'RTX 4060': { yen: 72000 },
  'RTX 3090 Ti': { yen: 476785 },
  'RTX 3080': { yen: 85000, rough: true },
  'RTX 3070': { yen: 60000 },
  'RTX 3060': { yen: 69800, note: '12GB版の最安' },
  'RTX 2080 Ti': { yen: 170000 },
  'RTX 2070 SUPER': { yen: 67800 },
  'RTX 2060': { yen: 59800, note: '12GB版の最安' },
  'RTX 2080 SUPER': { yen: 398800, rough: true },
};

/** 画面に出すブランド・型番表記(実在の商標とは微妙に違う表記にする)。内部のキー(m.name)は変えない */
export const GPU_BRAND = 'GeForge';
export const GPU_BRAND_UP = 'GEFORGE';
export const gpuShowName = (name: string) => name.replace('RTX', 'RTZ');
