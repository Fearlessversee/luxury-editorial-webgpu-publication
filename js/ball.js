import { PAL } from './palette.js';
import { PT } from './painterly.js';
import { LINE } from './lines.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeInk, RU } from './room.js';
import { buildChurch } from './church.js';
import { screenFX, HU } from './screenfx.js';
import { cursorUV, cursorColor, winFlip } from './cursorfx.js';
import { buildTown } from './town.js';
import { signPattern, dumpster, tyres, treadPattern } from './props.js';
import { buildCity } from './city.js';
import {
  Fn, uniform, texture, vec2, vec3, vec4, float, mix, smoothstep, normalView, positionViewDirection, refract, reflect,
  lights, max, dot, pow, screenUV, perspectiveDepthToViewZ, mrt, output, step, mx_noise_float, positionLocal, normalWorld, pass, uv, hash, floor, Loop, If, renderOutput, length, clamp, abs,
} from 'three';

// The fortune-teller's crystal ball: two clawed hands on a pedestal (built procedurally), holding a glass
// sphere. The first scene is rendered to a texture and seen *through* the sphere: a ray-traced ball lens
// (two refractions through a sphere of index n) decides which pixel of scene 1 each point of the ball shows,
// so the image inverts and bulges exactly like a real crystal ball as you pull away.
export const BU = {
  lensMix: uniform(0), ior: uniform(1.5), zoom: uniform(1), aspect: uniform(1), rim: uniform(0.6), spec: uniform(1.2),
  tint: uniform(new THREE.Color('#ffffff')), clay: uniform(new THREE.Color('#bdbab2')), zoomBlur: uniform(0),
  grain: uniform(0.07), res: uniform(new THREE.Vector2(1, 1)), seed: uniform(0), vignette: uniform(0.35),
  tableWidth: 7, inkMode: uniform(0), ink: uniform(new THREE.Color('#141312')), inkGamma: uniform(1), bg: uniform(new THREE.Color('#1a1a1c')),
  lightDir: uniform(new THREE.Vector3(-0.5, 0.7, 0.6).normalize()),
  lineAmt: uniform(0.75), lineFade: uniform(1), lineW: uniform(1), lineThr: uniform(0.004),
  diss: uniform(0), dissScale: uniform(3.5), dissEdge: uniform(new THREE.Color('#141312')),
  hazeNear: uniform(30), hazeFar: uniform(170), hazeAmt: uniform(0.45), thrK: uniform(0.25), farCut: uniform(1e9),
  busyAmt: uniform(0.9),   // lines thin out where they crowd (distant fences, branches) instead of merging into grey
  fills: uniform(0),       // 0 = every surface is plain paper (line drawing only); 1 = the authored dark fills
};

// ---------------------------------------------------------------- geometry helpers
function taperTube(points, r0, r1, { seg = 40, rad = 12, sharp = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, p = curve.getPointAt(t);
    let r = r0 + (r1 - r0) * t;
    if (sharp) r *= Math.pow(1 - t, 0.9) * 0.97 + 0.03 * (1 - t);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2, n = fr.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const onSphere = (R, th, ph) => new THREE.Vector3(R * Math.sin(th) * Math.cos(ph), R * Math.cos(th), R * Math.sin(th) * Math.sin(ph));
function ringAt(p, dir, rMajor, rMinor) {
  const g = new THREE.TorusGeometry(rMajor, rMinor, 8, 20);
  g.lookAt(dir); g.translate(p.x, p.y, p.z); return g;
}
function beads(center, axisY, R, n, r) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const g = new THREE.SphereGeometry(r, 8, 6); g.translate(center.x + Math.cos(a) * R, axisY, center.z + Math.sin(a) * R); out.push(g); }
  return out;
}
const clean = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); if (!n.attributes.normal) n.computeVertexNormals(); return n; };

