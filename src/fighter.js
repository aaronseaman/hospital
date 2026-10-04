// Fighter: state machine, input decoding, moves, hit/hurt boxes.
import { solvePose } from './poses.js';
import { NORMALS, MODERN_MAP, AUTO_ROUTES } from './moves.js';
import { Sound } from './audio.js';

export const GRAV = 0.36;
export const WALL_L = 18;
export const WALL_R = 782;
const BUF = 6; // input buffer frames
const CHARGE = 36;

const lerp = (a, b, t) => a + (b - a) * t;
const pick = (v, i) => (Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v);

export class Fighter {
  constructor(match, side, def, look, opts = {}) {
    this.m = match;
    this.side = side;
    this.def = def;
    this.look = look;
    this.ctrl = opts.ctrl || 'human';
    this.scheme = opts.scheme || 'classic';
    this.cpuLevel = opts.cpuLevel || 2;
    this.maxHp = def.hp;
    this.dmgMul = (def.dmgMul || 1) * (opts.dmgMul || 1);
    this.roundsWon = 0;
    this.meter = 0;
    this.stats = { hits: 0, supers: 0, parries: 0, perfects: 0, counters: 0, punishes: 0, throws: 0, impacts: 0, maxCombo: 0, specials: 0 };
    this.autoOn = false;
    this.resetRound(400, 1);
  }

  resetRound(x, facing) {
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = this.maxHp;
    this.redHp = this.maxHp;
    this.redDelay = 0;
    this.gauge = 600;
    this.burnout = false;
    this.stun = 0;
    this.stunDelay = 0;
    this.state = 'idle';
    this.t = 0;
    this.move = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.hitstop = 0;
    this.invuln = 0;
    this.throwInvuln = 0;
    this.armor = 0;
    this.juggle = 0;
    this.comboHits = 0;
    this.comboDmg = 0;
    this.poisonT = 0;
    this.slowT = 0;
    this.xrayT = 0;
    this.flashT = 0;
    this.freezeT = 0;
    this.shake = 0;
    this.parryT = 0;
    this.dirHist = [{ d: 5, t: 0 }];
    this.clock = 0;
    this.buf = [];
    this.chargeB = 0;
    this.chargeD = 0;
    this.chargeBRel = 99;
    this.chargeDRel = 99;
    this.tapF = -99;
    this.tapB = -99;
    this.lastDir = 5;
    this.autoStep = 0;
    this.autoT = 0;
    this.inp = blankInput();
    this.prevHold = {};
    this.knockdownT = 0;
    this.dizzyT = 0;
    this.mash = 0;
    this.lastHitT = 0;
    this.walkPhase = 0;
    this.blockFlash = 0;
    this.layer = 0;
    this.sprintT = 0;
    this.sprintBonus = 0;
    this.proj = 0;
    this.koType = null;
    this.trailT = 0;
  }

  get opp() {
    return this.m.fighters[1 - this.side];
  }
  get s() {
    return this.look.scale || 1;
  }
  get halfW() {
    return 10 * this.s * (this.look.width || 1);
  }
  get airborne() {
    return this.y > 0.01;
  }
  get isHuman() {
    return this.ctrl === 'human';
  }

  // ---------------- input ----------------
  setInput(inp) {
    this.inp = inp;
  }

  relDir(inp) {
    const f = this.facing > 0 ? inp.right : inp.left;
    const b = this.facing > 0 ? inp.left : inp.right;
    const u = inp.up, d = inp.down;
    const h = f && !b ? 1 : b && !f ? -1 : 0;
    const v = u && !d ? 1 : d && !u ? -1 : 0;
    return 5 + h + v * 3;
  }

  recordInput() {
    this.clock++;
    const d = this.relDir(this.inp);
    const last = this.dirHist[this.dirHist.length - 1];
    if (d !== last.d) {
      this.dirHist.push({ d, t: this.clock });
      if (this.dirHist.length > 32) this.dirHist.shift();
      // double taps
      if (d === 6 && this.lastDir !== 6) {
        if (this.clock - this.tapF < 14 && this.tapFrel) this.wantDash = 1;
        this.tapF = this.clock;
        this.tapFrel = false;
      }
      if (d === 4 && this.lastDir !== 4) {
        if (this.clock - this.tapB < 14 && this.tapBrel) this.wantDash = -1;
        this.tapB = this.clock;
        this.tapBrel = false;
      }
      if (d !== 6) this.tapFrel = true;
      if (d !== 4) this.tapBrel = true;
    }
    this.lastDir = d;
    // charge
    if (d === 1 || d === 4 || d === 7) {
      this.chargeB++;
    } else {
      if (this.chargeB >= CHARGE) this.chargeBRel = 0;
      this.chargeB = 0;
    }
    if (d === 1 || d === 2 || d === 3) this.chargeD++;
    else {
      if (this.chargeD >= CHARGE) this.chargeDRel = 0;
      this.chargeD = 0;
    }
    this.chargeBRel++;
    this.chargeDRel++;
    // presses
    for (const b in this.inp.press) if (this.inp.press[b]) this.buf.push({ b, t: this.clock });
    while (this.buf.length && this.clock - this.buf[0].t > BUF) this.buf.shift();
    if (this.state === 'dizzy' && (Object.values(this.inp.press).some(Boolean) || d !== last.d)) this.mash++;
    return d;
  }

  hasPress(b, within = BUF) {
    return this.buf.some((p) => p.b === b && this.clock - p.t <= within);
  }
  consume(...bs) {
    this.buf = this.buf.filter((p) => !bs.includes(p.b));
  }
  pressedAny(list, within = BUF) {
    for (const b of list) if (this.hasPress(b, within)) return b;
    return null;
  }
  pressedTwo(list, within = 3) {
    const got = list.filter((b) => this.hasPress(b, within));
    return got.length >= 2 ? got : null;
  }

  // sequence matcher on direction changes; steps = arrays of acceptable dirs
  motion(steps, window) {
    let si = steps.length - 1;
    for (let i = this.dirHist.length - 1; i >= 0; i--) {
      const e = this.dirHist[i];
      if (this.clock - e.t > window && i < this.dirHist.length - 1) break;
      if (steps[si].includes(e.d)) {
        si--;
        if (si < 0) return true;
      }
    }
    return false;
  }
  isMotion(name) {
    const F = [6, 9, 3], DN = [1, 2, 3];
    switch (name) {
      case 'qcf': return this.motion([[2, 1], [3], [6, 9]], 18) || this.motion([[2], [6, 9]], 14);
      case 'qcb': return this.motion([[2, 3], [1], [4, 7]], 18) || this.motion([[2], [4, 7]], 14);
      case 'dp': return this.motion([[6], [2, 1], [3]], 22) || this.motion([[6], [3], [2], [3, 6]], 22) || this.motion([[3], [2], [3]], 16);
      case 'hcf': return this.motion([[4, 7], [1, 2], [6, 9]], 28);
      case 'qcf2': return this.motion([[2], [6, 3], [2], [6, 9]], 40);
      case 'qcb2': return this.motion([[2], [4, 1], [2], [4, 7]], 40);
      case 'chargeBF': return this.chargeBRel <= 10 && F.includes(this.lastDir);
      case 'chargeDU': return this.chargeDRel <= 10 && [7, 8, 9].includes(this.lastDir);
    }
    return false;
  }

  // ---------------- state helpers ----------------
  setState(s) {
    this.state = s;
    this.t = 0;
  }
  canAct() {
    return ['idle', 'walk', 'crouch', 'land'].includes(this.state) || (this.state === 'dash' && this.t > 10);
  }
  canBlock() {
    return ['idle', 'walk', 'crouch', 'blockstun', 'land'].includes(this.state) && !this.airborne;
  }
  inMovePhase() {
    const mv = this.move;
    if (!mv) return null;
    if (mv.t < mv.startup) return 'startup';
    if (mv.t < mv.startup + mv.active) return 'active';
    return 'recovery';
  }
  isCrouching() {
    return this.state === 'crouch' || (this.state === 'blockstun' && this.crouchBlock) || (this.state === 'hitstun' && this.crouchHit) || (this.move && this.move.def && this.move.def.crouch);
  }
  faceOpp() {
    const o = this.opp;
    if (Math.abs(o.x - this.x) > 1) this.facing = o.x > this.x ? 1 : -1;
  }

  spendGauge(n) {
    if (this.burnout) return false;
    if (this.gauge < n && n > 0) return false;
    this.gauge -= n;
    if (this.gauge <= 0) this.enterBurnout();
    return true;
  }
  drainGauge(n) {
    if (this.burnout || this.m.training?.infGauge) return;
    this.gauge -= n;
    if (this.gauge <= 0) this.enterBurnout();
  }
  enterBurnout() {
    this.gauge = 0;
    this.burnout = true;
    this.m.popup(this, 'BURNOUT!', '#c0c0c0');
    this.m.announce('CHARTING BURNOUT', 50, '#a0a0b0', true);
    Sound.sfx('burnout');
    this.m.fx.burst(this.x, this.y + 60, 'paper', 14);
  }
  addMeter(n) {
    this.meter = Math.max(0, Math.min(300, this.meter + n));
  }

