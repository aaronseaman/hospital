// In-fight HUD: Patient Stability bars, Shift Timer, Chart Gauge, Adrenaline Meter, combos, popups.
import { drawText, measureText } from './font.js';
import { rect, fillPoly, line } from './fx.js';
import { getPortrait } from './sprites.js';

const O = '#140c1c';

export function drawHUD(g, m, W, H) {
  const [a, b] = m.fighters;
  const cx = Math.round(W / 2);
  const touch = m.settings.touch;
  const hc = m.settings.contrast;
  const barW = cx - 22 - 30;
  drawSide(g, m, a, 0, W, cx, barW, hc, touch);
  drawSide(g, m, b, 1, W, cx, barW, hc, touch);
  // timer
  rect(g, cx - 17, 2, 34, 26, O);
  rect(g, cx - 16, 3, 32, 24, '#2a1c3a');
  rect(g, cx - 16, 3, 32, 1, '#5a4a70');
  drawText(g, 'SHIFT', cx, 5, { font: 'small', color: '#a090c0', align: 'center' });
  const tv = m.timer === Infinity ? '--' : String(Math.max(0, m.timer)).padStart(2, '0');
  const low = m.timer !== Infinity && m.timer <= 10;
  drawText(g, tv, cx, 12, { scale: 2, color: low && m.frame % 30 < 15 ? '#ff4040' : '#ffffff', gradient: low ? null : ['#ffffff', '#ffffff', '#fff0b0', '#ffe080', '#ffd040', '#f0b020', '#e09010'] });
  // round markers
  for (let s = 0; s < 2; s++) {
    const f = m.fighters[s];
    for (let i = 0; i < m.roundsToWin; i++) {
      const won = i < f.roundsWon;
      const x = s === 0 ? cx - 10 - i * 10 : cx + 5 + i * 10;
      drawCross(g, x, 34, won);
    }
  }
  // combo counters
  for (const f of m.fighters) {
    const d = f.opp;
    if (d.comboHits >= 2 && (m.frame - d.lastHitT < 70 || ['hitstun', 'airhit', 'crumple', 'dizzy', 'cinema'].includes(d.state))) {
      const x = f.side === 0 ? 8 : W - 8;
      const al = f.side === 0 ? 'left' : 'right';
      const y = touch ? 74 : 66;
      drawText(g, String(d.comboHits), x, y, { scale: 3, color: '#ffe040', outline: O, align: al, gradient: ['#ffffff', '#fff8b0', '#ffe060', '#ffc020', '#ff9010', '#ff6010', '#e04010'] });
      const nw = measureText(String(d.comboHits), { scale: 3 }).w;
      drawText(g, 'HIT', f.side === 0 ? x + nw + 3 : x - nw - 3, y + 2, { color: '#ffffff', outline: O, align: al });
      drawText(g, 'COMBO', f.side === 0 ? x + nw + 3 : x - nw - 3, y + 11, { font: 'small', color: '#ffd080', outline: O, align: al });
      drawText(g, d.comboDmg + ' DMG', x, y + 24, { font: 'small', color: '#c0c0d0', outline: O, align: al });
    }
  }
  // side popups
  for (let s = 0; s < 2; s++) {
    m.popups[s].forEach((p, i) => {
      const x = s === 0 ? 8 : W - 8;
      const y = (touch ? 50 : 42) + i * 9;
      const k = p.t < 6 ? p.t / 6 : p.t > 66 ? (80 - p.t) / 14 : 1;
      const slide = Math.round((1 - Math.min(1, p.t / 5)) * 30) * (s === 0 ? -1 : 1);
      drawText(g, p.text, x + slide, y, { color: p.color, outline: O, align: s === 0 ? 'left' : 'right', alpha: k });
    });
  }
  if (m.training) drawTraining(g, m, W, H);
}

