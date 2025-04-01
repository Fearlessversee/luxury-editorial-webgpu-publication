import { PAL, paletteCat, SunModel } from './palette.js';
import { painter } from './painterly.js';
import { GR, GR2, GR3, GR4, graffitiAt } from './graffiti.js';
// materials that take their colour from the palette sun (lighting model swapped in, see palette.js)
class SunMat extends THREE.MeshStandardNodeMaterial { setupLightingModel() { return this.sunModel || super.setupLightingModel(); } }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, normalWorld, normalView, positionViewDirection, positionWorld, positionLocal,
  max, dot, sin, cos, atan2, length, abs, fract, floor, step, attribute, uv, positionView, mrt,
} from 'three';

// The fortune-teller's tent, built procedurally around the table: velvet drapes and tent walls, a patterned
// medallion and tapestries, hanging lamp, rug, two carved chairs, candles, lantern, tarot cards on a draped
// tablecloth, skull ornaments — and shelves of specimen jars (crow, serpent, skull, wolf head, curled beast).
// Everything shares one "ink" material model, so in negative mode the whole room prints on scene 1's paper.

// ---------------------------------------------------------------- material model
// albedo: THREE.Color or node; pattern: node 0..1 multiplying the albedo luminance (damask, rug rings …)
// Yellow Paint Directive: the one accent colour on the paper-and-ink site (road markings first). Raw sRGB value.
export const ACC = { yellow: uniform(new THREE.Color().setHex(0xf5b000, THREE.LinearSRGBColorSpace)) };
export function makeInk(ctx) {
  const { BU, paper } = ctx;
  return function inkMat({ color = '#333', pattern = null, invert = true, rough = 0.8, glass = false, emissive = null, side = THREE.FrontSide, twoSided = false, flat = null, id = false, role, strokeK, lineOnly = false, accent = null } = {}) {
    const m = new SunMat({ roughness: rough, metalness: 0, side });
    const alb = vec3(uniform(new THREE.Color(color)));
    const albP = pattern ? alb.mul(pattern) : alb;
    const facing = dot(normalView, positionViewDirection);
    const n = twoSided ? normalWorld.normalize().mul(facing.sign()) : normalWorld.normalize();
    const lam = max(dot(n, BU.lightDir), 0);
    const hemi = n.y.mul(0.5).add(0.5);
    const rim = float(1).sub(twoSided ? abs(facing) : max(facing, 0)).pow(2.2).mul(twoSided ? 0.4 : 1);
    const shade = lam.mul(0.5).add(hemi.mul(0.35)).add(0.22).sub(rim.mul(0.3)).clamp(0, 1);
    const lum = dot(albP, vec3(0.299, 0.587, 0.114)).mul(1.8).clamp(0, 1);
    // flat: one solid tone (0 = ink … 1 = paper), no shading or texture — the outlines come from the post pass
    const tone0 = flat !== null ? (pattern ? float(flat).mul(pattern) : float(flat)) : (invert ? float(1).sub(lum) : lum).mul(shade);
    const tone = lineOnly ? mix(pattern ? pattern : float(1), tone0, BU.fills) : tone0;   // street: fills off → paper, only the pattern lines stay
    let ink = mix(BU.ink, paper, smoothstep(0.02, 0.92, tone).pow(BU.inkGamma).mul(0.9).add(0.1)).pow(2.2);
    // aerial depth: far parts of the corridor fade towards the paper, like the haze on the lake in scene 1
    // colour mode (palette): the material's own palette colour, cel-shaded in two bands, pattern lines in the
    // palette ink; darker authored tones (flat < 1) sit a little deeper
    const hazeK = BU.hazeAmt ? smoothstep(BU.hazeNear, BU.hazeFar, positionView.z.negate()).mul(BU.hazeAmt) : float(0);
    ink = mix(ink, paper.pow(2.2), hazeK);
    if (accent) ink = mix(vec3(accent).pow(2.2), paper.pow(2.2), hazeK);   // solid accent paint (still fades into the haze)
    if (ctx.graffiti) for (const [G, i] of [[GR, 1], [GR2, 2], [GR3, 3], [GR4, 4]]) ink = mix(ink, vec3(G.color).pow(2.2), graffitiAt(i));   // paint projected onto the walls (graffiti.js)
    // palette mode: colour comes from the sun lighting model (category ramp, stepped N·L, cast-shadow tint);
    // pattern lines stay as faint maroon lines, distance fades to the sky tone
    if (!glass) {
      const lines = pattern ? smoothstep(0.35, 0.98, pattern) : null;
      m.sunModel = new SunModel(paletteCat(color, role), { hazeK, lines, paint: painter(positionWorld, strokeK ?? ctx.strokeK ?? 1) });
      if (ctx.lights) m.lightsNode = ctx.lights();
      m.userData.sun = true;
    }
    m.colorNode = mix(albP, vec3(0), BU.inkMode);
    m.emissiveNode = ink.mul(BU.inkMode).mul(glass ? float(1) : float(1).sub(PAL.mode)).add(emissive ? vec3(uniform(new THREE.Color(emissive))).mul(float(1).sub(BU.inkMode)) : vec3(0));
    // piece id (uv.x, one random value per stone / plank / book) → the outline pass draws a line wherever it changes
    if (id) { m.mrtNode = mrt({ id: vec4(uv().x, 0, 0, 1) }); m.userData.id = true; }
    if (glass) { m.transparent = true; m.opacityNode = mix(float(0.18).add(rim.mul(0.6)), float(0.12).add(rim.mul(0.85)), BU.inkMode); m.depthWrite = false; }
    return m;
  };
}

