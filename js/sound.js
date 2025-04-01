import * as THREE from 'three';

// Sound: background music + a click sound for whatever is under the cursor (wood knocks, water plops, the crow
// caws, cars beep …). Browsers only allow audio after a real click / key press, so everything starts on the first
// gesture (the cursor label says so until then). The click sounds are SYNTHESISED with WebAudio — no files to
// download. A real recording can replace any of them: drop assets/sfx/<kind>.mp3 (e.g. crow.mp3) and set
// "Use sample files" in the console; the synth stays the fallback.
export const SND = { enabled: false, muted: false };
let P = null, ctx = null, master = null, noiseBuf = null, music = null, musicFade = 0, analyser = null, waveBuf = null;
const samples = {};

export function initSound(params) {
  P = params;
  if (SND.enabled) apply();
  const start = () => { if (!SND.enabled) enable(); else if (!SND.muted && music && music.paused) apply(); };   // (a page that switched sound on before any click: the first gesture lets it play)
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && !e.metaKey && !e.ctrlKey) { SND.muted = !SND.muted; apply(); } });
  document.addEventListener('visibilitychange', () => { if (!music) return; if (document.hidden) music.pause(); else if (P.musicOn && !SND.muted) music.play().catch(() => {}); });
}
function enable() {
  SND.enabled = true;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.connect(ctx.destination); } catch { ctx = null; }
  if (ctx) { const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
  // music streams (64 kbit/s AAC, ~4 MB for 8 min — only fetched once sound is on)
  music = new Audio(); music.src = 'assets/audio/music.m4a'; music.loop = true; music.preload = 'auto'; music.volume = 0;
  // the track carries on across the site's pages (home ↔ 404) from where it was, instead of starting over
  try { const t0 = +sessionStorage.getItem('crow-snd-t') || 0; if (t0 > 0) music.currentTime = t0; } catch (e) {}
  addEventListener('pagehide', () => { try { sessionStorage.setItem('crow-snd-t', String(music.currentTime || 0)); } catch (e) {} });
  // the music also feeds an analyser: the sound badge above the carton draws its live waveform
  if (ctx) { try { const src = ctx.createMediaElementSource(music); analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.6; src.connect(analyser); buildSpace(src, analyser); waveBuf = new Float32Array(analyser.fftSize); } catch { analyser = null; } }
  SND.enabledAt = performance.now();
  apply();
}
// ---- the room the music plays in: the source runs through a lowpass (walls), a chorus (moving water) and a
// reverb (the church hall); every scene sets its own mix and the chain glides between them over a second or two
let SP = null, spaceName = 'lake';
const SPACES = {
  lake:   { lp: 5200, q: 0.5, wet: 0.16, dry: 0.95, cho: 0.45, depth: 0.0035, rate: 0.23 },   // by the water: soft top, a slow wavering shimmer, a little open air
  church: { lp: 850,  q: 0.9, wet: 0.55, dry: 0.62, cho: 0,    depth: 0.001,  rate: 0.2 },   // closed stone hall: muffled, long echo
  street: { lp: 20000, q: 0.5, wet: 0,   dry: 1,    cho: 0,    depth: 0.001,  rate: 0.2 },   // just the music
  sky:    { lp: 20000, q: 0.5, wet: 0,   dry: 1,    cho: 0,    depth: 0.001,  rate: 0.2 },
};
function hall(sec = 3.2) {   // stereo impulse: dense noise with an exponential tail and a darker end
  const n = Math.round(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 3.2); } }
  return b;
}
function buildSpace(src, out) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
  const dry = ctx.createGain(), wet = ctx.createGain(), cho = ctx.createGain(); dry.gain.value = 1; wet.gain.value = 0; cho.gain.value = 0;
  const rev = ctx.createConvolver(); rev.buffer = hall();
  const dl = ctx.createDelay(0.05); dl.delayTime.value = 0.012; const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.23; lfoG.gain.value = 0.0035; lfo.connect(lfoG); lfoG.connect(dl.delayTime); lfo.start();
  src.connect(lp); lp.connect(dry); lp.connect(rev); rev.connect(wet); lp.connect(dl); dl.connect(cho);
  for (const g of [dry, wet, cho]) g.connect(out);
  out.connect(ctx.destination);
  SP = { lp, dry, wet, cho, lfo, lfoG };
}
export function setSoundSpace(name) {
  if (!SP || !SPACES[name] || name === spaceName && SP.set) return;
  spaceName = name; SP.set = true; const s = SPACES[name], t = ctx.currentTime, k = 0.6;   // ~2 s glide
  SP.lp.frequency.setTargetAtTime(s.lp, t, k); SP.lp.Q.setTargetAtTime(s.q, t, k);
  SP.dry.gain.setTargetAtTime(s.dry, t, k); SP.wet.gain.setTargetAtTime(s.wet, t, k); SP.cho.gain.setTargetAtTime(s.cho, t, k);
  SP.lfoG.gain.setTargetAtTime(s.depth, t, k); SP.lfo.frequency.setTargetAtTime(s.rate, t, k);
}
export function setMuted(v) { SND.muted = !!v; apply(); }
export const soundEnable = () => { if (!SND.enabled) enable(); };
// live waveform of the music (−1…1 samples) or null when silent
export function musicWave() { if (!analyser || !music || music.paused || SND.muted) return null; analyser.getFloatTimeDomainData(waveBuf); return waveBuf; }
export const musicLevel = () => musicFade;
export function apply() {   // (also before initSound: the loader's sound choice switches the engine on first)
  if (!SND.enabled) return;
  try { sessionStorage.setItem('crow-snd', SND.muted ? '0' : '1'); } catch (e) {}   // remembered for this tab (coming back from the 404 skips the loader)
  if (master) master.gain.value = SND.muted || (P && !P.sfxOn) ? 0 : P ? P.sfxVol : 0.8;
  if (music) { if ((!P || P.musicOn) && !SND.muted) { ctx && ctx.state === 'suspended' && ctx.resume(); music.play().catch(() => {}); } else music.pause(); }
}
// called every frame: music fade-in / volume
export function stepSound(dt) {
  if (!music || !P) return;
  const want = P.musicOn && !SND.muted ? P.musicVol : 0;
  musicFade += (want - musicFade) * (1 - Math.exp(-dt * 0.9));   // slow swell on first start
  music.volume = THREE.MathUtils.clamp(musicFade, 0, 1);
}

