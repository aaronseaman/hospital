// Match: owns two fighters, projectiles, objects, hazards, round flow, camera and rendering.
import { Fighter, GRAV, WALL_L, WALL_R, blankInput, superDamage } from './fighter.js';
import { FX, drawProjectileArt, drawTrap, drawHazard, rect, circle, ring, line, fillPoly } from './fx.js';
import { drawFighterSprite, getPortrait } from './sprites.js';
import { drawText, measureText, wrapText } from './font.js';
import { drawStage, drawStageFront, STAGES } from './stages.js';
import { drawHUD } from './hud.js';
import { STR_HITSTOP, STR_SFX } from './moves.js';
import { Sound } from './audio.js';
import { lookFor } from './looks.js';
import { FIGHTER_BY_ID } from './fighters.js';
import { AI } from './ai.js';
import { Commentary } from './commentary.js';

export const GROUND_Y = 194;
export const WORLD_W = 800;
const PLAY_W = 372;

const SCALING = [1, 1, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3];
const COMBO_TAGS = { 3: 'NICE CHARTING!', 5: 'BILLABLE!', 8: 'UPCODED!', 12: 'MALPRACTICE?!', 16: 'SENT TO LEGAL' };
const KO_TYPES = { normal: 'DISCHARGED!', super: 'ADMITTED TO ICU!', throw: 'SENT TO ADMIN!', impact: 'SENT TO ADMIN!', chip: 'BILLED TO DEATH!', poison: 'HOSPITAL ACQUIRED!', hazard: 'INCIDENT REPORT FILED!' };
const SUPER_WORDS = {
  ortho: ['HIP!', 'KNEE!', 'SHOULDER!', 'SPINE?!', 'BRO!!'],
  psych: ['HMM.', 'I SEE.', 'GO ON...', 'AND YOUR MOTHER?', "TIME'S UP."],
  nightingale: ['VITALS!', 'MEDS!', 'CHART!', 'CALL LIGHT!', 'BREAK? NO!'],
  paramedic: ['SCOOP!', 'RUN!', 'LIGHTS!', 'SIRENS!', 'GOLDEN HOUR!'],
  peds: ['TICKLE!', 'BOOSTER!', 'STICKER!', 'NO CRYING!', 'WHEEE!'],
  admin: ['DENIED!', 'CUT!', 'RESTRUCTURE!', 'SYNERGY!', 'OUT OF NETWORK!'],
};

export class Match {
  constructor(cfg, opts = {}) {
    this.cfg = cfg;
    this.onEnd = opts.onEnd || (() => {});
    this.settings = opts.settings || {};
    this.training = cfg.mode === 'training' ? Object.assign({ dummy: 'stand', infHp: true, infMeter: true, infGauge: true, boxes: false }, cfg.training || {}) : null;
    this.stage = cfg.stage;
    this.stageDef = STAGES.find((s) => s.id === cfg.stage) || STAGES[0];
    this.night = !!cfg.night;
    this.roundsToWin = cfg.rounds || 2;
    this.timerMax = cfg.timer === 0 ? Infinity : cfg.timer || 99;
    this.mods = new Set(cfg.mods || []);
    this.fx = new FX(this);
    this.frame = 0;
    this.round = 1;
    this.camX = (WORLD_W - 400) / 2;
    this.viewW = 400;
    this.projectiles = [];
    this.objects = [];
    this.hazards = [];
    this.popups = [[], []];
    this.ann = null;
    this.speeches = [];
    this.excite = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.slowmo = 0;
    this.freeze = null;
    this.seq = null;
    this.blackout = 0;
    this.superBG = null;
    this.paused = false;
    this.hazardT = 400;
    this.result = null;
    this.idSeq = 1;
    this.koFlash = 0;
    this.lastHitter = 0;
    const mk = (side, p) => {
      const def = FIGHTER_BY_ID[p.id];
      const look = lookFor(p.id, p.alt);
      const f = new Fighter(this, side, def, look, { ctrl: p.ctrl, scheme: p.scheme, cpuLevel: p.cpuLevel, dmgMul: p.dmgMul });
      if (p.ctrl === 'cpu') f.ai = new AI(f, p.cpuLevel || 2);
      return f;
    };
    this.fighters = [mk(0, cfg.p1), mk(1, cfg.p2)];
    this.booth = new Commentary();
    this.booth.enabled = opts.settings ? opts.settings.commentary !== false : true;
    if (this.mods.has('fullcode')) for (const f of this.fighters) f.meter = 300;
    this.startRound(true);
  }

  // ---------------- flow ----------------
  startRound(first) {
    const [a, b] = this.fighters;
    a.resetRound(WORLD_W / 2 - 70, 1);
    b.resetRound(WORLD_W / 2 + 70, -1);
    a.lowCommented = b.lowCommented = false;
    if (this.mods.has('fullcode')) for (const f of this.fighters) f.meter = 300;
    this.projectiles = [];
    this.objects = [];
    this.hazards = [];
    this.camX = WORLD_W / 2 - this.viewW / 2;
    this.timer = this.timerMax;
    this.timerFrac = 0;
    this.koType = null;
    this.ko = null;
    this.superBG = null;
    if (this.training) {
      this.phase = 'fight';
      this.phaseT = 0;
      return;
    }
    if (first && !this.cfg.skipIntro) {
      this.phase = 'intro';
      a.setState('intro');
      b.setState('intro');
      a.introPose = 'introA';
      b.introPose = 'tauntB';
      const line = this.cfg.introLine || null;
      if (line) this.speech(b, line, 110);
      else this.speech(a, pickIntro(a.def, b.def), 100);
    } else {
      this.phase = 'roundcall';
    }
    this.phaseT = 0;
  }

  isFinalRound() {
    const [a, b] = this.fighters;
    return a.roundsWon === this.roundsToWin - 1 && b.roundsWon === this.roundsToWin - 1;
  }

  updateFlow() {
    this.phaseT++;
    const [a, b] = this.fighters;
    if (this.phase === 'intro') {
      if (this.phaseT === 50) this.speech(b, pickIntro(b.def, a.def), 80);
      if (this.phaseT >= 120) {
        this.phase = 'roundcall';
        this.phaseT = 0;
        a.setState('idle');
        b.setState('idle');
      }
    } else if (this.phase === 'roundcall') {
      if (this.phaseT === 1) {
        if (this.musicId) Sound.music(this.musicId);
        const fin = this.isFinalRound();
        const txt = fin ? 'FINAL ROUND' : 'ROUND ' + this.round;
        this.announce(txt, 58, '#ffffff');
        Sound.sfx('round');
        Sound.say(fin ? 'Final round' : 'Round ' + ['one', 'two', 'three', 'four', 'five'][this.round - 1]);
        if (fin) Sound.setIntensity(2);
        else Sound.setIntensity(0);
      }
      if (this.phaseT === 62) {
        this.announce('SCRUB IN!', 40, '#ffe040', false, true);
        Sound.sfx('start');
        Sound.say('Scrub in!');
      }
      if (this.phaseT >= 82) {
        this.phase = 'fight';
        this.phaseT = 0;
        a.setState('idle');
        b.setState('idle');
        if (this.round === 1) this.booth.event('start', true);
      }
    } else if (this.phase === 'fight') {
      if (this.timer !== Infinity && !this.freeze && !this.seq) {
        this.timerFrac++;
        if (this.timerFrac >= 40) {
          this.timerFrac = 0;
          this.timer--;
          if (this.timer <= 10 && this.timer > 0) Sound.sfx('timer');
          if (this.timer === 10) this.booth.event('timelow');
          if (this.timer <= 0) this.timeOver();
        }
      }
      // dynamic music intensity
      const low = Math.min(a.hp / a.maxHp, b.hp / b.maxHp);
      if (!this.isFinalRound()) Sound.setIntensity(low < 0.3 ? 2 : low < 0.6 ? 1 : 0);
    } else if (this.phase === 'ko' || this.phase === 'timeover') {
      const t = this.phaseT;
      if (this.phase === 'ko' && t === 90 && this.koType) {
        this.announce(this.koType, 90, '#ff5050', false, true, 'stamp');
        Sound.sfx('stamp');
      }
      const winner = this.roundWinner;
      if (t === 150) {
        for (const f of this.fighters) {
          if (f.hp > 0 || this.phase === 'timeover') {
            if (winner === null || (winner !== undefined && f.side === winner)) {
              if (f.state !== 'ko') {
                f.setState('win');
                f.move = null;
                f.vx = 0;
              }
            } else if (f.state !== 'ko' && f.state !== 'knockdown') {
              f.setState('lose');
              f.vx = 0;
            }
          }
        }
        if (winner !== null && winner !== undefined) {
          const w = this.fighters[winner];
          if (w.hp >= w.maxHp) {
            this.announce('PERFECT!', 80, '#80ff80', false, true);
            this.popupCenter('NO PAPERWORK REQUIRED');
            Sound.jingle('perfect');
            Sound.say('Perfect!');
          } else Sound.sfx('crowd');
          this.excite = 1;
        }
      }
      if (t >= 280) this.endRound();
    }
  }

  timeOver() {
    const [a, b] = this.fighters;
    this.phase = 'timeover';
    this.phaseT = 0;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    this.roundWinner = ra > rb ? 0 : rb > ra ? 1 : null;
    if (this.roundWinner !== null) this.fighters[this.roundWinner].roundsWon++;
    else {
      a.roundsWon++;
      b.roundsWon++;
    }
    this.announce('SHIFT OVER!', 100, '#ffd040', false, true);
    Sound.say('Shift over!');
    Sound.sfx('flatline');
    for (const f of this.fighters) if (['attack', 'walk', 'crouch', 'idle', 'dash'].includes(f.state)) { f.move = null; f.setState('idle'); f.vx = 0; }
  }

  onKO(att, def, kind) {
    if (this.phase !== 'fight') return;
    if (this.training) {
      def.hp = def.maxHp;
      return;
    }
    const [a, b] = this.fighters;
    const both = a.hp <= 0 && b.hp <= 0;
    this.phase = 'ko';
    this.phaseT = 0;
    this.ko = { att, def, kind };
    this.slowmo = 70;
    this.koFlash = 40;
    this.shake(10, 20);
    if (both) {
      this.roundWinner = null;
      a.roundsWon++;
      b.roundsWon++;
      this.announce('DOUBLE CODE!', 120, '#58a8ff', false, true, 'codeblue');
    } else {
      this.roundWinner = att.side;
      att.roundsWon++;
      this.announce('CODE BLUE!', 120, '#58a8ff', false, true, 'codeblue');
      this.koType = KO_TYPES[kind] || KO_TYPES.normal;
      if (kind === 'super' && this.lastSuperCritical) this.koType = 'CRITICAL CARE!';
    }
    Sound.sfx('ko');
    Sound.jingle('ko');
    Sound.say('Code blue!');
    this.excite = 1;
    def.koType = kind;
  }

  endRound() {
    const [a, b] = this.fighters;
    const done = a.roundsWon >= this.roundsToWin || b.roundsWon >= this.roundsToWin;
    if (done) {
      let winner = a.roundsWon > b.roundsWon ? 0 : b.roundsWon > a.roundsWon ? 1 : null;
      this.phase = 'matchend';
      this.phaseT = 0;
      this.result = { winner, fighters: this.fighters.map((f) => ({ id: f.def.id, hp: f.hp, max: f.maxHp, stats: f.stats, rounds: f.roundsWon })) };
      this.onEnd(this.result);
      return;
    }
    this.round++;
    this.startRound(false);
  }

