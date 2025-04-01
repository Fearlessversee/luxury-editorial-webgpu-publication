import * as THREE from 'three';
import { Fn, uniform, vec3, vec2, float, mix, smoothstep, length, screenUV, hash, screenCoordinate, luminance, lights, mrt, vec4 } from 'three';
import { DEFS, DEF, REBUILD, LOOKS, SAVED } from './params.js';
import { loadCrow, CrowRig, CU, EP } from './crow.js';
import { makeDust, DU } from './dust.js';
import { LINE } from './lines.js';
import { setPalette, PALETTES, PAL } from './palette.js';
import { PT } from './painterly.js';
import { loadLeaves, LU } from './leaves.js';
import { makeHills, makeWater, WU, makeLandmarks, LU2 } from './world.js';
import { makeBallScene, makeBallPost, BU } from './ball.js';
import { RU, ACC } from './room.js';
import { buildPost, PU, EU } from './post.js';
import { HU } from './screenfx.js';
import { makeSoothe, SO } from './soothe.js';
import { CF, CFX_MODES, CFX_PRESETS } from './cursorfx.js';
let soothe = null;
import { createConsole } from './console.js';
import { makeInvCursor } from './invcursor.js';
import { makeModules } from './modules.js';
import { makeCrown } from './crown.js';
import { makeTitles } from './titles.js';
import { makeHud } from './hud.js';
import { Flyers, signPattern, signAlpha, cellUV, STICKERS } from './props.js';
import { decalGeometry } from './decal.js';
import { GR, GR2, GR3, GR4, paintGraffiti, paintWords, useWordsImage, paintSprayText, paintPortalTag } from './graffiti.js';
import { initSound, stepSound, playSfx, sfxOf, SND, apply as applySound, setSoundSpace } from './sound.js';

const errBox = document.getElementById('err');
const fail = (e) => { console.error(e); errBox.textContent = String(e && (e.stack || e.message) || e); };
addEventListener('error', (e) => fail(e.error || e.message));
addEventListener('unhandledrejection', (e) => fail(e.reason));

// ------------------------------------------------------------------ params (persisted per browser)
const STORE = 'crow-webgpu-params-v1';
// Public visitors and clean local preview: console is off by default, enable via ?edit
let EDIT = new URLSearchParams(location.search).has('edit');
if (new URLSearchParams(location.search).has('public')) EDIT = false;
// ` or § (the key left of 1 / next to left Shift, any layout) switches the console on / off, live site included:
// reloads with ?edit (console on) or without it (?public on localhost, where the console is on by default)
addEventListener('keydown', (e) => {
  if (!['Backquote', 'IntlBackslash'].includes(e.code) || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const q = new URLSearchParams(location.search), local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  q.delete('edit'); q.delete('public'); if (!EDIT && !local) q.set('edit', ''); if (EDIT && local) q.set('public', '');
  const s = q.toString().replace(/=(&|$)/g, '$1'); location.href = location.pathname + (s ? '?' + s : '') + location.hash;
});
const P = { ...DEF };
if (EDIT) { try { Object.assign(P, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch {} } else P._v = 38;
// v2: white eyes — override values saved by older versions
if ((P._v || 1) < 2) { P.eyeColor = DEF.eyeColor; P.eyeGlow = DEF.eyeGlow; P._v = 2; }
// v3: new leaf-stream defaults
if (P._v < 3) { for (const k of Object.keys(DEF)) if (k.startsWith('leaf')) P[k] = DEF[k]; P._v = 3; }
// v4: scroll scenes parked (off) — scroll zooms again
if (P._v < 4) { P.scenesOn = 0; P._v = 4; }
// v5: restore the accidentally reset blue-rim look once
if (P._v < 5) { Object.assign(P, LOOKS['Blue rim']); P._v = 5; }
// v6: flat backdrop — no sky darkening, no glow blob, no vignette / hotspot / paper mottling (everything else kept)
if (P._v < 6) { Object.assign(P, { negSky: 0, bgGlowStr: 0, bgTop: P.bgBottom, vignette: 0, hotspot: 0, negPaperTex: 0 }); P._v = 6; }
// v7: lake + hills defaults for older saves
if (P._v < 7) { for (const k of ['waterOn','waterLevel','waterColor','waterReflect','ripple','rippleScale','rippleSpeed','hillsOn','hillHeight','lakeSize','hillSeed','hillColor','hillLight','hazeColor','hazeNear','hazeFar','pullOn','pullDist','pullHeight','pullTargetY','pullSens']) P[k] = DEF[k]; P._v = 7; }
if (P._v < 8) { for (const k of ['reflBright','waves','waveColor','waveFreq','waveWidth','waveWarp','waveDash','waveSpeed','glints']) P[k] = DEF[k]; P._v = 8; }
if (P._v < 9) { for (const k of ['waveHeight','waveLen','waveSpeed','waveDir','waves','waveColor','glints','glintSharp','reflDistort','waterStrokes','waveFreq','waveWidth']) P[k] = DEF[k]; P._v = 9; }
if (P._v < 10) { for (const k of ['dofOn','fstop','pullFstop','dofBoost','maxBlurPx','bokehBoost','dofBlades','bladeRot','anamorph','sceneScale','dofSamples','dofAuto']) P[k] = DEF[k]; P._v = 10; }
if (P._v < 11) { for (const k of ['camBlur','ballOn','ballEndDist','ballEndHeight','ballEndLook','ballOrbit','ballFov','ballIOR','ballZoom','ballRim','ballSpec','ballTint','clayColor','ballBg','ballGrain','ballVignette','ballKey','ballFill']) P[k] = DEF[k]; P._v = 11; }
if (P._v < 12) { for (const k of ['ballEndDist','ballEndLook','ballEndHeight','tableOn','ballInk','ballInkGamma']) P[k] = DEF[k]; P._v = 12; }
if (P._v < 13) { P.dutchEnd = P.dutch; for (const k of ['ballEndDist','ballEndLook']) P[k] = DEF[k]; P._v = 13; }
if (P._v < 14) { for (const k of ['ballEndDist','ballEndLook','ballEndHeight','roomOn']) P[k] = DEF[k]; P._v = 14; }
if (P._v < 15) { for (const k of ['keyOut','keySteps','keyRise','townSteps','townEye']) P[k] = DEF[k]; P._v = 15; }
if (P._v < 16) { for (const k of ['keyOut','keyRise','keySteps']) P[k] = DEF[k]; P._v = 16; }
if (P._v < 17) { P.stainOn = 0; P._v = 17; }
if (P._v < 18) { for (const k of ['pullOn','ballOn','roomOn','keyOn','townOn','cityOn','ballExtraSteps','keySteps','townSteps','citySteps']) if (k in DEF) P[k] = DEF[k]; P._v = 18; }   // scroll path back on (was stuck at the church end)
if (P._v < 19) { P.palette = 'Sun-baked (guide)'; P._v = 19; }   // COLOR-GUIDE is the art direction now
if (P._v < 20) { for (const k of ['lineBreak', 'lineWobble', 'boilFps']) if (k in DEF) P[k] = DEF[k]; P._v = 20; }   // new painterly defaults
if (P._v < 21) { for (const k of ['fxMode','fxMix','fxInvert','fxDark','fxLight','fxContrast','fxGamma','fxBright','dLevels','dPx','dBias','htSize','htAngle','htDot','htSoft']) if (k in DEF) P[k] = DEF[k]; P._v = 21; }   // new print screens: fresh defaults
if (P._v < 22) { P.cellDist = DEF.cellDist; P._v = 22; }
if (P._v < 23) { P.cornerL = DEF.cornerL; P.cornerR = DEF.cornerR; P._v = 23; }   // corner labels are now live cursor axes   // the cell is now at true scale around the atom
if (P._v < 24) { P.tagRadius = 0; P._v = 24; }
if (P._v < 25) { P.sndStyle = 'Vinyl'; P.sndGap = 16; P._v = 25; }   // 3D vinyl badge, more air above the carton   // square cursor label, like the title containers
if (P._v < 26) { for (const k in SAVED) if (k in DEF) P[k] = SAVED[k]; P._v = 26; }   // author's saved settings
if (P._v < 27) { for (const k in SAVED) if (k in DEF) P[k] = SAVED[k]; P._v = 27; }   // author's saved settings (2)
if (P._v < 28) { if (!P.envExposure) P.envExposure = 0.83; P.landColor = DEF.landColor; P._v = 28; }   // exposure 0 blanked scene 1
if (P._v < 29) { Object.assign(P, { envContrast: 1.31, envGamma: 1.09, negGamma: 1.4, waterStrokes: 0, waveFreq: 0.53, waveWidth: 0.12, waterReflect: 0.24, waterColor: '#000000', landColor: DEF.landColor, towerText: DEF.towerText }); P._v = 29; }   // the lake as before
if (P._v < 30) { P.stickMax = 10; P._v = 30; }
if (P._v < 31) { for (const k in SAVED) if (k in DEF) P[k] = SAVED[k]; P._v = 31; }   // author's full settings (3)
if (P._v < 32) { P.invOn = 0; P._v = 32; }   // no disc: the liquid trail alone does the inverting
if (P._v < 33) { P.pr2 = 0; P.s1Every = 3; P._v = 33; }   // full resolution in every scene; the ball image is what gets cheaper
if (P._v < 34) { P.s1Every = 4; P._v = 34; }
if (P._v < 35) { P.pr2 = 1.75; P._v = 35; }   // retina: 1.75 instead of 2 from the church on — invisible, +15–25 fps
if (P._v < 36) { P.tapeOpacity = 0.55; P._v = 36; }   // see-through tape: the words stay readable under it
if (P._v < 37) { P.tapeOpacity = 0.5; P.tapeColor = '#f2c12e'; P._v = 37; }   // yellow site tape, see-through
if (P._v < 38) { P.p2Style = 'graffiti'; P._v = 38; }   // WAKE UP, YOU'RE DREAMING in a graffiti handstyle
if (P._v < 39) { P.contactUrl = 'https://www.linkedin.com/in/liubomyr-ulytskyi-4426971a9/'; P._v = 39; }   // GET IN TOUCH → LinkedIn
if (P._v < 40) { P.autoQuality = 1; P._v = 40; }   // auto quality on: slower machines get a lower render resolution
for (const k of Object.keys(P)) if (!(k in DEF) && k !== '_v') delete P[k];   // drop settings that no longer exist
const save = () => { if (!EDIT) return; try { localStorage.setItem(STORE, JSON.stringify(P)); } catch {} };

// ------------------------------------------------------------------ what the loader waits for: every file three loads
// (GLBs, textures — all through the default loading manager) and the fonts; then the warm-up pass below
let lmDone = 0, lmTotal = 0;
{ const LM = THREE.DefaultLoadingManager, upd = (u, l, t) => { lmDone = l; lmTotal = t; }; LM.onStart = upd; LM.onProgress = upd; LM.onLoad = () => { lmDone = lmTotal; }; LM.onError = (u) => { lmDone++; console.warn('load failed', u); }; }
window.__crowLoad = () => [lmDone, lmTotal];
const filesReady = () => lmDone >= lmTotal && (!document.fonts || document.fonts.status === 'loaded');
// ------------------------------------------------------------------ renderer / scene
const canvas = document.getElementById('gl');
const forceWebGL = new URLSearchParams(location.search).has('webgl');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL });
await renderer.init();
{ const dev = renderer.backend && renderer.backend.device; if (dev) { let n = 0; dev.addEventListener('uncapturederror', (e) => { if (n++ < 3) (EDIT ? fail : console.warn)('WebGPU: ' + (e.error && e.error.message || e)); }); } }   // show GPU errors on screen
let titles = null, hud = null;   // WebGPU screen UI (titles, labels, progress can) — made once P exists
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const backend = () => (renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.3, 900);   // near 0.3 (was 0.05): 6× finer depth far away — the hill houses and tower no longer flicker
const TARGET = new THREE.Vector3(0, 1.0, 0);

// background: unlit gradient + soft glow, dithered against banding (not affected by any light)
const BG = {
  top: uniform(new THREE.Color()), bottom: uniform(new THREE.Color()), glow: uniform(new THREE.Color()),
  glowStr: uniform(0.5), glowPos: uniform(new THREE.Vector2(0.5, 0.5)), glowSize: uniform(0.5), aspect: uniform(1),
  wheel: uniform(new THREE.Color(1, 1, 1)), wheelMix: uniform(0), bright: uniform(1),
};
scene.backgroundNode = Fn(() => {
  const u = screenUV;
  let c = mix(BG.top, BG.bottom, u.y.smoothstep(0, 1));
  const d = length(u.sub(BG.glowPos).mul(vec2(BG.aspect, 1)));
  c = c.add(BG.glow.mul(smoothstep(BG.glowSize, 0.0, d).pow(2)).mul(BG.glowStr));
  // colour wheel: re-tint the background with the picked hue, keeping its light/dark structure
  const lum = luminance(c);
  const re = BG.wheel.mul(lum.div(luminance(BG.wheel).max(0.02)));
  c = mix(c, re, BG.wheelMix).mul(BG.bright);
  return c;   // (static anti-banding dither removed: after tone mapping it showed as a fixed grain in the dark)
})();

// ------------------------------------------------------------------ lights — they light only the crow:
// background is a backgroundNode and the dust is MeshBasic (unlit), so nothing else reacts to them.
const key = new THREE.DirectionalLight(0xffffff, 3);
key.castShadow = true; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.5, far: 20 });
const rim = new THREE.DirectionalLight(0xffffff, 6);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
const amb = new THREE.HemisphereLight(0xffffff, 0x000000, 0.1);
const lightTarget = new THREE.Object3D(); lightTarget.position.copy(TARGET);
[key, rim, fill].forEach((l) => { l.target = lightTarget; scene.add(l); });
scene.add(amb, lightTarget);
// environment lights: light only the branches (each material gets its own lightsNode below)
const envKey = new THREE.DirectionalLight(0xffffff, 1.5), envRim = new THREE.DirectionalLight(0xffffff, 5);
const envAmb = new THREE.HemisphereLight(0xffffff, 0x000000, 0.1);
[envKey, envRim].forEach((l) => { l.target = lightTarget; scene.add(l); });
scene.add(envAmb);
const placeLight = (l, az, el, dist = 6) => {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  l.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(TARGET);
};

