// 台のジャンル定義: 景品構成・テーマ配色・難易度
import type { PrizeType, TerrainKind } from './sim.ts';
import { GPU_BRAND, GPU_BRAND_UP, GPU_MODELS, gpuShowName } from './gpu.ts';

export interface Theme {
  body: string;
  accent: string;
  side: string;
  floorA: string;
  floorB: string;
  backBase: string;
  backIcons: string[];
  signA: string;
  signB: string;
  signC: string;
  signShadow: string;
  /** 操作パネル上面の色 */
  panel?: string;
  /** トーンマッピングの露出(白い筐体は白飛びするので下げる) */
  exposure?: number;
}

export interface Genre {
  id: string;
  label: string;
  icon: string;
  title: string;
  sub: string;
  desc: string;
  /** [種類, バリアント数, 個数, (省略可)固定バリアント] */
  plan: Array<[PrizeType, number, number] | [PrizeType, number, number, number]>;
  names: Partial<Record<PrizeType, string[]>>;
  boxLabel: string;
  /** アームの降下深さ(ハブ高さ。小さいほど深く降りる) */
  yLow: number;
  /** 既定の地形(段差・坂・岩場)。省略 = 平地 */
  terrain?: TerrainKind;
  /** 既定の水面の高さ(m)。省略 = 水なし */
  water?: number;
  /** アーム形式(既定 'claw' = 3 本爪)。'hook' = 1 本のフックで輪・持ち手の穴を狙う */
  claw?: 'claw' | 'hook' | 'stacker';
  /** true = 台に固定された粘着バーに景品が貼り付いている(アームで剥ぎ取る) */
  bars?: boolean;
  /** 配置: 'tower' = 箱を柱状に積み上げる(崩して落とす) */
  layout?: 'tower';
  /** 既定の配置: true=雑然と積み上げ / false=整列 */
  pile: boolean;
  /** 持ち上げ時の握力の範囲(小さいほど落としやすい) */
  gripRange: [number, number];
  theme: Theme;
}

