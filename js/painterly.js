import { uniform, Fn, vec3, vec4, float, floor, fract, sin, dot, mix, normalize, If, mx_noise_float, normalWorld, cameraViewMatrix } from 'three';

// Painterly shading after "Making 3D animation look painterly" (painted object-space normal maps): the smooth
// normal is replaced by big, flat, brush-stroke-shaped patches of normal — as if the normal map had been painted
// with a broad brush. Done procedurally: the object-space NORMAL itself is cut into Voronoi cells (so every cell
// is one flat "painted" direction), and the cell borders are warped by stretched noise so they read as strokes.
// Light stays soft; colour varies only a little per stroke (brush-stroke base colour).
export const PT = {
  on: uniform(1),
  nScale: uniform(2.6),     // how many painted patches around an object (normal-space cell density)
  warp: uniform(0.45),      // stroke-shaped borders: how far the noise pushes the patches
  warpScale: uniform(0.9),  // size of the stroke shapes on the surface (world units × scene factor)
  stretch: uniform(3.5),    // bristle direction stretch of the stroke noise
  dab: uniform(0.9),        // painted normal vs real normal
  paint: uniform(0.22),     // colour variation per stroke (A → B tone)
  soft: uniform(0.22),      // softness of the light/shade transition
  boil: uniform(0),         // stepped time (set from main)
};

const hash3 = (p) => fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

// 3D Voronoi F1 → the nearest feature point (absolute position in q space)
const voronoiPoint = Fn(([q]) => {
  const cell = floor(q), f = fract(q);
  const best = float(1e9).toVar(), pt = vec3(0).toVar();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const g = vec3(x, y, z), h = hash3(cell.add(g)), d = g.add(h).sub(f), dd = dot(d, d);
    If(dd.lessThan(best), () => { best.assign(dd); pt.assign(cell.add(g).add(h)); });
  }
  return pt;
}).setLayout({ name: 'paintVoronoiPt', type: 'vec3', inputs: [{ name: 'q', type: 'vec3' }] });

// p: world position; k: scene scale factor (city/atom units are much bigger than the street's)
export function painter(p, k = 1) {
  const s = p.mul(PT.warpScale.mul(k)).add(vec3(PT.boil.mul(13.1), PT.boil.mul(7.7), PT.boil.mul(3.3)));
  const st = s.mul(vec3(1, PT.stretch, 1));
  const w = vec3(mx_noise_float(st), mx_noise_float(st.add(17.3)), mx_noise_float(st.add(31.7)));   // stroke warp
  const nW = normalWorld;
  const qn = nW.mul(PT.nScale).add(w.mul(PT.warp));
  const fp = voronoiPoint(qn);
  const painted = normalize(fp.add(nW.mul(0.001)));                          // the cell's painted direction
  const pW = normalize(mix(nW, painted, PT.dab.mul(PT.on)));
  const pN = normalize(cameraViewMatrix.mul(vec4(pW, 0)).xyz);
  const v = hash3(floor(fp.mul(7.13))).x.mul(PT.paint).mul(PT.on);            // brush-stroke base colour
  return { pN, v };
}