// ------------------------------------------------------------------ crow
const crowGroup = new THREE.Group(); scene.add(crowGroup);
const crow = await loadCrow('./assets/crow.glb');
crow.root.userData.sfx = 'crow'; if (crow.perch) crow.perch.material.userData.sfx = 'grass';   // click sounds
crowGroup.add(crow.root);
const rig = new CrowRig(crow);
const crown = makeCrown(crow);   // the win: a crown on its head (hidden till then)
// WebGPU (r169): alpha-tested materials build an empty fragment struct in the shadow (depth-only) pass → that whole
// pass was rejected every frame. The crow and perch don't cast shadows there (they never showed anyway).
if (renderer.backend && renderer.backend.isWebGPUBackend) { crow.skinned.forEach((o) => (o.castShadow = false)); if (crow.perch) crow.perch.castShadow = false; }
{ // bird lights vs environment lights
  const birdLights = lights([key, rim, fill, amb]), envLights = lights([envKey, envRim, envAmb]);
  crow.body.lightsNode = birdLights;
  if (crow.perch) crow.perch.material.lightsNode = envLights;
}
rig.play(P.clip, 0);
const leaves = await loadLeaves('./assets/leaves.glb', scene);
// newspaper sheets blown over the lake (scene 1). Scene 1 is printed in negative, so the raw colours are inverted:
// a dark sheet (→ paper) with light print (→ ink)
const NF = { dark: uniform(new THREE.Color(0.012, 0.012, 0.014)), light: uniform(new THREE.Color(0.8, 0.8, 0.8)) };
const newsMat1 = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); newsMat1.colorNode = mix(vec3(NF.dark), vec3(NF.light), float(1).sub(signPattern())); newsMat1.userData.sfx = 'paper';
const news1 = new Flyers({ news: newsMat1 }, [1.7, 1.4, 1.9, 1.5, 1.6, 1.3, 1.8, 1.5, 1.4, 1.7].map((s) => ['news', s]), { ahead: 55, behind: 4, near: 6, spread: 70, y0: -5, y1: 3, dir: new THREE.Vector3(0, 0, -1), windVec: new THREE.Vector3(2.4, 0, 0.3), turb: 0.6 });
scene.add(news1.group);
const skel = new THREE.SkeletonHelper(crow.root); skel.visible = false; scene.add(skel);

// ------------------------------------------------------------------ dust
let dust = null;
// ------------------------------------------------------------------ lake + hills
let hills = null;
const water = makeWater({ resolution: 0.5 }); water.userData.sfx = 'water';
scene.add(water);
let landmarks = null;
const buildHills = () => { if (hills) { scene.remove(hills); hills.geometry.dispose(); } hills = makeHills({ height: P.hillHeight, shore: P.lakeSize, seed: P.hillSeed }); hills.visible = !!P.hillsOn; hills.userData.sfx = 'hill'; scene.add(hills);
  if (landmarks) { scene.remove(landmarks); landmarks.traverse((o) => o.geometry && o.geometry.dispose()); }
  landmarks = makeLandmarks(hills, { tower: [P.towerX, P.towerZ], text: P.towerText }); landmarks.visible = !!P.landOn && !!P.hillsOn; landmarks.userData.sfx = 'metal'; scene.add(landmarks); };
buildHills();
let hillT = null; const rebuildHills = () => { clearTimeout(hillT); hillT = setTimeout(buildHills, 120); };
const buildDust = () => { if (dust) { scene.remove(dust); dust.geometry.dispose(); } dust = makeDust(Math.min(80000, Math.round(P.dustCount * 5))); dust.userData.max = Math.min(80000, Math.round(P.dustCount * 5)); scene.add(dust); dust.visible = !!P.dustOn; };
buildDust();

// ------------------------------------------------------------------ post
let post = buildPost(renderer, scene, camera, P);
setTimeout(() => sizeRays(), 0);
let needRebuild = false, bypass = false;