function drawSide(g, m, f, side, W, cx, barW, hc, touch) {
  const left = side === 0;
  const x0 = left ? 30 : cx + 22;
  const y = 11;
  // portrait
  const por = getPortrait(f.look, 'idle1', 22, 22);
  const px = left ? 4 : W - 26;
  rect(g, px - 1, 2, 24, 24, O);
  rect(g, px, 3, 22, 22, f.def.color);
  g.save();
  if (!left) {
    g.translate(px + 22, 3);
    g.scale(-1, 1);
    g.drawImage(por, 0, 0);
  } else g.drawImage(por, px, 3);
  g.restore();
  if (f.hp <= 0) {
    g.globalAlpha = 0.5;
    rect(g, px, 3, 22, 22, '#2040ff');
    g.globalAlpha = 1;
  }
  // name
  drawText(g, f.def.short, left ? x0 : x0 + barW, 3, { font: 'small', color: '#ffffff', outline: O, align: left ? 'left' : 'right' });
  if (f.ctrl === 'cpu') drawText(g, 'CPU', left ? x0 + barW : x0, 3, { font: 'small', color: '#a0a0c0', outline: O, align: left ? 'right' : 'left' });
  // health bar
  rect(g, x0 - 1, y - 1, barW + 2, 10, O);
  rect(g, x0, y, barW, 8, '#3a0a18');
  const hpW = Math.round((f.hp / f.maxHp) * barW);
  const redW = Math.round((f.redHp / f.maxHp) * barW);
  const lowHp = f.hp / f.maxHp <= 0.25;
  const pulse = lowHp && m.frame % 20 < 10;
  const main = hc ? '#40ff40' : pulse ? '#ff8030' : lowHp ? '#ffb020' : '#ffd820';
  const hi = hc ? '#c0ffc0' : '#fff6a0';
  const trail = hc ? '#ff00ff' : '#e02838';
  if (left) {
    rect(g, x0 + barW - redW, y, redW, 8, trail);
    rect(g, x0 + barW - hpW, y, hpW, 8, main);
    rect(g, x0 + barW - hpW, y, hpW, 2, hi);
    rect(g, x0 + barW - hpW, y + 6, hpW, 2, hc ? '#20a020' : '#d8a010');
  } else {
    rect(g, x0, y, redW, 8, trail);
    rect(g, x0, y, hpW, 8, main);
    rect(g, x0, y, hpW, 2, hi);
    rect(g, x0, y + 6, hpW, 2, hc ? '#20a020' : '#d8a010');
  }
  // ekg glyph on bar end
  const ex = left ? x0 + 2 : x0 + barW - 14;
  const beat = (m.frame * (lowHp ? 3 : 1.4)) % 60;
  const pts = [[0, 4], [3, 4], [4, beat < 10 ? 0 : 3], [6, beat < 10 ? 8 : 5], [7, 4], [12, 4]];
  for (let i = 0; i < pts.length - 1; i++) line(g, ex + pts[i][0], y + pts[i][1], ex + pts[i + 1][0], y + pts[i + 1][1], 'rgba(60,10,20,0.7)');
  // chart gauge (6 segments)
  const gy = y + 11;
  const segW = Math.floor((barW * 0.62 - 5) / 6);
  const gx0 = left ? x0 + barW - segW * 6 - 5 : x0;
  drawText(g, 'CHART', left ? gx0 - 3 : gx0 + segW * 6 + 8, gy, { font: 'small', color: f.burnout ? '#808080' : '#80d0ff', outline: O, align: left ? 'right' : 'left' });
  for (let i = 0; i < 6; i++) {
    const idx = left ? 5 - i : i;
    const sx = gx0 + i * (segW + 1);
    rect(g, sx - 1, gy - 1, segW + 2, 6, O);
    rect(g, sx, gy, segW, 4, '#102030');
    const fill = Math.max(0, Math.min(1, (f.gauge - idx * 100) / 100));
    if (fill > 0) {
      const w = Math.round(segW * fill);
      const col = f.burnout ? '#707070' : fill >= 1 ? (hc ? '#00e0ff' : '#40c8ff') : '#2878a8';
      if (left) rect(g, sx + segW - w, gy, w, 4, col);
      else rect(g, sx, gy, w, 4, col);
      if (fill >= 1 && !f.burnout) rect(g, sx, gy, segW, 1, '#c0f0ff');
    }
  }
  if (f.burnout && m.frame % 30 < 20) drawText(g, 'BURNOUT', gx0 + segW * 3 + 2, gy - 1, { font: 'small', color: '#ffffff', outline: '#600000', align: 'center' });
  // stun meter (thin)
  if (f.stun > 20 && f.state !== 'dizzy') {
    const sw = Math.round(Math.min(1, f.stun / 520) * (segW * 6 + 5));
    rect(g, left ? gx0 + segW * 6 + 5 - sw : gx0, gy + 6, sw, 1, '#ff6080');
  }
  // adrenaline meter
  const ay = touch ? gy + 9 : 200;
  const aw = touch ? 20 : 30;
  const ax0 = touch ? (left ? x0 : x0 + barW - aw * 3 - 2) : left ? 30 : W - 30 - aw * 3 - 2;
  const bars = Math.floor(f.meter / 100);
  const label = touch ? '' : 'ADRENALINE';
  for (let i = 0; i < 3; i++) {
    const idx = left ? i : 2 - i;
    const sx = ax0 + i * (aw + 1);
    rect(g, sx - 1, ay - 1, aw + 2, 6, O);
    rect(g, sx, ay, aw, 4, '#201030');
    const fill = Math.max(0, Math.min(1, (f.meter - idx * 100) / 100));
    if (fill > 0) {
      const w = Math.round(aw * fill);
      const full = fill >= 1;
      const col = full ? (m.frame % 20 < 10 ? '#ff60e0' : '#ff90f0') : '#9040a0';
      if (left) rect(g, sx, ay, w, 4, col);
      else rect(g, sx + aw - w, ay, w, 4, col);
    }
  }
  const nx = left ? (touch ? ax0 + aw * 3 + 6 : 6) : touch ? ax0 - 8 : W - 14;
  drawText(g, String(bars), nx, ay - (touch ? 1 : 3), { font: touch ? 'small' : 'big', color: bars ? '#ff80f0' : '#806080', outline: O });
  if (label) drawText(g, label, left ? ax0 : ax0 + aw * 3 + 2, ay - 8, { font: 'small', color: '#e0a0ff', outline: O, align: left ? 'left' : 'right' });
  if (f.hp <= f.maxHp * 0.25 && f.meter >= 300 && m.frame % 30 < 20) {
    drawText(g, 'CRITICAL CARE READY', left ? ax0 : ax0 + aw * 3 + 2, ay + (touch ? 7 : -16), { font: 'small', color: '#ff4060', outline: O, align: left ? 'left' : 'right' });
  }
}

