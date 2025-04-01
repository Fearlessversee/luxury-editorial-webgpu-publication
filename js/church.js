import { setRoles } from './palette.js';
import { inkLine } from './lines.js';
import * as THREE from 'three';
import { tagSfx } from './sound.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Fn, float, vec2, vec3, uv, fract, abs, smoothstep, floor, mix, min, positionLocal, sin, fwidth, positionWorld } from 'three';

// Scene 2: a long gothic church corridor (nave), built procedurally around the stone altar the crystal ball
// stands on. Masonry walls stone by stone, a pointed ribbed vault, clustered piers, lancet windows, side
// archways, pews with carved ends, a flagstone floor, steps up to an arched door, wall lantern, an icon —
// and a wrought-iron chandelier (unlit). Everything uses the same ink material model as the rest of the site.
// Axes: the corridor runs along z (camera end at +z, door end at −z); the altar top centre is at (0, tableTop, 0).

const rnd = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
const clean = (g) => {
  let n = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
};
const merge = (list) => { const L = list.map(clean); const r = mergeGeometries(L); if (!r) { const ks = L.map((g) => Object.keys(g.attributes).join(',') + (g.index ? '+i' : '')); console.error('MERGE', 'church.js', [...new Set(ks)].join(' | ')); } return r; };
const tag = (g, t) => { g.userData.tagged = true; if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, t, a.getY(i)); return g; };   // per-stone tint in uv.x

// bevelled box (2 segments per axis, corners pulled onto a radius) — reads as cut stone / planed wood
function bbox(w, h, d, r = null, seg = 2) {
  r = r ?? Math.min(w, h, d) * 0.14;
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -ix, ix), THREE.MathUtils.clamp(v.y, -iy, iy), THREE.MathUtils.clamp(v.z, -iz, iz));
    const o = v.clone().sub(c); if (o.lengthSq() < 1e-12) continue;
    o.normalize(); p.setXYZ(i, c.x + o.x * r, c.y + o.y * r, c.z + o.z * r); n.setXYZ(i, o.x, o.y, o.z);
  }
  return g;
}
// rough stone: bevelled box whose front face is chipped / bulged a little
function stone(w, h, d) { return bbox(w, h, d, Math.min(0.08, Math.min(w, h) * 0.06)); }   // clean cut block: flat faces, crisp outline
// prism from a 2D quad (u,v) extruded along z0..z1 (voussoirs, flagstones, wedges)
function prism(q, z0, z1) {
  const P = [];
  for (const z of [z0, z1]) for (const [x, y] of q) P.push([x, y, z]);
  const faces = [[0, 1, 2, 3].reverse(), [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const pos = [];
  for (const f of faces) { const [a, b, c, d] = f.map((i) => P[i]); pos.push(...a, ...b, ...c, ...a, ...c, ...d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // make sure faces point outward (the quad winding may be either way)
  const c = new THREE.Vector3(); g.computeBoundingBox(); g.boundingBox.getCenter(c);
  const a = g.attributes.position, nn = g.attributes.normal, v = new THREE.Vector3(), n = new THREE.Vector3();
  v.fromBufferAttribute(a, 0).sub(c); n.fromBufferAttribute(nn, 0);
  if (v.dot(n) < 0) { for (let i = 0; i < a.count; i += 3) { const t = [a.getX(i + 1), a.getY(i + 1), a.getZ(i + 1)]; a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)); a.setXYZ(i + 2, ...t); } g.computeVertexNormals(); }
  return g;
}
const tube = (pts, r, seg = 64, rad = 10) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const cyl = (r0, r1, h, s = 24) => new THREE.CylinderGeometry(r0, r1, h, s);

// pointed (two-centred) arch: k = radius / span (1 = equilateral). y above the springing line at offset du
const archY = (du, w, k = 1) => { const R = k * w, c = R - w / 2; const q = R * R - (Math.abs(du) + c) ** 2; return q > 0 ? Math.sqrt(q) : 0; };
const archRise = (w, k = 1) => archY(0, w, k);
// outline points of an arch opening (u,v): left jamb bottom → springing → apex → right springing → right bottom
function archOutline(uc, v0, vs, w, k = 1, n = 24, grow = 0) {
  const R = k * w + grow, c = k * w - w / 2, pts = [];
  pts.push([uc - w / 2 - grow, v0]);
  for (let i = 0; i <= n; i++) {                        // left arc, centre at (uc + c, vs), from the springer up to the apex
    const ang = Math.PI - Math.acos(c / R) * (i / n);
    pts.push([uc + c + R * Math.cos(ang), vs + R * Math.sin(ang)]);
  }
  for (let i = n - 1; i >= 0; i--) { const [x, y] = pts[i + 1]; pts.push([2 * uc - x, y]); }
  pts.push([uc + w / 2 + grow, v0]);
  return pts;
}
const insideArch = (u, v, o) => { const du = u - o.uc; if (Math.abs(du) >= o.w / 2 || v <= o.v0) return false; return v < o.vs || v - o.vs < archY(du, o.w, o.k); };

// masonry wall in local coords: u along, v up, blocks protrude towards +z (into the nave)
function masonry({ len, height, holes = [], top = null, seed = 0, depth = 0.9, skip = null }) {
  const out = [];
  let v = 0, row = 0;
  while (v < height - 0.05) {
    const h = Math.min(height - v, 0.95 + rnd(row, seed) ** 1.5 * 1.5);
    let u = -rnd(row, seed + 1) * 2.2, col = 0;
    while (u < len) {
      const L = 1.3 + rnd(row * 97 + col, seed + 2) ** 1.3 * 3.9;
      const a = Math.max(0, u), b = Math.min(len, u + L);
      if (b - a > 0.35) {
        const cs = [[a, v], [b, v], [a, v + h], [b, v + h], [(a + b) / 2, v + h / 2]];
        const blocked = cs.some(([x, y]) => holes.some((o) => insideArch(x, y, o))) || (top && cs.some(([x, y]) => y > top(x) + 0.2)) || (skip && skip((a + b) / 2, v + h / 2));
        if (!blocked) {
          const id = row * 131 + col + seed * 7919, d = depth + rnd(id, 5) * 0.35;
          const g = stone(b - a - 0.05, h - 0.05, d, id);
          g.translate((a + b) / 2, v + h / 2, d / 2 - 0.25);
          out.push(tag(g, rnd(id, 8)));
        }
      }
      u += L; col++;
    }
    v += h; row++;
  }
  return out;
}
// backing (the mortar behind the stones) with the openings cut out
function backing(len, height, holes, top = null) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(len, 0);
  if (top) { for (let i = 0; i <= 64; i++) { const u = len - (len * i) / 64; s.lineTo(u, top(u)); } }
  else { s.lineTo(len, height); s.lineTo(0, height); }
  s.closePath();
  for (const o of holes) { const p = new THREE.Path(); archOutline(o.uc, o.v0, o.vs, o.w, o.k, 24).forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); s.holes.push(p); }
  return new THREE.ShapeGeometry(s);
}
// the inner faces of an opening through a wall of thickness `depth` (+ optional voussoir ring on the face)
function reveal(o, depth, { ring = 1.1, stones = 15, seed = 0, sill = true, jambs = true } = {}) {
  const pts = archOutline(o.uc, o.v0, o.vs, o.w, o.k, 20);
  // side surfaces of the opening (a strip following the outline, through the wall thickness)
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    pos.push(a[0], a[1], 0.05, b[0], b[1], 0.05, b[0], b[1], -depth, a[0], a[1], 0.05, b[0], b[1], -depth, a[0], a[1], -depth);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.computeVertexNormals();
  const g = [sg];
  // voussoirs round the arch + jamb stones
  const vs = [];
  const inner = archOutline(o.uc, o.v0, o.vs, o.w, o.k, stones), outer = archOutline(o.uc, o.v0, o.vs, o.w, o.k, stones, ring);
  for (let i = 1; i < inner.length - 2; i++) {
    if (inner[i][1] < o.vs - 0.01 && inner[i + 1][1] < o.vs - 0.01) continue;
    const q = [inner[i], inner[i + 1], outer[i + 1], outer[i]];
    const id = seed * 57 + i, dz = 0.25 + rnd(id, 2) * 0.12;
    vs.push(tag(prism(q, -0.2, dz + (i === stones ? 0.18 : 0)), rnd(id, 3)));
  }
  // jambs: alternating long/short stones
  if (jambs) for (const side of [-1, 1]) {
    let v = o.v0, k = 0;
    while (v < o.vs - 0.05) {
      const h = Math.min(o.vs - v, 1.3 + rnd(k, seed + side) * 0.5), wide = k % 2 ? ring * 1.5 : ring;
      const x = o.uc + side * (o.w / 2 + wide / 2);
      const s = stone(wide - 0.08, h - 0.08, 1.1, seed * 13 + k + side * 5); s.translate(x, v + h / 2, 0.12);
      vs.push(tag(s, rnd(k, seed + 9)));
      v += h; k++;
    }
  }
  if (sill) { const s = bbox(o.w + ring * 1.2, 0.45, 1.6); s.translate(o.uc, o.v0 - 0.2, 0.2); vs.push(s); }
  return { reveal: g, stones: vs };
}

