// CPU opponent. Produces held directions each frame and queues actions on the fighter (f.aiAction).
import { blankInput } from './fighter.js';

// level: 1 INTERN, 2 RESIDENT, 3 ATTENDING, 4 CHIEF
const LV = {
  1: { react: 26, think: 22, block: 0.22, read: 0.35, aa: 0.12, punish: 0.15, confirm: 0.2, tech: 0.05, aggro: 0.35, parry: 0.0, super: 0.3 },
  2: { react: 18, think: 15, block: 0.5, read: 0.55, aa: 0.35, punish: 0.4, confirm: 0.45, tech: 0.25, aggro: 0.5, parry: 0.05, super: 0.6 },
  3: { react: 12, think: 10, block: 0.75, read: 0.75, aa: 0.6, punish: 0.7, confirm: 0.75, tech: 0.5, aggro: 0.6, parry: 0.12, super: 0.85 },
  4: { react: 8, think: 6, block: 0.9, read: 0.9, aa: 0.85, punish: 0.9, confirm: 0.92, tech: 0.75, aggro: 0.7, parry: 0.2, super: 1 },
};

export class AI {
  constructor(f, level) {
    this.f = f;
    this.level = Math.max(1, Math.min(4, level));
    this.p = LV[this.level];
    this.hist = [];
    this.thinkT = 20;
    this.plan = null;
    this.planT = 0;
    this.blockT = 0;
    this.blockLow = false;
    this.jumpHold = 0;
    this.walk = 0;
    this.lastOppState = '';
    this.mashT = 0;
    this.specs = f.def.specials;
  }

  r() {
    return Math.random();
  }
  spec(type) {
    const i = this.specs.findIndex((s) => (Array.isArray(type) ? type.includes(s.type) : s.type === type));
    return i < 0 ? null : this.specs[i];
  }

  wantTech() {
    return this.r() < this.p.tech / 6;
  }

  update(m) {
    const f = this.f;
    const o = f.opp;
    const inp = blankInput();
    // remember opponent snapshots for reaction delay
    this.hist.push({ state: o.state, phase: o.inMovePhase(), move: o.move, air: o.airborne, vy: o.vy, x: o.x });
    if (this.hist.length > 40) this.hist.shift();
    const seen = this.hist[Math.max(0, this.hist.length - 1 - this.p.react)] || this.hist[0];
    const dist = Math.abs(o.x - f.x);
    const toward = o.x > f.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';

    if (f.state === 'dizzy') {
      if (++this.mashT % 3 === 0) inp.press.lp = true;
      inp[this.mashT % 8 < 4 ? 'left' : 'right'] = true;
      return inp;
    }
    if (this.jumpHold > 0) {
      this.jumpHold--;
      inp.up = true;
      if (this.jumpDir) inp[this.jumpDir] = true;
    }

    // ---- defense ----
    const threat = this.threat(m, seen, dist);
    if (threat && this.blockT <= 0 && f.canBlock()) {
      if (this.r() < this.p.block) {
        this.blockT = 14;
        const low = threat.guard === 'low', high = threat.guard === 'high';
        this.blockLow = this.r() < this.p.read ? low : this.r() < 0.5;
        if (high && this.r() < this.p.read) this.blockLow = false;
      } else this.blockT = -10;
    }
    if (this.blockT > 0) {
      this.blockT--;
      inp[away] = true;
      if (this.blockLow) inp.down = true;
      // page security out of pressure
      if (f.state === 'blockstun' && f.gauge > 320 && this.r() < this.p.parry * 0.15) {
        inp[toward] = true;
        inp[away] = false;
        inp.press.parry = true;
      }
      if (f.state === 'blockstun' || threat) return inp;
    } else if (this.blockT < 0) this.blockT++;

    // ---- reactions ----
    if (f.canAct() && !f.aiAction) {
      // anti-air
      if (seen.air && seen.vy < 3 && dist < 110 && dist > 10 && this.r() < this.p.aa / 3) {
        const dp = this.spec(['rising', 'burst']) || null;
        if (dp && this.r() < 0.7) f.aiAction = { type: 'special', spec: dp, str: 2 };
        else f.aiAction = { type: 'normal', id: '2hp' };
      }
      // punish whiffs
      else if (o.state === 'attack' && seen.phase === 'recovery' && o.move && dist < 95 && this.r() < this.p.punish / 4) {
        if (f.meter >= 100 && this.r() < this.p.super * 0.5) f.aiAction = { type: 'super', level: this.superLevel() };
        else if (dist < 50) f.aiAction = { type: 'normal', id: '5hp', confirm: true };
        else f.aiAction = { type: 'normal', id: '5mk' };
      }
      // projectile coming: jump or parry
      else {
        const pr = m.projectiles.find((p) => p.owner === o && Math.abs(p.x - f.x) < 90 && Math.sign(p.vx) === Math.sign(f.x - p.x));
        if (pr && !pr.rain) {
          const rr = this.r();
          if (rr < this.p.parry * 2) f.aiAction = { type: 'parry', len: 30 };
          else if (rr < 0.3 + this.p.aggro * 0.3 && dist > 120) {
            this.jumpHold = 3;
            this.jumpDir = toward;
          }
        }
      }
    }
    // confirms: when our normal hit, cancel into special / super
    if (f.state === 'attack' && f.move && f.move.kind === 'normal' && f.move.hitConfirmed && !f.aiAction && f.move.def.cancel) {
      if (!this.confirmRolled) {
        this.confirmRolled = true;
        if (this.r() < this.p.confirm) {
          if (f.meter >= 100 && o.hp < o.maxHp * 0.35 && this.r() < this.p.super) f.aiAction = { type: 'super', level: this.superLevel() };
          else {
            const sp = this.spec(['rising', 'rush', 'spin', 'projectile', 'burst', 'strike', 'stretch']);
            if (sp) f.aiAction = { type: 'special', spec: sp, str: 2, ex: f.gauge > 400 && this.r() < 0.3 };
          }
        }
      }
    } else this.confirmRolled = false;
    // super cancel after special hit
    if (f.state === 'attack' && f.move && f.move.kind === 'special' && f.move.hitConfirmed && f.meter >= 100 && !f.aiAction && this.r() < this.p.super * 0.04) {
      f.aiAction = { type: 'super', level: this.superLevel() };
    }

    // ---- neutral plan ----
    if (--this.thinkT <= 0) {
      this.thinkT = this.p.think + Math.floor(this.r() * this.p.think);
      this.decide(m, dist, toward, away);
    }
    if (this.plan === 'forward') inp[toward] = true;
    else if (this.plan === 'back') inp[away] = true;
    else if (this.plan === 'crouch') inp.down = true;
    else if (this.plan === 'crouchback') {
      inp.down = true;
      inp[away] = true;
    }
    return inp;
  }

