import * as THREE from 'three';
import { uniform, texture, vec3, vec4, float, positionWorld, normalWorld, step, abs, smoothstep, max } from 'three';

// Spray-painted graffiti on the church's end wall (scene 2): an inverted pentagram in a double ring with a goat's
// head, drawn procedurally (an original drawing, not a copy of any artwork) as a spray can would: a hard core
// stroke, soft overspray dots around it, and paint drips running down. It is PROJECTED onto the stone material
// (room.js samples it by world position), so it follows every block and mortar joint and never gets outlined as
// a separate object.
export const GR = {
  on: uniform(0), mat: uniform(new THREE.Matrix4()), color: uniform(new THREE.Color('#030302')), opacity: uniform(0.95),
  normal: uniform(new THREE.Vector3(0, 0, 1)), tex: null,
};
const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function sprayPath(g, pts, w, o) {
  // hard core
  g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = w; g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + gauss() * w * 0.04, y + gauss() * w * 0.04) : g.moveTo(x, y))); g.stroke();
  // overspray: dots scattered around the stroke (denser near it)
  const N = Math.round(pts.length * o.spray);
  for (let k = 0; k < N; k++) {
    const i = Math.floor(rnd() * (pts.length - 1)), t = rnd(), [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const x = x0 + (x1 - x0) * t + gauss() * w * 1.1, y = y0 + (y1 - y0) * t + gauss() * w * 1.1, r = rnd() * w * 0.09 + 0.4;
    g.globalAlpha = 0.25 + rnd() * 0.6; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // drips from low, slow points of the stroke
  for (let k = 0; k < pts.length; k += 1) if (rnd() < o.drips / (pts.length * 7)) {   // ~o.drips drips over the whole piece
    const [x, y] = pts[k], L = 20 + rnd() * 110 * o.dripLen, dw = w * (0.25 + rnd() * 0.3);
    g.lineWidth = dw; g.beginPath(); g.moveTo(x, y); g.lineTo(x + gauss() * 1.5, y + L); g.stroke();
    g.beginPath(); g.ellipse(x, y + L, dw * 0.75, dw * 1.1, 0, 0, 7); g.fill();
  }
}
const arc = (cx, cy, r, a0, a1, n = 120) => [...Array(n + 1).keys()].map((i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const bez = (p0, p1, p2, p3, n = 40) => [...Array(n + 1).keys()].map((i) => { const t = i / n, u = 1 - t; return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); });
const line = (a, b, n = 60) => [...Array(n + 1).keys()].map((i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);

export function paintGraffiti(o = { spray: 3, drips: 6, dripLen: 1 }) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff';
  const cx = S / 2, cy = S / 2 + 10, R = S * 0.42;
  // double ring (slightly wobbly, hand-sprayed)
  sprayPath(g, arc(cx, cy, R, 0, Math.PI * 2 + 0.05, 220).map(([x, y]) => [x + gauss() * 1.2, y + gauss() * 1.2]), 14, o);
  sprayPath(g, arc(cx + 3, cy - 2, R * 0.86, 0.1, Math.PI * 2 + 0.12, 200), 9, o);
  // inverted pentagram: one point down, two up (drawn in one continuous star stroke)
  const r = R * 0.86, P = [...Array(5).keys()].map((i) => { const a = Math.PI / 2 + i * (Math.PI * 2 / 5); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  const order = [0, 2, 4, 1, 3, 0]; let star = []; for (let i = 0; i < 5; i++) star = star.concat(line(P[order[i]], P[order[i + 1]], 70));
  sprayPath(g, star, 10, o);
  // goat head (own drawing): long face down to the bottom point, horns sweeping up to the two top points,
  // ears out towards the side points
  const hx = cx, hy = cy - R * 0.08, s = R / 430;
  const X = (x, y) => [hx + x * s, hy + y * s];
  const horn = (k) => { sprayPath(g, bez(X(35 * k, -60), X(70 * k, -150), X(150 * k, -230), X(215 * k, -330)), 16, o); sprayPath(g, bez(X(70 * k, -55), X(115 * k, -120), X(175 * k, -200), X(215 * k, -330)), 9, o); };
  horn(1); horn(-1);
  const face = [...bez(X(-60, -55), X(-95, 40), X(-55, 160), X(-18, 300)), ...bez(X(-18, 300), X(-8, 330), X(8, 330), X(18, 300)), ...bez(X(18, 300), X(55, 160), X(95, 40), X(60, -55))];
  sprayPath(g, face, 12, o);
  sprayPath(g, bez(X(-60, -55), X(-20, -85), X(20, -85), X(60, -55)), 10, o);   // brow
  const ear = (k) => sprayPath(g, [...bez(X(70 * k, -20), X(160 * k, -30), X(250 * k, -10), X(300 * k, 25)), ...bez(X(300 * k, 25), X(230 * k, 35), X(150 * k, 40), X(85 * k, 25))], 9, o);
  ear(1); ear(-1);
  const eye = (k) => { g.beginPath(); g.ellipse(...X(42 * k, 40), 22 * s, 11 * s, 0.35 * k, 0, 7); g.fill(); };
  eye(1); eye(-1);
  sprayPath(g, bez(X(-10, 90), X(-14, 160), X(-10, 220), X(-4, 250)), 6, o);                 // bridge of the nose
  sprayPath(g, [...arc(...X(0, 285), 20 * s, 0, Math.PI * 2, 40)], 6, o);                      // muzzle
  // alpha from the white paint
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  if (GR.tex) { GR.tex.image = c; GR.tex.needsUpdate = true; } else GR.tex = t;
  return GR.tex;
}

// paint amount at the current fragment (0..1) — used inside the ink material
let _node = null;
// a second piece: hand-lettered words on the church door (scene 4), painted like a marker / brush tag
export const GR2 = {
  on: uniform(0), mat: uniform(new THREE.Matrix4()), color: uniform(new THREE.Color('#030302')), opacity: uniform(0.95),
  normal: uniform(new THREE.Vector3(0, 0, 1)), tex: null,
};
export function paintWords(text = 'ТАКА ЛЮБОВ\nБУВАЄ\nРАЗ В НІКОЛИ', o = { rough: 1, drips: 3 }) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.textBaseline = 'middle';
  const lines = String(text).toUpperCase().split('\n').map((l) => l.trim()).filter(Boolean);
  const lh = S * 0.84 / Math.max(3, lines.length);
  // marker lettering: a light sans drawn as a THICK round-capped stroke (a monoline marker line), each letter
  // tilted, resized and shifted a little; one common scale so every row has the same letter height
  const font = (f) => `300 ${f}px "Helvetica Neue", Arial, sans-serif`;
  let fs = lh * 0.95; g.font = font(fs);
  const widest = Math.max(...lines.map((ln) => [...ln].reduce((a, ch) => a + g.measureText(ch).width * 1.12, 0)));
  fs *= Math.min(1, (S * 0.9) / widest);
  lines.forEach((ln, li) => {
    g.font = font(fs); const chars = [...ln], ws = chars.map((ch) => g.measureText(ch).width * 1.12);
    const tw = ws.reduce((a, b) => a + b, 0);
    let x = (S - tw) / 2 + (rnd() - 0.5) * fs * 0.5 * o.rough; const y0 = (S - lh * lines.length) / 2 + lh * (li + 0.5);
    chars.forEach((ch, i) => {
      const f = fs * (0.88 + rnd() * 0.26 * o.rough), rot = (rnd() - 0.5) * 0.2 * o.rough, dy = (rnd() - 0.5) * fs * 0.14 * o.rough;
      g.save(); g.translate(x + ws[i] / 2, y0 + dy); g.rotate(rot); g.scale(0.9 + rnd() * 0.2, 1); g.font = font(f); g.textAlign = 'center';
      g.lineCap = g.lineJoin = 'round';
      g.lineWidth = f * (0.11 + rnd() * 0.03); g.strokeText(ch, 0, 0);
      g.lineWidth = f * 0.07; g.strokeText(ch, (rnd() - 0.5) * f * 0.04, (rnd() - 0.5) * f * 0.04);   // second pass: uneven edge
      g.restore();
      if (rnd() < o.drips / 40) { const dx = x + ws[i] * (0.3 + rnd() * 0.4), L = f * (0.2 + rnd() * 0.6); g.lineWidth = f * 0.05; g.beginPath(); g.moveTo(dx, y0 + f * 0.3); g.lineTo(dx + (rnd() - 0.5) * 2, y0 + f * 0.3 + L); g.stroke(); g.beginPath(); g.arc(dx, y0 + f * 0.3 + L, f * 0.035, 0, 7); g.fill(); }
      x += ws[i];
    });
  });
  // dry-brush texture: thin streaks and specks where the marker ran out
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2500 * o.rough; i++) { const x = rnd() * S, y = rnd() * S; g.globalAlpha = 0.2 + rnd() * 0.6; g.beginPath(); g.arc(x, y, 0.5 + rnd() * 1.4, 0, 7); g.fill(); }   // dry specks
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  if (GR2.tex) { const d = GR2.tex.image, dg = d.getContext('2d'); dg.clearRect(0, 0, d.width, d.height); dg.drawImage(c, 0, 0, d.width, d.height); GR2.tex.needsUpdate = true; } else GR2.tex = t;
  return GR2.tex;
}

// the lettering from the reference photo (traced 1:1 into a mask: assets/ui/words.png)
let wordsImg = null;
export function useWordsImage() {
  // one fixed 2048² canvas for the door piece: the traced image (or typed text) is drawn INTO it, so the GPU
  // texture keeps its size (WebGPU does not like a texture changing size under a bound material)
  const draw = (img) => { const c = GR2.tex.image, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); GR2.tex.needsUpdate = true; };
  if (!GR2.tex) { const c = document.createElement('canvas'); c.width = c.height = 2048; GR2.tex = new THREE.CanvasTexture(c); GR2.tex.colorSpace = THREE.NoColorSpace; GR2.tex.anisotropy = 8; }
  if (wordsImg) { draw(wordsImg); return; }
  const img = new Image(); img.onload = () => { wordsImg = img; draw(img); }; img.src = 'assets/ui/words.png';
}
// spray-can lettering (the street portal): thick round-capped strokes, soft overspray around them, drips
const slot = () => ({ on: uniform(0), mat: uniform(new THREE.Matrix4()), color: uniform(new THREE.Color('#030302')), opacity: uniform(0.95), normal: uniform(new THREE.Vector3(1, 0, 0)), tex: null });
export const GR3 = slot(), GR4 = slot();
export function paintSprayText(G, text, o = { font: 'sans-serif', weight: 800, spray: 1, drips: 6, aspect: 1 }) {
  const S = 1024, c = G.tex ? G.tex.image : document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  const core = document.createElement('canvas'); core.width = core.height = S; const k = core.getContext('2d');
  const lines = String(text).toUpperCase().split('\n').map((l) => l.trim()).filter(Boolean);
  const font = (f) => `${o.weight} ${f}px ${o.font}`;
  let fs = (S * 0.8 / lines.length) * 0.85; k.font = font(fs); const widest = Math.max(...lines.map((l) => k.measureText(l).width)); fs *= Math.min(1, (S * 0.92) / widest);
  const lh = fs * 1.08;   // rows sit tight, like one sprayed block
  k.fillStyle = k.strokeStyle = '#fff'; k.lineJoin = k.lineCap = 'round'; k.textAlign = 'center'; k.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    const y = (S - lh * lines.length) / 2 + lh * (i + 0.5);
    let x = S / 2 - k.measureText(ln).width / 2; k.font = font(fs); const tw = k.measureText(ln).width; x = S / 2 - tw / 2;
    for (const ch of ln) { const w = k.measureText(ch).width; k.save(); k.translate(x + w / 2, y + (rnd() - 0.5) * fs * 0.06); k.rotate((rnd() - 0.5) * 0.08); k.lineWidth = fs * 0.07; k.strokeText(ch, 0, 0); k.fillText(ch, 0, 0); k.restore(); x += w; }
  });
  // overspray: a blurred halo, broken into specks
  const halo = document.createElement('canvas'); halo.width = halo.height = S; const h = halo.getContext('2d'); h.filter = `blur(${Math.round(fs * 0.05)}px)`; h.drawImage(core, 0, 0);
  const hd = h.getImageData(0, 0, S, S).data, cd = k.getImageData(0, 0, S, S).data;
  g.fillStyle = g.strokeStyle = '#fff';
  for (let n = 0; n < 60000 * o.spray; n++) { const x = (rnd() * S) | 0, y = (rnd() * S) | 0, i = (y * S + x) * 4; const a = hd[i + 3] / 255; if (a > 0.02 && cd[i + 3] < 128 && rnd() < a * 0.9) { g.globalAlpha = 0.3 + rnd() * 0.6; g.fillRect(x, y, 1 + rnd() * 1.5, 1 + rnd() * 1.5); } }
  g.globalAlpha = 1; g.drawImage(core, 0, 0);
  // drips from the lowest paint in random columns
  for (let d = 0; d < o.drips; d++) {
    const x = (S * 0.06 + rnd() * S * 0.88) | 0; let y = -1; for (let yy = S - 1; yy > 0; yy--) if (cd[(yy * S + x) * 4 + 3] > 200) { y = yy; break; }
    if (y < 0) continue; const L = fs * (0.08 + rnd() * rnd() * 0.45), w = fs * (0.012 + rnd() * 0.014);
    g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + (rnd() - 0.5) * 2, y + L); g.stroke(); g.beginPath(); g.arc(x, y + L, w * 0.8, 0, 7); g.fill();
  }
  // alpha → red channel (the projector reads .r)
  const out = g.getImageData(0, 0, S, S); for (let i = 0; i < out.data.length; i += 4) { const a = out.data[i + 3]; out.data[i] = out.data[i + 1] = out.data[i + 2] = a; out.data[i + 3] = 255; } g.putImageData(out, 0, 0);
  if (!G.tex) { G.tex = new THREE.CanvasTexture(c); G.tex.colorSpace = THREE.NoColorSpace; G.tex.anisotropy = 8; } else G.tex.needsUpdate = true;
  return G.tex;
}
// ---------------------------------------------------------------- tag style (flat chisel marker, after ref 1)
// single-stroke skeletons of the digits in a 0..1 box (y down); drawn with a flat nib at a fixed angle, italic,
// the characters stacked and overlapping, plus a long underline swoosh, drips and splatter
const bez2 = (p0, p1, p2, n = 16) => [...Array(n + 1).keys()].map((i) => { const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; });
const ring = (cx, cy, rx, ry, a0 = -Math.PI / 2, turns = 1.08, n = 40) => [...Array(n + 1).keys()].map((i) => { const a = a0 + i / n * turns * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const SK = {
  '0': [ring(0.5, 0.5, 0.36, 0.5, -1.9, 1.12)],
  '1': [[[0.2, 0.22], [0.62, 0]], [[0.62, 0], [0.42, 1.0]]],
  '2': [[...bez2([0.1, 0.25], [0.5, -0.25], [0.85, 0.2]), ...bez2([0.85, 0.2], [0.6, 0.6], [0.05, 1.0])], [[0.05, 1.0], [0.95, 0.92]]],
  '3': [[...bez2([0.1, 0.08], [0.6, -0.05], [0.9, 0.05]), [0.35, 0.45], ...bez2([0.35, 0.45], [1.1, 0.45], [0.75, 0.9]), ...bez2([0.75, 0.9], [0.4, 1.1], [0.0, 0.85])]],
  '4': [[[0.7, 1.0], [0.72, 0.0], [0.05, 0.68], [1.0, 0.64]]],
  '5': [[[0.9, 0.02], [0.25, 0.05], [0.18, 0.45], ...bez2([0.18, 0.45], [1.05, 0.25], [0.75, 0.88]), ...bez2([0.75, 0.88], [0.4, 1.1], [0.02, 0.85])]],
  '6': [[...bez2([0.8, 0.02], [0.1, 0.2], [0.15, 0.75]), ...ring(0.5, 0.72, 0.35, 0.28, Math.PI, 1.0)]],
  '7': [[[0.05, 0.05], [0.95, 0.02], [0.35, 1.0]], [[0.25, 0.5], [0.8, 0.46]]],
  '8': [[...ring(0.5, 0.25, 0.28, 0.24, Math.PI / 2, 1.0), ...ring(0.5, 0.73, 0.36, 0.27, -Math.PI / 2, 1.0)]],
  '9': [[...ring(0.48, 0.3, 0.34, 0.3, 0.2, 1.0), ...bez2([0.82, 0.32], [0.85, 0.75], [0.35, 1.05])]],
};
const resample = (pts, step) => { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)); for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); } out.push(pts[pts.length - 1]); return out; };
function nib(g, pts, w, ang) {   // stamp a flat nib along the path (thick / thin by direction)
  const c = Math.cos(ang), s = Math.sin(ang), hw = w / 2, ht = w * 0.16;
  for (const [x, y] of resample(pts, 1.2)) { g.beginPath(); g.moveTo(x - c * hw - s * ht, y - s * hw + c * ht); g.lineTo(x + c * hw - s * ht, y + s * hw + c * ht); g.lineTo(x + c * hw + s * ht, y + s * hw - c * ht); g.lineTo(x - c * hw + s * ht, y - s * hw - c * ht); g.fill(); }
}
export function paintTag(G, text, o = { spray: 1, drips: 7 }) {
  const S = 1024, c = G.tex ? G.tex.image : document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S); g.fillStyle = g.strokeStyle = '#fff';
  const chars = [...String(text).replace(/\s+/g, '')]; const n = Math.max(1, chars.length);
  const ch = S * 0.62 / (1 + (n - 1) * 0.45), cw = ch * 0.62, slant = 0.42, ang = -0.62, w = ch * 0.3;
  const X = (ox, oy) => ([px, py]) => [ox + (px - 0.5) * cw + (0.5 - py) * ch * slant, oy + (py - 0.5) * ch];
  const all = [];
  chars.forEach((chr, i) => {   // stacked diagonally, overlapping (like the reference)
    const ox = S * 0.5 + (i - (n - 1) / 2) * cw * 0.55 + (rnd() - 0.5) * cw * 0.2, oy = S * 0.5 + (i - (n - 1) / 2) * ch * 0.45;
    const strokes = SK[chr] || null;
    if (strokes) strokes.forEach((st) => { const pts = st.map(X(ox, oy)); nib(g, pts, w * (0.85 + rnd() * 0.3), ang); all.push(pts); });
    else { g.save(); g.translate(ox, oy); g.transform(1, 0, -slant, 1, 0, 0); g.font = `italic 800 ${ch}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = w * 0.3; g.strokeText(chr, 0, 0); g.restore(); }
  });
  // swooshes: an underline and a cross-bar, and a halo ring on top
  const bot = S * 0.5 + (n - 1) / 2 * ch * 0.45 + ch * 0.55;
  nib(g, bez2([S * 0.2, bot + ch * 0.05], [S * 0.55, bot - ch * 0.35], [S * 0.86, bot - ch * 0.25]), w * 0.9, ang);
  nib(g, [[S * 0.12, S * 0.52], [S * 0.34, S * 0.49]], w * 0.6, ang);
  nib(g, ring(S * 0.5 - (n - 1) / 2 * cw * 0.55, S * 0.5 - (n - 1) / 2 * ch * 0.45 - ch * 0.78, cw * 0.36, ch * 0.08, 0, 1.02), w * 0.45, ang);
  // dry-brush streaks along the strokes (paper shows through)
  g.globalCompositeOperation = 'destination-out'; g.lineWidth = 1.2;
  for (const pts of all) for (let k = 0; k < 2; k++) { const off = (rnd() - 0.5) * w * 0.35; g.globalAlpha = 0.35; g.beginPath(); resample(pts, 6).forEach(([x, y], i) => (i ? g.lineTo(x + off, y + off * 0.6) : g.moveTo(x + off, y + off * 0.6))); g.stroke(); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // drips + splatter + overspray specks
  const img = g.getImageData(0, 0, S, S).data;
  for (let d = 0; d < o.drips * 1.5; d++) { const x = (S * 0.1 + rnd() * S * 0.8) | 0; let y = -1; for (let yy = S - 1; yy > 0; yy--) if (img[(yy * S + x) * 4 + 3] > 200) { y = yy; break; } if (y < 0) continue; const L = ch * (0.1 + rnd() * rnd() * 0.9); g.lineWidth = 1.5 + rnd() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + L); g.stroke(); }
  for (let k = 0; k < 14 * o.spray; k++) { const x = S * (0.15 + rnd() * 0.7), y = S * (0.2 + rnd() * 0.65); for (let j = 0; j < 30; j++) { g.globalAlpha = 0.4 + rnd() * 0.6; g.beginPath(); g.arc(x + gauss() * 10, y + gauss() * 10, rnd() * 3.5, 0, 7); g.fill(); } }
  for (let k = 0; k < 5000 * o.spray; k++) { g.globalAlpha = rnd() * 0.7; g.fillRect(S * 0.5 + gauss() * S * 0.2, S * 0.5 + gauss() * S * 0.22, 1.2, 1.2); }
  g.globalAlpha = 1;
  return finish(G, c, g, S);
}
// ---------------------------------------------------------------- bubble spray (soft round letters, after ref 2)
export function paintBubble(G, text, o = { spray: 1, drips: 4 }) {
  const S = 1024, c = G.tex ? G.tex.image : document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  const lines = String(text).toUpperCase().split('\n').map((l) => l.trim()).filter(Boolean);
  const core = document.createElement('canvas'); core.width = core.height = S; const k = core.getContext('2d');
  const font = (f) => `800 ${f}px "Arial Rounded MT Bold", "Varela Round", "Nunito", "Trebuchet MS", sans-serif`;
  let fs = S * 0.8 / lines.length * 0.8; k.font = font(fs); const widest = Math.max(...lines.map((l) => k.measureText(l).width)); fs *= Math.min(1, (S * 0.84) / widest);
  k.fillStyle = k.strokeStyle = '#fff'; k.lineJoin = k.lineCap = 'round'; k.textAlign = 'center'; k.textBaseline = 'middle';
  const lh = fs * 1.12;
  lines.forEach((ln, i) => {
    const y = S / 2 + (i - (lines.length - 1) / 2) * lh; k.font = font(fs); let x = S / 2 - k.measureText(ln).width / 2;
    for (const chr of ln) { const w = k.measureText(chr).width; k.save(); k.translate(x + w / 2, y + (rnd() - 0.5) * fs * 0.1); k.rotate((rnd() - 0.5) * 0.12); k.lineWidth = fs * 0.06; k.strokeText(chr, 0, 0); k.fillText(chr, 0, 0); k.restore(); x += w * 1.02; }
  });
  // soft sprayed edge: blur the core, then threshold it through noise (fuzzy rim), plus wide specks around
  const soft = document.createElement('canvas'); soft.width = soft.height = S; const sg = soft.getContext('2d'); sg.filter = `blur(${Math.round(fs * 0.02)}px)`; sg.drawImage(core, 0, 0);
  const halo = document.createElement('canvas'); halo.width = halo.height = S; const hg = halo.getContext('2d'); hg.filter = `blur(${Math.round(fs * 0.12)}px)`; hg.drawImage(core, 0, 0);
  const sd = sg.getImageData(0, 0, S, S).data, hd = hg.getImageData(0, 0, S, S).data, out = g.createImageData(S, S), od = out.data;
  for (let i = 0; i < S * S; i++) {
    const a = sd[i * 4 + 3] / 255, h = hd[i * 4 + 3] / 255, r = rnd();
    let v = a > 0.55 ? 1 : a > 0.25 ? (r < (a - 0.25) / 0.3 ? 1 : 0) : 0;   // fuzzy edge
    if (!v && h > 0.02 && r < h * h * 0.35 * o.spray) v = 0.5 + rnd() * 0.5;   // overspray specks
    od[i * 4] = od[i * 4 + 1] = od[i * 4 + 2] = 255; od[i * 4 + 3] = v * 255;
  }
  g.putImageData(out, 0, 0); g.fillStyle = g.strokeStyle = '#fff';
  const cd = k.getImageData(0, 0, S, S).data;
  for (let d = 0; d < o.drips; d++) { const x = (S * 0.1 + rnd() * S * 0.8) | 0; let y = -1; for (let yy = S - 1; yy > 0; yy--) if (cd[(yy * S + x) * 4 + 3] > 200) { y = yy; break; } if (y < 0) continue; const L = fs * (0.1 + rnd() * 0.35), w = fs * 0.05; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x, y + L); g.stroke(); }
  return finish(G, c, g, S);
}
function finish(G, c, g, S) {   // alpha → red channel (the projector reads .r)
  const out = g.getImageData(0, 0, S, S); for (let i = 0; i < out.data.length; i += 4) { const a = out.data[i + 3]; out.data[i] = out.data[i + 1] = out.data[i + 2] = a; out.data[i + 3] = 255; } g.putImageData(out, 0, 0);
  if (!G.tex) { G.tex = new THREE.CanvasTexture(c); G.tex.colorSpace = THREE.NoColorSpace; G.tex.anisotropy = 8; } else G.tex.needsUpdate = true;
  return G.tex;
}
// 'graffiti': a real graffiti handstyle font (Sedgwick Ave Display, loaded in index.html), sprayed: overspray + drips
export const GRAFFITI_FONT = '"Sedgwick Ave Display", "Permanent Marker", cursive';
export const paintPortalTag = (G, style, text, o) => (style === 'tag' ? paintTag(G, text, o) : style === 'bubble' ? paintBubble(G, text, o)
  : style === 'graffiti' ? paintSprayText(G, text, { ...o, font: GRAFFITI_FONT, weight: 400 }) : paintSprayText(G, text, o));
const _nodes = new Map();
function slotAt(G, paint) {
  if (!G.tex) paint();
  const q = G.mat.mul(vec4(positionWorld, 1)).xyz;   // decal space: x, y in −0.5…0.5, z = depth around the wall
  const inside = step(abs(q.x), 0.5).mul(step(abs(q.y), 0.5)).mul(step(abs(q.z), 0.5));
  const facing = smoothstep(0.2, 0.5, normalWorld.dot(G.normal));
  const a = texture(G.tex, vec3(q.x.add(0.5), q.y.add(0.5), 0).xy).r;
  return a.mul(inside).mul(facing).mul(G.opacity).mul(G.on);
}
// paint amount of a piece at the current fragment (0..1) — used inside the ink material
export function graffitiAt(which = 1) {
  if (!_nodes.has(which)) _nodes.set(which, which === 2 ? slotAt(GR2, () => useWordsImage()) : which === 3 ? slotAt(GR3, () => paintTag(GR3, '0309')) : which === 4 ? slotAt(GR4, () => paintBubble(GR4, "WAKE UP,\nYOU'RE DREAMING")) : slotAt(GR, () => paintGraffiti()));
  return _nodes.get(which);
}
