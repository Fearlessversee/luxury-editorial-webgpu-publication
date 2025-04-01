import * as THREE from 'three';
import { playSfx } from './sound.js';

// Hidden modules: six objects in the dream can be "scanned" — the black ink the cursor leaves behind reveals a
// small "press and hold to discover" tag pinned to the object. Hold it for a second → the module is found (a
// notification + a short futuristic blip), and it shows up in the STORAGE (key F / the button top-left): a blurred
// overlay with the collection grid, a slowly turning wireframe of the object, its rarity and a note. A found module
// is collected at once (its card turns cream); the last one plays the win. Esc / CLOSE leave the storage.
// All UI here is plain DOM on top of the canvas (after the Figma frames "SHOTS | 2026", PP Supply Mono 10 px).

export const MODULES = [
  { id: 'crow', name: 'THE CROW', rarity: 1, place: 'LAKE' },
  { id: 'sphere', name: "FORTUNE TELLER'S SPHERE", rarity: 2, place: 'CHURCH' },
  { id: 'chandelier', name: 'IRON CHANDELIER', rarity: 2, place: 'CHURCH' },
  { id: 'door', name: 'THE CHURCH DOOR', rarity: 3, place: 'CHURCH' },
  { id: 'car', name: 'OLD SEDAN', rarity: 1, place: 'STREET' },
  { id: 'earth', name: 'THE EARTH', rarity: 2, place: 'ORBIT' },
];
const IDS = new Set(MODULES.map((m) => m.id));
// each module's note (in the voice of a writer lost inside their own story) + the three lines of metadata under it
const NOTES = {
  crow: { text: `IT WATCHED YOU FROM THE PIER LONG BEFORE YOU KNEW YOU WERE BEING WATCHED. BLACK FEATHERS, BLACK WATER, ONE BRIGHT EYE. THE ONLY WITNESS THAT NEVER BLINKED.

IN THE FIRST DRAFT THE CROW WAS JUST A BIRD. IN THE DRAFT THAT WROTE YOU, IT WAS THE ONE KEEPING THE PAGES FROM BLOWING AWAY.

ASK IT WHERE THE LAKE ENDS. IT WILL TELL YOU THE TRUTH: IT DOESN'T. IT ONLY GETS DEEPER.`, meta: ['THE NIGHT THE LAKE WENT STILL', '1993', '#0007'] },
  sphere: { text: `SHE SAID THE GLASS SHOWS WHAT IS ALREADY WRITTEN. SHE LIED. IT SHOWS WHAT IS BEING WRITTEN, RIGHT NOW, IN A HAND THAT LOOKS A LOT LIKE YOURS.

LOOK CLOSER. THE ROOM INSIDE THE SPHERE HAS A SPHERE IN IT, AND A ROOM INSIDE THAT. EVERY REFLECTION IS A DRAFT. NONE OF THEM ARE FINAL.

PUT IT DOWN BEFORE IT FINISHES THE SENTENCE. SOME ENDINGS ONLY COME TRUE ONCE THEY ARE READ.`, meta: ['THE READING THAT NEVER ENDED', '1971', '#0013'] },
  chandelier: { text: `FORTY CANDLES, NONE OF THEM LIT. IT STILL SWINGS, THOUGH THERE IS NO WIND IN HERE. ONLY THE SLOW BREATH OF SOMETHING UNDER THE FLOORBOARDS.

LIGHT WAS THE ONLY RULE THAT EVER KEPT THE DARK POLITE. SOMEONE TOOK THE FLAMES AND LEFT THE IRON, LIKE A CAGE STILL WAITING FOR ITS BIRD.

HOLD IT STILL AND IT REMEMBERS. LET GO AND IT GOES BACK TO COUNTING THE SECONDS UNTIL MIDNIGHT.`, meta: ['THE LAST MASS BEFORE THE FLOOD', '1954', '#0021'] },
  door: { text: `EVERY STORY HAS ONE DOOR THAT ISN'T ON THE BLUEPRINTS. THIS ONE WAS MADE TO STAY LOCKED, AND THE KEYHOLE WAS MADE TO BE LOOKED THROUGH.

ON THE OTHER SIDE: THE SAME STREET, THE SAME CHURCH, THE SAME YOU. ONLY THE SHADOWS ARRIVE HALF A SECOND LATE.

YOU ALREADY OPENED IT. YOU ARE READING THIS BECAUSE YOU DID. THE QUESTION IS WHO CLOSED IT BEHIND YOU.`, meta: ['THE NIGHT YOU LOOKED THROUGH', '2019', '#0033'] },
  car: { text: `ENGINE COLD, HEADLIGHTS ON. IT HAS BEEN PARKED ON THIS STREET FOR DECADES AND THE ODOMETER KEEPS CLIMBING.

NOBODY DRIVES IT. SOMETHING DRIVES IT, AT NIGHT, DOWN ROADS THAT LOOP BACK INTO THEMSELVES LIKE A CHAPTER YOU KEEP REWRITING.

THE RADIO STILL PLAYS. SAME SONG, SAME STATIC, SAME VOICE BETWEEN THE STATIONS TELLING YOU TO WAKE UP.`, meta: ['LAST SEEN LEAVING TOWN', '1978', '#0028'] },
  earth: { text: `FROM UP HERE IT LOOKS FINISHED. BLUE, QUIET, TURNING LIKE A THOUGHT YOU CAN'T LET GO OF.

BUT YOU HAVE READ ENOUGH OF THIS TO KNOW: THE HIGHER YOU CLIMB, THE SMALLER THE STORY GETS, UNTIL THE WHOLE WORLD FITS INSIDE ONE WORD YOU FORGOT TO WRITE.

IT IS NOT A PLANET. IT IS A PAGE. SOMEWHERE ON IT, YOU ARE STILL ASLEEP.`, meta: ['FROM THE DAY YOU FIRST MET', '2064', '#0039'] },
};
const CREAM = '#f1e8d0', INK = '#0b0a08', PAPER = '#d8ceb1';
const STORE = 'awaken-modules-v1';

