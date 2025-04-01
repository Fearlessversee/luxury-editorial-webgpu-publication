import * as THREE from 'three';
import { SND, setMuted, soundEnable, musicWave, musicLevel } from './sound.js';
import { drawBadge, BADGE_STYLES } from './badge.js';
import { overlayInvert } from './cursorfx.js';
import { uniform, texture, vec3, vec4, float, mix, select, frontFacing, positionLocal, normalLocal, normalView, sin, atan2, smoothstep, step, min, length, varying, normalize, cross, dFdx, dFdy, attribute, Fn, uv, vec2, fwidth, abs } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Screen UI drawn by WebGPU on top of the finished frame (after every post pass), after the Figma frames
// "SHOTS | 2026 · Page 56": a title per scroll stage — every line in its own black container — applied like a
// vinyl sticker (one corner goes down first, the rest is smoothed on, the last corner springs back up a little),
// two corner labels, the brand mark, and a small 3D can in the bottom-right corner that fills with black liquid
// as you scroll (progress bar). Everything is laid out in the Figma's 1920-wide design pixels × UI.scale.

const DESIGN_W = 1920;
const FONT = 'PP Formula Condensed Black';
export const UI = { scale: 1 };

// the 12 scroll stages of the Figma page and where their title sits
export const STAGES = [
  { key: 'lake', name: '1 · Crow lake', pos: 'top' },
  { key: 'ball', name: '2 · Crystal ball', pos: 'bottom-left' },
  { key: 'church', name: '3 · Church', pos: 'bottom-left' },
  { key: 'door', name: '4 · Door / keyhole', pos: 'center' },
  { key: 'street', name: '5 · Street', pos: 'lower' },
  { key: 'portal', name: '6 · Portal', pos: 'upper' },
  { key: 'city', name: '7 · City', pos: 'bottom-left' },
  { key: 'park', name: '8 · Park', pos: 'bottom-left' },
  { key: 'high', name: '9 · Above the city', pos: 'bottom-left' },
  { key: 'planet', name: '10 · Planet', pos: 'bottom-left' },
  { key: 'atom', name: '11 · Atom', pos: 'bottom' },
  { key: 'cell', name: '12 · Cell', pos: 'bottom' },
];
export const POSITIONS = ['top', 'upper', 'center', 'lower', 'bottom', 'bottom-left'];

// which stage the scroll is in (same scroll model as main.js)
export function stageAt(s, P) {
  const ex = Math.max(0, P.ballExtraSteps);
  if (s < 0) return 0;                       // flying out of the crow's eye → scene 1
  if (s < 1) return 0;
  if (s < 2) return 1;
  let b = 2 + ex; if (s < b) return 2;
  { const k0 = b; b += P.keySteps; if (s < b) return (s - k0) / Math.max(0.01, P.keySteps) < (P.titleKeyOut ?? 0.2) ? 3 : -1; }   // gone before the keyhole comes up
  const t0 = b; b += P.townSteps; if (s < b) return (s - t0) / P.townSteps < 0.72 ? 4 : 5;
  const c0 = b; b += P.citySteps; if (s < b) { const u = (s - c0) / P.citySteps; return u < 0.34 ? 6 : u < 0.67 ? 7 : 8; }
  b += Math.max(0, P.earthSteps); if (s < b) return 9;
  b += Math.max(0, P.atomSteps); if (s < b) return 10;
  b += Math.max(0, P.cellSteps); if (s < b) return 11;
  return -1;                                 // the loop veil (back to the crow's eye): no title
}

// ------------------------------------------------------------------ text → canvas texture
function lineTexture(text, px, S, col, box) {
  const fs = 83 * S, padX = 11 * S, h = 78 * S, dpr = Math.min(2, devicePixelRatio || 1);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `${fs}px "${FONT}"`;
  const w = Math.ceil(g.measureText(text).width + padX * 2);
  c.width = Math.max(2, Math.ceil(w * dpr)); c.height = Math.max(2, Math.ceil(h * dpr));
  g.scale(dpr, dpr);
  g.fillStyle = box; g.fillRect(0, 0, w, h);
  g.font = `${fs}px "${FONT}"`; g.fillStyle = col; g.textBaseline = 'alphabetic';
  g.fillText(text, padX, h / 2 + fs * 0.4);   // caps (0.8 em) centred in the box
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;   // raw display values (drawn straight to the canvas, no conversion)
  return { t, w, h };
}
function labelTexture(text, S, col) {
  const fs = 20 * S, gap = 10 * S, dpr = Math.min(2, devicePixelRatio || 1);
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `${fs}px "${FONT}"`;
  const ws = words.map((w) => g.measureText(w).width - 0.2 * S * w.length);
  const W = Math.ceil(ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, words.length - 1)) + 2, H = Math.ceil(fs * 1.1);
  c.width = Math.max(2, W * dpr); c.height = Math.max(2, H * dpr); g.scale(dpr, dpr);
  g.font = `${fs}px "${FONT}"`; g.fillStyle = col; if ('letterSpacing' in g) g.letterSpacing = `${-0.2 * S}px`;
  let x = 0; words.forEach((w, i) => { g.fillText(w, x, fs * 0.9); x += ws[i] + gap; });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return { t, w: W, h: H };
}