let autoScale = 1;
// ------------------------------------------------------------------ apply params
const col = (u, v) => u.value.set(v);
// ------------------------------------------------------------------ crystal ball (scroll phase 2)
const _bsz = renderer.getDrawingBufferSize(new THREE.Vector2());
const ballRT = new THREE.RenderTarget(Math.max(2, _bsz.x), Math.max(2, _bsz.y), { type: THREE.HalfFloatType });
const bs = makeBallScene(ballRT.texture, { crowGeo: crow.mesh.geometry });
const ballPost = makeBallPost(renderer, bs);
const cityPost = makeBallPost(renderer, bs.city);
let cityRT = new THREE.RenderTarget(Math.max(2, Math.round(_bsz.x * 0.6)), Math.max(2, Math.round(_bsz.y * 0.6)), { type: THREE.HalfFloatType });
bs.cityTex.value = cityRT.texture;
let frameN = 0, cityRTDrawn = null, s1Frozen = false, cityFrozen = false;
const cityView = { active: false, crossed: false, full: false, portal: new THREE.Vector3() };
// ease in at the very start, then constant speed — phases hand over without stopping
const easeInLin = (s, a = 0.3) => (s < a ? (s * s) / (2 * a) : s - a / 2) / (1 - a / 2);
function updateBall(ph, rdt) {
  const e = easeInLin(ph);
  const cam = bs.cam;
  cam.aspect = camera.aspect; cam.fov = P.ballFov; cam.updateProjectionMatrix();
  // start: camera just outside the glass, sphere overfills the screen → shows scene 1 1:1; then pulls away
  const tanD = Math.tan(THREE.MathUtils.degToRad(P.ballFov) / 2) * Math.hypot(1, camera.aspect);
  const d0 = P.deviceScale / Math.sin(Math.atan(tanD)) * 0.98;   // sphere just overfills the screen
  // extra scrolling after the end frame: keep walking back down the corridor
  const x = P.ballExtraSteps > 0 ? THREE.MathUtils.clamp((pullS - 2) / P.ballExtraSteps, 0, 1) : 0, xe = x;
  const d = THREE.MathUtils.lerp(d0, P.ballEndDist, e) + P.ballExtraDist * xe;
  const ty = THREE.MathUtils.lerp(0, P.ballEndLook, e) + P.ballExtraLook * xe;
  bs.layout(P.deviceScale, P.tableScale, P.tableTurn);
  bs.table.visible = !!P.tableOn && !P.roomOn;   // the church has its own stone altar
  bs.stand.visible = !!P.standOn; bs.hands.visible = !!P.handsOn;
  // same cursor parallax as scene 1: orbit left/right and rise/fall with the mouse
  const az = THREE.MathUtils.degToRad(P.ballOrbit * e);
  cam.position.set(Math.sin(az) * d, ty + THREE.MathUtils.lerp(0, P.ballEndHeight, e) + P.ballExtraHeight * xe, Math.cos(az) * d);
  { // never walk back through the end wall: stay inside the church until the keyhole flight takes over
    const kh0 = bs.getRoom() && bs.getRoom().userData.keyhole;
    if (kh0 && cam.position.z > kh0.K.z - 26) { cam.position.z = kh0.K.z - 26; }
    // while walking back, glide straight onto the keyhole's axis (its height and x) — no rise-then-drop later
    if (kh0 && xe > 0) {
      const k = xe * xe * (3 - 2 * xe);
      cam.position.x = THREE.MathUtils.lerp(cam.position.x, kh0.K.x, k);
      cam.position.y = THREE.MathUtils.lerp(Math.min(cam.position.y, ty + P.ballEndHeight), kh0.K.y, xe);
      cam.lookAt(new THREE.Vector3(0, ty, 0).lerp(new THREE.Vector3(kh0.K.x, kh0.K.y, kh0.K.z - 200), k));
    } else cam.lookAt(0, ty, 0);
  }
  // lines fade to 30 % while walking back (the glass + stand keep theirs)
  BU.lineFade.value = 1 - (1 - P.lineFadeTo) * xe;
  // keyhole: after walking back, the next scroll flies down the aisle and through the door's keyhole
  const kh = bs.getRoom() && bs.getRoom().userData.keyhole;
  const kp = kh && P.keyOn ? THREE.MathUtils.clamp((pullS - 2 - Math.max(0, P.ballExtraSteps)) / Math.max(0.1, P.keySteps), 0, 1) : 0;
  if (kp > 0) {
    // keep walking backwards: line up with the keyhole in the (unseen) door behind us, pass through it
    // backwards, and keep going — the church shrinks into the keyhole's silhouette on the door
    const Pe = cam.position.clone(), Le = new THREE.Vector3(kh.K.x, kh.K.y, kh.K.z - 200);
    // one continuous move: line up behind the keyhole (inside), pass through it backwards, keep backing away
    // (exponential distance → the keyhole shrinks at a steady pace), then rise and tilt up to show the front
    const K = kh.K, A = K.clone().add(new THREE.Vector3(0, 0, -24));   // far enough back that the last stretch is dead straight
    const l1 = THREE.MathUtils.clamp(kp / 0.3, 0, 1), l2 = THREE.MathUtils.clamp((kp - 0.3) / 0.7, 0, 1);
    let dz;
    if (l2 <= 0) cam.position.lerpVectors(Pe, A, l1);
    else {
      const u = l2 * l2 * (3 - 2 * l2);
      dz = u < 0.12 ? THREE.MathUtils.lerp(-24, 0.4, u / 0.12) : 0.4 * Math.pow(P.keyOut / 0.4, (u - 0.12) / 0.88);
      cam.position.copy(K).add(new THREE.Vector3(0, 0, dz));
      const up = THREE.MathUtils.smoothstep(dz, 8, P.keyOut);
      cam.position.y += P.keyRise * up;
      cam.position.x = K.x * (1 - THREE.MathUtils.smoothstep(dz, 1, 14));   // once out, slide onto the church's centre line (symmetric front)
    }
    if (l2 <= 0) cam.lookAt(Le.clone().lerp(K.clone().add(new THREE.Vector3(0, 0, -200)), l1));
    else {
      const aim = new THREE.Vector3(0, kh.aimY, K.z).sub(cam.position).normalize();
      const d = new THREE.Vector3(0, 0, -1).lerp(aim, THREE.MathUtils.smoothstep(dz, 8, P.keyOut * 0.8)).normalize();
      cam.lookAt(cam.position.clone().add(d));
    }
    BU.lineFade.value = THREE.MathUtils.lerp(BU.lineFade.value, 1, THREE.MathUtils.smoothstep(kp, 0.35, 0.7));
  }
  { // depth range: tight inside the church (no z-fighting / flicker), tiny near plane only at the keyhole, far for the street
    const nearK = kp > 0.25 && kp < 0.75 ? 0.02 : 0.25, farK = kp > 0.3 ? 700 : 260;
    if (cam.near !== nearK || cam.far !== farK) { cam.near = nearK; cam.far = farK; cam.updateProjectionMatrix(); }
  }
  // ---- scene 3: out of the keyhole, a little further back, turn right and travel down the Halloween street
  const town = bs.town, room = bs.getRoom();
  const tp = kh && P.keyOn && P.townOn ? THREE.MathUtils.clamp((pullS - 2 - Math.max(0, P.ballExtraSteps) - P.keySteps) / Math.max(0.1, P.townSteps), 0, 1) : 0;
  let heroT = null, parAmt = 1;
  if (kh) {
    const Bp = kh.K.clone().add(new THREE.Vector3(0, 0, P.keyOut)); Bp.x = 0;
    const B = Bp.clone(); B.y += P.keyRise;
    town.position.set(Bp.x, kh.G0, Bp.z + 6);
    town.visible = P.townOn && kp > 0.35;
    if (tp > 0) {
      const back = THREE.MathUtils.smoothstep(tp, 0, 0.18), turn = THREE.MathUtils.smoothstep(tp, 0.08, 0.32), go = THREE.MathUtils.smoothstep(tp, 0.2, 1);
      const a = turn * Math.PI / 2, d0 = new THREE.Vector3(0, kh.aimY, kh.K.z).sub(B).normalize();
      const dir = d0.lerp(new THREE.Vector3(Math.sin(a), -0.04, -Math.cos(a)), turn).normalize();
      cam.position.set(Bp.x + go * (town.userData.len - 90), THREE.MathUtils.lerp(B.y, kh.G0 + P.townEye, turn), Bp.z + 6 * back);
      cam.lookAt(cam.position.clone().add(dir));
      heroT = cam.position.clone().addScaledVector(dir, 50);
      BU.lineFade.value = 1;
    }
    // ---- scene 4: walk on into the portal at the end of the road, come out in the city and climb over it
    const cp = tp >= 1 && P.cityOn && town.userData.portalX ? THREE.MathUtils.clamp((pullS - 2 - Math.max(0, P.ballExtraSteps) - P.keySteps - P.townSteps) / Math.max(0.1, P.citySteps), 0, 1) : 0;
    bs.city.setSun && bs.city.setSun(cp);   // the sun sets behind the sea as you fly over the city
    const XP = town.userData.portalX || 0;
    cityView.portal.set(town.position.x + XP, town.position.y, town.position.z);
    cityView.active = !!town.visible;   // keep the portal's texture alive whenever the street is on screen (WebGPU needs it rendered)
    cityView.full = tp > 0.9;
    cityView.near = tp > 0.8;
    if (!town.visible) cityFrozen = false;   // re-draw the still once when the street comes back
    cityView.deep = false; cityView.extraVeil = 0;
    if (cp > 0) {
      const x0c = (town.userData.len - 90) - XP;
      let x; if (cp < 0.12) x = THREE.MathUtils.lerp(x0c, 8, cp / 0.12); else { const u = (cp - 0.12) / 0.88; x = 8 + P.cityDist * Math.pow(u, 1.6); }
      const rise = Math.pow(THREE.MathUtils.smoothstep(cp, 0.14, 0.9), 1.3);
      let y = P.townEye + Math.max(0, P.cityHeight - P.cityStart) * rise;   // climbs on from the arrival altitude
      // ---- then straight up: look straight down and rise until the whole planet is in frame
      const ep = cp >= 1 && P.earthSteps > 0 ? THREE.MathUtils.clamp((pullS - 2 - Math.max(0, P.ballExtraSteps) - P.keySteps - P.townSteps - P.citySteps) / P.earthSteps, 0, 1) : 0;
      if (ep > 0) { const alt0 = y + P.cityStart, e = THREE.MathUtils.smoothstep(ep, 0, 1); y += alt0 * (Math.pow(P.earthAlt / alt0, e) - 1); }
      let pitch = ep > 0 ? THREE.MathUtils.lerp(-THREE.MathUtils.degToRad(P.cityPitch), -THREE.MathUtils.degToRad(89.5), THREE.MathUtils.smoothstep(ep, 0, 0.25)) : -0.04 - (THREE.MathUtils.degToRad(Math.min(P.cityPitch, 38)) - 0.04) * THREE.MathUtils.smoothstep(cp, 0.1, 0.4) - THREE.MathUtils.degToRad(Math.max(0, P.cityPitch - 38)) * THREE.MathUtils.smoothstep(cp, 0.4, 1);   // tip down over the city right after the portal
      // ---- further out: the Earth is an electron of an atom … and the atom sits in a cell
      const base5 = 2 + Math.max(0, P.ballExtraSteps) + P.keySteps + P.townSteps + P.citySteps + Math.max(0, P.earthSteps);
      const ap = ep >= 1 && P.atomSteps > 0 ? THREE.MathUtils.clamp((pullS - base5) / P.atomSteps, 0, 1) : 0;
      const cl = ap >= 1 && P.cellSteps > 0 ? THREE.MathUtils.clamp((pullS - base5 - P.atomSteps) / P.cellSteps, 0, 1) : 0;
      const Re = bs.city.R, X0 = 8 + P.cityDist, Nx = X0 + bs.city.micro.Ro, Ha = 175 * Re;
      bs.city.anchor.set(X0, 0, 0); cityView.deep = ep > 0;
      // atom → cell as one continuous zoom-out: the atom is inside the nucleolus, the camera never cuts
      const mc = bs.city.micro, Rc = mc.Rc;
      const appearK = THREE.MathUtils.smoothstep(cl, 0.04, 0.5);
      bs.city.setStage(cl > 0 ? 'cell' : 'atom', appearK);
      cityView.extraVeil = 0;
      if (ap > 0 && cl <= 0) {
        const h0 = P.earthAlt + Re, e = THREE.MathUtils.smoothstep(ap, 0, 1), h = h0 * Math.pow(Ha / h0, e);
        x = THREE.MathUtils.lerp(X0, Nx, THREE.MathUtils.smoothstep(ap, 0.05, 0.85)); y = -Re + h - P.cityStart; pitch = -THREE.MathUtils.degToRad(89.5);
      } else if (cl > 0) {
        const D1 = P.cellDist * Re * (1 + 4 * (cityView.loopOut || 0));
        const D = Ha * Math.pow(D1 / Ha, cl);                                           // constant-rate (logarithmic) zoom
        const k = THREE.MathUtils.smoothstep(cl, 0.45, 1), p = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(89.5, P.cellPitch, k));
        const ty = -Re + mc.cellUp * 0.35 * k;                                          // aim drifts from the atom to the cell
        x = Nx - D * Math.cos(p); y = ty + D * Math.sin(p) - P.cityStart; pitch = -p;
      }
      const dir = new THREE.Vector3(Math.cos(pitch), Math.sin(pitch), 0);
      cam.position.set(cityView.portal.x + x, cityView.portal.y + y, cityView.portal.z);
      cam.lookAt(cam.position.clone().add(dir));
      heroT = cam.position.clone().addScaledVector(dir, Math.max(50, y));   // × parHero (0.6) in the rig
      parAmt = 1;   // the same cursor camera as scene 1 everywhere (city, planet, atom, cell)
    }
    if (room) room.visible = !!P.roomOn && tp < 0.6 && !cityView.crossed;   // the church is behind us once we walk down the street: skip it (and its shadows)
    town.userData.setLeaves({ fallCount: P.streetLeafCount, fallSize: P.streetLeafSize, fallSpeed: P.streetLeafSpeed, groundSize: P.streetGroundLeafSize, treeSize: P.streetTreeLeafSize });
    if (town.visible) town.userData.update(RU.time.value, rdt, cam.position.clone().sub(town.position), 1.6);
  }
  // same cursor rig as scene 1 (hero = the glass, or the keyhole during the flight — fading out as we go in)
  if (heroT) applyParallax(cam, heroT, parAmt);
  else if (kp > 0 || xe > 0) { const f = new THREE.Vector3(); cam.getWorldDirection(f); const D = THREE.MathUtils.lerp(cam.position.distanceTo(new THREE.Vector3(0, ty, 0)), 20, kp > 0 ? 1 : xe); applyParallax(cam, cam.position.clone().addScaledVector(f, D), kp <= 0 ? 1 : THREE.MathUtils.smoothstep(Math.abs(cam.position.z - kh.K.z), 6, 22) * (1 - THREE.MathUtils.smoothstep(kp, 0.1, 0.3) * (1 - THREE.MathUtils.smoothstep(kp, 0.8, 1)))); }   // no sway near and through the keyhole   // keep the current heading (the keyhole is behind us)
  else applyParallax(cam, new THREE.Vector3(0, ty, 0), THREE.MathUtils.smoothstep(ph, 0.05, 0.4));
  { // the city camera = this camera, carried through the portal (same pose relative to the portal frame)
    const cc = bs.city.cam;
    cc.position.copy(cam.position).sub(cityView.portal); cc.position.y += P.cityStart;   // the portal opens high above the city
    cc.quaternion.copy(cam.quaternion); cc.updateMatrixWorld(true);   // rotation first, or it lags a frame (jitter)
    if (cc.fov !== cam.fov || cc.aspect !== cam.aspect) { cc.fov = cam.fov; cc.aspect = cam.aspect; cc.updateProjectionMatrix(); }
    cityView.crossed = cityView.active && (cam.position.x > cityView.portal.x + 0.05 || cityView.deep);   // deep = past the city (the cell view swings behind the portal plane)
  }
  BU.lensMix.value = THREE.MathUtils.smoothstep(ph, 0.0, 0.35);
  BU.diss.value = P.standDissOn ? 1 - THREE.MathUtils.smoothstep(ph, P.standDissFrom, Math.max(P.standDissFrom + 0.01, P.standDissTo)) : 0;   // the stand dissolves in as scene 2 opens
  BU.aspect.value = camera.aspect;
  BU.res.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  BU.seed.value = Math.random() * 1000;
  BU.inkMode.value = P.negOn && P.ballInk ? 1 : 0; BU.ink.value.set(P.negInk); BU.bg.value.set(P.ballBg).convertSRGBToLinear();
  bs.key.intensity = BU.inkMode.value ? 0 : P.ballKey; bs.fill.intensity = BU.inkMode.value ? 0 : P.ballFill;
}
const TITLE_KEYS = ['tapeOn', 'tapeCount', 'tapeOpacity', 'tapeColor', 'titleScale', 'titleText', 'titleBox', 'logoOn', 'cornerColor', 'canPaper'];
let booted = false;
const pOpt = () => ({ font: P.pFont, weight: 800, spray: P.pSpray, drips: P.pDrips });
const repaintPortal = () => { paintPortalTag(GR3, P.p1Style, P.p1Text, pOpt()); paintPortalTag(GR4, P.p2Style, P.p2Text, pOpt()); };
const wordsPaint = () => (P.wordsUseRef ? useWordsImage() : paintWords(P.wordsText, { rough: P.wordsRough, drips: P.wordsDrips }));
const MAP = {
  paintOn: (v) => (PT.on.value = v ? 1 : 0), paintPatches: (v) => (PT.nScale.value = v), paintWarp: (v) => (PT.warp.value = v), paintStrokeSize: (v) => (PT.warpScale.value = v),
  streakStretch: (v) => (PT.stretch.value = v), dabAmount: (v) => (PT.dab.value = v), paintTones: (v) => (PT.paint.value = v), paintSoft: (v) => (PT.soft.value = v),
  lineWobble: (v) => (LINE.wobAmp.value = v), lineWobbleScale: (v) => (LINE.wobScale.value = v), lineBreak: (v) => (LINE.breakAmt.value = v),
  palette: (v) => setPalette(v), paletteAmt: (v) => (PAL.amt.value = v), paletteDepth: (v) => (PAL.depth.value = v),
  lineWidth: (v) => (LINE.w.value = v), lineBusy: (v) => (BU.busyAmt.value = v), fillsOn: (v) => (BU.fills.value = v),
  cityStreet: () => bs.city.setLayout({ street: P.cityStreet, gap: P.cityGap }), cityGap: () => bs.city.setLayout({ street: P.cityStreet, gap: P.cityGap }),
  standDissScale: (v) => (BU.dissScale.value = v), standDissEdge: (v) => col(BU.dissEdge, v),
  musicOn: () => applySound(), musicVol: () => applySound(), sfxOn: () => applySound(), sfxVol: () => applySound(),
  grafColor: (v) => GR.color.value.setHex(parseInt(v.slice(1), 16), THREE.LinearSRGBColorSpace), grafOpacity: (v) => (GR.opacity.value = v),
  grafSpray: () => paintGraffiti({ spray: P.grafSpray, drips: P.grafDrips, dripLen: P.grafDripLen }), grafDrips: () => paintGraffiti({ spray: P.grafSpray, drips: P.grafDrips, dripLen: P.grafDripLen }), grafDripLen: () => paintGraffiti({ spray: P.grafSpray, drips: P.grafDrips, dripLen: P.grafDripLen }),
  wordsColor: (v) => GR2.color.value.setHex(parseInt(v.slice(1), 16), THREE.LinearSRGBColorSpace), wordsOpacity: (v) => (GR2.opacity.value = v),
  wordsUseRef: () => wordsPaint(), wordsText: () => wordsPaint(), wordsRough: () => wordsPaint(), wordsDrips: () => wordsPaint(),
  p1Text: () => booted && repaintPortal(), p2Text: () => booted && repaintPortal(), p1Style: () => booted && repaintPortal(), p2Style: () => booted && repaintPortal(),
  pSpray: () => booted && repaintPortal(), pDrips: () => booted && repaintPortal(), pFont: () => booted && repaintPortal(), pColor: (v) => [GR3, GR4].forEach((G) => G.color.value.setHex(parseInt(v.slice(1), 16), THREE.LinearSRGBColorSpace)),
  cfxColor: (v) => CF.ink.value.setHex(parseInt(v.slice(1), 16), THREE.LinearSRGBColorSpace), cfxLife: (v) => (SO.life = v), cfxSoft: (v) => (SO.soft.value = v), cfxInv: (v) => (CF.inv.value = v ? 1 : 0), yellowColor: (v) => ACC.yellow.value.setHex(parseInt(v.slice(1), 16), THREE.LinearSRGBColorSpace),
  cfxMode: (v) => (CF.mode.value = Math.max(0, CFX_MODES.indexOf(v))), cfxAmt: (v) => (CF.amt.value = v), cfxRad: (v) => (CF.rad.value = v), cfxSize: (v) => (CF.size.value = v), cfxFreq: (v) => (CF.freq.value = v), cfxTwist: (v) => (CF.twist.value = v),
  cfxPreset: (v) => { if (!booted || !CFX_PRESETS[v]) return; const o = CFX_PRESETS[v]; for (const k in o) { P[k] = o[k]; apply(k); } save(); if (typeof ui !== 'undefined') setTimeout(() => ui.render(), 0); },
  sootheOn: (v) => (SO.on.value = v ? 1 : 0), sootheRadius: (v) => (SO.radius.value = v), soothePeak: (v) => (SO.peak.value = v), sootheElastic: (v) => (SO.elastic.value = v),
  sootheVisc: (v) => (SO.visc.value = v), sootheSpread: (v) => (SO.spread.value = v), sootheRefract: (v) => (SO.refract.value = v), sootheShadeAmt: (v) => (SO.shade.value = v),
  sootheSpec: (v) => (SO.spec.value = v), sootheShine: (v) => (SO.shine.value = v), sootheLight: (v) => col(SO.light, v), sootheLightY: (v) => (SO.lightY.value = v),
  sootheDither: (v) => (SO.dither.value = v), sootheDitherPx: (v) => (SO.ditherPx.value = v), sootheDitherAll: (v) => (SO.ditherAll.value = v ? 1 : 0), sootheRes: (v) => soothe && soothe.setScale(v),
  fxMode: (v) => (HU.mode.value = Math.max(0, ['off', 'dither', 'halftone · circle', 'halftone · square', 'halftone · cross'].indexOf(v))), fxMix: (v) => (HU.mix.value = v),
  fxInvert: (v) => (HU.invert.value = v ? 1 : 0), fxDark: (v) => HU.dark.value.set(v).convertLinearToSRGB(), fxLight: (v) => HU.light.value.set(v).convertLinearToSRGB(),
  fxContrast: (v) => (HU.contrast.value = v), fxGamma: (v) => (HU.gamma.value = v), fxBright: (v) => (HU.bright.value = v),
  dLevels: (v) => (HU.levels.value = v), dPx: (v) => (HU.dPx.value = v), dBias: (v) => (HU.dBias.value = v),
  htSize: (v) => (HU.size.value = v), htAngle: (v) => (HU.angle.value = THREE.MathUtils.degToRad(v)), htSoft: (v) => (HU.soft.value = v), htDot: (v) => (HU.dotScale.value = v),
  // light
  keyInt: (v) => (key.intensity = v), keyColor: (v) => key.color.set(v), keyShadow: (v) => (key.castShadow = !!v),
  rimInt: (v) => (rim.intensity = v), rimColor: (v) => rim.color.set(v),
  fillInt: (v) => (fill.intensity = v), fillColor: (v) => fill.color.set(v),
  ambInt: (v) => (amb.intensity = v), ambSky: (v) => amb.color.set(v), ambGround: (v) => amb.groundColor.set(v),
  shadowRes: (v) => { key.shadow.mapSize.set(+v, +v); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } },
  // shader + color (crow)
  flat: (v) => (CU.flat.value = v ? 1 : 0),
  wire: (v) => { crow.body.wireframe = !!v; },
  rimStr: (v) => (CU.rimStr.value = v), rimPow: (v) => (CU.rimPow.value = v), fresColor: (v) => col(CU.fresColor, v),
  oil: (v) => (CU.oil.value = v), oilScale: (v) => (CU.oilScale.value = v),
  holo: (v) => (CU.holo.value = v), holoDensity: (v) => (CU.holoDensity.value = v), holoSpeed: (v) => (CU.holoSpeed.value = v),
  dissolve: () => {},   // combined with the scene dissolve every frame dissolveScale: (v) => (CU.dissolveScale.value = v), dissolveEdge: (v) => col(CU.dissolveEdge, v), dissolveGlow: (v) => (CU.dissolveGlow.value = v),
  furBump: (v) => (CU.furBump.value = v), furScale: (v) => (CU.furScale.value = v), furStretch: (v) => (CU.furStretch.value = v),
  furDetail: (v) => (CU.furDetail.value = v), strokeBump: (v) => (CU.strokeBump.value = v),
  pulse: (v) => (CU.pulse.value = v), pulseSpeed: (v) => (CU.pulseSpeed.value = v),
  baseColor: (v) => col(CU.base, v), gradMix: (v) => (CU.gradMix.value = v), gradTint: (v) => col(CU.gradTint, v), tint: (v) => col(CU.tint, v),
  hueShift: (v) => (CU.hueShift.value = v), crowSat: (v) => (CU.sat.value = v), strokes: (v) => (CU.strokes.value = v),
  eyeColor: (v) => col(CU.eyeColor, v), eyeGlow: (v) => (CU.eyeGlow.value = v),
  bgWheel: (v) => { const [x, y] = v; const h = (Math.atan2(y, x) / (2 * Math.PI) + 1) % 1; BG.wheel.value.setHSL(h, Math.min(1, Math.hypot(x, y)), 0.5); },
  bgWheelMix: (v) => (BG.wheelMix.value = v), bgBright: (v) => (BG.bright.value = v),
  leafTint: (v) => col(LU.tint, v), leafBright: (v) => (LU.bright.value = v), leafOn: (v) => { if (!v) leaves.clear(); },
  envPerchColor: (v) => col(EP.color, v), envPerchGrad: (v) => (EP.gradMix.value = v), envPerchGradTint: (v) => col(EP.gradTint, v),
  envPerchBright: (v) => (EP.bright.value = v), envPerchRough: (v) => crow.perch && (crow.perch.material.roughness = v),
  envPerchRim: (v) => (EP.rimStr.value = v), envPerchRimColor: (v) => col(EP.rimColor, v), envPerchFlat: (v) => (EP.flat.value = v ? 1 : 0),
  envKeyInt: (v) => (envKey.intensity = v), envKeyColor: (v) => envKey.color.set(v), envRimInt: (v) => (envRim.intensity = v), envRimColor: (v) => envRim.color.set(v),
  envAmbInt: (v) => (envAmb.intensity = v), envAmbColor: (v) => envAmb.color.set(v),
  envExposure: (v) => (EU.exposure.value = v), envContrast: (v) => (EU.contrast.value = v), envGamma: (v) => (EU.gamma.value = v), envSat: (v) => (EU.sat.value = v),
  envTemp: (v) => (EU.temp.value = v), envTint: (v) => (EU.gtint.value = v), envFade: (v) => (EU.fade.value = v),
  envShadowTint: (v) => col(EU.shadowTint, v), envShadowAmt: (v) => (EU.shadowAmt.value = v),
  bgBottom: (v) => { col(BG.bottom, v); PU.bgMatch.value.set(v); },
  waterOn: (v) => (water.visible = !!v), waterLevel: (v) => water.userData.setLevel(v), waterColor: (v) => col(WU.waterColor, v),
  waterReflect: (v) => (WU.reflect.value = v), reflBright: (v) => (WU.reflBright.value = v), waves: (v) => (WU.waves.value = v), waveColor: (v) => col(WU.waveColor, v),
  waveFreq: (v) => (WU.waveFreq.value = v), waveWidth: (v) => (WU.waveWidth.value = v), waveSpeed: (v) => (WU.waveSpeed.value = v), glints: (v) => (WU.glints.value = v),
  waveHeight: (v) => (WU.waveHeight.value = v), waveLen: (v) => (WU.waveLen.value = v), waveDir: (v) => (WU.windAng.value = THREE.MathUtils.degToRad(v)),
  glintSharp: (v) => (WU.glintSharp.value = v), reflDistort: (v) => (WU.reflDistort.value = v), waterStrokes: (v) => (WU.strokes.value = v), ripple: (v) => (WU.ripple.value = v), rippleScale: (v) => (WU.rippleScale.value = v), rippleSpeed: (v) => (WU.rippleSpeed.value = v),
  hillsOn: (v) => { hills && (hills.visible = !!v); landmarks && (landmarks.visible = !!v && !!P.landOn); }, landOn: (v) => landmarks && (landmarks.visible = !!v && !!P.hillsOn), towerX: () => rebuildHills(), towerZ: () => rebuildHills(), towerText: () => rebuildHills(),
  landColor: (v) => col(LU2.color, v), landLight: (v) => (LU2.light.value = v), hillHeight: () => rebuildHills(), lakeSize: () => rebuildHills(), hillSeed: () => rebuildHills(),
  hillColor: (v) => col(WU.hillColor, v), hillLight: (v) => (WU.hillLight.value = v),
  hazeColor: (v) => col(WU.hazeColor, v), hazeNear: (v) => (WU.hazeNear.value = v), hazeFar: (v) => (WU.hazeFar.value = v),
  ballIOR: (v) => (BU.ior.value = v), ballZoom: (v) => (BU.zoom.value = v), ballRim: (v) => (BU.rim.value = v), ballSpec: (v) => (BU.spec.value = v),
  ballTint: (v) => col(BU.tint, v), clayColor: (v) => col(BU.clay, v), ballGrain: (v) => (BU.grain.value = v), ballVignette: (v) => (BU.vignette.value = v),
  ballInkGamma: (v) => (BU.inkGamma.value = v), roomOn: (v) => bs.setRoomOn(!!v), churchHaze: (v) => (BU.hazeAmt.value = v), churchHazeFar: (v) => (BU.hazeFar.value = v), wallsOn: (v) => bs.setWallsOn(!!v), clothWind: (v) => bs.setWind(v), swaySpeed: (v) => bs.setSwaySpeed(v), tableOn: (v) => (bs.table.visible = !!v),
  ballKey: (v) => (bs.key.intensity = v), ballFill: (v) => (bs.fill.intensity = v),
  bgTop: (v) => col(BG.top, v), bgGlow: (v) => col(BG.glow, v), bgGlowStr: (v) => (BG.glowStr.value = v),
  bgGlowX: (v) => (BG.glowPos.value.x = v), bgGlowY: (v) => (BG.glowPos.value.y = v), bgGlowSize: (v) => (BG.glowSize.value = v),
  // material
  rough: (v) => (crow.body.roughness = v), metal: (v) => (crow.body.metalness = v), specInt: (v) => (crow.body.specularIntensity = v),
  clearcoat: (v) => (crow.body.clearcoat = v), ccRough: (v) => (crow.body.clearcoatRoughness = v),
  sheen: (v) => (crow.body.sheen = v), sheenRough: (v) => (crow.body.sheenRoughness = v), sheenColor: (v) => crow.body.sheenColor.set(v),
  irid: (v) => (crow.body.iridescence = v), iridIOR: (v) => (crow.body.iridescenceIOR = v), iridThick: (v) => (crow.body.iridescenceThicknessRange = [100, v]),
  // dust
  dustOn: (v) => dust && (dust.visible = !!v), dustSize: (v) => (DU.size.value = v), dustOpacity: (v) => (DU.opacity.value = v), dustColor: (v) => col(DU.color, v),
  dustDepth: (v) => (DU.depth.value = v), dustBokeh: (v) => (DU.bokeh.value = v), dustTwinkle: (v) => (DU.twinkle.value = v),
  turb: (v) => (DU.turb.value = v), gravity: (v) => (DU.gravity.value = v), repel: (v) => (DU.repel.value = v), repelRadius: (v) => (DU.repelRadius.value = v),
  // lens / film / project / rays / grade → post uniforms
  raysColor: (v) => col(PU.raysColor, v), halColor: (v) => col(PU.halColor, v), leakColor: (v) => col(PU.leakColor, v),
  shadowTint: (v) => col(PU.shadowTint, v), highTint: (v) => col(PU.highTint, v),
  streakColor: (v) => col(PU.streakColor, v),
  dofBoost: (v) => (PU.dofBoost.value = v), maxBlurPx: (v) => (PU.maxBlurPx.value = v), bokehBoost: (v) => (PU.bokehBoost.value = v), bladeRot: (v) => (PU.bladeRot.value = v), anamorph: (v) => (PU.anamorph.value = v), sceneScale: (v) => (PU.sceneScale.value = v),
  markOn: (v) => (PU.markOn.value = v ? 1 : 0), markBg: (v) => (PU.markBg.value = v ? 1 : 0), eyeFinal: (v) => col(PU.eyeFinal, v), beakColor: (v) => col(PU.beakColor, v), outlineColor: (v) => col(PU.outlineColor, v), outlineW: (v) => (PU.outlineW.value = v),
  negPaper: (v) => col(PU.negPaper, v), negInk: (v) => col(PU.negInk, v), negGamma: (v) => (PU.negGamma.value = v), negColor: (v) => (PU.negColor.value = v),
  negPaperTex: (v) => (PU.negPaperTex.value = v), negSky: (v) => (PU.negSky.value = v),
  bloomMask: (v) => (PU.bloomMask.value = v ? 1 : 0),
  letterbox: (v) => (PU.letterbox.value = v === 'off' ? 0 : +v),
  // rig
  clip: (v) => rig.play(v, P.xfade), skeleton: (v) => (skel.visible = !!v),
  pixelRatio: () => resize(), pr2: () => resize(),
  raysRes: () => sizeRays(),
};
for (const k of ['distort', 'ca', 'vignette', 'vignetteSoft', 'bloomStr', 'bloomRadius', 'bloomThresh', 'focus',
  'raysInt', 'raysDecay', 'raysDensity', 'raysSize', 'grain', 'grainSize', 'grainLuma', 'grainColor', 'halation', 'scan',
  'specks', 'scratches', 'hotspot', 'blurLen', 'smearDecay', 'birdSharp', 'streaks', 'streakDensity', 'streakSpeed', 'exposure', 'contrast', 'fade', 'gamma', 'gain', 'sat', 'vibrance', 'temp', 'gtint', 'shadowAmt', 'highAmt']) {
  MAP[k] = (v) => (PU[k].value = v);
}
for (const d of DEFS) if (d[0] === 'Titles' && /^title(Pos)?\d+$/.test(d[2])) MAP[d[2]] = () => titles && titles.dirty(d[2]);
for (const k of TITLE_KEYS) MAP[k] = () => titles && titles.colors();
const apply = (k) => { const f = MAP[k]; if (f) f(P[k]); if (REBUILD.has(k)) { if (k === 'dustCount') buildDust(); else needRebuild = true; } };
DEFS.forEach((d) => apply(d[2]));
repaintPortal();
if (document.fonts) document.fonts.load('100px "Sedgwick Ave Display"').then(() => repaintPortal()).catch(() => {});   // repaint once the graffiti font has arrived
booted = true;   // from here on, picking a ready look overwrites the effect settings

