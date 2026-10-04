// HOSPITAL FIGHTER - stage backgrounds.
// Low-res pixel art (view 384..480 x 216), nearest-neighbour scaled by the game.
// Static art for every layer is pre-rendered lazily into offscreen canvases
// (keyed by stage id + night) and blitted with parallax each frame; only the
// animated bits (lights, monitors, crowd...) are drawn per frame.
import { drawText } from './font.js';

export const STAGES = [
  { id: 'er', name: 'EMERGENCY DEPT', sub: 'ALL BEDS FULL SINCE 1987', hazard: 'gurney', music: 'er', locked: false },
  { id: 'or', name: 'OPERATING ROOM', sub: 'PLEASE COUNT YOUR SPONGES', hazard: 'none', music: 'or', locked: false },
  { id: 'icu', name: 'ICU', sub: 'VISITING HOURS: NEVER', hazard: 'charts', music: 'icu', locked: false },
  { id: 'mri', name: 'MRI SUITE', sub: 'MAGNET ALWAYS ON. ALWAYS.', hazard: 'magnet', music: 'mri', locked: false },
  { id: 'pharmacy', name: 'PHARMACY QUEUE', sub: 'PRIOR AUTH REQUIRED', hazard: 'none', music: 'pharmacy', locked: false },
  { id: 'waiting', name: 'WAITING ROOM', sub: 'WAIT TIME: 14 HRS', hazard: 'wetfloor', music: 'waiting', locked: false },
  { id: 'helipad', name: 'HELIPAD', sub: 'AIRFARE BILLED SEPARATELY', hazard: 'wind', music: 'helipad', locked: false },
  { id: 'garage', name: 'PARKING GARAGE', sub: 'FIRST 5 MINUTES: $40', hazard: 'car', music: 'garage', locked: false },
  { id: 'admin', name: 'ADMIN OFFICE', sub: 'SYNERGY THROUGH SUFFERING', hazard: 'charts', music: 'admin', locked: false },
  { id: 'breakroom', name: 'BREAK ROOM', sub: 'WHO ATE MY YOGURT?', hazard: 'none', music: 'breakroom', locked: false },
  { id: 'morgue', name: 'MORGUE', sub: 'NO COMPLAINTS SO FAR', hazard: 'none', music: 'morgue', locked: true },
  { id: 'cafeteria', name: 'CAFETERIA', sub: 'TODAY: FISH. TOMORROW: FISH', hazard: 'fish', music: 'cafeteria', locked: false },
];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const VH = 216; // view height
const FY = 176; // floor top (wall base)
const HZ = 104; // horizon (vanishing line) used for the floor/ceiling perspective
const DC = 300; // camera distance (world units) used for floor depth patterns
const BPF = 0.8; // back wall parallax; equals floor scale at y=FY so wall & floor meet seamlessly
const PAD = 80; // plane texture left padding
const TEXW = 1184; // plane texture width
const OUT = '#1c1622'; // standard outline colour