// masking tape: a translucent paper strip with torn, zig-zag ends and a few crinkles
function tapeTexture(w, h, col, op, r) {
  const dpr = Math.min(2, devicePixelRatio || 1), c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil(w * dpr)); c.height = Math.max(2, Math.ceil(h * dpr));
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  g.beginPath(); g.moveTo(0, 0); for (let x = 0; x <= w; x += 6) g.lineTo(x, (r() - 0.5) * 1.2);
  for (let y = 0; y <= h; y += 3) g.lineTo(w - r() * 5, y);
  for (let x = w; x >= 0; x -= 6) g.lineTo(x, h + (r() - 0.5) * 1.2);
  for (let y = h; y >= 0; y -= 3) g.lineTo(r() * 5, y); g.closePath();
  g.globalAlpha = op; g.fillStyle = col; g.fill();
  g.globalAlpha = op * 0.35; g.strokeStyle = '#000'; g.lineWidth = 0.7;
  for (let k = 0; k < 5; k++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * h * 1.5, h); g.stroke(); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return { t };
}
// ------------------------------------------------------------------ sticker
// A plane (in screen px) bent like a peeling sticker: along the peel direction d, everything before the peel line
// (u < s) is stuck flat; past it the sheet wraps round a cylinder of radius r and lies folded back over itself.
// The back of the sheet shows the white backing.
const raw = (c, h) => c.setHex(parseInt(String(h).slice(1), 16), THREE.LinearSRGBColorSpace);   // display value, no colour management
const backColor = uniform(raw(new THREE.Color(), '#f1ede4'));
class Sticker {
  constructor(parent, tex, w, h, dir, delay, opts, own = true) {
    this.tex = own ? tex : null; this.w = w; this.h = h; this.delay = delay; this.o = opts;
    const nx = Math.max(8, Math.ceil(w / 5)), ny = Math.max(4, Math.ceil(h / 5));
    this.geo = new THREE.PlaneGeometry(w, h, nx, ny);
    this.base = this.geo.attributes.position.array.slice();
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: true });
    this.alpha = uniform(0);
    m.colorNode = select(frontFacing, texture(tex).rgb, vec3(backColor).mul(float(0.9).add(uv().x.mul(0.1))));
    m.opacityNode = this.alpha.mul(texture(tex).a); m.toneMapped = false;
    this.mesh = new THREE.Mesh(this.geo, m);
    // shadow: the same sheet flattened onto the page, pushed away from the light by how high each point is lifted
    this.sgeo = new THREE.PlaneGeometry(w, h, nx, ny);
    const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
    this.salpha = uniform(0); sm.colorNode = vec3(0); sm.opacityNode = this.salpha; sm.toneMapped = false;
    this.shadow = new THREE.Mesh(this.sgeo, sm); this.shadow.renderOrder = -1;
    this.g = new THREE.Group(); this.g.add(this.shadow, this.mesh); parent.add(this.g);
    // peel from one corner towards the opposite one (a slightly tilted diagonal)
    this.d = new THREE.Vector2(dir * w, -h * 0.9 * (dir > 0 ? 1 : 1)).normalize();
    const cs = [[-w / 2, h / 2], [w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]].map(([x, y]) => x * this.d.x + y * this.d.y);
    this.u0 = Math.min(...cs); this.L = Math.max(...cs) - this.u0;
    this.t = -1; this.state = 'off'; this.lift = 0; this.liftV = 0; this.press = 1; this.pressV = 0; this.dirty = true;
    this.s = 0; this.r = this.L;
  }
  enter() { if (this.state === 'in' || this.state === 'entering') return; this.state = 'entering'; this.t = -this.delay; }
  leave() { if (this.state === 'off' || this.state === 'leaving') return; this.state = 'leaving'; this.t = 0; this.s0 = this.s; this.r0 = this.r; }
  step(dt) {
    const o = this.o, L = this.L, sp = Math.max(0.1, o.speed());
    if (this.state === 'off') { this.g.visible = false; return; }
    this.g.visible = true; this.t += dt * sp;
    const lift = o.lift(), rMin = Math.max(2, o.curl());
    if (this.state === 'entering') {
      const d = 0.62, k = THREE.MathUtils.clamp(this.t / d, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.alpha.value = THREE.MathUtils.clamp(this.t / 0.08, 0, 1);
      this.s = THREE.MathUtils.lerp(L * 0.06, L, e); this.r = THREE.MathUtils.lerp(L * 0.35, rMin, e);
      if (this.t < 0) this.alpha.value = 0;
      if (k >= 1) { this.state = 'in'; this.lift = 0; this.liftV = lift * 14; this.pressV = -0.6; }   // the finger leaves: the last corner springs back up
      this.press = 1 + 0.05 * (1 - e);
    } else if (this.state === 'in') {
      // two damped springs: the corner lift (overshoots, settles at `lift` px) and the press "thump" of the sheet
      const a = -260 * (this.lift - lift) - 11 * this.liftV; this.liftV += a * dt; this.lift += this.liftV * dt;
      const b = -400 * (this.press - 1) - 18 * this.pressV; this.pressV += b * dt; this.press += this.pressV * dt;
      this.s = L - Math.max(0, this.lift); this.r = rMin; this.alpha.value = 1;
    } else if (this.state === 'leaving') {
      const d = 0.34, k = THREE.MathUtils.clamp(this.t / d, 0, 1), e = k * k;
      this.s = THREE.MathUtils.lerp(this.s0, 0, e); this.r = THREE.MathUtils.lerp(this.r0, L * 0.4, e);
      this.alpha.value = 1 - THREE.MathUtils.smoothstep(k, 0.55, 1);
      if (k >= 1) { this.state = 'off'; this.g.visible = false; return; }
    }
    this.salpha.value = 0.28 * o.shadow() * this.alpha.value;
    this.deform();
  }
  deform() {
    const p = this.geo.attributes.position.array, q = this.sgeo.attributes.position.array, B = this.base;
    const d = this.d, s = this.u0 + this.s, r = this.r, pr = this.press;
    for (let i = 0; i < B.length; i += 3) {
      const x = B[i], y = B[i + 1], u = x * d.x + y * d.y, xp = u - s;
      let du = 0, z = 0;
      if (xp > 0) {
        const th = xp / r;
        if (th < Math.PI) { du = r * Math.sin(th) - xp; z = r * (1 - Math.cos(th)); }
        else { du = s - (xp - Math.PI * r) - u; z = 2 * r; }
      }
      const f = pr * (1 + z * 0.0025);   // lifted paper comes a touch closer (fake perspective)
      const X = (x + d.x * du) * f, Y = (y + d.y * du) * f;
      p[i] = X; p[i + 1] = Y; p[i + 2] = z;
      q[i] = X + z * 0.35; q[i + 1] = Y - z * 0.5; q[i + 2] = -1;
    }
    this.geo.attributes.position.needsUpdate = true; this.sgeo.attributes.position.needsUpdate = true;
  }
  dispose() { this.g.removeFromParent(); this.geo.dispose(); this.sgeo.dispose(); this.mesh.material.dispose(); this.shadow.material.dispose(); if (this.tex) this.tex.dispose(); }
}