  // ---------------- helpers ----------------
  shake(mag, t = 8) {
    if (this.settings.shake === false) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, t);
  }
  announce(text, dur, color, small, big, style) {
    this.ann = { text, t: 0, dur, color, small, big, style };
    if (typeof window !== 'undefined' && window.__a11y) window.__a11y(text);
  }
  popup(f, text, color = '#ffffff') {
    const list = this.popups[f.side];
    list.unshift({ text, color, t: 0 });
    if (list.length > 3) list.length = 3;
  }
  popupCenter(text) {
    this.centerPop = { text, t: 0 };
  }
  callout(f, name) {
    if (this.settings.callouts === false) return;
    this.fx.text(f.x, f.y + 92 * f.s, name, f.def.color === '#2e2c3c' || f.def.color === '#1c2c5c' || f.def.color === '#24346c' || f.def.color === '#3a3a4c' ? '#c0d0ff' : f.def.color, 46);
  }
  speech(f, text, dur = 110) {
    this.speeches = this.speeches.filter((s) => s.f !== f);
    this.speeches.push({ f, text, t: 0, dur });
  }
  camPlayL() {
    const mid = (this.fighters[0].x + this.fighters[1].x) / 2;
    return mid - PLAY_W / 2;
  }
  camPlayR() {
    const mid = (this.fighters[0].x + this.fighters[1].x) / 2;
    return mid + PLAY_W / 2;
  }
  nearWall(f, dir) {
    return dir < 0 ? f.x <= WALL_L + 6 : f.x >= WALL_R - 6;
  }

  superFreeze(f, level, critical) {
    this.freeze = { f, level, critical, t: 0, dur: level >= 3 ? 64 : level === 2 ? 46 : 36 };
    this.lastSuperCritical = critical;
    this.booth.event('super', level >= 2);
    if (level >= 3) this.superBG = { f, t: 0, critical, color: f.def.super.color };
    Sound.sfx('super');
    const name = f.def.super.name;
    Sound.say(critical ? 'Critical care!' : name.toLowerCase());
    this.excite = Math.max(this.excite, 0.7);
    if (f.def.super.line) this.speech(f, f.def.super.line, 70);
  }

  canBeThrown(o, cmd) {
    if (o.airborne || o.invuln > 0 || o.throwInvuln > 0) return false;
    if (['hitstun', 'blockstun', 'knockdown', 'getup', 'airhit', 'cinema', 'thrown', 'throwing', 'ko', 'fall', 'crumple', 'jumpsquat'].includes(o.state)) return false;
    if (o.state === 'attack' && o.move && o.move.kind === 'super') return false;
    return true;
  }

  // ---------------- spawners ----------------
  spawnProjectile(owner, p) {
    p.owner = owner;
    p.id = this.idSeq++;
    p.age = 0;
    p.hitsDone = 0;
    p.rehitT = 0;
    this.projectiles.push(p);
    if (!p.rain && !p.ground) owner.proj++;
    return p;
  }
  spawnTrap(owner, trap, x) {
    x = Math.max(WALL_L + 10, Math.min(WALL_R - 10, x));
    this.objects.push({ kind: 'trap', trap, x, owner, t: 0, life: trap.startsWith('cloud') ? 240 : 480 });
  }
  spawnBeam(owner, b) {
    this.objects.push(Object.assign({ kind: 'beam', owner, t: 0, hitsDone: 0, rehitT: 0, facing: owner.facing, moveRef: owner.move }, b));
  }
  spawnDrop(owner, x, delay, dmg, hits) {
    this.objects.push({ kind: 'drop', owner, x, delay, dmg, hits, t: 0, hy: 220, hitsDone: 0 });
  }
  spawnZone(owner, z) {
    this.objects.push(Object.assign({ kind: 'zone', owner, t: 0, x: owner.x, hitsDone: 0, rehitT: 0, moveRef: owner.move }, z));
  }

  // ---------------- update ----------------
  update(inputs) {
    this.frame++;
    if (this.paused) return;
    if (this.ann) {
      this.ann.t++;
      if (this.ann.t >= this.ann.dur) this.ann = null;
    }
    for (const l of this.popups) for (const p of l) p.t++;
    this.popups = this.popups.map((l) => l.filter((p) => p.t < 80));
    if (this.centerPop && ++this.centerPop.t > 100) this.centerPop = null;
    this.speeches = this.speeches.filter((s) => ++s.t < s.dur);
    this.excite *= 0.985;
    if (this.shakeT > 0) this.shakeT--;
    else this.shakeMag = 0;
    if (this.koFlash > 0) this.koFlash--;
    this.booth.update();
    if (this.superBG) {
      this.superBG.t++;
      const f = this.superBG.f;
      if (this.superBG.t > 40 && !(f.state === 'attack' && f.move && f.move.kind === 'super') && !this.seq) this.superBG = null;
    }

    // inputs are read every frame (even during cinematics) so throw techs and buffering work
    const fightingNow = this.phase === 'fight';
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      if (f.ai && fightingNow) continue;
      if (this.training && i === 1 && fightingNow) continue;
      f.setInput(fightingNow ? inputs[i] || blankInput() : blankInput());
    }
    if (this.freeze) {
      this.freeze.t++;
      this.fx.update();
      if (this.freeze.t >= this.freeze.dur) this.freeze = null;
      return;
    }
    if (this.seq) {
      this.seq.update();
      this.fx.update();
      this.updateCamera();
      return;
    }
    if (this.slowmo > 0) {
      this.slowmo--;
      if (this.slowmo % 3 !== 0) {
        this.updateFlow();
        return;
      }
    }

    const fighting = this.phase === 'fight';
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      if (f.ai && fighting) f.setInput(f.ai.update(this));
      else if (this.training && i === 1 && fighting) f.setInput(this.dummyInput(f));
      else f.setInput(fighting || this.phase === 'roundcall' ? inputs[i] || blankInput() : blankInput());
      if (!fighting && this.phase === 'roundcall') f.setInput(blankInput());
    }
    // update order alternates to avoid side bias
    const order = this.frame % 2 ? [0, 1] : [1, 0];
    for (const i of order) this.fighters[i].update();
    for (const f of this.fighters) this.physics(f);
    this.pushApart();
    this.clampWalls();
    if (fighting || this.phase === 'ko') this.checkHits();
    this.updateProjectiles();
    this.updateObjects();
    if (fighting) this.updateHazards();
    this.fx.update();
    this.updateCamera();
    this.updateFlow();
    if (this.training) this.trainingTick();
  }

  dummyInput(f) {
    const inp = blankInput();
    const t = this.training;
    const toward = f.opp.x > f.x;
    const back = toward ? 'left' : 'right';
    if (t.dummy === 'crouch') inp.down = true;
    else if (t.dummy === 'jump') inp.up = true;
    else if (t.dummy === 'block') {
      const o = f.opp;
      const threat = (o.state === 'attack' && o.move) || this.projectiles.some((p) => p.owner === o);
      if (threat) {
        inp[back] = true;
        const low = o.move && o.move.def && o.move.def.guard === 'low';
        inp.down = low || (o.move && o.move.spec && o.move.spec.guard === 'low');
      }
    }
    return inp;
  }

  trainingTick() {
    const t = this.training;
    for (const f of this.fighters) {
      if (t.infMeter) f.meter = 300;
      if (t.infHp && f.hp < f.maxHp && !['hitstun', 'airhit', 'knockdown', 'blockstun', 'crumple', 'cinema', 'thrown'].includes(f.state) && f.comboHits === 0) {
        f.hp = Math.min(f.maxHp, f.hp + 12);
        f.redHp = f.hp;
      }
      if (t.infGauge) {
        f.gauge = 600;
        f.burnout = false;
      }
    }
  }

  physics(f) {
    if (f.hitstop > 0 || f.freezeT > 0) return;
    if (['cinema', 'thrown', 'throwing'].includes(f.state)) return;
    f.x += f.vx;
    const air = f.y > 0 || f.vy > 0;
    if (air) {
      f.y += f.vy;
      f.vy -= f.state === 'airhit' ? GRAV * 0.9 : GRAV;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        this.onLand(f);
      }
    } else if (['hitstun', 'blockstun', 'knockdown', 'crumple', 'getup', 'parry'].includes(f.state)) {
      f.vx *= 0.8;
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
    }
  }

  onLand(f) {
    const st = f.state;
    if (st === 'air') {
      f.setState('land');
      f.vx = 0;
      this.fx.dust(f.x, 0);
      Sound.sfx('land', { vol: 0.4 });
    } else if (st === 'airhit' || st === 'fall') {
      f.vx *= 0.3;
      this.fx.dust(f.x, 0);
      this.shake(3, 5);
      Sound.sfx('land');
      if (f.bounce) {
        f.bounce = false;
        f.vy = 3.2;
        f.y = 0.1;
        return;
      }
      f.setState(f.hp <= 0 ? 'ko' : 'knockdown');
      f.knockdownT = f.hp <= 0 ? 9999 : 34;
      f.juggle = 0;
      f.comboHits = 0;
    } else if (st === 'attack' && f.move) {
      const mv = f.move;
      if (mv.kind === 'normal' && mv.def.air) {
        f.move = null;
        f.setState('land');
        f.vx = 0;
      } else if (mv.kind === 'special' && mv.spec.type === 'projectile') {
        f.recover();
      } else if (mv.kind === 'special' && mv.spec.type === 'spin' && mv.spec.hover && mv.t > mv.startup + mv.active) {
        f.recover();
      }
    } else if (st === 'hitstun') {
      // shouldn't be airborne; ignore
    } else if (st === 'ko') {
      this.fx.dust(f.x, 0);
    }
  }

  pushApart() {
    const [a, b] = this.fighters;
    if (['cinema', 'thrown', 'throwing'].includes(a.state) || ['cinema', 'thrown', 'throwing'].includes(b.state)) return;
    if (a.state === 'knockdown' || b.state === 'knockdown' || a.state === 'ko' || b.state === 'ko') return;
    const minD = a.halfW + b.halfW;
    const dx = b.x - a.x;
    const vertOverlap = Math.abs(a.y - b.y) < 46;
    if (!vertOverlap || Math.abs(dx) >= minD) return;
    let dir = dx === 0 ? (a.facing > 0 ? 1 : -1) : Math.sign(dx);
    // airborne crossing: push the airborne one to whichever side it's moving
    const over = (minD - Math.abs(dx)) / 2;
    let pa = over, pb = over;
    if (a.x - over * dir < WALL_L || a.x - over * dir > WALL_R) { pa = 0; pb = over * 2; }
    if (b.x + over * dir < WALL_L || b.x + over * dir > WALL_R) { pb = 0; pa = over * 2; }
    a.x -= dir * pa;
    b.x += dir * pb;
  }

  clampWalls() {
    const [a, b] = this.fighters;
    for (const f of this.fighters) {
      if (['cinema', 'thrown', 'throwing'].includes(f.state)) continue;
      f.x = Math.max(WALL_L, Math.min(WALL_R, f.x));
    }
    // max separation
    const maxSep = PLAY_W - 28;
    const d = b.x - a.x;
    if (Math.abs(d) > maxSep) {
      const over = Math.abs(d) - maxSep;
      const s = Math.sign(d);
      // push back whoever is moving away
      const aAway = a.vx * -s > 0, bAway = b.vx * s > 0;
      if (aAway && !bAway) a.x += s * over;
      else if (bAway && !aAway) b.x -= s * over;
      else {
        a.x += (s * over) / 2;
        b.x -= (s * over) / 2;
      }
    }
  }

  updateCamera() {
    const [a, b] = this.fighters;
    let mid = (a.x + b.x) / 2;
    if (this.seq && this.seq.camX !== undefined) mid = this.seq.camX;
    const target = Math.max(0, Math.min(WORLD_W - this.viewW, mid - this.viewW / 2));
    this.camX += (target - this.camX) * 0.25;
  }

  // ---------------- hits ----------------
  checkHits() {
    const pending = [];
    for (const att of this.fighters) {
      const hb = att.getHitbox();
      if (!hb || !hb.box) continue;
      const def = att.opp;
      if (!this.hittable(def, att, hb.hd)) continue;
      for (const hurt of def.getHurtboxes()) {
        if (overlap(hb.box, hurt)) {
          pending.push({ att, def, hd: hb.hd, pt: center(hb.box, hurt) });
          break;
        }
      }
    }
    for (const p of pending) this.resolveHit(p.att, p.def, p.hd, p.pt, 'fighter');
  }

  hittable(def, att, hd) {
    if (def.invuln > 0) return false;
    if (['knockdown', 'getup', 'ko', 'cinema', 'thrown', 'intro', 'win', 'lose'].includes(def.state)) return false;
    if (def.state === 'airhit' && def.juggle >= 3 && !(hd && hd.kind === 'super')) return false;
    if (def.move && def.move.antiAirInvuln && att.airborne && def.inMovePhase() !== 'recovery') return false;
    if (def.state === 'attack' && def.move && def.move.kind === 'special' && def.move.spec.type === 'teleport' && def.inMovePhase() === 'startup') return false;
    return true;
  }

  isBlocking(def, att, guard, srcX) {
    if (!def.canBlock()) return false;
    if (def.ctrl === 'cpu' && def.ai && def.ai.wantsBlock === false) return false;
    const inp = def.inp;
    const fromRight = srcX > def.x;
    const holdingAway = fromRight ? inp.left && !inp.right : inp.right && !inp.left;
    if (!holdingAway) return false;
    const crouch = inp.down;
    if (guard === 'low' && !crouch) return false;
    if (guard === 'high' && crouch) return false;
    def.crouchBlock = crouch;
    return true;
  }

  resolveHit(att, def, hd, pt, src, proj) {
    const srcX = proj ? proj.x - (proj.vx || 0) * 3 : att.x;
    const dir = srcX < def.x ? 1 : -1; // direction def gets pushed
    const isProj = src === 'proj' || src === 'object';
    // counter stance
    if (def.state === 'attack' && def.move && def.move.counterReady && !isProj && hd.kind !== 'throw') {
      return this.counterTriggered(def, att);
    }
    // parry
    if (def.state === 'parry') {
      if (hd.impact) {
        def.parryT = 99;
        hd = Object.assign({}, hd, { punishForce: true });
      } else {
        const perfect = def.parryT <= 3;
        def.gauge = Math.min(600, def.gauge + (perfect ? 120 : 40));
        att.hitstop = def.hitstop = perfect ? 22 : 8;
        if (!isProj) att.onConnect(hd, true, def);
        else if (proj) proj.hitsDone++;
        this.fx.spark(pt.x, pt.y, 1, perfect ? 'perfect' : 'parry');
        Sound.sfx(perfect ? 'perfect' : 'parry');
        def.vx = dir * (perfect ? 0.5 : 1.5);
        def.stats.parries++;
        if (perfect) {
          def.stats.perfects++;
          this.booth.event('perfect');
          this.popup(def, 'PERFECT HAND HYGIENE!', '#60ff90');
          Sound.say('Perfect hand hygiene!');
          this.slowmo = 30;
          if (!isProj && att.move) att.move.recovery += 12;
          if (att.move) att.move.hitConfirmed = false;
        } else this.popup(def, 'HAND HYGIENE', '#90ffb0');
        return;
      }
    }
    // armor
    if (def.armor > 0 && !hd.impact && hd.kind !== 'super' && hd.kind !== 'throw') {
      def.armor--;
      const chip = Math.round(hd.dmg * 0.5);
      def.hp = Math.max(1, def.hp - chip);
      def.redDelay = 40;
      att.hitstop = def.hitstop = 10;
      if (!isProj) att.onConnect(hd, true, def);
      else if (proj) proj.hitsDone++;
      def.flashT = 8;
      this.fx.spark(pt.x, pt.y, 1, 'block');
      Sound.sfx('block', { pitch: 0.7 });
      this.popup(def, 'ARMOR', '#ffb030');
      return;
    }
    // impact vs impact armor broken
    if (def.armor > 0 && hd.impact) def.armor = 0;
    // block
    const guard = hd.guard || 'mid';
    if (!hd.unblockable && this.isBlocking(def, att, guard, srcX)) {
      let chip = 0;
      if (hd.chip || hd.kind === 'super') chip = Math.round(hd.dmg * (hd.kind === 'super' ? 0.25 : 0.15));
      if (def.burnout) chip = Math.max(chip, Math.round(hd.dmg * 0.18));
      if (chip && def.hp - chip <= 0 && !(hd.kind === 'super' || def.burnout)) chip = def.hp - 1;
      def.hp -= chip;
      def.redDelay = 40;
      def.setState('blockstun');
      def.blockstun = hd.blockstun || 12;
      def.move = null;
      def.vx = dir * (hd.pushBlock || 5) * 0.45;
      if (this.nearWall(def, dir) && !isProj) att.vx = -dir * (hd.pushBlock || 5) * 0.4;
      const hs = hd.impact ? 16 : STR_HITSTOP[hd.str || 0] - 2;
      def.hitstop = hs;
      if (!isProj) {
        att.hitstop = hs;
        att.onConnect(hd, true, def);
      }
      def.drainGauge(hd.impact ? 50 : 8 + (hd.str || 0) * 6);
      att.addMeter(hd.dmg * 0.12);
      def.addMeter(hd.dmg * 0.06);
      def.blockFlash = 4;
      this.fx.spark(pt.x, pt.y, hd.str || 0, 'block', -dir);
      Sound.sfx('block');
      // blocked impact: wall splat or burnout stun
      if (hd.impact) {
        if (def.burnout) {
          this.makeDizzy(def);
          this.popup(att, 'OVERWHELMED!', '#ffd040');
        } else if (this.nearWall(def, dir)) {
          this.popup(att, 'WALL SPLAT!', '#ffb030');
          def.setState('crumple');
          def.move = null;
          this.shake(6, 10);
        }
      }
      if (def.hp <= 0) {
        def.hp = 0;
        this.koHit(att, def, 'chip');
      }
      return;
    }
    // ---- HIT ----
    let counter = null;
    if (def.state === 'attack' && def.move) {
      const ph = def.inMovePhase();
      if (ph === 'startup' || ph === 'active') counter = 'counter';
      if (ph === 'recovery') counter = 'punish';
    }
    if (def.state === 'parry' || hd.punishForce) counter = 'punish';
    if ((def.state === 'dash' || def.state === 'backdash' || def.state === 'sprint') && def.t > 4) counter = 'punish';
    if (def.state === 'jumpsquat') counter = 'counter';
    if (hd.kind === 'super' || isProj && !hd.impact) counter = counter === 'punish' ? 'punish' : null;
    const scaleIdx = Math.min(def.comboHits, SCALING.length - 1);
    let scale = SCALING[scaleIdx];
    if (hd.kind === 'super') scale = Math.max(0.5, scale);
    let dmg = hd.dmg * scale * att.dmgMul;
    if (counter === 'counter') dmg *= 1.2;
    if (counter === 'punish') dmg *= 1.2;
    if (this.mods.has('budget')) dmg *= 1.25;
    dmg = Math.max(1, Math.round(dmg));
    if (hd.noKO && def.hp - dmg <= 0) dmg = Math.max(0, def.hp - 1);
    def.hp = Math.max(0, def.hp - dmg);
    def.redDelay = 50;
    def.comboHits++;
    def.comboDmg += dmg;
    def.lastHitT = this.frame;
    att.stats.hits++;
    att.stats.dmgBy = att.stats.dmgBy || {};
    const kk = hd.kind + (att.move && att.move.spec ? ':' + (att.move.spec.id || att.move.spec.type) : att.move && att.move.id ? ':' + att.move.id : '');
    att.stats.dmgBy[kk] = (att.stats.dmgBy[kk] || 0) + dmg;
    att.stats.maxCombo = Math.max(att.stats.maxCombo, def.comboHits);
    this.lastHitter = att.side;
    // meter / gauge / stun
    if (hd.kind !== 'super') att.addMeter(dmg * (this.mods.has('fullcode') ? 1.5 : 0.5));
    def.addMeter(dmg * 0.2);
    if (counter === 'punish') {
      def.drainGauge(50);
      att.stats.punishes++;
      this.popup(att, 'MALPRACTICE COUNTER!', '#ff4060');
      if (def.comboHits === 1) Sound.say('Malpractice!');
    } else if (counter === 'counter') {
      att.stats.counters++;
      this.popup(att, 'COUNTER', '#ffd040');
    }
    def.stun += dmg * (counter ? 1.1 : 0.8);
    def.stunDelay = 90;
    // reaction
    const strIdx = hd.str || 0;
    let hs = STR_HITSTOP[strIdx] + (counter ? 3 : 0);
    if (hd.kind === 'super') hs = 6;
    if (hd.impact) hs = 22;
    def.hitstop = hs;
    if (!isProj) att.hitstop = hs;
    def.move = null;
    def.armor = 0;
    def.flashT = 4;
    def.blockFlash = 0;
    const extra = counter === 'punish' ? 6 : counter === 'counter' ? 3 : 0;
    const wasAir = def.airborne || def.state === 'airhit';
    const crouching = def.isCrouching() && !wasAir;
    if (hd.crumple) {
      def.setState('crumple');
      def.vx = dir * 1.2;
      this.popup(att, 'CRUMPLED!', '#ffb030');
      this.shake(8, 12);
      if (this.nearWall(def, dir)) this.popup(att, 'WALL SPLAT!', '#ffb030');
    } else if (wasAir || hd.launch || (hd.launchAir && def.airborne)) {
      def.setState('airhit');
      def.juggle++;
      def.vy = hd.launch ? 6.2 + strIdx * 0.4 : 3.8;
      if (def.y < 0.5) def.y = 0.5;
      def.vx = dir * (hd.launch ? 1.4 : 2.0);
    } else if (hd.kd) {
      def.setState('airhit');
      def.vy = 3.0;
      def.y = 0.5;
      def.vx = dir * 1.6;
      def.juggle = 3;
    } else {
      def.setState('hitstun');
      def.hitstun = (hd.hitstun || 14) + extra;
      def.crouchHit = crouching;
      def.hitHigh = !crouching && (strIdx === 0 || hd.kind === 'normal' && att.move && att.move.def && !att.move.def.crouch);
      def.vx = dir * (hd.pushHit || 4) * 0.45;
      if (this.nearWall(def, dir) && !isProj) att.vx = -dir * (hd.pushHit || 4) * 0.4;
    }
    // effects
    if (hd.effect === 'xray' || (hd.fx === 'zap')) def.xrayT = 18;
    if (hd.effect === 'poison') def.poisonT = 180;
    if (hd.effect === 'slow') def.slowT = 150;
    if (hd.effect === 'drainMeter') {
      const steal = Math.min(def.meter, 50);
      def.meter -= steal;
      att.addMeter(steal * 0.5);
      if (steal > 0) this.popup(att, 'COVERAGE DENIED', '#ff6060');
    }
    if (hd.effect === 'drainGauge') {
      def.drainGauge(100);
      this.popup(att, 'CARBS COUNTED', '#ffd060');
    }
    if (!isProj) att.onConnect(hd, false, def);
    const sparkKind = counter === 'punish' ? 'punish' : counter ? 'counter' : hd.fx === 'zap' || hd.effect === 'xray' ? 'zap' : 'hit';
    this.fx.spark(pt.x, pt.y, strIdx, sparkKind, -dir);
    Sound.sfx(hd.kind === 'super' ? 'superHit' : hd.impact ? 'impactHit' : STR_SFX[strIdx], { pitch: 0.95 + Math.random() * 0.1 });
    if (hd.fx === 'zap' || hd.effect === 'xray') Sound.sfx('zap', { vol: 0.6 });
    if (strIdx >= 2 || counter) this.shake(strIdx * 2 + (counter ? 2 : 0), 6);
    this.excite = Math.min(1, this.excite + 0.06 + strIdx * 0.04 + (counter ? 0.1 : 0));
    // combo tags
    if (COMBO_TAGS[def.comboHits]) this.popup(att, COMBO_TAGS[def.comboHits], '#80e0ff');
    if (def.comboHits === 5) this.booth.event('combo');
    if (counter === 'punish' && def.comboHits === 1) this.booth.event('punish');
    if (hd.impact) this.booth.event('impact');
    if (def.hp > 0 && def.hp < def.maxHp * 0.2 && !def.lowCommented) {
      def.lowCommented = true;
      this.booth.event('lowhp');
    }
    // stun check
    if (def.stun >= 520 && def.hp > 0 && !hd.noKO && def.state !== 'airhit') {
      this.makeDizzy(def);
    }
    if (def.hp <= 0) {
      const kind = hd.kind === 'super' ? 'super' : hd.impact ? 'impact' : src === 'hazard' ? 'hazard' : 'normal';
      this.koHit(att, def, kind);
    }
  }

  koHit(att, def, kind) {
    def.move = null;
    if (!def.airborne || def.state !== 'airhit') {
      def.setState('airhit');
      def.vy = 4.2;
      def.y = Math.max(def.y, 0.5);
      def.vx = (att.x < def.x ? 1 : -1) * 2.2;
    }
    def.hitstop = 30;
    att.hitstop = 30;
    this.onKO(att, def, kind);
  }

  makeDizzy(def) {
    this.booth.event('dizzy', true);
    def.setState('dizzy');
    def.move = null;
    def.dizzyT = 150;
    def.stun = 0;
    def.vx = 0;
    this.announce('OVERWHELMED!', 70, '#ffd040', true);
    Sound.sfx('dizzy');
    Sound.say('Overwhelmed!');
  }

  counterTriggered(def, att) {
    const mv = def.move;
    mv.counterReady = false;
    const name = def.def.specials.find((s) => s.type === 'counter').name;
    this.announce(name + '!', 50, def.def.color === '#2e2c3c' ? '#fff0a0' : '#ffd080', true);
    Sound.sfx('parry');
    att.hitstop = 16;
    def.hitstop = 16;
    this.fx.spark(att.x, att.y + 50, 2, 'parry');
    // teleport behind attacker for a moment and strike
    const dmg = mv.spec.dmg;
    def.faceOpp();
    def.move = null;
    def.setState('attack');
    def.move = { kind: 'normal', id: '5hp', def: Object.assign({}, { w: 'hpA', a: 'hpA', r: 'hpR', startup: 1, active: 2, recovery: 18, dmg: 0, limb: 'bh', str: 2, guard: 'mid' }), t: 2, startup: 1, active: 2, recovery: 18, hits: 1, maxHits: 1, rehit: 99 };
    const hd = { dmg, hitstun: 30, blockstun: 10, guard: 'mid', str: 2, kd: true, kind: 'special', unblockable: true };
    if (mv.spec.freeze) {
      att.freezeT = 30;
      att.flashT = 30;
      this.popup(def, '...SHHH.', '#c0c0ff');
    }
    if (att.move) att.move.hits = att.move.maxHits;
    this.resolveHit(def, att, hd, { x: att.x, y: att.y + 50 }, 'counter');
  }

  tryThrow(att) {
    const def = att.opp;
    const range = att.halfW + def.halfW + 14;
    if (Math.abs(def.x - att.x) > range || !this.canBeThrown(def)) {
      if (def.state === 'parry' && Math.abs(def.x - att.x) <= range) {
        // throw beats parry (punish)
      } else {
        Sound.sfx('whiffL');
        return;
      }
    }
    // simultaneous throws tech
    if (def.state === 'attack' && def.move && def.move.kind === 'throw' && def.move.t <= def.move.startup + def.move.active) {
      return this.throwTech(att, def);
    }
    att.stats.throws++;
    this.startSeq(new ThrowSeq(this, att, def, att.move.back, def.state === 'parry'));
  }

  throwTech(a, b) {
    for (const f of [a, b]) {
      f.move = null;
      f.setState('blockstun');
      f.blockstun = 16;
      f.vx = (f.x < f.opp.x ? -1 : 1) * 3.4;
      f.hitstop = 8;
    }
    this.popup(b, 'SECOND OPINION!', '#80d0ff');
    this.booth.event('tech');
    this.fx.spark((a.x + b.x) / 2, 50, 1, 'block');
    Sound.sfx('tech');
  }

  commandGrab(att, def, dmg, spec) {
    this.startSeq(new GrabSeq(this, att, def, dmg, spec));
  }
  startFlurry(att, def, mv) {
    this.startSeq(mv.spec.type === 'grab' ? new SuperGrabSeq(this, att, def, mv) : new FlurrySeq(this, att, def, mv));
  }
  startDemon(att, def, mv) {
    this.startSeq(new DemonSeq(this, att, def, mv));
  }
  startSeq(s) {
    this.seq = s;
    s.begin();
  }

  // ---------------- projectiles & objects ----------------
  updateProjectiles() {
    const ps = this.projectiles;
    for (const p of ps) {
      p.age++;
      if (p.owner.hitstop > 0 && p.age < 3) continue;
      p.x += p.vx;
      p.y += p.vy;
      if (p.grav) p.vy -= p.grav;
      if (p.grow) {
        p.w = 14 * Math.min(2.2, 1 + p.age / 60);
        p.h = 10 * Math.min(2.2, 1 + p.age / 60);
        p.dmgBonus = Math.floor(p.age / 30) * 10;
      }
      if (p.rehitT > 0) p.rehitT--;
      if (p.onLand && p.y <= 0) {
        p.dead = true;
        this.spawnTrap(p.owner, p.onLand, p.x);
        Sound.sfx(p.onLand.startsWith('pills') ? 'pill' : 'splash');
        this.fx.burst(p.x, 4, p.onLand.startsWith('pills') ? 'pills' : 'splash', 6);
      }
      if (p.rain && p.y <= 0) {
        p.dead = true;
        this.fx.burst(p.x, 2, 'debris', 4);
      }
      if (--p.life <= 0 || p.x < this.camX - 40 || p.x > this.camX + this.viewW + 40) p.dead = true;
    }
    // projectile clashes
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        if (a.dead || b.dead || a.owner === b.owner || a.rain || b.rain || a.neutral || b.neutral) continue;
        if (overlap(projBox(a), projBox(b))) {
          a.hits--;
          b.hits--;
          this.fx.spark((a.x + b.x) / 2, a.y, 1, 'hit');
          Sound.sfx('hitM', { vol: 0.6 });
          if (a.hits <= 0 || a.big && !b.big) a.dead = a.hits <= 0;
          if (b.hits <= 0) b.dead = true;
          if (a.hits <= 0) a.dead = true;
        }
      }
    // hits on fighters
    for (const p of ps) {
      if (p.dead || p.rehitT > 0) continue;
      if (p.neutral) {
        for (const f of this.fighters) {
          if (p.dead || !this.hittable(f, f.opp, null)) continue;
          if (f.getHurtboxes().some((h) => overlap(projBox(p), h))) {
            p.dead = true;
            f.hp = Math.max(f.hp > p.dmg ? 1 : 0, f.hp - p.dmg);
            f.redDelay = 40;
            f.poisonT = Math.max(f.poisonT, 120);
            f.flashT = 6;
            this.fx.burst(f.x, f.y + 50, 'germ', 5);
            this.popup(f.opp, 'INFECTED!', '#a0ff60');
            Sound.sfx('gas', { vol: 0.6 });
            if (f.hp <= 0) this.onKO(f.opp, f, 'poison');
          }
        }
        continue;
      }
      const def = p.owner.opp;
      if (!this.hittable(def, p.owner, p)) continue;
      const box = projBox(p);
      for (const hurt of def.getHurtboxes()) {
        if (overlap(box, hurt)) {
          const hd = {
            dmg: p.dmg + (p.dmgBonus || 0), hitstun: 20, blockstun: 14, guard: p.guardOverride || 'mid', str: p.str ?? 1, kind: p.superLevel ? 'super' : 'proj', chip: true,
            pushHit: 4, pushBlock: 4, effect: p.effect, kd: p.superLevel && p.hitsDone >= p.hits - 1, launch: p.rain && p.hitsDone >= p.hits - 1 && p.superLevel,
          };
          this.resolveHit(p.owner, def, hd, center(box, hurt), 'proj', p);
          p.hitsDone++;
          p.rehitT = p.rehit || 8;
          if (p.hitsDone >= p.hits) p.dead = true;
          if (p.onLand) {
            p.dead = true;
            this.spawnTrap(p.owner, p.onLand, p.x);
          }
          break;
        }
      }
    }
    for (const p of ps) if (p.dead && !p.rain && !p.ground && !p.counted) {
      p.counted = true;
      p.owner.proj = Math.max(0, p.owner.proj - 1);
    }
    this.projectiles = ps.filter((p) => !p.dead);
  }

  updateObjects() {
    for (const o of this.objects) {
      o.t++;
      const own = o.owner;
      const def = own ? own.opp : null;
      if (o.kind === 'trap') {
        if (o.t > o.life) o.dead = true;
        if (o.t < 10) continue;
        for (const f of this.fighters) {
          if (f === own && !o.neutral) continue;
          if (f.airborne || !this.hittable(f, own || f.opp, null)) continue;
          if (Math.abs(f.x - o.x) < 16 + f.halfW * 0.5) {
            if (o.trap.startsWith('cloud')) {
              if (o.t % 20 === 0) {
                f.poisonT = Math.max(f.poisonT, 60);
                f.hp = Math.max(1, f.hp - 8);
                this.fx.burst(f.x, f.y + 40, 'germ', 2);
              }
              continue;
            }
            if (o.trap.startsWith('puddle')) {
              f.poisonT = 200;
              this.popup(own || f.opp, 'CONTAMINATED!', '#a0ff60');
              o.dead = true;
              Sound.sfx('splash');
              continue;
            }
            // slip
            o.dead = true;
            f.move = null;
            f.setState('airhit');
            f.vy = 3.6;
            f.y = 0.5;
            f.vx = f.facing * -0.6;
            f.juggle = 3;
            const dmg = 40;
            f.hp = Math.max(f.hp > dmg ? 1 : 0, f.hp - dmg);
            f.redDelay = 40;
            this.popup(own || f.opp, o.trap === 'wetfloor' ? 'SLIPPED!' : 'SLIPPED ON PILLS!', '#80c8ff');
            this.fx.burst(f.x, 4, 'splash', 8);
            Sound.sfx('slip');
            if (f.hp <= 0) this.koHit(f.opp, f, 'hazard');
          }
        }
      } else if (o.kind === 'beam') {
        if (o.attached) {
          if (own.move !== o.moveRef || own.state !== 'attack') {
            o.dead = true;
            continue;
          }
          o.x = own.x + own.facing * 22 * own.s;
          o.facing = own.facing;
        }
        if (o.t > o.delay + o.dur) o.dead = true;
        if (o.t === o.delay && o.delay > 0) Sound.sfx('zap', { pitch: 1.2 });
        if (o.t >= o.delay && o.t < o.delay + o.dur) {
          const box = beamBox(o);
          // destroy enemy projectiles
          for (const p of this.projectiles) if (p.owner !== own && !p.big && overlap(box, projBox(p))) p.dead = true;
          if (o.rehitT > 0) o.rehitT--;
          if (o.rehitT <= 0 && o.hitsDone < o.hits && this.hittable(def, own, null)) {
            for (const hurt of def.getHurtboxes()) {
              if (overlap(box, hurt)) {
                const last = o.hitsDone >= o.hits - 1;
                const hd = { dmg: o.dmg, hitstun: 22, blockstun: 12, guard: 'mid', str: o.superLevel ? 2 : 1, kind: o.superLevel ? 'super' : 'proj', chip: true, effect: o.effect, pushHit: 1, pushBlock: 1, kd: !!o.superLevel && last, fx: o.effect === 'zap' ? 'zap' : undefined };
                this.resolveHit(own, def, hd, center(box, hurt), 'object', { x: own.x, vx: 0 });
                o.hitsDone++;
                o.rehitT = Math.max(3, Math.floor(o.dur / o.hits));
                break;
              }
            }
          }
        }
      } else if (o.kind === 'drop') {
        if (o.t < o.delay) continue;
        o.hy -= 9;
        if (o.hy < 70 && o.hitsDone < o.hits && this.hittable(def, own, null)) {
          const box = { x: o.x - 12, y: o.hy - 10, w: 24, h: 24 };
          for (const hurt of def.getHurtboxes()) {
            if (overlap(box, hurt)) {
              this.resolveHit(own, def, { dmg: o.dmg, hitstun: 22, blockstun: 14, guard: 'high', str: 2, kind: 'proj', chip: true }, center(box, hurt), 'object', { x: o.x, vx: 0 });
              o.hitsDone++;
              if (o.hitsDone >= o.hits) o.dead = true;
              break;
            }
          }
        }
        if (o.hy <= 0) {
          o.dead = true;
          this.fx.burst(o.x, 4, 'paper', 6);
          this.shake(3, 4);
          Sound.sfx('stamp');
        }
      } else if (o.kind === 'zone') {
        if (own.move !== o.moveRef && o.t < 10) {
          o.dead = true;
          continue;
        }
        const R = Math.min(o.radius, o.t * (o.radius / 18));
        o.r = R;
        if (o.t % 2 === 0) {
          const a = Math.random() * Math.PI * 2;
          this.fx.burst(o.x + Math.cos(a) * R * 0.8, 40 + Math.sin(a) * 30, o.fx === 'germ' ? 'germ' : o.fx === 'bsod' ? 'bsod' : 'gas', 1, o.fx === 'germ' ? 9 : 1);
        }
        if (o.rehitT > 0) o.rehitT--;
        if (o.rehitT <= 0 && o.hitsDone < o.hits && Math.abs(def.x - o.x) < R && this.hittable(def, own, null)) {
          const last = o.hitsDone >= o.hits - 1;
          const hd = { dmg: o.dmg, hitstun: 30, blockstun: 10, guard: 'mid', str: 2, kind: 'super', chip: true, pushHit: 0.5, pushBlock: 0.5, kd: last };
          this.resolveHit(own, def, hd, { x: def.x, y: def.y + 40 }, 'object', { x: o.x, vx: 0 });
          if (o.fx === 'gas' && def.state === 'hitstun') this.fx.text(def.x, def.y + 90, String(Math.max(1, 10 - o.hitsDone)) + '...', '#c0f0ff', 30);
          if (o.fx === 'bsod' && def.state === 'hitstun') def.loadingT = 30;
          o.hitsDone++;
          o.rehitT = 6;
        }
        if (o.t > 60) o.dead = true;
      }
    }
    this.objects = this.objects.filter((o) => !o.dead);
  }

  // ---------------- hazards ----------------
  updateHazards() {
    if (this.training) return;
    const hz = this.cfg.hazards === false ? 'none' : this.stageDef.hazard;
    const kinds = [];
    if (hz && hz !== 'none') kinds.push(hz);
    if (this.mods.has('fishday')) kinds.push('fish');
    if (this.mods.has('outbreak')) kinds.push('outbreak');
    if (this.mods.has('jcaho')) kinds.push('jcaho');
    if (!kinds.length) return;
    this.hazardT--;
    if (this.hazardT <= 0) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      this.spawnHazard(kind);
      this.hazardT = (kind === 'outbreak' ? 200 : 480) + Math.floor(Math.random() * 300);
    }
    for (const h of this.hazards) {
      h.t++;
      switch (h.type) {
        case 'gurney':
        case 'car':
          if (h.t < 50) break;
          if (h.t === 50) Sound.sfx(h.type === 'car' ? 'car' : 'gurney');
          h.x += h.vx;
          for (const f of this.fighters) {
            if (h.hit.has(f) || f.airborne || !this.hittable(f, f.opp, null)) continue;
            if (Math.abs(f.x - h.x) < 26) {
              h.hit.add(f);
              this.hazardHit(f, h.type === 'car' ? 70 : 60, h.vx > 0 ? 1 : -1, h.type === 'car' ? 'HIT BY A COMPACT CAR!' : 'GURNEY\'D!');
            }
          }
          if (h.x < -60 || h.x > WORLD_W + 60) h.dead = true;
          break;
        case 'chart':
          if (h.phase === 'warn' && h.t > 45) {
            h.phase = 'fall';
            h.hy = 200;
          }
          if (h.phase === 'fall') {
            h.hy -= 7;
            for (const f of this.fighters) {
              if (h.hit.has(f) || !this.hittable(f, f.opp, null)) continue;
              if (Math.abs(f.x - h.x) < 14 && h.hy < f.y + 80 * f.s && h.hy > f.y) {
                h.hit.add(f);
                this.hazardHit(f, 40, 0, 'CHARTS DUE!');
              }
            }
            if (h.hy <= 0) {
              h.dead = true;
              this.fx.burst(h.x, 2, 'paper', 8);
              Sound.sfx('paper');
            }
          }
          break;
        case 'fish':
          if (h.t < 30) break;
          h.x += h.vx;
          h.hy = 40 + Math.sin(((h.x - h.x0) / 400) * Math.PI) * 50;
          for (const f of this.fighters) {
            if (h.hit.has(f) || !this.hittable(f, f.opp, null)) continue;
            if (Math.abs(f.x - h.x) < 12 && h.hy > f.y && h.hy < f.y + 80 * f.s) {
              h.hit.add(f);
              this.hazardHit(f, 30, h.vx > 0 ? 1 : -1, 'FISHY!');
              f.poisonT = 60;
            }
          }
          if (h.x < -40 || h.x > WORLD_W + 40) h.dead = true;
          break;
        case 'wind':
          if (h.t < 90) {
            for (const f of this.fighters) if (!f.airborne && ['idle', 'walk', 'crouch', 'blockstun'].includes(f.state)) f.x += h.dir * 0.7;
            if (h.t % 3 === 0) this.fx.add({ type: 'pix', x: h.dir > 0 ? this.camX : this.camX + this.viewW, y: 20 + Math.random() * 120, vx: h.dir * 9, vy: 0, life: 50, c: '#e0f0ff' });
          } else h.dead = true;
          break;
        case 'magnet':
          if (h.t < 100) {
            for (const f of this.fighters) if (!['cinema', 'thrown', 'throwing', 'knockdown'].includes(f.state)) f.x += Math.sign(400 - f.x) * 0.55;
          } else h.dead = true;
          break;
        case 'outbreak':
          if (h.t % 14 === 0 && h.t < 120) {
            const tgt = this.fighters[Math.floor(Math.random() * 2)];
            this.projectiles.push({ owner: tgt, sprite: 'germ', x: tgt.x + (Math.random() - 0.5) * 100, y: 220, vx: 0, vy: -4, dmg: 15, hits: 1, life: 80, w: 14, h: 14, rain: true, effect: 'poison', age: 0, hitsDone: 0, rehitT: 0, str: 0, neutral: true });
          }
          if (h.t > 130) h.dead = true;
          break;
        case 'jcaho':
          h.x += h.vx;
          if (h.t % 2 === 0) {
            for (const f of this.fighters) {
              if (f.state === 'attack' && f.move && f.move.t === 1 && Math.abs(f.x - h.x) < 200) {
                f.meter = Math.max(0, f.meter - 25);
                this.popup(f, 'VIOLATION CITED!', '#ff6060');
              }
            }
          }
          if (h.x < -40 || h.x > WORLD_W + 40) h.dead = true;
          break;
      }
    }
    this.hazards = this.hazards.filter((h) => !h.dead);
  }

  spawnHazard(kind) {
    const fromLeft = Math.random() < 0.5;
    const [a, b] = this.fighters;
    switch (kind) {
      case 'gurney':
      case 'car':
        this.hazards.push({ type: kind, t: 0, x: fromLeft ? this.camX - 40 : this.camX + this.viewW + 40, vx: (fromLeft ? 1 : -1) * (kind === 'car' ? 4.6 : 3.4), hit: new Set() });
        this.announce(kind === 'car' ? 'WATCH FOR CARS!' : 'RUNAWAY GURNEY!', 50, '#ffd020', true);
        break;
      case 'charts': {
        const tgt = Math.random() < 0.5 ? a : b;
        this.hazards.push({ type: 'chart', t: 0, x: tgt.x + (Math.random() - 0.5) * 30, phase: 'warn', hit: new Set() });
        break;
      }
      case 'fish':
        this.hazards.push({ type: 'fish', t: 0, x: fromLeft ? this.camX - 20 : this.camX + this.viewW + 20, x0: fromLeft ? this.camX - 20 : this.camX + this.viewW + 20, vx: fromLeft ? 3.4 : -3.4, hy: 40, hit: new Set() });
        this.announce('FRIDAY FISH DAY!', 40, '#e8c070', true);
        Sound.sfx('fish');
        break;
      case 'wind':
        this.hazards.push({ type: 'wind', t: 0, dir: fromLeft ? 1 : -1 });
        this.announce('ROTOR WASH!', 40, '#c0e0ff', true);
        Sound.sfx('wind');
        break;
      case 'magnet':
        this.hazards.push({ type: 'magnet', t: 0 });
        this.announce('MAGNET ENGAGED!', 50, '#ff8040', true);
        Sound.sfx('magnet');
        break;
      case 'wetfloor': {
        const x = 200 + Math.random() * 400;
        this.objects.push({ kind: 'trap', trap: 'wetfloor', x: Math.max(this.camX + 30, Math.min(this.camX + this.viewW - 30, x)), owner: null, neutral: true, t: 0, life: 400 });
        Sound.sfx('splash');
        break;
      }
      case 'outbreak':
        this.hazards.push({ type: 'outbreak', t: 0 });
        this.announce('OUTBREAK!', 40, '#a0ff60', true);
        break;
      case 'jcaho':
        this.hazards.push({ type: 'jcaho', t: 0, x: fromLeft ? this.camX - 20 : this.camX + this.viewW + 20, vx: fromLeft ? 0.9 : -0.9 });
        this.announce('JCAHO INSPECTION!', 60, '#ff8080', true);
        break;
    }
  }

  hazardHit(f, dmg, dir, text) {
    f.move = null;
    f.hp = Math.max(0, f.hp - dmg);
    f.redDelay = 40;
    f.setState('airhit');
    f.vy = 4;
    f.y = 0.5;
    f.vx = dir * 2;
    f.juggle = 3;
    f.hitstop = 10;
    this.popup(f.opp, text, '#ffd020');
    this.fx.spark(f.x, f.y + 40, 2, 'hit');
    Sound.sfx('hitH');
    this.shake(5, 8);
    this.excite = 1;
    if (f.hp <= 0) this.onKO(f.opp, f, 'hazard');
  }

  // =====================================================================
  // RENDER
  // =====================================================================
  draw(g, W, H, hud = true) {
    this.viewW = W;
    let sx = 0, sy = 0;
    if (this.shakeT > 0 && this.shakeMag > 0) {
      sx = Math.round((Math.random() - 0.5) * this.shakeMag);
      sy = Math.round((Math.random() - 0.5) * this.shakeMag * 0.6);
    }
    const camX = Math.round(this.camX);
    g.save();
    g.translate(sx, sy);
    const freeze = this.freeze;
    const sbg = this.superBG;
    if (this.blackout > 0) {
      rect(g, -8, -8, W + 16, H + 16, '#000000');
    } else {
      drawStage(g, this.stage, { camX, viewW: W, viewH: H, t: this.frame, night: this.night, excite: this.excite, groundY: GROUND_Y, worldW: WORLD_W });
      if (sbg) this.drawSuperBG(g, W, H, sbg);
      if (freeze) {
        g.globalAlpha = Math.min(0.72, freeze.t / 6);
        rect(g, -8, -8, W + 16, H + 16, '#08000c');
        g.globalAlpha = 1;
      }
      // shadows
      for (const f of this.fighters) this.drawShadow(g, f, camX);
      // traps behind fighters
      for (const o of this.objects) if (o.kind === 'trap') drawTrap(g, o, Math.round(o.x - camX), GROUND_Y, this.frame);
      for (const h of this.hazards) if (h.type === 'chart' && h.phase === 'warn') drawHazard(g, h, Math.round(h.x - camX), GROUND_Y, this.frame);
      this.fx.draw(g, camX, GROUND_Y, 'back');
    }
    // fighters (last hitter on top)
    const order = this.lastHitter === 0 ? [1, 0] : [0, 1];
    if (this.blackout <= 0) for (const i of order) this.drawFighter(g, this.fighters[i], camX, freeze);
    if (this.blackout <= 0) {
      for (const o of this.objects) if (o.kind === 'zone') this.drawZone(g, o, camX);
      for (const p of this.projectiles) drawProjectileArt(g, p, Math.round(p.x - camX), Math.round(GROUND_Y - p.y), p.age);
      for (const o of this.objects) if (o.kind === 'beam') this.drawBeam(g, o, camX);
      for (const o of this.objects) if (o.kind === 'drop') this.drawDrop(g, o, camX);
      for (const h of this.hazards) if (!(h.type === 'chart' && h.phase === 'warn')) this.drawHazardObj(g, h, camX);
      this.fx.draw(g, camX, GROUND_Y, 'front');
      drawStageFront(g, this.stage, { camX, viewW: W, viewH: H, t: this.frame, night: this.night, excite: this.excite, groundY: GROUND_Y, worldW: WORLD_W });
      this.drawSpeech(g, camX);
    }
    if (this.seq && this.seq.draw) this.seq.draw(g, W, H, camX);
    g.restore();
    if (this.koFlash > 0) {
      g.globalAlpha = (this.koFlash / 40) * 0.6;
      rect(g, 0, 0, W, H, this.koFlash > 34 ? '#ffffff' : '#2060ff');
      g.globalAlpha = 1;
    }
    if (freeze) this.drawCutIn(g, W, H, freeze);
    if (hud && this.blackout <= 0) drawHUD(g, this, W, H);
    if (hud && this.blackout <= 0 && !this.freeze && !this.training) this.booth.draw(g, W, H, H - 26);
    this.drawAnnouncements(g, W, H);
    if (this.training && this.training.boxes) this.drawBoxes(g, camX);
  }

  drawShadow(g, f, camX) {
    const x = Math.round(f.x - camX);
    const k = Math.max(0.3, 1 - f.y / 120);
    const w = Math.round(18 * f.s * k * (f.look.width || 1));
    g.globalAlpha = 0.35 * k;
    rect(g, x - w, GROUND_Y - 1, w * 2, 3, '#000000');
    rect(g, x - w + 3, GROUND_Y - 2, w * 2 - 6, 5, '#000000');
    g.globalAlpha = 1;
  }

  drawFighter(g, f, camX, freeze) {
    const pose = f.getPose();
    let x = f.x - camX;
    const y = GROUND_Y - f.y;
    if (f.hitstop > 0 && ['hitstun', 'airhit', 'blockstun', 'crumple'].includes(f.state)) x += (this.frame % 2 ? 1 : -1) * (f.state === 'blockstun' ? 1 : 2);
    let variant = '';
    if (f.xrayT > 0 && Math.floor(f.xrayT / 3) % 2 === 0) variant = 'xray';
    else if (f.flashT > 0 && f.flashT % 2 === 1) variant = 'flash';
    else if (f.freezeT > 0) variant = 'frozen';
    else if (f.burnout) variant = 'gray';
    else if (f.poisonT > 0 && Math.floor(this.frame / 8) % 2 === 0) variant = 'poison';
    if (freeze && freeze.f === f && freeze.t % 4 < 2) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawFighterSprite(g, f.look, pose, x + dx * 2, y + dy * 2, f.facing, 'sil:' + (f.def.super.color || '#ffffff'));
    }
    if (f.state === 'attack' && f.move && f.move.kind === 'special' && f.move.spec.type === 'teleport' && f.inMovePhase() === 'startup' && this.frame % 2) return;
    // sprint / super glow
    if (f.state === 'sprint' && this.frame % 2) drawFighterSprite(g, f.look, pose, x - f.facing * 4, y, f.facing, 'sil:#40e0ff');
    if (f.blockFlash > 0) drawFighterSprite(g, f.look, pose, x, y, f.facing, 'sil:#80c0ff');
    drawFighterSprite(g, f.look, pose, x, y, f.facing, variant, f.propFor(pose));
    // overlays
    const headY = y - 82 * f.s;
    if (f.state === 'dizzy') {
      for (let i = 0; i < 4; i++) {
        const a = this.frame * 0.12 + (i * Math.PI) / 2;
        const ox = Math.cos(a) * 12, oy = Math.sin(a) * 4;
        const kind = i % 4;
        const px = Math.round(x + ox), py = Math.round(headY + oy - 4);
        if (kind === 0) { rect(g, px - 1, py, 3, 1, '#ffe040'); rect(g, px, py - 1, 1, 3, '#ffe040'); }
        else if (kind === 1) { rect(g, px - 2, py - 2, 5, 6, '#140c1c'); rect(g, px - 1, py - 1, 3, 4, '#ffffff'); rect(g, px - 1, py, 3, 1, '#6080c0'); }
        else if (kind === 2) { rect(g, px - 2, py - 2, 5, 5, '#140c1c'); rect(g, px - 1, py - 1, 3, 3, '#3070e0'); rect(g, px, py - 1, 1, 3, '#ffffff'); rect(g, px - 1, py, 3, 1, '#ffffff'); }
        else drawText(g, '$', px - 2, py - 3, { font: 'small', color: '#60e060', outline: '#140c1c' });
      }
    }
    if (f.slowT > 0 && this.frame % 40 < 26) drawText(g, 'Z', Math.round(x + 8 + (this.frame % 40) / 5), Math.round(headY - 6 - (this.frame % 40) / 4), { font: 'small', color: '#c0f0ff', outline: '#203050' });
    if (f.loadingT > 0) {
      f.loadingT--;
      rect(g, x - 16, headY - 12, 32, 7, '#140c1c');
      rect(g, x - 15, headY - 11, Math.round(30 * (1 - f.loadingT / 30)), 5, '#40a0ff');
    }
    if (f.burnout && this.frame % 50 === f.side * 25) this.fx.burst(f.x, f.y + 70 * f.s, 'paper', 1);
  }

  drawSpeech(g, camX) {
    for (const s of this.speeches) {
      const f = s.f;
      const lines = wrapText(s.text, 130, { font: 'small' });
      const w = Math.max(...lines.map((l) => measureText(l, { font: 'small' }).w)) + 8;
      const h = lines.length * 7 + 5;
      let x = Math.round(f.x - camX - w / 2);
      x = Math.max(4, Math.min(this.viewW - w - 4, x));
      const y = Math.round(GROUND_Y - f.y - 96 * f.s - h);
      const pop = Math.min(1, s.t / 5);
      if (pop < 1 && s.t < 2) continue;
      rect(g, x - 1, y - 1, w + 2, h + 2, '#140c1c');
      rect(g, x, y, w, h, '#ffffff');
      const tx = Math.round(Math.max(x + 4, Math.min(x + w - 6, f.x - camX)));
      fillPoly(g, [[tx - 3, y + h], [tx + 3, y + h], [tx - 1 * f.facing, y + h + 5]], '#140c1c');
      fillPoly(g, [[tx - 2, y + h - 1], [tx + 2, y + h - 1], [tx - 1 * f.facing, y + h + 3]], '#ffffff');
      lines.forEach((l, i) => drawText(g, l, x + 4, y + 3 + i * 7, { font: 'small', color: '#140c1c' }));
    }
  }

  drawBeam(g, o, camX) {
    const b = beamBox(o);
    const x = Math.round(b.x - camX), y = Math.round(GROUND_Y - b.y - b.h);
    if (o.t < o.delay) {
      // pending telegraph
      const blink = Math.floor(o.t / 4) % 2;
      for (let i = 0; i < b.w; i += 6) rect(g, x + i, y + b.h / 2, 3, 1, blink ? o.color : '#806020');
      const lx = o.facing > 0 ? x + 4 : x + b.w - 50;
      drawText(g, (o.label || 'PENDING') + '.'.repeat(1 + Math.floor(o.t / 10) % 3), lx, y - 4, { font: 'small', color: o.color, outline: '#140c1c' });
      return;
    }
    const k = (o.t - o.delay) / o.dur;
    const flick = this.frame % 2;
    const hh = Math.round(b.h * (k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1));
    const cy = y + b.h / 2;
    rect(g, x, cy - hh / 2 - 1, b.w, hh + 2, '#140c1c');
    rect(g, x, cy - hh / 2, b.w, hh, o.color);
    rect(g, x, cy - hh / 4, b.w, Math.max(1, hh / 2), '#ffffff');
    if (o.effect === 'xray' || o.effect === 'zap' || o.superLevel) {
      for (let i = 0; i < b.w; i += 8) {
        const yy = cy + Math.sin((i + this.frame * 6) * 0.2) * (hh / 2 + 2);
        rect(g, x + i, yy, 3, 1, flick ? '#ffffff' : o.color);
      }
    }
    if (o.superLevel) {
      const ex = o.facing > 0 ? x : x + b.w;
      circle(g, ex, cy, hh * 0.8 + 3 + flick, o.color);
      circle(g, ex, cy, hh * 0.5 + flick, '#ffffff');
    }
    if (o.label && o.t === o.delay + 1) this.fx.text(o.x + o.facing * 40, o.y + 20, 'APPROVED!', '#80ff80', 40);
  }

  drawDrop(g, o, camX) {
    const x = Math.round(o.x - camX);
    if (o.t < o.delay) {
      const k = Math.floor(o.t / 5) % 2;
      rect(g, x - 12, GROUND_Y - 1, 24, 2, k ? 'rgba(0,0,0,0.5)' : 'rgba(80,0,120,0.5)');
      if (k) drawText(g, 'MTG', x, GROUND_Y - 80, { font: 'small', color: '#e080ff', outline: '#140c1c', align: 'center' });
      return;
    }
    const y = Math.round(GROUND_Y - o.hy);
    rect(g, x - 13, y - 14, 26, 26, '#140c1c');
    rect(g, x - 12, y - 13, 24, 24, '#ffffff');
    rect(g, x - 12, y - 13, 24, 7, '#d03030');
    drawText(g, 'MTG', x, y - 3, { font: 'small', color: '#140c1c', align: 'center' });
    drawText(g, '9AM', x, y + 4, { font: 'small', color: '#806090', align: 'center' });
    rect(g, x - 8, y - 15, 2, 4, '#606060');
    rect(g, x + 6, y - 15, 2, 4, '#606060');
  }

  drawZone(g, o, camX) {
    const x = Math.round(o.x - camX);
    const r = Math.round(o.r || 0);
    const cy = GROUND_Y - 40;
    if (o.fx === 'bsod') {
      g.globalAlpha = 0.35;
      rect(g, x - r, 40, r * 2, GROUND_Y - 40, '#1040d0');
      g.globalAlpha = 1;
      if (o.t > 8 && o.t < 50) {
        drawText(g, ':(', x - 20, 70, { font: 'big', scale: 2, color: '#ffffff' });
        drawText(g, 'YOUR PC RAN INTO A PROBLEM', x, 96, { font: 'small', color: '#ffffff', align: 'center' });
        drawText(g, Math.min(100, Math.round((o.t / 50) * 100)) + '% COMPLETE', x, 104, { font: 'small', color: '#ffffff', align: 'center' });
      }
      return;
    }
    const col = o.fx === 'germ' ? 'rgba(140,230,60,0.25)' : 'rgba(180,240,255,0.25)';
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.25 + i * 0.1;
      circle(g, x, cy, Math.max(1, r - i * 12), o.fx === 'germ' ? '#80d040' : '#c0f0ff');
    }
    g.globalAlpha = 1;
    ring(g, x, cy, r, o.color, 2);
  }

  drawHazardObj(g, h, camX) {
    if (h.type === 'gurney' || h.type === 'car') {
      if (h.t < 50) {
        const side = h.vx > 0 ? 6 : this.viewW - 18;
        if (Math.floor(h.t / 6) % 2) {
          rect(g, side - 1, 120, 14, 14, '#140c1c');
          rect(g, side, 121, 12, 12, '#ffd020');
          drawText(g, '!', side + 4, 124, { font: 'big', color: '#140c1c' });
        }
        return;
      }
      drawHazard(g, h, Math.round(h.x - camX), GROUND_Y, this.frame);
    } else if (h.type === 'chart' || h.type === 'fish') drawHazard(g, h, Math.round(h.x - camX), GROUND_Y, this.frame);
    else if (h.type === 'magnet') {
      const x = Math.round(400 - camX);
      for (let i = 0; i < 3; i++) {
        const r = ((h.t * 2 + i * 30) % 90) + 10;
        g.globalAlpha = 0.6 - r / 160;
        ring(g, x, 120, 100 - r, '#ff8040');
      }
      g.globalAlpha = 1;
    } else if (h.type === 'jcaho') {
      const x = Math.round(h.x - camX);
      const y = GROUND_Y;
      rect(g, x - 5, y - 40, 10, 26, '#140c1c');
      rect(g, x - 4, y - 39, 8, 24, '#404858');
      rect(g, x - 4, y - 50, 8, 10, '#140c1c');
      rect(g, x - 3, y - 49, 6, 8, '#e8c0a0');
      rect(g, x - 4, y - 14, 3, 14, '#202028');
      rect(g, x + 1, y - 14, 3, 14, '#202028');
      rect(g, x + (h.vx > 0 ? 4 : -9), y - 34, 5, 7, '#a86a30');
      drawText(g, 'JCAHO', x, y - 60, { font: 'small', color: '#ff8080', outline: '#140c1c', align: 'center' });
      if (Math.floor(this.frame / 20) % 2) drawText(g, 'O_O', x, y - 68, { font: 'small', color: '#ffffff', outline: '#140c1c', align: 'center' });
    }
  }

  drawSuperBG(g, W, H, s) {
    const k = Math.min(1, s.t / 8);
    g.globalAlpha = 0.85 * k;
    rect(g, 0, 0, W, H, s.critical ? '#200008' : '#06020e');
    g.globalAlpha = 1;
    const cx = Math.round(s.f.x - this.camX), cy = 120;
    const col = s.critical ? '#ff2040' : s.color || '#ffffff';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (s.t * 0.01);
      const r0 = 30 + ((s.t * 6 + i * 37) % 200);
      g.globalAlpha = 0.5;
      line(g, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * (r0 + 30), cy + Math.sin(a) * (r0 + 30), col, 1);
    }
    g.globalAlpha = 1;
    if (s.critical) {
      // EKG line across
      let px = 0, py = 150;
      for (let x = 0; x < W; x += 3) {
        const ph = (x + s.t * 4) % 120;
        const ny = ph > 50 && ph < 56 ? 120 : ph >= 56 && ph < 62 ? 170 : 150;
        line(g, px, py, x, ny, '#ff4060');
        px = x;
        py = ny;
      }
    }
  }

  drawCutIn(g, W, H, fr) {
    const f = fr.f;
    const t = fr.t;
    const crit = fr.critical;
    const slide = Math.min(1, t / 8);
    const out = t > fr.dur - 8 ? (t - (fr.dur - 8)) / 8 : 0;
    const bandY = 74, bandH = 52;
    const off = Math.round((1 - slide) * W * (f.side === 0 ? -1 : 1) + out * W * (f.side === 0 ? 1 : -1));
    g.save();
    g.translate(off, 0);
    const col = crit ? '#b00020' : f.def.color;
    rect(g, 0, bandY - 3, W, bandH + 6, '#140c1c');
    rect(g, 0, bandY, W, bandH, col);
    for (let i = 0; i < W; i += 16) {
      const xx = (i + t * 9) % (W + 32) - 16;
      g.globalAlpha = 0.25;
      fillPoly(g, [[xx, bandY], [xx + 8, bandY], [xx - 4, bandY + bandH], [xx - 12, bandY + bandH]], '#ffffff');
    }
    g.globalAlpha = 1;
    rect(g, 0, bandY + 2, W, 1, '#ffffff');
    rect(g, 0, bandY + bandH - 3, W, 1, '#ffffff');
    // portrait (big bust)
    const por = getPortrait(f.look, 'superFlash', 46, 46);
    const px = f.side === 0 ? 14 : W - 14 - 92;
    g.save();
    g.translate(px + (f.side === 0 ? 0 : 92), bandY - 18);
    g.scale(f.side === 0 ? 2 : -2, 2);
    g.drawImage(por, 0, 0);
    g.restore();
    const tx = f.side === 0 ? 116 : W - 116;
    const align = f.side === 0 ? 'left' : 'right';
    const lvl = crit ? 'CRITICAL CARE' : 'LEVEL ' + fr.level;
    drawText(g, lvl, tx, bandY + 8, { font: 'small', color: crit ? '#ffe0e0' : '#ffffff', outline: '#140c1c', align });
    const name = f.def.super.name;
    const sc = measureText(name, { scale: 2 }).w > W - 140 ? 1 : 2;
    drawText(g, name, tx, bandY + 18, { scale: sc, color: '#ffffff', outline: '#140c1c', align, gradient: crit ? ['#ffffff', '#ffd0d0', '#ff8080', '#ff4060'] : ['#ffffff', '#fff8d0', '#ffe080', '#ffc040'] });
    g.restore();
  }

  drawAnnouncements(g, W, H) {
    const a = this.ann;
    if (a) {
      const t = a.t;
      if (a.style === 'codeblue') {
        // EKG flatline across screen + big CODE BLUE
        const k = Math.min(1, t / 30);
        g.globalAlpha = 0.5;
        rect(g, 0, 96, W, 34, '#001040');
        g.globalAlpha = 1;
        let px = 0, py = 113;
        const end = Math.round(W * k);
        for (let x = 0; x <= end; x += 2) {
          const beat = x < W * 0.55 ? (x % 60) : 99;
          const ny = beat > 30 && beat < 34 ? 100 : beat >= 34 && beat < 38 ? 126 : 113;
          line(g, px, py, x, ny, '#60ff90');
          px = x;
          py = ny;
        }
        if (t > 8) {
          const sc = 3;
          const bounce = t < 16 ? Math.round((16 - t) * 2) : 0;
          drawText(g, a.text, W / 2, 60 - bounce, { scale: sc, color: '#ffffff', outline: '#000820', align: 'center', gradient: ['#ffffff', '#c0e8ff', '#80c0ff', '#4080ff', '#2050e0', '#1838c0', '#102890'] });
        }
        return this.drawCenterPop(g, W);
      }
      if (a.style === 'stamp') {
        const sc = t < 6 ? 3 - t * 0.15 : 2;
        const w = measureText(a.text, { scale: 2 }).w + 16;
        const x = Math.round(W / 2 - w / 2), y = 128;
        g.globalAlpha = Math.min(1, t / 4);
        rect(g, x - 2, y - 2, w + 4, 22, '#140c1c');
        rect(g, x, y, w, 18, '#ff4050');
        rect(g, x + 2, y + 2, w - 4, 14, '#fff4f0');
        drawText(g, a.text, W / 2, y + 2, { scale: sc > 2.4 ? 2 : 2, color: '#e02030', align: 'center' });
        g.globalAlpha = 1;
        return this.drawCenterPop(g, W);
      }
      const scale = a.small ? 1 : a.big ? 3 : 2;
      const enter = Math.min(1, t / 6);
      const leave = t > a.dur - 6 ? (a.dur - t) / 6 : 1;
      const y = a.small ? 62 : 84;
      const grad = a.color === '#ffffff' ? ['#ffffff', '#f0f0ff', '#d0d8ff', '#b0b8f0', '#9098e0', '#8088d0', '#7078c0'] : [a.color, a.color, '#ffffff', a.color, a.color, shadeHex(a.color), shadeHex(a.color)];
      g.globalAlpha = Math.max(0, Math.min(enter, leave));
      const xo = Math.round((1 - enter) * 40);
      drawText(g, a.text, W / 2 + xo, y, { scale, color: a.color, outline: '#140c1c', align: 'center', gradient: a.small ? null : grad });
      g.globalAlpha = 1;
    }
    this.drawCenterPop(g, W);
  }

  drawCenterPop(g, W) {
    if (this.centerPop) drawText(g, this.centerPop.text, W / 2, 112, { font: 'small', color: '#c0ffc0', outline: '#140c1c', align: 'center' });
  }

  drawBoxes(g, camX) {
    for (const f of this.fighters) {
      for (const b of f.getHurtboxes()) {
        g.globalAlpha = 0.35;
        rect(g, b.x - camX, GROUND_Y - b.y - b.h, b.w, b.h, '#2080ff');
      }
      const hb = f.getHitbox();
      if (hb && hb.box) {
        g.globalAlpha = 0.5;
        rect(g, hb.box.x - camX, GROUND_Y - hb.box.y - hb.box.h, hb.box.w, hb.box.h, '#ff2020');
      }
      g.globalAlpha = 1;
    }
    for (const p of this.projectiles) {
      const b = projBox(p);
      g.globalAlpha = 0.5;
      rect(g, b.x - camX, GROUND_Y - b.y - b.h, b.w, b.h, '#ff8020');
      g.globalAlpha = 1;
    }
  }
}