const ctl = {
  P,
  set(k, v) { P[k] = v; apply(k); save(); },
  setMany(o) { for (const k in o) if (k in DEF) { P[k] = o[k]; apply(k); } save(); },
  toggleBypass() { bypass = !bypass; return bypass; },
  toggleNeg() { ctl.set('negOn', P.negOn ? 0 : 1); return !!P.negOn; },
  capture: () => capture(),
  backend,
};
const ui = createConsole(ctl, EDIT);
makeInvCursor(P);   // invert disc under the pointer
// ------------------------------------------------------------------ hidden modules (scan with the ink, hold to discover) + storage (F)
const _mb = new THREE.Box3(), _mc = {};
const modCenter = (id, o, out) => {   // bbox centre in the object's own frame, cached; world position every frame
  if (!_mc[id]) {   // the object's own parts only (a perch / a chain flagged noWire don't count)
    o.updateMatrixWorld(true); _mb.makeEmpty(); o.traverse((m) => { if (m.isMesh && !m.userData.noWire) _mb.expandByObject(m, false); });
    if (_mb.isEmpty()) return null; _mc[id] = o.worldToLocal(_mb.getCenter(new THREE.Vector3()));
  }
  return out.copy(_mc[id]).applyMatrix4(o.matrixWorld);
};
const MOD_OBJ = {
  crow: () => { if (crow.perch) crow.perch.userData.noWire = true; return crow.root; },
  sphere: () => bs.stand,
  chandelier: () => bs.getRoom() && bs.getRoom().userData.chandelier,
  door: () => bs.getRoom() && bs.getRoom().userData.doorMesh,
  car: () => bs.town && bs.town.userData.carOne,
  earth: () => bs.city && bs.city.earth,
};
let winOn = false;
const modules = makeModules({
  P, obj: MOD_OBJ, canvas: () => canvas,
  wire: { door: () => bs.getRoom() && bs.getRoom().userData.doorModule },   // the storage's door: leaves + arch + ironwork
  win: () => { winOn = true; crown.show(); },   // all six found: light ↔ dark + the crown (confetti: modules.js)
  hold: (id, on) => { if (id === 'chandelier' && bs.setChandHold) bs.setChandHold(on); },   // the cursor on its tag stills the chandelier
  ready: () => warmI >= WARM.length,
  pull: () => pullS, total: () => flowTotal(),
  view: () => (ballPhase > 0.0005 && P.ballOn ? (cityView.crossed ? 'city' : 'ball') : 'lake'),
  cam: (v) => (v === 'lake' ? camera : v === 'city' ? bs.city.cam : bs.cam),
  inWindow: (id, view, p) => {
    const b1 = 2 + Math.max(0, P.ballExtraSteps), b2 = b1 + P.keySteps, b3 = b2 + P.townSteps, b4 = b3 + P.citySteps, b5 = b4 + Math.max(0, P.earthSteps), b6 = b5 + Math.max(0, P.atomSteps);
    const W = { crow: ['lake', 0, 0.95], sphere: ['ball', 1.02, b1 + 0.1], chandelier: ['ball', 1.02, b1 + 0.1], door: ['ball', b2 - 0.2, b2 + 0.35 * P.townSteps], car: ['ball', b2 + 0.3 * P.townSteps, b3], earth: ['city', b4 + 0.3 * Math.max(0, P.earthSteps), b5 + 0.2] }[id];
    return W && W[0] === view && p >= W[1] && p <= W[2];
  },
  anchor: (id, out) => { const o = MOD_OBJ[id](); return o ? modCenter(id, o, out) : null; },
});
// ------------------------------------------------------------------ sound: music + a click sound for what's under the cursor
initSound(P);
{
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.shiftKey || e.button !== 0) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    let sc = scene, cm = camera, fb = 'cloud';
    if (ballPhase > 0.0005 && P.ballOn) { if (cityView.crossed) { sc = bs.city.scene; cm = bs.city.cam; fb = cityView.deep ? 'tap' : 'cloud'; } else { sc = bs.scene; cm = bs.cam; fb = 'stone'; } }
    ray.setFromCamera(ndc, cm);
    const hit = ray.intersectObjects(sc.children, true).find((h) => !h.object.isPoints && !h.object.isLine && !h.object.isSprite && shown(h.object));
    const kind = sfxOf(hit, fb);
    const stick = P.stickOn && hit && kind !== 'water' && hit.face && !hit.object.isSkinnedMesh && !hit.object.userData.isSticker && !(hit.object.material && hit.object.material.alphaTest > 0);
    playSfx(stick ? 'tape' : kind);   // a sticker going on sounds like tape
    if (stick) stickAt(hit, sc === scene ? 1 : sc === bs.scene ? 2 : 3, cm);
  });
  // click stickers: a random sign / label pressed onto whatever was clicked (see decal.js)
  const stMats = {}, stuck = [];
  const stickMat = (which) => {
    if (stMats[which]) return stMats[which];
    const pat = signPattern(), m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.toneMapped = which !== 1; m.opacityNode = signAlpha(); m.alphaTest = 0.5;   // scene 1: same pipeline as the lake newspapers
    if (which === 1) m.colorNode = mix(vec3(NF.dark), vec3(NF.light), float(1).sub(pat));             // scene 1 prints in negative
    else m.colorNode = mix(vec3(BU.ink), vec3(bs.paper), pat).pow(2.2);
    m.mrtNode = which > 1 ? mrt({ id: vec4(0.777, 0, 1, 1) }) : mrt({ bird: vec4(0, 0, 0, 1) });   // id.z / bird.a = 'sticker': the cursor effect skips it
    return (stMats[which] = m);
  };
  function stickAt(hit, which, cm) {
    const o = hit.object, n = hit.face.normal.clone();
    let instM = null; if (o.isInstancedMesh && hit.instanceId !== undefined) { instM = new THREE.Matrix4(); o.getMatrixAt(hit.instanceId, instM); }
    const nm = new THREE.Matrix3().getNormalMatrix(instM ? new THREE.Matrix4().multiplyMatrices(o.matrixWorld, instM) : o.matrixWorld); n.applyMatrix3(nm).normalize();
    if (n.dot(ray.ray.direction) > 0) n.negate();
    const name = STICKERS[(Math.random() * STICKERS.length) | 0], cu = cellUV(name);
    const size = cm.position.distanceTo(hit.point) * Math.tan(THREE.MathUtils.degToRad(cm.fov || 40) / 2) * 0.16 * P.stickSize;   // ≈ 8 % of the screen height, whatever the distance
    const g = decalGeometry(o, instM, hit.point, n, size, (Math.random() - 0.5) * 0.9, size * 0.18, cu.aspect); if (!g) return;   // thin box: hugs the surface, never spills onto parts behind
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, cu.u0 + uv.getX(i) * (cu.u1 - cu.u0), cu.v0 + uv.getY(i) * (cu.v1 - cu.v0));
    { const e = size * 0.025; g.translate(n.x * e, n.y * e, n.z * e); }   // lifted a hair off the surface: no z-fighting flicker
    const parent = o.isInstancedMesh ? (o.parent || o) : o; parent.updateMatrixWorld(true);
    g.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
    const d = new THREE.Mesh(g, stickMat(which)); d.userData.isSticker = true; d.userData.sfx = 'paper'; d.frustumCulled = false; d.renderOrder = 5; parent.add(d);
    stuck.push(d); while (stuck.length > P.stickMax) { const old = stuck.shift(); old.removeFromParent(); old.geometry.dispose(); }
  }
}