// ---------------------------------------------------------------- models: triangles (for the silhouette) + wire lines
// Drawn on the GPU (a small WebGL2 context of its own): the triangles fill a mask, the contour is that mask grown by a
// pixel or two minus the mask itself (one line round the whole object, nothing inside); the wire is every edge at 10 %.
const LOWSPHERE = new THREE.SphereGeometry(1, 14, 10);
const WIRE_MAX = 60000;   // triangles whose edges make the faint wire (a denser mesh is thinned evenly)
function buildModel(tris, wire = null) {
  const nT = tris.length / 9; if (!nT) return null;
  let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30;
  for (let i = 0; i < tris.length; i += 3) { const x = tris[i], y = tris[i + 1], z = tris[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2, k = 1 / Math.max(y1 - y0, (x1 - x0) * 0.8, (z1 - z0) * 0.8, 1e-6);
  const T = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) { T[i] = (tris[i] - cx) * k; T[i + 1] = (tris[i + 1] - cy) * k; T[i + 2] = (tris[i + 2] - cz) * k; }
  let L;
  if (wire) { L = new Float32Array(wire.length); for (let i = 0; i < wire.length; i += 3) { L[i] = (wire[i] - cx) * k; L[i + 1] = (wire[i + 1] - cy) * k; L[i + 2] = (wire[i + 2] - cz) * k; } }
  else {
    const step = Math.max(1, Math.ceil(nT / WIRE_MAX)), n = Math.ceil(nT / step); L = new Float32Array(n * 18); let o = 0;
    for (let t = 0; t < nT; t += step) { const b = t * 9; for (const [a, c] of [[0, 3], [3, 6], [6, 0]]) { for (let j = 0; j < 3; j++) L[o++] = T[b + a + j]; for (let j = 0; j < 3; j++) L[o++] = T[b + c + j]; } }
    L = L.subarray(0, o);
  }
  return { T, L, buf: null };
}
function collectModel(root, tess = 0) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), m = new THREE.Matrix4(), im = new THREE.Matrix4(), M2 = new THREE.Matrix4(), v = new THREE.Vector3(), parts = [];
  let n = 0;
  const add = (geo, M) => {
    const p = geo.attributes.position; if (!p) return;
    const idx = geo.index ? geo.index.array : null, cnt = idx ? idx.length : p.count, nv = cnt - (cnt % 3), e = M.elements, o3 = new Float32Array(nv * 3);
    const fast = !p.isInterleavedBufferAttribute && !p.normalized && p.itemSize === 3, src = p.array;
    for (let i = 0, o = 0; i < nv; i++) {
      const vi = idx ? idx[i] : i; let x, y, z;
      if (fast) { x = src[vi * 3]; y = src[vi * 3 + 1]; z = src[vi * 3 + 2]; } else { x = p.getX(vi); y = p.getY(vi); z = p.getZ(vi); }
      o3[o++] = e[0] * x + e[4] * y + e[8] * z + e[12]; o3[o++] = e[1] * x + e[5] * y + e[9] * z + e[13]; o3[o++] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    parts.push(o3); n += o3.length;
  };
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.noWire) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.noWire) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    if (o.isInstancedMesh) {
      const g = o.geometry.attributes.position.count > 700 ? LOWSPHERE : o.geometry;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, im); add(g, M2.multiplyMatrices(m, im)); }
    } else add(o.geometry, m);
  });
  const tris = new Float32Array(n); let o = 0; for (const p of parts) { tris.set(p, o); o += p.length; }
  return buildModel(tess ? tessellate(tris, tess) : tris);
}
// split every triangle whose longest edge is over size/n (halving the longest edge) — a plain model gets a dense,
// even mesh, so its wire reads as detailed as the scanned-looking ones
function tessellate(tris, n, cap = 90000) {
  let x0 = 1e30, x1 = -1e30, y0 = 1e30, y1 = -1e30, z0 = 1e30, z1 = -1e30;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); y0 = Math.min(y0, tris[i + 1]); y1 = Math.max(y1, tris[i + 1]); z0 = Math.min(z0, tris[i + 2]); z1 = Math.max(z1, tris[i + 2]); }
  const L = Math.max(x1 - x0, y1 - y0, z1 - z0) / n, L2 = L * L, out = [], stack = [];
  for (let i = 0; i < tris.length; i += 9) stack.push(Array.from(tris.subarray(i, i + 9)));
  while (stack.length) {
    const t = stack.pop();
    const d = (a, b) => (t[a] - t[b]) ** 2 + (t[a + 1] - t[b + 1]) ** 2 + (t[a + 2] - t[b + 2]) ** 2;
    const e0 = d(0, 3), e1 = d(3, 6), e2 = d(6, 0), m = Math.max(e0, e1, e2);
    if (m <= L2 || out.length / 9 + stack.length >= cap) { out.push(...t); continue; }
    const [a, b, c] = m === e0 ? [0, 3, 6] : m === e1 ? [3, 6, 0] : [6, 0, 3];   // split edge a-b at its middle
    const M = [(t[a] + t[b]) / 2, (t[a + 1] + t[b + 1]) / 2, (t[a + 2] + t[b + 2]) / 2], P = (k) => [t[k], t[k + 1], t[k + 2]];
    stack.push([...P(a), ...M, ...P(c)], [...M, ...P(b), ...P(c)]);
  }
  return new Float32Array(out);
}
function globeModel() {   // the Earth: a sphere for the outline, meridians + parallels for the wire
  const g = new THREE.SphereGeometry(0.5, 48, 32), p = g.attributes.position, idx = g.index.array, tris = new Float32Array(idx.length * 3);
  for (let i = 0; i < idx.length; i++) { tris[i * 3] = p.getX(idx[i]); tris[i * 3 + 1] = p.getY(idx[i]); tris[i * 3 + 2] = p.getZ(idx[i]); }
  const s = [], R = 0.5, seg = 72;
  for (let m = 0; m < 24; m++) { const a = (m / 24) * Math.PI * 2; for (let i = 0; i < seg; i++) { const t0 = (i / seg) * Math.PI, t1 = ((i + 1) / seg) * Math.PI; s.push(R * Math.sin(t0) * Math.cos(a), R * Math.cos(t0), R * Math.sin(t0) * Math.sin(a), R * Math.sin(t1) * Math.cos(a), R * Math.cos(t1), R * Math.sin(t1) * Math.sin(a)); } }
  for (let q = 1; q < 18; q++) { const t = (q / 18) * Math.PI, r = R * Math.sin(t), y = R * Math.cos(t); for (let i = 0; i < seg; i++) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; s.push(r * Math.cos(a0), y, r * Math.sin(a0), r * Math.cos(a1), y, r * Math.sin(a1)); } }
  return buildModel(tris, new Float32Array(s));
}

