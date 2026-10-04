// UI widgets shared by all screens: panels, menus, logo, backgrounds.
import { drawText, measureText, wrapText } from './font.js';
import { rect, fillPoly, line, circle } from './fx.js';
import { drawStage } from './stages.js';
import { Sound } from './audio.js';

export const O = '#140c1c';

export function panel(g, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(g, x - 1, y - 1, w + 2, h + 2, O);
  rect(g, x, y, w, h, opts.border || '#5a4a80');
  rect(g, x + 1, y + 1, w - 2, h - 2, opts.bg || '#1c1430');
  if (opts.alpha !== undefined) return;
  rect(g, x + 1, y + 1, w - 2, 1, opts.hi || '#3a2c58');
}

export function header(g, W, text, sub) {
  rect(g, 0, 0, W, 20, O);
  rect(g, 0, 0, W, 19, '#2a1840');
  rect(g, 0, 18, W, 1, '#e02838');
  for (let x = -20; x < W; x += 24) fillPoly(g, [[x, 0], [x + 10, 0], [x + 2, 19], [x - 8, 19]], 'rgba(255,255,255,0.04)');
  drawText(g, text, 8, 6, { color: '#ffffff', outline: O, gradient: ['#ffffff', '#ffffff', '#fff0c0', '#ffd060', '#ffb030', '#ff9020', '#e07010'] });
  if (sub) drawText(g, sub, W - 8, 7, { font: 'small', color: '#c0b0e0', align: 'right' });
}

export function footer(g, W, H, text) {
  rect(g, 0, H - 11, W, 11, 'rgba(10,6,20,0.85)');
  drawText(g, text, W / 2, H - 8, { font: 'small', color: '#a090c0', align: 'center' });
}

// Animated background using a stage, dimmed.
export function stageBG(g, game, stageId, night, dim = 0.55, speed = 0.3) {
  const W = game.W, H = game.H;
  const camX = Math.round((Math.sin(game.t * 0.002 * speed) * 0.5 + 0.5) * (800 - W));
  drawStage(g, stageId, { camX, viewW: W, viewH: H, t: game.t, night, excite: 0.15, groundY: 194, worldW: 800 });
  g.globalAlpha = dim;
  rect(g, 0, 0, W, H, '#0a0614');
  g.globalAlpha = 1;
}

// Scrolling diagonal stripes background
export function stripeBG(g, W, H, t, c1 = '#1a1030', c2 = '#22163c') {
  rect(g, 0, 0, W, H, c1);
  const off = (t * 0.5) % 32;
  for (let x = -H; x < W + 32; x += 32) fillPoly(g, [[x + off, 0], [x + off + 14, 0], [x + off + 14 - H, H], [x + off - H, H]], c2);
}

// ---------- logo ----------
let logoCache = null;
export function drawLogo(g, cx, y, t, scale = 1) {
  if (!logoCache) logoCache = buildLogo();
  const L = logoCache;
  const w = L.width * scale, h = L.height * scale;
  g.drawImage(L, Math.round(cx - w / 2), y, w, h);
  // shine sweep
  const k = (t % 240) / 240;
  if (k < 0.35) {
    const sx = Math.round(cx - w / 2 + (k / 0.35) * (w + 40) - 20);
    g.globalAlpha = 0.35;
    g.save();
    g.beginPath();
    g.rect(cx - w / 2, y, w, h);
    g.clip();
    fillPoly(g, [[sx, y], [sx + 8, y], [sx - 14, y + h], [sx - 22, y + h]], '#ffffff');
    g.restore();
    g.globalAlpha = 1;
  }
}

function buildLogo() {
  const W = 300, H = 92;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  const t = tmp.getContext('2d');
  const grad = ['#fffbe0', '#fff2a0', '#ffe060', '#ffc830', '#ffa820', '#ff8818', '#ff6810', '#f04810', '#d83010', '#b82010'];
  const g2 = ['#ffffff', '#fff6c8', '#ffe070', '#ffc040', '#ff9828', '#ff7018', '#f04818', '#d02818', '#a81818', '#801010'];
  // HOSPITAL (scale 4) and FIGHTER (scale 6)
  const draw = (txt, sc, yy, gr) => {
    const w = measureText(txt, { scale: sc }).w;
    const x = Math.round((W - w) / 2);
    // thick outline
    for (let dy = -2; dy <= 3; dy++) for (let dx = -2; dx <= 3; dx++) drawText(t, txt, x + dx, yy + dy, { scale: sc, color: '#140c1c' });
    drawText(t, txt, x + 1, yy + 1, { scale: sc, color: '#5a1010' });
    drawText(t, txt, x, yy, { scale: sc, color: '#ffd040', gradient: gr });
  };
  draw('HOSPITAL', 4, 6, g2);
  draw('FIGHTER', 6, 40, grad);
  // shear into italic
  for (let y = 0; y < H; y++) {
    const off = Math.round((H - y) * 0.18) - 8;
    g.drawImage(tmp, 0, y, W, 1, off, y, W, 1);
  }
  // red cross badge
  const bx = 16, by = 8;
  rect(g, bx + 5, by - 1, 12, 26, '#140c1c');
  rect(g, bx - 1, by + 6, 24, 12, '#140c1c');
  rect(g, bx + 6, by, 10, 24, '#ffffff');
  rect(g, bx, by + 7, 22, 10, '#ffffff');
  rect(g, bx + 8, by + 2, 6, 20, '#e02030');
  rect(g, bx + 2, by + 9, 18, 6, '#e02030');
  // EKG line under
  let px = 10, py = 86;
  for (let x = 10; x < W - 10; x += 2) {
    const ph = x % 70;
    const ny = ph > 30 && ph < 34 ? 78 : ph >= 34 && ph < 38 ? 91 : 86;
    line(g, px, py, x, ny, '#40ff80');
    px = x;
    py = ny;
  }
  return c;
}

