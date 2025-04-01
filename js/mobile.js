import * as THREE from 'three';
import { makeTitles } from './titles.js';
import { DEF } from './params.js';

// The phone page (Figma "SHOTS | 2026" 15434:1150). The experience is built for desktop, so a phone gets its
// first scene only: the crow by the lake as a seamless looping video (rendered from the real scene — nothing heavy
// runs on the phone), the site's own sticker title stuck on over it (titles.js, same stickers / tape / animation),
// and the bar at the bottom that says why.

const root = document.createElement('div'); root.id = 'mob';
root.innerHTML = `
<video id="mob-v" autoplay muted loop playsinline preload="auto" poster="assets/video/crow-mobile.jpg" aria-hidden="true">
  <source src="assets/video/crow-mobile.mp4" type="video/mp4"></video>
<canvas id="mob-t"></canvas>
<div id="mob-bar"><span class="mob-ico"><img src="assets/ui/mobile-crow.jpg" alt=""></span><span class="mob-tx"><span class="mob-dim">Sorry</span><span>the experience is built for desktop devices</span></span></div>`;
document.body.appendChild(root);
const v = root.querySelector('#mob-v');
v.play && v.play().catch(() => {});   // (some phones need a nudge; muted + playsinline is allowed to autoplay)

// the title: the home page's first sticker title, sized and placed like the Figma phone frame
const R = new THREE.WebGPURenderer({ canvas: root.querySelector('#mob-t'), antialias: true, alpha: true, forceWebGL: true });
await R.init();
R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.setClearColor(0x000000, 0); R.toneMapping = THREE.NoToneMapping; R.outputColorSpace = THREE.LinearSRGBColorSpace;
// S = W / 1920 · titleScale; the phone frame (402 wide) has the sticker lines ~0.78 of the desktop size
const titles = makeTitles(R, { ...DEF, titleScale: (0.78 * 1920) / 402, titlePos0: 'mobile', logoOn: 1, canOn: 0, fdOn: 0, tagOn: 0, sndOn: 0, cornersOn: 0, navOn: 0 });
const fit = () => R.setSize(innerWidth, innerHeight, false);
fit(); addEventListener('resize', fit);
let last = performance.now(), T = 0, acc = 0;
R.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; acc += dt;
  if (acc < 1 / 30) return;   // 30 fps is plenty for stickers (battery)
  T += acc; const step = acc; acc = 0;
  R.setRenderTarget(null); R.clear();
  titles.render(step, 0.5, 1, 0, T);
});
document.documentElement.classList.add('mob-live');