  // ---------------- main update ----------------
  update() {
    if (this.hitstop > 0) {
      this.hitstop--;
      this.recordInput();
      return;
    }
    if (this.freezeT > 0) {
      this.freezeT--;
      return;
    }
    const d = this.recordInput();
    this.t++;
    if (this.invuln > 0) this.invuln--;
    if (this.throwInvuln > 0) this.throwInvuln--;
    if (this.flashT > 0) this.flashT--;
    if (this.xrayT > 0) this.xrayT--;
    if (this.slowT > 0) this.slowT--;
    if (this.blockFlash > 0) this.blockFlash--;
    if (this.sprintBonus > 0) this.sprintBonus--;
    if (this.poisonT > 0) {
      this.poisonT--;
      if (this.poisonT % 20 === 0 && this.hp > 30) {
        this.hp -= 6;
        this.m.fx.burst(this.x, this.y + 40, 'germ', 2);
      }
    }
    // red health trail
    if (this.redDelay > 0) this.redDelay--;
    else if (this.redHp > this.hp) this.redHp = Math.max(this.hp, this.redHp - 4);
    if (this.redHp < this.hp) this.redHp = this.hp;
    // stun decay
    if (this.stunDelay > 0) this.stunDelay--;
    else if (this.stun > 0 && this.state !== 'dizzy') this.stun = Math.max(0, this.stun - 2.5);
    // gauge regen
    this.updateGauge(d);

    const st = this.state;
    switch (st) {
      case 'intro':
      case 'win':
      case 'lose':
      case 'cinema':
      case 'thrown':
      case 'throwing':
        break;
      case 'idle':
      case 'walk':
      case 'crouch':
      case 'land':
        this.neutral(d);
        break;
      case 'jumpsquat':
        if (this.t >= 4) {
          this.vy = 6.7 * (this.def.jump || 1);
          this.y = 0.1;
          this.vx = this.jumpDir * 2.5 * (this.def.jump || 1);
          this.setState('air');
          Sound.sfx('jump', { vol: 0.5 });
        }
        break;
      case 'air':
        this.airControl(d);
        break;
      case 'attack':
        this.attackUpdate(d);
        break;
      case 'hitstun':
        if (--this.hitstun <= 0) this.recover();
        break;
      case 'blockstun':
        this.crouchBlock = [1, 2, 3].includes(d) ? true : this.crouchBlock;
        if (this.tryPageSecurity(d)) break;
        if (--this.blockstun <= 0) this.recover();
        break;
      case 'airhit':
      case 'fall':
        break; // physics handles landing
      case 'knockdown':
        if (this.t >= this.knockdownT) {
          if (this.hp <= 0) break;
          this.setState('getup');
          this.invuln = 20;
        }
        break;
      case 'getup':
        if (this.t >= 18) {
          this.throwInvuln = 6;
          this.recover();
        }
        break;
      case 'crumple':
        if (this.t >= 60) {
          this.setState('knockdown');
          this.knockdownT = 30;
        }
        break;
      case 'dizzy':
        this.dizzyT -= 1 + Math.min(4, this.mash * 0.5);
        this.mash = 0;
        if (this.dizzyT <= 0) {
          this.stun = 0;
          this.recover();
        }
        break;
      case 'parry':
        this.parryUpdate(d);
        break;
      case 'dash':
      case 'backdash':
        this.dashUpdate();
        break;
      case 'sprint':
        this.sprintUpdate(d);
        break;
      case 'taunt':
        if (this.t >= 70) {
          this.addMeter(8);
          this.recover();
        }
        break;
      case 'ko':
        break;
    }
  }

  updateGauge(d) {
    if (this.m.training?.infGauge) {
      this.gauge = 600;
      this.burnout = false;
    }
    if (this.burnout) {
      this.gauge += 0.9;
      if (this.gauge >= 600) {
        this.gauge = 600;
        this.burnout = false;
        this.m.popup(this, 'CAUGHT UP ON CHARTING!', '#80ff80');
      }
      return;
    }
    if (this.state === 'parry') return;
    if (this.state === 'sprint') return;
    let r = 0.22;
    if (this.state === 'walk' && d === 6) r += 0.12;
    if (this.state === 'attack' || this.state === 'hitstun' || this.state === 'blockstun') r = 0.05;
    this.gauge = Math.min(600, this.gauge + r);
  }

  recover() {
    this.move = null;
    this.armor = 0;
    this.comboHits = 0;
    this.comboDmg = 0;
    this.juggle = 0;
    this.vx = 0;
    if (this.airborne) {
      this.setState('air');
      this.jumpDir = 0;
      this.noAirAttack = false;
      return;
    }
    const d = this.relDir(this.inp);
    this.setState([1, 2, 3].includes(d) ? 'crouch' : 'idle');
    this.faceOpp();
  }

  // ---------------- neutral ----------------
  neutral(d) {
    if (this.state === 'land' && this.t < 3) return;
    this.faceOpp();
    if (this.tryActions(d)) return;
    const slow = this.slowT > 0 ? 0.55 : 1;
    if (this.wantDash) {
      const dir = this.wantDash;
      this.wantDash = 0;
      if (this.inp.hold.parry && dir > 0 && !this.burnout) return this.startSprint();
      return this.startDash(dir);
    }
    if (d >= 7) {
      this.jumpDir = d === 9 ? 1 : d === 7 ? -1 : 0;
      this.jumpDir *= this.facing;
      this.setState('jumpsquat');
      return;
    }
    if (d <= 3) {
      if (this.state !== 'crouch') this.setState('crouch');
      this.vx = 0;
      return;
    }
    if (d === 6) {
      if (this.state !== 'walk') this.setState('walk');
      this.vx = this.def.walkF * this.facing * slow;
      this.walkPhase += 1;
    } else if (d === 4) {
      if (this.state !== 'walk') this.setState('walk');
      this.vx = -this.def.walkB * this.facing * slow;
      this.walkPhase -= 1;
    } else {
      if (this.state !== 'idle') this.setState('idle');
      this.vx = 0;
    }
  }

  // returns true if an action started
  tryActions(d, cancelFrom) {
    const modern = this.scheme === 'modern';
    if (this.ai && this.aiAction) {
      const a = this.aiAction;
      if (cancelFrom && a.type !== 'special' && a.type !== 'super') return false;
      this.aiAction = null;
      if (this.execAI(a)) return true;
      if (cancelFrom) return false;
    }
    // taunt
    if (!cancelFrom && this.hasPress('taunt')) {
      this.consume('taunt');
      this.setState('taunt');
      this.vx = 0;
      this.m.speech(this, this.def.taunt);
      Sound.sfx('taunt');
      return true;
    }
    // supers
    const sup = this.checkSuperInput(d, modern);
    if (sup && this.startSuper(sup)) return true;
    if (cancelFrom === 'super-only') return false;
    // specials
    const sp = this.checkSpecialInput(d, modern);
    if (sp && this.startSpecial(sp.spec, sp.str, sp.ex, sp.modern)) return true;
    if (cancelFrom === 'special') return false;
    if (cancelFrom) {
      // chain normals only
      return false;
    }
    // system mechanics
    const throwP = this.hasPress('throw') || (modern ? this.pressedTwo(['l', 'm']) : this.pressedTwo(['lp', 'lk']));
    if (throwP && !this.airborne) {
      this.consume('throw', 'lp', 'lk', 'l', 'm');
      return this.startThrow(d === 4 || d === 1 || d === 7);
    }
    const impactP = this.hasPress('impact') || (!modern && this.pressedTwo(['hp', 'hk']));
    if (impactP && !this.airborne) {
      this.consume('impact', 'hp', 'hk');
      if (this.startImpact()) return true;
    }
    const parryP = this.hasPress('parry') || (modern ? this.pressedTwo(['m', 'h']) : this.pressedTwo(['mp', 'mk']));
    if (parryP && !this.airborne) {
      this.consume('parry', 'mp', 'mk', 'm', 'h');
      if (this.startParry()) return true;
    }
    // auto combo (modern)
    if (modern && (this.inp.hold.auto || this.autoOn)) {
      const b = this.pressedAny(['l', 'm', 'h']);
      if (b) {
        this.consume(b);
        return this.startAuto(b, d);
      }
    }
    // normals
    const nid = this.pickNormal(d, modern);
    if (nid) return this.startNormal(nid);
    return false;
  }

