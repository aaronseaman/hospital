// HOSPITAL FIGHTER - audio.js
// Everything here is synthesized with the Web Audio API: a small chiptune
// tracker (2 pulse + triangle + noise, plus "expansion" layers for intensity),
// a punchy SFX kit and a speechSynthesis announcer. No audio files, no deps.
//
// Usage:  import { Sound } from './audio.js';
//   Sound.unlock()            from a user gesture (touchend / click / keydown)
//   Sound.music('er')         loop a stage track (resets intensity to 0)
//   Sound.setIntensity(2)     0 normal, 1 heated, 2 danger (applied on next beat)
//   Sound.sfx('hitH', { vol, pitch, pan })
//   Sound.jingle('victory')   one-shot cue, stops music
//   Sound.say('ROUND ONE... FIGHT!')
// Every method is safe before unlock() and never throws.

const W = typeof window !== 'undefined' ? window : undefined;
const DOC = typeof document !== 'undefined' ? document : undefined;
const NAV = typeof navigator !== 'undefined' ? navigator : undefined;

const PPQ = 48; // ticks per quarter note
const WHOLE = PPQ * 4;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25; // scheduler interval
const MAX_VOICES = 24; // concurrent SFX voices
const PER_NAME = 4; // concurrent voices of the same SFX
const SEMI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pcOf = (m) => ((m % 12) + 12) % 12;

// ---------------------------------------------------------------------------
// Per-context resources: band-limited NES waves and noise buffers
// ---------------------------------------------------------------------------
const RES = new WeakMap();

function makeWave(ctx, fn, H = 40) {
  const N = 1024;
  const s = new Float32Array(N);
  for (let i = 0; i < N; i++) s[i] = fn((i + 0.5) / N);
  const re = new Float32Array(H + 1);
  const im = new Float32Array(H + 1);
  for (let n = 1; n <= H; n++) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < N; i++) {
      const ph = (2 * Math.PI * n * i) / N;
      a += s[i] * Math.cos(ph);
      b += s[i] * Math.sin(ph);
    }
    re[n] = (2 * a) / N;
    im[n] = (2 * b) / N;
  }
  return ctx.createPeriodicWave(re, im);
}

function noiseBuf(ctx, sec, hold) {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let v = 0;
  for (let i = 0; i < len; i++) {
    if (i % hold === 0) v = Math.random() * 2 - 1;
    d[i] = v;
  }
  return b;
}

// NES "short mode" LFSR noise: a 93-step periodic sequence = metallic tone.
function metalBuf(ctx) {
  let reg = 1;
  const seq = [];
  for (let i = 0; i < 93 * 4; i++) {
    const bit = (reg ^ (reg >> 6)) & 1;
    reg = (reg >> 1) | (bit << 14);
    if (i >= 93 * 3) seq.push(reg & 1 ? 0.9 : -0.9);
  }
  const hold = 2;
  const reps = 48;
  const len = seq.length * hold * reps;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = seq[Math.floor(i / hold) % seq.length];
  return b;
}

function res(ctx) {
  let r = RES.get(ctx);
  if (r) return r;
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 3);
  r = {
    pulse: [0.125, 0.25, 0.5].map((d) => makeWave(ctx, (x) => (x < d ? 1 : -1))),
    tri: makeWave(ctx, (x) => {
      const s = Math.floor(x * 32);
      return (s < 16 ? 15 - s : s - 16) / 7.5 - 1;
    }),
    white: noiseBuf(ctx, 1.5, 1),
    crunch: noiseBuf(ctx, 1.5, 6),
    metal: metalBuf(ctx),
    curve,
  };
  RES.set(ctx, r);
  return r;
}

function setWave(o, w, R) {
  if (w === 0 || w === 1 || w === 2) o.setPeriodicWave(R.pulse[w]);
  else if (w === 't' || w === 'tri8') o.setPeriodicWave(R.tri);
  else if (w === 'p12') o.setPeriodicWave(R.pulse[0]);
  else if (w === 'p25') o.setPeriodicWave(R.pulse[1]);
  else if (w === 'p50') o.setPeriodicWave(R.pulse[2]);
  else if (w === 's') o.type = 'sine';
  else if (w === 'q') o.type = 'triangle';
  else o.type = w || 'square';
}

// ---------------------------------------------------------------------------
// Synth primitives shared by drums and SFX.
// c = { ctx, R, out, t (start), p (pitch mult), g (gain mult) }
// ---------------------------------------------------------------------------
function shape(gp, t, d, g, a, e) {
  g = Math.max(g, 0.0002);
  a = Math.min(a, d * 0.9);
  gp.setValueAtTime(0, t);
  if (e === 'lin') {
    gp.linearRampToValueAtTime(g, t + a);
    gp.linearRampToValueAtTime(0, t + d);
  } else if (e === 'hold') {
    const r = Math.min(0.03, d * 0.3);
    gp.linearRampToValueAtTime(g, t + a);
    gp.setValueAtTime(g, t + d - r);
    gp.linearRampToValueAtTime(0, t + d);
  } else if (e === 'swell') {
    gp.linearRampToValueAtTime(g, t + d * 0.75);
    gp.linearRampToValueAtTime(0, t + d);
  } else if (e === 'rev') {
    gp.setValueAtTime(0.001, t);
    gp.exponentialRampToValueAtTime(g, t + d * 0.92);
    gp.linearRampToValueAtTime(0, t + d);
  } else {
    gp.linearRampToValueAtTime(g, t + a);
    gp.exponentialRampToValueAtTime(0.0003, t + d);
    gp.setValueAtTime(0, t + d + 0.001);
  }
}

function amStage(c, o, t, src) {
  // optional amplitude steps (rattles, crackle, flutter)
  if (!o.am) return src;
  const g = c.ctx.createGain();
  const ai = o.ai || 0.03;
  g.gain.setValueAtTime(o.am[0], t);
  for (let i = 1; i < o.am.length; i++) g.gain.setValueAtTime(o.am[i], t + i * ai);
  src.connect(g);
  return g;
}

function filt(c, spec, t, d, p, src) {
  if (!spec) return src;
  const f = c.ctx.createBiquadFilter();
  f.type = spec[0];
  f.frequency.setValueAtTime(Math.min(20000, spec[1] * p), t);
  if (spec[3]) f.frequency.exponentialRampToValueAtTime(Math.min(20000, spec[3] * p), t + d);
  if (spec[2]) f.Q.value = spec[2];
  src.connect(f);
  return f;
}

function finish(nodes, src) {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch (e) {
        /* ignore */
      }
    }
  };
}

// Tone: {w, f, f1, fd, lin, pts:[[dt,f]], t, d, g, a, e, vib:[rate,hz], flt:[type,f,Q,f1], dist, am, ai, to}
function T(c, o) {
  const ctx = c.ctx;
  const p = c.p || 1;
  const t = c.t + (o.t || 0);
  const d = o.d || 0.1;
  const osc = ctx.createOscillator();
  setWave(osc, o.w || 'square', c.R);
  const fq = osc.frequency;
  fq.setValueAtTime(Math.max(1, (o.f || 440) * p), t);
  if (o.f1) {
    const f1 = Math.max(1, o.f1 * p);
    const te = t + (o.fd || d);
    if (o.lin) fq.linearRampToValueAtTime(f1, te);
    else fq.exponentialRampToValueAtTime(f1, te);
  }
  if (o.pts) for (const [dt, f] of o.pts) fq.exponentialRampToValueAtTime(Math.max(1, f * p), t + dt);
  const nodes = [osc];
  let lfo;
  if (o.vib) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib[0];
    const lg = ctx.createGain();
    lg.gain.value = o.vib[1] * p;
    lfo.connect(lg);
    lg.connect(fq);
    lfo.start(t);
    lfo.stop(t + d + 0.05);
    nodes.push(lfo, lg);
  }
  let node = filt(c, o.flt, t, d, p, osc);
  if (node !== osc) nodes.push(node);
  if (o.dist) {
    const ws = ctx.createWaveShaper();
    ws.curve = c.R.curve;
    node.connect(ws);
    node = ws;
    nodes.push(ws);
  }
  const am = amStage(c, o, t, node);
  if (am !== node) nodes.push(am);
  const g = ctx.createGain();
  shape(g.gain, t, d, (o.g == null ? 0.5 : o.g) * (c.g == null ? 1 : c.g), o.a == null ? 0.002 : o.a, o.e);
  am.connect(g);
  g.connect(o.to || c.out);
  nodes.push(g);
  osc.start(t);
  osc.stop(t + d + 0.05);
  finish(nodes, osc);
}

// Noise: {b:'white'|'crunch'|'metal', r, r1, t, d, g, a, e, ft, ff, ff1, q, am, ai, to}
function N(c, o) {
  const ctx = c.ctx;
  const p = c.p || 1;
  const t = c.t + (o.t || 0);
  const d = o.d || 0.1;
  const src = ctx.createBufferSource();
  const buf = c.R[o.b || 'white'];
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.setValueAtTime((o.r || 1) * p, t);
  if (o.r1) src.playbackRate.exponentialRampToValueAtTime(o.r1 * p, t + d);
  const nodes = [src];
  let node = src;
  if (o.ft) {
    node = filt(c, [o.ft, o.ff || 1000, o.q, o.ff1], t, d, p, src);
    nodes.push(node);
  }
  const am = amStage(c, o, t, node);
  if (am !== node) nodes.push(am);
  const g = ctx.createGain();
  shape(g.gain, t, d, (o.g == null ? 0.5 : o.g) * (c.g == null ? 1 : c.g), o.a == null ? 0.001 : o.a, o.e);
  am.connect(g);
  g.connect(o.to || c.out);
  nodes.push(g);
  src.start(t, Math.random() * buf.duration * 0.5);
  src.stop(t + d + 0.05);
  finish(nodes, src);
}

const steps = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

// ---------------------------------------------------------------------------
// Drum kit (noise channel). Uppercase = accent.
// ---------------------------------------------------------------------------
const tom = (f) => (c) => {
  T(c, { w: 'tri8', f, f1: f * 0.55, d: 0.26, g: 0.7 });
  N(c, { d: 0.05, g: 0.15, ft: 'lowpass', ff: 2500 });
};
const DRUM = {
  k: (c) => {
    T(c, { w: 's', f: 180, f1: 46, fd: 0.09, d: 0.28, g: 1 });
    T(c, { w: 'tri8', f: 140, f1: 70, d: 0.06, g: 0.45 });
    N(c, { d: 0.012, g: 0.28, ft: 'highpass', ff: 1800 });
  },
  s: (c) => {
    N(c, { d: 0.17, g: 0.5, ft: 'highpass', ff: 1100 });
    N(c, { b: 'crunch', d: 0.09, g: 0.3, ft: 'bandpass', ff: 2200, q: 0.8 });
    T(c, { w: 'tri8', f: 250, f1: 150, d: 0.08, g: 0.5 });
  },
  g: (c) => {
    N(c, { d: 0.07, g: 0.18, ft: 'highpass', ff: 1500 });
  },
  h: (c) => N(c, { d: 0.04, g: 0.22, ft: 'highpass', ff: 7500 }),
  o: (c) => N(c, { d: 0.26, g: 0.2, ft: 'highpass', ff: 6500 }),
  c: (c) => {
    N(c, { d: 1.2, g: 0.32, ft: 'highpass', ff: 3800 });
    N(c, { b: 'metal', r: 3, d: 0.6, g: 0.07, ft: 'highpass', ff: 3000 });
  },
  y: (c) => {
    N(c, { b: 'metal', r: 4.5, d: 0.45, g: 0.1, ft: 'bandpass', ff: 6000, q: 1 });
    N(c, { d: 0.3, g: 0.07, ft: 'highpass', ff: 8000 });
  },
  l: tom(105),
  m: tom(150),
  t: tom(215),
  x: (c) => {
    for (let i = 0; i < 3; i++) N(c, { t: i * 0.011, d: 0.02, g: 0.4, ft: 'bandpass', ff: 1300, q: 1.4 });
    N(c, { t: 0.033, d: 0.14, g: 0.35, ft: 'bandpass', ff: 1200, q: 1.2 });
  },
  n: (c) => N(c, { b: 'metal', r: 1.5, d: 0.09, g: 0.32, ft: 'bandpass', ff: 2500, q: 2 }),
  b: (c) => {
    N(c, { b: 'metal', r: 0.7, d: 0.13, g: 0.55, ft: 'lowpass', ff: 2600 });
    T(c, { w: 's', f: 130, f1: 55, d: 0.13, g: 0.7 });
    T(c, { w: 'p50', f: 92, f1: 70, d: 0.08, g: 0.12 });
  },
  q: (c) => {
    T(c, { w: 'p50', f: 260, d: 0.035, g: 0.2 });
    N(c, { b: 'metal', r: 1.1, d: 0.045, g: 0.28, ft: 'bandpass', ff: 1500, q: 3 });
  },
  w: (c) => {
    T(c, { w: 'square', f: 545, d: 0.22, g: 0.13, flt: ['bandpass', 1800, 1] });
    T(c, { w: 'square', f: 815, d: 0.22, g: 0.13, flt: ['bandpass', 1800, 1] });
  },
  p: (c) => {
    T(c, { w: 'q', f: 988, d: 0.11, g: 0.32, e: 'hold' });
    T(c, { w: 'p50', f: 988, d: 0.11, g: 0.04, e: 'hold' });
  },
  v: (c) => N(c, { d: 0.9, g: 0.32, ft: 'bandpass', ff: 380, ff1: 1500, q: 1.5, e: 'swell' }),
  u: (c) => N(c, { d: 0.85, g: 0.26, ft: 'bandpass', ff: 1400, ff1: 280, q: 1.2, a: 0.08 }),
  f: (c) => {
    T(c, { w: 'square', f: 1700, d: 0.025, g: 0.08 });
    N(c, { d: 0.022, g: 0.22, ft: 'bandpass', ff: 3500, q: 2 });
  },
  j: (c) => N(c, { d: 0.05, g: 0.11, a: 0.015, ft: 'highpass', ff: 6000 }),
  d: (c) => {
    T(c, { w: 's', f: 170, f1: 55, d: 0.14, g: 0.8 });
    N(c, { d: 0.06, g: 0.45, ft: 'lowpass', ff: 900 });
    N(c, { d: 0.015, g: 0.3, ft: 'highpass', ff: 3000 });
  },
  e: (c) => {
    T(c, { w: 's', f: 1319, d: 1.1, g: 0.2 });
    T(c, { w: 's', f: 2638, d: 0.4, g: 0.05 });
  },
  '*': (c) => N(c, { b: 'crunch', d: 0.08, g: 0.32, ft: 'lowpass', ff: 650, a: 0.012 }),
  '~': (c) => N(c, { d: 1.7, g: 0.26, ft: 'bandpass', ff: 280, ff1: 1100, q: 2, e: 'swell' }),
  '!': (c) => {
    N(c, { d: 0.07, g: 0.5, ft: 'lowpass', ff: 1800 });
    T(c, { w: 's', f: 320, f1: 90, d: 0.1, g: 0.55 });
    T(c, { t: 0.05, w: 's', f: 720, f1: 210, d: 0.12, g: 0.22 });
  },
};

