import * as THREE from 'three';
import { Fn, uniform, vec2, vec3, float, If, floor, fract, sin, cos, atan2, length, normalize, clamp, smoothstep, step, mix, abs, max, min, dot, hash, mod, select, screenUV, screenCoordinate } from 'three';
import { FIELD, MASK, SO, sootheShade } from './soothe.js';
import { HU } from './screenfx.js';

// Cursor effects on the finished frame. The Soothe simulation (soothe.js) gives a trail field — a wet height map
// the pointer presses into, which ripples and settles — and this module turns it (or the pointer itself) into one
// of many looks. Two stages, shared by scene 1 (post.js) and scenes 2+ (ball.js):
//   cursorUV(u)          where to read the image from (distortions) — ball.js reads its outlines there too
//   cursorColor(c, u, px) what to do with the colour (shading, invert, halftone, contour lines …)
// The mode is a uniform (uniform control flow), so switching looks needs no shader rebuild.
export const CFX_MODES = ['liquid', 'cubic', 'lens', 'pinch', 'swirl', 'ripple', 'invert', 'mosaic', 'smear', 'halftone',
  'dither', 'glitch', 'wobble', 'frost', 'bleed', 'kaleido', 'vortex', 'contour'];
export const CF = {
  mode: uniform(0), amt: uniform(1), size: uniform(28), freq: uniform(30), twist: uniform(3), rad: uniform(0.18), inv: uniform(0), win: uniform(0),
  nInk: uniform(new THREE.Color().setHex(0x030302, THREE.LinearSRGBColorSpace)), nPaper: uniform(new THREE.Color().setHex(0xcbc2a8, THREE.LinearSRGBColorSpace)),
  vel: uniform(new THREE.Vector2()), t: uniform(0), ink: uniform(new THREE.Color(0x030302)), paper: uniform(new THREE.Color(0xcbc2a8)),
};
const M = (name) => CFX_MODES.indexOf(name);
const is = (name) => CF.mode.equal(M(name));

// palette negative: light → the site's black, dark → the site's paper, tones in between keep their order
const palNeg = (c) => {
  const w = vec3(0.2126, 0.7152, 0.0722), lI = dot(vec3(CF.nInk), w), lP = dot(vec3(CF.nPaper), w);
  const t = dot(vec3(c).clamp(0, 1), w).sub(lI).div(lP.sub(lI)).clamp(0, 1);
  return mix(vec3(CF.nPaper), vec3(CF.nInk), t);
};
// helpers --------------------------------------------------------------------------------------------------------
const h2 = (p) => hash(p.x.add(p.y.mul(1571.3)));   // hash takes a scalar
const trailAt = (u) => MASK.uv(u).x;   // the painted, fading stroke (see soothe.js)
const cursorLocal = (u) => {   // aspect-correct vector from the pointer, its length, and a soft falloff inside CF.rad
  const asp = SO.aspect, m = SO.mouse;
  const d = vec2(u.x.sub(m.x).mul(asp), u.y.sub(m.y));
  const r = length(d);
  const fall = smoothstep(CF.rad, CF.rad.mul(0.15), r).mul(step(0.5, m.z));
  return { d, r, fall, asp, m };
};