// ---------------- sequences (throws, grabs, cinematic supers) ----------------
class Seq {
  constructor(m, att, def) {
    this.m = m;
    this.att = att;
    this.def = def;
    this.t = 0;
  }
  begin() {
    const { att, def } = this;
    att.setState('cinema');
    def.setState('cinema');
    att.vx = def.vx = 0;
    def.move = null;
    this.ax = att.x;
  }
  place(dx, dy) {
    const { att, def } = this;
    def.x = att.x + att.facing * dx;
    def.y = dy;
  }
  hit(dmg, str = 2, kind = 'special', sparkKind = 'hit') {
    const { m, att, def } = this;
    let d = Math.round(dmg);
    def.hp = Math.max(0, def.hp - d);
    def.redDelay = 60;
    def.comboHits++;
    def.flashT = 4;
    m.fx.spark(def.x, def.y + 46 * def.s, str, sparkKind, att.facing);
    Sound.sfx(kind === 'super' ? 'superHit' : STR_SFX[str]);
    m.shake(str * 2 + 1, 5);
    m.excite = Math.min(1, m.excite + 0.08);
    if (kind !== 'super') att.addMeter(d * 0.4);
    def.addMeter(d * 0.15);
    att.stats.hits++;
  }
  finish(launchVx = 2.4, launchVy = 5, kind = 'throw') {
    const { m, att, def } = this;
    m.seq = null;
    att.recover();
    att.move = null;
    att.setState('idle');
    att.throwPose = null;
    att.cinePose = null;
    def.cinePose = null;
    def.thrownPose = null;
    def.setState('airhit');
    def.juggle = 3;
    def.vx = launchVx * att.facing;
    def.vy = launchVy;
    def.y = Math.max(def.y, 0.5);
    def.x = Math.max(WALL_L, Math.min(WALL_R, def.x));
    att.x = Math.max(WALL_L, Math.min(WALL_R, att.x));
    if (def.hp <= 0) {
      m.onKO(att, def, kind);
    }
  }
}

