import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  Fn, uniform, texture, attribute, uv, vec3, vec4, float, mix, color, normalView, positionViewDirection,
  positionLocal, positionView, positionGeometry, sign, hue, luminance, sin, cos, fract, abs, smoothstep, step, screenUV, mx_noise_float, clamp, max,
  mrt, vec4 as _v4,
} from 'three';

// Uniforms that drive the crow surface. Everything here is light-independent (emissive)
// or a material property; lights themselves live in main.js and only the crow is lit.
export const CU = {
  time: uniform(0),
  base: uniform(new THREE.Color('#0b0d10')), tint: uniform(new THREE.Color('#ffffff')),
  gradMix: uniform(0.55), gradTint: uniform(new THREE.Color(0.22, 0.91, 1.0)), hueShift: uniform(0), sat: uniform(1), strokes: uniform(0.45),
  rimStr: uniform(0.35), rimPow: uniform(3.2), fresColor: uniform(new THREE.Color('#5fdcff')),
  oil: uniform(0.25), oilScale: uniform(1.6),
  holo: uniform(0), holoDensity: uniform(140), holoSpeed: uniform(0.6),
  dissolve: uniform(0), dissolveScale: uniform(5), dissolveEdge: uniform(new THREE.Color('#ff7a2e')), dissolveGlow: uniform(6),
  pulse: uniform(0), pulseSpeed: uniform(1), flat: uniform(1),
  furBump: uniform(0.005), furScale: uniform(38), furStretch: uniform(6), furDetail: uniform(0.6), strokeBump: uniform(0.001),
  eyeColor: uniform(new THREE.Color('#ffffff')), eyeGlow: uniform(2.2),
};

function spectrum(t) { // cheap rainbow for the oil-slick film
  return vec3(sin(t.mul(6.2832)), sin(t.mul(6.2832).add(2.094)), sin(t.mul(6.2832).add(4.188))).mul(0.5).add(0.5);
}

function makeBodyMaterial(gradTex, strokeTex) {
  const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
  const fres = Fn(() => float(1).sub(abs(normalView.dot(positionViewDirection))).clamp(0, 1))();
  const noiseD = mx_noise_float(positionLocal.mul(CU.dissolveScale)).mul(0.5).add(0.5);

  // faceted look: flat normal computed per-fragment (material.flatShading breaks with skinning in r169)
  // normal = (smooth | faceted) + procedural fur/feather bump (+ optional bump from the stroke texture)
  m.normalNode = Fn(() => {
    const dpdx = positionView.dFdx(), dpdy = positionView.dFdy();
    const flatN = dpdx.cross(dpdy).normalize();
    const N = mix(normalView, flatN, CU.flat).normalize();
    // strands: noise in bind-pose space (doesn't swim when the rig moves), stretched along the
    // feather flow (back & down), plus a finer octave for fuzz
    const p = positionGeometry.mul(CU.furScale);
    const along = p.y.add(p.z.negate()).mul(0.7071);
    const q = vec3(p.x, along.div(CU.furStretch), p.y.add(p.z).mul(0.7071));
    const h1 = mx_noise_float(q);
    const h2 = mx_noise_float(q.mul(vec3(2.7, 2.7, 2.7)).add(13.1)).mul(0.45);
    const strands = h1.add(h2.mul(CU.furDetail));
    const h = strands.mul(CU.furBump).add(texture(strokeTex, uv(1)).r.oneMinus().mul(CU.strokeBump));
    // screen-space bump (Mikkelsen): gradient of h against the surface derivatives
    const dhdx = h.dFdx(), dhdy = h.dFdy();
    const r1 = dpdy.cross(N), r2 = N.cross(dpdx);
    const det = dpdx.dot(r1);
    const grad = sign(det).mul(r1.mul(dhdx).add(r2.mul(dhdy)));
    return abs(det).mul(N).sub(grad).normalize();
  })();

  m.colorNode = Fn(() => {
    const g = attribute('color', 'vec3'); // gradient baked per vertex from the original texture
    const s = texture(strokeTex, uv(1)).r;
    // original .blend: teal diffuse with the gradient applied in 'Value' blend mode
    let c = mix(CU.base, CU.gradTint.mul(luminance(g)), CU.gradMix).mul(CU.tint);
    c = c.mul(mix(float(1), s, CU.strokes));
    c = hue(c, CU.hueShift);
    const l = luminance(c);
    c = mix(vec3(l), c, CU.sat);
    return c.mul(float(1).sub(CU.holo.mul(0.85)));
  })();

  m.emissiveNode = Fn(() => {
    const f = fres.pow(CU.rimPow);
    let e = CU.fresColor.mul(f).mul(CU.rimStr);
    // oil-slick: thin-film style bands driven by view angle
    e = e.add(spectrum(fres.mul(CU.oilScale).add(CU.time.mul(0.05))).mul(f.mul(0.8).add(0.2)).mul(CU.oil).mul(0.35));
    // hologram scan lines
    const lines = sin(screenUV.y.mul(CU.holoDensity).add(CU.time.mul(CU.holoSpeed).mul(6.2832))).mul(0.5).add(0.5);
    e = e.add(CU.fresColor.mul(lines.pow(3).mul(0.6).add(f.mul(1.4))).mul(CU.holo));
    // pulse
    e = e.add(CU.fresColor.mul(sin(CU.time.mul(CU.pulseSpeed).mul(6.2832)).mul(0.5).add(0.5)).mul(CU.pulse).mul(0.4));
    // dissolve edge
    const edge = smoothstep(CU.dissolve.add(0.06), CU.dissolve, noiseD).mul(step(0.0001, CU.dissolve));
    return e.add(CU.dissolveEdge.mul(edge).mul(CU.dissolveGlow));
  })();

  m.opacityNode = Fn(() => {
    const cut = step(CU.dissolve, noiseD);
    return cut.mul(mix(float(1), float(0.55), CU.holo));
  })();
  m.alphaTest = 0.5;
  m.mrtNode = mrt({ bird: _v4(1, attribute('_beak', 'float'), 0, 1) });   // r = bird, g = beak, b = eye
  return m;
}