function buildHands() {
  const parts = [];
  // pedestal
  const prof = [[0, -3.75], [1.38, -3.75], [1.45, -3.62], [1.38, -3.48], [1.3, -3.4], [1.26, -3.2], [1.12, -3.05], [1.02, -2.9], [0.98, -2.72], [0.86, -2.62], [0, -2.62]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  parts.push(new THREE.LatheGeometry(prof, 64));
  parts.push(...beads(new THREE.Vector3(), -2.8, 1.0, 44, 0.045), ...beads(new THREE.Vector3(), -3.5, 1.36, 60, 0.05));
  // little skull-ish bosses round the base
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const g = new THREE.SphereGeometry(0.13, 12, 10); g.scale(1, 1.15, 0.7); g.translate(Math.cos(a) * 1.28, -3.28, Math.sin(a) * 1.28); parts.push(g); }
  for (const s of [-1, 1]) {
    // forearm / wrist, with bangles
    const arm = [new THREE.Vector3(0.28 * s, -2.66, 0), new THREE.Vector3(0.36 * s, -2.1, 0.06), new THREE.Vector3(0.5 * s, -1.55, 0.05), new THREE.Vector3(0.62 * s, -1.12, 0.02)];
    parts.push(taperTube(arm, 0.3, 0.33, { seg: 30, rad: 16 }));
    const ac = new THREE.CatmullRomCurve3(arm);
    [0.18, 0.3, 0.42, 0.55].forEach((t, k) => { const p = ac.getPointAt(t), d = ac.getTangentAt(t); parts.push(ringAt(p, d, 0.34 + (k % 2) * 0.01, k === 1 ? 0.05 : 0.032)); });
    // palm cupping the underside
    const palm = new THREE.SphereGeometry(1, 20, 16); palm.scale(0.5, 0.3, 0.6); palm.rotateZ(-0.75 * s); palm.translate(0.62 * s, -0.95, 0.02); parts.push(palm);
    // fingers wrap up the sphere; long pointed nails continue the curve
    const R = 1.07;
    const fingers = [
      { ph: 0.62, th0: 2.3, th1: 0.95, r: 0.085 }, { ph: 0.28, th0: 2.35, th1: 0.72, r: 0.09 },
      { ph: -0.08, th0: 2.35, th1: 0.7, r: 0.09 }, { ph: -0.42, th0: 2.3, th1: 0.85, r: 0.082 },
      { ph: 1.05, th0: 2.5, th1: 1.5, r: 0.1, thumb: true },
    ];
    for (const f of fingers) {
      const phi = s < 0 ? Math.PI - f.ph * 1 : f.ph;                      // mirror around the YZ plane
      const pts = [];
      for (let i = 0; i <= 6; i++) { const th = f.th0 + (f.th1 - f.th0) * (i / 6); pts.push(onSphere(R + f.r * 0.6 + (i === 0 ? 0.08 : 0), th, phi)); }
      parts.push(taperTube(pts, f.r * 1.15, f.r * 0.85, { seg: 36, rad: 10 }));
      const fc = new THREE.CatmullRomCurve3(pts);
      for (const t of [0.35, 0.68]) { const k = new THREE.SphereGeometry(f.r * 1.08, 10, 8); const p = fc.getPointAt(t); k.translate(p.x, p.y, p.z); parts.push(k); }
      if (!f.thumb || true) { const t = f.thumb ? 0.55 : 0.5; const p = fc.getPointAt(t), d = fc.getTangentAt(t); parts.push(ringAt(p, d, f.r * 1.3, f.r * 0.38)); }
      // nail / claw
      const nail = [];
      for (let i = 0; i <= 5; i++) { const th = f.th1 - (f.thumb ? 0.3 : 0.55) * (i / 5); nail.push(onSphere(R + f.r * 0.6 - 0.04 * (i / 5), th, phi + (f.thumb ? 0 : 0.03 * s * i))); }
      parts.push(taperTube(nail, f.r * 0.8, 0.002, { seg: 24, rad: 8, sharp: true }));
    }
  }
  return mergeGeometries(parts.map(clean));
}