export const GENRES: Genre[] = [
  {
    id: 'plush',
    label: 'ぬいぐるみ台',
    icon: '🧸',
    title: '🐴 UMA PLUSH',
    sub: 'ふわふわ ぬいぐるみ',
    desc: '柔らかく掴みやすいが、頭がぶらぶらして滑る',
    plan: [['plush', 5, 11], ['box', 3, 3]],
    names: {
      plush: ['うまぬい(しろ)', 'うまぬい(くり)', 'うまぬい(もも)', 'うまぬい(そら)', 'うまぬい(ふじ)'],
      box: ['うまキャッチ BOX(ピンク)', 'うまキャッチ BOX(ブルー)', 'うまキャッチ BOX(グリーン)'],
    },
    boxLabel: 'うまキャッチ',
    pile: false,
    yLow: 0.2,
    gripRange: [0.5, 1.6],
    theme: { body: '#6a3fd1', accent: '#ff6fb5', side: '#b494ff', floorA: '#ffd6ea', floorB: '#fff3c8', backBase: '#8f6bff', backIcons: ['🐴', '🧸'], signA: '#ff4fa3', signB: '#ffb347', signC: '#7b5cff', signShadow: '#7a1f60' },
  },
  {
    id: 'figure',
    label: 'フィギュア台',
    icon: '🗿',
    title: '🏆 FIGURE ZONE',
    sub: '人気キャラ プライズフィギュア',
    desc: '重くて滑りやすい。箱は角を狙ってずらそう',
    plan: [['figure', 5, 10], ['box', 3, 4], ['ball', 3, 3]],
    names: {
      figure: ['ピカチョウ フィギュア', 'マリヲ フィギュア', 'ドラもえん フィギュア', 'ソニッコ フィギュア', 'カーヴィ フィギュア'],
      box: ['箱入りフィギュア(ピンク)', '箱入りフィギュア(ブルー)', '箱入りフィギュア(グリーン)'],
      ball: ['カプセルトイ(赤)', 'カプセルトイ(青)', 'カプセルトイ(黄)'],
    },
    boxLabel: 'FIGURE',
    pile: false,
    yLow: 0.17,
    gripRange: [0.4, 1.25],
    theme: { body: '#1f3a73', accent: '#f5c542', side: '#6f8fd6', floorA: '#cfd8ee', floorB: '#f4f6fc', backBase: '#2c4a96', backIcons: ['⭐', '🏆'], signA: '#1d4fd8', signB: '#f5c542', signC: '#0b1f5c', signShadow: '#0b1f5c' },
  },
  {
    id: 'game',
    label: 'ゲーム台',
    icon: '🎮',
    title: '🎮 GAME ARCADE',
    sub: '人気ゲーム機・ソフト',
    desc: '薄いソフトは掴みにくい。箱は重めで落としやすい',
    plan: [['pad', 5, 10], ['game', 4, 4], ['box', 3, 3]],
    names: {
      game: ['ゲームソフト「ウマレース」', 'ゲームソフト「ダービーRPG」', 'ゲームソフト「ホースパズル」', 'ゲームソフト「ギャロップ」'],
      pad: ['ニンテンダー スイッチョ(ネオン)', 'PSB(ブラック)', 'ゲームボーヤ アドバンズ(パープル)', 'ニンテンダーDS(ホワイト)', 'スイッチョ ライト(イエロー)'],
      box: ['ゲーム機BOX(ピンク)', 'ゲーム機BOX(ブルー)', 'ゲーム機BOX(グリーン)'],
    },
    boxLabel: 'GAME BOX',
    pile: false,
    yLow: 0.14,
    gripRange: [0.5, 1.5],
    theme: { body: '#1b1d2e', accent: '#22e3a5', side: '#46506e', floorA: '#2d3350', floorB: '#3d4670', backBase: '#151826', backIcons: ['🎮', '👾', '🕹️'], signA: '#22e3a5', signB: '#3b82f6', signC: '#8b5cf6', signShadow: '#043a2b' },
  },
  {
    id: 'candy',
    label: 'お菓子台',
    icon: '🍬',
    title: '🍬 SWEETS PARK',
    sub: 'お菓子・おもちゃ菓子',
    desc: '軽くて掴みやすい。缶は転がるので注意',
    plan: [['sbox', 3, 6], ['bag', 3, 5], ['tin', 3, 4]],
    names: {
      sbox: ['キャラメルBOX', 'チョコレートBOX', 'クッキーBOX'],
      bag: ['ポテトチップズ(うす塩)', 'ポテトチップズ(のり)', 'キャンディパック'],
      tin: ['クッキー缶(あか)', 'クッキー缶(みどり)', 'クッキー缶(あお)'],
    },
    boxLabel: 'SWEETS',
    pile: false,
    yLow: 0.15,
    gripRange: [1.0, 2.3],
    theme: { body: '#e8832a', accent: '#ff4f6a', side: '#ffc98a', floorA: '#fff0d6', floorB: '#ffd5a0', backBase: '#ffae5c', backIcons: ['🍭', '🍬', '🍪'], signA: '#ff4f6a', signB: '#ffd84a', signC: '#ff8a3d', signShadow: '#8a2a00' },
  },
  {
    id: 'sticky',
    label: '粘着バー台',
    icon: '🍡',
    title: '🍭 STICKY BAR',
    sub: 'ねばねばバーから剥ぎ取れ',
    desc: '台に固定された粘着バーに景品がベッタリ。粘着は強い! 軽いものほど貼り付きやすいので、アームで持ち上げて剥ぎ取ろう',
    plan: [['bag', 3, 8], ['sbox', 3, 7]],
    names: {
      sbox: ['キャラメルBOX', 'チョコレートBOX', 'クッキーBOX'],
      bag: ['ポテトチップズ(うす塩)', 'ポテトチップズ(のり)', 'キャンディパック'],
    },
    boxLabel: 'STICKY',
    bars: true,
    pile: false,
    yLow: 0.24,
    gripRange: [1.0, 2.4],
    theme: { body: '#d94f9a', accent: '#ffe14d', side: '#ffb3dc', floorA: '#fff0f7', floorB: '#ffd9ec', backBase: '#ff8fc8', backIcons: ['🍭', '🍡', '🍬'], signA: '#ffe14d', signB: '#ff4fa3', signC: '#7b5cff', signShadow: '#6a1046' },
  },
  {
    id: 'stacker',
    label: 'スタッカー台',
    icon: '🧱',
    title: '🧱 STACKER',
    sub: '箱を5段積んだら景品ゲット',
    desc: '左右に動く箱を、ボタンで落として土台に積み上げよう。5段積めば景品。ずれすぎると崩れる',
    plan: [['figure', 5, 10]],
    names: {
      figure: ['ピカチョウ フィギュア', 'マリヲ フィギュア', 'ドラもえん フィギュア', 'ソニッコ フィギュア', 'カーヴィ フィギュア'],
      box: ['積み木'],
    },
    boxLabel: 'STACK',
    claw: 'stacker',
    pile: false,
    yLow: 0.2,
    gripRange: [1, 1],
    theme: { body: '#2a8a6a', accent: '#ffd23f', side: '#8fe0c0', floorA: '#e6fff4', floorB: '#bff0dc', backBase: '#1f6f55', backIcons: ['🧱', '⭐'], signA: '#ffd23f', signB: '#ff5a5a', signC: '#1f6f55', signShadow: '#0d3a2b' },
  },
  {
    id: 'tower',
    label: '箱タワー台',
    icon: '📦',
    title: '📦 BOX TOWER',
    sub: '積んだ箱をくずして落とせ',
    desc: '箱が柱のように積み上がっている。アームで崩して、落下口へ落とそう',
    plan: [['box', 3, 24]],
    names: { box: ['BIG BOX(ピンク)', 'BIG BOX(ブルー)', 'BIG BOX(グリーン)'] },
    boxLabel: 'TOWER',
    layout: 'tower',
    pile: false,
    yLow: 0.2,
    gripRange: [0.6, 1.6],
    theme: { body: '#8a5a2b', accent: '#ffcf5a', side: '#d9b48a', floorA: '#f6e6cf', floorB: '#e7cfa8', backBase: '#a9753f', backIcons: ['📦', '🏗️'], signA: '#ffcf5a', signB: '#e6552b', signC: '#5a3a1a', signShadow: '#3a2410' },
  },
  {
    id: 'rice',
    label: 'お米台',
    icon: '🍚',
    title: '🌾 お米のUFOキャッチャー',
    sub: 'ななつぼし・ゆめぴりか 300g',
    desc: '1袋300g(約2合)のビニール袋。柔らかく、持ち手穴に爪を通して持ち上げよう',
    plan: [['rice', 2, 16]],
    names: { rice: ['ななつぼし 300g(白い袋)', 'ゆめぴりか 300g(黒い袋)'] },
    boxLabel: 'RICE',
    pile: true,
    yLow: 0.15,
    gripRange: [0.8, 1.9],
    theme: { body: '#f1f2f4', accent: '#c9ced6', side: '#dfe6ea', floorA: '#fafafa', floorB: '#eceff2', backBase: '#fff1d0', backIcons: ['🍚', '🍳', '🌾'], signA: '#2f7d4f', signB: '#f2c14e', signC: '#2f7d4f', signShadow: '#244d33', panel: '#e6e8ec', exposure: 0.7 },
  },
  {
    id: 'chips',
    label: 'ポテチズBIG台',
    icon: '🥔',
    title: '🥔 POTATO CHIPZ BIG',
    sub: 'ポテトチップズ BIG サイズ',
    desc: '大きくて超軽い空気入りの袋。上下の薄い端(ひれ)をつまむと持ち上がる。白黒パッケージの4倍サイズ袋も混ざっている',
    plan: [['chips', 3, 12], ['chips', 1, 3, 3]],
    names: { chips: ['ポテトチップズ BIG うす塩味', 'ポテトチップズ BIG のりしお味', 'ポテトチップズ BIG コンソメ味', 'ポテトチップズ 白黒パッケージ 4倍サイズ'] },
    boxLabel: 'CHIPS',
    pile: true,
    yLow: 0.15,
    gripRange: [1.3, 2.6],
    theme: { body: '#f2b01e', accent: '#d62828', side: '#ffe08a', floorA: '#fff4d1', floorB: '#ffe7a3', backBase: '#f6c445', backIcons: ['🥔', '🍟'], signA: '#d62828', signB: '#ffd23f', signC: '#f4a300', signShadow: '#7a1a00' },
  },
  {
    id: 'hook',
    label: 'リングフック台',
    icon: '🪝',
    title: '🪝 RING HOOK',
    sub: 'フックで持ち手の穴をねらえ',
    desc: '爪ではなく1本のフック。降りたあと少し横に引いて、袋の持ち手の穴に引っ掛ける',
    plan: [['rice', 2, 18]],
    names: { rice: ['ななつぼし 300g(白い袋)', 'ゆめぴりか 300g(黒い袋)'] },
    boxLabel: 'HOOK',
    claw: 'hook',
    pile: true,
    yLow: 0.17,
    gripRange: [1, 1],
    theme: { body: '#3b4d63', accent: '#ff8a3d', side: '#a9bccf', floorA: '#e4eaf1', floorB: '#cfd9e4', backBase: '#4f6580', backIcons: ['🪝', '🍚'], signA: '#ff8a3d', signB: '#ffd23f', signC: '#2f7d4f', signShadow: '#4a2200' },
  },
  {
    id: 'seafood',
    label: '海鮮台',
    icon: '🦀',
    title: '🦀 LIVE SEAFOOD',
    sub: 'カニ・ホタテ・タラバガニ(生きてます)',
    desc: '水槽の中を動き回る生き物たち。段差のある海底で、暴れる獲物をねらえ',
    plan: [['crab', 2, 5], ['scallop', 2, 5], ['kingcrab', 1, 3]],
    names: {
      crab: ['カニ(あか)', 'カニ(ちゃいろ)'],
      scallop: ['ホタテ(だいだい)', 'ホタテ(もも)'],
      kingcrab: ['タラバガニ'],
    },
    boxLabel: 'SEA',
    terrain: 'steps',
    water: 0.3,
    pile: false,
    yLow: 0.14,
    gripRange: [0.9, 2.0],
    theme: { body: '#1d5f8a', accent: '#ff7f50', side: '#9fd8ee', floorA: '#e8d9b0', floorB: '#d9c590', backBase: '#1b7fa8', backIcons: ['🦀', '🐚', '🌊'], signA: '#ff7f50', signB: '#ffd23f', signC: '#1d8fc4', signShadow: '#06324a', exposure: 0.85 },
  },
  {
    id: 'gpu',
    label: 'グラボ台',
    icon: '🟩',
    title: `🟩 ${GPU_BRAND_UP} RTZ`,
    sub: 'グラフィックスカード各種(箱入り・裸)',
    desc: '重くて高価なグラボ。裸のカードはファンにアームを刺すと掴みやすいが、羽が折れる',
    plan: [['gpubox', GPU_MODELS.length, 8], ['gpucard', GPU_MODELS.length, 6]],
    names: {
      gpubox: GPU_MODELS.map((m) => `${GPU_BRAND} ${gpuShowName(m.name)} 箱入り`),
      gpucard: GPU_MODELS.map((m) => `${GPU_BRAND} ${gpuShowName(m.name)}(裸・ファン付き)`),
    },
    boxLabel: GPU_BRAND_UP,
    pile: false,
    yLow: 0.15,
    gripRange: [1.4, 2.8],
    theme: { body: '#16181b', accent: '#76b900', side: '#3b4350', floorA: '#1f2327', floorB: '#2b3136', backBase: '#0d0f11', backIcons: ['🟩', '🖥️'], signA: '#76b900', signB: '#1a1d20', signC: '#76b900', signShadow: '#1c3000', panel: '#23282d', exposure: 1.05 },
  },
];

export function expandPlan(g: Genre): Array<[PrizeType, number]> {
  const out: Array<[PrizeType, number]> = [];
  for (const [t, variants, count, fixed] of g.plan) {
    const order = Array.from({ length: variants }, (_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) out.push([t, fixed ?? order[i % variants]]);
  }
  return out;
}

const FALLBACK: Record<string, string> = { plush: 'ぬいぐるみ', box: 'ボックス', figure: 'フィギュア', ball: 'カプセル', game: 'ゲームソフト', pad: '携帯ゲーム機', sbox: 'お菓子', bag: 'お菓子の袋', tin: 'お菓子缶', rice: 'お米(300g)', chips: 'ポテトチップズ BIG', crab: 'カニ', kingcrab: 'タラバガニ', scallop: 'ホタテ', gpubox: `${GPU_BRAND} RTZ(箱入り)`, gpucard: `${GPU_BRAND} RTZ(裸)` };
export function prizeName(g: Genre, type: PrizeType, variant: number): string {
  return g.names[type]?.[variant] ?? FALLBACK[type];
}
