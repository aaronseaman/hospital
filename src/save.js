// Persistent settings, career stats, daily Orders and unlocks (localStorage, fail-safe).
import { FIGHTERS } from './fighters.js';

const KEY = 'hospital-fighter-save-v1';

export const RANKS = [
  { name: 'INTERN', wins: 0 },
  { name: 'RESIDENT', wins: 5 },
  { name: 'FELLOW', wins: 15 },
  { name: 'ATTENDING', wins: 35 },
  { name: 'CHIEF', wins: 70 },
];

const DEFAULTS = {
  settings: {
    scheme1: 'auto', scheme2: 'classic', touchScheme: 'modern', difficulty: 2, rounds: 2, timer: 99,
    music: 0.7, sfx: 0.8, announcer: true, shake: true, hazards: true, crt: false, contrast: false, callouts: true, commentary: true, touchControls: 'auto',
  },
  stats: { matches: 0, wins: 0, losses: 0, supers: 0, perfects: 0, parries: 0, counters: 0, throws: 0, byFighter: {}, cleared: 0, clearedBy: {} },
  copays: 100,
  orders: { day: '', list: [] },
  seenIntro: false,
};

const ORDER_POOL = [
  { id: 'wins', text: 'WIN {n} MATCHES', n: 3, reward: 150 },
  { id: 'winAs', text: 'WIN {n} MATCHES AS {f}', n: 2, reward: 200 },
  { id: 'counters', text: 'LAND {n} DEFIB COUNTERS', n: 10, reward: 120 },
  { id: 'supers', text: 'LAND {n} SUPERS', n: 3, reward: 150 },
  { id: 'parries', text: 'PERFORM {n} HAND HYGIENES', n: 15, reward: 100 },
  { id: 'perfects', text: 'GET {n} PERFECT HAND HYGIENES', n: 3, reward: 200 },
  { id: 'throws', text: 'GURNEY TOSS {n} OPPONENTS', n: 5, reward: 120 },
  { id: 'impacts', text: 'LAND {n} CHART IMPACTS', n: 4, reward: 120 },
  { id: 'combo', text: 'LAND A {n}-HIT COMBO', n: 5, reward: 180 },
  { id: 'punishes', text: 'LAND {n} MALPRACTICE COUNTERS', n: 5, reward: 150 },
  { id: 'specials', text: 'USE {n} SPECIAL MOVES', n: 30, reward: 100 },
];

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function seeded(seed) {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const Save = {
  data: null,
  load() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (_) {
      d = null;
    }
    this.data = Object.assign({}, structuredCloneSafe(DEFAULTS), d || {});
    this.data.settings = Object.assign({}, DEFAULTS.settings, (d && d.settings) || {});
    this.data.stats = Object.assign({}, structuredCloneSafe(DEFAULTS.stats), (d && d.stats) || {});
    this.refreshOrders();
    return this.data;
  },
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (_) { /* private mode etc. */ }
  },
  get settings() {
    return this.data.settings;
  },
  reset() {
    this.data = structuredCloneSafe(DEFAULTS);
    this.refreshOrders();
    this.save();
  },
  rank() {
    const w = this.data.stats.wins;
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (w >= RANKS[i].wins) idx = i;
    const next = RANKS[idx + 1];
    return { idx, name: RANKS[idx].name, next: next ? next.name : null, toNext: next ? next.wins - w : 0 };
  },
  unlocked(what) {
    if (what === 'morgue') return this.data.stats.cleared > 0 || this.data.stats.wins >= 10;
    return true;
  },
  refreshOrders() {
    const day = today();
    if (this.data.orders && this.data.orders.day === day && this.data.orders.list.length) return;
    const rnd = seeded(day);
    const pool = ORDER_POOL.slice();
    const list = [];
    while (list.length < 3 && pool.length) {
      const o = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const f = FIGHTERS[Math.floor(rnd() * FIGHTERS.length)];
      list.push({ id: o.id, text: o.text.replace('{n}', o.n).replace('{f}', f.short), n: o.n, fighter: f.id, reward: o.reward, prog: 0, done: false });
    }
    this.data.orders = { day, list };
    this.save();
  },
  // record a finished match. me = result.fighters[side]; returns {copays, completed: [orders]}
  recordMatch(result, side, opts = {}) {
    const st = this.data.stats;
    const me = result.fighters[side];
    const won = result.winner === side;
    st.matches++;
    if (won) st.wins++;
    else st.losses++;
    st.byFighter[me.id] = st.byFighter[me.id] || { w: 0, l: 0 };
    st.byFighter[me.id][won ? 'w' : 'l']++;
    st.supers += me.stats.supers;
    st.parries += me.stats.parries;
    st.perfects += me.stats.perfects;
    st.counters += me.stats.counters;
    st.throws += me.stats.throws;
    let copays = won ? 25 : 5;
    const completed = [];
    this.refreshOrders();
    for (const o of this.data.orders.list) {
      if (o.done) continue;
      const s = me.stats;
      let add = 0;
      switch (o.id) {
        case 'wins': add = won ? 1 : 0; break;
        case 'winAs': add = won && me.id === o.fighter ? 1 : 0; break;
        case 'counters': add = s.counters; break;
        case 'supers': add = s.supers; break;
        case 'parries': add = s.parries; break;
        case 'perfects': add = s.perfects; break;
        case 'throws': add = s.throws; break;
        case 'impacts': add = s.impacts; break;
        case 'combo': if (s.maxCombo >= o.n) add = o.n; break;
        case 'punishes': add = s.punishes; break;
        case 'specials': add = s.specials; break;
      }
      o.prog = Math.min(o.n, o.prog + add);
      if (o.prog >= o.n) {
        o.done = true;
        copays += o.reward;
        completed.push(o);
      }
    }
    if (opts.cleared) {
      st.cleared++;
      st.clearedBy[me.id] = true;
      copays += 500;
    }
    this.data.copays += copays;
    this.save();
    return { copays, completed, won };
  },
};

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}
