// Particles, hit sparks and procedural pixel art for projectiles / traps / hazards.
import { drawText } from './font.js';
import { getSprite } from './sprites.js';

// ---------- pixel primitives (screen coords) ----------
export function rect(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
const spanCache = new Map();
function spans(r) {
  r = Math.max(0, Math.round(r));
  let s = spanCache.get(r);
  if (!s) {
    s = [];
    for (let y = -r; y <= r; y++) s.push(Math.floor(Math.sqrt(r * r - y * y) + 0.35));
    spanCache.set(r, s);
  }
  return s;
}
export function circle(g, cx, cy, r, c) {
  r = Math.round(r);
  if (r <= 0) return rect(g, cx, cy, 1, 1, c);
  const s = spans(r);
  g.fillStyle = c;
  cx = Math.round(cx);
  cy = Math.round(cy);
  for (let i = 0; i < s.length; i++) g.fillRect(cx - s[i], cy - r + i, s[i] * 2 + 1, 1);
}
export function ring(g, cx, cy, r, c, th = 1) {
  r = Math.round(r);
  cx = Math.round(cx);
  cy = Math.round(cy);
  g.fillStyle = c;
  const n = Math.max(12, Math.round(r * 6.3));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), th, th);
  }
}
export function line(g, x0, y0, x1, y1, c, th = 1) {
  g.fillStyle = c;
  const n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    g.fillRect(Math.round(x0 + (x1 - x0) * t - th / 2 + 0.5), Math.round(y0 + (y1 - y0) * t - th / 2 + 0.5), th, th);
  }
}
function outlined(g, fn, oc = '#140c1c') {
  // draws shape twice: offset outline then fill (fn(dx,dy,isOutline))
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fn(dx, dy, true, oc);
  fn(0, 0, false);
}

// ---------- hit sparks ----------
const SPARK_COL = [
  ['#ffffff', '#fff070', '#ffb030'],
  ['#ffffff', '#ffd040', '#ff8020'],
  ['#ffffff', '#ffa020', '#ff3010'],
];
function drawSpark(g, x, y, p) {
  const k = p.t / p.life;
  const str = p.str || 0;
  const big = [9, 13, 18][str] * (p.scale || 1);
  const r = big * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.6);
  const cols = p.cols || SPARK_COL[str];
  const rays = 8;
  for (let i = 0; i < rays; i++) {
    const a = p.rot + (i / rays) * Math.PI * 2;
    const len = r * (i % 2 ? 0.65 : 1.25);
    line(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, cols[2], i % 2 ? 1 : 2);
  }
  circle(g, x, y, r * 0.55, cols[1]);
  circle(g, x, y, r * 0.3, cols[0]);
  if (k > 0.5) ring(g, x, y, r * 1.2, cols[0]);
}

