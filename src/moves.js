// Shared normal attacks. Frame data at 60fps. limb: joint segment used for the hitbox.
// Classic buttons: lp (INJECT) mp (SUTURE) hp (DEFIB) lk (KICK) mk (WHEEL) hk (GURNEY)
const N = (o) => Object.assign({ guard: 'mid', pushHit: 3, pushBlock: 5, cancel: false, chain: false, pad: 3 }, o);

export const NORMALS = {
  '5lp': N({ name: 'INJECT', w: 'lpW', a: 'lpA', r: 'idle1', startup: 4, active: 2, recovery: 7, dmg: 30, hitstun: 13, blockstun: 10, limb: 'fh', cancel: true, chain: true, str: 0 }),
  '5mp': N({ name: 'SUTURE', w: 'mpW', a: 'mpA', r: 'idle2', startup: 6, active: 3, recovery: 12, dmg: 60, hitstun: 18, blockstun: 14, limb: 'bh', cancel: true, str: 1, step: 1.2 }),
  '5hp': N({ name: 'DEFIB', w: 'hpW', a: 'hpA', r: 'hpR', startup: 9, active: 4, recovery: 18, dmg: 90, hitstun: 22, blockstun: 16, limb: 'bh', cancel: true, str: 2, step: 2, pushHit: 6 }),
  '5lk': N({ name: 'KICK', w: 'lkW', a: 'lkA', r: 'idle1', startup: 5, active: 3, recovery: 9, dmg: 35, hitstun: 13, blockstun: 10, limb: 'ff', cancel: true, str: 0 }),
  '5mk': N({ name: 'WHEEL', w: 'mkW', a: 'mkA', r: 'mkW', startup: 8, active: 3, recovery: 14, dmg: 65, hitstun: 18, blockstun: 13, limb: 'ff', str: 1 }),
  '5hk': N({ name: 'GURNEY', w: 'hkW', a: 'hkA', r: 'hkR', startup: 11, active: 4, recovery: 20, dmg: 95, hitstun: 22, blockstun: 16, limb: 'ff', str: 2, pushHit: 7 }),
  '2lp': N({ name: 'LOW INJECT', w: 'crouch', a: 'clpA', r: 'crouch', startup: 4, active: 2, recovery: 7, dmg: 25, hitstun: 12, blockstun: 9, limb: 'fh', cancel: true, chain: true, crouch: true, str: 0 }),
  '2mp': N({ name: 'LOW SUTURE', w: 'crouch', a: 'cmpA', r: 'crouch', startup: 6, active: 3, recovery: 11, dmg: 55, hitstun: 17, blockstun: 13, limb: 'bh', cancel: true, crouch: true, str: 1 }),
  '2hp': N({ name: 'ANTI-AIR DEFIB', w: 'chpW', a: 'chpA', r: 'crouch', startup: 7, active: 5, recovery: 20, dmg: 85, hitstun: 22, blockstun: 15, limb: 'bh', cancel: true, crouch: true, str: 2, antiair: true, launchAir: true, pad: 5 }),
  '2lk': N({ name: 'ANKLE TAP', w: 'crouch', a: 'clkA', r: 'crouch', startup: 5, active: 2, recovery: 9, dmg: 25, hitstun: 12, blockstun: 9, limb: 'ff', guard: 'low', chain: true, cancel: true, crouch: true, str: 0 }),
  '2mk': N({ name: 'LOW WHEEL', w: 'crouch', a: 'cmkA', r: 'crouch', startup: 8, active: 3, recovery: 14, dmg: 55, hitstun: 17, blockstun: 13, limb: 'ff', guard: 'low', cancel: true, crouch: true, str: 1 }),
  '2hk': N({ name: 'BED SWEEP', w: 'chkW', a: 'chkA', r: 'crouch', startup: 10, active: 4, recovery: 22, dmg: 90, hitstun: 20, blockstun: 14, limb: 'ff', guard: 'low', kd: true, crouch: true, str: 2 }),
  'jlp': N({ name: 'AIR INJECT', w: 'jumpTop', a: 'jlpA', r: 'jlpA', startup: 4, active: 9, recovery: 2, dmg: 35, hitstun: 13, blockstun: 10, limb: 'fh', guard: 'high', air: true, str: 0 }),
  'jmp': N({ name: 'AIR SUTURE', w: 'jumpTop', a: 'jlpA', r: 'jlpA', startup: 6, active: 7, recovery: 3, dmg: 60, hitstun: 17, blockstun: 13, limb: 'fh', guard: 'high', air: true, str: 1 }),
  'jhp': N({ name: 'AIR DEFIB', w: 'jumpTop', a: 'jhpA', r: 'jhpA', startup: 8, active: 6, recovery: 4, dmg: 85, hitstun: 21, blockstun: 15, limb: 'bh', guard: 'high', air: true, str: 2, pad: 4 }),
  'jlk': N({ name: 'AIR KICK', w: 'jumpTop', a: 'jlkA', r: 'jlkA', startup: 5, active: 9, recovery: 2, dmg: 35, hitstun: 13, blockstun: 10, limb: 'ff', guard: 'high', air: true, str: 0 }),
  'jmk': N({ name: 'AIR WHEEL', w: 'jumpTop', a: 'jlkA', r: 'jlkA', startup: 6, active: 7, recovery: 3, dmg: 65, hitstun: 17, blockstun: 13, limb: 'ff', guard: 'high', air: true, str: 1 }),
  'jhk': N({ name: 'AIR GURNEY', w: 'jumpTop', a: 'jhkA', r: 'jhkA', startup: 8, active: 6, recovery: 4, dmg: 90, hitstun: 21, blockstun: 15, limb: 'ff', guard: 'high', air: true, str: 2, pad: 4 }),
};

// Modern control mapping (L/M/H) -> classic normal ids per stance
export const MODERN_MAP = {
  stand: { l: '5lp', m: '5mk', h: '5hp' },
  crouch: { l: '2lk', m: '2mk', h: '2hk' },
  air: { l: 'jlk', m: 'jmk', h: 'jhp' },
};

// Auto-combo routes for modern "assist" (hold AUTO / toggle on touch)
export const AUTO_ROUTES = {
  l: ['5lp', '5lp', '2mp', 'sp:n'],
  m: ['5mp', '5hp', 'sp:f'],
  h: ['5hp', 'sp:b', 'super'],
};

export const STR_HITSTOP = [8, 10, 13];
export const STR_SFX = ['hitL', 'hitM', 'hitH'];
