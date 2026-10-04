// Skeleton + pose library. All fighters share these poses; per-fighter "look" scales the bones.
// Angles are absolute degrees measured from straight DOWN, rotating toward the facing direction.
//   0 = down, 90 = forward, 180 = up, -90 = backward.
// Torso `t` is lean from vertical (positive = forward). Coordinates: x forward, y up, origin at feet.

const D2R = Math.PI / 180;
const dir = (a) => [Math.sin(a * D2R), -Math.cos(a * D2R)];

const STANCE = { fl: [38, 8], bl: [-20, -44] };
const GUARD = { fa: [48, 152], ba: [28, 142] };
const CROUCH_LEGS = { fl: [86, -4], bl: [52, -92] };

function P(o) {
  return Object.assign({ t: 8, h: 0 }, STANCE, GUARD, o);
}

export const POSES = {
  // --- neutral ---
  idle1: P({ t: 8 }),
  idle2: P({ t: 9, fa: [50, 150], ba: [30, 140], fl: [41, 6], bl: [-18, -46] }),
  idle3: P({ t: 10, fa: [52, 148], ba: [32, 138], fl: [44, 4], bl: [-16, -48] }),
  walk1: P({ t: 10, fl: [32, 8], bl: [-18, -34] }),
  walk2: P({ t: 11, fl: [12, -14], bl: [8, -24], fa: [50, 150] }),
  walk3: P({ t: 10, fl: [-12, -36], bl: [30, 6], fa: [46, 154] }),
  walk4: P({ t: 11, fl: [8, -24], bl: [12, -14], fa: [50, 150] }),
  crouch: P({ t: 26, ...CROUCH_LEGS, fa: [56, 146], ba: [36, 136], h: 6 }),
  crouchHalf: P({ t: 18, fl: [60, 0], bl: [16, -60] }),
  jumpSquat: P({ t: 16, fl: [56, 2], bl: [4, -56], fa: [40, 130], ba: [20, 120] }),
  jumpUp: P({ t: 4, fl: [70, -10], bl: [20, -50], fa: [120, 160], ba: [100, 150] }),
  jumpTop: P({ t: 6, fl: [96, -20], bl: [70, -40], fa: [70, 150], ba: [50, 140] }),
  jumpFall: P({ t: 2, fl: [30, 0], bl: [-6, -30], fa: [100, 150], ba: [80, 130] }),
  tuck1: P({ t: 40, fl: [120, 0], bl: [110, -10], fa: [100, 30], ba: [90, 20], h: 10 }),
  tuck2: P({ t: 70, fl: [150, 40], bl: [140, 30], fa: [130, 60], ba: [120, 50], h: 20 }),
  dash: P({ t: 30, fl: [60, -10], bl: [-40, -70], fa: [70, 140], ba: [-30, 40] }),
  backdash: P({ t: -16, fl: [40, 20], bl: [-30, -10], fa: [30, 120], ba: [10, 100] }),
  sprint1: P({ t: 34, fl: [70, 0], bl: [-50, -100], fa: [40, 120], ba: [-60, 20] }),
  sprint2: P({ t: 34, fl: [-30, -90], bl: [60, 0], fa: [-50, 30], ba: [50, 130] }),

  // --- standing normals ---
  lpW: P({ t: 10, fa: [60, 130] }),
  lpA: P({ t: 14, fa: [92, 92], ba: [30, 145], fl: [34, 6] }),
  mpW: P({ t: 6, ba: [-10, 100], fa: [60, 150] }),
  mpA: P({ t: 20, ba: [90, 90], fa: [40, 140], fl: [38, 4], bl: [-20, -40] }),
  hpW: P({ t: -4, ba: [-50, 10], fa: [70, 150], fl: [26, 8] }),
  hpA: P({ t: 24, ba: [112, 125], fa: [30, 120], fl: [42, 4], bl: [-26, -44], face: 'yell' }),
  hpR: P({ t: 18, ba: [80, 140], fa: [40, 140] }),
  lkW: P({ t: 2, fl: [55, -20] }),
  lkA: P({ t: -4, fl: [78, 84], bl: [-6, -16], fa: [50, 150], ba: [10, 120], point: 1 }),
  mkW: P({ t: -6, fl: [70, -30], bl: [-4, -10] }),
  mkA: P({ t: -16, fl: [96, 96], bl: [-6, -12], fa: [40, 150], ba: [-10, 110], point: 1 }),
  hkW: P({ t: -10, fl: [90, -10], bl: [-2, -8], fa: [70, 160], ba: [-20, 90] }),
  hkA: P({ t: -28, fl: [126, 120], bl: [-8, -12], fa: [20, 120], ba: [-40, 60], point: 1, face: 'yell' }),
  hkR: P({ t: -10, fl: [80, 20], bl: [-4, -10] }),

  // --- crouching normals ---
  clpA: P({ t: 26, ...CROUCH_LEGS, fa: [90, 92], ba: [36, 136], h: 6 }),
  cmpA: P({ t: 30, ...CROUCH_LEGS, ba: [88, 92], fa: [50, 140], h: 6 }),
  chpW: P({ t: 30, ...CROUCH_LEGS, ba: [-20, 60], fa: [56, 146] }),
  chpA: P({ t: 2, fl: [70, 0], bl: [20, -60], ba: [160, 178], fa: [40, 130], face: 'yell' }),
  clkA: P({ t: 22, fl: [84, 90], bl: [52, -92], fa: [56, 146], ba: [36, 136], point: 1, h: 6 }),
  cmkA: P({ t: 10, fl: [88, 94], bl: [56, -96], fa: [60, 140], ba: [20, 120], point: 1, h: 4 }),
  chkW: P({ t: 34, fl: [70, -20], bl: [60, -100], fa: [70, 90], ba: [40, 70] }),
  chkA: P({ t: 40, fl: [90, 92], bl: [60, -100], fa: [-10, -40], ba: [10, 60], point: 1, face: 'yell' }),

  // --- jumping normals ---
  jlpA: P({ t: 18, fl: [80, -10], bl: [40, -50], fa: [62, 56], ba: [40, 120] }),
  jhpA: P({ t: 30, fl: [70, 0], bl: [20, -50], ba: [70, 50], fa: [40, 130], face: 'yell' }),
  jlkA: P({ t: -10, fl: [84, 60], bl: [70, -40], fa: [80, 150], ba: [40, 130], point: 1 }),
  jhkA: P({ t: -24, fl: [74, 72], bl: [30, -40], fa: [130, 170], ba: [-30, 60], point: 1, face: 'yell' }),

  // --- specials ---
  projW: P({ t: -6, fa: [-30, 30], ba: [-40, 20], fl: [36, 4], bl: [-20, -40] }),
  projA: P({ t: 22, fa: [88, 90], ba: [80, 86], fl: [46, 2], bl: [-30, -54], open: 1, face: 'yell' }),
  projR: P({ t: 16, fa: [80, 100], ba: [70, 96], fl: [42, 4], bl: [-26, -50], open: 1 }),
  castA: P({ t: 18, fa: [96, 96], ba: [-30, 40], fl: [44, 4], bl: [-26, -50], open: 1, face: 'yell' }),
  lobW: P({ t: -12, ba: [-150, -110], fa: [60, 150], fl: [30, 6], bl: [-20, -40] }),
  lobA: P({ t: 20, ba: [120, 130], fa: [40, 130], fl: [44, 4], bl: [-28, -50], open: 1 }),
  upW: P({ t: 30, ...CROUCH_LEGS, fa: [20, 60], ba: [40, 130] }),
  upA: P({ t: -4, fl: [84, -4], bl: [-2, -10], fa: [172, 176], ba: [20, 120], face: 'yell' }),
  upR: P({ t: 0, fl: [60, -10], bl: [10, -30], fa: [150, 170], ba: [40, 120] }),
  spin1: P({ t: 0, fl: [92, 92], bl: [70, -40], fa: [100, 100], ba: [-80, -80], point: 1 }),
  spin2: P({ t: 0, fl: [70, -40], bl: [-92, -92], fa: [-80, -80], ba: [100, 100], point: 1 }),
  rush: P({ t: 36, fa: [92, 94], ba: [-40, 30], fl: [64, 0], bl: [-46, -80], face: 'yell' }),
  slide: P({ t: -64, fl: [84, 90], bl: [40, -30], fa: [-40, -60], ba: [-60, -80], point: 1 }),
  stance: P({ t: 0, fa: [30, 150], ba: [40, 155], fl: [16, 4], bl: [-10, -20], open: 1, face: 'calm' }),
  pray: P({ t: 10, fa: [40, 165], ba: [44, 168], fl: [80, 0], bl: [40, -90], open: 1, face: 'calm' }),
  grab: P({ t: 18, fa: [82, 86], ba: [74, 80], fl: [40, 4], bl: [-24, -46], open: 1 }),
  liftA: P({ t: -10, fa: [160, 170], ba: [150, 165], fl: [24, 6], bl: [-14, -30], open: 1, face: 'yell' }),
  slamA: P({ t: 40, fa: [70, 40], ba: [60, 30], fl: [60, -10], bl: [-30, -70], face: 'yell' }),
  lariat1: P({ t: 0, fa: [92, 92], ba: [-92, -92], fl: [20, 4], bl: [-16, -20], open: 1, face: 'yell' }),
  lariat2: P({ t: 0, fa: [-92, -92], ba: [92, 92], fl: [-10, -20], bl: [20, 4], open: 1, face: 'yell' }),
  stretchA: P({ t: 22, fa: [90, 90], ba: [-30, 40], fl: [44, 4], bl: [-26, -50], reach: 2.6, face: 'yell' }),
  stretchKA: P({ t: -20, fl: [94, 94], bl: [-6, -12], fa: [40, 150], ba: [-10, 110], point: 1, legReach: 2.2 }),
  dive: P({ t: 70, fa: [130, 130], ba: [120, 120], fl: [-20, -40], bl: [-40, -60], face: 'yell' }),
  hop: P({ t: -10, fl: [60, 40], bl: [40, -30], fa: [160, 170], ba: [130, 150], open: 1 }),
  stomp: P({ t: 0, fl: [10, 0], bl: [60, -40], fa: [140, 150], ba: [120, 140], point: 1 }),
  beamA: P({ t: 10, fa: [92, 92], ba: [86, 88], fl: [40, 4], bl: [-24, -46], open: 1, face: 'yell' }),
  tauntA: P({ t: 4, fa: [70, 168], ba: [10, 30], fl: [16, 4], bl: [-10, -16], h: 14, face: 'bored' }),
  tauntB: P({ t: -4, fa: [30, 170], ba: [-10, 10], fl: [16, 4], bl: [-10, -16], h: -10, face: 'smug' }),
  introA: P({ t: 0, fa: [60, 170], ba: [50, 165], fl: [14, 2], bl: [-10, -14], face: 'smug' }),

  // --- system ---
  block: P({ t: -6, fa: [56, 166], ba: [44, 160], fl: [26, 4], bl: [-18, -36], face: 'hurt' }),
  crouchBlock: P({ t: 18, ...CROUCH_LEGS, fa: [60, 168], ba: [48, 162], face: 'hurt', h: 4 }),
  parry: P({ t: 2, fa: [50, 120], ba: [56, 116], fl: [24, 4], bl: [-14, -30], open: 1, face: 'calm' }),
  impactW: P({ t: -18, ba: [-170, -150], fa: [60, 150], fl: [24, 8], bl: [-22, -34], prop: 'clipboard', face: 'yell' }),
  impactA: P({ t: 32, ba: [84, 70], fa: [30, 110], fl: [50, 0], bl: [-36, -62], prop: 'clipboard', face: 'yell' }),
  hitHigh: P({ t: -22, fa: [-20, -50], ba: [-40, -70], fl: [20, 0], bl: [-30, -40], h: -16, face: 'hurt' }),
  hitHigh2: P({ t: -30, fa: [-40, -80], ba: [-50, -90], fl: [16, -4], bl: [-34, -44], h: -20, face: 'hurt' }),
  hitLow: P({ t: 40, fa: [10, 40], ba: [-10, 20], fl: [20, -10], bl: [-24, -40], h: 16, face: 'hurt' }),
  hitCrouch: P({ t: 6, ...CROUCH_LEGS, fa: [-10, -30], ba: [-20, -40], face: 'hurt', h: -12 }),
  airHit: P({ t: -50, fa: [-120, -150], ba: [-140, -170], fl: [50, 20], bl: [30, 0], h: -20, face: 'hurt' }),
  fall: P({ t: -74, fa: [-150, -170], ba: [-160, -180], fl: [70, 50], bl: [50, 30], h: -10, face: 'hurt' }),
  down: P({ t: -90, fa: [-100, -96], ba: [-110, -100], fl: [86, 90], bl: [82, 88], h: 0, face: 'ko', lie: 1 }),
  downHurt: P({ t: -90, fa: [-100, -96], ba: [-110, -100], fl: [86, 90], bl: [82, 88], h: 0, face: 'hurt', lie: 1 }),
  getup1: P({ t: -40, fa: [-30, 0], ba: [-50, -20], fl: [100, -20], bl: [80, -40], face: 'hurt' }),
  getup2: P({ t: 24, ...CROUCH_LEGS, fa: [40, 120], ba: [20, 100] }),
  dizzy1: P({ t: -6, fa: [6, -4], ba: [-4, -10], fl: [14, -8], bl: [-8, 10], h: 14, face: 'dizzy' }),
  dizzy2: P({ t: 6, fa: [12, 4], ba: [2, -4], fl: [10, -10], bl: [-12, 6], h: -10, face: 'dizzy' }),
  crumple: P({ t: 30, fa: [0, -10], ba: [-10, -20], fl: [50, -40], bl: [30, -70], h: 30, face: 'ko' }),
  thrown: P({ t: -100, fa: [160, 120], ba: [170, 140], fl: [140, 170], bl: [120, 150], h: -10, face: 'hurt' }),
  throwGrab: P({ t: 14, fa: [86, 100], ba: [80, 96], fl: [36, 4], bl: [-22, -44], open: 1, face: 'smug' }),
  throwToss: P({ t: -24, fa: [190, 200], ba: [180, 196], fl: [20, 8], bl: [-30, -40], open: 1, face: 'yell' }),
  win1: P({ t: 0, fa: [176, 180], ba: [-30, 70], fl: [12, 4], bl: [-12, -4], face: 'smug' }),
  win2: P({ t: -2, fa: [170, 186], ba: [-34, 66], fl: [12, 4], bl: [-12, -4], face: 'yell' }),
  lose: P({ t: 26, fa: [4, 0], ba: [-6, -4], fl: [12, 0], bl: [-8, -4], h: 24, face: 'sad' }),
  burnout: P({ t: 22, fa: [20, 60], ba: [8, 40], fl: [24, 0], bl: [-14, -30], h: 20, face: 'tired' }),
  pageSec: P({ t: 20, fa: [100, 110], ba: [90, 100], fl: [46, 4], bl: [-30, -50], open: 1, face: 'yell' }),
  superFlash: P({ t: -10, fa: [130, 160], ba: [-40, 20], fl: [30, 6], bl: [-24, -40], open: 1, face: 'yell' }),
};

