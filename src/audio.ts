// Web Audio による合成SE/BGM。外部音源なし。
import type { PrizeType } from './sim.ts';

export class GameAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  bgmGain!: GainNode;
  noiseBuf!: AudioBuffer;
  motor?: { osc: OscillatorNode; osc2: OscillatorNode; g: GainNode; f: BiquadFilterNode };
  muted = false;
  private bgmTimer = 0;
  private bgmStep = 0;
  private bgmOn = false;

  /** ユーザー操作内で呼ぶ(ブラウザの自動再生制限対策) */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0.07;
    this.sfx.connect(this.master);
    this.bgmGain.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 1;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.initMotor();
    this.startBgm();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  private out(pan: number) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfx);
    return p;
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, dest: AudioNode, decay = 4) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    void decay;
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(t: number, freq: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, endFreq?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- SE ----
  click(pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(pan);
    this.noise(t, 0.03, 'bandpass', 2800, 2, 0.5, o);
    this.tone(t, 180, 0.06, 'sine', 0.4, o, 90);
  }

  coin(pan = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(pan);
    // 投入 → 内部で転がって落ちるチャリン
    this.tone(t, 3100, 0.25, 'triangle', 0.18, o);
    this.tone(t, 4650, 0.18, 'sine', 0.1, o);
    this.noise(t, 0.05, 'highpass', 6000, 1, 0.25, o);
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.18 + i * (0.06 - i * 0.009);
      this.tone(tt, 2400 + Math.random() * 900, 0.12, 'triangle', 0.12, o);
      this.noise(tt, 0.02, 'highpass', 5000, 1, 0.1, o);
    }
    this.tone(t + 0.55, 220, 0.12, 'sine', 0.3, o, 120); // 受け皿の底
  }

  /** ビニール袋のカサカサ・クシャッという音。strength 0..1 */
  private lastCrinkle = 0;
  crinkle(strength: number, x = 0) {
    if (!this.ctx) return;
    if (this.ctx.currentTime - this.lastCrinkle < 0.04) return; // 連打によるノード生成の負荷を抑える
    this.lastCrinkle = this.ctx.currentTime;
    const t0 = this.ctx.currentTime, o = this.out(x * 1.5), v = Math.max(0.05, Math.min(1, strength));
    const grains = 3 + Math.floor(v * 5);
    const span = 0.05 + v * 0.22;
    for (let i = 0; i < grains; i++) {
      const t = t0 + Math.random() * span;
      const f = 2500 + Math.random() * 5000;
      this.noise(t, 0.012 + Math.random() * 0.03, 'bandpass', f, 1.2 + Math.random() * 2, (0.12 + Math.random() * 0.2) * v, o);
    }
    this.noise(t0, 0.07 + v * 0.1, 'lowpass', 600, 0.6, 0.18 * v, o); // 中身のお米が動く低いこすれ音
  }

  /** 水しぶき・ぼちゃん */
  splash(strength: number, x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(x * 1.5), v = Math.max(0.2, Math.min(1, strength));
    this.noise(t, 0.25 + v * 0.2, 'bandpass', 900 + v * 500, 0.7, 0.5 * v, o);
    this.noise(t, 0.35, 'lowpass', 380, 0.6, 0.4 * v, o);
    for (let i = 0; i < 3; i++) this.tone(t + 0.04 + i * 0.07, 280 + Math.random() * 150, 0.09, 'sine', 0.12 * v, o, 750 + Math.random() * 300); // 泡
  }

  /** ホタテが殻を閉じる「パクッ」 + 水を噴く音 */
  clap(x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(x * 1.5);
    this.noise(t, 0.035, 'highpass', 2600, 1.2, 0.35, o);
    this.tone(t, 640, 0.07, 'triangle', 0.22, o, 330);
    this.noise(t + 0.03, 0.12, 'bandpass', 1300, 0.9, 0.16, o);
  }

  /** カニの脚がカチカチと床を打つ音 */
  private lastScuttle = 0;
  scuttle(x = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastScuttle < 0.08) return;
    this.lastScuttle = t;
    const o = this.out(x * 1.5);
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.03 + Math.random() * 0.012, 0.016, 'bandpass', 3200 + Math.random() * 1800, 3, 0.09, o);
  }

  /** ファンの羽が折れる「パキッ」 */
  snap(n = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(0);
    for (let i = 0; i < Math.min(4, n); i++) {
      const tt = t + i * 0.045;
      this.noise(tt, 0.03, 'highpass', 3500, 1.5, 0.5, o);
      this.tone(tt, 2100 + Math.random() * 600, 0.05, 'square', 0.12, o, 900);
    }
    this.tone(t + 0.02, 160, 0.1, 'sine', 0.2, o, 80);
  }

  impact(mat: PrizeType, strength: number, x: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(x * 1.5), v = Math.min(1, strength * 1.2);
    switch (mat) {
      case 'plush': // 柔らかい「ぽすっ」
        this.noise(t, 0.12, 'lowpass', 500 + v * 300, 0.7, 0.55 * v, o);
        this.tone(t, 110, 0.12, 'sine', 0.25 * v, o, 60);
        break;
      case 'box': // 紙箱「ごとっ」「コツ」
        this.noise(t, 0.08, 'bandpass', 900 + Math.random() * 300, 1.2, 0.55 * v, o);
        this.tone(t, 150, 0.1, 'triangle', 0.35 * v, o, 80);
        break;
      case 'figure': // プラスチック「カチッ」
        this.noise(t, 0.04, 'highpass', 2500, 1.5, 0.5 * v, o);
        this.tone(t, 1900 + Math.random() * 600, 0.07, 'square', 0.1 * v, o, 1200);
        this.tone(t, 260, 0.06, 'sine', 0.3 * v, o, 130);
        break;
      case 'gpubox': // 重い箱「ドスッ」
        this.noise(t, 0.09, 'lowpass', 700, 0.8, 0.6 * v, o);
        this.tone(t, 110, 0.14, 'triangle', 0.4 * v, o, 60);
        break;
      case 'gpucard': // 金属・基板の「ガシャッ」
        this.noise(t, 0.07, 'bandpass', 2200, 1.2, 0.5 * v, o);
        this.tone(t, 1400 + Math.random() * 400, 0.1, 'triangle', 0.14 * v, o, 800);
        this.tone(t, 140, 0.12, 'sine', 0.3 * v, o, 70);
        break;
      case 'crab':
      case 'kingcrab': // 甲羅・ハサミが当たる硬い「カツッ」
        this.noise(t, 0.03, 'highpass', 2400, 1.5, 0.4 * v, o);
        this.tone(t, 760 + Math.random() * 200, 0.05, 'triangle', 0.16 * v, o, 420);
        break;
      case 'scallop': // 殻どうしの軽い「コトッ」
        this.noise(t, 0.04, 'bandpass', 1800, 1.4, 0.3 * v, o);
        this.tone(t, 520, 0.06, 'sine', 0.18 * v, o, 300);
        break;
      case 'chips': // 大きな袋: パリパリ・ガサガサ
        this.crinkle(0.5 + strength * 1.0, x);
        this.noise(t, 0.06, 'highpass', 4500, 1, 0.25 * v, o);
        break;
      case 'rice':
      case 'bag': // ビニール袋: クシャッ + ぼふっ
        this.crinkle(0.35 + strength * 0.8, x);
        this.tone(t, 90, 0.1, 'sine', 0.22 * v, o, 55);
        break;
      case 'game':
      case 'pad': // プラケース「カチッ」
        this.noise(t, 0.04, 'highpass', 2200, 1.5, 0.45 * v, o);
        this.tone(t, 320, 0.06, 'sine', 0.25 * v, o, 150);
        break;
      case 'sbox': // 紙の小箱
        this.noise(t, 0.07, 'bandpass', 1100, 1.2, 0.5 * v, o);
        this.tone(t, 170, 0.09, 'triangle', 0.3 * v, o, 90);
        break;
      case 'tin': // 缶「カン」
        this.tone(t, 900 + Math.random() * 200, 0.22, 'triangle', 0.3 * v, o, 700);
        this.noise(t, 0.03, 'highpass', 3000, 1.5, 0.3 * v, o);
        break;
      case 'ball': // 中空プラ「ポコッ」
        this.tone(t, 520 + Math.random() * 120, 0.13, 'sine', 0.4 * v, o, 330);
        this.noise(t, 0.03, 'bandpass', 2000, 2, 0.3 * v, o);
        break;
    }
  }

  clawWhir(kind: 'open' | 'close' | 'lift') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(0);
    const f = kind === 'open' ? [320, 520] : kind === 'close' ? [520, 300] : [250, 280];
    const d = kind === 'lift' ? 0.2 : 0.5;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f[0], t);
    osc.frequency.linearRampToValueAtTime(f[1], t + d);
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1);
    osc.connect(flt).connect(g).connect(o);
    osc.start(t);
    osc.stop(t + d + 0.15);
    // ギアのカチカチ
    for (let i = 0; i < 4; i++) this.noise(t + i * d / 4, 0.02, 'bandpass', 1800, 3, 0.15, o);
  }

  /** 上昇端のストッパーに当たる「コツン」 */
  bump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(0);
    this.noise(t, 0.04, 'bandpass', 1400, 2.5, 0.7, o);
    this.tone(t, 210, 0.12, 'triangle', 0.55, o, 90);
    this.tone(t, 1250, 0.09, 'square', 0.07, o, 700);
    this.noise(t + 0.05, 0.1, 'bandpass', 600, 1.5, 0.25, o);
  }

  prizeDrop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(0.6);
    this.noise(t, 0.2, 'lowpass', 700, 0.8, 0.6, o);
    this.tone(t, 90, 0.25, 'sine', 0.6, o, 45);
    this.noise(t + 0.14, 0.15, 'lowpass', 500, 0.8, 0.3, o);
  }

  win() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.25, o = this.out(0);
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
      const tt = t + i * 0.11;
      this.tone(tt, f, 0.2, 'square', 0.1, o);
      this.tone(tt, f * 2, 0.18, 'triangle', 0.06, o);
    });
  }

  miss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.1, o = this.out(0);
    [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.16, f, 0.22, 'triangle', 0.14, o, f * 0.97));
  }

  warn() {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 880, 0.08, 'square', 0.08, this.out(0));
  }

  // ---- 連続音: アームのモーター ----
  private initMotor() {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 70;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 140;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(f);
    osc2.connect(f);
    f.connect(g).connect(this.sfx);
    osc.start();
    osc2.start();
    this.motor = { osc, osc2, g, f };
  }

  /** moving: 0..1, pan: -1..1 */
  setMotor(moving: number, pan: number) {
    if (!this.ctx || !this.motor) return;
    const t = this.ctx.currentTime;
    const m = this.motor;
    m.g.gain.setTargetAtTime(moving * 0.05, t, 0.05);
    const fr = 62 + moving * 22;
    m.osc.frequency.setTargetAtTime(fr, t, 0.1);
    m.osc2.frequency.setTargetAtTime(fr * 2.01, t, 0.1);
    m.f.frequency.setTargetAtTime(250 + moving * 350, t, 0.1);
    void pan;
  }

  // ---- BGM: 簡易アルペジオ ----
  private startBgm() {
    if (this.bgmOn) return;
    this.bgmOn = true;
    const ctx = this.ctx!;
    const notes = [0, 4, 7, 12, 7, 4, 0, 4, 5, 9, 12, 17, 12, 9, 5, 9, 7, 11, 14, 19, 14, 11, 7, 11, 4, 7, 12, 16, 12, 7, 4, 7];
    const bass = [48, 48, 53, 53, 55, 55, 52, 52];
    let next = ctx.currentTime + 0.1;
    const step = 0.2;
    this.bgmTimer = window.setInterval(() => {
      while (next < ctx.currentTime + 0.3) {
        const n = notes[this.bgmStep % notes.length];
        const root = 60 + [0, 5, 7, 4][Math.floor(this.bgmStep / 8) % 4];
        const f = 440 * Math.pow(2, (root + n - 69) / 12);
        this.tone(next, f, 0.16, 'square', 0.5, this.bgmGain);
        if (this.bgmStep % 4 === 0) {
          const b = bass[Math.floor(this.bgmStep / 4) % bass.length];
          this.tone(next, 440 * Math.pow(2, (b - 12 - 69) / 12), 0.38, 'triangle', 0.9, this.bgmGain);
        }
        this.bgmStep++;
        next += step;
      }
    }, 100);
  }
}
