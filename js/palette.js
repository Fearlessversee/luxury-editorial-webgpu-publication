import * as THREE from 'three';
import { PT } from './painterly.js';
import { uniform, vec3, float, mix, smoothstep, dot, clamp, Fn, normalView, normalWorld, step, max } from 'three';

// Colour palettes, after COLOR-GUIDE ("monochrome sun-baked low-poly"): colour comes from MATERIALS + LIGHT.
// Every material belongs to a category (ground, stone, wood, leaf, deep, hero) and has a 3-step ramp inside the
// palette: lit / side (form shadow — stays light, big warm ambient) / low (ground bounce on down-facing faces).
// One sun, stepped N·L, hard cast shadows painted in ONE global shadow tint (never a darkening multiply).
// Sky = the lightest tone; distance fades toward it. Lines (if any) are thin, in the deep maroon, low opacity.
// Scene 1 (the crow) has no such materials, so it keeps a light gradient map in the same family.
const U = () => uniform(new THREE.Color());
const ramp = () => ({ lit: U(), side: U(), low: U() });
export const PAL = {
  on: uniform(0), amt: uniform(1), mode: uniform(0),
  // gradient-map stops (scene 1 only)
  c0: U(), c1: U(), c2: U(), c3: U(), c4: U(), accent: U(),
  hi: uniform(0.8), lo: uniform(0.07), depth: uniform(0.3),
  // world tokens
  sky: U(), shadowTint: U(), line: U(), lineK: uniform(1),
  cat: { ground: ramp(), stone: ramp(), wood: ramp(), leaf: ramp(), deep: ramp(), hero: ramp() },
};

// 'Sun-baked' = the guide's sampled palette; the others fill the same token structure from 6 colours
// [sky, light, primary, deep, ink, accent]
const SUN = {
  sky: '#F5E3A8', shadowTint: '#C14F35', line: '#7E361F', lineK: 0.9,
  ground: ['#FBBB65', '#F39747', '#E7984D'], stone: ['#EBD08D', '#D3B97C', '#C3945E'], wood: ['#A6693C', '#9B582E', '#904C1F'],
  leaf: ['#B8452C', '#9E3524', '#7E361F'], deep: ['#7E361F', '#6A2C19', '#5A2414'], hero: ['#910D1A', '#7A0B16', '#5E0A12'],
  grad: ['#F5E3A8', '#FBBB65', '#F39747', '#C14F35', '#7E361F', '#910D1A'],
};
export const PALETTES = {
  'Paper & ink': null,
  'Sun-baked (guide)': SUN,
  'Burning house': ['#4f7fd6', '#3f6cc4', '#2d3f8f', '#26275a', '#16163a', '#f2a66a'],
  'Riso rock': ['#e8e5de', '#56d3c7', '#f76b3c', '#1195c9', '#62201f', '#f76b3c'],
  'Desert drive': ['#fcd99b', '#f08a4f', '#a05468', '#4f3f63', '#2c2440', '#3c5282'],
  'Red city': ['#e6cdb0', '#9ba7a8', '#4e6177', '#1b2030', '#0f131d', '#e12014'],
  'Dusk mauve': ['#f2d6a0', '#e09e85', '#b95f64', '#7f3b5a', '#26275a', '#3f6cc4'],
};
const hex = (u, h) => u.value.setHex(typeof h === 'number' ? h : parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);   // raw display values
const mixHex = (a, b, t) => { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, t).getHexString(); };
function tokensFrom6(p) {
  const [c0, c1, c2, c3, c4, ac] = p;
  return { sky: c0, shadowTint: mixHex(c2, c3, 0.5), line: c4, lineK: 0.6,
    ground: [c1, mixHex(c1, c2, 0.3), mixHex(c1, c2, 0.55)], stone: [mixHex(c0, c1, 0.45), mixHex(c0, c1, 0.75), c1],
    wood: [c2, mixHex(c2, c3, 0.35), mixHex(c2, c3, 0.6)], leaf: [ac, mixHex(ac, c3, 0.3), mixHex(ac, c4, 0.4)],
    deep: [c3, mixHex(c3, c4, 0.4), c4], hero: [ac, mixHex(ac, c3, 0.25), mixHex(ac, c4, 0.4)], grad: p };
}
export function setPalette(name) {
  const raw = PALETTES[name];
  PAL.on.value = raw ? 1 : 0; PAL.mode.value = raw ? 1 : 0;
  if (!raw) return;
  const t = Array.isArray(raw) ? tokensFrom6(raw) : raw;
  hex(PAL.sky, t.sky); hex(PAL.shadowTint, t.shadowTint); hex(PAL.line, t.line); PAL.lineK.value = t.lineK;
  for (const k of Object.keys(PAL.cat)) { const [a, b, c] = t[k]; hex(PAL.cat[k].lit, a); hex(PAL.cat[k].side, b); hex(PAL.cat[k].low, c); }
  [PAL.c0, PAL.c1, PAL.c2, PAL.c3, PAL.c4, PAL.accent].forEach((u, i) => hex(u, t.grad[i]));
}