// ---------------------------------------------------------------- furniture
function pew(len) {
  const g = [];
  g.push(bbox(len, 0.24, 1.7).translate(0, 1.62, 0));                                 // seat
  const back = bbox(len, 1.75, 0.16); back.rotateX(-0.1); back.translate(0, 2.6, 0.82); g.push(back);
  g.push(bbox(len + 0.1, 0.22, 0.42).translate(0, 3.5, 0.92));                          // top rail
  for (let x = -len / 2 + 0.9; x < len / 2 - 0.5; x += 1.3) { const f = bbox(0.1, 1.5, 0.08); f.rotateX(-0.1); f.translate(x, 2.6, 0.73); g.push(f); }   // back fillets
  g.push(bbox(len, 0.3, 0.5).translate(0, 0.38, -1.25));                                // kneeler
  g.push(bbox(len, 0.16, 0.16).translate(0, 0.7, 0.2));                                 // stretcher
  g.push(bbox(len, 0.9, 0.08).translate(0, 1.95, -0.86));                              // book ledge front panel (for the pew in front)
  // carved pew ends
  const s = new THREE.Shape();
  s.moveTo(-1.05, 0); s.lineTo(1.15, 0); s.lineTo(1.15, 3.1);
  s.bezierCurveTo(1.15, 3.9, 0.3, 3.95, 0.05, 3.55); s.bezierCurveTo(-0.2, 3.2, -0.55, 2.9, -1.05, 2.75); s.closePath();
  for (const sd of [-1, 1]) {
    const e = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 });
    e.rotateY(-Math.PI / 2); e.translate(sd > 0 ? len / 2 + 0.26 : -len / 2, 0, 0); g.push(e);
    const x = sd * (len / 2 + 0.36);
    const ring = new THREE.TorusGeometry(0.42, 0.06, 8, 32); ring.rotateY(Math.PI / 2); ring.translate(x, 2.0, 0.1); g.push(ring);
    const quat = new THREE.TorusGeometry(0.2, 0.05, 8, 24); quat.rotateY(Math.PI / 2); quat.translate(x, 2.0, 0.1); g.push(quat);
    const fin = new THREE.SphereGeometry(0.2, 12, 10); fin.scale(1, 1.3, 1); fin.translate(sd * len / 2 + (sd > 0 ? 0.13 : -0.13), 3.72, 0.35); g.push(fin);
  }
  return g;
}
function altar(W, H, D) {
  const g = [], trim = [];
  g.push(bbox(W + 0.7, 0.5, D + 0.7).translate(0, 0.25, 0));
  g.push(bbox(W + 0.4, 0.22, D + 0.4, 0.08).translate(0, 0.6, 0));
  g.push(bbox(W, H - 1.25, D, 0.06).translate(0, 0.7 + (H - 1.25) / 2, 0));
  g.push(bbox(W + 0.25, 0.2, D + 0.25, 0.06).translate(0, H - 0.52, 0));
  g.push(bbox(W + 0.6, 0.38, D + 0.6, 0.1).translate(0, H - 0.19, 0));
  // blind arcade on the front and back faces, two bays on the sides
  const arcade = (n, span, zFace, rotY) => {
    const bw = span / n, v0 = 0.95, vs = H - 2.3;
    for (let i = 0; i < n; i++) {
      const uc = -span / 2 + bw * (i + 0.5);
      const pts = archOutline(uc, v0, vs, bw * 0.72, 1, 12).map(([x, y]) => new THREE.Vector3(x, y, zFace));
      const t = tube(pts, 0.055, 60, 6); t.rotateY(rotY); trim.push(t);
      const c = cyl(0.09, 0.09, vs - v0, 10); c.translate(uc - bw / 2, (v0 + vs) / 2, zFace); c.rotateY(rotY); trim.push(c);
      // quatrefoil in each arch head
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const r = new THREE.TorusGeometry(0.09, 0.025, 6, 16); r.translate(uc + Math.cos(a) * 0.1, vs + 0.25 + Math.sin(a) * 0.1, zFace); r.rotateY(rotY); trim.push(r); }
    }
    const c = cyl(0.09, 0.09, vs - v0, 10); c.translate(span / 2, (v0 + vs) / 2, zFace); c.rotateY(rotY); trim.push(c);
  };
  arcade(4, W - 0.5, D / 2 + 0.03, 0); arcade(4, W - 0.5, D / 2 + 0.03, Math.PI);
  arcade(2, D - 0.4, W / 2 + 0.03, Math.PI / 2); arcade(2, D - 0.4, W / 2 + 0.03, -Math.PI / 2);
  return { body: g, trim };
}
function candlestick(h) {
  return [lathe([[0, 0], [0.5, 0], [0.55, 0.08], [0.35, 0.2], [0.12, 0.35], [0.1, h * 0.4], [0.2, h * 0.45], [0.09, h * 0.5], [0.08, h - 0.3], [0.35, h - 0.25], [0.38, h - 0.2], [0.12, h - 0.12], [0.12, h], [0, h]], 24)];
}
function candles(h, r) { return lathe([[0, 0], [r, 0], [r, h], [r * 0.85, h + 0.05], [0.02, h + 0.02], [0, h + 0.15]], 16); }

function chandelier() {
  const iron = [], wax = [];
  const R1 = 3.4, R2 = 2.0, y1 = 0, y2 = 1.9;
  // central stem with knops, bottom finial and crown
  iron.push(lathe([[0, -1.8], [0.12, -1.6], [0.35, -1.2], [0.2, -0.9], [0.14, -0.4], [0.3, -0.1], [0.3, 0.15], [0.12, 0.4], [0.12, 1.5], [0.28, 1.75], [0.28, 2.0], [0.1, 2.3], [0.1, 3.4], [0.22, 3.6], [0.1, 3.8], [0, 3.9]], 24));
  for (const [R, y, n] of [[R1, y1, 10], [R2, y2, 6]]) {
    iron.push(new THREE.TorusGeometry(R, 0.07, 8, 96).rotateX(Math.PI / 2).translate(0, y, 0));
    iron.push(new THREE.TorusGeometry(R * 0.96, 0.035, 6, 96).rotateX(Math.PI / 2).translate(0, y - 0.18, 0));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (R === R2 ? 0.3 : 0), c = Math.cos(a), s = Math.sin(a);
      // S-scroll arm from the stem out to the ring and up to the cup
      const P = (r, yy) => new THREE.Vector3(c * r, yy, s * r);
      iron.push(tube([P(0.15, y - 0.5), P(R * 0.3, y - 0.75), P(R * 0.62, y - 0.55), P(R * 0.9, y - 0.2), P(R, y), P(R * 1.05, y + 0.35)], 0.05, 40, 6));
      // curl
      const curl = []; for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI * 1.6; curl.push(P(R * 0.55 + Math.cos(t) * 0.25 * (1 - k / 22), y - 0.6 + Math.sin(t) * 0.25 * (1 - k / 22))); }
      iron.push(tube(curl, 0.03, 30, 5));
      // drip pan + cup + unlit candle
      const cp = P(R * 1.05, y + 0.35);
      iron.push(lathe([[0, 0], [0.42, 0.02], [0.46, 0.1], [0.14, 0.08], [0.16, 0.35], [0.1, 0.36], [0, 0.3]], 20).translate(cp.x, cp.y, cp.z));
      wax.push(candles(0.9 + rnd(i, R) * 0.4, 0.1).translate(cp.x, cp.y + 0.3, cp.z));
      // leaf finials on the ring
      const lf = new THREE.ConeGeometry(0.1, 0.4, 6); lf.translate(0, 0.2, 0); const q = P(R, y); lf.translate(q.x, q.y + 0.05, q.z);
      if (R === R1) iron.push(lf);
      // hanging drop under the arm
      const dp = P(R * 0.62, y - 0.55); iron.push(lathe([[0, 0], [0.06, -0.05], [0.09, -0.25], [0, -0.45]], 10).translate(dp.x, dp.y, dp.z));
    }
  }
  // chains from the rings to the crown
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    iron.push(tube([new THREE.Vector3(Math.cos(a) * R1, y1, Math.sin(a) * R1), new THREE.Vector3(Math.cos(a) * 0.15, 3.8, Math.sin(a) * 0.15)], 0.03, 12, 4));
  }
  return { iron, wax };
}
function chain(len, y0) {
  const g = [];
  for (let i = 0; i * 0.5 < len; i++) { const t = new THREE.TorusGeometry(0.16, 0.045, 6, 14); t.scale(1, 1.6, 1); if (i % 2) t.rotateY(Math.PI / 2); t.translate(0, y0 + i * 0.5, 0); g.push(t); }
  return g;
}
function lantern() {
  const iron = [], glass = [];
  iron.push(bbox(0.25, 0.25, 2.2).translate(0, 0, 1.1));                    // bracket arm
  iron.push(tube([new THREE.Vector3(0, -1.2, 0.1), new THREE.Vector3(0, -0.6, 1.0), new THREE.Vector3(0, -0.05, 1.8)], 0.06, 20, 6));
  const c = new THREE.Vector3(0, -1.9, 2.2);
  iron.push(lathe([[0, 0.9], [0.3, 0.88], [0.9, 0.55], [0.75, 0.45], [0, 0.5]], 6).translate(c.x, c.y + 0.2, c.z));   // roof
  iron.push(new THREE.TorusGeometry(0.1, 0.04, 6, 12).translate(c.x, c.y + 1.2, c.z));
  iron.push(cyl(0.72, 0.5, 0.25, 6).translate(c.x, c.y - 0.95, c.z));
  iron.push(lathe([[0, 0], [0.2, 0], [0.05, -0.4], [0, -0.5]], 8).translate(c.x, c.y - 1.07, c.z));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; iron.push(cyl(0.035, 0.035, 1.2, 5).translate(c.x + Math.cos(a) * 0.62, c.y - 0.25, c.z + Math.sin(a) * 0.62)); }
  glass.push(cyl(0.6, 0.55, 1.2, 6).translate(c.x, c.y - 0.25, c.z));
  return { iron, glass };
}