// ---------- projectile art ----------
export function drawProjectileArt(g, p, x, y, t) {
  const f = p.vx < 0 ? -1 : 1;
  const s = p.big ? 1.5 : 1;
  switch (p.sprite) {
    case 'syringe': {
      const tl = 6 + (t % 4);
      for (let i = 0; i < 3; i++) rect(g, x - f * (10 + i * 5) - (f < 0 ? 4 : 0), y - 2 + i * 2, 4, 1, i === 1 ? '#a8e0ff' : '#ffffff');
      rect(g, x - 8, y - 4, 16, 8, '#140c1c');
      rect(g, x - 7, y - 3, 14, 6, '#e8f8ff');
      rect(g, x - (f > 0 ? 5 : -1), y - 2, 7, 4, p.ex ? '#ffd040' : '#40e070');
      rect(g, f > 0 ? x - 11 : x + 7, y - 4, 4, 8, '#140c1c');
      rect(g, f > 0 ? x - 10 : x + 8, y - 3, 2, 6, '#c0c8d0');
      rect(g, f > 0 ? x + 8 : x - 8 - tl, y - 1, tl, 2, '#140c1c');
      rect(g, f > 0 ? x + 8 : x - 8 - tl, y, tl, 1, '#d8e0e8');
      break;
    }
    case 'pill': {
      const r = Math.floor(t / 3) % 4;
      const horiz = r % 2 === 0;
      const w = horiz ? 10 * s : 5 * s, h = horiz ? 5 * s : 10 * s;
      rect(g, x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, '#140c1c');
      if (horiz) {
        rect(g, x - w / 2, y - h / 2, w / 2, h, r === 0 ? '#ff4060' : '#ffffff');
        rect(g, x, y - h / 2, w / 2, h, r === 0 ? '#ffffff' : '#ff4060');
      } else {
        rect(g, x - w / 2, y - h / 2, w, h / 2, '#40a0ff');
        rect(g, x - w / 2, y, w, h / 2, '#ffffff');
      }
      rect(g, x - w / 2 + 1, y - h / 2 + 1, 2, 1, '#ffffff');
      break;
    }
    case 'thread': {
      const h = 22;
      for (let i = 0; i < h; i++) {
        const yy = y - h / 2 + i;
        const bend = Math.round(Math.sin((i / h) * Math.PI) * 7) * f;
        rect(g, x + bend - 1, yy, 4, 1, '#140c1c');
        rect(g, x + bend, yy, 2, 1, i % 3 ? '#b0ffd0' : '#ffffff');
        rect(g, x + bend - 4 * f, yy, 2, 1, '#40c080');
      }
      line(g, x - 2 * f, y, x - 16 * f, y + Math.sin(t * 0.4) * 3, '#e8e8e8');
      break;
    }
    case 'gas':
    case 'sneeze': {
      const green = p.sprite === 'sneeze';
      const puff = Math.sin(t * 0.2) * 1.5;
      const base = green ? '#b8e060' : '#c8f4ff';
      const dark = green ? '#70a030' : '#70b8d8';
      const blobs = [[-6, 2, 7], [5, 3, 6], [0, -4, 8], [-9, -3, 5], [9, -2, 5]];
      for (const [bx, by, br] of blobs) circle(g, x + bx, y + by, br + puff + 1, '#140c1c');
      for (const [bx, by, br] of blobs) circle(g, x + bx, y + by, br + puff, dark);
      for (const [bx, by, br] of blobs) circle(g, x + bx - 1, y + by - 1, br + puff - 1.5, base);
      if (!green && t % 30 < 20) drawText(g, 'Z', x + 6 + (t % 30) / 4, y - 16 - (t % 30) / 3, { font: 'small', color: '#ffffff', outline: '#305070' });
      if (green) for (let i = 0; i < 3; i++) rect(g, x + Math.sin(t * 0.3 + i * 2) * 12, y + 8 + ((t + i * 7) % 10), 2, 2, '#e0ff80');
      break;
    }
    case 'bottle': {
      const tilt = Math.floor(t / 4) % 4;
      outlined(g, (dx, dy, o, oc) => {
        rect(g, x - 4 + dx, y - 5 + dy, 8, 10, o ? oc : '#f08a20');
        rect(g, x - 5 + dx, y - 8 + dy + (tilt % 2), 10, 3, o ? oc : '#ffffff');
      });
      rect(g, x - 3, y - 2, 6, 4, '#ffffff');
      rect(g, x - 2, y - 1, 4, 1, '#d04040');
      break;
    }
    case 'biobag': {
      outlined(g, (dx, dy, o, oc) => {
        circle(g, x + dx, y + 1 + dy, 6, o ? oc : '#e02828');
        rect(g, x - 2 + dx, y - 8 + dy, 4, 3, o ? oc : '#e02828');
      });
      circle(g, x, y + 1, 2, '#140c1c');
      rect(g, x - 1, y - 4, 2, 2, '#140c1c');
      rect(g, x - 4, y + 3, 2, 2, '#140c1c');
      rect(g, x + 2, y + 3, 2, 2, '#140c1c');
      rect(g, x - 3, y - 2, 2, 1, '#ff8080');
      break;
    }
    case 'vial': {
      const r = Math.floor(t / 3) % 2;
      outlined(g, (dx, dy, o, oc) => rect(g, x - 2 + dx, y - 6 + dy, 5, 12, o ? oc : '#d8f0ff'));
      rect(g, x - 2, y - 1 + r, 5, 6 - r, '#70e040');
      rect(g, x - 3, y - 7, 7, 2, '#8040c0');
      break;
    }
    case 'water': {
      outlined(g, (dx, dy, o, oc) => {
        circle(g, x + dx, y + 2 + dy, 5, o ? oc : '#40a0ff');
        rect(g, x - 2 + dx + f * 3, y - 5 + dy, 4, 4, o ? oc : '#40a0ff');
      });
      circle(g, x - 1, y + 1, 2, '#a0e0ff');
      for (let i = 0; i < 3; i++) rect(g, x - f * (9 + i * 4), y - 3 + ((t + i * 3) % 7), 2, 2, i % 2 ? '#ffffff' : '#80c8ff');
      break;
    }
    case 'sticker': {
      const r = Math.floor(t / 2) % 2;
      const pts = r ? [[0, -6], [2, -2], [6, -2], [3, 1], [4, 6], [0, 3], [-4, 6], [-3, 1], [-6, -2], [-2, -2]] : [[-6, 0], [-2, -2], [-2, -6], [1, -3], [6, -4], [3, 0], [6, 4], [1, 3], [-2, 6], [-2, 2]];
      const sc = s;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fillPoly(g, pts.map(([a, b]) => [x + a * sc + dx, y + b * sc + dy]), '#140c1c');
      fillPoly(g, pts.map(([a, b]) => [x + a * sc, y + b * sc]), '#ffe040');
      rect(g, x - 2, y - 1, 1, 1, '#140c1c');
      rect(g, x + 1, y - 1, 1, 1, '#140c1c');
      rect(g, x - 1, y + 1, 3, 1, '#d04040');
      break;
    }
    case 'bubble': {
      outlined(g, (dx, dy, o, oc) => {
        rect(g, x - 9 + dx, y - 6 + dy, 18, 11, o ? oc : '#ffffff');
        rect(g, x - 6 * f + dx, y + 5 + dy, 3, 3, o ? oc : '#ffffff');
      });
      const dots = Math.floor(t / 8) % 4;
      for (let i = 0; i < 3; i++) rect(g, x - 5 + i * 4, y - 1, 2, 2, i < dots ? '#406080' : '#c0d0e0');
      break;
    }
    case 'stamp': {
      const w = 26, h = 11;
      rect(g, x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, '#140c1c');
      rect(g, x - w / 2, y - h / 2, w, h, '#fff4f0');
      rect(g, x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2, '#e02020');
      rect(g, x - w / 2 + 2, y - h / 2 + 2, w - 4, h - 4, '#fff4f0');
      drawText(g, 'DENIED', x, y - 2, { font: 'small', color: '#e02020', align: 'center' });
      break;
    }
    case 'ticket': {
      const gs = p.grow ? Math.min(2.2, 1 + p.age / 60) : 1;
      const w = Math.round(14 * gs), h = Math.round(9 * gs);
      rect(g, x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, '#140c1c');
      rect(g, x - w / 2, y - h / 2, w, h, '#fff8d8');
      rect(g, x - w / 2, y - h / 2, 2, h, '#e04040');
      for (let i = 2; i < h - 1; i += 2) rect(g, x - w / 2 + 4, y - h / 2 + i, w - 6, 1, '#8090b0');
      if (gs > 1.5) drawText(g, 'P1', x + 1, y - 2, { font: 'small', color: '#e02020', align: 'center' });
      break;
    }
    case 'bread': {
      const r = Math.floor(t / 4) % 2;
      outlined(g, (dx, dy, o, oc) => {
        rect(g, x - 7 + dx, y - 3 + dy, 14, 7, o ? oc : '#c88838');
        rect(g, x - 6 + dx, y - 5 + dy, 12, 3, o ? oc : '#e0a850');
      });
      rect(g, x - 4 + r, y - 4, 2, 1, '#f8d890');
      rect(g, x + 1 + r, y - 4, 2, 1, '#f8d890');
      break;
    }
    case 'orb': {
      const pulse = Math.sin(t * 0.5) * 1.5;
      circle(g, x, y, 9 + pulse, '#140c1c');
      circle(g, x, y, 8 + pulse, '#6018a0');
      circle(g, x, y, 6 + pulse, '#a040f0');
      circle(g, x, y, 3, '#f0d0ff');
      for (let i = 0; i < 4; i++) {
        const a = t * 0.3 + i * 1.57;
        rect(g, x + Math.cos(a) * 11, y + Math.sin(a) * 11, 2, 2, '#e080ff');
      }
      for (let i = 1; i < 4; i++) rect(g, x - f * (8 + i * 5), y - 1 + Math.sin(t + i) * 2, 3, 2, i % 2 ? '#a040f0' : '#6018a0');
      break;
    }
    case 'germ':
    case 'food':
    case 'light': {
      if (p.sprite === 'light') {
        rect(g, x - 7, y - 220, 14, 220, 'rgba(255,240,160,0.35)');
        rect(g, x - 4, y - 220, 8, 220, 'rgba(255,255,220,0.55)');
        circle(g, x, y, 8, '#fff8c0');
        circle(g, x, y, 5, '#ffffff');
        break;
      }
      if (p.sprite === 'germ') {
        const sp = Math.floor(t / 4) % 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + sp * 0.4;
          rect(g, x + Math.cos(a) * 9 - 1, y + Math.sin(a) * 9 - 1, 3, 3, '#140c1c');
          rect(g, x + Math.cos(a) * 9, y + Math.sin(a) * 9, 1, 1, '#a0ff60');
        }
        circle(g, x, y, 8, '#140c1c');
        circle(g, x, y, 7, '#60c030');
        circle(g, x - 2, y - 2, 4, '#a0ff60');
        rect(g, x - 3, y - 1, 2, 2, '#ffffff');
        rect(g, x + 1, y - 1, 2, 2, '#ffffff');
        rect(g, x - 2, y, 1, 1, '#d02020');
        rect(g, x + 2, y, 1, 1, '#d02020');
        break;
      }
      // food: cycle by id
      const k = (p.id || 0) % 4;
      if (k === 0) { circle(g, x, y, 8, '#140c1c'); circle(g, x, y, 7, '#e03030'); circle(g, x - 2, y - 2, 2, '#ff9090'); rect(g, x, y - 10, 2, 4, '#604020'); rect(g, x + 2, y - 10, 4, 2, '#40b030'); }
      else if (k === 1) { line(g, x - 7, y - 7, x + 7, y + 7, '#140c1c', 6); line(g, x - 6, y - 6, x + 6, y + 6, '#f07818', 4); rect(g, x - 9, y - 10, 4, 4, '#40b030'); }
      else if (k === 2) { rect(g, x - 2, y, 4, 9, '#140c1c'); rect(g, x - 1, y, 2, 8, '#80c040'); circle(g, x, y - 3, 8, '#140c1c'); circle(g, x - 3, y - 3, 4, '#30a030'); circle(g, x + 3, y - 3, 4, '#30a030'); circle(g, x, y - 6, 4, '#40c040'); }
      else { rect(g, x - 9, y - 4, 18, 9, '#140c1c'); rect(g, x - 8, y - 3, 16, 7, '#e8c070'); rect(g, x - 8, y - 3, 16, 2, '#f8e0a0'); drawText(g, 'FISH', x, y - 1, { font: 'small', color: '#604020', align: 'center' }); }
      break;
    }
    case 'wave': {
      const w = p.w, h = p.h;
      const b = x - (f > 0 ? w : 0);
      for (let i = 0; i < w; i += 2) {
        const k = f > 0 ? i / w : 1 - i / w;
        const hh = Math.round(h * (0.3 + 0.7 * Math.pow(k, 1.5)) + Math.sin(t * 0.4 + i * 0.3) * 2);
        rect(g, b + i, y - hh, 2, hh, '#140c1c');
        rect(g, b + i, y - hh + 1, 2, hh - 1, k > 0.85 ? '#a0e0ff' : '#3080e0');
        rect(g, b + i, y - hh + 1, 2, 2, '#ffffff');
      }
      for (let i = 0; i < 5; i++) rect(g, x + f * (2 + ((t * 2 + i * 7) % 12)), y - h - 4 + ((i * 5) % 9), 2, 2, '#ffffff');
      break;
    }
    default:
      circle(g, x, y, 6, '#ffffff');
  }
}

