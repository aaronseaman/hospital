// Hospital Cup broadcast booth: event-driven play-by-play + color commentary ticker.
import { drawText, wrapText, measureText } from './font.js';
import { rect } from './fx.js';

const PBP = 'DR. PLAY-BY-PLAY';
const COLOR = 'COLOR ANALYST (NOT AN ADMIN)';

const LINES = {
  start: ['WELCOME TO THE HOSPITAL CUP, LIVE FROM GRAND ROUNDS!', 'BOTH FIGHTERS ARE ON HOUR 26 OF THEIR SHIFT.', 'THE ATTENDANCE TODAY: ONE INTERN AND A VENDING MACHINE.'],
  combo: ['THAT COMBO IS BILLABLE!', 'LOOK AT THAT CHART NOTE!', 'THAT DAMAGE HAS BEEN UPCODED!', 'SOMEONE PAGE THE ATTENDING!'],
  super: ['HERE COMES THE SUPER! CALL RISK MANAGEMENT!', 'THAT ONE IS GOING ON THE INVOICE!', 'OH THE CO-PAY ON THAT!'],
  perfect: ['TEXTBOOK HAND HYGIENE! JCAHO WOULD WEEP.', 'TWENTY SECONDS OF SCRUBBING. ZERO DAMAGE.'],
  punish: ['MALPRACTICE! I AM CALLING MY LAWYER.', 'THAT IS A REPORTABLE EVENT, FOLKS!'],
  lowhp: ['STABILITY IS CRASHING! GET THE CART!', 'THE VITALS ARE TANKING!', 'SOMEBODY START COMPRESSIONS!'],
  tech: ['SECOND OPINION! WHAT A READ!', 'DENIED! GET A SECOND OPINION!'],
  burnout: ['CLASSIC CHARTING BURNOUT.', 'NOBODY TAUGHT THEM WORK-LIFE BALANCE.'],
  dizzy: ['OVERWHELMED! LOOK AT THOSE TINY INSURANCE LOGOS!', 'THEY ARE SEEING STARS AND PRIOR AUTH FORMS!'],
  impact: ['CLIPBOARD TO THE FACE! OLD SCHOOL!', 'CHART IMPACT! THE PAPERWORK HITS BACK!'],
  timelow: ['THE SHIFT IS ALMOST OVER! NOBODY CLOCK OUT!', 'TEN SECONDS TO HANDOFF!'],
  color: ['FROM A COST PERSPECTIVE, THIS IS FINE.', 'HAVE WE CONSIDERED OUTSOURCING THE PUNCHES?', 'I WOULD LIKE TO SEE MORE SYNERGY HERE.', 'I AM NOT AN ADMINISTRATOR. I JUST LOVE SPREADSHEETS.', 'EVERY HIT IS A LINE ITEM, JIM.', 'SHOULD HAVE TAKEN THE PIZZA PARTY INSTEAD.', 'LET US CIRCLE BACK ON THAT UPPERCUT.'],
};

export class Commentary {
  constructor() {
    this.cur = null;
    this.queue = [];
    this.cool = 0;
    this.used = new Set();
    this.enabled = true;
  }
  pick(list) {
    const fresh = list.filter((l) => !this.used.has(l));
    const l = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))];
    this.used.add(l);
    return l;
  }
  event(kind, force) {
    if (!this.enabled || !LINES[kind]) return;
    if (this.cool > 0 && !force) return;
    this.queue = [{ who: PBP, text: this.pick(LINES[kind]), t: 0 }];
    if (Math.random() < 0.4) this.queue.push({ who: COLOR, text: this.pick(LINES.color), t: 0, delay: 20 });
    this.cool = 360;
    this.next();
  }
  next() {
    this.cur = this.queue.shift() || null;
  }
  update() {
    if (this.cool > 0) this.cool--;
    if (this.cur) {
      this.cur.t++;
      if (this.cur.t > 170) this.next();
    }
  }
  draw(g, W, H, y) {
    const c = this.cur;
    if (!c || !this.enabled) return;
    const k = c.t < 8 ? c.t / 8 : c.t > 160 ? (170 - c.t) / 10 : 1;
    const maxW = Math.max(110, Math.min(160, W - 258));
    const lines = wrapText(c.text, maxW, { font: 'small' });
    const shown = Math.min(c.text.length, Math.floor(c.t * 1.5));
    const w = Math.max(maxW, measureText(c.who, { font: 'small' }).w) + 8;
    const h = 9 + lines.length * 6;
    const x = Math.round(W / 2 - w / 2);
    g.globalAlpha = Math.max(0, k) * 0.85;
    rect(g, x, y, w, h, '#0a0614');
    rect(g, x, y, w, 1, c.who === PBP ? '#40c0ff' : '#ff8040');
    g.globalAlpha = Math.max(0, k);
    drawText(g, c.who, x + 4, y + 2, { font: 'small', color: c.who === PBP ? '#80d8ff' : '#ffa060' });
    let n = shown;
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, n));
      n -= l.length + 1;
      drawText(g, part, x + 4, y + 9 + i * 6, { font: 'small', color: '#ffffff' });
    });
    g.globalAlpha = 1;
  }
}