// ---------------------------------------------------------------------------
// Note-string notation (an MML dialect), chords and patterns
// ---------------------------------------------------------------------------
// MML:  c d e f g a b [+ # -] [len] [.]   notes (o4 c = middle C)
//       r rest   ^len tie-extend   & legato into next   _ glide into next note
//       o4 octave   < > octave down/up   l8 default length   v0-15 volume
//       @0/1/2 duty 12.5/25/50%  @t triangle   n# envelope   y# vibrato cents
//       q1-8 gate   k# transpose   [ ... ]n repeat   {ceg}4 fast arp chord
//       note* tremolo (32nds)   note~ force vibrato   | bar check   $x macro
// Lengths: 1 2 4 8 16 32 (3 6 12 24 = triplets).
//
// Chords: 'Am F C G7' one token per bar; 'F,G' splits a bar; '%' repeats.
// Degree patterns (bass/harm): one char per step, bars separated by spaces.
//   1 root, 3 third, 5 fifth, 7 seventh, 8 octave, 9 third+8, 0 fifth+8,
//   q fifth below, 2 4 6 scale steps, b flat-7 below, a approach to next chord,
//   x arpeggiated chord, X chord + octave, - sustain, . rest, _ empty bar.
// Drum lanes: one char per step (see DRUM), uppercase = accent, 'g' ghost.

const ENVS = [
  // [attack, decayTime, sustain, release]  attack < 0 = swell
  [0.003, 0, 1, 0.03], // 0 organ / flat
  [0.003, 0.2, 0.62, 0.06], // 1 lead
  [0.002, 0.09, 0, 0.02], // 2 staccato blip
  [0.03, 0.3, 0.75, 0.15], // 3 soft
  [0.002, 0.6, 0.1, 0.12], // 4 bell / music box
  [-1, 0, 1, 0.08], // 5 swell
  [0.002, 0.06, 0.35, 0.04], // 6 punchy short
  [0.004, 0.35, 0.4, 0.2], // 7 e-piano
];

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11], maj7: [0, 4, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
  dim: [0, 3, 6], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10], aug: [0, 4, 8],
  sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus4': [0, 5, 7, 10], 9: [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14], M9: [0, 4, 7, 11, 14], add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14], '7b9': [0, 4, 7, 10, 13],
};

function parseChord(s) {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(s);
  if (!m || !QUAL[m[3]]) return null;
  const pc = (L, acc) => (SEMI[L.toLowerCase()] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  return { r: pc(m[1], m[2]), iv: QUAL[m[3]], bass: m[4] ? pc(m[4], m[5]) : null, name: s };
}

function chordLine(str, bars, barT, warn) {
  const toks = String(str || 'C').trim().split(/\s+/);
  const out = [];
  let prev = parseChord('C');
  for (let b = 0; b < bars; b++) {
    const parts = toks[b % toks.length].split(',');
    parts.forEach((p, i) => {
      let c = p === '%' ? prev : parseChord(p);
      if (!c) {
        warn('bad chord ' + p);
        c = prev;
      }
      prev = c;
      out.push({ t: b * barT + Math.round((i * barT) / parts.length), c });
    });
  }
  return out;
}
function chordAt(line, t) {
  let c = line[0];
  for (const e of line) {
    if (e.t <= t) c = e;
    else break;
  }
  return c.c;
}
function chordAfter(line, t) {
  for (const e of line) if (e.t > t) return e.c;
  return line[0].c;
}
const place = (pc, lo) => lo + pcOf(pc - lo);

function expandLoops(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/\[([^[\]]*)\](\d*)/g, (_, b, n) => Array(n ? +n : 2).fill(b).join(' ') + ' ');
  } while (s !== prev);
  return s;
}
function expandMacros(s, M) {
  for (let k = 0; k < 5 && s.indexOf('$') >= 0; k++) s = s.replace(/\$(\w)/g, (_, n) => ' ' + ((M && M[n]) || '') + ' ');
  return s;
}

function parseMML(src, M, inst, barT, warn) {
  const s = expandLoops(expandMacros(String(src || ''), M));
  const out = [];
  let i = 0;
  let t = 0;
  let oct = 4;
  let len = WHOLE / 8;
  let vol = 15;
  let w = inst.w;
  let e = inst.e;
  let y = inst.y;
  let q = inst.q;
  let kx = 0;
  let slide = false;
  let tie = false;
  let last = null;
  let prevM = null;
  const digits = () => {
    const j0 = i;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') i++;
    return i > j0 ? +s.slice(j0, i) : null;
  };
  const sint = () => {
    let sg = 1;
    if (s[i] === '-') {
      sg = -1;
      i++;
    } else if (s[i] === '+') i++;
    const n = digits();
    return n == null ? 0 : sg * n;
  };
  const dur = (def) => {
    const n = digits();
    let d = def;
    if (n) {
      d = WHOLE / n;
      if (WHOLE % n) warn('odd length ' + n);
    }
    let add = d;
    while (s[i] === '.') {
      add /= 2;
      d += add;
      i++;
    }
    return Math.round(d);
  };
  const pushNote = (m, d, arp) => {
    let trem = false;
    let vib = y;
    while (s[i] === '*' || s[i] === '~') {
      if (s[i] === '*') trem = true;
      else vib = Math.max(y, 22);
      i++;
    }
    if (tie && !slide && last && last.m === m && last.t + last.d === t && !arp) {
      last.d += d;
    } else {
      if (slide && last && last.t + last.d === t) last.leg = true;
      last = { t, d, m, v: vol, w, e, y: vib, q, s: slide && prevM != null && !arp ? prevM : null, a: arp || null, trem, leg: false };
      out.push(last);
    }
    prevM = m;
    tie = false;
    slide = false;
    t += d;
  };
  while (i < s.length) {
    const ch = s[i++];
    if (ch <= ' ') continue;
    if (ch >= 'a' && ch <= 'g') {
      let m = 12 * (oct + 1) + SEMI[ch] + kx;
      while (s[i] === '+' || s[i] === '#' || s[i] === '-') m += s[i++] === '-' ? -1 : 1;
      pushNote(m, dur(len));
    } else if (ch === 'r') {
      t += dur(len);
      tie = false;
      slide = false;
    } else if (ch === '^') {
      const d = dur(len);
      if (last && last.t + last.d === t) last.d += d;
      t += d;
    } else if (ch === '&') {
      if (last) last.leg = true;
      tie = true;
    } else if (ch === '_') slide = true;
    else if (ch === 'o') oct = digits() ?? 4;
    else if (ch === '<') oct--;
    else if (ch === '>') oct++;
    else if (ch === 'l') len = dur(len);
    else if (ch === 'v') vol = clamp(digits() ?? 15, 0, 15);
    else if (ch === '@') {
      if (s[i] === 't' || s[i] === 's' || s[i] === 'q') w = s[i++];
      else w = clamp(digits() ?? 2, 0, 2);
    } else if (ch === 'n') e = clamp(digits() ?? 1, 0, ENVS.length - 1);
    else if (ch === 'y') y = digits() ?? 0;
    else if (ch === 'q') q = clamp(digits() ?? 7, 1, 8) / 8;
    else if (ch === 'k') kx = sint();
    else if (ch === '{') {
      const ms = [];
      while (i < s.length && s[i] !== '}') {
        const c2 = s[i++];
        if (c2 === '<') oct--;
        else if (c2 === '>') oct++;
        else if (c2 >= 'a' && c2 <= 'g') {
          let m = 12 * (oct + 1) + SEMI[c2] + kx;
          while (s[i] === '+' || s[i] === '#' || s[i] === '-') m += s[i++] === '-' ? -1 : 1;
          while (ms.length && m <= ms[ms.length - 1]) m += 12;
          ms.push(m);
        }
      }
      i++;
      if (!ms.length) {
        warn('empty arp');
        continue;
      }
      pushNote(ms[0], dur(len), ms.map((m) => m - ms[0]));
    } else if (ch === '|') {
      if (t % barT) warn('bar check failed at tick ' + t + ' (bar ' + (t / barT + 1).toFixed(2) + ')');
    } else warn('unknown char "' + ch + '"');
  }
  // expand tremolo notes into 32nd-note repeats
  const res2 = [];
  for (const n of out) {
    if (!n.trem) {
      res2.push(n);
      continue;
    }
    for (let k = 0; k < n.d; k += 6) res2.push({ ...n, t: n.t + k, d: Math.min(6, n.d - k), e: 2, q: 0.75, y: 0, s: null, trem: true });
  }
  return { notes: res2, len: t };
}

