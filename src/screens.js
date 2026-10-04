// All game screens and mode flows.
import { drawText, measureText, wrapText } from './font.js';
import { rect, fillPoly, line } from './fx.js';
import { panel, header, footer, stageBG, stripeBG, drawLogo, Menu, textBox, button, O, MOTION_TEXT, MODERN_TEXT } from './ui.js';
import { FIGHTERS, FIGHTER_BY_ID, DLC, BOSSES } from './fighters.js';
import { lookFor } from './looks.js';
import { drawFighterSprite, getSprite, getPortrait } from './sprites.js';
import { POSE_NAMES } from './poses.js';
import { STAGES, drawStage, preloadStage } from './stages.js';
import { Match } from './match.js';
import { Sound } from './audio.js';
import { Save, RANKS } from './save.js';

const HOME_STAGE = {
  trauma: 'er', nightingale: 'icu', surgeon: 'or', anesth: 'or', pharmacist: 'pharmacy', radiologist: 'mri', ortho: 'garage', peds: 'waiting',
  psych: 'breakroom', admin: 'admin', janitor: 'cafeteria', paramedic: 'er', labtech: 'icu', chaplain: 'morgue', zero: 'waiting', it: 'mri',
  dietitian: 'cafeteria', chief: 'helipad',
};
const DIFF_NAMES = ['', 'INTERN', 'RESIDENT', 'ATTENDING', 'CHIEF'];

function idlePose(t, off = 0) {
  return ['idle1', 'idle2', 'idle3', 'idle2'][Math.floor((t + off) / 9) % 4];
}
function darken(c, k = 0.5) {
  const n = parseInt(c.slice(1), 16);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('');
}
function bigSprite(g, look, pose, x, y, facing, scale, variant) {
  const sp = getSprite(look, pose, variant || '');
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.scale(facing * scale, scale);
  g.drawImage(sp.c, -sp.ox, -sp.oy);
  g.restore();
}
function schemeFor(game, side) {
  const s = Save.settings;
  if (side === 1) return s.scheme2 === 'modern' ? 'modern' : 'classic';
  if (s.scheme1 === 'auto') return game.touchMode ? s.touchScheme : 'classic';
  return s.scheme1;
}

// =====================================================================
export class TitleScreen {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.accepted = 0;
    this.pair = this.pickPair();
    Sound.music('title');
  }
  pickPair() {
    const a = FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
    let b;
    do b = FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)]; while (b === a);
    return [a, b];
  }
  update() {
    this.t++;
    const g = this.game;
    if (this.t % 300 === 0) this.pair = this.pickPair();
    if (this.t > 60 * 25 && !this.accepted) return g.go(new DemoScreen(g));
    if (this.accepted) {
      if (++this.accepted > 50) g.go(new MainMenu(g));
      return;
    }
    const m = g.menu();
    if ((m.confirm || m.start || g.anyTap()) && this.t > 20) {
      Sound.unlock();
      Sound.sfx('coin');
      Sound.say('Hospital Fighter!');
      Sound.music('title');
      this.accepted = 1;
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stageBG(g, this.game, 'er', true, 0.45, 0.6);
    // fighters
    const [a, b] = this.pair;
    const pose = (this.t % 300) < 150 ? idlePose(this.t) : (this.t % 300) < 160 ? 'hpW' : (this.t % 300) < 175 ? 'hpA' : idlePose(this.t);
    const pose2 = (this.t % 300) > 200 && (this.t % 300) < 225 ? 'hkA' : idlePose(this.t, 5);
    bigSprite(g, lookFor(a.id), pose, 64, H + 30, 1, 2);
    bigSprite(g, lookFor(b.id), pose2, W - 64, H + 30, -1, 2);
    g.globalAlpha = 0.6;
    rect(g, 0, 0, W, 34, '#000000');
    g.globalAlpha = 1;
    drawLogo(g, W / 2, 18, this.t, 1);
    drawText(g, 'ST. WORLD WARRIOR MEDICAL CENTER', W / 2, 114, { font: 'small', color: '#c0d8ff', outline: O, align: 'center' });
    if (this.accepted) {
      if (this.accepted % 6 < 4) drawText(g, 'CO-PAY ACCEPTED!', W / 2, 140, { scale: 2, color: '#80ff80', outline: O, align: 'center' });
    } else if (Math.floor(this.t / 30) % 2 === 0) {
      drawText(g, this.game.touchMode ? 'TAP TO START' : 'PRESS START', W / 2, 138, { scale: 2, color: '#ffffff', outline: O, align: 'center' });
    }
    drawText(g, 'INSERT CO-PAY', W / 2, 160, { color: '#ffd040', outline: O, align: 'center' });
    rect(g, 0, H - 12, W, 12, 'rgba(0,0,0,0.7)');
    drawText(g, '(C) 2026 ST. WORLD WARRIOR MED. NOT A REAL HOSPITAL. A PARODY.', W / 2, H - 9, { font: 'small', color: '#9088b0', align: 'center' });
    if (!this.game.touchMode) drawText(g, 'F: FULLSCREEN', W - 6, H - 22, { font: 'small', color: '#7068a0', outline: O, align: 'right' });
    if (this.game.showInstallHint) {
      drawText(g, 'TIP: SHARE > ADD TO HOME SCREEN FOR FULL SCRUBS', W / 2, H - 20, { font: 'small', color: '#80c0ff', outline: O, align: 'center' });
    }
  }
}

export class DemoScreen {
  constructor(game, cfgOverride) {
    this.game = game;
    this.t = 0;
    const ids = FIGHTERS.map((f) => f.id);
    const a = ids[Math.floor(Math.random() * ids.length)];
    let b = ids[Math.floor(Math.random() * ids.length)];
    if (b === a) b = ids[(ids.indexOf(a) + 5) % ids.length];
    const stages = STAGES.filter((s) => !s.locked);
    const st = stages[Math.floor(Math.random() * stages.length)];
    const cfg = Object.assign({ mode: 'demo', p1: { id: a, ctrl: 'cpu', cpuLevel: 3 }, p2: { id: b, ctrl: 'cpu', cpuLevel: 3 }, stage: st.id, night: Math.random() < 0.5, rounds: 2, timer: 99, hazards: true, skipIntro: false }, cfgOverride || {});
    for (const n of POSE_NAMES) {
      getSprite(lookFor(cfg.p1.id), n);
      getSprite(lookFor(cfg.p2.id), n);
    }
    this.fight = new FightScreen(game, cfg, { onEnd: () => (this.over = true) });
    Sound.setAnnouncer(false);
  }
  leave() {
    Sound.setAnnouncer(Save.settings.announcer);
  }
  update() {
    this.t++;
    const g = this.game;
    const m = g.menu();
    if (!this.game.autoplay && (m.confirm || m.start || m.back || g.anyTap() || g.input.anyKey)) {
      Sound.stopMusic(0.2);
      return g.go(new TitleScreen(g));
    }
    this.fight.match.update([null, null]);
    if (this.fight.result && ++this.endT > 90) g.go(this.game.autoplay ? new DemoScreen(g) : new TitleScreen(g));
    if (this.fight.result && !this.endT) this.endT = 1;
  }
  draw(g) {
    this.fight.match.settings = { touch: false, shake: Save.settings.shake, callouts: true };
    this.fight.match.draw(g, this.game.W, this.game.H);
    if (Math.floor(this.t / 40) % 2 === 0) drawText(g, 'DEMO PLAY - ' + (this.game.touchMode ? 'TAP' : 'PRESS START'), this.game.W / 2, 186, { color: '#ffffff', outline: O, align: 'center' });
  }
}

// =====================================================================
export class MainMenu {
  constructor(game, sel = 0) {
    this.game = game;
    this.t = 0;
    const go = (s) => () => game.go(s);
    this.menu = new Menu([
      { label: 'GRAND ROUNDS', desc: 'STORY MODE. FIGHT YOUR WAY FROM THE ER TO THE BOARDROOM. RIVALS, CHOICES AND MULTIPLE ENDINGS.', onSelect: () => game.go(new CharSelect(game, { mode: 'arcade', story: true })) },
      { label: 'ARCADE', desc: 'CLASSIC 6-FIGHT LADDER. NO CUTSCENES. NO LUNCH BREAK.', onSelect: () => game.go(new CharSelect(game, { mode: 'arcade', story: false })) },
      { label: 'VERSUS', desc: 'LOCAL 2-PLAYER OR VS CPU. SETTLE INTERDEPARTMENTAL DISPUTES THE OLD-FASHIONED WAY.', onSelect: () => game.push(new ChoiceScreen(game, 'VERSUS', [
        { label: 'VS CPU', onSelect: () => game.go(new CharSelect(game, { mode: 'versus', p2: 'cpu' })) },
        { label: '2 PLAYERS (LOCAL)', onSelect: () => game.go(new CharSelect(game, { mode: 'versus', p2: 'human' })) },
      ], game.touchMode ? '2P NEEDS A KEYBOARD OR GAMEPADS' : 'P2: ARROWS + NUMPAD, OR GAMEPAD')) },
      { label: 'TRAINING', desc: 'PRACTICE ON A VERY PATIENT PATIENT. HITBOXES, FRAME DATA AND INFINITE ADRENALINE.', onSelect: () => game.go(new CharSelect(game, { mode: 'training', p2: 'cpu' })) },
      { label: 'EXTREME BATTLE', desc: 'MODIFIERS: OUTBREAK, BUDGET CUTS, FULL CODE, JCAHO INSPECTION, FISH DAY.', onSelect: go(new ExtremeScreen(game)) },
      { sep: true },
      { label: 'ONLINE', desc: 'RANKED, CASUAL, ROLLBACK NETCODE, CROSSPLAY. PENDING PRIOR AUTHORIZATION.', color: '#a098c0', onSelect: () => game.push(new JokeScreen(game, 'online')) },
      { label: 'RESIDENCY', desc: 'CREATE AN INTERN. LEARN FROM MENTORS. NEVER SLEEP.', color: '#a098c0', onSelect: () => game.push(new JokeScreen(game, 'residency')) },
      { label: 'BREAK ROOM HUB', desc: 'AVATARS, EVENTS AND HIPAA-COMPLIANT CHAT.', color: '#a098c0', onSelect: () => game.push(new JokeScreen(game, 'hub')) },
      { label: 'SHIFT PASS & SHOP', desc: 'FREE AND PREMIUM TIERS. PAY WITH CO-PAYS. NO PAY-TO-WIN (WE CHECKED).', color: '#a098c0', onSelect: () => game.push(new JokeScreen(game, 'pass')) },
      { sep: true },
      { label: 'ORDERS & RANK', desc: 'DAILY ORDERS, CAREER RANK AND UNLOCKS.', onSelect: () => game.push(new OrdersScreen(game)) },
      { label: 'HOW TO PLAY', desc: 'CONTROLS, CHART GAUGE, ADRENALINE, AND OTHER THINGS NOBODY TAUGHT YOU IN SCHOOL.', onSelect: () => game.push(new HowToScreen(game)) },
      { label: 'OPTIONS', desc: 'CONTROLS, DIFFICULTY, AUDIO, ACCESSIBILITY.', onSelect: () => game.push(new OptionsScreen(game)) },
      { label: 'CREDITS', desc: 'THE PEOPLE RESPONSIBLE. PLEASE DIRECT COMPLAINTS TO RISK MANAGEMENT.', onSelect: () => game.go(new CreditsScreen(game, () => game.go(new MainMenu(game)))) },
      { label: 'INSTALL APP', desc: 'ADD HOSPITAL FIGHTER TO YOUR DEVICE. WORKS OFFLINE. NO PRIOR AUTH NEEDED.', color: '#80ff80', hidden: !window.__installPrompt, onSelect: () => {
        const p = window.__installPrompt;
        if (!p) return;
        p.prompt();
        p.userChoice.finally(() => { window.__installPrompt = null; game.go(new MainMenu(game)); });
      } },
    ], { sel, lineH: 11 });
    this.hero = FIGHTERS[Math.floor(Math.random() * FIGHTERS.length)];
    Sound.music('title');
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      this.game.go(new TitleScreen(this.game));
      return;
    }
    this.menu.update(m);
  }
  draw(g) {
    const { W, H } = this.game;
    stageBG(g, this.game, 'icu', false, 0.62, 0.4);
    const r = Save.rank();
    header(g, W, 'MAIN MENU', `RANK: ${r.name}   ${Save.data.copays} CO-PAYS`);
    panel(g, 10, 26, 140, 176);
    this.menu.draw(g, this.game, 20, 32, 122, 15);
    // right info
    const x = 160, w = W - x - 10;
    panel(g, x, 26, w, 60, { bg: '#140e24' });
    const it = this.menu.cur;
    drawText(g, it.label, x + 6, 32, { color: '#ffe040', outline: O });
    textBox(g, it.desc || '', x + 6, 44, w - 12, { font: 'small', color: '#d8d0f0' });
    // hero
    bigSprite(g, lookFor(this.hero.id), idlePose(this.t), x + w / 2 + 40, H - 8, -1, 1.5);
    drawText(g, this.hero.name, x + 8, H - 34, { font: 'small', color: '#ffffff', outline: O });
    drawText(g, '"' + this.hero.title + '"', x + 8, H - 26, { font: 'small', color: '#a8a0d0', outline: O });
    const o = Save.data.orders.list;
    drawText(g, 'TODAY\'S ORDERS: ' + o.filter((q) => q.done).length + '/' + o.length, x + 8, 92, { font: 'small', color: '#80e0ff', outline: O });
  }
}