  execAI(a) {
    switch (a.type) {
      case 'normal': {
        let id = a.id;
        if (this.airborne) id = 'j' + id.slice(1);
        return this.startNormal(id);
      }
      case 'special':
        if (!a.spec) return false;
        if (this.airborne && !a.spec.air) return false;
        return this.startSpecial(a.spec, a.str ?? 1, !!a.ex && this.gauge >= 200 && !this.burnout, false);
      case 'super':
        return this.meter >= a.level * 100 && this.startSuper(a.level);
      case 'throw':
        return !this.airborne && this.startThrow(a.back);
      case 'parry':
        this.aiParryLen = a.len || 20;
        return this.startParry();
      case 'impact':
        return this.startImpact();
      case 'dash':
        if (a.dir > 0 && this.gauge > 300 && Math.random() < 0.3) {
          this.startSprint();
          return true;
        }
        this.startDash(a.dir);
        return true;
      case 'taunt':
        this.setState('taunt');
        this.vx = 0;
        this.m.speech(this, this.def.taunt);
        return true;
    }
    return false;
  }

  pickNormal(d, modern) {
    const stance = this.airborne ? 'air' : d <= 3 ? 'crouch' : 'stand';
    if (modern) {
      const b = this.pressedAny(['h', 'm', 'l']);
      if (!b) return null;
      this.consume(b);
      return MODERN_MAP[stance][b];
    }
    const b = this.pressedAny(['hp', 'hk', 'mp', 'mk', 'lp', 'lk']);
    if (!b) return null;
    this.consume(b);
    const pre = stance === 'air' ? 'j' : stance === 'crouch' ? '2' : '5';
    return pre + b;
  }

  checkSuperInput(d, modern) {
    if (this.meter < 100) return null;
    let lvl = 0;
    if (this.hasPress('super')) {
      lvl = this.meter >= 300 ? 3 : this.meter >= 200 ? 2 : 1;
      this.consume('super');
    } else if (!modern) {
      const P = this.pressedAny(['lp', 'mp', 'hp']);
      const K = this.pressedAny(['lk', 'mk', 'hk']);
      if ((P || K) && this.isMotion('qcb2') && this.meter >= 300) lvl = 3;
      else if (K && this.isMotion('qcf2') && this.meter >= 200) lvl = 2;
      else if (P && this.isMotion('qcf2')) lvl = 1;
      if (lvl) this.consume('lp', 'mp', 'hp', 'lk', 'mk', 'hk');
    } else if (this.hasPress('sp') && this.hasPress('h') && this.inp.hold.auto) {
      lvl = this.meter >= 300 ? 3 : this.meter >= 200 ? 2 : 1;
      this.consume('sp', 'h');
    }
    return lvl || null;
  }

  checkSpecialInput(d, modern) {
    const specs = this.def.specials;
    if (modern) {
      if (!this.hasPress('sp')) return null;
      const ex = this.hasPress('h', 3) && !this.burnout && this.gauge >= 200;
      const slot = d === 6 || d === 3 || d === 9 ? 'f' : d === 4 || d === 1 || d === 7 ? 'b' : d === 2 ? 'd' : 'n';
      let spec = specs.find((s) => s.modern === slot) || (slot === 'd' ? specs.find((s) => s.modern === 'n') : null) || specs.find((s) => s.modern === 'n');
      if (!spec) return null;
      this.consume('sp', ...(ex ? ['h'] : []));
      return { spec, str: 1, ex, modern: true };
    }
    // classic: check motions in priority order (dp > hcf > charge > qcf/qcb)
    const order = ['dp', 'hcf', 'chargeDU', 'chargeBF', 'qcf', 'qcb'];
    const sorted = specs.slice().sort((a, b) => order.indexOf(a.input) - order.indexOf(b.input));
    for (const spec of sorted) {
      const btns = spec.btn === 'p' ? ['lp', 'mp', 'hp'] : spec.btn === 'k' ? ['lk', 'mk', 'hk'] : ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'];
      const b = this.pressedAny(btns.slice().reverse());
      if (!b) continue;
      if (!this.isMotion(spec.input)) continue;
      if (spec.air === undefined && this.airborne) continue;
      const two = this.pressedTwo(btns, 4);
      const ex = !!two && !this.burnout && this.gauge >= 200;
      const str = b[0] === 'l' ? 0 : b[0] === 'm' ? 1 : 2;
      this.consume(...btns);
      if (spec.input === 'chargeBF') this.chargeBRel = 99;
      if (spec.input === 'chargeDU') this.chargeDRel = 99;
      return { spec, str, ex, kick: b[1] === 'k' };
    }
    return null;
  }

  // ---------------- move starts ----------------
  startNormal(id) {
    const def = NORMALS[id];
    if (!def) return false;
    this.move = {
      kind: 'normal', id, def, t: 0, startup: def.startup, active: def.active, recovery: def.recovery,
      hits: 0, maxHits: 1, str: def.str, hitConfirmed: false, rehit: 99,
    };
    this.setState('attack');
    if (!this.airborne) this.vx = 0;
    Sound.sfx(def.str === 2 ? 'whiffH' : 'whiffL', { vol: 0.35, pitch: 1 + Math.random() * 0.1 });
    return true;
  }

  startAuto(b, d) {
    const route = AUTO_ROUTES[b];
    if (this.clock - this.autoT > 40) this.autoStep = 0;
    this.autoT = this.clock;
    let step = route[Math.min(this.autoStep, route.length - 1)];
    this.autoStep++;
    if (this.airborne) return this.startNormal(MODERN_MAP.air[b]);
    if (step === 'super') {
      if (this.meter >= 100) return this.startSuper(this.meter >= 300 ? 3 : this.meter >= 200 ? 2 : 1);
      step = route[0];
    }
    if (step.startsWith('sp:')) {
      const slot = step.slice(3);
      const spec = this.def.specials.find((s) => s.modern === slot) || this.def.specials[0];
      return this.startSpecial(spec, 1, false, true);
    }
    return this.startNormal(step);
  }

  startSpecial(spec, str, ex, modern) {
    if (spec.type === 'projectile' && this.proj > 0 && !spec.grow) return false;
    if (spec.type === 'trap' && this.m.objects.filter((o) => o.owner === this && o.kind === 'trap').length >= (ex ? 2 : 1)) {
      // replace oldest
      const old = this.m.objects.find((o) => o.owner === this && o.kind === 'trap');
      if (old) old.dead = true;
    }
    if (this.airborne && !spec.air) return false;
    if (ex && !this.spendGauge(200)) ex = false;
    const p = Object.assign({}, spec, ex ? spec.ex || {} : {});
    this.move = {
      kind: 'special', spec: p, base: spec, t: 0, str, ex, modern, hits: 0, maxHits: p.hits || 1,
      startup: p.startup || 10, active: p.active || 6, recovery: p.recovery || 20, rehit: 0, hitConfirmed: false,
      dmgMul: modern ? 0.85 : 1,
    };
    this.stats.specials++;
    this.setState('attack');
    if (!this.airborne && !['rush', 'spin'].includes(p.type)) this.vx = 0;
    const h = SPECIAL_TYPES[p.type];
    if (h && h.start) h.start(this, this.move);
    if (ex) {
      this.m.popup(this, 'DOUBLE SHIFT!', '#ffd040');
      this.flashT = 6;
      Sound.sfx('confirm', { vol: 0.5, pitch: 1.4 });
    }
    this.m.callout(this, p.name);
    return true;
  }

  startSuper(level) {
    if (this.airborne) return false;
    const cost = level * 100;
    if (this.meter < cost && !this.m.training?.infMeter) return false;
    const critical = level === 3 && this.hp <= this.maxHp * 0.25;
    this.meter -= cost;
    if (this.m.training?.infMeter) this.meter = 300;
    const sup = this.def.super;
    this.move = {
      kind: 'super', spec: sup, level, critical, t: 0, hits: 0, maxHits: 99, startup: 4, active: 40, recovery: 30, rehit: 0,
      hitConfirmed: false, dmgMul: 1,
    };
    this.stats.supers++;
    this.setState('attack');
    this.vx = 0;
    this.invuln = 14;
    const h = SUPER_TYPES[sup.type];
    if (h && h.start) h.start(this, this.move);
    this.m.superFreeze(this, level, critical);
    return true;
  }

  startThrow(back) {
    this.move = { kind: 'throw', back, t: 0, startup: 5, active: 3, recovery: 22, hits: 0, maxHits: 1, rehit: 0 };
    this.setState('attack');
    this.vx = 0;
    return true;
  }

  startImpact() {
    if (this.burnout || !this.spendGauge(100)) return false;
    this.move = { kind: 'impact', t: 0, startup: 24, active: 3, recovery: 32, hits: 0, maxHits: 1, rehit: 0, str: 2 };
    this.armor = 2;
    this.setState('attack');
    this.vx = 0;
    this.m.popup(this, 'CHART IMPACT!', '#ffb030');
    this.m.fx.burst(this.x, this.y + 40, 'paper', 6);
    Sound.sfx('impact');
    this.stats.impacts++;
    return true;
  }