const floorS = (y) => (y - HZ) / 90; // floor scale at screen row y (1 at y=194)
const layerW = (pf) => Math.ceil(480 + 320 * pf) + 4;

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
const RGBC = new Map();
function rgb(c) {
  let v = RGBC.get(c);
  if (v) return v;
  let h = c.charAt(0) === '#' ? c.slice(1) : c;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  RGBC.set(c, v);
  return v;
}
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hx = (r, g, b) => '#' + ((1 << 24) | (cl(r) << 16) | (cl(g) << 8) | cl(b)).toString(16).slice(1);
const SHC = new Map();
// k > 0 lightens toward white, k < 0 darkens toward black
function shade(c, k) {
  const key = c + k;
  let v = SHC.get(key);
  if (v) return v;
  const e = c.charAt(0) === '!';
  const [r, g, b] = rgb(e ? c.slice(1) : c);
  v = k >= 0 ? hx(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : hx(r * (1 + k), g * (1 + k), b * (1 + k));
  if (e) v = '!' + v;
  SHC.set(key, v);
  return v;
}
function mix(a, b, t) {
  const A = rgb(a.replace('!', '')), B = rgb(b.replace('!', ''));
  return hx(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
// Night-shift palette: darker, cooler, a little desaturated. Emissive colours
// are written with a leading '!' and bypass this.
const NIGHTC = new Map();
function nightCol(c) {
  let v = NIGHTC.get(c);
  if (v) return v;
  const [r, g, b] = rgb(c);
  const l = 0.3 * r + 0.55 * g + 0.15 * b;
  v = hx(r * 0.36 + l * 0.02 + 3, g * 0.39 + l * 0.03 + 5, b * 0.5 + l * 0.04 + 17);
  NIGHTC.set(c, v);
  return v;
}
const colN = (c, n) => (c.charAt(0) === '!' ? c.slice(1) : n ? nightCol(c) : c);

// deterministic hash -> [0,1)
function hash(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Painter: fillRect pixel-art helpers working on an offscreen canvas.
// Colours pass through the night palette unless prefixed with '!'.
// ---------------------------------------------------------------------------
class Painter {
  constructor(c, night) {
    this.c = c;
    this.g = c.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.n = night;
    this.pats = new Map();
  }
  col(c) {
    return colN(c, this.n);
  }
  R(x, y, w, h, c) {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = this.col(c);
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  P(x, y, c) {
    this.R(x, y, 1, 1, c);
  }
  // outlined box
  B(x, y, w, h, fill, ol = OUT) {
    this.R(x, y, w, h, ol);
    this.R(x + 1, y + 1, w - 2, h - 2, fill);
  }
  // bevelled box: light top/left, dark bottom/right, optional outline
  V(x, y, w, h, base, ol = OUT, k = 0.25) {
    if (ol) {
      this.R(x, y, w, h, ol);
      x++; y++; w -= 2; h -= 2;
    }
    this.R(x, y, w, h, base);
    this.R(x, y, w, 1, shade(base, k));
    this.R(x, y, 1, h, shade(base, k * 0.6));
    this.R(x, y + h - 1, w, 1, shade(base, -k));
    this.R(x + w - 1, y + 1, 1, h - 1, shade(base, -k * 0.8));
  }
  pat(c1, c2, kind = 0) {
    const a = this.col(c1), b = this.col(c2);
    const key = a + b + kind;
    let p = this.pats.get(key);
    if (!p) {
      const t = mkCanvas(4, 4), g = t.getContext('2d');
      g.fillStyle = a;
      g.fillRect(0, 0, 4, 4);
      g.fillStyle = b;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const on = kind === 0 ? (x + y) & 1 : kind === 1 ? !(x & 1) && !(y & 1) : kind === 2 ? ((x + y) & 1) || !(y & 1) : (x + y) % 4 === 0;
          if (on) g.fillRect(x, y, 1, 1);
        }
      p = this.g.createPattern(t, 'repeat');
      this.pats.set(key, p);
    }
    return p;
  }
  // wall tiles: grout on right/bottom edges, highlight on top/left
  tiles(x, y, w, h, base, sw = 8, sh = 8, grout) {
    const gC = this.col(grout || shade(base, -0.2)), b = this.col(base), hl = this.col(shade(base, 0.12));
    const key = 'T' + b + gC + sw + sh;
    let pt = this.pats.get(key);
    if (!pt) {
      const t = mkCanvas(sw, sh), g = t.getContext('2d');
      g.fillStyle = b; g.fillRect(0, 0, sw, sh);
      g.fillStyle = hl; g.fillRect(0, 0, sw - 1, 1); g.fillRect(0, 0, 1, sh - 1);
      g.fillStyle = gC; g.fillRect(sw - 1, 0, 1, sh); g.fillRect(0, sh - 1, sw, 1);
      pt = this.g.createPattern(t, 'repeat');
      this.pats.set(key, pt);
    }
    this.g.fillStyle = pt;
    this.g.fillRect(x, y, w, h);
  }
  // checker dither (kind 0), sparse dots (1), 75% (2), diagonal lines (3)
  D(x, y, w, h, c1, c2, kind = 0) {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = this.pat(c1, c2, kind);
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // banded vertical gradient with dithered seams
  G(x, y, w, h, cols) {
    const n = cols.length;
    for (let i = 0; i < n; i++) {
      const y0 = y + Math.round((h * i) / n), y1 = y + Math.round((h * (i + 1)) / n);
      this.R(x, y0, w, y1 - y0, cols[i]);
      if (i > 0) this.D(x, y0, w, 2, cols[i - 1], cols[i]);
    }
  }
  // horizontal banded gradient
  GH(x, y, w, h, cols) {
    const n = cols.length;
    for (let i = 0; i < n; i++) {
      const x0 = x + Math.round((w * i) / n), x1 = x + Math.round((w * (i + 1)) / n);
      this.R(x0, y, x1 - x0, h, cols[i]);
      if (i > 0) this.D(x0, y, 2, h, cols[i - 1], cols[i]);
    }
  }
  T(s, x, y, color, o = {}) {
    const opt = { font: o.font || 'small', color: this.col(color), align: o.align, scale: o.scale };
    if (o.outline) opt.outline = this.col(o.outline);
    if (o.shadow) opt.shadow = this.col(o.shadow);
    if (o.gradient) opt.gradient = o.gradient.map((c) => this.col(c));
    return drawText(this.g, s, x, y, opt);
  }
  // filled ellipse in bounding box
  E(x, y, w, h, c) {
    const cx = x + w / 2;
    for (let j = 0; j < h; j++) {
      const v = (j + 0.5 - h / 2) / (h / 2);
      const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - v * v));
      const l = Math.round(cx - hw), r = Math.round(cx + hw);
      this.R(l, y + j, r - l, 1, c);
    }
  }
  // ring (ellipse outline of thickness t)
  ER(x, y, w, h, c, t = 1) {
    const cx = x + w / 2;
    for (let j = 0; j < h; j++) {
      const v = (j + 0.5 - h / 2) / (h / 2);
      const hw = (w / 2) * Math.sqrt(Math.max(0, 1 - v * v));
      const l = Math.round(cx - hw), r = Math.round(cx + hw);
      const iv = (j + 0.5 - h / 2) / (h / 2 - t);
      if (Math.abs(iv) >= 1) { this.R(l, y + j, r - l, 1, c); continue; }
      const ihw = (w / 2 - t) * Math.sqrt(1 - iv * iv);
      const il = Math.round(cx - ihw), ir = Math.round(cx + ihw);
      this.R(l, y + j, Math.max(1, il - l), 1, c);
      this.R(Math.min(ir, r - 1), y + j, Math.max(1, r - ir), 1, c);
    }
  }
  L(x0, y0, x1, y1, c, w = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.R(x0, y0, w, w, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // diagonal hazard stripes
  HZ(x, y, w, h, c1 = '#e8b818', c2 = '#2a2422', sw = 3) {
    this.R(x, y, w, h, c1);
    for (let j = 0; j < h; j++)
      for (let i = -h - sw * 2; i < w; i += sw * 2) {
        const a = Math.max(0, i + j), b = Math.min(w, i + j + sw);
        if (b > a) this.R(x + a, y + j, b - a, 1, c2);
      }
  }
  clr(x, y, w, h) {
    this.g.clearRect(x, y, w, h);
  }
  // translucent glass: clears then tints so the far layer shows through
  glass(x, y, w, h, c, a) {
    this.g.clearRect(x, y, w, h);
    const ga = this.g.globalAlpha;
    this.g.globalAlpha = a;
    this.R(x, y, w, h, c);
    this.g.globalAlpha = ga;
  }
  alpha(a, fn) {
    const ga = this.g.globalAlpha;
    this.g.globalAlpha = a;
    fn();
    this.g.globalAlpha = ga;
  }
  // banded glow: 3 hard-edged translucent ellipses (pixel-crisp, no AA)
  glow(cx, cy, rx, ry, c, a = 0.1) {
    for (let i = 0; i < 3; i++) {
      const k = 1 - i * 0.3;
      this.alpha(a, () => this.E(Math.round(cx - rx * k), Math.round(cy - ry * k), Math.round(rx * k * 2), Math.round(ry * k * 2), c));
    }
  }
  // drop shadow for wall-mounted objects (light comes from the upper left)
  SH(x, y, w, h, d = 2, a = 0.2) {
    this.alpha(a, () => this.R(x + d, y + d, w, h, '!#000000'));
  }
}

// per-frame drawing helpers (screen space)
function fr(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ---------------------------------------------------------------------------
// Perspective planes (floor / ceiling). Each screen row is a strip of a
// pre-rendered texture; row r scrolls by camX * s(r), so the floor moves 1:1
// at the fighter line (y=194), slower at the back and faster in front.
// ---------------------------------------------------------------------------
function buildPlane(y0, y1, sFn, shader, night) {
  const n = y1 - y0;
  const c = mkCanvas(TEXW, n);
  const g = c.getContext('2d');
  const img = g.createImageData(TEXW, n);
  const d = img.data;
  const S = new Float32Array(n);
  const q = { y: 0, r: 0, s: 1, wz0: 0, wz1: 0, n: night, f: 0 };
  for (let r = 0; r < n; r++) {
    const y = y0 + r;
    const s = sFn(y + 0.5), sa = sFn(y), sb = sFn(y + 1);
    S[r] = s;
    const za = DC * (1 / sa - 1), zb = DC * (1 / sb - 1);
    q.y = y; q.r = r; q.s = s;
    q.wz0 = Math.min(za, zb); q.wz1 = Math.max(za, zb);
    q.f = r / n; // 0 at top row of the plane, ~1 at bottom
    const wz = DC * (1 / s - 1);
    let last = '', lr = 0, lg = 0, lb = 0;
    for (let px = 0; px < TEXW; px++) {
      const wx0 = (px - PAD) / s, wx1 = (px + 1 - PAD) / s;
      const cs = shader((wx0 + wx1) / 2, wz, wx0, wx1, q);
      if (cs !== last) {
        last = cs;
        const v = rgb(colN(cs, night));
        lr = v[0]; lg = v[1]; lb = v[2];
      }
      const i = (r * TEXW + px) * 4;
      d[i] = lr; d[i + 1] = lg; d[i + 2] = lb; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { c, S, y0, n };
}
function blitPlane(ctx, P, cx, vw) {
  const half = vw / 2, S = P.S, c = P.c, y0 = P.y0;
  for (let r = 0; r < P.n; r++) {
    const sx = Math.round(PAD + cx * S[r] - half);
    ctx.drawImage(c, sx, r, vw, 1, 0, y0 + r, vw, 1);
  }
}
// does a grid line of period T fall inside [a0, a1)?
const seam = (a0, a1, T, o = 0) => Math.floor((a0 - o) / T) !== Math.floor((a1 - o) / T);
const cell = (a, T) => Math.floor(a / T);

// ---------------------------------------------------------------------------
// Tiny people (spectators). Sprites are generated once per spec + night,
// with a 1px dark outline, in a few poses.
// ---------------------------------------------------------------------------
const SKIN = ['#f6d2b2', '#e8b48c', '#cf9466', '#a86e44', '#7c4c2e', '#5a3622'];
const HAIR = ['#2c1e16', '#4c2e1a', '#7c4c24', '#c49442', '#e6c870', '#8e8e8e', '#dedede', '#a63c20', '#17151c'];
const SCRUBS = ['#48a8a0', '#4070b8', '#d874a2', '#7c5cb8', '#50a058', '#8c3450', '#3098c8', '#5a6ac0'];
const SHIRTS = ['#d84848', '#e8a030', '#4890d0', '#58a858', '#a058b0', '#e0d050', '#e07090', '#50b8b0', '#c86030', '#7070d0'];
const PANTS = ['#3c4e78', '#2e3448', '#5a4a3a', '#4a4a50', '#6a5a40', '#304060'];
const SPR_W = 28;

function personSpec(kind, seed, extra = {}) {
  const r = rng(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const s = { k: kind, skin: pick(SKIN), hair: pick(HAIR), hs: pick(['short', 'short', 'long', 'bun', 'bald', 'afro', 'short', 'long']), H: 21 + Math.floor(r() * 4), glasses: r() < 0.2, beard: false };
  if (s.hs === 'bald' && r() < 0.5) s.hair = pick(['#8e8e8e', '#dedede', '#2c1e16']);
  if (kind === 'doctor') {
    s.top = pick(['#a8c8f0', '#f0b8c8', '#f0f0e8', '#b8e0b0', '#d8d0f0']);
    s.bot = pick(PANTS);
    s.coat = true; s.tie = r() < 0.5; s.steth = true;
    s.beard = r() < 0.2;
  } else if (kind === 'nurse') {
    s.top = s.bot = pick(SCRUBS); s.short = true; s.vneck = true;
    if (r() < 0.3) s.steth = true;
  } else if (kind === 'surgeon') {
    s.top = s.bot = pick(['#4a9a8e', '#3e78a8', '#5aa078', '#4a88b0']); s.short = true; s.vneck = true;
    s.cap = r() < 0.5 ? s.top : pick(['#e05878', '#e0b030', '#58a0e0', '#9060c0']); s.mask = true; s.hs = 'cap';
  } else if (kind === 'patient') {
    s.top = pick(['#a0c4e0', '#b8d8e8', '#c8c0e0', '#a8d0c0']); s.bot = s.skin; s.gown = true; s.short = true;
    s.shoe = '#cfcfd8';
  } else if (kind === 'visitor') {
    s.top = pick(SHIRTS); s.bot = pick(PANTS); s.short = r() < 0.5;
    s.beard = r() < 0.25;
  } else if (kind === 'guard') {
    s.top = '#2e3a5c'; s.bot = '#262c40'; s.hs = 'hat'; s.badge = true; s.H = 23;
  } else if (kind === 'suit') {
    s.top = pick(['#3a4058', '#4a4a50', '#2c3040', '#58463a']); s.bot = s.top; s.suit = true; s.tie = true;
  } else if (kind === 'lunch') {
    s.top = '#e898a8'; s.bot = '#e898a8'; s.apron = true; s.hs = 'net'; s.short = true;
  } else if (kind === 'janitor') {
    s.top = s.bot = '#6a7a5c'; s.badge = false;
  } else if (kind === 'kid') {
    s.top = pick(SHIRTS); s.bot = pick(PANTS); s.H = 16; s.short = true; s.glasses = false;
  } else if (kind === 'tech') {
    s.top = s.bot = '#30406a'; s.short = true; s.vneck = true;
  } else if (kind === 'skeleton') {
    s.skel = true; s.top = '#e6e0d0'; s.bot = '#e6e0d0'; s.skin = '#e6e0d0';
  }
  if (s.coat || s.suit) s.short = false;
  return Object.assign(s, extra);
}

function drawPerson(p, s, pose, cx, fy) {
  const sit = pose.startsWith('sit');
  const H = s.H || 22;
  const headH = 6;
  const torso = H >= 24 ? 9 : H >= 22 ? 8 : H >= 19 ? 7 : 5;
  let legs = H - headH - torso - 1;
  if (sit) legs = Math.max(3, legs - 3);
  const yT = fy - (headH + torso + legs + 1) + 1;
  const yB = yT + headH, yL = yB + torso;
  const skin = s.skin, skinD = shade(skin, -0.18);
  const top = s.top, topD = shade(top, -0.22), topL = shade(top, 0.18);
  const bot = s.gown ? skin : s.bot, botD = shade(bot, -0.22);
  const shoe = s.shoe || '#2a2228';
  const coat = '#eceef2', coatD = '#b8bcc8';
  const sleeve = s.coat ? coat : top;
  if (s.skel) return drawSkeleton(p, pose, cx, fy, sit);
  // ---- legs
  if (sit) {
    const lapC = s.gown ? top : bot;
    p.R(cx - 4, yL, 8, 2, lapC);
    p.R(cx - 4, yL + 1, 8, 1, shade(lapC, -0.15));
    p.R(cx - 3, yL + 2, 2, legs - 2, bot);
    p.R(cx + 1, yL + 2, 2, legs - 2, botD);
    p.R(cx - 4, fy, 3, 1, shoe);
    p.R(cx + 1, fy, 3, 1, shoe);
  } else {
    p.R(cx - 3, yL, 6, 1, bot);
    p.R(cx - 3, yL + 1, 2, legs - 1, bot);
    p.R(cx + 1, yL + 1, 2, legs - 1, botD);
    p.R(cx - 4, fy, 3, 1, shoe);
    p.R(cx + 1, fy, 3, 1, shoe);
  }
  // ---- torso
  p.R(cx - 3, yB, 6, torso, top);
  p.R(cx + 2, yB, 1, torso, topD);
  p.R(cx - 3, yB, 6, 1, topL);
  if (s.gown) {
    const gl = sit ? 0 : 3;
    p.R(cx - 4, yB + 1, 8, torso - 1 + gl, top);
    p.R(cx + 3, yB + 1, 1, torso - 1 + gl, topD);
    p.D(cx - 3, yB + 2, 5, torso - 2 + gl, top, shade(top, 0.35), 1);
  }
  if (s.vneck) p.R(cx - 1, yB, 2, 1, skin), p.P(cx - 1 + (s.k === 'tech' ? 0 : 1), yB + 1, skinD);
  if (s.suit) {
    p.R(cx - 1, yB, 2, 3, '#f0f0f0');
    p.R(cx - 1, yB, 1, 4, '#c03038');
  }
  if (s.coat) {
    const cl2 = sit ? 1 : 3;
    p.R(cx - 4, yB, 8, torso + cl2, coat);
    p.R(cx + 3, yB, 1, torso + cl2, coatD);
    p.R(cx - 1, yB, 2, torso - 2, top);
    if (s.tie) p.R(cx - 1, yB + 1, 1, torso - 3, '#c83838');
    p.P(cx - 3, yB + 4, coatD);
    p.P(cx + 2, yB + 4, coatD);
  }
  if (s.apron) {
    p.R(cx - 2, yB + 1, 4, torso - 1 + (sit ? 0 : 3), '#f4f2ea');
    p.R(cx - 3, yB + 3, 6, 1, '#f4f2ea');
  }
  if (s.steth) {
    p.R(cx - 2, yB, 1, 3, '#50586a');
    p.R(cx + 1, yB, 1, 2, '#50586a');
    p.P(cx + 1, yB + 2, '#d0d8e0');
  }
  if (s.badge) p.P(cx - 2, yB + 2, '#f0c838'), p.R(cx - 3, yL - 1, 6, 1, '#1a1a22');
  if (s.k === 'janitor') p.R(cx - 2, yB + 1, 1, torso, shade(top, -0.3)), p.R(cx + 1, yB + 1, 1, torso, shade(top, -0.3));
  // ---- arms
  const armL = (x, y, h, up) => {
    if (s.short) {
      if (up) { p.R(x, y, 2, h - 3, skin); p.R(x, y + h - 3, 2, 3, sleeve); }
      else { p.R(x, y, 2, 3, sleeve); p.R(x, y + 3, 2, h - 3, skin); }
    } else {
      if (up) { p.R(x, y, 2, 2, skin); p.R(x, y + 2, 2, h - 2, sleeve); }
      else { p.R(x, y, 2, h - 1, sleeve); p.R(x, y + h - 1, 2, 1, skin); }
    }
  };
  const armR = (x, y, h, up) => {
    armL(x, y, h, up);
    p.R(x + 1, y + (up ? 2 : 0), 1, h - (up ? 2 : 1), shade(s.short ? skin : sleeve, -0.18));
  };
  const ah = torso + (s.coat ? 0 : 0);
  if (pose === 'up' || pose === 'situp') {
    if (!s.sling) armL(cx - 5, yT - 4, headH + 5, true);
    else p.R(cx - 4, yB + 2, 5, 3, '#f4f4f4');
    armR(cx + 3, yT - 4, headH + 5, true);
  } else if (pose === 'v') {
    // diagonal "V" cheer
    const dl = (sx, dir) => {
      for (let i = 0; i < 4; i++) p.R(sx + dir * i, yB - 1 - i * 2, 2, 2, i >= 2 ? (s.short ? skin : sleeve) : sleeve);
      p.R(sx + dir * 4, yB - 9, 2, 2, skin);
    };
    if (!s.sling) dl(cx - 5, -1); else p.R(cx - 4, yB + 2, 5, 3, '#f4f4f4');
    dl(cx + 3, 1);
  } else if (pose === 'wave') {
    if (!s.sling) armL(cx - 5, yB + 1, ah, false); else p.R(cx - 4, yB + 2, 5, 3, '#f4f4f4');
    armR(cx + 3, yT - 4, headH + 5, true);
  } else if (pose === 'clap') {
    p.R(cx - 5, yB + 1, 2, 4, sleeve);
    p.R(cx + 3, yB + 1, 2, 4, sleeve);
    p.R(cx - 3, yB + 4, 2, 2, sleeve);
    p.R(cx + 1, yB + 4, 2, 2, sleeve);
    p.R(cx - 1, yB + 3, 2, 3, skin);
  } else {
    if (s.sling) p.R(cx - 4, yB + 2, 5, 3, '#f4f4f4'), p.R(cx - 5, yB + 1, 2, 2, sleeve);
    else armL(cx - 5, yB + 1, ah, false);
    armR(cx + 3, yB + 1, ah, false);
  }
  // ---- head
  p.R(cx - 3, yT, 6, headH, skin);
  p.R(cx + 2, yT + 1, 1, headH - 1, skinD);
  const eye = '#1a1418';
  p.P(cx - 2, yT + 3, eye);
  p.P(cx + 1, yT + 3, eye);
  if (s.glasses) { p.R(cx - 3, yT + 3, 6, 1, '#3a3a48'); p.P(cx - 2, yT + 3, '#b8d0e8'); p.P(cx + 1, yT + 3, '#b8d0e8'); }
  const cheer = pose === 'up' || pose === 'v' || pose === 'situp';
  if (s.beard) { p.R(cx - 3, yT + 4, 1, 2, s.hair); p.R(cx + 2, yT + 4, 1, 2, s.hair); p.R(cx - 2, yT + 5, 4, 1, s.hair); }
  if (cheer) p.R(cx - 1, yT + 5, 2, 1, '#7a2228');
  if (s.mask) p.R(cx - 3, yT + 4, 6, 2, '#a8d0e4'), p.R(cx + 2, yT + 4, 1, 2, '#88b0c8');
  const hc = s.hair, hcD = shade(hc, -0.25);
  switch (s.hs) {
    case 'short': p.R(cx - 3, yT, 6, 2, hc); p.P(cx - 3, yT + 2, hc); p.P(cx + 2, yT + 2, hcD); p.R(cx - 2, yT - 1, 4, 1, hc); break;
    case 'long': p.R(cx - 3, yT - 1, 6, 3, hc); p.R(cx - 4, yT, 1, 8, hc); p.R(cx + 3, yT, 1, 8, hcD); p.P(cx - 3, yT + 2, hc); break;
    case 'bun': p.R(cx - 3, yT, 6, 2, hc); p.R(cx - 1, yT - 2, 3, 2, hc); p.P(cx + 2, yT + 2, hcD); break;
    case 'bald': p.R(cx - 3, yT + 2, 1, 2, hc); p.R(cx + 2, yT + 2, 1, 2, hcD); p.P(cx - 1, yT, shade(skin, 0.3)); break;
    case 'afro': p.R(cx - 4, yT - 2, 8, 4, hc); p.R(cx - 4, yT + 2, 1, 2, hc); p.R(cx + 3, yT + 2, 1, 2, hcD); break;
    case 'cap': p.R(cx - 4, yT - 1, 8, 3, s.cap); p.R(cx - 4, yT + 1, 8, 1, shade(s.cap, -0.2)); p.D(cx - 3, yT - 1, 6, 2, s.cap, shade(s.cap, 0.3), 1); break;
    case 'hat': p.R(cx - 3, yT - 2, 6, 3, '#26304c'); p.R(cx - 4, yT + 1, 8, 1, '#141824'); p.P(cx - 1, yT - 1, '#e0c040'); break;
    case 'net': p.R(cx - 4, yT - 2, 8, 4, '#d8d8e0'); p.D(cx - 4, yT - 2, 8, 4, '#d8d8e0', hc, 0); break;
  }
  // ---- held props
  if (s.clip && !cheer && pose !== 'clap') { p.R(cx - 3, yB + 3, 4, 5, '#8a5a2a'); p.R(cx - 2, yB + 4, 2, 3, '#f4f4f0'); }
  if (s.coffee && !cheer) { p.R(cx + 4, yB + torso - 2, 2, 3, '#f4f4f0'); p.P(cx + 4, yB + torso - 2, '#6a3a1a'); }
  if (s.balloon) {
    const bx = cx + 7, by = yT - 13;
    p.L(cx + 4, yB + (pose === 'idle' || pose === 'sit' ? torso : -4), bx + 1, by + 7, '#e0e0e0');
    p.E(bx - 2, by, 6, 7, s.balloon);
    p.P(bx - 1, by + 1, '#ffffff');
    p.P(bx + 1, by + 7, s.balloon);
  }
  if (s.iv) {
    const ix = cx + 8;
    p.R(ix, yT - 5, 1, fy - yT + 5, '#9aa2ac');
    p.R(ix - 2, yT - 5, 5, 1, '#9aa2ac');
    p.R(ix - 3, yT - 4, 3, 5, '#d8eef6');
    p.P(ix - 2, yT + 1, '#e04040');
    p.R(ix - 2, fy, 5, 1, '#5a626c');
  }
  if (s.bandage) p.R(cx - 3, yT + 1, 6, 1, '#f6f6f6'), p.P(cx + 2, yT + 2, '#f6f6f6');
  if (s.icepack) p.R(cx - 4, yT - 2, 4, 3, '#78c8f0');
}

function drawSkeleton(p, pose, cx, fy, sit) {
  const b = '#e8e2d2', bd = '#b0a890';
  const yT = fy - 18;
  // skull
  p.R(cx - 3, yT, 6, 5, b);
  p.R(cx + 2, yT + 1, 1, 4, bd);
  p.R(cx - 2, yT + 2, 2, 2, '#201818');
  p.R(cx + 1, yT + 2, 1, 2, '#201818');
  p.R(cx - 2, yT + 5, 4, 1, b);
  p.P(cx - 1, yT + 5, '#201818'); p.P(cx + 1, yT + 5, '#201818');
  // spine + ribs
  p.R(cx - 1, yT + 6, 1, 8, b);
  for (let i = 0; i < 3; i++) p.R(cx - 3, yT + 7 + i * 2, 6, 1, i === 2 ? bd : b);
  // pelvis
  p.R(cx - 3, yT + 13, 6, 2, b);
  // arms
  if (pose === 'up' || pose === 'situp') { p.R(cx - 5, yT - 3, 1, 9, b); p.R(cx + 4, yT - 3, 1, 9, b); }
  else { p.R(cx - 4, yT + 7, 1, 7, b); p.R(cx + 3, yT + 7, 1, 7, bd); }
  // legs (sitting)
  p.R(cx - 4, yT + 15, 8, 1, b);
  p.R(cx - 3, yT + 16, 1, 2, b); p.R(cx + 2, yT + 16, 1, 2, bd);
  p.R(cx - 4, fy, 2, 1, b); p.R(cx + 2, fy, 2, 1, b);
}

// draw a static (non-animated) person straight into a layer
function stamp(p, spec, pose, x, fy) {
  const spr = makePersonSprites(spec, p.n);
  p.g.drawImage(spr[pose] || spr.idle || spr.sit, Math.round(x) - 13, Math.round(fy) - spr.fy);
}

function outlineCanvas(src, color) {
  const c = mkCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 1, 0); g.drawImage(src, -1, 0); g.drawImage(src, 0, 1); g.drawImage(src, 0, -1);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(src, 0, 0);
  return c;
}

const POSES = ['idle', 'up', 'v', 'wave', 'clap', 'sit', 'situp'];
function makePersonSprites(spec, night) {
  const H = (spec.H || 22) + 20;
  const out = { h: H, fy: H - 3 };
  for (const pose of POSES) {
    if (pose.startsWith('sit') !== !!spec.sit) continue;
    const c = mkCanvas(SPR_W, H);
    const p = new Painter(c, night);
    drawPerson(p, spec, pose, 13, out.fy);
    out[pose] = outlineCanvas(c, night ? '#0c0a14' : '#211a26');
  }
  return out;
}

// crowd member: {x, y(feet row), s: spec, th: excite threshold, ph: phase, L: layer key}
function drawCrowd(ctx, list, offs, o) {
  const e = o.excite || 0, t = o.t;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    const off = offs[m.L || 'back'];
    const x = m.x - off;
    if (x < -20 || x > o.viewW + 20) continue;
    const sp = m.spr;
    const hype = e - m.th;
    let img, dy = 0;
    const tt = t + m.ph;
    if (m.s.sit) {
      img = hype > 0 && ((tt / (hype > 0.3 ? 5 : 9)) | 0) & 1 ? sp.situp : sp.sit;
      if (hype > 0.25 && !m.s.skel) dy = -(((tt / 6) | 0) & 1);
      else if (!m.s.skel && ((tt >> 6) & 3) === 0) dy = 1;
    } else if (hype > 0) {
      const rate = hype > 0.45 ? 5 : hype > 0.2 ? 7 : 11;
      const k = ((tt / rate) | 0) % 4;
      const alt = m.alt || 0;
      img = alt === 0 ? (k & 1 ? sp.up : sp.idle) : alt === 1 ? (k & 1 ? sp.v : sp.up) : alt === 2 ? (k & 1 ? sp.wave : sp.idle) : k & 1 ? sp.clap : sp.idle;
      if (hype > 0.15) dy = -Math.round(Math.abs(Math.sin(tt * 0.21)) * (1 + Math.min(1, hype) * 5));
    } else {
      img = sp.idle;
      // idle: slow breathing bob, occasional clap/wave chatter
      if (((tt >> 5) & 3) === 1) dy = 1;
      if (m.fidget && ((tt >> 7) & 7) === 3) img = ((tt >> 3) & 1) ? sp[m.fidget] : sp.idle;
    }
    ctx.drawImage(img, x - 13, m.y - sp.fy + dy);
  }
}

// ---------------------------------------------------------------------------
// Shared prop painters (all in layer coordinates)
// ---------------------------------------------------------------------------
function sign(p, x, y, w, h, bg, fg, text, o = {}) {
  if (!o.noShadow) p.SH(x, y, w, h);
  p.B(x, y, w, h, bg, o.ol || OUT);
  if (o.bevel !== false) {
    p.R(x + 1, y + 1, w - 2, 1, shade(bg, 0.25));
    p.R(x + 1, y + h - 2, w - 2, 1, shade(bg, -0.25));
  }
  const lines = Array.isArray(text) ? text : [text];
  const font = o.font || 'small';
  const lh = font === 'big' ? 9 * (o.scale || 1) : 6;
  const th = lines.length * lh - (font === 'big' ? 2 : 1);
  let ty = y + Math.round((h - th) / 2);
  for (const ln of lines) {
    p.T(ln, x + Math.round(w / 2), ty, fg, { font, align: 'center', scale: o.scale, shadow: o.shadow });
    ty += lh;
  }
}
function poster(p, x, y, w, h, bg, lines, fg = '#202020', art) {
  p.alpha(0.3, () => p.R(x + 1, y + 1, w, h, '!#000000'));
  p.R(x, y, w, h, bg);
  p.R(x, y, w, 1, shade(bg, 0.3));
  p.R(x + w - 1, y, 1, h, shade(bg, -0.25));
  p.R(x, y + h - 1, w, 1, shade(bg, -0.3));
  if (art) art(x, y);
  let ty = y + 3;
  for (const ln of lines) {
    if (ln) p.T(ln, x + Math.round(w / 2), ty, fg, { align: 'center' });
    ty += 6;
  }
  p.P(x + Math.round(w / 2), y + 1, '#c03030');
}
// round wall clock with static hands at 10:10 (animated hands drawn per frame where wanted)
function wallClock(p, cx, cy, r, face = '#f4f0e6', rim = '#3a3a44', hands = true) {
  p.E(cx - r - 1, cy - r - 1, r * 2 + 2, r * 2 + 2, OUT);
  p.E(cx - r, cy - r, r * 2, r * 2, rim);
  p.E(cx - r + 2, cy - r + 2, r * 2 - 4, r * 2 - 4, face);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.P(Math.round(cx + Math.sin(a) * (r - 3.5)) - (i % 3 === 0 ? 0 : 0), Math.round(cy - Math.cos(a) * (r - 3.5)), i % 3 === 0 ? '#202020' : '#9090a0');
  }
  if (hands) {
    p.L(cx, cy, cx - 3, cy - 2, '#202020');
    p.L(cx, cy, cx + 3, cy - r + 4, '#202020');
  }
}
function clockHands(ctx, cx, cy, r, t, speed, col) {
  const m = (t * speed) / 60;
  const am = (m % 60) / 60 * Math.PI * 2, ah = ((m / 60) % 12) / 12 * Math.PI * 2;
  const L = (a, len) => {
    for (let i = 0; i <= len; i++) fr(ctx, cx + Math.round(Math.sin(a) * i), cy - Math.round(Math.cos(a) * i), 1, 1, col);
  };
  L(ah, r * 0.45);
  L(am, r * 0.75);
}
function ceilLight(p, x, y, w, n) {
  // recessed fluorescent fixture seen from below (thin)
  p.R(x, y, w, 3, n ? '!#fffbe8' : '#f4f6f8');
  p.R(x, y + 3, w, 1, n ? '#80808a' : '#b0b4bc');
}
function plant(p, x, fy, s = 1) {
  const pot = '#b0603a';
  p.V(x, fy - 9, 10, 9, pot);
  p.R(x + 1, fy - 9, 8, 2, shade(pot, -0.35));
  const leaf = ['#2f7a3a', '#3f9a48', '#58b85a'];
  const pts = [[5, -24], [1, -20], [9, -21], [-2, -15], [11, -15], [3, -16], [7, -17], [4, -12], [0, -11], [9, -11]];
  for (let i = 0; i < pts.length; i++) {
    const [lx, ly] = pts[i];
    p.R(x + lx - 1, fy + ly - 1, 5, 4, OUT);
  }
  for (let i = 0; i < pts.length; i++) {
    const [lx, ly] = pts[i];
    p.R(x + lx, fy + ly, 3, 2, leaf[i % 3]);
    p.P(x + lx, fy + ly, leaf[2]);
  }
  p.R(x + 4, fy - 14, 1, 5, '#2a5a2a');
}
function ivPole(p, x, fy, h = 44) {
  p.R(x, fy - h, 1, h, '#a4acb6');
  p.R(x + 1, fy - h, 1, h, '#6a7280');
  p.R(x - 4, fy - h, 10, 1, '#8a929c');
  p.B(x - 5, fy - h + 1, 5, 8, '!#d8f0f8', '#7a8a96');
  p.R(x - 4, fy - h + 5, 3, 3, '#e8f8ff');
  p.L(x - 3, fy - h + 9, x - 2, fy - h + 22, '#c8e0e8');
  p.R(x - 4, fy - 1, 10, 1, '#4a5260');
  p.P(x - 4, fy, '#202028');
  p.P(x + 5, fy, '#202028');
}
function wheelchair(p, x, fy) {
  const m = '#6a7484', d = '#2a2e38';
  p.ER(x, fy - 14, 15, 15, d, 2);
  p.ER(x + 1, fy - 13, 13, 13, '#9aa4b0', 1);
  p.L(x + 7, fy - 13, x + 7, fy - 1, '#9aa4b0');
  p.L(x + 1, fy - 7, x + 13, fy - 7, '#9aa4b0');
  p.B(x + 2, fy - 20, 15, 4, '#384888');
  p.B(x + 13, fy - 32, 4, 14, '#384888');
  p.R(x + 15, fy - 33, 4, 2, m);
  p.R(x + 1, fy - 22, 10, 1, m);
  p.L(x + 4, fy - 16, x - 1, fy - 3, m);
  p.R(x - 3, fy - 3, 4, 1, d);
  p.E(x - 2, fy - 2, 3, 3, d);
}
// steel double doors with porthole windows
function doubleDoor(p, x, y, w, h, c, label, labelC = '#202020') {
  p.R(x - 3, y - 3, w + 6, h + 3, OUT);
  p.R(x - 2, y - 2, w + 4, h + 2, '#8a929c');
  p.R(x - 2, y - 2, w + 4, 1, '#c0c6ce');
  const dw = w / 2;
  for (let i = 0; i < 2; i++) {
    const dx = x + i * dw;
    p.V(dx, y, dw, h, c, OUT, 0.18);
    p.E(dx + dw / 2 - 5, y + 14, 10, 12, OUT);
    p.E(dx + dw / 2 - 4, y + 15, 8, 10, '#9ab4c4');
    p.R(dx + dw / 2 - 2, y + 17, 2, 3, '#d8eef6');
    p.R(dx + (i ? 3 : dw - 6), y + h * 0.55, 3, 8, '#c4ccd4');
    p.R(dx + 3, y + h - 12, dw - 6, 9, shade(c, -0.12));
  }
  if (label) p.T(label, x + w / 2, y + h * 0.42, labelC, { align: 'center' });
}
// counter / desk front
function counter(p, x, y, w, h, top, front, trim) {
  p.R(x - 1, y - 1, w + 2, h + 2, OUT);
  p.R(x, y, w, 4, top);
  p.R(x, y, w, 1, shade(top, 0.3));
  p.R(x, y + 3, w, 1, shade(top, -0.3));
  p.R(x, y + 4, w, h - 4, front);
  p.R(x, y + 4, w, 2, shade(front, -0.35));
  if (trim) p.R(x, y + h - 5, w, 2, trim);
  for (let i = x + 24; i < x + w - 4; i += 32) p.R(i, y + 7, 1, h - 12, shade(front, -0.15));
}
function crtMonitor(p, x, y, w = 16, h = 12, n) {
  p.V(x, y, w, h, '#d8d4c4');
  p.R(x + 2, y + 2, w - 4, h - 5, n ? '!#0a2a1a' : '#123020');
  p.R(x + w / 2 - 3, y + h, 6, 2, '#a8a494');
  p.R(x + w / 2 - 5, y + h + 2, 10, 1, '#6a6858');
}
function bed(p, x, fy, w = 54, sheet = '#e8eef4', blanket = '#7aa0c8', occupant = null) {
  // side view hospital bed
  const fr2 = '#8c96a4', dk = '#3a404c';
  p.R(x + 2, fy - 4, 3, 4, dk);
  p.R(x + w - 5, fy - 4, 3, 4, dk);
  p.E(x + 1, fy - 3, 4, 4, '#20242c');
  p.E(x + w - 6, fy - 3, 4, 4, '#20242c');
  p.R(x + 3, fy - 13, 2, 9, fr2);
  p.R(x + w - 5, fy - 13, 2, 9, fr2);
  p.B(x, fy - 16, w, 4, fr2);
  // head board
  p.B(x - 1, fy - 30, 5, 18, '#a8b0bc');
  p.B(x + w - 3, fy - 24, 4, 12, '#a8b0bc');
  // mattress + blanket
  p.B(x + 3, fy - 21, w - 5, 6, sheet);
  if (occupant) occupant(x, fy);
  p.B(x + 14, fy - 22, w - 16, 7, blanket);
  p.R(x + 15, fy - 21, w - 18, 1, shade(blanket, 0.3));
  p.R(x + 15, fy - 17, w - 18, 1, shade(blanket, -0.25));
  p.R(x + 5, fy - 22, 9, 4, '#f4f6fa');
  p.R(x + 5, fy - 23, 8, 1, '#ffffff');
  // side rail
  p.R(x + 18, fy - 20, 20, 1, '#c8d0d8');
}
function patientHead(p, x, y, skin, hair) {
  p.B(x, y, 7, 6, skin);
  p.R(x + 1, y + 1, 5, 2, hair);
  p.P(x + 4, y + 3, '#1a1418');
}
function bin(p, x, fy, c = '#3a7a4a') {
  p.V(x, fy - 12, 10, 12, c);
  p.R(x - 1, fy - 13, 12, 2, shade(c, -0.3));
}
function extinguisher(p, x, fy) {
  p.B(x - 2, fy - 36, 18, 8, '#c8c8d0');
  p.T('FIRE', x + 7, fy - 34, '#c02020', { align: 'center' });
  p.B(x + 3, fy - 26, 7, 14, '#d03030');
  p.R(x + 4, fy - 25, 1, 11, '#f07070');
  p.R(x + 5, fy - 29, 3, 3, '#202020');
  p.R(x + 8, fy - 28, 3, 1, '#202020');
}
function sanitizer(p, x, y) {
  p.V(x, y, 9, 14, '#e8eaee');
  p.R(x + 2, y + 9, 5, 3, '#68a8d8');
  p.R(x + 3, y + 14, 3, 2, '#9aa0aa');
}
// wall panel seams for a wainscot
function wainscot(p, x0, x1, y, h, c, step = 24) {
  p.R(x0, y, x1 - x0, h, c);
  p.R(x0, y, x1 - x0, 1, shade(c, 0.25));
  for (let x = x0 + (step >> 1); x < x1; x += step) {
    p.R(x, y + 3, 1, h - 6, shade(c, -0.18));
    p.R(x + 1, y + 3, 1, h - 6, shade(c, 0.1));
  }
}
function baseboard(p, x0, x1, c = '#3a3e48') {
  p.R(x0, FY - 5, x1 - x0, 5, c);
  p.R(x0, FY - 5, x1 - x0, 1, shade(c, 0.3));
}
// pleated hospital curtain with a small printed motif
function curtain(p, x, y, w, h, c, motif = '#ffffff') {
  const ramp = [shade(c, -0.32), shade(c, -0.16), c, shade(c, 0.1), shade(c, 0.18), shade(c, 0.1), c, shade(c, -0.16)];
  for (let i = 0; i < w; i++) p.R(x + i, y, 1, h - ((i & 7) === 4 ? 0 : 1), ramp[i & 7]);
  p.alpha(0.3, () => {
    for (let yy = y + 8; yy < y + h - 8; yy += 10)
      for (let xx = x + ((yy / 10) & 1 ? 2 : 6); xx < x + w - 1; xx += 8) p.R(xx, yy, 2, 2, motif);
  });
  p.R(x, y, w, 3, shade(c, 0.22));
  p.R(x, y + 3, w, 1, shade(c, -0.2));
  p.R(x, y + h - 5, w, 1, shade(c, -0.35));
  for (let i = 3; i < w; i += 8) { p.P(x + i, y - 2, '#d0d4dc'); p.P(x + i, y - 1, '#8a909a'); }
  p.R(x - 1, y, 1, h, OUT);
  p.R(x + w, y, 1, h, OUT);
}
// ambient room lighting on a wall: light pools under ceiling lamps; at night the
// lower wall falls into shadow and the pools turn warm & high-contrast
function roomLight(p, w, n, top, lamps, warm = '#fff2c8', bottom = FY) {
  if (n) {
    const span = bottom - top;
    for (let i = 0; i < 3; i++) p.alpha(0.13, () => p.R(0, top + Math.round(span * (0.25 + i * 0.25)), w, span, '!#060818'));
    for (const lx of lamps) p.glow(lx, top + 6, 54, 40, '!' + warm, 0.07);
  } else {
    for (const lx of lamps) p.glow(lx, top + 2, 60, 34, '!#ffffff', 0.06);
  }
}
// corridor bumper rail
function handrail(p, x0, x1, y, c = '#b05048') {
  p.R(x0, y - 1, x1 - x0, 7, OUT);
  p.R(x0, y, x1 - x0, 5, c);
  p.R(x0, y, x1 - x0, 1, shade(c, 0.35));
  p.R(x0, y + 4, x1 - x0, 1, shade(c, -0.35));
  for (let x = x0 + 20; x < x1; x += 48) { p.R(x, y + 6, 3, 3, '#8a909a'); p.P(x, y + 8, OUT); }
  p.alpha(0.18, () => p.R(x0, y + 6, x1 - x0, 2, '!#000000'));
}

// LED / dot-matrix panel background
function ledPanel(p, x, y, w, h) {
  p.B(x, y, w, h, '#14100e', '#4a4a52');
  p.R(x + 1, y + 1, w - 2, 1, '#2a2622');
}
// EKG strip canvas (one cycle repeated) for monitors
const EKG = new Map();
function ekgStrip(color, w = 64, h = 9, kind = 0) {
  const key = color + w + h + kind;
  let c = EKG.get(key);
  if (c) return c;
  c = mkCanvas(w * 2, h);
  const g = c.getContext('2d');
  g.fillStyle = color;
  const mid = h - 3;
  // build a waveform y(x)
  const wave = (x) => {
    const k = x % 32;
    if (kind === 1) return mid - Math.round(Math.sin((x / 16) * Math.PI) * 2.4 + 2) + 1; // pleth sine
    if (k === 10) return mid - 1;
    if (k === 12) return mid - (h - 2);
    if (k === 13) return mid - (h - 4);
    if (k === 14) return mid + 2;
    if (k >= 20 && k <= 23) return mid - 2;
    if (k === 19 || k === 24) return mid - 1;
    return mid;
  };
  let py = wave(0);
  for (let x = 0; x < w * 2; x++) {
    const y = wave(x);
    const a = Math.min(py, y), b = Math.max(py, y);
    g.fillRect(x, a, 1, b - a + 1);
    py = y;
  }
  EKG.set(key, c);
  return c;
}
// draw a sweeping EKG monitor trace in screen space
function drawEKG(ctx, x, y, w, h, t, color, kind = 0, speed = 1) {
  const s = ekgStrip(color, 32, h, kind);
  const ph = Math.floor(t * speed) % 32;
  ctx.drawImage(s, ph, 0, w, h, x, y, w, h);
  // sweep gap
  const gx = Math.floor(t * speed * 0.7) % w;
  fr(ctx, x + gx, y, 3, h, '#06140c');
}

// cached banded glow sprite for per-frame lights
const GLOWS = new Map();
function glowSprite(rx, ry, color, a = 0.12) {
  const key = rx + ',' + ry + color + a;
  let c = GLOWS.get(key);
  if (!c) {
    c = mkCanvas(rx * 2, ry * 2);
    new Painter(c, false).glow(rx, ry, rx, ry, '!' + color, a);
    GLOWS.set(key, c);
  }
  return c;
}
function drawGlow(ctx, cx, cy, rx, ry, color, a) {
  ctx.drawImage(glowSprite(rx, ry, color, a), Math.round(cx - rx), Math.round(cy - ry));
}
// per-character text so changing numbers don't churn the font cache
function ledText(ctx, str, x, y, color, font = 'small', align = 'left') {
  const adv = font === 'big' ? 6 : 4;
  str = String(str);
  let sx = x;
  if (align === 'center') sx = x - Math.floor((str.length * adv - 1) / 2);
  else if (align === 'right') sx = x - (str.length * adv - 1);
  for (let i = 0; i < str.length; i++) if (str[i] !== ' ') drawText(ctx, str[i], sx + i * adv, y, { font, color });
}

// ---------------------------------------------------------------------------
// Stage registry & cache
// ---------------------------------------------------------------------------
const DEFS = {};
const CACHE = new Map();
const MAX_CACHE = 4;

const LM = 24; // extra margin on each side of every layer canvas (tolerates camX overshoot / shake)
function buildLayer(def, pf, h, night, id) {
  const w = layerW(pf);
  const c = mkCanvas(w + LM * 2, h);
  const p = new Painter(c, night);
  p.g.translate(LM, 0);
  def(p, w, night);
  // smear the edge columns into the margins so overshoot never shows a gap
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(c, LM, 0, 1, h, 0, 0, LM, h);
  g.drawImage(c, LM + w - 1, 0, 1, h, LM + w, 0, LM, h);
  return { c, pf, w, h };
}

function build(id, night) {
  const D = DEFS[id] || DEFS.er;
  const S = { D, night };
  S.fars = D.far ? [].concat(D.far).map((f) => buildLayer(f.build, f.pf, f.h || FY, night, id)) : [];
  S.far = S.fars[0];
  S.back = buildLayer(D.back, BPF, D.backH || 196, night, id);
  if (D.over) S.over = buildLayer(D.over, BPF, D.backH || 196, night, id);
  if (D.mid) S.mid = buildLayer(D.mid.build, D.mid.pf, VH, night, id);
  S.floor = buildPlane(FY, VH, floorS, D.floor, night);
  if (D.ceil) {
    const cy = D.ceil.y;
    S.ceil = buildPlane(0, cy, (y) => (BPF * (HZ - y)) / (HZ - cy), D.ceil.shader, night);
  }
  S.crowd = [];
  const specs = typeof D.crowd === 'function' ? D.crowd(night) : D.crowd || [];
  for (const m of specs) {
    const spr = makePersonSprites(m.s, night);
    S.crowd.push(Object.assign({ th: 0.3, ph: 0, L: 'back' }, m, { spr }));
  }
  S.crowdFront = S.crowd.filter((m) => !m.behind);
  S.crowdBack = S.crowd.filter((m) => m.behind);
  S.data = D.data ? D.data(night) : {};
  return S;
}

function get(id, night) {
  const key = id + (night ? ':n' : ':d');
  let S = CACHE.get(key);
  if (S) {
    CACHE.delete(key);
    CACHE.set(key, S);
    return S;
  }
  S = build(id, night);
  CACHE.set(key, S);
  while (CACHE.size > MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
  return S;
}

export function preloadStage(id, night) {
  get(id, !!night);
}

const OFFS = { far: 0, far2: 0, back: 0, mid: 0, cx: 0 };
const loff = (L, cx, vw) => Math.round(L.w / 2 + (cx - 400) * L.pf - vw / 2);

export function drawStage(ctx, id, o) {
  const night = !!o.night;
  const S = get(id, night);
  const D = S.D;
  const vw = Math.round(o.viewW);
  const camX = Math.round(o.camX || 0);
  const cx = camX + vw / 2;
  const t = o.t | 0;
  const oo = { camX, viewW: vw, viewH: VH, t, night, excite: Math.max(0, Math.min(1, o.excite || 0)), S };
  const X = OFFS;
  X.back = loff(S.back, cx, vw);
  X.far = S.far ? loff(S.far, cx, vw) : 0;
  X.far2 = S.fars[1] ? loff(S.fars[1], cx, vw) : 0;
  X.mid = S.mid ? loff(S.mid, cx, vw) : 0;
  X.cx = cx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (S.far) {
    for (let i = 0; i < S.fars.length; i++) {
      const F = S.fars[i];
      ctx.drawImage(F.c, (i ? X.far2 : X.far) + LM, 0, vw, F.h, 0, 0, vw, F.h);
      if (i === 0 && D.animSky) D.animSky(ctx, oo, X, S.data);
    }
    if (D.animFar) D.animFar(ctx, oo, X, S.data);
  }
  blitPlane(ctx, S.floor, cx, vw);
  if (D.refl) {
    // glossy floor: mirrored strip of the wall base, fading with distance
    ctx.save();
    ctx.translate(0, FY * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = D.refl * (night ? 0.8 : 1);
    ctx.drawImage(S.back.c, X.back + LM, FY - 10, vw, 10, 0, FY - 10, vw, 10);
    ctx.globalAlpha = D.refl * 0.5 * (night ? 0.8 : 1);
    ctx.drawImage(S.back.c, X.back + LM, FY - 24, vw, 14, 0, FY - 24, vw, 14);
    ctx.restore();
  }
  if (S.ceil) blitPlane(ctx, S.ceil, cx, vw);
  ctx.drawImage(S.back.c, X.back + LM, 0, vw, S.back.h, 0, 0, vw, S.back.h);
  if (D.animBack) D.animBack(ctx, oo, X, S.data);
  drawCrowd(ctx, S.crowdBack, X, oo);
  if (S.over) ctx.drawImage(S.over.c, X.back + LM, 0, vw, S.over.h, 0, 0, vw, S.over.h);
  if (D.animOver) D.animOver(ctx, oo, X, S.data);
  if (S.crowdFront.length) drawCrowd(ctx, S.crowdFront, X, oo);
  if (S.mid) ctx.drawImage(S.mid.c, X.mid + LM, 0, vw, VH, 0, 0, vw, VH);
  if (D.animMid) D.animMid(ctx, oo, X, S.data);
  ctx.restore();
}

export function drawStageFront(ctx, id, o) {
  const D = DEFS[id];
  if (!D || !D.front) return;
  const vw = Math.round(o.viewW);
  const camX = Math.round(o.camX || 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  D.front(ctx, { camX, viewW: vw, viewH: VH, t: o.t | 0, night: !!o.night, excite: o.excite || 0, cx: camX + vw / 2 });
  ctx.restore();
}

// Anim callbacks receive X with integer layer offsets: screenX = layerX - X.back (or X.far / X.far2 / X.mid).

// ===========================================================================
// STAGE 1: EMERGENCY DEPT
// ===========================================================================
const tileCeil = (lightC = '#fafcff', tile = '#d6d0c2', grid = '#9a968c', speck = '#c4beb0') => (wx, wz, a, b, q) => {
  const lx = ((wx % 120) + 120) % 120, lz = ((wz % 80) + 80) % 80;
  if (lx > 40 && lx < 80 && lz > 20 && lz < 44) {
    if (lx < 42 || lx > 78 || lz < 23) return q.n ? '#a0a0a0' : '#b8bcc4';
    return q.n ? '!#fff6d8' : lightC;
  }
  if (seam(a, b, 40) || seam(q.wz0, q.wz1, 40)) return grid;
  return hash(Math.floor(wx), Math.floor(wz * 3)) < 0.12 ? speck : tile;
};

DEFS.er = {
  refl: 0.16,
  ceil: { y: 16, shader: tileCeil() },
  floor(wx, wz, a, b, q) {
    // speckled vinyl tiles + red/blue wayfinding lines ("FOLLOW THE RED LINE")
    const T = 32;
    if (wz > 18 && wz < 23) return '#9c3a3a';
    if (wz > 25 && wz < 30) return '#36589a';
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) return '#5e594f';
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    const h = hash(Math.floor(wx * 1.3), Math.floor(wz * 1.7));
    let c = odd ? '#948d80' : '#9d968a';
    if (h < 0.08) c = '#7c766a';
    else if (h > 0.95) c = '#aea89a';
    if (q.f > 0.75) c = shade(c, -0.1);
    return c;
  },
  far: {
    pf: 0.45,
    build(p, w, n) {
      // outside: ambulance bay driveway
      if (n) {
        p.G(0, 0, w, 120, ['#0a0e24', '#10163a', '#182046', '#222a52']);
        for (let i = 0; i < 40; i++) p.P(Math.floor(hash(i, 3) * w), Math.floor(hash(i, 5) * 70), '!#e8e8ff');
      } else p.G(0, 0, w, 120, ['#5aa4e4', '#70b4ec', '#88c4f0', '#a4d4f4']);
      for (let i = 0; i < 9; i++) {
        const bx = i * 70 - 10, bh = 40 + Math.floor(hash(i, 9) * 50), bw = 60;
        const bc = ['#8a8aa0', '#a09080', '#7a8a98'][i % 3];
        p.B(bx, 120 - bh, bw, bh + 10, bc);
        p.R(bx + bw - 6, 121 - bh, 5, bh + 8, shade(bc, -0.15));
        for (let wy = 124 - bh; wy < 112; wy += 8)
          for (let wx2 = bx + 5; wx2 < bx + bw - 8; wx2 += 9) {
            const lit = n && hash(wx2, wy) < 0.45;
            p.R(wx2, wy, 5, 4, lit ? '!#f8d878' : n ? '#283048' : '#c0d8e8');
          }
      }
      p.R(0, 112, w, 6, '#9a9a9a');
      p.R(0, 112, w, 1, '#c8c8c8');
      p.R(0, 118, w, 70, '#56565e');
      p.D(0, 118, w, 70, '#56565e', '#5e5e66', 1);
      for (let x = 10; x < w; x += 40) p.R(x, 150, 20, 2, '#c8b840');
      // ambulance
      const ax = 6, ay = 118;
      p.B(ax, ay, 72, 36, '#f4f4f4');
      p.B(ax + 71, ay + 10, 22, 26, '#f4f4f4');
      p.R(ax + 73, ay + 12, 14, 10, n ? '#3a4a68' : '#80b0d0');
      p.R(ax + 1, ay + 19, 91, 5, '#d02828');
      p.R(ax + 30, ay + 4, 4, 12, '#d02828');
      p.R(ax + 26, ay + 8, 12, 4, '#d02828');
      p.T('AMBULANCE', ax + 46, ay + 26, '#d02828', { align: 'center' });
      for (const wx3 of [ax + 10, ax + 68]) { p.E(wx3, ay + 30, 12, 12, '#202020'); p.E(wx3 + 3, ay + 33, 6, 6, '#9a9a9a'); }
      p.R(ax + 4, ay - 3, 8, 3, '#802020');
      p.R(ax + 60, ay - 3, 8, 3, '#202080');
      if (n) {
        p.R(150, 60, 2, 60, '#30303a');
        p.R(146, 58, 10, 3, '#30303a');
        p.R(148, 61, 6, 2, '!#fff0b0');
        p.glow(151, 100, 30, 40, '!#fff0b0', 0.08);
      }
    },
  },
  back(p, w, n) {
    const C = w >> 1; // 370
    p.G(0, 14, w, 106, ['#e8dec2', '#e2d8ba', '#dcd0b0', '#d4c8a6']);
    roomLight(p, w, n, 17, [60, 180, 300, 420, 540, 660]);
    p.R(0, 14, w, 3, '#8a8478');
    p.R(0, 16, w, 1, '#b4ae9e');
    wainscot(p, 0, w, 122, 49, '#5d958e');
    handrail(p, 0, w, 116);
    baseboard(p, 0, w, '#384646');
    // outlets on wainscot
    for (const ox of [176, 300, 452, 610, 700]) { p.B(ox, 150, 6, 8, '#e8e8e0'); p.P(ox + 2, 152, '#202020'); p.P(ox + 2, 155, '#202020'); }

    // ---- AMBULANCE BAY (left)
    const dx = 12, dy = 62, dw = 124, dh = 114;
    sign(p, dx - 4, dy - 24, dw + 8, 15, '#c82828', '#ffffff', 'AMBULANCE ENTRANCE');
    p.R(dx - 5, dy - 6, dw + 10, dh + 6, OUT);
    p.R(dx - 4, dy - 5, dw + 8, dh + 5, '#8e96a2');
    p.R(dx - 4, dy - 5, dw + 8, 2, '#c4cad2');
    p.glass(dx, dy, dw, dh, n ? '#405070' : '#a8d4e8', n ? 0.22 : 0.3);
    p.R(dx + dw / 2 - 2, dy, 4, dh, '#6c7480');
    p.R(dx + dw / 2 - 1, dy, 1, dh, '#a0a8b2');
    for (const fx of [dx, dx + dw - 3]) p.R(fx, dy, 3, dh, '#6c7480');
    p.R(dx, dy + 52, dw, 3, '#6c7480');
    p.alpha(0.3, () => {
      for (let i = 0; i < 2; i++) {
        const gx = dx + 8 + i * 62;
        for (let k = 0; k < 30; k++) p.R(gx + k, dy + 46 - k, 6, 1, '#ffffff');
        for (let k = 0; k < 18; k++) p.R(gx + 18 + k, dy + 100 - k, 3, 1, '#ffffff');
      }
    });
    p.T('AUTOMATIC', dx + dw / 4, dy + 58, '#2a3a4a', { align: 'center' });
    p.T('AUTOMATIC', dx + (dw * 3) / 4, dy + 58, '#2a3a4a', { align: 'center' });
    p.HZ(dx - 4, FY - 4, dw + 8, 4);
    for (const bx of [dx - 14, dx + dw + 7]) {
      p.V(bx, 148, 7, 28, '#e8c020');
      p.R(bx + 1, 154, 5, 2, '#2a2422');
      p.R(bx + 1, 160, 5, 2, '#2a2422');
    }

    // ---- CURTAINED BAYS
    const b3 = 164, b4 = 236;
    p.R(b3 - 4, 33, 140, 2, '#7a808a');
    p.R(b3 - 4, 35, 140, 1, '#b0b6c0');
    for (const [bx, num] of [[b3, 3], [b4, 4]]) sign(p, bx + 20, 20, 28, 9, '#2a4a7a', '#ffffff', 'BAY ' + num);
    // bay 3: closed curtain, mystery feet + backlit silhouette
    p.R(b3 + 8, 166, 3, 10, '#3a404c');
    p.R(b3 + 54, 166, 3, 10, '#3a404c');
    p.R(b3 + 6, 160, 54, 6, '#8c96a4');
    p.R(b3 + 22, 171, 4, 5, '#3a2a2a'); p.R(b3 + 27, 171, 4, 5, '#3a2a2a');
    curtain(p, b3, 38, 68, 122, '#4f9ab0');
    p.alpha(n ? 0.5 : 0.22, () => {
      const sx = b3 + 30, sy = 84;
      const sc = n ? '!#081018' : '!#10303c';
      p.E(sx - 4, sy, 9, 10, sc);
      p.R(sx - 7, sy + 10, 15, 26, sc);
      p.R(sx - 5, sy + 36, 5, 30, sc); p.R(sx + 2, sy + 36, 5, 30, sc);
      p.R(sx + 8, sy + 12, 16, 4, sc); // arm holding...
      p.R(sx + 22, sy + 6, 4, 16, sc); // ...a giant syringe
      p.R(sx + 23, sy - 4, 2, 10, sc);
    });
    if (n) p.alpha(0.12, () => p.R(b3, 40, 68, 116, '!#fff4c0'));
    // bay 4: open curtain bunched to the right, patient in bed
    p.R(b4, 38, 64, 122, shade('#d6caa8', -0.04));
    p.SH(b4 + 8, 56, 50, 4);
    p.B(b4 + 6, 54, 54, 5, '#c0c4c8');
    for (let k = 0; k < 4; k++) p.R(b4 + 10 + k * 12, 55, 4, 3, k % 2 ? '#3a8a3a' : '#e8e8e8');
    p.R(b4 + 16, 68, 2, 8, '#6a7280');
    p.SH(b4 + 6, 60, 26, 20);
    p.V(b4 + 6, 60, 26, 20, '#3a3e48');
    p.R(b4 + 9, 63, 20, 14, n ? '!#041a0c' : '#06140c');
    ivPole(p, b4 + 46, 168, 46);
    bed(p, b4 + 2, 176, 58, '#e8eef4', '#d88aa0', (x, fy) => patientHead(p, x + 4, fy - 28, '#e8b48c', '#6a3a1a'));
    curtain(p, b4 + 62, 38, 12, 122, '#4f9ab0');

    // ---- CENTER: EMERGENCY SIGN
    if (n) p.glow(C, 58, 96, 30, '!#ff3020', 0.08);
    p.SH(C - 68, 44, 136, 28, 3);
    p.R(C - 68, 44, 136, 28, OUT);
    p.R(C - 67, 45, 134, 26, n ? '#3a1818' : '#f8f4f0');
    p.R(C - 67, 45, 134, 1, n ? '#5a2a2a' : '#ffffff');
    p.R(C - 67, 69, 134, 2, n ? '#1a0808' : '#b8b0a8');
    p.R(C - 66, 46, 2, 24, n ? '#4a2020' : '#fffcfa');
    p.R(C - 40, 17, 2, 27, '#606068');
    p.R(C + 38, 17, 2, 27, '#606068');
    p.T('EMERGENCY', C, 51, n ? '!#ff4636' : '#d42020', { font: 'big', scale: 2, align: 'center', shadow: n ? '!#7a1010' : '#8a1818' });
    // whiteboard behind triage
    p.SH(C - 62, 80, 52, 34);
    p.B(C - 62, 80, 52, 34, '#f8f8f4', '#7a7a84');
    p.R(C - 61, 113, 50, 2, '#9a9aa4');
    p.R(C - 30, 114, 6, 1, '#d02020');
    p.R(C - 22, 114, 6, 1, '#2040a0');
    p.T('PATIENTS', C - 36, 83, '#2040a0', { align: 'center' });
    p.T('IN QUEUE:', C - 36, 89, '#2040a0', { align: 'center' });
    p.T('99+', C - 36, 97, '#d02020', { font: 'big', align: 'center' });
    p.L(C - 58, 107, C - 44, 105, '#d02020');
    p.L(C - 28, 107, C - 16, 104, '#30a040');
    // hand hygiene poster
    poster(p, C + 10, 78, 46, 36, '#f0f4f8', ['HAND', 'HYGIENE', 'SAVES', 'LIVES'], '#2a6ab0', (x, y) => {
      p.R(x + 35, y + 26, 7, 7, '#e8b48c'); p.R(x + 4, y + 26, 7, 7, '#e8b48c');
      p.R(x + 36, y + 25, 2, 2, '#e8b48c'); p.R(x + 8, y + 25, 2, 2, '#e8b48c');
      p.P(x + 23, y + 29, '#8ad0f0'); p.P(x + 20, y + 31, '#8ad0f0'); p.P(x + 26, y + 31, '#8ad0f0');
    });
    sanitizer(p, C + 62, 92);

    // ---- RIGHT: clock, no running, staff doors + beacon
    wallClock(p, 470, 60, 10);
    sign(p, 442, 80, 58, 16, '#f8f8f8', '#c02020', ['NO RUNNING', '(EXCEPT CODES)']);
    doubleDoor(p, 516, 86, 60, 90, '#9ab0c0', '');
    sign(p, 523, 70, 46, 10, '#2a4a7a', '#ffffff', 'STAFF ONLY');
    p.B(541, 62, 10, 7, '#5a5a62');
    p.R(543, 59, 6, 4, n ? '#802020' : '#a03030');
    // crash cart
    const cc = 594;
    p.SH(cc, 124, 26, 50);
    p.V(cc, 132, 26, 40, '#c83030');
    for (let k = 0; k < 4; k++) { p.R(cc + 2, 137 + k * 9, 22, 1, '#801818'); p.R(cc + 10, 139 + k * 9, 6, 2, '#e8e8e8'); }
    p.B(cc + 3, 123, 20, 10, '#f0e040');
    p.R(cc + 6, 125, 6, 5, '#202020');
    p.R(cc + 14, 125, 6, 5, '#60c060');
    p.R(cc + 2, 172, 3, 4, '#202020'); p.R(cc + 21, 172, 3, 4, '#202020');
    p.T('CODE', cc + 13, 153, '#ffffff', { align: 'center' });
    // co-pay poster + chairs
    poster(p, 632, 66, 54, 42, '#fff4c0', ['CO-PAY', 'DUE AT', 'TIME OF', 'BEATDOWN', '$$$'], '#802020');
    extinguisher(p, 704, 150);
    for (let k = 0; k < 3; k++) {
      const chx = 628 + k * 20;
      p.R(chx + 1, 158, 2, 18, '#3a3e48');
      p.B(chx, 150, 18, 6, '#c86a3a');
      p.B(chx + 1, 132, 16, 18, '#c86a3a');
      p.R(chx + 2, 133, 14, 1, '#e8905a');
    }
    p.R(626, 156, 62, 2, '#5a606a');
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const C = w >> 1;
    counter(p, C - 66, 140, 132, 36, '#c8b898', '#7a5a8a', '#c0a8d0');
    p.T('TRIAGE', C, 155, '#f0e8f8', { font: 'big', align: 'center', shadow: '#3a2a4a' });
    p.T('PLEASE TAKE A NUMBER', C, 166, '#d8c8e8', { align: 'center' });
    crtMonitor(p, C - 52, 124, 18, 14, n);
    p.R(C - 50, 126, 14, 9, n ? '!#203a6a' : '#3a5a9a');
    p.R(C - 48, 128, 8, 1, n ? '!#a0c0ff' : '#c0d8ff');
    p.R(C - 48, 130, 10, 1, n ? '!#a0c0ff' : '#c0d8ff');
    p.B(C + 24, 128, 10, 12, '#d02828');
    p.R(C + 26, 130, 6, 3, '#f0f0f0');
    p.B(C + 40, 136, 8, 4, '#e0c040');
    p.R(C + 43, 134, 2, 2, '#e0c040');
    p.R(C + 2, 137, 14, 3, '#f8f8f8');
    p.R(C + 4, 135, 12, 2, '#eaeaea');
    p.R(C - 20, 136, 8, 4, '#3a8ad0');
  },
  crowd: [
    { x: 366, y: 153, s: personSpec('nurse', 1, { top: '#d874a2', bot: '#d874a2', hs: 'bun' }), th: 0.2, alt: 2, behind: true },
    { x: 344, y: 154, s: personSpec('doctor', 2, { glasses: true }), th: 0.5, alt: 0, behind: true },
    { x: 396, y: 154, s: personSpec('nurse', 21, { top: '#48a8a0', bot: '#48a8a0', coffee: true }), th: 0.6, alt: 3, behind: true },
    { x: 128, y: 179, s: personSpec('visitor', 22, { hs: 'long' }), th: 0.3, alt: 1 },
    { x: 462, y: 178, s: personSpec('visitor', 23), th: 0.2, alt: 0, fidget: 'clap' },
    { x: 560, y: 177, s: personSpec('surgeon', 24), th: 0.5, alt: 2 },
    { x: 150, y: 177, s: personSpec('patient', 3, { iv: true, hs: 'bald', hair: '#dedede' }), th: 0.6, alt: 2 },
    { x: 418, y: 178, s: personSpec('visitor', 4, { balloon: '#e84848' }), th: 0.25, alt: 1, fidget: 'wave' },
    { x: 440, y: 177, s: personSpec('patient', 5, { sling: true, bandage: true }), th: 0.35, alt: 0 },
    { x: 500, y: 178, s: personSpec('guard', 6), th: 0.7, alt: 3 },
    { x: 584, y: 178, s: personSpec('nurse', 7, { top: '#4070b8', bot: '#4070b8' }), th: 0.15, alt: 1, fidget: 'clap' },
    { x: 106, y: 178, s: personSpec('visitor', 8, { icepack: true }), th: 0.45, alt: 0 },
    { x: 636, y: 157, s: personSpec('visitor', 9, { sit: true, icepack: true }), th: 0.3 },
    { x: 676, y: 157, s: personSpec('patient', 12, { sit: true }), th: 0.55 },
    { x: 220, y: 178, s: personSpec('doctor', 10, { clip: true }), th: 0.4, alt: 3, fidget: 'clap' },
    { x: 300, y: 179, s: personSpec('kid', 11), th: 0.1, alt: 1 },
  ],
  animFar(ctx, o, X) {
    const k = (o.t >> 3) & 3;
    const ax = 6 - X.far, ay = 115;
    fr(ctx, ax + 4, ay, 8, 3, k === 0 || k === 2 ? '#ff3030' : '#601818');
    fr(ctx, ax + 60, ay, 8, 3, k === 1 || k === 3 ? '#4060ff' : '#181860');
    if (o.night) drawGlow(ctx, ax + 46, ay + 40, 70, 34, k & 1 ? '#3050ff' : '#ff2020', 0.1);
  },
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    const on = (t >> 4) & 1;
    fr(ctx, 543 - bx, 59, 6, 4, on ? '#ff3a2a' : o.night ? '#601010' : '#a03030');
    if (on) {
      fr(ctx, 539 - bx, 60, 2, 1, '#ff8a6a');
      fr(ctx, 551 - bx, 60, 2, 1, '#ff8a6a');
      if (o.night) drawGlow(ctx, 546 - bx, 61, 34, 22, '#ff2a1a', 0.1);
    }
    drawEKG(ctx, 245 - bx, 64, 20, 9, t, '#40ff70', 0, 0.8);
    fr(ctx, 245 - bx, 74, 8, 1, '#ffd040');
    fr(ctx, 255 - bx, 74, 6, 1, '#40c0ff');
    if (hash(t >> 2, 77) < 0.03) fr(ctx, 370 + 42 - bx, 51, 12, 14, o.night ? '#3a1818' : '#f8f4f0');
    clockHands(ctx, 470 - bx, 60, 10, t, 1, '#202020');
  },
  animOver(ctx, o, X) {
    if ((o.t >> 5) & 1) fr(ctx, 370 - 40 - X.back, 133, 2, 1, '#ffffff');
  },
  front(ctx, o) {
    const pts = [[120, 209], [530, 211], [880, 208]];
    for (const [px, py] of pts) {
      const sx = Math.round(px * 1.25 - o.cx * 1.25 + o.viewW / 2);
      if (sx < -10 || sx > o.viewW + 10) continue;
      fr(ctx, sx, py, 8, 3, o.night ? '#6a6a80' : '#d8d4c8');
      fr(ctx, sx + 1, py + 1, 5, 1, o.night ? '#40405a' : '#9090a0');
    }
  },
};

// ===========================================================================
// STAGE 2: OPERATING ROOM
// ===========================================================================
function surgicalLamp(p, cx, cy, armX, n) {
  // ceiling mount + articulated arm
  p.B(armX - 6, 0, 12, 4, '#c8d0d4');
  p.B(armX - 2, 3, 5, cy - 14, '#b8c2c8');
  p.R(armX - 1, 4, 1, cy - 16, '#e8eef0');
  p.B(Math.min(armX, cx) - 2, cy - 14, Math.abs(cx - armX) + 5, 5, '#b8c2c8');
  p.R(Math.min(armX, cx) - 1, cy - 13, Math.abs(cx - armX) + 3, 1, '#e8eef0');
  p.E(armX - 4, cy - 17, 9, 9, OUT);
  p.E(armX - 3, cy - 16, 7, 7, '#98a4ac');
  p.B(cx - 2, cy - 10, 5, 8, '#b8c2c8');
  // lamp head (seen from slightly below)
  p.E(cx - 25, cy - 4, 50, 20, OUT);
  p.E(cx - 24, cy - 3, 48, 18, '#e4eaee');
  p.E(cx - 24, cy - 3, 48, 7, '#f6fafc');
  p.E(cx - 21, cy + 1, 42, 13, '#8c989e');
  p.E(cx - 20, cy + 2, 40, 11, n ? '!#fffbe6' : '#f0f4f2');
  const led = n ? '!#ffffff' : '#ffffff';
  const ring = n ? '!#ffe9a8' : '#d8dcd6';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lx = Math.round(cx + Math.cos(a) * 13) - 3, ly = Math.round(cy + 7 + Math.sin(a) * 4) - 2;
    p.E(lx, ly, 7, 4, ring);
    p.R(lx + 2, ly + 1, 3, 2, led);
  }
  p.E(cx - 4, cy + 5, 9, 5, '#3a8a86');
  p.R(cx - 1, cy + 6, 3, 2, '#5ab0aa');
}

DEFS.or = {
  refl: 0.2,
  ceil: {
    y: 14,
    shader(wx, wz, a, b, q) {
      const ax = Math.abs(wx - 400);
      if (ax < 96 && wz > -30 && wz < 70) {
        if (ax > 92 || wz < -26 || wz > 66) return '#8a9a98';
        const d = (Math.floor(wx / 3) + Math.floor(wz / 2)) & 1;
        return q.n ? (d ? '!#dff0ea' : '!#c8e0d8') : d ? '#f4fbf8' : '#dceae6';
      }
      if (seam(a, b, 48) || seam(q.wz0, q.wz1, 48)) return '#8e9c9a';
      return '#c6d2cf';
    },
  },
  floor(wx, wz, a, b, q) {
    const dx = wx - 400, dz = wz - 24;
    if (Math.abs(dx) < 7 && Math.abs(dz) < 5) return (Math.floor(dx + 7) % 3 === 0 || Math.abs(dz) > 3.5 || Math.abs(dx) > 6) ? '#2a3836' : '#5a6e6a';
    if (seam(a, b, 120, 40)) return '#3a4c4a';
    const h = hash(Math.floor(wx * 1.4), Math.floor(wz * 1.8));
    let c = '#4c6662';
    if (h < 0.1) c = '#405854';
    else if (h > 0.93) c = '#62807a';
    // sheen pool under the surgical lights
    if (Math.abs(dx) < 70 && wz > 0 && wz < 50 && ((Math.floor(wx) + q.r) & 1)) c = shade(c, 0.08);
    if (q.f > 0.75) c = shade(c, -0.1);
    return c;
  },
  back(p, w, n) {
    const C = w >> 1;
    p.tiles(0, 14, w, 162, '#64a89c', 8, 8, '#4e8a80');
    roomLight(p, w, n, 16, [80, 200, 370, 540, 660], '#e8fff4');
    p.R(0, 14, w, 2, '#6a7a78');
    p.R(0, 16, w, 1, '#a8b8b6');
    handrail(p, 0, w, 118, '#b8c4c8');
    p.R(0, 166, w, 10, '#3e5a56');
    p.R(0, 166, w, 1, '#78a89e');
    baseboard(p, 0, w, '#2a3a38');
    // ---- observation gallery interior (window frame/glass are in the over layer)
    const gx = 196, gw = 348, gy = 30, gh = 52;
    p.R(gx, gy, gw, gh, n ? '#7a6a50' : '#3c5452');
    p.G(gx, gy, gw, 12, n ? ['!#806a48', '!#6a5838'] : ['#4a6462', '#3c5452']);
    for (let i = 0; i < 8; i++) p.R(gx + 20 + i * 44, gy + 2, 18, 2, n ? '!#ffe8b0' : '#d8e8e4');
    p.R(gx, gy + 38, gw, 14, n ? '#4a3a2a' : '#2a3a3a');
    for (let i = 0; i < 16; i++) p.B(gx + 4 + i * 22, gy + 32, 18, 8, n ? '#8a3a3a' : '#6a2c34');
    p.T('OBSERVATION GALLERY', C, 21, '#1e3a36', { align: 'center' });
    // ---- left: elapsed timer + sterile cabinets
    ledPanel(p, 40, 30, 100, 26);
    p.T('ELAPSED', 90, 33, '!#ff6040', { align: 'center' });
    p.SH(16, 86, 168, 86);
    p.V(16, 86, 168, 86, '#b4bec4');
    for (let i = 0; i < 3; i++) {
      const cx2 = 20 + i * 54;
      p.B(cx2, 90, 52, 52, '#8a969c');
      p.glass(cx2 + 2, 92, 48, 48, '#d0eef0', 1);
      p.R(cx2 + 2, 92, 48, 48, n ? '#9ab4b4' : '#c8e4e4');
      for (let sy = 0; sy < 3; sy++) {
        p.R(cx2 + 2, 106 + sy * 14, 48, 2, '#8a969c');
        for (let k = 0; k < 6; k++) {
          const bc = ['#e8e8e8', '#5a8ad0', '#e8c060', '#d06060', '#70b070', '#f0f0f0'][(k + sy + i) % 6];
          p.R(cx2 + 4 + k * 8, 96 + sy * 14, 6, 10, OUT);
          p.R(cx2 + 5 + k * 8, 97 + sy * 14, 4, 9, bc);
        }
      }
      p.alpha(0.35, () => { for (let k = 0; k < 14; k++) p.R(cx2 + 6 + k, 136 - k * 3, 2, 3, '#ffffff'); });
      p.R(cx2 + 44, 112, 2, 8, '#e8eef0');
      p.B(cx2, 144, 52, 26, '#a4aeb4');
      p.R(cx2 + 20, 150, 12, 2, '#e8eef0');
    }
    p.T('STERILE SUPPLIES', 100, 74, '#1e3a36', { align: 'center' });
    p.R(56, 80, 88, 1, '#1e3a36');
    // fainted med student on the floor
    const fx = 150;
    p.R(fx - 1, 168, 34, 8, '#211a26');
    p.R(fx, 169, 20, 6, '#eceef2');
    p.R(fx + 20, 170, 8, 4, '#3c4e78');
    p.R(fx + 28, 169, 4, 6, '#2a2228');
    p.R(fx - 6, 168, 7, 7, '#211a26');
    p.R(fx - 5, 169, 6, 6, '#e8b48c');
    p.R(fx - 5, 169, 6, 2, '#4c2e1a');
    p.P(fx - 3, 172, '#1a1418');
    p.T('ZZ', fx - 6, 160, '#ffffff');
    // ---- anesthesia machine
    const am = 214;
    p.SH(am, 96, 46, 78);
    p.V(am, 104, 46, 64, '#d8dcd4');
    p.R(am + 2, 106, 42, 2, '#a8aca4');
    p.V(am + 3, 94, 40, 22, '#3a3e48');
    p.R(am + 5, 96, 36, 18, n ? '!#03140a' : '#06140c');
    p.T('HR', am + 30, 97, '!#40ff70');
    for (let k = 0; k < 3; k++) { p.B(am + 4 + k * 13, 118, 11, 13, ['#e8c040', '#c050c0', '#4080e0'][k]); p.R(am + 6 + k * 13, 120, 2, 9, '#ffffff'); }
    p.B(am + 6, 134, 14, 20, '#e8f4f8');
    p.R(am + 8, 140, 10, 12, '#a0c0d0');
    for (let k = 0; k < 4; k++) p.R(am + 24, 136 + k * 6, 18, 1, '#a8aca4');
    p.R(am + 2, 168, 4, 8, OUT); p.R(am + 40, 168, 4, 8, OUT);
    p.B(am + 46, 120, 8, 48, '#3a9a5a');
    p.R(am + 47, 117, 6, 4, '#c0c4c8');
    p.B(am + 54, 126, 7, 42, '#3a6ab8');
    // stool for the anesthesiologist
    p.B(am + 60, 156, 16, 4, '#3a3e48');
    p.R(am + 67, 160, 2, 12, '#7a828a');
    p.R(am + 62, 172, 12, 2, '#3a3e48');
    // ---- operating table + draped patient
    p.R(C - 10, 156, 20, 18, '#5a646c');
    p.R(C - 9, 156, 4, 18, '#7a868e');
    p.R(C - 24, 172, 48, 4, '#3a4048');
    p.B(C - 44, 140, 88, 6, '#9aa6ae');
    // drape
    p.B(C - 46, 128, 92, 30, '#3a78b4');
    p.R(C - 45, 129, 90, 3, '#5a98d0');
    for (let k = C - 40; k < C + 44; k += 9) { p.R(k, 136, 1, 21, '#2a5a8c'); p.R(k + 1, 136, 1, 20, '#4a88c4'); }
    p.E(C - 22, 120, 34, 14, '#3a78b4');
    p.E(C - 20, 120, 28, 6, '#5a98d0');
    p.R(C + 26, 124, 5, 6, '#3a78b4'); p.R(C + 33, 124, 5, 6, '#3a78b4');
    p.R(C + 26, 124, 5, 1, '#5a98d0'); p.R(C + 33, 124, 5, 1, '#5a98d0');
    // anesthesia screen (ether screen)
    p.R(C - 40, 96, 2, 34, '#9aa6ae');
    p.B(C - 52, 96, 30, 30, '#4a88c4');
    p.R(C - 51, 97, 28, 2, '#6aa8e0');
    p.R(C - 47, 99, 1, 26, '#3a78b4');
    p.R(C - 39, 99, 1, 26, '#3a78b4');
    // mayo stand with instruments
    const ms = C + 58;
    p.R(ms + 12, 132, 2, 44, '#8a949c');
    p.R(ms + 4, 172, 18, 3, '#3a4048');
    p.B(ms - 2, 126, 32, 6, '#c8d0d6');
    p.R(ms, 127, 28, 1, '#e8eef2');
    for (let k = 0; k < 6; k++) p.R(ms + 2 + k * 4, 124 - (k & 1), 1, 3 + (k & 1), '#e8eef2');
    p.R(ms + 26, 123, 3, 2, '#e04040');
    // monitor boom
    const mb = 504;
    p.R(mb + 18, 60, 2, 36, '#a8b2b8');
    p.SH(mb, 92, 40, 28);
    p.V(mb, 92, 40, 28, '#3a3e48');
    p.R(mb + 3, 95, 34, 22, n ? '!#03140a' : '#06140c');
    p.T('72', mb + 28, 96, '!#40ff70');
    p.T('120/80', mb + 34, 110, '!#ff6070', { align: 'right' });
    // kick bucket
    p.B(mb + 6, 162, 16, 13, '#b8c2c8');
    p.R(mb + 8, 163, 12, 2, '#6a7278');
    p.E(mb + 6, 174, 4, 3, OUT); p.E(mb + 18, 174, 4, 3, OUT);
    // ---- right: x-ray light box with a suspicious finding
    const xb = 562;
    p.SH(xb, 30, 74, 54);
    p.B(xb, 30, 74, 54, '#c0c8cc');
    p.R(xb + 3, 33, 68, 48, n ? '!#d8ecf4' : '#e0f0f8');
    p.R(xb + 6, 35, 62, 44, '#1a2228');
    p.R(xb + 36, 37, 2, 40, '#c8d4d8');
    for (let k = 0; k < 6; k++) {
      p.R(xb + 18 - k, 42 + k * 5, 17 + k, 2, '#a8b4ba');
      p.R(xb + 39, 42 + k * 5, 17 + k, 2, '#a8b4ba');
    }
    // rubber duck where the appendix should be
    p.E(xb + 40, 64, 12, 8, '#f0f4f4');
    p.E(xb + 47, 59, 7, 7, '#f0f4f4');
    p.R(xb + 53, 61, 3, 2, '#f0f4f4');
    p.P(xb + 49, 61, '#1a2228');
    p.T('?!', xb + 22, 66, '!#ff4040');
    // time-out board
    p.SH(xb - 4, 92, 82, 44);
    p.B(xb - 4, 92, 82, 44, '#f8f8f4', '#7a7a84');
    p.T('TIME OUT:', xb + 37, 95, '#c02020', { align: 'center' });
    p.T('RIGHT PATIENT?', xb + 37, 103, '#204080', { align: 'center' });
    p.T('RIGHT SIDE?', xb + 37, 110, '#204080', { align: 'center' });
    p.T('RIGHT HOSPITAL?', xb + 37, 117, '#204080', { align: 'center' });
    p.T('WHO IS PAYING?', xb + 37, 126, '#c02020', { align: 'center' });
    // scrub room door
    doubleDoor(p, 664, 92, 56, 84, '#8aa8b0', '');
    sign(p, 662, 64, 60, 16, '#f8f8f0', '#204060', ['COUNT YOUR', 'SPONGES']);
    sign(p, 670, 82, 44, 8, '#2a4a7a', '#ffffff', 'SCRUB RM', { noShadow: true });
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const gx = 196, gw = 348, gy = 30, gh = 52;
    p.glass(gx, gy, gw, gh, '#c8f0f0', 0);
    p.alpha(n ? 0.08 : 0.14, () => p.R(gx, gy, gw, gh, '!#d8fff8'));
    p.alpha(0.2, () => {
      for (let i = 0; i < 4; i++) {
        const sx = gx + 14 + i * 87;
        for (let k = 0; k < 40; k++) p.R(sx + k, gy + gh - 4 - k, 8, 1, '!#ffffff');
        for (let k = 0; k < 24; k++) p.R(sx + 30 + k, gy + gh - 4 - k, 3, 1, '!#ffffff');
      }
    });
    // frame + mullions + sill
    p.R(gx - 5, gy - 5, gw + 10, 5, OUT);
    p.R(gx - 4, gy - 4, gw + 8, 3, '#a8b4b8');
    p.R(gx - 5, gy, 5, gh, OUT); p.R(gx + gw, gy, 5, gh, OUT);
    p.R(gx - 4, gy, 3, gh, '#a8b4b8'); p.R(gx + gw + 1, gy, 3, gh, '#a8b4b8');
    for (let i = 1; i < 4; i++) { p.R(gx + i * 87 - 2, gy, 4, gh, OUT); p.R(gx + i * 87 - 1, gy, 2, gh, '#a8b4b8'); }
    // deep sill hides the spectators' legs (even mid-jump)
    p.R(gx - 8, gy + gh, gw + 16, 11, OUT);
    p.R(gx - 7, gy + gh + 1, gw + 14, 3, '#dfe6ea');
    p.R(gx - 7, gy + gh + 4, gw + 14, 6, '#a8b4b8');
    p.R(gx - 7, gy + gh + 9, gw + 14, 1, '#7a868c');
    p.alpha(0.25, () => p.R(gx - 7, gy + gh + 11, gw + 14, 3, '!#000000'));
  },
  mid: {
    pf: 0.9,
    build(p, w, n) {
      const C = w >> 1;
      if (n) {
        // light cones toward the table
        for (const lx of [C - 66, C + 66])
          for (let i = 0; i < 3; i++) p.alpha(0.045, () => {
            for (let y = 54; y < 150; y += 2) {
              const hw = Math.round(12 + (y - 54) * (0.22 - i * 0.07));
              p.R(lx - hw, y, hw * 2, 2, '!#fff8d8');
            }
          });
      }
      surgicalLamp(p, C - 66, 36, C - 30, n);
      surgicalLamp(p, C + 66, 40, C + 30, n);
    },
  },
  crowd: [
    { x: 218, y: 90, s: personSpec('surgeon', 31), th: 0.1, alt: 1, behind: true },
    { x: 246, y: 90, s: personSpec('doctor', 32, { glasses: true }), th: 0.3, alt: 0, behind: true },
    { x: 268, y: 90, s: personSpec('visitor', 33, { coffee: true }), th: 0.5, alt: 2, behind: true, fidget: 'wave' },
    { x: 306, y: 90, s: personSpec('surgeon', 34), th: 0.15, alt: 3, behind: true },
    { x: 350, y: 90, s: personSpec('doctor', 35), th: 0.25, alt: 1, behind: true },
    { x: 372, y: 90, s: personSpec('nurse', 36), th: 0.05, alt: 0, behind: true, fidget: 'clap' },
    { x: 418, y: 90, s: personSpec('doctor', 37, { hs: 'bald', hair: '#dedede', beard: true }), th: 0.6, alt: 3, behind: true },
    { x: 446, y: 90, s: personSpec('surgeon', 38), th: 0.2, alt: 2, behind: true },
    { x: 488, y: 90, s: personSpec('visitor', 39, { hs: 'afro' }), th: 0.1, alt: 1, behind: true },
    { x: 516, y: 90, s: personSpec('doctor', 40, { clip: true }), th: 0.35, alt: 0, behind: true },
    { x: 288, y: 159, s: personSpec('surgeon', 41, { sit: true }), th: 0.7 },
    { x: 452, y: 177, s: personSpec('surgeon', 42, { top: '#3e78a8', bot: '#3e78a8' }), th: 0.4, alt: 2 },
    { x: 612, y: 178, s: personSpec('nurse', 43, { top: '#4e9a50', bot: '#4e9a50' }), th: 0.3, alt: 1, fidget: 'clap' },
    { x: 120, y: 178, s: personSpec('doctor', 44), th: 0.5, alt: 0 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // elapsed timer (counts up from 4:12:33)
    const sec = 4 * 3600 + 12 * 60 + 33 + Math.floor(t / 60);
    const hh = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = sec % 60;
    ledText(ctx, '0' + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, 90 - bx, 41, '#ff4a2a', 'big', 'center');
    // anesthesia monitor
    drawEKG(ctx, 214 + 5 - bx, 97, 22, 7, t, '#40ff70', 0, 1);
    drawEKG(ctx, 214 + 5 - bx, 106, 22, 7, t, '#40e0ff', 1, 1);
    ledText(ctx, String(70 + ((t >> 6) % 5)), 214 + 30 - bx, 104, '#40ff70');
    // boom monitor
    drawEKG(ctx, 504 + 4 - bx, 102, 30, 7, t + 9, '#40ff70', 0, 1);
    if ((t >> 5) & 1) fr(ctx, 504 + 4 - bx, 96, 3, 3, '#ff4040');
  },
};

// ===========================================================================
// STAGE 3: ICU
// ===========================================================================
function icuRoom(p, x, w, n, num, v) {
  const y = 40, h = FY - y;
  // interior
  p.R(x, y, w, h, n ? '#2c3450' : '#cfd8ea');
  if (n) p.R(x, y, w, h, '!#1c2238');
  p.R(x, y + h - 30, w, 30, n ? '!#181c30' : '#a8b4cc');
  p.R(x, y + h - 30, w, 1, n ? '!#262c46' : '#c0cce0');
  // outside window
  const wx = x + w - 66, wy = y + 14;
  p.B(wx, wy, 52, 40, '#e8ecf4');
  if (n) {
    p.G(wx + 2, wy + 2, 48, 36, ['!#0a1030', '!#141c44', '!#1c2654']);
    for (let i = 0; i < 9; i++) p.P(wx + 4 + Math.floor(hash(i, num) * 44), wy + 4 + Math.floor(hash(num, i) * 30), '!#ffffff');
    p.E(wx + 34, wy + 6, 8, 8, '!#f4f0d0');
    p.E(wx + 36, wy + 6, 7, 7, '!#141c44');
  } else {
    p.G(wx + 2, wy + 2, 48, 36, ['#78b8f0', '#90c8f4', '#a8d8f8']);
    p.E(wx + 8, wy + 10, 16, 6, '#ffffff');
    p.E(wx + 14, wy + 7, 10, 6, '#ffffff');
  }
  p.R(wx + 25, wy + 2, 2, 36, '#e8ecf4');
  // blinds
  for (let k = 0; k < 4; k++) p.R(wx + 2, wy + 2 + k * 2, 48, 1, n ? '#5a6278' : '#d8dce4');
  // headwall
  p.B(x + 8, y + 40, 50, 10, '#e0e4ec');
  for (let k = 0; k < 4; k++) p.R(x + 12 + k * 11, y + 43, 5, 4, ['#3a9a5a', '#e8e8e8', '#e8c040', '#3a6ab8'][k]);
  // monitor on arm
  p.R(x + 22, y + 22, 2, 10, '#8a94a0');
  p.B(x + 10, y + 8, 34, 24, '#3a3e48');
  p.R(x + 12, y + 10, 30, 20, n ? '!#020c06' : '#06140c');
  // bed + patient
  bed(p, x + 6, FY - 8, 62, n ? '#c8d0dc' : '#eef2f8', v ? '#8aa8d8' : '#98c0a0', (bx, fy) => patientHead(p, bx + 4, fy - 28, v ? '#a86e44' : '#f6d2b2', v ? '#17151c' : '#c49442'));
  // IV pump pole
  ivPole(p, x + 76, FY - 8, 56);
  p.B(x + 72, FY - 50, 12, 14, '#e8eaee');
  p.R(x + 74, FY - 48, 8, 4, n ? '!#20c0ff' : '#3a8ac0');
  if (v) {
    // ventilator
    p.V(x + 90, FY - 46, 20, 38, '#e0e4ea');
    p.R(x + 92, FY - 44, 16, 10, n ? '!#0a1a30' : '#2a4a70');
    p.R(x + 94, FY - 40, 12, 1, '!#60d0ff');
    for (let k = 0; k < 12; k++) p.R(x + 70 - k * 2, FY - 30 + Math.round(Math.sin(k * 0.6) * 2), 2, 2, '#c8d8e4');
    p.R(x + 92, FY - 8, 3, 3, OUT); p.R(x + 105, FY - 8, 3, 3, OUT);
    curtain(p, x + w - 30, y + 6, 26, h - 14, '#9a8ac8');
  } else {
    // visitor chair with balloon
    p.B(x + 96, FY - 30, 18, 14, '#8a5a3a');
    p.B(x + 96, FY - 18, 20, 6, '#a86a42');
    p.R(x + 98, FY - 12, 2, 10, '#5a3a22'); p.R(x + 112, FY - 12, 2, 10, '#5a3a22');
    p.L(x + 106, FY - 30, x + 110, FY - 60, '#d0d0d0');
    p.E(x + 104, FY - 72, 12, 13, '#e8c040');
    p.T(':)', x + 110, FY - 69, '#8a6010', { align: 'center' });
  }
  // glass sliding doors (tint + reflections) and frame
  p.alpha(n ? 0.12 : 0.2, () => p.R(x, y, w, h, '!#d8f4ff'));
  p.alpha(n ? 0.12 : 0.28, () => {
    for (let i = 0; i < 2; i++) {
      const sx = x + 16 + i * (w / 2);
      for (let k = 0; k < 50; k++) p.R(sx + k, y + 90 - k, 10, 1, '!#ffffff');
      for (let k = 0; k < 30; k++) p.R(sx + 30 + k, y + 128 - k, 4, 1, '!#ffffff');
    }
  });
  p.R(x - 4, y - 4, w + 8, 4, OUT);
  p.R(x - 3, y - 3, w + 6, 2, '#a8b0bc');
  p.R(x - 4, y, 4, h, OUT); p.R(x + w, y, 4, h, OUT);
  p.R(x - 3, y, 2, h, '#a8b0bc'); p.R(x + w + 1, y, 2, h, '#a8b0bc');
  p.R(x + w / 2 - 2, y, 4, h, OUT);
  p.R(x + w / 2 - 1, y, 2, h, '#a8b0bc');
  p.R(x + w / 2 - 8, y + 70, 2, 16, '#d8dce4');
  p.R(x + w / 2 + 6, y + 70, 2, 16, '#d8dce4');
  sign(p, x + w / 2 - 18, y - 16, 36, 10, '#3a4a8a', '#ffffff', 'ICU ' + num);
  if (v) sign(p, x + 10, y + 64, 30, 14, '#f0d030', '#202020', ['FALL', 'RISK'], { noShadow: true });
  else sign(p, x + w - 46, y + 64, 38, 14, '#f8f8f8', '#c02020', ['NPO', 'NO FOOD'], { noShadow: true });
}

DEFS.icu = {
  refl: 0.18,
  ceil: { y: 16, shader: tileCeil('#f4f8ff', '#ccd2e0', '#8e94a6', '#bcc2d2') },
  floor(wx, wz, a, b, q) {
    const T = 36;
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) return '#545a72';
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    const h = hash(Math.floor(wx * 1.2), Math.floor(wz * 1.6));
    let c = odd ? '#7c849e' : '#868ea8';
    if (h < 0.07) c = '#6c7490';
    if (wz > 8 && wz < 24) c = shade(c, 0.06);
    if (q.f > 0.75) c = shade(c, -0.1);
    return c;
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 108, ['#d0d6ec', '#c8cfe6', '#c0c8e0', '#b8c0da']);
    roomLight(p, w, n, 17, [60, 200, 370, 540, 680], '#e8f0ff');
    p.R(0, 14, w, 3, '#7a7e90');
    p.R(0, 16, w, 1, '#a8acc0');
    wainscot(p, 0, w, 122, 49, '#5c6a9c', 30);
    handrail(p, 0, w, 116, '#b08858');
    baseboard(p, 0, w, '#2e3450');
    icuRoom(p, 100, 140, n, 1, 0);
    icuRoom(p, 500, 140, n, 3, 1);
    // ---- far left: PPE / isolation cart + linen hamper
    sign(p, 16, 40, 66, 22, '#f0d030', '#202020', ['ISOLATION', 'GOWN & GLOVE', 'OR ELSE']);
    p.SH(22, 104, 40, 70);
    p.V(22, 104, 40, 68, '#d8dce8');
    for (let k = 0; k < 4; k++) { p.R(25, 108 + k * 15, 34, 12, '#b8bccc'); p.R(27, 110 + k * 15, 30, 3, ['#f0e070', '#80c0f0', '#a0e0a0', '#f0a0c0'][k]); }
    p.R(24, 172, 4, 4, OUT); p.R(56, 172, 4, 4, OUT);
    sanitizer(p, 70, 90);
    // ---- far right: family lounge window + sleeping relative
    p.SH(660, 44, 66, 56);
    p.B(660, 44, 66, 56, '#e8ecf4');
    if (n) { p.G(662, 46, 62, 52, ['!#0a1030', '!#141c44', '!#1c2654']); for (let i = 0; i < 8; i++) p.P(664 + Math.floor(hash(i, 44) * 58), 48 + Math.floor(hash(44, i) * 44), '!#ffffff'); }
    else { p.G(662, 46, 62, 52, ['#78b8f0', '#90c8f4', '#a8d8f8']); p.E(670, 56, 18, 6, '#ffffff'); }
    p.R(692, 46, 2, 52, '#e8ecf4');
    p.B(650, 150, 80, 8, '#8a6aa8');
    p.B(650, 138, 80, 14, '#9a7ab8');
    p.R(652, 158, 3, 18, OUT); p.R(724, 158, 3, 18, OUT);
    p.R(666, 141, 30, 8, '#e0b040');
    p.R(694, 140, 8, 8, '#f6d2b2'); p.R(694, 140, 8, 3, '#7c4c24');
    p.T('Z', 704, 128, '#5a5a8a'); p.T('Z', 709, 122, '#5a5a8a');
    // ---- nurse station back wall
    const nw = 236;
    p.SH(C - nw / 2, 30, nw, 104, 2, 0.12);
    p.R(C - nw / 2, 30, nw, 104, '#a8b0cc');
    p.R(C - nw / 2, 30, nw, 2, '#c8d0e8');
    sign(p, C - 60, 20, 120, 12, '#3a4a8a', '#ffffff', 'NURSE STATION');
    // whiteboard
    p.SH(C - 112, 40, 84, 54);
    p.B(C - 112, 40, 84, 54, '#fafaf6', '#70748a');
    p.T('BEDS FREE:', C - 70, 44, '#203080', { align: 'center' });
    p.T('0', C - 70, 51, '#d02020', { font: 'big', align: 'center' });
    p.T('STEPDOWN: FULL', C - 70, 62, '#203080', { align: 'center' });
    p.T('DISCHARGE: LOL', C - 70, 69, '#203080', { align: 'center' });
    p.T('CHARTS DUE:', C - 70, 77, '#203080', { align: 'center' });
    p.T('YESTERDAY', C - 70, 84, '#d02020', { align: 'center' });
    p.R(C - 110, 93, 80, 2, '#9aa0b4');
    // med dispensing machine
    const md = C - 22;
    p.SH(md, 38, 44, 96);
    p.V(md, 38, 44, 96, '#e4e6ee');
    p.R(md + 4, 42, 36, 16, n ? '!#103060' : '#2a5aa0');
    p.T('MEDS', md + 22, 44, '!#ffffff', { align: 'center' });
    p.T('BUSY', md + 22, 51, n ? '!#ff8080' : '#ffb0b0', { align: 'center' });
    for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) {
      p.B(md + 4 + k * 12, 62 + r * 9, 11, 8, '#c8ccd8');
      p.R(md + 7 + k * 12, 65 + r * 9, 5, 1, '#7a7e90');
    }
    // signs
    sign(p, C + 28, 40, 84, 16, '#f8f8f8', '#3a4a8a', ['QUIET PLEASE', 'HEALING ZONE']);
    sign(p, C + 28, 62, 84, 16, '#ffe8e8', '#c02020', ['VISITING HOURS:', 'NEVER']);
    wallClock(p, C + 88, 102, 11);
    // chart rack
    p.SH(C + 30, 88, 32, 40);
    p.B(C + 30, 88, 32, 40, '#7a7e90');
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
      p.R(C + 33 + j * 14, 91 + k * 9, 12, 7, ['#d04848', '#4878d0', '#48a868', '#e0b040'][(k + j) % 4]);
      p.R(C + 33 + j * 14, 91 + k * 9, 12, 1, '#ffffff');
    }
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const C = w >> 1;
    // nurse station counter with raised transaction ledge
    p.R(C - 125, 129, 250, 47, OUT);
    p.R(C - 124, 130, 248, 4, '#e8e0d0');
    p.R(C - 124, 130, 248, 1, '#fffaf0');
    p.R(C - 124, 134, 248, 42, '#6a78b0');
    p.R(C - 124, 134, 248, 2, '#4a5890');
    p.R(C - 124, 162, 248, 3, '#8a98d0');
    for (let k = C - 100; k < C + 120; k += 50) p.R(k, 138, 1, 22, '#5a68a0');
    p.T('ICU', C - 96, 145, '#e0e8ff', { font: 'big', shadow: '#2a3460' });
    p.T('PLEASE CHECK IN', C + 64, 147, '#e0e8ff', { align: 'center' });
    // computers & charts on the counter
    for (const mx of [C - 60, C + 4]) {
      p.V(mx, 112, 22, 16, '#2a2e38');
      p.R(mx + 2, 114, 18, 11, n ? '!#183870' : '#3a6ab0');
      p.R(mx + 4, 116, 10, 1, n ? '!#a0c8ff' : '#c0d8ff');
      p.R(mx + 4, 118, 13, 1, n ? '!#a0c8ff' : '#c0d8ff');
      p.R(mx + 9, 128, 4, 2, '#2a2e38');
    }
    for (let k = 0; k < 5; k++) { p.R(C + 40 + k * 5, 120 - (k & 1), 4, 10 + (k & 1), OUT); p.R(C + 41 + k * 5, 121 - (k & 1), 2, 9 + (k & 1), ['#d04848', '#4878d0', '#48a868', '#e0b040', '#a060c0'][k]); }
    p.B(C - 100, 124, 10, 6, '#f4f4f0'); p.R(C - 99, 125, 8, 2, '#7a3a1a');
    p.B(C + 76, 122, 16, 8, '#2a2e38');
    if (n) { p.R(C + 104, 116, 2, 14, '#3a3a3a'); p.B(C + 98, 112, 14, 6, '#3a7a4a'); p.glow(C + 105, 124, 20, 10, '!#fff0c0', 0.08); }
  },
  crowd: [
    { x: 326, y: 141, s: personSpec('nurse', 51, { top: '#7c5cb8', bot: '#7c5cb8' }), th: 0.2, alt: 2, behind: true },
    { x: 386, y: 142, s: personSpec('nurse', 52, { top: '#3098c8', bot: '#3098c8', hs: 'bun' }), th: 0.4, alt: 0, behind: true, fidget: 'clap' },
    { x: 424, y: 141, s: personSpec('doctor', 53), th: 0.6, alt: 3, behind: true },
    { x: 88, y: 178, s: personSpec('doctor', 54, { hs: 'bald', hair: '#8e8e8e', glasses: true }), th: 0.5, alt: 0 },
    { x: 254, y: 178, s: personSpec('doctor', 55, { clip: true }), th: 0.3, alt: 1 },
    { x: 238, y: 179, s: personSpec('doctor', 56, { clip: true, hs: 'long' }), th: 0.2, alt: 2 },
    { x: 486, y: 178, s: personSpec('visitor', 57, { coffee: true }), th: 0.25, alt: 1, fidget: 'wave' },
    { x: 646, y: 179, s: personSpec('visitor', 58, { hs: 'long', H: 21 }), th: 0.4, alt: 3 },
    { x: 470, y: 178, s: personSpec('patient', 59, { iv: true }), th: 0.7, alt: 2 },
    { x: 70, y: 179, s: personSpec('nurse', 60, { top: '#50a058', bot: '#50a058' }), th: 0.15, alt: 0 },
    { x: 620, y: 178, s: personSpec('janitor', 61), th: 0.35, alt: 1 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // room monitors
    const mons = [[100, 0], [500, 1]];
    for (const [rx, k] of mons) {
      const x = rx + 12 - bx;
      if (x < -40 || x > o.viewW) continue;
      drawEKG(ctx, x, 51, 30, 7, t + k * 13, '#40ff70', 0, k ? 1.3 : 1);
      drawEKG(ctx, x, 59, 30, 6, t + k * 7, '#40e0ff', 1, 1);
      ledText(ctx, k ? '118' : '72', x + 29, 52, k ? '#ff6060' : '#40ff70', 'small', 'right');
      // IV pump LED
      if ((t + k * 20) % 50 < 25) fr(ctx, rx + 81 - bx, FY - 41, 2, 2, '#ff3030');
    }
    // ventilator breath bar
    const vb = ((t >> 1) % 24);
    fr(ctx, 500 + 94 - bx, FY - 42, Math.min(12, vb), 1, '#60d0ff');
    // med machine "busy" blink
    if ((t >> 5) & 1) fr(ctx, 370 - 22 + 6 - bx, 51, 32, 6, o.night ? '#103060' : '#2a5aa0');
    clockHands(ctx, 370 + 88 - bx, 102, 11, t, 1, '#202020');
    // nurse call light over room 3 blinks
    const on = (t >> 4) & 1;
    fr(ctx, 500 + 112 - bx, 26, 8, 4, on ? '#ff5050' : o.night ? '#401818' : '#8a3030');
    if (on && o.night) drawGlow(ctx, 500 + 116 - bx, 28, 18, 10, '#ff3030', 0.12);
  },
  animOver(ctx, o, X) {
    if ((o.t >> 5) & 1) fr(ctx, 370 - 56 - X.back, 119, 2, 1, '#ffffff');
  },
};

// ===========================================================================
// STAGE 4: MRI SUITE
// ===========================================================================
function warnSign(p, x, y, w, lines, big) {
  const h = 9 + lines.length * 6;
  p.SH(x, y, w, h + 1);
  p.B(x, y, w, h + 1, '#f8f8f0');
  p.R(x + 1, y + 1, w - 2, 7, '#d02020');
  p.T(big || 'DANGER', x + w / 2, y + 2, '#ffffff', { align: 'center' });
  let ty = y + 10;
  for (const l of lines) { p.T(l, x + w / 2, ty, '#202020', { align: 'center' }); ty += 6; }
}

DEFS.mri = {
  refl: 0.2,
  ceil: {
    y: 16,
    shader(wx, wz, a, b, q) {
      // "sky" ceiling panels over the scanner (a real MRI-room thing)
      const ax = Math.abs(wx - 400);
      if (ax < 130 && wz > -20 && wz < 70) {
        if (seam(a, b, 65, 10) || seam(q.wz0, q.wz1, 45, 25)) return '#8a8aa0';
        const cl = hash(Math.floor(wx / 9), Math.floor(wz / 6)) + hash(Math.floor(wx / 15), Math.floor(wz / 10));
        if (cl > 1.35) return q.n ? '#5a6080' : '#ffffff';
        if (cl > 1.2) return q.n ? '#3a4470' : '#d8ecfc';
        return q.n ? '#1c2450' : '#78b8f0';
      }
      if (seam(a, b, 40) || seam(q.wz0, q.wz1, 40)) return '#8e8ca0';
      return '#d4d2e0';
    },
  },
  floor(wx, wz, a, b, q) {
    if (wz > 14 && wz < 22) return (Math.floor(wx / 12 + wz / 3) & 1) ? '#c8a020' : '#2a2626';
    const T = 40;
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) return '#68667a';
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    let c = odd ? '#a4a2b6' : '#aeacc0';
    const h = hash(Math.floor(wx * 1.3), Math.floor(wz * 1.5));
    if (h < 0.07) c = '#9290a6';
    if (wz < 14 && wz > -10 && Math.abs(wx - 400) < 110 && ((Math.floor(wx) + q.r) & 1)) c = shade(c, 0.07);
    if (q.f > 0.75) c = shade(c, -0.12);
    return c;
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 110, ['#e0dcee', '#d8d4ea', '#d0cce4', '#c8c4de']);
    roomLight(p, w, n, 17, [70, 200, 370, 540, 670], '#f0e8ff');
    p.R(0, 14, w, 3, '#7a7890');
    p.R(0, 16, w, 1, '#aaa8c0');
    wainscot(p, 0, w, 124, 47, '#5c4c8c', 28);
    p.R(0, 122, w, 2, '#e8c040');
    baseboard(p, 0, w, '#2c2440');
    // ---- far left: patient lockers
    sign(p, 8, 44, 74, 16, '#3a2a6a', '#ffffff', ['PUT ALL METAL', 'IN LOCKERS']);
    for (let k = 0; k < 3; k++) {
      const lx = 10 + k * 24;
      p.SH(lx, 70, 22, 104);
      p.V(lx, 70, 22, 104, ['#8a7ac8', '#7a9ad8', '#9a7ab8'][k]);
      for (let v = 0; v < 4; v++) p.R(lx + 4, 76 + v * 3, 14, 1, shade(['#8a7ac8', '#7a9ad8', '#9a7ab8'][k], -0.3));
      p.R(lx + 16, 112, 3, 6, '#d8d8e0');
      p.T(String(k + 1), lx + 11, 94, '#ffffff', { align: 'center' });
    }
    // ---- control room interior (window glass in over layer)
    const cx0 = 96, cw = 140;
    p.R(cx0, 56, cw, 64, n ? '!#1a2030' : '#56607a');
    p.R(cx0, 56, cw, 10, n ? '!#222a3e' : '#646e88');
    for (let k = 0; k < 3; k++) {
      const mx = cx0 + 8 + k * 44;
      p.B(mx, 72, 34, 24, '#202430');
      p.R(mx + 2, 74, 30, 20, '!#0a0a12');
      p.E(mx + 5, 76, 12, 15, '!#c8c8d0');
      p.E(mx + 7, 78, 8, 11, '!#7a7a88');
      p.R(mx + 10, 78, 1, 11, '!#c8c8d0');
      p.E(mx + 19, 76, 12, 15, '!#c8c8d0');
      p.E(mx + 21, 78, 8, 11, '!#7a7a88');
      if (k === 1) { p.R(mx + 23, 80, 3, 3, '!#ffe040'); p.T('?', mx + 28, 76, '!#ff4040'); }
      if (k === 2) p.R(mx + 9, 81, 4, 2, '!#f8e070');
    }
    // ---- MRI scanner: rounded housing
    const mx = C, my = 100, hw = 122, top = 26;
    const rr = (x0, y0, ww, hh, r, c) => {
      for (let y = 0; y < hh; y++) {
        let ins = 0;
        if (y < r) ins = Math.round(r - Math.sqrt(r * r - (r - y - 0.5) * (r - y - 0.5)));
        p.R(x0 + ins, y0 + y, ww - ins * 2, 1, c);
      }
    };
    p.alpha(0.2, () => rr(mx - hw + 4, top + 4, hw * 2, FY - top - 4, 30, '!#000000'));
    rr(mx - hw - 1, top - 1, hw * 2 + 2, FY - top + 1, 31, OUT);
    rr(mx - hw, top, hw * 2, FY - top, 30, '#e4e2ee');
    // vertical shading bands (lit from the left)
    const bands = ['#fcfbff', '#f6f4fc', '#eeecf6', '#e6e4f0', '#dcdaea', '#d0cee2'];
    p.g.save();
    p.g.beginPath();
    p.g.rect(mx - hw + 30, top, hw * 2 - 60, 31);
    p.g.rect(mx - hw, top + 30, hw * 2, FY - top);
    p.g.clip();
    p.GH(mx - hw, top, hw * 2, FY - top, bands);
    p.g.restore();
    rr(mx - hw + 3, top + 3, 30, 2, 28, '#ffffff');
    p.R(mx - hw, top + 30, 2, FY - top - 30, '#ffffff');
    p.R(mx + hw - 6, top + 30, 6, FY - top - 30, '#bcbacc');
    p.R(mx - hw, FY - 10, hw * 2, 10, '#c4c2d4');
    p.R(mx - hw, FY - 10, hw * 2, 1, '#9e9cb2');
    // front bezel + bore
    p.E(mx - 76, my - 76, 152, 152, '#c4c2d4');
    p.E(mx - 74, my - 75, 148, 148, '#f6f4fc');
    p.E(mx - 70, my - 70, 140, 140, '#e8e6f0');
    p.E(mx - 54, my - 54, 108, 108, OUT);
    p.E(mx - 53, my - 53, 106, 106, n ? '!#5070e8' : '#7890e8');
    p.E(mx - 50, my - 50, 100, 100, n ? '!#2a3490' : '#3a4490');
    p.E(mx - 46, my - 46, 92, 92, '!#0c1030');
    p.E(mx - 38, my - 36, 76, 76, '!#121838');
    p.E(mx - 28, my - 26, 56, 56, '!#182048');
    p.E(mx - 18, my - 16, 36, 36, n ? '!#2a3a78' : '#3a4a88');
    p.E(mx - 10, my - 8, 20, 20, n ? '!#5a6ac0' : '#6a7ac8');
    // patient cradle + the patient's feet sticking out of the bore
    p.R(mx - 34, my + 22, 68, 7, OUT);
    p.R(mx - 33, my + 23, 66, 5, '#d8d8e4');
    p.R(mx - 33, my + 23, 66, 1, '#f4f4fa');
    p.R(mx - 11, my + 6, 8, 17, OUT); p.R(mx + 3, my + 6, 8, 17, OUT);
    p.R(mx - 10, my + 7, 6, 15, '#f0c8a0'); p.R(mx + 4, my + 7, 6, 15, '#f0c8a0');
    p.R(mx - 10, my + 7, 6, 2, '#f8e0c8'); p.R(mx + 4, my + 7, 6, 2, '#f8e0c8');
    p.R(mx - 6, my + 9, 2, 12, '#d8a880'); p.R(mx + 8, my + 9, 2, 12, '#d8a880');
    p.R(mx - 28, my + 29, 56, FY - my - 29, OUT);
    p.R(mx - 27, my + 30, 54, FY - my - 30, '#dcdae8');
    p.R(mx - 27, my + 30, 54, 3, '#f4f2fa');
    p.R(mx + 20, my + 33, 7, FY - my - 33, '#b8b6c8');
    p.R(mx - 27, my + 46, 54, 2, '#b4b2c4');
    // branding + control strip
    p.T('MAGNETRON', mx, top + 8, '#5a4a9a', { font: 'big', align: 'center' });
    p.T('3 TESLA - ALWAYS ON', mx, top + 17, '#8a7ab8', { align: 'center' });
    p.R(mx - 112, 150, 30, 14, OUT);
    p.R(mx - 111, 151, 28, 12, '#c8c6d8');
    for (let k = 0; k < 3; k++) p.R(mx - 108 + k * 9, 154, 6, 6, ['#40c060', '#e0c040', '#d04040'][k]);
    // ---- metal objects stuck to the magnet
    // oxygen tank (diagonal)
    for (let k = 0; k < 30; k++) p.R(mx - 104 + k, 104 - k, 7, 2, OUT);
    for (let k = 0; k < 30; k++) p.R(mx - 103 + k, 103 - k, 5, 2, k < 4 ? '#c8c8c8' : '#3a9a4a');
    for (let k = 4; k < 30; k++) p.P(mx - 102 + k, 103 - k, '#7ad08a');
    p.R(mx - 72, 70, 6, 5, '#a0a0a0');
    p.T('O2', mx - 92, 96, '#ffffff');
    // wheelchair stuck on the upper right
    wheelchair(p, mx + 74, 88);
    // clipboard
    p.B(mx - 104, 118, 16, 20, '#9a6a3a');
    p.R(mx - 102, 121, 12, 15, '#f8f8f4');
    for (let k = 0; k < 4; k++) p.R(mx - 101, 124 + k * 3, 10, 1, '#8a8aa0');
    p.R(mx - 99, 117, 6, 3, '#a8a8b0');
    // scissors, stethoscope, coins, fork, pager, mop bucket, a pair of glasses
    p.L(mx + 62, 122, mx + 72, 132, '#a8b0b8'); p.L(mx + 72, 122, mx + 62, 132, '#a8b0b8');
    p.E(mx + 58, 118, 5, 5, '#e04040'); p.E(mx + 71, 118, 5, 5, '#e04040');
    p.ER(mx + 82, 104, 16, 14, '#3a3a48', 1);
    p.R(mx + 89, 117, 3, 3, '#c0c8d0');
    for (let k = 0; k < 6; k++) p.E(mx - 60 + k * 8 + (k & 1), 162 + (k % 3) * 2, 4, 4, '#e0c040');
    p.R(mx + 40, 160, 2, 10, '#c8c8d0'); p.R(mx + 38, 157, 6, 4, '#c8c8d0');
    p.B(mx + 86, 140, 12, 8, '#2a2e3a'); p.R(mx + 88, 142, 8, 3, '!#60ff80');
    p.B(mx + 52, 148, 20, 18, '#e8c020');
    p.R(mx + 53, 149, 18, 2, '#fff080');
    p.T('MOP', mx + 62, 156, '#3a3020', { align: 'center' });
    p.R(mx - 92, 64, 5, 3, OUT); p.R(mx - 84, 64, 5, 3, OUT); p.R(mx - 87, 65, 3, 1, OUT);
    // ---- right side: warnings + RF door
    warnSign(p, 500, 30, 76, ['MAGNET', 'ALWAYS ON'], 'DANGER!');
    warnSign(p, 500, 64, 76, ['REMOVE ALL', 'JEWELRY', '(AND HOPE)'], 'ZONE IV');
    sign(p, 500, 104, 76, 16, '#f0d030', '#202020', ['PACEMAKER?', 'PLEASE LEAVE']);
    const dx = 596;
    p.SH(dx - 4, 54, 78, 122);
    p.R(dx - 4, 54, 78, 122, OUT);
    p.R(dx - 3, 55, 76, 121, '#8a8aa0');
    p.V(dx, 58, 70, 118, '#c8c6d6');
    p.B(dx + 20, 70, 30, 30, '#5a4a3a');
    p.D(dx + 21, 71, 28, 28, '#c08050', '#7a4a2a', 0);
    p.R(dx + 58, 112, 4, 18, '#5a5a6a');
    p.HZ(dx + 4, 150, 62, 10);
    p.T('ZONE IV', dx + 35, 108, '#c02020', { font: 'big', align: 'center' });
    p.T('NO METAL', dx + 35, 118, '#202020', { align: 'center' });
    p.SH(684, 92, 46, 82);
    p.V(684, 92, 46, 82, '#b8a8d8');
    p.R(686, 94, 42, 30, '#e8e4f0');
    for (let k = 0; k < 3; k++) { p.R(688, 98 + k * 8, 38, 5, ['#e87070', '#70a0e8', '#f0d060'][k]); p.R(688, 98 + k * 8, 38, 1, '#ffffff'); }
    p.T('EAR PLUGS', 707, 128, '#3a2a5a', { align: 'center' });
    p.R(706, 134, 2, 36, '#8878a8');
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const cx0 = 96, cw = 140;
    // wall + console below the control window (hides the techs' legs)
    p.R(cx0 - 6, 120, cw + 12, 56, '#c8c4de');
    if (n) roomLight(p, w, n, 17, [], '#000000', FY);
    wainscot(p, cx0 - 6, cx0 + cw + 6, 124, 47, '#5c4c8c', 28);
    p.R(cx0 - 6, 122, cw + 12, 2, '#e8c040');
    baseboard(p, cx0 - 6, cx0 + cw + 6, '#2c2440');
    p.glass(cx0, 56, cw, 64, '#000000', 0);
    p.alpha(n ? 0.1 : 0.18, () => p.R(cx0, 56, cw, 64, '!#e0f0ff'));
    p.alpha(0.22, () => {
      for (let i = 0; i < 2; i++) for (let k = 0; k < 40; k++) p.R(cx0 + 20 + i * 66 + k, 116 - k, 8, 1, '!#ffffff');
    });
    p.R(cx0 - 5, 51, cw + 10, 5, OUT);
    p.R(cx0 - 4, 52, cw + 8, 3, '#a8a6bc');
    p.R(cx0 - 5, 56, 5, 64, OUT); p.R(cx0 + cw, 56, 5, 64, OUT);
    p.R(cx0 - 4, 56, 3, 64, '#a8a6bc'); p.R(cx0 + cw + 1, 56, 3, 64, '#a8a6bc');
    p.R(cx0 - 8, 120, cw + 16, 6, OUT);
    p.R(cx0 - 7, 121, cw + 14, 4, '#c8c6d8');
    p.R(cx0 - 7, 121, cw + 14, 1, '#f0eef8');
    sign(p, cx0 + cw / 2 - 34, 38, 68, 10, '#3a2a6a', '#ffffff', 'CONTROL ROOM');
    p.T('PLEASE HOLD STILL', cx0 + cw / 2, 136, '#f0e8ff', { align: 'center' });
    p.T('FOR 45 MINUTES', cx0 + cw / 2, 143, '#f0e8ff', { align: 'center' });
  },
  crowd: [
    { x: 124, y: 134, s: personSpec('tech', 71, { glasses: true }), th: 0.3, alt: 0, behind: true },
    { x: 166, y: 134, s: personSpec('tech', 72, { hs: 'long', coffee: true }), th: 0.5, alt: 2, behind: true },
    { x: 208, y: 134, s: personSpec('doctor', 73), th: 0.2, alt: 1, behind: true },
    { x: 90, y: 178, s: personSpec('patient', 74, { hs: 'bald', hair: '#dedede' }), th: 0.4, alt: 2 },
    { x: 238, y: 178, s: personSpec('janitor', 75), th: 0.6, alt: 0, fidget: 'wave' },
    { x: 512, y: 178, s: personSpec('guard', 76), th: 0.5, alt: 3 },
    { x: 540, y: 178, s: personSpec('nurse', 77, { top: '#7c5cb8', bot: '#7c5cb8' }), th: 0.2, alt: 1 },
    { x: 670, y: 179, s: personSpec('visitor', 78, { hs: 'afro' }), th: 0.3, alt: 0 },
    { x: 46, y: 179, s: personSpec('patient', 79, { H: 23 }), th: 0.15, alt: 1 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back, mx = 370 - bx, my = 100;
    // bore light ring pulses
    const k = (t >> 3) % 6;
    ctx.globalAlpha = 0.25 + (k < 3 ? k : 6 - k) * 0.12;
    ctx.drawImage(glowSprite(50, 50, o.night ? '#6080ff' : '#90a8ff', 0.16), mx - 50, my - 50);
    ctx.globalAlpha = 1;
    // keys dangling on the bore rim, swinging toward the magnet
    const sw = Math.round(Math.sin(t * 0.15) * 2);
    fr(ctx, mx + 34, my - 44, 5, 4, '#d8c040');
    fr(ctx, mx + 35 + sw, my - 40, 1, 6, '#c0c8d0');
    fr(ctx, mx + 37 + sw, my - 40, 1, 5, '#c0c8d0');
    fr(ctx, mx + 33 + sw, my - 40, 1, 4, '#d8c040');
    // a paperclip zips into the magnet every few seconds
    const c = t % 150;
    if (c < 24) {
      const f = c / 24;
      const px = Math.round(-80 + f * f * (mx + 30 + 80));
      fr(ctx, px, 140 - Math.round(f * 30), 3, 1, '#d0d8e0');
      fr(ctx, px + 1, 141 - Math.round(f * 30), 2, 1, '#a0a8b0');
    }
    // DANGER sign blink
    if ((t >> 4) & 1) fr(ctx, 501 - bx, 31, 74, 7, '#ff3a2a');
    if ((t >> 4) & 1) drawText(ctx, 'DANGER!', 538 - bx, 32, { font: 'small', color: '#ffffff', align: 'center' });
    // control room monitors scanline
    const sy = 74 + ((t >> 1) % 20);
    for (let i = 0; i < 3; i++) fr(ctx, 96 + 10 + i * 44 - bx, sy, 30, 1, '#5a8aff');
  },
};

// ===========================================================================
// STAGE 5: PHARMACY QUEUE
// ===========================================================================
function pillShelf(p, x, y, w, rows, seed) {
  const cols = ['#e84848', '#f0a030', '#f0e040', '#50b050', '#4890e0', '#a060d0', '#f0f0f0', '#e870b0', '#40c0c0', '#c87838'];
  for (let r = 0; r < rows; r++) {
    const sy = y + r * 20;
    p.R(x, sy + 16, w, 3, '#d8d0c0');
    p.R(x, sy + 16, w, 1, '#fff8ea');
    p.R(x, sy + 19, w, 1, '#8a826e');
    let bx = x + 2;
    while (bx < x + w - 6) {
      const h = hash(bx, sy + seed);
      const bw = 4 + Math.floor(h * 4), bh = 8 + Math.floor(hash(sy, bx) * 7);
      const c = cols[Math.floor(hash(bx * 3, sy + seed * 7) * cols.length)];
      p.R(bx, sy + 16 - bh, bw, bh, OUT);
      p.R(bx + 1, sy + 17 - bh, bw - 2, bh - 1, c);
      p.R(bx + 1, sy + 17 - bh, bw - 2, 2, h > 0.5 ? '#ffffff' : '#f0f0e0');
      p.R(bx + 1, sy + 21 - bh, bw - 2, 2, '#f8f8f8');
      bx += bw + (h > 0.8 ? 2 : 0);
    }
  }
}
function stanchion(p, x, fy) {
  p.R(x, fy - 22, 2, 22, '#c8a840');
  p.R(x + 2, fy - 22, 1, 22, '#8a7020');
  p.E(x - 2, fy - 24, 6, 4, '#e0c050');
  p.E(x - 3, fy - 2, 8, 3, '#5a4a20');
}

DEFS.pharmacy = {
  refl: 0.14,
  ceil: { y: 14, shader: tileCeil('#fbfdff', '#e0dcd2', '#a8a498', '#d0ccc0') },
  floor(wx, wz, a, b, q) {
    if (wz > 10 && wz < 15) return '#c8a830';
    // footprint decals in the queue
    const fx = ((wx % 50) + 50) % 50;
    if (wz > 22 && wz < 30 && wx > 400 && wx < 700 && (fx > 18 && fx < 23 || fx > 26 && fx < 31)) return '#3a7ab0';
    const T = 48;
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) return '#8a8478';
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    let c = odd ? '#bcb6a8' : '#c6c0b2';
    if (hash(Math.floor(wx), Math.floor(wz * 2)) < 0.05) c = '#aaa496';
    if (q.f > 0.75) c = shade(c, -0.12);
    return shade(c, -0.08);
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 162, ['#f4f0e6', '#eeeadf', '#e8e4d8']);
    roomLight(p, w, n, 17, [70, 190, 310, 430, 550, 670], '#fff8e0');
    p.R(0, 14, w, 2, '#9a968a');
    // ---- dispensary behind the counter
    p.R(90, 40, 560, 100, '#e0dccf');
    p.R(90, 40, 560, 100, n ? '#a8a49a' : '#e4e0d4');
    pillShelf(p, 96, 48, 548, 4, 3);
    p.alpha(0.22, () => p.R(90, 40, 560, 100, '!#6a6458'));
    // ---- fascia band
    p.R(0, 16, w, 26, OUT);
    p.R(0, 17, w, 24, n ? '!#d0581e' : '#e2662a');
    p.R(0, 17, w, 2, n ? '!#f08048' : '#f8935a');
    p.R(0, 38, w, 3, n ? '!#8a3410' : '#a8441a');
    if (n) p.glow(C, 30, 110, 22, '!#ffb070', 0.06);
    p.T('PHARMACY', C, 22, '!#ffffff', { font: 'big', scale: 2, align: 'center', shadow: n ? '!#7a2008' : '#8a2a0a' });
    for (const px of [C - 90, C + 78]) {
      p.R(px, 21, 12, 16, '!#ffffff');
      p.R(px + 4, 23, 4, 12, n ? '!#30c080' : '#2aa070'); p.R(px + 2, 27, 8, 4, n ? '!#30c080' : '#2aa070');
    }
    p.T('RX - DRUGS - SNACKS - REGRET', 150, 26, n ? '!#ffd8b8' : '#ffe0c8', { align: 'center' });
    p.T('WE ACCEPT: CASH', 590, 26, n ? '!#ffd8b8' : '#ffe0c8', { align: 'center' });
    // ---- hanging window signs
    const hang = (x, txt, bg) => {
      p.R(x + 8, 41, 1, 6, '#5a5a5a'); p.R(x + 52, 41, 1, 6, '#5a5a5a');
      sign(p, x, 47, 61, 13, bg, '#ffffff', txt, { font: 'big' });
    };
    hang(160, 'DROP OFF', '#2a7ab0');
    hang(520, 'PICK UP', '#2aa070');
    // NOW SERVING board
    p.R(C - 1, 41, 2, 4, '#5a5a5a');
    ledPanel(p, C - 44, 45, 88, 30);
    p.T('NOW SERVING', C, 48, '!#ffb030', { align: 'center' });
    p.T('YOUR #: 9721', C, 68, n ? '!#70a0ff' : '#5080e0', { align: 'center' });
    // prior auth + generics signs
    sign(p, 252, 84, 72, 22, '#fff4c0', '#c02020', ['PRIOR AUTH', 'REQUIRED', 'FOR EVERYTHING']);
    sign(p, 418, 84, 72, 22, '#e8f4ff', '#204080', ['ASK ABOUT', 'GENERICS', '(WE WONT)']);
    // ---- left: retail endcaps + blood pressure kiosk
    for (let k = 0; k < 2; k++) {
      const sx = 4 + k * 44;
      p.SH(sx, 56, 40, 118);
      p.V(sx, 56, 40, 118, '#e8e4dc');
      p.R(sx + 2, 58, 36, 10, k ? '#4890e0' : '#e84848');
      p.T(k ? 'VITAMINS' : 'COUGH', sx + 20, 60, '#ffffff', { align: 'center' });
      for (let r = 0; r < 5; r++) {
        p.R(sx + 2, 84 + r * 18, 36, 2, '#a8a498');
        for (let j = 0; j < 4; j++) {
          const bc = ['#f0c040', '#e86060', '#60b0e0', '#80c060', '#c080e0'][(j + r + k) % 5];
          p.R(sx + 3 + j * 9, 72 + r * 18, 8, 12, OUT);
          p.R(sx + 4 + j * 9, 73 + r * 18, 6, 11, bc);
          p.R(sx + 4 + j * 9, 76 + r * 18, 6, 3, '#ffffff');
        }
      }
    }
    // ---- right: flu shot standee + exit
    p.SH(662, 70, 44, 64);
    p.B(662, 70, 44, 64, '#ffffff', '#3a3a48');
    p.R(663, 71, 42, 12, '#2aa070');
    p.T('FLU SHOTS', 684, 74, '#ffffff', { align: 'center' });
    p.T('$0*', 684, 88, '#c02020', { font: 'big', scale: 2, align: 'center' });
    p.T('*$90', 684, 106, '#3a3a48', { align: 'center' });
    p.T('NO INSURANCE', 684, 114, '#3a3a48', { align: 'center' });
    p.T('ACCEPTED', 684, 120, '#3a3a48', { align: 'center' });
    p.R(670, 134, 2, 6, '#3a3a48'); p.R(696, 134, 2, 6, '#3a3a48');
    sign(p, 706, 44, 30, 10, '#20a040', '#ffffff', 'EXIT');
    // queue stanchions
    for (let k = 0; k < 6; k++) stanchion(p, 420 + k * 44, 178);
    p.R(422, 160, 220, 2, '#c03030');
    p.R(422, 162, 220, 1, '#801818');
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const C = w >> 1;
    // counter
    const x0 = 88, x1 = 652;
    p.R(x0 - 1, 125, x1 - x0 + 2, 51, OUT);
    p.R(x0, 126, x1 - x0, 5, '#f0ece2');
    p.R(x0, 126, x1 - x0, 1, '#ffffff');
    p.R(x0, 131, x1 - x0, 45, '#2a8a9a');
    p.R(x0, 131, x1 - x0, 3, '#1a6a78');
    p.R(x0, 160, x1 - x0, 4, '#e2662a');
    p.R(x0, 160, x1 - x0, 1, '#f8935a');
    for (let k = x0 + 40; k < x1; k += 80) p.R(k, 136, 1, 22, '#1e7280');
    // sneeze guards (glass)
    p.alpha(0.18, () => { p.R(140, 92, 110, 34, '!#e0f8ff'); p.R(490, 92, 110, 34, '!#e0f8ff'); });
    p.alpha(0.35, () => { for (let k = 0; k < 20; k++) { p.R(150 + k, 120 - k, 4, 1, '!#ffffff'); p.R(500 + k, 120 - k, 4, 1, '!#ffffff'); } });
    p.R(140, 92, 110, 1, '#c8e0e8'); p.R(490, 92, 110, 1, '#c8e0e8');
    // registers + bags of prescriptions
    for (const rx of [180, 540]) {
      p.V(rx, 112, 22, 14, '#3a3e48');
      p.R(rx + 2, 114, 18, 8, n ? '!#103a20' : '#1a5a30');
      p.R(rx + 4, 116, 8, 1, '!#60ff90');
    }
    for (let k = 0; k < 4; k++) {
      p.R(580 + k * 9, 116 + (k & 1), 8, 10, OUT);
      p.R(581 + k * 9, 117 + (k & 1), 6, 9, '#f8f4e8');
      p.R(582 + k * 9, 119 + (k & 1), 4, 2, '#2aa070');
    }
    p.T('RX', C - 150, 145, '#e8fbff', { font: 'big', scale: 2, shadow: '#105060' });
    p.T('NO REFUNDS ON SIDE EFFECTS', C, 146, '#c8f0f8', { align: 'center' });
    p.T('RX', C + 130, 145, '#e8fbff', { font: 'big', scale: 2, shadow: '#105060' });
    // neon "OPEN 24 HRS" in the side window
    const nx = 690, ny = 146;
    p.B(nx - 34, ny - 6, 68, 20, '#202430');
    if (n) p.glow(nx, ny + 4, 44, 16, '!#ff4aa0', 0.08);
    p.T('OPEN 24 HRS', nx, ny, n ? '!#ff80c8' : '#a04870', { font: 'big', align: 'center', outline: n ? '!#a01860' : '#402030' });
  },
  crowd: [
    { x: 214, y: 137, s: personSpec('doctor', 81, { coat: true, glasses: true, top: '#f0f0e8' }), th: 0.5, alt: 3, behind: true },
    { x: 300, y: 137, s: personSpec('doctor', 82, { top: '#a8c8f0', hs: 'bun' }), th: 0.3, alt: 0, behind: true },
    { x: 566, y: 137, s: personSpec('doctor', 83, { hs: 'bald', hair: '#2c1e16' }), th: 0.6, alt: 2, behind: true },
    { x: 450, y: 138, s: personSpec('nurse', 84, { top: '#e08a3a', bot: '#e08a3a' }), th: 0.2, alt: 1, behind: true },
    { x: 140, y: 137, s: personSpec('tech', 96, { hs: 'long' }), th: 0.4, alt: 1, behind: true },
    // the queue
    { x: 432, y: 178, s: personSpec('visitor', 85, { hs: 'bald', hair: '#dedede', glasses: true }), th: 0.6, alt: 0 },
    { x: 452, y: 178, s: personSpec('visitor', 86, { hs: 'long' }), th: 0.3, alt: 2 },
    { x: 468, y: 179, s: personSpec('kid', 87), th: 0.1, alt: 1 },
    { x: 488, y: 178, s: personSpec('patient', 88, { sling: true }), th: 0.4, alt: 0 },
    { x: 508, y: 178, s: personSpec('visitor', 89, { coffee: true }), th: 0.25, alt: 3 },
    { x: 528, y: 178, s: personSpec('visitor', 90, { hs: 'afro' }), th: 0.15, alt: 1 },
    { x: 548, y: 178, s: personSpec('visitor', 91, { beard: true, hs: 'short' }), th: 0.5, alt: 2 },
    { x: 568, y: 179, s: personSpec('visitor', 92, { hs: 'bun', H: 21 }), th: 0.35, alt: 0, fidget: 'wave' },
    { x: 590, y: 178, s: personSpec('patient', 93, { iv: true }), th: 0.7, alt: 2 },
    { x: 626, y: 178, s: personSpec('visitor', 94, { glasses: true }), th: 0.2, alt: 1 },
    { x: 112, y: 178, s: personSpec('guard', 95), th: 0.6, alt: 3 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    const num = 41 + Math.floor(t / 200);
    const s = String(num % 1000).padStart(3, '0');
    ledText(ctx, s, 370 - bx, 56, (t % 200) < 30 && ((t >> 2) & 1) ? '#ffffff' : '#ff4a2a', 'big', 'center');
    if ((t % 200) < 30) fr(ctx, 370 + 30 - bx, 58, 4, 4, '#40ff60');
    // pick up sign light
    if ((t >> 5) & 1) fr(ctx, 520 + 4 - bx, 50, 3, 3, '#a0ffc0');
  },
  animOver(ctx, o, X) {
    if ((o.t >> 4) & 1) fr(ctx, 180 + 4 + 10 - X.back, 118, 2, 1, '#60ff90');
  },
};

// ===========================================================================
// STAGE 6: WAITING ROOM
// ===========================================================================
function chairRow(p, x, n, fy, c = '#e07a2a') {
  p.R(x - 2, fy - 18, n * 18 + 4, 2, '#5a4a3a');
  for (let k = 0; k < n; k++) {
    const cx = x + k * 18;
    p.R(cx + 2, fy - 16, 2, 16, '#3a3028');
    p.R(cx + 14, fy - 16, 2, 16, '#3a3028');
    p.B(cx, fy - 22, 18, 6, c);
    p.R(cx + 1, fy - 21, 16, 1, shade(c, 0.3));
    p.B(cx + 1, fy - 40, 16, 19, c);
    p.R(cx + 2, fy - 39, 14, 2, shade(c, 0.3));
    p.R(cx + 14, fy - 37, 2, 15, shade(c, -0.2));
  }
}

DEFS.waiting = {
  ceil: { y: 14, shader: tileCeil('#fff8e8', '#d8ccb0', '#9a8e74', '#c8bc9e') },
  floor(wx, wz, a, b, q) {
    // 70s carpet with diamond motif
    const u = ((wx % 24) + 24) % 24 - 12, v = ((wz % 24) + 24) % 24 - 12;
    const d = Math.abs(u) + Math.abs(v);
    let c = '#7a4a2c';
    if (d < 4) c = '#c87a34';
    else if (d < 6) c = '#5a3420';
    else if (d > 11 && d < 13) c = '#9a5e32';
    if (hash(Math.floor(wx * 2), Math.floor(wz * 3)) < 0.18) c = shade(c, -0.12);
    if (q.f > 0.75) c = shade(c, -0.12);
    return c;
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 110, ['#e4c46c', '#dcbc62', '#d4b45a', '#ccac52']);
    roomLight(p, w, n, 16, [80, 200, 370, 540, 660], '#fff0c0');
    p.R(0, 14, w, 2, '#8a7440');
    // wood paneling
    p.R(0, 112, w, 64, '#7a5430');
    for (let x = 0; x < w; x += 12) {
      p.R(x, 112, 1, 64, '#5a3a1e');
      p.R(x + 1, 112, 1, 64, '#8e663e');
      for (let k = 0; k < 4; k++) p.R(x + 3 + ((x / 12 + k) % 3) * 2, 118 + k * 14 + (x % 7), 1, 6, '#6a4626');
    }
    p.R(0, 110, w, 4, '#4a301a');
    p.R(0, 110, w, 1, '#a07848');
    baseboard(p, 0, w, '#3a2414');
    // ---- TV
    const tvx = C - 46;
    p.R(C - 4, 16, 8, 26, '#3a3a40');
    p.SH(tvx, 40, 92, 58, 3);
    p.B(tvx, 40, 92, 58, '#2a2a30');
    p.R(tvx + 2, 41, 88, 1, '#5a5a64');
    p.R(tvx + 4, 44, 84, 48, '#101418');
    p.R(tvx + 40, 94, 12, 2, '#5a5a64');
    p.P(tvx + 84, 94, '!#40ff40');
    // WAIT TIME board
    ledPanel(p, C - 58, 100, 116, 16);
    p.T('WAIT TIME:', C - 52, 105, '!#ffb030');
    // ---- left: clock, take-a-number, posters
    wallClock(p, 150, 52, 13);
    sign(p, 40, 40, 70, 26, '#fff8f0', '#8a3a1a', ['PLEASE BE', 'PATIENT', '(GET IT?)']);
    p.SH(30, 78, 18, 26);
    p.B(30, 78, 18, 26, '#d03030');
    p.R(33, 82, 12, 8, '#f8f8f8');
    p.T('TAKE', 39, 92, '#ffffff', { align: 'center' });
    p.R(36, 104, 6, 6, '#f8f8f8');
    p.T('NOW SERVING: 3', 98, 82, '#3a2a1a', { align: 'center' });
    p.T('YOURS: 999', 98, 90, '#c02020', { align: 'center' });
    sign(p, 196, 42, 90, 22, '#e8f0ff', '#203080', ['IF YOU CAN READ', 'THIS, YOU ARE NOT', 'AN EMERGENCY']);
    poster(p, 226, 72, 40, 32, '#f0e8d8', ['THANK', 'YOU FOR', 'WAITING'], '#5a3a1a');
    // ---- right: fish tank, magazine rack, dead plant, cell phone sign
    sign(p, 452, 42, 80, 16, '#ffffff', '#c02020', ['CELL PHONES OFF', '(NOT YOURS, OURS)']);
    sign(p, 470, 70, 50, 22, '#f8f0c8', '#3a2a1a', ['FREE', 'WIFI', '(LOL)']);
    const ft = 560;
    p.SH(ft, 96, 96, 80);
    p.V(ft, 136, 96, 40, '#5a3a22');
    p.R(ft + 4, 140, 88, 30, '#4a2e1a');
    p.R(ft + 46, 142, 2, 26, '#3a2010');
    p.B(ft - 2, 92, 100, 46, '#20242a');
    p.R(ft, 94, 96, 42, n ? '!#1a5a8a' : '#4aa8d8');
    p.G(ft, 94, 96, 42, n ? ['!#2a78a8', '!#1a5a8a', '!#124a78'] : ['#7ac8f0', '#4aa8d8', '#3890c8']);
    p.R(ft, 128, 96, 8, '#c8a868');
    p.D(ft, 128, 96, 8, '#c8a868', '#a08048', 0);
    for (let k = 0; k < 5; k++) { const kx = ft + 8 + k * 19; for (let j = 0; j < 4; j++) p.R(kx + (j & 1) * 2, 120 - j * 6, 2, 7, '#3a9a4a'); }
    p.B(ft + 60, 118, 14, 10, '#8a8a90');
    p.T('NEMO?', ft + 67, 121, '#3a3a40', { align: 'center' });
    p.R(ft - 2, 92, 100, 3, '#3a3e48');
    p.alpha(0.2, () => { for (let k = 0; k < 20; k++) p.R(ft + 6 + k, 132 - k * 2, 3, 2, '!#ffffff'); });
    // magazine rack
    p.SH(674, 116, 40, 50);
    p.B(674, 116, 40, 50, '#8a6a42');
    const mags = [['#e04040', 'TIME'], ['#4080e0', 'GOLF'], ['#e0c040', '1997'], ['#40a060', 'FAX']];
    for (let k = 0; k < 4; k++) {
      const mx = 677 + (k % 2) * 18, my = 120 + Math.floor(k / 2) * 22;
      p.B(mx, my, 16, 20, mags[k][0]);
      p.T(mags[k][1], mx + 8, my + 3, '#ffffff', { align: 'center' });
    }
    // dead plant
    p.V(4, 152, 14, 24, '#a85a30');
    p.L(11, 152, 8, 128, '#6a5a2a'); p.L(11, 152, 16, 134, '#6a5a2a'); p.L(11, 150, 4, 140, '#7a6a3a');
    p.R(6, 128, 4, 2, '#8a6a2a'); p.R(15, 133, 4, 2, '#8a6a2a'); p.R(2, 140, 3, 2, '#8a6a2a');
    // ---- chairs (people sit in them; cobweb on the skeleton's)
    chairRow(p, 60, 9, 170);
    chairRow(p, 400, 8, 170);
    p.L(296, 128, 312, 128, '#e8e8e8');
    p.L(312, 128, 312, 142, '#e8e8e8');
    p.L(298, 129, 311, 141, '#e8e8e8');
    p.L(304, 128, 312, 135, '#e8e8e8');
    // wet floor sign
    const wf = 352;
    p.R(wf, 150, 18, 26, OUT);
    p.R(wf + 1, 151, 16, 24, '#f0d020');
    p.R(wf + 1, 151, 16, 2, '#fff070');
    p.T('WET', wf + 9, 156, '#202020', { align: 'center' });
    p.T('FLOOR', wf + 9, 163, '#202020', { align: 'center' });
    p.R(wf + 5, 168, 6, 2, '#202020');
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  crowd: (night) => {
    const seated = [
      [69, personSpec('visitor', 101, { icepack: true })],
      [87, personSpec('visitor', 102, { hs: 'long' })],
      [123, personSpec('patient', 103, { bandage: true })],
      [141, personSpec('visitor', 104, { glasses: true, hs: 'bald', hair: '#dedede' })],
      [177, personSpec('kid', 105)],
      [195, personSpec('visitor', 106, { hs: 'bun', hair: '#8e8e8e', glasses: true })],
      [231, personSpec('visitor', 107, { beard: true })],
      [303, personSpec('skeleton', 108)],
      [409, personSpec('patient', 109, { sling: true })],
      [445, personSpec('visitor', 110, { hs: 'afro' })],
      [463, personSpec('visitor', 111, { coffee: false })],
      [517, personSpec('nurse', 112, { top: '#d874a2', bot: '#d874a2' })],
      [535, personSpec('visitor', 113, { hs: 'long', hair: '#a63c20' })],
    ];
    const out = seated.map(([x, s], i) => ({ x, y: 169, s: Object.assign(s, { sit: true }), th: s.skel ? 2 : 0.1 + ((i * 37) % 60) / 100, ph: i * 11 }));
    out.push({ x: 336, y: 178, s: personSpec('janitor', 114), th: 0.5, alt: 0 });
    out.push({ x: 640, y: 178, s: personSpec('visitor', 115, { balloon: '#4890e0' }), th: 0.2, alt: 1 });
    out.push({ x: 24, y: 179, s: personSpec('guard', 116), th: 0.6, alt: 3 });
    return out;
  },
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back, C = 370;
    // TV programme cycles every ~4s
    const tvx = C - 46 + 4 - bx, tvy = 44;
    const ch = Math.floor(t / 240) % 3;
    if (ch === 0) {
      fr(ctx, tvx, tvy, 84, 48, '#1a3a8a');
      fr(ctx, tvx, tvy + 36, 84, 12, '#c02020');
      drawText(ctx, 'BREAKING:', tvx + 3, tvy + 37, { font: 'small', color: '#ffffff' });
      const sx = (t % 160) / 2 | 0;
      fr(ctx, tvx, tvy + 43, 84, 5, '#ffffff');
      ctx.save(); ctx.beginPath(); ctx.rect(tvx, tvy + 43, 84, 5); ctx.clip();
      drawText(ctx, 'WAIT TIMES REACH ALL-TIME HIGH - FILM AT 11', tvx + 84 - sx * 3, tvy + 43, { font: 'small', color: '#c02020' });
      ctx.restore();
      fr(ctx, tvx + 30, tvy + 8, 22, 28, '#e8b48c');
      fr(ctx, tvx + 28, tvy + 6, 26, 8, '#4c2e1a');
      fr(ctx, tvx + 24, tvy + 26, 34, 10, '#2a2a40');
      fr(ctx, tvx + 36, tvy + 18, 2, 2, '#202020'); fr(ctx, tvx + 44, tvy + 18, 2, 2, '#202020');
      fr(ctx, tvx + 38, tvy + 24 + ((t >> 3) & 1), 6, 1, '#802020');
    } else if (ch === 1) {
      // soap opera: dramatic zoom
      fr(ctx, tvx, tvy, 84, 48, '#e8a0b0');
      fr(ctx, tvx, tvy + 30, 84, 18, '#c07080');
      fr(ctx, tvx + 12, tvy + 10, 18, 22, '#f0c8a0'); fr(ctx, tvx + 10, tvy + 6, 22, 10, '#e8c870');
      fr(ctx, tvx + 54, tvy + 10, 18, 22, '#c88a5a'); fr(ctx, tvx + 52, tvy + 6, 22, 8, '#2a1a10');
      fr(ctx, tvx + 16, tvy + 18, 2, 2, '#202020'); fr(ctx, tvx + 24, tvy + 18, 2, 2, '#202020');
      fr(ctx, tvx + 58, tvy + 18, 2, 2, '#202020'); fr(ctx, tvx + 66, tvy + 18, 2, 2, '#202020');
      if ((t >> 4) & 1) drawText(ctx, 'DR.?!', tvx + 42, tvy + 36, { font: 'big', color: '#ffffff', align: 'center' });
    } else {
      // colour bars + static flicker
      const bars = ['#e0e0e0', '#e0e040', '#40e0e0', '#40e040', '#e040e0', '#e04040', '#4040e0'];
      for (let i = 0; i < 7; i++) fr(ctx, tvx + i * 12, tvy, 12, 34, bars[i]);
      fr(ctx, tvx, tvy + 34, 84, 14, '#202020');
      drawText(ctx, 'PLEASE STAND BY', tvx + 42, tvy + 38, { font: 'small', color: '#ffffff', align: 'center' });
    }
    if (o.night) drawGlow(ctx, tvx + 42, tvy + 24, 70, 44, '#90b0ff', 0.05);
    // WAIT TIME keeps climbing
    const hrs = 14 + Math.floor(t / 300);
    ledText(ctx, hrs + ' HRS', C + 52 - bx, 104, '#ff4a2a', 'big', 'right');
    // clock spins fast (time flies when you're waiting)
    clockHands(ctx, 150 - bx, 52, 13, t, 40, '#202020');
    // fish
    const ft = 560 - bx;
    for (let i = 0; i < 4; i++) {
      const per = 300 + i * 70;
      const ph = (t + i * 97) % per;
      const dir = ph < per / 2 ? 1 : -1;
      const f = ph < per / 2 ? ph / (per / 2) : 1 - (ph - per / 2) / (per / 2);
      const fx = ft + 6 + Math.round(f * 80), fy = 100 + i * 7 + Math.round(Math.sin((t + i * 40) * 0.05) * 2);
      const col = ['#ff8030', '#ffe040', '#ff5080', '#60e0ff'][i];
      fr(ctx, fx, fy, 5, 3, col);
      fr(ctx, dir > 0 ? fx - 2 : fx + 5, fy, 2, 3, col);
      fr(ctx, dir > 0 ? fx + 3 : fx + 1, fy, 1, 1, '#101010');
    }
    for (let i = 0; i < 3; i++) {
      const by = 126 - ((t + i * 30) % 32);
      fr(ctx, ft + 70 + (i & 1) * 2, by, 1, 1, '#e0f8ff');
    }
  },
};

// ===========================================================================
// STAGE 7: HELIPAD
// ===========================================================================
function skyline(p, w, base, seed, minH, maxH, col, n, winOn, bw0 = 26) {
  let x = -10, i = 0;
  while (x < w) {
    const bw = bw0 + Math.floor(hash(i, seed) * 30);
    const bh = minH + Math.floor(hash(seed, i) * (maxH - minH));
    const c = shade(col, (hash(i * 3, seed) - 0.5) * 0.12);
    p.R(x, base - bh, bw, bh, c);
    p.R(x + bw - 3, base - bh, 3, bh, shade(c, -0.15));
    if (hash(i, seed * 5) < 0.3) p.R(x + bw / 2 - 1, base - bh - 8, 2, 8, c);
    if (hash(i, seed * 7) < 0.2) { p.R(x + 4, base - bh - 4, bw - 8, 4, c); }
    for (let wy = base - bh + 4; wy < base - 2; wy += 5)
      for (let wx = x + 3; wx < x + bw - 4; wx += 4) {
        const lit = hash(wx, wy + seed) < winOn;
        if (lit) p.R(wx, wy, 2, 2, n ? (hash(wy, wx) < 0.8 ? '!#ffd870' : '!#a0d0ff') : shade(c, 0.25));
      }
    x += bw + Math.floor(hash(i, seed * 3) * 6);
    i++;
  }
}

DEFS.helipad = {
  floor(wx, wz, a, b, q) {
    // rooftop concrete with the big H circle
    const dx = wx - 400, dz = (wz - 8) * 1.0;
    const r = Math.sqrt(dx * dx + dz * dz * 4);
    // H letter
    const hx = Math.abs(dx), hz = dz;
    if (hz > -34 && hz < 42 && ((hx > 20 && hx < 36) || (hx < 36 && Math.abs(hz - 4) < 6))) return '#e8e8e0';
    if (r > 92 && r < 104) return '#e8c020';
    if (r > 104 && r < 108) return '#3a3a3a';
    if (seam(q.wz0, q.wz1, 60, 30) && r > 108) return '#5e5e66';
    // perimeter lights along the back edge
    if (wz > 64 && ((wx % 60) + 60) % 60 < 4) return q.n ? '!#60ff90' : '#3a6a4a';
    const h = hash(Math.floor(wx * 1.1), Math.floor(wz * 1.4));
    let c = '#7a7a82';
    if (h < 0.12) c = '#6e6e76';
    else if (h > 0.92) c = '#86868e';
    if (r < 92) c = shade(c, 0.05);
    if (q.f > 0.75) c = shade(c, -0.12);
    return c;
  },
  far: [
    {
      pf: 0.2,
      build(p, w, n) {
        if (n) {
          p.G(0, 0, w, 150, ['#04061a', '#070c26', '#0c1434', '#121c42', '#1a2650', '#26305c']);
          for (let i = 0; i < 120; i++) p.P(Math.floor(hash(i, 1) * w), Math.floor(hash(i, 2) * 110), hash(i, 9) < 0.15 ? '!#ffe8a0' : '!#d8e0ff');
          for (let i = 0; i < 12; i++) { const sx = Math.floor(hash(i, 4) * w), sy = Math.floor(hash(i, 6) * 80); p.R(sx - 1, sy, 3, 1, '!#ffffff'); p.R(sx, sy - 1, 1, 3, '!#ffffff'); }
          p.E(w - 160, 34, 22, 22, '!#f8f4dc');
          p.E(w - 156, 38, 6, 5, '!#d8d4bc');
          p.E(w - 146, 46, 4, 4, '!#d8d4bc');
          p.glow(w - 149, 45, 40, 40, '!#f8f4dc', 0.05);
        } else {
          p.G(0, 0, w, 150, ['#3a2e72', '#5a3a82', '#8a4a88', '#c05a7a', '#e87a5a', '#f8a048', '#ffc860']);
          const sx = w / 2 + 70, sy = 64;
          p.glow(sx, sy + 30, 70, 50, '!#fff0a0', 0.06);
          p.E(sx - 30, sy, 60, 60, '#ffe890');
          p.E(sx - 25, sy + 5, 50, 50, '#fff4c0');
          for (let k = 0; k < 4; k++) p.R(sx - 36, sy + 30 + k * 7, 72, 2 + (k >> 1), '#f8b058');
          const cloud = (x, y, cw, c1, c2) => { p.E(x, y, cw, 8, c1); p.E(x + cw * 0.2, y - 4, cw * 0.5, 8, c1); p.R(x + 4, y + 6, cw - 8, 2, c2); };
          cloud(40, 40, 90, '#d07a9a', '#a85a82');
          cloud(200, 28, 70, '#c86a90', '#9a4a7a');
          cloud(380, 60, 110, '#f09a7a', '#c86a6a');
          cloud(520, 36, 80, '#d07a9a', '#a85a82');
        }
        skyline(p, w, 150, 7, 20, 52, n ? '#141830' : '#5a3a6a', n, n ? 0.25 : 0.0, 18);
      },
    },
    {
      pf: 0.45,
      build(p, w, n) {
        skyline(p, w, 160, 13, 30, 80, n ? '#1c2038' : '#4a3058', n, n ? 0.35 : 0.08, 30);
        // billboard
        const bx = 300;
        if (n) p.glow(bx + 47, 66, 64, 28, '!#ffe0a0', 0.05);
        p.R(bx + 10, 80, 3, 30, '#2a2a3a'); p.R(bx + 80, 80, 3, 30, '#2a2a3a');
        p.B(bx, 52, 94, 32, n ? '!#d8d0b0' : '#f0e8d0');
        p.R(bx + 2, 54, 90, 10, n ? '!#b02020' : '#d02828');
        p.T('INJURED?', bx + 47, 56, '!#ffffff', { align: 'center' });
        p.T('1-800-SUE-THEM', bx + 47, 67, '!#202020', { align: 'center' });
        p.T('NO WIN NO FEE', bx + 47, 75, n ? '!#203a80' : '#2050a0', { align: 'center' });
        if (n) for (const lx of [bx + 20, bx + 74]) { p.R(lx, 86, 3, 2, '!#fff0c0'); }
      },
    },
  ],
  back(p, w, n) {
    const C = w >> 1;
    // rooftop parapet + railing
    p.R(0, 150, w, 26, '#8a8a92');
    p.R(0, 150, w, 2, '#b4b4bc');
    p.R(0, 152, w, 1, '#6a6a72');
    for (let x = 0; x < w; x += 32) p.R(x, 153, 1, 23, '#76767e');
    p.R(0, 128, w, 2, '#c8c8d0');
    p.R(0, 130, w, 1, '#5a5a62');
    for (let x = 6; x < w; x += 24) { p.R(x, 128, 2, 22, '#a8a8b0'); p.R(x + 2, 128, 1, 22, '#6a6a72'); }
    p.R(0, 139, w, 1, '#a8a8b0');
    // stairwell hut
    p.SH(20, 70, 110, 106);
    p.V(20, 70, 110, 106, '#a89a8a');
    p.R(20, 66, 116, 6, OUT); p.R(21, 67, 114, 4, '#6a5e52');
    p.V(56, 104, 34, 72, '#7a6a5a');
    p.R(84, 140, 3, 6, '#d8c870');
    sign(p, 52, 88, 42, 12, '#c02020', '#ffffff', 'ROOF');
    p.R(102, 84, 20, 14, n ? '!#ffe8a0' : '#3a4a5a');
    p.R(111, 84, 2, 14, '#7a6a5a');
    sign(p, 26, 120, 26, 22, '#f8f8f8', '#c02020', ['NO', 'SMOK', 'ING']);
    // antenna with beacon
    p.R(150, 26, 2, 124, '#5a5a62');
    p.R(152, 26, 1, 124, '#3a3a42');
    for (let y = 40; y < 150; y += 12) { p.L(146, y, 156, y + 12, '#5a5a62'); p.L(156, y, 146, y + 12, '#5a5a62'); }
    p.R(147, 22, 8, 4, '#3a3a42');
    // HVAC units
    for (const [hx, hw] of [[176, 54], [676, 60]]) {
      p.SH(hx, 108, hw, 42);
      p.V(hx, 108, hw, 42, '#b8bcc4');
      for (let k = 0; k < hw - 10; k += 4) p.R(hx + 5 + k, 114, 2, 22, '#8a8e96');
      p.E(hx + hw / 2 - 12, 96, 24, 14, OUT);
      p.E(hx + hw / 2 - 11, 97, 22, 12, '#9aa0a8');
      p.E(hx + hw / 2 - 6, 100, 12, 6, '#3a3e46');
    }
    // floodlight poles
    for (const fx of [260, 430]) {
      p.R(fx, 70, 3, 80, '#4a4a52');
      p.B(fx - 8, 62, 19, 9, '#3a3a42');
      p.R(fx - 6, 70, 15, 2, n ? '!#fff8d0' : '#d8d8c8');
    }
    // HELIPAD sign on railing
    sign(p, C - 50, 132, 100, 15, '#2a8a4a', '#ffffff', 'HELIPAD - KEEP CLEAR', { noShadow: true });
    // ---- medevac helicopter (rotor animated per frame)
    const hx = 470, hy = 150;
    p.alpha(0.25, () => p.E(hx - 10, hy + 18, 150, 8, '!#000000'));
    // tail boom
    p.R(hx + 90, hy - 42, 70, 9, OUT);
    p.R(hx + 91, hy - 41, 68, 7, '#e8e8ec');
    p.R(hx + 91, hy - 37, 68, 2, '#d02828');
    p.R(hx + 150, hy - 60, 12, 24, OUT);
    p.R(hx + 151, hy - 59, 10, 22, '#e8e8ec');
    p.R(hx + 151, hy - 52, 10, 4, '#d02828');
    // body
    p.E(hx - 2, hy - 62, 104, 52, OUT);
    p.E(hx - 1, hy - 61, 102, 50, '#f2f2f6');
    p.E(hx + 4, hy - 58, 80, 14, '#ffffff');
    p.R(hx + 2, hy - 30, 98, 6, '#d02828');
    p.R(hx + 2, hy - 30, 98, 1, '#f05050');
    // cockpit glass
    p.E(hx + 2, hy - 56, 36, 26, OUT);
    p.E(hx + 3, hy - 55, 34, 24, n ? '#2a3a5a' : '#6aa0c8');
    p.E(hx + 8, hy - 52, 14, 8, n ? '#4a5a7a' : '#a8d0e8');
    // cross + text
    p.R(hx + 58, hy - 52, 4, 14, '#d02828'); p.R(hx + 53, hy - 47, 14, 4, '#d02828');
    p.T('MEDEVAC', hx + 70, hy - 22, '#2a2a3a', { align: 'center' });
    p.R(hx + 46, hy - 56, 2, 24, '#c8c8d0');
    // skids
    p.R(hx + 10, hy - 8, 2, 6, OUT); p.R(hx + 78, hy - 8, 2, 6, OUT);
    p.R(hx - 2, hy - 2, 96, 3, OUT);
    p.R(hx - 1, hy - 2, 94, 1, '#8a8a92');
    // rotor mast
    p.R(hx + 46, hy - 70, 6, 10, OUT);
    p.R(hx + 47, hy - 69, 4, 9, '#6a6a72');
    // windsock pole
    p.R(652, 60, 2, 90, '#d8d8e0');
    p.R(654, 60, 1, 90, '#8a8a92');
    p.R(649, 146, 8, 4, '#5a5a62');
  },
  crowd: [
    { x: 452, y: 178, s: personSpec('visitor', 121, { top: '#d04020', bot: '#2e3448', hs: 'short' }), th: 0.3, alt: 1 },
    { x: 590, y: 178, s: personSpec('visitor', 122, { top: '#d04020', bot: '#2e3448', hs: 'bun' }), th: 0.5, alt: 0 },
    { x: 626, y: 178, s: personSpec('visitor', 123, { top: '#5a6a3a', bot: '#5a6a3a', hs: 'hat' }), th: 0.6, alt: 3 },
    { x: 700, y: 179, s: personSpec('nurse', 127, { top: '#3098c8', bot: '#3098c8' }), th: 0.2, alt: 1 },
    { x: 42, y: 178, s: personSpec('nurse', 124, { coffee: true }), th: 0.4, alt: 2, fidget: 'wave' },
    { x: 214, y: 178, s: personSpec('doctor', 125), th: 0.25, alt: 1 },
    { x: 296, y: 179, s: personSpec('guard', 126), th: 0.7, alt: 3 },
  ],
  animSky(ctx, o, X) {
    // drifting clouds / blinking plane
    const t = o.t;
    const px = ((t * 0.3) % (o.viewW + 60)) - 30;
    if (o.night) {
      if ((t >> 4) & 1) fr(ctx, px, 30, 2, 1, '#ff4040');
      else fr(ctx, px + 4, 30, 2, 1, '#ffffff');
    } else {
      fr(ctx, px, 30, 6, 1, '#3a2e5a');
      fr(ctx, px + 2, 29, 2, 1, '#3a2e5a');
    }
  },
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // antenna + tail beacons
    if (((t >> 5) & 1) || !o.night) fr(ctx, 148 - bx, 22, 6, 3, (t >> 5) & 1 ? '#ff3030' : '#801818');
    if (o.night && (t >> 5) & 1) drawGlow(ctx, 151 - bx, 23, 12, 8, '#ff3030', 0.15);
    // rotor: two blades seen edge-on, rotating
    const hx = 470 - bx + 49, hy = 150 - 72;
    const a = t * 0.55;
    const c1 = Math.cos(a), c2 = Math.cos(a + Math.PI / 2);
    const L1 = Math.round(Math.abs(c1) * 92) + 4, L2 = Math.round(Math.abs(c2) * 92) + 4;
    fr(ctx, hx - L1, hy, L1 * 2, 2, '#2a2a32');
    fr(ctx, hx - L2, hy + 1, L2 * 2, 1, '#4a4a52');
    ctx.globalAlpha = 0.25;
    fr(ctx, hx - 96, hy, 192, 2, '#3a3a42');
    ctx.globalAlpha = 1;
    fr(ctx, hx - 3, hy - 2, 6, 4, '#3a3a42');
    // tail rotor
    const tr = (t >> 1) & 3;
    fr(ctx, 470 + 156 - bx, 150 - 66 + tr * 3, 2, 12 - tr * 3, '#3a3a42');
    if ((t >> 4) & 1) fr(ctx, 470 + 160 - bx, 150 - 62, 2, 2, '#ff3030');
    // windsock flaps (wind hazard)
    const wx = 654 - bx, wy = 60;
    const flap = Math.round(Math.sin(t * 0.3) * 2);
    for (let i = 0; i < 5; i++) {
      const sh = 7 - i;
      fr(ctx, wx + i * 5, wy + Math.round(flap * i * 0.4) - (sh >> 1) + 4, 5, sh, i & 1 ? '#f8f8f8' : '#ff6a20');
    }
    // floodlight beams at night
    if (o.night) {
      drawGlow(ctx, 261 - bx, 88, 26, 20, '#fff8d0', 0.06);
      drawGlow(ctx, 431 - bx, 88, 26, 20, '#fff8d0', 0.06);
    }
  },
  front(ctx, o) {
    // wind-blown papers/leaves crossing the front edge
    const t = o.t;
    for (let i = 0; i < 4; i++) {
      const sp = 2.2 + i * 0.7;
      const x = o.viewW + 20 - (((t * sp) + i * 173) % (o.viewW + 60));
      const y = 205 + (i % 3) * 3 + Math.round(Math.sin((t + i * 30) * 0.2) * 2);
      const c = o.night ? (i & 1 ? '#8a8aa0' : '#6a7a5a') : i & 1 ? '#f0ece0' : '#c8a040';
      fr(ctx, x, y, 3, 2, c);
      if ((t + i) & 4) fr(ctx, x + 1, y - 1, 2, 1, c);
    }
  },
};

