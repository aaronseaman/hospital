// Visual definitions for every fighter. Consumed by sprites.js.
export const LOOKS = {
  trauma: {
    skin: '#e8b088', hair: '#22161c', hairStyle: 'spiky', hat: 'headband', hatColor: '#d42a2a', hatAccent: '#d42a2a',
    coat: '#f0f0f4', coatLen: 24, top: '#3a6cc8', pants: '#3a6cc8', shoes: '#2a2a34', brows: 'angry',
    extras: { stethoscope: '#20283a', pens: true },
    alt: { top: '#2a8a5a', pants: '#2a8a5a', hatColor: '#2a50d8', coat: '#f4e8c8' },
  },
  nightingale: {
    skin: '#f2c49c', hair: '#3a2014', hairStyle: 'buns', hat: 'buncovers', hatColor: '#ffffff', hatAccent: '#e02838',
    top: '#f07aac', pants: '#f07aac', shoes: '#ffffff', scale: 0.96, width: 0.9, bulk: 0.95, legLen: 1.06,
    extras: { lanyard: '#2060d0' },
    alt: { top: '#58b8e8', pants: '#58b8e8', hatAccent: '#2050d0' },
  },
  surgeon: {
    skin: '#e8b890', hair: '#d8b860', hairStyle: 'buzz', hat: 'surgcap', hatColor: '#3c8a58', hatAccent: '#8ad0a0',
    face: ['loupes', 'mask'], mask: '#9cd0e8', top: '#3c8a58', pants: '#3c8a58', shoes: '#c8c8d0', gloves: '#78b0f0',
    bulk: 1.1, shoulders: 1.15, scale: 1.04, brows: 'angry',
    alt: { top: '#3a5aa8', pants: '#3a5aa8', hatColor: '#3a5aa8', hatAccent: '#90b0f0' },
  },
  anesth: {
    skin: '#a86a40', hair: '#1a1010', hairStyle: 'bald', hat: 'bouffant', hatColor: '#4a68d0', hatAccent: '#f0d040',
    face: ['goggles'], top: '#2a9aa0', pants: '#2a9aa0', shoes: '#e0e0e0', bulk: 0.82, armLen: 1.14, legLen: 1.08, scale: 1.04, width: 0.85,
    extras: { lanyard: '#e0a020' },
    alt: { top: '#a05aa8', pants: '#a05aa8', hatColor: '#d05050' },
  },
  pharmacist: {
    skin: '#f0c8a0', hair: '#6a3a20', hairStyle: 'bob', face: ['glasses'], coat: '#f4f4f8', coatLen: 20,
    top: '#7090c0', pants: '#3e4658', shoes: '#302018', extras: { tie: '#a82040', badge: '#3060c0', pens: true },
    alt: { top: '#d0a060', extras: { tie: '#2a8a50', badge: '#3060c0', pens: true }, coat: '#e0f0e8' },
  },
  radiologist: {
    skin: '#dcc8bc', hair: '#202024', hairStyle: 'slick', face: ['sun'], top: '#566c7c', pants: '#566c7c', shoes: '#202020',
    extras: { vest: '#24346c', badge: '#e8e040' }, brows: 'normal',
    alt: { top: '#7c5656', pants: '#7c5656', extras: { vest: '#6c2434', badge: '#e8e040' } },
  },
  ortho: {
    skin: '#e0a070', hair: '#3a2010', hairStyle: 'buzz', hat: 'capback', hatColor: '#2050c0', face: ['sun'],
    top: '#4060a8', sleeve: 'none', pants: '#4060a8', shoes: '#f0f0f0', scale: 1.16, bulk: 1.42, shoulders: 1.3, chest: 1.22,
    width: 1.25, neck: 1.6, armBulk: 1.12, brows: 'angry',
    alt: { top: '#a83030', pants: '#a83030', hatColor: '#c02020' },
  },
  peds: {
    skin: '#c08050', hair: '#1a1010', hairStyle: 'ponytail', top: '#f0d040', topPattern: '#3aa0e0', pants: '#3aa0e0',
    shoes: '#f04848', scale: 0.9, width: 0.92, extras: { stethoscope: '#f05088' },
    alt: { top: '#80e080', topPattern: '#f060a0', pants: '#f060a0' },
  },
  psych: {
    skin: '#f0c8a8', hair: '#a0a0a0', hairStyle: 'bald', face: ['glasses', 'beard'], coat: '#8a6a40', coatLen: 12,
    top: '#e8e0d0', pants: '#4a3a30', shoes: '#3a2010', extras: { tie: '#5a2030' },
    alt: { coat: '#4a5a7a', extras: { tie: '#a08020' } },
  },
  admin: {
    skin: '#e8c0a0', hair: '#121216', hairStyle: 'slick', top: '#f0f0f0', coat: '#34344c', coatLen: 12, pants: '#34344c',
    shoes: '#101010', extras: { tie: '#d82020', badge: '#f0c040' }, brows: 'angry', scale: 1.06, shoulders: 1.1,
    alt: { coat: '#5a1a2a', pants: '#5a1a2a', extras: { tie: '#f0c040', badge: '#f0c040' } },
  },
  janitor: {
    skin: '#8a5a3a', hair: '#d0d0d0', hairStyle: 'buzz', hat: 'cap', hatColor: '#3e5e40', face: ['mustache'],
    top: '#5a7a5c', sleeve: 'long', pants: '#5a7a5c', shoes: '#3a2a1a', extras: { belt: '#3a2a1a', badge: '#e0c040' },
    bulk: 1.05, brows: 'angry',
    alt: { top: '#7a5a8a', pants: '#7a5a8a', hatColor: '#5a3a6a' },
  },
  paramedic: {
    skin: '#d09060', hair: '#3a2010', hairStyle: 'short', top: '#1c2c5c', pants: '#1c2c5c', shoes: '#101010',
    gloves: '#30303a', extras: { stripes: '#e8e040', belt: '#101010', badge: '#e0e0e0' }, bulk: 1.15, shoulders: 1.08,
    alt: { top: '#5c1c1c', pants: '#5c1c1c', extras: { stripes: '#e8e8e8', belt: '#101010', badge: '#e0e0e0' } },
  },
  labtech: {
    skin: '#f0d0b0', hair: '#e07830', hairStyle: 'long', face: ['goggles'], coat: '#f8f8fc', coatLen: 20, top: '#8060c0',
    pants: '#405070', gloves: '#a080f0', shoes: '#f0f0f0', scale: 0.98, width: 0.92,
    alt: { top: '#40a060', gloves: '#60c0a0', hair: '#3a2010' },
  },
  chaplain: {
    skin: '#7a4a30', hair: '#181010', hairStyle: 'bald', top: '#2e2c3c', sleeve: 'long', pants: '#2e2c3c', shoes: '#101010',
    extras: { collar: true, cross: '#e8c840' }, scale: 1.02, face: ['goatee'],
    alt: { top: '#4a2a5a', pants: '#4a2a5a' },
  },
  zero: {
    skin: '#b8d0a0', hair: '#4a5a3a', hairStyle: 'messy', gown: '#a8c8e8', gownDots: '#5888c0', eyes: '#d02020',
    shoes: '#e0e0e0', scale: 0.98, bulk: 0.84, width: 0.88, brows: 'angry',
    alt: { gown: '#e8b8c8', gownDots: '#c06080', skin: '#c8b8d8' },
  },
  it: {
    skin: '#e8c0a0', hair: '#5a3a20', hairStyle: 'curly', hat: 'headset', face: ['glasses'], top: '#3a3a4c', sleeve: 'long',
    pants: '#4a5a80', shoes: '#e04040', extras: { lanyard: '#30a040' },
    alt: { top: '#2a6a3a', pants: '#3a3a3a' },
  },
  dietitian: {
    skin: '#f0c8a0', hair: '#c89040', hairStyle: 'ponytail', top: '#78c058', pants: '#f0f0f0', shoes: '#78c058',
    extras: { apron: '#f8f0e0' }, scale: 0.96, width: 0.92,
    alt: { top: '#e08040', shoes: '#e08040' },
  },
  chief: {
    skin: '#e0b090', hair: '#dadada', hairStyle: 'gray', face: ['mustache'], coat: '#fafafa', coatLen: 30, top: '#2a2a3a',
    pants: '#2a2a3a', shoes: '#101010', extras: { tie: '#6a2a8a', stethoscope: '#202020', pens: true, badge: '#e0c040' },
    scale: 1.08, brows: 'angry', shoulders: 1.08,
    alt: { coat: '#2c2834', extras: { tie: '#d02020', stethoscope: '#c0c0c0', badge: '#e0c040' } },
  },
};

for (const id in LOOKS) LOOKS[id].id = id;

const altCache = {};
export function lookFor(id, alt) {
  const base = LOOKS[id];
  if (!alt) return base;
  if (!altCache[id]) {
    const a = base.alt || {};
    altCache[id] = Object.assign({}, base, a, { id: id + '_alt', extras: a.extras || base.extras });
  }
  return altCache[id];
}