  startParry() {
    if (this.burnout) return false;
    if (this.gauge < 20) return false;
    this.setState('parry');
    this.parryT = 0;
    this.vx = 0;
    this.drainGauge(20);
    return true;
  }

  startDash(dir) {
    this.setState(dir > 0 ? 'dash' : 'backdash');
    this.vx = (dir > 0 ? 4.2 : -3.8) * this.facing;
    if (dir < 0) this.invuln = 6;
    Sound.sfx('dash', { vol: 0.5 });
    this.m.fx.dust(this.x - this.facing * 8 * dir, 0);
  }

  startSprint() {
    if (!this.spendGauge(100)) return this.startDash(1);
    this.setState('sprint');
    this.vx = 6.2 * this.facing;
    this.m.popup(this, 'SPRINT!', '#40e0ff');
    Sound.sfx('dash');
  }

  tryPageSecurity(d) {
    const modern = this.scheme === 'modern';
    const parryP = this.hasPress('parry') || (modern ? this.pressedTwo(['m', 'h']) : this.pressedTwo(['mp', 'mk']));
    if (!parryP || ![6, 3, 9].includes(d) || this.burnout || this.gauge < 200) return false;
    this.consume('parry', 'mp', 'mk', 'm', 'h');
    this.spendGauge(200);
    this.move = { kind: 'pagesec', t: 0, startup: 18, active: 3, recovery: 24, hits: 0, maxHits: 1, rehit: 0, str: 1 };
    this.setState('attack');
    this.invuln = 22;
    this.blockstun = 0;
    this.m.popup(this, 'PAGING SECURITY!', '#ff4040');
    this.m.fx.siren(this);
    Sound.sfx('taunt', { pitch: 0.8 });
    return true;
  }

  // ---------------- per-state updates ----------------
  airControl(d) {
    if (this.ai && !this.noAirAttack) {
      const o = this.opp;
      const dx = Math.abs(o.x - this.x);
      if (this.vy < 1.5 && dx < 64 && this.y > 14 && Math.random() < 0.2 * this.ai.p.aggro + 0.05) {
        this.noAirAttack = true;
        this.startNormal(['jhk', 'jhp', 'jmk', 'jlk'][Math.floor(Math.random() * 4)]);
        return;
      }
    }
    if (!this.noAirAttack) {
      const sp = this.checkSpecialInput(d, this.scheme === 'modern');
      if (sp && sp.spec.air && this.startSpecial(sp.spec, sp.str, sp.ex, sp.modern)) return;
      const nid = this.pickNormal(d, this.scheme === 'modern');
      if (nid) {
        this.startNormal(nid);
        this.noAirAttack = true;
      }
    }
  }

  parryUpdate(d) {
    this.parryT++;
    const held = this.inp.hold.parry || (this.scheme === 'modern' ? this.inp.hold.m && this.inp.hold.h : this.inp.hold.mp && this.inp.hold.mk);
    if (this.isHuman || this.ctrl === 'dummy') {
      if (!held && this.parryT > 4) return this.recover();
    } else if (this.t > (this.aiParryLen || 20)) return this.recover();
    if (this.wantDash > 0 || ((this.ctrl === 'cpu') && this.aiSprint)) {
      this.wantDash = 0;
      this.aiSprint = false;
      return this.startSprint();
    }
    this.drainGauge(0.9);
    if (this.burnout) this.recover();
  }

  dashUpdate() {
    const len = this.state === 'dash' ? 16 : 18;
    this.vx *= 0.88;
    if (this.t >= len) this.recover();
  }

  sprintUpdate(d) {
    this.vx = 6.0 * this.facing;
    if (this.t % 4 === 0) this.m.fx.dust(this.x - this.facing * 10, 0);
    if (this.t > 6) {
      // attack out of sprint gets bonus frames
      if (this.tryActions(d)) {
        this.sprintBonus = 30;
        this.vx = 3 * this.facing;
        return;
      }
    }
    if (this.t >= 30) this.recover();
  }

  attackUpdate(d) {
    const mv = this.move;
    if (!mv) return this.recover();
    mv.t++;
    if (mv.rehit > 0) mv.rehit--;
    // cancels
    if (mv.kind === 'normal' && mv.hitConfirmed && mv.t <= mv.startup + mv.active + mv.recovery - 1) {
      if (mv.def.cancel && this.tryActions(d, 'special')) return;
      if (mv.def.chain && mv.t >= mv.startup + mv.active) {
        const b = this.scheme === 'modern' ? this.pressedAny(['l']) : this.pressedAny(['lp', 'lk']);
        if (b) {
          this.consume(b);
          const nid = this.scheme === 'modern' ? (d <= 3 ? '2lk' : '5lp') : (d <= 3 ? '2' : '5') + b;
          return this.startNormal(nid);
        }
      }
      // sprint cancel: parry + forward on a hit/blocked normal
      if (this.hasPress('parry') && this.gauge >= 300 && !this.burnout) {
        this.consume('parry');
        this.spendGauge(200);
        return this.startSprint();
      }
      if (this.scheme === 'modern' && (this.inp.hold.auto || this.autoOn)) {
        const b = this.pressedAny(['l', 'm', 'h']);
        if (b) {
          this.consume(b);
          return this.startAuto(b, d);
        }
      }
    }
    if (mv.kind === 'special' && mv.hitConfirmed && this.meter >= 100 && mv.t > mv.startup) {
      if (this.tryActions(d, 'super-only')) return;
    }
    if (mv.kind === 'normal') {
      if (mv.def.step && mv.t < mv.startup + 2 && !this.airborne) this.vx = mv.def.step * this.facing;
      else if (!this.airborne) this.vx *= 0.7;
      if (mv.def.air) {
        if (!this.airborne) {
          this.move = null;
          this.setState('land');
          return;
        }
        if (mv.t >= mv.startup + mv.active + mv.recovery) {
          this.move = null;
          this.setState('air');
          this.noAirAttack = true;
        }
        return;
      }
    } else if (mv.kind === 'special') {
      const h = SPECIAL_TYPES[mv.spec.type];
      if (h && h.frame && h.frame(this, mv) === 'done') return this.recover();
      if (mv.custom) return;
    } else if (mv.kind === 'super') {
      const h = SUPER_TYPES[mv.spec.type];
      if (h && h.frame && h.frame(this, mv) === 'done') return this.recover();
      if (mv.custom) return;
    } else if (mv.kind === 'throw') {
      if (mv.t === mv.startup + 1) this.m.tryThrow(this);
    } else if (mv.kind === 'impact') {
      if (mv.t === mv.startup - 6) this.vx = 3.4 * this.facing;
      else if (mv.t > mv.startup + 2) this.vx *= 0.8;
      if (mv.t >= mv.startup) this.armor = 0;
    } else if (mv.kind === 'pagesec') {
      if (mv.t === mv.startup - 4) this.vx = 2.4 * this.facing;
      else this.vx *= 0.85;
    }
    if (mv.t >= mv.startup + mv.active + mv.recovery) this.recover();
  }

  // ---------------- poses ----------------
  getPose() {
    const st = this.state;
    const t = this.t;
    const mv = this.move;
    switch (st) {
      case 'idle': {
        const f = Math.floor((this.m.frame + this.side * 13) / 9) % 4;
        if (this.burnout && f % 2) return 'burnout';
        return ['idle1', 'idle2', 'idle3', 'idle2'][f];
      }
      case 'walk': {
        const f = Math.floor(Math.abs(this.walkPhase) / 7) % 4;
        return ['walk1', 'walk2', 'walk3', 'walk4'][this.walkPhase >= 0 ? f : 3 - f];
      }
      case 'crouch':
        return t < 3 ? 'crouchHalf' : 'crouch';
      case 'land':
        return 'jumpSquat';
      case 'jumpsquat':
        return 'jumpSquat';
      case 'air':
        if (this.jumpDir !== 0 && this.vy < 5 && this.vy > -4) {
          const forward = this.jumpDir * this.facing > 0;
          if (forward) return this.vy > 0 ? 'tuck1' : 'tuck2';
        }
        return this.vy > 2.5 ? 'jumpUp' : this.vy > -2.5 ? 'jumpTop' : 'jumpFall';
      case 'attack':
        return this.attackPose();
      case 'hitstun':
        if (this.crouchHit) return 'hitCrouch';
        return this.hitHigh ? (this.hitstun > 6 ? 'hitHigh2' : 'hitHigh') : 'hitLow';
      case 'blockstun':
        return this.crouchBlock ? 'crouchBlock' : 'block';
      case 'airhit':
        return this.vy > 0 ? 'airHit' : 'fall';
      case 'fall':
        return 'fall';
      case 'knockdown':
        return this.hp <= 0 ? 'down' : 'downHurt';
      case 'getup':
        return t < 9 ? 'getup1' : 'getup2';
      case 'crumple':
        return t < 20 ? 'hitLow' : 'crumple';
      case 'dizzy':
        return Math.floor(this.m.frame / 16) % 2 ? 'dizzy1' : 'dizzy2';
      case 'parry':
        return 'parry';
      case 'dash':
        return 'dash';
      case 'backdash':
        return 'backdash';
      case 'sprint':
        return Math.floor(t / 5) % 2 ? 'sprint1' : 'sprint2';
      case 'taunt':
        return this.def.id === 'it' || this.def.id === 'trauma' ? 'tauntB' : 'tauntA';
      case 'thrown':
        return this.thrownPose || 'thrown';
      case 'throwing':
        return this.throwPose || 'throwGrab';
      case 'cinema':
        return this.cinePose || 'idle1';
      case 'ko':
        return this.airborne ? 'fall' : 'down';
      case 'win':
        return this.winPose || (t < 30 ? 'idle1' : Math.floor(t / 20) % 2 ? 'win1' : 'win2');
      case 'lose':
        return 'lose';
      case 'intro':
        return this.introPose || 'introA';
    }
    return 'idle1';
  }

