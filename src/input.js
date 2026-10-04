// Input: keyboard, gamepads and touch, merged into per-player input frames.
import { blankInput } from './fighter.js';
import { drawText } from './font.js';
import { rect, circle, ring } from './fx.js';

const CLASSIC_KEYS_P1 = { KeyU: 'lp', KeyI: 'mp', KeyO: 'hp', KeyJ: 'lk', KeyK: 'mk', KeyL: 'hk' };
const MODERN_KEYS_P1 = { KeyU: 'l', KeyI: 'm', KeyO: 'h', KeyJ: 'sp', KeyK: 'auto', KeyL: 'parry' };
const SYS_KEYS_P1 = { KeyP: 'parry', Semicolon: 'impact', KeyH: 'throw', Space: 'super', KeyT: 'taunt' };
const CLASSIC_KEYS_P2 = { Numpad7: 'lp', Numpad8: 'mp', Numpad9: 'hp', Numpad4: 'lk', Numpad5: 'mk', Numpad6: 'hk' };
const MODERN_KEYS_P2 = { Numpad7: 'l', Numpad8: 'm', Numpad9: 'h', Numpad4: 'sp', Numpad5: 'auto', Numpad6: 'parry' };
const SYS_KEYS_P2 = { NumpadAdd: 'parry', NumpadEnter: 'impact', Numpad0: 'throw', NumpadDecimal: 'super', NumpadSubtract: 'taunt' };
const DIR_P1 = { KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right' };
const DIR_P2 = { ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right' };
const PAD_CLASSIC = { 2: 'lp', 3: 'mp', 5: 'hp', 0: 'lk', 1: 'mk', 7: 'hk', 4: 'parry', 6: 'impact', 10: 'throw', 11: 'super', 8: 'taunt' };
const PAD_MODERN = { 2: 'l', 3: 'm', 1: 'h', 0: 'sp', 5: 'auto', 4: 'parry', 6: 'impact', 7: 'super', 10: 'throw', 8: 'taunt' };

const MENU_CONFIRM = ['Enter', 'Space', 'KeyU', 'KeyJ', 'KeyZ', 'NumpadEnter', 'Numpad7', 'Numpad4'];
const MENU_BACK = ['Escape', 'Backspace', 'KeyX', 'KeyK', 'Numpad8'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.keyEdges = new Set();
    this.padPrev = [{}, {}, {}, {}];
    this.padNow = [{}, {}, {}, {}];
    this.schemes = ['classic', 'classic'];
    this.humans = 1;
    this.touch = new Touch(this);
    this.taps = [];
    this.lastDevice = 'keyboard';
    this.anyKey = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (this.capture(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.keyEdges.add(e.code);
      this.lastDevice = 'keyboard';
      this.anyKey = true;
      if (this.capture(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }
  capture(code) {
    return code.startsWith('Arrow') || code === 'Space' || code.startsWith('Numpad') || code === 'Backspace' || code === 'Tab';
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      this.padPrev[i] = this.padNow[i];
      const p = pads[i];
      const st = {};
      if (p && p.connected) {
        p.buttons.forEach((b, j) => {
          if (b.pressed || b.value > 0.5) st[j] = true;
        });
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (ax < -0.5) st.left = true;
        if (ax > 0.5) st.right = true;
        if (ay < -0.5) st.up = true;
        if (ay > 0.5) st.down = true;
        if (st[12]) st.up = true;
        if (st[13]) st.down = true;
        if (st[14]) st.left = true;
        if (st[15]) st.right = true;
        if (Object.keys(st).length) {
          this.lastDevice = 'pad';
          this.anyKey = true;
        }
      }
      this.padNow[i] = st;
    }
    this.touch.poll();
  }
  padCount() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let n = 0;
    for (const p of pads) if (p && p.connected) n++;
    return n;
  }
  endFrame() {
    this.keyEdges.clear();
    this.taps = [];
    this.anyKey = false;
    this.touch.endFrame();
  }

  // which devices drive which player
  devicesFor(side) {
    const pads = this.padCount();
    if (this.humans < 2) return { dirs: [DIR_P1, DIR_P2], btns: side === 0 ? 'p1all' : null, pads: side === 0 ? [0, 1, 2, 3] : [], touch: side === 0 };
    if (pads >= 2) return { dirs: side === 0 ? [DIR_P1] : [DIR_P2], btns: side === 0 ? 'p1' : 'p2', pads: [side], touch: side === 0 };
    if (pads === 1) return { dirs: side === 0 ? [DIR_P1] : [DIR_P2], btns: side === 0 ? 'p1' : 'p2', pads: side === 1 ? [0] : [], touch: side === 0 };
    return { dirs: side === 0 ? [DIR_P1] : [DIR_P2], btns: side === 0 ? 'p1' : 'p2', pads: [], touch: side === 0 };
  }

  frameFor(side) {
    const inp = blankInput();
    const dev = this.devicesFor(side);
    const scheme = this.schemes[side];
    for (const map of dev.dirs) for (const code in map) if (this.keys.has(code)) inp[map[code]] = true;
    const keymaps = [];
    if (dev.btns === 'p1' || dev.btns === 'p1all') keymaps.push(scheme === 'modern' ? MODERN_KEYS_P1 : CLASSIC_KEYS_P1, SYS_KEYS_P1);
    if (dev.btns === 'p2' || dev.btns === 'p1all') keymaps.push(scheme === 'modern' ? MODERN_KEYS_P2 : CLASSIC_KEYS_P2, SYS_KEYS_P2);
    for (const map of keymaps)
      for (const code in map) {
        const b = map[code];
        if (this.keys.has(code)) inp.hold[b] = true;
        if (this.keyEdges.has(code)) inp.press[b] = true;
      }
    const pmap = scheme === 'modern' ? PAD_MODERN : PAD_CLASSIC;
    for (const i of dev.pads) {
      const now = this.padNow[i], prev = this.padPrev[i];
      for (const d of ['left', 'right', 'up', 'down']) if (now[d]) inp[d] = true;
      for (const j in pmap) {
        if (now[j]) inp.hold[pmap[j]] = true;
        if (now[j] && !prev[j]) inp.press[pmap[j]] = true;
      }
    }
    if (dev.touch) this.touch.apply(inp);
    if (inp.left && inp.right) inp.left = inp.right = false;
    if (inp.up && inp.down) inp.up = false;
    return inp;
  }

  pausePressed() {
    if (this.keyEdges.has('Escape') || this.keyEdges.has('Enter')) return true;
    for (let i = 0; i < 4; i++) if (this.padNow[i][9] && !this.padPrev[i][9]) return true;
    return this.touch.pausePressed;
  }

  // menu navigation edges. side = 0/1 or undefined for any
  menu(side) {
    const r = { up: false, down: false, left: false, right: false, confirm: false, back: false, alt: false, start: false };
    const e = this.keyEdges;
    const two = this.humans >= 2;
    const useP1 = side === undefined || side === 0;
    const useP2 = side === undefined || side === 1 || !two;
    if (useP1 && (side === undefined || side === 0)) {
      if (e.has('KeyW')) r.up = true;
      if (e.has('KeyS')) r.down = true;
      if (e.has('KeyA')) r.left = true;
      if (e.has('KeyD')) r.right = true;
      for (const c of ['Enter', 'Space', 'KeyU', 'KeyJ', 'KeyZ']) if (e.has(c)) r.confirm = true;
      for (const c of ['Escape', 'Backspace', 'KeyX', 'KeyK']) if (e.has(c)) r.back = true;
      if (e.has('KeyO') || e.has('KeyL') || e.has('KeyC')) r.alt = true;
    }
    if ((two && (side === undefined || side === 1)) || (!two && useP1)) {
      if (e.has('ArrowUp')) r.up = true;
      if (e.has('ArrowDown')) r.down = true;
      if (e.has('ArrowLeft')) r.left = true;
      if (e.has('ArrowRight')) r.right = true;
      for (const c of ['NumpadEnter', 'Numpad7', 'Numpad4', 'Numpad0']) if (e.has(c)) r.confirm = true;
      if (e.has('Numpad8') || e.has('NumpadDecimal')) r.back = true;
      if (e.has('Numpad9') || e.has('Numpad6')) r.alt = true;
      if (two && side === 1) {
        if (e.has('Enter') || e.has('NumpadEnter')) r.confirm = true;
      }
    }
    const pads = side === undefined ? [0, 1, 2, 3] : this.devicesFor(side).pads.length ? this.devicesFor(side).pads : side === 0 && !two ? [0, 1, 2, 3] : [];
    for (const i of pads) {
      const n = this.padNow[i], p = this.padPrev[i];
      const edge = (k) => n[k] && !p[k];
      if (edge('up')) r.up = true;
      if (edge('down')) r.down = true;
      if (edge('left')) r.left = true;
      if (edge('right')) r.right = true;
      if (edge(0) || edge(2)) r.confirm = true;
      if (edge(9)) r.start = r.confirm = true;
      if (edge(1)) r.back = true;
      if (edge(3)) r.alt = true;
    }
    if (side === undefined || side === 0) this.touch.menu(r);
    return r;
  }
}

// ---------------------------------------------------------------------------------
// Touch controls: drawn in game pixels; hit-tested in canvas logical coordinates.
// ---------------------------------------------------------------------------------
class Touch {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.visible = false;
    this.pointers = new Map();
    this.stick = null; // {id, cx, cy, x, y}
    this.btnState = {};
    this.btnPrev = {};
    this.layout = null;
    this.scheme = 'modern';
    this.autoOn = false;
    this.pausePressed = false;
    this.menuDirPrev = 5;
    this.menuDir = 5;
    this.menuEdges = {};
    this.toCanvas = null;
  }
  attach(canvas, toCanvas) {
    this.toCanvas = toCanvas;
    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this.down(e), opts);
    canvas.addEventListener('pointermove', (e) => this.move(e), opts);
    canvas.addEventListener('pointerup', (e) => this.up(e), opts);
    canvas.addEventListener('pointercancel', (e) => this.up(e), opts);
    canvas.addEventListener('lostpointercapture', (e) => this.up(e), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  down(e) {
    e.preventDefault();
    const p = this.toCanvas(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      this.enabled = true;
      this.input.lastDevice = 'touch';
    }
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) { /* noop */ }
    const ptr = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, btn: null, stick: false, type: e.pointerType, t: performance.now() };
    this.pointers.set(e.pointerId, ptr);
    if (this.visible && this.layout) {
      const L = this.layout;
      const b = this.hitButton(p.x, p.y);
      if (b) {
        ptr.btn = b.id;
        if (b.id === 'auto') this.autoOn = !this.autoOn;
        if (b.id === 'pause') this.pausePressed = true;
      } else if (L.stickZone && inRect(p, L.stickZone)) {
        ptr.stick = true;
        this.stick = { id: e.pointerId, cx: L.fixedStick ? L.stickC.x : p.x, cy: L.fixedStick ? L.stickC.y : p.y, x: p.x, y: p.y };
      }
    }
    this.input.taps.push({ x: p.x, y: p.y, type: e.pointerType, consumed: !!(ptr.btn || ptr.stick) });
  }
  move(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    e.preventDefault();
    const p = this.toCanvas(e.clientX, e.clientY);
    ptr.x = p.x;
    ptr.y = p.y;
    if (ptr.stick && this.stick) {
      this.stick.x = p.x;
      this.stick.y = p.y;
      // drag the floating base along if pulled far
      const L = this.layout;
      const R = L ? L.stickR : 24;
      const dx = p.x - this.stick.cx, dy = p.y - this.stick.cy;
      const d = Math.hypot(dx, dy);
      if (d > R * 1.6 && !(L && L.fixedStick)) {
        this.stick.cx = p.x - (dx / d) * R * 1.6;
        this.stick.cy = p.y - (dy / d) * R * 1.6;
      }
    } else if (ptr.btn && ptr.btn !== 'auto' && ptr.btn !== 'pause') {
      const b = this.hitButton(p.x, p.y, true);
      if (b && b.id !== 'auto' && b.id !== 'pause') ptr.btn = b.id;
    }
  }
  up(e) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    if (this.stick && this.stick.id === e.pointerId) this.stick = null;
    this.pointers.delete(e.pointerId);
  }
  hitButton(x, y, slide) {
    if (!this.layout) return null;
    let best = null, bd = 1e9;
    for (const b of this.layout.buttons) {
      const d = Math.hypot(x - b.x, y - b.y);
      const r = b.r * (slide ? 1.15 : 1.3);
      if (d <= r && d < bd) {
        best = b;
        bd = d;
      }
    }
    return best;
  }
  stickDir() {
    if (!this.stick) return 5;
    const dx = this.stick.x - this.stick.cx, dy = this.stick.y - this.stick.cy;
    const d = Math.hypot(dx, dy);
    if (d < 6) return 5;
    const a = Math.atan2(-dy, dx); // up positive
    const oct = Math.round(a / (Math.PI / 4));
    const map = { 0: 6, 1: 9, 2: 8, 3: 7, 4: 4, '-4': 4, '-3': 1, '-2': 2, '-1': 3 };
    return map[oct];
  }
  poll() {
    this.btnPrev = this.btnState;
    const s = {};
    for (const p of this.pointers.values()) if (p.btn) s[p.btn] = true;
    this.btnState = s;
    this.menuDirPrev = this.menuDir;
    this.menuDir = this.stickDir();
  }
  endFrame() {
    this.pausePressed = false;
  }
  apply(inp) {
    if (!this.visible) return;
    const d = this.stickDir();
    if ([7, 8, 9].includes(d)) inp.up = true;
    if ([1, 2, 3].includes(d)) inp.down = true;
    if ([1, 4, 7].includes(d)) inp.left = true;
    if ([3, 6, 9].includes(d)) inp.right = true;
    for (const b in this.btnState) {
      if (b === 'auto' || b === 'pause') continue;
      inp.hold[b] = true;
      if (!this.btnPrev[b]) inp.press[b] = true;
    }
    if (this.autoOn) inp.hold.auto = true;
  }
  menu(r) {
    if (!this.visible) return;
    const d = this.menuDir, pd = this.menuDirPrev;
    if (d !== pd) {
      if ([7, 8, 9].includes(d)) r.up = true;
      if ([1, 2, 3].includes(d)) r.down = true;
      if ([1, 4, 7].includes(d)) r.left = true;
      if ([3, 6, 9].includes(d)) r.right = true;
    }
    const edge = (b) => this.btnState[b] && !this.btnPrev[b];
    if (edge('l') || edge('lp') || edge('lk') || edge('sp')) r.confirm = true;
    if (edge('m') || edge('mp') || edge('mk')) r.back = true;
  }

  // Build layout. area: {x,y,w,h} region where controls live; overlay: drawn over game
  buildLayout(W, H, portrait, scheme, gameH) {
    this.scheme = scheme;
    const buttons = [];
    let stickZone, stickC, stickR, fixedStick = false;
    if (portrait) {
      const top = gameH + 4;
      const h = H - top;
      const cy = top + h * 0.5;
      stickR = 30;
      stickC = { x: 74, y: cy + 10 };
      stickZone = { x: 0, y: top + 24, w: W * 0.45, h: h - 24 };
      fixedStick = false;
      const bx = W - 92, by = cy + 6;
      const R = 19;
      if (scheme === 'modern') {
        buttons.push({ id: 'l', label: 'L', x: bx - 40, y: by + 20, r: R, c: '#40a0ff' });
        buttons.push({ id: 'm', label: 'M', x: bx - 4, y: by - 6, r: R, c: '#ffd040' });
        buttons.push({ id: 'h', label: 'H', x: bx + 36, y: by - 30, r: R, c: '#ff5050' });
        buttons.push({ id: 'sp', label: 'SP', x: bx + 44, y: by + 24, r: R + 3, c: '#c060ff' });
      } else {
        const lbl = { lp: 'LP', mp: 'MP', hp: 'HP', lk: 'LK', mk: 'MK', hk: 'HK' };
        ['lp', 'mp', 'hp'].forEach((id, i) => buttons.push({ id, label: lbl[id], x: bx - 44 + i * 40, y: by - 22 - i * 6, r: 17, c: ['#40a0ff', '#ffd040', '#ff5050'][i] }));
        ['lk', 'mk', 'hk'].forEach((id, i) => buttons.push({ id, label: lbl[id], x: bx - 40 + i * 40, y: by + 20 - i * 6, r: 17, c: ['#40a0ff', '#ffd040', '#ff5050'][i] }));
      }
      const sy = top + 16;
      const sys = [['throw', 'THROW', '#a0a0c0'], ['parry', 'PARRY', '#60e090'], ['impact', 'IMPACT', '#ffa030'], ['super', 'SUPER', '#ff60e0']];
      sys.forEach(([id, label, c], i) => buttons.push({ id, label, x: W / 2 - 12 + (i - 1.5) * 44, y: sy + 6, r: 13, c, small: true }));
      if (scheme === 'modern') buttons.push({ id: 'auto', label: 'AUTO', x: 30, y: sy + 6, r: 13, c: '#80ff80', small: true, toggle: true });
      buttons.push({ id: 'taunt', label: 'TAUNT', x: W - 22, y: H - 22, r: 11, c: '#808090', small: true });
      buttons.push({ id: 'pause', label: 'II', x: W - 26, y: sy + 6, r: 10, c: '#808090', small: true });
    } else {
      stickR = 22;
      stickZone = { x: 0, y: 70, w: W * 0.42, h: H - 70 };
      stickC = { x: 46, y: H - 46 };
      const R = 13;
      const cx = W - 58, cy = H - 46;
      if (scheme === 'modern') {
        buttons.push({ id: 'l', label: 'L', x: cx - 30, y: cy + 22, r: R, c: '#40a0ff' });
        buttons.push({ id: 'm', label: 'M', x: cx - 20, y: cy - 8, r: R, c: '#ffd040' });
        buttons.push({ id: 'h', label: 'H', x: cx + 10, y: cy - 26, r: R, c: '#ff5050' });
        buttons.push({ id: 'sp', label: 'SP', x: cx + 20, y: cy + 14, r: R + 3, c: '#c060ff' });
      } else {
        const lbl = { lp: 'LP', mp: 'MP', hp: 'HP', lk: 'LK', mk: 'MK', hk: 'HK' };
        ['lp', 'mp', 'hp'].forEach((id, i) => buttons.push({ id, label: lbl[id], x: W - 106 + i * 29, y: H - 62 - i * 5, r: 12, c: ['#40a0ff', '#ffd040', '#ff5050'][i] }));
        ['lk', 'mk', 'hk'].forEach((id, i) => buttons.push({ id, label: lbl[id], x: W - 100 + i * 29, y: H - 30 - i * 5, r: 12, c: ['#40a0ff', '#ffd040', '#ff5050'][i] }));
      }
      const sy = H - 104;
      buttons.push({ id: 'parry', label: 'PARRY', x: W - 120, y: sy + 14, r: 10, c: '#60e090', small: true });
      buttons.push({ id: 'impact', label: 'IMPCT', x: W - 94, y: sy + 2, r: 10, c: '#ffa030', small: true });
      buttons.push({ id: 'throw', label: 'THROW', x: W - 66, y: sy - 6, r: 10, c: '#a0a0c0', small: true });
      buttons.push({ id: 'super', label: 'SUPER', x: W - 30, y: sy - 8, r: 12, c: '#ff60e0', small: true });
      if (scheme === 'modern') buttons.push({ id: 'auto', label: 'AUTO', x: 18, y: 64, r: 10, c: '#80ff80', small: true, toggle: true });
      buttons.push({ id: 'pause', label: 'II', x: W / 2, y: 52, r: 9, c: '#808090', small: true, top: true });
    }
    this.layout = { buttons, stickZone, stickC, stickR, fixedStick, portrait };
  }

  draw(g, meterFull, inFight, menuMode) {
    if (!this.visible || !this.layout) return;
    const L = this.layout;
    const alpha = L.portrait ? 1 : 0.55;
    g.globalAlpha = alpha;
    // stick
    const sc = this.stick ? { x: this.stick.cx, y: this.stick.cy } : L.stickC;
    const R = L.stickR;
    circle(g, sc.x, sc.y, R + 2, '#140c1c');
    circle(g, sc.x, sc.y, R, L.portrait ? '#2a2a3a' : '#303048');
    ring(g, sc.x, sc.y, R - 3, '#505070');
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) rect(g, sc.x + dx * (R - 7) - 1, sc.y + dy * (R - 7) - 1, 3, 3, '#606080');
    let kx = sc.x, ky = sc.y;
    if (this.stick) {
      const dx = this.stick.x - sc.x, dy = this.stick.y - sc.y;
      const d = Math.hypot(dx, dy);
      const m = Math.min(d, R * 0.6);
      if (d > 0) {
        kx += (dx / d) * m;
        ky += (dy / d) * m;
      }
    }
    circle(g, kx, ky + 2, R * 0.5 + 1, '#140c1c');
    circle(g, kx, ky, R * 0.5 + 1, '#140c1c');
    circle(g, kx, ky, R * 0.5, '#e02838');
    circle(g, kx - 2, ky - 2, R * 0.22, '#ff8090');
    if (!inFight && !L.portrait) {
      g.globalAlpha = 1;
      return;
    }
    for (const b of L.buttons) {
      if (b.id === 'pause' && !inFight) continue;
      if (menuMode && (b.id === 'auto' || b.id === 'taunt')) continue;
      const on = this.btnState[b.id] || (b.toggle && this.autoOn);
      const glow = b.id === 'super' && meterFull;
      const r = b.r;
      circle(g, b.x, b.y + (on ? 0 : 2), r + 1, '#140c1c');
      circle(g, b.x, b.y + (on ? 1 : 0), r + 1, '#140c1c');
      circle(g, b.x, b.y + (on ? 1 : 0), r, on ? shadeC(b.c) : b.c);
      if (!on) circle(g, b.x - r * 0.3, b.y - r * 0.3, r * 0.35, lightC(b.c));
      if (glow && Math.floor(performance.now() / 150) % 2) ring(g, b.x, b.y, r + 3, '#ffffff');
      drawText(g, b.label, b.x, b.y - (b.small ? 2 : 3) + (on ? 1 : 0), { font: b.small || b.label.length > 1 ? 'small' : 'big', color: '#140c1c', align: 'center' });
    }
    g.globalAlpha = 1;
  }
}

function inRect(p, r) {
  return p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;
}
function shadeC(c) {
  const n = parseInt(c.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.6).toString(16).padStart(2, '0')).join('');
}
function lightC(c) {
  const n = parseInt(c.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * 0.5).toString(16).padStart(2, '0')).join('');
}