// ---------------------------------------------------------------- procedural patterns (object-space)
const damask = Fn(() => {                       // repeating ornament for velvet / tapestry
  const p = uv().mul(vec2(10, 16));
  const c = fract(p).sub(0.5);
  const r = length(c);
  const a = atan2(c.y, c.x);
  const petal = smoothstep(0.02, 0.0, abs(r.sub(float(0.28).add(sin(a.mul(6)).mul(0.08)))));
  const dot_ = smoothstep(0.08, 0.05, r);
  return float(1).sub(petal.add(dot_).clamp(0, 1).mul(0.55));
})();
const rings = (scale, count) => Fn(() => {     // concentric rug / medallion motif
  const p = uv().sub(0.5).mul(2);
  const r = length(p), a = atan2(p.y, p.x);
  const band = sin(r.mul(count * 6.2832)).mul(0.5).add(0.5);
  const scallop = sin(a.mul(24).add(r.mul(40))).mul(0.5).add(0.5);
  const ornament = smoothstep(0.55, 0.9, band).mul(0.35).add(smoothstep(0.7, 0.95, scallop.mul(band)).mul(0.35));
  const edge = smoothstep(0.96, 1.0, r);
  return float(1).sub(ornament).sub(edge.mul(0.5)).mul(scale);
})();

// ---------------------------------------------------------------- geometry helpers
// keep indices and the primitives' own smooth normals (re-deriving them per face made everything look faceted)
const clean = (g) => {
  const n = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
};
const merge = (list) => mergeGeometries(list.map(clean));
const T = (g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => { g.scale(s, s, s); g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z); return g; };
const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
// bevelled box (rounded edges) instead of hard cubes
function box(w, h, d, rr = null) {
  const r = rr ?? Math.min(w, h, d) * 0.18, g = new THREE.BoxGeometry(w, h, d, 6, 6, 6), p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -ix, ix), THREE.MathUtils.clamp(v.y, -iy, iy), THREE.MathUtils.clamp(v.z, -iz, iz));
    const o = v.clone().sub(c); if (o.lengthSq() < 1e-12) continue;
    o.normalize(); p.setXYZ(i, c.x + o.x * r, c.y + o.y * r, c.z + o.z * r); n.setXYZ(i, o.x, o.y, o.z);
  }
  return g;
}
const cyl = (r0, r1, h, s = 20) => new THREE.CylinderGeometry(r0, r1, h, Math.max(40, s * 2));
const sph = (r, s = 16) => new THREE.SphereGeometry(r, Math.max(32, s * 2), Math.max(24, s * 1.5 | 0));
function tube(points, r, seg = 64, rad = 16) { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, rad, false); }
const rnd = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// draped velvet: a vertical sheet with folds, gathered towards its outer edge at a tie-back
function drape(w, h, { folds = 9, amp = 0.28, tieY = 0.42, tie = 0.6, side = 1 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, 90, 70);
  const p = g.attributes.position;
  const outer = side > 0 ? w / 2 : -w / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / w + 0.5, v = y / h + 0.5;                           // v: 0 bottom → 1 top
    const pinch = Math.exp(-(((v - tieY) / 0.22) ** 2)) * tie + (v < tieY ? (tieY - v) * tie * 0.4 : 0);
    const nx = outer + (x - outer) * (1 - Math.min(0.85, pinch));
    const f = (Math.sin(u * folds * Math.PI * 2 + v * 1.3) + Math.sin(u * folds * 4.3 + 0.7) * 0.3) * amp * (1 + pinch * 0.8);
    p.setXYZ(i, nx, y, f);
  }
  g.computeVertexNormals();
  return g;
}
// tent wall: a cylinder arc with vertical folds, normals facing inwards (seen from inside)
function tentWall(R, h, th0, th1, folds, amp) {
  const g = new THREE.CylinderGeometry(R, R, h, 260, 30, true, th0, th1 - th0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(x, z), d = 1 + (Math.sin(a * folds) * amp + Math.sin(a * folds * 2.3 + y * 0.2) * amp * 0.3) / R;
    p.setXYZ(i, x * d, y, z * d);
  }
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}
// ---------------------------------------------------------------- tablecloth: real cloth simulation
// Verlet particles on a grid (structural + shear + bend springs), gravity, friction on the tabletop,
// collision with the (super-ellipse) table top and the floor. Settled at build time, then kept alive with a
// light breeze and the cursor, so the hem sways and the corners swing into cone folds like real fabric.
export const RU = { time: uniform(0), wind: uniform(0.6), windDir: uniform(new THREE.Vector2(1, 0)) };