// ---- the little GPU renderer (one WebGL2 context, reused for the viewer, the cards and the icons)
let GL = null;   // the shared offscreen one (cards, icons); the storage viewer has its own, on its visible canvas
const glInit = () => (GL !== null ? GL : (GL = glMake(document.createElement('canvas'))));
function glMake(cv) {
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
  if (!gl) return false;
  let G;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; };
  const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); return p; };
  // same projection as before: turn about Y by `ang`, tilt about X, a mild perspective; pixel space, y down
  const geo = prog(`#version 300 es
in vec3 p; uniform vec4 A; uniform vec3 S;
void main(){ float x1 = p.x*A.x + p.z*A.y, z1 = -p.x*A.y + p.z*A.x, y1 = p.y*A.z - z1*A.w, z2 = p.y*A.w + z1*A.z;
  float k = S.z / (1.0 + z2*0.35); vec2 s = vec2(x1, y1) * k;   // from the centre, in px
  gl_Position = vec4(s.x / S.x, s.y / S.y, 0.0, 1.0); }`, `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`);
  const comp = prog(`#version 300 es
in vec3 p; out vec2 uv; void main(){ uv = p.xy*0.5 + 0.5; gl_Position = vec4(p.xy, 0.0, 1.0); }`, `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D M, L; uniform vec2 px; uniform float r, wa, la; uniform vec3 col;
void main(){
  float m = texture(M, uv).r, d = 0.0;
  for (int i = 0; i < 16; i++) { float a = float(i) * 0.3926991; vec2 dir = vec2(cos(a), sin(a)) * px;
    d = max(d, texture(M, uv + dir * r).r); d = max(d, texture(M, uv + dir * r * 0.5).r); }
  float ring = clamp((d - m) * 1.6, 0.0, 1.0) * la, w = texture(L, uv).r * wa, a = max(ring, w);
  o = vec4(col * a, a); }`);
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  G = { cv, gl, geo, comp, quad, samples, w: 0, h: 0, t: [], fb: [], ms: [], rb: [], U: {}, bufs: new WeakMap() };
  for (const p of [geo, comp]) { const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); G.U[(p === geo ? 'g_' : 'c_') + u.name] = gl.getUniformLocation(p, u.name); } }
  return G;
}
function glSize(G, w, h) {
  const gl = G.gl; if (G.w === w && G.h === h) return;
  G.cv.width = w; G.cv.height = h; G.w = w; G.h = h;
  for (let i = 0; i < 2; i++) {   // 0 = mask, 1 = wire; each drawn multisampled, then resolved into a texture
    if (G.t[i]) { gl.deleteTexture(G.t[i]); gl.deleteFramebuffer(G.fb[i]); gl.deleteFramebuffer(G.ms[i]); gl.deleteRenderbuffer(G.rb[i]); }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    if (G.samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, G.samples, gl.RGBA8, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    const ms = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    G.t[i] = t; G.fb[i] = fb; G.ms[i] = ms; G.rb[i] = rb;
  }
}
const hex3 = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
// render the model into G's own canvas (w × h px): faint wire + one contour line round it
function renderModel(G, M, w, h, ang, { color = CREAM, wireA = 0.1, lineA = 1, olw = 1.5, scale = 0.62, tilt = 0.16 } = {}) {
  if (!G || !M) return false; const gl = G.gl;
  glSize(G, w, h);
  let buf = G.bufs.get(M);
  if (!buf) { buf = [gl.createBuffer(), gl.createBuffer()]; gl.bindBuffer(gl.ARRAY_BUFFER, buf[0]); gl.bufferData(gl.ARRAY_BUFFER, M.T, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, buf[1]); gl.bufferData(gl.ARRAY_BUFFER, M.L, gl.STATIC_DRAW); G.bufs.set(M, buf); }
  const nT = M.T.length / 3, nL = M.L.length / 3;
  gl.viewport(0, 0, w, h); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
  gl.useProgram(G.geo); gl.enableVertexAttribArray(0);
  gl.uniform4f(G.U.g_A, Math.cos(ang), Math.sin(ang), Math.cos(tilt), Math.sin(tilt)); gl.uniform3f(G.U.g_S, w / 2, h / 2, Math.min(w, h) * scale);
  for (let i = 0; i < 2; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.ms[i]); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf[i]); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(i ? gl.LINES : gl.TRIANGLES, 0, i ? nL : nT);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, G.ms[i]); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, G.fb[i]);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(G.comp);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.t[0]); gl.uniform1i(G.U.c_M, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.t[1]); gl.uniform1i(G.U.c_L, 1);
  gl.uniform2f(G.U.c_px, 1 / w, 1 / h); gl.uniform1f(G.U.c_r, olw); gl.uniform1f(G.U.c_wa, wireA); gl.uniform1f(G.U.c_la, lineA); gl.uniform3f(G.U.c_col, ...hex3(color));
  gl.bindBuffer(gl.ARRAY_BUFFER, G.quad); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
  return true;
}
// …or onto a 2D canvas (the cards and icons: drawn once, copied out of the shared context)
function drawModel(g, M, w, h, ang, opts) { const G = glInit(); if (renderModel(G, M, w, h, ang, opts)) g.drawImage(G.cv, 0, 0); }

