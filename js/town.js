import { setRoles } from './palette.js';
import { inkLine } from './lines.js';
import * as THREE from 'three';
import { tagSfx } from './sound.js';
import { ACC } from './room.js';
import { signGeo, signPattern, signAlpha, poleSign, barricade, placeOn, pick, Flyers } from './props.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Fn, float, abs, fract, smoothstep, fwidth, positionWorld, uv, texture } from 'three';

// Scene 3: a small-town American street on Halloween, in the same print style as the church (paper fill,
// even ink outlines between every piece). The street runs along +x from the origin; houses with porches on
// both sides, autumn trees shedding leaves, parked 60s sedans, power poles and wires, carved pumpkins
// everywhere, lawn ghosts, tombstones, cobwebs — and kids in (all different) Halloween costumes.
// Units: 1 ≈ 0.3 m. Ground at y = 0 (the group sits at the church's outside ground level).

const rnd = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 7.7) * 43758.5453; return x - Math.floor(x); };
let seedN = 1; const R = () => rnd(seedN++, 3);
// piece id in uv.x (→ an ink line wherever pieces meet); uv.y is kept for geometry that carries a pattern coordinate
const tag = (g, t = Math.random()) => {
  const n = g.attributes.position.count, old = g.attributes.uv, keep = g.userData.keepV;
  const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = t; a[i * 2 + 1] = keep && old ? old.getY(i) : 0; }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a, 2)); g.userData.tagged = true; return g;
};
const clean = (g) => {
  const n = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.userData.tagged || !n.attributes.uv) tag(n);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
};
const merge = (list) => { const L = list.map(clean); const r = mergeGeometries(L); if (!r) { const ks = L.map((g) => Object.keys(g.attributes).join(',') + (g.index ? '+i' : '')); console.error('MERGE', 'town.js', [...new Set(ks)].join(' | ')); } return r; };
function bbox(w, h, d, r = null) {
  r = r ?? Math.min(w, h, d) * 0.12;
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2), p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -ix, ix), THREE.MathUtils.clamp(v.y, -iy, iy), THREE.MathUtils.clamp(v.z, -iz, iz));
    const o = v.clone().sub(c); if (o.lengthSq() < 1e-12) continue;
    o.normalize(); p.setXYZ(i, c.x + o.x * r, c.y + o.y * r, c.z + o.z * r); n.setXYZ(i, o.x, o.y, o.z);
  }
  return g;
}
const B = (w, h, d, x, y, z, r) => bbox(w, h, d, r).translate(x, y, z);
const cyl = (r0, r1, h, s = 16) => new THREE.CylinderGeometry(r0, r1, h, s);
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const tube = (pts, r, seg = 24, rad = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const place = (list, m) => list.map((g) => g.applyMatrix4(m));
const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V(s, s, s));
const ell = (r, x, y, z, sx = 1, sy = 1, sz = 1, seg = 18) => new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.7) | 0)).scale(sx, sy, sz).translate(x, y, z);
// tube with a radius profile r(t)
function taper(points, rf, seg = 24, rad = 12) {
  const curve = new THREE.CatmullRomCurve3(points), fr = curve.computeFrenetFrames(seg, false), pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPointAt(t), r = rf(t);
    for (let j = 0; j <= rad; j++) { const a = (j / rad) * Math.PI * 2; const n = fr.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a)); pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const circ = (cx, cy, r, n = 20, sy = 1) => [...Array(n).keys()].map((i) => [cx + Math.cos((i / n) * 6.2832) * r, cy + Math.sin((i / n) * 6.2832) * r * sy]);

// ---------------------------------------------------------------- pumpkins: ribbed, squat, dimpled top, curved stem,
// faces carved as dark patches that follow the surface exactly
const FACES = [
  [[[-0.42, 0.06], [-0.14, 0.06], [-0.28, 0.33]], [[0.14, 0.06], [0.42, 0.06], [0.28, 0.33]], [[-0.07, -0.07], [0.07, -0.07], [0, 0.05]],
   [[-0.52, -0.12], [-0.3, -0.2], [-0.22, -0.2], [-0.17, -0.3], [-0.12, -0.2], [0.12, -0.2], [0.17, -0.3], [0.22, -0.2], [0.3, -0.2], [0.52, -0.12], [0.42, -0.31], [0.22, -0.43], [0.07, -0.46], [0, -0.36], [-0.07, -0.46], [-0.22, -0.43], [-0.42, -0.31]]],
  [[[-0.46, 0.3], [-0.1, 0.1], [-0.36, 0.04]], [[0.46, 0.3], [0.1, 0.1], [0.36, 0.04]], [[-0.06, 0.0], [0.06, 0.0], [0, -0.1]],
   [[-0.52, -0.16], [-0.36, -0.27], [-0.2, -0.17], [0, -0.28], [0.2, -0.17], [0.36, -0.27], [0.52, -0.16], [0.37, -0.39], [0, -0.48], [-0.37, -0.39]]],
  [circ(-0.25, 0.17, 0.11), circ(0.25, 0.17, 0.11), [...Array(13).keys()].map((i) => { const x = -0.45 + (0.9 * i) / 12; return [x, -0.14 - 0.1 * (1 - (x / 0.45) ** 2)]; }).concat([...Array(13).keys()].map((i) => { const x = 0.45 - (0.9 * i) / 12; return [x, -0.16 - 0.3 * (1 - (x / 0.45) ** 2)]; }))],
  [[...Array(9).keys()].map((i) => [-0.25 + Math.cos((i / 8) * Math.PI) * 0.15, 0.08 + Math.sin((i / 8) * Math.PI) * 0.15]), [...Array(9).keys()].map((i) => [0.25 + Math.cos((i / 8) * Math.PI) * 0.15, 0.08 + Math.sin((i / 8) * Math.PI) * 0.15]),
   [[-0.48, -0.15], [-0.14, -0.18], [-0.14, -0.26], [-0.05, -0.26], [-0.05, -0.18], [0.05, -0.18], [0.05, -0.3], [0.14, -0.3], [0.14, -0.18], [0.48, -0.15], [0.3, -0.38], [0, -0.44], [-0.3, -0.38]]],
];
const PK = new Map();
function pumpkinProto(lobes, sq, face) {
  const key = lobes + '/' + sq + '/' + face; if (PK.has(key)) return PK.get(key);
  const deform = (x, y, z, s = 1) => {
    const a = Math.atan2(z, x), lobe = Math.abs(Math.cos((a - Math.PI / 2) * lobes / 2));
    const k = 0.9 + 0.1 * Math.sqrt(lobe), th = Math.acos(Math.min(1, Math.abs(y)));
    const dim = 0.28 * sq * Math.exp(-((th / 0.38) ** 2));
    return [x * k * s, Math.sign(y) * (Math.abs(y) * sq - dim) * s, z * k * s, lobe];
  };
  const body = new THREE.SphereGeometry(1, 48, 32), p = body.attributes.position, u = body.attributes.uv;
  for (let i = 0; i < p.count; i++) { const [X, Y, Z, l] = deform(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, X, Y, Z); u.setY(i, l); }
  body.deleteAttribute('normal'); body.computeVertexNormals();
  let fg = null;
  if (face >= 0) {
    const polys = FACES[face], patch = new THREE.SphereGeometry(1, 84, 64, Math.PI / 2 - 0.72, 1.44, 0.95, 1.3), pp = patch.attributes.position;
    const P = [], idx = patch.index.array, out = [];
    for (let i = 0; i < pp.count; i++) P.push(deform(pp.getX(i), pp.getY(i), pp.getZ(i), 1.012));
    for (let i = 0; i < idx.length; i += 3) {
      const a = P[idx[i]], b = P[idx[i + 1]], c = P[idx[i + 2]], cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3 / sq;
      if (polys.some((q) => inPoly(cx, cy, q))) out.push(...a.slice(0, 3), ...b.slice(0, 3), ...c.slice(0, 3));
    }
    fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); fg.computeVertexNormals();
  }
  const res = { body, face: fg, top: 0.72 * sq }; PK.set(key, res); return res;
}
function pumpkin(r, seed, lit = false) {
  const lobes = rnd(seed, 2) > 0.5 ? 10 : 8, sq = [0.64, 0.72, 0.8][Math.floor(rnd(seed, 1) * 3)], face = lit ? Math.floor(rnd(seed, 3) * FACES.length) : -1;
  const P = pumpkinProto(lobes, sq, face);
  const body = P.body.clone().scale(r, r, r); body.userData.keepV = true;
  const t = P.top * r, lean = (rnd(seed, 4) - 0.5) * 0.3;
  const stem = [taper([V(0, t - 0.1 * r, 0), V(0.02 * r, t + 0.14 * r, 0.01 * r), V((0.08 + lean * 0.3) * r, t + 0.3 * r, 0.05 * r)], (q) => r * (0.11 - 0.035 * q), 8, 6), lathe([[0, 0], [0.17 * r, 0], [0.1 * r, 0.06 * r], [0, 0.08 * r]], 12).translate(0, t - 0.03 * r, 0)];
  return { body: [body], stem, face: P.face ? [P.face.clone().scale(r, r, r)] : [] };
}
function ghost(h) {
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([t < 0.2 ? Math.sin((t / 0.2) * Math.PI / 2) * 0.32 * h : 0.32 * h + (t - 0.2) * 0.2 * h, h * (1 - t)]); }
  const g = lathe(pts.reverse().map(([x, y]) => [x, y]), 32), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.25 * h) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y + Math.sin(a * 7) * 0.05 * h * (1 - y / (0.25 * h))); } }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  const arms = [-1, 1].map((s) => tube([V(s * 0.3 * h, 0.72 * h, 0), V(s * 0.5 * h, 0.62 * h, 0.05 * h), V(s * 0.58 * h, 0.5 * h, 0.08 * h)], 0.07 * h, 12, 8));
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.05 * h, 10, 8).scale(0.8, 1.3, 0.5).translate(s * 0.1 * h, 0.82 * h, 0.3 * h));
  eyes.push(new THREE.SphereGeometry(0.06 * h, 10, 8).scale(0.9, 1.3, 0.5).translate(0, 0.7 * h, 0.31 * h));
  return { sheet: [g, ...arms], dark: eyes };
}
function tombstone(seed) {
  const w = 2.2 + rnd(seed, 1), h = 3 + rnd(seed, 2) * 1.5, sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - w / 2); sh.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
  g.translate(0, 0, -0.25); g.rotateZ((rnd(seed, 3) - 0.5) * 0.15);
  const rip = [B(0.12, 0.8, 0.1, -0.5, h * 0.55, 0.3, 0.02), B(0.5, 0.1, 0.1, -0.35, h * 0.62, 0.3, 0.02), B(0.12, 0.8, 0.1, 0, h * 0.55, 0.3, 0.02), B(0.12, 0.8, 0.1, 0.35, h * 0.55, 0.3, 0.02), B(0.35, 0.1, 0.1, 0.5, h * 0.66, 0.3, 0.02)];
  return { stone: [g], dark: rip };
}
function cobweb(r) {
  const out = [], n = 7;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 * (i / (n - 1)); out.push(tube([V(0, 0, 0), V(Math.cos(a) * r, Math.sin(a) * r, 0)], 0.02, 4, 4)); }
  for (let k = 1; k <= 5; k++) { const rr = (r * k) / 5.5, pts = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 * (i / (n - 1)); pts.push(V(Math.cos(a) * rr, Math.sin(a) * rr, 0)); if (i < n - 1) { const b = -Math.PI / 2 * ((i + 0.5) / (n - 1)); pts.push(V(Math.cos(b) * rr * 0.9, Math.sin(b) * rr * 0.9, 0)); } } out.push(tube(pts, 0.015, 40, 3)); }
  return out;
}

