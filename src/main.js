// Boot, canvas scaling, fixed-step loop, screen stack, taps, PWA registration.
import { Input } from './input.js';
import { Save } from './save.js';
import { Sound } from './audio.js';
import { TitleScreen, FightScreen, PauseScreen, DemoScreen } from './screens.js';
import { drawText } from './font.js';
import { rect, fillPoly } from './fx.js';
import { tickSprites } from './sprites.js';

const GAME_H = 216;
const MIN_W = 384;
const MAX_W = 480;
const STEP = 1000 / 60;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.g = this.canvas.getContext('2d', { alpha: false });
    this.crt = document.getElementById('crt');
    this.probe = document.getElementById('safe');
    Save.load();
    this.input = new Input(this.canvas);
    this.input.touch.attach(this.canvas, (x, y) => this.toCanvas(x, y));
    this.stack = [];
    this.regions = [];
    this.collecting = false;
    this.freeTaps = [];
    this.t = 0;
    this.touchMode = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 1;
    this.W = MIN_W;
    this.H = GAME_H;
    this.gx = 0;
    this.gy = 0;
    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.showInstallHint = iOS && !navigator.standalone && !window.matchMedia('(display-mode: standalone)').matches;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    const unlock = () => Sound.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'mousedown']) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat && !(this.top() instanceof FightScreen)) this.toggleFullscreen();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.top() instanceof FightScreen && !this.top().result) this.push(new PauseScreen(this, this.top()));
    });
    this.applySettings();
    this.autoplay = new URLSearchParams(location.search).has('autoplay');
    this.go(this.autoplay ? new DemoScreen(this) : new TitleScreen(this));
    this.last = performance.now();
    this.acc = 0;
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ---------- screens ----------
  top() {
    return this.stack[this.stack.length - 1];
  }
  go(s) {
    for (const x of this.stack) x.leave && x.leave();
    this.stack = s ? [s] : [];
    this.regions = [];
    this.freeTaps = [];
  }
  push(s) {
    this.stack.push(s);
    this.regions = [];
  }
  pop() {
    const s = this.stack.pop();
    s && s.leave && s.leave();
    this.regions = [];
  }
  menu(side) {
    return this.input.menu(side);
  }
  anyTap() {
    return this.freeTaps.length > 0;
  }
  region(x, y, w, h, cb) {
    if (this.collecting) this.regions.push({ x, y, w, h, cb });
  }

  // ---------- settings ----------
  controlsVisible() {
    const s = Save.settings.touchControls;
    return s === 'on' || (s === 'auto' && (this.touchMode || this.input.touch.enabled));
  }
  applySettings() {
    const s = Save.settings;
    Sound.setVolume(s.music, s.sfx);
    Sound.setAnnouncer(s.announcer);
    this.crt.style.display = s.crt ? 'block' : 'none';
    this.layoutTouch();
  }
  layoutTouch() {
    const s = Save.settings;
    const scheme = s.scheme1 === 'auto' ? s.touchScheme : s.scheme1;
    this.input.touch.buildLayout(this.portrait ? this.cw : this.W, this.portrait ? this.ch : this.H, this.portrait, scheme, GAME_H);
  }
  toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(() => {});
    else if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
  }

  // ---------- layout ----------
  safeInsets() {
    const cs = getComputedStyle(this.probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const ins = this.safeInsets();
    const aw = Math.max(100, vw - ins.l - ins.r), ah = Math.max(100, vh - ins.t - ins.b);
    const portrait = this.touchMode && ah > aw * 1.15;
    this.portrait = portrait;
    let cw, ch, scale;
    if (portrait) {
      cw = MIN_W;
      ch = Math.max(GAME_H + 180, Math.round((cw * ah) / aw));
      scale = Math.min(aw / cw, ah / ch);
      this.W = MIN_W;
    } else {
      const w = Math.round((GAME_H * aw) / ah);
      this.W = Math.max(MIN_W, Math.min(MAX_W, w));
      cw = this.W;
      ch = GAME_H;
      scale = Math.min(aw / cw, ah / ch);
    }
    this.H = GAME_H;
    this.cw = cw;
    this.ch = ch;
    this.gx = 0;
    this.gy = 0;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.g.imageSmoothingEnabled = false;
    const cssW = Math.floor(cw * scale), cssH = Math.floor(ch * scale);
    const left = Math.round(ins.l + (aw - cssW) / 2), top = Math.round(ins.t + (portrait ? 0 : (ah - cssH) / 2));
    Object.assign(this.canvas.style, { width: cssW + 'px', height: cssH + 'px', left: left + 'px', top: top + 'px' });
    Object.assign(this.crt.style, { width: cssW + 'px', height: (portrait ? Math.floor(GAME_H * scale) : cssH) + 'px', left: left + 'px', top: top + 'px', backgroundSize: '100% ' + scale + 'px' });
    this.scale = scale;
    this.layoutTouch();
  }
  toCanvas(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * this.canvas.width, y: ((cy - r.top) / r.height) * this.canvas.height };
  }

  // ---------- loop ----------
  frame(ts) {
    let dt = ts - this.last;
    this.last = ts;
    if (dt > 250) dt = STEP;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP - 0.5 && n < 4) {
      this.update();
      this.acc -= STEP;
      n++;
    }
    if (n === 4) this.acc = 0;
    if (n > 0) this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  processTaps() {
    this.freeTaps = [];
    for (const tap of this.input.taps) {
      if (tap.consumed && !this.portrait) continue;
      if (tap.consumed && this.portrait && tap.y > GAME_H) continue;
      const x = tap.x - this.gx, y = tap.y - this.gy;
      if (x < 0 || y < 0 || x > this.W || y > this.H) continue;
      let hit = null;
      for (let i = this.regions.length - 1; i >= 0; i--) {
        const r = this.regions[i];
        if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) {
          hit = r;
          break;
        }
      }
      if (hit) hit.cb();
      else this.freeTaps.push({ x, y });
    }
  }

  update() {
    this.t++;
    if (this.t % 60 === 0) tickSprites();
    this.input.poll();
    const top = this.top();
    const fight = top instanceof FightScreen;
    const tv = this.controlsVisible();
    this.input.touch.visible = tv && (this.portrait || fight);
    this.processTaps();
    if (top) top.update();
    this.input.endFrame();
  }

  render() {
    const g = this.g;
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.cw, this.ch);
    if (this.portrait) this.drawPanel(g);
    g.save();
    g.translate(this.gx, this.gy);
    g.beginPath();
    g.rect(0, 0, this.W, this.H);
    g.clip();
    // draw from the deepest non-overlay screen up
    let start = this.stack.length - 1;
    while (start > 0 && this.stack[start].overlay) start--;
    for (let i = start; i < this.stack.length; i++) {
      const isTop = i === this.stack.length - 1;
      if (isTop) {
        this.regions = [];
        this.collecting = true;
      }
      this.stack[i].draw(g);
      this.collecting = false;
    }
    g.restore();
    const top = this.top();
    const fight = top instanceof FightScreen || (top instanceof PauseScreen);
    if (this.input.touch.visible) this.input.touch.draw(g, fight && this.stack[0].hudMeterFull && this.stack[0].hudMeterFull(), fight, !fight);
  }

  drawPanel(g) {
    const W = this.cw, H = this.ch, top = GAME_H;
    rect(g, 0, top, W, H - top, '#1a1228');
    for (let y = top; y < H; y += 6) rect(g, 0, y, W, 1, '#1e152e');
    rect(g, 0, top, W, 3, '#e02838');
    rect(g, 0, top + 3, W, 1, '#140c1c');
    const sy = H - 14;
    drawText(g, 'HOSPITAL FIGHTER', W / 2, sy, { font: 'small', color: '#5a4a78', align: 'center' });
    // speaker grille + plate
    const gy = top + 44, gh = Math.max(0, Math.min(60, H - top - 250));
    if (gh > 12) {
      for (let y = gy; y < gy + gh; y += 5) for (let x = W / 2 - 60; x < W / 2 + 60; x += 5) rect(g, x, y, 2, 2, '#0c0816');
      const top2 = this.top();
      const fighting = top2 instanceof FightScreen || top2 instanceof PauseScreen;
      drawText(g, fighting ? 'TAP II TO PAUSE' : 'STICK + L TO NAVIGATE', W / 2, gy + gh + 6, { font: 'small', color: '#4a3c66', align: 'center' });
    }
    for (const [x, y] of [[8, top + 10], [W - 10, top + 10], [8, H - 10], [W - 10, H - 10]]) {
      rect(g, x - 2, y - 2, 5, 5, '#0e0a18');
      rect(g, x - 1, y - 1, 3, 3, '#5a4a78');
      rect(g, x, y - 1, 1, 3, '#2a2040');
    }
  }
}

const a11y = document.getElementById('a11y');
window.__a11y = (t) => {
  if (a11y) a11y.textContent = String(t).toLowerCase();
};

function start() {
  try {
    window.__game = new Game();
  } catch (e) {
    const b = document.getElementById('boot');
    if (b) b.textContent = 'CODE BLUE: ' + e.message;
    throw e;
  }
}
start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