// ------------------------------------------------------------------ synth kit
const t0 = () => ctx.currentTime + 0.005;
const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
const osc = (type, f, t, dur, out) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.connect(out); o.start(t); o.stop(t + dur + 0.05); return o; };
const noise = (t, dur, out) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05); return s; };
const filt = (type, f, Q, out) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.connect(out); return b; };
const gain = (out, v = 1) => { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g; };
const r = (a, b) => a + Math.random() * (b - a);

const KIT = {
  crow(t) {   // two hoarse caws
    for (let k = 0; k < 2; k++) {
      const s = t + k * 0.36, f = r(560, 640) * (k ? 0.92 : 1);
      const g = gain(master); env(g, s, 0.015, 0.5, 0.26);
      const sh = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 4); } sh.curve = c; sh.connect(g);
      const b1 = filt('bandpass', 1300, 2.5, sh), b2 = filt('bandpass', 2600, 3, sh);
      const o = osc('sawtooth', f, s, 0.3, b1); o.connect(b2); o.frequency.exponentialRampToValueAtTime(f * 0.68, s + 0.28);
      const lfo = osc('sine', 38, s, 0.3, gain(o.frequency, 18));
      const n = noise(s, 0.3, filt('bandpass', 1800, 1, gain(g, 0.25)));
    }
  },
  water(t) {   // a splash and a few bubbles
    const g = gain(master); env(g, t, 0.005, 0.35, 0.25); noise(t, 0.3, filt('lowpass', 1400, 0.7, g));
    for (let k = 0; k < 5; k++) { const s = t + r(0.02, 0.35), f = r(260, 520); const gb = gain(master); env(gb, s, 0.004, 0.3, 0.07); const o = osc('sine', f, s, 0.1, gb); o.frequency.exponentialRampToValueAtTime(f * r(2.5, 4), s + 0.06); }
  },
  wood(t, n = 2, f = 900) {   // knocks
    for (let k = 0; k < n; k++) { const s = t + k * 0.16; const g = gain(master); env(g, s, 0.002, 0.7, 0.12); noise(s, 0.05, filt('bandpass', f * r(0.95, 1.05), 7, g)); const g2 = gain(master); env(g2, s, 0.002, 0.35, 0.14); osc('sine', f * 0.24, s, 0.16, g2); }
  },
  door(t) { KIT.wood(t, 3, 520); },
  stone(t) { const g = gain(master); env(g, t, 0.003, 0.6, 0.16); const o = osc('sine', 120, t, 0.2, g); o.frequency.exponentialRampToValueAtTime(55, t + 0.15); const g2 = gain(master); env(g2, t, 0.002, 0.25, 0.06); noise(t, 0.08, filt('lowpass', 900, 0.5, g2)); },
  leaves(t, hp = 2500, dur = 0.45) { const g = gain(master); g.gain.setValueAtTime(0.0001, t); for (let i = 0; i <= 10; i++) g.gain.linearRampToValueAtTime(r(0.05, 0.3) * (1 - i / 10), t + dur * i / 10); noise(t, dur, filt('highpass', hp, 0.7, g)); },
  grass(t) { KIT.leaves(t, 1400, 0.35); },
  glass(t) { const f = r(1300, 1700); [1, 2.76, 5.4, 8.9].forEach((m, i) => { const g = gain(master); env(g, t, 0.002, 0.22 / (i + 1), 1.6 / (i * 0.6 + 1)); osc('sine', f * m, t, 1.8, g); }); },
  metal(t) { const f = r(700, 900); [1, 2.32, 3.9, 5.1].forEach((m, i) => { const g = gain(master); env(g, t, 0.002, 0.2 / (i + 1), 0.9); osc('sine', f * m, t, 1, g); }); },
  car(t) { for (let k = 0; k < 2; k++) { const s = t + k * 0.2; const g = gain(master); g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.18, s + 0.01); g.gain.setValueAtTime(0.18, s + 0.12); g.gain.linearRampToValueAtTime(0.0001, s + 0.14); const lp = filt('lowpass', 2200, 0.7, g); osc('square', 440, s, 0.15, lp); osc('square', 554, s, 0.15, lp); } },
  ship(t) { const g = gain(master); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25); g.gain.linearRampToValueAtTime(0.3, t + 1.1); g.gain.linearRampToValueAtTime(0.0001, t + 1.6); const lp = filt('lowpass', 500, 1, g); osc('sawtooth', 98, t, 1.7, lp); osc('sawtooth', 147, t, 1.7, gain(lp, 0.6)); },
  pumpkin(t) { const g = gain(master); env(g, t, 0.003, 0.6, 0.25); const o = osc('sine', 190, t, 0.3, g); o.frequency.exponentialRampToValueAtTime(120, t + 0.2); const g2 = gain(master); env(g2, t, 0.002, 0.3, 0.1); noise(t, 0.1, filt('bandpass', 420, 3, g2)); },
  ghost(t) { const g = gain(master); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.4); const o = osc('sine', 330, t, 1.5, filt('lowpass', 1500, 1, g)); o.frequency.linearRampToValueAtTime(520, t + 0.6); o.frequency.linearRampToValueAtTime(300, t + 1.4); osc('sine', 5.5, t, 1.5, gain(o.frequency, 14)); },
  paper(t) { const g = gain(master); env(g, t, 0.02, 0.3, 0.22); const b = filt('bandpass', 3000, 1.5, g); b.frequency.exponentialRampToValueAtTime(900, t + 0.25); noise(t, 0.3, b); },
  cloud(t) { const g = gain(master); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.3); g.gain.linearRampToValueAtTime(0.0001, t + 1.1); const b = filt('lowpass', 300, 1, g); b.frequency.exponentialRampToValueAtTime(1600, t + 0.5); b.frequency.exponentialRampToValueAtTime(250, t + 1.1); noise(t, 1.2, b); },
  planet(t) { const g = gain(master); env(g, t, 0.01, 0.7, 1.6); const o = osc('sine', 62, t, 1.8, g); o.frequency.exponentialRampToValueAtTime(38, t + 1.5); const g2 = gain(master); env(g2, t, 0.01, 0.3, 0.8); noise(t, 0.9, filt('lowpass', 220, 0.7, g2)); },
  atom(t) { for (let k = 0; k < 3; k++) { const s = t + k * 0.07; const g = gain(master); env(g, s, 0.003, 0.2, 0.12); const o = osc('sine', 880 * (1 + k * 0.5), s, 0.15, g); o.frequency.exponentialRampToValueAtTime(1760 * (1 + k * 0.5), s + 0.1); } },
  cell(t) { const g = gain(master); env(g, t, 0.01, 0.45, 0.35); const lp = filt('lowpass', 700, 6, g); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1400, t + 0.12); lp.frequency.exponentialRampToValueAtTime(250, t + 0.35); const o = osc('triangle', 260, t, 0.4, lp); o.frequency.exponentialRampToValueAtTime(140, t + 0.35); },
  hill(t) { KIT.stone(t); KIT.grass(t + 0.02); },
  portal(t) { const g = gain(master); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 1.2); [1, 1.5, 2.01].forEach((m) => { const o = osc('sine', 330 * m, t, 1.3, g); o.frequency.exponentialRampToValueAtTime(660 * m, t + 1.1); }); },
  notify(t) {   // module found: two quick bright blips and a soft digital tail
    [[1320, 0], [1980, 0.075]].forEach(([f, d]) => { const g = gain(master); env(g, t + d, 0.002, 0.22, 0.09); osc('square', f, t + d, 0.1, filt('lowpass', 4200, 0.8, g)); osc('sine', f * 2, t + d, 0.08, gain(g, 0.3)); });
    const g = gain(master); env(g, t + 0.15, 0.004, 0.1, 0.25); osc('sine', 2640, t + 0.15, 0.3, g);
  },
  victory(t) {   // the last module collected: the same bright square blips, now climbing a major arpeggio, then a held chord that shimmers out
    [659, 831, 988, 1319, 1661].forEach((f, i) => { const d = i * 0.07, g = gain(master); env(g, t + d, 0.002, 0.2, 0.1); osc('square', f, t + d, 0.12, filt('lowpass', 4200, 0.8, g)); osc('sine', f * 2, t + d, 0.1, gain(g, 0.3)); });
    const c = t + 0.38;
    [1319, 1661, 1976].forEach((f, i) => {
      const g = gain(master); g.gain.setValueAtTime(0.0001, c); g.gain.exponentialRampToValueAtTime(0.1 - i * 0.02, c + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c + 1.3);
      const o = osc('square', f, c, 1.35, filt('lowpass', 3200, 0.7, g)); osc('sine', 6, c, 1.35, gain(o.frequency, f * 0.004));   // a slight shimmer
      osc('sine', f * 2, c, 1.35, gain(g, 0.25));
    });
    [0, 0.12, 0.24].forEach((d) => { const g = gain(master); env(g, c + 0.1 + d, 0.003, 0.06, 0.3); osc('sine', 3951, c + 0.1 + d, 0.35, g); });   // the digital sparkle tail
  },
  tape(t) {   // a strip pressed down: the sticky crackle of it being smoothed on, then a soft pat
    for (let k = 0; k < 9; k++) { const s = t + k * 0.022 + r(0, 0.012), g = gain(master); env(g, s, 0.001, 0.18 * r(0.5, 1), 0.012); noise(s, 0.02, filt('bandpass', r(2200, 4200), 2.5, g)); }
    const g = gain(master); env(g, t + 0.22, 0.002, 0.3, 0.07); const lp = filt('lowpass', 700, 0.7, g); noise(t + 0.22, 0.09, lp); const o = osc('sine', 140, t + 0.22, 0.08, gain(g, 0.6)); o.frequency.exponentialRampToValueAtTime(80, t + 0.3);
  },
  shot(t) {   // the HUD crow is shot: a hard crack, a low boom under it and a short tail off the walls
    const g = gain(master); env(g, t, 0.001, 1.0, 0.18); const lp = filt('lowpass', 6000, 0.7, g); lp.frequency.setValueAtTime(6000, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.16); noise(t, 0.2, lp);
    const gb = gain(master); env(gb, t, 0.002, 0.9, 0.32); const o = osc('sine', 120, t, 0.36, gb); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const gt = gain(master); gt.gain.setValueAtTime(0.0001, t + 0.05); gt.gain.exponentialRampToValueAtTime(0.16, t + 0.08); gt.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); noise(t + 0.05, 0.9, filt('bandpass', 700, 0.8, gt));
  },
  tap(t) { const g = gain(master); env(g, t, 0.001, 0.2, 0.03); noise(t, 0.04, filt('highpass', 3000, 0.7, g)); },
};
export const SFX_KINDS = Object.keys(KIT);