function makeEyeMaterial() {
  // standard (not physical): the physical variant failed to compile on WebGPU (empty struct) → no eyes there
  const m = new THREE.MeshBasicNodeMaterial();   // unlit: a lit eye pipeline failed to build on WebGPU (empty WGSL struct)
  m.colorNode = CU.eyeColor.mul(CU.eyeGlow);
  // eyes dissolve with the body (same noise field)
  m.opacityNode = step(CU.dissolve, mx_noise_float(positionLocal.mul(CU.dissolveScale)).mul(0.5).add(0.5));
  m.alphaTest = 0.5;
  m.mrtNode = mrt({ bird: _v4(1, 0, 1, 1) });
  return m;
}

// ---------------------------------------------------------------- environment: branches material (own colour, own lights)
export const EP = {
  color: uniform(new THREE.Color('#0b0d10')), gradMix: uniform(0.3), gradTint: uniform(new THREE.Color('#82f5ff')),
  rimStr: uniform(0.25), rimPow: uniform(3), rimColor: uniform(new THREE.Color('#5fdcff')), flat: uniform(1), bright: uniform(1),
};
function makePerchMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
  m.normalNode = Fn(() => {
    const fn = positionView.dFdx().cross(positionView.dFdy()).normalize();
    return mix(normalView, fn, EP.flat).normalize();
  })();
  m.colorNode = Fn(() => {
    const g = attribute('color', 'vec3');
    return mix(EP.color, EP.gradTint.mul(luminance(g)), EP.gradMix).mul(EP.bright);
  })();
  m.emissiveNode = Fn(() => {
    const f = float(1).sub(abs(normalView.dot(positionViewDirection))).clamp(0, 1).pow(EP.rimPow);
    return EP.rimColor.mul(f).mul(EP.rimStr);
  })();
  return m;
}

