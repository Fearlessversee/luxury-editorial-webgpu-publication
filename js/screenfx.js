import * as THREE from 'three';
import { Fn, uniform, vec2, vec3, float, floor, mod, fract, mix, smoothstep, length, sin, cos, dot, sqrt, max, min, abs, uv, pow, select } from 'three';

// Print screens that REPLACE the picture (not an overlay): the frame is resampled on a grid — one tone per cell,
// read at the cell centre — and every cell is redrawn as a monochrome mark whose size / pattern carries the tone.
// Nothing of the original colour survives: only two inks (or a few greys for multi-level dither).
//   mode 1  ordered dither (8×8 Bayer, 1-bit or a few grey levels) on a coarse pixel grid
//   mode 2  halftone · circles      mode 3  halftone · squares      mode 4  halftone · crosses
export const HU = {
  mode: uniform(0), mix: uniform(1),
  invert: uniform(1),               // 1 = light marks on a dark ground (like the references)
  dark: uniform(new THREE.Color('#0d0d0d').convertLinearToSRGB()), light: uniform(new THREE.Color('#f0f0f0').convertLinearToSRGB()),   // raw display values
  levels: uniform(2), dPx: uniform(3), dBias: uniform(0),
  size: uniform(7), angle: uniform(0.785), dotScale: uniform(1), soft: uniform(0.15),
  contrast: uniform(1.2), gamma: uniform(1), bright: uniform(0),
  res: uniform(new THREE.Vector2(1, 1)),
  s1: uniform(1),                   // scene 1 passes 0 while it renders into the crystal ball
};
const step1 = (a) => smoothstep(0.001, 0.02, a);
const b2 = (a, b) => mod(a.mul(2).add(b.mul(3)), 4);
const bit = (v, k) => mod(floor(v.div(k)), 2);
const bayer8 = (p) => b2(bit(p.x, 1), bit(p.y, 1)).mul(16).add(b2(bit(p.x, 2), bit(p.y, 2)).mul(4)).add(b2(bit(p.x, 4), bit(p.y, 4))).add(0.5).div(64);

// tex: texture node of the finished frame (display space); gate: 0..1 extra on/off
export const screenFX = (tex, gate = float(1)) => Fn(() => {
  const res = HU.res, px = uv().mul(res);   // quad uv × drawing-buffer size (set from main every frame)
  const orig = tex.uv(px.div(res)).rgb;
  // tone of a sample point: luminance → contrast / brightness / gamma → "ink amount" (1 = full mark)
  const toneAt = (p) => {
    const c = tex.uv(p.div(res)).rgb;
    const l = dot(c, vec3(0.2126, 0.7152, 0.0722)).sub(0.5).mul(HU.contrast).add(0.5).add(HU.bright).clamp(0, 1);
    return pow(l, HU.gamma);
  };
  // ---- dither: one tone per dPx block, 8×8 Bayer threshold → N levels (2 = pure 1-bit)
  const blk = floor(px.div(HU.dPx)), bc = blk.add(0.5).mul(HU.dPx);
  const tD = toneAt(bc);
  const L = HU.levels.max(2).sub(1);
  const dq = floor(tD.mul(L).add(bayer8(blk).sub(0.5).add(HU.dBias)).add(0.5)).div(L).clamp(0, 1);
  // ---- halftone: rotated grid, tone read at the cell centre, one mark per cell
  const ca = cos(HU.angle), sa = sin(HU.angle);
  const rot = (v) => vec2(v.x.mul(ca).sub(v.y.mul(sa)), v.x.mul(sa).add(v.y.mul(ca)));
  const irot = (v) => vec2(v.x.mul(ca).add(v.y.mul(sa)), v.y.mul(ca).sub(v.x.mul(sa)));
  const q = rot(px).div(HU.size), cid = floor(q), cell = fract(q).sub(0.5);
  const centre = irot(cid.add(0.5).mul(HU.size));
  const tH = toneAt(centre);
  // mark coverage follows the tone of whatever the marks draw: with invert, marks are the LIGHT parts
  const amt = mix(float(1).sub(tH), tH, HU.invert).mul(HU.dotScale).clamp(0, 1.4);
  const aa = HU.soft.mul(0.35).add(float(0.7).div(HU.size));
  const circle = float(1).sub(smoothstep(sqrt(amt).mul(0.6).sub(aa), sqrt(amt).mul(0.6).add(aa), length(cell)));
  const square = float(1).sub(smoothstep(sqrt(amt).mul(0.5).sub(aa), sqrt(amt).mul(0.5).add(aa), max(abs(cell.x), abs(cell.y))));
  const armW = float(1).sub(sqrt(float(1).sub(amt.min(1)))).mul(0.5);            // cross area = coverage
  const crossD = min(abs(cell.x), abs(cell.y));
  const cross = float(1).sub(smoothstep(armW.sub(aa), armW.add(aa), crossD)).mul(step1(amt));
  const mark = select(HU.mode.equal(2), circle, select(HU.mode.equal(3), square, cross));
  const htTone = mix(float(1).sub(mark), mark, HU.invert);                         // 0 = dark ink, 1 = light
  const tone = select(HU.mode.equal(1), dq, htTone);
  const out = mix(vec3(HU.dark), vec3(HU.light), tone);
  const on = HU.mode.greaterThan(0.5).select(float(1), float(0)).mul(gate).mul(HU.mix);
  return mix(orig, out, on);
})();