export function fillPoly(g, pts, c) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  g.fillStyle = c;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y + 0.5) !== (yj > y + 0.5)) xs.push(xi + ((y + 0.5 - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) g.fillRect(Math.round(xs[k]), y, Math.max(1, Math.round(xs[k + 1] - xs[k])), 1);
  }
}

// ---------- traps / objects ----------
export function drawTrap(g, o, x, y, t) {
  switch (o.trap) {
    case 'wetfloor': {
      // puddle
      rect(g, x - 18, y - 2, 36, 3, '#5aa8e8');
      rect(g, x - 14, y - 3, 28, 1, '#8ccaff');
      rect(g, x - 10 + (t % 20), y - 1, 3, 1, '#ffffff');
      // A-frame sign
      const sx = x + 6;
      fillPoly(g, [[sx - 7, y - 1], [sx - 2, y - 22], [sx + 2, y - 22], [sx + 7, y - 1]], '#140c1c');
      fillPoly(g, [[sx - 6, y - 2], [sx - 1.5, y - 21], [sx + 1.5, y - 21], [sx + 6, y - 2]], '#ffd020');
      rect(g, sx - 3, y - 14, 6, 1, '#140c1c');
      rect(g, sx - 1, y - 12, 2, 4, '#140c1c');
      rect(g, sx - 1, y - 7, 2, 1, '#140c1c');
      break;
    }
    case 'pills':
    case 'pills2':
      for (let i = 0; i < (o.trap === 'pills2' ? 9 : 6); i++) {
        const px = x - 20 + ((i * 37) % 40), py = y - 2 - (i % 2);
        rect(g, px - 1, py - 1, 6, 4, '#140c1c');
        rect(g, px, py, 2, 2, i % 3 ? '#ff4060' : '#40a0ff');
        rect(g, px + 2, py, 2, 2, '#ffffff');
      }
      break;
    case 'puddle':
    case 'puddle2': {
      const w = o.trap === 'puddle2' ? 56 : 40;
      rect(g, x - w / 2, y - 2, w, 3, '#9ad040');
      rect(g, x - w / 2 + 4, y - 3, w - 8, 1, '#c8f060');
      for (let i = 0; i < 3; i++) {
        const k = (t + i * 13) % 40;
        if (k < 20) circle(g, x - w / 3 + i * (w / 3), y - 3 - k / 4, 1 + (k > 14 ? 1 : 0), '#e0ff90');
      }
      break;
    }
    case 'cloud':
    case 'cloud2': {
      const r = o.trap === 'cloud2' ? 24 : 18;
      for (let i = 0; i < 5; i++) {
        const bx = x + Math.sin(t * 0.05 + i * 1.3) * r * 0.8;
        const by = y - 16 - Math.cos(t * 0.04 + i) * 8;
        circle(g, bx, by, 8 + (i % 3) * 2, 'rgba(120,200,60,0.45)');
      }
      for (let i = 0; i < 3; i++) rect(g, x + Math.sin(t * 0.1 + i * 2) * r, y - 30 + ((t + i * 9) % 26), 2, 2, '#d0ff80');
      break;
    }
  }
}