// ---------------------------------------------------------------- house (faces +z, centred on x, front at z = 0)
function house(seed) {
  const G = { siding: [], trim: [], roof: [], dark: [], brick: [], glow: [] };
  const w = 24 + rnd(seed, 1) * 8, d = 26, two = rnd(seed, 2) > 0.35, h = two ? 23 : 13, base = 2.2;
  const pitch = 0.55 + rnd(seed, 3) * 0.35;
  const gableFront = rnd(seed, 4) > 0.5;
  G.brick.push(B(w + 0.6, base, d + 0.6, 0, base / 2, -d / 2, 0.1));                                 // foundation
  G.siding.push(B(w, h, d, 0, base + h / 2, -d / 2, 0.15));
  // corner boards + frieze
  for (const sx of [-1, 1]) for (const sz of [0, -d]) G.trim.push(B(0.7, h, 0.7, sx * (w / 2), base + h / 2, sz, 0.08));
  G.trim.push(B(w + 0.8, 0.8, d + 0.8, 0, base + h - 0.4, -d / 2, 0.08));
  if (two) G.trim.push(B(w + 0.5, 0.5, d + 0.5, 0, base + 11.5, -d / 2, 0.08));
  // roof: a gable prism (ridge along x, or along z for a front gable), with eaves
  const span = gableFront ? w : d, run = gableFront ? d : w, rise = (span / 2) * pitch, ov = 1.6;
  const sh = new THREE.Shape(); sh.moveTo(-span / 2 - ov, -ov * pitch); sh.lineTo(0, rise); sh.lineTo(span / 2 + ov, -ov * pitch); sh.lineTo(span / 2 + ov, -ov * pitch + 0.6); sh.lineTo(0, rise + 0.8); sh.lineTo(-span / 2 - ov, -ov * pitch + 0.6); sh.closePath();
  const roof = new THREE.ExtrudeGeometry(sh, { depth: run + 2 * ov, bevelEnabled: false }); roof.translate(0, 0, -(run + 2 * ov) / 2);
  const gable = new THREE.Shape(); gable.moveTo(-span / 2, 0); gable.lineTo(span / 2, 0); gable.lineTo(0, rise); gable.closePath();
  const gab = new THREE.ExtrudeGeometry(gable, { depth: run - 0.2, bevelEnabled: false }); gab.translate(0, 0, -(run - 0.2) / 2);
  if (!gableFront) { roof.rotateY(Math.PI / 2); gab.rotateY(Math.PI / 2); }
  roof.translate(0, base + h, -d / 2); gab.translate(0, base + h, -d / 2);
  G.roof.push(roof); G.siding.push(gab);
  if (gableFront) { const rw = 3.2; G.trim.push(B(rw, rw * 1.3, 0.3, 0, base + h + rise * 0.45, 0.25, 0.1)); G.dark.push(B(rw - 0.8, rw * 1.3 - 0.8, 0.3, 0, base + h + rise * 0.45, 0.35, 0.05)); }
  // chimney
  const cx = (rnd(seed, 5) - 0.5) * w * 0.6;
  G.brick.push(B(2.6, h + rise + 4, 2.6, cx, base + (h + rise + 4) / 2, -d * 0.7, 0.1), B(3.2, 0.7, 3.2, cx, base + h + rise + 4, -d * 0.7, 0.1));
  // windows (frame, sash cross, sill, shutters) on the front, plus a few on the sides
  const win = (x, y, z, ry, ww = 3.4, wh = 5.4, shut = true) => {
    const L = [];
    L.push(['trim', B(ww + 0.8, 0.4, 0.5, 0, wh / 2 + 0.2, 0.15, 0.05)], ['trim', B(ww + 1.2, 0.35, 0.9, 0, -wh / 2 - 0.2, 0.3, 0.05)]);
    for (const s of [-1, 1]) L.push(['trim', B(0.4, wh, 0.45, s * (ww / 2 + 0.2), 0, 0.15, 0.05)]);
    L.push(['glow', B(ww, wh, 0.2, 0, 0, -0.05, 0.02)], ['trim', B(ww, 0.22, 0.3, 0, 0, 0.1, 0.02)], ['trim', B(0.22, wh, 0.3, 0, 0, 0.1, 0.02)]);
    if (shut) for (const s of [-1, 1]) { L.push(['dark', B(1.5, wh + 0.3, 0.25, s * (ww / 2 + 1.25), 0, 0.15, 0.04)]); for (let k = 0; k < 7; k++) L.push(['trim', B(1.2, 0.08, 0.1, s * (ww / 2 + 1.25), -wh / 2 + 0.6 + k * (wh - 1) / 6, 0.3, 0.01)]); }
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    for (const [k, g] of L) G[k].push(g.applyMatrix4(m));
  };
  const nW = w > 28 ? 3 : 2;
  for (let i = 0; i < nW; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / nW;
    if (two) win(x, base + 17, 0.05, 0);
    if (i !== 0) win(x + 1, base + 6.5, 0.05, 0, 4.2, 5.8);
  }
  for (const s of [-1, 1]) win(s * (w / 2 + 0.05), base + 6.5, -d * 0.35, s * Math.PI / 2, 3.2, 5, false);
  // front door + porch with posts, steps, railing and a porch roof
  const dx = -w / 2 + w / (nW * 2) - 1;
  G.trim.push(B(4.4, 8.4, 0.5, dx, base + 4.2, 0.1, 0.06));
  G.dark.push(B(3.4, 7.6, 0.3, dx, base + 3.8, 0.25, 0.05));
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) G.trim.push(B(1.2, 1.6, 0.1, dx + s * 0.8, base + 1.5 + k * 2.2, 0.45, 0.03));
  G.trim.push(new THREE.SphereGeometry(0.2, 8, 6).translate(dx + 1.2, base + 3.8, 0.6));
  const pw = Math.min(w - 2, 18), pd = 8, px = -w / 2 + pw / 2 + 1;
  G.trim.push(B(pw, 0.6, pd, px, base - 0.3, pd / 2, 0.06));
  for (let k = 0; k < 3; k++) G.trim.push(B(5, 0.7, 1.4, dx, (base - 0.3) * (1 - (k + 1) / 3.5) , pd + 0.7 + k * 1.4, 0.05));
  for (const s of [-1, 1]) { const x = px + s * (pw / 2 - 0.6); G.trim.push(cyl(0.45, 0.45, 9.4, 12).translate(x, base + 4.7, pd - 0.6), B(1.2, 0.6, 1.2, x, base + 0.3, pd - 0.6, 0.05), B(1.2, 0.6, 1.2, x, base + 9.2, pd - 0.6, 0.05)); }
  G.trim.push(cyl(0.45, 0.45, 9.4, 12).translate(px, base + 4.7, pd - 0.6));
  const pr = B(pw + 1.6, 0.7, pd + 1.2, px, base + 9.9, pd / 2 - 0.2, 0.08); pr.rotateX(0); G.roof.push(pr);
  G.trim.push(B(pw + 1, 0.8, 0.5, px, base + 9.2, pd - 0.3, 0.05));
  // railing with balusters (skip the step gap)
  for (let x = px - pw / 2 + 1; x < px + pw / 2 - 0.9; x += 0.7) { if (Math.abs(x - dx) < 2.8) continue; G.trim.push(B(0.18, 2.6, 0.18, x, base + 1.3, pd - 0.6, 0.02)); }
  for (const y of [base + 0.3, base + 2.7]) for (const [a, b] of [[px - pw / 2 + 0.6, dx - 2.6], [dx + 2.6, px + pw / 2 - 0.6]]) if (b > a) G.trim.push(B(b - a, 0.3, 0.35, (a + b) / 2, y, pd - 0.6, 0.03));
  // porch cobweb + string of lights along the eaves (bulbs)
  G.trim.push(...cobweb(3.2).map((g) => g.translate(px - pw / 2 + 0.8, base + 9.1, pd - 0.4)));
  if (rnd(seed, 6) > 0.4) for (let x = -w / 2; x < w / 2; x += 1.1) G.glow.push(new THREE.SphereGeometry(0.16, 6, 5).translate(x, base + h - 0.9 + Math.sin(((x + w / 2) / 1.1) * 1.1) * 0.15, 1.0));
  return { G, w, d, pd, dx, base, px, pw, two, h };
}


// ---------------------------------------------------------------- trees: flared trunk with roots, a leader and
// main limbs branching 3 levels with tapering, drooping boughs; autumn leaves in clusters at the twigs
const LEAF = (() => { const s = new THREE.Shape([new THREE.Vector2(0, -0.45), new THREE.Vector2(0.38, 0.05), new THREE.Vector2(0.2, 0.42), new THREE.Vector2(-0.2, 0.42), new THREE.Vector2(-0.38, 0.05)]); return new THREE.ShapeGeometry(s).toNonIndexed().attributes.position.array; })();
class LeafBatch {
  constructor() { this.mats = []; this.pos = []; this.uv = []; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); }
  cluster(c, rad, n, rr, size = 1.1) {
    const id = Math.random();
    for (let k = 0; k < n; k++) {
      const u = rr() * 6.283, v = Math.acos(2 * rr() - 1), d = rad * Math.cbrt(rr());
      const p = V(c.x + Math.sin(v) * Math.cos(u) * d, c.y + Math.cos(v) * d * 0.7 - rad * 0.15, c.z + Math.sin(v) * Math.sin(u) * d);
      this._e.set(rr() * 6.3, rr() * 6.3, rr() * 6.3); this._q.setFromEuler(this._e); const s = size * (0.8 + rr() * 0.5);
      this._m.compose(p, this._q, this._s.set(s, s, s)); this.mats.push(this._m.clone());
      for (let i = 0; i < LEAF.length; i += 3) { this._v.set(LEAF[i], LEAF[i + 1], LEAF[i + 2]).applyMatrix4(this._m); this.pos.push(this._v.x, this._v.y, this._v.z); this.uv.push(id, 0); }
    }
  }
  geometry() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.computeVertexNormals(); g.userData.tagged = true; return g; }
}
function tree(seed, h, bare, LB) {
  const bark = [], tape = [];
  let c = 0; const rr = () => rnd(seed * 131 + c++, 7);
  const trunkH = h * (0.3 + rr() * 0.08), r0 = h * 0.03;
  const tp = [V(0, 0, 0), V((rr() - 0.5) * 0.8, trunkH * 0.4, (rr() - 0.5) * 0.8), V((rr() - 0.5) * 1.4, trunkH * 0.75, (rr() - 0.5) * 1.4), V((rr() - 0.5) * 1.8, trunkH, (rr() - 0.5) * 1.8)];
  bark.push(taper(tp, (t) => r0 * (1 - 0.3 * t) * (1 + 0.6 * Math.max(0, 1 - t * 7)), 20, 14));
  for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283 + rr(); bark.push(taper([V(Math.cos(a) * r0 * 0.4, r0 * 1.4, Math.sin(a) * r0 * 0.4), V(Math.cos(a) * r0 * 1.8, r0 * 0.3, Math.sin(a) * r0 * 1.8), V(Math.cos(a) * r0 * 3, -0.05, Math.sin(a) * r0 * 3)], (t) => r0 * 0.5 * (1 - 0.8 * t), 6, 6)); }
  const trunk = new THREE.CatmullRomCurve3(tp);
  const branch = (p, dir, len, r, depth) => {
    const perp = V(rr() - 0.5, rr() - 0.5, rr() - 0.5).cross(dir).normalize();
    const droop = depth < 2 ? 0.1 : 0.03;
    const mid = p.clone().addScaledVector(dir, len * 0.5).addScaledVector(perp, len * 0.12).add(V(0, -len * droop * 0.4, 0));
    const end = p.clone().addScaledVector(dir, len).add(V(0, -len * droop, 0));
    bark.push(taper([p, mid, end], (t) => r * (1 - 0.35 * t), depth > 1 ? 8 : 4, depth > 1 ? 8 : 5));
    if (!bare && depth <= 1) LB.cluster(end, depth === 0 ? 2.6 : 1.9, depth === 0 ? 34 : 15, rr, 1.0);
    if (depth === 0) return;
    const n = depth >= 2 ? 2 : rr() > 0.45 ? 3 : 2;   // (was 3 at the upper levels: half the branches now)
    const u = V(0, 1, 0).cross(dir); if (u.lengthSq() < 1e-4) u.set(1, 0, 0); u.normalize(); const w = dir.clone().cross(u).normalize();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rr() * 1.2, sp = 0.4 + rr() * 0.4;
      const nd = dir.clone().multiplyScalar(Math.cos(sp)).addScaledVector(u, Math.sin(sp) * Math.cos(a)).addScaledVector(w, Math.sin(sp) * Math.sin(a)).add(V(0, 0.12, 0)).normalize();
      branch(end, nd, len * (0.64 + rr() * 0.14), r * 0.62, depth - 1);
    }
  };
  const nMain = 4 + (rr() > 0.5 ? 1 : 0);
  for (let i = 0; i < nMain; i++) {
    const a = (i / nMain) * 6.283 + rr(), p = trunk.getPointAt(0.72 + (i / nMain) * 0.26);
    branch(p, V(Math.cos(a) * (0.7 + rr() * 0.4), 1, Math.sin(a) * (0.7 + rr() * 0.4)).normalize(), h * (0.2 + rr() * 0.05), r0 * 0.58, 3);
  }
  branch(tp[3], V((rr() - 0.5) * 0.3, 1, (rr() - 0.5) * 0.3).normalize(), h * 0.22, r0 * 0.55, 3);
  // Halloween tape wound round some trunks
  if (rnd(seed, 9) > 0.55) for (let k = 0; k < 6; k++) { const t = new THREE.TorusGeometry(r0 * 1.25, 0.1, 6, 24); t.rotateX(Math.PI / 2 + (rnd(k, seed) - 0.5) * 0.5); t.rotateZ((rnd(k, seed + 1) - 0.5) * 0.4); t.translate(0, 3 + k * 1.3, 0); tape.push(t); }
  return { bark, tape };
}

// ---------------------------------------------------------------- car: a 60s sedan (length along x, front at −x)
function car(seed) {
  const body = [], dark = [], chrome = [];
  const L = 17.4, W = 6.6, bt = 0.35;
  const s = new THREE.Shape();
  s.moveTo(-8.4, 0.9); s.lineTo(-8.7, 1.4); s.lineTo(-8.8, 2.55); s.quadraticCurveTo(-8.7, 3.25, -7.9, 3.32); s.lineTo(-3.0, 3.5); s.lineTo(4.4, 3.5); s.lineTo(8.3, 3.62); s.lineTo(8.85, 3.25); s.lineTo(8.9, 2.4); s.lineTo(8.65, 1.3); s.lineTo(8.3, 0.9);
  s.lineTo(5.3 + 1.72, 0.9); s.absarc(5.3, 1.2, 1.75, -0.172, Math.PI + 0.172, false); s.lineTo(-5.3 + 1.72, 0.9); s.absarc(-5.3, 1.2, 1.75, -0.172, Math.PI + 0.172, false); s.lineTo(-8.4, 0.9);
  body.push(new THREE.ExtrudeGeometry(s, { depth: W - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.3, bevelSegments: 4, curveSegments: 20 }).translate(0, 0, -(W - 2 * bt) / 2));
  const c = new THREE.Shape(); c.moveTo(-2.9, 3.4); c.lineTo(-0.9, 5.45); c.quadraticCurveTo(1.1, 5.7, 3.2, 5.6); c.lineTo(4.9, 3.4); c.lineTo(-2.9, 3.4);
  const cw = W - 1.4; body.push(new THREE.ExtrudeGeometry(c, { depth: cw - 0.6, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.22, bevelSegments: 3, curveSegments: 12 }).translate(0, 0, -(cw - 0.6) / 2));
  for (const zs of [-1, 1]) {
    for (const pts of [[[-2.25, 3.62], [-0.9, 5.2], [0.9, 5.33], [0.9, 3.62]], [[1.2, 3.62], [1.2, 5.33], [3.05, 5.3], [4.25, 3.62]]]) {
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))); g.translate(0, 0, zs * (cw / 2 + 0.03)); if (zs < 0) g.rotateY(0).scale(1, 1, 1); dark.push(g);
    }
    dark.push(B(0.06, 2.3, 0.05, -2.5, 2.25, zs * (W / 2 + 0.01), 0.01), B(0.06, 2.3, 0.05, 2.15, 2.25, zs * (W / 2 + 0.01), 0.01));   // door seams
    chrome.push(cyl(0.07, 0.07, 15.5, 8).rotateZ(Math.PI / 2).translate(0.3, 2.75, zs * (W / 2 + 0.03)), B(0.55, 0.13, 0.14, 1.3, 3.05, zs * (W / 2 + 0.05), 0.03));
    for (const wx of [-5.3, 5.3]) {
      dark.push(new THREE.TorusGeometry(0.95, 0.42, 12, 32).translate(wx, 1.37, zs * (W / 2 - 0.62)));
      const hub = lathe([[0, 0.14], [0.35, 0.12], [0.7, 0.02], [0.74, -0.05], [0, -0.05]], 24); hub.rotateX(zs * Math.PI / 2); hub.translate(wx, 1.37, zs * (W / 2 - 0.3)); chrome.push(hub);
    }
    for (const dz of [0.8, 1.65]) { const z = zs * (W / 2 - dz); dark.push(cyl(0.34, 0.34, 0.25, 20).rotateZ(Math.PI / 2).translate(-8.85, 2.45, z)); chrome.push(new THREE.TorusGeometry(0.38, 0.06, 8, 24).rotateY(Math.PI / 2).translate(-8.95, 2.45, z)); }
    dark.push(B(0.2, 0.6, 1.3, 8.95, 2.6, zs * (W / 2 - 1.0), 0.05));   // tail lights
    chrome.push(new THREE.ConeGeometry(0.18, 1.6, 8).rotateZ(-Math.PI / 2).translate(8.9, 3.55, zs * (W / 2 - 0.35)));   // fin
  }
  dark.push(B(0.2, 0.95, W - 1.8, -8.82, 2.1, 0, 0.05));
  for (const y of [1.8, 2.1, 2.4]) chrome.push(B(0.1, 0.07, W - 2, -8.93, y, 0, 0.02));
  chrome.push(B(0.8, 0.75, W + 0.3, -9.05, 1.45, 0, 0.3), B(0.8, 0.75, W + 0.3, 9.15, 1.45, 0, 0.3), B(0.1, 0.5, 1.4, 9.6, 1.7, 0, 0.03));
  chrome.push(B(0.35, 0.3, 0.35, -2.2, 3.85, -(W / 2 + 0.1), 0.08), cyl(0.04, 0.04, 0.5, 6).translate(-2.2, 3.6, -(W / 2 + 0.05)));   // mirror
  // windshield + rear window on the slopes of the cabin
  const quad = (a, b, cc, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...cc, ...a, ...cc, ...d], 3)); g.computeVertexNormals(); return g; };
  const hw = cw / 2 - 0.15;
  dark.push(quad([-2.75, 3.6, -hw], [-2.75, 3.6, hw], [-1.0, 5.35, hw - 0.1], [-1.0, 5.35, -hw + 0.1]).translate(-0.06, 0.06, 0));
  dark.push(quad([4.7, 3.6, hw], [4.7, 3.6, -hw], [3.3, 5.4, -hw + 0.1], [3.3, 5.4, hw - 0.1]).translate(0.06, 0.05, 0));
  return { body, dark, chrome };
}

