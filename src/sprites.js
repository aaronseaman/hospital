// Procedural pixel-art fighter renderer. Rasterizes a posed skeleton into an indexed buffer with
// 3-tone shading + dark outlines, then caches the result as a canvas per (look, pose, variant).
import { solvePose, POSES } from './poses.js';

export const OUTLINE = '#140c1c';
const LIGHT = [0.45, 0.89];

// ---------- color helpers ----------
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function shade(hex, amt) {
  // amt <0 darker (shift toward purple), >0 lighter (shift toward warm)
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) {
    const k = 1 + amt;
    return rgbToHex(r * k + 8 * -amt, g * k * 0.96, b * k + 30 * -amt);
  }
  return rgbToHex(r + (255 - r) * amt + 6 * amt, g + (255 - g) * amt, b + (255 - b) * amt * 0.8);
}
const rampCache = new Map();
function rampOf(hex, back) {
  const key = hex + (back ? 'b' : '');
  let r = rampCache.get(key);
  if (!r) {
    r = back ? [shade(hex, -0.48), shade(hex, -0.28), shade(hex, -0.1)] : [shade(hex, -0.3), hex, shade(hex, 0.28)];
    rampCache.set(key, r);
  }
  return r;
}

// ---------- head art (13x13, facing right) ----------
const HEAD = [
  '....kkkkk....',
  '..kkkkkkkkk..',
  '.kkkkkkkkkkk.',
  '.kkkkkkkkkkl.',
  '.Kkkkkkkkkkl.',
  'KKkkkkkkkkkk.',
  'KKekkkkkkkkkk',
  'KKekkkkkkkkk.',
  '.KKkkkkkkkkk.',
  '.KKKkkkkkkkk.',
  '..KKKkkkkkk..',
  '...KKKkkkk...',
  '.....KKkk....',
];

// overlays: [dx, dy, rows]
const HAIR = {
  short: [0, -2, [
    '...h.h.hh....',
    '..hhhhhhhhh..',
    '.hhhjjjhhhhh.',
    'hhhhhhhhhhhhh',
    'hhhhhhhhhhhh.',
    'hhhhhhhh.....',
    'HHhh.........',
    'HHh..........',
    'HH...........',
  ]],
  spiky: [-1, -4, [
    '...h...h.....',
    '...hh.hh.h...',
    '..hhhhhhhhh..',
    '.hhhhjjjhhhhh',
    'hhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhh',
    '.hhhhhhhhh.h..',
    'HHHhh.........',
    'HHHh..........',
    '.HH...........',
  ]],
  buzz: [0, -1, [
    '...HHHHHH....',
    '.HHHHHHHHHH..',
    'HHHHHHHHHHH..',
    'HHHHHHHH.....',
    'HHH..........',
    'HH...........',
  ]],
  slick: [-1, -2, [
    '....hhhhhh....',
    '..hhjjjjhhhh..',
    '.hhhhhhjjjhhh.',
    'hhhhhhhhhhhhh.',
    'hhhhhhhhhhh...',
    'hhhhhh........',
    'hHHh..........',
    '.HHh..........',
    '.HH...........',
  ]],
  gray: [-1, -2, [
    '....hhhhh.....',
    '..hhjjjjhhh...',
    '.hhhhhhhjjh...',
    'hhhhhhhh......',
    'hhhhh.........',
    'hhhh..........',
    'hHHh..........',
    '.HHh..........',
    '.HH...........',
  ]],
  long: [-1, -2, [
    '....hhhhhh....',
    '..hhhhhhhhhh..',
    '.hhhjjjhhhhhh.',
    'hhhhhhhhhhhhhh',
    'hhhhhhhhhhhhh.',
    'hhhhhhhhhh.h..',
    'hhhh..........',
    'hhhh..........',
    'hhhh..........',
    'hhhh..........',
    'Hhhh..........',
    'HHhh..........',
    'HHH...........',
    'HHH...........',
    '.HH...........',
  ]],
  ponytail: [-4, -2, [
    '.......hhhhhh....',
    '.....hhhhhhhhhh..',
    '....hhhhjjjhhhhh.',
    '...hhhhhhhhhhhhhh',
    'hhhhhhhhhhhhhhhh.',
    'hhhhhhhhhhhh.....',
    'Hhhh.HHhh........',
    '.HHH.HHh.........',
    '..HH.HH..........',
    '...H.............',
  ]],
  buns: [-3, -5, [
    '.hhhh...........',
    'hhjjhh..........',
    'hhhhhh.hhhh.....',
    'Hhhhhhhhhhhhh...',
    '.HhhhhhjjjhhhH..',
    '...hhhhhhhhhhhh.',
    '...hhhhhhhhhhhh.',
    '...hhhhhhhhh.h..',
    '...HHhh.........',
    '...HHh..........',
    '...HH...........',
  ]],
  bob: [-1, -2, [
    '....hhhhhh....',
    '..hhhhhhhhhh..',
    '.hhhjjjhhhhhh.',
    'hhhhhhhhhhhhhh',
    'hhhhhhhhhhhhh.',
    'hhhhhhhhh.....',
    'hhhhh.........',
    'hhhhh.........',
    'HHhhh.........',
    'HHHh..........',
    '.HH...........',
  ]],
  curly: [-2, -4, [
    '....hhh.hhh.....',
    '..hhhhhhhhhhh...',
    '.hhhjhhhjhhhhh..',
    'hhhhhhhhhhhhhhh.',
    'hhjhhhhhhjhhhhh.',
    'hhhhhhhhhhhhhh..',
    'hhhhhhhhhhh.....',
    'hhhhhh..........',
    'Hhhhh...........',
    'HHhhh...........',
    '.HHh............',
    '..H.............',
  ]],
  messy: [-2, -4, [
    '..h...h..h......',
    '...hh.hhhh.h....',
    '.h.hhhhhhhhh.h..',
    '..hhhhhjjhhhhh..',
    '.hhhhhhhhhhhhhh.',
    'hhhhhhhhhhhhhh..',
    '.hhhhhhhhh.hh...',
    'hHHhh...........',
    '.HHh............',
    'HHH.............',
    '.H..............',
  ]],
  bald: [0, 2, [
    'HH...........',
    'HHH..........',
    'HH...........',
    '.H...........',
  ]],
  mohawk: [2, -4, [
    '...hh.....',
    '..hhhh....',
    '.hhjjhh...',
    'hhhhhhhh..',
  ]],
};