// ---------- hazards ----------
export function drawHazard(g, h, x, y, t) {
  switch (h.type) {
    case 'gurney': {
      const d = h.vx > 0 ? 1 : -1;
      const sh = (t % 4 < 2 ? 0 : 1);
      // frame
      rect(g, x - 26, y - 22 - sh, 52, 4, '#140c1c');
      rect(g, x - 25, y - 21 - sh, 50, 2, '#c0c8d0');
      rect(g, x - 24, y - 28 - sh, 48, 7, '#140c1c');
      rect(g, x - 23, y - 27 - sh, 46, 5, '#f0f0f0');
      rect(g, x - 23, y - 27 - sh, 46, 1, '#ffffff');
      rect(g, x + d * 14 - 5, y - 31 - sh, 10, 4, '#e8e8f0');
      for (const wx of [-20, 18]) {
        rect(g, x + wx, y - 18, 2, 12, '#606870');
        circle(g, x + wx + 1, y - 4, 3, '#140c1c');
        rect(g, x + wx + (t % 6 < 3 ? 0 : 1), y - 5, 1, 1, '#a0a8b0');
      }
      rect(g, x - d * 26, y - 46, 2, 26, '#808890');
      rect(g, x - d * 26 - 3, y - 46, 8, 7, '#a8d8ff');
      drawText(g, '!', x, y - 44, { font: 'big', color: '#ff4040', outline: '#140c1c', align: 'center' });
      break;
    }
    case 'car': {
      const d = h.vx > 0 ? 1 : -1;
      const b = t % 4 < 2 ? 0 : 1;
      rect(g, x - 30, y - 20 - b, 60, 16, '#140c1c');
      rect(g, x - 29, y - 19 - b, 58, 14, '#d03030');
      rect(g, x - 18, y - 30 - b, 34, 12, '#140c1c');
      rect(g, x - 17, y - 29 - b, 32, 11, '#d03030');
      rect(g, x - 14, y - 27 - b, 12, 7, '#90c8f0');
      rect(g, x + 1, y - 27 - b, 12, 7, '#90c8f0');
      rect(g, x + d * 26 - 2, y - 16 - b, 4, 4, '#fff8a0');
      if (t % 10 < 5) fillPoly(g, [[x + d * 30, y - 16], [x + d * 70, y - 24], [x + d * 70, y - 4]], 'rgba(255,250,180,0.35)');
      circle(g, x - 18, y - 4, 5, '#140c1c');
      circle(g, x + 18, y - 4, 5, '#140c1c');
      circle(g, x - 18, y - 4, 2, '#a0a0a0');
      circle(g, x + 18, y - 4, 2, '#a0a0a0');
      break;
    }
    case 'chart': {
      if (h.phase === 'warn') {
        const k = (t % 12) < 6;
        rect(g, x - 10, y - 1, 20, 2, k ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)');
        if (k) drawText(g, '!', x, y - 60, { font: 'big', color: '#ffd020', outline: '#140c1c', align: 'center' });
        break;
      }
      const sh = Math.max(3, 10 - (h.hy || 0) / 20);
      rect(g, x - sh, y - 1, sh * 2, 2, 'rgba(0,0,0,0.4)');
      const cy = y - (h.hy || 0);
      const r = Math.floor(t / 3) % 2;
      rect(g, x - 8 - r, cy - 11, 16 + r * 2, 20, '#140c1c');
      rect(g, x - 7 - r, cy - 10, 14 + r * 2, 18, '#a86a30');
      rect(g, x - 5, cy - 8, 10, 14, '#f6f2e8');
      for (let i = 0; i < 4; i++) rect(g, x - 4, cy - 6 + i * 3, 8, 1, '#8090b0');
      rect(g, x - 3, cy - 11, 6, 3, '#c0c8d0');
      break;
    }
    case 'fish': {
      const cy = y - h.hy;
      const d = h.vx > 0 ? 1 : -1;
      const wig = Math.floor(t / 3) % 2;
      outlined(g, (dx, dy, o, oc) => {
        circle(g, x + dx, cy + dy, 5, o ? oc : '#e8c070');
        fillPoly(g, [[x - d * 4 + dx, cy + dy], [x - d * 11 + dx, cy - 5 + wig + dy], [x - d * 11 + dx, cy + 5 - wig + dy]], o ? oc : '#d8a050');
      });
      rect(g, x + d * 2, cy - 2, 1, 1, '#140c1c');
      for (let i = 0; i < 3; i++) rect(g, x - d * (14 + i * 4), cy - 6 + ((t + i * 4) % 12), 1, 3, '#90c040');
      break;
    }
  }
}