// ---------------------------------------------------------------- kids in Halloween costumes — every costume is
// different. Smooth lathed garments that cover most of the body, rounded heads, masks and props.
// Materials: p paper, d dark, m mid, a accent, k pumpkin. Kid faces +z; hip at y 1.9, shoulders 2.92.
const HC = 3.42;                                         // head centre
const prof = (pts, zs = 0.78, seg = 36, disp = null) => {
  const g = lathe(pts, seg);
  if (disp) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z); if (r < 1e-4) continue; const a = Math.atan2(z, x), dr = disp(a, y, i); p.setXYZ(i, x + (x / r) * dr, y + (disp.dy ? disp.dy(a, y) : 0), z + (z / r) * dr); } g.deleteAttribute('normal'); g.computeVertexNormals(); }
  return g.scale(1, 1, zs);
};
const head = (sx = 0.95, sy = 1.05, sz = 1) => ell(0.42, 0, HC, 0, sx, sy, sz, 28);
const neck = () => taper([V(0, 2.88, 0), V(0, 3.12, 0.02)], () => 0.12, 4, 12);
// a mark on the head surface (eye, mouth …): yaw around y (0 = front), pitch up
const mark = (yaw, pitch, w, h, d = 0.3, R = 0.42) => {
  const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const g = new THREE.SphereGeometry(1, 14, 10).scale(w, h, Math.min(w, h) * d);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir));
  return g.translate(dir.x * R * 0.96, HC + dir.y * R * 1.03, dir.z * R * 0.98);
};
const frill = (yTop, yBot, rTop, rBot, folds, amp) => {   // open flared ruffle
  const g = new THREE.CylinderGeometry(rTop, rBot, yTop - yBot, folds * 6, 4, true), p = g.attributes.position, h = yTop - yBot;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), t = (h / 2 - y) / h, r = Math.hypot(x, z) + Math.sin(a * folds) * amp * t; p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r); }
  g.deleteAttribute('normal'); g.computeVertexNormals(); return g.translate(0, (yTop + yBot) / 2, 0);
};
const ruff = (y, rIn, rOut, folds, amp) => {             // wavy collar disc
  const g = new THREE.RingGeometry(rIn, rOut, folds * 8, 3).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z); p.setY(i, Math.sin(a * folds) * amp * ((r - rIn) / (rOut - rIn)) - (r - rIn) * 0.25); }
  g.deleteAttribute('normal'); g.computeVertexNormals(); return g.translate(0, y, 0);
};
const shell = (r, open = 1.8, thetaLen = 2.2, cy = HC, sy = 1.05) => new THREE.SphereGeometry(r, 28, 18, Math.PI / 2 + open / 2, Math.PI * 2 - open, 0, thetaLen).scale(1, sy, 1.02).translate(0, cy, 0);
const legGeo = (r = 0.15, len = 1.62) => taper([V(0, 0, 0), V(0, -len * 0.52, 0.04), V(0, -len, 0)], (t) => r * (1 - 0.25 * t), 16, 12);
const shoe = (s = 1, len = 1.9) => ell(0.15, 0, -1.72, 0.1, s, 0.75, len * s);
const armGeo = (side, r = 0.11, flare = 0) => taper([V(0, 0, 0), V(side * 0.1, -0.5, 0.02), V(side * 0.06, -1.0, 0.12)], (t) => r * (1 - 0.2 * t) + flare * t * t, 16, 12);
const hand = (side, s = 1) => ell(0.1 * s, side * 0.06, -1.1, 0.14, 0.8, 1.1, 0.7);
const HAND = (side) => V(side * 0.06, -1.12, 0.14);
function candy(kind, side, o, add) {
  const h = HAND(side);
  if (kind === 'bucket') { const p = pumpkin(0.36, 11 + side, true); p.body.forEach((g) => g.translate(h.x, h.y - 0.62, h.z)); p.face.forEach((g) => g.translate(h.x, h.y - 0.62, h.z)); add(o, 'k', ...p.body); add(o, 'd', ...p.face, new THREE.TorusGeometry(0.3, 0.025, 6, 20, Math.PI).translate(h.x, h.y - 0.45, h.z)); }
  else if (kind === 'bag') add(o, 'p', B(0.62, 0.72, 0.38, h.x, h.y - 0.6, h.z, 0.05), B(0.58, 0.14, 0.36, h.x, h.y - 0.18, h.z, 0.03), new THREE.TorusGeometry(0.16, 0.03, 6, 14, Math.PI).translate(h.x, h.y - 0.1, h.z));
  else if (kind === 'sack') add(o, 'p', lathe([[0, 0], [0.3, 0.05], [0.4, 0.35], [0.34, 0.72], [0.14, 0.98], [0.06, 1.05], [0, 1.05]], 20).translate(h.x, h.y - 1.05, h.z + 0.05));
}
const COSTUMES = {
  georgie(T, add) {   // yellow raincoat, hood, faceless white mask, red balloon, rubber boots
    add(T, 'm', prof([[0, 3.0], [0.2, 3.0], [0.42, 2.93], [0.55, 2.78], [0.56, 2.45], [0.58, 1.9], [0.66, 1.2], [0.72, 0.72], [0.66, 0.66], [0, 0.66]]),
      shell(0.5, 1.9, 2.35, HC + 0.03), new THREE.TorusGeometry(0.36, 0.05, 8, 28).scale(1, 1.22, 1).translate(0, HC, 0.38), B(0.34, 0.12, 0.2, -0.3, 1.7, 0.5, 0.04), B(0.34, 0.12, 0.2, 0.3, 1.7, 0.5, 0.04));
    add(T, 'd', ...[2.7, 2.35, 2.0, 1.65].map((y) => ell(0.045, 0.1, y, 0.47)));
    add(T, 'p', head(), neck());
    return { leg: () => ({ d: [taper([V(0, -1.0, 0), V(0, -1.62, 0)], () => 0.17, 4, 12), ell(0.17, 0, -1.72, 0.1, 1.05, 0.8, 1.8)] }),
      arm: (side) => ({ m: [armGeo(side, 0.14, 0.06), new THREE.TorusGeometry(0.2, 0.04, 6, 16).rotateX(Math.PI / 2).translate(side * 0.06, -1.0, 0.12)], p: [hand(side)] }),
      armRot: [[0, -0.05], [0, 2.25]],
      extra(T2) { const hp = V(1.37, 3.63, 0.14); add(T2, 'd', tube([hp, V(1.45, 5.0, 0.2), V(1.5, 6.35, 0.3)], 0.012, 20, 4)); add(T2, 'a', lathe([[0, 0], [0.12, 0.05], [0.55, 0.5], [0.7, 1.1], [0.6, 1.6], [0.35, 1.9], [0, 1.98]], 32).translate(1.5, 6.3, 0.3), new THREE.ConeGeometry(0.08, 0.14, 8).translate(1.5, 6.28, 0.3)); } };
  },
  clown(T, add) {     // Pennywise-style: silvery puffed suit, peplum frills, millstone ruff, pompoms, orange tufts
    add(T, 'p', prof([[0, 3.0], [0.18, 3.0], [0.45, 2.9], [0.52, 2.6], [0.44, 2.25], [0, 2.25]]), frill(2.36, 1.86, 0.45, 0.86, 12, 0.08), frill(2.02, 1.46, 0.52, 0.96, 12, 0.09),
      ruff(3.03, 0.13, 0.75, 14, 0.12), ruff(2.97, 0.13, 0.64, 14, -0.1), head(0.95, 1.1, 1), ell(0.08, 0, HC + 0.18, 0.34, 1.5, 0.6, 0.5));
    add(T, 'a', ...[2.78, 2.55, 2.32].map((y, i) => ell(0.09, 0, y, 0.42 - i * 0.03)), ell(0.07, 0, HC - 0.02, 0.44), ...[[-0.38, 0.06, -0.05], [0.38, 0.06, -0.05], [-0.3, 0.28, -0.2], [0.3, 0.28, -0.2], [0, 0.1, -0.38]].map(([x, y, z]) => ell(0.17, x, HC + y, z, 1.1, 0.9, 1)));
    add(T, 'd', mark(-0.3, 0.1, 0.06, 0.05), mark(0.3, 0.1, 0.06, 0.05), mark(-0.3, 0.1, 0.012, 0.22, 0.4), mark(0.3, 0.1, 0.012, 0.22, 0.4), mark(0, -0.38, 0.16, 0.035), mark(-0.3, 0.3, 0.09, 0.02), mark(0.3, 0.3, 0.09, 0.02));
    return { leg: () => ({ p: [ell(0.3, 0, -0.35, 0, 1, 1.25, 1), legGeo(0.13), frill(-1.28, -1.6, 0.15, 0.32, 9, 0.05)], d: [ell(0.2, 0, -1.72, 0.22, 1.2, 0.75, 2.2)], a: [ell(0.08, 0, -1.64, 0.62)] }),
      arm: (side) => ({ p: [ell(0.22, side * 0.02, -0.08, 0), ell(0.18, side * 0.1, -0.5, 0.02), armGeo(side, 0.1), frill(-0.86, -1.02, 0.1, 0.22, 8, 0.04).translate(side * 0.06, 0, 0.12), hand(side, 1.1)] }),
      candy: 'sack' };
  },
  myers(T, add) {     // coverall, pale mask, dark hair, kitchen knife
    add(T, 'm', prof([[0, 3.0], [0.2, 3.0], [0.47, 2.9], [0.54, 2.6], [0.52, 2.2], [0.5, 1.8], [0, 1.8]]), B(0.24, 0.32, 0.06, -0.14, 2.95, 0.34, 0.03).rotateZ(0.5), B(0.24, 0.32, 0.06, 0.14, 2.95, 0.34, 0.03).rotateZ(-0.5), B(0.3, 0.3, 0.05, -0.26, 2.6, 0.43, 0.03));
    add(T, 'd', B(0.03, 1.1, 0.03, 0, 2.4, 0.43, 0.01));
    add(T, 'p', head(0.95, 1.08, 1), ell(0.06, 0, HC - 0.02, 0.43, 0.8, 1.2, 0.8), neck());
    add(T, 'd', mark(-0.3, 0.06, 0.08, 0.06), mark(0.3, 0.06, 0.08, 0.06), mark(0, -0.35, 0.08, 0.02), new THREE.SphereGeometry(0.455, 24, 14, 0, Math.PI * 2, 0, 1.25).rotateX(-0.35).translate(0, HC + 0.04, -0.02), ...[-0.24, -0.12, 0, 0.12, 0.24].map((x, i) => ell(0.1, x, HC + 0.33 - (i % 2) * 0.03, 0.27, 1, 0.8, 0.8)));
    return { leg: () => ({ m: [legGeo(0.19)], d: [shoe(1.05)] }),
      arm: (side) => { const o = { m: [armGeo(side, 0.13)], p: [hand(side)] }; if (side > 0) { const h = HAND(side); const s = new THREE.Shape(); s.moveTo(-0.06, 0); s.lineTo(0.08, 0); s.lineTo(0.01, -0.95); s.closePath(); o.p.push(new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false }).translate(h.x, h.y - 0.1, h.z)); o.d = [B(0.1, 0.4, 0.08, h.x, h.y + 0.12, h.z, 0.03)]; } return o; },
      armRot: [[0, -0.05], [-0.25, 0.05]] };
  },
  jigsaw(T, add) {    // on a tricycle: suit, white shirt, red bow tie, white mask with red spirals, long black hair
    add(T, 'd', prof([[0, 3.0], [0.2, 3.0], [0.47, 2.9], [0.53, 2.6], [0.48, 2.2], [0.52, 1.75], [0, 1.75]]));
    add(T, 'p', new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.17, 2.97), new THREE.Vector2(0.17, 2.97), new THREE.Vector2(0, 2.4)])).translate(0, 0, 0.42), head(0.95, 1.08, 1), neck());
    add(T, 'd', taper([V(-0.22, 1.9, 0), V(-0.26, 2.02, 0.75), V(-0.24, 1.25, 1.05)], (t) => 0.15 - 0.03 * t, 16, 12), taper([V(0.22, 1.9, 0), V(0.26, 2.02, 0.75), V(0.24, 1.25, 1.05)], (t) => 0.15 - 0.03 * t, 16, 12),
      mark(-0.3, 0.05, 0.1, 0.09), mark(0.3, 0.05, 0.1, 0.09), mark(-0.1, -0.5, 0.012, 0.1, 0.4), mark(0.1, -0.5, 0.012, 0.1, 0.4),
      shell(0.47, 1.6, 2.25), new THREE.CylinderGeometry(0.45, 0.55, 0.95, 24, 1, true, 0.8, Math.PI * 2 - 1.6).translate(0, 3.05, -0.02));
    add(T, 'a', ell(0.03, -0.12, HC + 0.02, 0.4), ell(0.03, 0.12, HC + 0.02, 0.4), mark(0, -0.35, 0.09, 0.03),
      ...[-0.55, 0.55].map((yaw) => new THREE.TorusGeometry(0.05, 0.012, 6, 16).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(Math.sin(yaw), -0.2, Math.cos(yaw)).normalize())).translate(Math.sin(yaw) * 0.4, HC - 0.08, Math.cos(yaw) * 0.4)),
      new THREE.ConeGeometry(0.1, 0.2, 8).rotateZ(Math.PI / 2).translate(-0.11, 2.9, 0.44), new THREE.ConeGeometry(0.1, 0.2, 8).rotateZ(-Math.PI / 2).translate(0.11, 2.9, 0.44), ell(0.045, 0, 2.9, 0.46),
      ell(0.15, -0.24, 1.15, 1.2, 1, 0.7, 1.5), ell(0.15, 0.24, 1.15, 1.2, 1, 0.7, 1.5));
    return { leg: () => ({}), arm: (side) => ({ d: [armGeo(side, 0.12)], p: [hand(side, 1.1)] }), armRot: [[-1.05, 0.15], [-1.05, -0.15]], seat: 0,
      extra(T2, root) {   // tricycle
        const t = {};
        add(t, 'd', new THREE.TorusGeometry(0.85, 0.09, 8, 36).rotateY(Math.PI / 2).translate(0, 0.95, 1.35), ...[-0.8, 0.8].map((x) => new THREE.TorusGeometry(0.42, 0.08, 8, 24).rotateY(Math.PI / 2).translate(x, 0.45, -0.95)), ...[-0.72, 0.72].map((x) => cyl(0.07, 0.07, 0.28, 10).rotateZ(Math.PI / 2).translate(x, 2.32, 1.05)), ell(0.2, 0, 1.72, -0.1, 1.5, 0.5, 2));
        add(t, 'p', ...[...Array(8).keys()].map((i) => cyl(0.018, 0.018, 1.62, 4).rotateX((i / 8) * Math.PI).translate(0, 0.95, 1.35)), ...[-0.8, 0.8].map((x) => cyl(0.1, 0.1, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.45, -0.95)));
        add(t, 'a', cyl(0.12, 0.12, 0.3, 12).rotateZ(Math.PI / 2).translate(0, 0.95, 1.35), ...[-0.12, 0.12].map((x) => tube([V(x, 0.95, 1.35), V(x * 0.8, 1.7, 1.25), V(0, 2.25, 1.1)], 0.05, 12, 6)), cyl(0.05, 0.05, 1.3, 8).rotateZ(Math.PI / 2).translate(0, 2.32, 1.05),
          tube([V(0, 2.1, 1.12), V(0, 1.3, 0.5), V(0, 0.75, -0.2), V(0, 0.5, -0.9)], 0.07, 24, 8), cyl(0.05, 0.05, 1.0, 8).translate(0, 1.2, -0.12), cyl(0.05, 0.05, 1.6, 8).rotateZ(Math.PI / 2).translate(0, 0.45, -0.95), B(1.2, 0.06, 0.5, 0, 0.58, -1.1, 0.02),
          ...[-1, 1].map((s) => B(0.3, 0.05, 0.14, s * 0.25, 0.95 + s * 0.3, 1.35 + s * 0.15, 0.02)));
        for (const k of Object.keys(t)) add(T2, k, ...t[k]);
      } };
  },
  ghost(T, add) {     // bedsheet with folds, ragged hem and eye holes
    const disp = (a, y) => 0.05 * Math.sin(a * 9 + y * 1.5) * THREE.MathUtils.clamp((4 - y) / 3, 0, 1); disp.dy = (a, y) => (y < 0.8 ? 0.08 * Math.sin(a * 7) : 0);
    add(T, 'p', prof([[0, 4.05], [0.22, 4.0], [0.4, 3.85], [0.47, 3.55], [0.45, 3.25], [0.62, 2.98], [0.72, 2.6], [0.8, 1.8], [0.9, 0.75], [0.93, 0.62]], 0.85, 48, disp));
    add(T, 'd', ell(0.07, -0.16, 3.57, 0.4, 1, 1.4, 0.35), ell(0.07, 0.16, 3.57, 0.4, 1, 1.4, 0.35));
    return { leg: () => ({ d: [taper([V(0, -1.0, 0), V(0, -1.62, 0)], () => 0.12, 4, 10), shoe(0.95)] }), arm: (side) => ({ p: [armGeo(side, 0.15), hand(side, 1.1)] }), candy: 'sack', robe: true };
  },
  witch(T, add) {     // pointed hat, long dress, bell sleeves, striped stockings, broom
    add(T, 'd', prof([[0, 3.0], [0.2, 3.0], [0.44, 2.92], [0.5, 2.65], [0.42, 2.25], [0.55, 1.9], [0.78, 1.1], [0.92, 0.62], [0.9, 0.58]], 0.8, 40, (a, y) => 0.03 * Math.sin(a * 11) * Math.max(0, 2.2 - y)),
      ruff(HC + 0.36, 0.3, 1.0, 7, 0.06), taper([V(0, HC + 0.34, 0), V(0, HC + 0.95, -0.06), V(0.05, HC + 1.5, -0.22), V(0.3, HC + 1.66, -0.42)], (t) => 0.43 * Math.pow(1 - t, 0.9) + 0.012, 30, 20));
    add(T, 'a', new THREE.TorusGeometry(0.41, 0.06, 8, 30).rotateX(Math.PI / 2).translate(0, HC + 0.44, 0), new THREE.TorusGeometry(0.44, 0.05, 8, 30).rotateX(Math.PI / 2).translate(0, 2.25, 0));
    add(T, 'p', head(), neck(), new THREE.ConeGeometry(0.05, 0.16, 8).rotateX(Math.PI / 2).translate(0, HC - 0.02, 0.46));
    add(T, 'd', mark(-0.28, 0.05, 0.05, 0.06), mark(0.28, 0.05, 0.05, 0.06), mark(0, -0.35, 0.1, 0.02));
    add(T, 'm', ...[...Array(10).keys()].map((i) => { const a = Math.PI * 0.35 + (i / 9) * Math.PI * 1.3, x = Math.sin(a) * 0.43, z = Math.cos(a) * 0.43; return taper([V(x, HC + 0.3, z), V(x * 1.1, HC - 0.3, z * 1.15), V(x * 1.15, 2.7, z * 1.25)], (t) => 0.07 * (1 - 0.6 * t), 10, 6); }));
    return { leg: () => ({ p: [legGeo(0.13)], d: [...[0, 1, 2, 3, 4, 5, 6].map((k) => new THREE.TorusGeometry(0.13 - k * 0.004, 0.035, 6, 16).rotateX(Math.PI / 2).translate(0, -0.95 - k * 0.1, 0.03)), shoe(0.95, 2.0), new THREE.ConeGeometry(0.08, 0.3, 8).rotateX(Math.PI / 2 - 0.4).translate(0, -1.62, 0.45)] }),
      arm: (side) => { const o = { d: [armGeo(side, 0.12, 0.12)], p: [hand(side)] }; if (side < 0) { const h = HAND(side); o.p.push(cyl(0.045, 0.045, 3.6, 8).rotateX(0.5).translate(h.x, h.y + 0.2, h.z - 0.1)); o.m = [lathe([[0, 0], [0.32, 0.1], [0.25, 0.9], [0.08, 1.0], [0, 1.0]], 16).rotateX(0.5 + Math.PI).translate(h.x, h.y - 1.25, h.z + 0.75)]; } return o; },
      candy: 'bucket', robe: true };
  },
  vampire(T, add) {   // cape with a standing collar, waistcoat, medallion, slicked hair
    add(T, 'p', prof([[0, 3.0], [0.2, 3.0], [0.46, 2.9], [0.52, 2.6], [0.45, 2.2], [0.47, 1.85], [0, 1.85]]), head(0.94, 1.06, 1), neck(), ...[-1, 1].map((s) => new THREE.ConeGeometry(0.02, 0.07, 6).rotateX(Math.PI).translate(s * 0.05, HC - 0.2, 0.41)));
    add(T, 'd', B(0.22, 0.75, 0.06, -0.16, 2.35, 0.37, 0.03).rotateZ(-0.06), B(0.22, 0.75, 0.06, 0.16, 2.35, 0.37, 0.03).rotateZ(0.06),
      new THREE.CylinderGeometry(0.62, 1.08, 2.55, 36, 1, true, 0.75, Math.PI * 2 - 1.5).translate(0, 1.72, -0.02), new THREE.CylinderGeometry(0.78, 0.46, 0.95, 28, 1, true, 1.2, Math.PI * 2 - 2.4).translate(0, 3.35, -0.05),
      new THREE.SphereGeometry(0.445, 24, 14, 0, Math.PI * 2, 0, 1.15).translate(0, HC + 0.03, -0.01), new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI).translate(0, HC + 0.36, 0.33).rotateX(0),
      mark(-0.28, 0.05, 0.05, 0.06), mark(0.28, 0.05, 0.05, 0.06), mark(-0.28, 0.22, 0.1, 0.02), mark(0.28, 0.22, 0.1, 0.02));
    add(T, 'a', new THREE.TorusGeometry(0.1, 0.02, 6, 16).translate(0, 2.62, 0.42), mark(0, -0.36, 0.08, 0.025));
    return { leg: () => ({ d: [legGeo(0.15), shoe(1)] }), arm: (side) => ({ d: [armGeo(side, 0.12)], p: [hand(side)] }), candy: 'bag' };
  },
  mummy(T, add, seed) {   // bandages over everything, loose ends, arms forward
    const wraps = (y0, y1, r, n, s) => [...Array(n).keys()].map((k) => new THREE.TorusGeometry(r * (1 + rnd(k, s) * 0.08), 0.06, 5, 20).rotateX(Math.PI / 2 + (rnd(k, s + 1) - 0.5) * 0.5).rotateZ((rnd(k, s + 2) - 0.5) * 0.3).translate(0, y0 + ((y1 - y0) * k) / (n - 1), 0).scale(1, 1, 0.8));
    add(T, 'p', prof([[0, 3.0], [0.2, 3.0], [0.45, 2.9], [0.5, 2.55], [0.44, 2.2], [0.46, 1.8], [0, 1.8]]), ...wraps(1.85, 2.9, 0.46, 12, seed), head(), neck(), ...[...Array(6).keys()].map((k) => new THREE.TorusGeometry(0.41, 0.06, 5, 22).rotateX(Math.PI / 2 + (rnd(k, 9) - 0.5) * 0.7).translate(0, HC - 0.3 + k * 0.13, 0)),
      taper([V(0.3, 2.3, 0.3), V(0.42, 1.8, 0.4), V(0.38, 1.3, 0.45)], () => 0.035, 8, 4), taper([V(-0.25, 2.7, 0.3), V(-0.45, 2.3, 0.35), V(-0.5, 1.9, 0.3)], () => 0.03, 8, 4));
    add(T, 'd', B(0.55, 0.08, 0.1, 0, HC + 0.04, 0.38, 0.03));
    return { leg: (side) => ({ p: [legGeo(0.15), ...wraps(-1.55, -0.1, 0.16, 8, seed + side * 3), ell(0.16, 0, -1.72, 0.1, 1, 0.75, 1.8)] }),
      arm: (side) => ({ p: [armGeo(side, 0.11), hand(side), ...[0, 1, 2, 3, 4].map((k) => new THREE.TorusGeometry(0.12, 0.04, 5, 14).rotateX(Math.PI / 2 + (rnd(k, side) - 0.5) * 0.6).translate(side * 0.08, -0.15 - k * 0.2, 0.03 + k * 0.02))] }),
      armRot: [[-1.35, 0.05], [-1.3, -0.05]], armAmp: 0.08 };
  },
  skeleton(T, add) {  // black onesie with printed bones, skull mask, hood
    add(T, 'd', prof([[0, 3.0], [0.2, 3.0], [0.47, 2.9], [0.53, 2.6], [0.47, 2.2], [0.48, 1.8], [0, 1.8]]), shell(0.48, 2.0, 2.0, HC + 0.02));
    const ribs = [...Array(5).keys()].map((i) => { const pts = []; for (let k = 0; k <= 8; k++) { const x = -0.36 + (0.72 * k) / 8, y = 2.78 - i * 0.12 - 0.07 * (x / 0.36) ** 2; pts.push(V(x, y, 0.44 * Math.sqrt(Math.max(0.05, 1 - (x / 0.55) ** 2)) + 0.02)); } return tube(pts, 0.028, 16, 5); });
    add(T, 'p', ...ribs, B(0.06, 0.62, 0.05, 0, 2.52, 0.45, 0.02), ell(0.16, -0.17, 1.98, 0.36, 1.2, 0.8, 0.3), ell(0.16, 0.17, 1.98, 0.36, 1.2, 0.8, 0.3), head(), neck(), B(0.3, 0.07, 0.06, 0, HC - 0.3, 0.37, 0.02));
    add(T, 'd', mark(-0.27, 0.05, 0.1, 0.1), mark(0.27, 0.05, 0.1, 0.1), mark(0, -0.14, 0.04, 0.05), ...[-0.1, -0.03, 0.04, 0.11].map((x) => B(0.015, 0.09, 0.02, x, HC - 0.3, 0.405, 0.005)));
    return { leg: () => ({ d: [legGeo(0.15), shoe(1)], p: [B(0.06, 0.62, 0.04, 0, -0.42, 0.15, 0.02), B(0.05, 0.62, 0.04, 0, -1.2, 0.14, 0.02), ell(0.06, 0, -0.82, 0.16)] }),
      arm: (side) => ({ d: [armGeo(side, 0.12)], p: [B(0.04, 0.45, 0.04, side * 0.06, -0.26, 0.1, 0.01), B(0.04, 0.42, 0.04, side * 0.08, -0.76, 0.18, 0.01), hand(side)] }), candy: 'bucket' };
  },
  reaper(T, add) {    // hooded robe to the ground, void face, scythe
    add(T, 'd', prof([[0, 3.0], [0.25, 3.0], [0.52, 2.88], [0.58, 2.5], [0.6, 1.8], [0.8, 0.8], [0.92, 0.1], [0.9, 0.06]], 0.82, 44, (a, y) => 0.04 * Math.sin(a * 8) * Math.max(0, 2.6 - y)),
      new THREE.SphereGeometry(0.58, 28, 18, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, 2.2).scale(1, 1.18, 1.05).translate(0, HC + 0.06, -0.05), ell(0.36, 0, HC - 0.02, 0.06, 1, 1.1, 1));
    add(T, 'p', ell(0.03, -0.1, HC + 0.03, 0.4), ell(0.03, 0.1, HC + 0.03, 0.4), cyl(0.05, 0.05, 5.3, 8).translate(-0.72, 2.75, 0.45),
      taper([V(-0.72, 5.3, 0.45), V(-0.2, 5.45, 0.5), V(0.55, 5.25, 0.5), V(1.05, 4.75, 0.5)], (t) => 0.14 * (1 - t) + 0.01, 30, 8).scale(1, 1, 1));
    return { leg: () => ({}), arm: (side) => ({ d: [armGeo(side, 0.13, 0.17)], p: [hand(side, 0.9)] }), armRot: [[-0.55, -0.35], [0, 0.05]], candy: 'bucket', robe: true };
  },
  werewolf(T, add) {  // fur suit with torn shorts, wolf mask with snout and ears, clawed paws
    const fur = (a, y, i) => (rnd(i, 3) - 0.5) * 0.06;
    add(T, 'm', prof([[0, 3.0], [0.22, 3.0], [0.5, 2.9], [0.56, 2.6], [0.5, 2.2], [0.5, 1.85], [0, 1.85]], 0.8, 40, fur), head(1, 1.02, 1.02),
      taper([V(0, HC - 0.12, 0.28), V(0, HC - 0.16, 0.72)], (t) => 0.22 - 0.08 * t, 8, 14), ...[-1, 1].map((s) => new THREE.ConeGeometry(0.14, 0.42, 8).rotateZ(-s * 0.35).translate(s * 0.27, HC + 0.46, -0.02)),
      ...[...Array(14).keys()].map((i) => { const a = (i / 14) * 6.283; return new THREE.ConeGeometry(0.08, 0.28, 6).rotateZ(Math.PI / 2 + 0.5).rotateY(-a).translate(Math.cos(a) * 0.4, 2.98, Math.sin(a) * 0.32); }),
      B(0.6, 0.1, 0.18, 0, HC + 0.16, 0.34, 0.05));
    add(T, 'd', ell(0.07, 0, HC - 0.1, 0.8, 1.3, 0.9, 0.9), prof([[0.53, 2.05], [0.56, 1.5], [0.4, 1.45]], 0.8, 30, (a, y, i) => (y < 1.55 ? (rnd(i, 7) - 0.5) * 0.1 : 0)));
    add(T, 'p', ell(0.035, -0.17, HC + 0.05, 0.39), ell(0.035, 0.17, HC + 0.05, 0.39), ...[-0.08, 0, 0.08].map((x) => new THREE.ConeGeometry(0.02, 0.07, 5).translate(x, HC - 0.3, 0.6)));
    return { leg: () => ({ m: [legGeo(0.17), ell(0.17, 0, -1.72, 0.12, 1.1, 0.7, 1.8), ...[0, 1, 2, 3, 4, 5].map((k) => new THREE.ConeGeometry(0.06, 0.2, 5).rotateX(-0.6).rotateY((k / 6) * 6.28).translate(Math.cos((k / 6) * 6.28) * 0.16, -1.35, Math.sin((k / 6) * 6.28) * 0.16))], p: [-0.08, 0, 0.08].map((x) => new THREE.ConeGeometry(0.03, 0.1, 5).rotateX(Math.PI / 2).translate(x, -1.73, 0.42)) }),
      arm: (side) => { const h = HAND(side); return { m: [armGeo(side, 0.13), hand(side, 1.2)], p: [-0.05, 0, 0.05].map((x) => new THREE.ConeGeometry(0.02, 0.1, 5).rotateX(Math.PI).translate(h.x + x, h.y - 0.1, h.z + 0.05)) }; }, candy: 'sack' };
  },
  pumpkinsuit(T, add) {   // round pumpkin body with a carved face, green beanie with a stem
    const P = pumpkinProto(10, 0.8, 0); const b = P.body.clone().scale(0.95, 0.95, 0.95).translate(0, 2.3, 0); b.userData.keepV = true;
    add(T, 'k', b); add(T, 'd', P.face.clone().scale(0.95, 0.95, 0.95).translate(0, 2.3, 0));
    add(T, 'p', head(), neck(), taper([V(0, HC + 0.4, 0), V(0.03, HC + 0.62, 0.02)], (t) => 0.07 - 0.02 * t, 6, 8));
    add(T, 'm', new THREE.SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, 0, 1.2).translate(0, HC + 0.02, 0), new THREE.TorusGeometry(0.4, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, HC + 0.18, 0));
    add(T, 'd', mark(-0.28, 0.02, 0.05, 0.06), mark(0.28, 0.02, 0.05, 0.06), mark(0, -0.33, 0.1, 0.03));
    return { leg: () => ({ d: [legGeo(0.13)], a: [shoe(1)] }), arm: (side) => ({ d: [armGeo(side, 0.11)], p: [hand(side)] }), candy: 'bag' };
  },
  frank(T, add) {     // square head, flat top hair with fringe, scar, neck bolts, short jacket, big boots
    add(T, 'd', prof([[0, 3.0], [0.2, 3.0], [0.5, 2.92], [0.56, 2.6], [0.52, 2.2], [0.55, 1.72], [0, 1.72]]), B(0.86, 0.2, 0.82, 0, HC + 0.5, 0, 0.05), ...[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x, i) => new THREE.ConeGeometry(0.07, 0.2, 4).rotateX(Math.PI).translate(x, HC + 0.33 - (i % 2) * 0.03, 0.4)),
      B(0.5, 0.03, 0.02, -0.05, HC + 0.2, 0.395, 0.01), ...[-0.25, -0.13, 0, 0.13].map((x) => B(0.02, 0.1, 0.02, x, HC + 0.2, 0.4, 0.005)), B(0.24, 0.05, 0.04, -0.17, HC + 0.08, 0.395, 0.01), B(0.24, 0.05, 0.04, 0.17, HC + 0.08, 0.395, 0.01),
      ell(0.045, -0.17, HC - 0.01, 0.39), ell(0.045, 0.17, HC - 0.01, 0.39), B(0.3, 0.03, 0.02, 0, HC - 0.26, 0.395, 0.01));
    add(T, 'm', bbox(0.8, 0.95, 0.78, 0.2).translate(0, HC, 0), taper([V(0, 2.88, 0), V(0, 3.12, 0)], () => 0.15, 4, 12));
    add(T, 'p', ...[-1, 1].map((s) => cyl(0.06, 0.06, 0.24, 10).rotateZ(Math.PI / 2).translate(s * 0.2, 3.02, 0)), B(0.2, 1.0, 0.05, 0, 2.4, 0.41, 0.02));
    return { leg: () => ({ d: [legGeo(0.17, 1.4), bbox(0.4, 0.42, 0.66, 0.08).translate(0, -1.62, 0.12)], p: [taper([V(0, -1.3, 0), V(0, -1.45, 0)], () => 0.14, 3, 10)] }),
      arm: (side) => ({ d: [taper([V(0, 0, 0), V(side * 0.08, -0.5, 0.02), V(side * 0.06, -0.85, 0.1)], () => 0.13, 12, 12)], m: [taper([V(side * 0.06, -0.85, 0.1), V(side * 0.06, -1.0, 0.12)], () => 0.09, 3, 10), hand(side, 1.25)] }),
      armRot: [[-1.4, 0.05], [-1.4, -0.05]], armAmp: 0.05, legAmp: 0.3 };
  },
  devil(T, add) {     // red suit, short cape, horns, goatee, tail, pitchfork
    add(T, 'a', prof([[0, 3.0], [0.2, 3.0], [0.46, 2.9], [0.52, 2.6], [0.45, 2.2], [0.47, 1.82], [0, 1.82]]), tube([V(0, 1.95, -0.35), V(0.1, 1.2, -0.7), V(0.35, 0.8, -1.05), V(0.55, 1.2, -1.25)], 0.04, 24, 6));
    add(T, 'd', new THREE.CylinderGeometry(0.62, 0.95, 1.8, 32, 1, true, 0.8, Math.PI * 2 - 1.6).translate(0, 2.05, -0.03), new THREE.ConeGeometry(0.12, 0.22, 3).rotateZ(-2.2).translate(0.6, 1.3, -1.3),
      ...[-1, 1].map((s) => taper([V(s * 0.18, HC + 0.33, 0.12), V(s * 0.27, HC + 0.5, 0.1), V(s * 0.3, HC + 0.66, 0.02)], (t) => 0.07 * (1 - t) + 0.004, 10, 8)),
      mark(-0.28, 0.05, 0.05, 0.05), mark(0.28, 0.05, 0.05, 0.05), mark(-0.28, 0.2, 0.1, 0.02), mark(0.28, 0.2, 0.1, 0.02), mark(0, -0.34, 0.12, 0.025), new THREE.ConeGeometry(0.06, 0.2, 8).rotateX(Math.PI).translate(0, HC - 0.5, 0.33),
      cyl(0.04, 0.04, 4.6, 8).translate(-0.68, 2.3, 0.4), cyl(0.03, 0.03, 0.55, 6).rotateZ(Math.PI / 2).translate(-0.68, 4.6, 0.4), ...[-0.25, 0, 0.25].map((x) => new THREE.ConeGeometry(0.035, 0.45, 6).translate(-0.68 + x, 4.85, 0.4)));
    add(T, 'p', head(), neck());
    return { leg: () => ({ a: [legGeo(0.15)], d: [shoe(1)] }), arm: (side) => ({ a: [armGeo(side, 0.12)], p: [hand(side)] }), armRot: [[-0.5, -0.3], [0, 0.05]], candy: 'bucket' };
  },
};
export const KID_KINDS = Object.keys(COSTUMES);
function kid(kind, seed, M) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (o, k, ...g) => (o[k] ||= []).push(...g);
  const T = {}, cfg = COSTUMES[kind](T, add, seed);
  if (cfg.extra) cfg.extra(T, root);
  const mk = (o, parent) => { for (const k of Object.keys(o)) if (o[k].length) parent.add(new THREE.Mesh(merge(o[k]), M[k])); };
  mk(T, body);
  const legs = [], arms = [];
  [-1, 1].forEach((side) => { const g = new THREE.Group(); g.position.set(side * 0.22, 1.9, 0); mk(cfg.leg(side), g); root.add(g); legs.push(g); });
  [-1, 1].forEach((side, i) => {
    const g = new THREE.Group(); g.position.set(side * 0.5, 2.9, 0); const o = cfg.arm(side);
    if (side > 0 && cfg.candy) candy(cfg.candy, side, o, add);
    mk(o, g); const r = (cfg.armRot || [[0, -0.06], [0, 0.06]])[i]; g.rotation.set(r[0], 0, r[1]); body.add(g); arms.push(g);
  });
  root.userData = { legs, arms, body, phase: rnd(seed, 7) * 6.28, base: arms.map((a) => a.rotation.x), legAmp: cfg.legAmp ?? (cfg.robe ? 0.35 : 0.55), armAmp: cfg.armAmp ?? 0.45, still: cfg.seat === 0 };
  return root;
}