// antique stand (after the reference): round carved base on bun feet, glass hourglass stem, four cabriole
// legs with scrolls and acanthus, a cradle bowl with four volute brackets, and a collar + crystal finial on the
// globe. Ball radius 1 at the origin; the base rests at y = −3.75 like the old pedestal.
export function buildStand() {
  const gold = [], glass = [];
  const L = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
  // base: two moulded tiers
  gold.push(L([[0, -3.62], [1.72, -3.62], [1.8, -3.56], [1.8, -3.46], [1.7, -3.42], [1.74, -3.34], [1.62, -3.3], [1.55, -3.24], [1.58, -3.18], [1.42, -3.14], [1.36, -3.08], [0, -3.08]]));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.26; const f = new THREE.SphereGeometry(0.17, 16, 12); f.scale(1, 0.8, 1); f.translate(Math.cos(a) * 1.5, -3.63, Math.sin(a) * 1.5); gold.push(f); }
  // carved rim: leaves round the base, a bead ring above
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const l = new THREE.SphereGeometry(0.1, 10, 8); l.scale(0.7, 1.3, 0.45); l.rotateY(-a + Math.PI / 2); l.translate(Math.cos(a) * 1.8, -3.5, Math.sin(a) * 1.8); gold.push(l); }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const b = new THREE.SphereGeometry(0.035, 8, 6); b.translate(Math.cos(a) * 1.6, -3.29, Math.sin(a) * 1.6); gold.push(b); }
  gold.push(new THREE.TorusGeometry(1.4, 0.04, 8, 96).rotateX(Math.PI / 2).translate(0, -3.09, 0));
  // glass hourglass stem
  glass.push(L([[0, -3.08], [0.62, -3.08], [0.55, -3.0], [0.3, -2.85], [0.13, -2.5], [0.09, -2.0], [0.12, -1.6], [0.26, -1.35], [0.42, -1.22], [0, -1.18]], 48));
  // cabriole legs
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const P = (r, y) => new THREE.Vector3(c * r, y, s * r);
    const pts = [P(1.28, -3.1), P(1.45, -2.85), P(1.52, -2.55), P(1.3, -2.15), P(1.02, -1.75), P(0.98, -1.4), P(1.12, -1.12), P(1.24, -0.98)];
    const curve = new THREE.CatmullRomCurve3(pts);
    gold.push(taperTube(pts, 0.17, 0.13, { seg: 60, rad: 14 }));
    // knee acanthus: a fan of leaves at the outward bulge
    const kn = curve.getPointAt(0.3);
    for (let i = -2; i <= 2; i++) { const l = new THREE.SphereGeometry(0.12, 10, 8); l.scale(0.55, 1.5, 0.4); l.rotateZ(i * 0.35); l.rotateY(-a + Math.PI / 2); l.translate(kn.x + c * 0.14, kn.y + 0.12, kn.z + s * 0.14); gold.push(l); }
    // volute scrolls at the top and the foot of each leg
    for (const [t, rr, up] of [[0.97, 0.2, 1], [0.03, 0.14, -1]]) {
      const p0 = curve.getPointAt(t), sp = [];
      for (let i = 0; i <= 28; i++) { const th = (i / 28) * Math.PI * 2.2, r = rr * (1 - i / 36); sp.push(new THREE.Vector3(p0.x + c * (Math.cos(th) * r), p0.y + up * Math.sin(th) * r, p0.z + s * (Math.cos(th) * r))); }
      gold.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 60, 0.045, 6, false));
    }
  }
  // stretcher ring between the legs
  gold.push(new THREE.TorusGeometry(1.08, 0.05, 8, 96).rotateX(Math.PI / 2).translate(0, -1.7, 0));
  // cradle bowl (a shell following the globe) with a moulded rim and gadrooning
  const inner = [], outer = [];
  for (let i = 0; i <= 24; i++) { const y = -1.06 + (0.6 * i) / 24; const ri = Math.sqrt(Math.max(0.0001, 1.045 ** 2 - y * y)); inner.push([ri, y]); outer.push([ri + 0.1 + 0.08 * Math.sin((i / 24) * Math.PI), y]); }
  gold.push(L([[0.2, -1.12], ...outer, [outer[24][0] + 0.12, -0.44], [outer[24][0] + 0.1, -0.38], ...inner.reverse().map(([r, y]) => [r, y])], 72));
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, y = -0.85; const r = Math.sqrt(1.045 ** 2 - y * y) + 0.16; const g = new THREE.SphereGeometry(0.1, 10, 8); g.scale(0.5, 1.6, 0.5); g.translate(Math.cos(a) * r, y, Math.sin(a) * r); gold.push(g); }
  gold.push(new THREE.TorusGeometry(Math.sqrt(1.045 ** 2 - 0.2) + 0.22, 0.05, 8, 96).rotateX(Math.PI / 2).translate(0, -0.44, 0));
  // four volute brackets rising from the bowl (above the legs)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    const P = (r, y) => new THREE.Vector3(c * r, y, s * r);
    const pts = [P(1.12, -0.95), P(1.36, -0.75), P(1.34, -0.35), P(1.3, 0.0), P(1.42, 0.22), P(1.58, 0.28)];
    gold.push(taperTube(pts, 0.1, 0.07, { seg: 40, rad: 10 }));
    const sp = []; for (let i = 0; i <= 30; i++) { const th = (i / 30) * Math.PI * 2.3, r = 0.18 * (1 - i / 40); sp.push(new THREE.Vector3(c * (1.58 + Math.sin(th) * r * 0.2 + Math.cos(th) * r), 0.28 - Math.sin(th) * r - r * 0 + 0.0, s * (1.58 + Math.cos(th) * r))); }
    gold.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 60, 0.05, 6, false));
    for (let i = -1; i <= 1; i++) { const l = new THREE.SphereGeometry(0.1, 10, 8); l.scale(0.5, 1.6, 0.35); l.rotateZ(i * 0.4); l.rotateY(-a + Math.PI / 2); l.translate(c * 1.42, -0.5 + Math.abs(i) * 0.05, s * 1.42); gold.push(l); }
  }
  // collar + crystal finial on top of the globe
  gold.push(L([[0, 0.93], [0.37, 0.93], [0.4, 0.97], [0.33, 1.02], [0.22, 1.06], [0.26, 1.12], [0.14, 1.17], [0.1, 1.24], [0, 1.24]], 48));
  const up = new THREE.ConeGeometry(0.17, 0.34, 8); up.translate(0, 1.24 + 0.14 + 0.17, 0);
  const dn = new THREE.ConeGeometry(0.17, 0.14, 8); dn.rotateX(Math.PI); dn.translate(0, 1.24 + 0.07, 0);
  glass.push(up, dn);
  return { gold: mergeGeometries(gold.map(clean)), glass: mergeGeometries(glass.map(clean)) };
}