// ------------------------------------------------------------------ input
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
addEventListener('pointermove', (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
addEventListener('pointerleave', () => mouse.set(0, 0));
document.addEventListener('mouseleave', () => mouse.set(0, 0));
// cursor camera: a slider rig with inertia. The camera trucks / pedestals towards the cursor while aiming at a
// point far BEHIND the hero, so the hero shifts against the cursor and shows a little of its sides while the
// background barely moves (true parallax — not an orbit, no roll, no dolly, no zoom).
const camPar = new THREE.Vector2();
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _focus = new THREE.Vector3();
function applyParallax(cam, hero, amount = 1) {
  // the rig pivots at P.parHero × the distance to the subject (0.6 = the feel of the cell scene), everywhere
  _f.copy(hero).sub(cam.position); const dist = _f.length() * P.parHero; if (dist < 1e-4 || amount <= 0) return; _f.normalize();
  const hero2 = cam.position.clone().addScaledVector(_f, dist);
  _focus.copy(hero2).addScaledVector(_f, dist * P.parFocus);          // aim point far behind the hero
  // screen axes from the camera itself (world-up would be degenerate when looking straight down: city, planet, atom, cell)
  _u.set(0, 1, 0).applyQuaternion(cam.quaternion); _r.crossVectors(_f, _u).normalize(); _u.crossVectors(_r, _f).normalize();
  cam.position.addScaledVector(_r, camPar.x * P.parTruck * dist * amount).addScaledVector(_u, camPar.y * P.parPed * dist * amount);
  cam.lookAt(_focus);
}
// Shift + drag on the scene = move the crow around the frame
let dragFrame = null;
canvas.addEventListener('pointerdown', (e) => { if (!e.shiftKey) return; dragFrame = { x: e.clientX, y: e.clientY, fx: P.frameX, fy: P.frameY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!dragFrame) return;
  P.frameX = +THREE.MathUtils.clamp(dragFrame.fx + (e.clientX - dragFrame.x) / innerWidth, -0.5, 0.5).toFixed(3);
  P.frameY = +THREE.MathUtils.clamp(dragFrame.fy + (e.clientY - dragFrame.y) / innerHeight, -0.5, 0.5).toFixed(3);
});
canvas.addEventListener('pointerup', () => { if (dragFrame) { dragFrame = null; save(); ui.render(); } });
// scroll = zoom in/out (camera distance), smoothed; ignored while scrolling the console
let ballPhase = 0, dutchNow = 0;
// ---- endless loop: past the cell the view zooms on out into paper and comes back out of the crow's eye (scene 1);
// scrolling up from the very start goes the other way round. pullS lives in [-E, total + L1] and wraps.
const loopOn = () => P.loopOn && P.pullOn && P.ballOn && P.keyOn && P.townOn && P.cityOn;
const flowTotal = () => 2 + Math.max(0, P.ballExtraSteps) + P.keySteps + P.townSteps + P.citySteps + Math.max(0, P.earthSteps) + Math.max(0, P.atomSteps) + Math.max(0, P.cellSteps);
const loopL = () => 0.5 * Math.max(0.2, P.loopSteps);
const veilEl = Object.assign(document.createElement('div'), { id: 'loopveil' });
Object.assign(veilEl.style, { position: 'fixed', inset: '0', background: '#cdc4ab', opacity: '0', pointerEvents: 'none', zIndex: '3' });
document.body.appendChild(veilEl);
const eyeMesh = crow.skinned.find((o) => o.material === crow.eye), _ev = new THREE.Vector3(), _eBest = new THREE.Vector3(), _eHead = new THREE.Vector3();
// the eye faces are a subset of the shared crow vertex buffer (index) — collect those vertices once, split them into
// the two eyes, and use the centre of the eye nearer the camera
const eyeIdx = eyeMesh && eyeMesh.geometry.index ? [...new Set(eyeMesh.geometry.index.array)] : [];
const _eA = new THREE.Vector3(), _eB = new THREE.Vector3(), _eP = [];
// replace the low-poly eyes by smooth spheres on the head bone (same eye material) — up close they stay round
let eyes = null, eyeTries = 0;
const pupilMat = new THREE.MeshBasicNodeMaterial(); pupilMat.colorNode = vec3(1);   // (scene 1 prints inverted: white here = ink on screen) pupilMat.mrtNode = mrt({ bird: vec4(1, 0, 0, 1) });
function buildEyes() {
  if (!eyeIdx.length || !crow.bones.head) return;
  const pts = eyeIdx.map((i) => { const v = new THREE.Vector3(); eyeMesh.getVertexPosition(i, v); return v.applyMatrix4(eyeMesh.matrixWorld); });
  const c = new THREE.Vector3(); pts.forEach((p) => c.add(p)); c.divideScalar(pts.length);
  let far = pts[0], fd = 0; for (const p of pts) { const d = p.distanceToSquared(c); if (d > fd) { fd = d; far = p; } }
  const axis = far.clone().sub(c).normalize(), A = [], B = [];
  for (const p of pts) (p.clone().sub(c).dot(axis) > 0 ? A : B).push(p);
  const head = crow.bones.head; head.updateMatrixWorld(true);
  const hs = head.getWorldScale(new THREE.Vector3()).x;
  eyes = [A, B].filter((g) => g.length > 3).map((g) => {
    const cc = new THREE.Vector3(); g.forEach((p) => cc.add(p)); cc.divideScalar(g.length);
    let r = 0; g.forEach((p) => (r = Math.max(r, p.distanceTo(cc))));
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), crow.eye);
    m.position.copy(head.worldToLocal(cc.clone())); m.scale.setScalar((r * 0.85) / hs); m.frustumCulled = false;
    head.add(m);
    // pupil: a small ink dot on the outside of the eye (away from the head centre) — the camera flies into it
    const out = m.position.clone().normalize();
    const pu = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), pupilMat); pu.scale.setScalar(0.42); pu.position.copy(out.clone().multiplyScalar(0.72)); pu.frustumCulled = false;
    pu.visible = false; m.add(pu); m.userData.pupil = pu; return m;   // pupil invisible: only the camera's target point
  });
  if (eyes.length) eyeMesh.visible = false; else eyes = null;
}
const _eW = new THREE.Vector3(), _eS = new THREE.Vector3();
function eyePoint(from) {     // surface point of the eye nearer the camera
  if (!eyes) return null;
  let best = null, bd = Infinity;
  for (const m of eyes) { m.getWorldPosition(_eW); const d = _eW.distanceToSquared(from); if (d < bd) { bd = d; best = m; } }
  best.userData.pupil.getWorldPosition(_eW);
  return _eA.copy(_eW);
}
// ---- palette sun (COLOR-GUIDE): one key light from back-right, fairly low, long hard shadows toward the
// front-left of the frame; its shadow box follows what the camera looks at. Church interior: no cast shadows
// (the light there is designed); street, church front and the city cast them.
const _sf = new THREE.Vector3(), _sr = new THREE.Vector3(), _st = new THREE.Vector3(), _sd = new THREE.Vector3();
let sunFlagN = 0;
function aimSun(light, cam, on, S, lookDist, groundY = null) {
  light.castShadow = !!on;
  if (!on) return;
  cam.getWorldDirection(_sf); _sr.crossVectors(_sf, new THREE.Vector3(0, 1, 0)).normalize();
  if (groundY !== null && _sf.y < -0.05) { const k = (groundY - cam.position.y) / _sf.y; _st.copy(cam.position).addScaledVector(_sf, Math.min(k, lookDist * 4)); }
  else _st.copy(cam.position).addScaledVector(_sf, lookDist);
  const fh = _sf.clone().setY(0).normalize();
  _sd.copy(fh).multiplyScalar(P.sunBack).addScaledVector(_sr, P.sunSide).add(new THREE.Vector3(0, P.sunHeight, 0)).normalize();
  light.target.position.copy(_st); light.position.copy(_st).addScaledVector(_sd, S * 2);
  const c = light.shadow.camera; if (c.right !== S) { Object.assign(c, { left: -S, right: S, top: S, bottom: -S, near: 0.1, far: S * 5 }); c.updateProjectionMatrix(); }
  light.target.updateMatrixWorld(); light.updateMatrixWorld();
}
function placeSuns() {
  const on = PAL.mode.value > 0.5 && P.sunShadows;
  const town = bs.town, kh = bs.getRoom() && bs.getRoom().userData.keyhole;
  const outside = town && town.visible;
  aimSun(bs.sun, bs.cam, on && outside && !cityView.crossed, 110, 60, town ? town.position.y : null);
  const cc = bs.city.cam, alt = cc.position.y;
  aimSun(bs.city.sun, cc, on && cityView.active && alt < 12000, THREE.MathUtils.clamp(alt * 1.2, 250, 5000), 1500, 0);
  if (on && sunFlagN++ % 60 === 0) for (const sc of [bs.scene, bs.city.scene]) sc.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.sun && !o.userData.sunFlag) { o.castShadow = o.receiveShadow = true; o.userData.sunFlag = 1; } });
}
let camDistS = P.camDist, wheelT = null, orbitA = 0, pullTarget = 0, pullS = 0, camDistEff = P.camDist;
// scroll → scenes (scrubbed). Alt/⌥ + scroll or trackpad pinch → zoom
let sceneTarget = 0, sceneS = 0, touchY = null, introT = 0;
addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', (e) => { if (touchY == null || !P.scenesOn) return; sceneTarget = THREE.MathUtils.clamp(sceneTarget + (touchY - e.touches[0].clientY) * 0.0015, 0, 1); touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('wheel', (e) => {
  if (e.target.closest && (e.target.closest('#cx') || e.target.closest('#mz-st'))) return;   // console / storage scroll themselves
  e.preventDefault();
  if (P.scenesOn && !e.altKey && !e.ctrlKey) { sceneTarget = THREE.MathUtils.clamp(sceneTarget + e.deltaY * 0.0006 * P.scrollSens, 0, 1); return; }
  if (P.pullOn && !e.altKey && !e.ctrlKey) { if (warmI < WARM.length) return; lastWheel = performance.now(); if (Math.abs(e.deltaY) > 0.5) wheelDir = Math.sign(e.deltaY); if (loopOn()) { pullTarget = THREE.MathUtils.clamp(pullTarget + e.deltaY * 0.0005 * P.pullSens, pullS - 0.6, pullS + 0.6); return; }
    pullTarget = THREE.MathUtils.clamp(Math.min(pullTarget + e.deltaY * 0.0005 * P.pullSens, pullS + 0.6), 0, P.ballOn ? 2 + (P.ballExtraSteps > 0 ? P.ballExtraSteps : 0) + (P.keyOn ? P.keySteps + (P.townOn ? P.townSteps + (P.cityOn ? P.citySteps + Math.max(0, P.earthSteps) + Math.max(0, P.atomSteps) + Math.max(0, P.cellSteps) : 0) : 0) : 0) : 1); return; }
  const d = THREE.MathUtils.clamp(P.camDist * Math.exp(e.deltaY * 0.0015 * P.zoomSens), 1.5, 30);
  P.camDist = +d.toFixed(2); save();
  clearTimeout(wheelT); wheelT = setTimeout(() => ui.render(), 200);
}, { passive: false });