export class ClothSim {
  constructor(a, b, yTop, yFloor, { res = 110, drop = null, seed = 1 } = {}) {
    this.a = a; this.b = b; this.top = yTop; this.floor = yFloor;
    const d = drop ?? (yTop - yFloor) * 0.9;   // hem stops just above the floor
    const Lx = 2 * a + 2 * d, Lz = 2 * b + 2 * d;
    const nx = res, nz = Math.max(20, Math.round(res * Lz / Lx));
    this.nx = nx; this.nz = nz; const N = nx * nz;
    this.p = new Float32Array(N * 3); this.o = new Float32Array(N * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3, x = (i / (nx - 1) - 0.5) * Lx, z = (j / (nz - 1) - 0.5) * Lz;
      // start already draped: whatever lies beyond the table edge hangs straight down by that distance,
      // with a gentle ripple along the edge so the solver relaxes it into natural folds (corners → cone folds)
      const ex = Math.max(Math.abs(x) - a, 0), ez = Math.max(Math.abs(z) - b, 0), hangL = Math.hypot(ex, ez);
      if (hangL === 0) { this.p[k] = x; this.p[k + 1] = yTop + 0.015; this.p[k + 2] = z; }
      else {
        const px = Math.sign(x) * Math.min(Math.abs(x), a), pz = Math.sign(z) * Math.min(Math.abs(z), b);
        const ox = ex / hangL * Math.sign(x), oz = ez / hangL * Math.sign(z);
        const along = ex > 0 && ez === 0 ? z : ez > 0 && ex === 0 ? x : x + z;
        const rip = Math.sin(along * 2.2 + seed) * 0.24 * Math.min(1, hangL * 0.6) + Math.sin(along * 4.7 + 1.3) * 0.08 * Math.min(1, hangL);
        const out = 0.03 + rip + hangL * 0.04;
        this.p[k] = px + ox * out; this.p[k + 1] = Math.max(yFloor + 0.02, yTop - hangL * 0.98); this.p[k + 2] = pz + oz * out;
      }
    }
    this.o.set(this.p);
    // the middle of the cloth is held by friction (and the objects on it): pin its flat position
    this.pin = new Uint8Array(N); this.fx = new Float32Array(N); this.fz = new Float32Array(N);
    for (let n = 0; n < N; n++) { this.fx[n] = this.p[n * 3]; this.fz[n] = this.p[n * 3 + 2]; this.pin[n] = Math.abs(this.fx[n]) < a * 0.8 && Math.abs(this.fz[n]) < b * 0.8 ? 1 : 0; }
    const C = [];
    const link = (i0, j0, i1, j1, s) => { if (i1 < 0 || j1 < 0 || i1 >= nx || j1 >= nz) return; const A = j0 * nx + i0, B = j1 * nx + i1; C.push(A, B, Math.hypot((i1 - i0) * Lx / (nx - 1), (j1 - j0) * Lz / (nz - 1)), s); };   // rest length = flat sheet spacing
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      link(i, j, i + 1, j, 1); link(i, j, i, j + 1, 1);                 // structural
      link(i, j, i + 1, j + 1, 0.6); link(i + 1, j, i, j + 1, 0.6);    // shear
      link(i, j, i + 2, j, 0.25); link(i, j, i, j + 2, 0.25);           // bend (soft → fabric, not card)
    }
    this.c = new Float32Array(C);
    // geometry
    const g = new THREE.BufferGeometry(), uvs = new Float32Array(N * 2), idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { uvs[(j * nx + i) * 2] = i / (nx - 1); uvs[(j * nx + i) * 2 + 1] = j / (nz - 1); }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const q = j * nx + i; idx.push(q, q + nx, q + 1, q + 1, q + nx, q + nx + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx);
    this.geometry = g;
    this.t = 0;
    for (let s = 0; s < 150; s++) this.step(1 / 60, 4, 0);          // relax the analytic drape into real folds
    this.smooth(10);
    // how far each point hangs below the tabletop (0 on top → 1 at the hem): drives the breeze in the shader
    const hang = new Float32Array(N), drop_ = yTop - yFloor;
    for (let n = 0; n < N; n++) hang[n] = Math.min(1, Math.max(0, (yTop - this.p[n * 3 + 1]) / drop_));
    g.setAttribute('hang', new THREE.BufferAttribute(hang, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
  }
  smooth(passes) {     // relax the hanging part: removes solver noise, keeps the big folds
    const { nx, nz, p } = this, q = new Float32Array(p.length);
    for (let s = 0; s < passes; s++) {
      q.set(p);
      for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const n = j * nx + i, k = n * 3; if (p[k + 1] > this.top - 0.03) continue;
        for (let c = 0; c < 3; c++) q[k + c] = p[k + c] * 0.5 + (p[k + c - 3] + p[k + c + 3] + p[k + c - nx * 3] + p[k + c + nx * 3]) * 0.125;
      }
      p.set(q);
    }
  }
  inside(x, z) { return (Math.abs(x) / this.a) ** 4 + (Math.abs(z) / this.b) ** 4; }
  step(dt, iters = 2, wind = 0, windDir = [1, 0]) {
    const p = this.p, o = this.o, N = p.length / 3, g = -9.8 * dt * dt * 2.2, damp = 0.985, top = this.top;
    this.t += dt;
    for (let n = 0; n < N; n++) {
      const k = n * 3;
      const vx = (p[k] - o[k]) * damp, vy = (p[k + 1] - o[k + 1]) * damp, vz = (p[k + 2] - o[k + 2]) * damp;
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2];
      // breeze acts on the hanging part only, varying along the hem
      const hang = p[k + 1] < top - 0.05 ? 1 : 0;
      const w = wind * hang * dt * dt * (0.6 + 0.4 * Math.sin(this.t * 1.7 + p[k] * 0.6 + p[k + 2] * 0.5));
      p[k] += vx + w * windDir[0]; p[k + 1] += vy + g; p[k + 2] += vz + w * windDir[1];
    }
    const c = this.c, M = c.length;
    for (let it = 0; it < iters; it++) {
      for (let q = 0; q < M; q += 4) {
        const A = c[q] * 3, B = c[q + 1] * 3, rest = c[q + 2], s = c[q + 3];
        const dx = p[B] - p[A], dy = p[B + 1] - p[A + 1], dz = p[B + 2] - p[A + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        if (s < 1 && L < rest) continue;                            // bend/shear springs only resist stretching → soft folds
        const f = ((L - rest) / L) * 0.5 * s;
        p[A] += dx * f; p[A + 1] += dy * f; p[A + 2] += dz * f;
        p[B] -= dx * f; p[B + 1] -= dy * f; p[B + 2] -= dz * f;
      }
      for (let n = 0; n < N; n++) {                                  // collisions
        const k = n * 3, x = p[k], z = p[k + 2];
        const e = this.inside(x, z);
        if (e <= 1 && p[k + 1] < top + 0.015) {
          // inside the tabletop footprint: leave by the nearest face (up onto the top, or out through the side)
          const s = 1 / Math.pow(Math.max(e, 1e-6), 0.25), side = Math.hypot(x, z) * (s - 1), depth = top - p[k + 1];
          if (depth < side) { p[k + 1] = top + 0.015; o[k + 1] = p[k + 1]; if (this.pin[n]) { p[k] = this.fx[n]; p[k + 2] = this.fz[n]; } o[k] = p[k]; o[k + 2] = p[k + 2]; }   // cloth on the top doesn't slide
          else { p[k] = x * s * 1.002; p[k + 2] = z * s * 1.002; o[k] = p[k]; o[k + 2] = p[k + 2]; }
        }
        if (p[k + 1] < this.floor + 0.01) p[k + 1] = this.floor + 0.01;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

function chair() {
  const p = [];
  p.push(T(box(1.9, 0.18, 1.8), 0, 1.6, 0));                                       // seat
  const leg = lathe([[0, 0], [0.08, 0], [0.07, 0.3], [0.11, 0.45], [0.07, 0.6], [0.06, 1.1], [0.1, 1.3], [0.09, 1.55], [0, 1.55]], 40);
  for (const [x, z] of [[-0.85, -0.8], [0.85, -0.8], [-0.85, 0.8], [0.85, 0.8]]) p.push(leg.clone().translate(x, 0, z)); // turned legs
  p.push(T(box(0.12, 3.0, 0.12), -0.85, 3.1, -0.85), T(box(0.12, 3.0, 0.12), 0.85, 3.1, -0.85)); // back posts
  p.push(T(box(1.8, 0.35, 0.1), 0, 4.45, -0.85), T(box(1.8, 0.12, 0.1), 0, 2.4, -0.85));
  for (let i = 0; i < 5; i++) p.push(T(box(0.1, 1.9, 0.06), -0.6 + i * 0.3, 3.35, -0.85));   // slats
  p.push(T(sph(0.12, 10), -0.85, 4.65, -0.85), T(sph(0.12, 10), 0.85, 4.65, -0.85));        // finials
  for (const x of [-0.85, 0.85]) { p.push(T(box(0.12, 0.1, 1.7), x, 2.55, 0)); p.push(T(box(0.1, 0.95, 0.1), x, 2.05, 0.8)); } // arms
  return merge(p);
}
function cushion(w, h, d) { const g = sph(1, 20); g.scale(w / 2, h / 2, d / 2); return g; }
function candle(h, r = 0.12) {
  // wax body with a melted, uneven rim and drips running down
  const prof = [[0, 0], [r * 1.04, 0], [r * 1.02, h * 0.5], [r, h * 0.92], [r * 1.08, h * 0.97], [r * 0.8, h], [r * 0.3, h * 0.985], [0, h * 0.98]];
  const parts = [lathe(prof, 48), cyl(0.012, 0.012, 0.14, 8).translate(0, h + 0.05, 0)];
  for (let i = 0; i < 5; i++) { const a = rnd(i + h * 10) * 6.28, L = h * (0.15 + rnd(i, 4) * 0.4); const d = cyl(r * 0.16, r * 0.1, L, 10); d.translate(Math.cos(a) * r * 1.02, h - L / 2 - 0.02, Math.sin(a) * r * 1.02); parts.push(d, sph(r * 0.17, 10).translate(Math.cos(a) * r * 1.02, h - L - 0.02, Math.sin(a) * r * 1.02)); }
  return merge(parts);
}
function holder(r) { return lathe([[0, 0], [r * 2.2, 0], [r * 2.3, 0.05], [r * 2.1, 0.1], [r * 1.25, 0.12], [r * 1.25, 0.3], [0, 0.3]], 64); }
function books(n, seed) {
  const out = []; let y = 0;
  for (let i = 0; i < n; i++) { const w = 0.9 + rnd(seed + i) * 0.4, t = 0.14 + rnd(seed + i, 2) * 0.1; out.push(box(w, t, 0.65, 0.03).rotateY((rnd(seed + i, 3) - 0.5) * 0.4).translate(0, y + t / 2, 0)); y += t; }
  return merge(out);
}
function crystal(h) { const g = new THREE.ConeGeometry(h * 0.25, h, 6); g.translate(0, h / 2, 0); const g2 = new THREE.ConeGeometry(h * 0.25, h * 0.3, 6); g2.rotateX(Math.PI); g2.translate(0, -h * 0.15 + 0.001, 0); return merge([g, g2.translate(0, h * 0.15, 0)]); }
function flame(h) { const g = sph(0.07, 10); g.scale(1, 2.2, 1); g.translate(0, h + 0.2, 0); return g; }
function skull(s = 1) {
  const c = sph(0.5, 18); c.scale(1, 0.9, 1.05);
  const jaw = box(0.55, 0.28, 0.5); jaw.translate(0, -0.42, 0.18);
  const eyeL = sph(0.13, 8); eyeL.translate(-0.18, -0.05, 0.43);
  const eyeR = sph(0.13, 8); eyeR.translate(0.18, -0.05, 0.43);
  return { bone: merge([c, jaw]).scale(s, s, s), eyes: merge([eyeL, eyeR]).scale(s, s, s) };
}
function lantern() {
  const p = [cyl(0.32, 0.36, 0.08, 16).translate(0, 0.04, 0), cyl(0.36, 0.3, 0.1, 16).translate(0, 0.95, 0), lathe([[0.0, 1.35], [0.12, 1.3], [0.28, 1.05], [0.3, 1.0]], 16)];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; p.push(T(box(0.04, 0.9, 0.04), Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3)); }
  p.push(new THREE.TorusGeometry(0.15, 0.025, 6, 16).rotateX(0).translate(0, 1.5, 0));
  return merge(p);
}
function lampshade() {
  const p = [lathe([[0.2, 0], [1.2, -1.1], [2.2, -2.6], [2.3, -2.75]], 48)];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; p.push(T(cyl(0.02, 0.02, 0.45, 4), Math.cos(a) * 2.3, -3.0, Math.sin(a) * 2.3)); }
  p.push(cyl(0.03, 0.03, 6, 6).translate(0, 3, 0));
  for (let i = 0; i < 3; i++) { const g = tube([new THREE.Vector3(0, -1, 0), new THREE.Vector3((i - 1) * 0.35, -3.2, 0.2), new THREE.Vector3((i - 1) * 0.25, -4.1 - i * 0.2, 0.25)], 0.02, 20, 4); p.push(g, sph(0.1, 8).translate((i - 1) * 0.25, -4.2 - i * 0.2, 0.25)); }
  return merge(p);
}

// ---------------------------------------------------------------- specimen jars
const JAR_TYPES = [
  // [profile points (x,y), handle?]
  { pts: [[0, 0], [0.55, 0], [0.62, 0.1], [0.62, 1.7], [0.55, 1.85], [0.45, 1.9], [0.45, 2.05], [0, 2.05]], handle: true, cork: [0.46, 0.12] },            // tall jar
  { pts: [[0, 0], [0.38, 0], [0.42, 0.1], [0.42, 1.5], [0.3, 1.75], [0.16, 1.85], [0.16, 2.2], [0, 2.2]], handle: true, cork: [0.17, 0.18] },               // bottle
  { pts: [[0, 0], [0.48, 0], [0.55, 0.12], [0.58, 1.1], [0.45, 1.55], [0.22, 1.7], [0.22, 1.85], [0, 1.85]], handle: false, cork: [0.23, 0.14] },          // flask
  { pts: [[0, 0], [0.6, 0], [0.68, 0.15], [0.7, 1.3], [0.45, 1.55], [0.3, 1.62], [0.3, 1.78], [0, 1.78]], handle: true, cork: [0.31, 0.14] },              // jug
  { pts: [[0, 0], [0.75, 0], [0.7, 0.2], [0.3, 1.05], [0.18, 1.2], [0.18, 1.5], [0, 1.5]], handle: false, cork: [0.19, 0.2], spout: true },                // conical flask
];
function jarGlass(t) {
  const p = [lathe(t.pts.slice(0, -1).map(([x, y]) => [x, y]), 28)];
  if (t.handle) { const top = t.pts[3], r = top[0]; p.push(new THREE.TorusGeometry(0.28, 0.06, 8, 16, Math.PI * 1.2).rotateZ(-Math.PI * 0.6).translate(-r - 0.12, top[1] * 0.55, 0)); }
  if (t.spout) p.push(T(cyl(0.07, 0.07, 0.5, 8), 0.38, 0.95, 0, 0, 0, -0.9));
  return merge(p);
}
function jarContents(kind, t, crowGeo) {
  const h = t.pts[3][1], r = t.pts[2][0] * 0.82, out = [];
  if (kind === 'crow' && crowGeo) {
    const g = crowGeo.clone(); g.computeBoundingBox(); const bb = g.boundingBox, sz = bb.getSize(new THREE.Vector3());
    const s = (h * 0.8) / sz.y; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); g.scale(s, s, s); g.rotateY(Math.PI / 2 + 0.3); g.translate(0, 0.15, 0); out.push(g);
  } else if (kind === 'snake') {
    const pts = []; for (let i = 0; i <= 60; i++) { const a = i * 0.55, y = 0.2 + (i / 60) * h * 0.85; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.55, y, Math.sin(a) * r * 0.55)); }
    out.push(tube(pts, r * 0.22, 240, 10), sph(r * 0.3, 12).scale(1.3, 0.8, 1).translate(pts[60].x, pts[60].y + 0.05, pts[60].z));
  } else if (kind === 'skull') {
    const s = skull(r * 0.9); s.bone.translate(0, h * 0.35, 0); out.push(s.bone, s.eyes.translate(0, h * 0.35, 0.02));
    out.push(cone(r * 0.5, r * 1.1).rotateX(-1.2).translate(0, h * 0.38, r * 0.5));   // snout
  } else if (kind === 'wolf') {
    const head = sph(r * 0.8, 16); head.scale(1, 1.3, 1); head.translate(0, h * 0.55, 0);
    const snout = cone(r * 0.45, r * 1.4).rotateX(Math.PI).translate(0, h * 0.18, 0.05);
    const ear1 = cone(r * 0.22, r * 0.6).translate(-r * 0.4, h * 0.95, 0), ear2 = cone(r * 0.22, r * 0.6).translate(r * 0.4, h * 0.95, 0);
    const fur = []; for (let i = 0; i < 26; i++) { const a = rnd(i) * 6.28, yy = h * (0.35 + rnd(i, 2) * 0.55); fur.push(cone(r * 0.12, r * 0.5).rotateZ((rnd(i, 3) - 0.5) * 1.5).translate(Math.cos(a) * r * 0.75, yy, Math.sin(a) * r * 0.75)); }
    out.push(head, snout, ear1, ear2, ...fur);
  } else { // curled winged beast
    const pts = []; for (let i = 0; i <= 40; i++) { const a = i * 0.16 + 0.5; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.62, h * 0.5 + Math.sin(a) * h * 0.36, Math.sin(i * 0.2) * r * 0.2)); }
    out.push(tube(pts, r * 0.2, 120, 10));
    for (let i = 0; i < 18; i++) { const p = pts[(i * 2) % 40]; out.push(cone(r * 0.08, r * 0.45).rotateZ(rnd(i) * 3).translate(p.x, p.y, p.z)); }
  }
  return merge(out);
}
function cone(r, h) { return new THREE.ConeGeometry(r, h, 24); }