// built-in bookcase in local wall coords (u along the wall, v up, +z into the nave), filled book by book
function bookcase(u0, u1, v0, H, seed) {
  const frame = [], books = [], D = 1.5, len = u1 - u0, uc = (u0 + u1) / 2;
  const T = (g) => tag(g, rnd(seed * 999 + frame.length + books.length * 7, 3));
  frame.push(T(bbox(len + 0.3, 1.1, D + 0.15, 0.06).translate(uc, v0 + 0.55, D / 2)));                    // plinth
  frame.push(T(bbox(len + 0.4, 0.14, D + 0.3, 0.04).translate(uc, v0 + 1.16, D / 2 + 0.05)));
  frame.push(T(bbox(len, H, 0.12, 0.02).translate(uc, v0 + H / 2, 0.06)));                                    // back boards
  // cornice: frieze, dentils, crown
  frame.push(T(bbox(len + 0.3, 0.7, D + 0.2, 0.04).translate(uc, v0 + H + 0.35, D / 2 + 0.05)));
  for (let u = u0 + 0.1; u < u1 - 0.1; u += 0.42) frame.push(T(bbox(0.2, 0.22, 0.2, 0.02).translate(u + 0.1, v0 + H - 0.02, D + 0.22)));
  frame.push(T(bbox(len + 0.7, 0.3, D + 0.6, 0.06).translate(uc, v0 + H + 0.85, D / 2 + 0.2)));
  frame.push(T(bbox(len + 0.9, 0.18, D + 0.8, 0.04).translate(uc, v0 + H + 1.08, D / 2 + 0.3)));
  const nb = Math.max(2, Math.round(len / 2.6)), bw = len / nb, shelfH = 1.72;
  const nShelves = Math.floor((H - 1.3) / shelfH);
  for (let i = 0; i <= nb; i++) {                                                                   // uprights with a fluted face
    const u = u0 + i * bw;
    frame.push(T(bbox(0.26, H - 1.2, D, 0.03).translate(u, v0 + 1.2 + (H - 1.2) / 2, D / 2)));
    frame.push(T(bbox(0.12, H - 1.6, 0.06, 0.01).translate(u, v0 + 1.2 + (H - 1.2) / 2, D + 0.02)));
  }
  for (let k = 0; k <= nShelves; k++) {
    const v = v0 + 1.25 + k * shelfH;
    frame.push(T(bbox(len, 0.13, D - 0.05, 0.02).translate(uc, v, D / 2)));
    frame.push(T(bbox(len, 0.1, 0.05, 0.01).translate(uc, v - 0.02, D - 0.02)));                    // shelf lip
    if (k === nShelves) break;
    for (let i = 0; i < nb; i++) {                                                                  // books in each compartment
      let u = u0 + i * bw + 0.16; const ue = u0 + (i + 1) * bw - 0.16; let n = 0;
      while (u < ue - 0.12) {
        const id = seed * 7777 + k * 311 + i * 57 + n;
        if (rnd(id, 1) < 0.05) { u += 0.3 + rnd(id, 2) * 0.4; n++; continue; }                     // a gap
        if (rnd(id, 3) < 0.05 && ue - u > 1) {                                                     // a lying stack
          let y = v + 0.07; for (let q = 0; q < 3 + Math.floor(rnd(id, 4) * 3); q++) { const h = 0.12 + rnd(id + q, 5) * 0.08, w = 0.8 + rnd(id + q, 6) * 0.25; books.push(tag(bbox(w, h, 0.9 + rnd(id + q, 7) * 0.2, 0.02).translate(u + 0.45, y + h / 2, D - 0.62), rnd(id + q, 8))); y += h; }
          u += 1.05; n++; continue;
        }
        const w = 0.14 + rnd(id, 9) ** 2 * 0.3, h = 0.95 + rnd(id, 10) * 0.55, d = 0.85 + rnd(id, 11) * 0.35;
        if (u + w > ue) break;
        const b = bbox(w, h, d, 0.018);
        // spine bands on some books
        const tilt = rnd(id, 12) < 0.04 ? 0.25 : 0;
        if (tilt) { b.translate(w / 2, h / 2, 0); b.rotateZ(-tilt); b.translate(u, v + 0.07, D - d / 2 - 0.08 - rnd(id, 13) * 0.1); }
        else b.translate(u + w / 2, v + 0.07 + h / 2, D - d / 2 - 0.08 - rnd(id, 13) * 0.12);
        books.push(tag(b, rnd(id, 14)));
        if (rnd(id, 15) < 0.35 && !tilt) for (const f of [0.18, 0.82]) books.push(tag(bbox(w + 0.02, 0.05, 0.03, 0.005).translate(u + w / 2, v + 0.07 + h * f, D - 0.07 - rnd(id, 13) * 0.12 + 0.005), rnd(id, 16 + f)));
        u += w + (tilt ? 0.45 : 0.004); n++;
      }
    }
  }
  return { frame, books };
}
function ladder(u, v0, H, lean, seed) {                                                            // rolling library ladder
  const g = [], L = H / Math.cos(lean);
  for (const s of [-0.55, 0.55]) { const r = bbox(0.14, L, 0.22, 0.03); r.translate(0, L / 2, 0); r.rotateX(-lean); r.translate(u + s, v0, 1.5 + Math.tan(lean) * H); g.push(tag(r, rnd(seed, s + 1))); }
  for (let k = 1; k * 1.1 < L - 0.3; k++) { const y = k * 1.1; const r = cyl(0.06, 0.06, 1.1, 8); r.rotateZ(Math.PI / 2); r.translate(0, y, 0); r.rotateX(-lean); r.translate(u, v0, 1.5 + Math.tan(lean) * H); g.push(tag(r, rnd(seed, k + 3))); }
  for (const s of [-0.55, 0.55]) { const w = new THREE.TorusGeometry(0.16, 0.05, 8, 16); w.rotateY(Math.PI / 2); w.translate(u + s, v0 + 0.16, 1.5 + Math.tan(lean) * H); g.push(tag(w, rnd(seed, s + 9))); }
  for (const s of [-0.55, 0.55]) { const h = new THREE.TorusGeometry(0.18, 0.05, 8, 16, Math.PI); h.rotateY(Math.PI / 2); h.translate(u + s, v0 + H + 0.1, 1.72); g.push(tag(h, rnd(seed, s + 12))); }
  return g;
}
// the keyhole opening (local units × s): round top + tapered slot, origin = plate centre
function keyholePath(s, P = THREE.Path) {
  const hole = new P(); const r = 0.13 * s, yc = 0.18 * s;
  hole.moveTo(-0.055 * s, yc - r * 0.85); hole.absarc(0, yc, r, -Math.PI / 2 - 0.42, Math.PI * 1.5 + 0.42, true); hole.lineTo(0.055 * s, yc - r * 0.85);
  hole.lineTo(0.085 * s, -0.3 * s); hole.lineTo(-0.085 * s, -0.3 * s); hole.closePath();
  return hole;
}
// keyhole escutcheon (like the reference): a pointed, lobed plate with two screws and a keyhole cut through
// keyhole grown about its round part's centre (holes in the door are a hair bigger than the dark lining)
const keyholeGrown = (s, f) => new THREE.Path(keyholePath(s).getPoints(64).map((p) => new THREE.Vector2(p.x * f, 0.18 * s + (p.y - 0.18 * s) * f)));
function escutcheon(s = 1, hf = 1) {
  const sh = new THREE.Shape(), P = [];
  const half = [[0, 1.0], [0.1, 0.86], [0.13, 0.74], [0.2, 0.7], [0.32, 0.62], [0.36, 0.56], [0.3, 0.52], [0.26, 0.4], [0.3, 0.2], [0.33, 0], [0.3, -0.2], [0.26, -0.4], [0.3, -0.52], [0.36, -0.56], [0.32, -0.62], [0.2, -0.7], [0.13, -0.74], [0.1, -0.86], [0, -1.0]];
  half.forEach(([x, y]) => P.push([x * s, y * s])); for (let i = half.length - 2; i > 0; i--) P.push([-half[i][0] * s, half[i][1] * s]);
  P.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath();
  sh.holes.push(hf === 1 ? keyholePath(s) : keyholeGrown(s, hf));
  const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.05 * s, bevelEnabled: false, curveSegments: 24 });   // no bevel: the bevel lip used to show inside the keyhole
  const screws = [0.62, -0.62].flatMap((y) => { const h = new THREE.SphereGeometry(0.055 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); h.rotateX(Math.PI / 2); h.translate(0, y * s, 0.075 * s); const slot = new THREE.BoxGeometry(0.1 * s, 0.012 * s, 0.03 * s); slot.rotateZ(y > 0 ? 1.4 : 0.4); slot.translate(0, y * s, 0.12 * s); return [h, slot]; });
  return [plate];   // (no screw heads — they read as stray marks)
}