const HATS = {
  headband: [-4, 1, [
    '....ccccccccccc.',
    'cc.cCcccccccccc.',
    'cCcCC...........',
    '.ccC............',
    '..cc............',
  ]],
  nursecap: [1, -5, [
    '...ccccc...',
    '..cccacc...',
    '.ccaaaccc..',
    '.cccacccc..',
    'CCCCCCCCCC.',
  ]],
  buncovers: [-3, -6, [
    '.cccc...........',
    'ccacCc..........',
    'caaacc..........',
    'ccacCc..........',
    '.CCCC...........',
  ]],
  surgcap: [-1, -3, [
    '...cccccccc...',
    '.ccacccccaccc.',
    'cccccaccccccc.',
    'caccccccacccc.',
    'cccccacccccc..',
    'cccaccccc.....',
    'CCCCCC........',
    'CCC...........',
  ]],
  bouffant: [-2, -5, [
    '....cccccccc....',
    '..cccccccccccc..',
    '.ccacccccaccccc.',
    'cccccccccccccccc',
    'ccccacccccacccc.',
    'cccccccccccccc..',
    'CCCCCCCCCC......',
    '.CCCCC..........',
  ]],
  capback: [-4, -3, [
    '.......ccccccc...',
    '.....cccccccccc..',
    '....cccaccccccc..',
    'CCCCcccccccccccc.',
    'CCCC.CCCCCCCCC...',
  ]],
  cap: [0, -3, [
    '...ccccccc......',
    '..ccccccccc.....',
    '.cccccacccc.....',
    'ccccccccccccCCCC',
    '.CCCCCCCCCCCCCC.',
  ]],
  beanie: [-1, -4, [
    '.....aa.......',
    '...cccccccc...',
    '..cccccccccc..',
    '.cccccccccccc.',
    'aaaaaaaaaaaaa.',
    'CCCCCCCCCCC...',
  ]],
  headset: [0, -2, [
    '....ggggg....',
    '..gg.....g...',
    '.g...........',
    '.g...........',
    '.g...........',
    '..gg.........',
    '.gGGg........',
    '.gGGg........',
    '..gg.........',
    '....g........',
    '.....gg......',
    '.......gggq..',
  ]],
  collar: [0, 0, []],
};