  attackPose() {
    const mv = this.move;
    if (!mv) return 'idle1';
    const ph = this.inMovePhase();
    if (mv.kind === 'normal') {
      const d = mv.def;
      return ph === 'startup' ? d.w : ph === 'active' ? d.a : mv.t < mv.startup + mv.active + mv.recovery * 0.5 ? d.a : d.r;
    }
    if (mv.kind === 'throw') return ph === 'recovery' ? 'grab' : 'throwGrab';
    if (mv.kind === 'impact') return ph === 'startup' ? 'impactW' : 'impactA';
    if (mv.kind === 'pagesec') return ph === 'startup' ? (mv.t < 8 ? 'block' : 'projW') : 'pageSec';
    if (mv.kind === 'special') {
      const h = SPECIAL_TYPES[mv.spec.type];
      return (h && h.pose && h.pose(this, mv, ph)) || 'idle1';
    }
    if (mv.kind === 'super') {
      const h = SUPER_TYPES[mv.spec.type];
      return (h && h.pose && h.pose(this, mv, ph)) || 'superFlash';
    }
    return 'idle1';
  }

  propFor(pose) {
    if (pose === 'impactW' || pose === 'impactA') return 'clipboard';
    return undefined;
  }

  // ---------------- boxes ----------------
  toWorld(b) {
    if (!b) return null;
    const x = this.facing > 0 ? this.x + b.x : this.x - b.x - b.w;
    return { x, y: this.y + b.y, w: b.w, h: b.h };
  }

  limbBox(pose, limb, pad = 3) {
    const sol = solvePose(this.look, pose);
    const J = sol.J;
    let a, b;
    if (limb === 'fh') { a = J.fe; b = J.fh; }
    else if (limb === 'bh') { a = J.be; b = J.bh; }
    else if (limb === 'ff') { a = [lerp(J.fk[0], J.fan[0], 0.4), lerp(J.fk[1], J.fan[1], 0.4)]; b = J.ft; }
    else if (limb === 'bf') { a = J.bk; b = J.bt; }
    else return null;
    // extend toward the end a bit (fists / toes)
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const e = [b[0] + (dx / l) * 2.5, b[1] + (dy / l) * 2.5];
    const x0 = Math.min(a[0], e[0]) - pad, x1 = Math.max(a[0], e[0]) + pad;
    const y0 = Math.min(a[1], e[1]) - pad, y1 = Math.max(a[1], e[1]) + pad;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  bodyBox(pose) {
    const sol = solvePose(this.look, pose);
    const J = sol.J;
    const cx = (J.hip[0] + J.headC[0]) / 2;
    const w = this.halfW * 1.7;
    const top = Math.min(sol.top, 90 * this.s);
    return { x: cx - w / 2, y: 0, w, h: Math.max(18, top - 2) };
  }

  getHurtboxes() {
    if (['knockdown', 'ko', 'intro', 'win', 'lose', 'cinema', 'thrown'].includes(this.state)) return [];
    const pose = this.getPose();
    const boxes = [this.toWorld(this.bodyBox(pose))];
    const mv = this.move;
    if (mv && this.state === 'attack' && mv.kind === 'normal') {
      const ph = this.inMovePhase();
      if (ph !== 'startup') {
        const lb = this.limbBox(pose, mv.def.limb, 1);
        if (lb) boxes.push(this.toWorld(lb));
      }
    }
    return boxes;
  }

  // active hitbox in world coords + hit data, or null
  getHitbox() {
    if (this.state !== 'attack' || !this.move) return null;
    const mv = this.move;
    if (mv.rehit > 0) return null;
    if (mv.hits >= mv.maxHits) return null;
    if (mv.kind === 'normal') {
      if (this.inMovePhase() !== 'active') return null;
      const d = mv.def;
      const box = this.limbBox(d.a, d.limb, d.pad);
      return {
        box: this.toWorld(box),
        hd: {
          dmg: d.dmg, hitstun: d.hitstun + (this.sprintBonus ? 4 : 0), blockstun: d.blockstun + (this.sprintBonus ? 4 : 0), guard: d.guard,
          kd: d.kd, str: d.str, pushHit: d.pushHit, pushBlock: d.pushBlock, launchAir: d.launchAir, kind: 'normal', antiair: d.antiair,
        },
      };
    }
    if (mv.kind === 'impact') {
      if (this.inMovePhase() !== 'active') return null;
      const box = this.limbBox('impactA', 'bh', 9);
      return { box: this.toWorld(box), hd: { dmg: 80, hitstun: 30, blockstun: 22, guard: 'mid', str: 2, pushBlock: 16, crumple: true, impact: true, kind: 'impact' } };
    }
    if (mv.kind === 'pagesec') {
      if (this.inMovePhase() !== 'active') return null;
      const box = this.limbBox('pageSec', 'fh', 8);
      return { box: this.toWorld(box), hd: { dmg: 50, hitstun: 20, blockstun: 16, guard: 'mid', str: 1, kd: true, pushHit: 20, pushBlock: 20, noKO: true, kind: 'pagesec' } };
    }
    if (mv.kind === 'special') {
      const h = SPECIAL_TYPES[mv.spec.type];
      return h && h.hitbox ? h.hitbox(this, mv) : null;
    }
    if (mv.kind === 'super') {
      const h = SUPER_TYPES[mv.spec.type];
      return h && h.hitbox ? h.hitbox(this, mv) : null;
    }
    return null;
  }

  // called when this fighter's attack connects (hit or block)
  onConnect(hd, blocked, def) {
    const mv = this.move;
    if (!mv) return;
    mv.hits++;
    mv.hitConfirmed = true;
    mv.rehit = mv.rehitN || 99;
    if (mv.kind === 'special' && mv.spec.onHit) mv.spec.onHit(this, mv, blocked);
    const h = mv.kind === 'special' ? SPECIAL_TYPES[mv.spec.type] : mv.kind === 'super' ? SUPER_TYPES[mv.spec.type] : null;
    if (h && h.connect) h.connect(this, mv, blocked, def);
  }

  specialDmg(mv, base) {
    return Math.round(base * (mv.dmgMul || 1));
  }
}

export function blankInput() {
  return { left: false, right: false, up: false, down: false, press: {}, hold: {} };
}

// =====================================================================================
// Special move behaviors
// =====================================================================================
const P_BTN = (mv) => mv.str;

function projOrigin(f) {
  return { x: f.x + f.facing * 26 * f.s, y: f.y + 44 * f.s };
}

export const SPECIAL_TYPES = {
  projectile: {
    start(f, mv) {
      mv.recovery = mv.spec.recovery;
      mv.active = 1;
      if (f.airborne) {
        mv.custom = false;
      }
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        const o = projOrigin(f);
        const sp = pick(p.speed, mv.str);
        const n = p.spread || 1;
        for (let i = 0; i < n; i++) {
          const ang = n > 1 ? (i - (n - 1) / 2) * 0.22 : 0;
          f.m.spawnProjectile(f, {
            sprite: p.proj, x: o.x, y: o.y - (f.airborne ? 10 : 0), vx: sp * Math.cos(ang) * f.facing,
            vy: p.lob ? p.vy || 4 : f.airborne ? -sp * 0.7 : sp * Math.sin(ang) * 0.8, grav: p.lob ? 0.2 : 0,
            dmg: f.specialDmg(mv, p.dmg), hits: p.hits || 1, life: p.life || 400, w: p.w || 14, h: p.h || 10,
            effect: p.effect, onLand: p.onLand, grow: p.grow, ex: mv.ex, str: Math.min(2, mv.str + (mv.ex ? 1 : 0)),
          });
        }
        Sound.sfx(p.proj === 'gas' || p.proj === 'sneeze' ? 'gas' : 'projectile');
        if (f.airborne) {
          f.vy = Math.max(f.vy, 1.5);
          f.noAirAttack = true;
        }
      }
      if (f.airborne && mv.t > mv.startup + 6) {
        f.move = null;
        f.setState('air');
        f.noAirAttack = true;
        return;
      }
      if (f.airborne === false && mv.wasAir) return 'done';
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      if (p.lob) return ph === 'startup' ? 'lobW' : 'lobA';
      if (f.airborne) return ph === 'startup' ? 'jumpTop' : 'castA';
      return ph === 'startup' ? 'projW' : mv.t < mv.startup + 10 ? 'projA' : 'projR';
    },
  },