// ===========================================================================
// STAGE 8: PARKING GARAGE
// ===========================================================================
function carRear(p, cx, fy, color, plate, kind = 'sedan') {
  const w = kind === 'smart' ? 26 : kind === 'van' ? 44 : kind === 'sport' ? 46 : 42;
  const x = cx - (w >> 1);
  const bodyH = kind === 'van' ? 34 : kind === 'sport' ? 16 : 20;
  const roofH = kind === 'van' ? 4 : kind === 'sport' ? 10 : kind === 'pickup' ? 12 : 14;
  const yb = fy - 6 - bodyH;
  const cD = shade(color, -0.25), cL = shade(color, 0.25);
  p.alpha(0.3, () => p.R(x - 2, fy - 2, w + 4, 3, '!#000000'));
  // tires
  p.R(x + 3, fy - 7, 7, 7, '#141414'); p.R(x + w - 10, fy - 7, 7, 7, '#141414');
  // cabin / rear window
  for (let j = 0; j < roofH; j++) {
    const ins = Math.round(((roofH - j) / roofH) * (kind === 'sport' ? 9 : 6)) + 3;
    p.R(x + ins - 1, yb - roofH + j, w - ins * 2 + 2, 1, OUT);
  }
  for (let j = 1; j < roofH; j++) {
    const ins = Math.round(((roofH - j) / roofH) * (kind === 'sport' ? 9 : 6)) + 3;
    p.R(x + ins, yb - roofH + j, w - ins * 2, 1, j < 2 ? color : '#2a3440');
    if (j > 2 && j < roofH - 1) p.R(x + ins + 2 + j, yb - roofH + j, 3, 1, '#5a6a7a');
  }
  if (kind === 'pickup') p.R(x + 2, yb - 2, w - 4, 2, cD);
  // body
  p.R(x - 1, yb - 1, w + 2, bodyH + 2, OUT);
  p.R(x, yb, w, bodyH, color);
  p.R(x, yb, w, 2, cL);
  p.R(x + w - 3, yb + 2, 3, bodyH - 2, cD);
  // tail lights
  const ty = yb + 4;
  p.R(x + 2, ty, 8, 5, '#a01818'); p.R(x + 2, ty, 8, 2, '#ff5a4a');
  p.R(x + w - 10, ty, 8, 5, '#a01818'); p.R(x + w - 10, ty, 8, 2, '#ff5a4a');
  // plate + bumper
  if (plate) {
    p.R(x + (w >> 1) - 10, yb + bodyH - 10, 20, 8, OUT);
    p.R(x + (w >> 1) - 9, yb + bodyH - 9, 18, 6, '#f0f0e4');
    p.T(plate, x + (w >> 1), yb + bodyH - 9, '#203070', { align: 'center' });
  }
  p.R(x - 1, fy - 8, w + 2, 3, '#2a2a2e');
  p.R(x, fy - 8, w, 1, '#4a4a50');
  if (kind === 'van') { p.R(x + (w >> 1), yb + 2, 1, bodyH - 12, cD); }
  return { x, w, ty };
}