export class ChoiceScreen {
  constructor(game, title, items, note) {
    this.game = game;
    this.title = title;
    this.note = note;
    this.menu = new Menu(items.concat([{ label: 'BACK', onSelect: () => game.pop() }]));
    this.overlay = true;
  }
  update() {
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.game.pop();
    }
    this.menu.update(m);
  }
  draw(g) {
    const { W, H } = this.game;
    g.globalAlpha = 0.6;
    rect(g, 0, 0, W, H, '#000000');
    g.globalAlpha = 1;
    const w = 200, h = 26 + this.menu.items.length * 11 + (this.note ? 12 : 0);
    const x = Math.round(W / 2 - w / 2), y = Math.round(H / 2 - h / 2);
    panel(g, x, y, w, h);
    drawText(g, this.title, W / 2, y + 6, { color: '#ffe040', outline: O, align: 'center' });
    this.menu.draw(g, this.game, x + 16, y + 20, w - 32);
    if (this.note) drawText(g, this.note, W / 2, y + h - 10, { font: 'small', color: '#9088b0', align: 'center' });
  }
}

// =====================================================================
// Character select
// =====================================================================
export class CharSelect {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.t = 0;
    this.mode = opts.mode;
    const two = opts.p2 === 'human';
    game.input.humans = two ? 2 : 1;
    this.sides = [
      { cur: opts.prev ? FIGHTERS.findIndex((f) => f.id === opts.prev[0].id) : 0, locked: false, alt: false, human: true, lockT: 0 },
      { cur: opts.prev ? FIGHTERS.findIndex((f) => f.id === opts.prev[1].id) : 5, locked: this.mode === 'arcade', alt: false, human: two, lockT: 0 },
    ];
    this.cpuPick = !two && this.mode !== 'arcade';
    this.dlcMsg = 0;
    this.cols = 6;
    Sound.music('select');
  }
  slots() {
    return FIGHTERS.length + DLC.length + 1; // + random
  }
  update() {
    this.t++;
    if (this.dlcMsg > 0) this.dlcMsg--;
    const g = this.game;
    const n = FIGHTERS.length + DLC.length;
    for (let s = 0; s < 2; s++) {
      const S = this.sides[s];
      let m;
      if (s === 0) m = g.menu(this.sides[1].human ? 0 : undefined);
      else if (S.human) m = g.menu(1);
      else if (this.cpuPick && this.sides[0].locked && !S.locked) m = g.menu();
      else continue;
      if (S.locked) {
        if (m.back && S.lockT > 5) {
          S.locked = false;
          Sound.sfx('cancel');
        }
        S.lockT++;
        continue;
      }
      if (s === 0 && m.back && !(this.cpuPick && this.sides[0].locked)) {
        Sound.sfx('cancel');
        g.input.humans = 1;
        g.go(new MainMenu(g));
        return;
      }
      if (s === 1 && this.cpuPick && m.back) {
        this.sides[0].locked = false;
        Sound.sfx('cancel');
        continue;
      }
      const c = this.cols;
      let cur = S.cur;
      if (m.left) cur = cur % c === 0 ? cur + c - 1 : cur - 1;
      if (m.right) cur = cur % c === c - 1 ? cur - c + 1 : cur + 1;
      if (m.up) cur = cur - c < 0 ? cur + c * 4 - c : cur - c;
      if (m.down) cur = cur + c >= c * 4 ? cur % c : cur + c;
      if (cur >= n) cur = n - 1;
      if (cur !== S.cur) {
        S.cur = cur;
        Sound.sfx('select');
      }
      if (m.alt) {
        S.alt = !S.alt;
        Sound.sfx('select');
      }
      if (m.confirm) this.lock(s);
    }
    // taps on the grid: hit regions registered in draw
    const allLocked = this.sides[0].locked && this.sides[1].locked;
    if (allLocked) {
      this.doneT = (this.doneT || 0) + 1;
      if (this.doneT === 40) this.finish();
    } else this.doneT = 0;
  }
  lock(s) {
    const S = this.sides[s];
    if (S.cur >= FIGHTERS.length) {
      const d = DLC[S.cur - FIGHTERS.length];
      this.dlcMsg = 120;
      this.dlcText = d.name + ': ' + d.price + ' - ' + d.note + '. INSUFFICIENT CO-PAYS.';
      Sound.sfx('cancel');
      return;
    }
    S.locked = true;
    S.lockT = 0;
    const f = FIGHTERS[S.cur];
    // mirror match -> alt colors
    const o = this.sides[1 - s];
    if (o.locked && o.cur === S.cur && o.alt === S.alt) S.alt = !S.alt;
    Sound.sfx('confirm');
    Sound.say(f.name.toLowerCase().replace('dr.', 'doctor'));
  }
  random(s) {
    this.sides[s].cur = Math.floor(Math.random() * FIGHTERS.length);
    this.lock(s);
  }
  finish() {
    const g = this.game;
    const sel = this.sides.map((S) => ({ id: FIGHTERS[S.cur].id, alt: S.alt }));
    const opts = this.opts;
    if (this.mode === 'arcade') return startArcade(g, sel[0], opts.story);
    const p1 = { id: sel[0].id, alt: sel[0].alt, ctrl: 'human', scheme: schemeFor(g, 0) };
    const p2 = { id: sel[1].id, alt: sel[1].alt, ctrl: this.sides[1].human ? 'human' : this.mode === 'training' ? 'dummy' : 'cpu', scheme: schemeFor(g, 1), cpuLevel: Save.settings.difficulty };
    g.go(new StageSelect(g, {
      onBack: () => g.go(new CharSelect(g, Object.assign({}, opts, { prev: sel }))),
      onDone: (stage, night) => {
        const cfg = { mode: this.mode, p1, p2, stage, night, rounds: Save.settings.rounds, timer: this.mode === 'training' ? 0 : Save.settings.timer, hazards: Save.settings.hazards, mods: opts.mods };
        if (this.mode === 'training') g.go(new FightScreen(g, cfg, { onEnd: () => g.go(new MainMenu(g)) }));
        else g.go(new VSScreen(g, cfg, () => runVersusMatch(g, cfg, opts)));
      },
    }));
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.t, '#140c26', '#1c1234');
    header(g, W, this.mode === 'training' ? 'TRAINING: PICK YOUR STAFF' : 'SELECT YOUR SPECIALIST', this.cpuPick && this.sides[0].locked ? 'NOW PICK YOUR OPPONENT' : this.sides[1].human ? '2P: ARROWS / PAD 2' : '');
    const cw = 28, gap = 2;
    const gw = this.cols * (cw + gap);
    const gx = Math.round(W / 2 - gw / 2), gy = 26;
    // grid
    for (let i = 0; i < FIGHTERS.length + DLC.length; i++) {
      const cx = gx + (i % this.cols) * (cw + gap);
      const row = Math.floor(i / this.cols);
      const cy = gy + row * (cw + gap);
      const ch = row === 3 ? 16 : cw;
      const isDLC = i >= FIGHTERS.length;
      rect(g, cx - 1, cy - 1, cw + 2, ch + 2, O);
      if (isDLC) {
        rect(g, cx, cy, cw, ch, '#241c34');
        drawText(g, 'DLC', cx + cw / 2, cy + 2, { font: 'small', color: '#605880', align: 'center' });
        drawText(g, '$', cx + cw / 2, cy + 9, { font: 'small', color: '#80a060', align: 'center' });
      } else {
        const f = FIGHTERS[i];
        rect(g, cx, cy, cw, ch, darken(f.color, 0.45));
        rect(g, cx, cy, cw, 1, darken(f.color, 0.8));
        g.drawImage(getPortrait(lookFor(f.id), 'idle1', cw, cw), cx, cy);
      }
      this.game.region(cx, cy, cw, ch, () => {
        const s = this.cpuPick && this.sides[0].locked ? 1 : this.sides[0].locked && this.sides[1].human ? 1 : 0;
        if (this.sides[s].locked) return;
        if (this.sides[s].cur === i) this.lock(s);
        else {
          this.sides[s].cur = i;
          Sound.sfx('select');
        }
      });
    }
    // cursors
    for (let s = 1; s >= 0; s--) {
      const S = this.sides[s];
      if (s === 1 && !S.human && !(this.cpuPick && this.sides[0].locked)) continue;
      const cx = gx + (S.cur % this.cols) * (cw + gap);
      const row = Math.floor(S.cur / this.cols);
      const cy = gy + row * (cw + gap);
      const ch = row === 3 ? 16 : cw;
      const col = s === 0 ? '#ff3040' : '#3080ff';
      const blink = S.locked || Math.floor(this.t / 6) % 3 !== 0;
      if (blink) {
        rect(g, cx - 2, cy - 2, cw + 4, 2, col);
        rect(g, cx - 2, cy + ch, cw + 4, 2, col);
        rect(g, cx - 2, cy - 2, 2, ch + 4, col);
        rect(g, cx + cw, cy - 2, 2, ch + 4, col);
      }
      drawText(g, s === 0 ? '1P' : this.cpuPick ? 'CPU' : '2P', s === 0 ? cx - 1 : cx + cw + 1, cy - 4, { font: 'small', color: '#ffffff', outline: col, align: s === 0 ? 'left' : 'right' });
    }
    // random button
    const ry = gy + 3 * (cw + gap) + 20;
    button(g, this.game, gx + gw / 2 - 30, ry, 60, 11, 'RANDOM', () => {
      const s = this.cpuPick && this.sides[0].locked ? 1 : 0;
      if (!this.sides[s].locked) this.random(s);
    }, { font: 'small', color: '#3a2c58' });
    // info box
    const ib = { x: gx - 4, y: ry + 15, w: gw + 6, h: H - ry - 30 };
    panel(g, ib.x, ib.y, ib.w, ib.h, { bg: '#120c20' });
    const focusSide = this.cpuPick && this.sides[0].locked ? 1 : this.sides[0].locked && this.sides[1].human && !this.sides[1].locked ? 1 : 0;
    const fi = this.sides[focusSide].cur;
    if (this.dlcMsg > 0) {
      textBox(g, this.dlcText, ib.x + 4, ib.y + 4, ib.w - 8, { font: 'small', color: '#ff9090' });
    } else if (fi < FIGHTERS.length) {
      const f = FIGHTERS[fi];
      drawText(g, f.dept, ib.x + 4, ib.y + 4, { font: 'small', color: f.color === '#2e2c3c' ? '#9090c0' : f.color });
      textBox(g, f.bio, ib.x + 4, ib.y + 12, ib.w - 8, { font: 'small', color: '#d0c8e8' });
      let yy = ib.y + 29;
      for (const sp of f.specials) {
        if (yy > ib.y + ib.h - 6) break;
        drawText(g, sp.name, ib.x + 4, yy, { font: 'small', color: '#ffe080' });
        drawText(g, MOTION_TEXT[sp.input] + (sp.btn === 'p' ? 'P' : sp.btn === 'k' ? 'K' : 'P/K'), ib.x + ib.w - 4, yy, { font: 'small', color: '#a0d0ff', align: 'right' });
        yy += 6;
      }
    } else {
      const d = DLC[fi - FIGHTERS.length];
      drawText(g, d.name, ib.x + 4, ib.y + 4, { color: '#a098c0' });
      drawText(g, 'PRICE: ' + d.price, ib.x + 4, ib.y + 16, { font: 'small', color: '#80c080' });
      drawText(g, 'STATUS: ' + d.note, ib.x + 4, ib.y + 24, { font: 'small', color: '#c0a0a0' });
    }
    // side previews
    for (let s = 0; s < 2; s++) {
      const S = this.sides[s];
      const show = s === 0 || S.human || (this.cpuPick && this.sides[0].locked) || S.locked && this.mode !== 'arcade';
      const px = s === 0 ? Math.round(gx / 2) : Math.round(W - gx / 2);
      if (this.mode === 'arcade' && s === 1) {
        drawText(g, '???', px, 100, { scale: 2, color: '#403858', align: 'center' });
        drawText(g, 'CHALLENGERS', px, 120, { font: 'small', color: '#605880', align: 'center' });
        drawText(g, 'AWAIT', px, 127, { font: 'small', color: '#605880', align: 'center' });
        continue;
      }
      if (!show || S.cur >= FIGHTERS.length) continue;
      const f = FIGHTERS[S.cur];
      const look = lookFor(f.id, S.alt);
      const pose = S.locked ? (S.lockT < 40 ? (Math.floor(S.lockT / 20) % 2 ? 'win2' : 'win1') : 'win1') : idlePose(this.t, s * 7);
      const sc = gx > 120 ? 2 : 1.5;
      bigSprite(g, look, pose, px, H - 14, s === 0 ? 1 : -1, sc, S.locked && S.lockT < 6 ? 'flash' : '');
      const nameY = 24;
      const nm = f.name;
      const fitScale = measureText(nm).w > gx - 6 ? 'small' : 'big';
      drawText(g, nm, px, nameY, { font: fitScale, color: '#ffffff', outline: O, align: 'center' });
      drawText(g, f.title, px, nameY + 9, { font: 'small', color: '#b0a8d0', outline: O, align: 'center' });
      if (S.alt) drawText(g, 'ALT SCRUBS', px, nameY + 17, { font: 'small', color: '#80ff80', outline: O, align: 'center' });
      if (S.locked) drawText(g, 'READY!', px, H - 12, { color: '#ffe040', outline: O, align: 'center' });
    }
    footer(g, W, H, this.game.touchMode ? 'TAP TWICE TO PICK' : 'CONFIRM: U/ENTER  BACK: K/ESC  ALT SCRUBS: O');
  }
}