// ---------- particle system ----------
export class FX {
  constructor(m) {
    this.m = m;
    this.parts = [];
  }
  add(p) {
    p.t = 0;
    p.life = p.life || 20;
    this.parts.push(p);
    if (this.parts.length > 420) this.parts.splice(0, this.parts.length - 420);
    return p;
  }
  spark(x, y, str, kind = 'hit', facing = 1) {
    const big = kind === 'counter' || kind === 'punish' ? 1.3 : 1;
    if (kind === 'block') {
      this.add({ type: 'block', x, y, life: 12, facing });
      return;
    }
    if (kind === 'parry' || kind === 'perfect') {
      this.add({ type: 'parry', x, y, life: kind === 'perfect' ? 30 : 18, perfect: kind === 'perfect' });
      for (let i = 0; i < (kind === 'perfect' ? 14 : 7); i++) this.add({ type: 'bubble', x, y, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5 + 0.5, life: 30 + Math.random() * 20, r: 1 + Math.random() * 2.5 });
      return;
    }
    let cols;
    if (kind === 'zap') cols = ['#ffffff', '#a0f0ff', '#40a0ff'];
    if (kind === 'punish') cols = ['#ffffff', '#ff6060', '#c00030'];
    if (kind === 'counter') cols = ['#ffffff', '#ffe040', '#ff4020'];
    this.add({ type: 'hit', x, y, life: 10 + str * 3, str, rot: Math.random() * Math.PI, scale: big, cols });
    const n = 4 + str * 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * (2 + str);
      this.add({ type: 'pix', x, y, vx: Math.cos(a) * sp + facing * 0.8, vy: Math.sin(a) * sp + 1, g: 0.18, life: 14 + Math.random() * 10, c: i % 3 ? '#ffe080' : '#ffffff' });
    }
    if (kind === 'zap') for (let i = 0; i < 3; i++) this.add({ type: 'zap', x, y, life: 10, seed: Math.random() * 100 });
  }
  burst(x, y, type, n = 6, facing = 1) {
    for (let i = 0; i < n; i++) {
      const p = { type, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, facing };
      switch (type) {
        case 'paper':
          Object.assign(p, { vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, g: 0.06, life: 50 + Math.random() * 30, ph: Math.random() * 6 });
          break;
        case 'germ':
          Object.assign(p, { vx: (Math.random() - 0.5) * 1, vy: Math.random() * 1 + 0.4, g: 0, life: 30 });
          break;
        case 'money':
          Object.assign(p, { vx: (Math.random() - 0.5) * 2 - facing, vy: Math.random() * 2 + 1, g: 0.05, life: 40, ph: Math.random() * 6 });
          break;
        case 'holy':
          Object.assign(p, { vx: (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.8, g: 0, life: 30 });
          break;
        case 'think':
          Object.assign(p, { vx: (Math.random() - 0.5) * 0.4, vy: 0.8, g: 0, life: 26 });
          break;
        case 'gas':
          Object.assign(p, { vx: facing * (0.6 + Math.random() * 1.6), vy: (Math.random() - 0.3) * 1.2, g: 0, life: 26, r: 4 + Math.random() * 5 });
          break;
        case 'ink':
          Object.assign(p, { vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2.4, g: 0.05, life: 24, r: 3 + Math.random() * 5 });
          break;
        case 'bsod':
          Object.assign(p, { vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.2) * 3, g: 0, life: 22, r: 2 + Math.floor(Math.random() * 3) });
          break;
        case 'slash':
          Object.assign(p, { life: 14 });
          break;
        case 'siren':
          Object.assign(p, { life: 8 });
          break;
        case 'star':
          Object.assign(p, { vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 1, g: 0.15, life: 30 });
          break;
        case 'pills':
          Object.assign(p, { type: 'pill', vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, g: 0.2, life: 40 });
          break;
        case 'splash':
          Object.assign(p, { type: 'pix', vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4 + 1, g: 0.25, life: 30, c: i % 2 ? '#80c8ff' : '#ffffff' });
          break;
        case 'debris':
          Object.assign(p, { type: 'pix', vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 2, g: 0.25, life: 40, c: i % 2 ? '#808080' : '#c0c0c0' });
          break;
        case 'confetti':
          Object.assign(p, { type: 'pix', vx: (Math.random() - 0.5) * 4, vy: Math.random() * 5 + 2, g: 0.1, life: 80, c: ['#ff4060', '#40c0ff', '#ffe040', '#60e060', '#ff80ff'][i % 5], sz: 2 });
          break;
        default:
          Object.assign(p, { vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2, g: 0.1, life: 20 });
      }
      this.add(p);
    }
  }
  dust(x, y) {
    for (let i = 0; i < 4; i++) this.add({ type: 'dust', x: x + (i - 1.5) * 6, y: y + 2, vx: (i - 1.5) * 0.5, vy: 0.3, g: 0, life: 18, r: 2 + Math.random() * 2 });
  }
  afterimage(f, color) {
    this.add({ type: 'after', x: f.x, y: f.y, pose: f.getPose(), look: f.look, facing: f.facing, life: 12, color: color || f.def.super.color || '#80c0ff' });
  }
  siren(f) {
    for (let i = 0; i < 6; i++) this.add({ type: 'siren', x: f.x, y: f.y + 70, life: 8 + i * 3 });
  }
  text(x, y, str, color = '#ffffff', life = 40) {
    this.add({ type: 'text', x, y, str, color, life, vy: 0.6 });
  }
  update() {
    for (const p of this.parts) {
      p.t++;
      if (p.vx !== undefined) p.x += p.vx;
      if (p.vy !== undefined) p.y += p.vy;
      if (p.g) p.vy -= p.g;
      if (p.type === 'paper' || p.type === 'money') {
        p.vx *= 0.97;
        if (p.vy < -0.8) p.vy = -0.8;
      }
      if (p.type === 'text') p.vy *= 0.92;
      if ((p.type === 'pix' || p.type === 'pill') && p.y < 0) {
        p.y = 0;
        p.vy *= -0.4;
        p.vx *= 0.7;
      }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
  }
  draw(g, camX, gy, layer) {
    for (const p of this.parts) {
      const front = p.type !== 'after' && p.type !== 'dust';
      if ((layer === 'back') === front) continue;
      const x = Math.round(p.x - camX), y = Math.round(gy - p.y);
      const k = p.t / p.life;
      switch (p.type) {
        case 'hit':
          drawSpark(g, x, y, p);
          break;
        case 'block': {
          const r = 4 + p.t * 1.2;
          g.globalAlpha = 1 - k;
          ring(g, x, y, r, '#a0d8ff', 2);
          ring(g, x, y, r * 0.6, '#ffffff');
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            line(g, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, '#60a0ff');
          }
          g.globalAlpha = 1;
          break;
        }
        case 'parry': {
          const r = 6 + p.t * (p.perfect ? 1.6 : 1.1);
          g.globalAlpha = 1 - k;
          ring(g, x, y, r, '#60ff90', 2);
          ring(g, x, y, r * 0.7, '#e0fff0');
          if (p.perfect) ring(g, x, y, r * 1.4, '#ffffff');
          g.globalAlpha = 1;
          break;
        }
        case 'bubble':
          ring(g, x, y, p.r, k < 0.8 ? '#c0fff0' : '#60c0a0');
          rect(g, x - 1, y - 1, 1, 1, '#ffffff');
          break;
        case 'pix':
          rect(g, x, y, p.sz || 1 + (k < 0.3 ? 1 : 0), p.sz || 1 + (k < 0.3 ? 1 : 0), p.c);
          break;
        case 'pill':
          rect(g, x - 1, y - 1, 4, 3, '#140c1c');
          rect(g, x, y, 1, 1, '#ff4060');
          rect(g, x + 1, y, 1, 1, '#ffffff');
          break;
        case 'paper': {
          const w = Math.abs(Math.sin(p.t * 0.2 + p.ph)) * 4 + 1;
          rect(g, x - w / 2 - 0.5, y - 2, w + 1, 5, '#140c1c');
          rect(g, x - w / 2, y - 1.5, w, 4, '#f8f4ea');
          break;
        }
        case 'money': {
          const w = Math.abs(Math.sin(p.t * 0.2 + p.ph)) * 5 + 1;
          rect(g, x - w / 2, y - 2, w, 4, '#40a040');
          rect(g, x - w / 4, y - 1, w / 2, 2, '#90e090');
          break;
        }
        case 'germ':
          circle(g, x, y, 2, '#140c1c');
          circle(g, x, y, 1, '#a0ff60');
          break;
        case 'holy':
          rect(g, x - 2, y, 5, 1, '#fff0a0');
          rect(g, x, y - 2, 1, 5, '#fff0a0');
          rect(g, x, y, 1, 1, '#ffffff');
          break;
        case 'think':
          drawText(g, '?', x, y, { font: 'small', color: '#ffffff', outline: '#403020' });
          break;
        case 'gas':
          g.globalAlpha = 0.7 * (1 - k);
          circle(g, x, y, p.r * (0.6 + k), p.facing === 9 ? '#b8e060' : '#c8f4ff');
          g.globalAlpha = 1;
          break;
        case 'ink':
          circle(g, x, y, p.r * (1 - k * 0.5), '#140c1c');
          break;
        case 'bsod':
          rect(g, x, y, p.r, p.r, k < 0.5 ? '#2060ff' : '#ffffff');
          break;
        case 'slash': {
          const f = p.facing || 1;
          for (let i = 0; i < 26; i++) {
            const a = -1.2 + (i / 26) * 2.4;
            const r = 18 + p.t;
            rect(g, x + Math.sin(a) * r * 0.5 * f, y - 8 - i * 1.6, 3 - (i % 2), 2, i % 4 ? '#e0fff0' : '#80e0a0');
          }
          break;
        }
        case 'siren': {
          const c = Math.floor(p.t / 2) % 2 ? '#ff2040' : '#2060ff';
          g.globalAlpha = 0.6;
          circle(g, x, y, 6 + p.t, c);
          g.globalAlpha = 1;
          break;
        }
        case 'dust':
          g.globalAlpha = 1 - k;
          circle(g, x, y, p.r + k * 4, '#d8d0c0');
          g.globalAlpha = 1;
          break;
        case 'zap': {
          let px = x, py = y;
          const rnd = (n) => Math.sin(p.seed + n * 12.9898) * 0.5;
          for (let i = 0; i < 6; i++) {
            const nx = px + rnd(i) * 16, ny = py + rnd(i + 3) * 16;
            line(g, px, py, nx, ny, i % 2 ? '#ffffff' : '#80e0ff');
            px = nx;
            py = ny;
          }
          break;
        }
        case 'star':
          rect(g, x - 1, y, 3, 1, '#ffe040');
          rect(g, x, y - 1, 1, 3, '#ffe040');
          break;
        case 'after': {
          const sp = getSprite(p.look, p.pose, 'sil:' + p.color);
          g.globalAlpha = 0.5 * (1 - k);
          if (p.facing > 0) g.drawImage(sp.c, x - sp.ox, y - sp.oy);
          else {
            g.save();
            g.translate(x, y);
            g.scale(-1, 1);
            g.drawImage(sp.c, -sp.ox, -sp.oy);
            g.restore();
          }
          g.globalAlpha = 1;
          break;
        }
        case 'text':
          drawText(g, p.str, x, y, { font: 'small', color: p.color, outline: '#140c1c', align: 'center', alpha: k > 0.75 ? (1 - k) * 4 : 1 });
          break;
      }
    }
  }
}