// explicit categories for named materials (see COLOR-GUIDE roles)
export function setRoles(M, map) { for (const k in map) if (M[k] && M[k].sunModel) M[k].sunModel.cat = map[k]; }
// a material's category from the colour it was authored with
export function paletteCat(color, role) {
  if (role) return role;
  const hsl = new THREE.Color(color).getHSL({}, THREE.SRGBColorSpace);
  if (hsl.s > 0.45 && hsl.l > 0.18 && hsl.l < 0.82) return 'leaf';
  return hsl.l > 0.62 ? 'stone' : hsl.l > 0.38 ? 'ground' : hsl.l > 0.16 ? 'wood' : 'deep';
}

// Lighting model: one directional sun (its shadow arrives inside lightColor). Writes the finished palette colour
// (linear) — nothing is computed by darkening except the designed steps.
export class SunModel extends THREE.LightingModel {
  constructor(cat, { hazeK = null, lines = null, paint = null } = {}) { super(); this.cat = cat; this.hazeK = hazeK; this.lines = lines; this.paint = paint; }
  direct({ lightDirection, lightColor, reflectedLight }) {
    const r = PAL.cat[this.cat];
    // painterly: the dab normal lights each brush cell as one patch; the cell value picks between two tones
    const P = this.paint;
    const ndl = P ? mix(dot(normalView, lightDirection), dot(P.pN, lightDirection), PT.on) : dot(normalView, lightDirection);
    const litBand = P ? smoothstep(PT.soft.mul(-0.3), PT.soft, ndl) : smoothstep(0.02, 0.1, ndl);   // soft painted light (painterly) / stepped
    const v = P ? P.v.clamp(0, 1) : float(0);
    let c = mix(mix(vec3(r.side), vec3(r.low), v), mix(vec3(r.lit), vec3(r.side), v.mul(0.8)), litBand);
    c = mix(c, vec3(r.low), clamp(normalWorld.y.negate().mul(0.8).add(0.1), 0, 1).mul(0.7));   // ground bounce on low faces
    const shadowed = float(1).sub(clamp(lightColor.r, 0, 1)).mul(litBand);   // cast shadow only where the face is lit
    c = mix(c, vec3(PAL.shadowTint), step(0.5, shadowed).mul(0.9));       // hard edge, one flat tint
    if (this.lines) c = mix(vec3(PAL.line), c, mix(float(1), this.lines, PAL.lineK));   // faint maroon pattern lines
    if (this.hazeK) c = mix(c, vec3(PAL.sky), this.hazeK);                               // distance → sky tone
    reflectedLight.directDiffuse.addAssign(c.pow(2.2).mul(PAL.mode));
  }
  indirect() {}
}

// scene 1: gradient map over the finished image (display space)
export const paletteMap = (o, hero = float(0), gate = float(1)) => Fn(() => {
  const l = dot(o, vec3(0.299, 0.587, 0.114));
  const t = clamp(PAL.hi.sub(l).div(PAL.hi.sub(PAL.lo)), 0, 1);
  const s = PAL.depth.mul(0.5).add(t.mul(float(1).sub(PAL.depth.mul(0.5)))).mul(4);
  let c = mix(vec3(PAL.c0), vec3(PAL.c1), s.clamp(0, 1));
  c = mix(c, vec3(PAL.c2), s.sub(1).clamp(0, 1));
  c = mix(c, vec3(PAL.c3), s.sub(2).clamp(0, 1));
  c = mix(c, vec3(PAL.c4), s.sub(3).clamp(0, 1));
  c = mix(c, vec3(PAL.accent), hero.clamp(0, 1).mul(float(1).sub(smoothstep(0.55, 0.85, t))));
  return mix(o, c, PAL.on.mul(PAL.amt).mul(gate));
})();