// =====================================================================
export class StageSelect {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.t = 0;
    this.list = [{ id: 'random', name: 'RANDOM', sub: 'LET TRIAGE DECIDE' }].concat(STAGES);
    this.sel = 1;
    this.night = false;
  }
  locked(s) {
    return s.locked && !Save.unlocked(s.id);
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.opts.onBack();
    }
    if (m.left || m.right) {
      this.sel = (this.sel + (m.right ? 1 : -1) + this.list.length) % this.list.length;
      Sound.sfx('select');
    }
    if (m.up || m.down || m.alt) {
      this.night = !this.night;
      Sound.sfx('select');
    }
    if (m.confirm) this.pick();
  }
  pick() {
    let s = this.list[this.sel];
    if (this.locked(s)) {
      Sound.sfx('cancel');
      return;
    }
    if (s.id === 'random') {
      const pool = STAGES.filter((x) => !this.locked(x));
      s = pool[Math.floor(Math.random() * pool.length)];
    }
    Sound.sfx('confirm');
    this.opts.onDone(s.id, this.night);
  }
  draw(g) {
    const { W, H } = this.game;
    const s = this.list[this.sel];
    const id = s.id === 'random' ? STAGES[Math.floor(this.t / 20) % STAGES.length].id : s.id;
    const camX = Math.round((Math.sin(this.t * 0.01) * 0.5 + 0.5) * (800 - W));
    drawStage(g, id, { camX, viewW: W, viewH: H, t: this.t, night: this.night, excite: 0.2, groundY: 194, worldW: 800 });
    if (this.locked(s)) {
      g.globalAlpha = 0.85;
      rect(g, 0, 0, W, H, '#000000');
      g.globalAlpha = 1;
      drawText(g, 'LOCKED', W / 2, 90, { scale: 2, color: '#a0a0a0', outline: O, align: 'center' });
      drawText(g, 'CLEAR GRAND ROUNDS OR WIN 10 MATCHES', W / 2, 110, { font: 'small', color: '#c0c0c0', outline: O, align: 'center' });
    }
    header(g, W, 'SELECT STAGE', (this.sel) + '/' + (this.list.length - 1));
    g.globalAlpha = 0.75;
    rect(g, 0, 150, W, 50, '#0a0614');
    g.globalAlpha = 1;
    drawText(g, '{', 14, 166, { scale: 2, color: '#ffe040', outline: O });
    drawText(g, '}', W - 24, 166, { scale: 2, color: '#ffe040', outline: O });
    this.game.region(0, 150, 50, 50, () => { this.sel = (this.sel - 1 + this.list.length) % this.list.length; Sound.sfx('select'); });
    this.game.region(W - 50, 150, 50, 50, () => { this.sel = (this.sel + 1) % this.list.length; Sound.sfx('select'); });
    this.game.region(50, 150, W - 100, 30, () => this.pick());
    drawText(g, s.name, W / 2, 158, { scale: 2, color: '#ffffff', outline: O, align: 'center' });
    drawText(g, s.sub || '', W / 2, 176, { font: 'small', color: '#c0d0ff', outline: O, align: 'center' });
    const shift = this.night ? 'NIGHT SHIFT' : 'DAY SHIFT';
    button(g, this.game, W / 2 - 40, 184, 80, 11, shift, () => { this.night = !this.night; Sound.sfx('select'); }, { font: 'small', color: this.night ? '#202060' : '#806020' });
    footer(g, W, H, this.game.touchMode ? 'TAP NAME TO SELECT' : '{ } STAGE   ^ | SHIFT   CONFIRM TO SCRUB IN');
  }
}