// ---------------------------------------------------------------- the nave
export function buildChurch(inkMat, { tableTop, altarW = 6.4, altarH = 3.6, altarD = 3.4, portal = null }) {
  const root = new THREE.Group();
  const F = tableTop - altarH;              // floor
  const W = 40, Hs = 32, VK = 0.66;         // nave width, springing height, vault arch radius / span
  const zEnd = -26, zMax = 174, LEN = zMax - zEnd;
  const vaultTop = (x) => Hs + archY(x, W, VK);
  const walls = new THREE.Group(); root.add(walls); root.userData.walls = walls;

  // ---- materials (colours are for the non-negative look; in the negative look they become ink tones)
  // pattern lines drawn at a constant ~1.5 px on screen (fwidth), so they match the outline pass everywhere
  const pxLine = (d, period) => inkLine(d);
  const vaultPat = Fn(() => {                // stone joints on the vault (uv = arc length, z)
    const p = uv();
    const row = floor(p.x.div(1.5));
    const dx = fract(p.x.div(1.5).add(0.5)).sub(0.5).mul(1.5), dz = fract(p.y.add(row.mul(1.37)).div(3.1).add(0.5)).sub(0.5).mul(3.1);
    return float(1).sub(pxLine(dx).max(pxLine(dz)).mul(0.75));
  })();
  const glassPat = Fn(() => {                // leaded diamond panes
    const p = uv().mul(1.6);
    const a = fract(p.x.add(p.y).add(0.5)).sub(0.5), b = fract(p.x.sub(p.y).add(0.5)).sub(0.5);
    return float(1).sub(pxLine(a).max(pxLine(b)).mul(0.75));
  })();
  const M = {
    stone: inkMat({ color: '#3f6670', flat: 1, id: true }),
    stoneLight: inkMat({ color: '#4a7580', flat: 1, id: true }),
    reveal: inkMat({ color: '#2f4f57', flat: 1, side: THREE.DoubleSide }),
    mortar: inkMat({ color: '#0d1416', flat: 1 }),   // joints are drawn by the outline pass, same width as everything
    vault: inkMat({ color: '#35565f', pattern: vaultPat, flat: 1, side: THREE.DoubleSide }),
    rib: inkMat({ color: '#4d7580', flat: 1 }),
    floor: inkMat({ color: '#4a6a70', flat: 1, id: true }),
    wood: inkMat({ color: '#6b5a4a', flat: 1, rough: 0.7, id: true }),
    woodDark: inkMat({ color: '#4a3d32', flat: 1, rough: 0.7, id: true }),
    iron: inkMat({ color: '#1b1d1e', flat: 1, rough: 0.5 }),
    wax: inkMat({ color: '#d9d2c0', flat: 1 }),
    void: inkMat({ color: '#050708', flat: 1, side: THREE.DoubleSide }),
    glass: inkMat({ color: '#dfe9e8', pattern: glassPat, flat: 1, side: THREE.DoubleSide }),
    lampGlass: inkMat({ color: '#b8c6c2', flat: 1, side: THREE.DoubleSide }),
    gold: inkMat({ color: '#9a8350', flat: 1, id: true }),
    books: inkMat({ color: '#5a3a2a', flat: 1, id: true }),
  };
  setRoles(M, { stone: 'stone', stoneLight: 'stone', reveal: 'stone', mortar: 'wood', vault: 'stone', rib: 'stone', floor: 'ground', wood: 'wood', woodDark: 'wood', iron: 'deep', wax: 'stone', void: 'deep', lampGlass: 'stone', gold: 'ground', books: 'wood', board: 'stone', trim: 'stone', dark: 'deep', roof: 'wood', spire: 'wood', door: 'wood' });   // palette categories (COLOR-GUIDE)
  tagSfx(M, { stone: 'stone', stoneLight: 'stone', reveal: 'stone', mortar: 'stone', vault: 'stone', rib: 'stone', floor: 'stone', wood: 'wood', woodDark: 'wood', iron: 'metal', wax: 'wood', void: 'stone', glass: 'glass', lampGlass: 'glass', gold: 'metal', books: 'paper' });   // click sounds
  const G = {}; for (const k of Object.keys(M)) G[k] = [];
  const GW = {}; for (const k of Object.keys(M)) GW[k] = [];     // wall/vault group (hidden with "walls off")
  const put = (list, key, m) => { for (const g of list) { if (m) g.applyMatrix4(m); key.push(g); } };

  // ---- openings (local wall coords: u along the wall, v up from the floor)
  const bays = []; for (let z = -14; z <= zMax; z += 12) bays.push(z);   // pier lines
  const leftM = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-W / 2, F, zMax);
  const rightM = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(W / 2, F, zEnd);
  const endM = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)).setPosition(-W / 2, F, zEnd);
  const uL = (z) => zMax - z, uR = (z) => z - zEnd;
  const winL = [-8, 4, 28, 40, 64, 76, 100, 112, 136, 148].map((z) => ({ uc: uL(z), v0: 22.8, vs: 27.4, w: 3.2, k: 1 }));
  const doorL = [{ uc: uL(16), v0: 0, vs: 7.5, w: 5.2, k: 1 }];
  const archR = [-8, 28, 88, 136].map((z) => ({ uc: uR(z), v0: 0, vs: 11, w: 9, k: 1 }));
  const winR = [52, 64, 112, 160].map((z) => ({ uc: uR(z), v0: 22.8, vs: 27.4, w: 3.2, k: 1 }));
  const doorE = { uc: W / 2, v0: 1.8, vs: 9.5, w: 8, k: 1 };
  const slitE = { uc: W / 2, v0: 26, vs: 31, w: 1.8, k: 1 };

  // ---- side walls + end wall, stone by stone
  const holesL = [...winL, ...doorL], holesR = [...archR, ...winR], holesE = [doorE, slitE];
  // ---- built-in bookcases along both side walls (between the piers, skipping doors and archways)
  const BH = 19.2, spansL = [], spansR = [];
  const piersZ = [zEnd, ...bays];
  for (let i = 0; i < piersZ.length - 1; i++) {
    const za = piersZ[i] + (i === 0 ? 0.3 : 1.9), zb = piersZ[i + 1] - 1.9, v0 = zb < -17.8 ? 1.8 : 0;
    if (zb - za < 3) continue;
    if (!doorL.some((o) => Math.abs(zMax - o.uc - (za + zb) / 2) < 6)) spansL.push({ u0: uL(zb), u1: uL(za), v0, id: i });
    if (!archR.some((o) => Math.abs(o.uc + zEnd - (za + zb) / 2) < 6)) spansR.push({ u0: uR(za), u1: uR(zb), v0, id: i + 50 });
  }
  const inSpan = (spans) => (u, v) => v < BH + 1.4 && spans.some((b) => u > b.u0 - 0.2 && u < b.u1 + 0.2);
  for (const [spans, m] of [[spansL, leftM], [spansR, rightM]]) for (const b of spans) {
    const bc = bookcase(b.u0, b.u1, b.v0, BH - b.v0, b.id); put(bc.frame, GW.wood, m); put(bc.books, GW.books, m);
    if (b.id % 3 === 1) put(ladder(b.u0 + (b.u1 - b.u0) * (0.3 + rnd(b.id, 4) * 0.4), b.v0, BH - b.v0 - 0.4, 0.2, b.id), GW.woodDark, m);
  }
  // brass ladder rail along the cornice
  for (const [m, spans] of [[leftM, spansL], [rightM, spansR]]) for (const b of spans) { const r = cyl(0.07, 0.07, b.u1 - b.u0, 10); r.rotateZ(Math.PI / 2); r.translate((b.u0 + b.u1) / 2, BH + 0.1, 1.9); put([r], GW.gold, m); }
  put(masonry({ len: LEN, height: Hs, holes: holesL, seed: 1, skip: inSpan(spansL) }), GW.stone, leftM);
  put(masonry({ len: LEN, height: Hs, holes: holesR, seed: 2, skip: inSpan(spansR) }), GW.stone, rightM);
  const endTop = (u) => vaultTop(u - W / 2);
  put(masonry({ len: W, height: Hs + archRise(W, VK), holes: holesE, top: endTop, seed: 3 }), GW.stone, endM);
  put([backing(LEN, Hs, holesL)], GW.mortar, leftM);
  put([backing(LEN, Hs, holesR)], GW.mortar, rightM);
  put([backing(W, 0, holesE, endTop)], GW.mortar, endM);
  // reveals, voussoirs, glass, dark voids behind openings
  const opening = (o, m, { depth, glass = false, void_ = false, seed }) => {
    const r = reveal(o, depth, { ring: o.w > 6 ? 1.4 : 1.0, stones: o.w > 6 ? 19 : 13, seed, sill: o.v0 > 0.5 });
    put(r.reveal, GW.reveal, m); put(r.stones, GW.stoneLight, m);
    if (glass) { const s = new THREE.Shape(); archOutline(o.uc, o.v0, o.vs, o.w, o.k, 20).forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); const g = new THREE.ShapeGeometry(s, 20); g.translate(0, 0, -depth * 0.7); put([g], GW.glass, m);
      // mullion + tracery ring in the head
      const mul = bbox(0.22, o.vs - o.v0 + archRise(o.w, o.k) * 0.55, 0.3); mul.translate(o.uc, (o.v0 + o.vs + archRise(o.w, o.k) * 0.55) / 2, -depth * 0.65); put([mul], GW.stoneLight, m);
      const tr = new THREE.TorusGeometry(o.w * 0.2, 0.09, 8, 32); tr.translate(o.uc, o.vs + archRise(o.w, o.k) * 0.45, -depth * 0.65); put([tr], GW.stoneLight, m);
      for (const sd of [-1, 1]) { const pts = archOutline(o.uc + sd * o.w / 4, o.vs - 0.2, o.vs, o.w / 2 - 0.2, 1, 10).slice(1, -1).map(([x, y]) => new THREE.Vector3(x, y, -depth * 0.65)); put([tube(pts, 0.08, 30, 6)], GW.stoneLight, m); }
    }
    if (void_) { const b = new THREE.BoxGeometry(o.w + 6, o.vs + archRise(o.w, o.k) + 6, 14); b.translate(o.uc, (o.vs + archRise(o.w, o.k)) / 2, -depth - 7.2); put([b], GW.void, m); }
  };
  winL.forEach((o, i) => opening(o, leftM, { depth: 2.4, glass: true, seed: 10 + i }));
  winR.forEach((o, i) => opening(o, rightM, { depth: 2.4, glass: true, seed: 20 + i }));
  doorL.forEach((o, i) => opening(o, leftM, { depth: 2.6, void_: true, seed: 30 + i }));
  archR.forEach((o, i) => opening(o, rightM, { depth: 3.2, void_: true, seed: 40 + i }));
  opening(slitE, endM, { depth: 2.2, glass: true, seed: 50 });
  // end wall door: moulded archivolts, plank door with iron straps
  {
    const o = doorE, r = reveal(o, 1.8, { ring: 0.9, stones: 17, seed: 60, sill: false, jambs: false });
    put(r.reveal, GW.reveal, endM);
    for (let k = 0; k < 4; k++) {
      const pts = archOutline(o.uc, o.v0, o.vs, o.w, o.k, 32, 0.45 + k * 0.62).map(([x, y]) => new THREE.Vector3(x, y, 0.35 - k * 0.1));
      put([tube(pts, k % 2 ? 0.2 : 0.3, 160, 10)], GW.stoneLight, endM);
    }
    const hood = archOutline(o.uc, o.v0 + 6, o.vs, o.w, o.k, 32, 3.3).slice(1, -1).map(([x, y]) => new THREE.Vector3(x, y, 0.55));
    put([tube(hood, 0.3, 120, 8)], GW.stoneLight, endM);
    // door leaf: planks clipped to the arch
    const planks = [], straps = [];
    for (let x = o.uc - o.w / 2; x < o.uc + o.w / 2 - 0.05; x += 0.72) {
      const xc = x + 0.36, top = o.vs + archY(xc - o.uc, o.w, o.k) - 0.1;
      const p = bbox(0.66, top - o.v0, 0.25, 0.04); p.translate(xc, (top + o.v0) / 2, -1.6); planks.push(tag(p, rnd(x * 10, 1)));
    }
    for (const y of [3.2, 6.5, 9.4]) {
      const s = bbox(o.w - 0.4, 0.28, 0.1, 0.02); s.translate(o.uc, o.v0 + y, -1.42); straps.push(s);
      for (let x = o.uc - o.w / 2 + 0.6; x < o.uc + o.w / 2 - 0.4; x += 0.72) { const n = new THREE.SphereGeometry(0.07, 8, 6); n.translate(x, o.v0 + y, -1.36); straps.push(n); }
      // hinge curls
      const curl = []; for (let k = 0; k <= 12; k++) { const t = k / 12 * Math.PI; curl.push(new THREE.Vector3(o.uc - o.w / 2 + 2.6 + Math.cos(t) * 0.5, o.v0 + y + Math.sin(t) * 0.5, -1.4)); }
      straps.push(tube(curl, 0.05, 20, 5));
    }
    const ring = new THREE.TorusGeometry(0.35, 0.06, 8, 24); ring.translate(o.uc + 1.1, o.v0 + 5.7, -1.3); straps.push(ring);
    straps.push(cyl(0.18, 0.18, 0.15, 12).rotateX(Math.PI / 2).translate(o.uc + 1.1, o.v0 + 6.05, -1.35));
    put(planks, G.wood, endM); put(straps, G.iron, endM);
    // rim lock with a keyhole the camera can fly through: a lock case (with the hole bored through), the lobed
    // escutcheon on its face, a tunnel inside and, at its far end, a portal onto the next scene
    {
      const ks = 1.2, kx = o.uc + 1.1, ky = o.v0 + 3.4, zp = -1.475, case_ = 0.3;
      const cs = new THREE.Shape(); cs.moveTo(-0.62, -1.35); cs.lineTo(0.62, -1.35); cs.lineTo(0.62, 1.35); cs.lineTo(-0.62, 1.35); cs.closePath(); cs.holes.push(keyholePath(ks));
      const box = new THREE.ExtrudeGeometry(cs, { depth: case_, bevelEnabled: false, curveSegments: 24 });   // no bevel: it lined the keyhole with extra facets
      box.translate(kx, ky, zp); put([box], G.iron, endM);
      const e = escutcheon(ks, 1.03); e.forEach((g) => g.translate(kx, ky, zp + case_ + 0.02)); put(e, G.iron, endM);
      const zf = zp + case_ + 0.02 + 0.05 + 0.025, T = zf - zp - 0.004;
    }
    const back = new THREE.PlaneGeometry(o.w + 1, o.vs + 8); back.translate(o.uc, o.vs / 2 + 2, -1.8); put([back], G.void, endM);
  }

  // ---- piers: clustered shafts with bases and capitals, carrying the ribs
  for (const z of bays) for (const sd of [-1, 1]) {
    const x = sd * (W / 2 - 0.35);
    const g = [];
    for (const [dz, r, dx] of [[0, 1.05, 0], [-1.35, 0.45, -0.25], [1.35, 0.45, -0.25]]) {
      const c = cyl(r, r, Hs - 2.6, 20); c.translate(x - sd * dx, F + 1.3 + (Hs - 2.6) / 2, z + dz); g.push(c);
      const base = lathe([[0, 0], [r + 0.55, 0], [r + 0.55, 0.45], [r + 0.3, 0.6], [r + 0.35, 0.8], [r + 0.12, 0.95], [r, 1.3], [0, 1.3]], 20); base.translate(x - sd * dx, F, z + dz); g.push(base);
      const cap = lathe([[0, 0], [r, 0], [r + 0.08, 0.15], [r + 0.1, 0.25], [r + 0.2, 0.7], [r + 0.5, 1.0], [r + 0.55, 1.1], [r + 0.62, 1.2], [r + 0.62, 1.45], [0, 1.45]], 20); cap.translate(x - sd * dx, F + Hs - 1.3, z + dz); g.push(cap);
      // crocket leaves on the capital
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const l = new THREE.SphereGeometry(0.22, 8, 6); l.scale(1, 1.4, 0.6); l.translate(x - sd * dx + Math.cos(a) * (r + 0.35), F + Hs - 0.5, z + dz + Math.sin(a) * (r + 0.35)); g.push(l); }
    }
    GW.stoneLight.push(...g);
  }
  // string courses (moulded bands) along the side walls
  for (const sd of [-1, 1]) for (const [y, h] of [[21.6, 0.5], [Hs, 0.8]]) {
    const b = bbox(0.9, h, LEN, 0.15); b.translate(sd * (W / 2 - 0.35), F + y, (zEnd + zMax) / 2); GW.stoneLight.push(b);
    const r = cyl(0.22, 0.22, LEN, 10); r.rotateX(Math.PI / 2); r.translate(sd * (W / 2 - 0.85), F + y - h / 2 - 0.1, (zEnd + zMax) / 2); GW.stoneLight.push(r);
  }

  // ---- the vault: pointed barrel with coursed stone, transverse + diagonal + ridge ribs, bosses
  {
    const nx = 72, nz = 140, pos = [], uvs = [], idx = [];
    let s = 0; const arc = [0];
    for (let i = 1; i <= nx; i++) { const x0 = -W / 2 + (W * (i - 1)) / nx, x1 = -W / 2 + (W * i) / nx; s += Math.hypot(x1 - x0, vaultTop(x1) - vaultTop(x0)); arc.push(s); }
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + (W * i) / nx, z = zEnd + (LEN * j) / nz;
      pos.push(x * 0.985, F + vaultTop(x) + 0.3, z); uvs.push(arc[i], z);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    GW.vault.push(g);
    const pt = (x, z, dy = 0) => new THREE.Vector3(x * 0.97, F + vaultTop(x) + dy, z);
    const ribs = [];
    const line = (f, n = 48) => { const p = []; for (let i = 0; i <= n; i++) p.push(f(i / n)); return p; };
    const piers = [zEnd, ...bays];
    for (const z of piers) ribs.push(tube(line((t) => pt(-W / 2 + W * t, z + (z === zEnd ? 0.6 : 0), -0.25)), 0.55, 120, 8));
    for (let i = 0; i < piers.length - 1; i++) {
      const z0 = piers[i] + (i === 0 ? 0.6 : 0), z1 = piers[i + 1];
      ribs.push(tube(line((t) => pt(-W / 2 + W * t, z0 + (z1 - z0) * t, -0.2)), 0.42, 120, 8));
      ribs.push(tube(line((t) => pt(W / 2 - W * t, z0 + (z1 - z0) * t, -0.2)), 0.42, 120, 8));
      // boss: carved rosette where the diagonals cross
      const c = pt(0, (z0 + z1) / 2, -0.6);
      const boss = new THREE.SphereGeometry(0.9, 20, 14); boss.scale(1, 0.6, 1); boss.translate(c.x, c.y, c.z); ribs.push(boss);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const p = new THREE.SphereGeometry(0.4, 8, 6); p.scale(1.4, 0.35, 0.7); p.rotateY(-a); p.translate(c.x + Math.cos(a) * 0.95, c.y - 0.15, c.z + Math.sin(a) * 0.95); ribs.push(p); }
    }
    ribs.push(tube(line((t) => pt(0, zEnd + LEN * t, -0.3)), 0.35, 200, 8));   // ridge
    GW.rib.push(...ribs);
  }

  // ---- floor: irregular flagstones on a mortar bed; a raised dais with steps before the door
  const daisZ = -17.8, daisH = 1.8;
  G.mortar.push(new THREE.PlaneGeometry(W + 2, LEN + 40).rotateX(-Math.PI / 2).translate(0, F - 0.02, (zEnd + zMax) / 2 + 10));
  {
    // a laid floor: a central aisle of square slabs set on the diagonal inside long border stones,
    // and running-bond courses of rectangular flags under the pews
    const top = 0.2, gap = 0.035;
    const slab = (x0, x1, z0, z1, id) => { const g = bbox(x1 - x0 - gap, 0.35, z1 - z0 - gap, 0.03); g.translate((x0 + x1) / 2, F + top - 0.175, (z0 + z1) / 2); G.floor.push(tag(g, rnd(id, 4))); };
    const z0 = daisZ + 0.05, z1 = zMax, AW = 5.4, BW = 0.9;
    // border stones either side of the aisle
    for (const sd of [-1, 1]) { let k = 0; for (let z = z0; z < z1; z += 3.6) slab(sd > 0 ? AW : -AW - BW, sd > 0 ? AW + BW : -AW, z, Math.min(z1, z + 3.6), 5000 + sd * 700 + k++); }
    // aisle: diamonds (squares rotated 45°) with half-diamond fillers
    { const d = 2 * AW / 3, h = d / 2; let k = 0;
      for (let z = z0; z < z1; z += d) for (const [cx, cz] of [0, 1, 2].map((i) => [-AW + d * (i + 0.5), z + d / 2]).concat([0, 1, 2, 3].map((i) => [-AW + d * i, z]))) {
        const q = [[cx, cz - h], [cx + h, cz], [cx, cz + h], [cx - h, cz]].map(([x, zz]) => [THREE.MathUtils.clamp(x, -AW, AW), THREE.MathUtils.clamp(zz, z0, z1)]);
        if (Math.abs(q[1][0] - q[3][0]) < 0.2 || Math.abs(q[2][1] - q[0][1]) < 0.2) continue;
        const c = q.reduce((p, r) => [p[0] + r[0] / 4, p[1] + r[1] / 4], [0, 0]);
        const ins = q.map(([x, zz]) => [x + (c[0] - x) * 0.02, zz + (c[1] - zz) * 0.02]);
        const g = prism(ins.map(([x, zz]) => [x, -zz]), -0.3, top); g.rotateX(-Math.PI / 2); g.translate(0, F, 0); G.floor.push(tag(g, rnd(k++, 21)));
      } }
    // running bond under the pews
    for (const sd of [-1, 1]) { let row = 0; for (let z = z0; z < z1; z += 3.0, row++) { let x = AW + BW + (row % 2 ? 1.6 : 0), k = 0; if (row % 2) slab(sd * (AW + BW), sd * x, z, z + 3.0, row * 50 + sd * 9); while (x < W / 2) { const L = 3.0 + rnd(row * 31 + k, sd + 3) * 1.4, xe = Math.min(W / 2, x + L); slab(sd > 0 ? x : -xe, sd > 0 ? xe : -x, z, Math.min(z1, z + 3.0), row * 50 + k + sd * 9000); x = xe; k++; } } }
    // dais: big slabs + a row of edge stones; steps in front of it
    for (let x = -W / 2; x < W / 2 - 0.1; x += 4) for (let z = zEnd; z < daisZ - 0.1; z += 4) {
      const g = stone(3.92, 3.92, 0.4, Math.floor(x * 3 + z * 7)); g.rotateX(-Math.PI / 2); g.translate(x + 2, F + daisH - 0.18, Math.min(z + 2, daisZ - 1.96)); G.floor.push(tag(g, rnd(x + z, 3)));
    }
    let k = 0; for (let x = -W / 2; x < W / 2 - 0.2; x += 2.6) { const g = stone(2.5, daisH - 0.4, 1.4, 900 + k); g.translate(x + 1.3, F + (daisH - 0.4) / 2, daisZ - 0.62); G.stone.push(tag(g, rnd(k++, 7))); }
    for (let s = 0; s < 2; s++) {
      const w = 26 - s * 3, z = daisZ + 2.5 * (2 - s) - 1.25, top = (daisH / 3) * (s + 1);
      for (let x = -w / 2, i = 0; x < w / 2 - 0.2; x += 3.2, i++) { const g = stone(3.1, top, 2.4, 700 + s * 40 + i); g.rotateX(0); g.translate(x + 1.6, F + top / 2, z); G.stone.push(tag(g, rnd(i, s + 20))); }
    }
  }

  // ---- the stone altar (the crystal ball stands on it)
  {
    const a = altar(altarW, altarH, altarD);
    for (const g of a.body) { g.translate(0, F, 0); G.stoneLight.push(g); }
    for (const g of a.trim) { g.translate(0, F, 0); G.rib.push(g); }
    for (const sd of [-1, 1]) { for (const g of candlestick(2.2)) { g.translate(sd * (altarW / 2 - 0.5), tableTop, -altarD / 2 + 0.55); G.iron.push(g); }
      G.wax.push(candles(1.4, 0.13).translate(sd * (altarW / 2 - 0.5), tableTop + 2.2, -altarD / 2 + 0.55)); }
  }

  // ---- pews on both sides of the aisle
  for (let z = 7; z < zMax - 6; z += 4.5) for (const sd of [-1, 1]) {
    const len = 11.6, cx = sd * (6.6 + len / 2);
    for (const g of pew(len)) { g.translate(cx, F + 0.2, z); G.wood.push(g); }
  }
  // side table by the steps (like the reference), with a closed book
  { const t = [bbox(3.4, 0.3, 2.2).translate(-12, F + 3.6, -10), ...[-1, 1].flatMap((a) => [-1, 1].map((b) => bbox(0.3, 3.4, 0.3).translate(-12 + a * 1.45, F + 1.7, -10 + b * 0.85)))];
    G.woodDark.push(...t); G.woodDark.push(bbox(1.3, 0.35, 1.0, 0.05).rotateY(0.3).translate(-12, F + 3.93, -10)); }

  // ---- wall lantern (unlit) and an icon on the right wall
  { const l = lantern(); const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(-W / 2 + 1.5, F + 14, -2); put(l.iron, G.iron, m); put(l.glass, G.lampGlass, m); }
  { const f = [bbox(2.6, 3.4, 0.3).translate(0, 0, 0)]; const inner = bbox(2.0, 2.8, 0.1).translate(0, 0, 0.14);
    const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(W / 2 - 0.9, F + 25, 16); put(f, G.gold, m); put([inner], G.woodDark, m); }

  // ---- chandelier (iron, candles unlit) hanging over the aisle in front of the altar
  const chand = new THREE.Group();
  {
    const c = chandelier(), yB = 12.5;
    const topY = vaultTop(0) - 0.6;
    const chainM = new THREE.Mesh(merge(chain(topY - (yB + 3.9), 3.9)), M.iron); chainM.userData.noWire = true;   // the chain isn't part of the storage module
    chand.add(new THREE.Mesh(merge(c.iron), M.iron), new THREE.Mesh(merge(c.wax), M.wax), chainM);
    chand.position.set(0, F + yB, 8);
    // hang pivot at the vault
    const pivot = new THREE.Group(); pivot.position.set(0, F + topY, 8); chand.position.set(0, yB - topY, 0);
    pivot.add(chand); root.add(pivot); root.userData.chandelier = pivot;
  }

  const addAll = (Gs, parent) => { for (const k of Object.keys(Gs)) if (Gs[k].length) {
    if (M[k].userData.id) for (const g of Gs[k]) if (!g.userData.tagged) tag(g, Math.random()); const m = new THREE.Mesh(merge(Gs[k]), M[k]); m.receiveShadow = true; parent.add(m); if (k === 'lampGlass') m.renderOrder = 2; } };
  addAll(G, root); addAll(GW, walls);
  exterior(root, inkMat, { W, F, zEnd, zMax });
  // ---- red ink: fingerprints, splatters and drag smears (floor, pews, altar, bookcases, walls, door)
  {
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z), UP = V3(0, 1, 0);
    const P = [], Sp = [], Sm = [];
    const r = (i, k) => rnd(i * 7.13 + k * 1.91, k + 3);
    const FY = F + 0.215;
    for (let i = 0; i < 420; i++) P.push({ p: V3((r(i, 1) - 0.5) * (W - 4), FY, daisZ + 1 + r(i, 2) * (zMax - daisZ - 3)), n: UP, s: 0.9 + r(i, 3) * 0.5 });
    for (let i = 0; i < 160; i++) Sp.push({ p: V3((r(i, 4) - 0.5) * (W - 4), FY + 0.003, daisZ + 1 + r(i, 5) * (zMax - daisZ - 3)), n: UP, s: 3 + r(i, 6) * 5 });
    for (let i = 0; i < 70; i++) { const L = 6 + r(i, 7) * 12, x = (r(i, 8) - 0.5) * 11, z = r(i, 9) * (zMax - 10); const a = (r(i, 10) - 0.5) * 0.5;
      Sm.push({ p: V3(x, FY + 0.006, z), n: UP, dir: V3(Math.sin(a), 0, -Math.cos(a)), s: [L, 1.3 + r(i, 11) * 1.4] }); }   // dragged towards the altar
    // pews: seats and back rails
    for (let z = 7, k = 0; z < zMax - 6; z += 4.5, k++) for (const sd of [-1, 1]) {
      const cx = sd * (6.6 + 5.8);
      if (r(k, sd + 20) < 0.6) P.push({ p: V3(cx + (r(k, sd + 21) - 0.5) * 10, F + 1.94, z + (r(k, sd + 22) - 0.5) * 1.2), n: UP, s: 0.8 + r(k, 23) * 0.4 });
      if (r(k, sd + 24) < 0.35) P.push({ p: V3(cx + (r(k, sd + 25) - 0.5) * 10, F + 3.82, z + 0.92), n: UP, s: 0.35 });
      if (r(k, sd + 26) < 0.25) Sp.push({ p: V3(cx + (r(k, sd + 27) - 0.5) * 9, F + 1.95, z), n: UP, s: 2.5 + r(k, 28) * 2 });
    }
    // altar top (around the stand) and front
    for (let i = 0; i < 26; i++) { const a = r(i, 30) * 6.283, d = 1.9 + r(i, 31) * (altarW / 2 - 2); P.push({ p: V3(Math.cos(a) * Math.min(d, altarW / 2 - 0.4), tableTop + 0.01, Math.sin(a) * Math.min(d, altarD / 2 - 0.3)), n: UP, s: 0.5 + r(i, 32) * 0.3 }); }
    for (let i = 0; i < 14; i++) P.push({ p: V3((r(i, 33) - 0.5) * (altarW - 1), F + 1.2 + r(i, 34) * (altarH - 2.2), altarD / 2 + 0.01), n: V3(0, 0, 1), s: 0.55 });
    Sp.push({ p: V3(0.8, F + altarH * 0.55, altarD / 2 + 0.02), n: V3(0, 0, 1), s: 4.5 });
    // bookcases: plinth fronts, book spines, shelf fronts; stone wall above
    const wallSpot = (m, u, v, zz, s, list) => { const pp = V3(u, v, zz).applyMatrix4(m); const nn = V3(0, 0, 1).transformDirection(m); list.push({ p: pp, n: nn, s }); };
    for (const [spans, m] of [[spansL, leftM], [spansR, rightM]]) for (const b of spans) {
      const len = b.u1 - b.u0;
      for (let i = 0; i < Math.round(len / 3); i++) wallSpot(m, b.u0 + r(i + b.id * 40, 40) * len, b.v0 + 0.2 + r(i + b.id * 40, 41) * 0.8, 1.5 + 0.085, 0.6 + r(i, 42) * 0.25, P);
      for (let i = 0; i < Math.round(len / 2.2); i++) wallSpot(m, b.u0 + r(i + b.id * 50, 43) * len, b.v0 + 1.5 + r(i + b.id * 50, 44) * (BH - b.v0 - 2.5), 1.5 - 0.07, 0.55 + r(i, 45) * 0.3, P);
      for (let i = 0; i < Math.round(len / 9); i++) wallSpot(m, b.u0 + r(i + b.id * 60, 46) * len, b.v0 + 2 + r(i + b.id * 60, 47) * (BH - b.v0 - 4), 1.5 - 0.06, 3 + r(i, 48) * 4, Sp);
      if (r(b.id, 49) < 0.5) wallSpot(m, b.u0 + r(b.id, 50) * len, BH + 3 + r(b.id, 51) * 6, 1.03, 5 + r(b.id, 52) * 4, Sp);
    }
    // the end door (plank face) and the dais steps
    for (let i = 0; i < 18; i++) P.push({ p: V3((r(i, 60) - 0.5) * 7, F + 2.2 + r(i, 61) * 7, zEnd - 1.455), n: V3(0, 0, 1), s: 0.6 + r(i, 62) * 0.3 });
    Sp.push({ p: V3(-1.5, F + 5, zEnd - 1.45), n: V3(0, 0, 1), s: 6 });
  }
  root.userData.floorY = F;
  root.userData.endWall = { M: endM, W, F };   // graffiti anchor (main.js places it on this wall)
  return root;
}

