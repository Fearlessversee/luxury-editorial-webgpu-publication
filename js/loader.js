import * as THREE from 'three';
import { uniform, vec2, vec3, vec4, float, mix, smoothstep, clamp, abs, min, dot, step, floor, hash, screenUV, screenCoordinate, mx_noise_float, attribute, length, texture } from 'three';
import { makeTitles } from './titles.js';
import { DEF } from './params.js';
import { SND, apply as applySound, soundEnable } from './sound.js';

// The loader (Figma "SHOTS | 2026" 15371:17727). While the site warms up behind it: the lattice of nine circles,
// the title stuck on like every title on the site (titles.js — same stickers, tape, peel), the line of text, the
// sound buttons and a % counter.
// Once the site is ready AND a sound choice is made, the title peels off and the loader burns away — the burn
// starts on every circle line at once and eats outwards — onto the home page.

const root = document.getElementById('loader');
const $ = (s) => root.querySelector(s);
const CIRCLES = [[540, 540], [1380, 540], [960, 540], [960, 960], [960, 120], [1257, 837], [663, 243], [663, 837], [1257, 243]];
const CREAM = '#daceb0', BG = '#030302', RIM = '#fdf4df';
const ease = (t) => t * t * (3 - 2 * t);
let ready = false, chosen = null, done = false, doneAt = 0, T = 0, mainGo = false;
const startMain = () => { if (!mainGo) { mainGo = true; window.__startMain && window.__startMain(); } };
const check = () => { if (ready && chosen !== null && !done) { done = true; doneAt = performance.now(); } };
new MutationObserver(() => { if (root.classList.contains('hide') && !ready) { ready = true; root.classList.add('ready'); check(); } }).observe(root, { attributes: true });

// (no cursor effect on the loader)

// ---- the home page waits behind the loader: no intro, no title, no scroll, no hover, no clicks until we let go
window.__loaderHold = true;
for (const ev of ['wheel', 'touchmove', 'keydown', 'pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown', 'mouseup'])
  addEventListener(ev, (e) => { if (window.__loaderHold) { e.stopImmediatePropagation(); if ((ev === 'wheel' || ev === 'touchmove') && e.cancelable) e.preventDefault(); } }, { capture: true, passive: false });

// ---- the % counter: download / set-up first (time based), then the warm-up pass over every scene (main.js)
const cnt = $('[data-n]'), bar = $('.ldr-bar i'), t0 = performance.now(); let shown = 0;
const setN = (v) => { cnt.textContent = String(Math.floor(v)); if (bar) bar.style.transform = `scaleX(${Math.min(1, v / 100)})`; };   // the % and the line under it move together
function progress() {
  if (ready) return 100;
  // real loading: the files (three's loading manager: crow, leaves, town, table … textures), then the warm-up pass
  // that draws every scene once so all its shaders are compiled before the site shows
  const c = window.__crow; if (c && c.warm) { const wi = c.warm()[0]; return Math.min(99, 60 + (40 * Math.max(0, wi + 1)) / 19); }
  const ld = window.__crowLoad && window.__crowLoad();
  if (ld && ld[1] > 0) return 15 + 45 * Math.min(1, ld[0] / ld[1]);
  return 15 * (1 - Math.exp(-(performance.now() - t0) / 1500));
}

// ---- sound on / off: the choice is the sound of the site. Nothing plays until it's made; both buttons switch the
// audio engine on inside the click (browsers allow sound only from a real gesture), OFF keeps it muted.
SND.muted = true;
const bOn = $('[data-snd=on]'), bOff = $('[data-snd=off]');
const pickSnd = (on) => {
  if (done) return;
  bOn.classList.toggle('sel', on); bOff.classList.toggle('sel', !on); chosen = on;
  SND.muted = !on;
  try { if (!SND.enabled) soundEnable(); else applySound(); } catch (e) {}
  check();
};
bOn.addEventListener('click', () => pickSnd(true)); bOff.addEventListener('click', () => pickSnd(false));