// stage 1: distortion -------------------------------------------------------------------------------------------
export const cursorUV = (u, gate = float(1)) => Fn(() => {
  const out = vec2(u).toVar();
  const k = SO.on.mul(gate);
  If(k.greaterThan(0.5), () => {
    const N = FIELD.uv(u).xyz;
    const { d, r, fall, asp, m } = cursorLocal(u);
    If(is('liquid'), () => { out.assign(u.add(N.xy.mul(SO.refract).mul(trailAt(u)))); })
    .ElseIf(is('cubic'), () => {             // the image breaks into cubes; each cube is pushed by the wave under its centre
      const cells = HU.res.div(CF.size), c = floor(u.mul(cells)).add(0.5).div(cells);
      const Nc = FIELD.uv(c).xyz, tr = trailAt(c);
      out.assign(mix(u, c.add(Nc.xy.mul(SO.refract).mul(4)).add(u.sub(c).mul(float(1).sub(Nc.z.sub(SO.rest).mul(CF.amt).clamp(-0.6, 0.6)))), step(0.02, tr)));
    })
    .ElseIf(is('lens'), () => { out.assign(vec2(m.x.add(d.x.mul(float(1).sub(fall.mul(CF.amt).mul(0.5))).div(asp)), m.y.add(d.y.mul(float(1).sub(fall.mul(CF.amt).mul(0.5)))))); })
    .ElseIf(is('pinch'), () => { out.assign(vec2(m.x.add(d.x.mul(float(1).add(fall.mul(CF.amt).mul(0.6))).div(asp)), m.y.add(d.y.mul(float(1).add(fall.mul(CF.amt).mul(0.6)))))); })
    .ElseIf(is('swirl'), () => {
      const a = fall.mul(fall).mul(CF.twist), ca = cos(a), sa = sin(a);
      const rd = vec2(d.x.mul(ca).sub(d.y.mul(sa)), d.x.mul(sa).add(d.y.mul(ca)));
      out.assign(vec2(m.x.add(rd.x.div(asp)), m.y.add(rd.y)));
    })
    .ElseIf(is('ripple'), () => {             // rings running out of the pointer + the trail's own waves
      const w = sin(r.mul(CF.freq).sub(CF.t.mul(9))).mul(fall).mul(CF.amt).mul(0.012);
      out.assign(u.add(normalize(d.add(1e-5)).mul(w)).add(N.xy.mul(SO.refract).mul(trailAt(u))));
    })
    .ElseIf(is('mosaic'), () => { const cells = HU.res.div(CF.size), c = floor(u.mul(cells)).add(0.5).div(cells); out.assign(mix(u, c, step(0.05, trailAt(c)))); })
    .ElseIf(is('smear'), () => { out.assign(u.sub(CF.vel.mul(CF.amt).mul(0.04).mul(trailAt(u)))); })   // finger drag
    .ElseIf(is('glitch'), () => {
      const row = floor(u.y.mul(CF.freq)), jit = hash(row.add(floor(CF.t.mul(14)).mul(17.3))).sub(0.5);
      const tr = trailAt(u);
      out.assign(vec2(u.x.add(jit.mul(CF.amt).mul(0.08).mul(tr)), u.y));
    })
    .ElseIf(is('wobble'), () => { out.assign(vec2(u.x.add(sin(u.y.mul(CF.freq).add(CF.t.mul(6))).mul(CF.amt).mul(0.01).mul(trailAt(u))), u.y)); })
    .ElseIf(is('frost'), () => { const fp = floor(u.mul(HU.res)), n = vec2(h2(fp), h2(fp.add(71.3))).sub(0.5); out.assign(u.add(n.mul(CF.amt).mul(0.03).mul(trailAt(u)))); })
    .ElseIf(is('kaleido'), () => {
      const seg = float(6.2832).div(CF.freq.max(2).floor()), a = atan2(d.y, d.x), af = abs(mod(a, seg).sub(seg.mul(0.5)));
      const kd = vec2(cos(af), sin(af)).mul(r);
      out.assign(mix(u, vec2(m.x.add(kd.x.div(asp)), m.y.add(kd.y)), step(0.001, fall)));
    })
    .ElseIf(is('vortex'), () => { out.assign(u.add(vec2(N.y.negate(), N.x).mul(SO.refract).mul(2).add(N.xy.mul(SO.refract)).mul(trailAt(u)))); })   // curl of the trail
  });
  return out;
})();

// stage 2: colour -----------------------------------------------------------------------------------------------
export const cursorColor = (c0, u, px, gate = float(1)) => Fn(() => {
  const c = sootheShade(c0, u, px, float(gate).mul(trailAt(u).mul(1.5).min(1))).toVar();   // shading fades with the stroke   // light / highlight / dither of the trail (their sliders; 0 = off)
  const k = SO.on.mul(gate);
  If(k.greaterThan(0.5), () => {
    const N = FIELD.uv(u).xyz, tr = trailAt(u);
    const { fall } = cursorLocal(u);
    const ink = vec3(CF.ink), paper = vec3(CF.paper);
    If(is('invert'), () => { c.assign(mix(c, palNeg(c), smoothstep(0.1, 0.35, tr))); })   // true negative of what is under the trail
    .ElseIf(is('cubic'), () => {             // bevels: each moved cube gets a lit and a dark edge
      const cells = HU.res.div(CF.size), f = fract(u.mul(cells)), cc = floor(u.mul(cells)).add(0.5).div(cells), t = step(0.02, trailAt(cc));
      const edge = step(f.x, 0.08).add(step(0.92, f.y)).clamp(0, 1), dark = step(0.92, f.x).add(step(f.y, 0.08)).clamp(0, 1);
      c.assign(mix(c, mix(paper, ink, dark), max(edge, dark).mul(t).mul(0.9)));
    })
    .ElseIf(is('halftone'), () => {
      const cell = CF.size.mul(0.35).max(3), g = fract(px.div(cell)).sub(0.5), l = dot(c, vec3(0.3, 0.59, 0.11));
      const dotm = step(length(g), float(1).sub(l).sqrt().mul(0.55));
      c.assign(mix(c, mix(paper, ink, dotm), smoothstep(0.05, 0.25, tr)));
    })
    .ElseIf(is('bleed'), () => {             // ink soaks the paper where the trail is
      const n = h2(floor(px.div(2))).mul(0.7).add(0.15);   // fixed speckle: no flicker; the ink dissolves as the stroke fades
      c.assign(mix(c, mix(ink, palNeg(c), CF.inv), step(n, tr.mul(CF.amt))));   // inv: the ink is the negative of the image
    })
    .ElseIf(is('contour'), () => {           // topographic lines of the wet surface
      const h = N.z.sub(SO.rest).mul(CF.freq), fw = abs(h.sub(floor(h.add(0.5))));
      c.assign(mix(c, ink, step(fw, 0.08).mul(step(0.05, tr))));
    });
  });
  return c;
})();