class ThrowSeq extends Seq {
  constructor(m, att, def, back, punish) {
    super(m, att, def);
    this.back = back;
    this.punish = punish;
  }
  begin() {
    super.begin();
    this.att.cinePose = 'throwGrab';
    this.def.cinePose = 'hitHigh';
    this.place(22, 0);
    Sound.sfx('throw');
  }
  update() {
    const { m, att, def } = this;
    this.t++;
    const t = this.t;
    if (t <= 10) {
      // tech window
      const techP = def.isHuman ? def.hasPress('throw', 10) || (def.scheme === 'modern' ? def.pressedTwo(['l', 'm'], 10) : def.pressedTwo(['lp', 'lk'], 10)) : def.ai && def.ai.wantTech(t);
      if (techP && !this.punish) {
        m.seq = null;
        att.cinePose = def.cinePose = null;
        att.setState('idle');
        def.setState('idle');
        return m.throwTech(att, def);
      }
      def.recordInput();
      return;
    }
    if (t === 11 && this.back) {
      att.facing = -att.facing;
      this.place(-10, 18);
      att.cinePose = 'liftA';
      def.cinePose = 'thrown';
      m.popup(att, 'WHEELCHAIR SPIN!', '#ffffff');
    } else if (t === 11) {
      att.cinePose = 'liftA';
      def.cinePose = 'thrown';
      this.place(4, 40);
      m.popup(att, 'GURNEY TOSS!', '#ffffff');
    }
    if (t === 18) {
      att.cinePose = 'throwToss';
      this.place(26, 24);
      this.hit((this.punish ? 150 : 120) * att.dmgMul, 2, 'throw');
      if (this.punish) m.popup(att, 'MALPRACTICE COUNTER!', '#ff4060');
    }
    if (t >= 22) this.finish(2.8, 3.6, 'throw');
  }
}

