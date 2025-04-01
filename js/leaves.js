import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { uniform, texture, uv, vec4 } from 'three';

// Leaves shed by the crow while it flies. CPU physics (a few hundred bodies): each leaf is dragged
// towards the relative airflow (the crow flies forward, so the air rushes backwards past it), tumbles
// with a spin that grows with its slip speed, flutters in turbulence and slowly falls.
// Drawn unlit and without depth-write, so no scene light, grade or god ray touches them.
export const LU = { tint: uniform(new THREE.Color('#ffffff')), bright: uniform(0.8) };
const MAX = 1600;

export async function loadLeaves(url, scene) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const kinds = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const map = o.material.map; map.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, depthWrite: false, transparent: true });
    m.colorNode = vec4(texture(map, uv()).rgb.mul(LU.tint).mul(LU.bright), 1);
    const im = new THREE.InstancedMesh(o.geometry, m, Math.ceil(MAX / 8));
    for (let i = 0; i < im.instanceMatrix.count; i++) im.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    im.count = 0; im.frustumCulled = false; im.renderOrder = 3;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im); kinds.push(im);
  });
  return new Leaves(kinds);
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const EMIT_BONES = ['hand_L', 'hand_R', 'forearm_L', 'forearm_R', 'tail1', 'tail0', 'hips', 'chest', 'upperarm_L', 'upperarm_R'];

class Leaves {
  constructor(kinds) { this.kinds = kinds; this.list = []; this.acc = 0; }
  emit(n, bones, fwd, air, P) {
    for (let i = 0; i < n && this.list.length < MAX; i++) {
      const b = bones[EMIT_BONES[(Math.random() * EMIT_BONES.length) | 0]];
      if (!b) continue;
      // born in a wide cloud around the body and already spread along this frame's slice of the trail,
      // so the stream stays even instead of arriving in clumps
      const p = b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(0.7 * P.leafSpread))
        .addScaledVector(air, Math.random() * this.frameDt);
      const v = air.clone().multiplyScalar(0.35 + Math.random() * 0.35)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4 * P.leafSpread));
      this.list.push({
        k: (Math.random() * this.kinds.length) | 0, p, v,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)),
        ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        ph: Math.random() * 100, age: 0, life: P.leafLife * (0.6 + Math.random() * 0.8), s: P.leafSize * (0.35 + Math.random() ** 2 * 1.5),   // mostly small, a few big ones
      });
    }
  }
  update(dt, t, P, bones, flying, fwd, wind) {
    // relative airflow: opposite the flight direction, plus the scene wind
    this.frameDt = dt;
    const air = _a.copy(fwd).multiplyScalar(-P.leafSpeed).addScaledVector(wind, 2);
    if (P.leafOn && (flying || P.leafAlways)) {
      this.acc += dt * P.leafRate;
      const n = Math.floor(this.acc); this.acc -= n;
      if (n) this.emit(n, bones, fwd, air, P);
    }
    const drag = 1 - Math.exp(-P.leafDrag * dt);
    const out = [];
    for (const L of this.list) {
      L.age += dt;
      if (L.age > L.life || L.p.lengthSq() > 900) continue;
      L.v.lerp(air, drag * (0.6 + 0.8 * ((L.ph * 7.3) % 1)));  // light leaves catch the air faster
      L.v.y -= P.leafGravity * dt;
      const tt = t * 2.2 + L.ph;
      L.v.x += Math.sin(tt * 1.7) * P.leafTurb * dt * 3; L.v.y += Math.sin(tt * 2.3 + 1.1) * P.leafTurb * dt * 3; L.v.z += Math.cos(tt * 1.9) * P.leafTurb * dt * 3;
      L.p.addScaledVector(L.v, dt);
      const slip = _v.copy(L.v).sub(air).length() + 1;
      _q.setFromAxisAngle(L.ax, P.leafSpin * dt * slip * 0.35);
      L.q.multiply(_q);
      out.push(L);
    }
    this.list = out;
    for (const im of this.kinds) { im.userData.prev = im.count; im.count = 0; }
    for (const L of this.list) {
      const im = this.kinds[L.k];
      if (im.count >= im.instanceMatrix.count) continue;
      const fin = Math.min(1, L.age / 0.12) * Math.min(1, (L.life - L.age) / (L.life * 0.3));
      _s.setScalar(Math.max(0.0001, L.s * fin));
      _m.compose(L.p, L.q, _s);
      im.setMatrixAt(im.count++, _m);
    }
    for (const im of this.kinds) {
      // some backends draw the whole buffer: park unused slots at zero scale
      for (let i = im.count; i < Math.max(im.userData.prev || 0, im.count); i++) im.setMatrixAt(i, ZERO);
      im.instanceMatrix.needsUpdate = true;
    }
  }
  clear() { this.list = []; }
}