// ------------------------------------------------------------------ liquid physics
// Height field h (deviation from the mean level L) and its vertical speed v on an N×N grid across the carton floor.
// Every substep: v += c²·∇²h·dt (waves), walls mirror (so waves bounce wall to wall), v decays (viscosity), h += v·dt.
// Pouring: when the scroll asks for more liquid, the level rises at a limited pour rate and the added volume lands
// as a bump near one wall, which then runs across and rebounds. Scroll acceleration shoves the whole body sideways
// (a tilt impulse), so it sloshes back and forth when you start / stop scrolling.
class Liquid {
  constructor(A, y0, yMax, C, N = 18) {
    this.A = A; this.y0 = y0; this.yMax = yMax; this.N = N; this.L = y0; this.h = new Float32Array(N * N); this.v = new Float32Array(N * N);
    const dx = (2 * A) / (N - 1); this.dx = dx;
    // mesh: top grid (N×N) + 4 walls (N columns × 2 rows each) + bottom (4 verts)
    const pos = [], isTop = [], idx = [];
    const gx = (i) => -A + i * dx;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { pos.push(gx(i), 0, gx(j)); isTop.push(1); }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const a = j * N + i; idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1); }
    this.walls = [];
    const wall = (cells, outward) => {   // cells: grid indices along the edge; each gets a top vertex (follows h) and a bottom one
      const base = pos.length / 3;
      cells.forEach((c) => { const x = pos[c * 3], z = pos[c * 3 + 2]; pos.push(x, 0, z, x, y0, z); isTop.push(0, 0); });
      for (let k = 0; k < cells.length - 1; k++) { const t0 = base + k * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3; if (outward) idx.push(t0, b0, t1, t1, b0, b1); else idx.push(t0, t1, b0, t1, b1, b0); }
      this.walls.push({ base, cells });
    };
    const row = (j) => [...Array(N).keys()].map((i) => j * N + i), col = (i) => [...Array(N).keys()].map((j) => j * N + i);
    wall(row(N - 1), true); wall(row(0), false); wall(col(N - 1), false); wall(col(0), true);
    const bb = pos.length / 3; pos.push(-A, y0, -A, A, y0, -A, -A, y0, A, A, y0, A); isTop.push(0, 0, 0, 0); idx.push(bb, bb + 1, bb + 2, bb + 1, bb + 3, bb + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('isTop', new THREE.Float32BufferAttribute(isTop, 1)); geo.setIndex(idx);
    this.geo = geo;
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); m.toneMapped = false;
    // two colours only: ink body; on the top a thin paper meniscus line just inside the walls
    const top = attribute('isTop'), r = positionLocal.x.abs().max(positionLocal.z.abs());
    const ring = step(A - 0.042, r).mul(step(r, A - 0.026)).mul(step(0.5, top));
    m.colorNode = mix(vec3(C.ink), vec3(C.paper), ring);
    this.mesh = new THREE.Mesh(geo, m); this.mesh.frustumCulled = false;
    this.pourAt = [Math.round(N * 0.82), Math.round(N * 0.3)];   // where the stream lands (near the right-back wall)
  }
  step(dt, target, accX, accZ, o) {
    const N = this.N, h = this.h, v = this.v, dx = this.dx, A = this.A;
    // pour / drain at a limited rate → the added volume lands as a bump, the removed one as a dip
    const dL = THREE.MathUtils.clamp(target - this.L, -o.pour * dt, o.pour * dt);
    if (Math.abs(dL) > 1e-6) {
      this.L += dL;
      const [pi, pj] = this.pourAt, rad = 3.2; let wsum = 0; const w = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const q = Math.exp(-((i - pi) ** 2 + (j - pj) ** 2) / (rad * rad)); w.push(q); wsum += q; }
      const amt = dL * N * N / wsum * o.bump;   // part of the new volume lands as a bump, the rest spreads at once
      for (let k = 0; k < N * N; k++) { h[k] += amt * w[k]; v[k] -= Math.sign(dL) * o.splash * w[k] * Math.min(1, Math.abs(dL) / (o.pour * dt + 1e-6)); }
    }
    const c = o.wave, sub = Math.max(1, Math.ceil(dt * c / (0.45 * dx))), sdt = dt / sub, k2 = (c * c) / (dx * dx);
    const damp = Math.exp(-o.damp * sdt);
    for (let s = 0; s < sub; s++) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, hc = h[k];
        const l = h[k - (i > 0 ? 1 : -1)], r = h[k + (i < N - 1 ? 1 : -1)], d = h[k - (j > 0 ? N : -N)], u = h[k + (j < N - 1 ? N : -N)];   // mirrored walls
        const x = -A + i * dx, z = -A + j * dx;
        v[k] = (v[k] + (k2 * (l + r + d + u - 4 * hc) - (accX * x + accZ * z) * o.slosh) * sdt) * damp;
      }
      let mean = 0; for (let k = 0; k < N * N; k++) { h[k] = THREE.MathUtils.clamp(h[k] + v[k] * sdt, -o.maxH, o.maxH); mean += h[k]; }
      mean /= N * N; for (let k = 0; k < N * N; k++) h[k] -= mean;   // volume lives in L
    }
    // write the surface into the mesh (the surface never leaves the carton)
    const p = this.geo.attributes.position.array, lo = this.y0 + 0.002, hi = this.yMax;
    const Y = (k) => THREE.MathUtils.clamp(this.L + h[k], lo, hi);
    for (let k = 0; k < N * N; k++) p[k * 3 + 1] = Y(k);
    for (const w of this.walls) w.cells.forEach((cIdx, n) => { p[(w.base + n * 2) * 3 + 1] = Y(cIdx); });
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = this.L > this.y0 + 0.003;
  }
}

