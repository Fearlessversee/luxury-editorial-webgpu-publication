import * as THREE from 'three';

// The win: an antique crown on the crow's head (all six modules found). A gilded band with a beaded rim, seven
// pointed leaves standing on it, a pearl on each tip and small cabochons round the band. Hidden until crown.show();
// it drops on with a little settle. Parented to the head bone, so it follows every move of the head.
export function makeCrown(crow) {
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0xd9b25c, roughness: 0.35, metalness: 0.55 });
  const gem = new THREE.MeshStandardNodeMaterial({ color: 0x5a1a18, roughness: 0.25, metalness: 0.1 });
  const g = new THREE.Group(), R = 1, H = 0.42, N = 7;
  // band: a slightly flared open tube (lathe of a thin profile)
  const band = new THREE.LatheGeometry([[R * 0.97, 0], [R, 0], [R * 1.06, H], [R * 1.02, H]].map(([x, y]) => new THREE.Vector2(x, y)), 48);
  g.add(new THREE.Mesh(band, mat));
  // beaded rims, top and bottom
  for (const [y, r] of [[0.02, R * 1.0], [H, R * 1.06]]) {
    const bead = new THREE.SphereGeometry(0.045, 8, 6), inst = new THREE.InstancedMesh(bead, mat, 40), m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; m.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r); inst.setMatrixAt(i, m); }
    g.add(inst);
  }
  // the points: flat pointed leaves (a spade silhouette), a pearl on each tip
  const leaf = new THREE.Shape(); leaf.moveTo(-0.26, 0); leaf.quadraticCurveTo(-0.3, 0.32, 0, 0.78); leaf.quadraticCurveTo(0.3, 0.32, 0.26, 0); leaf.closePath();
  const leafG = new THREE.ExtrudeGeometry(leaf, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.025);
  const pearl = new THREE.SphereGeometry(0.09, 12, 8);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, p = new THREE.Group();
    p.position.set(Math.cos(a) * R * 1.05, H - 0.02, Math.sin(a) * R * 1.05); p.rotation.y = -a + Math.PI / 2; p.rotation.x = -0.12;   // leaning out a touch
    const l = new THREE.Mesh(leafG, mat); p.add(l);
    const pr = new THREE.Mesh(pearl, mat); pr.position.y = 0.84; p.add(pr);
    g.add(p);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), gem); c.scale.set(1, 1.3, 0.5); c.position.set(Math.cos(a + Math.PI / N) * R * 1.05, H * 0.5, Math.sin(a + Math.PI / N) * R * 1.05); c.lookAt(0, H * 0.5, 0); g.add(c);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noWire = true; } });

  // place it on the head: the crown's pose is set in the crow's rest (bind) space, then carried into the head bone
  const holder = new THREE.Group(); holder.add(g); holder.visible = false;
  let head = null, mesh = null;
  crow.root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (mesh) {
    const i = mesh.skeleton.bones.findIndex((b) => b.name === 'head');
    if (i >= 0) {
      head = mesh.skeleton.bones[i];
      const want = new THREE.Matrix4().compose(new THREE.Vector3(0, 1.905, 0.69), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0)), new THREE.Vector3(0.115, 0.115, 0.115));
      const local = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[i], want);
      local.decompose(holder.position, holder.quaternion, holder.scale);
      head.add(holder);
    }
  }
  let t = -1;
  return {
    group: holder,
    show() { if (!head || t >= 0) return; holder.visible = true; t = 0; },
    step(dt) {   // drops from above and settles with a small bounce
      if (t < 0 || t > 2) return; t += dt;
      const k = Math.min(1, t / 0.55), fall = (1 - k) * (1 - k) * 3.2, bounce = t > 0.55 ? Math.exp(-(t - 0.55) * 7) * Math.sin((t - 0.55) * 22) * 0.18 : 0;
      g.position.y = fall + bounce; g.rotation.y = (1 - k) * 1.2;
    },
  };
}