class GrabSeq extends Seq {
  constructor(m, att, def, dmg, spec) {
    super(m, att, def);
    this.dmg = dmg;
    this.spec = spec;
  }
  begin() {
    super.begin();
    this.att.cinePose = 'grab';
    this.def.cinePose = 'hitHigh';
    this.place(20, 0);
    Sound.sfx('throw');
  }
  update() {
    const { m, att, def } = this;
    const t = ++this.t;
    if (t === 8) {
      att.cinePose = 'liftA';
      def.cinePose = 'thrown';
      this.place(2, 52);
    }
    if (t === 20) {
      att.cinePose = 'slamA';
      def.cinePose = 'down';
      this.place(26, 0);
      this.hit(this.dmg, 2, 'special');
      m.shake(8, 10);
      m.fx.burst(def.x, 4, 'debris', 10);
      if (this.spec.effect === 'drainMeter') {
        def.meter = Math.max(0, def.meter - 70);
        m.popup(att, 'PORTION CONTROLLED', '#ffd060');
      }
    }
    if (t >= 34) this.finish(1.2, 2.5, 'throw');
  }
}

class FlurrySeq extends Seq {
  constructor(m, att, def, mv) {
    super(m, att, def);
    this.mv = mv;
    this.lv = mv.level;
    this.n = [0, 6, 8, 12][mv.level];
    this.per = Math.round(superDamage(att, mv) * 0.85 / this.n);
    this.fin = Math.round(superDamage(att, mv) * 0.15);
    this.words = SUPER_WORDS[att.def.id] || null;
  }
  begin() {
    super.begin();
    this.att.cinePose = 'rush';
    this.def.cinePose = 'hitHigh';
    this.place(26, this.def.y);
  }
  update() {
    const { m, att, def } = this;
    const t = ++this.t;
    const POSES = ['lpA', 'mkA', 'mpA', 'hkA', 'clpA', 'hpA', 'lkA', 'cmpA'];
    if (def.y > 0) def.y = Math.max(0, def.y - 3);
    const step = 6;
    const k = Math.floor((t - 1) / step);
    if ((t - 1) % step === 0 && k < this.n) {
      att.cinePose = POSES[k % POSES.length];
      def.cinePose = k % 2 ? 'hitHigh2' : 'hitLow';
      this.hit(this.per, 1, 'super', att.def.super.fx === 'zap' ? 'zap' : 'hit');
      att.x += att.facing * 1.5;
      this.place(24, def.y);
      if (att.def.super.fx === 'money') m.fx.burst(def.x, def.y + 40, 'money', 4);
      if (this.words && k % 2 === 0) m.fx.text(def.x, def.y + 90, this.words[(k / 2) % this.words.length], '#ffffff', 24);
    }
    const endT = this.n * step + 6;
    if (t === endT) {
      att.cinePose = 'upA';
      def.cinePose = 'airHit';
      this.hit(this.fin, 2, 'super', 'counter');
      m.slowmo = 24;
      m.shake(10, 14);
    }
    if (t >= endT + 4) this.finish(2.6, 7, 'super');
  }
}

