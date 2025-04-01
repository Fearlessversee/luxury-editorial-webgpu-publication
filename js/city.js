import { setRoles } from './palette.js';
import { inkLine, LINE } from './lines.js';
import * as THREE from 'three';
import { tagSfx } from './sound.js';
import { buildMicro } from './micro.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attribute, step, mrt, vec4, mx_noise_float, positionLocal, Fn, float, vec2, vec3, abs, fract, smoothstep, fwidth, normalWorld, max, dot, mix, screenUV, texture, uv, hash, instanceIndex, floor, positionWorld, cameraPosition, uniform, asin, acos, sin, cos } from 'three';

// Scene 4: a Manhattan-like island seen from the air — the portal opens high over its southern tip and the flight
// runs north along it: downtown cluster, low village, midtown towers, the pencil towers of "billionaires' row",
// the big park with its lake and reservoir, uptown. Rivers on both sides, low boroughs across, a few bridges,
// billboards (and painted roof ads), taxis on the avenues, a dirigible, clouds. Same print style: paper fill, ink
// outlines. City frame: ground y = 0, the island's long axis runs along +x from the origin.
const rnd = (i, k = 0) => { const x = Math.sin(i * 12.9898 + k * 78.233 + 4.1) * 43758.5453; return x - Math.floor(x); };
const lerpTab = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; const t = (x - x0) / (x1 - x0); return y0 + (y1 - y0) * t * t * (3 - 2 * t); } return tab[tab.length - 1][1]; };
// island outline: half width and centre line along x
const HW = [[-300, 0], [-160, 260], [200, 520], [800, 660], [1500, 720], [3000, 830], [6000, 860], [9000, 800], [12000, 640], [14300, 400], [15000, 0]];
const CZ = [[-300, 0], [15000, 0]];   // straight and centred on the flight line (the frame stays symmetric)
const halfW = (x) => lerpTab(HW, x), cz = (x) => lerpTab(CZ, x);
export const inIsland = (x, z, m = 0) => Math.abs(z - cz(x)) < halfW(x) - m;
const PARK = { x0: 5600, x1: 7900, hw: 190 };
const inPark = (x, z, m = 0) => x > PARK.x0 - m && x < PARK.x1 + m && Math.abs(z - cz(x)) < PARK.hw + m;
const BWAY = (x) => -120 + x * 0.062;                       // the diagonal avenue cutting the grid