// ---------------------------------------------------------------- the room
export function buildRoom(inkMat, { crowGeo, tableTop, floorY, tableW, tableD }) {
  const room = new THREE.Group();
  const H = 26, F = floorY;
  const add = (geo, mat, shadow = true, parent = room) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const walls = new THREE.Group(); room.add(walls); room.userData.walls = walls;
  const addW = (geo, mat, shadow = true) => add(geo, mat, shadow, walls);

  const velvet = inkMat({ color: '#1b2a5e', pattern: damask, side: THREE.DoubleSide });
  const velvetDark = inkMat({ color: '#111a3a', pattern: damask, side: THREE.DoubleSide });
  const wood = inkMat({ color: '#3a2618' });
  const brass = inkMat({ color: '#8a6a3a', rough: 0.4 });
  const cream = inkMat({ color: '#d8ccb0', invert: false });
  const orange = inkMat({ color: '#b5501e', pattern: rings(1, 7) });
  const rugMat = inkMat({ color: '#8a4a2a', pattern: rings(1, 12) });
  const clothMat = inkMat({ color: '#15204a', pattern: damask, side: THREE.DoubleSide, twoSided: true });
  const bone = inkMat({ color: '#d9d0bb', invert: false });
  const dark = inkMat({ color: '#0e0c0a' });
  const glass = inkMat({ color: '#b7c9a8', invert: false, glass: true, side: THREE.DoubleSide });
  const liquid = inkMat({ color: '#6b6a45', invert: false, glass: true });
  const cork = inkMat({ color: '#9a7446' });
  const flameMat = inkMat({ color: '#ffd28a', invert: false, emissive: '#ffb347' });

  // floor + rug
  add(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2).translate(0, F, 0), inkMat({ color: '#241a14' }), false);
  add(new THREE.CircleGeometry(12, 96).rotateX(-Math.PI / 2).translate(0, F + 0.02, 0.5), rugMat, false);

  // tent: back wall + side walls (folded velvet), a ceiling canopy
  addW(tentWall(20, H, Math.PI * 0.28, Math.PI * 1.72, 70, 0.22).translate(0, F + H / 2, 2), velvetDark, false);   // open towards the camera
  // front drapes framing the view, tied back
  addW(drape(10, H + 2, { side: -1, folds: 10 }).translate(-14, F + H / 2 + 1, 10), velvet);
  addW(drape(10, H + 2, { side: 1, folds: 10 }).translate(14, F + H / 2 + 1, 10), velvet);
  // tie-back tassels
  for (const x of [-16.2, 16.2]) addW(merge([sph(0.35, 10).translate(x, F + H * 0.46, 10.6), cone(0.3, 1.2).rotateX(Math.PI).translate(x, F + H * 0.46 - 0.8, 10.6)]), brass);

  // back wall: medallion + tapestries
  const wallZ = -15.5;
  addW(new THREE.CylinderGeometry(4.2, 4.2, 0.3, 96).rotateX(Math.PI / 2).translate(0, F + 13.5, wallZ + 0.4), orange);
  addW(new THREE.TorusGeometry(4.25, 0.12, 8, 96).translate(0, F + 13.5, wallZ + 0.6), brass);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; addW(sph(0.14, 8).translate(Math.cos(a) * 3.6, F + 13.5 + Math.sin(a) * 3.6, wallZ + 0.62), brass, false); }
  addW(new THREE.PlaneGeometry(5.5, 12, 1, 1).translate(10.5, F + 12, wallZ + 1.2).rotateY(-0.25), inkMat({ color: '#1f2c63', pattern: damask, side: THREE.DoubleSide }));
  addW(new THREE.PlaneGeometry(4.5, 5, 1, 1).translate(-12, F + 14, wallZ + 2.2).rotateY(0.3), inkMat({ color: '#2a1c3a', pattern: rings(1, 5), side: THREE.DoubleSide }));

  // hanging lampshade with fringe, above the table
  add(lampshade().translate(0, F + H - 1.5, -2), orange);

  // shelves with specimen jars (two banks on the back wall, either side of the medallion)
  const kinds = ['crow', 'wolf', 'beast', 'snake', 'skull', 'crow', 'beast', 'wolf', 'snake', 'skull'];
  let k = 0;
  const jarGlassGeos = [], jarInside = [], jarLiquid = [], jarCorks = [];
  for (const side of [-1, 1]) {
    const cx = side * 9.2, rot = -side * 0.22;
    for (let s = 0; s < 3; s++) {
      const y = F + 5.5 + s * 4.1;
      const shelf = box(7.5, 0.22, 1.8); const br1 = box(0.2, 0.8, 1.2).translate(-3.2, -0.5, 0), br2 = box(0.2, 0.8, 1.2).translate(3.2, -0.5, 0);
      add(merge([shelf, br1, br2]).rotateY(rot).translate(cx, y, wallZ + 3.2), wood);
      for (let j = 0; j < 4; j++) {
        const t = JAR_TYPES[(k + j + s) % JAR_TYPES.length], sc = 0.85 + rnd(k, 5) * 0.4;
        const lx = -2.6 + j * 1.75 + (rnd(k, 1) - 0.5) * 0.3;
        const place = (g) => g.scale(sc, sc, sc).translate(lx, 0.11, 0).rotateY(rot).translate(cx, y, wallZ + 3.2);
        jarGlassGeos.push(place(jarGlass(t)));
        jarInside.push(place(jarContents(kinds[k % kinds.length], t, crowGeo)));
        const inner = lathe(t.pts.slice(0, 4).map(([x, yy], i) => [x * 0.94, Math.min(yy, t.pts[3][1] * (0.55 + rnd(k, 7) * 0.35))]), 24);
        jarLiquid.push(place(inner));
        const [cr, ch] = t.cork; jarCorks.push(place(cyl(cr * 1.05, cr * 0.95, ch, 12).translate(0, t.pts[t.pts.length - 1][1] + ch / 2 - 0.02, 0)));
        k++;
      }
    }
  }
  add(merge(jarInside), dark);
  add(merge(jarCorks), cork);
  const liq = add(merge(jarLiquid), liquid, false); liq.renderOrder = 2;
  const gl = add(merge(jarGlassGeos), glass, false); gl.renderOrder = 3;

  // chairs with cushions
  for (const side of [-1, 1]) {
    const c = chair(); c.rotateY(side * -1.2).translate(side * 8.3, F, -1.5); add(c, wood);
    add(cushion(1.7, 0.45, 1.6).rotateY(side * -1.2).translate(side * 8.3, F + 1.9, -1.5), velvet);
    add(cushion(1.5, 1.3, 0.4).rotateY(side * -1.2).rotateX(0).translate(side * 8.3 + side * 0.55, F + 3.2, -1.5 - 0.55), velvet);
  }

  // left side table with skulls, right urn, stacked boxes, floor candles
  add(merge([cyl(1.1, 1.1, 0.15, 24).translate(-7.2, F + 3.2, -7), cyl(0.12, 0.12, 3.1, 10).translate(-7.2, F + 1.6, -7), cyl(0.7, 0.8, 0.12, 20).translate(-7.2, F + 0.06, -7)]), wood);
  for (const [x, z, s] of [[-7.5, -7.2, 0.45], [-6.8, -6.6, 0.32]]) { const sk = skull(s); add(sk.bone.translate(x, F + 3.5 + s * 0.4, z), bone); add(sk.eyes.translate(x, F + 3.5 + s * 0.4, z), dark, false); }
  add(lathe([[0, 0], [0.9, 0.1], [1.4, 1.2], [1.2, 2.4], [0.6, 2.9], [0.7, 3.2], [0, 3.2]], 32).translate(10.5, F, 1.5), orange);
  add(merge([box(2.2, 1.6, 1.8).translate(-11.5, F + 0.8, 4), box(1.8, 1.2, 1.6).rotateY(0.3).translate(-11.3, F + 2.2, 4)]), wood);
  const floorCandles = [[9.5, 5.5, 1.2], [10.4, 6.2, 0.8], [8.8, 6.6, 1.6], [-9.8, 6.4, 1.0]];
  for (const [x, z, h] of floorCandles) { add(holder(0.28).translate(x, F, z), brass); add(candle(h, 0.28).translate(x, F + 0.3, z), cream); add(flame(h).scale(2, 2, 2).translate(x, F - h + 0.3, z), flameMat, false); }
  add(books(5, 3).translate(-7.0, F + 3.28, -6.3), wood);
  add(books(4, 11).rotateY(0.4).translate(-11.2, F + 2.8, 4.1), wood);
  // rug fringe
  add(merge([...Array(160).keys()].map((i) => { const a = (i / 160) * Math.PI * 2; return cyl(0.03, 0.02, 0.45, 6).rotateZ(Math.PI / 2).rotateY(-a).translate(Math.cos(a) * 12.2, F + 0.03, 0.5 + Math.sin(a) * 12.2); })), rugMat, false);

  // hanging skull strings on the left wall
  for (let i = 0; i < 5; i++) {
    const x = -13 + i * 0.9, y = F + 15 - rnd(i) * 2;
    add(cyl(0.015, 0.015, 3, 4).translate(x, y + 1.5, wallZ + 4 + i * 0.3), dark, false);
    const sk = skull(0.35); add(sk.bone.translate(x, y, wallZ + 4 + i * 0.3), bone); add(sk.eyes.translate(x, y, wallZ + 4 + i * 0.3), dark, false);
  }

  // tablecloth (the focus) + things on it
  const sim = new ClothSim(tableW / 2 + 0.05, tableD / 2 + 0.05, tableTop + 0.012, F + 0.03, { res: 96 });
  // live motion is done on the GPU: the settled drape is displaced by a smooth travelling breeze that grows
  // towards the hem — no per-frame solver, so no jitter
  clothMat.positionNode = Fn(() => {
    const h = attribute('hang', 'float').pow(1.4);
    const p = positionLocal;
    const t = RU.time;
    const wave = sin(t.mul(1.1).add(p.x.mul(0.55)).add(p.z.mul(0.4))).mul(0.6)
      .add(sin(t.mul(1.9).add(p.x.mul(1.3)).sub(p.z.mul(0.9))).mul(0.3))
      .add(sin(t.mul(0.6).add(p.z.mul(0.3))).mul(0.4));
    const out = vec3(p.x, 0, p.z).normalize();
    const disp = out.mul(wave.add(0.35)).add(vec3(RU.windDir.x, 0, RU.windDir.y).mul(0.6)).mul(RU.wind).mul(h).mul(0.18);
    return p.add(vec3(disp.x, disp.y.sub(h.mul(RU.wind).mul(0.02)), disp.z));
  })();
  const clothMesh = add(sim.geometry, clothMat); clothMesh.frustumCulled = false;
  room.userData.cloth = sim;
  const TT = tableTop + 0.02;
  add(lantern().translate(tableW * 0.3, TT, -tableD * 0.18), brass);
  add(flame(0.35).translate(tableW * 0.3, TT + 0.2, -tableD * 0.18), flameMat, false);
  for (const [x, z, h] of [[-tableW * 0.34, -tableD * 0.2, 0.9], [-tableW * 0.26, -tableD * 0.3, 0.6], [tableW * 0.12, -tableD * 0.34, 0.75]]) {
    add(holder(0.13).translate(x, TT, z), brass);
    add(candle(h, 0.13).translate(x, TT + 0.3, z), cream); add(flame(h).translate(x, TT + 0.3, z), flameMat, false);
  }
  // crystal cluster, a small stack of books, a bowl of stones — table clutter around the ball
  const cx0 = -tableW * 0.12, cz0 = -tableD * 0.36;
  add(merge([0, 1, 2, 3, 4].map((i) => crystal(0.35 + rnd(i, 9) * 0.35).rotateZ((rnd(i, 1) - 0.5) * 0.9).rotateX((rnd(i, 2) - 0.5) * 0.6).translate(cx0 + (rnd(i, 3) - 0.5) * 0.4, TT, cz0 + (rnd(i, 4) - 0.5) * 0.3))), glass);
  add(books(3, 7).translate(tableW * 0.36, TT, tableD * 0.18), wood);
  add(lathe([[0, 0], [0.45, 0.02], [0.6, 0.18], [0.62, 0.22], [0, 0.12]], 64).translate(tableW * 0.05, TT, -tableD * 0.3), brass);
  add(merge([0, 1, 2, 3, 4, 5, 6].map((i) => sph(0.1 + rnd(i, 5) * 0.06).scale(1, 0.7, 1).translate(tableW * 0.05 + (rnd(i, 6) - 0.5) * 0.6, TT + 0.2, -tableD * 0.3 + (rnd(i, 7) - 0.5) * 0.5))), dark);
  // tarot cards fanned in front of the ball
  const cards = [];
  const faces = [];
  for (let i = 0; i < 6; i++) {
    const x = -1.9 + i * 0.75 + (rnd(i) - 0.5) * 0.2, z = tableD * 0.3 + (rnd(i, 2) - 0.5) * 0.3, ry = (rnd(i, 3) - 0.5) * 0.8, y = TT + 0.01 + i * 0.004;
    cards.push(T(box(0.55, 0.012, 0.9, 0.005), x, y, z, ry));
    faces.push(T(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), x, y + 0.008, z, ry), T(box(0.45, 0.004, 0.8, 0.001), x, y + 0.004, z, ry).scale(1, 1, 1));
  }
  add(merge(cards), cream, false);
  add(merge(faces.filter((_, i) => i % 2 === 0)), dark, false);

  // warm candle lights for the colour (non-negative) look
  const lights = [];
  for (const [x, y, z, i] of [[tableW * 0.3, TT + 0.6, -tableD * 0.18, 18], [-tableW * 0.3, TT + 1, -tableD * 0.25, 10], [9.5, F + 2, 6, 14], [0, F + H - 4.5, -2, 26]]) {
    const l = new THREE.PointLight('#ffb35a', i, 18, 1.6); l.position.set(x, y, z); room.add(l); lights.push(l);
  }
  room.userData.lights = lights;
  return room;
}