class SuperGrabSeq extends Seq {
  constructor(m, att, def, mv) {
    super(m, att, def);
    this.mv = mv;
    this.n = [0, 2, 3, 4][mv.level];
    this.per = Math.round(superDamage(att, mv) / (this.n + 1));
    this.words = SUPER_WORDS[att.def.id] || ['!'];
  }
  begin() {
    super.begin();
    this.att.cinePose = 'grab';
    this.def.cinePose = 'hitHigh';
    this.place(20, 0);
    Sound.sfx('throw');
  }
  update() {
    const { m, att, def } = this;
    const t = ++this.t;
    const cyc = 22;
    const k = Math.floor((t - 1) / cyc);
    const ph = (t - 1) % cyc;
    if (k < this.n) {
      if (ph === 0) {
        att.cinePose = 'liftA';
        def.cinePose = 'thrown';
        this.place(2, 54);
        Sound.sfx('whiffH');
      }
      if (ph === 10) {
        att.cinePose = 'slamA';
        def.cinePose = 'down';
        att.facing = k % 2 ? -att.facing : att.facing;
        this.place(24, 0);
        this.hit(this.per, 2, 'super');
        m.fx.burst(def.x, 4, 'debris', 12);
        m.fx.text(def.x, def.y + 70, this.words[k % this.words.length], '#ffffff', 30);
        m.shake(9, 10);
      }
    } else if (ph === 4 && k === this.n) {
      att.cinePose = 'win1';
      this.hit(this.per, 2, 'super', 'counter');
      m.slowmo = 20;
    } else if (k === this.n && ph > 12) this.finish(1, 3, 'super');
  }
}