// ------------------------------------------------------------------ the progress brain
// A detailed, slowly turning 3D brain (two hemispheres with the long fissure, folded gyri, temporal lobes,
// cerebellum with its fine folia, brain stem), solid paper — nothing shows through it — with ink outline and ink
// sulcus lines. As you scroll it fills with the same sloshing ink liquid as the old carton: the liquid simulation
// (height field) is sampled in the brain's non-turning frame, so the surface stays level while the brain turns.
const _perm = (() => { const p = []; for (let i = 0; i < 256; i++) p[i] = i; let s = 7; for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } return p.concat(p); })();
const _fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), _lerp = (a, b, t) => a + (b - a) * t;
const _grad = (h, x, y, z) => { const u = h & 15, a = u < 8 ? x : y, b = u < 4 ? y : u === 12 || u === 14 ? x : z; return ((u & 1) ? -a : a) + ((u & 2) ? -b : b); };
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255; x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = _fade(x), v = _fade(y), w = _fade(z), P = _perm, A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  return _lerp(_lerp(_lerp(_grad(P[AA], x, y, z), _grad(P[BA], x - 1, y, z), u), _lerp(_grad(P[AB], x, y - 1, z), _grad(P[BB], x - 1, y - 1, z), u), v),
    _lerp(_lerp(_grad(P[AA + 1], x, y, z - 1), _grad(P[BA + 1], x - 1, y, z - 1), u), _lerp(_grad(P[AB + 1], x, y - 1, z - 1), _grad(P[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
function brainGeometry() {
  const S = (a, b, t) => { const k = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const part = (g, fn) => { g.deleteAttribute('uv'); const p = g.attributes.position, sulc = new Float32Array(p.count), v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const r = fn(v); p.setXYZ(i, v.x, v.y, v.z); sulc[i] = r; }
    g.setAttribute('sulc', new THREE.BufferAttribute(sulc, 1)); g.computeVertexNormals(); return g; };   // smooth normals per part (the outline is pushed along them)
  // cerebrum: an elongated ellipsoid (x = front→back), flattened underneath, temporal lobes bulging low at the
  // sides, the long fissure between the hemispheres, and folds from warped 3D noise (|n| small = a sulcus)
  const cer = part(new THREE.SphereGeometry(1, 180, 120), (v) => {
    const d = v.clone();
    let x = d.x * 0.44, y = d.y * 0.33, z = d.z * 0.37;
    if (y < 0) y *= 0.62;
    const temporal = S(0.1, -0.25, d.y) * S(0.2, 0.75, Math.abs(d.z)) * S(-0.6, 0.3, d.x); z *= 1 + 0.08 * temporal; y -= 0.03 * temporal;
    x *= 1 + 0.05 * S(0.2, 1, d.x) - 0.04 * S(-0.3, -1, d.x) * S(0.2, -0.6, d.y);   // blunter frontal lobe, tapering occipital
    const wx = noise3(x * 2.2 + 11, y * 2.2, z * 2.2) * 0.35, wz = noise3(x * 2.2, y * 2.2 + 7, z * 2.2) * 0.35;
    const n = noise3(x * 11 + wx, y * 11 + wz, z * 11 - wx) + 0.3 * noise3(x * 22, y * 22, z * 22);
    const sulc = Math.exp(-(n * n) / (0.1 * 0.1));
    const fiss = Math.exp(-(z * z) / (0.022 * 0.022)) * S(-0.1, 0.15, y);
    const k = 1 - 0.055 * sulc + 0.012 * (1 - sulc) - 0.04 * fiss;
    v.set(x * k, y * k - 0.025 * fiss, z * k);
    return fiss > 0.93 ? 0 : n;
  });
  // cerebellum: low at the back, fine horizontal folia
  const cbl = part(new THREE.SphereGeometry(1, 120, 80), (v) => {
    const d = v.clone(), x = -0.27 + d.x * 0.15, y = -0.1 + d.y * 0.085, z = d.z * 0.24;
    const f = Math.sin(d.y * 26 + d.x * 4), k = 1 - 0.02 * Math.exp(-f * f * 6), mid = Math.exp(-(d.z * d.z) / 0.004);
    v.set(-0.27 + (x + 0.27) * k, -0.1 + (y + 0.1) * k - 0.012 * mid, z * k);
    return mid > 0.5 ? 0 : f * 0.35;
  });
  // brain stem: a short tapered column under the middle, leaning back
  const stem = part(new THREE.CylinderGeometry(0.05, 0.04, 0.16, 40, 8, false), (v) => { v.set(v.x - 0.08 - v.y * 0.35, v.y - 0.16, v.z); return 1; });
  const g = mergeGeometries([cer.toNonIndexed(), cbl.toNonIndexed(), stem.toNonIndexed()]);
  g.computeBoundingBox(); const bb = g.boundingBox; g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeBoundingBox();
  return g;
}
function makeCan(C) {   // (kept the name: the rest of the overlay treats it as "the progress can")
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const ow = uniform(0.02), spinA = uniform(0), Lv = uniform(0);
  const geo = brainGeometry(), top = geo.boundingBox.max.y, A = 0.5;
  const liquid = new Liquid(A, 0, top, C);   // the simulation only; its own mesh is not shown
  const N = liquid.N, gX = uniform(0), gZ = uniform(0), wv = uniform(0), tU = uniform(0);   // surface = level + tilt + a little ripple (plain uniforms: robust on every backend)
  const m = new THREE.MeshBasicNodeMaterial(); m.toneMapped = false;
  m.colorNode = Fn(() => {
    const p = positionLocal, ca = spinA.cos(), sa = spinA.sin();
    const xp = p.x.mul(ca).add(p.z.mul(sa)), zp = p.z.mul(ca).sub(p.x.mul(sa));             // into the non-turning frame
    const hh = xp.mul(gX).add(zp.mul(gZ)).add(sin(xp.mul(19).add(tU.mul(3.1))).mul(sin(zp.mul(17).sub(tU.mul(2.3)))).mul(wv));
    const dy = p.y.sub(Lv.add(hh)), fill = float(1).sub(smoothstep(fwidth(p.y).negate(), fwidth(p.y), dy)).mul(step(0.001, Lv));
    const s = attribute('sulc'), line = float(1).sub(smoothstep(float(0), fwidth(s).mul(1.3), abs(s)));
    const base = mix(vec3(C.paper), vec3(C.ink), fill);
    return mix(base, mix(vec3(C.ink), vec3(C.paper), fill), line);
  })();
  const brain = new THREE.Mesh(geo, m); brain.renderOrder = 2; brain.frustumCulled = false;
  // outline: the same brain, back faces only, pushed out by the line width, in ink
  const hm = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide }); hm.toneMapped = false; hm.colorNode = vec3(C.ink);
  hm.positionNode = positionLocal.add(normalLocal.mul(ow));
  const hull = new THREE.Mesh(geo, hm); hull.renderOrder = 1; hull.frustumCulled = false;
  spin.add(hull, brain);
  g.rotation.set(0.22, 0, 0.02);
  const r = 0.5; const pts = []; for (const x of [-r, r]) for (const z of [-r, r]) for (const y of [0, top]) pts.push(new THREE.Vector3(x, y, z));
  const stepBrain = (dt, target, accX, accZ, o) => {   // (not 'step': that name is the shader's step())
    liquid.step(dt, target * top, accX, accZ, o);
    spin.rotation.y += dt * 0.35; spinA.value = spin.rotation.y;
    // fit the simulated height field with a plane (tilt) and keep its leftover as ripple strength
    const h = liquid.h, dx = liquid.dx; let sx = 0, sz = 0, sxx = 0, rest = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -A + i * dx, z = -A + j * dx, v = h[j * N + i]; sx += v * x; sz += v * z; sxx += x * x; }
    const ax = sx / sxx, az = sz / sxx;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -A + i * dx, z = -A + j * dx, v = h[j * N + i] - ax * x - az * z; rest += v * v; }
    Lv.value = liquid.L; gX.value = ax; gZ.value = az; wv.value = Math.min(0.03, Math.sqrt(rest / (N * N)) * 1.5); tU.value += dt;
  };
  return { g, ow, liquid, pts, step: stepBrain, top };
}

// ------------------------------------------------------------------ flying dust (whole site, screen space)
// Specks drifting on a slow swirling flow, each at a random depth (nearer = bigger, faster, stronger parallax);
// scrolling streams them up/down, the cursor pushes them aside. Ink specks — still the two-colour print.
class Dust {
  constructor(C, max = 4000) {
    this.max = max; this.n = 0;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false }); m.toneMapped = false;
    this.alpha = uniform(0.7); this.soft = uniform(0.25);
    const d = length(uv().sub(0.5)).mul(2);
    m.colorNode = vec3(C.ink); m.opacityNode = float(1).sub(smoothstep(float(1).sub(this.soft), float(1), d)).mul(this.alpha);
    // WebGPU keeps instance matrices in a uniform buffer (64 KB = 1024 matrices): more than that invalidates the
    // whole overlay pass (nothing drew at all). So the dust is split into chunks of 1000.
    this.mesh = new THREE.Group(); this.chunks = []; const geo = new THREE.PlaneGeometry(1, 1);
    for (let k = 0; k < max; k += 1000) { const im = new THREE.InstancedMesh(geo, m, Math.min(1000, max - k)); im.frustumCulled = false; im.renderOrder = -10; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chunks.push(im); this.mesh.add(im); }
    this.p = new Float32Array(max * 5);   // x, y, depth, seed, size
    this.m4 = new THREE.Matrix4(); this.inited = false;
  }
  seed(W, H) { for (let k = 0; k < this.max; k++) { const o = k * 5; this.p[o] = Math.random() * W; this.p[o + 1] = Math.random() * H; this.p[o + 2] = 0.25 + Math.random() * 0.75; this.p[o + 3] = Math.random() * 100; this.p[o + 4] = Math.random(); } this.inited = true; }
  step(dt, t, W, H, scrollV, mouse, o) {
    if (!this.inited) this.seed(W, H);
    const n = Math.min(this.max, Math.round(o.count)); this.chunks.forEach((im, c) => { im.count = THREE.MathUtils.clamp(n - c * 1000, 0, 1000); im.visible = im.count > 0; }); this.alpha.value = o.opacity; this.soft.value = o.soft;
    const p = this.p, m4 = this.m4, sp = o.speed * 30, tu = o.turb, sc = o.scale;
    for (let k = 0; k < n; k++) {
      const q = k * 5; let x = p[q], y = p[q + 1]; const z = p[q + 2], sd = p[q + 3];
      // swirling flow (cheap curl-ish field from a few sines), wind, scroll parallax
      const fx = Math.sin(y * 0.004 * sc + t * 0.21 + sd) + Math.sin(y * 0.011 * sc - t * 0.37 + sd * 2.1) * 0.5;
      const fy = Math.cos(x * 0.005 * sc - t * 0.18 + sd * 1.3) + Math.cos(x * 0.013 * sc + t * 0.29 + sd) * 0.5;
      let vx = (o.windX + fx * tu) * sp * z, vy = (o.windY + fy * tu) * sp * z - scrollV * o.scroll * 260 * z;
      if (mouse.on && o.repel > 0) { const dx = x - mouse.x, dy = y - mouse.y, r2 = dx * dx + dy * dy, R = o.radius; if (r2 < R * R) { const f = (1 - Math.sqrt(r2) / R) * o.repel * 900 / Math.max(8, Math.sqrt(r2)); vx += dx * f * 0.02; vy += dy * f * 0.02; } }
      x += vx * dt; y += vy * dt;
      if (x < -10) x += W + 20; else if (x > W + 10) x -= W + 20;
      if (y < -10) y += H + 20; else if (y > H + 10) y -= H + 20;
      p[q] = x; p[q + 1] = y;
      const size = o.size * (0.35 + z * 0.9) * (1 - o.sizeVar * 0.8 + p[q + 4] * o.sizeVar * 1.6);
      m4.makeScale(size, size, 1); m4.setPosition(x, -y, -5); this.chunks[(k / 1000) | 0].setMatrixAt(k % 1000, m4);
    }
    this.chunks.forEach((im) => (im.instanceMatrix.needsUpdate = true));
  }
}