// ---------------------------------------------------------------- styles
const CSS = `
@font-face{font-family:'PP Supply Mono';src:url(assets/fonts/PPSupplyMono-Regular.woff) format('woff');font-display:swap}
@font-face{font-family:'PP Formula Condensed';src:url(assets/fonts/PPFormula-CondensedBlack.otf);font-weight:900}
::selection{background:${CREAM};color:${INK}}
@property --mza{syntax:'<angle>';inherits:false;initial-value:0deg}
:root{--k:1}
.mz{font-family:'PP Supply Mono',ui-monospace,monospace;font-size:calc(10px*var(--k));letter-spacing:.02em;text-transform:uppercase;color:${CREAM};line-height:1.25}
.mz-key{position:relative;display:inline-grid;place-items:center;min-width:calc(15px*var(--k));height:calc(15px*var(--k));padding:0 calc(3px*var(--k));box-sizing:border-box;flex:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 14%,transparent)}
.mz-key b{font-weight:400;font-size:calc(9px*var(--k));line-height:1}
/* a streak of light running round the square (a preloader-like tail, the square itself stays still) */
.mz-key i{position:absolute;inset:0;padding:1px;background:conic-gradient(from var(--mza),transparent 0 50%,color-mix(in srgb,currentColor 25%,transparent) 72%,currentColor 99%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0);animation:mzrun 1.8s linear infinite}
@keyframes mzrun{to{--mza:360deg}}
.mz-btn{display:flex;align-items:center;gap:calc(8px*var(--k));background:${INK};padding:calc(6px*var(--k)) calc(9px*var(--k)) calc(6px*var(--k)) calc(7px*var(--k));cursor:pointer;user-select:none;pointer-events:auto}
.mz-btn:hover{background:#1a1813}
#mz-nav{position:fixed;left:0;right:0;top:0;z-index:14;pointer-events:none;opacity:0;transition:opacity .6s}
#mz-nav.on{opacity:1}
#mz-open{position:absolute;left:calc(21px*var(--k));top:calc(21px*var(--k))}
#mz-touch{position:absolute;right:calc(21px*var(--k));top:calc(21px*var(--k));text-decoration:none}
#mz-note{position:absolute;left:calc(21px*var(--k));top:calc(52px*var(--k));display:flex;align-items:center;gap:calc(8px*var(--k));background:${INK};padding:calc(3px*var(--k)) calc(9px*var(--k)) calc(3px*var(--k)) calc(3px*var(--k));pointer-events:auto;cursor:pointer;transform:translateY(-6px);opacity:0;transition:opacity .35s,transform .35s;visibility:hidden}
#mz-note.on{opacity:1;transform:none;visibility:visible}
#mz-confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30}
/* the win: the page's own UI swaps light and dark too (the scene does it in its shader) */
.mz-won #mz-nav,.mz-won .mz-tag,.mz-won #mz-st #mz-stage{filter:url(#mz-neg)}
#mz-tasks{position:absolute;left:calc(26px*var(--k));top:calc(74px*var(--k));color:${INK};transition:transform .35s}
#mz-nav.noted #mz-tasks{transform:translateY(calc(34px*var(--k)))}
#mz-tasks .mz-chk{height:calc(19px*var(--k));margin-bottom:calc(5px*var(--k));gap:calc(11px*var(--k))}
#mz-tasks .mz-chk s{width:calc(15px*var(--k));height:calc(15px*var(--k));border-color:${INK};box-sizing:border-box}
#mz-tasks .mz-chk.done s:after{width:calc(7px*var(--k));height:calc(7px*var(--k));background:${INK}}
.mz-ico{width:calc(34px*var(--k));height:calc(34px*var(--k));background:${CREAM};flex:none;display:block}
.mz-dim{color:#8f8876}
.mz-tag{position:fixed;left:0;top:0;z-index:12;display:flex;align-items:center;gap:calc(5px*var(--k));background:${INK};padding:calc(3px*var(--k)) calc(6px*var(--k)) calc(3px*var(--k)) calc(3px*var(--k));white-space:nowrap;cursor:pointer;user-select:none;opacity:0;pointer-events:none;will-change:transform}
.mz-tag .bar{position:absolute;left:0;bottom:0;height:2px;background:${CREAM};width:0}
#mz-st{position:fixed;inset:0;z-index:40;display:none;background:rgba(10,9,7,.55);backdrop-filter:blur(22px) brightness(.55);-webkit-backdrop-filter:blur(22px) brightness(.55)}
#mz-st.on{display:block;animation:mzin .35s ease}
#mz-st.snap{backdrop-filter:none;-webkit-backdrop-filter:none;background:#0a0907}
#mz-bg{position:absolute;inset:0;width:100%;height:100%;display:none}
#mz-st.snap #mz-bg{display:block}
@keyframes mzin{from{opacity:0}}
#mz-stage{position:absolute;left:0;top:0;transform-origin:0 0}
#mz-stage .mz{font-size:10px}
#mz-stage .mz-key{min-width:15px;height:15px;padding:0 3px}
#mz-stage .mz-key b{font-size:9px}
.mz-abs{position:absolute}
.mz-chk{display:flex;align-items:center;gap:10px;height:20px;margin-bottom:5px}
.mz-chk s{width:13px;height:13px;border:1px solid ${CREAM};display:grid;place-items:center;text-decoration:none}
.mz-chk.done s:after{content:'';width:7px;height:7px;background:${CREAM}}
.mz-cell{position:absolute;width:250px;background:rgba(11,10,8,.82);display:grid;place-items:center;color:#8f8876;cursor:pointer;overflow:hidden;isolation:isolate}
.mz-cell.sel{outline:1px solid #cfc6ae;outline-offset:-1px;background:rgba(11,10,8,.9)}
/* the selected card's hatching drifts left → right, endlessly (one repeat = 10 stripes, so the loop is seamless) */
.mz-cell.sel:before{content:'';position:absolute;top:0;bottom:0;left:-45px;right:0;z-index:-1;background:repeating-linear-gradient(115deg,transparent 0 3px,rgba(52,49,40,.9) 3px 4px);animation:mzlines 2.6s linear infinite}
@keyframes mzlines{to{transform:translateX(44.14px)}}
.mz-cell.got{background:${PAPER}}
.mz-cell.got:before{display:none}
.mz-cell.got.sel{outline-color:${CREAM};outline-width:2px;outline-offset:-2px}
.mz-cell canvas{position:absolute;inset:0;width:100%;height:100%}
.mz-cell .state{position:absolute;left:16px;bottom:14px;font-size:12px;color:#6d6656;letter-spacing:.06em}
.mz-cell .state b{font-weight:400;color:${INK}
.mz-cell .state.lt{color:#8f8876}.mz-cell .state.lt b{color:${CREAM}};margin-left:10px}
.mz-panel{position:absolute;background:rgba(11,10,8,.82)}
.mz-star{display:inline-block;width:22px;height:22px;margin-left:8px;background:${CREAM};clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%)}
.mz-star.off{background:#3a372e}
.mz-vl{position:absolute;top:3px;bottom:3px;width:1px;background:rgba(241,232,208,.2)}
.mz-tk{position:absolute;width:12px;height:1px;background:rgba(241,232,208,.28)}
.mz-go{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;background:${CREAM};color:${INK};padding:4px 6px 4px 4px;cursor:pointer;user-select:none}
.mz-go .mz-key{background:${INK};color:${CREAM}}
.mz-go.off{background:transparent;color:#8f8876;cursor:default;box-shadow:inset 0 0 0 1px #3a372e}
.mz-go.off .mz-key{display:none}
`;
export const MZ_CSS = CSS;   // the same design system for other pages (the 404 game)