// =====================================================================
export class VSScreen {
  constructor(game, cfg, next, extra = {}) {
    this.game = game;
    this.cfg = cfg;
    this.next = next;
    this.extra = extra;
    this.t = 0;
    this.f1 = FIGHTER_BY_ID[cfg.p1.id];
    this.f2 = FIGHTER_BY_ID[cfg.p2.id];
    this.l1 = lookFor(cfg.p1.id, cfg.p1.alt);
    this.l2 = lookFor(cfg.p2.id, cfg.p2.alt);
    this.toLoad = [];
    for (const n of POSE_NAMES) this.toLoad.push([this.l1, n], [this.l2, n]);
    preloadStage && preloadStage(cfg.stage, cfg.night);
    Sound.jingle('vs');
    Sound.say(this.f1.name.replace('DR.', 'DOCTOR').toLowerCase() + ' versus ' + this.f2.name.replace('DR.', 'DOCTOR').toLowerCase());
  }
  update() {
    this.t++;
    for (let i = 0; i < 4 && this.toLoad.length; i++) {
      const [l, n] = this.toLoad.shift();
      getSprite(l, n);
    }
    const m = this.game.menu();
    if ((this.t > 150 || ((m.confirm || this.game.anyTap()) && this.t > 30)) && !this.toLoad.length) {
      this.next();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    const t = this.t;
    const slide = Math.min(1, t / 14);
    rect(g, 0, 0, W, H, '#000000');
    const mid = W / 2;
    fillPoly(g, [[0, 0], [mid + 30, 0], [mid - 30, H], [0, H]], darken(this.f1.color, 0.55));
    fillPoly(g, [[mid + 30, 0], [W, 0], [W, H], [mid - 30, H]], darken(this.f2.color, 0.55));
    for (let i = 0; i < 12; i++) {
      const y = ((i * 37 + t * 4) % (H + 20)) - 10;
      rect(g, 0, y, mid, 1, 'rgba(255,255,255,0.08)');
      rect(g, mid, H - y, W - mid, 1, 'rgba(255,255,255,0.08)');
    }
    line(g, mid + 30, 0, mid - 30, H, '#ffffff', 2);
    const x1 = Math.round(-80 + slide * (W * 0.25 + 80));
    const x2 = Math.round(W + 80 - slide * (W * 0.25 + 80));
    bigSprite(g, this.l1, t < 40 ? 'introA' : idlePose(t), x1, H - 26, 1, 2);
    bigSprite(g, this.l2, t < 40 ? 'tauntB' : idlePose(t, 4), x2, H - 26, -1, 2);
    rect(g, 0, H - 30, W, 30, 'rgba(0,0,0,0.6)');
    drawText(g, this.f1.name, 8, H - 26, { color: '#ffffff', outline: O });
    drawText(g, this.f1.title, 8, H - 16, { font: 'small', color: '#c0b8e0' });
    drawText(g, this.f2.name, W - 8, H - 26, { color: '#ffffff', outline: O, align: 'right' });
    drawText(g, this.f2.title, W - 8, H - 16, { font: 'small', color: '#c0b8e0', align: 'right' });
    if (t > 12) {
      const sc = t < 20 ? 6 - (t - 12) * 0.25 : 4;
      drawText(g, 'VS', mid, 70, { scale: Math.round(sc), color: '#ffe040', outline: O, align: 'center', gradient: ['#ffffff', '#fff8c0', '#ffe060', '#ffc020', '#ff9010', '#ff6010', '#e03010'] });
    }
    const st = STAGES.find((s) => s.id === this.cfg.stage);
    drawText(g, (st ? st.name : '') + ' - ' + (this.cfg.night ? 'NIGHT SHIFT' : 'DAY SHIFT'), mid, 8, { font: 'small', color: '#ffffff', outline: O, align: 'center' });
    if (this.extra.banner) drawText(g, this.extra.banner, mid, 22, { color: '#ff5060', outline: O, align: 'center' });
    if (this.extra.lines && t > 30) {
      this.extra.lines.forEach((l, i) => {
        if (t < 30 + i * 40) return;
        const y = 104 + i * 18;
        const lines = wrapText(l.text, 160, { font: 'small' });
        const x = l.side === 0 ? 10 : W - 170;
        panel(g, x, y, 160, lines.length * 7 + 4, { bg: '#ffffff', border: '#140c1c' });
        lines.forEach((tx, j) => drawText(g, tx, x + 3, y + 2 + j * 7, { font: 'small', color: '#140c1c' }));
      });
    }
    if (this.toLoad.length) drawText(g, 'SCRUBBING IN...', mid, H - 40, { font: 'small', color: '#ffffff', align: 'center' });
  }
}

// =====================================================================
export class FightScreen {
  constructor(game, cfg, opts = {}) {
    this.game = game;
    this.cfg = cfg;
    this.opts = opts;
    this.endT = 0;
    game.input.schemes = [cfg.p1.scheme || 'classic', cfg.p2.scheme || 'classic'];
    this.match = new Match(cfg, {
      onEnd: (r) => {
        this.result = r;
      },
      settings: this.matchSettings(),
    });
    this.match.viewW = game.W;
    const st = STAGES.find((s) => s.id === cfg.stage);
    this.match.musicId = opts.music || (st ? st.music : 'er');
    Sound.music(this.match.musicId);
    if (cfg.mode === 'training') this.match.training.boxes = false;
    this.tipT = !Save.data.seenIntro && cfg.mode !== 'demo' ? 520 : 0;
  }
  drawTip(g) {
    if (this.tipT <= 0 || this.match.phase !== 'fight') return;
    const { W } = this.game;
    const dev = this.game.input.lastDevice;
    const modern = this.cfg.p1.scheme === 'modern';
    let lines;
    if (dev === 'touch' || (this.game.touchMode && dev !== 'pad' && dev !== 'keyboard')) lines = ['DRAG THE LEFT SIDE TO MOVE. HOLD AWAY TO BLOCK.', modern ? 'L M H = ATTACKS. SP + DIRECTION = SPECIAL MOVE.' : 'LP MP HP / LK MK HK = PUNCHES AND KICKS.', 'SUPER LIGHTS UP WHEN YOUR PINK ADRENALINE BAR IS FULL.'];
    else if (dev === 'pad') lines = ['STICK/D-PAD TO MOVE. HOLD AWAY TO BLOCK.', modern ? 'X Y B = L M H, A = SPECIAL, RT = SUPER.' : 'X Y RB = PUNCHES, A B RT = KICKS, R3 = SUPER.', 'LB = PARRY (HAND HYGIENE). LT = CHART IMPACT.'];
    else lines = ['WASD TO MOVE. HOLD AWAY TO BLOCK. ESC TO PAUSE.', modern ? 'U I O = L M H. J = SPECIAL. SPACE = SUPER.' : 'U I O = PUNCHES. J K L = KICKS. SPACE = SUPER.', 'P = PARRY.  ; = CHART IMPACT.  H = THROW.  \u2193\u2198\u2192 + PUNCH = SPECIAL!'];
    const w = Math.min(this.game.W - 16, 248), h = 12 + lines.length * 7;
    const x = Math.round(W / 2 - w / 2), y = 54;
    const a = Math.min(1, this.tipT / 30);
    g.globalAlpha = a * 0.88;
    rect(g, x, y, w, h, '#0a0614');
    rect(g, x, y, w, 1, '#ffe040');
    g.globalAlpha = a;
    drawText(g, 'FIRST SHIFT? QUICK ORIENTATION:', W / 2, y + 3, { font: 'small', color: '#ffe040', align: 'center' });
    lines.forEach((l, i) => drawText(g, l, W / 2, y + 11 + i * 7, { font: 'small', color: '#ffffff', align: 'center' }));
    g.globalAlpha = 1;
  }
  matchSettings() {
    const s = Save.settings;
    return { touch: this.game.controlsVisible(), contrast: s.contrast, shake: s.shake, callouts: s.callouts, commentary: s.commentary };
  }
  update() {
    const g = this.game;
    this.match.settings = this.matchSettings();
    if (g.input.pausePressed() && !this.result) {
      Sound.sfx('cancel');
      g.push(new PauseScreen(g, this));
      return;
    }
    const inputs = [g.input.frameFor(0), g.input.frameFor(1)];
    this.match.update(inputs);
    if (this.tipT > 0 && this.match.phase === 'fight' && --this.tipT === 0) {
      Save.data.seenIntro = true;
      Save.save();
    }
    if (this.result) {
      if (++this.endT === 30) {
        const r = this.result;
        this.opts.onEnd && this.opts.onEnd(r, this.match);
      }
    }
  }
  draw(g) {
    this.match.draw(g, this.game.W, this.game.H);
    this.drawTip(g);
  }
  hudMeterFull() {
    return this.match.fighters[0].meter >= 100;
  }
}

export class PauseScreen {
  constructor(game, fight) {
    this.game = game;
    this.fight = fight;
    this.overlay = true;
    const m = fight.match;
    const items = [{ label: 'RESUME', onSelect: () => game.pop() }];
    if (m.training) {
      const T = m.training;
      const dummies = ['stand', 'crouch', 'jump', 'block', 'cpu'];
      items.push({ label: 'DUMMY', value: () => T.dummy.toUpperCase(), onRight: () => this.setDummy(1), onLeft: () => this.setDummy(-1) });
      items.push({ label: 'HITBOXES', value: () => (T.boxes ? 'ON' : 'OFF'), onRight: () => (T.boxes = !T.boxes), onLeft: () => (T.boxes = !T.boxes) });
      items.push({ label: 'INFINITE METER', value: () => (T.infMeter ? 'ON' : 'OFF'), onRight: () => (T.infMeter = !T.infMeter), onLeft: () => (T.infMeter = !T.infMeter) });
      items.push({ label: 'RESET POSITIONS', onSelect: () => { m.startRound(false); m.phase = 'fight'; game.pop(); } });
      this.dummies = dummies;
    }
    items.push({ label: 'MOVE LIST', onSelect: () => game.push(new MoveListScreen(game, m.fighters[0].def, m.fighters[0].scheme)) });
    if (!m.training) items.push({ label: 'RESTART MATCH', onSelect: () => { game.pop(); this.restart(); } });
    items.push({ label: 'QUIT TO MENU', onSelect: () => { game.pop(); game.input.humans = 1; game.go(new MainMenu(game)); } });
    this.menu = new Menu(items);
  }
  setDummy(d) {
    const T = this.fight.match.training;
    const i = (this.dummies.indexOf(T.dummy) + d + this.dummies.length) % this.dummies.length;
    T.dummy = this.dummies[i];
    const f = this.fight.match.fighters[1];
    if (T.dummy === 'cpu') {
      import('./ai.js').then(({ AI }) => {
        f.ai = new AI(f, Save.settings.difficulty);
        f.ctrl = 'cpu';
      });
    } else {
      f.ai = null;
      f.ctrl = 'dummy';
      f.aiAction = null;
    }
  }
  restart() {
    const fs = this.fight;
    this.game.go(new FightScreen(this.game, fs.cfg, fs.opts));
  }
  update() {
    const m = this.game.menu();
    if (m.back || this.game.input.pausePressed()) {
      Sound.sfx('cancel');
      return this.game.pop();
    }
    this.menu.update(m);
  }
  draw(g) {
    const { W, H } = this.game;
    g.globalAlpha = 0.65;
    rect(g, 0, 0, W, H, '#000000');
    g.globalAlpha = 1;
    const h = 28 + this.menu.items.length * 11;
    const y = Math.round(H / 2 - h / 2);
    panel(g, W / 2 - 90, y, 180, h);
    drawText(g, 'PAUSED (ON BREAK)', W / 2, y + 6, { color: '#ffe040', outline: O, align: 'center' });
    this.menu.draw(g, this.game, W / 2 - 74, y + 20, 148);
  }
}

export class MoveListScreen {
  constructor(game, def, scheme) {
    this.game = game;
    this.def = def;
    this.scheme = scheme;
    this.overlay = true;
  }
  update() {
    const m = this.game.menu();
    if (m.back || m.confirm || this.game.anyTap()) {
      Sound.sfx('cancel');
      this.game.pop();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    g.globalAlpha = 0.85;
    rect(g, 0, 0, W, H, '#080410');
    g.globalAlpha = 1;
    const d = this.def;
    const modern = this.scheme === 'modern';
    header(g, W, d.name + ' - CHART', modern ? 'MODERN CONTROLS' : 'CLASSIC CONTROLS');
    let y = 28;
    const row = (name, input, col = '#ffe080') => {
      drawText(g, name, 12, y, { color: col });
      drawText(g, input, W - 12, y, { color: '#a0d0ff', align: 'right' });
      y += 11;
    };
    drawText(g, 'SPECIALS', 12, y, { font: 'small', color: '#c0b0e0' });
    y += 8;
    for (const s of d.specials) {
      const inp = modern ? MODERN_TEXT[s.modern] || 'SP' : MOTION_TEXT[s.input] + ' + ' + (s.btn === 'p' ? 'P' : s.btn === 'k' ? 'K' : 'P/K');
      row(s.name, inp);
    }
    y += 2;
    drawText(g, 'SUPER: ' + d.super.name, 12, y, { font: 'small', color: '#ff80f0' });
    y += 8;
    row('LEVEL 1', modern ? 'SUPER BTN' : MOTION_TEXT.qcf2 + ' + P', '#ff80f0');
    row('LEVEL 2', modern ? 'SUPER BTN (2 BARS)' : MOTION_TEXT.qcf2 + ' + K', '#ff80f0');
    row('LV3 / CRITICAL CARE', modern ? 'SUPER BTN (3 BARS)' : MOTION_TEXT.qcb2 + ' + P/K', '#ff80f0');
    y += 2;
    drawText(g, 'DOUBLE SHIFT (EX): ' + (modern ? 'SP + H' : 'SPECIAL WITH 2 BUTTONS') + ' - 2 CHART BARS', 12, y, { font: 'small', color: '#80e0ff' });
    y += 8;
    drawText(g, 'SUPER BUTTON ALWAYS WORKS: SPACE / TOUCH SUPER / PAD R3', 12, y, { font: 'small', color: '#9088b0' });
    footer(g, W, H, 'ANY BUTTON TO RETURN');
  }
}

// =====================================================================
export class ResultScreen {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.t = 0;
    const r = opts.result;
    this.winner = r.winner;
    this.wf = r.winner === null ? null : FIGHTER_BY_ID[r.fighters[r.winner].id];
    this.look = this.wf ? lookFor(this.wf.id, opts.cfg[r.winner === 0 ? 'p1' : 'p2'].alt) : null;
    this.quote = this.wf ? this.wf.quotes[Math.floor(Math.random() * this.wf.quotes.length)] : 'BOTH FIGHTERS HAVE BEEN SENT TO ADMIN.';
    this.menu = opts.items ? new Menu(opts.items) : null;
    if (this.wf) Sound.jingle('victory');
    else Sound.jingle('gameover');
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (this.menu) {
      if (this.t > 30) this.menu.update(m);
    } else if ((m.confirm || this.game.anyTap()) && this.t > 40) {
      Sound.sfx('confirm');
      this.opts.onNext();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.t, '#120a20', '#1a1030');
    if (this.wf) {
      rect(g, 0, 0, W * 0.42, H, darken(this.wf.color, 0.35));
      bigSprite(g, this.look, Math.floor(this.t / 24) % 2 ? 'win1' : 'win2', W * 0.21, H - 10, 1, 2);
      drawText(g, (this.opts.result.winner === 0 ? 'PLAYER 1' : this.opts.cfg.p2.ctrl === 'human' ? 'PLAYER 2' : 'CPU') + ' WINS', W * 0.21, 10, { color: '#ffe040', outline: O, align: 'center' });
    } else drawText(g, 'DRAW GAME', W * 0.21, 90, { scale: 2, color: '#ffffff', outline: O, align: 'center' });
    const x = Math.round(W * 0.42) + 10, w = W - x - 10;
    panel(g, x, 24, w, 76, { bg: '#ffffff', border: O, hi: '#ffffff' });
    if (this.wf) drawText(g, this.wf.name, x + 6, 30, { color: '#e02838' });
    textBox(g, '"' + this.quote + '"', x + 6, 42, w - 12, { color: '#140c1c' });
    let y = 108;
    const rw = this.opts.rewards;
    if (rw) {
      drawText(g, '+' + rw.copays + ' CO-PAYS', x, y, { color: '#80ff80', outline: O });
      y += 11;
      for (const o of rw.completed) {
        drawText(g, 'ORDER COMPLETE! +' + o.reward, x, y, { font: 'small', color: '#ffe040', outline: O });
        drawText(g, o.text, x, y + 7, { font: 'small', color: '#c0c0d0', outline: O });
        y += 16;
      }
    }
    if (this.menu) {
      const my = Math.max(y + 4, H - 14 - this.menu.items.length * 11);
      this.menu.draw(g, this.game, x + 10, my, w - 20);
    } else if (this.t > 40 && Math.floor(this.t / 20) % 2) drawText(g, 'PRESS TO CONTINUE', x + w / 2, H - 16, { color: '#ffffff', outline: O, align: 'center' });
  }
}

export class ContinueScreen {
  constructor(game, fid, alt, onYes, onNo) {
    this.game = game;
    this.f = FIGHTER_BY_ID[fid];
    this.look = lookFor(fid, alt);
    this.onYes = onYes;
    this.onNo = onNo;
    this.count = 9;
    this.sub = 0;
    this.t = 0;
    Sound.stopMusic(0.2);
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (this.t > 20 && (m.confirm || m.start || this.game.anyTap())) {
      Sound.sfx('coin');
      return this.onYes();
    }
    if (m.back) this.sub += 30;
    if (++this.sub >= 60) {
      this.sub = 0;
      this.count--;
      Sound.sfx('beep', { pitch: 0.8 });
      if (this.count < 0) return this.onNo();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    rect(g, 0, 0, W, H, '#05030a');
    bigSprite(g, this.look, this.count > 2 ? 'lose' : 'downHurt', W / 2 - 80, H - 30, 1, 2, this.count <= 2 ? 'gray' : '');
    drawText(g, 'CONTINUE?', W / 2 + 50, 40, { scale: 2, color: '#ffffff', outline: O, align: 'center' });
    drawText(g, String(Math.max(0, this.count)), W / 2 + 50, 70, { scale: 6, color: '#ff4050', outline: O, align: 'center', gradient: ['#ffffff', '#ffc0c0', '#ff8080', '#ff4050', '#e02030', '#c01020', '#901010'] });
    drawText(g, 'INSERT CO-PAY', W / 2 + 50, 128, { color: '#ffd040', outline: O, align: 'center' });
    drawText(g, 'CO-PAYS: ' + Save.data.copays + ' (CONTINUES ARE FREE.', W / 2 + 50, 142, { font: 'small', color: '#a0a0c0', align: 'center' });
    drawText(g, 'THIS IS THE ONLY FREE THING HERE.)', W / 2 + 50, 149, { font: 'small', color: '#a0a0c0', align: 'center' });
    // flatline
    let px = 0, py = 190;
    for (let x = 0; x < W; x += 2) {
      const beat = this.count > 0 ? (x + this.t * 3) % 90 : 99;
      const ny = beat > 40 && beat < 44 ? 178 : beat >= 44 && beat < 48 ? 200 : 190;
      line(g, px, py, x, ny, this.count > 2 ? '#40ff80' : '#ff4050');
      px = x;
      py = ny;
    }
  }
}

export class GameOverScreen {
  constructor(game) {
    this.game = game;
    this.t = 0;
    Sound.jingle('gameover');
  }
  update() {
    if (++this.t > 240 || (this.t > 40 && (this.game.menu().confirm || this.game.anyTap()))) this.game.go(new TitleScreen(this.game));
  }
  draw(g) {
    const { W, H } = this.game;
    rect(g, 0, 0, W, H, '#000000');
    drawText(g, 'GAME OVER', W / 2, 80, { scale: 3, color: '#ff4050', outline: O, align: 'center' });
    drawText(g, 'YOUR SHIFT IS OVER.', W / 2, 112, { color: '#ffffff', align: 'center' });
    if (this.t > 60) drawText(g, 'PLEASE CLOCK OUT. UNPAID OVERTIME ENDS NOW.', W / 2, 126, { font: 'small', color: '#9088b0', align: 'center' });
  }
}

// =====================================================================
// Story / ending / credits
// =====================================================================
export class StoryScreen {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts; // {fid, alt, stage, night, title, pages:[], choice:[a,b], onDone(choiceIdx)}
    this.page = 0;
    this.chars = 0;
    this.t = 0;
    this.look = lookFor(opts.fid, opts.alt);
    this.menu = null;
    if (opts.music) Sound.music(opts.music);
  }
  update() {
    this.t++;
    const m = this.game.menu();
    const text = this.opts.pages[this.page] || '';
    if (this.menu) {
      this.menu.update(m);
      return;
    }
    if (this.chars < text.length) {
      this.chars += 1.2;
      if (this.t % 3 === 0) Sound.sfx('select', { vol: 0.15, pitch: 2 });
      if (m.confirm || this.game.anyTap()) this.chars = text.length;
      return;
    }
    if (m.confirm || this.game.anyTap()) {
      Sound.sfx('confirm');
      this.page++;
      this.chars = 0;
      if (this.page >= this.opts.pages.length) {
        if (this.opts.choice) {
          this.page = this.opts.pages.length - 1;
          this.chars = 9999;
          this.menu = new Menu(this.opts.choice.map((c, i) => ({ label: c, onSelect: () => this.opts.onDone(i) })));
        } else this.opts.onDone(0);
      }
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stageBG(g, this.game, this.opts.stage || 'er', !!this.opts.night, 0.45, 0.2);
    bigSprite(g, this.look, this.opts.pose || (this.menu ? 'tauntA' : idlePose(this.t)), 70, H - 6, 1, 2);
    if (this.opts.title) drawText(g, this.opts.title, W / 2 + 40, 16, { scale: 2, color: '#ffe040', outline: O, align: 'center' });
    const x = 140, w = W - 150;
    const text = (this.opts.pages[this.page] || '').slice(0, Math.floor(this.chars));
    const full = wrapText(this.opts.pages[this.page] || '', w - 12);
    const h = Math.max(60, full.length * 9 + 12);
    panel(g, x, 40, w, h, { bg: '#100a1c' });
    textBox(g, text, x + 6, 46, w - 12, { color: '#f0e8ff' });
    if (this.menu) {
      drawText(g, 'CHOOSE YOUR PATH', x + w / 2, 40 + h + 8, { color: '#ff8090', outline: O, align: 'center' });
      this.menu.draw(g, this.game, x + 16, 40 + h + 22, w - 32);
    } else if (this.chars >= (this.opts.pages[this.page] || '').length && Math.floor(this.t / 15) % 2) drawText(g, '}', x + w - 10, 40 + h - 10, { color: '#ffe040' });
  }
}

export class CreditsScreen {
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.t = 0;
    this.y = game.H + 10;
    Sound.music('ending');
    const L = [];
    L.push(['logo']);
    L.push(['gap', 20]);
    L.push(['big', 'STARRING']);
    for (const f of FIGHTERS) L.push(['fighter', f]);
    L.push(['gap', 10]);
    L.push(['big', 'COMING SOON (DLC)']);
    for (const d of DLC) L.push(['small', d.name + ' - ' + d.note]);
    L.push(['gap', 12]);
    L.push(['big', 'STAFF']);
    for (const s of ['DIRECTOR OF SYNERGY ..... THE ADMINISTRATOR', 'LEAD COMBO DESIGN ....... ORTHO BRO', 'NETCODE ................ PENDING APPROVAL', 'FRAME DATA ............. RADIOLOGY (PRELIM)', 'CATERING ............... FRIDAY FISH DAY', 'QUALITY ASSURANCE ...... JCAHO', 'LEGAL .................. PLEASE DON\'T']) L.push(['small', s]);
    L.push(['gap', 12]);
    L.push(['small', 'HOSPITAL FIGHTER IS A PARODY. NOT AFFILIATED']);
    L.push(['small', 'WITH ANY GAME COMPANY, HOSPITAL OR STREET.']);
    L.push(['small', 'NO PATIENTS WERE HARMED. SOME CHARTS WERE.']);
    L.push(['small', 'ANY RESEMBLANCE TO YOUR ADMINISTRATOR IS']);
    L.push(['small', 'PURELY COINCIDENTAL AND DEEPLY UPSETTING.']);
    L.push(['gap', 30]);
    L.push(['big', 'THANK YOU FOR PLAYING']);
    L.push(['small', 'NOW PLEASE WASH YOUR HANDS.']);
    this.lines = L;
  }
  update() {
    this.t++;
    const m = this.game.menu();
    this.y -= m.confirm || this.game.input.keys.size ? 2.2 : 0.45;
    if (m.back || this.y < -this.total - 20) this.onDone();
  }
  draw(g) {
    const { W, H } = this.game;
    rect(g, 0, 0, W, H, '#05030c');
    for (let i = 0; i < 40; i++) rect(g, (i * 97) % W, (i * 53 + this.t * 0.2 * (1 + (i % 3))) % H, 1, 1, '#403860');
    let y = Math.round(this.y);
    for (const l of this.lines) {
      switch (l[0]) {
        case 'logo':
          if (y > -100 && y < H) drawLogo(g, W / 2, y, this.t, 1);
          y += 96;
          break;
        case 'gap':
          y += l[1];
          break;
        case 'big':
          drawText(g, l[1], W / 2, y, { color: '#ffe040', outline: O, align: 'center' });
          y += 14;
          break;
        case 'small':
          drawText(g, l[1], W / 2, y, { font: 'small', color: '#c0b8e0', align: 'center' });
          y += 9;
          break;
        case 'fighter': {
          const f = l[1];
          if (y > -60 && y < H + 70) {
            const side = FIGHTERS.indexOf(f) % 2;
            drawFighterSprite(g, lookFor(f.id), idlePose(this.t, side * 5), side ? W / 2 + 90 : W / 2 - 90, y + 50, side ? -1 : 1);
            drawText(g, f.name, W / 2, y + 20, { color: '#ffffff', outline: O, align: 'center' });
            drawText(g, f.title, W / 2, y + 30, { font: 'small', color: f.color === '#2e2c3c' ? '#a0a0d0' : f.color, align: 'center' });
          }
          y += 62;
          break;
        }
      }
    }
    this.total = y - this.y;
  }
}

// =====================================================================
// Options / how-to / orders / jokes / extreme
// =====================================================================
export class OptionsScreen {
  constructor(game) {
    this.game = game;
    this.overlay = false;
    const S = Save.settings;
    const cyc = (key, vals) => ({ onRight: () => { S[key] = vals[(vals.indexOf(S[key]) + 1) % vals.length]; this.changed(); }, onLeft: () => { S[key] = vals[(vals.indexOf(S[key]) - 1 + vals.length) % vals.length]; this.changed(); } });
    const tog = (key) => ({ value: () => (S[key] ? 'ON' : 'OFF'), onRight: () => { S[key] = !S[key]; this.changed(); }, onLeft: () => { S[key] = !S[key]; this.changed(); } });
    const vol = (key) => ({ value: () => '#'.repeat(Math.round(S[key] * 10)).padEnd(10, '-'), onRight: () => { S[key] = Math.min(1, Math.round(S[key] * 10 + 1) / 10); this.changed(); if (key === 'sfx') Sound.sfx('hitM'); }, onLeft: () => { S[key] = Math.max(0, Math.round(S[key] * 10 - 1) / 10); this.changed(); if (key === 'sfx') Sound.sfx('hitM'); } });
    this.menu = new Menu([
      Object.assign({ label: 'P1 CONTROLS', value: () => S.scheme1.toUpperCase() }, cyc('scheme1', ['auto', 'classic', 'modern'])),
      Object.assign({ label: 'P2 CONTROLS', value: () => S.scheme2.toUpperCase() }, cyc('scheme2', ['classic', 'modern'])),
      Object.assign({ label: 'TOUCH LAYOUT', value: () => S.touchScheme.toUpperCase() }, cyc('touchScheme', ['modern', 'classic'])),
      Object.assign({ label: 'TOUCH BUTTONS', value: () => S.touchControls.toUpperCase() }, cyc('touchControls', ['auto', 'on', 'off'])),
      Object.assign({ label: 'CPU DIFFICULTY', value: () => DIFF_NAMES[S.difficulty] }, cyc('difficulty', [1, 2, 3, 4])),
      Object.assign({ label: 'ROUNDS', value: () => 'BEST OF ' + (S.rounds * 2 - 1) }, cyc('rounds', [1, 2, 3])),
      Object.assign({ label: 'SHIFT TIMER', value: () => (S.timer === 0 ? 'INFINITE' : S.timer) }, cyc('timer', [99, 60, 0])),
      Object.assign({ label: 'MUSIC', }, vol('music')),
      Object.assign({ label: 'SFX' }, vol('sfx')),
      Object.assign({ label: 'ANNOUNCER VOICE' }, tog('announcer')),
      Object.assign({ label: 'STAGE HAZARDS' }, tog('hazards')),
      Object.assign({ label: 'SCREEN SHAKE' }, tog('shake')),
      Object.assign({ label: 'CRT SCANLINES' }, tog('crt')),
      Object.assign({ label: 'HIGH CONTRAST HUD' }, tog('contrast')),
      Object.assign({ label: 'MOVE CALLOUTS' }, tog('callouts')),
      Object.assign({ label: 'COMMENTARY' }, tog('commentary')),
      { label: 'RESET PROGRESS', onSelect: () => game.push(new ChoiceScreen(game, 'ERASE ALL RECORDS?', [{ label: 'YES (HIPAA WIPE)', onSelect: () => { Save.reset(); game.applySettings(); game.pop(); } }])) },
      { label: 'BACK', onSelect: () => this.close() },
    ], { lineH: 11 });
  }
  changed() {
    Save.save();
    this.game.applySettings();
  }
  close() {
    Save.save();
    this.game.pop();
  }
  update() {
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.close();
    }
    this.menu.update(m);
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.game.t, '#100a1e', '#160e28');
    header(g, W, 'OPTIONS', 'SETTINGS SAVE AUTOMATICALLY');
    panel(g, 24, 26, W - 48, H - 40);
    this.menu.draw(g, this.game, 36, 32, W - 72, 15);
    footer(g, W, H, this.game.touchMode ? 'TAP A ROW TO CHANGE IT' : '^| SELECT   {} CHANGE   BACK TO EXIT');
  }
}

