import * as THREE from 'three';

// Stickers stuck by clicking: a decal cut from the clicked mesh's own triangles, so it wraps curved and angled
// surfaces exactly (like a real sticker pressed on). Works on plain, merged and instanced meshes; the decal is
// parented to what it was stuck on, so it moves with it. (Own compact version of the decal-projector technique:
// project the mesh triangles into the sticker's box, clip them to the box, use the box xy as uv.)
const _inv = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _v = new THREE.Vector3();
const PLANES = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];   // axis, sign: keep v[axis]*sign <= 0.5
function clip(poly, axis, sign) {
  const out = [], n = poly.length; if (!n) return out;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], da = a[axis] * sign - 0.5, db = b[axis] * sign - 0.5;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}
// mesh: the hit object; instM: instance matrix (or null); point/normal in world space; size (world units); roll (rad)
export function decalGeometry(mesh, instM, point, normal, size, roll, depth = null, aspect = 1) {
  const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
  // projector: z along the normal, box size×size×depth, centred on the point
  const d = depth ?? size * 0.6;
  const z = normal.clone().normalize(), up = Math.abs(z.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  const proj = new THREE.Matrix4().compose(point, q, new THREE.Vector3(aspect >= 1 ? size : size * aspect, aspect >= 1 ? size / aspect : size, d));
  const meshW = instM ? new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, instM) : mesh.matrixWorld;
  _inv.copy(proj).invert(); _pm.multiplyMatrices(_inv, meshW);   // mesh local → projector box space
  const N = pos.count, P = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(_pm); P[i * 3] = _v.x; P[i * 3 + 1] = _v.y; P[i * 3 + 2] = _v.z; }
  const out = [], uvs = [], tri = idx ? idx.count / 3 : N / 3, I = (k) => (idx ? idx.getX(k) : k);
  const twoSided = mesh.material && mesh.material.side === THREE.DoubleSide;
  for (let t = 0; t < tri; t++) {
    const a = I(t * 3), b = I(t * 3 + 1), c = I(t * 3 + 2);
    const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], C = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
    // quick reject: all three beyond one plane
    let rej = false; for (const [ax, sg] of PLANES) if (A[ax] * sg > 0.5 && B[ax] * sg > 0.5 && C[ax] * sg > 0.5) { rej = true; break; } if (rej) continue;
    // only faces turned towards the projector (no sticker leaking round the back of thin things)
    const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2], e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, nl = Math.hypot(nx, ny, nz) || 1;
    if (Math.abs(nz) / nl < 0.05) continue;   // edge-on faces; the thin depth of the box keeps it off the far side
    let poly = [A, B, C]; for (const [ax, sg] of PLANES) { poly = clip(poly, ax, sg); if (!poly.length) break; }
    if (poly.length < 3) continue;
    for (let k = 1; k < poly.length - 1; k++) for (const p of [poly[0], poly[k], poly[k + 1]]) { _v.set(p[0], p[1], p[2]).applyMatrix4(proj); out.push(_v.x, _v.y, _v.z); uvs.push(p[0] + 0.5, p[1] + 0.5); }
  }
  if (!out.length) return null;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals();
  return g;   // world space
}
