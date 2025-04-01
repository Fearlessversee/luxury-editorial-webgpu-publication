import * as THREE from 'three';
import {
  Fn, uniform, attribute, vec2, vec3, vec4, float, sin, cos, mod, abs, smoothstep, max, length, normalize, mix,
  modelViewMatrix, cameraProjectionMatrix, varying,
} from 'three';

// Background dust: stateless GPU particles. Motion ("physics") is integrated analytically in the
// vertex shader: drift = wind·t + gravity·t + curl-ish turbulence, wrapped inside a box that always fills the camera view.
// Unlit (MeshBasic) — scene lights never touch it.
export const DU = {
  time: uniform(0), size: uniform(1), opacity: uniform(0.55), color: uniform(new THREE.Color('#cfe9ff')),
  wind: uniform(new THREE.Vector3(0.1, 0, 0.05)), gravity: uniform(-0.03), turb: uniform(0.7),
  depth: uniform(9), bokeh: uniform(0.9), twinkle: uniform(0.5), focus: uniform(5.2),
  zoom: uniform(1), box: uniform(new THREE.Vector3(7, 4.2, 9)), boxMin: uniform(new THREE.Vector3(-3.5, -1, -6.75)),
  mouse: uniform(new THREE.Vector2(9, 9)), repel: uniform(0.6), repelRadius: uniform(0.18), aspect: uniform(1),
};

export function makeDust(count) {
  const g = new THREE.BufferGeometry();
  const center = new Float32Array(count * 4 * 3), corner = new Float32Array(count * 4 * 2), seed = new Float32Array(count * 4);
  const idx = new Uint32Array(count * 6);
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random(), s = Math.random();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      center.set([x, y, z], v * 3); corner.set(cs[k], v * 2); seed[v] = s;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3)); // unused, silences a TSL warning
  g.setAttribute('position', new THREE.BufferAttribute(center, 3)); // unit-cube random, expanded in shader
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));

  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const vFade = varying(float(1));
  const vTw = varying(float(1));

  m.vertexNode = Fn(() => {
    const u = attribute('position', 'vec3');
    const s = attribute('seed', 'float');
    const cr = attribute('corner', 'vec2');
    const t = DU.time;
    const box = DU.box, boxMin = DU.boxMin; // sized every frame to the camera's view, so zooming out keeps it full
    let p = u.mul(box);
    const sp = s.mul(0.7).add(0.3);
    p = p.add(DU.wind.mul(t).mul(sp)).add(vec3(0, DU.gravity.mul(t).mul(sp), 0));
    const ph = s.mul(6.2832);
    p = p.add(vec3(
      sin(t.mul(0.31).add(ph).add(p.y.mul(1.3))),
      sin(t.mul(0.27).add(ph.mul(1.7)).add(p.x.mul(0.9))),
      cos(t.mul(0.23).add(ph.mul(2.3)).add(p.y.mul(0.7))),
    ).mul(DU.turb).mul(0.18));
    p = mod(p, box).add(boxMin);

    const mv = modelViewMatrix.mul(vec4(p, 1)).toVar();
    // cursor repel, measured in NDC
    const clip = cameraProjectionMatrix.mul(mv);
    const ndc = clip.xy.div(clip.w);
    const dv = ndc.sub(DU.mouse).mul(vec2(DU.aspect, 1));
    const dl = length(dv);
    const push = normalize(dv.add(vec2(0.0001, 0))).mul(smoothstep(DU.repelRadius, 0.0, dl)).mul(DU.repel).mul(0.12);
    mv.x.addAssign(push.x.div(DU.aspect).mul(mv.z.negate()));
    mv.y.addAssign(push.y.mul(mv.z.negate()));

    // bokeh: particles away from the focus plane grow & fade
    const defocus = abs(mv.z.negate().sub(DU.focus)).div(DU.focus).mul(5.2); // relative, so zooming keeps the same bokeh look
    const grow = float(1).add(defocus.mul(DU.bokeh).mul(0.6));
    const sz = DU.size.mul(DU.zoom).mul(0.006).mul(s.mul(1.2).add(0.4)).mul(grow);
    vFade.assign(float(1).div(grow.mul(grow)).mul(smoothstep(0.2, 1.2, mv.z.negate())));
    vTw.assign(mix(float(1), sin(t.mul(s.mul(3).add(1)).add(ph.mul(3))).mul(0.5).add(0.5), DU.twinkle));
    mv.xy.addAssign(cr.mul(sz));
    return cameraProjectionMatrix.mul(mv);
  })();

  m.colorNode = Fn(() => {
    const cr = attribute('corner', 'vec2');
    const d = length(cr);
    const a = smoothstep(1.0, 0.0, d).pow(1.6).mul(vFade).mul(vTw).mul(DU.opacity);
    return vec4(DU.color.mul(a), a);
  })();

  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  return mesh;
}
