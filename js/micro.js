import { PAL } from './palette.js';
import { inkLine, LINE } from './lines.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signGeo, signPattern, placeOn } from './props.js';
import { uniform, mix, modelWorldMatrix, cameraPosition, normalLocal, mrt, vec4, vec3, float, uv, fract, abs, sin, smoothstep, fwidth, hash, instanceIndex, positionLocal, mx_noise_float, step, Fn, length, vec2 } from 'three';

// Beyond the planet: the Earth turns out to be an electron of an atom (paper nucleons, thin orbit rings), and the
// atom in turn sits in the nucleolus of a cut-open cell (membrane bowl, nucleus, mitochondria, ER, golgi, vesicles,
// centrioles, cilia). All in the print style: paper fills, thin ink lines from the post pass (piece ids), no grey.
// Coordinates are local to the planet (Earth centre = origin, camera looks down −y); R = Earth radius.
const rnd = (i, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233 + 1.7) * 43758.5453; return x - Math.floor(x); };

export function buildMicro(inkMat, R, BU) {
  { const ink0 = inkMat; inkMat = (o = {}) => ink0({ strokeK: 3 / R, ...o }); }   // brush strokes sized to the atom / cell, not to metres
  let idc = 0;
  // atom → cell hand-over without a cut: the atom sits INSIDE the cell's nucleolus at true scale; as the camera
  // keeps zooming out, the atom dissolves away and the nucleolus dissolves in (noise dissolve, alpha-tested)
  const appear = uniform(0);
  const dissolve = (m, scale, inn) => { const n = smoothstep(-0.32, 0.32, mx_noise_float(positionLocal.mul(scale * 5))); /* noise → ~even spread 0..1, so the dissolve grows steadily instead of popping at 50 % */ m.opacityNode = inn ? step(float(1).sub(appear), n) : step(appear, n); m.alphaTest = 0.5; return m; };
  const piece = (opts = {}) => { const m = inkMat({ color: '#fff', flat: 1, ...opts }); const k = (++idc % 97) / 97 + 0.005; m.mrtNode = mrt({ id: vec4(k, 0, 0, 1) }); return m; };
  // orbit rings: true 1-px lines in ink (a tube would get fat up close and vanish far away)
  // orbit rings: a torus whose tube is inflated every frame to exactly the site line width on screen
  // (tube radius = half the width × distance × one pixel's angle), so a ring reads like any other ink line
  const lineMat = new THREE.MeshBasicNodeMaterial({ depthWrite: false }); lineMat.colorNode = mix(vec3(BU.ink), vec3(PAL.line), PAL.mode).pow(2.2); lineMat.mrtNode = mrt({ id: vec4(0) });
  lineMat.positionNode = Fn(() => {
    const wp = modelWorldMatrix.mul(vec4(positionLocal, 1)).xyz;
    const r = LINE.w.mul(0.5).mul(LINE.pxAng).mul(length(cameraPosition.sub(wp)));
    return positionLocal.add(normalLocal.mul(r.mul(float(1).sub(smoothstep(0.1, 0.55, appear))).sub(1)));   // the torus is built with a 1-unit tube; the rings thin away as the cell comes in (no pop)
  })();
  // stipple: ink dots on paper (for protons, the nucleolus)
  const dots = (sx, sy, r = 0.22) => Fn(() => { const q = uv().mul(vec2(sx, sy)), d = length(fract(q).sub(0.5)), w = fwidth(d).max(1e-4); return float(1).sub(float(1).sub(smoothstep(float(r).sub(w), float(r).add(w), d)).mul(0.9).mul(float(1).sub(smoothstep(0.2, 0.45, fwidth(q.x))))); })();
  // wavy ink stripes (mitochondria cristae, centriole ribs)
  const waves = (n, amp, freq) => Fn(() => { const q = uv().x.mul(n).add(sin(uv().y.mul(freq)).mul(amp)); return float(1).sub(inkLine(fract(q.add(0.5)).sub(0.5)).mul(0.9).mul(float(1).sub(smoothstep(0.15, 0.4, fwidth(q))))); })();   // stripes fade before they clog into black

  // ---------------------------------------------------------------- atom
  const atom = new THREE.Group();
  const Ro = 30 * R;                       // the Earth's own orbit (horizontal, through its centre)
  const N = new THREE.Vector3(Ro, 0, 0);   // nucleus centre
  const rn = 2.6 * R;
  const fib = (n, rad, off) => { const out = []; for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996 + off; out.push(new THREE.Vector3(Math.cos(a) * r * rad, y * rad, Math.sin(a) * r * rad)); } return out; };
  const nuc = [...fib(26, 5.0 * R, 0), ...fib(12, 2.6 * R, 1.3), N.clone().sub(N)];
  const prot = [], neut = [], m4 = new THREE.Matrix4(), s = new THREE.Vector3(rn, rn, rn), q0 = new THREE.Quaternion();
  nuc.forEach((p, i) => (i % 2 ? prot : neut).push(m4.clone().compose(p.clone().add(N), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(i, 1) * 6, rnd(i, 2) * 6, 0)), s)));
  const nucGeo = new THREE.SphereGeometry(1, 48, 32);
  const nm = (list, pattern) => { const m = dissolve(inkMat({ color: '#fff', flat: 1, pattern }), 3, false); m.mrtNode = mrt({ id: vec4(fract(float(instanceIndex).mul(0.618034)).mul(0.43).add(list === prot ? 0.05 : 0.52), 0, 0, 1) });   /* golden-ratio spaced ids: no two nucleons share one */ const im = new THREE.InstancedMesh(nucGeo, m, list.length); list.forEach((x, i) => im.setMatrixAt(i, x)); return im; };
  atom.add(nm(prot, dots(28, 14, 0.18)), nm(neut, null));
  // orbits: the Earth's (flat) + three tilted ones, each with an electron
  const orbits = [
    { r: Ro, tilt: new THREE.Euler(0, 0, 0), speed: 0, a0: Math.PI },          // the Earth sits on this one (angle π from the nucleus = origin)
    { r: 27 * R, tilt: new THREE.Euler(1.05, 0.35, 0), speed: 0.11, a0: 0.6 },
    { r: 33 * R, tilt: new THREE.Euler(-0.9, -0.5, 0.4), speed: -0.08, a0: 2.4 },
    { r: 24 * R, tilt: new THREE.Euler(0.4, 1.2, 1.3), speed: 0.14, a0: 4.1 },
  ];
  const electrons = [];
  orbits.forEach((o, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r, 1, 6, 1024).rotateX(Math.PI / 2), lineMat);
    const g = new THREE.Group(); g.position.copy(N); g.rotation.copy(o.tilt); g.add(ring); atom.add(g);
    if (i > 0) { const e = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), dissolve(piece(), 3 / R, false)); g.add(e); electrons.push({ e, o }); }
  });

  // ---------------------------------------------------------------- cell
  const cell = new THREE.Group(); cell.visible = false;
  const Rc = 700 * R, cut = 0.36 * Math.PI, yCut = Rc * Math.cos(cut), rCut = Rc * Math.sin(cut), th = 0.05 * Rc;
  // interior blobs (the cytoplasm pattern of the reference) as thin ink contours
  const blobs = Fn(() => step(0.18, mx_noise_float(positionLocal.div(Rc).mul(5.5))))();
  const inner = inkMat({ color: '#fff', flat: 1, side: THREE.BackSide }); inner.mrtNode = mrt({ id: vec4(blobs.mul(0.3).add(0.6), 0, 0, 1) });
  cell.add(new THREE.Mesh(new THREE.SphereGeometry(Rc, 128, 96, 0, Math.PI * 2, cut, Math.PI - cut), piece()));
  cell.add(new THREE.Mesh(new THREE.SphereGeometry(Rc - th, 128, 96, 0, Math.PI * 2, cut, Math.PI - cut), inner));
  cell.add(new THREE.Mesh(new THREE.RingGeometry(rCut * (Rc - th) / Rc, rCut, 128).rotateX(-Math.PI / 2).translate(0, yCut, 0), piece()));
  // nucleus: a smaller cut bowl with its own rim, the stippled nucleolus inside (where the atom was)
  const Rn = 0.3 * Rc, yN = -0.12 * Rc, cutN = Math.acos(Math.min(0.99, (yCut * 0.2 - yN) / Rn));
  const nucG = new THREE.Group(); nucG.position.set(0, yN, 0); cell.add(nucG);
  nucG.add(new THREE.Mesh(new THREE.SphereGeometry(Rn, 96, 64, 0, Math.PI * 2, cutN, Math.PI - cutN), piece()));
  nucG.add(new THREE.Mesh(new THREE.SphereGeometry(Rn * 0.93, 96, 64, 0, Math.PI * 2, cutN, Math.PI - cutN), piece({ side: THREE.BackSide })));
  nucG.add(new THREE.Mesh(new THREE.RingGeometry(Rn * 0.93 * Math.sin(cutN), Rn * Math.sin(cutN), 96).rotateX(-Math.PI / 2).translate(0, Rn * Math.cos(cutN), 0), piece()));
  const nucleolus = new THREE.Mesh(new THREE.SphereGeometry(Rn * 0.45, 96, 64), dissolve(piece({ pattern: dots(40, 20, 0.2) }), 4 / (Rn * 0.45), true)); nucleolus.position.set(0, -Rn * 0.2, 0); nucG.add(nucleolus);
  cell.position.copy(N).sub(new THREE.Vector3(0, yN - Rn * 0.2, 0));   // the nucleolus is centred exactly on the atom
  const cellUp = -(yN - Rn * 0.2);                                       // cell centre height above the atom
  // organelles on the floor of the bowl (y below the cut), placed around the nucleus
  const floorY = (x, z, lift) => -Math.sqrt(Math.max(0, (Rc - th) ** 2 - x * x - z * z)) + lift;
  const place = (mesh, ang, rad, lift, rotY) => { const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad; mesh.position.set(x, Math.max(floorY(x, z, lift), -Rc * 0.75), z); mesh.rotation.y = rotY; cell.add(mesh); };
  // mitochondria: flattened capsules with wavy cristae
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CapsuleGeometry(0.07 * Rc, 0.14 * Rc, 8, 24).rotateZ(Math.PI / 2).scale(1, 0.55, 1);
    place(new THREE.Mesh(g, piece({ pattern: waves(10, 1.2, 18) })), 0.4 + i * 1.6 + rnd(i, 3) * 0.4, 0.55 * Rc + rnd(i, 4) * 0.12 * Rc, 0.06 * Rc, rnd(i, 5) * 3);
  }
  // ER / golgi: wavy ribbons (extruded meander bands)
  const ribbon = (len, amp, waves_, w, h, seed) => {
    const pts = []; const n = 160; for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector2((t - 0.5) * len, Math.sin(t * waves_ * Math.PI * 2 + seed) * amp)); }
    const sh = new THREE.Shape(); pts.forEach((p, i) => (i ? sh.lineTo(p.x, p.y + w / 2) : sh.moveTo(p.x, p.y + w / 2))); for (let i = pts.length - 1; i >= 0; i--) sh.lineTo(pts[i].x, pts[i].y - w / 2);
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  };
  place(new THREE.Mesh(ribbon(0.5 * Rc, 0.05 * Rc, 4.5, 0.02 * Rc, 0.03 * Rc, 0), piece()), 4.9, 0.55 * Rc, 0.02 * Rc, 0.3);
  place(new THREE.Mesh(ribbon(0.42 * Rc, 0.06 * Rc, 3.5, 0.02 * Rc, 0.03 * Rc, 1), piece()), 2.2, 0.6 * Rc, 0.02 * Rc, -0.6);
  for (let k = 0; k < 4; k++) place(new THREE.Mesh(ribbon(0.26 * Rc * (1 - k * 0.12), 0.012 * Rc, 0.6, 0.016 * Rc, 0.025 * Rc, 2 + k), piece()), 3.6 + k * 0.05, 0.62 * Rc - k * 0.035 * Rc, 0.02 * Rc, 1.1);   // golgi stack
  // vesicles, centrioles
  for (let i = 0; i < 6; i++) place(new THREE.Mesh(new THREE.SphereGeometry((0.03 + rnd(i, 9) * 0.04) * Rc, 40, 28), piece()), i * 1.05 + 0.2, (0.4 + rnd(i, 10) * 0.35) * Rc, 0.06 * Rc, 0);
  for (let i = 0; i < 2; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * Rc, 0.02 * Rc, 0.09 * Rc, 24, 1, true).rotateZ(1.2 - i * 0.7), piece({ pattern: waves(16, 0, 1), side: THREE.DoubleSide })); place(c, 1.3 + i * 0.25, 0.42 * Rc, 0.12 * Rc, i); }
  // cilia on the outside, below the cut
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + rnd(i, 20) * 0.3, pol = cut + 0.25 + rnd(i, 21) * (Math.PI - cut - 0.6);
    const n0 = new THREE.Vector3(Math.sin(pol) * Math.cos(a), Math.cos(pol), Math.sin(pol) * Math.sin(a)), side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const L = (0.18 + rnd(i, 22) * 0.12) * Rc, curve = new THREE.CatmullRomCurve3([0, 0.35, 0.7, 1].map((t) => n0.clone().multiplyScalar(Rc * 0.99 + L * t).addScaledVector(side, Math.sin(t * 3 + i) * 0.06 * Rc * t)));
    cell.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012 * Rc, 8), piece()));
  }
  { // stickers slapped on the membrane (the side the camera sees), like a street lamp post
    const stMat = inkMat({ color: '#fff', flat: 1, pattern: signPattern() }); stMat.mrtNode = mrt({ id: vec4(0.371, 0, 0, 1) }); stMat.userData.sfx = 'paper';
    const st = [];
    ['hello', 'wakeup', 'label', 'stop', 'deadend', 'parking', 'noparking'].forEach((n, i) => {
      const az = Math.PI + (i - 3) * 0.26 + (rnd(i, 71) - 0.5) * 0.1, pol = cut + 0.12 + ((i * 37) % 5) * 0.12;
      const nrm = new THREE.Vector3(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az));
      st.push(placeOn(signGeo(n, (0.1 + rnd(i, 72) * 0.07) * Rc, 0.003 * Rc), nrm.clone().multiplyScalar(Rc), nrm, (rnd(i, 73) - 0.5) * 0.9, 0.006 * Rc));
    });
    cell.add(new THREE.Mesh(mergeGeometries(st.map((g) => (g.index ? g.toNonIndexed() : g))), stMat));
  }
  // the whole cell grows in with the same noise dissolve (no pop when the camera is suddenly inside it): every part
  // that doesn't dissolve already gets one, grain sized to the part
  { const done = new Set(); cell.traverse((o) => { if (!o.isMesh || done.has(o.material) || o.material.opacityNode) return; done.add(o.material);
      o.geometry.computeBoundingSphere(); dissolve(o.material, 3 / Math.max(1e-6, o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z)), true); }); }
  [atom, cell].forEach((g) => g.traverse((o) => (o.frustumCulled = false)));
  atom.userData.sfx = 'atom'; cell.userData.sfx = 'cell';   // click sounds

  const rings = []; atom.traverse((o) => { if (o.isMesh && o.material === lineMat) rings.push(o); });
  const update = (t) => {
    for (const g of rings) g.visible = appear.value < 0.6;
    for (const { e, o } of electrons) { const a = o.a0 + t * o.speed; e.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r); }
  };
  return { atom, cell, update, N, Ro, Rc, appear, cellUp };
}