const HOWTO = [
  { title: 'THE BASICS', lines: [
    'BEST OF 3 ROUNDS. 99-SECOND SHIFT TIMER.',
    'YOUR HEALTH BAR IS PATIENT STABILITY. EMPTY IT AND YOUR OPPONENT FLATLINES: CODE BLUE!',
    'KO RESULTS: DISCHARGED, ADMITTED TO ICU, OR SENT TO ADMIN.',
    'HOLD AWAY FROM YOUR OPPONENT TO BLOCK (PPE UP). CROUCH-BLOCK LOW ATTACKS. STAND-BLOCK OVERHEADS AND JUMP-INS.',
    'HITTING SOMEONE DURING THEIR ATTACK = COUNTER. HITTING THEIR RECOVERY = MALPRACTICE COUNTER (BIG DAMAGE).',
  ] },
  { title: 'KEYBOARD (CLASSIC)', keys: true },
  { title: 'TOUCH & GAMEPAD', lines: [
    'TOUCH: DRAG ANYWHERE ON THE LEFT TO MOVE. BUTTONS ON THE RIGHT.',
    'MODERN LAYOUT: L / M / H ATTACKS, SP = SPECIAL. SP + DIRECTION PICKS THE SPECIAL. TOGGLE AUTO FOR AUTO-COMBOS (MASH L, M OR H).',
    'SUPER BUTTON FIRES YOUR BEST SUPER. PARRY, IMPACT AND THROW HAVE THEIR OWN BUTTONS.',
    'GAMEPAD (CLASSIC): X Y RB = PUNCHES, A B RT = KICKS, LB = PARRY, LT = IMPACT, L3 = THROW, R3 = SUPER.',
    'GAMEPAD (MODERN): X Y B = L M H, A = SP, RB = AUTO, LB = PARRY, LT = IMPACT, RT = SUPER.',
  ] },
  { title: 'CHART GAUGE (6 BARS)', lines: [
    'CHART IMPACT (HP+HK / IMPACT): ARMORED CLIPBOARD HAYMAKER. ABSORBS 2 HITS. CRUMPLES ON HIT. WALL SPLATS IN THE CORNER.',
    'HAND HYGIENE (MP+MK / PARRY): HOLD TO PARRY EVERYTHING EXCEPT THROWS AND IMPACTS. PARRY JUST IN TIME FOR PERFECT HAND HYGIENE!',
    'SPRINT: HOLD PARRY + DOUBLE-TAP FORWARD.',
    'PAGE SECURITY: WHILE BLOCKING, FORWARD + PARRY. INVINCIBLE SHOVE.',
    'DOUBLE SHIFT: DO A SPECIAL WITH TWO PUNCHES OR KICKS FOR AN ENHANCED VERSION.',
    'RUN OUT AND YOU GET CHARTING BURNOUT: NO GAUGE MOVES, EXTRA CHIP DAMAGE, AND A BLOCKED IMPACT STUNS YOU.',
  ] },
  { title: 'ADRENALINE (SUPERS)', lines: [
    'LAND AND TAKE HITS TO BUILD ADRENALINE. UP TO 3 BARS.',
    'LEVEL 1: ↓↘→↓↘→ + P.   LEVEL 2: ↓↘→↓↘→ + K.   LEVEL 3: ↓↙←↓↙← + P/K.',
    'BELOW 25% STABILITY, YOUR LEVEL 3 BECOMES A CRITICAL CARE SUPER WITH BONUS DAMAGE.',
    'SPACE / SUPER BUTTON: ONE-BUTTON SUPER (USES YOUR BEST AVAILABLE LEVEL).',
    'CANCEL SPECIAL MOVES INTO SUPERS ON HIT FOR BIG COMBOS.',
  ] },
  { title: 'MOTIONS & ADVANCED', lines: [
    'ROUND ROUNDS: ↓↘→ (QCF).  REVERSE ROUNDS: ↓↙←.  EMERGENCY ESCALATION: →↓↘ (DP).',
    'INSURANCE HOLD: HOLD ← (OR ↓) FOR A SECOND, THEN → (OR ↑) + BUTTON. CLAIMS TAKE TIME.',
    'THROWS: LP+LK (GURNEY TOSS). HOLD BACK FOR WHEELCHAIR SPIN. PRESS THROW WHEN GRABBED FOR A SECOND OPINION (TECH).',
    'TAKE TOO MUCH DAMAGE QUICKLY AND YOU BECOME OVERWHELMED (DIZZY). MASH TO RECOVER.',
    'TAUNT: T. CHECK YOUR WATCH. SIGH AT YOUR PAGER. GAINS A LITTLE ADRENALINE.',
  ] },
];