// ---------- menu ----------
export class Menu {
  constructor(items, opts = {}) {
    this.items = items;
    this.sel = opts.sel || 0;
    this.opts = opts;
    this.lineH = opts.lineH || 11;
    this.scroll = 0;
    this.blink = 0;
    while (this.items[this.sel] && this.items[this.sel].hidden) this.sel++;
  }
  get cur() {
    return this.items[this.sel];
  }
  move(d) {
    const n = this.items.length;
    let s = this.sel;
    for (let i = 0; i < n; i++) {
      s = (s + d + n) % n;
      if (!this.items[s].hidden && !this.items[s].sep) break;
    }
    if (s !== this.sel) {
      this.sel = s;
      Sound.sfx('select');
    }
  }
  update(inp) {
    this.blink++;
    if (inp.up) this.move(-1);
    if (inp.down) this.move(1);
    const it = this.cur;
    if (!it) return;
    if (inp.left && it.onLeft) {
      it.onLeft();
      Sound.sfx('select');
    }
    if (inp.right && it.onRight) {
      it.onRight();
      Sound.sfx('select');
    }
    if (inp.confirm) this.activate();
  }
  activate() {
    const it = this.cur;
    if (!it) return;
    if (it.onSelect) {
      Sound.sfx(it.disabled ? 'cancel' : 'confirm');
      it.onSelect();
    } else if (it.onRight) {
      it.onRight();
      Sound.sfx('select');
    }
  }
  draw(g, game, x, y, w, maxRows = 99) {
    const vis = this.items.filter((i) => !i.hidden);
    const idx = vis.indexOf(this.cur);
    if (idx - this.scroll >= maxRows) this.scroll = idx - maxRows + 1;
    if (idx < this.scroll) this.scroll = idx;
    const rows = vis.slice(this.scroll, this.scroll + maxRows);
    rows.forEach((it, i) => {
      const yy = y + i * this.lineH;
      if (it.sep) {
        rect(g, x + 4, yy + 4, w - 8, 1, '#3a2c58');
        return;
      }
      const on = it === this.cur;
      if (on) {
        rect(g, x - 2, yy - 2, w + 4, this.lineH - 1, '#e02838');
        rect(g, x - 2, yy - 2, w + 4, 1, '#ff7080');
        const ax = x - 8 + (Math.floor(this.blink / 8) % 2);
        drawText(g, '}', ax, yy, { color: '#ffe040', outline: O });
      }
      const col = it.disabled ? (on ? '#ffd0d0' : '#706080') : on ? '#ffffff' : it.color || '#d0c8e8';
      drawText(g, it.label, x + 2, yy, { color: col, outline: on ? O : undefined, font: this.opts.font });
      if (it.value) {
        const v = typeof it.value === 'function' ? it.value() : it.value;
        drawText(g, (it.onLeft ? '{ ' : '') + v + (it.onRight ? ' }' : ''), x + w - 2, yy, { color: on ? '#ffe040' : '#a0d0ff', align: 'right', font: this.opts.font });
      }
      game.region(x - 2, yy - 2, w + 4, this.lineH - 1, () => {
        if (this.sel === this.items.indexOf(it) || !game.touchMode) {
          this.sel = this.items.indexOf(it);
          this.activate();
        } else {
          this.sel = this.items.indexOf(it);
          this.activate();
        }
      });
    });
    if (this.scroll > 0) drawText(g, '^', x + w / 2, y - 9, { font: 'small', color: '#a090c0' });
    if (this.scroll + maxRows < vis.length) drawText(g, '|', x + w / 2, y + maxRows * this.lineH - 2, { font: 'small', color: '#a090c0' });
  }
}

export function textBox(g, text, x, y, w, opts = {}) {
  const lines = wrapText(text, w, opts);
  const lh = opts.lh || (opts.font === 'small' ? 7 : 9);
  lines.forEach((l, i) => drawText(g, l, x, y + i * lh, { font: opts.font, color: opts.color || '#e0d8f0', align: opts.align, outline: opts.outline }));
  return lines.length * lh;
}

export function button(g, game, x, y, w, h, label, cb, opts = {}) {
  const c = opts.color || '#3a2c58';
  rect(g, x - 1, y - 1, w + 2, h + 2, O);
  rect(g, x, y, w, h, c);
  rect(g, x, y, w, 1, '#ffffff33');
  drawText(g, label, x + w / 2, y + Math.round((h - 7) / 2), { color: '#ffffff', align: 'center', font: opts.font });
  game.region(x, y, w, h, cb);
}

export const MOTION_TEXT = {
  qcf: '↓↘→', qcb: '↓↙←', dp: '→↓↘', hcf: '←↙↓↘→',
  chargeBF: '[←]→', chargeDU: '[↓]↑', qcf2: '↓↘→↓↘→', qcb2: '↓↙←↓↙←',
};
export const MOTION_NAME = { qcf: 'ROUND ROUNDS', qcb: 'REVERSE ROUNDS', dp: 'EMERGENCY ESCALATION', hcf: 'FULL WORKUP', chargeBF: 'INSURANCE HOLD', chargeDU: 'INSURANCE HOLD (UP)' };
export const MODERN_TEXT = { n: 'SP', f: '→+SP', b: '←+SP', d: '↓+SP' };