// ------------------------------------------------------------------ cursor label (after the reference)
// A pill that follows the pointer on a spring, hung from its left end right next to the arrow: moving the mouse
// makes it lag, swing and settle (a damped rotational spring driven by the pointer's acceleration).
class CursorTag {
  constructor(C) {
    this.C = C; this.mesh = null; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.a = 0; this.av = 0; this.show = 0; this.key = '';
    this.g = new THREE.Group(); this.g.renderOrder = 100; this.idle = 0; this.pvx = 0; this.pvy = 0;
  }
  build(o, fontOK) {
    const key = [o.text, o.size, o.pad, o.fg, o.bg, o.radius, fontOK].join('|'); if (key === this.key) return; this.key = key;
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.tex.dispose(); }
    const dpr = Math.min(2, devicePixelRatio || 1), fs = o.size, padX = o.pad, h = Math.round(fs * 1.7);
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `${fs}px "${FONT}"`; const tw = g.measureText(o.text.toUpperCase()).width, w = Math.ceil(tw + padX * 2);
    c.width = Math.max(2, w * dpr); c.height = Math.max(2, h * dpr); g.scale(dpr, dpr);
    const r = Math.min(h / 2, o.radius); g.fillStyle = o.bg; g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, r) : g.rect(0, 0, w, h); g.fill();
    g.font = `${fs}px "${FONT}"`; g.fillStyle = o.fg; g.textBaseline = 'middle'; g.fillText(o.text.toUpperCase(), padX, h / 2 + fs * 0.06);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; this.tex = t;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false }); m.toneMapped = false;
    this.alpha = uniform(0); m.colorNode = texture(t).rgb; m.opacityNode = texture(t).a.mul(this.alpha);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(w / 2, 0, 0), m); this.mesh.renderOrder = 100; this.g.add(this.mesh);
  }
  step(dt, mouse, o) {
    if (!this.mesh) return;
    const tx = mouse.x + o.offX, ty = mouse.y + o.offY;
    if (!this.started) { this.x = tx; this.y = ty; this.started = true; }
    // position spring (lag)
    const ax = o.stiff * (tx - this.x) - o.damp * this.vx, ay = o.stiff * (ty - this.y) - o.damp * this.vy;
    this.vx += ax * dt; this.vy += ay * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    // swing: the hanging pill tilts against the pointer's acceleration and with its vertical speed, then settles
    const accx = (this.vx - this.pvx) / Math.max(dt, 1e-3), accy = (this.vy - this.pvy) / Math.max(dt, 1e-3); this.pvx = this.vx; this.pvy = this.vy;
    const tgt = THREE.MathUtils.clamp((-this.vy * 0.02 + accx * 0.0005) * o.swing, -o.maxTilt, o.maxTilt) * Math.PI / 180;
    const aa = o.rStiff * (tgt - this.a) - o.rDamp * this.av; this.av += aa * dt; this.a += this.av * dt;
    const moving = Math.hypot(mouse.x - (this.mx ?? mouse.x), mouse.y - (this.my ?? mouse.y)) > 0.5; this.mx = mouse.x; this.my = mouse.y;
    this.idle = moving ? 0 : this.idle + dt;
    const want = mouse.on && !mouse.overUI && (o.idleHide <= 0 || this.idle < o.idleHide) ? 1 : 0;
    this.show += (want - this.show) * (1 - Math.exp(-dt * 10));
    this.alpha.value = this.show; this.g.visible = this.show > 0.01;
    const sc = (0.85 + 0.15 * this.show) * (mouse.down ? o.press : 1);
    this.g.position.set(this.x, -this.y, 50); this.g.rotation.z = -this.a; this.g.scale.setScalar(sc);
  }
}

