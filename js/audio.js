// Fully procedural WebAudio, second engine revision.
// True 3D: every world-anchored sound runs through an HRTF PannerNode, and the
// listener tracks the camera each frame. Distance feeds a stone-hall convolver,
// so far things arrive mostly as reverb. Everything still ramps — nothing stings.

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export const Sound = {
  ready: false,
  ctx: null,
  _vol: 0.8,

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    this.master = ctx.createGain();
    this.master.gain.value = this._vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 7; comp.knee.value = 18;
    this.master.connect(comp); comp.connect(ctx.destination);

    // generated stone-hall impulse, longer + darker than v1
    const len = Math.floor(ctx.sampleRate * 3.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const w = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
        lp = lp * 0.62 + w * 0.38; // darken the tail
        d[i] = lp;
      }
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.5;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    // shared noise buffer
    const nlen = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    this._heartTimer = 0;
    this._breathTimer = 0;
    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  setVolume(v) {
    this._vol = v;
    if (this.ready) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    }
  },

  // ------------------------------------------------------- 3D listener

  updateListener(pos, yaw) {
    if (!this.ready) return;
    const L = this.ctx.listener;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.04);
      L.positionY.setTargetAtTime(1.6, t, 0.04);
      L.positionZ.setTargetAtTime(pos.z, t, 0.04);
      L.forwardX.setTargetAtTime(fx, t, 0.04);
      L.forwardY.setTargetAtTime(0, t, 0.04);
      L.forwardZ.setTargetAtTime(fz, t, 0.04);
      L.upX.setTargetAtTime(0, t, 0.04);
      L.upY.setTargetAtTime(1, t, 0.04);
      L.upZ.setTargetAtTime(0, t, 0.04);
    } else if (L.setPosition) {
      L.setPosition(pos.x, 1.6, pos.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    this._lx = pos.x; this._lz = pos.z;
  },

  // a panner anchored at a world position; far sources go mostly to reverb
  _at(x, z, { y = 1.5, ref = 4, dry = 1 } = {}) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 80;
    p.rolloffFactor = 1.05;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);

    const g = ctx.createGain();
    g.gain.value = dry;
    g.connect(p);
    p.connect(this.master);
    const dist = Math.hypot(x - (this._lx || 0), z - (this._lz || 0));
    const wet = ctx.createGain();
    wet.gain.value = clamp(0.15 + dist / 24, 0.15, 1.1);
    g.connect(wet); wet.connect(this.verb);
    return g;
  },

  // ------------------------------------------------------- ambient bed

  startAmbience(floor, opts = {}) {
    if (!this.ready) return;
    this.stopAmbience();
    const ctx = this.ctx;
    const amb = this.amb = { nodes: [] };

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0;
    bedGain.connect(this.master);
    bedGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 5);
    amb.bed = bedGain;

    const keep = (...ns) => amb.nodes.push(...ns);

    // root drone — lower every floor
    const f = 46 * Math.pow(0.9, floor - 1);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.498;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.7;
    const g1 = ctx.createGain(); g1.gain.value = 0.05;
    const g2 = ctx.createGain(); g2.gain.value = 0.015;
    o1.connect(g1); o2.connect(lp); lp.connect(g2);
    g1.connect(bedGain); g2.connect(bedGain);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04 + floor * 0.005;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG); lfoG.connect(g1.gain);
    o1.start(); o2.start(); lfo.start();
    keep(o1, o2, lfo);

    // sub-foundation: a breath below hearing, fading in and out over ~40s
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.value = 26 + floor * 0.6;
    const subG = ctx.createGain(); subG.gain.value = 0.0;
    const subLfo = ctx.createOscillator(); subLfo.frequency.value = 0.024;
    const subLfoG = ctx.createGain(); subLfoG.gain.value = 0.045;
    subLfo.connect(subLfoG); subLfoG.connect(subG.gain);
    sub.connect(subG); subG.connect(bedGain);
    sub.start(); subLfo.start();
    keep(sub, subLfo);

    // distant rumble — brown-ish noise, almost felt rather than heard
    const rum = ctx.createBufferSource(); rum.buffer = this.noiseBuf; rum.loop = true;
    rum.playbackRate.value = 0.4;
    const rumF = ctx.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 65;
    const rumG = ctx.createGain(); rumG.gain.value = 0.05 + floor * 0.008;
    rum.connect(rumF); rumF.connect(rumG); rumG.connect(bedGain);
    rum.start();
    keep(rum);

    // wind — filtered noise wandering
    const wind = ctx.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = opts.forest ? 420 : 300; bp.Q.value = opts.forest ? 1.4 : 2.2;
    const wg = ctx.createGain(); wg.gain.value = opts.forest ? 0.06 : 0.035;
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.07;
    const wlfoG = ctx.createGain(); wlfoG.gain.value = opts.forest ? 260 : 160;
    wlfo.connect(wlfoG); wlfoG.connect(bp.frequency);
    wind.connect(bp); bp.connect(wg); wg.connect(bedGain);
    wg.connect(this.verb);
    wind.start(); wlfo.start();
    keep(wind, wlfo);

    if (opts.forest) {
      // needles and branches — high rustle, amplitude-wandering
      const rus = ctx.createBufferSource(); rus.buffer = this.noiseBuf; rus.loop = true;
      rus.playbackRate.value = 1.4;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
      const rg = ctx.createGain(); rg.gain.value = 0.012;
      const rlfo = ctx.createOscillator(); rlfo.frequency.value = 0.13;
      const rlfoG = ctx.createGain(); rlfoG.gain.value = 0.01;
      rlfo.connect(rlfoG); rlfoG.connect(rg.gain);
      rus.connect(hp); hp.connect(rg); rg.connect(bedGain);
      rus.start(); rlfo.start();
      keep(rus, rlfo);
    }

    // machine heart of the deep
    if (floor >= 3 && !opts.forest) {
      const thump = ctx.createOscillator(); thump.type = 'sine'; thump.frequency.value = 31;
      const tg = ctx.createGain(); tg.gain.value = 0;
      const tlfo = ctx.createOscillator(); tlfo.frequency.value = 0.55;
      const tlg = ctx.createGain(); tlg.gain.value = 0.012 + floor * 0.004;
      tlfo.connect(tlg); tlg.connect(tg.gain);
      thump.connect(tg); tg.connect(bedGain);
      thump.start(); tlfo.start();
      keep(thump, tlfo);
    }
  },

  stopAmbience() {
    if (!this.amb) return;
    const ctx = this.ctx, amb = this.amb;
    amb.bed.gain.cancelScheduledValues(ctx.currentTime);
    amb.bed.gain.setValueAtTime(amb.bed.gain.value, ctx.currentTime);
    amb.bed.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.6);
    const nodes = amb.nodes;
    setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 1800);
    this.amb = null;
  },

  // ------------------------------------------------------- primitives

  _noiseHit(dest, { freq = 800, q = 1, dur = 0.09, vol = 0.5, type = 'lowpass', rate } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = rate ?? (0.8 + Math.random() * 0.4);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.2, dur + 0.05);
  },

  _tone(dest, { freq = 220, dur = 0.5, vol = 0.2, type = 'sine', attack = 0.005, glideTo, glideT } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, ctx.currentTime + (glideT || dur));
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.1);
  },

  // ------------------------------------------------------- self (non-spatial)

  step(kind = 'stone', vol = 0.18) {
    if (!this.ready) return;
    const dest = this.master;
    if (kind === 'metal') {
      this._noiseHit(dest, { freq: 1300, dur: 0.07, vol: vol * 0.9 });
      this._tone(dest, { freq: 180 + Math.random() * 60, dur: 0.12, vol: vol * 0.25, type: 'triangle' });
    } else if (kind === 'sci') {
      this._noiseHit(dest, { freq: 900, dur: 0.06, vol: vol * 0.8 });
    } else if (kind === 'soil') {
      this._noiseHit(dest, { freq: 300, dur: 0.11, vol: vol * 0.9 });
      this._noiseHit(dest, { freq: 2400, dur: 0.05, vol: vol * 0.25, type: 'highpass' });
    } else {
      this._noiseHit(dest, { freq: 520 + Math.random() * 200, dur: 0.085, vol });
    }
  },

  jump() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 600, dur: 0.1, vol: 0.08 });
  },

  land(kind = 'stone', hard = false) {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: kind === 'metal' ? 700 : 320, dur: hard ? 0.2 : 0.13, vol: hard ? 0.4 : 0.22 });
    if (kind === 'metal') this._tone(this.master, { freq: 140, dur: 0.25, vol: 0.12, type: 'triangle' });
  },

  pickup() {
    if (!this.ready) return;
    this._tone(this.master, { freq: 392, dur: 0.6, vol: 0.1 });
    this._tone(this.master, { freq: 523, dur: 0.9, vol: 0.07, attack: 0.1 });
  },

  useItem() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 1800, dur: 0.18, vol: 0.12, type: 'highpass' });
    this._tone(this.master, { freq: 660, dur: 0.4, vol: 0.05 });
  },

  paper() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 2600, dur: 0.22, vol: 0.1, type: 'highpass' });
  },

  lever() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 300, dur: 0.25, vol: 0.4 });
    this._tone(this.master, { freq: 95, dur: 0.5, vol: 0.2, type: 'triangle' });
    setTimeout(() => this.clangAt(this._lx || 0, this._lz || 0, 0.3), 350);
  },

  rest() {
    if (!this.ready) return;
    this._tone(this.master, { freq: 220, dur: 2.4, vol: 0.07, attack: 0.5 });
    this._tone(this.master, { freq: 330, dur: 2.8, vol: 0.05, attack: 0.9 });
    this._noiseHit(this.master, { freq: 900, dur: 1.2, vol: 0.04, type: 'bandpass', q: 3 });
  },

  psalm() {
    if (!this.ready) return;
    [262, 311, 392].forEach((f, i) => {
      setTimeout(() => this._tone(this.master, { freq: f, dur: 1.8, vol: 0.06, attack: 0.3 }), i * 500);
    });
  },

  swordEquip() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 3000, dur: 0.3, vol: 0.18, type: 'bandpass', q: 4 });
    this._tone(this.master, { freq: 1200, dur: 0.5, vol: 0.04 });
  },

  thunk() {
    if (!this.ready) return;
    this._noiseHit(this.master, { freq: 240, dur: 0.12, vol: 0.35 });
  },

  ratchet() {
    // one crank of the dynamo
    if (!this.ready) return;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this._noiseHit(this.master, { freq: 2100 + Math.random() * 600, dur: 0.03, vol: 0.13, type: 'bandpass', q: 5 });
      }, i * 34);
    }
    this._tone(this.master, { freq: 110 + Math.random() * 30, dur: 0.07, vol: 0.05, type: 'triangle' });
  },

  radarPing() {
    if (!this.ready) return;
    // a wave going out: soft, round, falling
    this._tone(this.master, { freq: 340, glideTo: 150, glideT: 0.5, dur: 0.55, vol: 0.045, attack: 0.04 });
    const wet = this.ctx.createGain(); wet.gain.value = 0.5; wet.connect(this.verb);
    this._tone(wet, { freq: 340, glideTo: 150, glideT: 0.5, dur: 0.55, vol: 0.05, attack: 0.04 });
  },

  radarBlip() {
    if (!this.ready) return;
    this._tone(this.master, { freq: 760, dur: 0.18, vol: 0.05, attack: 0.01 });
  },

  heart(vol = 0.5) {
    if (!this.ready) return;
    this._tone(this.master, { freq: 52, dur: 0.16, vol: 0.5 * vol, attack: 0.01 });
    setTimeout(() => this._tone(this.master, { freq: 46, dur: 0.14, vol: 0.38 * vol, attack: 0.01 }), 180);
  },

  breath(intensity = 0.5) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 1.2;
    const g = ctx.createGain();
    const t = ctx.currentTime, dur = 1.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 * intensity, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    bp.frequency.linearRampToValueAtTime(300, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.1);
  },

  endTone() {
    if (!this.ready) return;
    this._tone(this.master, { freq: 110, dur: 7, vol: 0.1, attack: 2.5 });
    this._tone(this.master, { freq: 164.8, dur: 8, vol: 0.07, attack: 3.5 });
    this._tone(this.master, { freq: 220, dur: 9, vol: 0.05, attack: 4.5 });
  },

  liftLoop(durSec = 4) {
    if (!this.ready) return;
    const n = Math.floor(durSec * 2.4);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 4;
        this.clangAt((this._lx || 0) + Math.cos(a) * d, (this._lz || 0) + Math.sin(a) * d, 0.16 + Math.random() * 0.1);
        this._noiseHit(this.master, { freq: 200, dur: 0.3, vol: 0.12 });
      }, i * (320 + Math.random() * 160));
    }
  },

  // ------------------------------------------------------- world-anchored

  stepAt(kind, x, z, vol = 0.3) {
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 0.2, ref: 3 });
    if (kind === 'metal') this._noiseHit(dest, { freq: 1100, dur: 0.08, vol });
    else if (kind === 'soil') this._noiseHit(dest, { freq: 320, dur: 0.11, vol });
    else this._noiseHit(dest, { freq: 480 + Math.random() * 150, dur: 0.1, vol });
  },

  clangAt(x, z, vol = 0.5) {
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 1.6, ref: 5 });
    const base = 90 + Math.random() * 70;
    [1, 2.76, 5.4, 8.93].forEach((m, i) => {
      this._tone(dest, { freq: base * m, dur: 1.4 - i * 0.25, vol: vol * 0.32 / (i + 1), type: 'sine', attack: 0.002 });
    });
    this._noiseHit(dest, { freq: 2400, dur: 0.05, vol: vol * 0.5, type: 'bandpass', q: 1.5 });
  },

  bellAt(x, z) {
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 8, ref: 9 });
    const base = 174;
    [0.56, 0.92, 1.19, 1.71, 2.0, 2.74].forEach((m, i) => {
      this._tone(dest, { freq: base * m, dur: 3.2 - i * 0.35, vol: 0.15 / (i * 0.7 + 1), attack: 0.004 });
    });
  },

  whisperAt(x, z) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const dest = this._at(x, z, { y: 1.5, ref: 3 });
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(bp); bp.connect(g); g.connect(dest);
    let tt = t + 0.1;
    const sylls = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < sylls; i++) {
      const d = 0.07 + Math.random() * 0.12;
      g.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.06, tt + d * 0.4);
      g.gain.linearRampToValueAtTime(0.005, tt + d);
      bp.frequency.setValueAtTime(900 + Math.random() * 1400, tt);
      tt += d + 0.02 + Math.random() * 0.06;
    }
    g.gain.linearRampToValueAtTime(0.0001, tt + 0.1);
    src.start(t, Math.random());
    src.stop(tt + 0.3);
  },

  groanAt(x, z) {
    // settling iron, a long unhappy beam
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 3, ref: 6 });
    this._tone(dest, { freq: 80 + Math.random() * 40, glideTo: 46, glideT: 2.2, dur: 2.4, vol: 0.16, type: 'sawtooth', attack: 0.7 });
    this._noiseHit(dest, { freq: 240, dur: 1.8, vol: 0.06, type: 'bandpass', q: 3 });
  },

  crowAt(x, z) {
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 6, ref: 8 });
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this._tone(dest, { freq: 620 + Math.random() * 120, glideTo: 320, glideT: 0.16, dur: 0.18, vol: 0.07, type: 'sawtooth', attack: 0.01 });
      }, i * (260 + Math.random() * 120));
    }
  },

  swellAt(x, z) {
    if (!this.ready) return;
    const dest = this._at(x, z, { y: 1.5, ref: 6 });
    this._tone(dest, { freq: 56, dur: 4.5, vol: 0.1, attack: 2 });
  },

  // the watchtower siren: loud, slow, ramped — grief through iron
  sirenAt(x, z, dur = 9) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const dest = this._at(x, z, { y: 9, ref: 14 });
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55, t + 2.2);          // loud, but it RISES — no sting
    g.gain.setValueAtTime(0.55, t + dur - 2.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.1;
    bp.connect(g); g.connect(dest);

    for (const det of [0, 3.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(260 + det, t);
      // the long wail: up, hold, grieve back down — twice
      const cyc = (dur - 1) / 2;
      for (let k = 0; k < 2; k++) {
        const t0 = t + 0.4 + k * cyc;
        o.frequency.linearRampToValueAtTime(640 + det * 2, t0 + cyc * 0.45);
        o.frequency.linearRampToValueAtTime(280 + det, t0 + cyc);
      }
      // wow/flutter of old machinery
      const fl = ctx.createOscillator(); fl.frequency.value = 6.5;
      const flG = ctx.createGain(); flG.gain.value = 4;
      fl.connect(flG); flG.connect(o.frequency);
      const og = ctx.createGain(); og.gain.value = 0.5;
      o.connect(og); og.connect(bp);
      o.start(t); o.stop(t + dur + 0.2);
      fl.start(t); fl.stop(t + dur + 0.2);
    }
  },

  // ------------------------------------------------------- per-frame

  tick(dt, state) {
    if (!this.ready) return;
    const { dread = 0, caught = false } = state;
    if (dread > 0.45 || caught) {
      this._heartTimer -= dt;
      if (this._heartTimer <= 0) {
        const intensity = caught ? 1 : (dread - 0.45) / 0.55;
        this.heart(0.25 + 0.75 * intensity);
        this._heartTimer = caught ? 0.72 : 1.5 - dread * 0.6;
      }
    }
    if (caught) {
      this._breathTimer -= dt;
      if (this._breathTimer <= 0) {
        this.breath(0.8);
        this._breathTimer = 2.2 + Math.random() * 1.2;
      }
    }
  },
};