// ---------------------------------------------------------------- scene
export function makeBallScene(innerTex, { crowGeo = null } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e4d6');
  const cam = new THREE.PerspectiveCamera(30, 1, 0.02, 200);

  const handsMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 });
  // 'ink' mode (negative look): the hands are drawn in the same paper/ink palette as scene 1 — paper colour
  // sampled from scene 1 itself, shading pulled towards the ink colour, so both scenes read as one print
  // sky row of scene 1 (texture orientation differs between backends → take the lighter of the top/bottom rows)
  const row = (y) => texture(innerTex, vec2(0.5, y)).rgb.add(texture(innerTex, vec2(0.15, y)).rgb).add(texture(innerTex, vec2(0.85, y)).rgb).div(3);
  const paper = mix(max(row(0.985), row(0.015)), vec3(PAL.sky), PAL.mode);   // palette: the sky / paper takes the lightest colour
  scene.backgroundNode = mix(vec3(BU.bg), paper.pow(2.2), BU.inkMode);
  const shade = Fn(() => {
    const n = normalWorld.normalize();
    const lam = max(dot(n, BU.lightDir), 0);
    const hemi = n.y.mul(0.5).add(0.5);
    const rim = float(1).sub(max(dot(normalView, positionViewDirection), 0)).pow(2);
    return lam.mul(0.55).add(hemi.mul(0.35)).add(0.18).sub(rim.mul(0.25)).clamp(0, 1);
  })();
  const inkCol = mix(BU.ink, paper, smoothstep(0.05, 0.95, shade).pow(BU.inkGamma).mul(0.85).add(0.15)).pow(2.2);
  handsMat.colorNode = mix(BU.clay, vec3(0), BU.inkMode);
  handsMat.emissiveNode = paper.pow(2.2).mul(BU.inkMode);   // negative look: paper fill like the rest of scene 2 — the outline pass draws it
  const hands = new THREE.Mesh(buildHands(), handsMat); hands.userData.sfx = 'stone';
  hands.castShadow = hands.receiveShadow = true;
  const device = new THREE.Group(); scene.add(device);   // hands + ball, scaled together
  device.add(hands);
  // antique stand (replaces the hands by default)
  const standGeo = buildStand();
  const standMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.6 });
  standMat.colorNode = mix(vec3(0.62, 0.47, 0.24), vec3(0), BU.inkMode); standMat.emissiveNode = paper.pow(2.2).mul(BU.inkMode);
  standMat.metalnessNode = float(0.6).mul(float(1).sub(BU.inkMode));
  const stemMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0 });   // opaque: lines behind must not show through
  stemMat.colorNode = mix(vec3(0.55, 0.7, 0.85), vec3(0), BU.inkMode); stemMat.emissiveNode = paper.pow(2.2).mul(BU.inkMode);
  const stand = new THREE.Group(); stand.userData.sfx = 'metal';
  stand.add(new THREE.Mesh(standGeo.gold, standMat), new THREE.Mesh(standGeo.glass, stemMat));
  stand.children.forEach((m) => { m.castShadow = m.receiveShadow = true; });
  device.add(stand);
  // dissolve-in (noise in object space; a thin ink rim runs along the burning edge)
  { const n = mx_noise_float(positionLocal.mul(BU.dissScale)).mul(0.5).add(0.5);
    const rim = smoothstep(BU.diss.add(0.05), BU.diss, n).mul(step(0.0001, BU.diss));
    for (const m of [standMat, stemMat, handsMat]) {
      m.opacityNode = step(BU.diss, n); m.alphaTest = 0.5;
      m.emissiveNode = mix(m.emissiveNode, vec3(BU.dissEdge).pow(2.2), rim);
    } }
  const hero = mrt({ id: vec4(0, 1, 1, 1) });   // z = 1: takes the palette accent
  { // colour mode: the fortune-teller's stand + hands are the accent (small hot spot, like the fire in the refs)
    const toon = mix(float(0.72), float(1), smoothstep(0.28, 0.36, dot(normalWorld, BU.lightDir).max(0).add(normalWorld.y.mul(0.125).add(0.125))));
    for (const m of [standMat, stemMat, handsMat]) m.emissiveNode = mix(m.emissiveNode, mix(vec3(PAL.cat.hero.side), vec3(PAL.cat.hero.lit), toon.sub(0.72).div(0.28)).pow(2.2), PAL.mode);
  }   // the glass + its holder keep full-strength outlines
  for (const m of [standMat, stemMat, handsMat]) m.mrtNode = hero;

  // glass ball: every fragment traces its view ray through the sphere (entry + exit refraction) and looks up
  // scene 1 in the exit direction — a true ball lens, inverted and fish-eyed, not a fake warp
  const ballMat = new THREE.MeshBasicNodeMaterial();
  ballMat.colorNode = Fn(() => {
    const V = positionViewDirection.normalize();          // surface → eye
    const N = normalView.normalize();
    const eta = float(1).div(BU.ior);
    const d1 = refract(V.negate(), N, eta);               // into the glass
    // exit point on the far side of a unit sphere: chord length = −2·(d1·N)
    const chord = dot(d1, N).mul(-2);
    const Nout = N.add(d1.mul(chord)).normalize();        // outward normal at the exit point
    const d2 = refract(d1, Nout.negate(), BU.ior);        // back out into air
    const dir = d2.normalize();
    const lensUV = vec2(0.5).add(dir.xy.div(dir.z.negate().max(0.2)).mul(vec2(float(0.5).div(BU.aspect), 0.5)).mul(BU.zoom));
    const suv = vec2(screenUV.x, screenUV.y);
    const u = mix(suv, lensUV, BU.lensMix);
    const img = texture(innerTex, u).rgb.pow(2.2).mul(BU.tint);
    const ndv = max(dot(N, V), 0);
    const fres = float(1).sub(ndv).pow(3);
    const R = reflect(V.negate(), N);
    const spec = max(dot(R, BU.lightDir), 0).pow(90);
    const c = img.mul(mix(float(1), float(1).sub(fres.mul(0.55)), BU.lensMix))       // edges darken (internal reflection)
      .add(vec3(1).mul(fres.mul(BU.rim).mul(0.6).add(spec.mul(BU.spec))).mul(BU.lensMix));
    return vec4(c, 1);
  })();
  ballMat.mrtNode = mrt({ id: vec4(0, 1, 0, 1) });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), ballMat); ball.userData.sfx = 'glass';
  device.add(ball);

  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 5, 6); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -4.5, near: 1, far: 20 }); key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  const fill = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.1);
  scene.add(key, fill);

  // ---- the table the ball stands on (loaded async; sized so the pedestal sits on its top)
  const table = new THREE.Group(); scene.add(table);
  const tableMatFor = (map) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    map.colorSpace = THREE.SRGBColorSpace;
    const tex = texture(map);
    m.colorNode = mix(tex.rgb, vec3(0), BU.inkMode);
    // ink mode: wood grain luminance × shading → same paper/ink palette as scene 1
    const n = normalWorld.normalize();
    const sh = max(dot(n, BU.lightDir), 0).mul(0.5).add(n.y.mul(0.5).add(0.5).mul(0.35)).add(0.2).clamp(0, 1);
    // like the branches in scene 1, dark wood prints light (negative), shading adds the ink
    const l = float(1).sub(dot(tex.rgb, vec3(0.299, 0.587, 0.114)).mul(1.6).clamp(0, 1)).mul(sh);
    m.emissiveNode = mix(BU.ink, paper, smoothstep(0.02, 0.9, l).pow(BU.inkGamma).mul(0.9).add(0.1)).pow(2.2).mul(BU.inkMode);
    return m;
  };
  new GLTFLoader().loadAsync('./assets/table.glb').then((g) => {
    const root = g.scene;
    root.traverse((o) => { if (o.isMesh) { o.material = tableMatFor(o.material.map); o.castShadow = o.receiveShadow = true; } });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const s = BU.tableWidth / Math.max(size.x, size.z);
    root.scale.setScalar(s); root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root), c = b2.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -b2.max.y, -c.z);                  // origin of `table` = centre of the tabletop
    table.add(root);
    tableDims = { w: b2.max.x - b2.min.x, d: b2.max.z - b2.min.z, h: b2.max.y - b2.min.y };
  }).catch((e) => console.warn('table.glb', e));

  // sizes: the device's pedestal (y = −3.75 at scale 1) always rests on the tabletop
  // ---- the fortune-teller's room around the table
  // palette sun: one directional light per scene (ball/church/street here, the city has its own); only the ink
  // materials listen to it. Hard-ish shadows, following the camera (main.js places it every frame).
  const mkSun = (sc) => { const s = new THREE.DirectionalLight(0xffffff, 1); s.castShadow = false; s.shadow.mapSize.set(2048, 2048); s.shadow.bias = -0.0008; s.shadow.normalBias = 0.02; sc.add(s, s.target); return s; };
  const sun = mkSun(scene), sunLights = lights([sun]);
  const inkCtx = { BU, paper, lights: () => sunLights };
  const inkMat = makeInk(inkCtx);
  // keyhole portal: the tunnel walls inside the lock, and the far opening showing the next scene (for now
  // scene 1 itself, screen-aligned, so when it fills the frame the hand-off is 1:1)
  const wallMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  wallMat.colorNode = mix(vec3(0.07, 0.06, 0.05), vec3(BU.ink).pow(2.2).mul(float(0.6).add(max(dot(normalView, positionViewDirection), 0).mul(0.8))), BU.inkMode);
  const viewMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  viewMat.colorNode = texture(innerTex, vec2(screenUV.x, screenUV.y)).rgb.pow(2.2);
  viewMat.mrtNode = mrt({ id: vec4(0, 1, 0, 1) });   // no outlines fade on the view through the keyhole
  let tableDims = null, room = null, roomKey = '', roomOn = true;
  const rebuildRoom = () => {
    const ds = device.scale.x, ts = table.scale.x, key = ds.toFixed(3) + '/' + ts.toFixed(3);
    if (key === roomKey && room) return;
    roomKey = key;
    if (room) { scene.remove(room); room.traverse((o) => o.geometry && o.geometry.dispose()); }
    // scene 2 is a church corridor; the ball stands on its stone altar (table size scales the altar)
    const inkC = makeInk({ ...inkCtx, graffiti: true });
    room = buildChurch(inkC, { tableTop: -3.75 * ds, altarW: 6.4 * ts, altarH: 3.6 * ts, altarD: 3.4 * ts, portal: { wallMat, viewMat } });
    { // junk by the end wall: a stickered dumpster (left) and a pile of tyres under the pentagram (right)
      const ew = room.userData.endWall, zE = ew.M.elements[14], F = ew.F, W = ew.W;
      const NI = (l) => mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)));
      const mk = (list, mat, sfx) => { const m = new THREE.Mesh(NI(list), mat); mat.userData.sfx = sfx; return m; };
      const junk = new THREE.Group(); junk.name = 'junk'; room.add(junk); room.userData.junk = junk;
      const d = dumpster(), dg = new THREE.Group();
      dg.add(mk(d.body, inkC({ color: '#3a4a3a', flat: 1 }), 'metal'), mk(d.dark, inkC({ color: '#111', flat: 0.12 }), 'metal'), mk(d.plates, inkC({ color: '#fff', flat: 1, pattern: signPattern() }), 'paper'));
      dg.position.set(-W / 2 + 7.5, F, zE + 6); dg.rotation.y = 0.28; junk.add(dg);
      const ty = tyres(), tg = new THREE.Group();
      tg.add(mk(ty.rubber, inkC({ color: '#222', flat: 1, pattern: treadPattern() }), 'pumpkin'), mk(ty.blocks, inkC({ color: '#999', flat: 1 }), 'stone'));
      tg.position.set(W / 2 - 7, F, zE + 5.5); tg.rotation.y = -0.4; junk.add(tg);
    }
    room.visible = roomOn; room.userData.walls.visible = wallsOn;
    scene.add(room);
  };
  let roomT = null, layoutKey = '';
  let wallsOn = true, clothOn = true;
  // scene 4 (the city) — seen through the portal at the end of the street: its render is shown screen-aligned
  const citySun = new THREE.DirectionalLight(0xffffff, 1); citySun.castShadow = false; citySun.shadow.mapSize.set(4096, 4096); citySun.shadow.bias = -0.0015; citySun.shadow.normalBias = 0.5;
  const cityLights = lights([citySun]);
  inkCtx.lights = () => cityLights; inkCtx.strokeK = 0.035;   // city units are ~30× the street's
  const city = buildCity(inkMat, paper, BU);
  inkCtx.lights = () => sunLights; inkCtx.strokeK = 1;
  city.scene.add(citySun, citySun.target); city.sun = citySun;
  const cityTex = texture(new THREE.Texture(), screenUV);
  const portalMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); portalMat.colorNode = cityTex.rgb.pow(2.2); portalMat.userData.sfx = 'portal';   // the city target is already display-encoded — decode, or the portal glows white (toneMapped stays on: the look was tuned with it)
  portalMat.mrtNode = mrt({ id: vec4(0.5, 1, 0, 1) });
  const inkMatT = makeInk({ ...inkCtx, graffiti: true });   // the street gets the spray-paint projector too (portal)
  const town = buildTown((o = {}) => inkMatT({ lineOnly: true, ...o }), { portalMat }); town.visible = false; scene.add(town);   // scene 3, placed behind the keyhole door each frame
  const setRoomOn = (v) => { roomOn = v; if (room) room.visible = v; };
  const setWallsOn = (v) => { wallsOn = v; if (room) room.userData.walls.visible = v; };
  let wind = 0.6, clothT = 0, swayT = 0, swaySpeed = 1, swayA = 1, chandHold = false;
  const stepCloth = (dt, mx) => {       // breeze + cursor → shader uniforms (smooth, no jitter)
    RU.time.value += dt;
    RU.wind.value += (wind * (1 + Math.abs(mx) * 1.5) - RU.wind.value) * (1 - Math.exp(-dt * 2));
    RU.windDir.value.set(Math.cos(0.4 + mx), Math.sin(0.4 + mx));
    const ch = room && room.userData.chandelier;   // the chandelier sways a little on its chain
    if (ch) {
      // held (the cursor is on its tag): the swing dies out like a pendulum losing energy, a slight settle, then still;
      // let go and it picks the swing back up, slowly
      swayA += ((chandHold ? 0 : 1) - swayA) * (1 - Math.exp(-dt * (chandHold ? 2.2 : 0.45)));
      swayT += dt * swaySpeed * (0.35 + 0.65 * swayA); const t = swayT, A = swayA;
      ch.rotation.z = Math.sin(t * 0.45) * 0.006 * (0.5 + wind) * A; ch.rotation.x = Math.sin(t * 0.31 + 1.3) * 0.004 * (0.5 + wind) * A; ch.rotation.y = Math.sin(t * 0.13) * 0.05 * A;
    }
  };
  const layout = (deviceScale, tableScale, tableTurn) => {
    device.scale.setScalar(deviceScale);
    device.position.y = 0.014;   // rest on the tablecloth (cloth top = tabletop + 0.012)
    table.scale.setScalar(tableScale);
    table.rotation.y = THREE.MathUtils.degToRad(tableTurn);
    table.position.y = -3.75 * deviceScale;
    // layout runs every frame → only (re)schedule the rebuild when the sizes actually change
    // (before, the debounce was reset each frame, so the room stayed built for the old size and the ball floated)
    const k = deviceScale.toFixed(3) + '/' + tableScale.toFixed(3) + '/' + (+tableTurn).toFixed(1);
    if (k !== layoutKey) { layoutKey = k; clearTimeout(roomT); roomT = setTimeout(rebuildRoom, 120); }
  };
  return { sun, scene, cam, hands, stand, ball, key, fill, table, device, layout, setRoomOn, setWallsOn, stepCloth, setWind: (v) => (wind = v), setSwaySpeed: (v) => (swaySpeed = v), getRoom: () => room, setChandHold: (v) => (chandHold = !!v), town, city, cityTex, paper };
}