DEFS.garage = {
  ceil: {
    y: 14,
    shader(wx, wz, a, b, q) {
      const bx = ((wx % 60) + 60) % 60;
      if (bx < 10) return bx < 2 ? '#4a4a48' : '#5e5e5a';
      if (Math.abs(((wz % 70) + 70) % 70 - 35) < 3 && bx > 22 && bx < 48) return q.n ? '!#e8ffe8' : '#e8f0e8';
      return hash(Math.floor(wx / 2), Math.floor(wz)) < 0.1 ? '#6a6a66' : '#74746e';
    },
  },
  floor(wx, wz, a, b, q) {
    // concrete, stall lines (perpendicular to the wall = converging), lane arrows, oil stains
    if (wz > 22 && seam(a, b, 60, 400)) return '#d8d8d0';
    if (Math.abs(wz - 22) < 1.5 && ((wx % 60) + 60) % 60 > 0) return '#b8b8b0';
    if (Math.abs(wz + 14) < 2 && ((wx % 40) + 40) % 40 < 22) return '#c8a830';
    const ox = ((wx - 430) % 60 + 60) % 60 - 30, oz = wz - 48;
    if (ox * ox / 120 + oz * oz / 60 < 1 + hash(Math.floor((wx - 400) / 60), 3) * 1.5) return '#4a4a48';
    const h = hash(Math.floor(wx * 1.2), Math.floor(wz * 1.5));
    let c = '#6c6c68';
    if (h < 0.12) c = '#62625e';
    else if (h > 0.93) c = '#787874';
    if (seam(q.wz0, q.wz1, 90, 10)) c = '#5a5a56';
    if (q.f > 0.7) c = shade(c, -0.12);
    return c;
  },
  far: {
    pf: 0.4,
    build(p, w, n) {
      if (n) {
        p.G(0, 0, w, 130, ['#060a1e', '#0c1230', '#141c40', '#1c2650']);
        for (let i = 0; i < 40; i++) p.P(Math.floor(hash(i, 21) * w), 30 + Math.floor(hash(i, 22) * 30), '!#c8d0ff');
      } else p.G(0, 0, w, 130, ['#78b4e8', '#8cc4ee', '#a4d4f4', '#bce0f6']);
      skyline(p, w, 120, 31, 24, 60, n ? '#1a1e36' : '#8a9ab0', n, n ? 0.3 : 0.05, 26);
      // the hospital across the street
      const hx = 230;
      p.B(hx, 40, 120, 90, n ? '#2a2e48' : '#d8d0c0');
      for (let y = 48; y < 116; y += 10) for (let x = hx + 8; x < hx + 112; x += 12) p.R(x, y, 7, 6, n ? (hash(x, y) < 0.6 ? '!#f8e080' : '#20243a') : '#7aa8c8');
      p.B(hx + 50, 20, 20, 20, '#ffffff');
      p.R(hx + 57, 23, 6, 14, n ? '!#ff3030' : '#d82020'); p.R(hx + 53, 27, 14, 6, n ? '!#ff3030' : '#d82020');
      if (n) p.glow(hx + 60, 30, 26, 20, '!#ff3030', 0.06);
      p.R(0, 112, w, 18, n ? '#22222a' : '#5a5a60');
      for (let x = 0; x < w; x += 30) p.R(x, 120, 14, 1, '#c8c040');
    },
  },
  back(p, w, n) {
    const C = w >> 1;
    const conc = '#9a9a94', concD = '#7e7e78', concL = '#b4b4ae';
    // openings to the outside (far layer shows through)
    p.clr(0, 38, w, 76);
    // upper slab + beam
    p.R(0, 14, w, 24, conc);
    p.R(0, 14, w, 3, concD);
    p.R(0, 34, w, 4, concD);
    p.R(0, 37, w, 1, OUT);
    p.D(0, 18, w, 16, conc, '#a2a29c', 1);
    // sprinkler pipe
    p.R(0, 40, w, 3, '#b83030'); p.R(0, 40, w, 1, '#e85a5a');
    for (let x = 30; x < w; x += 96) { p.R(x, 43, 2, 3, '#b83030'); p.R(x - 1, 46, 4, 1, '#c8c8c8'); }
    // knee wall + cable barrier
    p.R(0, 114, w, 62, conc);
    p.R(0, 114, w, 2, concL);
    p.R(0, 116, w, 1, concD);
    p.D(0, 117, w, 59, conc, '#a0a09a', 1);
    for (let k = 0; k < 4; k++) { p.R(0, 60 + k * 14, w, 1, '#5a5a5e'); p.R(0, 61 + k * 14, w, 1, '#a8a8ac'); }
    // columns at stall lines
    for (const cx of [82, 226, 514, 658]) {
      p.R(cx - 13, 38, 26, 138, OUT);
      p.R(cx - 12, 38, 24, 138, conc);
      p.R(cx - 12, 38, 3, 138, concL);
      p.R(cx + 8, 38, 4, 138, concD);
      p.HZ(cx - 12, 150, 24, 26);
      p.E(cx - 10, 70, 20, 20, '#f0f0e8');
      p.E(cx - 8, 72, 16, 16, '#2a5aa0');
      p.T('P3', cx, 77, '#ffffff', { align: 'center' });
    }
    // fluorescent fixtures
    for (let x = 40; x < w; x += 120) {
      p.R(x + 4, 43, 1, 4, '#5a5a5a'); p.R(x + 36, 43, 1, 4, '#5a5a5a');
      p.R(x, 47, 42, 4, OUT);
      p.R(x + 1, 48, 40, 2, n ? '!#f0fff0' : '#f4fff4');
    }
    // signs
    p.R(C - 1, 38, 2, 6, '#3a3a3a');
    sign(p, C - 46, 44, 92, 18, '#2a5aa0', '#ffffff', 'LEVEL P3', { font: 'big' });
    p.R(C - 30, 60, 1, 3, '#3a3a3a');
    sign(p, 240, 118, 72, 22, '#f0d030', '#202020', ['PARKING', '$40/HR', 'NO CHANGE']);
    sign(p, 102, 120, 54, 16, '#f8f8f8', '#c02020', ['LOST TICKET:', '$200']);
    sign(p, 528, 118, 58, 16, '#f8f8f8', '#202020', ['RESERVED', 'CEO ONLY']);
    sign(p, 404, 120, 54, 16, '#f8f8f8', '#202020', ['COMPACT', 'ONLY']);
    sign(p, 600, 52, 50, 12, '#1a7a3a', '#ffffff', 'EXIT  }');
    sign(p, 668, 118, 66, 22, '#f8f8f8', '#2a5aa0', ['NURSES PARK', 'IN OVERFLOW', 'LOT (5 MI)']);
    // parked cars (rear view), centred in stalls (stall = 48px at the wall line)
    carRear(p, 154, 176, '#c83838', 'MD 4LYF');
    carRear(p, 202, 176, '#3a6ac8', 'RN 2TRD', 'van');
    carRear(p, 298, 176, '#e8c838', 'TAXI');
    carRear(p, 394, 176, '#4a9a5a', 'ICU BAE');
    carRear(p, 442, 176, '#e8e8e8', 'SMOL', 'smart');
    carRear(p, 538, 176, '#e8b830', 'CEO $$$', 'sport');
    carRear(p, 586, 176, '#8a8a96', 'NO PTO');
    carRear(p, 682, 176, '#a83030', 'ER DOC', 'pickup');
    // oil puddle in empty stall + shopping cart
    p.B(334, 160, 22, 12, '#9aa0a8');
    p.R(336, 162, 18, 1, '#c8ccd0'); p.R(336, 166, 18, 1, '#c8ccd0');
    for (let k = 0; k < 4; k++) p.R(337 + k * 5, 161, 1, 10, '#c8ccd0');
    p.R(334, 172, 3, 3, OUT); p.R(352, 172, 3, 3, OUT);
    // ticket booth + barrier arm (left)
    p.SH(4, 92, 56, 84);
    p.R(4, 88, 58, 6, OUT); p.R(5, 89, 56, 4, '#e8c030');
    p.V(6, 94, 54, 82, '#d8d4c8');
    p.R(10, 98, 46, 34, '#3a4a5a');
    stamp(p, personSpec('visitor', 131, { top: '#c83030', bot: '#2e3448', hs: 'short', glasses: true }), 'idle', 30, 148);
    p.R(6, 128, 54, 48, '#d8d4c8');
    p.R(6, 128, 54, 2, '#f0ece0');
    p.alpha(0.25, () => { for (let k = 0; k < 16; k++) p.R(14 + k, 126 - k * 2, 3, 2, '!#ffffff'); });
    p.T('PAY HERE', 33, 136, '#c02020', { align: 'center' });
    p.T('NO REFUNDS', 33, 144, '#202020', { align: 'center' });
    p.R(60, 150, 8, 26, '#3a3a40');
    p.B(58, 146, 12, 6, '#e8c030');
    for (let k = 0; k < 7; k++) p.R(70 + k * 8, 148, 8, 3, k & 1 ? '#f0f0f0' : '#d02020');
    p.R(70, 147, 56, 1, OUT); p.R(70, 151, 56, 1, OUT);
    p.alpha(0.2, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
    if (n) {
      // sodium/fluorescent pools on the knee wall
      for (let x = 61; x < w; x += 120) p.glow(x, 50, 40, 26, '!#e8ffe0', 0.06);
    }
  },
  crowd: [
    { x: 122, y: 178, s: personSpec('guard', 132), th: 0.5, alt: 3 },
    { x: 254, y: 179, s: personSpec('doctor', 133, { coffee: true }), th: 0.3, alt: 1 },
    { x: 360, y: 178, s: personSpec('visitor', 134, { top: '#c83030', bot: '#2e3448', hs: 'bald', hair: '#2c1e16' }), th: 0.2, alt: 0 },
    { x: 476, y: 178, s: personSpec('nurse', 135, { top: '#8c3450', bot: '#8c3450' }), th: 0.4, alt: 2, fidget: 'wave' },
    { x: 620, y: 178, s: personSpec('visitor', 136, { hs: 'long' }), th: 0.15, alt: 1 },
    { x: 640, y: 179, s: personSpec('kid', 137), th: 0.05, alt: 0 },
    { x: 712, y: 178, s: personSpec('janitor', 138), th: 0.6, alt: 3 },
  ],
  animFar(ctx, o, X) {
    // traffic passing on the street outside
    const t = o.t;
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1;
      const span = o.viewW + 120;
      const x = dir > 0 ? ((t * 1.5 + i * 200) % span) - 60 : span - 60 - ((t * 1.2 + 90) % span);
      const y = 106 + i * 4;
      fr(ctx, x, y, 20, 6, i ? '#3a6ab0' : '#e0e0e0');
      fr(ctx, x + 4, y - 3, 11, 3, i ? '#2a4a80' : '#a8b0b8');
      fr(ctx, x + 2, y + 5, 4, 2, '#101010'); fr(ctx, x + 14, y + 5, 4, 2, '#101010');
      if (o.night) fr(ctx, dir > 0 ? x + 19 : x, y + 1, 1, 2, '#fff0a0');
    }
  },
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // flickering fluorescent tube
    const k = 2;
    const fx = 40 + k * 120 - bx;
    const fl = hash(t >> 2, 9) < 0.35 || ((t >> 6) % 7 === 0 && (t & 4));
    if (fl) fr(ctx, fx + 1, 48, 40, 2, '#3a3e3a');
    // car alarm: hazard lights blinking on the CEO's car
    if ((t >> 4) & 1) {
      fr(ctx, 538 - 23 + 2 - bx, 176 - 22 + 4, 8, 2, '#ffb030');
      fr(ctx, 538 + 23 - 10 - bx, 176 - 22 + 4, 8, 2, '#ffb030');
      if (o.night) drawGlow(ctx, 538 - bx, 156, 34, 14, '#ffa020', 0.08);
    }
    // exit sign glow
    if (o.night) drawGlow(ctx, 625 - bx, 58, 30, 14, '#30ff70', 0.06);
  },
};