export class HowToScreen {
  constructor(game) {
    this.game = game;
    this.page = 0;
  }
  update() {
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.game.pop();
    }
    if (m.right || m.confirm) this.flip(1);
    if (m.left) this.flip(-1);
  }
  flip(d) {
    this.page += d;
    Sound.sfx('select');
    if (this.page >= HOWTO.length || this.page < 0) {
      this.page = Math.max(0, Math.min(HOWTO.length - 1, this.page));
      if (d > 0) this.game.pop();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.game.t, '#0e0a1c', '#140e26');
    const p = HOWTO[this.page];
    header(g, W, 'HOW TO PLAY: ' + p.title, this.page + 1 + '/' + HOWTO.length);
    panel(g, 10, 26, W - 20, H - 40);
    if (p.keys) this.drawKeys(g, W, H);
    else {
      let y = 32;
      for (const l of p.lines) {
        y += textBox(g, l, 18, y, W - 36, { font: 'small', color: '#e0d8f8' }) + 5;
      }
    }
    this.game.region(0, 26, W / 2, H - 40, () => this.flip(-1));
    this.game.region(W / 2, 26, W / 2, H - 40, () => this.flip(1));
    footer(g, W, H, '{ } TURN PAGE   BACK TO EXIT');
  }
  drawKeys(g, W, H) {
    const key = (x, y, k, label, c = '#3a3050') => {
      rect(g, x - 1, y - 1, 16, 16, O);
      rect(g, x, y, 14, 14, c);
      rect(g, x, y, 14, 1, '#ffffff40');
      drawText(g, k, x + 7, y + 4, { color: '#ffffff', align: 'center' });
      if (label) drawText(g, label, x + 7, y + 17, { font: 'small', color: '#c0b8e0', align: 'center' });
    };
    const y0 = 40;
    drawText(g, 'MOVE', 30, y0 - 6, { font: 'small', color: '#ffe080' });
    key(46, y0 + 4, 'W', '');
    key(30, y0 + 20, 'A', '');
    key(46, y0 + 20, 'S', '');
    key(62, y0 + 20, 'D', '');
    drawText(g, '(OR ARROWS VS CPU)', 24, y0 + 40, { font: 'small', color: '#9088b0' });
    const bx = 120;
    drawText(g, 'PUNCHES', bx, y0 - 6, { font: 'small', color: '#ffe080' });
    key(bx, y0 + 2, 'U', 'INJECT', '#304878');
    key(bx + 34, y0 + 2, 'I', 'SUTURE', '#786020');
    key(bx + 68, y0 + 2, 'O', 'DEFIB', '#782828');
    drawText(g, 'KICKS', bx, y0 + 30, { font: 'small', color: '#ffe080' });
    key(bx, y0 + 38, 'J', 'KICK', '#304878');
    key(bx + 34, y0 + 38, 'K', 'WHEEL', '#786020');
    key(bx + 68, y0 + 38, 'L', 'GURNEY', '#782828');
    const sx = Math.max(bx + 110, W - 130);
    const sys = [['P', 'PARRY (HAND HYGIENE)'], [';', 'CHART IMPACT'], ['H', 'THROW'], ['SPC', 'SUPER'], ['T', 'TAUNT'], ['ESC', 'PAUSE']];
    sys.forEach(([k, l], i) => {
      rect(g, sx - 1, y0 + i * 14 - 1, 24, 12, O);
      rect(g, sx, y0 + i * 14, 22, 10, '#3a3050');
      drawText(g, k, sx + 11, y0 + i * 14 + 3, { font: 'small', color: '#ffffff', align: 'center' });
      drawText(g, l, sx + 28, y0 + i * 14 + 3, { font: 'small', color: '#d0c8e8' });
    });
    textBox(g, 'MODERN ON KEYBOARD: U I O = L M H, J = SP (SPECIAL), HOLD K = AUTO-COMBO. P2 KEYBOARD: ARROWS + NUMPAD 7 8 9 / 4 5 6.', 18, y0 + 92, W - 36, { font: 'small', color: '#a0d0ff' });
  }
}