  superLevel() {
    const f = this.f;
    if (f.meter >= 300 && (f.hp < f.maxHp * 0.25 || this.r() < 0.5)) return 3;
    if (f.meter >= 200 && this.r() < 0.5) return 2;
    return 1;
  }

  threat(m, seen, dist) {
    const f = this.f;
    const o = f.opp;
    if (seen.state === 'attack' && seen.move && (seen.phase === 'startup' || seen.phase === 'active')) {
      const mv = seen.move;
      const reach = mv.kind === 'special' ? 220 : mv.kind === 'super' ? 400 : 90;
      if (dist < reach) {
        let guard = 'mid';
        if (mv.def) guard = mv.def.guard;
        if (mv.spec && mv.spec.guard) guard = mv.spec.guard;
        if (o.airborne) guard = 'high';
        if (mv.kind === 'throw') return null;
        return { guard };
      }
    }
    if (seen.air && dist < 90 && seen.vy < 0) return { guard: 'high' };
    const pr = m.projectiles.find((p) => p.owner === o && Math.abs(p.x - f.x) < 70);
    if (pr) return { guard: pr.guardOverride || 'mid' };
    for (const ob of m.objects) if (ob.owner === o && (ob.kind === 'beam' || ob.kind === 'zone') && ob.t >= (ob.delay || 0) - 6) return { guard: 'mid' };
    return null;
  }

  decide(m, dist, toward, away) {
    const f = this.f;
    const o = f.opp;
    const p = this.p;
    const r = this.r();
    this.plan = null;
    if (!f.canAct()) return;
    const proj = this.spec('projectile') || this.spec('beam');
    const grab = this.spec('grab');
    const rush = this.spec(['rush', 'dive', 'stomp']);
    const lowHp = f.hp < f.maxHp * 0.25;
    // super when safe-ish
    if (f.meter >= 300 && lowHp && dist < 120 && r < p.super * 0.3) {
      f.aiAction = { type: 'super', level: 3 };
      return;
    }
    if (o.state === 'knockdown' || o.state === 'getup') {
      if (dist > 70) this.plan = 'forward';
      else if (r < 0.06) f.aiAction = { type: 'taunt' };
      return;
    }
    if (dist > 170) {
      if (proj && f.proj === 0 && r < 0.45) f.aiAction = { type: 'special', spec: proj, str: Math.floor(this.r() * 3) };
      else if (r < 0.15 + p.aggro * 0.15) f.aiAction = { type: 'dash', dir: 1 };
      else if (rush && r < 0.25 && dist < 230) f.aiAction = { type: 'special', spec: rush, str: 2 };
      else this.plan = 'forward';
    } else if (dist > 75) {
      if (r < 0.2 * p.aggro) {
        this.jumpHold = 3;
        this.jumpDir = toward;
        this.pendingAir = true;
      } else if (r < 0.42) f.aiAction = { type: 'normal', id: this.r() < 0.5 ? '5mk' : '2mk' };
      else if (proj && f.proj === 0 && r < 0.6) f.aiAction = { type: 'special', spec: proj, str: Math.floor(this.r() * 3) };
      else if (r < 0.68 && f.gauge > 300 && this.level >= 2 && this.r() < 0.25) f.aiAction = { type: 'impact' };
      else if (r < 0.8) this.plan = 'forward';
      else this.plan = this.r() < 0.5 ? 'back' : 'crouchback';
    } else {
      // close range
      if (grab && r < 0.22) f.aiAction = { type: 'special', spec: grab, str: 1 };
      else if (r < 0.18) f.aiAction = { type: 'throw', back: this.r() < 0.3 };
      else if (r < 0.5 * p.aggro + 0.15) {
        const opts = ['5lp', '2lk', '2lp', '5mp', '2mp', '5hp', '2hk', '5lk'];
        f.aiAction = { type: 'normal', id: opts[Math.floor(this.r() * opts.length)] };
      } else if (r < 0.62) this.plan = 'crouchback';
      else if (r < 0.7) {
        this.jumpHold = 3;
        this.jumpDir = away;
      } else if (r < 0.76 && f.gauge > 200) f.aiAction = { type: 'parry', len: 18 };
      else this.plan = this.r() < 0.5 ? 'back' : 'forward';
    }
  }
}