function drawCross(g, x, y, on) {
  rect(g, x - 1, y - 4, 7, 9, O);
  rect(g, x - 3, y - 2, 11, 5, O);
  const c = on ? '#ff3040' : '#3a2a40';
  rect(g, x + 1, y - 3, 3, 7, c);
  rect(g, x - 2, y - 1, 9, 3, c);
  if (on) rect(g, x + 1, y - 3, 1, 2, '#ffa0a0');
}

function drawTraining(g, m, W, H) {
  const [a, b] = m.fighters;
  const y = m.settings.touch ? 88 : 40;
  const lines = [
    'DUMMY: ' + m.training.dummy.toUpperCase(),
    'COMBO DMG: ' + (b.comboDmg || m.lastComboDmg || 0),
    'STUN: ' + Math.round(b.stun),
  ];
  if (b.comboDmg) m.lastComboDmg = b.comboDmg;
  lines.forEach((l, i) => drawText(g, l, W - 6, y + i * 7, { font: 'small', color: '#c0ffc0', outline: O, align: 'right' }));
  // input history for P1
  const hist = a.dirHist.slice(-8).reverse();
  const arrows = { 1: '{|', 2: '|', 3: '}|', 4: '{', 5: '*', 6: '}', 7: '{^', 8: '^', 9: '}^' };
  hist.forEach((h, i) => {
    let d = h.d;
    if (a.facing < 0) d = d % 3 === 1 ? d + 2 : d % 3 === 0 ? d - 2 : d;
    drawText(g, arrows[d] || '', 6, y + i * 8, { font: 'small', color: i === 0 ? '#ffffff' : '#8090a0', outline: O });
  });
}