export async function loadCrow(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  let mesh = null; const bodyMats = []; let eyeMat = null;
  const skinned = [];
  let perch = null;
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.name.startsWith('Perch')) perch = o; });
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    mesh = mesh || o;
    skinned.push(o);
    o.castShadow = o.receiveShadow = true; o.frustumCulled = false;
    const src = o.material;
    if (src.name === 'crow_eyes') { eyeMat = eyeMat || makeEyeMaterial(); o.material = eyeMat; o.castShadow = o.receiveShadow = false; return; }   // no shadow pass for the eyes (its WGSL came out empty on WebGPU)
    if (src.map) src.map.colorSpace = THREE.SRGBColorSpace;
    o.material = null; o.userData.srcMat = src; bodyMats.push(o);
  });
  // stroke texture is stored in material extras (three's material only keeps one map) → load it from the parser
  const strokeTex = await gltf.parser.getDependency('texture', 1);
  strokeTex.colorSpace = THREE.NoColorSpace; strokeTex.wrapS = strokeTex.wrapT = THREE.RepeatWrapping;
  const body = makeBodyMaterial(bodyMats[0].userData.srcMat.map, strokeTex);
  bodyMats.forEach((o) => { o.material = body; });
  if (perch) { perch.material = makePerchMaterial(); perch.castShadow = perch.receiveShadow = true; }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const c of gltf.animations) actions[c.name] = mixer.clipAction(c);
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return { perch, skinned, root, mesh, body, eye: eyeMat, mixer, actions, bones, clips: gltf.animations.map((c) => c.name) };
}

// ---------------------------------------------------------------- procedural layer on top of the clips
// Spring-driven head look (follows cursor) + wind on tail / wing tips.
export class CrowRig {
  constructor(crow) {
    this.c = crow; this.cur = null;
    this.look = { x: 0, y: 0, vx: 0, vy: 0 };
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.added = new Map();
  }
  play(name, fade = 0.4) {
    const a = this.c.actions[name]; if (!a || this.cur === a) return;
    a.reset().setEffectiveWeight(1).play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a;
  }
  update(dt, t, P, mouse) {
    const c = this.c;
    const b = c.bones;
    // undo last frame's procedural offsets first: the mixer skips writing a bone whose clip value
    // hasn't changed (crow "hold" poses), so without this the offsets would pile up and spin the head
    for (const [bone, q] of this.added) bone.quaternion.multiply(q.invert());
    this.added.clear();
    c.mixer.timeScale = P.animSpeed;
    c.mixer.update(dt);
    // sleek body in the air: blend the 'slim' morph in while a flight clip plays
    const flying = ['fly', 'glide', 'dive'].includes(P.clip);
    this.slim = (this.slim || 0) + ((flying ? P.flySlim : 0) - (this.slim || 0)) * (1 - Math.exp(-dt * 4));
    for (const m of c.skinned) if (m.morphTargetInfluences) m.morphTargetInfluences[0] = this.slim;
    // head follow: damped spring towards the cursor target (yaw / pitch in radians)
    const L = this.look;
    const tx = P.headFollow ? mouse.x * P.headRange : 0;
    const ty = P.headFollow ? mouse.y * P.headRange * 0.6 : 0;
    const k = P.headStiff, d = P.headDamp, h = Math.min(dt, 1 / 30);
    L.vx += ((tx - L.x) * k - L.vx * d) * h; L.x += L.vx * h;
    L.vy += ((ty - L.y) * k - L.vy * d) * h; L.y += L.vy * h;
    const add = (bone, pitch, yaw, roll = 0) => {
      if (!bone) return; this.e.set(pitch, yaw, roll, 'YXZ'); this.q.setFromEuler(this.e); bone.quaternion.multiply(this.q);
      const prev = this.added.get(bone); if (prev) prev.multiply(this.q); else this.added.set(bone, this.q.clone());
    };
    // counter the crow's own yaw so "towards the cursor" is in screen space
    add(b.neck, -L.y * 0.25, L.x * 0.3); add(b.neck2, -L.y * 0.3, L.x * 0.3, -L.x * 0.08); add(b.head, -L.y * 0.45, L.x * 0.4, -L.x * 0.15);
    // wind on feathers
    const w = P.featherWind * P.windStr;
    const n = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 4.3 + 1.2) * 0.3 + Math.sin(t * 9.1) * 0.1;
    add(b.tail0, n * 0.08 * w, Math.sin(t * 1.1) * 0.12 * w, n * 0.06 * w);
    add(b.tail1, n * 0.06 * w, 0);
    add(b.hand_L, 0, 0, n * 0.05 * w); add(b.hand_R, 0, 0, -n * 0.05 * w);
  }
}
