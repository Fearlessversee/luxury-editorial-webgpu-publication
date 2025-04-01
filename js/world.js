import * as THREE from 'three';
import { signAtlas, CELLS } from './props.js';
import {
  Fn, uniform, vec2, vec3, vec4, float, mix, smoothstep, normalWorld, positionWorld, cameraPosition, abs, dot, normalize, max,
  reflector, mx_noise_float, uv, sin, fract, fwidth, step, positionLocal, texture,
} from 'three';

// Environment: a still lake in front of the bramble and a ring of low hills around it.
// Both are unlit-by-scene (own simple shading), with distance haze towards the backdrop colour,
// so they read like ink-wash layers in the negative look. Environment grade applies to them.
export const WU = {
  time: uniform(0),
  waterLevel: uniform(-3.4),
  waterColor: uniform(new THREE.Color('#050608')), reflect: uniform(0.75), reflBright: uniform(1.6),
  waveHeight: uniform(0.12), waveLen: uniform(5), windAng: uniform(0.4), reflDistort: uniform(0.03), glintSharp: uniform(60), strokes: uniform(0),
  waves: uniform(0.8), waveColor: uniform(new THREE.Color('#6d737c')), waveFreq: uniform(1.4), waveWidth: uniform(0.08), waveWarp: uniform(3), waveDash: uniform(0.35), waveSpeed: uniform(0.25), glints: uniform(0.4), ripple: uniform(0.35), rippleScale: uniform(1.2), rippleSpeed: uniform(0.3),
  hillColor: uniform(new THREE.Color('#1a1c20')), hillLight: uniform(0.6), lightDir: uniform(new THREE.Vector3(-0.4, 0.8, 0.3).normalize()),
  hazeColor: uniform(new THREE.Color('#010102')), hazeNear: uniform(20), hazeFar: uniform(220),
};

const haze = (c) => mix(c, WU.hazeColor, smoothstep(WU.hazeNear, WU.hazeFar, positionWorld.sub(cameraPosition).length()));