// all six modules found: the whole picture swaps its light and dark (the site's paper ↔ ink), till the page reloads
export const winFlip = (col, gate = float(1)) => Fn(() => { const c = vec3(col); return mix(c, palNeg(c), CF.win.mul(gate)); })();

// the same inversion for the UI drawn on top of the frame (titles, carton, badge, dust): every overlay colour is
// flipped where the trail is, so the whole picture reads as one negative — the scene underneath is already flipped.
export const overlayInvert = (col) => Fn(() => {
  const tr = trailAt(screenUV);
  const n = h2(floor(screenCoordinate.xy.div(2))).mul(0.7).add(0.15);
  const mBleed = step(n, tr.mul(CF.amt)).mul(CF.inv).mul(select(is('bleed'), float(1), float(0)));
  const mInv = smoothstep(0.1, 0.35, tr).mul(select(is('invert'), float(1), float(0)));
  const m = max(mBleed, mInv).mul(SO.on);
  const c = vec3(col), o = mix(c, palNeg(c), m);
  return mix(o, palNeg(o), CF.win);
})();

// 20 ready looks: [name, mode, {sim + look settings}]  (sim: radius, peak, elastic, visc, spread · look: see params)
const B = { sootheOn: 1, sootheRadius: 0.065, soothePeak: 0.6, sootheElastic: 0.016, sootheVisc: 0.059, sootheSpread: 0.972, sootheRefract: 0, sootheShadeAmt: 0, sootheSpec: 0, sootheDither: 0, sootheDitherPx: 2, sootheDitherAll: 0, cfxAmt: 1, cfxSize: 28, cfxFreq: 30, cfxTwist: 3, cfxRad: 0.18, cfxLife: 1.5, cfxSoft: 0.5 };
export const CFX_PRESETS = {
  'Liquid glass': { cfxMode: 'liquid', sootheRefract: 0.04, sootheShadeAmt: 0.8, sootheSpec: 0.6 },
  'Honey': { cfxMode: 'liquid', sootheRadius: 0.12, soothePeak: 0.9, sootheElastic: 0.004, sootheVisc: 0.02, sootheSpread: 0.99, sootheRefract: 0.06, sootheShadeAmt: 1.2, sootheSpec: 0.2 },
  'Water drop': { cfxMode: 'liquid', sootheRadius: 0.03, soothePeak: 0.5, sootheElastic: 0.03, sootheVisc: 0.1, sootheSpread: 0.95, sootheRefract: 0.03, sootheShadeAmt: 0.5, sootheSpec: 1 },
  'Cubic distortion': { cfxMode: 'cubic', cfxSize: 34, sootheRadius: 0.09, sootheRefract: 0.03 },
  'Vortex': { cfxMode: 'vortex', sootheRadius: 0.1, soothePeak: 0.8, sootheVisc: 0.02, sootheSpread: 0.985, sootheRefract: 0.035, sootheShadeAmt: 0.4 },
  'Magnifier': { cfxMode: 'lens', cfxAmt: 1.2, cfxRad: 0.14 },
  'Black hole': { cfxMode: 'pinch', cfxAmt: 1.3, cfxRad: 0.22 },
  'Whirlpool': { cfxMode: 'swirl', cfxTwist: 6, cfxRad: 0.25 },
  'Sonar': { cfxMode: 'ripple', cfxFreq: 70, cfxRad: 0.35, sootheRefract: 0.01 },
  'Negative brush': { cfxMode: 'invert', sootheRadius: 0.09, soothePeak: 0.8, sootheVisc: 0.03 },
  'Mosaic trail': { cfxMode: 'mosaic', cfxSize: 22, sootheRadius: 0.1 },
  'Finger smudge': { cfxMode: 'smear', cfxAmt: 1.5, sootheRadius: 0.12, sootheElastic: 0.004, sootheVisc: 0.015 },
  'Halftone brush': { cfxMode: 'halftone', cfxSize: 30, sootheRadius: 0.1 },
  'Dither brush': { cfxMode: 'dither', sootheDither: 2, sootheDitherPx: 4, sootheRadius: 0.09 },
  'VHS glitch': { cfxMode: 'glitch', cfxFreq: 60, cfxRad: 0.1 },
  'Heat haze': { cfxMode: 'wobble', cfxFreq: 90, cfxAmt: 0.8, cfxRad: 0.25, sootheRadius: 0.12 },
  'Frosted glass': { cfxMode: 'frost', sootheRadius: 0.12, sootheVisc: 0.02 },
  'Ink bleed': { cfxMode: 'bleed', cfxAmt: 1.5, sootheRadius: 0.08, sootheElastic: 0.002, sootheVisc: 0.01 },
  'Kaleidoscope': { cfxMode: 'kaleido', cfxFreq: 6, cfxRad: 0.2 },
  'Topography': { cfxMode: 'contour', cfxFreq: 40, sootheRadius: 0.12, soothePeak: 0.9, sootheElastic: 0.008 },
};
for (const k in CFX_PRESETS) CFX_PRESETS[k] = { ...B, ...CFX_PRESETS[k] };