// auto quality: watches the frame rate once the site is running (not while it loads, warms up, sits in a hidden tab
// or under the storage) and lowers the render resolution in small steps when the machine can't keep up — down to
// ~0.65 device px per css px at most — then raises it again when there's headroom. Slow to go up, quick to go down,
// and never more often than every 2 s, so it doesn't flicker between two sizes.
var aqLow = 0, aqHigh = 0, aqLast = 0;
function autoQ(fps) {
  const now = performance.now();
  if (window.__loaderHold || warmI < WARM.length || document.hidden || window.__storageOpen) { aqLow = aqHigh = 0; return; }
  aqLow = fps < 48 ? aqLow + 1 : 0; aqHigh = fps > 57 ? aqHigh + 1 : 0;
  if (now - aqLast < 2000) return;
  const basePr = P.pixelRatio > 0 ? P.pixelRatio : Math.min(devicePixelRatio, 2), minS = Math.min(1, 0.65 / basePr);
  let s = autoScale;
  if (aqLow >= 3) s = Math.max(minS, autoScale - (fps < 30 ? 0.15 : 0.08));   // 1.5 s of slow frames
  else if (aqHigh >= 10) s = Math.min(1, autoScale + 0.05);                   // 5 s of smooth frames
  if (Math.abs(s - autoScale) > 1e-3) { autoScale = s; aqLast = now; aqLow = aqHigh = 0; resize(); }
}
var deepScenes = false;   // var: resize() can run before this line (console apply at start)
function resize() {
  let pr = P.pixelRatio > 0 ? P.pixelRatio : Math.min(devicePixelRatio, 2);
  if (deepScenes && P.pr2 > 0) pr = Math.min(pr, P.pr2);   // scenes 2+ (church → cell) are heavier: lower pixel ratio there
  renderer.setPixelRatio(pr * autoScale);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  PU.res.value.set(innerWidth * pr * autoScale, innerHeight * pr * autoScale);
  BG.aspect.value = DU.aspect.value = camera.aspect;
  sizeRays();
}
function sizeRays() {
  if (!post || !post.raysT) return;
  const q = +P.raysRes || 0.35;
  post.raysT.setSize(Math.max(64, Math.round(innerWidth * q)), Math.max(64, Math.round(innerHeight * q)));
}
addEventListener('resize', resize); resize();
// warm-up under the loader: visit every scene once so WebGPU builds all shaders now, not mid-scroll (that was the freeze)
const WARM_ALL = [1.5, 3.2, 4.6, 5.4, 6.4, 7.8, 8.8, 9.4, 11, 12.5, 14.5, 15.9, 17.5, 19.5, 21.9, 22.8, -0.5, 0, 0];
// back from another page of the site (no loader): every scene was already compiled once in this browser (its shader
// cache makes the rest quick later), so only the first scene is warmed and the page burns in right away
const QUICK = !!window.__skipLoader;
const WARM = QUICK ? [0, 0] : WARM_ALL;   // incl. the loop exit and the eye flight
let warmI = -1, warmWait = 0, rewarmed = false;

// ------------------------------------------------------------------ projector state (per rendered frame)
const n1 = (t) => Math.sin(t * 1.3) * 0.5 + Math.sin(t * 2.9 + 1.1) * 0.3 + Math.sin(t * 7.7 + 2.3) * 0.2;
const scr = [{ x: -1, life: 0 }, { x: -1, life: 0 }, { x: -1, life: 0 }, { x: -1, life: 0 }];
let burnLife = 0;
function projector(t) {
  const w = P.weave;
  PU.weaveOff.value.set((n1(t * P.weaveSpeed) * 0.0022 + (Math.random() - 0.5) * 0.0006) * w, (n1(t * P.weaveSpeed + 13.7) * 0.003 + (Math.random() - 0.5) * 0.0008) * w);
  PU.weaveRot.value = n1(t * P.weaveSpeed * 0.7 + 5.1) * 0.0025 * P.weaveRot;
  PU.flickerMul.value = 1 + (Math.random() - 0.5) * 2 * P.flicker + (Math.sin(t * 50) * 0.5 + Math.random() - 0.5) * P.lampFlicker;
  PU.seed.value = Math.random() * 1000;
  scr.forEach((s, i) => { if (s.life-- <= 0) { s.x = Math.random() < P.scratches * 0.35 ? Math.random() : -1; s.life = 3 + Math.random() * 18; } else if (s.x >= 0) s.x += (Math.random() - 0.5) * 0.002; });
  PU.scratchX.value.set(scr[0].x, scr[1].x, scr[2].x, scr[3].x);
  if (burnLife <= 0 && Math.random() < P.burn * 0.015) { burnLife = 3 + Math.random() * 4; PU.burnPos.value.set(Math.random(), Math.random()); }
  PU.burn.value = burnLife > 0 ? Math.min(1, burnLife / 3) * (0.5 + P.burn) : 0; burnLife--;
  PU.leak.value = P.leak * (0.55 + 0.45 * Math.sin(t * 0.37));
  PU.leakPos.value.set(Math.sin(t * 0.11) > 0 ? -0.05 : 1.05, 0.5 + Math.sin(t * 0.23) * 0.4);
}

function volRef(P) { // dust volume at the default framing (distance 5.2)
  const back = P.dustDepth * 0.75, far = 5.2 + back, hh = Math.tan(THREE.MathUtils.degToRad(P.fov) / 2) * far * 1.1;
  return hh * 2 * hh * 2 * camera.aspect * Math.max(1, 5.2 - 0.3 + back);
}
const hint = document.createElement('div');
hint.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:4;color:#9fb3bd;font:500 11px -apple-system,system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;transition:opacity .6s;pointer-events:none;opacity:0';
hint.textContent = 'scroll'; document.body.appendChild(hint);
// ------------------------------------------------------------------ extra bushes: copies of the perch filling the bottom of the frame
const BUSH_MAX = 80;
let bush = null, bushN = -1;
function updateBush() {
  const p = crow.perch; if (!p) return;
  if (!bush) {
    bush = new THREE.InstancedMesh(p.geometry, p.material, BUSH_MAX);
    bush.frustumCulled = false; bush.castShadow = false; bush.receiveShadow = true;   // no shadow pass for copies (cheaper)
    scene.add(bush);   // world space: x runs across the screen whatever the crow's turn
    const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    // jittered grid across the bottom (wide in x, shallow in z), filled from the centre outwards
    const cells = [];
    for (let gx = -9; gx <= 9; gx++) for (let gz = -2; gz <= 1; gz++) cells.push([gx, gz]);
    cells.sort((a, b) => (Math.abs(a[0]) * 1.0 + Math.abs(a[1] + 0.5) * 1.6) - (Math.abs(b[0]) * 1.0 + Math.abs(b[1] + 0.5) * 1.6));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < BUSH_MAX; i++) {
      const [gx, gz] = cells[i + 1] || [0, 0];
      pos.set(gx * 2.3 + (rnd(i, 1) - 0.5) * 1.6, -0.9 - rnd(i, 6) * 1.2 + Math.abs(gx) * 0.03, gz * 2.4 + (rnd(i, 7) - 0.5) * 1.4);
      q.setFromEuler(new THREE.Euler((rnd(i, 2) - 0.5) * 0.3, rnd(i, 3) * Math.PI * 2, (rnd(i, 4) - 0.5) * 0.3));
      s.setScalar(0.8 + rnd(i, 5) * 0.6);
      bush.setMatrixAt(i, m4.compose(pos, q, s));
    }
    bush.instanceMatrix.needsUpdate = true;
  }
  const n = Math.round(P.perchCount);
  if (n !== bushN) { bush.count = n; bushN = n; }
  bush.visible = p.visible && n > 0;
}
// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const v3 = new THREE.Vector3();
let t = 0, lastRender = -1, fpsAcc = 0, fpsN = 0, fpsT = 0, keyAz = P.keyAz;
// ------------------------------------------------------------------ high-quality capture → Desktop
let capturing = false;
async function capture() {
  if (capturing) return; capturing = true;
  const scale = parseFloat(P.shotScale) || 2;
  const basePr = P.pixelRatio > 0 ? P.pixelRatio : Math.min(devicePixelRatio, 2);
  const maxSide = 8192;
  const pr = Math.min(basePr * scale, maxSide / Math.max(innerWidth, innerHeight));
  const keep = { raysRes: P.raysRes, raySamples: P.raySamples };
  try {
    ui.toast('Рендер…');
    renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false);
    PU.res.value.set(innerWidth * pr, innerHeight * pr);
    if (P.raysOn) { P.raySamples = '96'; post = buildPost(renderer, scene, camera, P); P.raysRes = '1'; sizeRays(); }
    await post.renderAsync();
    await post.renderAsync(); // warm-up: pipelines + buffers at the new size
    // final frame and the read-back in the same task, so a WebGPU canvas is still readable
    const blob = await new Promise((res) => { post.render(); canvas.toBlob(res, 'image/png'); });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const name = `crow_${stamp}_${Math.round(innerWidth * pr)}x${Math.round(innerHeight * pr)}.png`;
    let saved = null;
    try {
      const r = await fetch('/save-shot?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
      if (r.ok) saved = (await r.json()).path;
    } catch {}
    if (!saved) { // no local server endpoint → normal browser download
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      ui.toast('Завантажено: ' + name);
    } else ui.toast('Збережено: ' + saved.replace(/^.*\/Desktop\//, 'Desktop/'));
  } catch (e) { fail(e); ui.toast('Не вдалося зберегти'); }
  finally {
    Object.assign(P, keep);
    post = buildPost(renderer, scene, camera, P);
    resize(); capturing = false;
  }
}
addEventListener('keydown', (e) => { if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'SELECT'].includes(e.target.tagName) && !e.metaKey && !e.ctrlKey) { ctl.toggleNeg(); ui.render(); } });
addEventListener('keydown', (e) => { if ((e.key === 'p' || e.key === 'P') && !['INPUT', 'SELECT'].includes(e.target.tagName) && !e.metaKey && !e.ctrlKey) capture(); });