// ---------------------------------------------------------------- hills
function fbm(x, z, seed) {
  // small value-noise fbm on the CPU (geometry is built once)
  const h = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const n = (x, z) => {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  let a = 0, amp = 1, f = 1, norm = 0;
  for (let o = 0; o < 5; o++) { a += n(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return a / norm;
}

export function makeHills({ height = 5, shore = 36, radius = 420, seed = 1 } = {}) {
  const R = 150, A = 256;
  const pos = new Float32Array((R + 1) * (A + 1) * 3);
  let k = 0;
  for (let r = 0; r <= R; r++) {
    const t = r / R, rad = shore * 0.9 + (radius - shore * 0.9) * t * t;   // denser near the shore
    for (let a = 0; a <= A; a++) {
      const th = (a / A) * Math.PI * 2, x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      const rise = THREE.MathUtils.smoothstep(rad, shore, shore * 1.5);                   // shore line → hills
      const ridge = Math.pow(fbm(x * 0.018, z * 0.018, seed), 1.4) * 1.5;                  // rolling, uneven crests
      const y = -4.2 + rise * height * (0.25 + ridge) + fbm(x * 0.1, z * 0.1, seed + 3) * 0.5 * rise;
      pos[k++] = x; pos[k++] = y; pos[k++] = z;
    }
  }
  const idx = [];
  for (let r = 0; r < R; r++) for (let a = 0; a < A; a++) {
    const i0 = r * (A + 1) + a, i1 = i0 + 1, i2 = i0 + A + 1, i3 = i2 + 1;
    idx.push(i0, i2, i1, i1, i2, i3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const l = max(dot(normalize(normalWorld), WU.lightDir), 0);
    const c = WU.hillColor.mul(mix(float(1), l.mul(1.6).add(0.2), WU.hillLight));
    return vec4(haze(c), 1);
  })();
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -1;
  // same formula as the vertices: exact ground height anywhere, without ray-casting 77k triangles (that froze the load)
  mesh.userData.heightAt = (x, z) => {
    const rad = Math.min(radius, Math.hypot(x, z)), rise = THREE.MathUtils.smoothstep(rad, shore, shore * 1.5);
    return -4.2 + rise * height * (0.25 + Math.pow(fbm(x * 0.018, z * 0.018, seed), 1.4) * 1.5) + fbm(x * 0.1, z * 0.1, seed + 3) * 0.5 * rise;
  };
  return mesh;
}

// ---------------------------------------------------------------- water (moving waves + planar reflection)
// Sum of directional sine waves (Gerstner-like): the mesh really moves, and the same function gives
// the surface normal, which drives fresnel, sky/reflection mix, slope shading and sun glints.
const WAVES = [ // [dirAngle, wavelength factor, amplitude factor, speed factor]
  [0.00, 1.00, 1.00, 1.00], [0.55, 0.62, 0.55, 1.25], [-0.45, 0.47, 0.42, 1.45],
  [1.20, 0.33, 0.25, 1.80], [-1.05, 0.26, 0.18, 2.10], [0.25, 0.17, 0.10, 2.60],
];
function waveField(xz) {
  let h = float(0), dx = float(0), dz = float(0);
  for (const [ang, lf, af, sf] of WAVES) {
    const a = WU.windAng.add(ang * 0.6);
    const d = vec2(a.cos(), a.sin());
    const L = WU.waveLen.mul(lf), k = float(Math.PI * 2).div(L), A = WU.waveHeight.mul(af);
    const ph = dot(d, xz).mul(k).add(WU.time.mul(WU.waveSpeed).mul(sf).mul(k.sqrt()).mul(1.6));
    h = h.add(A.mul(ph.sin()));
    const s = A.mul(k).mul(ph.cos());
    dx = dx.add(s.mul(d.x)); dz = dz.add(s.mul(d.y));
  }
  return { h, n: normalize(vec3(dx.negate(), float(1), dz.negate())) };
}

export function makeWater({ radius = 420, resolution = 0.5 } = {}) {
  const refl = reflector({ resolution });
  refl.target.rotateX(-Math.PI / 2);
  // radial grid: dense near the crow, sparse far away
  const R = 220, A = 360, pos = [], idx = [];
  for (let r = 0; r <= R; r++) {
    const t = r / R, rad = radius * t * t;
    for (let a = 0; a <= A; a++) { const th = (a / A) * Math.PI * 2; pos.push(Math.cos(th) * rad, 0, Math.sin(th) * rad); }
  }
  for (let r = 0; r < R; r++) for (let a = 0; a < A; a++) {
    const i0 = r * (A + 1) + a, i1 = i0 + 1, i2 = i0 + A + 1, i3 = i2 + 1;
    idx.push(i0, i1, i2, i1, i3, i2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const m = new THREE.MeshBasicNodeMaterial();
  m.positionNode = Fn(() => {
    const wf = waveField(positionWorld.xz);
    return positionLocal.add(vec3(0, wf.h, 0));
  })();
  const fine = Fn(() => {   // small-scale ripples on top (normal only)
    const p = positionWorld.xz.mul(WU.rippleScale);
    const t = WU.time.mul(WU.rippleSpeed);
    return vec2(mx_noise_float(vec3(p.x, p.y.mul(1.6), t)), mx_noise_float(vec3(p.x.mul(1.3).add(7), p.y.mul(2.1), t.mul(1.3)))).mul(WU.ripple).mul(0.35);
  })();
  const wf = waveField(positionWorld.xz);
  const N = normalize(wf.n.add(vec3(fine.x, 0, fine.y)));
  refl.uvNode = refl.uvNode.add(N.xz.mul(WU.reflDistort));
  m.colorNode = Fn(() => {
    const V = normalize(cameraPosition.sub(positionWorld));
    const ndv = max(dot(N, V), 0);
    const fres = float(1).sub(ndv).pow(4).mul(0.85).add(0.08).mul(WU.reflect);          // Schlick-ish
    const c = mix(WU.waterColor, refl.rgb.mul(WU.reflBright), fres).toVar();
    // slope shading: faces tilted towards the light read lighter, troughs darker — this is what makes it look like water
    const slope = dot(N, WU.lightDir).mul(0.5).add(0.5);
    c.assign(mix(c, mix(c.mul(0.7), WU.waveColor, slope.pow(4).mul(0.8)), WU.waves));
    // sun glints on wave crests
    const R_ = N.mul(dot(N, V).mul(2)).sub(V);
    const spec = max(dot(R_, WU.lightDir), 0).pow(WU.glintSharp);
    const fadeFar = float(1).sub(smoothstep(WU.hazeNear, WU.hazeFar.mul(0.7), positionWorld.sub(cameraPosition).length()));
    c.addAssign(WU.waveColor.mul(spec.mul(WU.glints).mul(3)).mul(fadeFar));
    // optional engraving strokes following the wave crests
    const phase = wf.h.div(WU.waveHeight.max(0.001)).mul(WU.waveFreq).add(positionWorld.z.mul(0.15));
    const aa = fwidth(phase).mul(1.2).max(0.001);
    const line = float(1).sub(smoothstep(WU.waveWidth, WU.waveWidth.add(aa), abs(fract(phase).sub(0.5)).mul(2)));
    c.assign(mix(c, WU.waveColor, line.mul(WU.strokes).mul(fadeFar).mul(float(1).div(aa.mul(2).add(1)))));
    return vec4(haze(c), 1);
  })();
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh, refl.target);
  group.userData.setLevel = (y) => { mesh.position.y = y; refl.target.position.y = y; };
  return group;
}

// ---------------------------------------------------------------- landmarks on the hills: a water tower and a few
// little houses (American small-town skyline), shaded like the hills and faded by the same haze. Each sits on the
// hill surface (raycast), so they follow any hill height / seed.
export const LU2 = { color: uniform(new THREE.Color('#2c3036')), light: uniform(0.7) };
function landMat(tex = null) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const l = max(dot(normalize(normalWorld), WU.lightDir), 0);
    let c = LU2.color.mul(mix(float(1), l.mul(1.5).add(0.25), LU2.light));
    if (tex) { c = mix(c, c.mul(1.6).add(0.35).min(1), tex.g); c = mix(c, c.mul(0.2), tex.r); }   // g: sticker faces (paper), r: painted letters + sticker print (ink)
    return vec4(haze(c), 1);
  })();
  return m;
}
export function makeLandmarks(hills, { tower = [-150, -300], houses = [[200, -330], [280, -280], [360, -170]], text = 'LUCID' } = {}) {
  const group = new THREE.Group(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  hills.updateMatrixWorld(true);
  const side0 = hills.material.side; hills.material.side = THREE.DoubleSide;   // hit the terrain whichever way its faces wind
  const hAt = hills.userData.heightAt, hp0 = hills.position;
  const ground = hAt ? (x, z) => hAt(x - hp0.x, z - hp0.z) + hp0.y : (x, z) => { ray.set(new THREE.Vector3(x, 400, z), down); const h = ray.intersectObject(hills, false)[0]; return h ? h.point.y : -4; };
  // lowest / highest ground under a round footprint (centre + 8 points on the rim): objects stand on the lowest
  // point so no corner hangs in the air; the flattest high spot is picked so little of them is buried
  const foot = (x, z, r) => { let lo = 1e9, hi = -1e9; for (let k = 0; k <= 8; k++) { const a = k * Math.PI / 4, rr = k === 8 ? 0 : r, h = ground(x + Math.cos(a) * rr, z + Math.sin(a) * rr); lo = Math.min(lo, h); hi = Math.max(hi, h); } return { lo, hi }; };
  const M = (list, mat) => { const g = list.length > 1 ? mergeGeo(list) : list[0]; const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = -1; group.add(mesh); return mesh; };
  // water tower: 4 splayed legs with cross bracing, balcony ring, tank with a painted name, conical roof, finial
  { let [x, z] = tower; const S = 1.25;
    // stand it on the skyline seen from the lake: along its direction, the point with the highest elevation angle
    // from the camera — no ridge in front can cut through its legs
    { const a = Math.atan2(z, x); let best = -1e9, br = Math.hypot(x, z); for (let rr = 150; rr <= 415; rr += 3) { const e = Math.atan2(ground(Math.cos(a) * rr, Math.sin(a) * rr) - 3, rr); if (e > best) { best = e; br = rr; } } x = Math.cos(a) * (br + 6); z = Math.sin(a) * (br + 6); }
    const y0 = foot(x, z, 8 * S * 1.2).lo - 0.4, parts = [], Ht = 26 * S, R = 6.5 * S, Tk = 10 * S;
    const leg = (a, b, r) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 6); g.translate(0, d.length() / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); parts.push(g); };
    const V = (px, py, pz) => new THREE.Vector3(px, py, pz);
    const feet = [0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + k * Math.PI / 2; return [Math.cos(a), Math.sin(a)]; });
    feet.forEach(([cx, cz]) => leg(V(cx * R * 1.2, 0, cz * R * 1.2), V(cx * R * 0.8, Ht, cz * R * 0.8), 0.35 * S));
    for (const h of [Ht * 0.33, Ht * 0.66]) feet.forEach(([cx, cz], k) => { const [nx, nz] = feet[(k + 1) % 4], f = 1.2 - 0.4 * h / Ht, f2 = 1.2 - 0.4 * (h + Ht * 0.33) / Ht; leg(V(cx * R * f, h, cz * R * f), V(nx * R * f, h, nz * R * f), 0.15 * S); leg(V(cx * R * f, h, cz * R * f), V(nx * R * f2, Math.min(Ht, h + Ht * 0.33), nz * R * f2), 0.1 * S); });
    parts.push(new THREE.CylinderGeometry(0.4 * S, 0.4 * S, Ht, 8).translate(0, Ht / 2, 0));                                 // riser pipe
    parts.push(new THREE.SphereGeometry(R, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.45, 1).translate(0, Ht + 1.5 * S, 0));   // bowl
    parts.push(new THREE.TorusGeometry(R + 1.1 * S, 0.12 * S, 4, 48).rotateX(Math.PI / 2).translate(0, Ht + 1.6 * S, 0));   // balcony rail
    parts.push(new THREE.CylinderGeometry(R + 1.1 * S, R + 1.1 * S, 0.25 * S, 32).translate(0, Ht + 0.6 * S, 0));   // balcony floor
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; parts.push(new THREE.CylinderGeometry(0.06 * S, 0.06 * S, 1 * S, 4).translate(Math.cos(a) * (R + 1.1 * S), Ht + 1.1 * S, Math.sin(a) * (R + 1.1 * S))); }
    parts.push(new THREE.ConeGeometry(R + 0.6 * S, 4.5 * S, 32).translate(0, Ht + 1.5 * S + Tk + 2.25 * S, 0), new THREE.SphereGeometry(0.5 * S, 8, 6).translate(0, Ht + 1.5 * S + Tk + 4.7 * S, 0));
    for (const sx of [-0.45, 0.45]) parts.push(new THREE.CylinderGeometry(0.07 * S, 0.07 * S, Ht + Tk, 4).translate(R * 0.35 + sx, (Ht + Tk) / 2, R + 0.4 * S));   // ladder rails
    M(parts, landMat()).position.set(x, y0, z);
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 256);
    // stickers slapped round the tank (from the street sign atlas): paper face → green, printed ink → red
    const at = signAtlas().image, COLS = 5, CS = 512, tmp = document.createElement('canvas'); tmp.width = tmp.height = 128; const tg = tmp.getContext('2d');
    const names = ['hello', 'wakeup', 'label', 'stop', 'parking', 'deadend', 'noparking', 'rxr', 'hello', 'wakeup'];
    names.forEach((n, k) => {
      const i = CELLS.indexOf(n), sx = (i % COLS) * CS, sy = ((i / COLS) | 0) * CS, sz = 44 + ((k * 37) % 30);
      tg.clearRect(0, 0, 128, 128); tg.drawImage(at, sx, sy, CS, CS, 0, 0, 128, 128);
      const d = tg.getImageData(0, 0, 128, 128).data, x0 = 60 + k * 97 + ((k * 53) % 40), y0 = k % 2 ? 150 : 16 + ((k * 29) % 30), ang = ((k * 71) % 60 - 30) / 100;
      const out = g.getImageData(0, 0, 1024, 256);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const q = (y * 128 + x) * 4; if (d[q + 3] < 128) continue;
        const u = (x - 64) / 128 * sz, v = (y - 64) / 128 * sz, X = Math.round(x0 + u * Math.cos(ang) - v * Math.sin(ang)), Y = Math.round(y0 + sz / 2 + u * Math.sin(ang) + v * Math.cos(ang));
        if (X < 0 || X >= 1024 || Y < 0 || Y >= 256) continue; const o = (Y * 1024 + X) * 4, ink = d[q] < 128; out.data[o] = ink ? 255 : 0; out.data[o + 1] = ink ? 0 : 255; out.data[o + 2] = 0; }
      g.putImageData(out, 0, 0);
    });
    g.fillStyle = '#f00'; g.font = '900 120px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (const cx of [256, 768]) g.fillText(text, cx, 128);
    // a sprayed tag over it all
    g.strokeStyle = '#f00'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(470, 205); g.bezierCurveTo(520, 170, 560, 230, 610, 190); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 8;
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Tk, 48, 1, true), landMat(texture(tex, uv())));
    tank.position.set(x, y0 + Ht + 1.5 * S + Tk / 2, z); tank.rotation.y = -Math.PI * 0.62; tank.renderOrder = -1; group.add(tank);
    group.add(new THREE.Mesh(new THREE.CircleGeometry(R, 32).rotateX(Math.PI / 2).translate(x, y0 + Ht + 1.5 * S, z), landMat()));
  }
  // little houses up in the hills: a few types (farmhouse with porch, two-storey with dormers, A-frame cabin, barn
  // with a silo), each with windows, door, chimney; windows are separate so they print as ink
  const hp = [], win = [];
  const gable = (w, d, rise, over = 0.5) => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-d / 2 - over, 0), new THREE.Vector2(d / 2 + over, 0), new THREE.Vector2(0, rise)]), { depth: w + over * 2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-w / 2 - over, 0, 0);
  const windows = (w, d, h, y0, cols, parts) => { for (let c = 0; c < cols; c++) { const x = -w / 2 + (c + 0.5) * w / cols; parts.push(new THREE.BoxGeometry(w / cols * 0.38, h * 0.3, 0.2).translate(x, y0, d / 2 + 0.25)); } };
  houses.forEach(([x, z], i) => {
    const r = (k) => { const s2 = Math.sin(i * 91.7 + k * 13.1) * 43758.5; return s2 - Math.floor(s2); };
    { // behind the hills: find the crest along the direction of (x, z), then step past it
      const a = Math.atan2(z, x); let best = -1e9, bx = x, bz = z;
      let bestR = 260; for (let rr = 260; rr <= 410; rr += 6) { const px = Math.cos(a) * rr, pz = Math.sin(a) * rr, h = ground(px, pz); if (h > best) { best = h; bestR = rr; } }
      // just behind the crest: only the roofs peek over the ridge, like buildings far away (the side edges of the
      // frame only — the middle stays empty for the title)
      const rb = bestR + 22; x = Math.cos(a) * rb; z = Math.sin(a) * rb; }
    const y0 = foot(x, z, 11).lo - 0.3, rot = (r(4) - 0.5) * 1.4, type = i % 4, P2 = [], W2 = [];
    if (type === 0) {   // farmhouse + porch
      const w = 7 + r(1) * 3, d = 5.5, h = 3.6;
      P2.push(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), gable(w, d, 2.6).translate(0, h, 0), new THREE.BoxGeometry(0.7, 2.4, 0.7).translate(w * 0.3, h + 1.6, -0.5));
      P2.push(new THREE.BoxGeometry(w * 0.8, 0.2, 1.8).translate(0, 0.3, d / 2 + 0.9), new THREE.BoxGeometry(w * 0.85, 0.15, 2.0).rotateX(-0.25).translate(0, h * 0.85, d / 2 + 0.9));
      for (const px of [-w * 0.38, -w * 0.13, w * 0.13, w * 0.38]) P2.push(new THREE.BoxGeometry(0.15, h * 0.75, 0.15).translate(px, h * 0.45, d / 2 + 1.7));
      windows(w, d, h, h * 0.55, 3, W2); W2.push(new THREE.BoxGeometry(0.9, 1.9, 0.2).translate(0, 0.95, d / 2 + 0.25));
    } else if (type === 1) {   // two storeys with dormers
      const w = 6 + r(1) * 2, d = 6, h = 6;
      P2.push(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), gable(w, d, 3.2).translate(0, h, 0), new THREE.BoxGeometry(0.8, 3, 0.8).translate(-w * 0.35, h + 1.6, 0));
      for (const dx of [-w * 0.22, w * 0.22]) { P2.push(new THREE.BoxGeometry(1.3, 1.3, 1.6).translate(dx, h + 0.9, d / 4), gable(1.3, 1.6, 0.8, 0.1).rotateY(Math.PI / 2).translate(dx, h + 1.55, d / 4)); W2.push(new THREE.BoxGeometry(0.6, 0.7, 0.2).translate(dx, h + 0.9, d / 4 + 1.0)); }
      windows(w, d, h / 2, h * 0.25, 3, W2); windows(w, d, h / 2, h * 0.72, 3, W2);
    } else if (type === 2) {   // A-frame cabin on stilts
      const w = 6, d = 5;
      P2.push(new THREE.BoxGeometry(w + 1, 0.3, d + 1).translate(0, 1.2, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P2.push(new THREE.BoxGeometry(0.3, 1.2, 0.3).translate(sx * w / 2, 0.6, sz * d / 2));
      P2.push(gable(d, w, 5.5, 0.4).rotateY(Math.PI / 2).translate(0, 1.35, 0));
      W2.push(new THREE.CylinderGeometry(0.01, 1.6, 2.6, 3).rotateY(Math.PI / 6).scale(1, 1, 0.08).translate(0, 3.2, d / 2 + 0.45));
    } else {   // barn with a round-top silo
      const w = 8, d = 6, h = 4.2;
      P2.push(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), gable(w, d, 3.2, 0.3).translate(0, h, 0));
      P2.push(new THREE.CylinderGeometry(1.6, 1.6, 9, 16).translate(w / 2 + 2, 4.5, 0), new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(w / 2 + 2, 9, 0));
      W2.push(new THREE.BoxGeometry(2.6, 3.2, 0.2).translate(0, 1.6, d / 2 + 0.25), new THREE.BoxGeometry(1, 1, 0.2).translate(0, h + 1.2, d / 2 + 0.45));
    }
    const S2 = 1.4, m = new THREE.Matrix4().compose(new THREE.Vector3(x, y0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(S2, S2, S2));
    // far away: just the mass — body, roof, silo; no windows, doors, porch posts, dormers or chimneys
    P2.filter((g) => { g.computeBoundingBox(); const b = g.boundingBox, sz = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z); return sz > 3.5; }).forEach((g) => hp.push(g.applyMatrix4(m)));
  });
  hills.material.side = side0;
  if (win.length) { const wm = landMat(); wm.colorNode = Fn(() => vec4(haze(LU2.color.mul(3).add(0.25).min(1)), 1))(); wm.polygonOffset = true; wm.polygonOffsetFactor = -4; wm.polygonOffsetUnits = -4; M(win, wm); }
  if (hp.length) M(hp, landMat());
  return group;
}
function mergeGeo(list) {   // position + normal only (lighting needs just these)
  let n = 0; const arrs = list.map((g) => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); n += g.attributes.position.count; return g; });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of arrs) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return out;
}