export function playSfx(kind) {
  if (!ctx || !P || !P.sfxOn || SND.muted) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (!KIT[kind]) kind = 'tap';
  if (P.sfxSamples) {   // optional recordings in assets/sfx/<kind>.mp3
    const s = samples[kind];
    if (s === undefined) { samples[kind] = null; fetch(`assets/sfx/${kind}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => ctx.decodeAudioData(b)).then((buf) => { samples[kind] = buf; }).catch(() => { samples[kind] = false; }); }
    else if (s) { const src = ctx.createBufferSource(); src.buffer = s; src.playbackRate.value = r(0.94, 1.06); src.connect(master); src.start(); return; }
  }
  KIT[kind](t0());
}

// what kind of thing a raycast hit is: object tag → material tag → parents → the scene's default
export function sfxOf(hit, fallback = 'tap') {
  let o = hit && hit.object;
  if (!o) return fallback;
  const m = Array.isArray(o.material) ? o.material[hit.face ? hit.face.materialIndex : 0] : o.material;
  if (m && m.userData && m.userData.sfx) return m.userData.sfx;
  while (o) { if (o.userData && o.userData.sfx) return o.userData.sfx; o = o.parent; }
  return fallback;
}
// tag a material dictionary: { key: kind }
export const tagSfx = (M, map) => { for (const k in map) if (M[k]) M[k].userData.sfx = map[k]; };