export class OrdersScreen {
  constructor(game) {
    this.game = game;
    Save.refreshOrders();
  }
  update() {
    const m = this.game.menu();
    if (m.back || m.confirm || this.game.anyTap()) {
      Sound.sfx('cancel');
      this.game.pop();
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.game.t, '#0e0a1c', '#140e26');
    header(g, W, 'ORDERS & RANK', Save.data.copays + ' CO-PAYS');
    const r = Save.rank();
    panel(g, 10, 26, W - 20, 52);
    drawText(g, 'CAREER RANK', 18, 32, { font: 'small', color: '#c0b0e0' });
    drawText(g, r.name, 18, 40, { scale: 2, color: '#ffe040', outline: O });
    const st = Save.data.stats;
    drawText(g, `WINS ${st.wins}   LOSSES ${st.losses}   SUPERS ${st.supers}   PARRIES ${st.parries}`, 18, 58, { font: 'small', color: '#d0c8e8' });
    drawText(g, r.next ? r.toNext + ' MORE WINS TO ' + r.next : 'YOU HAVE PEAKED. CONGRATULATIONS ON YOUR EXECUTIVE PARKING.', 18, 66, { font: 'small', color: '#80e0ff' });
    // rank ladder
    RANKS.forEach((k, i) => {
      const x = W - 20 - (RANKS.length - i) * 34;
      rect(g, x, 34, 30, 10, i <= r.idx ? '#e02838' : '#302440');
      drawText(g, k.name.slice(0, 5), x + 15, 37, { font: 'small', color: '#ffffff', align: 'center' });
    });
    panel(g, 10, 84, W - 20, 82);
    drawText(g, 'TODAY\'S ORDERS', 18, 90, { color: '#ffe080' });
    Save.data.orders.list.forEach((o, i) => {
      const y = 102 + i * 20;
      drawText(g, o.text, 18, y, { font: 'small', color: o.done ? '#80ff80' : '#ffffff' });
      const bw = W - 120;
      rect(g, 18, y + 8, bw, 5, '#201830');
      rect(g, 18, y + 8, Math.round((o.prog / o.n) * bw), 5, o.done ? '#40d060' : '#40a0ff');
      drawText(g, o.done ? 'DONE!' : o.prog + '/' + o.n, W - 96, y + 7, { font: 'small', color: '#c0c0d0' });
      drawText(g, '+' + o.reward, W - 22, y + 7, { font: 'small', color: '#ffd040', align: 'right' });
    });
    panel(g, 10, 172, W - 20, 30);
    drawText(g, 'UNLOCKS', 18, 177, { font: 'small', color: '#c0b0e0' });
    drawText(g, 'MORGUE STAGE: ' + (Save.unlocked('morgue') ? 'UNLOCKED' : 'CLEAR GRAND ROUNDS OR WIN 10'), 18, 186, { font: 'small', color: Save.unlocked('morgue') ? '#80ff80' : '#a0a0b0' });
    drawText(g, 'GRAND ROUNDS CLEARED: ' + Object.keys(st.clearedBy || {}).length + '/' + FIGHTERS.length, 18, 194, { font: 'small', color: '#a0d0ff' });
  }
}

const JOKES = {
  online: { title: 'ONLINE', steps: ['CONNECTING TO MATCHMAKING...', 'VERIFYING INSURANCE...', 'CHECKING NETWORK STATUS...', 'ERROR 403: OUT-OF-NETWORK'], body: 'YOUR REQUEST FOR ONLINE PLAY HAS BEEN DENIED.\nREASON: NOT MEDICALLY NECESSARY.\n\nTO APPEAL, FAX FORM 27B/6 TO A NUMBER THAT IS NO LONGER IN SERVICE. ALLOW 6-8 WEEKS.\n\nROLLBACK NETCODE: ROLLED BACK. CROSSPLAY: CROSS. WIFI FILTER: FILTERS EVERYONE.\n\n(TRY LOCAL VERSUS. IT IS COVERED.)' },
  residency: { title: 'RESIDENCY', steps: ['CREATING YOUR INTERN...', 'ASSIGNING MENTOR...', 'CALCULATING SLEEP HOURS... 0', 'MATCH RESULTS ARE IN!'], body: 'CONGRATULATIONS! YOU MATCHED INTO:\n\nNIGHT FLOAT. FOREVER.\n\nYOUR MENTOR IS ON VACATION. YOUR PAGER HAS BEEN ISSUED. YOUR LOCKER IS A CARDBOARD BOX.\n\nPRESS CONFIRM TO REROLL YOUR INTERN.', avatar: true },
  hub: { title: 'BREAK ROOM HUB', steps: ['ENTERING BREAK ROOM...', 'MICROWAVE QUEUE: 14 PEOPLE', 'LOADING HIPAA-COMPLIANT CHAT...'], body: 'DR_TRAUMA: HAS ANYONE SEEN [REDACTED]\nNURSE_N: [REDACTED] IN ROOM [REDACTED] IS [REDACTED]\nORTHO_BRO: BRO [REDACTED] BRO\nADMIN: PLEASE STOP [REDACTED] IN THE CHAT\nJANITOR: WHO ATE MY YOGURT\n\nARCADE CABINETS: OUT OF ORDER (IT TICKET #4012 - ESCALATED)' },
  pass: { title: 'SHIFT PASS & SHOP', steps: ['LOADING SHIFT PASS SEASON 1...'], body: 'FREE TIER:\n- 1 GRANOLA BAR\n- PIZZA PARTY (1 SLICE PER 40 STAFF)\n- A "HEROES WORK HERE" YARD SIGN\nPREMIUM TIER (1,000,000 CO-PAYS):\n- PARKING SPOT (TUESDAYS ONLY)\n- ONE (1) DAY OFF (DENIED)\n- THE ABILITY TO PEE DURING SHIFT\n\nSHOP: MAUVE SCRUBS - OUT OF STOCK (SUPPLY CHAIN). GOLDEN STETHOSCOPE - BACKORDERED. ERGONOMIC CHAIR - FICTIONAL.\n\nNO PAY-TO-WIN. WE CHECKED. NOTHING HELPS.' },
};

export class JokeScreen {
  constructor(game, id) {
    this.game = game;
    this.j = JOKES[id];
    this.id = id;
    this.t = 0;
    this.seed = Math.floor(Math.random() * 1e6);
    if (this.j.avatar) this.makeAvatar();
  }
  makeAvatar() {
    const r = () => Math.random();
    const pick = (a) => a[Math.floor(r() * a.length)];
    const skins = ['#f2c49c', '#e0a070', '#c08050', '#8a5a3a', '#6a4028', '#f0d0b0'];
    const scrubs = ['#3a6cc8', '#3c8a58', '#a060c0', '#e07090', '#40a0a0', '#606880', '#c08030'];
    const hairs = ['short', 'spiky', 'long', 'bob', 'curly', 'ponytail', 'messy', 'buzz', 'bald'];
    const hc = ['#22161c', '#6a3a20', '#c89040', '#e07830', '#404040', '#a0a0a0'];
    const sc = pick(scrubs);
    this.avatar = { id: 'intern' + this.seed++, skin: pick(skins), hair: pick(hc), hairStyle: pick(hairs), top: sc, pants: sc, shoes: pick(['#ffffff', '#202020', '#e04040']), extras: { lanyard: '#e02838', stethoscope: r() < 0.5 ? '#202830' : undefined }, face: r() < 0.3 ? ['glasses'] : [], scale: 0.9 + r() * 0.15, brows: 'sad' };
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.game.pop();
    }
    if (m.confirm || this.game.anyTap()) {
      if (this.t < this.j.steps.length * 40) this.t = this.j.steps.length * 40;
      else if (this.j.avatar) {
        this.makeAvatar();
        Sound.sfx('select');
      } else {
        Sound.sfx('cancel');
        this.game.pop();
      }
    }
  }
  draw(g) {
    const { W, H } = this.game;
    rect(g, 0, 0, W, H, '#0a0818');
    header(g, W, this.j.title, 'PENDING');
    const step = Math.floor(this.t / 40);
    const st = this.j.steps;
    let y = 30;
    for (let i = 0; i < Math.min(step + 1, st.length); i++) {
      const last = i === st.length - 1;
      drawText(g, '> ' + st[i], 14, y, { font: 'small', color: last && step >= st.length - 1 ? '#ff6060' : '#80ff80' });
      y += 8;
    }
    if (step < st.length) {
      const k = (this.t % 40) / 40;
      rect(g, 14, y + 2, 120, 5, '#203020');
      rect(g, 14, y + 2, Math.round(120 * k), 5, '#40c060');
      return;
    }
    y += 4;
    const w = this.j.avatar ? W - 120 : W - 28;
    panel(g, 10, y, w + 8, H - y - 14, { bg: '#100c20' });
    textBox(g, this.j.body, 14, y + 4, w, { font: 'small', color: '#e0d8f0' });
    if (this.j.avatar) {
      const L = this.avatar;
      bigSprite(g, L, idlePose(this.t), W - 50, H - 16, -1, 1.5);
      drawText(g, 'YOUR INTERN', W - 50, y, { font: 'small', color: '#ffe080', align: 'center' });
    }
    footer(g, W, H, this.j.avatar ? 'CONFIRM: REROLL   BACK: EXIT' : 'PRESS ANY BUTTON TO ACCEPT YOUR FATE');
  }
}

export class ExtremeScreen {
  constructor(game) {
    this.game = game;
    this.mods = new Set(['outbreak']);
    const M = [
      ['outbreak', 'OUTBREAK', 'GERMS RAIN FROM THE VENTS. CONTAGIOUS.'],
      ['budget', 'BUDGET CUTS', 'EVERY HIT DOES 25% MORE. SUPPLIES ARE SCARCE.'],
      ['fullcode', 'FULL CODE', 'START WITH 3 ADRENALINE BARS. SUPERS EVERYWHERE.'],
      ['jcaho', 'JCAHO INSPECTION', 'THE INSPECTOR WANDERS BY. ATTACK IN FRONT OF THEM AND LOSE ADRENALINE.'],
      ['fishday', 'FRIDAY FISH DAY', 'FLYING FISH ON EVERY STAGE. NOBODY KNOWS WHY.'],
    ];
    this.defs = M;
    this.menu = new Menu(M.map(([id, label, desc]) => ({ label, desc, value: () => (this.mods.has(id) ? '[X]' : '[ ]'), onSelect: () => (this.mods.has(id) ? this.mods.delete(id) : this.mods.add(id)) })).concat([
      { sep: true },
      { label: 'START', desc: 'PICK YOUR FIGHTER AND OPPONENT.', onSelect: () => game.go(new CharSelect(game, { mode: 'extreme', p2: 'cpu', mods: [...this.mods] })) },
      { label: 'BACK', onSelect: () => game.go(new MainMenu(game, 4)) },
    ]));
  }
  update() {
    const m = this.game.menu();
    if (m.back) {
      Sound.sfx('cancel');
      return this.game.go(new MainMenu(this.game, 4));
    }
    this.menu.update(m);
  }
  draw(g) {
    const { W, H } = this.game;
    stageBG(g, this.game, 'cafeteria', true, 0.6, 0.4);
    header(g, W, 'EXTREME BATTLE', 'CHOOSE MODIFIERS');
    panel(g, 20, 30, W - 40, 100);
    this.menu.draw(g, this.game, 32, 36, W - 64);
    panel(g, 20, 140, W - 40, 50, { bg: '#100a1c' });
    textBox(g, this.menu.cur.desc || '', 28, 146, W - 56, { font: 'small', color: '#e0d8f0' });
  }
}