// ---------------------------------------------------------------- the outside: a white clapboard church front
// (after the reference): gable with rake boards, a bell tower with arched double door, rose window, belfry with
// a bell, octagonal spire and cross; lancet windows, steps with rails and a ramp, wall lamps; clapboard side
// walls and a shingled roof; a churchyard with a flagstone path, headstones and a picket fence; pines around.
// The keyhole in the right door leaf goes through every layer — the camera backs out through it.
const lineP = (axis, period, k = 0.75) => Fn(() => {
  const q = axis === 'y' ? positionWorld.y : axis === 'x' ? positionWorld.x : positionWorld.z;
  const d = fract(q.div(period).add(0.5)).sub(0.5);
  const far = float(1).sub(smoothstep(0.12, 0.35, fwidth(q.div(period))));   // boards fade out before they turn grey
  return float(1).sub(inkLine(d).mul(k).mul(far));
})();
function pine(h, seed) {
  const g = [cyl(0.5, 0.9, h * 0.3, 10).translate(0, h * 0.15, 0)];
  const tiers = 7 + Math.floor(rnd(seed, 1) * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, y = h * (0.18 + t * 0.72), r = Math.min(16, h * 0.18 * (1 - t * 0.85) + 1), th = h * 0.22 * (1 - t * 0.4);
    const c = new THREE.ConeGeometry(r, th, 16, 1), p = c.attributes.position;
    for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) { const f = 0.8 + rnd(seed * 97 + i * 13 + k, 2) * 0.4; p.setX(k, p.getX(k) * f); p.setZ(k, p.getZ(k) * f); p.setY(k, p.getY(k) - rnd(seed + k, i) * th * 0.12); }
    c.deleteAttribute('normal'); c.computeVertexNormals(); c.rotateY(rnd(seed, i) * 3); c.translate(0, y + th / 2, 0); g.push(c);
  }
  return g;
}
function headstone(seed) {
  const kind = Math.floor(rnd(seed, 1) * 4), out = [];
  const w = 1.6 + rnd(seed, 2) * 0.9, h = 2.4 + rnd(seed, 3) * 1.6;
  if (kind === 0 || kind === 1) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2);
    if (kind === 0) s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); else { s.lineTo(w * 0.15, h - w * 0.25); s.lineTo(0, h); s.lineTo(-w * 0.15, h - w * 0.25); s.lineTo(-w / 2, h - w / 2); }
    s.closePath();
    out.push(new THREE.ExtrudeGeometry(s, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -0.2));
    out.push(bbox(w + 0.5, 0.35, 0.9, 0.05).translate(0, 0.17, 0));
  } else if (kind === 2) {
    out.push(bbox(0.35, h + 0.6, 0.35, 0.05).translate(0, (h + 0.6) / 2, 0), bbox(1.6, 0.35, 0.35, 0.05).translate(0, h * 0.72, 0), bbox(1.2, 0.4, 1.0, 0.05).translate(0, 0.2, 0));
  } else {
    out.push(bbox(0.9, h * 1.3, 0.9, 0.06).translate(0, h * 0.65 + 0.5, 0), new THREE.ConeGeometry(0.64, 0.8, 4).rotateY(Math.PI / 4).translate(0, h * 1.3 + 0.9, 0), bbox(1.5, 0.5, 1.5, 0.06).translate(0, 0.25, 0));
  }
  const tilt = (rnd(seed, 5) - 0.5) * 0.2, yaw = (rnd(seed, 6) - 0.5) * 0.3;
  out.forEach((g) => { g.rotateZ(tilt); g.rotateY(yaw); });
  return out;
}
function exterior(root, inkMat, C) {
  const { W, F, zEnd, zMax, bbox: _b } = C;
  const G0 = F - 3, HW = W / 2 + 2, yE = F + 40, yR = F + 72, TW = 1.0, zF = zMax + TW;
  const TWd = 14, TD = 2.2, zT = zF + TD, yT = F + 84;
  const ks = 0.75, kx = 1.25, ky = F + 3.6;
  const M = {
    board: inkMat({ color: '#e8e4da', flat: 1, pattern: lineP('y', 0.85), id: true }),
    trim: inkMat({ color: '#f4f1ea', flat: 1, id: true }),
    dark: inkMat({ color: '#141312', flat: 0.08, id: true, side: THREE.DoubleSide }),
    roof: inkMat({ color: '#4a4a4c', flat: 1, pattern: lineP('y', 1.1), id: true }),
    spire: inkMat({ color: '#4a4a4c', flat: 1, pattern: lineP('y', 0.9), id: true }),
    door: inkMat({ color: '#6a4a34', flat: 1, pattern: lineP('x', 0.72), id: true }),
    iron: inkMat({ color: '#1b1d1e', flat: 1, id: true }),
    stone: inkMat({ color: '#9a9690', flat: 1, id: true }),
    pine: inkMat({ color: '#1f2a22', flat: 1, id: true }),
    grave: inkMat({ color: '#8a8a88', flat: 1, id: true }),
    wood: inkMat({ color: '#d8d0c0', flat: 1, id: true }),
    tunnel: inkMat({ color: '#141312', flat: 0.3, side: THREE.DoubleSide }),
  };
  setRoles(M, { stone: 'stone', pine: 'leaf', grave: 'stone', wood: 'stone', roof: 'wood', spire: 'wood', door: 'wood', iron: 'deep', dark: 'deep', tunnel: 'deep', board: 'stone', trim: 'stone' });   // palette categories (COLOR-GUIDE)
  tagSfx(M, { board: 'wood', trim: 'wood', dark: 'glass', roof: 'wood', spire: 'wood', door: 'door', iron: 'metal', stone: 'stone', pine: 'leaves', grave: 'stone', wood: 'wood', tunnel: 'stone' });   // click sounds
  const G = {}; for (const k of Object.keys(M)) G[k] = [];
  const dW = 8, dS = F + 10, dR = 4;
  const doorway = () => { const p = new THREE.Path(); p.moveTo(-dW / 2, F); p.lineTo(dW / 2, F); p.lineTo(dW / 2, dS); p.absarc(0, dS, dR, 0, Math.PI, false); p.lineTo(-dW / 2, F); return p; };
  const hole = () => new THREE.Path(keyholeGrown(ks, 1.08).getPoints(64).map((p) => new THREE.Vector2(p.x + kx, p.y + ky)));
  const slab = (pts, z0, depth, holes = []) => { const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); holes.forEach((h) => s.holes.push(h)); return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, z0); };
  // front wall (gable) + back wall + side walls + roof
  G.board.push(slab([[-HW, G0], [HW, G0], [HW, yE], [0, yR], [-HW, yE]], zMax, TW, [doorway()]));
  G.board.push(slab([[-HW, G0], [HW, G0], [HW, yE], [0, yR], [-HW, yE]], zEnd - 2, TW));
  for (const s of [-1, 1]) G.board.push(bbox(TW, yE - G0, zF - (zEnd - 2), 0.05).translate(s * (HW - TW / 2), (yE + G0) / 2, (zF + zEnd - 2) / 2));
  { const a = Math.atan2(yR - yE, HW), L = Math.hypot(HW + 2.5, (yR - yE) * (HW + 2.5) / HW);
    for (const s of [-1, 1]) { const r = bbox(L, 0.9, zF - zEnd + 6, 0.08); r.rotateZ(-s * a); r.translate(s * (HW + 2.5) / 2 - s * 0.6, yE + (yR - yE) * 0.5 - (yR - yE) * 2.5 / HW / 2 + 1.2, (zF + zEnd) / 2); G.roof.push(r);
      const rb = bbox(L, 1.1, 0.5, 0.06); rb.rotateZ(-s * a); rb.translate(s * (HW + 2.5) / 2 - s * 0.6, yE + (yR - yE) * 0.5 - (yR - yE) * 2.5 / HW / 2 + 0.6, zF + 0.4); G.trim.push(rb);   // rake board
      G.trim.push(bbox(1.3, yE - G0, 1.4, 0.06).translate(s * (HW - 0.2), (yE + G0) / 2, zF), bbox(3.2, 0.9, 1.6, 0.06).translate(s * (HW - 1), yE - 0.2, zF + 0.1));   // corner board, eave return
    } }
  G.stone.push(bbox(2 * HW + 0.8, 3.2, 1.8, 0.1).translate(0, G0 + 1.4, zF - 0.2));   // foundation
  // tower (front slab with the keyhole + shaft above the roof), cornices, belfry, spire, cross
  G.board.push(slab([[-TWd / 2, G0], [TWd / 2, G0], [TWd / 2, yT], [-TWd / 2, yT]], zF, TD, [doorway()]));
  G.stone.push(bbox(dW, 0.4, zT - zMax + 0.2, 0.02).translate(0, F, (zT + zMax) / 2));   // vestibule floor
  G.board.push(bbox(TWd, yT - (F + 50), 16, 0.05).translate(0, (yT + F + 50) / 2, zT - 8));
  for (const s of [-1, 1]) G.trim.push(bbox(1.1, yT - G0, 1.2, 0.05).translate(s * (TWd / 2 - 0.1), (yT + G0) / 2, zT));
  G.trim.push(bbox(TWd + 1.6, 1.2, 17.6, 0.1).translate(0, yT + 0.4, zT - 8), bbox(TWd + 2.4, 0.5, 18.4, 0.08).translate(0, yT + 1.2, zT - 8));
  const yB = yT + 1.4, bh = 11;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.trim.push(bbox(1.8, bh, 1.8, 0.08).translate(sx * (TWd / 2 - 0.9), yB + bh / 2, zT - 8 + sz * 7.1));
  for (const [ry, off] of [[0, 7.1], [Math.PI, 7.1], [Math.PI / 2, 7.1], [-Math.PI / 2, 7.1]]) {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(0, 0, zT - 8);
    const pts = archOutline(0, yB, yB + bh - 5.2, 10.2, 0.5, 16).slice(1, -1).map(([x, y]) => new THREE.Vector3(x, y, off));
    const arch = tube(pts, 0.35, 48, 8).applyMatrix4(m); G.trim.push(arch);
    G.trim.push(bbox(TWd, 1.3, 0.8, 0.06).translate(0, yB + bh - 0.6, off).applyMatrix4(m), bbox(TWd - 3.6, 0.6, 0.6, 0.05).translate(0, yB + 2.2, off).applyMatrix4(m));
    for (let k = 0; k < 6; k++) G.trim.push(bbox(0.2, 2.0, 0.2, 0.03).translate(-4 + k * 1.6, yB + 1.2, off).applyMatrix4(m));   // balusters
  }
  G.trim.push(bbox(TWd, 0.5, 16, 0.05).translate(0, yB + 0.2, zT - 8));
  G.dark.push(lathe([[0, 4.2], [0.6, 4.2], [0.9, 3.9], [1.2, 3.2], [1.5, 2.0], [2.1, 0.7], [2.3, 0.3], [2.2, 0.2], [0, 0.4]], 32).translate(0, yB + 3.2, zT - 8));
  G.iron.push(bbox(5.4, 0.5, 0.5, 0.05).translate(0, yB + 7.8, zT - 8), cyl(0.2, 0.2, 0.9, 8).translate(0, yB + 7.2, zT - 8));
  const yS = yB + bh;
  G.trim.push(bbox(TWd + 2.8, 0.9, 18.8, 0.1).translate(0, yS + 0.3, zT - 8), bbox(TWd + 1.2, 0.8, 17.2, 0.08).translate(0, yS + 1.1, zT - 8));
  G.spire.push(new THREE.ConeGeometry(8.6, 34, 8, 6).rotateY(Math.PI / 8).translate(0, yS + 1.5 + 17, zT - 8));
  G.trim.push(lathe([[0, 0], [0.7, 0], [0.5, 0.8], [0.3, 1.2], [0, 1.4]], 16).translate(0, yS + 35, zT - 8));
  G.iron.push(bbox(0.45, 7, 0.45, 0.05).translate(0, yS + 39.5, zT - 8), bbox(3.4, 0.45, 0.45, 0.05).translate(0, yS + 40.6, zT - 8));
  // arched double door with plank leaves; the right leaf carries the keyhole
  const zD = zT;
  const leaf = (s) => { const pts = []; pts.push([s * 0.001, F], [s * dW / 2, F]); for (let i = 0; i <= 24; i++) { const a = s > 0 ? (i / 24) * Math.PI / 2 : Math.PI - (i / 24) * Math.PI / 2; pts.push([Math.cos(a) * dR, dS + Math.sin(a) * dR]); } pts.push([s * 0.001, dS + dR]); return s < 0 ? pts.reverse() : pts; };
  const DM = [];   // the door as the storage shows it: leaves, arch, keystone, straps, knocker, escutcheon (not drawn in the scene)
  { const lv = [slab(leaf(-1), zD, 0.4), slab(leaf(1), zD, 0.4, [hole()])]; G.door.push(...lv); DM.push(...lv); }
  root.userData.door = { y0: F, top: dS + dR, z: zD + 0.4, W: dW };   // words graffiti anchor
  G.dark.push(slab([[-dW / 2 - 0.1, F - 0.1], [dW / 2 + 0.1, F - 0.1], [dW / 2 + 0.1, dS], ...[...Array(25).keys()].map((i) => [Math.cos((i / 24) * Math.PI) * (dR + 0.1), dS + Math.sin((i / 24) * Math.PI) * (dR + 0.1)]), [-dW / 2 - 0.1, dS]], zD - 0.05, 0.1, [hole()]));
  { const d = [tube(archOutline(0, F, dS, dW + 0.8, 0.5, 32).map(([x, y]) => new THREE.Vector3(x, y, zD + 0.35)), 0.4, 96, 8), bbox(0.9, 1.3, 0.9, 0.08).translate(0, dS + dR + 0.8, zD + 0.35)]; G.trim.push(...d); DM.push(...d); }   // arch + keystone
  for (const y of [F + 2.2, F + 7.8]) for (const s of [-1, 1]) { const g = bbox(2.6, 0.3, 0.12, 0.03).translate(s * (dW / 2 - 1.5), y, zD + 0.45); G.iron.push(g); DM.push(g); }   // hinge straps
  { const d = [new THREE.TorusGeometry(0.4, 0.07, 8, 20).translate(-0.8, F + 5.6, zD + 0.55), cyl(0.18, 0.18, 0.2, 10).rotateX(Math.PI / 2).translate(-0.8, F + 6.0, zD + 0.48)]; G.iron.push(...d); DM.push(...d); }
  { const e = escutcheon(ks, 1.08); e.forEach((g) => g.translate(kx, ky, zD + 0.4)); G.iron.push(...e); DM.push(...e); }
  { const dg = new THREE.Group(); DM.forEach((g) => dg.add(new THREE.Mesh(g))); root.userData.doorModule = dg; }
  // rose window, square window, lamps
  { const cy = F + 21, z = zT + 0.05;
    G.dark.push(new THREE.CircleGeometry(3.0, 48).translate(0, cy, z));
    G.trim.push(new THREE.TorusGeometry(3.2, 0.4, 10, 64).translate(0, cy, z + 0.2), new THREE.TorusGeometry(0.9, 0.2, 8, 32).translate(0, cy, z + 0.25));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; G.trim.push(bbox(2.2, 0.16, 0.2, 0.02).rotateZ(a).translate(Math.cos(a) * 1.95, cy + Math.sin(a) * 1.95, z + 0.25)); const p = new THREE.TorusGeometry(0.75, 0.09, 6, 24); p.translate(Math.cos(a + 0.39) * 2.0, cy + Math.sin(a + 0.39) * 2.0, z + 0.2); G.trim.push(p); } }
  { const cy = F + 36, z = zT; G.trim.push(bbox(3.8, 4.8, 0.5, 0.06).translate(0, cy, z + 0.1), bbox(4.4, 0.4, 0.9, 0.05).translate(0, cy - 2.6, z + 0.3), bbox(4.3, 0.5, 0.8, 0.05).translate(0, cy + 2.6, z + 0.3)); G.dark.push(bbox(3.0, 4.0, 0.3, 0.02).translate(0, cy, z + 0.25)); G.trim.push(bbox(0.16, 4.0, 0.3, 0.02).translate(0, cy, z + 0.38), bbox(3.0, 0.16, 0.3, 0.02).translate(0, cy, z + 0.38)); }
  for (const s of [-1, 1]) { const x = s * 5.7, y = F + 9, z = zT; G.iron.push(bbox(0.25, 0.25, 0.9, 0.03).translate(x, y + 1.3, z + 0.45), lathe([[0, 0], [0.45, 0], [0.55, 1.2], [0.7, 1.3], [0.2, 1.8], [0, 1.9]], 6).translate(x, y - 0.4, z + 0.9)); G.dark.push(cyl(0.42, 0.5, 1.1, 6).translate(x, y + 0.2, z + 0.9)); }
  // lancet windows either side of the tower
  for (const s of [-1, 1]) {
    const x = s * 14, v0 = F + 7, vs = F + 17, w = 4.6, o = { uc: x, v0, vs, w, k: 1 }, z = zF + 0.02;
    const pts = archOutline(x, v0, vs, w, 1, 20);
    G.dark.push(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)))).translate(0, 0, z));
    G.trim.push(tube(pts.map(([a, b]) => new THREE.Vector3(a, b, z + 0.15)), 0.32, 80, 8), bbox(w + 1.4, 0.5, 1.0, 0.05).translate(x, v0 - 0.3, z + 0.3));
    for (const dx of [-w / 6, w / 6]) G.trim.push(bbox(0.14, vs - v0 + archRise(w) * 0.8, 0.2, 0.02).translate(x + dx, (v0 + vs + archRise(w) * 0.8) / 2 - 0.2, z + 0.12));
    for (let k = 1; k < 6; k++) G.trim.push(bbox(w - 0.2, 0.14, 0.2, 0.02).translate(x, v0 + k * (vs - v0) / 5.2, z + 0.12));
    // side stair up to the tower level (like the reference) + little stoop
    for (let i = 0; i < 4; i++) G.wood.push(bbox(3.2, 0.25, 1.1, 0.04).translate(s * (HW - 3.5), G0 + 0.4 + i * 0.7, zF + 4.5 - i * 1.0));
  }
  // steps + rails + ramp
  for (let i = 0; i < 5; i++) { const top = F - i * 0.6; G.wood.push(bbox(16, top - G0, 1.4, 0.05).translate(0, (top + G0) / 2, zT + 0.7 + i * 1.4)); }
  for (const s of [-1, 1]) {
    const x = s * 8.3; for (let i = 0; i <= 5; i++) G.iron.push(cyl(0.1, 0.1, 3.0, 8).translate(x, F - i * 0.6 + 1.5, zT + 0.5 + i * 1.4));
    G.iron.push(tube([new THREE.Vector3(x, F + 3.0, zT + 0.2), new THREE.Vector3(x, F - 3 + 3.0, zT + 7.5)], 0.12, 8, 6));
  }
  { const r = bbox(3.6, 0.5, Math.hypot(15, 3), 0.05); r.rotateX(-Math.atan2(3, 15)); r.translate(-10.6, (F + G0) / 2 - 0.2, zT + 7.5); G.wood.push(r); }
  // keyhole tunnel: dark lining through every layer (inner face of the wall → front of the door + escutcheon)
  { const T = 0.4985; let tun = new THREE.ExtrudeGeometry(new THREE.Shape(keyholeGrown(ks, 1.04).getPoints(64)), { depth: T, bevelEnabled: false, curveSegments: 32 });   // lining = exactly the hole through backing + door leaf (no gaps showing the raw hole walls)
    const gr = tun.groups[1], a = tun.attributes.position.array, n = tun.attributes.normal.array;
    const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(a.slice(gr.start * 3, (gr.start + gr.count) * 3), 3)); side.setAttribute('normal', new THREE.Float32BufferAttribute(n.slice(gr.start * 3, (gr.start + gr.count) * 3), 3));
    side.translate(kx, ky, zD - 0.06); root.add(new THREE.Mesh(side, M.tunnel));
    // the holes are 8 % wider than the lining (no coincident walls → no z-fighting); dark collars close the gap at both faces
    const collar = (z) => { const sh = new THREE.Shape(keyholeGrown(ks, 1.08).getPoints(64)); sh.holes.push(new THREE.Path(keyholeGrown(ks, 1.04).getPoints(64))); const g = new THREE.ShapeGeometry(sh); g.translate(kx, ky, z); root.add(new THREE.Mesh(g, M.tunnel)); };
    collar(zD - 0.06); collar(zD - 0.06 + T);
    root.userData.keyhole = { K: new THREE.Vector3(kx, ky + 0.18 * ks, zD - 0.06 + T / 2), T, s: ks, G0, zFront: zD + 0.5, aimY: F + 9 }; }
  // short front walk to the sidewalk; pines only behind and beside the church (the street's houses start at x ≈ 53)
  for (let z = zT + 7.5, i = 0; z < zT + 11; z += 2.6, i++) G.stone.push(tag(bbox(4.2 + (i % 2) * 0.8, 0.3, 2.4, 0.06).translate(0, G0 + 0.1, z + 1.2), rnd(i, 77)));
  for (let i = 0; i < 34; i++) {
    const behind = i < 12, s = rnd(i, 4) > 0.5 ? 1 : -1;
    const x = behind ? (rnd(i, 5) - 0.5) * 140 : s * (HW + 24 + rnd(i, 6) * 30), z = behind ? zEnd - 40 - rnd(i, 7) * 50 : zEnd - 30 + rnd(i, 8) * (zMax - zEnd - 20);
    for (const g of pine(55 + rnd(i, 9) * 45, i)) G.pine.push(g.translate(x, G0, z));
  }
  for (const k of Object.keys(G)) if (G[k].length) { G[k].forEach((g) => g.userData.tagged || tag(g, Math.random())); const mm = new THREE.Mesh(merge(G[k]), M[k]); if (k === 'door') root.userData.doorMesh = mm; root.add(mm); }
}