// ===========================================================================
// STAGE 9: ADMIN OFFICE (the boss lair)
// ===========================================================================
function woodWall(p, x, y, w, h, base = '#6a3e22') {
  p.R(x, y, w, h, base);
  for (let px = x; px < x + w; px += 10) {
    p.R(px, y, 1, h, shade(base, -0.3));
    p.R(px + 1, y, 1, h, shade(base, 0.12));
    for (let k = 0; k < h; k += 7) {
      const gx = px + 3 + Math.floor(hash(px, k) * 5);
      p.R(gx, y + k + Math.floor(hash(k, px) * 4), 1, 3 + Math.floor(hash(px * 3, k) * 5), shade(base, -0.14));
    }
  }
}

DEFS.admin = {
  refl: 0,
  ceil: {
    y: 16,
    shader(wx, wz, a, b, q) {
      // coffered ceiling with recessed downlights
      const u = ((wx % 50) + 50) % 50, v = ((wz % 40) + 40) % 40;
      if (u < 4 || v < 3) return u < 2 || v < 1 ? '#c8a050' : '#7a5230';
      if (Math.abs(u - 27) < 3 && Math.abs(v - 21) < 3) return q.n ? '!#fff0c8' : '#fff8e0';
      return '#a87a50';
    },
  },
  floor(wx, wz, a, b, q) {
    // burgundy executive carpet with gold lattice and border
    if (wz > 52 && wz < 60) return Math.abs(wz - 56) < 1.2 ? '#c8a040' : '#5a1820';
    const u = ((wx % 32) + 32) % 32 - 16, v = ((wz % 32) + 32) % 32 - 16;
    const d = Math.abs(u) + Math.abs(v);
    let c = '#7a2430';
    if (d > 14.5 && d < 16.5) c = '#a8802a';
    else if (d < 3) c = '#963040';
    if (hash(Math.floor(wx * 2), Math.floor(wz * 2)) < 0.12) c = shade(c, -0.1);
    if (q.f > 0.7) c = shade(c, -0.14);
    return c;
  },
  far: {
    pf: 0.3,
    build(p, w, n) {
      if (n) {
        p.G(0, 0, w, 140, ['#060a20', '#0a1230', '#121a3e', '#1a244c']);
        for (let i = 0; i < 50; i++) p.P(Math.floor(hash(i, 31) * w), Math.floor(hash(i, 32) * 50), '!#e0e8ff');
        p.E(Math.floor(w * 0.62), 30, 12, 12, '!#f4f0d8');
      } else {
        p.G(0, 0, w, 140, ['#4a90e0', '#62a4ea', '#7cb8f0', '#98ccf4']);
        p.E(80, 40, 50, 10, '#ffffff'); p.E(96, 34, 26, 10, '#ffffff');
        p.E(330, 54, 60, 10, '#f4f8ff'); p.E(352, 48, 30, 10, '#f4f8ff');
      }
      skyline(p, w, 140, 51, 30, 70, n ? '#161a32' : '#5a6a88', n, n ? 0.35 : 0.06, 22);
      skyline(p, w, 140, 57, 10, 40, n ? '#20243e' : '#7686a2', n, n ? 0.4 : 0.06, 30);
    },
  },
  back(p, w, n) {
    const C = w >> 1;
    woodWall(p, 0, 14, w, 162);
    // crown molding + stock ticker
    p.R(0, 14, w, 6, '#4a2a14');
    p.R(0, 18, w, 2, '#c8a040');
    p.R(0, 20, w, 1, '#2a1608');
    // raised-panel wainscot
    p.R(0, 116, w, 60, '#4e2c16');
    p.R(0, 116, w, 3, '#c8a040');
    p.R(0, 119, w, 1, '#2a1608');
    for (let x = 6; x < w - 30; x += 46) { p.V(x, 126, 40, 38, '#5e3a1e', '#2a1608', 0.2); p.R(x + 4, 130, 32, 30, '#563418'); }
    baseboard(p, 0, w, '#2a1608');
    roomLight(p, w, n, 20, [90, 220, 520, 650], '#ffe0a0');
    // ---- big window
    const wx = C - 120, wy = 28, ww = 240, wh = 84;
    p.clr(wx, wy, ww, wh);
    p.alpha(n ? 0.06 : 0.1, () => p.R(wx, wy, ww, wh, '!#e0f0ff'));
    p.alpha(0.18, () => { for (let i = 0; i < 3; i++) for (let k = 0; k < 40; k++) p.R(wx + 16 + i * 80 + k, wy + wh - 6 - k, 8, 1, '!#ffffff'); });
    p.R(wx - 5, wy - 5, ww + 10, 5, OUT); p.R(wx - 4, wy - 4, ww + 8, 3, '#8a5a30');
    p.R(wx - 5, wy, 5, wh, OUT); p.R(wx + ww, wy, 5, wh, OUT);
    p.R(wx - 4, wy, 3, wh, '#8a5a30'); p.R(wx + ww + 1, wy, 3, wh, '#8a5a30');
    for (let i = 1; i < 3; i++) { p.R(wx + i * 80 - 2, wy, 4, wh, OUT); p.R(wx + i * 80 - 1, wy, 2, wh, '#8a5a30'); }
    p.R(wx, wy + 40, ww, 2, '#8a5a30');
    p.R(wx - 8, wy + wh, ww + 16, 6, OUT); p.R(wx - 7, wy + wh + 1, ww + 14, 4, '#a87040'); p.R(wx - 7, wy + wh + 1, ww + 14, 1, '#d8a060');
    // velvet drapes with gold tie-backs
    for (const [dx, dir] of [[wx - 30, 1], [wx + ww + 4, -1]]) {
      for (let i = 0; i < 26; i++) {
        const sh = [-0.3, -0.1, 0.1, 0.2, 0.1, -0.1][i % 6];
        const pinch = Math.abs(i - 13) < 13 ? 0 : 0;
        p.R(dx + i, wy - 8 + pinch, 1, wh + 30, shade('#8a1a2a', sh));
      }
      p.R(dx - 1, wy - 8, 1, wh + 30, OUT); p.R(dx + 26, wy - 8, 1, wh + 30, OUT);
      p.R(dx, wy + 50, 26, 4, '#d8b040'); p.R(dx, wy + 50, 26, 1, '#fff080');
    }
    p.R(wx - 34, wy - 10, ww + 68, 4, '#c8a040');
    p.R(wx - 34, wy - 10, ww + 68, 1, '#fff080');
    // ---- left: SYNERGY poster, filing cabinets, policy shelf
    const posterF = (x, y, pw, ph, title, sub, art) => {
      p.SH(x, y, pw, ph, 3);
      p.R(x, y, pw, ph, '#c8a040');
      p.R(x + 1, y + 1, pw - 2, ph - 2, '#8a6020');
      p.R(x + 3, y + 3, pw - 6, ph - 6, '#101018');
      art(x + 4, y + 4, pw - 8, ph - 22);
      p.T(title, x + pw / 2, y + ph - 16, '#f0e0b0', { font: 'big', align: 'center' });
      p.T(sub, x + pw / 2, y + ph - 8, '#a89870', { align: 'center' });
    };
    posterF(28, 30, 76, 74, 'SYNERGY', 'IT MEANS NOTHING', (x, y, aw, ah) => {
      p.G(x, y, aw, ah, ['#e87a3a', '#f0a050', '#f8c870']);
      for (let k = 0; k < aw; k++) { const hh = Math.round(Math.abs(((k * 7) % 40) - 20) * 0.9 + 6); p.R(x + k, y + ah - hh, 1, hh, '#3a2a40'); }
      p.R(x + 30, y + 10, 10, 2, '#202020'); p.R(x + 26, y + 9, 4, 2, '#202020'); p.R(x + 40, y + 9, 4, 2, '#202020');
    });
    posterF(616, 30, 84, 74, 'DO MORE', 'WITH LESS', (x, y, aw, ah) => {
      p.G(x, y, aw, ah, ['#3a6ab0', '#4a80c0', '#5a98d0']);
      p.R(x, y + ah - 10, aw, 10, '#2a5a9a');
      p.R(x + 30, y + ah - 14, 16, 4, '#8a5a30');
      p.R(x + 36, y + ah - 24, 1, 10, '#f0f0f0');
      p.T('1 OAR', x + aw / 2, y + 6, '#ffffff', { align: 'center' });
    });
    // filing cabinets
    for (let k = 0; k < 2; k++) {
      const fx = 120 + k * 32;
      p.SH(fx, 92, 30, 82);
      p.V(fx, 92, 30, 82, '#8a8e96');
      for (let d = 0; d < 4; d++) {
        p.V(fx + 2, 95 + d * 19, 26, 17, '#9aa0a8', '#4a4e56', 0.15);
        p.R(fx + 10, 103 + d * 19, 10, 2, '#d8dce0');
        p.R(fx + 9, 98 + d * 19, 12, 4, '#f0f0e8');
      }
      p.T(k ? 'N-Z' : 'A-M', fx + 15, 98, '#3a3a3a', { align: 'center' });
    }
    p.T('DENIALS', 151, 84, '#f0e0b0', { align: 'center' });
    // gold BUDGET trophy on a pedestal
    const tx = 210;
    p.SH(tx - 12, 122, 26, 54);
    p.V(tx - 12, 130, 26, 46, '#2a1608');
    p.R(tx - 10, 138, 22, 8, '#c8a040');
    p.T('BUDGET', tx + 1, 140, '#3a2008', { align: 'center' });
    p.R(tx - 8, 124, 18, 6, OUT); p.R(tx - 7, 125, 16, 4, '#c89a30');
    p.R(tx - 2, 112, 6, 12, OUT); p.R(tx - 1, 112, 4, 12, '#e8c040');
    p.E(tx - 11, 88, 24, 26, OUT);
    p.E(tx - 10, 89, 22, 24, '#e8c040');
    p.E(tx - 8, 90, 10, 10, '#fff4a0');
    p.R(tx - 16, 92, 6, 2, '#e8c040'); p.R(tx - 16, 92, 2, 10, '#e8c040'); p.R(tx - 16, 100, 6, 2, '#e8c040');
    p.R(tx + 12, 92, 6, 2, '#e8c040'); p.R(tx + 16, 92, 2, 10, '#e8c040'); p.R(tx + 12, 100, 6, 2, '#e8c040');
    p.R(tx - 13, 86, 28, 3, '#c89a30');
    p.T('$', tx + 1, 96, '#a87010', { font: 'big', align: 'center' });
    // ---- right: profits chart on an easel + CEO portrait
    const ex = 520;
    p.L(ex + 6, 176, ex + 20, 78, '#5a3a1e', 2); p.L(ex + 70, 176, ex + 56, 78, '#5a3a1e', 2); p.L(ex + 38, 176, ex + 38, 90, '#4a2a14', 2);
    p.SH(ex, 74, 76, 64);
    p.B(ex, 74, 76, 64, '#f8f8f4', '#3a3a3a');
    p.T('PROFITS', ex + 38, 77, '#1a6a2a', { align: 'center' });
    p.R(ex + 6, 84, 1, 44, '#3a3a3a'); p.R(ex + 6, 128, 64, 1, '#3a3a3a');
    p.T('MORALE', ex + 38, 131, '#c02020', { align: 'center' });
    p.L(ex + 8, 98, ex + 68, 126, '#c02020');
    p.R(ex - 2, 138, 80, 3, '#5a3a1e');
    // portrait
    p.SH(660, 112, 52, 50, 3);
    p.R(660, 112, 52, 50, '#c8a040'); p.R(662, 114, 48, 46, '#8a6020');
    p.R(664, 116, 44, 42, '#3a2a3a');
    p.E(676, 122, 20, 22, '#e8b48c'); p.R(676, 120, 20, 6, '#8e8e8e');
    p.R(680, 130, 3, 2, '#202020'); p.R(689, 130, 3, 2, '#202020');
    p.R(682, 137, 8, 2, '#a04040');
    p.R(670, 144, 32, 14, '#2c3040'); p.R(684, 144, 4, 10, '#c03038');
    p.R(694, 135, 8, 2, '#8a5a30'); p.P(702, 135, '!#ff6020');
    p.T('OUR FOUNDER', 686, 164, '#f0e0b0', { align: 'center' });
    p.alpha(0.2, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const C = w >> 1;
    // the giant desk
    const dx = C - 96, dw = 192, dy = 130;
    p.alpha(0.3, () => p.R(dx + 4, dy + 4, dw, 46, '!#000000'));
    p.R(dx - 1, dy - 1, dw + 2, 48, OUT);
    p.R(dx, dy, dw, 6, '#8a4a22');
    p.R(dx, dy, dw, 1, '#c8783a');
    p.R(dx, dy + 5, dw, 1, '#4a2410');
    p.R(dx + 4, dy + 6, dw - 8, 40, '#6a3418');
    for (let k = 0; k < 3; k++) p.V(dx + 10 + k * 60, dy + 10, 52, 32, '#7a3e1e', '#3a1a0a', 0.2);
    p.R(dx, dy + 6, 4, 40, '#5a2a12'); p.R(dx + dw - 4, dy + 6, 4, 40, '#5a2a12');
    p.R(dx + 4, dy + 44, dw - 8, 2, '#c8a040');
    // nameplate
    p.B(C - 24, dy + 18, 48, 12, '#e8c040', '#5a3a08');
    p.T('C.E.O.', C, dy + 21, '#3a2008', { align: 'center' });
    // desk props: computer w/ stock chart, money bag, DENIED stamp pile, banker's lamp
    p.V(C + 40, dy - 22, 30, 20, '#202430');
    p.R(C + 42, dy - 20, 26, 14, n ? '!#081a10' : '#0a2014');
    p.L(C + 44, dy - 9, C + 64, dy - 18, '!#40ff70');
    p.R(C + 52, dy - 2, 6, 2, '#202430');
    p.E(C - 80, dy - 16, 18, 17, OUT); p.E(C - 79, dy - 15, 16, 15, '#c8a868');
    p.R(C - 75, dy - 18, 8, 4, '#a88848');
    p.T('$', C - 71, dy - 11, '#3a6a20', { font: 'big', align: 'center' });
    for (let k = 0; k < 4; k++) p.R(C - 40, dy - 4 - k * 3, 26, 3, k & 1 ? '#f0f0e8' : '#e0e0d8');
    p.R(C - 40, dy - 16, 26, 7, '#c02020'); p.T('DENIED', C - 27, dy - 15, '#ffffff', { align: 'center' });
    p.R(C + 8, dy - 18, 2, 18, '#c8a040');
    p.B(C - 2, dy - 22, 22, 7, '#2a7a4a');
    p.R(C - 1, dy - 21, 20, 1, '#5ab07a');
    if (n) p.glow(C + 9, dy - 6, 30, 12, '!#fff0b0', 0.1);
    p.R(C + 4, dy - 2, 12, 2, '#c8a040');
  },
  crowd: [
    { x: 384, y: 135, s: personSpec('suit', 141, { hs: 'bald', hair: '#8e8e8e', H: 24, beard: true }), th: 0.1, alt: 1, behind: true },
    { x: 250, y: 178, s: personSpec('suit', 142, { glasses: true }), th: 0.1, alt: 3, fidget: 'clap' },
    { x: 270, y: 178, s: personSpec('suit', 143, { hs: 'long' }), th: 0.2, alt: 3, fidget: 'clap' },
    { x: 490, y: 178, s: personSpec('suit', 144, { clip: true }), th: 0.3, alt: 3 },
    { x: 470, y: 179, s: personSpec('visitor', 145, { coffee: true, top: '#f0f0f0', hs: 'bun' }), th: 0.5, alt: 2 },
    { x: 610, y: 178, s: personSpec('nurse', 146, { top: '#4070b8', bot: '#4070b8' }), th: 0.8, alt: 0 },
    { x: 94, y: 178, s: personSpec('suit', 147, { H: 23 }), th: 0.15, alt: 3, fidget: 'clap' },
    { x: 712, y: 178, s: personSpec('guard', 148), th: 0.6, alt: 0 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // stock ticker in the crown molding area
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 21, o.viewW, 7);
    ctx.clip();
    fr(ctx, 0, 21, o.viewW, 7, '#120a06');
    const msg = 'HOSPCORP ^ 9000%   CEO BONUS ^ 400%   NURSE STAFFING | 30%   COFFEE BUDGET | 100%   PATIENT SATISFACTION: N/A   ';
    const mw = msg.length * 4;
    const sx = -((t >> 1) % mw);
    for (let k = 0; k < 3; k++) drawText(ctx, msg, sx + k * mw, 22, { font: 'small', color: '#ffb030' });
    ctx.restore();
    // profits line keeps going up
    const ex = 520 - bx;
    const prog = (t % 240) / 240;
    const pts = [[8, 124], [20, 118], [30, 120], [42, 106], [52, 108], [66, 86]];
    let lx = pts[0][0], ly = pts[0][1];
    const maxX = 8 + prog * 60;
    for (let i = 1; i < pts.length; i++) {
      const [nx, ny] = pts[i];
      const steps = nx - lx;
      for (let s = 0; s < steps; s++) {
        const xx = lx + s;
        if (xx > maxX) break;
        fr(ctx, ex + xx, Math.round(ly + ((ny - ly) * s) / steps), 1, 2, '#1aa03a');
      }
      lx = nx; ly = ny;
    }
    if (prog > 0.95 && ((t >> 2) & 1)) drawText(ctx, '^', ex + 66, 80, { font: 'small', color: '#1aa03a' });
  },
  animOver(ctx, o, X) {
    // CEO's monitor flicker
    if ((o.t >> 3) & 1) fr(ctx, 370 + 64 - X.back, 130 - 18, 2, 1, '#40ff70');
  },
};

// ===========================================================================
// STAGE 10: BREAK ROOM
// ===========================================================================
function note(p, x, y, w, h, c, lines, fg = '#202020') {
  p.alpha(0.3, () => p.R(x + 1, y + 1, w, h, '!#000000'));
  p.R(x, y, w, h, c);
  p.R(x, y, w, 1, shade(c, -0.15));
  let ty = y + 2;
  for (const l of lines) { p.T(l, x + Math.round(w / 2), ty, fg, { align: 'center' }); ty += 6; }
  p.P(x + Math.round(w / 2), y, '#d03030');
}

DEFS.breakroom = {
  refl: 0.08,
  ceil: { y: 14, shader: tileCeil('#f8fff0', '#d8d4c0', '#9a9682', '#c8c4ae') },
  floor(wx, wz, a, b, q) {
    // retro checkerboard linoleum
    const T = 28;
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    let c = odd ? '#9a4a42' : '#c8bc9e';
    const h = hash(Math.floor(wx * 1.4), Math.floor(wz * 1.6));
    if (h < 0.08) c = shade(c, -0.1);
    if (h > 0.97) c = '#5a4a3a';
    if (q.f > 0.7) c = shade(c, -0.12);
    return shade(c, -0.12);
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 100, ['#f0e6b0', '#ece0a8', '#e6d8a0', '#dfd098']);
    roomLight(p, w, n, 16, [80, 220, 370, 520, 660], '#f8ffe0');
    p.R(0, 14, w, 2, '#8a8460');
    p.tiles(0, 112, w, 64, '#9ccab0', 10, 8, '#7aa890');
    p.R(0, 110, w, 3, '#5a8a70');
    p.R(0, 110, w, 1, '#c8f0d8');
    baseboard(p, 0, w, '#3a4a40');
    // HAPPY BIRTHDAY bunting (sagging)
    const flags = ['#e85050', '#f0c040', '#50a0e0', '#60c060', '#c060c0'];
    const txt = 'HAPPY BIRTHDAY';
    for (let i = 0; i < txt.length; i++) {
      const fx = C - 98 + i * 14, sag = Math.round(Math.sin((i / (txt.length - 1)) * Math.PI) * 10);
      p.R(fx, 26 + sag, 14, 1, '#6a5a40');
      if (txt[i] === ' ') continue;
      const fy = 27 + sag;
      for (let j = 0; j < 10; j++) p.R(fx + 1 + (j >> 1), fy + j, 12 - j, 1, flags[i % 5]);
      p.T(txt[i], fx + 7, fy + 1, '#ffffff', { align: 'center' });
    }
    // ---- fridge covered in notes
    const fx = 30;
    p.SH(fx, 52, 56, 124);
    p.R(fx - 1, 51, 58, 125, OUT);
    p.R(fx, 52, 56, 124, '#e8e2c8');
    p.R(fx, 52, 3, 124, '#fffaf0');
    p.R(fx + 50, 52, 6, 124, '#c8c0a4');
    p.R(fx, 96, 56, 2, '#8a846c');
    p.R(fx + 46, 66, 3, 22, '#a8a090'); p.R(fx + 46, 108, 3, 30, '#a8a090');
    note(p, fx + 4, 56, 40, 14, '#fff480', ['WHO ATE', 'MY YOGURT']);
    note(p, fx + 6, 74, 28, 14, '#ffb0c8', ['LABEL', 'FOOD!!']);
    note(p, fx + 6, 102, 38, 20, '#a0e0ff', ['THIS', 'MEANS YOU', 'DAVE']);
    note(p, fx + 18, 126, 26, 14, '#ffffff', ['MILK', '2019']);
    note(p, fx + 4, 144, 34, 14, '#c0f0a0', ['NOT', 'YOURS']);
    for (let k = 0; k < 4; k++) p.E(fx + 38 + (k & 1) * 4, 76 + k * 16, 4, 4, ['#e04040', '#4060e0', '#40a040', '#e0a020'][k]);
    // ---- counter, cabinets, microwave, coffee, sink
    const cx0 = 98, cw = 214;
    p.SH(cx0, 40, cw, 40);
    for (let k = 0; k < 4; k++) { p.V(cx0 + k * 54, 40, 52, 40, '#a8743e'); p.R(cx0 + k * 54 + 22, 70, 8, 2, '#e0d0a0'); }
    p.R(cx0 - 2, 80, cw + 4, 2, '#5a3a1a');
    note(p, cx0 + 60, 48, 46, 20, '#ffffff', ['YOUR MOM', 'DOESNT WORK', 'HERE'], '#c02020');
    p.R(cx0 - 1, 121, cw + 2, 55, OUT);
    p.R(cx0, 122, cw, 4, '#d8d0b8'); p.R(cx0, 122, cw, 1, '#fffaf0');
    p.R(cx0, 126, cw, 50, '#9a6a38');
    for (let k = 0; k < 4; k++) { p.V(cx0 + 2 + k * 53, 130, 51, 42, '#a8743e', '#5a3a1a', 0.2); p.R(cx0 + 24 + k * 53, 134, 8, 2, '#e0d0a0'); }
    // microwave
    p.SH(cx0 + 6, 96, 44, 26);
    p.V(cx0 + 6, 96, 44, 26, '#e8e8e4');
    p.R(cx0 + 9, 99, 26, 20, n ? '#1a1a1a' : '#2a2a2a');
    p.R(cx0 + 38, 99, 10, 6, '#0a1a0a');
    for (let k = 0; k < 6; k++) p.R(cx0 + 38 + (k % 3) * 3, 108 + Math.floor(k / 3) * 3, 2, 2, '#b8b8b4');
    note(p, cx0 + 8, 84, 30, 10, '#ffd0d0', ['NO FISH'], '#c02020');
    // coffee maker with empty pot
    const cm = cx0 + 62;
    p.SH(cm, 92, 26, 30);
    p.V(cm, 92, 26, 30, '#2a2a30');
    p.R(cm + 4, 100, 18, 3, '#4a4a50');
    p.R(cm + 5, 106, 16, 14, '#c8e0e8'); p.R(cm + 5, 106, 16, 2, '#2a2a30');
    p.R(cm + 6, 118, 14, 2, '#5a3a1a');
    p.R(cm + 19, 95, 2, 2, '!#ff3030');
    note(p, cm - 2, 84, 30, 8, '#fff480', ['EMPTY'], '#c02020');
    // mugs
    p.B(cm + 32, 112, 9, 10, '#e05050'); p.R(cm + 41, 114, 2, 5, '#e05050');
    p.B(cm + 44, 114, 8, 8, '#5080e0');
    // sink with dishes
    const sk = cx0 + 150;
    p.R(sk, 118, 50, 4, '#a8b0b8');
    p.R(sk + 22, 102, 3, 16, '#c8d0d8'); p.R(sk + 22, 102, 10, 3, '#c8d0d8');
    for (let k = 0; k < 6; k++) p.E(sk + 4 + k * 3, 106 - k * 2, 16, 5, k & 1 ? '#f0f0f0' : '#d8e8f0');
    p.R(sk + 34, 108, 8, 10, '#e8c040');
    // ---- bulletin board
    const bb = C - 52;
    p.SH(bb, 44, 104, 62);
    p.B(bb, 44, 104, 62, '#c89a5a', '#5a3a1a');
    p.D(bb + 1, 45, 102, 60, '#c89a5a', '#b88a4a', 1);
    note(p, bb + 4, 48, 46, 20, '#ffffff', ['PIZZA PARTY', '= YOUR', 'RAISE'], '#204080');
    note(p, bb + 54, 50, 46, 14, '#fff480', ['LOST:', 'WILL TO LIVE']);
    note(p, bb + 6, 74, 40, 20, '#ffb0c8', ['UNION', 'MEETING', '(SHH)']);
    note(p, bb + 52, 70, 48, 26, '#a0e0ff', ['MANDATORY', 'FUN DAY', 'SAT 6AM', 'UNPAID']);
    // ---- worn couch with napping resident
    const cu = C - 60;
    p.R(cu - 1, 133, 122, 43, OUT);
    p.R(cu, 134, 120, 22, '#8a6a4a');
    p.R(cu, 134, 120, 2, '#a8886a');
    for (let k = 0; k < 3; k++) p.V(cu + 8 + k * 35, 138, 34, 18, '#7a5a3a', '#4a3020', 0.15);
    p.R(cu, 154, 120, 14, '#7a5a3a');
    p.R(cu, 154, 120, 2, '#9a7a5a');
    p.R(cu - 4, 140, 12, 30, '#6a4a2a'); p.R(cu + 112, 140, 12, 30, '#6a4a2a');
    p.R(cu - 4, 140, 12, 2, '#8a6a4a'); p.R(cu + 112, 140, 12, 2, '#8a6a4a');
    p.R(cu + 4, 168, 4, 8, '#3a2a1a'); p.R(cu + 112, 168, 4, 8, '#3a2a1a');
    p.R(cu + 50, 148, 3, 6, '#d8c8a0'); p.R(cu + 72, 160, 6, 3, '#d8c8a0');
    // napping resident lying on the couch
    p.R(cu + 14, 146, 64, 9, OUT);
    p.R(cu + 15, 147, 38, 7, '#48a8a0');
    p.R(cu + 53, 147, 20, 7, '#48a8a0');
    p.R(cu + 73, 148, 4, 5, '#e8e8e8');
    p.R(cu + 6, 145, 10, 9, OUT); p.R(cu + 7, 146, 8, 7, '#c88a5a'); p.R(cu + 7, 146, 8, 3, '#2c1e16');
    // ---- table with sad birthday cake
    const tb = 470;
    p.R(tb - 1, 141, 72, 6, OUT); p.R(tb, 142, 70, 4, '#d8d0c0'); p.R(tb, 142, 70, 1, '#ffffff');
    p.R(tb + 6, 146, 3, 30, '#6a6a70'); p.R(tb + 61, 146, 3, 30, '#6a6a70');
    p.B(tb + 22, 130, 26, 12, '#f8f0e8');
    p.R(tb + 23, 131, 24, 3, '#f0a0c0');
    p.R(tb + 26, 135, 2, 2, '#60b0e0'); p.R(tb + 40, 136, 2, 2, '#e0c040');
    p.T('HBD', tb + 35, 135, '#c04070', { align: 'center' });
    p.R(tb + 34, 123, 2, 7, '#80c0f0');
    p.E(tb + 6, 136, 12, 5, '#f0f0f0'); p.E(tb + 52, 136, 12, 5, '#f0f0f0');
    for (const [hx, hc] of [[tb + 2, '#e85050'], [tb + 58, '#50a0e0']]) for (let j = 0; j < 7; j++) p.R(hx + (j >> 1), 134 - j, 7 - (j & ~1), 1, hc);
    note(p, tb + 2, 108, 66, 14, '#ffffff', ['HAPPY BDAY KAREN', '(PAY $5 FOR CAKE)'], '#c02020');
    // ---- vending machine + water cooler + window + clock
    const vm = 572;
    p.SH(vm, 60, 54, 116);
    p.R(vm - 1, 59, 56, 117, OUT);
    p.R(vm, 60, 54, 116, '#c02838');
    p.R(vm, 60, 54, 2, '#f05868');
    p.R(vm + 4, 66, 34, 80, n ? '!#2a3a4a' : '#3a4a5a');
    const snacks = ['#f0c040', '#e05050', '#50a0e0', '#60c060', '#f08030', '#c060c0'];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
      p.R(vm + 6 + k * 8, 69 + r * 15, 6, 10, snacks[(r * 4 + k) % 6]);
      p.R(vm + 6 + k * 8, 69 + r * 15, 6, 2, '#ffffff');
      p.R(vm + 5, 80 + r * 15, 32, 1, '#9aa0a8');
    }
    p.R(vm + 14, 117, 6, 10, '#f0c040');
    p.R(vm + 42, 70, 8, 20, '#2a2a30');
    for (let k = 0; k < 6; k++) p.R(vm + 43 + (k & 1) * 4, 72 + (k >> 1) * 4, 2, 2, '#c8c8c8');
    p.R(vm + 6, 152, 30, 12, '#1a1a1a');
    note(p, vm + 6, 128, 30, 14, '#ffffff', ['OUT OF', 'ORDER'], '#c02020');
    p.T('SNAX', vm + 46, 96, '#ffffff', { align: 'center' });
    // water cooler
    p.V(640, 128, 22, 48, '#e8e8f0');
    p.R(642, 104, 18, 24, OUT); p.R(643, 105, 16, 22, '#a8d8f8'); p.R(645, 107, 3, 18, '#d8f0ff');
    p.R(646, 140, 3, 3, '#4080e0'); p.R(654, 140, 3, 3, '#e04040');
    // window
    p.SH(672, 44, 60, 56);
    p.B(672, 44, 60, 56, '#f0f0f0');
    if (n) { p.G(674, 46, 56, 52, ['!#0a1030', '!#141c44', '!#1c2654']); p.E(706, 52, 8, 8, '!#f0f0d0'); }
    else { p.G(674, 46, 56, 52, ['#80c0f0', '#98d0f4', '#b0dcf8']); p.E(680, 56, 18, 6, '#ffffff'); }
    p.R(701, 46, 2, 52, '#f0f0f0'); p.R(674, 70, 56, 2, '#f0f0f0');
    wallClock(p, 452, 52, 11);
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  crowd: [
    { x: 102, y: 178, s: personSpec('nurse', 151, { coffee: true, top: '#d874a2', bot: '#d874a2' }), th: 0.4, alt: 2 },
    { x: 260, y: 178, s: personSpec('doctor', 152, { coffee: true }), th: 0.3, alt: 1 },
    { x: 452, y: 178, s: personSpec('nurse', 153, { top: '#4e9a50', bot: '#4e9a50', hs: 'bun' }), th: 0.2, alt: 3 },
    { x: 548, y: 178, s: personSpec('janitor', 154), th: 0.6, alt: 0 },
    { x: 690, y: 178, s: personSpec('surgeon', 155), th: 0.15, alt: 1 },
    { x: 630, y: 179, s: personSpec('nurse', 156, { top: '#3098c8', bot: '#3098c8' }), th: 0.35, alt: 2, fidget: 'clap' },
    { x: 200, y: 179, s: personSpec('tech', 157), th: 0.5, alt: 0 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back, C = 370;
    // microwave timer blinks 0:00
    if ((t >> 5) & 1) drawText(ctx, '0:00', 98 + 39 - bx, 99, { font: 'small', color: '#40ff60' });
    if ((t % 180) < 40 && ((t >> 2) & 1)) drawText(ctx, 'BEEP', 98 + 28 - bx, 88 - 8, { font: 'small', color: '#ffffff', outline: '#202020' });
    // coffee steam from the red mug
    for (let i = 0; i < 3; i++) {
      const ph = (t + i * 20) % 60;
      const sx = 98 + 62 + 36 - bx + Math.round(Math.sin((t + i * 25) * 0.12) * 1.5);
      ctx.globalAlpha = 0.6 - ph / 120;
      fr(ctx, sx, 110 - (ph >> 2), 1, 2, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // candle flame flicker
    const fl = (t >> 2) & 1;
    fr(ctx, 470 + 34 - bx, 120 - fl, 2, 3 + fl, '#ffb030');
    fr(ctx, 470 + 34 - bx, 121, 2, 1, '#fff080');
    if (o.night) drawGlow(ctx, 470 + 35 - bx, 122, 16, 10, '#ffb030', 0.1);
    // napping resident: zzz
    const zp = (t >> 4) % 4;
    for (let i = 0; i < zp; i++) drawText(ctx, 'Z', C - 60 + 2 + i * 4 - bx, 138 - i * 6, { font: 'small', color: '#ffffff', outline: '#3a3a5a' });
    // vending machine light flicker
    if (hash(t >> 3, 5) < 0.12) { ctx.globalAlpha = 0.5; fr(ctx, 572 + 4 - bx, 66, 34, 80, '#000000'); ctx.globalAlpha = 1; }
    else if (o.night) drawGlow(ctx, 572 + 21 - bx, 106, 30, 40, '#a0d0ff', 0.05);
    clockHands(ctx, 452 - bx, 52, 11, t, 1, '#202020');
  },
};

// ===========================================================================
// STAGE 11: MORGUE (locked)
// ===========================================================================
DEFS.morgue = {
  refl: 0.22,
  ceil: {
    y: 14,
    shader(wx, wz, a, b, q) {
      const lx = ((wx % 160) + 160) % 160, lz = ((wz % 90) + 90) % 90;
      if (lx > 60 && lx < 100 && lz > 30 && lz < 40) return q.n ? '!#d8f0ff' : '#e8f8ff';
      if (seam(a, b, 40) || seam(q.wz0, q.wz1, 40)) return '#5a6a72';
      return hash(Math.floor(wx), Math.floor(wz * 2)) < 0.15 ? '#7a8a92' : '#86969e';
    },
  },
  floor(wx, wz, a, b, q) {
    const dx = wx - 400, dz = wz - 30;
    if (Math.abs(dx) < 8 && Math.abs(dz) < 5) return (Math.floor(dx + 8) % 3 === 0 || Math.abs(dz) > 3.5 || Math.abs(dx) > 7) ? '#1a2428' : '#4a5a60';
    const T = 30;
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) return '#3a484e';
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    let c = odd ? '#56666e' : '#5e6e76';
    const h = hash(Math.floor(wx * 1.3), Math.floor(wz * 1.6));
    if (h < 0.1) c = '#4c5a62';
    // a wet streak toward the drain
    if (Math.abs(dx + dz * 0.6) < 6 && dz > -40 && dz < 0 && ((Math.floor(wx) + q.r) & 1)) c = '#6a7e88';
    if (q.f > 0.7) c = shade(c, -0.15);
    return c;
  },
  back(p, w, n) {
    const C = w >> 1;
    p.tiles(0, 14, w, 162, '#a4b8c0', 12, 10, '#8098a2');
    roomLight(p, w, n, 16, [120, 370, 620], '#d8f0ff');
    p.R(0, 14, w, 2, '#4a5a62');
    p.R(0, 150, w, 26, '#6a7e88');
    p.R(0, 150, w, 2, '#9ab0ba');
    baseboard(p, 0, w, '#2a363c');
    // ---- wall of body drawers
    const dx0 = 150, cols = 7, rows = 3, dw = 64, dh = 40, dy0 = 40;
    p.SH(dx0 - 6, dy0 - 6, cols * dw + 12, rows * dh + 12, 3, 0.25);
    p.R(dx0 - 6, dy0 - 6, cols * dw + 12, rows * dh + 12, OUT);
    p.R(dx0 - 5, dy0 - 5, cols * dw + 10, rows * dh + 10, '#8a9aa2');
    p.R(dx0 - 5, dy0 - 5, cols * dw + 10, 2, '#c8d8e0');
    const names = ['J.DOE', 'J.DOE 2', 'DAVE', 'NOT YET', 'J.DOE 3', 'RESERVED', 'BOB', 'EMPTY', 'DONT ASK', 'J.DOE 4', 'MR.X', 'SHH', 'VIP', 'J.DOE 5', 'GARY', 'TBD', 'NOPE', 'EX-CEO', 'J.DOE 6', 'IOU', 'ED'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = dx0 + c * dw, y = dy0 + r * dh;
      if (r === 2 && c === 1) continue;
      p.R(x, y, dw, dh, '#3a464c');
      p.R(x + 2, y + 2, dw - 4, dh - 4, '#b8c8d0');
      p.GH(x + 2, y + 2, dw - 4, dh - 4, ['#d0dde4', '#c0d0d8', '#b0c0c8', '#a2b2ba']);
      p.R(x + 2, y + 2, dw - 4, 1, '#eef6fa');
      p.R(x + dw - 14, y + 14, 8, 12, OUT); p.R(x + dw - 13, y + 15, 6, 10, '#e0e8ec'); p.R(x + dw - 12, y + 16, 2, 8, '#ffffff');
      p.R(x + 8, y + 8, 30, 8, '#f4f0e0'); p.R(x + 8, y + 8, 30, 1, '#ffffff');
      p.T(names[r * cols + c], x + 23, y + 10, '#3a3a48', { align: 'center' });
      p.R(x + 6, y + dh - 6, 4, 2, '#8a9aa2'); p.R(x + dw - 10, y + dh - 6, 4, 2, '#8a9aa2');
    }
    // open drawer: tray with sheet and toe-tagged feet
    {
      const x = dx0 + dw, y = dy0 + 2 * dh;
      p.R(x, y, dw, dh, '#0a1014');
      p.R(x + 2, y + 2, dw - 4, dh - 4, '#141c22');
      p.R(x - 6, y + 22, dw + 12, 8, OUT);
      p.R(x - 5, y + 23, dw + 10, 6, '#c8d4da');
      p.R(x - 5, y + 23, dw + 10, 1, '#f0f8fc');
      p.E(x + 2, y + 10, dw - 4, 18, '#e8ecf0');
      p.R(x + 2, y + 19, dw - 4, 4, '#e8ecf0');
      p.R(x + 4, y + 14, dw - 12, 2, '#c8d0d8');
      p.R(x + dw - 6, y + 12, 7, 6, '#d8b898'); p.R(x + dw - 6, y + 18, 7, 5, '#d8b898');
      p.R(x + dw + 2, y + 16, 8, 6, '#f8f0c0'); p.P(x + dw + 1, y + 17, '#a0a0a0');
      p.T('?', x + dw + 6, y + 16, '#c02020', { align: 'center' });
    }
    // signs
    sign(p, C - 70, 18, 140, 14, '#2a3a44', '#d8f0ff', 'MORGUE - COLD STORAGE 4 C');
    sign(p, 26, 40, 96, 22, '#f8f8f0', '#c02020', ['AUTHORIZED', 'PERSONNEL ONLY']);
    sign(p, 610, 40, 100, 22, '#f8f8f0', '#2a3a44', ['PLEASE KEEP QUIET', '(THEY ARE)']);
    // left: hanging scale + autopsy sink
    p.R(60, 70, 1, 18, '#6a7a82');
    p.E(48, 88, 26, 26, OUT); p.E(49, 89, 24, 24, '#e0e8ec'); p.E(52, 92, 18, 18, '#f8f8f0');
    p.L(61, 101, 66, 95, '#c02020');
    p.R(56, 114, 10, 6, '#6a7a82');
    p.L(54, 120, 46, 132, '#6a7a82'); p.L(68, 120, 76, 132, '#6a7a82');
    p.R(44, 132, 34, 4, '#b8c8d0');
    p.SH(20, 140, 100, 36);
    p.V(20, 140, 100, 36, '#b8c8d0');
    p.R(24, 144, 40, 10, '#5a6a72');
    p.R(40, 128, 3, 14, '#c8d4da'); p.R(40, 128, 10, 3, '#c8d4da');
    for (let k = 0; k < 5; k++) p.R(72 + k * 8, 142, 2, 8, '#e0e8ec');
    // right: exit door + mop bucket
    const ed = 640;
    p.SH(ed, 82, 56, 94);
    p.R(ed - 3, 79, 62, 97, OUT);
    p.R(ed - 2, 80, 60, 96, '#6a7a82');
    p.V(ed, 84, 56, 92, '#8a9ca6');
    p.R(ed + 18, 94, 20, 16, '#1a2228'); p.R(ed + 19, 95, 18, 14, n ? '#0a1014' : '#3a4a52');
    p.R(ed + 46, 128, 6, 3, '#c8d4da');
    p.B(ed + 12, 66, 32, 10, '#1a2a1a');
    p.B(704, 158, 22, 18, '#e8c020');
    p.R(714, 120, 2, 40, '#8a6a3a');
    p.R(708, 116, 14, 6, '#d8d0c0');
    p.alpha(0.2, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
    // cold blue cast
    p.alpha(n ? 0.12 : 0.08, () => p.R(0, 14, w, 162, '!#2a6ab0'));
  },
  mid: {
    pf: 0.9,
    build(p, w, n) {
      // sheet-covered gurney with toe tag
      const gx = (w >> 1) - 46, fy = 185;
      p.alpha(0.3, () => p.E(gx - 4, fy - 3, 104, 6, '!#000000'));
      p.R(gx + 6, fy - 16, 3, 14, '#6a7a82'); p.R(gx + 84, fy - 16, 3, 14, '#6a7a82');
      p.E(gx + 3, fy - 4, 6, 6, OUT); p.E(gx + 83, fy - 4, 6, 6, OUT);
      p.R(gx + 2, fy - 18, 90, 4, '#9aaab2');
      p.R(gx, fy - 30, 94, 13, OUT);
      p.R(gx + 1, fy - 29, 92, 11, '#e4eaee');
      p.E(gx + 4, fy - 38, 22, 14, OUT); p.E(gx + 5, fy - 37, 20, 12, '#eef2f4');
      p.E(gx + 30, fy - 36, 44, 12, OUT); p.E(gx + 31, fy - 35, 42, 10, '#eef2f4');
      p.E(gx + 76, fy - 36, 12, 10, OUT); p.E(gx + 77, fy - 35, 10, 8, '#eef2f4');
      p.R(gx + 1, fy - 22, 92, 4, '#c8d2d8');
      for (let k = 0; k < 6; k++) p.R(gx + 6 + k * 15, fy - 22, 1, 6, '#b8c4ca');
      // toe tag hanging off the end
      p.R(gx + 93, fy - 30, 4, 4, '#d8b898');
      p.L(gx + 96, fy - 27, gx + 98, fy - 22, '#c0c0c0');
      p.R(gx + 95, fy - 22, 9, 6, '#f8f0c0');
      p.T('?', gx + 99, fy - 22, '#c02020', { align: 'center' });
    },
  },
  crowd: [
    { x: 136, y: 178, s: personSpec('doctor', 161, { glasses: true, hs: 'bald', hair: '#dedede', top: '#2a2a2a' }), th: 0.6, alt: 3 },
    { x: 600, y: 178, s: personSpec('janitor', 162), th: 0.5, alt: 0 },
    { x: 572, y: 179, s: personSpec('visitor', 163, { top: '#1a1a22', bot: '#1a1a22', hs: 'long', hair: '#17151c' }), th: 0.3, alt: 1 },
  ],
  animBack(ctx, o, X) {
    const t = o.t, bx = X.back;
    // flickering light: dims the whole room for a few frames
    const fl = hash(t >> 1, 33) < (o.night ? 0.12 : 0.05) || ((t % 400) > 380 && (t & 2));
    if (fl) { ctx.globalAlpha = 0.35; fr(ctx, 0, 14, o.viewW, 162, '#000814'); ctx.globalAlpha = 1; }
    // exit sign
    fr(ctx, 640 + 14 - bx, 68, 28, 6, fl ? '#103010' : '#30e060');
    if (!fl) drawText(ctx, 'EXIT', 640 + 28 - bx, 68, { font: 'small', color: '#e0ffe0', align: 'center' });
    // ghost (night only, drifts by the drawers)
    if (o.night) {
      const gp = (t % 900) / 900;
      if (gp < 0.4) {
        const gx = 200 + Math.round(gp * 600) - bx, gy = 90 + Math.round(Math.sin(t * 0.08) * 4);
        ctx.globalAlpha = 0.28 * Math.sin((gp / 0.4) * Math.PI);
        fr(ctx, gx - 6, gy, 12, 14, '#d8f0ff');
        fr(ctx, gx - 4, gy - 3, 8, 3, '#d8f0ff');
        fr(ctx, gx - 6, gy + 14, 3, 2, '#d8f0ff'); fr(ctx, gx - 1, gy + 14, 3, 2, '#d8f0ff'); fr(ctx, gx + 4, gy + 14, 2, 2, '#d8f0ff');
        fr(ctx, gx - 3, gy + 2, 2, 2, '#0a1a2a'); fr(ctx, gx + 2, gy + 2, 2, 2, '#0a1a2a');
        ctx.globalAlpha = 1;
      }
    }
  },
  animMid(ctx, o, X) {
    // a hand occasionally twitches out from under the sheet
    const t = o.t;
    const c = t % 360;
    if (c > 300) {
      const gx = (772 >> 1) - 46 - X.mid, fy = 185;
      const k = ((c - 300) >> 3) & 1;
      fr(ctx, gx + 40, fy - 19, 3, 6 + k, '#d8b898');
      fr(ctx, gx + 39 - k, fy - 13 + k, 5, 2, '#d8b898');
      fr(ctx, gx + 39, fy - 19, 1, 6, '#211a26');
    }
  },
  front(ctx, o) {
    // low cold fog drifting along the very front edge
    const t = o.t;
    ctx.globalAlpha = o.night ? 0.16 : 0.12;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 97 + t * (0.2 + i * 0.05)) % (o.viewW + 120)) - 60 - ((o.cx * 1.2) % 97);
      fr(ctx, Math.round(x), 208 + (i % 3) * 2, 70, 8, '#c8e8ff');
      fr(ctx, Math.round(x) + 10, 206 + (i % 3) * 2, 50, 2, '#c8e8ff');
    }
    ctx.globalAlpha = 1;
  },
};