// ---- three: background + circle lines + the title stickers, aberrated, then burnt away from the lines
let R = null;
try { R = new THREE.WebGPURenderer({ canvas: $('#ldr-gl'), antialias: true, alpha: true, forceWebGL: true }); await R.init(); }
catch (e) { R = null; }
const fallback = () => {   // static loader, faded out when the site is ready
  startMain(); root.classList.remove('live');
  const tick = () => { shown += (progress() - shown) * 0.08; setN(shown);
    if (done) { window.__loaderHold = false; root.classList.add('fadeout'); setTimeout(() => root.remove(), 1300); } else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
if (R) {
  R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setClearColor(0x000000, 0); R.toneMapping = THREE.NoToneMapping; R.outputColorSpace = THREE.LinearSRGBColorSpace;   // display values straight to the canvas
  const raw = (h) => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace);
  const CR = uniform(raw(CREAM)), BGC = uniform(raw(BG)), RIMC = uniform(raw(RIM));
  const wh = uniform(new THREE.Vector2(1, 1)), scU = uniform(1), dprU = uniform(1), aspect = uniform(1), burn = uniform(-0.3);
  const rt = new THREE.RenderTarget(2, 2, { depthBuffer: true });   // the title stickers are drawn here first
  const tT = texture(rt.texture);
  const lum = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722));
  const LC = 0.2126 * CR.value.r + 0.7152 * CR.value.g + 0.0722 * CR.value.b;
  // distance (design px) to the nearest circle line
  const lineDist = (u) => {
    const pd = u.mul(wh).sub(wh.mul(0.5)).div(scU).add(vec2(960, 540));
    let d = float(1e5); for (const [x, y] of CIRCLES) d = min(d, abs(length(pd.sub(vec2(x, y))).sub(540)));
    return d;
  };
  // the loader picture at a screen uv: dark ground, faint cream lines (0.75 px), the stickers over it
  const pic = (u) => {
    const dd = lineDist(u).mul(scU).mul(dprU), w = dprU.mul(0.5);   // hairlines: 0.5 css px
    const cov = clamp(w.mul(0.5).add(0.5).sub(dd), 0, 1).mul(0.09);   // barely there
    const base = mix(BGC, CR, cov), t = tT.uv(u);
    return base.mul(float(1).sub(t.a)).add(t.rgb);
  };
  const u0 = screenUV;
  const caCol = pic(u0);   // (no aberration here: it's for the 3D only, the loader is UI)
  const col = caCol;
  // the burn: starts on every circle line and eats outwards (distance to the lines + a little noise)
  const sp = u0.sub(0.5).mul(vec2(aspect, 1));
  const nz = clamp(lineDist(u0).div(170), 0, 1).pow(0.75).mul(0.84)
    .add(mx_noise_float(vec3(sp.mul(7.5), 0.3)).mul(0.11)).add(mx_noise_float(vec3(sp.mul(26), 1.7)).mul(0.05));
  const vis = smoothstep(burn.sub(0.0005), burn.add(0.0005), nz);
  const rim = float(1).sub(smoothstep(0.0, 0.028, nz.sub(burn)));
  const m = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false }); m.alphaTest = 0.5;   // opaque, holes burnt through
  m.vertexNode = vec4(attribute('position', 'vec3').xy, 0, 1);
  m.colorNode = mix(col, RIMC, rim); m.opacityNode = vis;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); quad.frustumCulled = false; scene.add(quad);
  const titles = makeTitles(R, { ...DEF, title0: 'LET ME SHOW\nWHAT A REAL LUCID DREAMING\nLOOKS LIKE', titlePos0: 'center', titleBox: CREAM, titleText: BG, tapeOpacity: 0.82, logoOn: 0, canOn: 0, fdOn: 0, tagOn: 0, sndOn: 0, cornersOn: 0, navOn: 1 });
  titles.target = rt;
  const db = new THREE.Vector2();
  const layout = () => {
    const W = innerWidth, H = innerHeight; R.setSize(W, H, false); R.getDrawingBufferSize(db); rt.setSize(db.x, db.y);
    wh.value.set(W, H); aspect.value = W / H; dprU.value = db.x / W; scU.value = Math.max(W / 1920, H / 1080);   // the design is 1920 × 1080, covered like the SVG (slice)
  };
  layout(); addEventListener('resize', layout);
  let first = true, tFirst = 0, last = performance.now(), outT = -1;
  const frame0 = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    shown += Math.max(0, progress() - shown) * (1 - Math.exp(-dt * 4));   // never counts back
    setN(ready ? Math.max(shown, 99.5) + 0.5 : shown);
    if (first) tFirst = now; else if (now - tFirst > 2100) startMain();   // the site's heavy warm-up starts once the title has stuck (so the stickers never stutter)
    // the end: the title peels off, then the burn from the lines
    if (done && outT < 0 && now - doneAt > 250) { outT = 0; root.classList.add('out'); }
    if (outT >= 0) outT += dt;
    const bk = outT < 0.75 ? 0 : ease(Math.min(1, (outT - 0.75) / 1.7));
    burn.value = -0.3 + 1.42 * bk;
    if (outT >= 0.75 && window.__loaderHold) window.__loaderHold = false;   // the home page starts (intro, title) as the loader burns away
    R.setRenderTarget(rt); R.clear();
    titles.render(dt, outT < 0 ? 0.5 : 999, 1, 0, T);
    R.setRenderTarget(null); R.render(scene, cam);
    if (first) { first = false; root.classList.add('live'); }   // WebGL now draws the background + lines: drop the static ones
    if (burn.value < 1.12) requestAnimationFrame(frame);
    else { window.__loaderHold = false; root.remove(); rt.dispose(); R.dispose(); }
  };
  const frame = (now) => { try { frame0(now); } catch (e) { console.warn('loader', e); window.__loaderHold = done ? false : window.__loaderHold; fallback(); } };
  requestAnimationFrame(frame);
} else fallback();
