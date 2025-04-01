import * as THREE from 'three';
import { texture, uv, float, vec3, mix, uniform, step, fract, abs, Fn, max } from 'three';

// Street clutter in the print style (paper + ink only): weathered road signs and stickers painted on one canvas
// atlas, used as thin metal plates (on poles, trees, walls, cars, the cell), a sawhorse barricade, a dumpster with
// stickers and tags, a pile of tyres, and newspaper sheets + a plastic bag blown about by the wind.
// All art is drawn here (own drawings): white = paper, black = ink. Materials read it as the ink "pattern".

const COLS = 5, ROWS = 4, CS = 512;
export const CELLS = ['stop', 'deadend', 'oneway', 'speed', 'wrongway', 'noparking', 'donotenter', 'yield', 'rxr', 'parking',
  'ped', 'caution', 'hello', 'label', 'news', 'danger', 'stripes', 'bag', 'wakeup', 'blank'];
const SPEC = {
  stop: ['oct', 1], deadend: ['diamond', 1], oneway: ['rect', 2.6], speed: ['rect', 0.8], wrongway: ['rect', 1.35], noparking: ['rect', 0.75],
  donotenter: ['circle', 1], yield: ['tri', 1.15], rxr: ['circle', 1], parking: ['round', 0.85], ped: ['diamond', 1], caution: ['rect', 1.35],
  hello: ['round', 1.45], label: ['round', 1.8], news: ['rect', 0.75], danger: ['rect', 4.2], stripes: ['rect', 4.2], bag: ['bag', 0.75],
  wakeup: ['circle', 1], blank: ['rect', 1],
};
let seed = 20260928;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// art box inside a cell (px) and its uv rectangle
function box(name) {
  const i = CELLS.indexOf(name), c = i % COLS, r = (i / COLS) | 0, a = SPEC[name][1], M = 488;
  const bw = a >= 1 ? M : M * a, bh = a >= 1 ? M / a : M, x = c * CS + (CS - bw) / 2, y = r * CS + (CS - bh) / 2;
  const W = COLS * CS, H = ROWS * CS;
  return { x, y, w: bw, h: bh, u0: x / W, u1: (x + bw) / W, v0: 1 - (y + bh) / H, v1: 1 - y / H };
}
// outline of a shape in a w×h box centred on 0 (y up)
function outline(shape, w, h) {
  const P = [];
  if (shape === 'oct') { const r = w / 2 / Math.cos(Math.PI / 8); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; P.push([Math.cos(a) * r, Math.sin(a) * r]); } }
  else if (shape === 'diamond') P.push([0, h / 2], [w / 2, 0], [0, -h / 2], [-w / 2, 0]);
  else if (shape === 'circle') for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; P.push([Math.cos(a) * w / 2, Math.sin(a) * h / 2]); }
  else if (shape === 'tri') P.push([-w / 2, h / 2], [w / 2, h / 2], [0, -h / 2]);
  else if (shape === 'round') { const r = Math.min(w, h) * 0.14; for (const [cx, cy, a0] of [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI], [w / 2 - r, -h / 2 + r, Math.PI * 1.5]]) for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } }
  else P.push([-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]);
  return P;
}
const pathOf = (g, b, shape, inset = 0) => {   // canvas path of the shape in art box b (y down), inset in px
  const P = outline(shape, b.w - inset * 2, b.h - inset * 2); g.beginPath();
  P.forEach(([x, y], i) => { const X = b.x + b.w / 2 + x, Y = b.y + b.h / 2 - y; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath();
};

// ---------------------------------------------------------------- painting helpers
const INK = '#000', PAPER = '#fff';
const font = (px, w = 900) => `${w} ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
function text(g, str, cx, cy, px, col, maxW, w = 900) {
  g.font = font(px, w); const m = g.measureText(str).width; const k = maxW && m > maxW ? maxW / m : 1;
  g.save(); g.translate(cx, cy); g.scale(k, 1); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, 0, 0); g.restore();
}
function lines(g, b, rows, px, col, gap = 1.08) { const n = rows.length; rows.forEach((r, i) => text(g, r, b.x + b.w / 2, b.y + b.h / 2 + (i - (n - 1) / 2) * px * gap, px, col, b.w * 0.82)); }
function weather(g, b, shape, amt = 1) {   // rust stipple, scratches, peel, marker tags — clipped to the plate
  g.save(); pathOf(g, b, shape); g.clip();
  for (let k = 0; k < 5 * amt; k++) {   // rust blooms: ink stipple
    const cx = b.x + rnd() * b.w, cy = b.y + rnd() * b.h, R = 12 + rnd() * 40;
    g.fillStyle = INK; for (let j = 0; j < 220; j++) { const r = Math.abs(gauss()) * R * 0.5; const a = rnd() * 7; g.globalAlpha = 0.5 + rnd() * 0.5; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5 + rnd() * 2, 1.5 + rnd() * 2); }
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 10 * amt; k++) {   // scratches: paper and ink hairlines
    g.strokeStyle = rnd() < 0.6 ? PAPER : INK; g.lineWidth = 0.8 + rnd() * 1.2; const x = b.x + rnd() * b.w, y = b.y + rnd() * b.h, L = 20 + rnd() * 90, a = rnd() * 7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  for (let k = 0; k < 3 * amt; k++) {   // peeled patches (paper) with ragged edges
    const cx = b.x + rnd() * b.w, cy = b.y + rnd() * b.h, R = 6 + rnd() * 18; g.fillStyle = PAPER; g.beginPath();
    for (let a = 0; a < 7; a += 0.5) { const r = R * (0.6 + rnd() * 0.6); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill();
  }
  if (rnd() < 0.8 * amt) tag(g, b.x + b.w * (0.2 + rnd() * 0.6), b.y + b.h * (0.25 + rnd() * 0.55), Math.min(b.w, b.h) * (0.12 + rnd() * 0.08));
  g.restore();
}
const TAGS = ['0309', 'WAKE UP', 'LUCID', 'ZZZ', 'NOCTURNAL', 'DREAM ON', '?'];
function tag(g, x, y, s) {   // a quick marker tag or a smiley
  g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 0.8); g.lineCap = g.lineJoin = 'round';
  const col = rnd() < 0.5 ? INK : PAPER; g.strokeStyle = g.fillStyle = col;
  if (rnd() < 0.3) { g.lineWidth = s * 0.08; g.beginPath(); g.arc(0, 0, s * 0.45, 0, 7); g.stroke(); g.beginPath(); g.arc(-s * 0.15, -s * 0.1, s * 0.05, 0, 7); g.arc(s * 0.15, -s * 0.1, s * 0.05, 0, 7); g.fill(); g.beginPath(); g.arc(0, s * 0.05, s * 0.22, 0.3, 2.8); g.stroke(); }
  else { g.font = `italic 900 ${s * 0.55}px "Brush Script MT", "Marker Felt", cursive`; g.lineWidth = s * 0.05; const t = TAGS[(rnd() * TAGS.length) | 0]; g.textAlign = 'center'; g.fillText(t, 0, 0); g.beginPath(); g.moveTo(-s * 0.7, s * 0.3); g.quadraticCurveTo(0, s * 0.5, s * 0.8, s * 0.2); g.stroke(); }
  g.restore();
}
function plate(g, b, shape, face, border) {   // face colour + inner border ring (road-sign style)
  pathOf(g, b, shape); g.fillStyle = face; g.fill();
  pathOf(g, b, shape, Math.min(b.w, b.h) * 0.045); g.lineWidth = Math.min(b.w, b.h) * 0.025; g.strokeStyle = border; g.stroke();
  pathOf(g, b, shape); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
}
const arrow = (g, b, col, dir = 1) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, L = b.w * 0.7, t = b.h * 0.18; g.save(); g.translate(cx, cy); g.scale(dir, 1); g.fillStyle = col; g.beginPath(); g.moveTo(-L / 2, -t); g.lineTo(L / 4, -t); g.lineTo(L / 4, -t * 2.2); g.lineTo(L / 2, 0); g.lineTo(L / 4, t * 2.2); g.lineTo(L / 4, t); g.lineTo(-L / 2, t); g.closePath(); g.fill(); g.restore(); };

const ART = {
  stop(g, b) { plate(g, b, 'oct', INK, PAPER); text(g, 'STOP', b.x + b.w / 2, b.y + b.h / 2, b.h * 0.3, PAPER, b.w * 0.78); weather(g, b, 'oct', 1.2); },
  deadend(g, b) { plate(g, b, 'diamond', PAPER, INK); lines(g, { x: b.x + b.w * 0.25, y: b.y + b.h * 0.25, w: b.w * 0.5, h: b.h * 0.5 }, ['DEAD', 'END'], b.h * 0.12, INK); weather(g, b, 'diamond', 1.4); },
  oneway(g, b) { plate(g, b, 'rect', INK, PAPER); arrow(g, b, PAPER); text(g, 'ONE WAY', b.x + b.w * 0.44, b.y + b.h / 2, b.h * 0.26, INK, b.w * 0.42); weather(g, b, 'rect', 0.8); },
  speed(g, b) { plate(g, b, 'rect', PAPER, INK); text(g, 'SPEED', b.x + b.w / 2, b.y + b.h * 0.2, b.h * 0.12, INK, b.w * 0.8); text(g, 'LIMIT', b.x + b.w / 2, b.y + b.h * 0.34, b.h * 0.12, INK, b.w * 0.8); text(g, '25', b.x + b.w / 2, b.y + b.h * 0.66, b.h * 0.36, INK, b.w * 0.8); weather(g, b, 'rect', 1.3); },
  wrongway(g, b) { plate(g, b, 'rect', INK, PAPER); lines(g, b, ['WRONG', 'WAY'], b.h * 0.3, PAPER); weather(g, b, 'rect', 1.4); },
  noparking(g, b) { plate(g, b, 'rect', PAPER, INK); g.fillStyle = INK; g.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.08, b.w * 0.3, b.h * 0.14); text(g, 'NO', b.x + b.w * 0.25, b.y + b.h * 0.15, b.h * 0.1, PAPER); text(g, 'PARKING', b.x + b.w * 0.66, b.y + b.h * 0.15, b.h * 0.09, INK, b.w * 0.5); lines(g, { x: b.x, y: b.y + b.h * 0.3, w: b.w, h: b.h * 0.6 }, ['ANY', 'TIME'], b.h * 0.2, INK); weather(g, b, 'rect', 1.2); },
  donotenter(g, b) { plate(g, b, 'circle', INK, PAPER); g.fillStyle = PAPER; g.fillRect(b.x + b.w * 0.14, b.y + b.h * 0.43, b.w * 0.72, b.h * 0.14); text(g, 'DO NOT', b.x + b.w / 2, b.y + b.h * 0.29, b.h * 0.12, PAPER, b.w * 0.6); text(g, 'ENTER', b.x + b.w / 2, b.y + b.h * 0.71, b.h * 0.12, PAPER, b.w * 0.6); weather(g, b, 'circle', 1.1); },
  yield(g, b) { plate(g, b, 'tri', PAPER, INK); pathOf(g, b, 'tri', b.h * 0.1); g.lineWidth = b.h * 0.1; g.strokeStyle = INK; g.stroke(); text(g, 'YIELD', b.x + b.w / 2, b.y + b.h * 0.3, b.h * 0.13, INK, b.w * 0.45); weather(g, b, 'tri', 1); },
  rxr(g, b) { plate(g, b, 'circle', PAPER, INK); g.strokeStyle = INK; g.lineWidth = b.w * 0.08; g.beginPath(); g.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.2); g.lineTo(b.x + b.w * 0.8, b.y + b.h * 0.8); g.moveTo(b.x + b.w * 0.8, b.y + b.h * 0.2); g.lineTo(b.x + b.w * 0.2, b.y + b.h * 0.8); g.stroke(); text(g, 'R', b.x + b.w * 0.27, b.y + b.h / 2, b.h * 0.2, INK); text(g, 'R', b.x + b.w * 0.73, b.y + b.h / 2, b.h * 0.2, INK); weather(g, b, 'circle', 1); },
  parking(g, b) { plate(g, b, 'round', INK, PAPER); text(g, 'P', b.x + b.w / 2, b.y + b.h * 0.52, b.h * 0.7, PAPER); weather(g, b, 'round', 1.6); },
  ped(g, b) { plate(g, b, 'diamond', PAPER, INK); const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = b.w * 0.22; g.strokeStyle = g.fillStyle = INK; g.lineCap = 'round'; g.lineWidth = s * 0.22; g.beginPath(); g.arc(cx + s * 0.1, cy - s * 0.95, s * 0.2, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx, cy - s * 0.6); g.lineTo(cx - s * 0.1, cy + s * 0.2); g.lineTo(cx - s * 0.5, cy + s * 0.9); g.moveTo(cx - s * 0.1, cy + s * 0.2); g.lineTo(cx + s * 0.35, cy + s * 0.9); g.moveTo(cx - s * 0.05, cy - s * 0.4); g.lineTo(cx - s * 0.5, cy); g.moveTo(cx - s * 0.05, cy - s * 0.4); g.lineTo(cx + s * 0.4, cy - s * 0.05); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(cx - s * 1.2, cy + s * 1.05); g.lineTo(cx + s * 1.2, cy + s * 1.05); g.stroke(); weather(g, b, 'diamond', 1); },
  caution(g, b) { plate(g, b, 'rect', PAPER, INK); g.fillStyle = INK; g.fillRect(b.x + b.w * 0.06, b.y + b.h * 0.08, b.w * 0.88, b.h * 0.24); text(g, 'CAUTION', b.x + b.w / 2, b.y + b.h * 0.2, b.h * 0.16, PAPER, b.w * 0.8); text(g, 'DREAMS AHEAD', b.x + b.w / 2, b.y + b.h * 0.62, b.h * 0.14, INK, b.w * 0.8); weather(g, b, 'rect', 1.5); },
  hello(g, b) { pathOf(g, b, 'round'); g.fillStyle = PAPER; g.fill(); g.save(); pathOf(g, b, 'round'); g.clip(); g.fillStyle = INK; g.fillRect(b.x, b.y, b.w, b.h * 0.34); g.restore(); text(g, 'HELLO', b.x + b.w / 2, b.y + b.h * 0.15, b.h * 0.16, PAPER, b.w * 0.7); text(g, 'my name is', b.x + b.w / 2, b.y + b.h * 0.28, b.h * 0.07, PAPER, b.w * 0.6, 400); tag(g, b.x + b.w / 2, b.y + b.h * 0.64, b.h * 0.5); pathOf(g, b, 'round'); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); },
  label(g, b) { pathOf(g, b, 'round'); g.fillStyle = PAPER; g.fill(); g.fillStyle = INK; for (let x = b.x + b.w * 0.08; x < b.x + b.w * 0.62; x += 3 + rnd() * 7) g.fillRect(x, b.y + b.h * 0.14, 1.5 + rnd() * 4, b.h * 0.5); g.font = font(b.h * 0.1, 700); g.fillText('0309 2026', b.x + b.w * 0.08, b.y + b.h * 0.8); text(g, 'SQRT(-1)', b.x + b.w * 0.82, b.y + b.h * 0.35, b.h * 0.1, INK, b.w * 0.3, 700); text(g, 'REQUIRES', b.x + b.w * 0.82, b.y + b.h * 0.55, b.h * 0.08, INK, b.w * 0.3, 700); text(g, 'LUCIDITY', b.x + b.w * 0.82, b.y + b.h * 0.68, b.h * 0.08, INK, b.w * 0.3, 700); pathOf(g, b, 'round'); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); },
  news(g, b) {
    g.fillStyle = PAPER; g.fillRect(b.x, b.y, b.w, b.h); g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    text(g, 'THE DAILY DREAM', b.x + b.w / 2, b.y + b.h * 0.07, b.h * 0.06, INK, b.w * 0.85); g.fillStyle = INK; g.fillRect(b.x + b.w * 0.06, b.y + b.h * 0.115, b.w * 0.88, 3); g.fillRect(b.x + b.w * 0.06, b.y + b.h * 0.125, b.w * 0.88, 1.2);
    text(g, 'YOU ARE DREAMING', b.x + b.w / 2, b.y + b.h * 0.19, b.h * 0.07, INK, b.w * 0.86);
    const px = b.x + b.w * 0.06, py = b.y + b.h * 0.26, pw = b.w * 0.5, ph = b.h * 0.26; g.strokeRect(px, py, pw, ph);
    for (let y = py + 4; y < py + ph - 2; y += 7) for (let x = px + 4; x < px + pw - 2; x += 7) { const r = 2.8 * (0.5 + 0.5 * Math.sin(x * 0.03 + y * 0.05)); g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, 7); g.fill(); }
    const col = (x0, y0, w, y1) => { for (let y = y0; y < y1; y += 9) g.fillRect(x0, y, w * (y + 9 > y1 || rnd() < 0.08 ? 0.5 + rnd() * 0.4 : 1), 2.2); };
    col(b.x + b.w * 0.6, py, b.w * 0.34, py + ph); col(b.x + b.w * 0.06, py + ph + 12, b.w * 0.27, b.y + b.h * 0.94); col(b.x + b.w * 0.365, py + ph + 12, b.w * 0.27, b.y + b.h * 0.94); col(b.x + b.w * 0.67, py + ph + 12, b.w * 0.27, b.y + b.h * 0.94);
  },
  danger(g, b) { plate(g, b, 'rect', INK, PAPER); text(g, 'DANGER', b.x + b.w / 2, b.y + b.h * 0.54, b.h * 0.62, PAPER, b.w * 0.8); weather(g, b, 'rect', 2); },
  stripes(g, b) { g.save(); pathOf(g, b, 'rect'); g.clip(); g.fillStyle = PAPER; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = INK; for (let x = b.x - b.h; x < b.x + b.w; x += b.h * 1.1) { g.beginPath(); g.moveTo(x, b.y + b.h); g.lineTo(x + b.h * 0.55, b.y + b.h); g.lineTo(x + b.h * 1.1, b.y); g.lineTo(x + b.h * 0.55, b.y); g.fill(); } g.restore(); pathOf(g, b, 'rect'); g.lineWidth = 4; g.strokeStyle = INK; g.stroke(); weather(g, b, 'rect', 1.5); },
  bag(g, b) {   // plastic bag with handles (transparent outside the bag: alpha-tested)
    const x = b.x, y = b.y, w = b.w, h = b.h; g.beginPath();
    g.moveTo(x + w * 0.08, y + h * 0.3); g.lineTo(x + w * 0.1, y + h * 0.03); g.lineTo(x + w * 0.32, y + h * 0.03); g.lineTo(x + w * 0.35, y + h * 0.2); g.lineTo(x + w * 0.65, y + h * 0.2); g.lineTo(x + w * 0.68, y + h * 0.03); g.lineTo(x + w * 0.9, y + h * 0.03); g.lineTo(x + w * 0.92, y + h * 0.3);
    g.quadraticCurveTo(x + w * 1.0, y + h * 0.7, x + w * 0.94, y + h * 0.97); g.lineTo(x + w * 0.06, y + h * 0.97); g.quadraticCurveTo(x, y + h * 0.7, x + w * 0.08, y + h * 0.3); g.closePath();
    g.fillStyle = PAPER; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.ellipse(x + w * 0.21, y + h * 0.12, w * 0.07, h * 0.06, 0, 0, 7); g.ellipse(x + w * 0.79, y + h * 0.12, w * 0.07, h * 0.06, 0, 0, 7); g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over';
    lines(g, { x: x + w * 0.1, y: y + h * 0.35, w: w * 0.8, h: h * 0.5 }, ['THANK YOU', 'FOR', 'DREAMING'], h * 0.09, INK);
    g.strokeStyle = INK; g.lineWidth = 1.5; for (let k = 0; k < 7; k++) { g.beginPath(); const xx = x + w * (0.15 + rnd() * 0.7); g.moveTo(xx, y + h * 0.3); g.quadraticCurveTo(xx + (rnd() - 0.5) * 40, y + h * 0.6, xx + (rnd() - 0.5) * 30, y + h * 0.95); g.stroke(); }   // creases
  },
  wakeup(g, b) { pathOf(g, b, 'circle'); g.fillStyle = PAPER; g.fill(); pathOf(g, b, 'circle', 18); g.lineWidth = 16; g.strokeStyle = INK; g.stroke(); lines(g, b, ['WAKE', 'UP'], b.h * 0.2, INK); pathOf(g, b, 'circle'); g.lineWidth = 4; g.stroke(); },
  blank(g, b) { g.fillStyle = PAPER; g.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24); },
};

let ATLAS = null;
export function signAtlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = COLS * CS; c.height = ROWS * CS; const g = c.getContext('2d');
  for (const n of CELLS) { g.save(); ART[n](g, box(n)); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  ATLAS = t; return t;
}
export const cellUV = (name) => { const b = box(name); return { ...b, aspect: SPEC[name][1] }; };
export const STICKERS = ['hello', 'label', 'wakeup', 'stop', 'deadend', 'parking', 'noparking', 'yield', 'rxr', 'donotenter', 'ped', 'speed', 'wrongway', 'oneway'];
export const signPattern = () => texture(signAtlas(), uv()).r;         // 1 = paper, 0 = ink
export const signAlpha = () => texture(signAtlas(), uv()).a;

// a sign plate: extruded shape, front face (+z, at z = 0) mapped to the cell, back and edges plain paper
export function signGeo(name, size, depth = null) {
  const [shape, a] = SPEC[name], w = a >= 1 ? size : size * a, h = a >= 1 ? size / a : size;
  const sh = new THREE.Shape(outline(shape === 'bag' ? 'rect' : shape, w, h).map(([x, y]) => new THREE.Vector2(x, y)));
  const d = depth ?? size * 0.03;
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -d);
  const b = box(name), bl = box('blank'), p = geo.attributes.position, uvA = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) > -1e-5) uvA.setXY(i, b.u0 + (p.getX(i) + w / 2) / w * (b.u1 - b.u0), b.v0 + (p.getY(i) + h / 2) / h * (b.v1 - b.v0));
    else uvA.setXY(i, (bl.u0 + bl.u1) / 2, (bl.v0 + bl.v1) / 2);
  }
  geo.computeVertexNormals();
  return geo;
}
// a sheet (for flyers): plane with segments, uv mapped to a cell
export function sheetGeo(name, size, sx = 8, sy = 10) {
  const a = SPEC[name][1], w = a >= 1 ? size : size * a, h = a >= 1 ? size / a : size, b = box(name);
  const geo = new THREE.PlaneGeometry(w, h, sx, sy), uvA = geo.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, b.u0 + uvA.getX(i) * (b.u1 - b.u0), b.v0 + uvA.getY(i) * (b.v1 - b.v0));
  return geo;
}
// place a plate: at point p, facing normal n (world or parent space), rotated `roll` about the normal
const _z = new THREE.Vector3(0, 0, 1), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
export function placeOn(geo, p, n, roll = 0, off = 0.05) {
  _q.setFromUnitVectors(_z, n.clone().normalize()); _q2.setFromAxisAngle(_z, roll); _q.multiply(_q2);
  return geo.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(n, off), _q, new THREE.Vector3(1, 1, 1)));
}
export const pick = (list, i) => list[Math.abs(Math.floor(i)) % list.length];

// ---------------------------------------------------------------- props (geometry lists; the caller supplies materials)
// sawhorse barricade: 4 splayed legs, top board with stripes, lower board DANGER
export function barricade() {
  const wood = [], plates = [], W = 9;
  for (const x of [-W / 2 + 1, W / 2 - 1]) for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.35, 7.6, 0.35); g.rotateX(s * 0.18); g.translate(x, 3.6, s * 0.7); wood.push(g); }
  wood.push(new THREE.BoxGeometry(W, 1.3, 0.3).translate(0, 6.2, 1.1), new THREE.BoxGeometry(W * 0.9, 1.1, 0.3).translate(-0.4, 3.6, 1.35), new THREE.BoxGeometry(W - 1.4, 0.3, 0.3).translate(0, 5, -1.3));
  plates.push(signGeo('stripes', W, 0.02).translate(0, 6.2, 1.27), signGeo('danger', W * 0.9, 0.02).rotateZ(-0.03).translate(-0.4, 3.6, 1.52));
  return { wood, plates };
}
// a sign on a pole standing on a rubber base (for the road) or planted in the ground
export function poleSign(name, size, H, base = false) {
  const metal = [cylY(0.14, H).translate(0, H / 2, 0)], plates = [signGeo(name, size).translate(0, H + size * 0.35, 0.18)];
  if (base) metal.push(new THREE.CylinderGeometry(1.1, 1.4, 0.5, 16).translate(0, 0.25, 0));
  return { metal, plates };
}
const cylY = (r, h, s = 10) => new THREE.CylinderGeometry(r, r, h, s);
// dumpster on castors, lid in two halves; returns body/lid/wheels geometry and sticker plates
export function dumpster() {
  const body = [], dark = [], plates = [], W = 7.5, D = 4.6, H = 4.4;
  const shell = new THREE.CylinderGeometry(1, 0.86, 1, 4, 1).rotateY(Math.PI / 4); shell.scale(W / 1.414, H, D / 1.414); shell.translate(0, H / 2 + 0.9, 0); body.push(shell);
  body.push(new THREE.BoxGeometry(W + 0.5, 0.35, D + 0.5).translate(0, H + 0.95, 0));   // rim
  for (const s of [-1, 1]) { const lid = new THREE.BoxGeometry(W / 2 + 0.1, 0.4, D + 0.7); lid.rotateX(-0.06); lid.translate(s * W / 4, H + 1.35, 0.1); body.push(lid); body.push(new THREE.BoxGeometry(0.6, 0.35, 0.9).translate(s * W * 0.35, H + 1.3, D / 2 + 0.7)); }
  for (const x of [-W / 2 + 0.9, W / 2 - 0.9]) for (const z of [-D / 2 + 0.7, D / 2 - 0.7]) { dark.push(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 16).rotateX(Math.PI / 2).translate(x, 0.55, z)); body.push(new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(x, 0.95, z)); }
  const front = (p, name, s, r) => plates.push(signGeo(name, s, 0.02).rotateZ(r).translate(p[0], p[1], D / 2 - 0.05 + 0.02));
  front([-1.4, 3.2], 'hello', 2.6, 0.04); front([1.9, 2.3], 'label', 2.2, -0.1); front([2.1, 4.1], 'wakeup', 1.3, 0.2);
  const side = signGeo('noparking', 2.4, 0.02).rotateY(Math.PI / 2).rotateX(0.05).translate(W / 2 - 0.25, 3.0, -0.3); plates.push(side);
  return { body, dark, plates };
}
// pile of tyres: a real tyre cross-section (sidewalls bulge, square-ish shoulders, a flat tread band, the bead
// hole) revolved; uv.y walks round the profile so the tread and sidewall markings can be drawn from it
const TYRE = [[1.0, 0.42], [1.08, 0.56], [1.3, 0.64], [1.55, 0.63], [1.68, 0.56], [1.74, 0.42], [1.76, 0.22], [1.765, 0], [1.76, -0.22], [1.74, -0.42], [1.68, -0.56], [1.55, -0.63], [1.3, -0.64], [1.08, -0.56], [1.0, -0.42], [0.97, 0], [1.0, 0.42]];
const tyreGeo = (s = 1) => new THREE.LatheGeometry(TYRE.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 48);
export function tyres() {
  const rubber = [], blocks = [];
  for (let i = 0; i < 4; i++) rubber.push(tyreGeo().rotateY(i * 0.7).translate((i % 2) * 0.12, 0.64 + i * 1.27, 0));
  rubber.push(tyreGeo().rotateX(0.2).translate(3.7, 0.9, 1.3), tyreGeo().rotateZ(Math.PI / 2 - 0.22).translate(-3.2, 1.9, 0.6), tyreGeo().translate(3.3, 0.64, -2.4), tyreGeo().translate(3.3, 1.92, -2.4));
  const cinder = (x, y, z, r) => blocks.push(new THREE.BoxGeometry(2.4, 1.2, 1.2).rotateY(r).translate(x, y, z));
  cinder(0.1, 5.8, 0.1, 0.4); cinder(3.4, 3.2, -2.3, -0.3); cinder(-1.6, 0.6, 2.4, 1.1);
  for (const [x, r] of [[-1.9, 0.22], [-1.2, 0.12]]) blocks.push(new THREE.BoxGeometry(0.9, 7.5, 0.25).translate(0, 3.75, 0).rotateZ(r).translate(x, 0, 2.0));
  return { rubber, blocks };
}
// tyre markings from the lathe uv: tread band (idx 5..11 of 16 → v .31–.69) with two circumferential grooves
// and staggered transverse lugs; two raised rings on each sidewall
export const treadPattern = () => Fn(() => {
  const u = uv().x, v = uv().y, band = (a, b) => step(a, v).mul(step(v, b));
  const tread = band(0.31, 0.69);
  const groove = band(0.43, 0.455).add(band(0.545, 0.57));
  const row = step(0.5, v), lug = step(0.72, fract(u.mul(56).add(row.mul(0.5)))).mul(band(0.33, 0.67));
  const side = band(0.1, 0.115).add(band(0.2, 0.212)).add(band(0.785, 0.8)).add(band(0.885, 0.9));
  return float(1).sub(max(max(groove, lug).mul(tread), side).clamp(0, 1).mul(0.92));
})();

// a 3D plastic bag: a flattened tube, pinched shut at the bottom, the top cut down between two handles
export function bagGeo(size) {
  const b = box('bag'), bl = box('blank'), H = size, R = size * 0.42;
  const g = new THREE.CylinderGeometry(1, 1, 1, 24, 12, true), p = g.attributes.position, uvA = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i) + 0.5, ux = uvA.getX(i);   // y: 0 bottom → 1 top
    const flat = 0.35 * (0.25 + 0.75 * Math.min(1, y * 3));                               // pinched seam at the bottom
    let X = Math.cos(a) * R * (1 + 0.12 * Math.sin(y * Math.PI)), Z = Math.sin(a) * R * flat, Y = (y - 0.5) * H;
    const ax = Math.abs(Math.cos(a));
    if (y > 0.8) { const handle = ax > 0.45 && ax < 0.9; const cut = ax < 0.45 ? 0.62 : handle ? 1.12 : 0.9; Y = (Math.min(y, 0.8) + (y - 0.8) / 0.2 * (cut - 0.8) - 0.5) * H; if (handle) { X *= 1 - (y - 0.8) * 0.8; Z *= 1 - (y - 0.8) * 2.5; } }
    p.setXYZ(i, X, Y, Z);
    uvA.setXY(i, b.u0 + (0.1 + 0.8 * ((ux * 2) % 1)) * (b.u1 - b.u0), b.v0 + (0.06 + 0.66 * Math.min(y, 0.9)) * (b.v1 - b.v0));
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- wind-blown sheets (newspapers, a bag)
// CPU: each sheet drifts on the wind with turbulence, tumbles, and its vertices flutter (travelling wave + curl).
// Sheets that leave the area round the camera are re-spawned ahead of it.
export class Flyers {
  constructor(mats, list, area) {
    this.group = new THREE.Group(); this.items = []; this.area = { turb: 1, ...area };   // area: { ahead, spread, y0, y1, dir }
    list.forEach(([name, size], i) => {
      const geo = name === 'bag3d' ? bagGeo(size) : sheetGeo(name, size, 8, 10), mesh = new THREE.Mesh(geo, mats[name] || mats.news);
      mesh.frustumCulled = false; this.group.add(mesh);
      this.items.push({ mesh, base: geo.attributes.position.array.slice(), ph: i * 1.7, v: new THREE.Vector3(), spin: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5), bag: name === 'bag' || name === 'bag3d', bag3d: name === 'bag3d', born: false, size });
    });
  }
  spawn(it, cam, mode) {   // mode: 'first' (anywhere), 'ahead' (fell behind), 'side' (blew out sideways → upwind edge)
    const A = this.area, d = A.dir, perp = new THREE.Vector3(-d.z, 0, d.x), wl = this.wind().dot(perp);
    const along = mode === 'first' ? (A.near ?? -0.2 * A.ahead) + rnd() * A.ahead : mode === 'ahead' ? A.ahead * (0.6 + rnd() * 0.4) : (A.near ?? 0) + rnd() * A.ahead * 0.8;
    const lat = mode === 'side' && Math.abs(wl) > 0.3 ? -Math.sign(wl) * A.spread * 0.5 : (rnd() - 0.5) * A.spread;
    const p = it.mesh.position.set(cam.x + d.x * along + perp.x * lat, A.y0 + rnd() * (A.y1 - A.y0), cam.z + d.z * along + perp.z * lat);
    if (A.clampZ) p.z = THREE.MathUtils.clamp(p.z, -A.clampZ, A.clampZ);
    it.mesh.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6); it.born = true;
  }
  wind() { const A = this.area; return A.windVec ? A.windVec.clone() : A.dir.clone().multiplyScalar(-A.wind); }
  update(t, dt, cam, o = {}) {
    const A = this.area, wind = o.speed ?? 1, n = Math.round(o.count ?? this.items.length);
    this.items.forEach((it, i) => {
      const m = it.mesh; m.visible = i < n; if (!m.visible) return;
      if (!it.born) this.spawn(it, cam, 'first');
      const p = m.position, d = A.dir, rx = p.x - cam.x, rz = p.z - cam.z, ahead = rx * d.x + rz * d.z, lat = -rx * d.z + rz * d.x;
      if (ahead < -A.behind || ahead > A.ahead * 1.3 || p.y < A.y0 - 3 || p.y > A.y1 + 8) this.spawn(it, cam, 'ahead');
      else if (Math.abs(lat) > A.spread * 0.6) this.spawn(it, cam, 'side');
      // the wind (gusting) carries them; they lift and sink, bags float more
      const g = Math.sin(t * 0.7 + it.ph) * 0.5 + 0.8, W = this.wind();
      it.v.set(W.x * g + Math.sin(t * 1.3 + it.ph * 3) * 1.5 * A.turb, Math.sin(t * 1.1 + it.ph) * (it.bag ? 1.6 : 1.1) * A.turb + (it.bag ? 0.2 : -0.15), W.z * g + Math.cos(t * 0.9 + it.ph * 2) * 1.5 * A.turb);
      p.addScaledVector(it.v, dt * wind);
      m.rotation.x += it.spin.x * dt * 2.2 * wind; m.rotation.y += it.spin.y * dt * 1.6 * wind; m.rotation.z += it.spin.z * dt * 1.4 * wind;
      const P = m.geometry.attributes.position.array, B = it.base, s = it.size;
      if (it.bag3d) {   // breathing, rippling plastic: puffs up and collapses with the gusts, the handles flap
        const inf = 1 + 0.18 * Math.sin(t * 2.7 + it.ph) + 0.08 * Math.sin(t * 6.1 + it.ph * 2);
        for (let k = 0; k < P.length; k += 3) { const x = B[k] / s, y = B[k + 1] / s, z = B[k + 2] / s, w = Math.sin(x * 7 + y * 5 + t * 6 + it.ph) * 0.035;
          P[k] = (x * (1 + w) + (y > 0.3 ? Math.sin(t * 8 + x * 4 + it.ph) * 0.06 * (y - 0.3) : 0)) * s; P[k + 1] = (y + Math.sin(x * 5 + t * 5) * 0.02) * s; P[k + 2] = z * inf * (1 + w * 2) * s; }
        m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals(); return;
      }
      for (let k = 0; k < P.length; k += 3) { const x = B[k] / s, y = B[k + 1] / s; P[k + 2] = (Math.sin(x * 3.2 + t * (it.bag ? 5 : 7) + it.ph) * 0.12 + Math.sin(y * 2.4 - t * 4.3 + it.ph) * 0.08 + (x * x) * 0.35 + (it.bag ? Math.sin(x * 9 + y * 7) * 0.04 : 0)) * s; }
      m.geometry.attributes.position.needsUpdate = true; m.geometry.computeVertexNormals();
    });
  }
}