// ===========================================================================
// STAGE 12: CAFETERIA
// ===========================================================================
DEFS.cafeteria = {
  refl: 0.1,
  ceil: { y: 14, shader: tileCeil('#fffbe8', '#e0d4b8', '#a89a7a', '#d0c4a6') },
  floor(wx, wz, a, b, q) {
    const T = 30;
    const odd = (cell(wx, T) + cell(wz, T)) & 1;
    let c = odd ? '#3a8a8a' : '#d8ccae';
    if (seam(a, b, T) || seam(q.wz0, q.wz1, T)) c = '#5a6a62';
    const h = hash(Math.floor(wx * 1.2), Math.floor(wz * 1.5));
    if (h < 0.06) c = shade(c, -0.12);
    // a puddle of mystery gravy
    const dx = wx - 250, dz = wz - 40;
    if (dx * dx / 300 + dz * dz / 40 < 1) c = '#8a6a3a';
    if (q.f > 0.7) c = shade(c, -0.12);
    return shade(c, -0.14);
  },
  back(p, w, n) {
    const C = w >> 1;
    p.G(0, 14, w, 100, ['#f4c878', '#f0c070', '#ecb868', '#e6b060']);
    roomLight(p, w, n, 16, [80, 220, 370, 520, 660], '#fff4d0');
    p.R(0, 14, w, 2, '#8a6a3a');
    p.tiles(0, 112, w, 64, '#e08a4a', 8, 8, '#b86a32');
    p.R(0, 110, w, 3, '#9a5a2a');
    p.R(0, 110, w, 1, '#ffc890');
    baseboard(p, 0, w, '#5a3418');
    // FRIDAY FISH DAY banner
    const bw = 200, bx = C - bw / 2;
    p.R(bx - 2, 16, 1, 28, '#5a5a5a'); p.R(bx + bw + 1, 16, 1, 28, '#5a5a5a');
    for (let i = 0; i < bw; i++) {
      const sag = Math.round(Math.sin((i / bw) * Math.PI) * 4);
      p.R(bx + i, 44 + sag, 1, 20, OUT);
      p.R(bx + i, 45 + sag, 1, 18, i % 20 < 1 ? '#e8e0d0' : '#fffaf0');
    }
    p.T('FRIDAY FISH DAY', C, 51, '#d02828', { font: 'big', align: 'center', shadow: '#801818' });
    p.T('(EVERY DAY)', C, 61, '#5a5a6a', { align: 'center' });
    for (const fx of [bx + 10, bx + bw - 26]) {
      p.E(fx, 50, 14, 8, '#7a9ab0'); p.R(fx + 13, 51, 4, 6, '#7a9ab0'); p.P(fx + 3, 52, '#202020');
    }
    // menu chalkboard
    const mb = 148;
    p.SH(mb, 50, 112, 56, 3);
    p.B(mb, 50, 112, 56, '#2a3a2e', '#8a5a2a');
    p.R(mb + 1, 50, 110, 1, '#b07a3a');
    const menu = [['TODAY: FISH', '#ffffff'], ['SOUP: YESTERDAYS', '#f0e080'], ['MYSTERY MEAT  $5', '#ffffff'], ['JELLO (GREEN)  $1', '#90f090'], ['SALAD        $14', '#ffffff'], ['COFFEE: TAR   $3', '#f0b080']];
    menu.forEach(([l, c], i) => p.T(l, mb + 6, 55 + i * 8, c));
    // right: drink cooler, register, wash hands sign, clock
    const dc = 486;
    p.SH(dc, 62, 52, 114);
    p.R(dc - 1, 61, 54, 115, OUT);
    p.R(dc, 62, 52, 114, '#d8d8e0');
    p.R(dc + 3, 72, 46, 90, n ? '!#a8d8f0' : '#c8ecf8');
    p.R(dc, 64, 52, 6, '#3a7ac8'); p.T('COLD DRINKS', dc + 26, 65, '#ffffff', { align: 'center' });
    const cans = ['#d02828', '#2a6ad0', '#40a040', '#f0c020', '#f07020', '#a040c0'];
    for (let r = 0; r < 4; r++) {
      p.R(dc + 3, 90 + r * 22, 46, 2, '#9aa0a8');
      for (let k = 0; k < 6; k++) { p.R(dc + 5 + k * 7, 78 + r * 22, 5, 12, cans[(k + r) % 6]); p.R(dc + 5 + k * 7, 78 + r * 22, 5, 2, '#e0e0e0'); }
    }
    p.alpha(0.3, () => { for (let k = 0; k < 30; k++) p.R(dc + 8 + k, 150 - k * 2, 3, 2, '!#ffffff'); });
    p.R(dc + 44, 100, 3, 20, '#9aa0a8');
    sign(p, 552, 50, 70, 22, '#ffffff', '#2a6ad0', ['EMPLOYEES', 'MUST WASH', 'HANDS']);
    p.T('(PLEASE?)', 587, 74, '#5a5a6a', { align: 'center' });
    wallClock(p, 660, 60, 12);
    // tables with diners (right): chairs behind tables
    for (const tx of [560, 650]) {
      for (let k = 0; k < 2; k++) {
        const chx = tx + 6 + k * 34;
        p.B(chx, 132, 16, 20, '#c86a3a');
        p.R(chx + 2, 152, 2, 24, '#5a3a20'); p.R(chx + 12, 152, 2, 24, '#5a3a20');
      }
    }
    // tray stack + condiments (left)
    for (let k = 0; k < 8; k++) { p.R(72, 166 - k * 3, 40, 3, OUT); p.R(73, 166 - k * 3, 38, 2, k & 1 ? '#c86a3a' : '#d87a4a'); }
    p.V(76, 120, 34, 22, '#c8c8d0');
    p.T('TRAYS', 93, 128, '#3a3a48', { align: 'center' });
    p.B(20, 128, 40, 48, '#5a5a62');
    p.R(24, 132, 32, 14, '#e8e8e8');
    p.T('NAPKINS', 40, 136, '#202020', { align: 'center' });
    p.T('ONE ONLY', 40, 150, '#ffffff', { align: 'center' });
    p.R(30, 156, 6, 12, '#e03030'); p.R(40, 156, 6, 12, '#f0d020'); p.R(50, 158, 4, 10, '#ffffff');
    p.alpha(0.18, () => { p.R(0, 14, 6, 162, '!#000000'); p.R(w - 6, 14, 6, 162, '!#000000'); });
  },
  over(p, w, n) {
    const C = w >> 1;
    // serving counter with sneeze guard + heat lamps
    const x0 = 124, x1 = 474;
    // heat lamps
    for (let k = 0; k < 4; k++) {
      const hx = x0 + 40 + k * 82;
      p.R(hx, 86, 2, 20, '#6a6a72');
      p.B(hx - 8, 104, 18, 6, '#4a4a52');
      p.R(hx - 6, 109, 14, 2, n ? '!#ff7030' : '#e86030');
      p.glow(hx + 1, 118, 26, 10, n ? '!#ff6020' : '!#ff8040', n ? 0.08 : 0.05);
    }
    // sneeze guard
    p.alpha(0.16, () => p.R(x0 + 6, 106, x1 - x0 - 12, 18, '!#e0f8ff'));
    p.R(x0 + 6, 106, x1 - x0 - 12, 1, '#d8eef4');
    p.alpha(0.3, () => { for (let k = 0; k < 14; k++) for (let j = 0; j < 4; j++) p.R(x0 + 30 + j * 80 + k, 122 - k, 3, 1, '!#ffffff'); });
    // counter body
    p.R(x0 - 1, 123, x1 - x0 + 2, 53, OUT);
    p.R(x0, 124, x1 - x0, 6, '#c8ccd4');
    p.R(x0, 124, x1 - x0, 1, '#f0f4f8');
    p.R(x0, 130, x1 - x0, 46, '#2a9a9a');
    p.R(x0, 130, x1 - x0, 3, '#1a7a7a');
    for (let k = x0 + 30; k < x1; k += 50) p.R(k, 136, 1, 34, '#1e8686');
    p.R(x0, 162, x1 - x0, 4, '#f0c040');
    // tray rail
    p.R(x0 - 4, 146, x1 - x0 + 8, 3, '#d8dce4');
    p.R(x0 - 4, 149, x1 - x0 + 8, 1, '#7a7e86');
    // food pans
    const pans = [['#5ab040', 'PEAS?'], ['#c8c0b0', 'MASH'], ['#f0a020', 'MAC'], ['#8a6a4a', 'MEAT?'], ['#e0e0d8', 'FISH'], ['#60e060', 'JELLO']];
    pans.forEach(([c, lbl], i) => {
      const px = x0 + 8 + i * 56;
      p.R(px, 118, 50, 7, OUT);
      p.R(px + 1, 119, 48, 5, '#b8bcc4');
      p.R(px + 2, 117, 46, 3, c);
      p.D(px + 2, 117, 46, 2, c, shade(c, 0.25), 1);
      p.T(lbl, px + 25, 134, '#e8ffff', { align: 'center' });
    });
    // the fish (big, gray, staring)
    const fx = x0 + 8 + 4 * 56 + 6;
    p.E(fx, 108, 34, 12, OUT); p.E(fx + 1, 109, 32, 10, '#9ab0c0');
    p.R(fx + 30, 109, 8, 10, OUT); p.R(fx + 31, 110, 6, 8, '#8aa0b0');
    p.E(fx + 4, 111, 5, 5, '#ffffff'); p.R(fx + 6, 113, 2, 2, '#202020');
    p.R(fx + 10, 116, 16, 1, '#7a90a0');
    p.R(fx + 2, 115, 3, 1, '#5a2020');
    // jello cubes
    for (let k = 0; k < 3; k++) { const jx = x0 + 8 + 5 * 56 + 8 + k * 13; p.R(jx, 110, 10, 8, OUT); p.R(jx + 1, 111, 8, 6, '#50e050'); p.R(jx + 2, 112, 3, 2, '#b0ffb0'); }
    // register at the end
    p.V(x1 + 6, 112, 30, 20, '#3a3e48');
    p.R(x1 + 9, 115, 24, 7, n ? '!#103a20' : '#1a5a30');
    p.T('$14', x1 + 21, 116, '!#60ff90', { align: 'center' });
    p.R(x1 + 4, 132, 34, 44, '#6a6e78');
    p.R(x1 + 4, 132, 34, 2, '#9aa0aa');
    // dining tables (right) in front of seated diners
    for (const tx of [560, 650]) {
      p.R(tx - 1, 149, 72, 6, OUT);
      p.R(tx, 150, 70, 4, '#e8e0cc');
      p.R(tx, 150, 70, 1, '#ffffff');
      p.R(tx + 33, 154, 4, 22, '#6a6a70');
      p.R(tx + 22, 174, 26, 2, '#4a4a50');
      p.R(tx + 8, 146, 20, 4, '#c86a3a'); p.R(tx + 42, 146, 20, 4, '#c86a3a');
      p.R(tx + 12, 144, 8, 2, '#9ab0c0'); p.R(tx + 46, 144, 8, 2, '#60e060');
    }
  },
  crowd: [
    { x: 188, y: 123, s: personSpec('lunch', 171, { skin: '#cf9466', hair: '#4c2e1a', H: 23 }), th: 0.2, alt: 2, behind: true },
    { x: 300, y: 123, s: personSpec('lunch', 172, { skin: '#f6d2b2', hair: '#8e8e8e' }), th: 0.5, alt: 0, behind: true },
    { x: 420, y: 123, s: personSpec('lunch', 181, { skin: '#7c4c2e', hair: '#17151c' }), th: 0.35, alt: 1, behind: true },
    { x: 576, y: 160, s: personSpec('doctor', 173, { sit: true }), th: 0.3, behind: true },
    { x: 610, y: 160, s: personSpec('nurse', 174, { sit: true, top: '#d874a2', bot: '#d874a2' }), th: 0.15, behind: true },
    { x: 666, y: 160, s: personSpec('visitor', 175, { sit: true, hs: 'afro' }), th: 0.4, behind: true },
    { x: 700, y: 160, s: personSpec('surgeon', 176, { sit: true }), th: 0.25, behind: true },
    { x: 140, y: 178, s: personSpec('visitor', 177, { hs: 'long' }), th: 0.35, alt: 1 },
    { x: 160, y: 179, s: personSpec('nurse', 178, { top: '#3098c8', bot: '#3098c8' }), th: 0.2, alt: 3 },
    { x: 452, y: 178, s: personSpec('doctor', 179), th: 0.5, alt: 0 },
    { x: 530, y: 178, s: personSpec('janitor', 180), th: 0.6, alt: 2 },
  ],
  animOver(ctx, o, X) {
    const t = o.t, bx = X.back;
    // green stink lines rising off the fish
    const fx = 124 + 8 + 4 * 56 + 6 - bx;
    for (let i = 0; i < 3; i++) {
      const ph = (t + i * 18) % 54;
      const yy = 104 - Math.floor(ph / 2);
      for (let k = 0; k < 4; k++) {
        const wx = fx + 6 + i * 10 + Math.round(Math.sin((yy + k * 2) * 0.5 + i) * 2);
        fr(ctx, wx, yy + k * 2, 1, 2, ph > 40 ? '#90c860' : '#60b030');
      }
    }
    // steam off the mash & mac
    for (let i = 0; i < 4; i++) {
      const ph = (t + i * 13) % 40;
      ctx.globalAlpha = 0.55 - ph / 80;
      fr(ctx, 124 + 8 + 56 + 12 + i * 22 - bx + Math.round(Math.sin((t + i * 9) * 0.15) * 1.5), 112 - (ph >> 1), 1, 2, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // jello jiggle
    if ((t >> 3) & 1) for (let k = 0; k < 3; k++) fr(ctx, 124 + 8 + 5 * 56 + 8 + k * 13 + 1 - bx, 110, 8, 1, '#50e050');
    // a fly buzzing around the fish
    const fly = t * 0.13;
    fr(ctx, fx + 16 + Math.round(Math.cos(fly) * 14), 98 + Math.round(Math.sin(fly * 2.3) * 6), 1, 1, '#101010');
    // register display blink
    if ((t >> 5) & 1) fr(ctx, 474 + 9 - bx, 115, 24, 7, o.night ? '#103a20' : '#1a5a30');
  },
  animBack(ctx, o, X) {
    clockHands(ctx, 660 - X.back, 60, 12, o.t, 1, '#202020');
  },
};