  rising: {
    start(f, mv) {
      const p = mv.spec;
      mv.invulnT = p.invuln || 0;
      f.invuln = mv.invulnT + p.startup;
      mv.active = 999;
      mv.rehitN = 5;
      mv.maxHits = p.hits || 1;
      mv.rose = false;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        f.vy = pick(p.rise, mv.str) * (mv.ex ? 1.05 : 1);
        f.vx = (p.vx || 1) * f.facing * (1 + mv.str * 0.2);
        f.y = 0.1;
        mv.rose = true;
        Sound.sfx('whiffH');
        if (p.fx === 'slash') f.m.fx.burst(f.x + f.facing * 10, 30, 'slash', 1, f.facing);
      }
      if (mv.rose && !f.airborne && mv.t > mv.startup + 2) {
        if (!mv.landed) {
          mv.landed = mv.t;
          f.vx = 0;
          f.m.fx.dust(f.x, 0);
        }
        if (mv.t - mv.landed >= Math.round(p.recovery * 0.6)) return 'done';
      }
      mv.custom = true;
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      if (ph === 'startup') return 'upW';
      if (mv.landed) return 'jumpSquat';
      if (f.vy > 0.5) return p.pose || 'upA';
      return p.pose === 'hkA' || p.pose === 'jhkA' ? 'tuck1' : 'upR';
    },
    hitbox(f, mv) {
      const p = mv.spec;
      if (!mv.rose || mv.landed || f.vy < -1.2) return null;
      const pose = p.pose || 'upA';
      const box = f.limbBox(pose, pose === 'upA' ? 'fh' : 'ff', 6);
      box.h += 12;
      box.y -= 12;
      return {
        box: f.toWorld(box),
        hd: { dmg: f.specialDmg(mv, Math.round(pick(p.dmg, mv.str) / (mv.maxHits > 1 ? mv.maxHits * 0.7 : 1))), hitstun: 30, blockstun: 18, guard: 'mid', str: 2, launch: true, kind: 'special', pushBlock: 3, chip: true },
      };
    },
  },

  spin: {
    start(f, mv) {
      const p = mv.spec;
      mv.maxHits = pick(p.hits, mv.str);
      mv.active = 8 * mv.maxHits + 4;
      mv.rehitN = 7;
      if (p.invulnUpper || p.invuln) f.invuln = p.invuln || 0;
      mv.antiAirInvuln = !!p.invulnUpper;
    },
    frame(f, mv) {
      const p = mv.spec;
      const ph = f.inMovePhase();
      if (ph === 'startup' && p.hover && mv.t === mv.startup - 1) {
        f.vy = 2.6;
        f.y = 0.1;
      }
      if (ph === 'active') {
        f.vx = (p.speed || 0) * f.facing;
        if (p.hover) {
          if (f.y >= 16) {
            f.y = 16;
            f.vy = GRAV;
          }
        }
        if (mv.t % 8 === 0) Sound.sfx('whiffL', { vol: 0.5 });
      } else if (ph === 'recovery') {
        f.vx *= 0.7;
        if (p.hover && f.airborne) mv.t = Math.min(mv.t, mv.startup + mv.active + 1);
      }
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      const poses = p.poses || ['spin1', 'spin2'];
      if (ph === 'startup') return 'jumpSquat';
      if (ph === 'active') return poses[Math.floor(mv.t / 4) % 2];
      return 'idle1';
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active') return null;
      const p = mv.spec;
      const lar = p.poses && p.poses[0] === 'lariat1';
      const box = lar || (p.poses && p.poses[0] === 'spin1' && p.speed < 0.5) ? { x: -30 * f.s, y: 18, w: 60 * f.s, h: 40 } : { x: -6, y: p.hover ? 2 : 16, w: 42 * f.s, h: 30 };
      if (p.poses && p.poses[0] === 'lkA') Object.assign(box, { x: 4, y: 16, w: 40 * f.s, h: 44 });
      return { box: f.toWorld(box), hd: { dmg: f.specialDmg(mv, p.dmg), hitstun: 16, blockstun: 12, guard: 'mid', str: 1, kind: 'special', pushHit: 1.5, pushBlock: 2, chip: true, kd: mv.hits >= mv.maxHits - 1 && !lar ? false : false, lastKd: true } };
    },
  },

  rush: {
    start(f, mv) {
      const p = mv.spec;
      mv.active = pick(p.dur, mv.str);
      mv.maxHits = p.hits || 1;
      mv.rehitN = p.hits > 1 ? 4 : 99;
      f.armor = p.armor || 0;
    },
    frame(f, mv) {
      const p = mv.spec;
      const ph = f.inMovePhase();
      if (ph === 'startup' && mv.t === mv.startup - 1 && p.hover) {
        f.y = 22;
      }
      if (ph === 'active') {
        if (!mv.stopped) f.vx = p.speed * f.facing;
        if (p.hover) {
          f.y = 22;
          f.vy = GRAV;
        }
        if (mv.t % 4 === 0) f.m.fx.afterimage(f);
        if (p.fx === 'siren' && mv.t % 6 === 0) f.m.fx.burst(f.x, f.y + 70, 'siren', 1);
        if (p.fx === 'money' && mv.t % 3 === 0) f.m.fx.burst(f.x, f.y + 40, 'money', 1);
      } else if (ph === 'recovery') {
        f.vx *= 0.75;
        f.armor = 0;

      }
    },
    connect(f, mv, blocked) {
      if (mv.hits >= mv.maxHits) {
        mv.stopped = true;
        f.vx = blocked ? -1.5 * f.facing : 0;
        mv.t = Math.max(mv.t, mv.startup + mv.active - 1);
      }
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      if (ph === 'startup') return p.pose === 'slide' ? 'crouchHalf' : 'jumpSquat';
      if (ph === 'active') return p.pose || 'rush';
      return p.pose === 'slide' ? 'crouch' : 'projR';
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active') return null;
      const p = mv.spec;
      const pose = p.pose || 'rush';
      let box;
      if (pose === 'slide') box = { x: 0, y: 0, w: 40 * f.s, h: 18 };
      else if (pose === 'dive') box = { x: -10, y: 30, w: 46 * f.s, h: 26 };
      else if (pose === 'mkA') box = f.limbBox('mkA', 'ff', 5);
      else if (pose === 'dash') box = { x: 0, y: 20, w: 30 * f.s, h: 50 };
      else box = f.limbBox('rush', 'fh', 5);
      const multi = mv.maxHits > 1;
      return {
        box: f.toWorld(box),
        hd: {
          dmg: f.specialDmg(mv, p.dmg), hitstun: multi ? 18 : 24, blockstun: multi ? 10 : 14, guard: p.guard || 'mid', str: 2, kind: 'special',
          kd: p.kd || (!multi && mv.str === 2) || (multi && mv.hits === mv.maxHits - 1), pushHit: multi ? 1 : 8, pushBlock: multi ? 1 : 6, chip: true,
          effect: p.effect,
        },
      };
    },
  },

  strike: {
    start(f, mv) {
      mv.active = mv.spec.active || 4;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t < mv.startup && p.step) f.vx = p.step * f.facing;
      else f.vx *= 0.7;
      if (mv.t === mv.startup) {
        f.m.shake(4);
        f.m.fx.dust(f.x + f.facing * 26, 0);
        Sound.sfx('land');
      }
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      return ph === 'startup' ? p.windup || 'hpW' : p.pose;
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active') return null;
      const p = mv.spec;
      const box = { x: p.ox - p.w / 2, y: p.oy - p.h / 2, w: p.w, h: p.h };
      return { box: f.toWorld(box), hd: { dmg: f.specialDmg(mv, p.dmg), hitstun: 26, blockstun: 16, guard: p.guard || 'mid', str: 2, kind: 'special', kd: p.kd, pushHit: 6, pushBlock: 6, chip: true } };
    },
  },

  stretch: {
    start(f, mv) {
      mv.active = mv.spec.active || 4;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) Sound.sfx('whiffH', { pitch: 0.8 });
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      if (ph === 'startup') return p.pose === 'stretchKA' ? 'mkW' : 'projW';
      if (ph === 'active' || mv.t < mv.startup + mv.active + 5) return p.pose;
      return p.pose === 'stretchKA' ? 'hkR' : 'projR';
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active') return null;
      const p = mv.spec;
      const box = f.limbBox(p.pose, p.pose === 'stretchKA' ? 'ff' : 'fh', 4);
      return { box: f.toWorld(box), hd: { dmg: f.specialDmg(mv, p.dmg), hitstun: 20, blockstun: 14, guard: p.guard || 'mid', str: 1, kind: 'special', pushHit: 6, pushBlock: 6, chip: true, effect: p.effect } };
    },
  },

  burst: {
    start(f, mv) {
      const p = mv.spec;
      mv.active = p.active || 10;
      mv.maxHits = p.hits || 1;
      mv.rehitN = Math.max(3, Math.floor(mv.active / mv.maxHits));
      f.invuln = (p.invuln || 0) + p.startup;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (f.inMovePhase() === 'active' && mv.t % 2 === 0) {
        const fx = p.fx || 'gas';
        f.m.fx.burst(f.x + f.facing * p.ox * f.s, f.y + p.oy, fx, 2, f.facing);
      }
      if (mv.t === mv.startup) Sound.sfx(p.fx === 'bsod' ? 'zap' : 'gas');
    },
    pose(f, mv, ph) {
      const p = mv.spec;
      return ph === 'startup' ? (p.pose === 'upA' ? 'upW' : 'projW') : p.pose;
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active') return null;
      const p = mv.spec;
      const box = { x: p.ox * f.s - p.w / 2, y: p.oy - p.h / 2, w: p.w, h: p.h };
      return { box: f.toWorld(box), hd: { dmg: f.specialDmg(mv, Math.round(p.dmg / Math.max(1, mv.maxHits * 0.75))), hitstun: 26, blockstun: 14, guard: 'mid', str: 2, kind: 'special', launch: true, pushBlock: 4, chip: true } };
    },
  },

  grab: {
    start(f, mv) {
      mv.active = 2;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const p = mv.spec;
        const o = f.opp;
        const range = pick(p.range, mv.str) + f.halfW + o.halfW;
        if (Math.abs(o.x - f.x) <= range && f.m.canBeThrown(o, true)) {
          f.m.commandGrab(f, o, f.specialDmg(mv, pick(p.dmg, mv.str)), p);
          return;
        }
        Sound.sfx('whiffH', { pitch: 0.7 });
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'projW' : 'grab';
    },
  },

  counter: {
    start(f, mv) {
      mv.active = mv.spec.dur;
      mv.counterReady = true;
    },
    frame(f, mv) {
      if (f.inMovePhase() === 'active' && mv.t % 6 === 0) f.m.fx.burst(f.x, f.y + 60, f.def.id === 'chaplain' ? 'holy' : 'think', 1);
      if (f.inMovePhase() !== 'active') mv.counterReady = false;
    },
    pose(f, mv, ph) {
      return ph === 'recovery' ? 'idle1' : 'stance';
    },
  },

  teleport: {
    start(f, mv) {
      mv.active = 1;
      f.invuln = mv.startup + 6;
      mv.kick = (f.lastSpecialKick = f.buf.length && false);
      Sound.sfx('teleport');
      f.m.fx.burst(f.x, f.y + 40, 'bsod', 6);
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const o = f.opp;
        const behind = mv.str !== 0 || mv.modern;
        let nx;
        if (behind) nx = o.x + (o.x > f.x ? 42 : -42);
        else nx = f.x - f.facing * 150;
        const lo = f.m.camPlayL() + 14, hi = f.m.camPlayR() - 14;
        nx = Math.max(Math.max(WALL_L, lo), Math.min(Math.min(WALL_R, hi), nx));
        f.x = nx;
        f.y = 0;
        f.faceOpp();
        f.m.fx.burst(f.x, f.y + 40, 'bsod', 6);
        Sound.sfx('teleport', { pitch: 1.3 });
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'stance' : 'jumpSquat';
    },
  },

  trap: {
    start(f, mv) {
      mv.active = 1;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        const n = p.count || 1;
        for (let i = 0; i < n; i++) {
          const dist = pick(p.dist, mv.str) + i * 60;
          f.m.spawnTrap(f, p.trap, f.x + f.facing * dist);
        }
        Sound.sfx('splash');
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'lobW' : 'lobA';
    },
  },

  heal: {
    start(f, mv) {
      mv.active = mv.spec.dur;
      f.armor = mv.spec.armor || 0;
      Sound.sfx('heal');
    },
    frame(f, mv) {
      const p = mv.spec;
      if (f.inMovePhase() === 'active') {
        const per = p.amount / p.dur;
        f.hp = Math.min(f.maxHp, f.hp + per);
        if (mv.t % 5 === 0) f.m.fx.burst(f.x + (Math.random() - 0.5) * 20, f.y + 30 + Math.random() * 40, 'holy', 1);
      } else f.armor = 0;
    },
    pose(f, mv, ph) {
      return ph === 'recovery' ? 'idle1' : 'pray';
    },
  },

  beam: {
    start(f, mv) {
      mv.active = 1;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        const range = p.range ? pick(p.range, mv.str) : 520;
        f.m.spawnBeam(f, {
          x: f.x + f.facing * 22 * f.s, y: f.y + p.y, h: p.h, range, delay: p.delay || 0, dur: p.dur, hits: p.hits || 1,
          dmg: f.specialDmg(mv, Math.round(p.dmg / Math.max(1, (p.hits || 1) * 0.7))), color: p.color, effect: p.effect, label: p.label, attached: !p.delay,
        });
        Sound.sfx(p.effect === 'xray' ? 'zap' : 'projectile');
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'projW' : mv.t < mv.startup + (mv.spec.delay ? 8 : mv.spec.dur) ? 'beamA' : 'projR';
    },
  },

  dive: {
    start(f, mv) {
      mv.active = 999;
      mv.maxHits = mv.spec.hits || 1;
      mv.rehitN = 6;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        f.vy = p.vy;
        f.vx = pick(p.vx, mv.str) * f.facing;
        f.y = 0.1;
        mv.jumped = true;
        Sound.sfx('jump');
      }
      if (mv.jumped && !f.airborne && mv.t > mv.startup + 2) {
        if (!mv.landed) {
          mv.landed = mv.t;
          f.vx = 0;
          f.m.fx.dust(f.x, 0);
        }
        if (mv.t - mv.landed >= p.recovery) return 'done';
      }
      mv.custom = true;
    },
    pose(f, mv, ph) {
      if (ph === 'startup') return 'jumpSquat';
      if (mv.landed) return 'jumpSquat';
      return f.def.id === 'peds' ? 'dive' : 'rush';
    },
    hitbox(f, mv) {
      if (!mv.jumped || mv.landed) return null;
      const box = f.def.id === 'peds' ? { x: -6, y: 30, w: 44 * f.s, h: 26 } : f.limbBox('rush', 'fh', 6);
      const p = mv.spec;
      return { box: f.toWorld(box), hd: { dmg: f.specialDmg(mv, p.dmg), hitstun: 22, blockstun: 14, guard: p.guard || 'mid', str: 2, kind: 'special', pushHit: 6, pushBlock: 6, effect: p.effect, chip: true } };
    },
  },

  stomp: {
    start(f, mv) {
      mv.active = 999;
      mv.maxHits = mv.spec.hits || 1;
      mv.rehitN = 6;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        f.vy = p.vy;
        const air = (2 * p.vy) / GRAV;
        const want = (f.opp.x - f.x) / air;
        const cap = pick(p.vx, mv.str);
        f.vx = Math.max(-cap, Math.min(cap, want));
        f.y = 0.1;
        mv.jumped = true;
        Sound.sfx('jump');
      }
      if (mv.jumped && !f.airborne && mv.t > mv.startup + 2) {
        if (!mv.landed) {
          mv.landed = mv.t;
          f.vx = 0;
          f.m.fx.dust(f.x, 0);
          f.m.shake(3);
        }
        if (mv.t - mv.landed >= p.recovery) return 'done';
      }
      mv.custom = true;
    },
    connect(f, mv, blocked) {
      f.vy = 4;
      f.vx = -1.5 * f.facing;
    },
    pose(f, mv, ph) {
      if (ph === 'startup' || mv.landed) return 'jumpSquat';
      return f.vy > 0 ? 'hop' : 'stomp';
    },
    hitbox(f, mv) {
      if (!mv.jumped || mv.landed || f.vy > 0) return null;
      const p = mv.spec;
      return { box: f.toWorld({ x: -14, y: -4, w: 28, h: 26 }), hd: { dmg: f.specialDmg(mv, p.dmg), hitstun: 22, blockstun: 14, guard: 'high', str: 2, kind: 'special', pushHit: 4, pushBlock: 4, chip: true } };
    },
  },

  drop: {
    start(f, mv) {
      mv.active = 1;
    },
    frame(f, mv) {
      const p = mv.spec;
      if (mv.t === mv.startup) {
        f.m.spawnDrop(f, f.opp.x, pick(p.delay, mv.str), f.specialDmg(mv, p.dmg), p.hits || 1);
        Sound.sfx('paper');
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'introA' : 'win1';
    },
  },
};