class DemonSeq extends Seq {
  constructor(m, att, def, mv) {
    super(m, att, def);
    this.mv = mv;
    this.total = superDamage(att, mv);
  }
  begin() {
    super.begin();
    this.att.cinePose = 'grab';
    this.def.cinePose = 'hitHigh';
    this.m.blackout = 1;
    this.m.superBG = null;
    Sound.sfx('superHit');
  }
  update() {
    const { m, att, def } = this;
    const t = ++this.t;
    if (t < 76) {
      m.blackout = 1;
      if (t % 7 === 0) {
        def.hp = Math.max(0, def.hp - Math.round(this.total / 10));
        def.redDelay = 80;
        this.flash = 3;
        Sound.sfx(t % 14 ? 'hitH' : 'superHit');
        m.shake(5, 4);
      }
      if (this.flash > 0) this.flash--;
    }
    if (t === 76) {
      m.blackout = 0;
      att.cinePose = 'tauntB';
      att.facing = -att.facing;
      def.cinePose = 'down';
      def.y = 0;
      m.shake(8, 12);
      m.excite = 1;
    }
    if (t >= 140) {
      m.seq = null;
      att.recover();
      att.cinePose = null;
      def.cinePose = null;
      def.setState(def.hp <= 0 ? 'ko' : 'knockdown');
      def.knockdownT = 40;
      if (def.hp <= 0) {
        def.knockdownT = 9999;
        m.onKO(att, def, 'super');
      }
    }
  }
  draw(g, W, H) {
    const t = this.t;
    if (t < 76) {
      if (this.flash > 0) {
        g.globalAlpha = 0.9;
        rect(g, 0, 0, W, H, '#ffffff');
        g.globalAlpha = 1;
        // slash marks
        for (let i = 0; i < 3; i++) line(g, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, '#c040ff', 2);
      }
      drawText(g, 'MANDATORY', W / 2, 88, { scale: 2, color: '#c040ff', outline: '#000000', align: 'center' });
      drawText(g, 'TRAINING', W / 2, 106, { scale: 2, color: '#c040ff', outline: '#000000', align: 'center' });
      const pct = Math.min(100, Math.round((t / 70) * 100));
      rect(g, W / 2 - 50, 130, 100, 6, '#404040');
      rect(g, W / 2 - 50, 130, pct, 6, '#c040ff');
      drawText(g, 'SLIDE ' + Math.min(47, Math.floor(t / 1.6)) + ' OF 47', W / 2, 140, { font: 'small', color: '#a080c0', align: 'center' });
    } else if (t < 140) {
      // big glyph on back
      drawText(g, 'MODULE 1 OF 47 COMPLETE', W / 2, 60, { color: '#ffd040', outline: '#140c1c', align: 'center' });
      drawText(g, '(46 REMAINING. DUE FRIDAY.)', W / 2, 72, { font: 'small', color: '#ffffff', outline: '#140c1c', align: 'center' });
    }
  }
}