// =====================================================================
// Mode flows
// =====================================================================
function runVersusMatch(game, cfg, opts) {
  game.go(new FightScreen(game, cfg, {
    onEnd: (result) => {
      const rewards = cfg.p2.ctrl === 'cpu' ? Save.recordMatch(result, 0) : null;
      game.go(new ResultScreen(game, {
        result, cfg, rewards,
        items: [
          { label: 'REMATCH', onSelect: () => game.go(new VSScreen(game, cfg, () => runVersusMatch(game, cfg, opts))) },
          { label: 'CHARACTER SELECT', onSelect: () => game.go(new CharSelect(game, Object.assign({}, opts, { prev: [cfg.p1, cfg.p2] }))) },
          { label: 'MAIN MENU', onSelect: () => { game.input.humans = 1; game.go(new MainMenu(game)); } },
        ],
      }));
    },
  }));
}

export function startArcade(game, sel, story) {
  const me = FIGHTER_BY_ID[sel.id];
  const pool = FIGHTERS.filter((f) => f.id !== me.id && !BOSSES.includes(f.id) && f.id !== me.rival).map((f) => f.id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const bosses = BOSSES.filter((b) => b !== me.id);
  while (bosses.length < 2) bosses.unshift(pool.pop());
  const nRandom = story ? 5 : 3;
  let rival, ladder;
  if (me.rival && bosses.includes(me.rival)) {
    rival = me.rival;
    ladder = pool.slice(0, nRandom + 1).concat(bosses);
  } else {
    rival = me.rival || pool.pop();
    ladder = pool.slice(0, nRandom).concat([rival], bosses);
  }
  const A = { sel, story, ladder, idx: 0, rivalId: rival };
  if (story) {
    game.go(new StoryScreen(game, { fid: me.id, alt: sel.alt, stage: HOME_STAGE[me.id] === 'morgue' ? 'icu' : HOME_STAGE[me.id], night: true, title: 'GRAND ROUNDS', pages: [me.story], music: 'select', onDone: () => arcadeNext(game, A) }));
  } else arcadeNext(game, A);
}

function arcadeNext(game, A) {
  game.go(new LadderScreen(game, A, () => arcadeFight(game, A)));
}

function arcadeFight(game, A) {
  const me = FIGHTER_BY_ID[A.sel.id];
  const oppId = A.ladder[A.idx];
  const opp = FIGHTER_BY_ID[oppId];
  const n = A.ladder.length;
  const base = Save.settings.difficulty;
  const lvl = Math.min(4, base + (A.idx >= n - 2 ? 1 : 0));
  const final = A.idx === n - 1;
  const isRival = oppId === A.rivalId;
  const stage = final ? 'helipad' : HOME_STAGE[oppId] || 'er';
  const cfg = {
    mode: 'arcade', stage, night: final || A.idx % 2 === 1, rounds: Save.settings.rounds, timer: Save.settings.timer, hazards: Save.settings.hazards,
    p1: { id: me.id, alt: A.sel.alt, ctrl: 'human', scheme: schemeFor(game, 0) },
    p2: { id: oppId, alt: oppId === me.id ? !A.sel.alt : false, ctrl: 'cpu', cpuLevel: lvl },
  };
  const extra = {};
  if (isRival) {
    extra.banner = 'RIVAL BATTLE!';
    if (A.story) extra.lines = [{ side: 1, text: rivalLine(opp, me) }, { side: 0, text: rivalLine(me, opp) }];
  } else if (final) {
    extra.banner = 'FINAL BOSS: ' + opp.title;
    if (A.story) extra.lines = [{ side: 1, text: opp.quotes[0] }, { side: 0, text: 'I CAME HERE TO ' + (me.id === 'zero' ? 'COUGH ON YOU.' : 'FILE A COMPLAINT. WITH MY FISTS.') }];
  } else if (opp.id === 'admin') extra.banner = 'BOSS: THE ADMINISTRATOR';
  game.go(new VSScreen(game, cfg, () => {
    game.go(new FightScreen(game, cfg, {
      music: final ? 'final' : undefined,
      onEnd: (result) => {
        const won = result.winner === 0;
        const cleared = won && final;
        const rewards = Save.recordMatch(result, 0, { cleared });
        game.go(new ResultScreen(game, {
          result, cfg, rewards,
          onNext: () => {
            if (won) {
              A.idx++;
              if (A.idx >= A.ladder.length) return arcadeEnding(game, A);
              arcadeNext(game, A);
            } else {
              game.go(new ContinueScreen(game, me.id, A.sel.alt, () => arcadeFight(game, A), () => game.go(new GameOverScreen(game))));
            }
          },
        }));
      },
    }));
  }, extra));
}

function rivalLine(a, b) {
  const lines = {
    trauma: 'YOU CALL THAT A CONSULT? I\'LL SHOW YOU A CONSULT.', surgeon: 'YOU STITCH LIKE AN INTERN. LET ME DEMONSTRATE.', nightingale: 'YOU CUT OUR STAFFING. I CUT YOU.',
    admin: 'YOUR OVERTIME REQUEST HAS BEEN DENIED. PERMANENTLY.', psych: 'YOUR AGGRESSION IS ROOTED IN SLEEP DEPRIVATION.', anesth: 'I COULD PUT YOU UNDER WITH ONE BREATH.',
    paramedic: 'I\'VE CARRIED HEAVIER PATIENTS THAN YOU. UP STAIRS.', ortho: 'BRO. BRO. YOU\'RE DONE, BRO.', labtech: 'YOU KEEP MOPPING UP MY SAMPLES!',
    janitor: 'YOU SPILLED. I MOP. YOU PAY.', chaplain: 'I PRAY FOR YOU. AND FOR YOUR IMMUNE SYSTEM.', zero: '*COUGH* COME CLOSER, PADRE.',
    it: 'YOUR WORKSTATION HAS BEEN... DEPRECATED.', radiologist: 'I READ YOUR TICKET. IMPRESSION: USELESS.', peds: 'NO SUGAR? NO MERCY.', dietitian: 'STICKERS ARE EMPTY CALORIES.',
    pharmacist: 'YOUR CLAIM IS REJECTED. SO ARE YOU.', chief: 'YOU\'RE LATE FOR YOUR PERFORMANCE REVIEW.',
  };
  return lines[a.id] || 'YOU AGAIN?';
}

function arcadeEnding(game, A) {
  const me = FIGHTER_BY_ID[A.sel.id];
  const stage = HOME_STAGE[me.id];
  const back = () => game.go(new CreditsScreen(game, () => game.go(new TitleScreen(game))));
  if (!A.story) {
    game.go(new StoryScreen(game, { fid: me.id, alt: A.sel.alt, stage, night: false, title: 'ARCADE CLEAR!', pose: 'win1', pages: ['ALL CHALLENGERS DEFEATED. THE CHIEF OF STAFF HAS BEEN SENT TO ADMIN. ' + me.quotes[1], 'NOW TRY GRAND ROUNDS FOR ' + me.short + "'S STORY AND ENDINGS."], music: 'ending', onDone: back }));
    return;
  }
  game.go(new StoryScreen(game, {
    fid: me.id, alt: A.sel.alt, stage, night: true, title: 'THE BOARDROOM', pose: 'win1',
    pages: ['THE CHIEF OF STAFF LIES DEFEATED ON THE HELIPAD. THE HOSPITAL IS YOURS... FOR NOW.', 'BUT EVERY SHIFT ENDS WITH A DECISION.'],
    choice: me.choice, music: 'ending',
    onDone: (i) => {
      game.go(new StoryScreen(game, {
        fid: me.id, alt: A.sel.alt, stage, night: i === 1, title: 'ENDING ' + (i === 0 ? 'A' : 'B'), pose: i === 0 ? 'win2' : 'introA',
        pages: [me.endings[i], 'THE END. (UNTIL YOUR NEXT SHIFT.)'], onDone: back,
      }));
    },
  }));
}

export class LadderScreen {
  constructor(game, A, next) {
    this.game = game;
    this.A = A;
    this.next = next;
    this.t = 0;
    Sound.music('select');
  }
  update() {
    this.t++;
    const m = this.game.menu();
    if (this.t > 100 || (this.t > 20 && (m.confirm || this.game.anyTap()))) this.next();
    if (m.back && this.t > 10) {
      Sound.sfx('cancel');
      this.game.go(new MainMenu(this.game));
    }
  }
  draw(g) {
    const { W, H } = this.game;
    stripeBG(g, W, H, this.t, '#120a22', '#1a1030');
    header(g, W, this.A.story ? 'GRAND ROUNDS' : 'ARCADE', 'FIGHT ' + (this.A.idx + 1) + ' OF ' + this.A.ladder.length);
    const n = this.A.ladder.length;
    const cw = 30, gap = 8;
    const total = n * cw + (n - 1) * gap;
    const x0 = Math.round(W / 2 - total / 2);
    for (let i = 0; i < n; i++) {
      const f = FIGHTER_BY_ID[this.A.ladder[i]];
      const x = x0 + i * (cw + gap);
      const y = 70 + (i % 2) * 0;
      const cur = i === this.A.idx;
      const done = i < this.A.idx;
      rect(g, x - 2, y - 2, cw + 4, cw + 4, cur ? (Math.floor(this.t / 8) % 2 ? '#ff3040' : '#ffe040') : O);
      rect(g, x, y, cw, cw, darken(f.color, 0.45));
      g.drawImage(getPortrait(lookFor(f.id), 'idle1', cw, cw), x, y);
      if (done) {
        g.globalAlpha = 0.6;
        rect(g, x, y, cw, cw, '#000000');
        g.globalAlpha = 1;
        line(g, x + 3, y + 3, x + cw - 3, y + cw - 3, '#ff3040', 2);
        line(g, x + cw - 3, y + 3, x + 3, y + cw - 3, '#ff3040', 2);
      }
      if (i === n - 1) drawText(g, 'BOSS', x + cw / 2, y + cw + 4, { font: 'small', color: '#ff6060', align: 'center' });
      else if (this.A.ladder[i] === this.A.rivalId) drawText(g, 'RIVAL', x + cw / 2, y + cw + 4, { font: 'small', color: '#ffa040', align: 'center' });
      if (i < n - 1) rect(g, x + cw + 2, y + cw / 2, gap - 4, 2, '#504070');
    }
    const f = FIGHTER_BY_ID[this.A.ladder[this.A.idx]];
    drawText(g, 'NEXT PATIENT:', W / 2, 124, { font: 'small', color: '#c0b0e0', align: 'center' });
    drawText(g, f.name, W / 2, 134, { scale: 2, color: '#ffffff', outline: O, align: 'center' });
    drawText(g, f.title, W / 2, 152, { font: 'small', color: '#ffe080', align: 'center' });
    drawText(g, 'CPU: ' + DIFF_NAMES[Math.min(4, Save.settings.difficulty + (this.A.idx >= n - 2 ? 1 : 0))], W / 2, 162, { font: 'small', color: '#80a0c0', align: 'center' });
  }
}