renderer.setAnimationLoop(() => {
  if (capturing) return;
  if (window.__storageOpen) { clock.getDelta(); return; }   // the storage covers the scene (blurred): hold the last frame, all the power goes to its turning model
  const cpu0 = performance.now(); if (BENCH) { renderer.info.autoReset = false; renderer.info.reset(); }
  const rdt = Math.min(clock.getDelta(), 0.1);
  renderer.getDrawingBufferSize(HU.res.value);   // print screen grid in device pixels
  const dt = rdt * P.timeScale; t += dt;

  // fps meter + auto quality
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 0.5) {
    const fps = fpsN / fpsAcc;
    if (P.autoQuality) autoQ(fps);
    ui.fps(`${fps.toFixed(0)} fps${autoScale < 1 ? ' · ×' + autoScale.toFixed(2) : ''}`, fps < 40, backend()); fpsAcc = 0; fpsN = 0;
  }
  if (BENCH && warmI >= WARM.length) benchStep(rdt);
  const cap = +P.fpsCap; fpsT += rdt; if (cap && fpsT < 1 / cap - 0.002) return; fpsT = 0;

  // camera
  mouseS.lerp(mouse, 1 - Math.exp(-rdt * 4));
  camPar.x = THREE.MathUtils.damp(camPar.x, mouse.x, P.parLambda, rdt); camPar.y = THREE.MathUtils.damp(camPar.y, mouse.y, P.parLambda, rdt);
  camera.fov = P.focalMM > 0 ? THREE.MathUtils.radToDeg(2 * Math.atan(12 / P.focalMM)) : P.fov;   // full-frame 24mm sensor height
  camDistS += (P.camDist - camDistS) * (1 - Math.exp(-rdt * P.camSmooth));
  orbitA += P.autoOrbit * rdt;
  const az = THREE.MathUtils.degToRad(P.camAz + orbitA);
  // scroll pull-back: camera travels back and up to reveal the lake and hills
  if (warmI < WARM.length) {
    warmWait += rdt;
    if (warmI < 0 && (warmWait < (QUICK ? 0.15 : 0.6) || (!filesReady() && warmWait < (QUICK ? 2.5 : 40)))) {} // every file (cars, bush, leaves, table, textures) and the fonts first — the warm-up then compiles each scene with everything in it
    else { warmI++; if (warmI >= WARM.length && !QUICK && !rewarmed && !filesReady()) { rewarmed = true; warmI = -1; warmWait = 0.6; }   // files that only started loading during the pass (a scene's props): wait for them, then one more pass
      if (warmI < 0) {} else if (warmI < WARM.length) pullTarget = pullS = WARM[warmI]; else { pullTarget = pullS = 0; cityView.crossed = cityView.active = false; document.getElementById('loader')?.classList.add('hide'); } }
  }
  const pPrev = pullS;
  pullS += (pullTarget - pullS) * (1 - Math.exp(-rdt * 3));
  const pullVel = Math.abs(pullS - pPrev) / Math.max(rdt, 1e-3);
  let eyeU = 0;
  if (loopOn() && warmI >= WARM.length) {
    const T = flowTotal(), L1 = loopL(), E = loopL(), span = T + L1 + E;
    if (pullS > T + L1) { pullS -= span; pullTarget -= span; } else if (pullS < -E) { pullS += span; pullTarget += span; }
    const lp = pullS > T ? (pullS - T) / L1 : 0;
    eyeU = pullS < 0 ? THREE.MathUtils.clamp(-pullS / E, 0, 1) : 0;
    cityView.loopOut = THREE.MathUtils.smoothstep(lp, 0, 1);
    veilEl.style.opacity = String(Math.max(THREE.MathUtils.smoothstep(lp, 0.35, 1), THREE.MathUtils.smoothstep(eyeU, 0.65, 1)));
  } else { cityView.loopOut = 0; veilEl.style.opacity = '0'; }
  const p1 = THREE.MathUtils.clamp(pullS, 0, 1), p2 = THREE.MathUtils.clamp(pullS - 1, 0, 1);
  const pe = p1 * p1 * (3 - 2 * p1);
  PU.zoomBlur.value = p2 > 0 ? 0 : Math.min(0.25, pullVel * 0.12 * P.camBlur);
  BU.zoomBlur.value = p2 > 0 && pullS < 2 + Math.max(0, P.ballExtraSteps) ? Math.min(0.25, pullVel * 0.12 * P.camBlur) : 0;   // no zoom smear after the church (keyhole, street, city)
  ballPhase = p2;
  { const deep = pullS > 1.05 ? true : pullS < 0.95 ? false : deepScenes; if (deep !== deepScenes && P.pr2 > 0) { deepScenes = deep; resize(); } else deepScenes = deep; }
  const dist = THREE.MathUtils.lerp(camDistS, P.pullDist, pe);
  const ty = THREE.MathUtils.lerp(P.camTargetY, P.pullTargetY, pe), hy = THREE.MathUtils.lerp(P.camHeight, P.pullHeight, pe);
  const tgt = v3.set(0, ty, 0);
  camera.position.set(Math.sin(az) * dist, ty + hy, Math.cos(az) * dist);
  camDistEff = dist;
  if (P.shake > 0) { // hand-held: layered sines, a few cm and fractions of a degree
    const ts = t * P.shakeSpeed;
    camera.position.x += (Math.sin(ts * 1.3) * 0.6 + Math.sin(ts * 3.7 + 1) * 0.3) * 0.02 * P.shake;
    camera.position.y += (Math.sin(ts * 1.7 + 2) * 0.6 + Math.sin(ts * 4.1) * 0.3) * 0.02 * P.shake;
    tgt.x += Math.sin(ts * 0.9 + 3) * 0.02 * P.shake; tgt.y += Math.sin(ts * 1.1 + 4) * 0.015 * P.shake;
  }
  camera.lookAt(tgt);
  applyParallax(camera, tgt);
  if (dust) dust.rotation.y = az;   // dust volume stays in front of the orbiting camera
  if (eyeU > 0) {   // coming out of the crow's eye: start right at it, glide back to the normal first frame
    const home = camera.position.clone(), ep = eyePoint(home);
    if (ep) {
      const k = THREE.MathUtils.smoothstep(eyeU, 0, 1), near = ep.clone().lerp(home, 0.008);
      camera.position.lerpVectors(home, near, Math.pow(k, 0.6));
      camera.lookAt(tgt.clone().lerp(ep, k));
    }
  }
  const dutchT = THREE.MathUtils.clamp(pullS, 0, 1);   // start → end across scene 1's scroll only
  dutchNow = THREE.MathUtils.lerp(P.dutch, P.dutchEnd, dutchT * dutchT * (3 - 2 * dutchT));
  camera.rotateZ(THREE.MathUtils.degToRad(dutchNow));
  // frame position: lens shift (no perspective change) — the crow slides across the frame
  camera.setViewOffset(innerWidth, innerHeight, -P.frameX * innerWidth, -P.frameY * innerHeight, innerWidth, innerHeight);
  BG.glowPos.value.set(P.bgGlowX + P.frameX, P.bgGlowY + P.frameY);   // background glow stays behind the crow
  camera.updateProjectionMatrix();

  // lights
  keyAz += P.keyOrbit * dt * 30; if (!P.keyOrbit) keyAz = P.keyAz;
  placeLight(envKey, P.envKeyAz, P.envKeyEl); placeLight(envRim, P.envRimAz, P.envRimEl);
  { // water sun = the environment rim (back) light, so glints run towards the camera
    const a_ = THREE.MathUtils.degToRad(P.envRimAz), e_ = THREE.MathUtils.degToRad(Math.max(3, P.envRimEl));
    WU.lightDir.value.set(Math.sin(a_) * Math.cos(e_), Math.sin(e_), Math.cos(a_) * Math.cos(e_)).normalize();
  }
  placeLight(key, keyAz, P.keyEl); placeLight(rim, P.rimAz, P.rimEl); placeLight(fill, P.fillAz, P.fillEl);

  // crow
  crowGroup.rotation.y = THREE.MathUtils.degToRad(P.crowYaw) + t * P.spin;
  crowGroup.scale.setScalar(P.crowScale);
  if (crow.perch) {
    crow.perch.visible = !!P.perchOn && (P.perchFly || !['fly', 'glide', 'dive'].includes(P.clip));
    updateBush();
  }
  crowGroup.position.y = (1 - P.crowScale) * TARGET.y;
  rig.update(dt, t, P, mouseS);
  if (!eyes && eyeTries++ > 5 && eyeTries < 60) buildEyes();
  CU.time.value = t; WU.time.value = t;
  { const tgt = P.negOn ? 1.1 : -0.1, sp = rdt / Math.max(0.01, P.negSpeed) * 1.2; PU.neg.value += Math.max(-sp, Math.min(sp, tgt - PU.neg.value)); }
  // ---- scenes: 1 = idle, 2 = dive. Crow dissolves in on load, out/in across the scroll boundary
  {
    sceneS += (sceneTarget - sceneS) * (1 - Math.exp(-rdt * 6));
    const ss = (a, b, x) => { x = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
    introT = window.__loaderHold ? 0 : introT + Math.min(rdt, 1 / 30);   // own timer, so a slow first frame (shader compile) can't skip the intro; held at 0 behind the loader (js/loader.js)
    const intro = 1 - ss(0.15, 0.15 + P.dissolveIn, introT);
    let sd = 0, scene = 1;
    if (P.scenesOn) {
      scene = sceneS < 0.5 ? 1 : 2;
      sd = scene === 1 ? ss(0.3, 0.5, sceneS) : 1 - ss(0.5, 0.7, sceneS);
      const want = scene === 1 ? P.scene1Clip : P.scene2Clip;
      if (P.clip !== want) { P.clip = want; rig.play(want, 0); }
      hint.style.opacity = sceneS < 0.08 ? 0.6 : 0;
    } else hint.style.opacity = 0;
    CU.dissolve.value = Math.max(P.dissolve, P.scenesOn || P.introOn ? intro : 0, sd);
  }
  news1.area.y0 = P.waterLevel + 0.8; news1.area.y1 = P.waterLevel + 8; news1.area.windVec.set(2.4 * P.nfWind, 0, 0.3 * P.nfWind);
  news1.group.visible = !!P.nfOn; if (P.nfOn) news1.update(t, dt, camera.position, { count: P.nfCount, speed: 1 });
  if (bs.town && bs.town.userData.fly) Object.assign(bs.town.userData.fly, { on: P.flyOn, count: P.flyCount, speed: P.flySpeed });
  { const j = bs.getRoom && bs.getRoom() && bs.getRoom().userData.junk; if (j) j.visible = !!P.junkOn; }
  { // leaves: flight direction = hips → head in world space (works for level flight and the dive)
    const b = crow.bones, hp = b.hips.getWorldPosition(v3), hd = b.head.getWorldPosition(new THREE.Vector3());
    const fwd = hd.sub(hp).normalize();
    if (P.clip !== 'dive') { fwd.y *= 0.35; fwd.normalize(); }   // level flight: stream mostly straight back
    // speed FX: amount eases in with the clip; direction = bird's motion projected on screen (uv, y down)
    const want = P.clip === 'dive' ? P.speedDive : (P.clip === 'fly' || P.clip === 'glide') ? P.speedFly : 0;
    PU.motionAmt.value += (want - PU.motionAmt.value) * (1 - Math.exp(-rdt * 3));
    const a0 = TARGET.clone().project(camera), a1 = TARGET.clone().add(fwd).project(camera);
    const sd = new THREE.Vector2((a1.x - a0.x) * camera.aspect, -(a1.y - a0.y));
    if (sd.lengthSq() > 1e-6) PU.motionDir.value.copy(sd.normalize()).multiply(new THREE.Vector2(1 / camera.aspect, 1));
    leaves.update(dt, t, P, b, ['fly', 'glide', 'dive'].includes(P.clip), fwd, DU.wind.value);
  }

  // dust
  const wd = THREE.MathUtils.degToRad(P.windDir);
  DU.wind.value.set(Math.cos(wd), 0.05, Math.sin(wd)).multiplyScalar(P.windStr);
  DU.time.value = t * P.dustSpeed;
  { // dust volume = the visible frustum (widest at its far end), from just in front of the camera to behind the crow
    const back = P.dustDepth * 0.75, far = camDistEff + back;
    const halfH = Math.tan(THREE.MathUtils.degToRad(P.fov) / 2) * far * 1.1;
    const w = halfH * 2 * camera.aspect, h = halfH * 2;
    DU.box.value.set(w, h, Math.max(1, camDistEff - 0.3 + back));
    DU.boxMin.value.set(-w / 2, TARGET.y + P.camHeight - h / 2, -back);
    DU.zoom.value = Math.max(1, camDistS / 5.2); // zoomed out: specks keep their on-screen size
    // same density however far you zoom: draw more of the pre-built particles as the volume grows
    const vol = (w * h * DU.box.value.z) / volRef(P);
    if (dust) dust.geometry.setDrawRange(0, 6 * Math.min(dust.userData.max, Math.round(P.dustCount * Math.max(1, vol))));
  }
  DU.mouse.value.copy(mouse);
  const camToCrow = camera.position.distanceTo(TARGET);
  { // lens: focal length from the field of view (24 mm sensor height), aperture opens as you scroll back
    PU.camNear.value = camera.near; PU.camFar.value = camera.far;
    PU.focalM.value = 0.012 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    { const pc = THREE.MathUtils.clamp(pullS, 0, 1); PU.fstop.value = THREE.MathUtils.lerp(P.fstop, P.pullFstop, pc * pc * (3 - 2 * pc)); }
  }
  if (P.dofAuto) PU.focus.value = camToCrow;
  DU.focus.value = P.dofOn ? PU.focus.value : camToCrow;

  // god-ray source: the rim light projected to screen
  if (P.raysFollow) {
    v3.copy(rim.position).sub(TARGET).normalize().multiplyScalar(1.6).add(TARGET).project(camera);
    const cl = (x) => Math.min(1.15, Math.max(-0.15, x));
    PU.raysSrc.value.set(cl(v3.x * 0.5 + 0.5), cl(0.5 - v3.y * 0.5));
  } else PU.raysSrc.value.set(P.raysX, P.raysY);

  // projector frame-rate (true stutter: skip frames)
  const sf = +P.stutter;
  if (sf > 0 && t - lastRender < 1 / sf) return;
  lastRender = t;
  PU.time.value = t;
  projector(t);

  if (!soothe) { soothe = makeSoothe(renderer); soothe.setScale(P.sootheRes); }
  soothe.step(renderer);
  if (needRebuild) { needRebuild = false; post = buildPost(renderer, scene, camera, P); sizeRays(); }
  if (ballPhase > 0.0005 && P.ballOn) {
    // scene 1 → texture, then the crystal-ball scene that refracts it
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (ballRT.width !== sz.x || ballRT.height !== sz.y) ballRT.setSize(sz.x, sz.y);
    HU.s1.value = 0; frameN++;
    // scene 1 is only seen inside the crystal ball: once the camera has left the church (keyhole flight, street,
    // city …) it is refreshed every 30th frame just for the paper colour — saves a whole scene + post per frame
    const needS1 = pullS < 2 + Math.max(0, P.ballExtraSteps) + 0.25;
    // inside the church the ball shows scene 1 small: refresh it every P.s1Every-th frame (the costliest pass)
    // once we are properly inside the church (ball small in frame) the ball image is frozen: drawn once, then held —
    // it only comes alive again when the camera comes back close to the glass
    const live = pullS < 1.35, every = pullS < 1.15 ? 1 : Math.max(1, Math.round(P.s1Every));
    const doS1 = live ? (needS1 && (frameN % every) === 0) : (!s1Frozen || (!needS1 && (frameN % 240) === 0));
    s1Frozen = !live;
    if (doS1) {
      renderer.setRenderTarget(ballRT);
      if (bypass) renderer.render(scene, camera); else post.render();
      renderer.setRenderTarget(null);
    }
    HU.s1.value = 1;
    updateBall(ballPhase, rdt);
    placeSuns();
    PT.boil.value = P.boilOn ? Math.floor(t * P.boilFps) / P.boilFps : 0;   // boiling paint: strokes re-dealt a few times a second
    bs.stepCloth(rdt, mouseS.x);
    if (cityView.active) {
      // city: its own haze scale (thousands of units), then either straight to screen (through the portal) or into
      // the texture the portal shows
      const hz = [BU.hazeNear.value, BU.hazeFar.value, BU.hazeAmt.value, BU.lineFade.value, BU.busyAmt.value, BU.thrK.value];
      BU.busyAmt.value = 0; BU.thrK.value = 0;   // the distant-crease guard is for the street road; it wiped the city's outlines   // the city is drawn small from above: every block is 'crowded', so no thinning there
      { const alt = bs.city.cam.position.y, veil = Math.max(bs.city.veil(alt), cityView.extraVeil || 0), base = P.cityHaze * (1 - THREE.MathUtils.smoothstep(alt, 4000, 9000));
        BU.hazeNear.value = P.cityHazeNear * (1 - veil); BU.hazeFar.value = Math.max(10, P.cityHazeFar * (1 - veil)); BU.hazeAmt.value = Math.max(base, veil); BU.lineFade.value = 1; }
      BU.farCut.value = bs.city.cam.position.y > 12000 ? bs.city.cam.far * 0.3 : 16000;   // city: the far sea prints clean paper (no grazing-angle noise lines); in space the cut sits past the planet / atom / cell but before the paper backdrop (its depth is noise → it grew grey blotches)
      bs.city.update(t, rdt);
      LINE.pxAng.value = 2 * Math.tan(THREE.MathUtils.degToRad(bs.city.cam.fov) / 2) / Math.max(1, sz.y);
      if (cityView.crossed) { cityPost.fxOn.value = 1; cityPost.render(); }
      else {
        // fixed scale; on a window resize a NEW target is made (resizing a target the portal material samples
        // breaks its WebGPU bind group — that was the black/stuck street transition)
        const cw = Math.max(2, Math.round(sz.x * 0.45)), ch = Math.max(2, Math.round(sz.y * 0.45));   // it fills a small arch: less than half res is plenty
        if (cityRT.width !== cw || cityRT.height !== ch) { const old = cityRT; cityRT = new THREE.RenderTarget(cw, ch, { type: THREE.HalfFloatType }); bs.cityTex.value = cityRT.texture; setTimeout(() => old.dispose(), 500); }
        if ((cityView.near || !cityFrozen || cityRT !== cityRTDrawn) && !(VAR && VAR.noCityOn)) { cityRTDrawn = cityRT; cityFrozen = !cityView.near; cityPost.fxOn.value = 0; renderer.setRenderTarget(cityRT); cityPost.render(); renderer.setRenderTarget(null); }   // the city far off through the portal is a still picture; it comes alive as you walk up to the arch
      }
      [BU.hazeNear.value, BU.hazeFar.value, BU.hazeAmt.value, BU.lineFade.value, BU.busyAmt.value, BU.thrK.value] = hz; BU.farCut.value = 1e9;
      if (!cityView.crossed) ballPost.render();
    } else ballPost.render();
  } else if (bypass) renderer.render(scene, camera); else post.render();
  // screen UI on top of whatever was drawn (titles as stickers, corner labels, the progress can)
  if (!titles) { titles = makeTitles(renderer, P); window.__ui = titles; hud = makeHud(P, canvas); }
  stepSound(rdt);
  { // the space the music sounds in: by the water, inside the church (muffled hall), then open (street, sky)
    const inBall = ballPhase > 0.0005 && P.ballOn, b1 = 2 + Math.max(0, P.ballExtraSteps);
    setSoundSpace(!inBall ? 'lake' : cityView.crossed ? 'sky' : pullS > b1 + P.keySteps * 0.85 ? 'street' : 'church');
  }
  { // graffiti on the church's end wall: decal space = wall-local (u, v) → world, inverted for the projector
    const room = bs.getRoom && bs.getRoom(); GR.on.value = room && P.grafOn ? 1 : 0;
    if (room && P.grafOn && room.userData.endWall) {
      const ew = room.userData.endWall, S = P.grafSize;
      _gm.compose(_gp.set(ew.W / 2 + P.grafX, P.grafY, 0.8), _gq.setFromAxisAngle(_gz.set(0, 0, 1), THREE.MathUtils.degToRad(P.grafRot)), _gs.set(S, S, 1.6));
      _gw.multiplyMatrices(room.matrixWorld, ew.M).multiply(_gm);
      GR.mat.value.copy(_gw).invert();
      GR.normal.value.set(0, 0, 1).transformDirection(_gw2.multiplyMatrices(room.matrixWorld, ew.M));
    }
    { // the street portal (bricks): "0309" on the left pier, WAKE UP… above the arch — on the face you walk towards
      const tw = bs.town, pt = tw && tw.userData.portal;
      for (const [G, on, z, y, sz] of [[GR3, P.p1On, P.p1Z, P.p1Y, P.p1Size], [GR4, P.p2On, P.p2Z, P.p2Y, P.p2Size]]) {
        G.on.value = pt && on && tw.visible ? 1 : 0; if (!G.on.value) continue;
        tw.updateMatrixWorld(); _gm.makeBasis(_gp.set(0, 0, sz), _gz.set(0, sz, 0), _gs.set(-2, 0, 0)).setPosition(pt.XP - pt.face, pt.y0 + y, z);
        _gw.multiplyMatrices(tw.matrixWorld, _gm); G.mat.value.copy(_gw).invert(); G.normal.value.set(-1, 0, 0).transformDirection(tw.matrixWorld);
      }
    }
    GR2.on.value = room && P.wordsOn && room.userData.door ? 1 : 0;
    if (GR2.on.value) {
      const d = room.userData.door, S = P.wordsSize;
      _gm.compose(_gp.set(P.wordsX, d.y0 + P.wordsY, d.z), _gq.setFromAxisAngle(_gz.set(0, 0, 1), THREE.MathUtils.degToRad(P.wordsRot)), _gs.set(S, S, 1.2));
      _gw.multiplyMatrices(room.matrixWorld, _gm); GR2.mat.value.copy(_gw).invert();
      GR2.normal.value.set(0, 0, 1).transformDirection(room.matrixWorld);
    }
  }
  if (warmI >= WARM.length) {
    let dv = pullS - uiPrev; uiPrev = pullS; if (Math.abs(dv) > 1) dv = 0;   // ignore the loop wrap
    titles.render(rdt, window.__loaderHold ? 999 : pullS, flowTotal(), dv / Math.max(rdt, 1e-3), t);   // no title until the loader lets go
    modules.update();
    hud.update(rdt, pullS, flowTotal());   // (after the frame is drawn: the crow shot snapshots it for the page dissolve)
    if (winOn && CF.win.value < 1) CF.win.value = Math.min(1, CF.win.value + rdt * 1.2);   // the palette flips over ~1 s
    crown.step(rdt);
  } else uiPrev = pullS;
  if (BENCH && bench && bench.i >= 0 && bench.t > 2) { bench.cpu.push(performance.now() - cpu0); bench.dc.push(renderer.info.render.drawCalls); bench.tri.push(renderer.info.render.triangles); }
});
let uiPrev = 0;
var lastWheel = 0, wheelDir = 1;   // var: the wheel handler can fire before this line runs
// ------------------------------------------------------------------ ?bench: flies through every scene, holds each
// for a few seconds and shows the average fps and the worst 5 % of frames per scene (screenshot the table)
const BENCH = new URLSearchParams(location.search).has('bench');
let bench = null;
const shadowAuto = (on) => { for (const sc of [scene, bs.scene, bs.city.scene]) sc.traverse((o) => { if (o.isLight && o.shadow) o.shadow.autoUpdate = on; }); };
var VAR = {   // A/B switches for the heavy scenes: what does each part cost?
  noBall: [() => { VAR._s = P.s1Every; P.s1Every = 100000; }, () => { P.s1Every = VAR._s; }],
  noLines: [() => { VAR._l = BU.lineAmt.value; BU.lineAmt.value = 0; }, () => { BU.lineAmt.value = VAR._l; }],
  noShadow: [() => shadowAuto(false), () => shadowAuto(true)],
  noCity: [() => { VAR.noCityOn = true; }, () => { VAR.noCityOn = false; }],
  noLeaves: [() => bs.town.userData.leafVis(false), () => bs.town.userData.leafVis(true)],
  pr15s: [() => { VAR._p = P.pr2; P.pr2 = 1.5; resize(); }, () => { P.pr2 = VAR._p; resize(); }],
  pr2: [() => { VAR._p = P.pr2; P.pr2 = 2; resize(); }, () => { P.pr2 = VAR._p; resize(); }],
  pr15: [() => { VAR._p = P.pr2; P.pr2 = 1.5; resize(); }, () => { P.pr2 = VAR._p; resize(); }],
};
function benchStep(dt) {
  if (!bench) {
    const b1 = 2 + Math.max(0, P.ballExtraSteps), b2 = b1 + P.keySteps, b3 = b2 + P.townSteps, b4 = b3 + P.citySteps, b5 = b4 + Math.max(0, P.earthSteps), b6 = b5 + Math.max(0, P.atomSteps);
    const ch = 1.7, kf = b1 + P.keySteps * 0.5, ct = b3 + P.citySteps * 0.5;
    bench = { i: -1, t: 0, frames: [], cpu: [], dc: [], tri: [], rows: [], list: [['Lake (scene 1)', 0], ['Church', ch], ['  – no ball image', ch, 'noBall'], ['  – no outlines', ch, 'noLines'], ['  – no shadows', ch, 'noShadow'], ['  – full res (2.0)', ch, 'pr2'], ['  – pixel ratio 1.5', ch, 'pr15'],
      ['Keyhole flight', kf], ['  – no outlines', kf, 'noLines'], ['  – no shadows', kf, 'noShadow'], ['Street', b2 + P.townSteps * 0.6], ['  – no outlines', b2 + P.townSteps * 0.6, 'noLines'], ['  – no shadows', b2 + P.townSteps * 0.6, 'noShadow'], ['  – no city in portal', b2 + P.townSteps * 0.6, 'noCity'], ['  – no leaves', b2 + P.townSteps * 0.6, 'noLeaves'], ['  – pixel ratio 1.5', b2 + P.townSteps * 0.6, 'pr15s'],
      ['City', ct], ['  – no outlines', ct, 'noLines'], ['  – no shadows', ct, 'noShadow'], ['  – full res (2.0)', ct, 'pr2'], ['Planet', b4 + Math.max(0, P.earthSteps) * 0.6], ['Cell', b6 + Math.max(0, P.cellSteps) * 0.6]] };
  }
  const B = bench; if (B.done) return;
  if (!B.el) { B.el = document.createElement('div'); B.el.style.cssText = 'position:fixed;left:16px;top:16px;z-index:50;background:#030302;color:#cbc2a8;font:12px/1.6 ui-monospace,Menlo,monospace;padding:12px 16px;white-space:pre'; document.body.appendChild(B.el); B.acc = 0; B.n = 0; B.live = 0; }
  B.acc += dt; B.n++; if (B.acc > 0.5) { B.live = B.n / B.acc; B.acc = 0; B.n = 0; }
  B.t += dt;
  if (B.i < 0 || B.t > 4.5) {
    if (B.i >= 0) {
      const f = B.frames.sort((x, y) => y - x), n = f.length, avg = n / f.reduce((a, x) => a + x, 0), low = 1 / (f[Math.floor(n * 0.05)] || 1);
      const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      B.rows.push([B.list[B.i][0], avg, low, mean(B.cpu), mean(B.dc), mean(B.tri)]);
      const v = B.list[B.i][2]; if (v) VAR[v][1]();
    }
    B.i++; B.t = 0; B.frames = []; B.cpu = []; B.dc = []; B.tri = [];
    if (B.i >= B.list.length) { B.done = true; showBench(B.rows); return; }
    pullTarget = B.list[B.i][1];
    const v = B.list[B.i][2]; if (v) VAR[v][0]();
  }
  if (B.t > 2) B.frames.push(dt);   // 2 s to arrive and settle, then 2.5 s measured
  if (B.list[B.i]) B.el.textContent = `BENCH  ${B.i + 1}/${B.list.length}  ${B.list[B.i][0].trim()}  ·  ${B.live.toFixed(0)} fps\n` + benchRows(B.rows);
}
const benchRows = (rows) => `${'scene'.padEnd(24)}  fps  worst5%  cpu ms  draws  tris(k)\n` + rows.map(([n, a, l, c, d, t]) => `${n.padEnd(24)} ${a.toFixed(0).padStart(4)}  ${l.toFixed(0).padStart(7)}  ${c.toFixed(1).padStart(6)}  ${d.toFixed(0).padStart(5)}  ${(t / 1000).toFixed(0).padStart(7)}`).join('\n');
function showBench(rows) {
  const res = renderer.getDrawingBufferSize(new THREE.Vector2());
  bench.el.textContent = `BENCH  ${res.x}×${res.y}  ${backend()}\n` + benchRows(rows);
  window.__bench = rows; console.table(rows);
}
const _gm = new THREE.Matrix4(), _gw = new THREE.Matrix4(), _gw2 = new THREE.Matrix4(), _gp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gz = new THREE.Vector3(), _gs = new THREE.Vector3();

window.__crow = { warm: () => [warmI, warmWait, pullS], cityView, jump: (v) => { pullTarget = pullS = v; }, bs, ballRT, BU, leaves, P, crow, rig, renderer, scene, camera, PU, CU, DU, ctl, modules, MOD_OBJ, modCenter, flowTotal: () => flowTotal(), pull: () => pullS, ballPhase: () => ballPhase };