// ---------------- geometry ----------------
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function center(a, b) {
  const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
  const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
function projBox(p) {
  const s = p.big ? 1.4 : 1;
  const w = p.w * s, h = p.h * s;
  if (p.sprite === 'wave') return { x: p.vx > 0 ? p.x - p.w : p.x, y: 0, w: p.w, h: p.h };
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}
function beamBox(o) {
  const x = o.facing > 0 ? o.x : o.x - o.range;
  return { x, y: o.y - o.h / 2, w: o.range, h: o.h };
}
function shadeHex(c) {
  const n = parseInt(c.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.6, g = ((n >> 8) & 255) * 0.6, b = (n & 255) * 0.7;
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

const INTROS = {
  default: ['LET\'S MAKE THIS QUICK. I HAVE ROUNDS.', 'I\'VE SEEN WORSE. ON MY BREAK.', 'YOU\'RE ON MY LIST. MY TO-DO LIST.', 'SCRUB IN. THIS WILL HURT.', 'I HAVEN\'T SLEPT IN 30 HOURS. LET\'S GO.'],
};
function pickIntro(me, them) {
  if (me.rival === them.id) return 'YOU! WE HAVE UNFINISHED CHARTING.';
  if (me.taunt && Math.random() < 0.4) return me.taunt;
  const l = INTROS.default;
  return l[Math.floor(Math.random() * l.length)];
}