// face features at row/col of HEAD. Values: [x, y, char]
function facePixels(face, look) {
  const px = [];
  const add = (x, y, c) => px.push([x, y, c]);
  const brows = look.brows || 'normal';
  const browRow = (offs) => {
    if (brows === 'angry') {
      add(8, 4, 'b'); add(9, 4, 'b'); add(10, 5, 'b');
    } else if (brows === 'sad' || face === 'sad') {
      add(8, 5, 'b'); add(9, 4, 'b'); add(10, 4, 'b');
    } else {
      add(8, 4 + offs, 'b'); add(9, 4 + offs, 'b'); add(10, 4 + offs, 'b');
    }
  };
  switch (face) {
    case 'hurt':
      add(8, 4, 'b'); add(9, 5, 'b'); add(10, 4, 'b');
      add(8, 6, 'p'); add(9, 6, 'p'); add(10, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm'); add(9, 10, 'm'); add(10, 10, 'm');
      break;
    case 'yell':
      browRow(0);
      if (brows !== 'angry') { add(10, 5, 'b'); }
      add(8, 6, 'w'); add(9, 6, 'p');
      add(8, 9, 'm'); add(9, 9, 't'); add(10, 9, 't'); add(11, 9, 'm');
      add(9, 10, 'm'); add(10, 10, 'm'); add(11, 10, 'm');
      break;
    case 'ko':
      add(8, 5, 'p'); add(10, 5, 'p'); add(9, 6, 'p'); add(8, 7, 'p'); add(10, 7, 'p');
      add(9, 10, 'm'); add(10, 10, 'm'); add(11, 10, 't');
      break;
    case 'dizzy':
      add(8, 5, 'p'); add(9, 5, 'p'); add(10, 5, 'p'); add(8, 6, 'p'); add(9, 6, 'w'); add(10, 6, 'p'); add(8, 7, 'p'); add(9, 7, 'p');
      add(9, 10, 'm'); add(10, 9, 'm'); add(11, 10, 'm');
      break;
    case 'smug':
      add(8, 4, 'b'); add(9, 4, 'b'); add(10, 4, 'b');
      add(8, 5, 'b'); add(9, 5, 'b'); add(8, 6, 'w'); add(9, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm'); add(11, 8, 'm');
      break;
    case 'calm':
      browRow(0);
      add(8, 6, 'p'); add(9, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm');
      break;
    case 'bored':
      add(8, 5, 'b'); add(9, 5, 'b'); add(10, 5, 'b');
      add(8, 6, 'w'); add(9, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm'); add(11, 9, 'm');
      break;
    case 'sad':
      browRow(0);
      add(8, 6, 'w'); add(9, 6, 'p');
      add(9, 10, 'm'); add(10, 9, 'm'); add(11, 10, 'm');
      break;
    case 'tired':
      add(8, 5, 'b'); add(9, 5, 'b'); add(10, 5, 'b');
      add(8, 6, 'p'); add(9, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm'); add(9, 10, 'm'); add(10, 10, 'm');
      add(1, 3, 'G'); add(1, 4, 'G');
      break;
    default:
      browRow(0);
      add(8, 5, 'w'); add(9, 5, 'p'); add(8, 6, 'w'); add(9, 6, 'p');
      add(9, 9, 'm'); add(10, 9, 'm');
  }
  return px;
}

const GEAR = {
  glasses: [[7, 5, 'g'], [8, 5, 'G'], [9, 5, 'G'], [10, 5, 'g'], [8, 4, 'g'], [9, 4, 'g'], [7, 6, 'g'], [10, 6, 'g'], [8, 7, 'g'], [9, 7, 'g'], [6, 5, 'g'], [5, 5, 'g'], [4, 5, 'g']],
  sun: [[7, 5, 'q'], [8, 5, 'q'], [9, 5, 'q'], [10, 5, 'q'], [11, 5, 'q'], [8, 6, 'q'], [9, 6, 'Q'], [10, 6, 'q'], [6, 5, 'g'], [5, 5, 'g'], [4, 5, 'g'], [3, 5, 'g'], [8, 4, 'q'], [9, 4, 'q'], [10, 4, 'q']],
  goggles: [[7, 4, 'g'], [8, 4, 'g'], [9, 4, 'g'], [10, 4, 'g'], [11, 4, 'g'], [7, 5, 'g'], [8, 5, 'G'], [9, 5, 'G'], [10, 5, 'G'], [11, 5, 'g'], [7, 6, 'g'], [8, 6, 'G'], [9, 6, 'p'], [10, 6, 'G'], [11, 6, 'g'], [7, 7, 'g'], [8, 7, 'g'], [9, 7, 'g'], [10, 7, 'g'], [11, 7, 'g'], [6, 5, 'a'], [5, 5, 'a'], [4, 5, 'a'], [3, 5, 'a'], [2, 5, 'a'], [1, 5, 'a']],
  loupes: [[7, 5, 'g'], [8, 5, 'G'], [9, 5, 'G'], [10, 5, 'g'], [11, 5, 'g'], [12, 5, 'g'], [13, 5, 'G'], [11, 6, 'g'], [12, 6, 'g'], [13, 6, 'g'], [6, 5, 'g'], [5, 5, 'g'], [4, 5, 'g'], [8, 6, 'G'], [9, 6, 'p']],
  mask: [[8, 7, 'x'], [9, 7, 'x'], [10, 7, 'x'], [11, 7, 'x'], [12, 7, 'x'], [7, 8, 'x'], [8, 8, 'x'], [9, 8, 'X'], [10, 8, 'x'], [11, 8, 'x'], [12, 8, 'x'], [7, 9, 'x'], [8, 9, 'x'], [9, 9, 'x'], [10, 9, 'X'], [11, 9, 'x'], [12, 9, 'x'], [7, 10, 'x'], [8, 10, 'x'], [9, 10, 'x'], [10, 10, 'x'], [11, 10, 'x'], [8, 11, 'X'], [9, 11, 'x'], [10, 11, 'x'], [6, 7, 'X'], [5, 7, 'X'], [4, 7, 'X'], [3, 6, 'X']],
  beard: [[4, 8, 'h'], [4, 9, 'h'], [5, 9, 'h'], [5, 10, 'h'], [6, 10, 'h'], [6, 11, 'h'], [7, 11, 'h'], [7, 12, 'h'], [8, 12, 'h'], [9, 12, 'h'], [8, 11, 'h'], [9, 11, 'h'], [10, 11, 'h'], [11, 10, 'h'], [10, 10, 'H'], [11, 9, 'h'], [9, 8, 'h'], [10, 8, 'h'], [11, 8, 'h'], [12, 8, 'h'], [5, 8, 'h'], [6, 9, 'h'], [7, 10, 'h'], [8, 13, 'H'], [9, 13, 'H']],
  goatee: [[9, 11, 'h'], [10, 11, 'h'], [9, 12, 'h'], [10, 12, 'h'], [8, 12, 'H'], [10, 8, 'h'], [11, 8, 'h'], [12, 8, 'h'], [9, 13, 'H']],
  mustache: [[9, 8, 'h'], [10, 8, 'h'], [11, 8, 'h'], [12, 8, 'h'], [9, 9, 'H'], [12, 9, 'H']],
  stubble: [[5, 9, 'S'], [7, 9, 'S'], [6, 10, 'S'], [8, 10, 'S'], [7, 11, 'S'], [9, 11, 'S'], [11, 10, 'S'], [10, 11, 'S'], [8, 8, 'S'], [11, 8, 'S']],
};

// ---------- raster ----------
class Raster {
  constructor(w, h, ox, oy) {
    this.w = w;
    this.h = h;
    this.ox = ox;
    this.oy = oy;
    this.buf = new Uint16Array(w * h);
    this.colors = [null, OUTLINE];
    this.cmap = new Map([[OUTLINE, 1]]);
  }
  ci(hex) {
    let i = this.cmap.get(hex);
    if (i === undefined) {
      i = this.colors.length;
      this.colors.push(hex);
      this.cmap.set(hex, i);
    }
    return i;
  }
  ramp(hex, back) {
    const r = rampOf(hex, back);
    return [this.ci(r[0]), this.ci(r[1]), this.ci(r[2])];
  }
  setB(bx, by, c) {
    if (bx >= 0 && by >= 0 && bx < this.w && by < this.h) this.buf[by * this.w + bx] = c;
  }
  getB(bx, by) {
    if (bx >= 0 && by >= 0 && bx < this.w && by < this.h) return this.buf[by * this.w + bx];
    return 0;
  }
  bx(x) { return Math.round(this.ox + x); }
  by(y) { return Math.round(this.oy - y); }
  // tapered capsule a->b. ramps: base ramp or fn(t)=>ramp
  capsule(a, b, r1, r2, ramp, outline = true, flat = false) {
    const pad = Math.max(r1, r2) + 2;
    const x0 = Math.floor(this.ox + Math.min(a[0], b[0]) - pad), x1 = Math.ceil(this.ox + Math.max(a[0], b[0]) + pad);
    const y0 = Math.floor(this.oy - Math.max(a[1], b[1]) - pad), y1 = Math.ceil(this.oy - Math.min(a[1], b[1]) + pad);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ll = dx * dx + dy * dy || 1e-6;
    for (let pass = outline ? 0 : 1; pass < 2; pass++) {
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const x = bx + 0.5 - this.ox, y = this.oy - by - 0.5;
          let t = ((x - a[0]) * dx + (y - a[1]) * dy) / ll;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = a[0] + dx * t, cy = a[1] + dy * t;
          const ox = x - cx, oy = y - cy;
          const d = Math.sqrt(ox * ox + oy * oy);
          const r = r1 + (r2 - r1) * t;
          if (pass === 0) {
            if (d <= r + 1.05) this.setB(bx, by, 1);
          } else if (d <= r + 0.05) {
            const rp = typeof ramp === 'function' ? ramp(t) : ramp;
            let c = rp[1];
            if (!flat) {
              const l = ox * LIGHT[0] + oy * LIGHT[1];
              if (l > r * 0.42 && r >= 1.8) c = rp[2];
              else if (l < -r * 0.32) c = rp[0];
            }
            this.setB(bx, by, c);
          }
        }
      }
    }
  }
  // polygon in sprite coords; fill(x,y) -> color index or 0
  poly(pts, fill, outline = true) {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const p of pts) {
      minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
      miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
    }
    const x0 = Math.floor(this.ox + minx) - 2, x1 = Math.ceil(this.ox + maxx) + 2;
    const y0 = Math.floor(this.oy - maxy) - 2, y1 = Math.ceil(this.oy - miny) + 2;
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const mask = [];
    for (let by = y0; by <= y1; by++)
      for (let bx = x0; bx <= x1; bx++) {
        const x = bx + 0.5 - this.ox, y = this.oy - by - 0.5;
        if (inside(x, y)) mask.push(bx, by, x, y);
      }
    if (outline) {
      for (let i = 0; i < mask.length; i += 4) {
        const bx = mask[i], by = mask[i + 1];
        this.setB(bx - 1, by, 1); this.setB(bx + 1, by, 1); this.setB(bx, by - 1, 1); this.setB(bx, by + 1, 1);
      }
    }
    for (let i = 0; i < mask.length; i += 4) {
      const c = fill(mask[i + 2], mask[i + 3]);
      if (c) this.setB(mask[i], mask[i + 1], c);
    }
  }
  // char map stamp at buffer coords
  stamp(bx0, by0, rows, palette, outline = true) {
    if (outline) {
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < rows[r].length; c++) {
          const ch = rows[r][c];
          if (ch === '.' || palette[ch] === undefined) continue;
          const bx = bx0 + c, by = by0 + r;
          for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const rr = r + ddy, cc = c + ddx;
            const nch = rows[rr] && rows[rr][cc];
            if (!nch || nch === '.' || palette[nch] === undefined) this.setB(bx + ddx, by + ddy, 1);
          }
        }
    }
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < rows[r].length; c++) {
        const ch = rows[r][c];
        if (ch === '.' || palette[ch] === undefined) continue;
        this.setB(bx0 + c, by0 + r, palette[ch]);
      }
  }
  outlinePass() {
    const { w, h, buf } = this;
    const add = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (buf[y * w + x]) continue;
        if ((x > 0 && buf[y * w + x - 1] > 1) || (x < w - 1 && buf[y * w + x + 1] > 1) || (y > 0 && buf[(y - 1) * w + x] > 1) || (y < h - 1 && buf[(y + 1) * w + x] > 1)) add.push(y * w + x);
      }
    for (const i of add) buf[i] = 1;
  }
  toCanvas(variant) {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    const rgb = this.colors.map((hx) => (hx ? hexToRgb(hx) : null));
    let map = rgb;
    if (variant === 'flash') map = rgb.map((v, i) => (!v ? null : i === 1 ? [255, 255, 255] : [255, 255, 255]));
    else if (variant === 'gray') map = rgb.map((v) => (v ? (() => { const l = v[0] * 0.3 + v[1] * 0.55 + v[2] * 0.15; return [l * 0.9 + 10, l * 0.9 + 10, l * 0.95 + 20]; })() : null));
    else if (variant && variant.startsWith('sil:')) { const col = hexToRgb(variant.slice(4)); map = rgb.map((v) => (v ? col : null)); }
    else if (variant === 'poison') map = rgb.map((v, i) => (v ? (i === 1 ? v : [v[0] * 0.6 + 30, v[1] * 0.8 + 60, v[2] * 0.5 + 10]) : null));
    else if (variant === 'frozen') map = rgb.map((v, i) => (v ? (i === 1 ? [20, 40, 90] : [v[0] * 0.5 + 80, v[1] * 0.5 + 110, v[2] * 0.4 + 150]) : null));
    const d = img.data;
    for (let i = 0; i < this.buf.length; i++) {
      const v = map[this.buf[i]];
      if (!v) continue;
      d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

// ---------- body rendering ----------
const D2R = Math.PI / 180;
const dirv = (a) => [Math.sin(a * D2R), -Math.cos(a * D2R)];

function renderBody(R, look, sol, opts) {
  const { J, pose, td } = sol;
  const s = look.scale || 1;
  const bulk = look.bulk || 1;
  const xray = opts.xray;
  const P = (hex, back) => (xray ? R.ramp(back ? '#183850' : '#205068', false) : R.ramp(hex, back));
  const skinHex = look.skin;
  const topHex = look.gown || look.top;
  const coatHex = look.coat;
  const sleeveHex = coatHex || topHex;
  const pantsHex = look.gown ? look.skin : look.pants;
  const glove = look.gloves;
  const sleeve = coatHex ? 'long' : look.sleeve || 'short';
  const nrm = [td[1], -td[0]]; // forward normal of torso axis
  const L = sol.B.torso;
  const hw = 6.2 * s * (look.width || 1);
  const sw = 8.4 * s * (look.width || 1) * (look.shoulders || 1);
  const tp = (u, v) => [J.hip[0] + td[0] * u + nrm[0] * v, J.hip[1] + td[1] * u + nrm[1] * v];

  const armR = [3.1 * s * bulk, 2.7 * s * bulk, 2.6 * s * bulk, 2.2 * s * bulk];
  const legR = [4.0 * s * bulk, 3.3 * s * bulk, 3.1 * s * bulk, 2.5 * s * bulk];
  if (look.armBulk) { armR[0] *= look.armBulk; armR[1] *= look.armBulk; armR[2] *= look.armBulk * 0.95; armR[3] *= look.armBulk * 0.9; }

  const drawArm = (sh, el, ha, back, ang) => {
    const skin = P(glove && false ? glove : skinHex, back);
    const slv = P(sleeveHex, back);
    const handRamp = P(glove || skinHex, back);
    if (sleeve === 'long') {
      R.capsule(sh, el, armR[0], armR[1], slv);
      R.capsule(el, ha, armR[2], armR[3], (t) => (t > 0.8 && !coatHex ? skin : slv));
    } else if (sleeve === 'none') {
      R.capsule(sh, el, armR[0], armR[1], skin);
      R.capsule(el, ha, armR[2], armR[3], skin);
    } else {
      R.capsule(sh, el, armR[0], armR[1], (t) => (t < 0.55 ? slv : skin));
      R.capsule(el, ha, armR[2], armR[3], skin);
    }
    // hand
    const fd = dirv(ang);
    const hr = 2.4 * s * Math.max(1, bulk * 0.95);
    if (pose.open) {
      R.capsule(ha, [ha[0] + fd[0] * 3.2 * s, ha[1] + fd[1] * 3.2 * s], hr * 0.9, hr * 0.7, handRamp);
    } else {
      R.capsule([ha[0] + fd[0] * 1.2, ha[1] + fd[1] * 1.2], [ha[0] + fd[0] * 2.2, ha[1] + fd[1] * 2.2], hr, hr, handRamp);
    }
  };
  const drawLeg = (hp, kn, an, toe, back) => {
    const pr = P(pantsHex, back);
    const shoe = P(look.shoes || '#e8e8e8', back);
    R.capsule(hp, kn, legR[0], legR[1], pr);
    R.capsule(kn, an, legR[2], legR[3], look.socks ? (t) => (t > 0.75 ? P(look.socks, back) : pr) : pr);
    R.capsule(an, toe, 2.4 * s * Math.max(1, bulk * 0.9), 2.0 * s, shoe);
  };

  // --- coat / gown tails ---
  const drawTails = (tailHex, isGown) => {
    const len = (isGown ? 19 : look.coatLen || 22) * s;
    const hb = tp(2, -hw - 0.6), hf = tp(2, hw * 0.95);
    const yb = Math.max(1, Math.min(hb[1], hf[1]) - len);
    const flare = isGown ? 2 : 5 + (pose.t > 20 ? 5 : pose.t > 8 ? 2 : 0) + Math.round(len / 10);
    const pts = isGown
      ? [tp(8, -hw - 0.4), hb, [hb[0] - flare - 1, yb + 1], [hf[0] + 2 + (pose.t < -20 ? 3 : 0), yb], hf, tp(8, hw)]
      : [tp(10, -hw - 0.4), hb, [hb[0] - flare * 0.5, (hb[1] + yb) / 2], [hb[0] - flare, yb + 1], [hb[0] - flare + 4, yb - 1], [J.hip[0] + 2, yb + 3], tp(2, hw * 0.3), tp(10, hw * 0.3)];
    const rp = R.ramp(tailHex, false);
    const rb = R.ramp(tailHex, true);
    const mid = J.hip[0];
    R.poly(pts, (x, y) => {
      if (isGown && ((Math.round(x * 2) + Math.round(y)) % 5 === 0)) return R.ci(look.gownDots || shade(tailHex, -0.3));
      if (!isGown && Math.round(x - mid + hw * 0.2) === 0 && y < hb[1] - 3) return rp[0];
      if (x < mid - hw * 0.5) return isGown ? rb[1] : (x < mid - hw - flare * 0.5 ? rp[0] : rp[1]);
      if (y < yb + 2) return rp[0];
      return x > mid + hw * 0.6 ? rp[2] : rp[1];
    });
  };
  // --- back arm, back leg ---
  if (!opts.noBackArm) drawArm(J.bs, J.be, J.bh, true, pose.ba[1]);
  drawLeg(J.bhip, J.bk, J.ban, J.bt, true);

  if (coatHex && !xray) drawTails(coatHex, false);
  if (look.gown && !xray) drawTails(look.gown, true);

  // --- pelvis ---
  R.capsule([J.hip[0] - 2.2 * s, J.hip[1] + 1], [J.hip[0] + 1.6 * s, J.hip[1] + 1], hw * 0.92, hw * 0.88, P(pantsHex === skinHex && look.gown ? look.gown : pantsHex, false), true);

  // --- front leg ---
  drawLeg(J.fhip, J.fk, J.fan, J.ft, false);

  // --- torso ---
  const torsoRamp = P(coatHex || topHex, false);
  const shirt = P(topHex, false);
  const ex = look.extras || {};
  const chest = look.chest || 1;
  const pts = [
    tp(-1, -hw), tp(-1, hw * 0.92), tp(L * 0.42, hw * 1.02 * chest), tp(L * 0.74, sw * 0.88 * chest), tp(L * 0.96, sw * 0.6),
    tp(L * 1.02, 2.4), tp(L * 1.02, -2.6), tp(L * 0.94, -sw * 0.82), tp(L * 0.55, -hw * 1.06),
  ];
  const stripe = ex.stripes ? R.ramp(ex.stripes, false) : null;
  const belt = ex.belt ? R.ci(ex.belt) : 0;
  const tie = ex.tie ? R.ramp(ex.tie, false) : null;
  const vest = ex.vest ? R.ramp(ex.vest, false) : null;
  const apron = ex.apron ? R.ramp(ex.apron, false) : null;
  const pattern = look.topPattern;
  R.poly(pts, (x, y) => {
    const rx = x - J.hip[0], ry = y - J.hip[1];
    const u = rx * td[0] + ry * td[1];
    const v = rx * nrm[0] + ry * nrm[1];
    const f = u / L;
    const halfw = f < 0.42 ? hw : hw + (sw - hw) * Math.min(1, (f - 0.42) / 0.4);
    const n = v / halfw; // -1 back .. +1 front
    let rp = torsoRamp;
    if (xray) return n > 0.4 ? rp[2] : n < -0.4 ? rp[0] : rp[1];
    if (coatHex) {
      if (n > 0.55 && f > 0.25) rp = shirt;
      if (f > 0.82 && n > 0.2 && n < 0.62) rp = torsoRamp; // lapel
    }
    if (look.gown && n < -0.78 && f < 0.75) return R.ramp(skinHex, false)[0];
    if (vest && n > -0.2 && f > 0.15 && f < 0.88) rp = vest;
    if (apron && n > 0.05 && f < 0.8) rp = apron;
    if (stripe && Math.abs(f - 0.5) < 0.07) rp = stripe;
    if (belt && u >= 0 && u < 2) return belt;
    if (tie && n > 0.62 && f > 0.35 && f < 0.98) return f > 0.9 ? tie[0] : tie[1];
    if (ex.collar && n > 0.55 && f > 0.86) return R.ci('#f4f4f4');
    if (ex.vneck && n > 0.45 && f > 0.86 && !coatHex) return R.ramp(skinHex, false)[1];
    if (pattern && !coatHex && ((Math.round(x) * 3 + Math.round(y) * 2) % 7 === 0)) return R.ci(pattern);
    if (n > 0.5) return rp[2];
    if (n < -0.45) return rp[0];
    return rp[1];
  });
  if (!xray) {
    // stethoscope draped around neck
    if (ex.stethoscope) {
      const c = R.ci(ex.stethoscope);
      const a = tp(L * 0.98, 3), b = tp(L * 0.62, 5.5), d = tp(L * 0.5, 5);
      R.capsule(a, b, 0.6, 0.6, [c, c, c], false, true);
      R.capsule(b, d, 0.6, 0.6, [c, c, c], false, true);
      const sc = R.ci('#c8d0d8');
      R.capsule(d, [d[0] + 0.5, d[1] - 1], 1.2, 1.2, [sc, sc, sc], false, true);
    }
    if (ex.lanyard) {
      const c = R.ci(ex.lanyard);
      const a = tp(L * 0.98, 2), b = tp(L * 0.55, hw * 0.7);
      R.capsule(a, b, 0.5, 0.5, [c, c, c], false, true);
      const card = R.ci('#f0f0f0'), ph = R.ci('#7090c0');
      const bx = R.bx(b[0]), by = R.by(b[1]);
      for (let yy = 0; yy < 4; yy++) for (let xx = -1; xx < 2; xx++) R.setB(bx + xx, by + yy, yy < 2 && xx === 0 ? ph : card);
    }
    if (ex.badge) {
      const p = tp(L * 0.72, hw * 0.6);
      const c = R.ci(ex.badge);
      R.setB(R.bx(p[0]), R.by(p[1]), c); R.setB(R.bx(p[0]) + 1, R.by(p[1]), c);
    }
    if (ex.pens && coatHex) {
      const p = tp(L * 0.7, -hw * 0.1);
      R.setB(R.bx(p[0]), R.by(p[1]), R.ci('#d02020'));
      R.setB(R.bx(p[0]) + 1, R.by(p[1]), R.ci('#2040d0'));
      R.setB(R.bx(p[0]), R.by(p[1]) + 1, R.ci('#e0e0e0'));
      R.setB(R.bx(p[0]) + 1, R.by(p[1]) + 1, R.ci('#e0e0e0'));
    }
    if (ex.cross) {
      const p = tp(L * 0.66, hw * 0.1);
      const c = R.ci(ex.cross);
      const bx = R.bx(p[0]), by = R.by(p[1]);
      R.setB(bx, by - 1, c); R.setB(bx - 1, by, c); R.setB(bx, by, c); R.setB(bx + 1, by, c); R.setB(bx, by + 1, c);
    }
  }

  // --- neck + head ---
  const neckTop = [J.headC[0] - td[0] * 4, J.headC[1] - td[1] * 4];
  R.capsule(J.neckBase, neckTop, 2.4 * s * (look.neck || 1), 2.2 * s * (look.neck || 1), P(skinHex, false), false);
  drawHead(R, look, sol, opts);

  // --- front arm ---
  drawArm(J.fs, J.fe, J.fh, false, pose.fa[1]);

  // --- props ---
  const prop = opts.prop !== undefined ? opts.prop : pose.prop;
  if (prop && !xray) drawProp(R, prop, look, sol);

  if (xray) drawBones(R, sol, look);
}

function drawBones(R, sol, look) {
  const { J } = sol;
  const b = R.ci('#f0f8ff');
  const br = [b, b, b];
  const seg = (a, c) => R.capsule(a, c, 0.7, 0.7, br, false, true);
  seg(J.bs, J.be); seg(J.be, J.bh); seg(J.bhip, J.bk); seg(J.bk, J.ban); seg(J.fhip, J.fk); seg(J.fk, J.fan);
  seg(J.hip, J.neckBase); seg(J.fs, J.fe); seg(J.fe, J.fh);
  const { td } = sol;
  const nrm = [td[1], -td[0]];
  for (let i = 0; i < 4; i++) {
    const u = sol.B.torso * (0.5 + i * 0.12);
    const c = [J.hip[0] + td[0] * u, J.hip[1] + td[1] * u];
    R.capsule([c[0] - nrm[0] * 4, c[1] - nrm[1] * 4], [c[0] + nrm[0] * 5, c[1] + nrm[1] * 5], 0.5, 0.5, br, false, true);
  }
  R.capsule([J.hip[0] - 4, J.hip[1] + 1], [J.hip[0] + 4, J.hip[1] + 1], 1, 1, br, false, true);
}

function drawHead(R, look, sol, opts) {
  const { J, pose } = sol;
  const tilt = pose.h || 0;
  const hx = Math.round(R.ox + J.headC[0] - 6 + Math.round(tilt / 12));
  const hy = Math.round(R.oy - J.headC[1] - 6);
  const xray = opts.xray;
  const sk = xray ? R.ramp('#205068') : R.ramp(look.skin);
  const hairR = R.ramp(look.hair || '#222');
  const hatR = R.ramp(look.hatColor || '#4a8');
  const pal = {
    k: sk[1], K: sk[0], l: sk[2], e: sk[0], S: sk[0],
    h: hairR[1], H: hairR[0], j: hairR[2],
    w: R.ci('#f8f8f8'), p: R.ci(look.eyes || '#1a1020'), b: R.ci(shade(look.hair || '#222', -0.3)), m: R.ci('#7a2030'), t: R.ci('#ffffff'),
    g: R.ci(look.frame || '#202028'), G: R.ci('#c8e8ff'), q: R.ci('#101018'), Q: R.ci('#6080a0'),
    c: hatR[1], C: hatR[0], a: R.ci(look.hatAccent || '#d82838'),
    x: R.ci(look.mask || '#9cd0e8'), X: R.ci(shade(look.mask || '#9cd0e8', -0.25)),
  };
  if (xray) {
    const skull = ['...wwwww.....', '..wwwwwwww...', '.wwwwwwwwww..', '.wwwwwwwwww..', '.wwwwwppwww..', '.wwwwwppwwww.', '..wwwwwwwwww.', '..wwwwwwwww..', '...wwwwwww...', '....wtwtwt...', '....wwwww....'];
    R.stamp(hx, hy, HEAD, { k: sk[1], K: sk[0], l: sk[2], e: sk[0] });
    R.stamp(hx, hy + 1, skull, { w: R.ci('#f0f8ff'), p: R.ci('#102030'), t: R.ci('#102030') }, false);
    return;
  }
  // back-of-head hair that sits behind (long hair) drawn as part of hair overlay
  R.stamp(hx, hy, HEAD, pal);
  const hair = HAIR[look.hairStyle || 'short'];
  const hatKey = look.hat;
  const hatHidesHair = hatKey === 'surgcap' || hatKey === 'bouffant' || hatKey === 'beanie';
  if (hair && !(hatHidesHair && look.hairStyle !== 'long' && look.hairStyle !== 'ponytail')) R.stamp(hx + hair[0], hy + hair[1], hair[2], pal);
  // face
  const facePx = facePixels(opts.face || pose.face || 'normal', look);
  for (const [x, y, c] of facePx) if (pal[c] !== undefined) R.setB(hx + x, hy + y, pal[c]);
  for (const g of look.face || []) {
    const gear = GEAR[g];
    if (!gear) continue;
    for (const [x, y, c] of gear) R.setB(hx + x, hy + y, pal[c]);
  }
  if (hatKey && HATS[hatKey]) {
    const h = HATS[hatKey];
    R.stamp(hx + h[0], hy + h[1], h[2], pal, hatKey !== 'headset');
  }
  if (look.hat2 && HATS[look.hat2]) {
    const h = HATS[look.hat2];
    R.stamp(hx + h[0], hy + h[1], h[2], pal);
  }
}

function drawProp(R, prop, look, sol) {
  const { J, pose } = sol;
  const useBack = prop === 'clipboard' || prop === 'mop';
  const hand = useBack ? J.bh : J.fh;
  const ang = useBack ? pose.ba[1] : pose.fa[1];
  const d = dirv(ang);
  const n = [-d[1], d[0]];
  const s = look.scale || 1;
  if (prop === 'clipboard') {
    const c = [hand[0] + d[0] * 6 * s, hand[1] + d[1] * 6 * s];
    const L = 8 * s, W = 6 * s;
    const pts = [
      [c[0] - d[0] * L - n[0] * W, c[1] - d[1] * L - n[1] * W],
      [c[0] + d[0] * L - n[0] * W, c[1] + d[1] * L - n[1] * W],
      [c[0] + d[0] * L + n[0] * W, c[1] + d[1] * L + n[1] * W],
      [c[0] - d[0] * L + n[0] * W, c[1] - d[1] * L + n[1] * W],
    ];
    const board = R.ramp('#a86a30');
    const paper = R.ci('#f6f2e8'), line = R.ci('#8090b0'), clip = R.ci('#c0c8d0');
    R.poly(pts, (x, y) => {
      const rx = x - c[0], ry = y - c[1];
      const a = rx * d[0] + ry * d[1], b = rx * n[0] + ry * n[1];
      if (Math.abs(b) > W - 1.5 || Math.abs(a) > L - 1.5) return board[1];
      if (a > L - 4 && Math.abs(b) < 2) return clip;
      if (Math.round(a) % 3 === 0 && b < W - 3) return line;
      return paper;
    });
  } else if (prop === 'mop') {
    const a = [hand[0] - d[0] * 14, hand[1] - d[1] * 14], b = [hand[0] + d[0] * 26, hand[1] + d[1] * 26];
    R.capsule(a, b, 1, 1, R.ramp('#c09050'));
    R.capsule([b[0] - n[0] * 5, b[1] - n[1] * 5], [b[0] + n[0] * 5, b[1] + n[1] * 5], 2.6, 2.6, R.ramp('#d8d0b0'));
  } else if (prop === 'syringe') {
    const a = [hand[0] - d[0] * 3, hand[1] - d[1] * 3], b = [hand[0] + d[0] * 9, hand[1] + d[1] * 9];
    R.capsule(a, b, 1.8, 1.8, R.ramp('#d8f0ff'));
    R.capsule(b, [b[0] + d[0] * 6, b[1] + d[1] * 6], 0.5, 0.5, R.ramp('#c0c0c0'), true, true);
  } else if (prop === 'book') {
    const c = [hand[0] + d[0] * 3, hand[1] + d[1] * 3];
    R.capsule([c[0] - 4, c[1]], [c[0] + 4, c[1]], 3, 3, R.ramp('#402030'), true, true);
    R.setB(R.bx(c[0]), R.by(c[1]) - 1, R.ci('#e0c040'));
    R.setB(R.bx(c[0]), R.by(c[1]), R.ci('#e0c040'));
    R.setB(R.bx(c[0]) - 1, R.by(c[1]) - 1, R.ci('#e0c040'));
    R.setB(R.bx(c[0]) + 1, R.by(c[1]) - 1, R.ci('#e0c040'));
  } else if (prop === 'notepad') {
    const c = [hand[0] + d[0] * 3, hand[1] + d[1] * 3];
    R.capsule([c[0], c[1] - 3], [c[0], c[1] + 3], 2.5, 2.5, R.ramp('#f0e080'), true, true);
  } else if (prop === 'bottle') {
    const c = [hand[0] + d[0] * 2, hand[1] + d[1] * 2];
    R.capsule([c[0], c[1] - 2], [c[0], c[1] + 3], 2.4, 2.4, R.ramp('#e08020'), true, true);
    R.capsule([c[0], c[1] + 4], [c[0], c[1] + 5], 2.4, 2.4, R.ramp('#f8f8f8'), false, true);
  } else if (prop === 'tube') {
    const c = [hand[0] + d[0] * 2, hand[1] + d[1] * 2];
    R.capsule([c[0], c[1] - 1], [c[0], c[1] + 6], 1.4, 1.4, R.ramp('#c0f0d0'));
    R.capsule([c[0], c[1] - 1], [c[0], c[1] + 2], 1.0, 1.0, R.ramp('#40e060'), false, true);
  } else if (prop === 'carrot') {
    const a = [hand[0], hand[1]], b = [hand[0] + d[0] * 9, hand[1] + d[1] * 9];
    R.capsule(a, b, 2.2, 0.6, R.ramp('#f07818'));
    R.capsule([a[0] - d[0] * 3, a[1] - d[1] * 3 + 1], a, 1.2, 1, R.ramp('#40b030'), false);
  } else if (prop === 'mug') {
    const c = [hand[0] + d[0] * 2, hand[1] + d[1] * 2];
    R.capsule([c[0], c[1] - 2], [c[0], c[1] + 2], 2.6, 2.6, R.ramp('#3060c0'), true, true);
  } else if (prop === 'paddles') {
    for (const h2 of [J.fh, J.bh]) R.capsule([h2[0], h2[1] - 1], [h2[0] + 3, h2[1] + 2], 2.6, 2.6, R.ramp('#f0d020'));
  } else if (prop === 'briefcase') {
    const c = [hand[0], hand[1] - 5];
    R.capsule([c[0] - 4, c[1]], [c[0] + 4, c[1]], 3.4, 3.4, R.ramp('#5a3418'), true, true);
  }
}

// ---------- public API ----------
const spriteCache = new Map();

export function getSprite(look, poseName, variant = '', prop) {
  const key = look.id + '|' + poseName + '|' + variant + '|' + (prop === undefined ? '-' : prop);
  let sp = spriteCache.get(key);
  if (sp) return sp;
  const baseVariant = variant === 'xray' ? 'xray' : '';
  if (variant && variant !== 'xray') {
    // derive from base raster
    const base = buildRaster(look, poseName, baseVariant, prop);
    sp = { c: base.R.toCanvas(variant), ox: base.R.ox, oy: base.R.oy, sol: base.sol };
  } else {
    const base = buildRaster(look, poseName, baseVariant, prop);
    sp = { c: base.R.toCanvas(''), ox: base.R.ox, oy: base.R.oy, sol: base.sol };
  }
  spriteCache.set(key, sp);
  return sp;
}

const rasterCache = new Map();
function buildRaster(look, poseName, variant, prop) {
  const key = look.id + '|' + poseName + '|' + variant + '|' + (prop === undefined ? '-' : prop);
  let r = rasterCache.get(key);
  if (r) return r;
  const sol = solvePose(look, poseName);
  const pad = 22;
  const s = look.scale || 1;
  const minX = Math.floor(sol.minX - pad * s), maxX = Math.ceil(sol.maxX + pad * s);
  const W = maxX - minX;
  const H = Math.ceil(sol.top + 16 * s);
  const R = new Raster(W, H + 4, -minX, H);
  renderBody(R, look, sol, { xray: variant === 'xray', prop });
  R.outlinePass();
  r = { R, sol };
  if (rasterCache.size > 400) rasterCache.clear();
  rasterCache.set(key, r);
  return r;
}

// Draw a fighter sprite with feet at (x, y) in view coords.
export function drawFighterSprite(ctx, look, poseName, x, y, facing, variant, prop) {
  const sp = getSprite(look, poseName, variant, prop);
  const ix = Math.round(x), iy = Math.round(y);
  if (facing >= 0) ctx.drawImage(sp.c, ix - sp.ox, iy - sp.oy);
  else {
    ctx.save();
    ctx.translate(ix, iy);
    ctx.scale(-1, 1);
    ctx.drawImage(sp.c, -sp.ox, -sp.oy);
    ctx.restore();
  }
  return sp;
}

export function preloadFighter(look, poses) {
  for (const p of poses || Object.keys(POSES)) getSprite(look, p);
}

// Bust portrait: crops the head/shoulders region of a pose. Returns a canvas.
const portraitCache = new Map();
export function getPortrait(look, poseName = 'idle1', w = 30, h = 30, variant = '') {
  const key = look.id + '|' + poseName + '|' + w + 'x' + h + variant;
  let c = portraitCache.get(key);
  if (c) return c;
  const sp = getSprite(look, poseName, variant);
  const { J } = sp.sol;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const hx = sp.ox + J.headC[0];
  const hy = sp.oy - J.headC[1];
  g.drawImage(sp.c, Math.round(w / 2 - hx + 1), Math.round(h * 0.36 - hy));
  portraitCache.set(key, c);
  return c;
}