// ---- billboard atlas: 4 × 8 invented ads, printed in ink on paper
function adAtlas() {
  const W = 1024, H = 1024, cw = W / 4, ch = H / 8, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const ads = [['NEVERMORE', 'the musical'], ['CROW COLA', 'drink it black'], ['INK & PAPER', 'since 1897'], ['BLACK FEATHER', 'hotel · bar'], ['OPEN ALL NIGHT', ''], ['MIDNIGHT', 'express'],
    ['QUILL', 'fine pens'], ['HOTEL NOIR', '★★★★'], ['ORACLE', 'your future · 5¢'], ['LUCKY 13', 'casino'], ['PAPER MOON', 'diner'], ['DRINK INK', ''], ['NIGHT OWL', 'coffee'], ['BROADWAY', 'tonight'],
    ['SALE', '50% off'], ['TAXI', 'call 555-0199'], ['THE RAVEN', 'now playing'], ['SMOKE RINGS', 'cigars'], ['GLASS BALL', 'fortunes told'], ['KEYHOLE', 'locksmith'], ['PUMPKIN', 'pie co.'],
    ['CAW!', ''], ['ATLAS', 'insurance'], ['EMPIRE', 'radio'], ['HOT DOGS', '10¢'], ['JAZZ', 'live · 11pm'], ['PORTAL', 'travel agency'], ['GRAND', 'central bank'], ['SKY', 'airship tours'], ['ECHO', 'records'], ['MOTH', 'lamps'], ['ROOF', 'garden']];
  ads.forEach(([t, s], i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch, inv = rnd(i, 3) < 0.45;
    g.fillStyle = inv ? '#141414' : '#f2eee4'; g.fillRect(x, y, cw, ch);
    g.strokeStyle = inv ? '#f2eee4' : '#141414'; g.lineWidth = 5; g.strokeRect(x + 9, y + 9, cw - 18, ch - 18);
    g.fillStyle = inv ? '#f2eee4' : '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 64; g.font = `900 ${fs}px Impact, "Arial Narrow", Haettenschweiler, sans-serif`;
    while (g.measureText(t).width > cw - 36 && fs > 20) { fs -= 2; g.font = `900 ${fs}px Impact, "Arial Narrow", Haettenschweiler, sans-serif`; }
    g.fillText(t, x + cw / 2, y + ch * (s ? 0.42 : 0.52));
    if (s) { g.font = `italic 24px Georgia, serif`; g.fillText(s, x + cw / 2, y + ch * 0.78); }
  });
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildCity(inkMat, paper, BU) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(30, 1, 4, 26000);
  
  // plain faces: one tone per face from a low sun (no window grid — reads calmer from the air)
  const sunFace = Fn(() => float(0.84).add(max(dot(normalWorld, vec3(0.45, 0.75, 0.5).normalize()), 0).mul(0.16)))();
  const soft = Fn(() => float(0.9).add(normalWorld.y.mul(0.1)))();
  // water: a tone of its own (darker than the land) with short drawn ripples; far away the ripples average into
  // that tone instead of shimmering, so the sea still reads as sea at the horizon
  const waves = Fn(() => {
    const q = positionWorld.x.div(34).add(positionWorld.z.mul(0.004).sin().mul(1.2));
    const w = fwidth(q).max(1e-4), line = inkLine(fract(q.add(0.5)).sub(0.5));
    const dash = smoothstep(0.45, 0.7, positionWorld.z.mul(0.017).add(floor(q).mul(2.39)).sin().mul(0.5).add(0.5));
    const far = smoothstep(0.08, 0.25, w);
    const d = positionWorld.sub(cameraPosition).length();
    return mix(mix(float(1).sub(line.mul(dash).mul(0.5)), float(0.93), far), float(1.25), smoothstep(5000, 13000, d));   // far sea → plain paper (tone × 0.8 flat = 1): no grey band at the horizon
  })();
  const atlas = texture(adAtlas());
  const adPat = Fn(() => { const k = floor(hash(instanceIndex.add(17)).mul(32)), col = k.sub(floor(k.div(4)).mul(4)), row = floor(k.div(4)); return atlas.uv(vec2(col, row).add(uv()).div(vec2(4, 8))).r.mul(0.95).add(0.05); })();
  const M = {
    tower: inkMat({ color: '#cfc8b8', flat: 1, pattern: sunFace }),
    dark: inkMat({ color: '#2a2724', flat: 0.74, pattern: sunFace }),
    roof: inkMat({ color: '#d8d2c4', flat: 0.93, pattern: soft }),
    island: inkMat({ color: '#6c6862', flat: 0.96 }),
    shore: inkMat({ color: '#6c6862', flat: 0.96 }),
    water: inkMat({ color: '#6c6862', flat: 0.8, pattern: waves }),
    wake: inkMat({ color: '#fff', flat: 0.9 }),
    hull: inkMat({ color: '#fff', flat: 0.97, pattern: sunFace }),
    walk: inkMat({ color: '#a8a296', flat: 0.78 }),
    park: inkMat({ color: '#a8a296', flat: 0.84 }),
    lawn: inkMat({ color: '#a8a296', flat: 0.93 }),
    trees: inkMat({ color: '#3a3a30', flat: 0.7, pattern: soft }),
    car: inkMat({ color: '#e0b020', flat: 0.55 }),
    ad: inkMat({ color: '#fff', flat: 1, pattern: adPat, side: THREE.DoubleSide }),
    ship: inkMat({ color: '#f4f0e8', flat: 0.96, pattern: Fn(() => float(1).sub(smoothstep(0.03, 0.0, abs(fract(uv().x.mul(18)).sub(0.5)).sub(0.47)).mul(0.25)))() }),
    shipDark: inkMat({ color: '#2a2724', flat: 0.6 }),
    cloud: inkMat({ color: '#f4f0e8', flat: 1, pattern: float(1) }),   // clean paper: only the ink outline shows
  };
  setRoles(M, { tower: 'stone', dark: 'ground', roof: 'stone', island: 'stone', shore: 'stone', water: 'ground', walk: 'stone', park: 'ground', lawn: 'stone', trees: 'leaf', car: 'leaf', ad: 'stone', ship: 'stone', shipDark: 'wood', cloud: 'stone', wake: 'stone', hull: 'stone' });   // palette categories (COLOR-GUIDE)
  tagSfx(M, { tower: 'stone', dark: 'stone', roof: 'stone', island: 'stone', shore: 'stone', water: 'water', wake: 'water', hull: 'ship', walk: 'stone', park: 'grass', lawn: 'grass', trees: 'leaves', car: 'car', ad: 'paper', ship: 'ship', shipDark: 'ship', cloud: 'cloud' });   // click sounds
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 24).translate(0, 0.5, 0);
  const plane = new THREE.PlaneGeometry(1, 1);
  const _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
  const mat = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromAxisAngle(_y, ry).clone(), new THREE.Vector3(sx, sy, sz));
  const matQ = (x, y, z, sx, sy, sz, q) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  const inst = (parent, geo, material, list) => { if (!list.length) return null; const m = new THREE.InstancedMesh(geo, material, list.length); list.forEach((x, i) => m.setMatrixAt(i, x)); m.frustumCulled = false; parent.add(m); return m; };

  // ---- fixed ground: water, island, far shores, park, bridges
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 256).rotateX(-Math.PI / 2).translate(0, -1, 0), M.water); scene.add(water);   // a disc round the camera (moved + sized every frame): its rim IS the horizon, at the same distance in every direction, so the drawn horizon line and the setting sun sit exactly on it
  const outline = []; for (let x = -300; x <= 15000; x += 50) outline.push(new THREE.Vector2(x, cz(x) + halfW(x)));
  for (let x = 15000; x >= -300; x -= 50) outline.push(new THREE.Vector2(x, cz(x) - halfW(x)));
  // shape drawn in (x, z); rotateX(+90°) keeps z and turns the extrusion downwards → top face at y = 2.5
  const isl = new THREE.ExtrudeGeometry(new THREE.Shape(outline), { depth: 4, bevelEnabled: false, curveSegments: 1 }).rotateX(Math.PI / 2).translate(0, 2.5, 0);
  scene.add(new THREE.Mesh(isl, M.island));
  // far shores: west (across the wide river) and east (across the narrow one), low-rise grids + a waterfront cluster
  const RIV = 650, SHORE_END = 14200;
  const shoreEdge = (x, side) => cz(x) + side * (halfW(Math.min(Math.max(x, 400), 14000)) + RIV + Math.max(0, x - SHORE_END) ** 2 / 300);   // shores bend away north of the island → open sea
  const shore = [], sLow = [], sDark = [], sRoof = [];
  for (const side of [-1, 1]) {
    const pts = []; for (let x = -3000; x <= 16800; x += 100) pts.push(new THREE.Vector2(x, Math.sign(side) * Math.min(Math.abs(shoreEdge(x, side)), 9000)));
    pts.push(new THREE.Vector2(16800, side * 9000), new THREE.Vector2(-3000, side * 9000));
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(Math.PI / 2);
    { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 1); } g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.computeVertexNormals(); }
    shore.push(g);
    let n = 0;
    for (let x = -2600; x < SHORE_END; x += 110) for (let d = 60; d < 4200; d += 95) {
      n++; const z = shoreEdge(x, side) + side * d; if (rnd(n, side + 3) < 0.28 || Math.abs(z) > 8800) continue;
      const cluster = side < 0 ? Math.exp(-(((x - 900) / 500) ** 2) - ((d - 250) / 400) ** 2) : Math.exp(-(((x - 700) / 600) ** 2) - ((d - 200) / 350) ** 2) * 0.6;
      const h = 14 + rnd(n, 7) ** 2.5 * 50 + cluster * rnd(n, 8) * 380, w = 30 + rnd(n, 9) * 45, dd = 30 + rnd(n, 10) * 40;
      (rnd(n, 11) < 0.2 ? sDark : sLow).push(mat(x + (rnd(n, 12) - 0.5) * 20, 1, z, w, h, dd)); sRoof.push(mat(x, 1 + h, z, w + 1, 1, dd + 1));
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(shore), M.shore));
  inst(scene, box, M.tower, sLow); inst(scene, box, M.dark, sDark); inst(scene, box, M.roof, sRoof);
  // bridges over the east river (deck + two towers)
  const br = [];
  for (const bx of [520, 980, 2250, 5320]) {
    const z0 = cz(bx) + halfW(bx) - 30, z1 = shoreEdge(bx, 1) + 60, L = z1 - z0, zc = (z0 + z1) / 2;
    br.push(mat(bx, 30, zc, 16, 3, L)); for (const t of [0.25, 0.75]) br.push(mat(bx, 0, z0 + L * t, 20, 80, 8));
  }
  inst(scene, box, M.roof, br);
  // ships on the rivers and out in the bay: hull (pointed bow) + deck house + funnel, each with a pale wake
  const hullGeo = mergeGeometries([
    new THREE.BoxGeometry(1, 0.35, 0.28).translate(0, 0.175, 0),
    new THREE.CylinderGeometry(0, 0.14, 0.3, 4, 1).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 1.17, 1).translate(0.65, 0.175, 0),
    new THREE.BoxGeometry(0.3, 0.2, 0.2).translate(-0.12, 0.45, 0),
    new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8).translate(-0.05, 0.64, 0),
  ].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
  const wakeGeo = new THREE.BufferGeometry(); wakeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.2, 0, 0, -1.8, 0, 0.45, -1.8, 0, -0.45], 3)); wakeGeo.computeVertexNormals();
  if (wakeGeo.attributes.normal.getY(0) < 0) wakeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.2, 0, 0, -1.8, 0, -0.45, -1.8, 0, 0.45], 3));
  wakeGeo.computeVertexNormals();
  const NS = 46, ships = new THREE.InstancedMesh(hullGeo, M.hull, NS), wakes = new THREE.InstancedMesh(wakeGeo, M.wake, NS);
  ships.frustumCulled = wakes.frustumCulled = false; scene.add(ships, wakes);
  const S = []; for (let i = 0; i < NS; i++) { const side = i % 2 ? 1 : -1, L = 45 + rnd(i, 60) ** 2 * 110; S.push({ side, x: -2400 + rnd(i, 61) * 18000, off: (rnd(i, 62) - 0.5) * RIV * 0.6, v: (rnd(i, 63) < 0.5 ? 1 : -1) * (6 + rnd(i, 64) * 14), L }); }
  const _sq = new THREE.Quaternion(), _sp = new THREE.Vector3(), _ss = new THREE.Vector3();
  const moveShips = (dt) => {
    for (let i = 0; i < NS; i++) {
      const s = S[i]; s.x += s.v * dt; if (s.x > 17500) s.x = -2400; if (s.x < -2400) s.x = 17500;
      const z = s.side * (halfW(Math.min(Math.max(s.x, -300), 15000)) + RIV / 2 + Math.max(0, s.x - SHORE_END) ** 2 / 600) + s.off;
      _sq.setFromAxisAngle(_y, s.v > 0 ? 0 : Math.PI);
      ships.setMatrixAt(i, _m.compose(_sp.set(s.x, -1.2, z), _sq, _ss.set(s.L, s.L * 0.9, s.L)));
      wakes.setMatrixAt(i, _m.compose(_sp.set(s.x, -0.6, z), _sq, _ss.set(s.L, 1, s.L * 0.8)));
    }
    ships.instanceMatrix.needsUpdate = wakes.instanceMatrix.needsUpdate = true;
  };
  // the park: lawn slab, meadows, lake + reservoir, trees
  const pz = cz((PARK.x0 + PARK.x1) / 2);
  const parkM = new THREE.Mesh(new THREE.BoxGeometry(PARK.x1 - PARK.x0, 1, PARK.hw * 2).translate((PARK.x0 + PARK.x1) / 2, 2.5, pz), M.park); scene.add(parkM);
  const lawns = [[5780, 5960, -40, 110], [6560, 6860, 0, 120]];
  lawns.forEach(([a, b, zz, w]) => scene.add(new THREE.Mesh(new THREE.BoxGeometry(b - a, 1, w).translate((a + b) / 2, 3.1, pz + zz), M.lawn)));
  const pond = (x, z, rx, rz) => new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48).scale(rx, 1, rz).translate(x, 3.1, z), M.water);
  scene.add(pond(7120, pz, 210, 130), pond(6180, pz + 40, 110, 55), pond(7700, pz - 60, 70, 40));
  const trees = []; const treeGeo = new THREE.IcosahedronGeometry(1, 1).translate(0, 0.6, 0);
  for (let i = 0; i < 1500; i++) {
    const x = PARK.x0 + 8 + rnd(i, 40) * (PARK.x1 - PARK.x0 - 16), z = pz + (rnd(i, 41) - 0.5) * (PARK.hw * 2 - 14);
    if (lawns.some(([a, b, zz, w]) => x > a && x < b && Math.abs(z - pz - zz) < w / 2)) continue;
    if ((((x - 7120) / 220) ** 2 + ((z - pz) / 140) ** 2) < 1 || (((x - 6180) / 120) ** 2 + ((z - pz - 40) / 65) ** 2) < 1 || (((x - 7700) / 80) ** 2 + ((z - pz + 60) / 50) ** 2) < 1) continue;
    const r = 11 + rnd(i, 42) * 9; trees.push(mat(x, 3, z, r, r * 0.8, r, rnd(i, 43) * 6));
  }
  inst(scene, treeGeo, M.trees, trees);

  // ---- the grid (rebuilt when the spacing controls change)
  let blocks = null;
  function build({ street = 1.3, gap = 6 } = {}) {
    if (blocks) { blocks.traverse((o) => o.isInstancedMesh && o.dispose()); scene.remove(blocks); }
    blocks = new THREE.Group(); scene.add(blocks);
    const BX = 62, BZ = 185, SX = 13 * street, SZ = 24 * street, PX = BX + SX, PZ = BZ + SZ;
    const L = { walk: [], body: [], dark: [], roof: [], cyl: [], cylDark: [], wt: [], spire: [], ad: [] };
    let id = 0;
    for (let bx = Math.floor(-300 / PX); bx < 15000 / PX; bx++) for (let bz = Math.floor(-1200 / PZ); bz <= 1200 / PZ; bz++) {
      const cx = bx * PX + PX / 2, czz = bz * PZ + PZ / 2 + 0;
      const x0 = cx - BX / 2, x1 = cx + BX / 2, z0 = czz - BZ / 2, z1 = czz + BZ / 2;
      if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([x, z]) => inIsland(x, z, 25))) continue;
      if (x1 > PARK.x0 && x0 < PARK.x1 && Math.abs(czz - cz(cx)) < PARK.hw + BZ / 2) continue;     // the park
      // zones → base height and the chance of a tall one
      const downtown = Math.exp(-(((cx - 450) / 520) ** 2) - ((czz - cz(cx)) / 520) ** 2);
      const midtown = Math.exp(-(((cx - 4300) / 950) ** 2) - ((czz - cz(cx)) / 700) ** 2);
      const parkWall = cx > PARK.x0 - 80 && cx < PARK.x1 + 80 && Math.abs(Math.abs(czz - cz(cx)) - PARK.hw - BZ / 2 - SZ) < BZ ? 1 : 0;
      const uptown = cx > PARK.x0 - 200 ? 1 : 0;
      const core = Math.max(downtown, midtown);
      const billionaire = cx > 5360 && cx < 5580 && Math.abs(czz - cz(cx)) < 520;
      const lots = 2 + Math.floor(rnd(bx * 7, bz) * 3);
      for (let l = 0; l < lots; l++) {
        id++;
        const lw = BZ / lots, lz = z0 + lw * (l + 0.5);
        if (Math.abs(lz - BWAY(cx)) < 16 + lw / 2 * 0.2) continue;                 // broadway
        let w = BX - gap, d = lw - gap;
        const r1 = rnd(id, 1), r2 = rnd(id, 2), r3 = rnd(id, 3);
        let h = (uptown ? (parkWall ? 90 : 55) : 42) * (0.6 + r1 * 0.9);
        const tall = r2 < core * 0.75;
        if (tall) h = 160 + core * 620 * (0.35 + rnd(id, 4) * 0.65);
        else if (r2 < 0.04) h *= 2.2;
        const darkT = rnd(id, 5) < (tall ? 0.38 : 0.18), body = darkT ? L.dark : L.body;
        // shape: 0 slab, 1 slender, 2 setback, 3 podium + tower, 4 round
        let shape = tall ? [1, 2, 2, 3, 3, 0, 0][Math.floor(rnd(id, 6) * 7)] : (r3 < 0.1 ? 1 : 0);   // box towers only (no round ones)
        if (billionaire && l === 0) { shape = 1; h = 520 + rnd(id, 7) * 300; }
        let y = 2.6, top = h;
        if (shape === 1) { const s = 0.38 + rnd(id, 8) * 0.25; w *= s * (billionaire ? 0.6 : 1); d = Math.min(d, w * (1 + rnd(id, 9))); body.push(mat(cx, y, lz, w, h, d)); L.roof.push(mat(cx, y + h, lz, w + 1, 1, d + 1)); }
        else if (shape === 4) { const r = Math.min(w, d) * (0.6 + rnd(id, 10) * 0.3); (darkT ? L.cylDark : L.cyl).push(mat(cx, y, lz, r, h, r)); L.cyl.push(mat(cx, y + h, lz, r * 0.8, 3, r * 0.8)); }
        else if (shape === 3) { const ph = 30 + rnd(id, 11) * 40; L.body.push(mat(cx, y, lz, w, ph, d)); L.roof.push(mat(cx, y + ph, lz, w + 1, 1, d + 1)); const tw = w * (0.45 + rnd(id, 12) * 0.2), td = d * (0.5 + rnd(id, 13) * 0.3); body.push(mat(cx, y + ph, lz, tw, h - ph, td)); L.roof.push(mat(cx, y + h, lz, tw + 1, 1, td + 1)); w = tw; d = td; }
        else if (shape === 2) { let tw = w, td = d, yy = y; const tiers = 2 + Math.floor(rnd(id, 14) * 2); for (let t = 0; t < tiers; t++) { const th = t === tiers - 1 ? h - (yy - y) : (h - (yy - y)) * (0.5 + rnd(id, 15 + t) * 0.2); body.push(mat(cx, yy, lz, tw, th, td)); L.roof.push(mat(cx, yy + th, lz, tw + 1, 1, td + 1)); yy += th; tw *= 0.74; td *= 0.74; } w = tw / 0.74; d = td / 0.74; }
        else { body.push(mat(cx, y, lz, w, h, d)); L.roof.push(mat(cx, y + h, lz, w + 1, 1, d + 1)); }
        top = y + h;
        if (tall && h > 500 && rnd(id, 20) < 0.45) L.spire.push(mat(cx, top, lz, Math.min(w, d) * 0.18, 40 + rnd(id, 21) * 110, Math.min(w, d) * 0.18));
        if (!tall && h < 110 && rnd(id, 22) < 0.14) L.wt.push(mat(cx + (rnd(id, 23) - 0.5) * w * 0.4, top + 1, lz + (rnd(id, 24) - 0.5) * d * 0.4, 1, 1, 1));
        // ads: painted on low roofs (seen from above), boards facing the flight (−x) on facades, a dense cluster at the "square"
        const square = Math.exp(-(((cx - 4050) / 160) ** 2) - ((lz - BWAY(cx)) / 140) ** 2);
        if (!tall && shape === 0 && rnd(id, 25) < 0.07) { const aw = Math.min(w, d) * 0.8; L.ad.push(matQ(cx, top + 1.8, lz, aw, aw * 0.5, 1, new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)))); }
        const nb = rnd(id, 26) < square ? 3 + Math.floor(rnd(id, 27) * 4) : rnd(id, 28) < 0.05 ? 1 : 0;
        for (let k = 0; k < nb; k++) {
          const aw = Math.min(d * 0.9, 18 + rnd(id, 30 + k) * 30), ah = aw * 0.5, ay = y + 8 + rnd(id, 34 + k) * Math.min(h * 0.8, 120);
          if (ay + ah > top) continue;
          const face = rnd(id, 40 + k) < 0.6 ? 0 : 1;
          if (face === 0) L.ad.push(matQ(cx - (shape === 1 || shape === 3 ? w : BX - gap) / 2 - 1.5, ay, lz + (rnd(id, 44 + k) - 0.5) * (d - aw) * 0.8, aw, ah, 1, new THREE.Quaternion().setFromAxisAngle(_y, -Math.PI / 2)));
          else { const sd = rnd(id, 48 + k) < 0.5 ? -1 : 1; L.ad.push(matQ(cx + (rnd(id, 52 + k) - 0.5) * Math.max(0, w - aw), ay, lz + sd * ((shape === 1 || shape === 3 ? d : lw - gap) / 2 + 1.5), aw, ah, 1, new THREE.Quaternion().setFromAxisAngle(_y, sd > 0 ? 0 : Math.PI))); }
        }
      }
    }
    inst(blocks, box, M.walk, L.walk); inst(blocks, box, M.tower, L.body); inst(blocks, box, M.dark, L.dark); inst(blocks, box, M.roof, L.roof);
    inst(blocks, cyl, M.tower, L.cyl); inst(blocks, cyl, M.dark, L.cylDark);
    inst(blocks, wtGeo, M.roof, L.wt); inst(blocks, new THREE.ConeGeometry(0.5, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), M.roof, L.spire);
    inst(blocks, plane, M.ad, L.ad);
    lanes = []; for (let k = Math.floor(-1200 / PZ); k <= 1200 / PZ; k++) lanes.push(k * PZ);
  }
  const wtGeo = mergeGeometries([new THREE.CylinderGeometry(3, 3, 7, 12).translate(0, 7.5, 0), new THREE.ConeGeometry(3.4, 2.6, 12).translate(0, 12.3, 0),
    ...[0, 1, 2, 3].map((k) => new THREE.CylinderGeometry(0.25, 0.25, 4, 5).translate(Math.cos(k * 1.57 + 0.78) * 2.2, 2, Math.sin(k * 1.57 + 0.78) * 2.2))].map((g) => { g.deleteAttribute('uv'); return g; }));
  let lanes = [0];
  build();

  // taxis on the avenues (along x); off-island ones are parked out of sight
  const NC = 2600, cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 1.8, 2.2).translate(0, 0.9, 0), M.car, NC); cars.frustumCulled = false; scene.add(cars);
  const C = []; for (let i = 0; i < NC; i++) { const dir = rnd(i, 2) < 0.5 ? 1 : -1; C.push({ lane: rnd(i, 1), x: -300 + rnd(i, 3) * 15300, off: dir * (2.5 + rnd(i, 4) * 5), v: dir * (14 + rnd(i, 5) * 16) }); }
  const _m = new THREE.Matrix4();

  // dirigible: envelope with gores, fins, gondola, a banner each side
  const ship = new THREE.Group();
  ship.add(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20).rotateZ(Math.PI / 2).scale(115, 36, 36), M.ship));
  for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(34, 26, 1.5).translate(0, 13 + 14, 0), M.ship); f.position.x = -92; f.rotation.x = k * Math.PI / 2; ship.add(f); }
  ship.add(new THREE.Mesh(new THREE.BoxGeometry(44, 10, 12).translate(8, -41, 0), M.shipDark));
  const bannerQ = [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(_y, Math.PI)];
  const banners = new THREE.InstancedMesh(plane, M.ad, 2); bannerQ.forEach((q, i) => banners.setMatrixAt(i, matQ(0, 0, i ? -37 : 37, 110, 26, 1, q))); ship.add(banners);
  ship.traverse((o) => (o.frustumCulled = false));
  scene.add(ship);

  // clouds: clumps of puffs (each puff its own piece id → illustrated outlines between puffs)
  const puffs = [];
  for (let c = 0; c < 150; c++) {
    const cx = -500 + rnd(c, 1) * 16500, czz = (rnd(c, 2) - 0.5) * 8000, cy = 1550 + rnd(c, 3) * 550, S = 70 + rnd(c, 4) * 150;
    if (cx > 1500 && Math.abs(czz) < 1500) continue;   // not over the flight path (they filled the frame on the way down)
    if (cx > 13000) continue;   // farther ones print without outlines (past the line cut): pale ghosts
    if (cx > 1500 && czz < 0 && czz > -0.22 * cx - 900) continue;   // not in front of the setting sun (it lies a little to −z): its ring must stay whole
    const n = 7 + Math.floor(rnd(c, 5) * 9);
    for (let k = 0; k < n; k++) {
      const g = new THREE.SphereGeometry(1, 24, 16), r = S * (0.35 + rnd(c * 31 + k, 6) * 0.45);
      g.scale(r * 1.25, r * 0.8, r); g.translate(cx + (rnd(c * 31 + k, 7) - 0.5) * S * 2.6, cy + rnd(c * 31 + k, 8) * S * 0.45 + r * 0.25, czz + (rnd(c * 31 + k, 9) - 0.5) * S * 1.6);
      { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < cy) p.setY(i, cy - (cy - y) * 0.22); } g.computeVertexNormals(); }   // flat bellies
      const t = rnd(c * 31 + k, 10), uvs = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < uvs.length; i += 2) uvs[i] = t;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); puffs.push(g);
    }
  }
  const clouds = new THREE.Mesh(mergeGeometries(puffs), M.cloud); clouds.frustumCulled = false; clouds.castShadow = clouds.receiveShadow = false; clouds.userData.sunFlag = 1; scene.add(clouds);   // no cast / received shadows (they drew polygons)

  // ---- the planet (seen when the camera rises far above the city): paper continents, ocean tone, cloud swirls,
  // a lit and a shaded side, ink coastlines; ink-dot stars around it. The city spot sits at its top.
  const R = 40000, SWITCH = 12000;
  const planet = new THREE.Group(); planet.visible = false; scene.add(planet);
  const pn = positionLocal.normalize();
  // hard land mask (a step, not a ramp) → the coastline is a one-pixel id change, drawn as the same thin ink line
  const landF = Fn(() => {
    const f = mx_noise_float(pn.mul(1.7)).add(mx_noise_float(pn.mul(3.9)).mul(0.5)).add(mx_noise_float(pn.mul(8.3)).mul(0.25)).add(mx_noise_float(pn.mul(19)).mul(0.12));
    return step(0.065, f.add(smoothstep(0.9, 0.995, pn.y).mul(0.6)).sub(0.04));
  })();
  const planetMat = inkMat({ color: '#fff', flat: 1, strokeK: 3 / R });          // plain paper, no grey shading — just the lines
  planetMat.mrtNode = mrt({ id: vec4(landF.mul(0.5).add(0.25), 0, 0, 1) });
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), planetMat));
  const stars = []; for (let i = 0; i < 1400; i++) { const u = rnd(i, 80) * 2 - 1, a = rnd(i, 81) * 6.283, k = Math.sqrt(1 - u * u), d = R * (1000 + rnd(i, 82) * 400), s = d * (0.0009 + rnd(i, 83) ** 3 * 0.0025); stars.push(mat(Math.cos(a) * k * d, u * d, Math.sin(a) * k * d, s, s, s)); }
  inst(planet, new THREE.IcosahedronGeometry(1, 1), inkMat({ color: '#000', flat: 0.25 }), stars);
  const earth = planet.children[0];
  planet.userData.sfx = 'planet';   // click sound
  const micro = buildMicro(inkMat, R, BU); planet.add(micro.atom, micro.cell);
  planet.traverse((o) => (o.frustumCulled = false));
  const anchor = new THREE.Vector3();
  const setStage = (st, k = 0) => { micro.appear.value = st === 'cell' ? k : 0; micro.cell.visible = st === 'cell'; micro.atom.visible = earth.visible = !(st === 'cell' && k >= 1); };
  // paper white-out while the view switches from the flat city to the globe
  const veil = (alt) => THREE.MathUtils.smoothstep(alt, SWITCH - 3000, SWITCH) * (1 - THREE.MathUtils.smoothstep(alt, SWITCH, SWITCH + 5000));

  // far out the camera sits millions of units from the origin — the node background (a sphere around the camera,
  // matrices multiplied on the GPU in float32) falls apart there and renders black; use a flat paper clear instead
  // … so in space the paper is a full-screen quad written straight in clip space (no world matrices at all), with the
  // exact same paper tone as the sky
  let bgNode = scene.backgroundNode;
  const bgMat = new THREE.MeshBasicNodeMaterial({ depthWrite: false }); bgMat.vertexNode = vec4(attribute('position', 'vec3').xy, 0.99999, 1); bgMat.colorNode = paper.pow(2.2); bgMat.toneMapped = false;
  bgMat.mrtNode = mrt({ id: vec4(0) });
  const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat); bgQuad.frustumCulled = false; bgQuad.renderOrder = -1000; planet.add(bgQuad);
  // the sun: a round ink-outlined disc drawn in the sky itself, anchored to the sea's visible edge — the sea (real
  // geometry) covers whatever is below it, so the sun sets BEHIND the horizon, never onto the water
  let sunK = 0; const setSun = (k) => { sunK = THREE.MathUtils.clamp(k, 0, 1); };
  const sunEl = uniform(0.05), horEl = uniform(0), SUN_R = 0.045;
  scene.backgroundNode = Fn(() => {
    const d = positionLocal.normalize(), el = asin(d.y.clamp(-1, 1));
    const sd = vec3(cos(sunEl), sin(sunEl), -0.14).normalize();
    const ang = acos(dot(d, sd).clamp(-1, 1)), fw = fwidth(ang).max(1e-6);
    const ring = float(1).sub(smoothstep(fw.mul(0.6), fw.mul(1.6), abs(ang.sub(SUN_R)))).mul(step(horEl, el));
    // the horizon: an ink line of the site's line width, lying on the sea's rim (the sea covers everything under it)
    const fe = fwidth(el).max(1e-7), hw = LINE.w.mul(0.5).max(0.5), hz = float(1).sub(smoothstep(hw.sub(0.5), hw.add(0.5), abs(el.sub(horEl).div(fe).sub(hw))));
    return mix(paper.pow(2.2), vec3(BU.ink).pow(2.2), max(ring.mul(0.75), hz.mul(0.9)));
  })();
  bgNode = scene.backgroundNode;
  const update = (t, dt) => {
    const alt = cam.position.y, space = alt > SWITCH;
    if (space && scene.backgroundNode) { scene.backgroundNode = null; scene.background = null; }
    else if (!space && !scene.backgroundNode) { scene.background = null; scene.backgroundNode = bgNode; }
    for (const o of scene.children) o.visible = o === planet ? space : !space;
    const nr = Math.max(4, alt * 0.02), fr = Math.max(70000, alt * 4 + R * 1600);
    if (cam.near !== nr || cam.far !== fr) { cam.near = nr; cam.far = fr; cam.updateProjectionMatrix(); }
    if (space) { planet.position.set(anchor.x, -R, anchor.z); micro.update(t); return; }
    { const e = THREE.MathUtils.smoothstep(sunK, 0, 0.7), seaEdge = Math.min(cam.far * 0.98, 110000);
      horEl.value = -Math.atan2(Math.max(1, cam.position.y + 1), seaEdge);   // the sea's visible edge (below eye level)
      water.position.set(cam.position.x, 0, cam.position.z); water.scale.set(seaEdge, 1, seaEdge);
      sunEl.value = horEl.value + SUN_R * THREE.MathUtils.lerp(0.4, -1.2, e); }   // already setting (a bit under), then gone   // sets behind the sea horizon (the water plane hides it)
    for (let i = 0; i < NC; i++) {
      const c = C[i]; c.x += c.v * dt; if (c.x > 15000) c.x = -300; if (c.x < -300) c.x = 15000;
      const z = lanes[Math.floor(c.lane * lanes.length)] + c.off;
      if (inIsland(c.x, z, 15) && !inPark(c.x, z, 4)) _m.makeTranslation(c.x, 2.6, z); else _m.makeTranslation(0, -500, 0);
      cars.setMatrixAt(i, _m);
    }
    cars.instanceMatrix.needsUpdate = true;
    moveShips(dt);
    // the airship circles slowly over midtown and the park, nose along its path
    const a = t * 0.018, RA = 1150, X = 6000 + Math.cos(a) * RA, Z = 250 + Math.sin(a) * RA * 0.7;
    ship.position.set(X, 1380 + Math.sin(t * 0.3) * 6, Z);
    ship.rotation.y = Math.atan2(-Math.cos(a) * RA * 0.7, -Math.sin(a) * RA);
  };
  let tm = null;
  const setLayout = (o) => { clearTimeout(tm); tm = setTimeout(() => build(o), 250); };
  return { scene, cam, update, setLayout, veil, anchor, setStage, R, micro, setSun, earth };
}