// ---------------------------------------------------------------- the street
export function buildTown(inkMat, { len = 520, portalMat = null } = {}) {
  seedN = 1;
  const root = new THREE.Group();
  const lp = (period, horizontal = true) => Fn(() => { const q = horizontal ? positionWorld.y : positionWorld.x; const d = fract(q.div(period).add(0.5)).sub(0.5); const far = float(1).sub(smoothstep(0.12, 0.35, fwidth(q.div(period)))); return float(1).sub(inkLine(d).mul(0.7).mul(far)); })();
  const groove = Fn(() => float(1).sub(inkLine(uv().y).mul(0.75).mul(float(1).sub(smoothstep(0.1, 0.3, fwidth(uv().y))))))();   // ribs vanish before they clog into a grey blob   // pumpkin ribs
  const DS = THREE.DoubleSide;
  const M = {
    ground: inkMat({ color: '#6a7a5a', flat: 1, id: true }),
    road: inkMat({ color: '#3a3a3c', flat: 1, id: true }),
    walk: inkMat({ color: '#9a9690', flat: 1, id: true }),
    siding: inkMat({ color: '#c9c3b5', flat: 1, id: true, pattern: lp(0.9) }),
    trim: inkMat({ color: '#e8e2d4', flat: 1, id: true }),
    roof: inkMat({ color: '#3b3f44', flat: 1, id: true, pattern: lp(1.1) }),
    brick: inkMat({ color: '#6b3a2e', flat: 1, id: true, pattern: lp(0.6) }),
    dark: inkMat({ color: '#141312', flat: 0.08, id: true, side: DS }),
    glow: inkMat({ color: '#ffb35a', flat: 0.55, id: true }),
    bark: inkMat({ color: '#2a2320', flat: 1 }),   // no piece id: branches only get their outer silhouette, no line at every joint
    leaves: inkMat({ color: '#b5501e', flat: 1, id: true, side: DS }),
    fallLeaves: inkMat({ color: '#b5501e', flat: 1, id: true, side: DS }),   // own material: sharing one with the tree-leaf instances broke the WebGPU bind group
    tape: inkMat({ color: '#e86a14', flat: 0.45, id: true }),
    pumpkin: inkMat({ color: '#e0701a', flat: 1, id: true, pattern: groove }),
    sheet: inkMat({ color: '#f2f0ea', flat: 1, id: true, side: DS }),
    car: inkMat({ color: '#8fb4c8', flat: 1, id: true }),
    chrome: inkMat({ color: '#d0d0d0', flat: 1, id: true }),
    wire: inkMat({ color: '#111', flat: 0.1, id: true }),
    woodF: inkMat({ color: '#8a7358', flat: 1, id: true }),
    paint: inkMat({ color: '#e8c030', flat: 1, id: true, pattern: float(0) }),   // centre line → solid ink
    lane: inkMat({ color: '#f4f2ea', flat: 1, id: true }),                       // lane lines → outlined
    pbrick: inkMat({ color: '#d8cfbd', flat: 1, id: true }),   // the portal's bricks
  };
  setRoles(M, { ground: 'ground', road: 'ground', walk: 'stone', siding: 'stone', trim: 'stone', roof: 'wood', brick: 'wood', dark: 'deep', glow: 'ground', bark: 'wood', leaves: 'leaf', fallLeaves: 'leaf', tape: 'leaf', pumpkin: 'ground', sheet: 'stone', car: 'stone', chrome: 'stone', wire: 'deep', woodF: 'wood', m: 'stone', a: 'hero' });   // palette categories (COLOR-GUIDE)
  tagSfx(M, { ground: 'grass', road: 'stone', walk: 'stone', siding: 'wood', trim: 'wood', roof: 'wood', brick: 'stone', dark: 'glass', glow: 'glass', bark: 'wood', leaves: 'leaves', fallLeaves: 'leaves', tape: 'paper', pumpkin: 'pumpkin', sheet: 'ghost', car: 'car', chrome: 'metal', wire: 'metal', woodF: 'wood', pbrick: 'stone', paint: 'stone', lane: 'stone' });   // click sounds
  const kidM = { p: M.sheet, d: M.dark, m: inkMat({ color: '#8a8478', flat: 0.62, id: true, side: DS }), a: inkMat({ color: '#b02a1e', flat: 0.34, id: true, side: DS }), k: M.pumpkin };
  const G = {}; for (const k of Object.keys(M)) G[k] = [];
  const x0 = 45, x1 = len, XC = len - 40;   // XC: the cross street at the end (a T-junction)
  const ROAD = 20, WALK0 = 24, WALK1 = 29;

  G.ground.push(new THREE.PlaneGeometry(len + 400, 700).rotateX(-Math.PI / 2).translate(len / 2 - 100, -0.02, -150));
  G.road.push(B(XC - 20 + 150, 0.3, ROAD * 2, (XC - 20 - 150) / 2, 0.02, 0, 0.02));   // one slab: no seams drawn across the road
  // US road markings: double solid centre line (solid ink), dashed lane lines + solid edge lines (outlined),
  // a crosswalk and a stop bar before the T-junction; the cross street gets its own centre line and dashes
  { const Y = 0.19, T = 0.04, xa = -150, xb = XC - ROAD - 1;
    for (const zz of [-0.45, 0.45]) G.paint.push(B(xb - xa, T, 0.35, (xa + xb) / 2, Y, zz, 0.01));
    for (const zz of [-ROAD / 2, ROAD / 2]) for (let x = xa; x < xb - 13; x += 12) G.lane.push(B(4, T, 0.4, x + 2, Y, zz, 0.01));
    for (const zz of [-(ROAD - 1.3), ROAD - 1.3]) G.lane.push(B(xb - xa, T, 0.4, (xa + xb) / 2, Y, zz, 0.01));
    const cx = XC - ROAD - 5; for (let z = -ROAD + 2; z < ROAD - 1; z += 2.4) G.lane.push(B(5, T, 1.3, cx, Y, z + 0.65, 0.01));
    G.lane.push(B(0.9, T, ROAD - 1.5, cx - 5, Y, -ROAD / 2 + 0.2, 0.01));
    for (const xx of [-0.45, 0.45]) G.paint.push(B(0.35, T, 500, XC + xx, Y, 0, 0.01));
    for (const xx of [-ROAD / 2, ROAD / 2]) for (let z = -250; z < 250; z += 12) if (Math.abs(z + 2) > ROAD + 2) G.lane.push(B(0.4, T, 4, XC + xx, Y, z + 2, 0.01)); }
  for (const s of [-1, 1]) {
    for (let x = -150; x < XC - 20.9; x += 9) G.walk.push(B(Math.min(9, XC - 20 - x), 0.9, 0.9, x + Math.min(9, XC - 20 - x) / 2, 0.3, s * (ROAD + 0.45), 0.12));
    for (let x = -150; x < XC - WALK0; x += 5) G.walk.push(B(4.95, 0.35, WALK1 - WALK0, x + 2.5, 0.2, s * (WALK0 + WALK1) / 2, 0.04));
  }
  // cross street: road along z, curbs (open where the main street joins), sidewalks, houses across facing us
  G.road.push(B(ROAD * 2, 0.3, 520, XC, 0.02, 0, 0.02));
  for (let z = -260; z < 260; z += 9) {
    G.walk.push(B(0.9, 0.9, 9, XC + ROAD + 0.45, 0.3, z + 4.5, 0.12));
    if (Math.abs(z + 4.5) > ROAD + 5) G.walk.push(B(0.9, 0.9, 9, XC - ROAD - 0.45, 0.3, z + 4.5, 0.12));
  }
  for (let z = -260; z < 260; z += 5) for (const sx of [-1, 1]) { if (sx < 0 && Math.abs(z + 2.5) < WALK1) continue; G.walk.push(B(WALK1 - WALK0, 0.35, 4.95, XC + sx * (WALK0 + WALK1) / 2, 0.2, z + 2.5, 0.04)); }
  // houses
  const houses = [];
  { let z = -230, k = 0; while (z < 230) { const seed = 300 + k, hs = house(seed), m = M4(XC + WALK1 + 14 + rnd(seed, 8) * 5, 0, z + hs.w / 2, -Math.PI / 2);
      for (const key of Object.keys(hs.G)) G[key].push(...place(hs.G[key], m));
      houses.push({ x: XC + WALK1 + 14, z: z + hs.w / 2, ry: -Math.PI / 2, hs, s: 2, m, cross: true });
      const fw = B(4.5, 0.35, 14 + rnd(seed, 8) * 5 - hs.pd - 3.5, 0, 0.2, 0, 0.04); fw.translate(hs.dx, 0, (hs.pd + 3.5 + 14 + rnd(seed, 8) * 5) / 2); G.walk.push(fw.applyMatrix4(m));
      z += hs.w + 12 + rnd(seed, 9) * 8; k++; } }
  for (const s of [-1, 1]) {
    let x = x0 + 8 + (s > 0 ? 14 : 0), k = 0;
    while (x < XC - WALK1 - 34) {
      const seed = (s > 0 ? 100 : 0) + k, hs = house(seed);
      const ry = s < 0 ? 0 : Math.PI, z = s * (WALK1 + 14 + rnd(seed, 8) * 5);
      const m = M4(x + hs.w / 2, 0, z, ry);
      for (const key of Object.keys(hs.G)) G[key].push(...place(hs.G[key], m));
      houses.push({ x: x + hs.w / 2, z, ry, hs, s, m });
      const fw = B(4.5, 0.35, Math.abs(z) - WALK1 - hs.pd - 3.5, 0, 0.2, 0, 0.04); fw.translate(hs.dx, 0, (hs.pd + 3.5 + (Math.abs(z) - WALK1)) / 2); G.walk.push(fw.applyMatrix4(m));
      x += hs.w + 12 + rnd(seed, 9) * 8; k++;
    }
  }
  // shrubs along the house fronts (GLB bush, placed after load) and a wooden fence along the back of every lot
  const bushSlots = [];
  for (const h of houses) {
    const { w, pw, pd, dx } = h.hs, porchR = -w / 2 + 1 + pw;
    for (let x = porchR + 1.8; x < w / 2 - 1; x += 3.0 + rnd(x, h.x) * 0.8) bushSlots.push(new THREE.Matrix4().copy(h.m).multiply(M4(x, 0, 1.6, rnd(x, 3) * 6, 1.8 + rnd(x, 4) * 0.8)));
    for (const x of [-w / 2 + 2, porchR - 2]) if (Math.abs(x - dx) > 3.8) bushSlots.push(new THREE.Matrix4().copy(h.m).multiply(M4(x, 0, pd + 1.2, rnd(x, 5) * 6, 1.6 + rnd(x, 6) * 0.6)));
    bushSlots.push(new THREE.Matrix4().copy(h.m).multiply(M4(w / 2 + 2.2, 0, -3, rnd(h.x, 7) * 6, 2.2)), new THREE.Matrix4().copy(h.m).multiply(M4(-w / 2 - 2.2, 0, -h.hs.d + 4, rnd(h.x, 8) * 6, 2.0)));
  }
  const picket = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.42, 0); sh.lineTo(0.42, 0); sh.lineTo(0.42, 5.2); sh.lineTo(0, 5.8); sh.lineTo(-0.42, 5.2); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }); })();
  const fence = (ax, az, bx, bz) => {   // boards + two rails + posts, from a to b
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), m0 = M4(ax, 0, az, ry);
    for (let u = 0.45; u < L; u += 0.9) G.woodF.push(tag(picket.clone().translate(u, 0, 0).applyMatrix4(m0)));
    for (const y of [1.2, 4.2]) G.woodF.push(B(L, 0.35, 0.2, L / 2, y, -0.2, 0.04).applyMatrix4(m0));
    for (let u = 0; u < L; u += 7.2) G.woodF.push(B(0.45, 5.0, 0.45, u, 2.5, -0.35, 0.05).applyMatrix4(m0));
  };
  G.woodF = [];
  for (const s of [-1, 1]) fence(x0 + 5, s * (WALK1 + 64), XC - WALK1 - 6, s * (WALK1 + 64));
  fence(XC + WALK1 + 58, -235, XC + WALK1 + 58, 235);
  // trees on the verge between curb and sidewalk
  const trees = [], LB = new LeafBatch();
  for (const s of [-1, 1]) for (let x = x0 + 5 + (s > 0 ? 20 : 0); x < XC - 30; x += 36 + rnd(x, s) * 16) {
    const t = tree(Math.floor(x * 7 + s * 13), 34 + rnd(x, 2) * 14, rnd(x, s + 4) < 0.2, LB);
    const m = M4(x, 0, s * (ROAD + 2), rnd(x, 6) * 6);
    G.bark.push(...place(t.bark, m)); G.tape.push(...place(t.tape, m));
    trees.push(V(x, 0, s * (ROAD + 2)));
  }
  for (let z = -220, i = 0; z < 220; z += 38 + rnd(i, 3) * 14, i++) { if (Math.abs(z) < ROAD + 6) continue; const t = tree(9000 + i, 34 + rnd(i, 2) * 14, rnd(i, 4) < 0.2, LB), m = M4(XC + ROAD + 2, 0, z, rnd(i, 6) * 6); G.bark.push(...place(t.bark, m)); G.tape.push(...place(t.tape, m)); }
  const treeLeafMats = LB.mats;   // tree leaves are instanced with the birch-leaf GLB once it has loaded
  // power poles + sagging wires along the right side (on the lawn edge, clear of the sidewalk)
  const poles = [], PZ = WALK1 + 1.4;
  for (let x = x0 + 10; x < XC - 30; x += 70) { G.bark.push(cyl(0.45, 0.6, 44, 10).translate(x, 22, PZ), B(0.5, 0.6, 10, x, 41, PZ, 0.05)); for (const dz of [-4, 0, 4]) G.chrome.push(cyl(0.2, 0.2, 0.8, 8).translate(x, 41.7, PZ + dz)); poles.push(x); }
  for (let i = 0; i < poles.length - 1; i++) for (const dz of [-4, 0, 4]) { const a = V(poles[i], 42, PZ + dz), b = V(poles[i + 1], 42, PZ + dz), mid = a.clone().lerp(b, 0.5); mid.y -= 3; G.wire.push(tube([a, mid, b], 0.06, 30, 4)); }
  // parked cars along both curbs
  const carSlots = [];
  for (let x = x0 + 30, k = 0; x < XC - 40; x += 45 + rnd(k, 1) * 50, k++) { const s = rnd(k, 2) > 0.5 ? 1 : -1; carSlots.push(M4(x, 0, s * (ROAD - 4.6), s > 0 ? 0 : Math.PI)); }
  for (let z = -200, k = 0; z < 200; z += 50 + rnd(k, 5) * 40, k++) if (Math.abs(z) > ROAD + 12) carSlots.push(M4(XC + ROAD - 4.6, 0, z, rnd(k, 6) > 0.5 ? Math.PI / 2 : -Math.PI / 2));
  // pumpkins: porch steps, lawns (kept off the front walks), along the lawn edge; lawn ghosts, tombstones
  let pk = 0;
  const putPumpkin = (x, y, z, r, lit, face = 0) => { const p = pumpkin(r, pk++ * 7 + 3, lit), m = M4(x, y + r * 0.62, z, face + (rnd(pk, 3) - 0.5) * 0.6); G.pumpkin.push(...place(p.body, m)); G.bark.push(...place(p.stem, m)); G.dark.push(...place(p.face, m)); };
  for (const h of houses) {
    const lm = h.m, face = h.ry;
    for (let k = 0; k < 3; k++) { const v = V(h.hs.dx + (k % 2 ? 2.1 : -2.1), h.hs.base * (1 - (k + 1) / 3.5) + 0.35, h.hs.pd + 0.7 + k * 1.4).applyMatrix4(lm); putPumpkin(v.x, v.y, v.z, 0.75 + rnd(pk, 1) * 0.4, rnd(pk, 2) > 0.3, face); }
    for (let k = 0; k < 7 + Math.floor(rnd(h.x, 3) * 8); k++) {
      const lx = (rnd(pk, 4) - 0.5) * h.hs.w; if (Math.abs(lx - h.hs.dx) < 3.6) { pk++; continue; }
      const v = V(lx, 0, h.hs.pd + 3 + rnd(pk, 5) * (Math.abs(h.z) - WALK1 - h.hs.pd - 5)).applyMatrix4(lm); putPumpkin(v.x, 0.1, v.z, 0.7 + rnd(pk, 6) * 1.1, rnd(pk, 7) > 0.5, face);
    }
    if (rnd(h.x, 5) > 0.45) { const g = ghost(5 + rnd(h.x, 6) * 2), m = new THREE.Matrix4().copy(lm).multiply(M4(h.hs.w * 0.35, 0, h.hs.pd + 6)); G.sheet.push(...place(g.sheet, m)); G.dark.push(...place(g.dark, m)); }
    if (rnd(h.x, 7) > 0.5) for (let k = 0; k < 3; k++) { const t = tombstone(h.x + k), m = new THREE.Matrix4().copy(lm).multiply(M4(h.hs.w * 0.3 - k * 3.4, 0, h.hs.pd + 9 + (k % 2) * 2, (rnd(k, h.x) - 0.5) * 0.3)); G.walk.push(...place(t.stone, m)); G.dark.push(...place(t.dark, m)); }
  }
  for (let x = x0 + 10; x < XC - WALK1 - 4; x += 6 + rnd(x, 9) * 14) { if (poles.some((p) => Math.abs(p - x) < 3)) continue; const s = rnd(x, 10) > 0.5 ? 1 : -1; putPumpkin(x, 0.3, s * (WALK1 + 1.6), 0.7 + rnd(x, 11) * 0.6, false, s > 0 ? Math.PI : 0); }
  trees.forEach((t, i) => { if (i % 4 !== 1) return; const g = ghost(3.2), m = M4(t.x + 3, 13, t.z, 0.5); G.sheet.push(...place(g.sheet, m)); G.dark.push(...place(g.dark, m)); G.wire.push(tube([V(t.x + 3, 16.3, t.z), V(t.x + 3.2, 20, t.z)], 0.03, 4, 3)); });
  // fallen leaves on the road edge, sidewalks and lawns
  const lf = new THREE.Shape(); lf.moveTo(0, -0.4); lf.quadraticCurveTo(0.35, 0, 0, 0.45); lf.quadraticCurveTo(-0.35, 0, 0, -0.4);
  const leafG = new THREE.ShapeGeometry(lf, 3).rotateX(-Math.PI / 2);
  const groundLeafMats = [];
  for (let i = 0; i < 2800; i++) { const x = x0 - 10 + rnd(i, 1) * (XC - 24 - x0), s = rnd(i, 2) > 0.5 ? 1 : -1, z = s * (ROAD - 3 + rnd(i, 3) ** 1.6 * 32);
    const sc = 1.1 + rnd(i, 5) * 0.6; groundLeafMats.push(new THREE.Matrix4().compose(V(x, 0.46 + (Math.abs(z) > WALK0 && Math.abs(z) < WALK1 ? 0.2 : 0), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rnd(i, 6) - 0.5) * 0.3, 0, rnd(i, 4) * 6.3, 'YXZ')), V(sc, sc, sc))); }

  // ---- the portal: a free-standing slab across the end of the road with an arched opening onto another world
  const XP = XC - 30;
  {
    const PW = 34, PH = 46, TH = 6, OW = 16, OS = 24;
    const sh = new THREE.Shape(); sh.moveTo(-PW / 2, 0); sh.lineTo(PW / 2, 0); sh.lineTo(PW / 2, PH); sh.lineTo(-PW / 2, PH); sh.closePath();
    const hole = new THREE.Path(); hole.moveTo(-OW / 2, 0.01); hole.lineTo(OW / 2, 0.01); hole.lineTo(OW / 2, OS); hole.absarc(0, OS, OW / 2, 0, Math.PI, false); hole.closePath(); sh.holes.push(hole);
    const slab = new THREE.ExtrudeGeometry(sh, { depth: TH, bevelEnabled: false, curveSegments: 40 }); slab.translate(0, 0, -TH / 2); slab.rotateY(Math.PI / 2); slab.translate(XP, 0.17, 0);
    G.trim.push(slab);   // mortar core
    // brick skin on both faces (running bond), cut around the opening, and a ring of radial bricks round the arch
    const BL = 2.6, BHt = 1.05, GAP = 0.12, BD = 0.4, R0 = OW / 2;
    const inHole = (z, y) => Math.abs(z) < R0 && (y < OS || z * z + (y - OS) ** 2 < R0 * R0);
    const nearArch = (z, y) => y > OS - 0.2 && Math.hypot(z, y - OS) < R0 + 1.9;
    for (let row = 0, y = 0; y < PH - 0.2; row++, y += BHt) {
      const h = Math.min(BHt, PH - y) - GAP, yc = y + (h + GAP) / 2;
      for (let z = -PW / 2 - (row % 2 ? BL / 2 : 0); z < PW / 2; z += BL) {
        let a = Math.max(-PW / 2, z), b = Math.min(PW / 2, z + BL) - GAP;
        if (yc < OS + 0.3) { if (a < R0 && b > -R0) { if (a < -R0) b = Math.min(b, -R0 - 0.05); else a = Math.max(a, R0 + 0.05); } }   // jambs: cut at the opening
        if (b - a < 0.35) continue;
        const zc = (a + b) / 2; if (inHole(zc, yc) || nearArch(zc, yc) || nearArch(a, yc) || nearArch(b, yc)) continue;
        for (const sx of [-1, 1]) G.pbrick.push(B(BD, h, b - a, XP + sx * (TH / 2 + BD / 2 - 0.08), 0.17 + yc, zc, 0.05));
      }
    }
    for (let i = 0; i <= 17; i++) {   // voussoirs
      const t = Math.PI - (i / 17) * Math.PI, r = R0 + 0.95, z = Math.cos(t) * r, y = OS + Math.sin(t) * r;
      for (const sx of [-1, 1]) { const g = B(BD, 1.8, (Math.PI * r) / 18 - GAP, 0, 0, 0, 0.05); g.rotateX(-(t - Math.PI / 2)); g.translate(XP + sx * (TH / 2 + BD / 2 - 0.08), 0.17 + y, z); G.pbrick.push(g); }
    }
    root.userData.portal = { XP, face: TH / 2 + BD - 0.08, PW, PH, OW, OS, y0: 0.17 };   // graffiti anchor
    G.walk.push(B(TH + 3, 0.6, PW + 3, XP, 0.3, 0, 0.1));                         // plinth
    if (portalMat) {
      const op = new THREE.Shape(hole.getPoints(48)); const g = new THREE.ShapeGeometry(op, 40); g.rotateY(Math.PI / 2); g.translate(XP, 0.17, 0);
      const m = new THREE.Mesh(g, portalMat); m.frustumCulled = false; root.add(m);
    }
  }
  root.userData.portalX = XP;
  // storm drain at the curb (for the raincoat kid)
  const drainX = (() => { let best = 70, bd = 0; for (let x = 60; x < 150; x += 2) { const d = Math.min(...trees.filter((t) => t.z > 0).map((t) => Math.abs(t.x - x)), ...poles.map((p) => Math.abs(p - x))); if (d > bd) { bd = d; best = x; } } return best; })();
  G.dark.push(B(3.2, 0.12, 1.4, drainX, 0.1, ROAD - 0.9, 0.02)); for (let k = 0; k < 9; k++) G.chrome.push(B(0.12, 0.16, 1.3, drainX - 1.4 + k * 0.35, 0.14, ROAD - 0.9, 0.02));

  for (const k of Object.keys(G)) if (G[k].length) { const m = new THREE.Mesh(merge(G[k]), M[k]); m.frustumCulled = false; root.add(m); }

  // falling leaves (instanced, recycled around the camera)
  const LC = { fallCount: 700, fallSize: 1, fallSpeed: 1, groundSize: 1, treeSize: 1 };   // live leaf controls
  // ≤ 1000: three keeps these matrices in one uniform buffer (64 KB max in WebGPU) — 4000 broke the whole street render
  const NL = 1000, fall = new THREE.InstancedMesh(tag(new THREE.ShapeGeometry(lf, 3), 0.77), M.fallLeaves, NL); fall.frustumCulled = false;
  const _rm = new THREE.Matrix4(), _rs = new THREE.Matrix4();
  let instances = [];
  function resize() { for (const m of instances) { const { mats, scale, key } = m.userData.lc, k = scale * LC[key]; _rs.makeScale(k, k, k); mats.forEach((x, i) => m.setMatrixAt(i, _rm.copy(x).multiply(_rs))); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); m.boundingSphere.radius += 3 * k; } }
  const LS = []; for (let i = 0; i < NL; i++) LS.push({ p: V(0, -99, 0), v: V(), a: rnd(i, 5) * 6.3, w: 0.5 + rnd(i, 6) * 1.5, s: 0.9 + rnd(i, 7) * 0.8 });
  root.add(fall);
  // birch leaf (supplied GLB): simplified by vertex clustering, laid in the xy plane (length along y, ≈1 unit)
  new GLTFLoader().loadAsync('./assets/birch_leaf.glb').then((g) => {
    g.scene.updateMatrixWorld(true);
    let src = null; g.scene.traverse((o) => { if (o.isMesh && !src) src = o.geometry.clone().applyMatrix4(o.matrixWorld); });
    for (const k of Object.keys(src.attributes)) if (k !== 'position') src.deleteAttribute(k);
    src.computeBoundingBox(); const sz = src.boundingBox.getSize(V(0, 0, 0)), c = src.boundingBox.getCenter(V(0, 0, 0));
    src.translate(-c.x, -c.y, -c.z);
    const ax = ['x', 'y', 'z'].sort((a, b) => sz[a] - sz[b]);           // thin, width, length
    const P = src.attributes.position, pos = new Float32Array(P.count * 3), L = sz[ax[2]];
    for (let i = 0; i < P.count; i++) { const v = { x: P.getX(i), y: P.getY(i), z: P.getZ(i) }; pos[i * 3] = v[ax[1]] / L; pos[i * 3 + 1] = v[ax[2]] / L; pos[i * 3 + 2] = v[ax[0]] / L; }
    const leaf = new THREE.BufferGeometry(); leaf.setAttribute('position', new THREE.BufferAttribute(pos, 3)); leaf.setIndex(src.index ? [...src.index.array] : null);
    const simplify = (geo, cell) => {   // vertex clustering: merge vertices per grid cell, drop collapsed triangles
      const p = geo.attributes.position, map = new Map(), rep = [], cnt = [], remap = new Int32Array(p.count);
      for (let i = 0; i < p.count; i++) { const k = Math.floor(p.getX(i) / cell) + ',' + Math.floor(p.getY(i) / cell) + ',' + Math.floor(p.getZ(i) / (cell * 4));
        let id = map.get(k); if (id === undefined) { id = rep.length / 3; map.set(k, id); rep.push(0, 0, 0); cnt.push(0); }
        rep[id * 3] += p.getX(i); rep[id * 3 + 1] += p.getY(i); rep[id * 3 + 2] += p.getZ(i); cnt[id]++; remap[i] = id; }
      for (let i = 0; i < cnt.length; i++) for (let a = 0; a < 3; a++) rep[i * 3 + a] /= cnt[i];
      const idx = geo.index ? geo.index.array : [...Array(p.count).keys()], out = [];
      for (let i = 0; i < idx.length; i += 3) { const a = remap[idx[i]], b = remap[idx[i + 1]], c2 = remap[idx[i + 2]]; if (a !== b && b !== c2 && a !== c2) out.push(a, b, c2); }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(rep, 3)); g2.setIndex(out); g2.computeVertexNormals(); return tag(g2, 0.77);
    };
    const hi = simplify(leaf, 0.035), lo = simplify(leaf, 0.16);
    fall.geometry = hi.clone().scale(1.1, 1.1, 1.1);
    instances = [];
    // split along the street into 40-unit chunks: each chunk is frustum-culled on its own, so only the leaves in
    // view are drawn (the whole street's canopy was drawn every frame, behind the camera too — millions of triangles)
    const inst = (geo, all, scale, key) => {
      const bins = new Map(); for (const x of all) { const b = Math.floor(x.elements[12] / 40); if (!bins.has(b)) bins.set(b, []); bins.get(b).push(x); }
      for (const mats of bins.values()) { const m = new THREE.InstancedMesh(geo, M.leaves, mats.length); m.userData.lc = { mats, scale, key }; instances.push(m); const sm = new THREE.Matrix4().makeScale(scale, scale, scale); mats.forEach((x, i) => m.setMatrixAt(i, x.clone().multiply(sm))); m.computeBoundingSphere(); m.boundingSphere.radius += 3 * scale; m.frustumCulled = true; root.add(m); }
    };
    inst(hi, groundLeafMats, 1.0, 'groundSize');
    inst(lo, treeLeafMats.filter((_, i) => i % 2 === 0), 1.6, 'treeSize'); resize();   // half as many, a bit larger: same canopy density, far fewer triangles
  }).catch((e) => console.warn('birch leaf glb', e));

  // kids — every costume once. Walkers share one speed and each group has its own lane in the road (clear of
  // the parked cars), so nobody walks through anything; the rest stand on porches, lawns and the sidewalk.
  const kids = [];
  const addKid = (kind, x, z, walk, ry, i, y = 0.1) => { const k = kid(kind, i * 17 + 3, kidM); k.position.set(x, y, z); k.rotation.y = ry; k.userData.walk = walk; k.scale.setScalar(0.92 + rnd(i, 3) * 0.16); root.add(k); kids.push(k); return k; };
  const groups = [[['ghost', 'witch', 'pumpkinsuit'], -5.5], [['vampire', 'mummy'], 5], [['skeleton', 'reaper', 'werewolf'], -6], [['frank', 'devil', 'clown'], 6]];
  const KIDS_ON = false;
  if (KIDS_ON) groups.forEach(([kinds, lane], gi) => { const gx = x0 + 40 + gi * 95; kinds.forEach((kind, j) => addKid(kind, gx + (j % 2) * 1.4, lane + (j - (kinds.length - 1) / 2) * 2.9, 2.3, Math.PI / 2, gi * 5 + j)); });
  if (KIDS_ON) addKid('georgie', drainX + 0.5, WALK0 + 1.6, 0, Math.PI, 40, 0.37);
  const hL = houses.filter((h) => h.s < 0), hR = houses.filter((h) => h.s > 0);
  if (KIDS_ON && hL[1]) { const h = hL[1], v = V(h.hs.dx, 0, h.hs.pd + (Math.abs(h.z) - WALK1 - h.hs.pd) * 0.55).applyMatrix4(h.m); addKid('jigsaw', v.x, v.z, 0, h.ry + 0.4, 41, 0.37); }
  if (KIDS_ON && hR[0]) { const h = hR[0], v = V(h.hs.px + h.hs.pw / 4, h.hs.base, h.hs.pd - 2.6).applyMatrix4(h.m); addKid('myers', v.x, v.z, 0, h.ry, 42, h.hs.base); const pv = V(h.hs.px + h.hs.pw / 4 + 1.6, h.hs.base, h.hs.pd - 2.2).applyMatrix4(h.m); const p = pumpkin(0.6, 991, true), m = M4(pv.x, pv.y + 0.4, pv.z, h.ry); const add = [new THREE.Mesh(merge(place(p.body, m)), M.pumpkin), new THREE.Mesh(merge(place([...p.stem], m)), M.bark), new THREE.Mesh(merge(place(p.face, m)), M.dark)]; add.forEach((x) => root.add(x)); }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  // ---- road signs (poles, trees, house walls, car stickers), a barricade before the portal, wind-blown paper
  const nm = (g) => (g.index ? g.toNonIndexed() : g);
  const mergeNI = (list) => mergeGeometries(list.map(nm));
  const signMat = inkMat({ color: '#fff', flat: 1, pattern: signPattern(), side: THREE.DoubleSide }); signMat.userData.sfx = 'metal';
  const plates = [], metal = [], wood = [];
  const put = (o, m) => { (o.plates || []).forEach((g) => plates.push(g.applyMatrix4(m))); (o.metal || []).forEach((g) => metal.push(g.applyMatrix4(m))); (o.wood || []).forEach((g) => wood.push(g.applyMatrix4(m))); };
  { const kinds = ['speed', 'oneway', 'noparking', 'ped', 'wrongway', 'caution', 'yield', 'rxr', 'parking', 'donotenter'];
    let k = 0;
    for (let x = x0 + 25; x < XC - 60; x += 48 + rnd(x, 31) * 34, k++) {
      const s2 = k % 2 ? 1 : -1; let xx = x;
      while (poles.some((p) => Math.abs(p - xx) < 4) || trees.some((t) => Math.abs(t.x - xx) < 4 && Math.sign(t.z) === s2)) xx += 3;
      put(poleSign(pick(kinds, k), 3.4, 10), M4(xx, 0.3, s2 * (ROAD + 1.3), -Math.PI / 2 - s2 * 0.35));
    }
    put(poleSign('stop', 3.8, 10), M4(XC - WALK1 - 2, 0.3, -(ROAD + 1.3), -Math.PI / 2 + 0.35));
    put(poleSign('deadend', 4.2, 8, true), M4(XP - 16, 0.2, 10, -Math.PI / 2 - 0.25));
    put(poleSign('wrongway', 3.6, 6, true), M4(XP - 26, 0.2, -12, -Math.PI / 2 + 0.3));
    put(barricade(), M4(XP - 21, 0.2, -8.5, -Math.PI / 2 + 0.3)); }   // pushed to the left: the camera walks between it and the dead-end sign
  { // plates nailed to trees and house walls: raycast onto the merged meshes (root is still at the origin here)
    root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), meshesOf = (mat) => root.children.filter((o) => o.isMesh && o.material === mat);
    const bark = meshesOf(M.bark), walls = [...meshesOf(M.siding), ...meshesOf(M.brick), ...meshesOf(M.trim)];
    const hit = (list, from, dir) => { ray.set(from, dir.normalize()); ray.far = 40; return ray.intersectObjects(list, false)[0]; };
    const small = ['hello', 'label', 'wakeup', 'stop', 'deadend', 'noparking', 'parking'];
    trees.forEach((t, i) => { if (i % 3) return; const sd = Math.sign(t.z) || 1, h = hit(bark, V(t.x, 5.5 + rnd(i, 41) * 3, t.z - sd * 10), V(0, 0, sd)); if (!h) return;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); n.y = 0; if (n.lengthSq() < 0.1) return; n.normalize();
      plates.push(placeOn(signGeo(pick(small, i), 1.9 + rnd(i, 42)), h.point, n, (rnd(i, 43) - 0.5) * 0.5, 0.08)); });
    const big = ['deadend', 'wrongway', 'oneway', 'parking', 'caution', 'hello', 'noparking', 'stop'];
    houses.forEach((hh, i) => { if (hh.cross || i % 2) return; const { w, base } = hh.hs;
      for (let k = 0; k < 2; k++) {
        const lx = (rnd(i, 50 + k) - 0.5) * (w - 6), from = V(lx, base + 6 + rnd(i, 52 + k) * 5, 20).applyMatrix4(hh.m), dir = V(0, 0, -1).transformDirection(hh.m);
        const h = hit(walls, from, dir); if (!h) continue; const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (Math.abs(n.y) > 0.3) continue;
        plates.push(placeOn(signGeo(pick(big, i * 2 + k), 2.6 + rnd(i, 54 + k) * 1.4), h.point, n, (rnd(i, 56 + k) - 0.5) * 0.4, 0.06));
      } });
  }
  if (plates.length) { const m = new THREE.Mesh(mergeNI(plates), signMat); m.frustumCulled = false; root.add(m); }
  if (metal.length) { const m = new THREE.Mesh(mergeNI(metal), M.chrome); m.frustumCulled = false; root.add(m); }
  if (wood.length) { const m = new THREE.Mesh(mergeNI(wood), M.woodF); m.frustumCulled = false; root.add(m); }
  root.userData.stickCars = (carMesh) => {   // stickers on the parked cars (after their GLBs have loaded)
    const ray = new THREE.Raycaster(), out = [], names = ['hello', 'label', 'wakeup', 'parking'];
    carMesh.updateMatrixWorld(true);
    const names2 = ['hello', 'label', 'wakeup', 'parking', 'stop', 'deadend', 'noparking', 'yield', 'rxr'];
    const shoot = (from, dir, name, size, roll) => { ray.set(from, dir); ray.far = 14; const h = ray.intersectObject(carMesh, false)[0]; if (!h) return; const n = h.face.normal.clone().transformDirection(carMesh.matrixWorld); out.push(placeOn(signGeo(name, size, 0.01), h.point, n, roll, 0.03)); };
    carSlots.forEach((m, i) => {
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++)   // doors, fenders, both sides
        shoot(V(-6 + k * 4 + (rnd(i * 4 + k, 63 + sd) - 0.5) * 2, 1.8 + rnd(i * 4 + k, 64) * 2.2, sd * 9).applyMatrix4(m), V(0, 0, -sd).transformDirection(m), pick(names2, i * 7 + k * 3 + sd), 0.9 + rnd(i * 4 + k, 65) * 0.8, (rnd(i * 4 + k, 66) - 0.5) * 0.8);
      for (const sx of [-1, 1]) for (let k = 0; k < 2; k++)   // bumper stickers front and back
        shoot(V(sx * 13, 1.6 + k * 0.9, (k - 0.5) * 2.2).applyMatrix4(m), V(-sx, 0, 0).transformDirection(m), pick(names2, i * 5 + k + sx * 2), 0.8 + rnd(i, 67 + k) * 0.5, (rnd(i, 68 + k) - 0.5) * 0.5);
    });
    if (out.length) { const mm = new THREE.Mesh(mergeNI(out), signMat); mm.frustumCulled = false; root.add(mm); }
  };
  // newspapers and a plastic bag blown along the street towards you
  const newsMat = inkMat({ color: '#fff', flat: 1, pattern: signPattern(), side: THREE.DoubleSide }); newsMat.userData.sfx = 'paper';
  const bagMat = inkMat({ color: '#fff', flat: 1, pattern: signPattern(), side: THREE.DoubleSide }); bagMat.opacityNode = signAlpha(); bagMat.alphaTest = 0.5; bagMat.userData.sfx = 'paper';
  const fly = new Flyers({ news: newsMat, bag: bagMat, bag3d: newsMat }, [['news', 3.2], ['bag3d', 3.4], ['news', 2.8], ['news', 3.4], ['bag3d', 2.9], ['news', 2.5], ['news', 3.0], ['news', 2.7]], { ahead: 110, behind: 20, near: 8, spread: 40, y0: 2, y1: 13, dir: V(1, 0, 0), wind: 5, clampZ: 26 });
  root.add(fly.group); const FLY = { on: 1, count: 6, speed: 1 }; root.userData.fly = FLY;
  const update = (t, dt, camPos, wind = 1) => {
    for (const k of kids) {
      const u = k.userData, w = u.walk;
      if (w > 0) { k.position.x += w * dt; if (k.position.x > x1) k.position.x = x0 + 20; }
      const ph = t * (w > 0 ? 6.5 : 1.4) + u.phase, amp = w > 0 ? u.legAmp : 0;
      u.legs[0].rotation.x = Math.sin(ph) * amp; u.legs[1].rotation.x = -Math.sin(ph) * amp;
      const aa = w > 0 ? u.armAmp : 0.03;
      u.arms[0].rotation.x = u.base[0] - Math.sin(ph) * aa; u.arms[1].rotation.x = u.base[1] + Math.sin(ph) * aa * 0.35;
      u.body.position.y = u.still ? 0 : Math.abs(Math.cos(ph)) * 0.1 * (w > 0 ? 1 : 0.25);
      u.body.rotation.z = w > 0 ? Math.sin(ph) * 0.03 : 0;
    }
    fly.group.visible = !!FLY.on; if (FLY.on && camPos) fly.update(t, dt, camPos, FLY);
    fall.count = Math.min(NL, Math.round(LC.fallCount)); const fdt = dt * LC.fallSpeed;
    for (let i = 0; i < fall.count; i++) {
      const L = LS[i];
      if (L.p.y < 0.3 || L.p.x < camPos.x - 30 || L.p.x > camPos.x + 170) {
        L.p.set(camPos.x - 20 + Math.random() * 180, 10 + Math.random() * 35, (Math.random() - 0.5) * 80); L.v.set(0, -1.5 - Math.random() * 1.5, 0);
      }
      L.a += fdt * L.w * 2;
      L.p.x += (Math.sin(L.a) * 2.2 + 1.2 * wind) * fdt; L.p.z += Math.cos(L.a * 0.7) * 1.4 * fdt; L.p.y += L.v.y * fdt * (0.6 + 0.4 * Math.abs(Math.sin(L.a)));
      _e.set(Math.sin(L.a) * 1.2, L.a, Math.cos(L.a * 1.3)); _q.setFromEuler(_e);
      _m.compose(L.p, _q, _s.setScalar(L.s * LC.fallSize)); fall.setMatrixAt(i, _m);
    }
    fall.instanceMatrix.needsUpdate = true;
  };
  // cars from the supplied GLBs: textures dropped, geometry printed in our style (paper body, dark glass)
  const loader = new GLTFLoader();
  const proto = (url, glassMat) => loader.loadAsync(url).then((g) => {
    g.scene.updateMatrixWorld(true);
    const body = [], glass = [];
    g.scene.traverse((o) => { if (!o.isMesh || /plane/i.test(o.name)) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); for (const k of Object.keys(geo.attributes)) if (k !== 'position') geo.deleteAttribute(k); geo.computeVertexNormals(); ((o.material && o.material.name === glassMat) ? glass : body).push(geo); });
    const all = mergeGeometries([...body, ...glass].map((q) => q.index ? q.toNonIndexed() : q)); all.computeBoundingBox();
    const bb = all.boundingBox, sz = bb.getSize(V(0, 0, 0)), ctr = bb.getCenter(V(0, 0, 0));
    const along = sz.x >= sz.z ? 0 : Math.PI / 2, L = Math.max(sz.x, sz.z), sc = 17.4 / L;
    const fix = new THREE.Matrix4().makeScale(sc, sc, sc).multiply(new THREE.Matrix4().makeRotationY(along)).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -bb.min.y, -ctr.z));
    const out = (list) => list.map((q) => tag(clean(q.applyMatrix4(fix)), Math.random()));
    return { body: out(body), glass: out(glass) };
  });
  loader.loadAsync('./assets/bush.glb').then((g) => {
    g.scene.updateMatrixWorld(true);
    let src = null, map = null; g.scene.traverse((o) => { if (o.isMesh && !src) { src = o.geometry.clone().applyMatrix4(o.matrixWorld); map = o.material.map; } });
    src.computeBoundingBox(); const bb = src.boundingBox, sz = bb.getSize(V(0, 0, 0)), c = bb.getCenter(V(0, 0, 0)), sc = 2.2 / Math.max(sz.x, sz.z);
    src.translate(-c.x, -bb.min.y, -c.z).scale(sc, sc, sc);
    for (const k of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(k)) src.deleteAttribute(k);
    const list = bushSlots.map((m) => src.clone().applyMatrix4(m));
    const geo = mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)));
    const mat = inkMat({ color: '#4f5a3c', flat: 1, side: THREE.DoubleSide });   // leaf cards: cut out by the texture's alpha, outlines from depth
    mat.opacityNode = texture(map).a; mat.alphaTest = 0.5; mat.transparent = false;
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; root.add(mesh);
  }).catch((e) => console.warn('bush glb', e));
  Promise.all([proto('./assets/car_old.glb', 'Material_295'), proto('./assets/car_low.glb', '-')]).then((P) => {
    const body = [], glass = [];
    carSlots.forEach((m, i) => { const p = P[i % P.length]; body.push(...p.body.map((q) => q.clone().applyMatrix4(m))); glass.push(...p.glass.map((q) => q.clone().applyMatrix4(m))); });
    { const k = Math.min(2, carSlots.length - 1), p = P[k % P.length], one = new THREE.Mesh(merge(p.body.map((q) => q.clone().applyMatrix4(carSlots[k]))), M.car); one.visible = false; root.add(one); root.userData.carOne = one; }   // one car on its own (hidden): the 'old sedan' module
    const carMesh = new THREE.Mesh(merge(body), M.car); root.add(carMesh); if (glass.length) root.add(new THREE.Mesh(merge(glass), M.dark));
    root.userData.stickCars(carMesh);
  }).catch((e) => console.warn('car glb', e));
  const setLeaves = (o) => { const re = o.groundSize !== undefined && o.groundSize !== LC.groundSize || o.treeSize !== undefined && o.treeSize !== LC.treeSize; Object.assign(LC, o); if (re) resize(); };
  // ---- red ink on the street: drag smears along the road, prints and splatters on sidewalks, porches, doors
  {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UP = V3(0, 1, 0);
    const P = [], Sp = [], Sm = [];
    const r = (i, k) => rnd(i * 5.31 + k * 2.17, k + 11);
    for (let i = 0; i < 90; i++) { const L = 8 + r(i, 1) * 20, a = (r(i, 2) - 0.5) * 0.35; Sm.push({ p: V3(x0 + r(i, 3) * (XP - x0 - 20), 0.19, (r(i, 4) - 0.5) * (ROAD * 2 - 6)), n: UP, dir: V3(Math.cos(a), 0, Math.sin(a)), s: [L, 1.4 + r(i, 5) * 1.8] }); }
    for (let i = 0; i < 240; i++) Sp.push({ p: V3(x0 + r(i, 6) * (XC - x0 - 30), 0.19, (r(i, 7) - 0.5) * (ROAD * 2 - 2)), n: UP, s: 3 + r(i, 8) * 6 });
    for (let i = 0; i < 500; i++) { const sd = r(i, 9) < 0.5 ? -1 : 1; P.push({ p: V3(x0 + r(i, 10) * (XC - x0 - 30), 0.395, sd * (WALK0 + 0.4 + r(i, 11) * (WALK1 - WALK0 - 0.8))), n: UP, s: 0.8 + r(i, 12) * 0.5 }); }
    for (let i = 0; i < 120; i++) { const sd = r(i, 13) < 0.5 ? -1 : 1; Sp.push({ p: V3(x0 + r(i, 14) * (XC - x0 - 30), 0.4, sd * (WALK0 + 2.5)), n: UP, s: 2.5 + r(i, 15) * 3 }); }
    houses.forEach((h, k) => {
      const at = (x, y, z, n, s, list) => list.push({ p: V3(x, y, z).applyMatrix4(h.m), n: n.clone().transformDirection(h.m), s });
      const { px, pw, pd, dx, base } = h.hs;
      for (let i = 0; i < 6; i++) at(px + (r(k * 9 + i, 20) - 0.5) * (pw - 1), base + 0.02, 0.8 + r(k * 9 + i, 21) * (pd - 1.6), UP, 0.9, P);
      for (let i = 0; i < 5; i++) at(dx + (r(k * 7 + i, 22) - 0.5) * 2.6, base + 1.5 + r(k * 7 + i, 23) * 5, 0.42, V3(0, 0, 1), 0.55 + r(k, 24) * 0.25, P);
      if (r(k, 25) < 0.6) at(dx + (r(k, 26) - 0.5) * 2, base + 3 + r(k, 27) * 3, 0.43, V3(0, 0, 1), 3 + r(k, 28) * 2, Sp);
      if (r(k, 29) < 0.5) at(px + (r(k, 30) - 0.5) * pw * 0.6, base + 0.03, pd * 0.5, UP, 4 + r(k, 31) * 3, Sp);
      for (let i = 0; i < 4; i++) at((r(k * 5 + i, 32) - 0.5) * h.hs.w * 0.8, base + 2 + r(k * 5 + i, 33) * 8, 0.035, V3(0, 0, 1), 0.6, P);
    });
    for (let i = 0; i < 12; i++) P.push({ p: V3(XP - 3.05, 2 + r(i, 40) * 14, (r(i, 41) < 0.5 ? -1 : 1) * (9 + r(i, 42) * 6)), n: V3(-1, 0, 0), s: 0.7 });   // on the portal's face
  }
  root.userData.update = update; root.userData.leafVis = (v) => { instances.forEach((m) => (m.visible = v)); fall.visible = v; }; root.userData.len = x1; root.userData.setLeaves = setLeaves;
  return root;
}