// =====================================================================================
// Super behaviors
// =====================================================================================
export const SUPER_DMG = [0, 200, 270, 360];
export function superDamage(f, mv) {
  return Math.round((SUPER_DMG[mv.level] + (mv.critical ? 60 : 0)) * f.dmgMul);
}

export const SUPER_TYPES = {
  beam: {
    start(f, mv) {
      mv.startup = 8;
      mv.active = 1;
      mv.recovery = 40;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const lv = mv.level;
        const hits = [0, 5, 7, 10][lv];
        f.m.spawnBeam(f, {
          x: f.x + f.facing * 22 * f.s, y: f.y + 44, h: [0, 22, 30, 40][lv], range: 560, delay: 0, dur: 30 + lv * 8, hits,
          dmg: Math.round(superDamage(f, mv) / hits), color: f.def.super.color, effect: f.def.super.effect || f.def.super.fx, attached: true, superLevel: lv, critical: mv.critical,
        });
        f.m.shake(6);
        Sound.sfx('zap');
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'projW' : mv.t < mv.startup + 34 ? 'beamA' : 'projR';
    },
  },

  rush: {
    start(f, mv) {
      mv.startup = 6;
      mv.active = 30;
      mv.recovery = 30;
      mv.maxHits = 1;
    },
    frame(f, mv) {
      const ph = f.inMovePhase();
      if (ph === 'active' && !mv.connected) {
        f.vx = 7 * f.facing;
        if (mv.t % 3 === 0) f.m.fx.afterimage(f);
        if (f.def.super.fx === 'money' && mv.t % 2 === 0) f.m.fx.burst(f.x, f.y + 40, 'money', 1);
        if (f.def.super.fx === 'siren' && mv.t % 5 === 0) f.m.fx.burst(f.x, f.y + 70, 'siren', 1);
      } else if (ph === 'recovery') f.vx *= 0.7;
    },
    connect(f, mv, blocked, def) {
      if (!blocked) {
        mv.connected = true;
        f.m.startFlurry(f, def, mv);
      } else {
        f.vx = 0;
        mv.t = mv.startup + mv.active;
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'superFlash' : ph === 'active' ? 'rush' : 'projR';
    },
    hitbox(f, mv) {
      if (f.inMovePhase() !== 'active' || mv.connected) return null;
      return { box: f.toWorld({ x: 0, y: 14, w: 34 * f.s, h: 56 }), hd: { dmg: 30, hitstun: 30, blockstun: 16, guard: 'mid', str: 2, kind: 'super', pushBlock: 4, chip: true, superStart: true } };
    },
  },

  grab: {
    start(f, mv) {
      mv.startup = 6;
      mv.active = 3;
      mv.recovery = 40;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const o = f.opp;
        if (Math.abs(o.x - f.x) <= 46 + f.halfW + o.halfW && f.m.canBeThrown(o, true)) {
          mv.connected = true;
          f.m.startFlurry(f, o, mv);
        } else Sound.sfx('whiffH', { pitch: 0.6 });
      }
      if (mv.t < mv.startup) f.vx = 2 * f.facing;
      else f.vx = 0;
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'superFlash' : 'grab';
    },
  },

  rise: {
    start(f, mv) {
      mv.startup = 4;
      mv.active = 999;
      mv.recovery = 24;
      mv.maxHits = [0, 4, 6, 9][mv.level];
      mv.rehitN = 4;
      mv.rises = mv.level >= 2 ? 2 : 1;
      f.invuln = 30;
    },
    frame(f, mv) {
      if ((mv.t === mv.startup || (mv.landed && mv.rises > 0 && mv.t - mv.landed === 4))) {
        f.vy = 7.6;
        f.vx = 1.2 * f.facing;
        f.y = 0.1;
        mv.rises--;
        mv.landed = 0;
        mv.rose = true;
        f.invuln = 20;
        Sound.sfx('whiffH');
        f.m.fx.burst(f.x + f.facing * 10, 30, 'slash', 1, f.facing);
      }
      if (mv.rose && !f.airborne && !mv.landed && mv.t > mv.startup + 2) {
        mv.landed = mv.t;
        f.vx = 0;
        f.m.fx.dust(f.x, 0);
      }
      if (mv.landed && mv.rises <= 0 && mv.t - mv.landed > 20) return 'done';
      mv.custom = true;
    },
    pose(f, mv, ph) {
      if (ph === 'startup' || (mv.landed && mv.rises > 0)) return 'upW';
      if (mv.landed) return 'jumpSquat';
      return f.vy > 0 ? 'hkA' : 'tuck1';
    },
    hitbox(f, mv) {
      if (!mv.rose || mv.landed || f.vy < -2) return null;
      const box = f.limbBox('hkA', 'ff', 8);
      box.y -= 16;
      box.h += 16;
      return { box: f.toWorld(box), hd: { dmg: Math.round(superDamage(f, mv) / mv.maxHits), hitstun: 40, blockstun: 12, guard: 'mid', str: 2, kind: 'super', launch: true, chip: true, superLevel: mv.level, critical: mv.critical } };
    },
  },

  rain: {
    start(f, mv) {
      mv.startup = 10;
      mv.active = 70;
      mv.recovery = 16;
    },
    frame(f, mv) {
      const lv = mv.level;
      const n = [0, 8, 12, 18][lv];
      const ph = f.inMovePhase();
      if (ph === 'active') {
        const every = Math.floor(60 / n);
        const k = mv.t - mv.startup;
        if (k % every === 0 && k / every < n) {
          const o = f.opp;
          const x = o.x + (Math.random() - 0.5) * 70;
          f.m.spawnProjectile(f, {
            sprite: f.def.super.proj, x, y: 230, vx: 0, vy: -6.5, grav: 0, dmg: Math.round(superDamage(f, mv) / n), hits: 1, life: 80, w: 18, h: 18,
            str: 2, rain: true, superLevel: lv, critical: mv.critical, big: true,
          });
          if (k % (every * 2) === 0) Sound.sfx('projectile', { pitch: 1.5, vol: 0.4 });
        }
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'superFlash' : ph === 'active' ? (Math.floor(mv.t / 10) % 2 ? 'win1' : 'win2') : 'idle1';
    },
  },

  wave: {
    start(f, mv) {
      mv.startup = 10;
      mv.active = 1;
      mv.recovery = 36;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const lv = mv.level;
        const hits = [0, 5, 7, 10][lv];
        f.m.spawnProjectile(f, {
          sprite: 'wave', x: f.x + f.facing * 24, y: 2, vx: 4.2 * f.facing, vy: 0, grav: 0, dmg: Math.round(superDamage(f, mv) / hits), hits, life: 200,
          w: 40 + lv * 8, h: 30 + lv * 8, str: 2, rehit: 5, superLevel: lv, critical: mv.critical, ground: true, guardOverride: 'low', big: true,
        });
        f.m.shake(5);
        Sound.sfx('splash');
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'lobW' : 'slamA';
    },
  },

  zone: {
    start(f, mv) {
      mv.startup = 12;
      mv.active = 1;
      mv.recovery = 44;
    },
    frame(f, mv) {
      if (mv.t === mv.startup) {
        const lv = mv.level;
        const hits = [0, 5, 7, 10][lv];
        f.m.spawnZone(f, { hits, dmg: Math.round(superDamage(f, mv) / hits), fx: f.def.super.fx, color: f.def.super.color, lv, critical: mv.critical, radius: [0, 150, 200, 320][lv] });
        f.m.shake(5);
      }
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'superFlash' : 'beamA';
    },
  },

  demon: {
    start(f, mv) {
      mv.startup = 10;
      mv.active = 46;
      mv.recovery = 30;
      f.invuln = 20;
    },
    frame(f, mv) {
      const ph = f.inMovePhase();
      if (ph === 'active' && !mv.connected) {
        f.vx = 2.8 * f.facing;
        if (mv.t % 3 === 0) f.m.fx.afterimage(f, '#c040ff');
        const o = f.opp;
        if (Math.abs(o.x - f.x) <= 18 + f.halfW + o.halfW && f.m.canBeThrown(o, true)) {
          mv.connected = true;
          f.vx = 0;
          f.m.startDemon(f, o, mv);
        }
      } else f.vx *= 0.7;
    },
    pose(f, mv, ph) {
      return ph === 'startup' ? 'superFlash' : ph === 'active' ? 'introA' : 'idle1';
    },
  },
};