// light post for the outer scene: zoom motion blur + grain + vignette, no tone curve
export function makeBallPost(renderer, bs) {
  const fxOn = uniform(1);   // 0 when rendering into a texture that another pass shows (no double grain / dither / fluid)
  // own quad (THREE.PostProcessing instances share one module-level quad, so a second one would overwrite scene 1's)
  const quad = new THREE.QuadMesh(new THREE.NodeMaterial());
  // print screen (dither / halftone): the finished frame goes to a target, a second quad redraws it as marks
  const printRT = new THREE.RenderTarget(2, 2, { type: THREE.HalfFloatType });
  const printQuad = new THREE.QuadMesh(new THREE.NodeMaterial());
  printQuad.material.fragmentNode = screenFX(texture(printRT.texture), fxOn);
  const _sz = new THREE.Vector2();
  const post = { fxOn, render: () => {
    const tm = renderer.toneMapping, cs = renderer.outputColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    if (HU.mode.value > 0.5 && fxOn.value > 0.5) {
      renderer.getDrawingBufferSize(_sz);
      if (printRT.width !== _sz.x || printRT.height !== _sz.y) printRT.setSize(_sz.x, _sz.y);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(printRT); quad.render(renderer); renderer.setRenderTarget(prev); printQuad.render(renderer);
    } else quad.render(renderer);
    renderer.toneMapping = tm; renderer.outputColorSpace = cs;
  } };
  const sp = pass(bs.scene, bs.cam);
  sp.setMRT(mrt({ output, id: vec4(0, 0, 0, 0) }));   // church pieces write their id (see makeInk)
  const idT = sp.getTextureNode('id');
  const col = sp.getTextureNode('output');
  const dep = sp.getTextureNode('depth');
  const vz = (u) => perspectiveDepthToViewZ(dep.uv(u).x, float(bs.cam.near), float(bs.cam.far)).negate();
  quad.material.fragmentNode = Fn(() => {
    const uR = uv(), u0 = cursorUV(uR, fxOn);   // cursor effect: the whole frame (lines too) is read through it
    const su = u0;
    const c = vec3(col.uv(su).rgb).toVar();
    If(BU.zoomBlur.greaterThan(0.001), () => {
      const acc = vec3(c).toVar();
      const d = u0.sub(0.5);
      Loop(12, ({ i }) => { acc.addAssign(col.uv(su.sub(d.mul(BU.zoomBlur).mul(float(i).add(1).div(12)))).rgb); });
      c.assign(acc.div(13));
    });
    // outlines go on after the motion blur so they never smear away while scrolling
    // ink outlines (negative look): depth steps (silhouettes, joints between stones) and creases (depth curvature)
    If(BU.inkMode.mul(BU.lineAmt).greaterThan(0.001), () => {
      const px = vec2(LINE.w.mul(0.5).max(0.5)).div(BU.res);   // samples ±w/2 → a line w px wide
      // hand-drawn ink (painterly brief §7): wobble the sampling position by low-frequency screen noise, and
      // break the line with a noise mask; both step with the boiling time
      const wob = vec2(mx_noise_float(vec3(u0.mul(BU.res).mul(LINE.wobScale), PT.boil)), mx_noise_float(vec3(u0.mul(BU.res).mul(LINE.wobScale).add(17.3), PT.boil))).mul(LINE.wobAmp).div(BU.res);
      const uL = u0.add(wob).toVar();
      // work on 1/z: it is linear across any flat surface in screen space, so its 2nd difference is zero on
      // planes (no smears on walls seen at grazing angles) and spikes only at silhouettes, gaps and creases →
      // one even line width everywhere
      const uLl = uL.sub(vec2(px.x, 0)), uLr = uL.add(vec2(px.x, 0)), uLd = uL.sub(vec2(0, px.y)), uLu = uL.add(vec2(0, px.y));
      const z = vz(uL).toVar();
      const w = float(1).div(z), wl = float(1).div(vz(uLl)), wr = float(1).div(vz(uLr));
      const wd = float(1).div(vz(uLd)), wu = float(1).div(vz(uLu));
      const lap = max(abs(wl.add(wr).sub(w.mul(2))), abs(wd.add(wu).sub(w.mul(2)))).div(w);
      // far away the depth buffer runs out of precision and a flat road at a grazing angle starts to 'crease' everywhere
      // (a grey grain towards the horizon): the threshold grows with distance, real silhouettes are far above it
      const thrZ = BU.lineThr.mul(float(1).add(z.div(BU.hazeNear).pow(2).mul(BU.thrK)));   // thrK = 0 in the city (its haze distances are huge)
      const eDepth = smoothstep(thrZ, thrZ.mul(2.5), lap);
      // piece ids: a line wherever a stone / plank / book / slab meets the next one, even when flush
      // (each neighbour texel is fetched once: .x = piece id, .y = hero flag)
      const i0 = idT.uv(uL).toVar(), il = idT.uv(uLl).toVar(), ir = idT.uv(uLr).toVar(), id_ = idT.uv(uLd).toVar(), iu = idT.uv(uLu).toVar();
      const dId = max(max(abs(il.x.sub(i0.x)), abs(ir.x.sub(i0.x))), max(abs(id_.x.sub(i0.x)), abs(iu.x.sub(i0.x))));
      const e = eDepth.max(step(0.002, dId)).toVar();
      // everything below only matters on a line pixel: most of the frame is paper, so it is skipped there
      If(e.greaterThan(0.001), () => {
        const breakM = mix(float(1), smoothstep(0.25, 0.55, mx_noise_float(vec3(u0.mul(BU.res).mul(0.012), PT.boil.add(5))).mul(0.5).add(0.5)), LINE.breakAmt);
        // crowding: count id changes around a ring of 8 samples ~3 line widths out; 2 = one line passes by,
        // 5+ = three or more lines within a few pixels → the area would read as a grey smudge, so fade them
        const rb = LINE.w.mul(2.5).max(3).div(BU.res);
        const ids = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => idT.uv(uL.add(rb.mul(vec2(Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4))))).level(0).x.toVar());   // explicit mip level: sampling inside a per-pixel branch
        let busy = float(0); for (let i = 0; i < 8; i++) busy = busy.add(step(0.002, abs(ids[i].sub(ids[(i + 1) % 8]))));
        const crowd = float(1).sub(smoothstep(3.5, 6.5, busy).mul(BU.busyAmt));
        // walking back down the corridor the church lines fade to 30 %; the glass + stand (id.y = 1) stay full
        const heroN = max(max(i0.y, max(il.y, ir.y)), max(id_.y, iu.y));
        const lineK = mix(BU.lineFade, float(1), heroN.clamp(0, 1));
        // soft grey pen lines like the bushes in scene 1 (not solid black); they fade into the haze with distance
        const fade = float(1).sub(smoothstep(BU.hazeNear, BU.hazeFar, z).mul(BU.hazeAmt).mul(0.5)).mul(float(1).sub(smoothstep(BU.farCut, BU.farCut.mul(1.6), z)));   // farCut: past it no lines at all (the city's far sea)
        c.assign(mix(c, mix(vec3(BU.ink), vec3(PAL.line), PAL.mode).pow(2.2), e.mul(BU.lineAmt).mul(fade).mul(lineK).mul(mix(float(1), PAL.lineK, PAL.mode)).mul(breakM).mul(crowd)));   // palette: thin maroon, low opacity
      });
    });
    let o = renderOutput(vec4(c, 1), THREE.NoToneMapping, THREE.SRGBColorSpace).rgb.toVar();
    const px = floor(u0.mul(BU.res).div(1.3));
    o.addAssign(hash(px.x.add(px.y.mul(1571.3)).add(BU.seed)).sub(0.5).mul(BU.grain).mul(fxOn));
    const r = length(u0.sub(0.5).mul(vec2(BU.aspect, 1)));
    o.mulAssign(float(1).sub(BU.vignette.mul(smoothstep(0.35, 1.1, r)).mul(fxOn)));
    o.assign(cursorColor(o.clamp(0, 1), uR, uR.mul(BU.res), fxOn.mul(float(1).sub(step(0.5, idT.uv(uR).z)))));   // click stickers stay on top of the cursor effect
    o.assign(winFlip(o.clamp(0, 1), fxOn));   // the win: light ↔ dark (once, on the final pass)
    return vec4(o.clamp(0, 1), 1);
  })();
  return post;
}
