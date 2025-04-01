import * as THREE from 'three';
import { CF } from './cursorfx.js';
import { Fn, uniform, texture, vec2, vec3, vec4, float, dot, max, clamp, mix, step, pow, abs, length, normalize, screenUV, uv, floor, fract, sin, smoothstep, min } from 'three';

// "Soothe" cursor effect (after sciecode/soothe, MIT): a GPGPU fluid heightmap. Every frame a ping-pong pass
// advects a height + slope field with an elastic-viscous spring; the cursor presses a trail into it (a capsule
// between the previous and current pointer position). The field then bends the final image (refraction),
// shades it (diffuse + specular from a low light) and can dither the disturbed area.
export const SO = {
  on: uniform(0), mouse: uniform(new THREE.Vector3()), pmouse: uniform(new THREE.Vector3()), res: uniform(new THREE.Vector2(2, 2)),
  radius: uniform(0.065), peak: uniform(0.9), elastic: uniform(0.016), visc: uniform(0.059), spread: uniform(0.972), rest: uniform(0.012),
  refract: uniform(0.04), shade: uniform(1.5), spec: uniform(0.6), shine: uniform(4.8), light: uniform(new THREE.Color('#fff6e6')), lightY: uniform(1.5),
  dither: uniform(0), ditherPx: uniform(2), ditherAll: uniform(0), aspect: uniform(1),
  fade: uniform(0.01), soft: uniform(0.5),   // trail mask: fade per frame (= dt / life), brush edge softness
};
const hash = (p) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));

const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
let A = new THREE.RenderTarget(2, 2, opts), Bt = new THREE.RenderTarget(2, 2, opts);
const prev = texture(A.texture);
export const FIELD = texture(Bt.texture);        // the current height/slope field, read by the final passes
// trail MASK: a plain painted stroke (no waves). Each frame m = max(m − dt/life, brush): overlapping strokes merge
// into one shape (max, not a sum → no rims where they cross), it never flickers, and it is gone exactly `life` s
// after the pointer leaves a spot.
let MA = new THREE.RenderTarget(2, 2, opts), MB = new THREE.RenderTarget(2, 2, opts);
const prevM = texture(MA.texture);
export const MASK = texture(MB.texture);
let FLIP = false;   // quad uv runs y-down on the WebGL backend, y-up on WebGPU
export function makeSoothe(renderer) {
  FLIP = true;   // measured: the sim quad uv runs y-down against the pointer on both backends
  const field = FIELD;
  const quad = new THREE.QuadMesh(new THREE.NodeMaterial());
  quad.material.toneMapped = false;
  quad.material.fragmentNode = Fn(() => {
    const q = uv(), un = vec2(1).div(SO.res);   // quad uv (0..1 across the sim target, y up) — screenUV is canvas-relative in WebGPU
    const h = prev.uv(q);
    const vel = h.w.add(h.z.sub(SO.rest).mul(SO.elastic).negate()).sub(h.w.mul(SO.visc));
    const r = prev.uv(q.add(vec2(un.x, 0))), l = prev.uv(q.sub(vec2(un.x, 0))), u = prev.uv(q.add(vec2(0, un.y))), d = prev.uv(q.sub(vec2(0, un.y)));
    const xy = vec2(h.z.sub(r.z).sub(h.z.sub(l.z)), h.z.sub(u.z).sub(h.z.sub(d.z))).add(r.xy).add(l.xy).add(u.xy).add(d.xy).mul(SO.spread);
    const z = r.x.negate().add(l.x).sub(u.y).add(d.y);
    const f = vec3(xy, z).mul(0.25).toVar();
    f.z.addAssign(h.z.add(vel));
    // cursor capsule (previous → current pointer), aspect-correct
    const asp = SO.aspect;
    const p = vec2(q.x.mul(asp), q.y), a = vec2(SO.pmouse.x.mul(asp), SO.pmouse.y), b = vec2(SO.mouse.x.mul(asp), SO.mouse.y);
    const v = b.sub(a), w = p.sub(a), c1 = dot(w, v), c2 = dot(v, v).max(1e-8);
    const t = clamp(c1.div(c2), 0, 1), dist = length(p.sub(a.add(v.mul(t))));
    const dst = clamp(SO.radius.sub(dist).div(SO.radius), 0, 1).mul(step(0.5, SO.mouse.z));
    f.z.addAssign(pow(dst, 1.9).mul(SO.peak).mul(2.5));
    f.xy.subAssign(f.xy.mul(pow(dst, 3.9)).mul(0.1));
    f.z.assign(mix(f.z, min(SO.peak, f.z), step(1e-4, dst)));
    return clamp(vec4(f, vel), -1, 1);
  })();
  const mquad = new THREE.QuadMesh(new THREE.NodeMaterial()); mquad.material.toneMapped = false;
  mquad.material.fragmentNode = Fn(() => {
    const q = uv(), asp = SO.aspect;
    const p = vec2(q.x.mul(asp), q.y), a = vec2(SO.pmouse.x.mul(asp), SO.pmouse.y), b = vec2(SO.mouse.x.mul(asp), SO.mouse.y);
    const v = b.sub(a), w = p.sub(a), t = clamp(dot(w, v).div(dot(v, v).max(1e-8)), 0, 1), dist = length(p.sub(a.add(v.mul(t))));
    const brush = smoothstep(SO.radius, SO.radius.mul(float(1).sub(SO.soft)), dist).mul(step(0.5, SO.mouse.z)).mul(smoothstep(0.0002, 0.002, length(v)));   // paint only while moving: a resting cursor leaves no dot
    const m = max(prevM.uv(q).x.sub(SO.fade), brush);
    return vec4(m, m, m, 1);
  })();
  // pointer (0..1, y up like the quad uv)
  const cur = new THREE.Vector3();
  addEventListener('pointermove', (e) => { if (innerWidth > 0 && innerHeight > 0) cur.set(e.clientX / innerWidth, FLIP ? e.clientY / innerHeight : 1 - e.clientY / innerHeight, 1); }, { capture: true, passive: true });
  document.addEventListener('pointerleave', () => (cur.z = 0));
  addEventListener('blur', () => (cur.z = 0));
  const size = new THREE.Vector2();
  let scale = 0.5;
  const step_ = (renderer) => {
    if (SO.on.value < 0.5) return;
    renderer.getDrawingBufferSize(size);
    const cap = Math.min(1, 1400 / Math.max(1, size.x * scale));   // the trail is soft: never simulate above ~1400 px wide
    const w = Math.max(2, Math.round(size.x * scale * cap)), h = Math.max(2, Math.round(size.y * scale * cap));
    if (A.width !== w || A.height !== h) { A.setSize(w, h); Bt.setSize(w, h); }
    SO.res.value.set(w, h); SO.aspect.value = w / h;
    SO.pmouse.value.copy(SO.mouse.value); SO.mouse.value.copy(cur);
    { // pointer velocity (uv / s, smoothed) and a clock for the cursor effects
      const now = performance.now() / 1000, dt = Math.min(0.1, Math.max(1e-3, now - (step_.last || now - 0.016))); step_.last = now;
      const vx = (SO.mouse.value.x - SO.pmouse.value.x) / dt, vy = (SO.mouse.value.y - SO.pmouse.value.y) / dt, k = 1 - Math.exp(-dt * 12);
      CF.vel.value.x += (vx - CF.vel.value.x) * k; CF.vel.value.y += (vy - CF.vel.value.y) * k; CF.t.value = now % 1000; SO.fade.value = dt / Math.max(0.1, SO.life || 1.5);
    }
    if (SO.pmouse.value.z === 0) SO.pmouse.value.copy(SO.mouse.value);
    for (let i = 0; i < 2; i++) {        // two sub-steps per frame (the original runs at native res; this keeps the waves travelling)
      [A, Bt] = [Bt, A];                 // A = last written (read), Bt = write
      prev.value = A.texture;
      const rt = renderer.getRenderTarget();
      renderer.setRenderTarget(Bt); quad.render(renderer); renderer.setRenderTarget(rt);
    }
    field.value = Bt.texture;
    { // trail mask (once per frame)
      if (MA.width !== w || MA.height !== h) { MA.setSize(w, h); MB.setSize(w, h); }
      [MA, MB] = [MB, MA]; prevM.value = MA.texture;
      const rt = renderer.getRenderTarget(); renderer.setRenderTarget(MB); mquad.render(renderer); renderer.setRenderTarget(rt);
      MASK.value = MB.texture;
    }
  };
  const api = { step: step_, setScale: (v) => (scale = v), get rt() { return Bt; }, quad };
  window.__soothe = api;
  return api;
}