export function makeModules(ctx) {
  const { P } = ctx;
  let won = false;
  const found = new Set(), got = new Set(); let dreamDone = false, lastFound = null;
  try { const s = JSON.parse(localStorage.getItem(STORE) || '{}'); (s.found || []).forEach((id) => IDS.has(id) && found.add(id)); (s.got || []).forEach((id) => IDS.has(id) && got.add(id)); found.forEach((id) => got.add(id)); dreamDone = !!s.dream; } catch {}
  let build = null;
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ found: [...found], got: [...got], dream: dreamDone, build })); } catch {} };
  // every new version of the site starts the hunt over: the site's "build" is a fingerprint of its code files
  // (their ETags — the host changes them whenever a file changes); a different one than last time → clear
  (async () => {
    try {
      const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name.split('#')[0]).filter((u) => u.startsWith(location.origin) && /\/js\/[^?]+\.js/.test(u)))].sort();
      urls.push(location.origin + location.pathname);
      const tags = await Promise.all(urls.map((u) => fetch(u, { cache: 'force-cache' }).then((r) => r.headers.get('etag') || r.headers.get('last-modified') || '').catch(() => '')));
      let h = 5381; for (const ch of urls.map((u, i) => u + tags[i]).join('|')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
      const id = h.toString(36);
      let prev = null; try { prev = JSON.parse(localStorage.getItem(STORE) || '{}').build || null; } catch {}
      build = id;
      if (prev !== id) { found.clear(); got.clear(); dreamDone = false; lastFound = null; note.classList.remove('on'); for (const k in tags_) tags_[k].el.style.opacity = '0'; if (open) paint(); }
      paintTasks();
      save();
    } catch {}
  })();
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const el = (tag, cls, html, parent = document.body) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent.appendChild(e); return e; };
  const KEY = (k) => `<span class="mz-key"><i></i><b>${k}</b></span>`;
  const setK = () => document.documentElement.style.setProperty('--k', Math.max(0.8, Math.min(1.6, innerWidth / 1440)).toFixed(3));
  setK(); addEventListener('resize', setK);

  // ---- models (built lazily, once each object exists)
  const models = {}, icons = {};
  const modelOf = (id) => {
    if (models[id]) return models[id];
    if (id === 'earth') return (models[id] = globeModel());
    const o = (ctx.wire && ctx.wire[id] && ctx.wire[id]()) || (ctx.obj[id] && ctx.obj[id]()); if (!o) return null;
    try { models[id] = collectModel(o, id === 'door' ? 50 : 0); } catch (e) { console.warn('module model', id, e); return null; }
    return models[id];
  };
  const iconOf = (id, px = 68) => {   // small cream tile with the ink wireframe (tag + notification)
    const key = id + px; if (icons[key]) return icons[key];
    const M = modelOf(id), c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
    g.fillStyle = CREAM; g.fillRect(0, 0, px, px); if (M) drawModel(g, M, px, px, 0.6, { color: '#1b1a16', wireA: 0.4, lineA: 0.9, olw: 1, scale: 0.78 });
    return M ? (icons[key] = c.toDataURL()) : c.toDataURL();
  };

  // ---- nav bar + notification
  const nav = el('div', '', `<div id="mz-open" class="mz mz-btn">${KEY('F')}<span>TO OPEN STORAGE</span></div>
    <a id="mz-touch" class="mz mz-btn" href="${P.contactUrl || '#'}" target="_blank" rel="noopener">${KEY('G')}<span>GET IN TOUCH</span></a>
    <div id="mz-note" class="mz"><img class="mz-ico" alt=""><div><div>MODULE HAS BEEN FOUND</div><div class="mz-dim">PRESS F TO OPEN STORAGE</div></div></div>
    <div id="mz-tasks" class="mz"></div>`);
  nav.id = 'mz-nav';
  const note = nav.querySelector('#mz-note'), tasksEl = nav.querySelector('#mz-tasks');
  tasksEl.style.display = 'none';   // the goals live only in the storage menu now (not on the page)
  // the three goals, on the page itself (under the storage button) as well as in the storage
  const tasksHTML = () => [['FIND A HIDDEN MODULE BY HOVERING OVER OBJECTS', found.size > 0], ['DISCOVER THE LUCID DREAM BY SCROLLING', dreamDone], [`COLLECT ${MODULES.length} MODULES`, got.size >= MODULES.length]]
    .map(([t, d]) => `<div class="mz-chk ${d ? 'done' : ''}"><s></s>${t}</div>`).join('');
  const paintTasks = () => { tasksEl.innerHTML = tasksHTML(); };
  paintTasks();
  nav.querySelector('#mz-open').onclick = () => toggle(true);
  note.onclick = () => toggle(true);
  const touch = nav.querySelector('#mz-touch');
  touch.onclick = (e) => { if (!P.contactUrl) e.preventDefault(); };

  // ---- discover tags (one per module, pinned to its object)
  const tags = {}, tags_ = tags;
  for (const m of MODULES) {
    const t = el('div', 'mz mz-tag', `<img class="mz-ico" alt=""><div><div class="mz-dim">${m.name}</div><div>PRESS AND HOLD TO DISCOVER</div></div><span class="bar"></span>`);
    const st = { el: t, bar: t.querySelector('.bar'), img: t.querySelector('img'), hold: 0, holding: false, x: -1e4, y: -1e4, vis: false, iconSet: false };
    const stop = () => { st.holding = false; };
    t.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); st.holding = true; st.hold = 0; });
    t.addEventListener('pointerup', stop); t.addEventListener('pointerleave', stop); t.addEventListener('pointercancel', stop);
    tags[m.id] = st;
  }

  // ---- the cursor's ink trail (screen space), mirrors the ink bleed so the tags only show through it
  const trail = [];
  let mx = -1, my = -1;
  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY; const l = trail[trail.length - 1], now = performance.now();
    if (!l || Math.hypot(l.x - mx, l.y - my) > 10 || now - l.t > 60) trail.push({ x: mx, y: my, t: now });
    if (trail.length > 60) trail.shift();
  }, { passive: true });

  // ---- storage overlay (a 1920-wide design; the stage stretches to the window's aspect, 20 px margins)
  const st = el('div', '', ''); st.id = 'mz-st';
  // the backdrop: one small blurred still of the scene taken as the storage opens (a live full-screen blur behind an
  // animated panel cost a lot every frame); if the still can't be read, the live CSS blur stays as the fallback
  const bg = el('canvas', '', null, st); bg.id = 'mz-bg';
  const stage = el('div', '', '', st); stage.id = 'mz-stage';
  let snapWait = 0;
  const snap = () => {
    const src = ctx.canvas && ctx.canvas(); if (!src || !src.width) return false;
    const w = Math.max(16, Math.round(innerWidth / 6)), h = Math.max(16, Math.round(innerHeight / 6));
    bg.width = w; bg.height = h; const g = bg.getContext('2d');
    try {
      g.filter = 'blur(4px) brightness(0.55)'; g.drawImage(src, -10, -10, w + 20, h + 20); g.filter = 'none';
      const d = g.getImageData(0, 0, w, h).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]; if (sum === 0) return false;   // nothing read (blank) → keep the live blur
      g.fillStyle = 'rgba(10,9,7,.55)'; g.fillRect(0, 0, w, h);
    } catch { return false; }
    return true;
  };
  const A = (html, css, cls = 'mz mz-abs') => { const e = el('div', cls, html, stage); Object.assign(e.style, css); return e; };
  const chk = A('', { left: '23px', top: '22px' });
  A(`<span style="display:flex;align-items:center;gap:8px">${KEY('ESC')}TO QUIT</span>`, { left: '0', right: '0', top: '22px', display: 'flex', justifyContent: 'center', gap: '34px' });
  const closeB = A('CLOSE', { right: '24px', top: '26px', cursor: 'pointer' });
  const TOP = 199, M = 20, GAP = 5, CW = 250, RW = 578;
  const grid = A('', { left: M + 'px', top: TOP + 'px', width: CW * 2 + GAP + 'px' }, 'mz-abs');
  const mid = A('', { left: M + CW * 2 + GAP * 2 + 'px', top: TOP + 'px' }, 'mz-panel');
  const right = A('', { right: M + 'px', top: TOP + 'px', width: RW + 'px' }, 'mz-panel');
  mid.innerHTML = `<div class="mz" data-t style="position:absolute;left:20px;top:14px;font-family:'PP Formula Condensed',Impact,sans-serif;font-weight:900;font-size:34px;letter-spacing:0;line-height:1.1"></div>
    <div class="mz" style="position:absolute;right:20px;top:24px;display:flex;align-items:center">RARITY <span data-r style="margin-left:14px;display:flex"></span></div>
    <div data-v style="position:absolute;left:20px;right:20px;top:152px;bottom:151px">
      <span class="mz-vl" style="left:0"></span><span class="mz-vl" style="right:0"></span>
      <span class="mz-tk" style="left:3px;top:0"></span><span class="mz-tk" style="right:3px;top:0"></span><span class="mz-tk" style="left:3px;bottom:0"></span><span class="mz-tk" style="right:3px;bottom:0"></span>
      <div class="mz" data-x style="position:absolute;left:22px;top:6px"></div><div class="mz" data-y style="position:absolute;right:22px;top:6px"></div>
      <canvas data-c style="position:absolute;inset:0;width:100%;height:100%"></canvas>
      <div class="mz mz-dim" data-nf style="position:absolute;inset:0;display:grid;place-items:center">NOT FOUND</div>
    </div>
    <div class="mz" style="position:absolute;left:20px;bottom:18px"><span class="mz-dim">FOUND IN:</span>&nbsp; <span data-p></span></div>
    <div class="mz mz-go off" data-go><span>COLLECTED</span></div>
    <div class="mz" data-n style="position:absolute;right:20px;bottom:18px"></div>`;
  right.innerHTML = `<div class="mz" data-h style="position:absolute;left:20px;right:20px;top:20px;height:24px;background:${CREAM};color:${INK};display:flex;align-items:center;gap:24px;padding-left:12px">■ <span></span></div>
    <div class="mz" data-d style="position:absolute;left:20px;right:30px;top:40%;color:#a39c88;line-height:17.5px;white-space:pre-line"></div>
    <div data-nf2 style="position:absolute;inset:0;display:none;place-items:center;font-family:'PP Formula Condensed',Impact,sans-serif;font-weight:900;font-size:34px;line-height:1;color:${CREAM}">NOT FOUND</div>
    <div style="position:absolute;left:20px;right:20px;bottom:75px;border-top:1px solid #2a2821"></div>
    <div class="mz" data-f style="position:absolute;left:20px;bottom:43px;color:#a39c88">FROM THE DAY YOU FIRST MET</div>
    <div class="mz" data-yr style="position:absolute;left:20px;bottom:16px;color:#a39c88">2064</div><div class="mz" data-no style="position:absolute;right:20px;bottom:16px;color:#a39c88">#0039</div>`;
  const q = (root, s) => root.querySelector(`[${s}]`);
  const vcan = q(mid, 'data-c'), goB = q(mid, 'data-go');
  let open = false, sel = 0, spin = 0, cellH = 287;
  const cells = [];
  MODULES.forEach((m, i) => {
    const c = el('div', 'mz mz-cell', 'NOT FOUND', grid);
    c.onclick = () => { sel = i; paint(); }; cells.push(c);
  });
  let stageK = 1;
  const fitStage = () => {
    const k = stageK = Math.min(innerWidth / 1920, innerHeight / 1080), SW = innerWidth / k, SH = innerHeight / k, PH = SH - TOP - M;
    Object.assign(stage.style, { width: SW + 'px', height: SH + 'px', transform: `scale(${k})` });
    grid.style.height = PH + 'px'; mid.style.height = right.style.height = PH + 'px';
    mid.style.width = SW - (M + CW * 2 + GAP * 2) - (RW + GAP + M) + 'px';
    const rows = Math.ceil(MODULES.length / 2), h = Math.floor((PH - GAP * (rows - 1)) / rows);
    if (h !== cellH) { cellH = h; for (const id in thumbs) delete thumbs[id]; }
    cells.forEach((c, i) => { c.style.left = (i % 2) * (CW + GAP) + 'px'; c.style.top = Math.floor(i / 2) * (h + GAP) + 'px'; c.style.height = h + 'px'; });
    if (open) paint();
  };
  const thumbs = {};
  const thumb = (m, collected) => {   // the grid card: cream outline on black, or (collected) ink on paper
    const key = m.id + (collected ? ':got' : ''); if (thumbs[key]) return thumbs[key];
    const M = modelOf(m.id); if (!M) return null;
    const cv = document.createElement('canvas'); cv.width = CW * 2; cv.height = cellH * 2;
    drawModel(cv.getContext('2d'), M, cv.width, cv.height, 0.5, collected ? { color: '#14130f', wireA: 0, lineA: 1, olw: 1.8, scale: 0.46 } : { wireA: 0, lineA: 1, olw: 1.8, scale: 0.46 });
    return (thumbs[key] = cv);
  };
  function paint() {
    const n = MODULES.length;
    chk.innerHTML = tasksHTML(); paintTasks();
    MODULES.forEach((m, i) => {
      const c = cells[i], has = found.has(m.id), g = has && got.has(m.id) && !won, cv = has ? thumb(m, g) : null;   // won: the palette is flipped, the cards take the panels' tone
      c.classList.toggle('sel', i === sel); c.classList.toggle('got', g);
      c.innerHTML = '';
      if (cv) c.appendChild(cv); else c.textContent = 'NOT FOUND';
      if (has && got.has(m.id)) el('div', g ? 'state' : 'state lt', 'STATE:<b>COLLECTED</b>', c);
    });
    const m = MODULES[sel], has = found.has(m.id), g = got.has(m.id);
    q(mid, 'data-t').textContent = has ? m.name : '???';
    q(mid, 'data-r').innerHTML = [1, 2, 3].map((k) => `<span class="mz-star ${k <= m.rarity ? '' : 'off'}"></span>`).join('');
    q(mid, 'data-p').textContent = has ? m.place : '—';
    q(mid, 'data-n').textContent = `${sel + 1} / ${n}`;
    q(mid, 'data-nf').style.display = has ? 'none' : 'grid';
    goB.querySelector('span').textContent = has ? 'COLLECTED' : 'NOT FOUND YET';
    // not found yet: the note stays hidden (Figma: XXX / NOT FOUND / N/A)
    q(right, 'data-h').querySelector('span').textContent = has ? m.name : 'XXX';
    q(right, 'data-d').style.display = has ? '' : 'none'; q(right, 'data-nf2').style.display = has ? 'none' : 'grid';
    const note_ = NOTES[m.id]; q(right, 'data-d').textContent = note_.text;
    q(right, 'data-f').textContent = has ? note_.meta[0] : 'XXX'; q(right, 'data-yr').textContent = has ? note_.meta[1] : 'N/A'; q(right, 'data-no').textContent = has ? note_.meta[2] : '#0000';
  }
  function toggle(v = !open) {
    open = v; st.classList.toggle('on', open); nav.style.visibility = open ? 'hidden' : '';
    // the scene keeps running one more frame so the backdrop still can be taken right after it's drawn (update())
    if (open) { st.classList.remove('snap'); snapWait = performance.now(); setTimeout(() => { if (open && snapWait) { snapWait = 0; window.__storageOpen = true; } }, 1500); }
    else { snapWait = 0; window.__storageOpen = false; st.classList.remove('snap'); }
    if (open) {
      note.classList.remove('on');
      if (!found.has(MODULES[sel].id)) { const i = MODULES.findIndex((m) => m.id === lastFound); sel = i >= 0 ? i : Math.max(0, MODULES.findIndex((m) => found.has(m.id))); }
      fitStage(); paint();
    }
  }
  fitStage(); addEventListener('resize', fitStage);
  closeB.onclick = () => toggle(false);
  // secret: type W-I-N-N-E-R (any keyboard layout — it reads the physical keys) → the finale at once, to test it
  let code = '';
  addEventListener('keydown', (e) => {
    if (e.code && e.code.startsWith('Key')) { code = (code + e.code.slice(3)).slice(-6); if (code === 'WINNER' && !won) { playSfx('victory'); celebrate(); } }
  });
  addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') { e.preventDefault(); if (!open) toggle(true); }   // only Esc / CLOSE leave
    else if (e.key === 'Escape' && open) toggle(false);
    else if ((e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') && P.contactUrl && !open) window.open(P.contactUrl, '_blank', 'noopener');
    else if (open && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { sel = (sel + 1) % MODULES.length; paint(); }
    else if (open && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { sel = (sel + MODULES.length - 1) % MODULES.length; paint(); }
  });

  // ---- the win (till the page reloads): the palette flips (scene: ctx.win; the page's own UI: a CSS negative),
  // confetti keeps falling, the crow gets its crown (main.js)
  function celebrate() {
    if (won) return; won = true;
    // the same palette negative as the scene's, for the DOM UI: luminance → a ramp from the site's paper (dark in) to ink (light in)
    const f = document.createElement('div'); f.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const hx = (c) => [1, 3, 5].map((i) => (parseInt(c.substr(i, 2), 16) / 255).toFixed(3));
    const [pr, pg, pb] = hx('#cbc2a8'), [ir, ig, ib] = hx('#030302');
    f.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="mz-neg" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>
      <feComponentTransfer><feFuncR type="table" tableValues="${pr} ${ir}"/><feFuncG type="table" tableValues="${pg} ${ig}"/><feFuncB type="table" tableValues="${pb} ${ib}"/></feComponentTransfer></filter></svg>`;
    document.body.appendChild(f);
    document.documentElement.classList.add('mz-won');
    if (ctx.win) ctx.win();
    confetti();
    if (open) paint();
  }
  function confetti() {
    const cv = el('canvas', '', null); cv.id = 'mz-confetti'; const g = cv.getContext('2d');
    const COL = ['#f1e8d0', '#0b0a08', '#f2c12e', '#cbc2a8', '#8f2a22'], bits = [];
    let W = 0, H = 0, dpr = 1;
    const fit = () => { dpr = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
    fit(); addEventListener('resize', fit);
    const spawn = (y) => ({ x: Math.random() * W, y, w: 5 + Math.random() * 7, h: 8 + Math.random() * 10, c: COL[(Math.random() * COL.length) | 0],
      vy: 55 + Math.random() * 70, sway: 20 + Math.random() * 40, ph: Math.random() * 6.3, fr: 1.5 + Math.random() * 3, rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 5 });
    for (let i = 0; i < 160; i++) bits.push(spawn(-Math.random() * H * 1.2));   // a first burst already on its way down
    let last = performance.now(), T = 0;
    const tick = (now) => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      for (const b of bits) {
        b.y += b.vy * dt; b.rot += b.vr * dt; b.ph += b.fr * dt;
        if (b.y > H + 20) Object.assign(b, spawn(-20 - Math.random() * 60));   // keeps falling, forever (till reload)
        const x = b.x + Math.sin(b.ph) * b.sway, flip = Math.cos(b.ph * 1.7);   // flutter: the paper turns over as it falls
        g.save(); g.translate(x, b.y); g.rotate(b.rot); g.scale(1, flip); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore();
      }
    };
    requestAnimationFrame(tick);
  }

  function discover(id) {
    if (found.has(id)) return;
    found.add(id); got.add(id); lastFound = id; save();   // found = collected, no extra step
    const t = tags[id]; t.el.style.transition = 'opacity .3s'; t.el.style.opacity = '0'; t.el.style.pointerEvents = 'none';
    note.querySelector('img').src = iconOf(id); note.classList.add('on');
    playSfx(got.size >= MODULES.length ? 'victory' : 'notify');   // the last one: a win
    if (got.size >= MODULES.length) celebrate();
    paintTasks();
    sel = MODULES.findIndex((m) => m.id === id);
  }

  // ---- per frame
  const v = new THREE.Vector3();
  let last = performance.now(), chandHeld = false;
  function update() {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (open && snapWait) { snapWait = 0; if (snap()) st.classList.add('snap'); window.__storageOpen = true; }   // right after the frame was drawn
    const ready = ctx.ready() && !!P.navOn;
    const href = P.contactUrl || '#'; if (touch.getAttribute('href') !== href) touch.setAttribute('href', href);
    nav.classList.toggle('on', ready);
    if (!dreamDone && ready && ctx.pull() >= ctx.total() - 0.4) { dreamDone = true; save(); paintTasks(); }
    nav.classList.toggle('noted', note.classList.contains('on'));
    const life = (P.cfxLife || 1.5) * 1000, R = Math.max(40, (P.sootheRadius || 0.08) * innerHeight * 1.1);
    while (trail.length && now - trail[0].t > life) trail.shift();
    const view = ctx.view(), pull = ctx.pull();
    for (const m of MODULES) {
      const t = tags[m.id];
      let show = false;
      if (ready && !open && !found.has(m.id) && ctx.inWindow(m.id, view, pull)) {
        const a = ctx.anchor(m.id, v);
        if (a) {
          const cam = ctx.cam(view); v.project(cam);
          if (v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.92) { t.x = (v.x * 0.5 + 0.5) * innerWidth; t.y = (-v.y * 0.5 + 0.5) * innerHeight; show = true; }
        }
      }
      t.show = show;
      if (!show) { if (t.vis) { t.el.style.opacity = '0'; t.el.style.pointerEvents = 'none'; t.vis = false; } t.holding = false; t.hold = 0; t.bar.style.width = '0'; continue; }
      if (!t.iconSet) { t.img.src = iconOf(m.id); t.iconSet = !!models[m.id]; }
      t.el.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -50%)`;
      // reveal: only where the ink trail is (radial gradients at the recent cursor points, shrinking with age)
      const w = t.el.offsetWidth, h = t.el.offsetHeight, x0 = t.x - w / 2, y0 = t.y - h / 2;
      const grads = []; let cover = 0;
      for (const p of trail) {
        const k = 1 - (now - p.t) / life; if (k <= 0) continue; const r = R * Math.sqrt(k);
        const dx = Math.max(x0 - p.x, 0, p.x - (x0 + w)), dy = Math.max(y0 - p.y, 0, p.y - (y0 + h));
        if (dx * dx + dy * dy > r * r) continue;
        grads.push(`radial-gradient(circle ${r.toFixed(1)}px at ${(p.x - x0).toFixed(1)}px ${(p.y - y0).toFixed(1)}px, #000 55%, transparent 100%)`);
        cover = Math.max(cover, k);
      }
      if (t.holding) { t.hold += dt; t.bar.style.width = Math.min(100, t.hold * 100) + '%'; if (t.hold >= 1) { discover(m.id); continue; } }
      else if (t.hold > 0) { t.hold = 0; t.bar.style.width = '0'; }
      if (grads.length || t.holding) {
        const mask = t.holding ? 'none' : grads.slice(-24).join(',');
        t.el.style.webkitMaskImage = t.el.style.maskImage = mask;
        t.el.style.opacity = '1'; t.el.style.pointerEvents = cover > 0.15 || t.holding ? 'auto' : 'none'; t.vis = true;
      } else if (t.vis) { t.el.style.opacity = '0'; t.el.style.pointerEvents = 'none'; t.vis = false; }
    }
    // the chandelier sways: while the cursor is on (or right by) its tag it stills, so the tag can be held
    { const t = tags.chandelier, h = !!t.show && (t.vis || t.holding || (mx >= 0 && Math.hypot(mx - t.x, my - t.y) < 190));
      if (h !== chandHeld) { chandHeld = h; if (ctx.hold) ctx.hold('chandelier', h); } }
  }
  // the storage's turning wireframe runs on its own frame loop (the scene may be busy or still loading)
  let vLast = performance.now(), vG = null;
  const viewer = () => {
    requestAnimationFrame(viewer);
    const now = performance.now(), dt = Math.min(0.1, (now - vLast) / 1000); vLast = now;
    if (!open) return;
    const m = MODULES[sel], M = found.has(m.id) ? modelOf(m.id) : null;
    const dpr = Math.min(2, devicePixelRatio || 1), cw = Math.round(vcan.clientWidth * dpr * stageK), ch = Math.round(vcan.clientHeight * dpr * stageK);
    spin += dt * 0.35;
    if (vG === null) vG = glMake(vcan);   // its own GPU context right on the visible canvas: no copying per frame
    if (M) renderModel(vG, M, cw, ch, spin, { wireA: 0.1 * Math.max(1, dpr * 0.75), lineA: 1, olw: 1.2 * dpr, scale: 0.8 });
    else if (vG) { glSize(vG, cw, ch); const gl = vG.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    q(mid, 'data-x').textContent = `X  ${Math.max(0, Math.round(mx))}`; q(mid, 'data-y').textContent = `${Math.max(0, Math.round(my))}  Y`;
  };
  requestAnimationFrame(viewer);
  return { update, toggle, get open() { return open; } };
}