export const POSE_NAMES = Object.keys(POSES);

// Bone lengths for a look.
export function bones(look) {
  const s = look.scale || 1;
  const leg = look.legLen || 1;
  const arm = look.armLen || 1;
  return {
    s,
    thigh: 17 * s * leg,
    shin: 16 * s * leg,
    torso: 23 * s * (look.torsoLen || 1),
    neck: 2,
    ua: 13 * s * arm,
    fa: 12 * s * arm,
    foot: 6 * s,
    headH: 13,
    headW: 13,
  };
}

const solveCache = new Map();

// Returns joint positions (x forward, y up, feet on y=0) for a look + pose name.
export function solvePose(look, poseName) {
  const key = look.id + ':' + poseName;
  let r = solveCache.get(key);
  if (r) return r;
  const p = POSES[poseName] || POSES.idle1;
  const B = bones(look);
  const reach = p.reach || 1;
  const legReach = p.legReach || 1;
  const t = p.t || 0;
  const td = [Math.sin(t * D2R), Math.cos(t * D2R)];
  const hip = [p.dx || 0, 0];
  const add = (a, d, l) => [a[0] + d[0] * l, a[1] + d[1] * l];
  const neckBase = add(hip, td, B.torso);
  const shoulder = add(hip, td, B.torso * 0.88);
  const fs = [shoulder[0] + 1, shoulder[1]];
  const bs = [shoulder[0] - 1, shoulder[1]];
  const fe = add(fs, dir(p.fa[0]), B.ua * (reach > 1 ? reach * 0.8 : 1));
  const fh = add(fe, dir(p.fa[1]), B.fa * reach);
  const be = add(bs, dir(p.ba[0]), B.ua);
  const bh = add(be, dir(p.ba[1]), B.fa);
  const fhip = [hip[0] + 1, hip[1]];
  const bhip = [hip[0] - 2, hip[1]];
  const fk = add(fhip, dir(p.fl[0]), B.thigh * (legReach > 1 ? legReach * 0.8 : 1));
  const fan = add(fk, dir(p.fl[1]), B.shin * legReach);
  const bk = add(bhip, dir(p.bl[0]), B.thigh);
  const ban = add(bk, dir(p.bl[1]), B.shin);
  const footA = (shin, pointed) => (pointed ? shin : shin + 90);
  const ft = add(fan, dir(footA(p.fl[1], p.point)), B.foot);
  const bt = add(ban, dir(footA(p.bl[1], false)), B.foot);
  const headC = add(neckBase, td, B.neck + B.headH / 2);
  // auto-ground: lowest relevant point sits at y=0
  const pts = [
    [fan, 2], [ban, 2], [ft, 1], [bt, 1], [fk, 3], [bk, 3], [hip, 5], [neckBase, 5],
    [headC, 7], [fh, 2], [bh, 2], [fe, 2], [be, 2],
  ];
  let minY = Infinity;
  for (const [pt, rad] of pts) minY = Math.min(minY, pt[1] - rad);
  const dy = -minY + (p.lift || 0);
  const J = { hip, neckBase, shoulder, fs, bs, fe, fh, be, bh, fhip, bhip, fk, fan, bk, ban, ft, bt, headC };
  for (const k in J) J[k] = [J[k][0], J[k][1] + dy];
  let top = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const k in J) {
    top = Math.max(top, J[k][1]);
    minX = Math.min(minX, J[k][0]);
    maxX = Math.max(maxX, J[k][0]);
  }
  top = Math.max(top, J.headC[1] + B.headH / 2 + 2);
  r = { J, pose: p, td, top, minX, maxX, B };
  solveCache.set(key, r);
  return r;
}