// uv offset (refraction) for sampling the finished image; gate 0 disables (e.g. scene 1 rendered into the ball)
export const sootheOffset = (u, gate = float(1)) => FIELD.uv(u).xy.mul(SO.refract).mul(SO.on).mul(gate);
// shading + dither of the finished colour c (display space 0..1)
export const sootheShade = (c, u, px, gate = float(1)) => Fn(() => {
  const N = FIELD.uv(u).xyz;
  const frag = vec3(u.mul(2).sub(1), N.z), frag0 = vec3(frag.xy, SO.rest);
  const lightPos = vec3(0, SO.lightY, 0.98), viewPos = vec3(0, 0, 1.2);
  const lit = (Nn, fp) => {
    const L = normalize(lightPos.sub(fp)), H = normalize(L.add(normalize(viewPos.sub(fp))));
    const dN = vec3(Nn.xy, Nn.z.div(2).add(0.28));
    const dif = max(dot(normalize(dN), L), 0);
    const sp = pow(clamp(dot(normalize(dN), H), 0, 1), SO.shine);
    return vec2(dif, sp);
  };
  const s = lit(N, frag), s0 = lit(vec3(0, 0, SO.rest), frag0);
  const k = SO.on.mul(gate);
  const amt = length(N.xy).mul(6).add(abs(N.z.sub(SO.rest)).mul(4)).clamp(0, 1);     // how disturbed this pixel is
  let o = vec3(c).mul(float(1).add(s.x.sub(s0.x).mul(SO.shade).mul(k)));
  o = o.add(vec3(SO.light).mul(s.y.sub(s0.y).max(0).mul(SO.spec).mul(k)));
  // dithering: ordered noise quantised to 8 levels, only where the surface moves (or everywhere)
  const pp = floor(px.div(SO.ditherPx));
  const n = hash(pp).sub(0.5);
  const L = float(8);
  const dq = floor(o.mul(L).add(n.mul(SO.dither)).add(0.5)).div(L);
  const dm = mix(amt, float(1), SO.ditherAll).mul(step(0.001, SO.dither)).mul(k);
  return mix(o, dq, dm).clamp(0, 1);
})();