function degree(chr, ch, nxt, lo, useBass) {
  const c = ch;
  const r = place(useBass && c.bass != null ? c.bass : c.r, lo);
  const root = place(c.r, lo);
  const third = c.iv[1] == null ? 4 : c.iv[1];
  const fifth = c.iv[2] == null ? 7 : c.iv[2];
  const sev = c.iv[3] == null ? 10 : c.iv[3];
  switch (chr) {
    case '1': return r;
    case '8': return r + 12;
    case '3': return root + third;
    case '5': return root + fifth;
    case '7': return root + sev;
    case '9': return root + third + 12;
    case '0': return root + fifth + 12;
    case 'q': return root + fifth - 12;
    case '2': return root + 2;
    case '4': return root + 5;
    case '6': return root + 9;
    case 'b': return root - 2;
    case 'a': return place(nxt.r, lo) - 1;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Track compiler: sections -> flat sorted event list
// ---------------------------------------------------------------------------
const DEF_INST = {
  L: { w: 2, e: 1, v: 1, y: 12, q: 0.92 },
  H: { w: 1, e: 1, v: 1, y: 0, q: 0.9, lo: 55 },
  B: { w: 't', e: 0, v: 1, y: 0, q: 0.92, lo: 43 },
};
const MIX = { L: 0.15, H: 0.13, B: 0.2, D: 0.7, X: 0.1 }; // channel bus levels
const DUTY_GAIN = [1.9, 1.4, 1]; // thin pulses carry less energy: loudness compensation
const MUSIC_TRIM = 0.6; // overall music level into the limiter
const CACHE = {};
const WARN = [];
let ANALYZE = null; // validate(): collects strong-beat lead notes outside the chord

function resolveSec(def, name, depth = 0) {
  const s = def.S && def.S[name];
  if (!s || depth > 4) return null;
  if (!s.like) return s;
  const base = resolveSec(def, s.like, depth + 1) || {};
  return { ...base, ...s, like: undefined };
}

function compileSection(def, sec, t0, inst, ev, warn) {
  const beats = sec.beats || def.beats || 4;
  const barT = beats * PPQ;
  const bars = sec.n || 1;
  const total = bars * barT;
  const line = chordLine(sec.ch, bars, barT, warn);
  const auto = sec.auto != null ? sec.auto : def.auto != null ? def.auto : 'hob';
  const add = (o) => {
    o.t += t0;
    if (o.lmin == null) o.lmin = 0;
    if (o.lmax == null) o.lmax = 2;
    ev.push(o);
  };
  const noteEv = (n, c, ins, extra) => ({
    t: n.t, c, m: n.m, d: n.d, v: (n.v / 15) * ins.v, w: n.w, e: n.e, y: n.y,
    g: n.leg ? 1 : n.q, s: n.s, a: n.a, leg: n.leg, ...extra,
  });
  const mml = (src, ins, label) => {
    const r = parseMML(src, def.M, ins, barT, (m) => warn(label + ': ' + m));
    if (r.len !== total) warn(label + ': length ' + r.len / barT + ' bars, expected ' + bars);
    return r.notes.filter((n) => n.t < total);
  };
  const pattern = (pat, ins, c, lo, useBass, extra) => {
    const barsStr = String(pat).trim().split(/[\s|]+/);
    for (let b = 0; b < bars; b++) {
      const bs = barsStr[b % barsStr.length];
      if (bs === '_') continue;
      const st = barT / bs.length;
      for (let k = 0; k < bs.length; k++) {
        const chr = bs[k];
        if (chr === '-' || chr === '.') continue;
        let l = 1;
        while (k + l < bs.length && bs[k + l] === '-') l++;
        const t = b * barT + Math.round(k * st);
        const d = Math.round(l * st);
        const cur = chordAt(line, t);
        if (chr === 'x' || chr === 'X') {
          const a = cur.iv.slice();
          if (chr === 'X') a.push(12);
          add({ t, c, m: place(cur.r, lo), d, v: ins.v, w: ins.w, e: ins.e, y: 0, g: ins.q, a, ...extra });
        } else {
          const m = degree(chr, cur, chordAfter(line, t), lo, useBass);
          if (m == null) {
            warn('bad degree ' + chr);
            continue;
          }
          add({ t, c, m, d, v: ins.v, w: ins.w, e: ins.e, y: ins.y, g: ins.q, ...extra });
        }
      }
    }
  };
  const drums = (lanes, extra) => {
    for (const lane of [].concat(lanes || [])) {
      const barsStr = String(lane).trim().split(/[\s|]+/);
      for (let b = 0; b < bars; b++) {
        const bs = barsStr[b % barsStr.length];
        if (bs === '_') continue;
        const st = barT / bs.length;
        for (let k = 0; k < bs.length; k++) {
          const chr = bs[k];
          if (chr === '.' || chr === '-') continue;
          const low = chr.toLowerCase();
          if (!DRUM[low]) {
            warn('unknown drum ' + chr);
            continue;
          }
          const acc = chr !== low;
          add({ t: b * barT + Math.round(k * st), c: 'D', k: low, v: acc ? 1 : 0.8, ...extra });
        }
      }
    }
  };

  // lead + automatic intensity layers derived from it
  if (sec.L) {
    const notes = mml(sec.L, inst.L, 'lead');
    for (const n of notes) add(noteEv(n, 'L', inst.L));
    const real = notes.filter((n) => !n.a && !n.trem);
    if (ANALYZE) {
      for (const n of real) {
        if (n.d < PPQ || n.t % (PPQ * 2)) continue;
        const ch = chordAt(line, n.t);
        const iv = pcOf(n.m - ch.r);
        if (!ch.iv.some((x) => pcOf(x) === iv)) ANALYZE.push(`bar ${Math.floor((t0 + n.t) / barT) + 1} beat ${(n.t % barT) / PPQ + 1}: note pc+${iv} over ${ch.name}`);
      }
    }
    if (auto.includes('h')) {
      for (const n of real) {
        const ch = chordAt(line, n.t);
        const pcs = ch.iv.map((x) => (ch.r + x) % 12);
        let hm = null;
        for (let m = n.m - 3; m > n.m - 12; m--) {
          if (pcs.includes(pcOf(m))) {
            hm = m;
            break;
          }
        }
        if (hm != null) add({ ...noteEv(n, 'X', inst.L), m: hm, w: 0, v: (n.v / 15) * 0.85, s: null, y: 0, lmin: 1 });
      }
    }
    if (auto.includes('o')) {
      for (const n of real) {
        const om = n.m < 79 ? n.m + 12 : n.m - 12;
        add({ ...noteEv(n, 'X', inst.L), m: om, s: n.s == null ? null : n.s + (om - n.m), w: 0, v: (n.v / 15) * 0.55, lmin: 2 });
      }
    }
  }
  // harmony channel: MML or chord pattern
  if (sec.H) for (const n of mml(sec.H, inst.H, 'harm')) add(noteEv(n, 'H', inst.H));
  if (sec.A) pattern(sec.A, inst.H, 'H', inst.H.lo, false, {});
  // bass channel
  if (sec.B) for (const n of mml(sec.B, inst.B, 'bass')) add(noteEv(n, 'B', inst.B));
  if (sec.P) pattern(sec.P, inst.B, 'B', inst.B.lo, true, {});
  if (auto.includes('b')) {
    const bp = sec.BP || def.bp || '1.'.repeat(beats * 2);
    pattern(bp, { w: 1, e: 2, v: 0.75, y: 0, q: 0.6 }, 'X', inst.B.lo + 12, true, { lmin: 2 });
  }
  // drums + intensity drum layers
  drums(sec.D, {});
  if (!def.once) {
    drums(sec.D1 || def.d1 || ['..k...g...k...g.'.slice(0, beats * 4)], { lmin: 1 });
    drums(sec.D2 || def.d2 || ['.h'.repeat(beats * 2)], { lmin: 2 });
  }
  return total;
}

function compile(id) {
  if (CACHE[id]) return CACHE[id];
  const def = TRACKS[id];
  if (!def) return null;
  const warn = (m) => WARN.push(id + ': ' + m);
  const inst = {
    L: { ...DEF_INST.L, ...def.iL },
    H: { ...DEF_INST.H, ...def.iH },
    B: { ...DEF_INST.B, ...def.iB },
  };
  const ev = [];
  let tick = 0;
  const run = (name) => {
    const sec = resolveSec(def, name);
    if (!sec) {
      warn('missing section ' + name);
      return;
    }
    tick += compileSection(def, sec, tick, inst, ev, warn);
  };
  for (const s of def.intro || '') run(s);
  const loopT = tick;
  for (const s of def.order || 'A') run(s);
  ev.sort((a, b) => a.t - b.t);
  let loopI = ev.findIndex((e) => e.t >= loopT);
  if (loopI < 0) loopI = ev.length;
  const c = {
    ev, loopT, endT: tick, loopI,
    spt: 60 / ((def.bpm || 120) * PPQ),
    sw: def.swing || 0,
    su: def.su === 16 ? PPQ / 2 : PPQ,
    arpHz: def.arp || 30,
    once: !!def.once,
    echo: def.echo || null,
    mix: def.mix || null,
  };
  CACHE[id] = c;
  return c;
}

// ---------------------------------------------------------------------------
// Sequencer / player (one per playing song; lookahead scheduled)
// ---------------------------------------------------------------------------
class Player {
  constructor(ctx, dest, id, opts = {}) {
    this.ctx = ctx;
    this.R = res(ctx);
    this.id = id;
    this.c = compile(id);
    this.once = this.c.once;
    this.fixed = this.once ? 0 : opts.level;
    this.t0 = opts.at != null ? opts.at : ctx.currentTime + 0.06;
    this.i = 0;
    this.base = 0;
    this.beat = -1;
    this.lvl = 0;
    this.dead = false;
    this.done = false;
    this.nodes = [];
    const out = (this.out = ctx.createGain());
    out.gain.value = TRACKS[id].gain || 1;
    out.connect(dest);
    this.bus = {};
    for (const k of Object.keys(MIX)) {
      const b = ctx.createGain();
      b.gain.value = MIX[k] * ((this.c.mix && this.c.mix[k]) || 1);
      b.connect(out);
      this.bus[k] = b;
      this.nodes.push(b);
    }
    if (this.c.echo) {
      const [dt, fb, wet] = this.c.echo;
      const d = ctx.createDelay(1.5);
      d.delayTime.value = Math.min(1.4, dt * this.c.spt);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2800;
      const f = ctx.createGain();
      f.gain.value = fb;
      const wg = ctx.createGain();
      wg.gain.value = wet;
      this.bus.L.connect(d);
      d.connect(lp);
      lp.connect(f);
      f.connect(d);
      lp.connect(wg);
      wg.connect(out);
      this.nodes.push(d, lp, f, wg);
    }
    this.drumC = { ctx, R: this.R, out: this.bus.D, t: 0, p: 1, g: 1 };
  }

  warp(tick) {
    const sw = this.c.sw;
    if (!sw) return tick;
    const u = this.c.su;
    const k = Math.floor(tick / u);
    const f = (tick - k * u) / u;
    return k * u + u * (f < 0.5 ? (f * sw) / 0.5 : sw + ((f - 0.5) * (1 - sw)) / 0.5);
  }

  time(tick) {
    return this.t0 + this.warp(tick) * this.c.spt;
  }

  schedule(until) {
    if (this.dead || this.done) return;
    const c = this.c;
    const ev = c.ev;
    const now = this.ctx.currentTime;
    for (let guard = 0; guard < 4000; guard++) {
      if (this.i >= ev.length) {
        if (!this.once && c.endT > c.loopT && c.loopI < ev.length) {
          this.base += c.endT - c.loopT;
          this.i = c.loopI;
          continue;
        }
        this.done = true;
        this.endAt = this.time(this.base + c.endT) + 1.5;
        return;
      }
      const e = ev[this.i];
      const at = this.base + e.t;
      let t = this.time(at);
      if (t > until) return;
      if (t < now - 0.1) {
        // fell behind (main thread hitch): slide the timeline instead of bursting notes
        this.t0 += now - t + 0.03;
        t = this.time(at);
      }
      const beat = Math.floor(at / PPQ);
      if (beat !== this.beat) {
        this.beat = beat;
        this.lvl = this.fixed != null ? this.fixed : S.intensity;
      }
      if (this.lvl >= e.lmin && this.lvl <= e.lmax) {
        try {
          this.play(e, at, t);
        } catch (err) {
          /* never let one bad note kill the song */
        }
      }
      this.i++;
    }
  }

  play(e, at, t) {
    if (e.k) {
      const dc = this.drumC;
      dc.t = t;
      dc.g = e.v;
      DRUM[e.k](dc);
      return;
    }
    const tEnd = this.time(at + e.d);
    const t1 = e.leg ? tEnd : t + (tEnd - t) * e.g;
    this.note(e, t, Math.max(t + 0.02, t1));
  }

  note(e, t0, t1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    setWave(o, e.w, this.R);
    const f = mtof(e.m);
    const fq = o.frequency;
    if (e.s != null) {
      fq.setValueAtTime(mtof(e.s), t0);
      fq.exponentialRampToValueAtTime(f, t0 + Math.min(0.3, (t1 - t0) * 0.4));
    } else fq.setValueAtTime(f, t0);
    if (e.a) {
      const st = 1 / this.c.arpHz;
      const n = Math.min(400, Math.ceil((t1 - t0) / st));
      for (let k = 1; k < n; k++) fq.setValueAtTime(f * Math.pow(2, e.a[k % e.a.length] / 12), t0 + k * st);
    }
    if (e.y && t1 - t0 > 0.24) {
      const vs = t0 + 0.13;
      const vd = t1 - vs;
      const n = Math.max(2, Math.ceil(vd * 80));
      const cv = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const tt = (k / (n - 1)) * vd;
        cv[k] = e.y * Math.min(1, tt / 0.2) * Math.sin(2 * Math.PI * 5.5 * tt);
      }
      o.detune.setValueCurveAtTime(cv, vs, vd);
    }
    const g = ctx.createGain();
    const E = ENVS[e.e] || ENVS[0];
    const gp = g.gain;
    const pk = Math.max(0.0001, e.v * (typeof e.w === 'number' ? DUTY_GAIN[e.w] || 1 : 1));
    const dur = t1 - t0;
    gp.setValueAtTime(0, t0);
    if (E[0] < 0) gp.linearRampToValueAtTime(pk, t0 + dur * 0.7);
    else {
      const a = Math.min(E[0], dur * 0.3);
      gp.linearRampToValueAtTime(pk, t0 + a);
      if (E[1] > 0) gp.setTargetAtTime(pk * E[2], t0 + a, E[1] / 3);
    }
    gp.setTargetAtTime(0, t1, E[3] / 3);
    o.connect(g);
    g.connect(this.bus[e.c] || this.bus.L);
    o.start(t0);
    o.stop(t1 + E[3] * 2.5 + 0.02);
    o.onended = () => {
      try {
        o.disconnect();
        g.disconnect();
      } catch (err) {
        /* ignore */
      }
    };
  }

  stop(fade) {
    if (this.dead) return;
    this.dead = true;
    const now = this.ctx.currentTime;
    const gp = this.out.gain;
    try {
      gp.cancelScheduledValues(now);
      gp.setValueAtTime(gp.value, now);
      gp.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    } catch (err) {
      /* ignore */
    }
    // never started (rapid switching): drop it right away
    this.deadAt = now < this.t0 - 0.02 ? now : now + Math.max(0.01, fade) + 0.3;
  }

  gone(now) {
    return (this.dead && now > this.deadAt) || (this.done && now > this.endAt);
  }

  dispose() {
    for (const n of [this.out, ...this.nodes]) {
      try {
        n.disconnect();
      } catch (err) {
        /* ignore */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// SFX
// ---------------------------------------------------------------------------
const crackle = () => steps(26, () => (Math.random() < 0.6 ? 0.3 + Math.random() * 0.7 : 0));
const flutter = (n) => steps(n, () => 0.2 + Math.random() * 0.8);

const SFX = {
  hitL: (c) => {
    N(c, { d: 0.06, g: 0.45, ft: 'bandpass', ff: 2800, q: 0.7 });
    T(c, { w: 's', f: 260, f1: 80, d: 0.09, g: 0.75 });
    T(c, { w: 'p25', f: 520, f1: 180, d: 0.035, g: 0.16 });
    return 0.12;
  },
  hitM: (c) => {
    N(c, { d: 0.11, g: 0.55, ft: 'lowpass', ff: 5000, ff1: 900 });
    N(c, { b: 'crunch', d: 0.08, g: 0.32, ft: 'bandpass', ff: 1400, q: 0.9 });
    T(c, { w: 's', f: 190, f1: 52, d: 0.17, g: 0.9 });
    T(c, { w: 'p25', f: 340, f1: 90, d: 0.06, g: 0.18 });
    return 0.2;
  },
  hitH: (c) => {
    N(c, { d: 0.2, g: 0.62, ft: 'lowpass', ff: 6000, ff1: 600 });
    N(c, { b: 'crunch', d: 0.16, g: 0.45, ft: 'lowpass', ff: 2600 });
    T(c, { w: 's', f: 150, f1: 36, d: 0.3, g: 1 });
    T(c, { w: 'sawtooth', f: 240, f1: 45, d: 0.14, g: 0.22, flt: ['lowpass', 1600] });
    T(c, { w: 'square', f: 90, f1: 40, d: 0.1, g: 0.12, dist: true });
    return 0.34;
  },
  block: (c) => {
    N(c, { d: 0.035, g: 0.5, ft: 'highpass', ff: 2500 });
    T(c, { w: 'p25', f: 1100, f1: 700, d: 0.04, g: 0.2 });
    T(c, { w: 's', f: 240, f1: 130, d: 0.06, g: 0.5 });
    return 0.08;
  },
  whiffL: (c) => {
    N(c, { d: 0.14, g: 0.36, ft: 'bandpass', ff: 700, ff1: 2200, q: 1.6, e: 'swell' });
    return 0.15;
  },
  whiffH: (c) => {
    N(c, { d: 0.2, g: 0.42, ft: 'bandpass', ff: 1100, ff1: 4200, q: 1.4, e: 'swell' });
    N(c, { t: 0.05, d: 0.12, g: 0.14, ft: 'highpass', ff: 5000 });
    return 0.22;
  },
  jump: (c) => {
    T(c, { w: 'p25', f: 220, f1: 660, d: 0.14, g: 0.28, e: 'lin' });
    N(c, { d: 0.05, g: 0.12, ft: 'bandpass', ff: 1500, ff1: 3000, q: 1 });
    return 0.15;
  },
  land: (c) => {
    T(c, { w: 's', f: 140, f1: 50, d: 0.1, g: 0.75 });
    N(c, { d: 0.07, g: 0.3, ft: 'lowpass', ff: 1200 });
    return 0.12;
  },
  dash: (c) => {
    N(c, { d: 0.18, g: 0.42, ft: 'bandpass', ff: 3200, ff1: 700, q: 1.2, a: 0.01 });
    T(c, { w: 'p12', f: 300, f1: 900, d: 0.06, g: 0.12 });
    return 0.2;
  },
  projectile: (c) => {
    N(c, { d: 0.3, g: 0.35, ft: 'bandpass', ff: 1800, ff1: 500, q: 2, a: 0.02 });
    T(c, { w: 'p25', f: 880, f1: 220, d: 0.25, g: 0.17, vib: [30, 40] });
    return 0.32;
  },
  zap: (c) => {
    T(c, { w: 's', f: 300, f1: 2600, d: 0.22, g: 0.22, e: 'rev' });
    T(c, { t: 0.22, w: 's', f: 120, f1: 40, d: 0.25, g: 0.95 });
    N(c, { t: 0.22, d: 0.52, g: 0.55, ft: 'bandpass', ff: 3000, q: 0.7, am: crackle(), ai: 0.02 });
    T(c, { t: 0.22, w: 'sawtooth', f: 60, d: 0.48, g: 0.3, am: crackle(), ai: 0.02, flt: ['highpass', 350] });
    T(c, { t: 0.22, w: 'p12', f: 1200, f1: 300, d: 0.3, g: 0.08 });
    return 0.78;
  },
  parry: (c) => {
    N(c, { d: 0.09, g: 0.35, ft: 'bandpass', ff: 3000, ff1: 8000, q: 1.5 });
    T(c, { w: 's', f: 1760, d: 0.45, g: 0.3 });
    T(c, { w: 'tri8', f: 2637, d: 0.35, g: 0.17 });
    T(c, { t: 0.03, w: 's', f: 3520, d: 0.25, g: 0.12 });
    return 0.5;
  },
  perfect: (c) => {
    [2093, 2637, 3136, 4186, 5274].forEach((f, i) =>
      T(c, { t: i * 0.045, w: i % 2 ? 's' : 'tri8', f, d: 0.55 - i * 0.05, g: 0.17 }),
    );
    N(c, { d: 0.5, g: 0.06, ft: 'highpass', ff: 9000 });
    return 0.62;
  },
  impact: (c) => {
    N(c, { d: 0.55, g: 0.5, ft: 'lowpass', ff: 200, ff1: 3200, q: 4, e: 'rev' });
    T(c, { w: 'sawtooth', f: 50, f1: 160, d: 0.55, g: 0.22, e: 'rev', flt: ['lowpass', 700] });
    return 0.6;
  },
  impactHit: (c) => {
    T(c, { w: 's', f: 110, f1: 28, d: 0.6, g: 1 });
    N(c, { b: 'crunch', d: 0.45, g: 0.7, ft: 'lowpass', ff: 3000, ff1: 300 });
    N(c, { d: 0.9, g: 0.28, ft: 'highpass', ff: 3500 });
    T(c, { w: 'sawtooth', f: 160, f1: 30, d: 0.3, g: 0.28, dist: true });
    return 0.9;
  },
  throw: (c) => {
    N(c, { d: 0.22, g: 0.36, ft: 'bandpass', ff: 2500, ff1: 600, q: 1.2, a: 0.03 });
    T(c, { t: 0.16, w: 's', f: 150, f1: 50, d: 0.14, g: 0.75 });
    N(c, { t: 0.16, d: 0.08, g: 0.3, ft: 'lowpass', ff: 1500 });
    return 0.32;
  },
  tech: (c) => {
    T(c, { w: 'square', f: 1500, f1: 1200, d: 0.025, g: 0.18 });
    N(c, { d: 0.03, g: 0.35, ft: 'highpass', ff: 3000 });
    T(c, { t: 0.05, w: 'square', f: 1900, f1: 1500, d: 0.03, g: 0.18 });
    N(c, { t: 0.05, d: 0.03, g: 0.35, ft: 'highpass', ff: 3500 });
    return 0.1;
  },
  ko: (c) => {
    SFX.hitH(c);
    T(c, { w: 's', f: 90, f1: 25, d: 0.9, g: 0.8 });
    N(c, { d: 1.4, g: 0.33, ft: 'highpass', ff: 3000 });
    N(c, { b: 'metal', r: 2.5, d: 0.8, g: 0.09, ft: 'highpass', ff: 2500 });
    return 1.4;
  },
  flatline: (c) => {
    T(c, { w: 'q', f: 988, d: 1.2, g: 0.34, e: 'hold', a: 0.01 });
    T(c, { w: 'p50', f: 988, d: 1.2, g: 0.05, e: 'hold', a: 0.01 });
    return 1.25;
  },
  beep: (c) => {
    T(c, { w: 'q', f: 988, d: 0.12, g: 0.34, e: 'hold' });
    T(c, { w: 'p50', f: 988, d: 0.12, g: 0.05, e: 'hold' });
    return 0.14;
  },
  heartbeat: (c) => {
    T(c, { w: 's', f: 75, f1: 40, d: 0.13, g: 0.95 });
    T(c, { w: 'tri8', f: 120, f1: 60, d: 0.06, g: 0.35 });
    T(c, { t: 0.2, w: 's', f: 65, f1: 38, d: 0.15, g: 0.75 });
    T(c, { t: 0.2, w: 'tri8', f: 100, f1: 55, d: 0.06, g: 0.28 });
    return 0.38;
  },
  super: (c) => {
    T(c, { w: 'sawtooth', f: 110, f1: 1760, d: 0.75, g: 0.17, e: 'rev', flt: ['lowpass', 3200] });
    T(c, { w: 'p25', f: 220, f1: 3520, d: 0.75, g: 0.11, e: 'rev', vib: [18, 30] });
    N(c, { d: 0.75, g: 0.3, ft: 'bandpass', ff: 500, ff1: 6000, q: 2, e: 'rev' });
    T(c, { t: 0.72, w: 's', f: 2637, d: 0.45, g: 0.2 });
    T(c, { t: 0.75, w: 's', f: 3951, d: 0.4, g: 0.13 });
    return 1.15;
  },
  superHit: (c) => {
    SFX.impactHit(c);
    N(c, { d: 0.25, g: 0.5, ft: 'lowpass', ff: 7000, ff1: 800 });
    T(c, { t: 0.01, w: 'p50', f: 70, f1: 30, d: 0.5, g: 0.16, dist: true });
    N(c, { d: 1.6, g: 0.28, ft: 'highpass', ff: 2500 });
    N(c, { b: 'metal', r: 2, d: 1.0, g: 0.08, ft: 'highpass', ff: 2000 });
    return 1.6;
  },
  select: (c) => {
    T(c, { w: 'p25', f: 988, d: 0.045, g: 0.22, e: 'hold' });
    return 0.06;
  },
  confirm: (c) => {
    T(c, { w: 'p25', f: 784, d: 0.06, g: 0.22, e: 'hold' });
    T(c, { t: 0.06, w: 'p25', f: 1175, d: 0.14, g: 0.22 });
    return 0.22;
  },
  cancel: (c) => {
    T(c, { w: 'p25', f: 494, d: 0.06, g: 0.22, e: 'hold' });
    T(c, { t: 0.06, w: 'p25', f: 330, d: 0.14, g: 0.22 });
    return 0.22;
  },
  coin: (c) => {
    N(c, { d: 0.04, g: 0.4, ft: 'bandpass', ff: 3000, q: 2 });
    N(c, { t: 0.06, d: 0.05, g: 0.4, ft: 'bandpass', ff: 2200, q: 2 });
    T(c, { t: 0.11, w: 'p50', f: 1319, d: 0.07, g: 0.18, e: 'hold' });
    T(c, { t: 0.18, w: 'p50', f: 1760, d: 0.5, g: 0.18 });
    [2637, 3322, 4186].forEach((f) => T(c, { t: 0.11, w: 's', f, d: 0.75, g: 0.09 }));
    return 0.9;
  },
  start: (c) => {
    [523, 659, 784, 1047].forEach((f, i) =>
      T(c, { t: i * 0.06, w: 'p50', f, d: i === 3 ? 0.4 : 0.06, g: 0.19, e: i === 3 ? 'exp' : 'hold' }),
    );
    T(c, { t: 0.18, w: 'p25', f: 1568, d: 0.35, g: 0.09 });
    return 0.6;
  },
  round: (c) => {
    [131, 196, 262, 392].forEach((f) => T(c, { w: 'sawtooth', f, d: 0.75, g: 0.09, a: 0.02, flt: ['lowpass', 2200] }));
    N(c, { d: 1.0, g: 0.24, ft: 'highpass', ff: 3500 });
    T(c, { w: 's', f: 100, f1: 40, d: 0.3, g: 0.75 });
    return 1.0;
  },
  timer: (c) => {
    T(c, { w: 'p50', f: 220, d: 0.05, g: 0.24, e: 'hold' });
    N(c, { d: 0.02, g: 0.25, ft: 'highpass', ff: 4000 });
    return 0.07;
  },
  dizzy: (c) => {
    for (let i = 0; i < 8; i++) {
      const hi = i % 2;
      T(c, { t: i * 0.12, w: 's', f: hi ? 2300 : 1800, f1: hi ? 3000 : 2500, d: 0.09, g: 0.14 });
    }
    T(c, { w: 'tri8', f: 600, d: 1, g: 0.05, vib: [9, 60], e: 'hold' });
    return 1.0;
  },
  burnout: (c) => {
    [392, 370, 349, 330].forEach((f, i) =>
      T(c, {
        t: i * 0.28, w: 'sawtooth', f, f1: i === 3 ? 290 : f * 0.97, d: i === 3 ? 0.75 : 0.26, g: 0.14,
        a: 0.03, e: 'hold', flt: ['lowpass', 1300], vib: i === 3 ? [6, 9] : null,
      }),
    );
    N(c, { d: 0.9, g: 0.18, ft: 'bandpass', ff: 3000, ff1: 600, q: 1, am: flutter(30), ai: 0.03 });
    return 1.6;
  },
  gurney: (c) => {
    N(c, { d: 1.0, g: 0.32, ft: 'bandpass', ff: 1500, q: 1.5, am: flutter(32), ai: 0.031, e: 'hold' });
    T(c, { w: 's', f: 1300, d: 1, g: 0.05, vib: [7, 150], e: 'hold' });
    T(c, { w: 'tri8', f: 55, d: 1, g: 0.28, e: 'hold', vib: [12, 6] });
    return 1.0;
  },
  splash: (c) => {
    N(c, { d: 0.45, g: 0.5, ft: 'lowpass', ff: 5000, ff1: 400, a: 0.005 });
    N(c, { d: 0.25, g: 0.25, ft: 'bandpass', ff: 1200, q: 3 });
    for (let i = 0; i < 5; i++) {
      T(c, { t: 0.05 + Math.random() * 0.3, w: 's', f: rnd(900, 2400), f1: rnd(2400, 3400), d: 0.04, g: 0.08 });
    }
    return 0.5;
  },
  slip: (c) => {
    T(c, { w: 's', f: 400, f1: 1800, d: 0.16, g: 0.3 });
    T(c, { w: 'p25', f: 800, f1: 2400, d: 0.12, g: 0.07 });
    N(c, { t: 0.1, d: 0.2, g: 0.25, ft: 'bandpass', ff: 2000, ff1: 600, q: 1.5 });
    return 0.32;
  },
  stamp: (c) => {
    T(c, { w: 's', f: 170, f1: 55, d: 0.14, g: 0.9 });
    N(c, { d: 0.06, g: 0.5, ft: 'lowpass', ff: 900 });
    N(c, { d: 0.015, g: 0.4, ft: 'highpass', ff: 3000 });
    T(c, { w: 'square', f: 80, f1: 50, d: 0.06, g: 0.12 });
    return 0.16;
  },
  cash: (c) => {
    for (let i = 0; i < 9; i++) {
      const t = Math.random() * 0.35;
      T(c, { t, w: 's', f: rnd(3000, 6000), d: 0.12, g: 0.08 });
      T(c, { t, w: 'tri8', f: rnd(2000, 4000), d: 0.08, g: 0.05 });
    }
    N(c, { d: 0.05, g: 0.15, ft: 'highpass', ff: 5000 });
    return 0.5;
  },
  teleport: (c) => {
    T(c, { w: 'p25', f: 300, f1: 1600, d: 0.5, g: 0.17, vib: [16, 120] });
    T(c, { w: 's', f: 600, f1: 3200, d: 0.5, g: 0.1, vib: [16, 240] });
    return 0.52;
  },
  gas: (c) => {
    N(c, { d: 0.9, g: 0.3, ft: 'highpass', ff: 3000, a: 0.08 });
    N(c, { d: 0.9, g: 0.1, ft: 'bandpass', ff: 6000, q: 3, a: 0.05 });
    return 0.9;
  },
  pill: (c) => {
    T(c, { w: 's', f: 450, f1: 1100, d: 0.05, g: 0.4 });
    N(c, { d: 0.012, g: 0.3, ft: 'highpass', ff: 3000 });
    return 0.07;
  },
  paper: (c) => {
    N(c, { d: 0.45, g: 0.3, ft: 'bandpass', ff: 3500, q: 0.8, am: flutter(18), ai: 0.025, e: 'hold' });
    return 0.45;
  },
  heal: (c) => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => T(c, { t: i * 0.09, w: 'tri8', f, d: 0.6, g: 0.16, a: 0.02 }));
    T(c, { w: 's', f: 262, f1: 523, d: 0.5, g: 0.08, e: 'swell' });
    return 1.0;
  },
  magnet: (c) => {
    T(c, { w: 'sawtooth', f: 55, d: 1.0, g: 0.22, e: 'swell', flt: ['lowpass', 200, 2, 1500], vib: [8, 3] });
    T(c, { w: 'sawtooth', f: 110.5, d: 1.0, g: 0.12, e: 'swell', flt: ['lowpass', 300, 1, 1200] });
    return 1.0;
  },
  wind: (c) => {
    N(c, { d: 1.3, g: 0.36, ft: 'bandpass', ff: 300, ff1: 900, q: 2.5, e: 'swell' });
    N(c, { d: 1.3, g: 0.1, ft: 'highpass', ff: 2000, e: 'swell' });
    return 1.3;
  },
  car: (c) => {
    for (const [t, d] of [[0, 0.32], [0.4, 0.26]]) {
      T(c, { t, w: 'square', f: 370, d, g: 0.13, e: 'hold', flt: ['lowpass', 2000] });
      T(c, { t, w: 'square', f: 466, d, g: 0.13, e: 'hold', flt: ['lowpass', 2000] });
    }
    T(c, { w: 'sawtooth', f: 38, f1: 70, d: 0.95, g: 0.26, e: 'hold', flt: ['lowpass', 420], vib: [14, 5] });
    return 0.95;
  },
  fish: (c) => {
    DRUM['!'](c);
    return 0.2;
  },
  crowd: (c) => {
    for (let i = 0; i < 3; i++) {
      N(c, { d: 1.3, g: 0.15, a: 0.25, ft: 'bandpass', ff: 600 + i * 550, q: 1.2, am: flutter(26), ai: 0.05 });
    }
    for (let i = 0; i < 4; i++) {
      T(c, { t: rnd(0.1, 0.5), w: 's', f: rnd(500, 800), f1: rnd(900, 1400), d: 0.4, g: 0.035, vib: [6, 20] });
    }
    return 1.3;
  },
  taunt: (c) => {
    for (const t of [0, 0.14]) T(c, { t, w: 'p50', f: 2093, d: 0.08, g: 0.15, e: 'hold' });
    return 0.25;
  },
};
// per-sound trims so heavy hits punch without slamming the limiter
const SFX_LVL = {
  hitL: 0.75, hitM: 0.7, hitH: 0.62, block: 0.9, impactHit: 0.55, ko: 0.5, superHit: 0.6, zap: 0.75,
  stamp: 0.65, land: 0.8, heartbeat: 0.8, round: 0.9, throw: 0.9,
  whiffL: 1.5, whiffH: 1.3, dash: 1.4, projectile: 1.3, crowd: 2.4, dizzy: 1.6, burnout: 1.7, cash: 1.7,
  wind: 1.6, taunt: 1.6, paper: 1.4, teleport: 1.3, super: 1.4, gas: 1.2, slip: 1.2, heal: 1.2, jump: 1.1,
};
const JITTER = new Set(['hitL', 'hitM', 'hitH', 'block', 'whiffL', 'whiffH', 'land', 'dash', 'throw',
  'tech', 'splash', 'fish', 'pill', 'stamp', 'paper', 'gurney', 'projectile', 'impactHit']);

// ---------------------------------------------------------------------------
// Music data (all original compositions)
// ---------------------------------------------------------------------------
const rep = (s, n) => Array(n).fill(s).join(' ');
const C1 = (n) => 'c' + ' _'.repeat(n - 1); // crash on the downbeat of an n-bar lane
const fill = (pat, n, last) => rep(pat, n - 1) + ' ' + last;

const TRACKS = {
  // ---- TITLE: heroic D minor, Andalusian drive, big hook -------------------
  title: {
    bpm: 152, echo: [36, 0.28, 0.2],
    iL: { w: 2, e: 1, y: 14 }, iH: { w: 1, e: 6 },
    d1: ['..k.......k..k..', '..o...o...o...o.'],
    intro: 'I', order: 'ABAC',
    S: {
      I: {
        n: 2, ch: 'Dm Bb,C',
        L: 'o5 l8 d r d r d4 r4 | < b- r16 b-16 b- > c r c d4 |',
        B: 'o3 l8 d r d r d4 r4 | < b- r16 b-16 b- > c r c d4 |',
        D: ['K...K...K....... K..KK.K...K.K...', '_ ............sSSS', C1(2)],
        auto: '',
      },
      A: {
        n: 8, ch: 'Dm C Bb A Dm C Bb A7',
        L: 'o5 l8 d d16 d16 f a > d4 < a f | c c16 c16 e g > c4 < g e | < b- b-16 b-16 > d f b-4 a g | a4 g f e4 c+4 |' +
          ' d d16 d16 f a > d4 < a f | c c16 c16 e g > c4 e f | g f e d c < b- a g | a4. g f e d c+ |',
        A: 'x--x--x-x--x--x-',
        P: '1-1-8-1-1-1-8-1-',
        D: [fill('k...s..kk.k.s...', 8, 'k...s...k.ssSsSS'), '..h...h...h...h.', C1(4)],
      },
      B: {
        n: 8, ch: 'Bb C Dm Dm Bb C Gm A7',
        L: 'o5 l8 f4. d f4 g4 | g f e f g4 a4 | a2 > d4 c < a | a2. r a16 b-16 | > c4. < b- a4 f4 | g a b- > c d4 e4 |' +
          ' < b-4 a g a4 b-4 | a g f e f e d c+ |',
        A: 'x-------x---x---',
        P: '1-1-5-1-8-1-5-1-',
        D: [fill('k.......s.......', 8, 'k...s...s.s.sSSS'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
      C: {
        n: 8, ch: 'F C Dm Bb F C Bb C,A',
        L: 'o4 l8 c f a > c r < a > c d | c4 < g4 e4 g4 | a > d f a r f a b- | b-4. a f4 d4 |' +
          ' c f a > c r < a > c d | e4 c4 < g4 > c4 | d4 c < b- > c4 < b- a | g4 a4 e4 c+4 |',
        A: 'x-x.x-x.x-x.x-x.',
        P: '1-5-8-5-1-5-8-5-',
        D: [fill('k...s...k...s...', 8, 'k.k.s.s.ssssSSSS'), 'h.h.h.h.h.h.h.h.', C1(4)],
      },
    },
  },

  // ---- SELECT: bouncy F major --------------------------------------------
  select: {
    bpm: 138,
    iL: { w: 1, e: 6, y: 8, v: 1.4 }, iH: { w: 2, e: 2 },
    d1: ['......k.......k.', '.........x......'],
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'F Dm Bb C F Dm Gm7 C7',
        L: 'o5 l8 a. a16 r a g f g a | f4 d4 r d f a | b-. b-16 r b- a g a b- | > c4 < g4 r e f g |' +
          ' a. a16 r a g f g a | > d4 c4 < a f a > c < | b- a g f g a b- > d < | > c r c < b- g e f g |',
        A: '..x...x...x...x.',
        P: '1-8-5-8-1-8-5-8-',
        D: [fill('k...s...k.k.s...', 8, 'k...s...k.s.s.ss'), '..h...h...h...h.', C1(8)],
      },
      B: {
        n: 8, ch: 'Bb C Am Dm Gm C F C7',
        L: 'o5 l8 d4 f4 b-4 a g | a g e c e4 g4 | > c4 < a4 e4 a > c < | d4. e f4 a4 |' +
          ' g4 b-4 > d4 c < b- | a4 g4 e4 g4 | f a > c f e d c < a | > c4 < b-4 g4 e4 |',
        A: 'x---x---x---x---',
        P: '1-5-8-5-1-5-8-5-',
        D: [fill('k...s...k.k.s...', 8, 'k.k.s.k.s.s.ssss'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
    },
  },

  // ---- ER: urgent E minor, siren motif ------------------------------------
  er: {
    bpm: 168, echo: [24, 0.25, 0.16],
    iL: { w: 2, e: 1, y: 14 }, iH: { w: 1, e: 2 },
    d1: ['..k.......k.k...', '......x.......x.'],
    intro: 'I', order: 'ABAC',
    S: {
      I: {
        n: 4, ch: 'Em',
        L: 'o5 y24 e2 _b2 | _e2 _b2 | _e4 _b4 _e4 _b4 | _e8 _b8 _e8 _b8 _e8 _b8 _e8 _b8 |',
        P: '1-------1------- 1-1-1-1-1-1-1-1-',
        D: ['k...k...k...k...', '_ _ ..h...h...h...h. hhhhhhhhhhhhhhhh', '_ _ _ ........ssssSSSS'],
        auto: '',
      },
      A: {
        n: 8, ch: 'Em Em C D Em Em C B',
        L: 'o5 l8 e4 g b > e4 d < b | > c < b a g a4 b4 | g4 e g > c4 < b a | f+4 d f+ a4 g f+ |' +
          ' e4 g b > e4 f+ g | f+ e d < b > e4. r < | > c < b a g > c < b a g | f+4 d+ f+ b4 a4 |',
        A: 'x.x.x.x.x.x.x.x.',
        P: '1-1-8-1-1-1-8-1-',
        D: [fill('k...s..kk.k.s...', 8, 'k...s.k.s.s.sSSS'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
      B: {
        n: 8, ch: 'Am Am Em Em C D B B',
        L: 'o5 l8 > e4 < a4 > e4 < a4 | > e f e d c4 < a4 | b4 e4 b4 e4 | b > c < b a g4 e4 |' +
          ' g4 > c4 e4 d c < | a4 > d4 f+4 e d < | f+4 a4 b4 > d+4 | f+4 e4 d+4 < b4 |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-8-1-8-1-8-1-8-',
        D: [fill('k...s...k...s...', 8, 'k...s...ssssSSSS'), 'h.h.h.h.h.h.h.h.', C1(4)],
      },
      C: {
        n: 8, ch: 'C D Em Em C D B B',
        L: 'o5 y24 g2 _o6 c2 | o5 a2 _o6 d2 | o5 b2 _o6 e2 | o5 b2 _o6 e2 | o5 g2 _o6 c2 | o5 a2 _o6 d2 |' +
          ' o5 b2 _o6 d+2 | o5 b2 _f+2 |',
        A: 'x-------x-------',
        P: '1-1-1-1-1-1-1-1-',
        D: [fill('k.......s.......', 8, 'k...l.l.m.m.t.tT'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
    },
  },

  // ---- OR: tense A minor, 16th arps, heart monitor ------------------------
  or: {
    bpm: 128, echo: [36, 0.3, 0.22],
    iL: { w: 1, e: 3, y: 18 }, iH: { w: 0, e: 2, v: 0.9 },
    d1: ['....s.......s...', '..h...h...h...h.'],
    d2: ['.h.h.h.h.h.h.h.h', '..p...p...p...p.'],
    intro: 'I', order: 'ABAC',
    S: {
      I: {
        n: 2, ch: 'Am',
        A: '1358583513585835',
        D: ['p...p...p...p...'],
        auto: '',
      },
      A: {
        n: 8, ch: 'Am Am F F Dm Dm E E',
        L: 'o5 l4 e2. r | e f e c | f2. r | f g f c | d2 f2 | a2 g f | e2. r | g+ b > d < b |',
        A: '1358583513585835',
        P: '1.1.1.1.1.1.1.1.',
        D: ['p...p...p...p...', fill('k.......k.k.....', 8, 'k.......k.k.mmll')],
      },
      B: {
        n: 8, ch: 'Am G F E Am C F E7',
        L: 'o5 l4 a > c < b a | g2 e g | f a > c d | e2. r < | a > c e d | c2 < b g | f g a b | g+2 e2 |',
        A: '1358583513585835',
        P: '1.1.8.1.1.1.8.1.',
        D: ['p...p...p...p...', fill('k.......k.k.....', 8, 'k...s...k.s.ssss'), '....s.......s...', C1(8)],
      },
      C: {
        n: 4, ch: 'F E Am Am',
        L: 'o6 l4 c1 | < b1 | a1 ^1 |',
        A: 'x---------------',
        P: '1---------------',
        D: ['p...p...p...p...', '_ _ _ ............ssss'],
      },
    },
  },

  // ---- ICU: cool D dorian groove, ventilator whoosh -----------------------
  icu: {
    bpm: 112, echo: [36, 0.35, 0.28],
    iL: { w: 1, e: 3, y: 14 }, iH: { w: 1, e: 3, v: 0.9 },
    d1: ['..k.......k.....', '..o.......o.....'],
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'Dm9 G9 Dm9 G9 Bbmaj7 Am7 Gm7 A7',
        L: 'o5 l8 a4. g a4 > c4 < | b4. a g4 f4 | a4. g a > c d c < | b2 r4 g a |' +
          ' b-4. a g4 f4 | e4. d e4 g4 | f4 e d c4 d4 | c+2. r4 |',
        A: 'x-------x-------',
        P: '1--1--8-5--1--7-',
        D: ['k.....k...k.....', '....s.......s...', 'h.h.h.h.h.h.h.h.', 'v... u...'],
      },
      B: {
        n: 8, ch: 'Bbmaj7 C Am7 Dm7 Gm7 C Fmaj7 A7',
        L: 'o5 l8 d4. c d4 f4 | e4. d c4 < a4 > | c4. < b- a4 > c4 | d2. r4 |' +
          ' d4. c < b-4 > d4 | e4. f g4 e4 | f4. e f4 a4 | g2 e2 |',
        A: 'x---x---x---x---',
        P: '1--1--8-5--1--7-',
        D: [fill('k.....k...k.....', 8, 'k.....k...k.s.ss'), '....s.......s...', 'h.h.h.h.h.h.h.h.', 'v... u...', C1(8)],
      },
    },
  },

  // ---- MRI: industrial E phrygian electro, magnet knocking ----------------
  mri: {
    bpm: 126,
    iL: { w: 0, e: 6, y: 0, q: 0.8, v: 1.5 }, iH: { w: 0, e: 0, v: 0.7 },
    d1: ['..q...q...q...q.', '.......b.......b'],
    d2: ['qqqqqqqqqqqqqqqq'],
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'Em Em F/E F/E Em Em Bb B',
        L: 'o5 l16 e e r8 e f r8 e8 r8 b-8 a8 | g8 r8 f8 e8 f4 r4 | f f r8 f g+ r8 f8 r8 > c8 < b8 | a8 r8 g+8 f8 g+4 r4 |' +
          ' e e r8 e f r8 e8 r8 b-8 a8 | g8 a8 b-8 > c8 < b-4 r4 | b- b- r8 b- > d r8 e8 r8 f8 e8 | d+8 r8 c+8 < b8 > d+4 r4 < |',
        A: 'x---------------',
        P: '1.1.81.1.1.81.1.',
        D: ['k...k...k...k...', '....x.......x...', 'q.q.q.q.q.q.q.q. qqqqqqqqqqqqqqqq b...b...b...b... b.b.b.b.bbbbbbbb'],
      },
      B: {
        n: 8, ch: 'Am Am Bb Bb Am Am Bb B',
        L: 'o5 l4 y16 a2 _b-2 | a1 | b-2 _a2 | f1 | a2 _b-2 | > c2 < b-2 | b-2 a2 | b1 |',
        A: 'x.x.x.x.x.x.x.x.',
        P: '1.1.81.1.1.81.1.',
        D: ['k...k...k...k...', '....x.......x...', 'b..b..b..b..b.b. bbbbbbbbqqqqqqqq', 'n.......n.......', C1(8)],
      },
    },
  },

  // ---- PHARMACY: jaunty C major shuffle -----------------------------------
  pharmacy: {
    bpm: 116, swing: 0.64,
    iL: { w: 2, e: 6, y: 8, v: 1.3 }, iH: { w: 1, e: 2 },
    d1: ['......w.......w.'],
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'C A7 Dm G7 C A7 D7 G7',
        L: 'o5 l8 e d+ e g > c4 < a g | e4 c+4 e4 g4 | f e f a > d4 c < a | g4 f4 d4 < b4 > |' +
          ' e d+ e g > c4 < a g | e4 c+4 e4 a4 | f+ g a > c d4 c < a | g4 a g f4 d4 |',
        A: '..x...x...x...x.',
        P: '1---3---5---6--- 8---6---5---3---',
        D: [fill('k...s...k...s...', 8, 'k...s...k.s.s.ss'), 'h.h.h.h.h.h.h.h.'],
      },
      B: {
        n: 8, ch: 'F F#dim C/G A7 D7 G7 C G7',
        L: 'o5 l8 a4 a g a4 > c4 < | a4 a g a4 > d+4 < | > e4 d c < a4 g4 | e4 g4 c+4 e4 |' +
          ' f+4 a4 > c4 < a4 | b4 > d4 f4 d4 < | > c4 e c < g4 e4 | f4 d4 < b4 g4 > |',
        A: '..x...x...x...x.',
        P: '1---3---5---6--- 8---6---5---3---',
        D: [fill('k...s...k...s...', 8, 'k.k.s...k.s.ssss'), 'h.h.h.h.h.h.h.h.', '.............w.w', C1(8)],
      },
    },
  },

  // ---- WAITING: elevator bossa nova ---------------------------------------
  waiting: {
    bpm: 132, echo: [36, 0.3, 0.25], arp: 22,
    iL: { w: 1, e: 3, y: 16 }, iH: { w: 1, e: 3, v: 0.8 },
    d1: ['....s.......s...'],
    d2: ['.h.h.h.h.h.h.h.h', '..o.......o.....'],
    intro: 'I', order: 'AB',
    S: {
      I: { n: 1, ch: 'Cmaj7', L: 'o5 n4 e2 c2', D: ['e.......e.......'], auto: '' },
      A: {
        n: 8, ch: 'Cmaj7 A7 Dm7 G7 Em7 A7 Dm7 G7',
        L: 'o5 l8 e4. d e4 g4 | c+2 e4. d | f2 r4 e f | g2. r4 | g4. f e4 d4 | c+4 e4 g4 b-4 | a2 f4 a4 | g2 d4 f4 |',
        A: 'x-.x-.x-..x-.x-.',
        P: '1-----5-1-----5-',
        D: ['k.....k.k.....k.', 'f..f..f...f..f..', 'jjjjjjjjjjjjjjjj'],
      },
      B: {
        n: 8, ch: 'Fmaj7 Fm6 Em7 A7 Dm7 G7 Cmaj7 G7',
        L: 'o5 l8 a4. g a4 > c4 < | a-2 f4. d | g2 e4 g4 | c+2. e4 | f4. e f4 a4 | g4. f d4 b4 | > c2 < b4. g | e2 d2 |',
        A: 'x-.x-.x-..x-.x-.',
        P: '1-----5-1-----5-',
        D: ['k.....k.k.....k.', 'f..f..f...f..f..', 'jjjjjjjjjjjjjjjj'],
      },
    },
  },

  // ---- HELIPAD: epic A minor gallop, rotor + wind -------------------------
  helipad: {
    bpm: 176, echo: [24, 0.25, 0.16],
    iL: { w: 2, e: 1, y: 14 }, iH: { w: 2, e: 6, v: 0.8 },
    d1: ['*.*.*.*.*.*.*.*.'],
    intro: 'I', order: 'ABAC',
    S: {
      I: {
        n: 2, ch: 'Am',
        L: 'r1 | o4 a8 b8 > c8 d8 e8 f8 g8 g+8 |',
        D: ['~ _', '*.*.*.*.*.*.*.*.', '_ k.k.k.k.kkkkssss'],
        auto: '',
      },
      A: {
        n: 8, ch: 'Am F C G Am F G E',
        L: 'o5 l8 a2 > c4 < b a | f2 a4 > c4 | e2 d4 c4 < | b2 g4 a b | > c2 < b4 a4 | > c4. d e4 f4 | e4 d4 c4 < b4 | g+2. e4 |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-111-111-111-11',
        D: [fill('k...s...k.k.s...', 8, 'k...s.s.ssssSSSS'), 'h.h.h.h.h.h.h.h.', C1(8), '~ _ _ _'],
      },
      B: {
        n: 8, ch: 'F G Em Am F G E E',
        L: 'o5 l8 a4 > c4 f4 e4 | d2 < b2 | g4 b4 > e4 d4 | c2 < a2 | a4 > c4 f4 a4 | g2. f4 | e4 d4 < b4 > d4 | < g+2. b4 |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-111-111-111-11',
        D: [fill('k...s...k...s...', 8, 'k.k.s.k.ssssSSSS'), 'h.h.h.h.h.h.h.h.', C1(4)],
      },
      C: {
        n: 8, ch: 'C G Am F C G F,G Am',
        L: 'o5 l8 e4 g4 > c4. < b | a4 g4 d2 | e4 a4 > c4. d | c4 < a4 f2 | e4 g4 > c4. d | e4 d4 < b4 g4 | a4 g4 f4 g4 | a1 |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-8-1-8-1-8-1-8-',
        D: [fill('k...s...k.k.s...', 8, 'k...s...l.l.m.tT'), 'o.h.o.h.o.h.o.h.', C1(4), '~ _ _ _ _ _ _ _'],
      },
    },
  },

  // ---- GARAGE: gritty E minor funk ----------------------------------------
  garage: {
    bpm: 100, swing: 0.56, su: 16,
    iL: { w: 2, e: 6, y: 6, v: 1.4 }, iH: { w: 1, e: 2, v: 0.9 }, iB: { w: 1, e: 6, q: 0.85, v: 1.5, lo: 40 },
    d1: ['.......w.......w', '..o.......o.....'],
    bp: '_',
    order: 'ABAC',
    M: {
      a: 'o2 l16 e8 r e > e r < e8 g8 a r b a g e |',
      b: 'o2 l16 e8 r e > e r < e r g8 r a b- b r8 |',
    },
    S: {
      A: {
        n: 8, ch: 'Em7 Em7 A7 A7 Em7 Em7 C7 B7',
        B: '$a $b o2 a8 r a > a r < a8 > c+8 d r e d c+ < a | o2 a8 r a > a r < a r g8 r e g g+ b8 | $a $b' +
          ' o3 c8 r c > c r < c8 e8 g r b- g e c | o2 b8 r b > b r < b r > d+8 r f+ a b r8 |',
        L: 'o5 l16 r4 e8 g a b8 > d8 c+ < b a8 | b4 r4 r2 | r4 a8 > c+ e g8 f+8 e c+ < a8 | a4 r4 r2 |' +
          ' r4 e8 g a b8 > d8 c+ < b a8 | b4 r8 a8 g4 r4 | r4 g8 b- > c d8 e8 d c < b-8 | b4 a4 f+4 d+4 |',
        A: '..x...x..x.x..x.',
        D: ['k.....k...k..k..', '....s..g.g..s..g', fill('h.hhh.hhh.hhh.ho', 8, 'h.hhh.hhs.s.ssss')],
      },
      B: {
        n: 8, ch: 'Am7 Am7 Em7 Em7 Am7 Am7 C7 B7',
        P: '1..18..5.1.7.8..',
        L: 'o5 l8 e4. d e g a4 | g e d c e4 r4 | b4. a g a b4 | a g e d e4 r4 |' +
          ' e4. d e g a4 | > c4 < b a g4 e4 | g4 b- > c d4 c4 < | b4 a f+ d+4 < b4 > |',
        A: '..x...x...x...x.',
        D: ['k.....k.k..k....', '....s.......s...', 'hhhhhhhhhhhhhhhh', C1(8)],
      },
      C: {
        n: 4, ch: 'Em7 Em7 Em7 B7',
        B: '$a $b $a o2 b8 r b > b r < b r > d+8 r f+ a b r8 |',
        A: '_ _ _ ..x...x..x.x..x.',
        D: ['k.....k...k..k..', '....s..g.g..s..g', 'h.h.h.h.h.h.h.h.'],
      },
    },
  },

  // ---- ADMIN: sinister corporate march (C minor) --------------------------
  admin: {
    bpm: 104,
    iL: { w: 2, e: 1, y: 10 }, iH: { w: 1, e: 6, v: 0.9 },
    d1: ['...d...........d', 'ss..............'],
    d2: ['.s.s.s.s.s.s.s.s'],
    order: 'ABC',
    M: {
      a: 'l4 c r8 c8 e- g | f+ g8 a-8 g2 | a- r8 a-8 > c e- | d2 < b2 | > c r8 c8 < b b- | a a- g f | e- f g a- | g2. r4 |',
    },
    S: {
      A: {
        n: 8, ch: 'Cm Cm Ab G Cm F,Fm Ab G',
        L: 'o4 $a',
        A: 'x...x...x...x...',
        P: '1.1.5...1.1.5...',
        D: ['k...k...k...k...', fill('....s.......s.ss', 4, '....s.......d...'), 'h...h...h...h...'],
      },
      B: {
        n: 8, ch: 'Fm Fm Cm Cm Db Db G G',
        L: 'o5 l8 f. f16 f. f16 a-4 > c4 < | b-4. a- g4 f4 | e-. e-16 e-. e-16 g4 > c4 < | b4. a- g2 |' +
          ' f. f16 f. f16 a-4 > d-4 < | > c4. < b- a-4 g4 | f+4 g4 a-4 b4 | > d4 c4 < b4 g4 |',
        A: 'x.x.x...x.x.x...',
        P: '1.1.1.1.5.5.5.5.',
        D: ['k...k...k...k...', fill('s.ss..s.s.ss..s.', 8, 's.ss.sssssssSSSS'), C1(4)],
      },
      C: {
        n: 8, ch: 'Cm Cm Ab G Cm F,Fm Ab G',
        L: 'o5 $a',
        A: 'x.x.x.x.x.x.x.x.',
        P: '1.1.5.5.1.1.5.5.',
        D: ['k...k...k...k...', fill('....s..s....s.ss', 4, '....s.......d.d.'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
    },
  },

  // ---- BREAKROOM: laid-back F dorian coffee funk --------------------------
  breakroom: {
    bpm: 92, swing: 0.58, su: 16, echo: [36, 0.3, 0.22],
    iL: { w: 1, e: 3, y: 14 }, iH: { w: 1, e: 7, v: 0.9 },
    d1: ['..o.......o.....'],
    order: 'AB',
    M: {
      f: 'o3 l16 f8 r f a-8 f r b-8 r a- f r e- f |',
      b: 'o2 l16 b-8 r b- > d8 < b- r > a-8 r f d r c < b- |',
    },
    S: {
      A: {
        n: 8, ch: 'Fm7 Bb7 Fm7 Bb7 Fm7 Bb7 Abmaj7 C7',
        B: '$f $b $f $b $f $b o2 l16 a-8 r a- > c8 < a- r > g8 r e- c r < b- a- | o3 l16 c8 r c e8 c r b-8 r g e r d c |',
        L: 'o5 l16 r4 c8 e- f r a- f e- c8 r8 | e-4 r8 c < b- > c4 r4 | r4 c8 e- f8 a- b- > c < a- f8 r | g4 f8 e-8 f4 r4 |' +
          ' r4 a-8 b- > c8 e- c < b- a- f8 r | a-4 f8 d8 f4 r4 | g4. e-8 c4 e-4 | e4 g8 b-8 > c4 < b-4 |',
        A: '..x-..x-..x-.x-.',
        D: ['k......kk.k.....', '....s.......s..g', 'h.h.h.h.h.h.h.h.'],
      },
      B: {
        n: 8, ch: 'Dbmaj7 C7 Bbm7 C7 Dbmaj7 C7 Fm7 Fm7',
        P: '1..1..8.5..5.7.8',
        L: 'o5 l8 f4. e- f a- > c4 < | e4. d e g c4 | d-4. c < b- > c d-4 | e2 g4 r4 |' +
          ' f4. e- f a- > c4 | < b-4 g e c4 e4 | f4 e- c e-4 f4 | f2. r4 |',
        A: 'x-------x-------',
        D: [fill('k......kk.k.....', 8, 'k......kk.k.s.ss'), '....s.......s..g', 'h.h.h.h.h.h.h.h.', C1(8)],
      },
    },
  },

  // ---- MORGUE: eerie 3/4 music box + theremin -----------------------------
  morgue: {
    bpm: 84, beats: 3, echo: [72, 0.4, 0.32],
    iL: { w: 0, e: 3, y: 34 }, iH: { w: 0, e: 4, v: 0.9 },
    d1: ['l.....l.....'],
    d2: ['.j.j.j.j.j.j', '......n.....'],
    bp: '1...1...1...',
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'Dm Dm Gm A Dm Bb Gm,A Dm',
        L: 'o5 l4 a2 _b-4 | a2. | g2 _a4 | e2. | f4 e d | b-2 a4 | g4 f e | d2. |',
        A: '1.5.8.9.8.5.',
        P: '1-----------',
        D: ['k..k........ ............', '........n... ...n........'],
      },
      B: {
        n: 8, ch: 'F C Dm Am Bb F Gm A7',
        L: 'o5 l4 c2 _f4 | e2 c4 | d2 f4 | e2. | d2 _f4 | a2 g4 | f4 e d | c+2. |',
        A: '1.5.8.9.8.5.',
        P: '1-----------',
        D: ['k..k........ ............', '....n....... .........n..', C1(8)],
      },
    },
  },

  // ---- CAFETERIA: Friday Fish Day polka + surf ----------------------------
  cafeteria: {
    bpm: 150,
    iL: { w: 1, e: 6, y: 0, v: 1.4 }, iH: { w: 2, e: 2, v: 0.9 },
    d1: ['......w.......w.'],
    order: 'AB',
    S: {
      A: {
        n: 8, ch: 'G D7 D7 G G D7 D7 G',
        L: 'o4 l8 b > d g d < b > d g b | o5 a4 f+ d c4 < a4 | o4 a > c f+ a > c4 < a f+ | g4 b4 g4 r4 |' +
          ' o4 b > d g d < b > d g b | o6 c4 < a f+ d4 c4 | o4 a b > c d e f+ a > c | o5 b4 g4 g g r4 |',
        A: '..x...x...x...x.',
        P: '1-..5-..1-..5-..',
        D: ['k.s.k.s.k.s.k.s.', fill('................', 8, '............!...')],
      },
      B: {
        n: 8, ch: 'Em Em C C Am Am B7 B7',
        L: 'o5 l4 b2* a* g* | e2.* r | g2* e* g* | > c2.* r < | a2* g* e* | c2* e2* | d+2* f+2* | b2.* r |',
        A: 'x-------x-------',
        P: '1-1-1-1-1-1-1-1-',
        D: ['k..ks.k.k.k.s..k', 'h.h.h.h.h.h.h.h.', C1(8)],
        auto: 'b',
      },
    },
  },

  // ---- FINAL: Chief of Staff, C harmonic minor ----------------------------
  final: {
    bpm: 162, echo: [24, 0.25, 0.15],
    iL: { w: 2, e: 1, y: 16 }, iH: { w: 2, e: 6, v: 0.8 },
    d1: ['k.k.....k.k.....', '..........x.....'],
    intro: 'I', order: 'ABAC',
    S: {
      I: {
        n: 2, ch: 'Cm Cm,G',
        L: 'o4 l16 [c c r c]4 | [g g r g]2 a- a- r a- b b r b |',
        B: 'o3 l16 [c c r c]4 | [g g r g]2 a- a- r a- b b r b |',
        D: ['k...k...k...k... kkkkkkkkssssSSSS', C1(2)],
        auto: '',
      },
      A: {
        n: 8, ch: 'Cm Cm Ab Ab Fm Fm G G',
        L: 'o5 l8 c4 e- g > c4 < b g | a-4 g f g2 | a-4 > c4 e-4 d c | e-4 c < a- > c2 < |' +
          ' f4 a- > c f4 e- d | e-4 d c d2 | < b4 > d4 f4 e- d | < b2 g2 |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1818181818181818',
        D: [fill('k.kks..kk.kks..k', 8, 'k.kks.kks.ssSSSS'), 'h.h.h.h.h.h.h.h.', C1(4)],
      },
      B: {
        n: 8, ch: 'Cm Bb Ab G Cm Bb Ab G',
        L: 'o5 l8 g4. f e-4 d4 | f4. e- d4 c4 | e-4. d c4 < b4 > | c2 d2 | g4. a- b-4 > c4 < | b-4. a- g4 f4 | e-4 d4 c4 e-4 | d2. r4 |',
        A: 'x---x---x---x---',
        P: '1-8-1-8-1-8-1-8-',
        D: [fill('k...s...k.k.s...', 8, 'k...s.s.l.l.m.tT'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
      C: {
        n: 8, ch: 'Eb Bb Cm Ab Fm G Ab G',
        L: 'o5 l8 b-4 g4 e-4 g4 | f4 d4 < b-4 > d4 | e-4 g4 > c4 < b-4 | a-2. g4 | f4 a-4 > c4 e-4 | d2 < b2 | > c4 < a-4 > e-4 c4 | d1 < |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1818181818181818',
        D: [fill('k.kks..kk.kks..k', 8, 'kkkkssssSSSSSSSS'), 'o.h.o.h.o.h.o.h.', C1(4)],
      },
    },
  },

  // ---- ENDING: warm triumphant credits (C major) --------------------------
  ending: {
    bpm: 112, echo: [36, 0.3, 0.24],
    iL: { w: 2, e: 1, y: 16 }, iH: { w: 1, e: 3, v: 0.9 },
    d1: ['..k.......k.....', '..o...o...o...o.'],
    d2: ['.h.h.h.h.h.h.h.h'],
    order: 'ABAC',
    S: {
      A: {
        n: 8, ch: 'C G/B Am Em F C/E Dm G',
        L: 'o5 l8 e4. d c4 g4 | g4. f e4 d4 | c4. d e4 a4 | g2. r4 | a4. g f4 > c4 < | g4. f e4 c4 | d4 e4 f4 a4 | g2. r4 |',
        A: 'x---x---x---x---',
        P: '1---5---8---5---',
        D: [fill('k.......s.......', 8, 'k.......s...s.ss'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
      B: {
        n: 8, ch: 'F G Em Am Dm G C C7',
        L: 'o5 l8 a4. b > c4 < a4 | b4. > c d4 < b4 | g4. a b4 > e4 | c2. < a4 | f4. g a4 > d4 | c4 < b4 a4 b4 | > c2. e4 | g2 e2 < |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-5-8-5-1-5-8-5-',
        D: [fill('k...s...k...s...', 8, 'k...s...s.s.ssss'), 'h.h.h.h.h.h.h.h.', C1(8)],
      },
      C: {
        n: 8, ch: 'Am F C G Am F G G',
        L: 'o5 l8 c4 e4 a4 > c4 | c4. < b a4 f4 | g4 e4 c4 e4 | d2 g2 | a4 > c4 e4 d4 | c4. < b a4 f4 | g4 a4 b4 > d4 | e2. d4 < |',
        A: 'x-x-x-x-x-x-x-x-',
        P: '1-8-1-8-1-8-1-8-',
        D: [fill('k...s...k.k.s...', 8, 'k...s...l.l.m.tT'), 'h.h.h.h.h.h.h.h.', C1(4)],
      },
    },
  },

  // ======================= JINGLES (one-shot) ===============================
  vs: {
    once: true, bpm: 140, beats: 6, gain: 1.5,
    iL: { w: 2, e: 1, y: 20 }, iH: { w: 1, e: 1 },
    auto: '', order: 'A',
    S: {
      A: {
        n: 1, ch: 'Cm,Ab,Cm',
        L: 'o4 l8 g r g16 g16 r8 > c4 d4 e-2~',
        H: 'o4 l8 e- r e-16 e-16 r8 a-4 b4 {cge-}2',
        B: 'o3 l8 c r c16 c16 r8 a-4 g4 c2',
        D: ['K...KK..K...K...K.......', '............ssssc.......', 'c'],
      },
    },
  },
  victory: {
    once: true, bpm: 150, gain: 1.4, echo: [24, 0.25, 0.2],
    iL: { w: 2, e: 1, y: 16 }, iH: { w: 1, e: 6 },
    auto: '', order: 'AB',
    S: {
      A: {
        n: 1, ch: 'C',
        L: 'o4 l16 g8 g g g8 r g > c4 < g8 > c8',
        A: 'x-x-x-x-x-x-x-x-',
        B: 'o3 l4 c c c c',
        D: ['k...s...k.k.ssss', 'c'],
      },
      B: {
        n: 1, beats: 6, ch: 'F,G,C',
        L: 'o5 l8 e4 d c d e > c2.~',
        A: 'x-x-x-x-x-x-x-x-x-------',
        B: 'o3 l4 f f g g c2',
        D: ['K.......K.......K.......', 'c...............c.......'],
      },
    },
  },
  ko: {
    once: true, bpm: 100, beats: 5, gain: 1.6,
    iL: { w: 'q', e: 0, y: 0, q: 1 }, iH: { w: 2, e: 6 },
    auto: '', order: 'A',
    S: {
      A: {
        n: 1, ch: 'C',
        L: 'o5 b2 r16 o5 g16 f+16 f16 e16 e-16 d16 c+16 c4',
        H: 'r2 r16 o4 g16 f+16 f16 e16 e-16 d16 c+16 c4',
        B: 'r2 r16 o3 g16 f+16 f16 e16 e-16 d16 c+16 c4',
        D: ['................K...', '................c...'],
      },
    },
  },
  gameover: {
    once: true, bpm: 116, gain: 1.6, echo: [36, 0.3, 0.25],
    iL: { w: 1, e: 3, y: 18 }, iH: { w: 1, e: 3, v: 0.8 },
    auto: '', order: 'A',
    S: {
      A: {
        n: 2, ch: 'Am,Dm,E,E Am',
        L: 'o5 l8 e4 d c < b4 g+4 | a2. r4 |',
        A: 'x---x---x---x--- x-----------....',
        B: 'o3 l4 a f e e | a2. r4 |',
        D: ['l.......l...l... l...............'],
      },
    },
  },
  perfect: {
    once: true, bpm: 160, gain: 2.2, echo: [24, 0.3, 0.25],
    iL: { w: 1, e: 4, y: 0 }, iH: { w: 0, e: 4 },
    auto: '', order: 'A',
    S: {
      A: {
        n: 1, ch: 'C',
        L: 'o5 l16 c e g > c e g > c8 ^4 ^4',
        H: 'r16 o5 l16 e g > c e g > c e16 ^4 ^4',
        D: ['y.y.y.y.c.......'],
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Engine state, graph, scheduler
// ---------------------------------------------------------------------------
const S = {
  ctx: null, R: null,
  master: null, comp: null, musicBus: null, duck: null, sfxBus: null,
  musicVol: 0.8, sfxVol: 1, announcer: true,
  pending: null, song: null, players: [], intensity: 0,
  userSusp: false, timer: null, voices: [], lastSfx: {},
  primed: false, unlockedOnce: false, analyser: null, unlockAt: 0,
};

const hidden = () => !!(DOC && DOC.hidden);
const volCurve = (v) => v * v;

function buildGraph() {
  const ctx = S.ctx;
  S.R = res(ctx);
  S.master = ctx.createGain();
  S.comp = makeLimiter(ctx, S.master);
  S.musicBus = ctx.createGain();
  S.musicBus.gain.value = volCurve(S.musicVol) * MUSIC_TRIM;
  S.duck = ctx.createGain();
  S.sfxBus = ctx.createGain();
  S.sfxBus.gain.value = volCurve(S.sfxVol);
  S.musicBus.connect(S.duck);
  S.duck.connect(S.master);
  S.sfxBus.connect(S.master);
  S.comp.connect(ctx.destination);
}

// Master limiter. DynamicsCompressor applies automatic makeup gain (about 1.3x
// for these settings); the post gain cancels it so the compressor works as a
// transparent safety limiter (unity below about -6 dBFS, ceiling about 0.75).
function makeLimiter(ctx, input) {
  const k = ctx.createDynamicsCompressor();
  k.threshold.value = -6;
  k.knee.value = 4;
  k.ratio.value = 12;
  k.attack.value = 0.002;
  k.release.value = 0.2;
  const post = ctx.createGain();
  post.gain.value = 0.82;
  input.connect(k);
  k.connect(post);
  return post;
}

function canPlay() {
  if (!S.ctx || S.userSusp || hidden()) return false;
  // allow the short window while resume() settles right after unlock; otherwise
  // drop sounds while suspended/interrupted so they don't burst out on resume
  return S.ctx.state === 'running' || Date.now() - S.unlockAt < 1000;
}

function pump() {
  const ctx = S.ctx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const until = now + LOOKAHEAD;
  for (const p of S.players) p.schedule(until);
  const keep = [];
  for (const p of S.players) {
    if (p.gone(now)) {
      p.dispose();
      if (S.song === p) S.song = null;
    } else keep.push(p);
  }
  S.players = keep;
  if (!keep.length && S.timer) {
    clearInterval(S.timer);
    S.timer = null;
  }
}

function ensureTimer() {
  if (!S.timer) S.timer = setInterval(() => {
    try {
      pump();
    } catch (e) {
      /* ignore */
    }
  }, TICK_MS);
}

function startSong(id, fade) {
  if (S.song) S.song.stop(fade);
  const p = new Player(S.ctx, S.musicBus, id, { at: S.ctx.currentTime + 0.08 });
  S.song = p;
  S.players.push(p);
  ensureTimer();
  pump();
}

function wake() {
  const ctx = S.ctx;
  if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
    try {
      const pr = ctx.resume();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {
      /* ignore */
    }
  }
}

function killVoice(v, now) {
  try {
    v.g.gain.cancelScheduledValues(now);
    v.g.gain.setTargetAtTime(0, now, 0.012);
  } catch (e) {
    /* ignore */
  }
  v.end = now;
}

// ---------------------------------------------------------------------------
// Announcer (speechSynthesis)
// ---------------------------------------------------------------------------
let voiceCache = null;
let sayTimer = null;
let duckTimer = null;
let lastUtter = null;
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox|fred|kathy|princess|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;
const PREFERRED = [/daniel/i, /google uk english male/i, /microsoft (guy|davis|ryan|mark|david|george|christopher|eric|andrew|brian|roger|steffan)/i,
  /\baaron\b/i, /\barthur\b/i, /\bgordon\b/i, /\brishi\b/i, /\balex\b/i, /\boliver\b/i, /\bthomas\b/i, /\bmale\b/i];

function synth() {
  return W && W.speechSynthesis && typeof W.SpeechSynthesisUtterance === 'function' ? W.speechSynthesis : null;
}
function pickVoice() {
  if (voiceCache) return voiceCache;
  const ss = synth();
  if (!ss) return null;
  const all = ss.getVoices() || [];
  const en = all.filter((v) => /^en([-_]|$)/i.test(v.lang || '') && !NOVELTY.test(v.name || ''));
  if (!en.length) return null;
  for (const re of PREFERRED) {
    const v = en.find((x) => re.test(x.name || ''));
    if (v) return (voiceCache = v);
  }
  return (voiceCache = en.find((v) => v.default) || en[0]);
}
function setDuck(on) {
  if (!S.ctx || !S.duck) return;
  try {
    S.duck.gain.setTargetAtTime(on ? 0.55 : 1, S.ctx.currentTime, on ? 0.05 : 0.25);
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
function unlock() {
  try {
    if (!W) return;
    try {
      if (NAV && NAV.audioSession && NAV.audioSession.type !== 'playback') NAV.audioSession.type = 'playback';
    } catch (e) {
      /* ignore */
    }
    if (!S.ctx) {
      const AC = W.AudioContext || W.webkitAudioContext;
      if (!AC) return;
      try {
        S.ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        S.ctx = new AC();
      }
      buildGraph();
      S.ctx.onstatechange = () => {
        // iOS can "interrupt" the context (calls, Siri, backgrounding): try to recover
        try {
          if (S.ctx.state !== 'running' && S.ctx.state !== 'closed' && !S.userSusp && !hidden()) setTimeout(wake, 300);
        } catch (e) {
          /* ignore */
        }
      };
    }
    const ctx = S.ctx;
    S.unlockAt = Date.now();
    if (!S.userSusp && !hidden()) wake();
    else if (ctx.state === 'running') suspendCtx();
    if (!S.unlockedOnce || ctx.state !== 'running') {
      // iOS: starting a buffer inside the gesture unlocks output
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(ctx.destination);
      src.start(0);
      S.unlockedOnce = true;
    }
    const ss = synth();
    const ua = NAV && NAV.userActivation;
    if (ss && !S.primed && (!ua || ua.isActive)) {
      S.primed = true;
      try {
        const u = new W.SpeechSynthesisUtterance(' ');
        u.volume = 0;
        ss.speak(u);
      } catch (e) {
        /* ignore */
      }
    }
    if (S.pending) {
      const id = S.pending;
      S.pending = null;
      startSong(id, 0.05);
    }
  } catch (e) {
    /* never throw */
  }
}

function music(id) {
  try {
    if (!TRACKS[id] || TRACKS[id].once) return;
    if (!S.ctx) {
      S.pending = id;
      return;
    }
    if (S.song && !S.song.dead && !S.song.once && S.song.id === id) return;
    S.intensity = 0;
    startSong(id, 0.3);
  } catch (e) {
    /* never throw */
  }
}

function stopMusic(fadeSec = 0.4) {
  try {
    S.pending = null;
    if (S.song) {
      S.song.stop(clamp(num(fadeSec, 0.4), 0, 10));
      S.song = null;
    }
  } catch (e) {
    /* never throw */
  }
}

function jingle(id) {
  try {
    S.pending = null;
    if (!TRACKS[id] || !TRACKS[id].once) return;
    if (!S.ctx) return;
    startSong(id, 0.08);
  } catch (e) {
    /* never throw */
  }
}

function setIntensity(level) {
  try {
    S.intensity = clamp(Math.round(num(+level, 0)), 0, 2);
  } catch (e) {
    /* never throw */
  }
}

function sfx(name, opts) {
  try {
    const fn = SFX[name];
    if (!fn || !canPlay()) return;
    const ctx = S.ctx;
    const o = opts || {};
    const now = ctx.currentTime;
    const last = S.lastSfx[name];
    if (last != null && now - last < 0.02 && now >= last) return; // same-frame spam
    S.lastSfx[name] = now;
    S.voices = S.voices.filter((v) => v.end > now);
    const same = S.voices.filter((v) => v.name === name);
    if (same.length >= PER_NAME) {
      killVoice(same[0], now);
      S.voices.splice(S.voices.indexOf(same[0]), 1);
    }
    if (S.voices.length >= MAX_VOICES) killVoice(S.voices.shift(), now);
    const vol = clamp(num(o.vol, 1), 0, 2);
    if (vol <= 0) return;
    const pitch = clamp(num(o.pitch, 1), 0.25, 4);
    const pan = clamp(num(o.pan, 0), -1, 1);
    const g = ctx.createGain();
    g.gain.value = vol * (SFX_LVL[name] || 1);
    let pn = null;
    if (pan && ctx.createStereoPanner) {
      pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      g.connect(pn);
      pn.connect(S.sfxBus);
    } else g.connect(S.sfxBus);
    const c = { ctx, R: S.R, out: g, t: now + 0.004, p: pitch * (JITTER.has(name) ? rnd(0.96, 1.04) : 1), g: 1 };
    const dur = num(fn(c), 0.5);
    S.voices.push({ name, g, end: now + dur + 0.05 });
    setTimeout(() => {
      try {
        g.disconnect();
        if (pn) pn.disconnect();
      } catch (e) {
        /* ignore */
      }
    }, (dur + 0.4) * 1000);
  } catch (e) {
    /* never throw */
  }
}

function say(text) {
  try {
    const ss = synth();
    if (!ss || !S.announcer || S.userSusp || hidden()) return;
    const vol = clamp(S.sfxVol, 0, 1);
    if (vol <= 0 || text == null) return;
    const u = new W.SpeechSynthesisUtterance(String(text));
    const v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'en-US';
    u.pitch = 0.6;
    u.rate = 1.0;
    u.volume = vol;
    const undo = () => {
      clearTimeout(duckTimer);
      setDuck(false);
    };
    u.onend = undo;
    u.onerror = undo;
    lastUtter = u; // keep a reference (Chrome GC bug drops onend otherwise)
    clearTimeout(sayTimer);
    const go = () => {
      try {
        ss.speak(u);
        setDuck(true);
        clearTimeout(duckTimer);
        duckTimer = setTimeout(undo, 1200 + String(text).length * 90);
      } catch (e) {
        /* ignore */
      }
    };
    if (ss.speaking || ss.pending) {
      ss.cancel();
      sayTimer = setTimeout(go, 50); // Safari drops a speak() issued right after cancel()
    } else go();
  } catch (e) {
    /* never throw */
  }
}

function setVolume(m, s) {
  try {
    S.musicVol = clamp(num(+m, S.musicVol), 0, 1);
    S.sfxVol = clamp(num(+s, S.sfxVol), 0, 1);
    if (S.ctx) {
      const t = S.ctx.currentTime;
      S.musicBus.gain.setTargetAtTime(volCurve(S.musicVol) * MUSIC_TRIM, t, 0.03);
      S.sfxBus.gain.setTargetAtTime(volCurve(S.sfxVol), t, 0.03);
    }
    if (lastUtter && lastUtter.volume !== undefined) lastUtter.volume = S.sfxVol;
  } catch (e) {
    /* never throw */
  }
}

function setAnnouncer(on) {
  try {
    S.announcer = !!on;
    if (!S.announcer) {
      clearTimeout(sayTimer);
      const ss = synth();
      if (ss) ss.cancel();
      setDuck(false);
    }
  } catch (e) {
    /* never throw */
  }
}

function suspendCtx() {
  try {
    if (S.ctx && S.ctx.state === 'running') {
      const pr = S.ctx.suspend();
      if (pr && pr.catch) pr.catch(() => {});
    }
    clearTimeout(sayTimer);
    const ss = synth();
    if (ss && (ss.speaking || ss.pending)) ss.cancel();
    setDuck(false);
  } catch (e) {
    /* ignore */
  }
}

function suspend() {
  try {
    S.userSusp = true;
    suspendCtx();
  } catch (e) {
    /* never throw */
  }
}

function resume() {
  try {
    S.userSusp = false;
    if (!hidden()) wake();
  } catch (e) {
    /* never throw */
  }
}

export const Sound = { unlock, music, stopMusic, jingle, setIntensity, sfx, say, setVolume, setAnnouncer, suspend, resume };
export default Sound;

// Page lifecycle + gesture backups (Sound.unlock is idempotent).
if (W && DOC) {
  try {
    DOC.addEventListener('visibilitychange', () => {
      if (DOC.hidden) suspendCtx();
      else if (!S.userSusp) wake();
    });
    W.addEventListener('pageshow', () => {
      if (!DOC.hidden && !S.userSusp) wake();
    });
    const gesture = () => {
      if ((!S.ctx || S.ctx.state !== 'running') && !S.userSusp && !hidden()) unlock();
    };
    for (const ev of ['touchend', 'click', 'keydown', 'pointerup']) W.addEventListener(ev, gesture, { capture: true, passive: true });
    const ss = synth();
    if (ss && ss.addEventListener) ss.addEventListener('voiceschanged', () => (voiceCache = null));
  } catch (e) {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Debug / test hooks (not part of the game API)
// ---------------------------------------------------------------------------
async function renderOffline(build, sec, raw) {
  const OAC = W && (W.OfflineAudioContext || W.webkitOfflineAudioContext);
  if (!OAC) return null;
  const sr = 22050;
  const octx = new OAC(2, Math.ceil(sr * sec), sr);
  const pre = octx.createGain();
  if (raw) pre.connect(octx.destination);
  else makeLimiter(octx, pre).connect(octx.destination);
  build(octx, pre);
  const buf = await octx.startRendering();
  let sum = 0;
  let peak = 0;
  let n = 0;
  let nan = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      if (x !== x) {
        nan++;
        continue;
      }
      sum += x * x;
      n++;
      if (Math.abs(x) > peak) peak = Math.abs(x);
    }
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak, nan, seconds: sec };
}

export const _audioDebug = {
  tracks: () => Object.keys(TRACKS).filter((k) => !TRACKS[k].once),
  jingles: () => Object.keys(TRACKS).filter((k) => TRACKS[k].once),
  sfxNames: () => Object.keys(SFX),
  warnings: WARN,
  compile,
  // Compile everything; report bars, events, warnings, pitch ranges, NaNs and
  // strong-beat lead notes that are not chord tones (for musical review).
  validate() {
    const out = {};
    for (const id of Object.keys(TRACKS)) {
      const before = WARN.length;
      delete CACHE[id];
      ANALYZE = [];
      const c = compile(id);
      const clashes = ANALYZE;
      ANALYZE = null;
      const def = TRACKS[id];
      const ranges = {};
      let bad = 0;
      for (const e of c.ev) {
        for (const k of ['t', 'd', 'm', 'v']) if (e[k] != null && !isFinite(e[k])) bad++;
        if (e.m != null) {
          if (!isFinite(mtof(e.m))) bad++;
          const r = (ranges[e.c] = ranges[e.c] || [999, -999]);
          r[0] = Math.min(r[0], e.m);
          r[1] = Math.max(r[1], e.m);
        }
        if (e.d != null && e.d <= 0) bad++;
      }
      const secs = (def.intro || '') + (def.order || 'A');
      let bars = 0;
      for (const s of secs) {
        const sec = resolveSec(def, s);
        if (sec) bars += sec.n || 1;
      }
      out[id] = {
        bars, sections: secs, events: c.ev.length, bad,
        seconds: +(c.endT * c.spt).toFixed(2), loopSeconds: +((c.endT - c.loopT) * c.spt).toFixed(2),
        ranges, warnings: WARN.slice(before), clashes,
      };
    }
    return out;
  },
  state: () => ({
    ctx: S.ctx ? S.ctx.state : null, song: S.song ? S.song.id : null, intensity: S.intensity,
    level: S.song ? S.song.lvl : null, voices: S.voices.length, pending: S.pending, players: S.players.length,
  }),
  analyser() {
    if (!S.ctx) return null;
    if (!S.analyser) {
      S.analyser = S.ctx.createAnalyser();
      S.analyser.fftSize = 2048;
      S.comp.connect(S.analyser);
    }
    return S.analyser;
  },
  // opts: { raw: skip the limiter, solo: 'L'|'H'|'B'|'D'|'X' mute other buses, gain }
  renderTrack(id, sec = 8, level = 0, opts = {}) {
    return renderOffline((octx, dest) => {
      const g = octx.createGain();
      g.gain.value = (opts.gain == null ? 1 : opts.gain) * MUSIC_TRIM;
      g.connect(dest);
      const p = new Player(octx, g, id, { at: 0.05, level });
      if (opts.solo) for (const k of Object.keys(p.bus)) if (k !== opts.solo) p.bus[k].gain.value = 0;
      p.schedule(sec);
    }, sec, opts.raw);
  },
  renderSfx(name, sec = 2, opts = {}) {
    return renderOffline((octx, dest) => {
      const fn = SFX[name];
      if (fn) fn({ ctx: octx, R: res(octx), out: dest, t: 0.01, p: 1, g: SFX_LVL[name] || 1 });
    }, sec, opts.raw);
  },
};