// ------------------------------------------------------------------ overlay
export function makeTitles(renderer, P) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
  const C = { ink: uniform(new THREE.Color('#030302')), paper: uniform(new THREE.Color('#cbc2a8')) };
  let fontOK = false, fontFailed = false;
  const ff = new FontFace(FONT, 'url(assets/fonts/PPFormula-CondensedBlack.otf)');
  ff.load().then((f) => { document.fonts.add(f); fontOK = true; rebuildAll(); }).catch(() => { fontFailed = true; rebuildAll(); });

  let W = 1, H = 1, S = 1;
  const root = new THREE.Group(); scene.add(root);
  const titles = STAGES.map(() => ({ g: new THREE.Group(), stickers: [] }));
  titles.forEach((t) => root.add(t.g));
  let cur = -2;
  const opts = { speed: () => P.stickerSpeed, lift: () => P.stickerLift * S, curl: () => P.stickerCurl * S, shadow: () => P.stickerShadow };

  // the brand mark: boxed (a sticker above the scene-1 title) and bare (ink on paper, top centre elsewhere)
  const logoTex = new THREE.TextureLoader().load('assets/ui/logo-box.png'); logoTex.colorSpace = THREE.NoColorSpace;
  const bareM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false }); bareM.toneMapped = false; const bareU = uniform(0);
  { const c = texture(logoTex).rgb, lum = c.r.add(c.g).add(c.b).div(3); bareM.colorNode = vec3(C.ink); bareM.opacityNode = smoothstep(0.12, 0.35, lum).mul(bareU); }
  const bare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bareM); scene.add(bare);
  const bareA = { v: 0 };

  const corner = [null, null];
  const mouse = { x: 0, y: 0, on: false, down: false, overUI: false };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; mouse.overUI = !!(e.target && e.target.closest && e.target !== renderer.domElement && e.target.closest('div,aside,section,nav') && !e.target.closest('#loader')); });
  addEventListener('pointerdown', () => (mouse.down = true)); addEventListener('pointerup', () => (mouse.down = false));
  document.addEventListener('pointerleave', () => (mouse.on = false)); addEventListener('blur', () => (mouse.on = false));
  const dust = new Dust(C); scene.add(dust.mesh);
  const tag = new CursorTag(C); scene.add(tag.g);
  const can = makeCan(C); scene.add(can.g);
  // sound badge above the carton (click: sound on / off)
  const bc = document.createElement('canvas'), bg2 = bc.getContext('2d'), btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.NoColorSpace;
  const bm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false }); bm.toneMapped = false; bm.colorNode = texture(btex).rgb; bm.opacityNode = texture(btex).a;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm); badge.renderOrder = 60; scene.add(badge);
  const bRect = { x: 0, y: 0, w: 0, h: 0 }, _cb = new THREE.Box3(), _cv = new THREE.Vector3();
  const inBadge = (e) => badge.visible && e.clientX >= bRect.x - 6 && e.clientX <= bRect.x + bRect.w + 6 && e.clientY >= bRect.y - 6 && e.clientY <= bRect.y + bRect.h + 6;
  addEventListener('pointerdown', (e) => {
    if (!inBadge(e)) return;
    e.stopPropagation();   // no click sound / scene click underneath
    if (!SND.enabled || performance.now() - (SND.enabledAt || 0) < 80) { soundEnable(); return; }   // the first click only switches sound on
    setMuted(!SND.muted);
  }, { capture: true });
  let hoverBadge = false; addEventListener('pointermove', (e) => { hoverBadge = inBadge(e); });
  let lastVel = 0, accS = 0;

  function place(ti) {
    const t = titles[ti], pos = P['titlePos' + ti] || STAGES[ti].pos, st = t.stickers.filter((x) => x !== t.logo && !x.tape);
    if (!st.length) return;
    const pitch = 76 * S, bh = 78 * S, n = st.length, stackH = (n - 1) * pitch + bh;
    // Figma (1080-high frames): stack frame tops at 189 / 332 / 436 / 812 / 852; the black boxes reach 11 px past it
    let top;
    if (pos === 'top') top = 178 * S;
    else if (pos === 'upper') top = 321 * S;
    else if (pos === 'mobile') top = H * (206 / 874) - 11 * S;   // the phone page (Figma 15434:1150)
    else if (pos === 'center') top = (H - stackH) / 2;
    else if (pos === 'lower') top = H - 49 * S - stackH;
    else top = H - 9 * S - stackH;                    // bottom, bottom-left
    st.forEach((s, i) => {
      const cx = pos === 'bottom-left' ? 10 * S + s.w / 2 : W / 2;
      s.g.position.set(cx, -(top + i * pitch + bh / 2), i * 0.01);
    });
    if (t.logo) { t.logo.g.position.set(W / 2, -(top - 42 * S / 2 + 1 * S), 0.5); }
    for (const tp of t.stickers) if (tp.tape) { const L = st[tp.tape.line]; if (!L) continue; tp.g.position.set(L.g.position.x + tp.tape.fx * L.w + (tp.tape.px || 0), L.g.position.y + tp.tape.fy * L.h + (tp.tape.py || 0), 0.3 + tp.tape.k * 0.01); tp.g.rotation.z = tp.tape.rot; }
  }
  function build(ti) {
    const t = titles[ti];
    t.stickers.forEach((s) => s.dispose()); t.stickers = []; t.logo = null;
    const text = String(P['title' + ti] ?? '').toUpperCase();
    const lines = text.split('\n').map((x) => x.trim()).filter(Boolean);
    lines.forEach((ln, i) => {
      const { t: tex, w, h } = lineTexture(ln, 83, S, P.titleText, P.titleBox);
      const s = new Sticker(t.g, tex, w, h, i % 2 ? -1 : 1, 0.1 + i * 0.13, opts);
      t.stickers.push(s);
    });
    // masking tape stuck over the words (after they land), each strip its own sticker
    if (P.tapeOn && lines.length) {
      let sd = ti * 977 + 13; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      const n = Math.round(P.tapeCount), last = 0.1 + (lines.length - 1) * 0.13 + 0.55;
      // tape holds the containers by their corners and ends, like a real poster: it crosses the black box edge
      // and only nips the first / last letter, never lies across the middle of a word
      const spots = [];
      lines.forEach((_, li) => {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) spots.push({ li, kind: 'corner', sx, sy });   // diagonal over a corner
        for (const sx of [-1, 1]) spots.push({ li, kind: 'end', sx, sy: 0 });                             // across the short end
      });
      for (let i = spots.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [spots[i], spots[j]] = [spots[j], spots[i]]; }
      // every other strip goes straight across the words (see-through yellow site tape: the letters read through it)
      const overs = lines.map((_, li) => ({ li, kind: 'over', sx: 0, sy: 0 })); for (let i = overs.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [overs[i], overs[j]] = [overs[j], overs[i]]; }
      const order = []; for (let a = 0, b = 0; a < spots.length || b < overs.length;) { if (b < overs.length) order.push(overs[b++]); if (a < spots.length) order.push(spots[a++]); }
      const used = new Set();
      for (let k = 0, q = 0; k < n && q < order.length; q++) {
        const sp = order[q], key = sp.li + ':' + (sp.kind === 'over' ? 'o' : sp.sx); if (used.has(key)) continue; used.add(key);   // one strip per box end / per line
        const corner = sp.kind === 'corner', over = sp.kind === 'over';
        const w = (over ? 110 + r() * 90 : corner ? 70 + r() * 40 : 64 + r() * 30) * S, h = (24 + r() * 8) * S, { t: tex } = tapeTexture(w, h, P.tapeColor, P.tapeOpacity, r);
        const s = new Sticker(t.g, tex, w, h, r() < 0.5 ? -1 : 1, last + k * 0.12, opts);
        s.mesh.renderOrder = 2; s.mesh.material.depthWrite = false;   // tape always draws over the words (translucent: it never hides them by depth)
        const rot = over ? (r() - 0.5) * 0.6 : corner ? -sp.sx * sp.sy * (0.62 + r() * 0.3) : Math.PI / 2 + (r() - 0.5) * 0.35;
        // corners / ends: centred on the box edge (half on the black, half off); over: across the words
        s.tape = over ? { line: sp.li, fx: (r() - 0.5) * 0.6, fy: (r() - 0.5) * 0.3, rot, k, px: 0, py: 0 }
          : { line: sp.li, fx: sp.sx * 0.5, fy: corner ? sp.sy * 0.5 : (r() - 0.5) * 0.2, rot, k, px: -sp.sx * (corner ? 4 : 5) * S, py: corner ? -sp.sy * 4 * S : 0 };   // centred on the edge, a bit inside: always holds the box
        t.stickers.push(s); k++;
      }
    }
    if (['top', 'mobile'].includes(P['titlePos' + ti] || STAGES[ti].pos) && P.logoOn) {
      const s = new Sticker(t.g, logoTex, 81 * S, 42 * S, 1, 0, opts, false); t.logo = s;
      t.stickers.unshift(s);   // goes down first
    }
    place(ti);
    if (ti === cur) t.stickers.forEach((s) => s.enter());
  }
  // corner axes: X (left) and Y (right) read the cursor position live, in px
  let cornerKey = '';
  function buildCorners() {
    const cs = P.cornerSize * P.titleScale / S;   // labelTexture sizes by 20·S → scale to the wanted px size
    const txt = [`${P.cornerL} ${Math.round(mouse.x)}`, `${Math.round(mouse.y)} ${P.cornerR}`];
    const key = txt.join('|') + cs + P.cornerColor + S + P.navOn; if (key === cornerKey) return; cornerKey = key;
    corner.forEach((m) => { if (m) { m.removeFromParent(); m.geometry.dispose(); m.userData.t?.dispose(); m.material.dispose(); } });
    [0, 1].forEach((i) => {
      const { t, w, h } = labelTexture(txt[i], S * cs / 20, '#' + new THREE.Color(P.cornerColor).getHexString());
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false }); m.toneMapped = false; m.colorNode = texture(t).rgb; m.opacityNode = texture(t).a;
      const me = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      const mg = 10 * P.titleScale; me.position.set(i ? W - mg - w / 2 : mg + w / 2, P.navOn ? -H / 2 : -(mg + h / 2), 1); scene.add(me); corner[i] = me; me.userData.t = t;   // with the nav bar (modules.js) in the top corners, the axes sit at mid-height
    });
  }
  function rebuildAll() { if (!fontOK && !fontFailed) return; titles.forEach((_, i) => build(i)); cornerKey = ''; buildCorners(); tag.key = ''; }
  function resize() {
    const v = renderer.getSize(new THREE.Vector2()); W = v.x; H = v.y; S = (W / DESIGN_W) * P.titleScale;
    cam.left = 0; cam.right = W; cam.top = 0; cam.bottom = -H; cam.updateProjectionMatrix();
  }
  let lastW = 0, lastH = 0, lastS = 0;

  const api = {
    dirty(k) { if (k && /^title(Pos)?\d+$/.test(k)) { const i = +k.replace(/\D+/g, ''); if (fontOK || fontFailed) build(i); } else rebuildAll(); },
    render(dt, pullS, total, vel, time) {
      resize();
      if (W !== lastW || H !== lastH || S !== lastS) { lastW = W; lastH = H; lastS = S; rebuildAll(); }
      const on = !!P.titlesOn;
      // stage change: the old title peels off, the new one is stuck on
      const st = on ? stageAt(pullS, P) : -1;
      if (st !== cur) {
        if (cur >= 0) titles[cur].stickers.forEach((s) => s.leave());
        cur = st;
        if (cur >= 0) titles[cur].stickers.forEach((s) => s.enter());
      }
      titles.forEach((t) => t.stickers.forEach((s) => s.step(dt)));
      // bare mark top centre (all stages but the one with the boxed mark)
      const boxed = cur >= 0 && titles[cur].logo;
      bareA.v += ((on && P.logoOn && !boxed ? 1 : 0) - bareA.v) * (1 - Math.exp(-dt * 6));
      bare.visible = bareA.v > 0.01; bareU.value = bareA.v;
      bare.scale.set(81 * S, 42 * S, 1); bare.position.set(W / 2, -(17 * S + 21 * S - 7 * S), 2);
      if (fontOK || fontFailed) buildCorners();
      corner.forEach((m) => m && (m.visible = on && P.cornersOn !== 0));   // cornersOn: 0 hides the X / Y axes (the 404 page)
      // flying dust
      dust.mesh.visible = !!P.fdOn;
      if (P.fdOn) dust.step(Math.min(dt, 0.05), time, W, H, vel, mouse, { count: P.fdCount, size: P.fdSize, sizeVar: P.fdSizeVar, opacity: P.fdOpacity, soft: P.fdSoft, speed: P.fdSpeed, turb: P.fdTurb, scale: P.fdScale, windX: P.fdWindX, windY: P.fdWindY, scroll: P.fdScroll, repel: P.fdRepel, radius: P.fdRadius });
      // cursor label
      tag.g.visible = !!P.tagOn;
      if (P.tagOn) {
        tag.build({ text: !SND.enabled && P.tagSoundText ? P.tagSoundText : P.tagText, size: P.tagSize, pad: P.tagPad, fg: P.tagFg, bg: P.tagBg, radius: P.tagRadius }, fontOK);
        tag.step(Math.min(dt, 0.05), mouse, { offX: P.tagOffX, offY: P.tagOffY, stiff: P.tagStiff, damp: P.tagDamp, swing: P.tagSwing, maxTilt: P.tagMaxTilt, rStiff: P.tagRStiff, rDamp: P.tagRDamp, idleHide: P.tagIdle, press: P.tagPress });
      }
      renderer.domElement.style.cursor = hoverBadge ? 'pointer' : P.tagOn && P.tagHideCursor ? 'none' : '';
      // the can
      can.g.visible = !!P.canOn;
      if (P.canOn) {
        const k = P.canSize * 1.15;   // brain width ≈ canSize px
        can.g.scale.setScalar(k);
        const m = P.canMargin;
        can.g.position.set(W - m - 0.5 * k, -H + m + 0.06 * k, 0);
        const target = THREE.MathUtils.clamp(pullS / Math.max(0.001, total), 0, 1);
        // scroll acceleration → sideways shove on the liquid
        const acc = THREE.MathUtils.clamp((vel - lastVel) / Math.max(dt, 1e-3), -40, 40); lastVel = vel;
        accS += (acc - accS) * (1 - Math.exp(-dt * 20));
        can.step(Math.min(dt, 0.05), 0.015 + target * 0.97, accS, accS * 0.45, { pour: P.liqPour, wave: P.liqWave, damp: P.liqDamp, slosh: P.liqSlosh, splash: P.liqSplash, bump: P.liqBump, maxH: P.liqMaxH });
        can.ow.value = (P.canLine || 1.4) / k;   // line width in px → local units
      }
      // sound badge
      badge.visible = !!P.sndOn;
      if (P.sndOn) {
        const dpr = Math.min(2, devicePixelRatio || 1), bw = Math.round(P.sndW), bh = Math.round(P.sndH);
        if (bc.width !== bw * dpr || bc.height !== bh * dpr) { bc.width = bw * dpr; bc.height = bh * dpr; btex.dispose(); }
        bg2.setTransform(dpr, 0, 0, dpr, 0, 0);
        const playing = SND.enabled && !SND.muted && P.musicOn;
        drawBadge(bg2, bw, bh, P.sndStyle, playing, playing ? musicWave() : null, musicLevel(), time, dt, P.sndColor, FONT);
        btex.needsUpdate = true;
        // centre exactly over the carton's drawn outline (its screen bounding box), P.sndGap px above its top
        let cx = W - P.canMargin - bw / 2, top = H - P.canMargin - bh;
        if (P.canOn) { can.g.updateMatrixWorld(true); _cb.makeEmpty(); for (const q of can.pts) _cb.expandByPoint(_cv.copy(q).applyMatrix4(can.g.matrixWorld)); cx = (_cb.min.x + _cb.max.x) / 2; top = -_cb.max.y - P.sndGap - bh; }
        badge.scale.set(bw, bh, 1); badge.position.set(cx, -(top + bh / 2), 60);
        Object.assign(bRect, { x: cx - bw / 2, y: top, w: bw, h: bh });
      }
      if (!on && !P.canOn && !P.fdOn && !P.tagOn && !P.sndOn) return;
      // draw straight onto the finished frame: no tone mapping / colour conversion, otherwise three renders into its
      // own intermediate buffer and copies THAT over the canvas (the scene vanished, old stickers ghosted)
      const ac = renderer.autoClear, tm = renderer.toneMapping, cs = renderer.outputColorSpace;
      renderer.autoClear = false; renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.setRenderTarget(api.target || null);   // (the loader draws its title into a target first)
      renderer.clearDepth();
      // the cursor trail's negative also covers the UI (wrap each material's colour once; re-wrap if it was swapped)
      scene.traverse((o) => { const m = o.material; if (!m || !m.isNodeMaterial || !m.colorNode) return;
        if (m.colorNode !== m.userData.invWrapped) { m.userData.invWrapped = overlayInvert(m.colorNode); m.colorNode = m.userData.invWrapped; m.needsUpdate = true; } });
      renderer.render(scene, cam); api.dbg = { W, H, S, cur, n: (api.dbg?.n || 0) + 1 };
      renderer.autoClear = ac; renderer.toneMapping = tm; renderer.outputColorSpace = cs;
    },
  };
  api.scene = scene; api.cam = cam;
  C.set = () => { raw(C.ink.value, P.titleBox); raw(C.paper.value, P.canPaper); };
  api.colors = () => { C.set(); rebuildAll(); };
  C.set();
  return api;
}
