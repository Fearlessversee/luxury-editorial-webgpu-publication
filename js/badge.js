// Sound on / off badge (sits above the milk carton, click = mute / unmute). 20 looks, all in ink on transparent,
// each with a moving "on" state driven by the music (live waveform + a spectrum made from it) and a still "off"
// state. Drawn on a small 2D canvas every frame; titles.js shows it as a texture in the WebGPU overlay.
export const BADGE_STYLES = ['Equalizer', 'Scope line', 'Mirror blob', 'Dot matrix', 'Wobble ring', 'Sun rays', 'Stairs', 'Heartbeat',
  'Vinyl', 'Speaker cone', 'Knob', 'Tape reels', 'LED meter', 'Jumping letters', 'Bouncing ball', 'Spiral', 'Hatching', 'History',
  'Lissajous', 'Morse'];

const TAU = Math.PI * 2;
const hist = new Float32Array(64); let histT = 0;
const spec = new Float32Array(24);

// a crude spectrum from the waveform (band energies of differences at several scales), smoothed
function bands(w, dt) {
  const n = spec.length;
  for (let b = 0; b < n; b++) {
    let e = 0; const step = 1 + Math.floor((b / n) ** 2 * 60), L = w ? w.length : 0;
    for (let i = step; i < L; i += 3) e += Math.abs(w[i] - w[i - step]);
    e = L ? Math.min(1, (e / (L / 3)) * (1.4 + b * 0.05)) : 0;
    spec[b] += (e - spec[b]) * Math.min(1, dt * (e > spec[b] ? 25 : 6));
  }
  return spec;
}

export function drawBadge(g, W, H, style, on, wave, level, t, dt, ink, font) {
  g.clearRect(0, 0, W, H); g.fillStyle = g.strokeStyle = ink; g.lineWidth = 1.2; g.lineCap = 'round'; g.lineJoin = 'round';
  const cy = H / 2, k = on ? Math.max(0.05, level) : 0;
  const s = bands(on ? wave : null, dt);
  const amp = (i, n) => { if (!on) return 0; if (wave) return wave[Math.floor(i / n * (wave.length - 1))] * 2.2; return Math.sin(i / n * 18 + t * 7) * 0.35 * Math.sin(t * 1.3 + i * 0.05); };
  const rms = on ? (wave ? Math.min(1, Math.sqrt(wave.reduce((a, v) => a + v * v, 0) / wave.length) * 5) : 0.4 + 0.3 * Math.sin(t * 3)) : 0;
  histT += dt; if (histT > 0.05) { histT = 0; hist.copyWithin(0, 1); hist[hist.length - 1] = rms; }
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  switch (style) {
    case 'Equalizer': { const n = 12, bw = W / n; for (let i = 0; i < n; i++) { const h = on ? Math.max(1.5, s[i * 2] * (H - 2)) : 1.5; g.fillRect(i * bw + bw * 0.2, H - 1 - h, bw * 0.6, h); } break; }
    case 'Scope line': { const pts = []; for (let i = 0; i <= 64; i++) pts.push([i / 64 * W, cy - amp(i, 64) * cy * 0.9]); line(pts); break; }
    case 'Mirror blob': { g.beginPath(); for (let i = 0; i <= 48; i++) g.lineTo(i / 48 * W, cy - Math.abs(amp(i, 48)) * cy * 0.9 - 0.6); for (let i = 48; i >= 0; i--) g.lineTo(i / 48 * W, cy + Math.abs(amp(i, 48)) * cy * 0.9 + 0.6); g.fill(); break; }
    case 'Dot matrix': { const cols = 12, rows = 5; for (let c = 0; c < cols; c++) { const lit = on ? Math.round(s[c * 2] * rows) : 0; for (let r = 0; r < rows; r++) { const x = (c + 0.5) * W / cols, y = H - (r + 0.5) * H / rows; g.beginPath(); g.arc(x, y, r < lit ? 1.5 : 0.5, 0, TAU); g.fill(); } } break; }
    case 'Wobble ring': { const R = H * 0.34, pts = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * TAU, rr = R + amp(i % 80, 80) * H * 0.18; pts.push([W / 2 + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } line(pts); break; }
    case 'Sun rays': { const n = 16; g.beginPath(); g.arc(W / 2, cy, 2, 0, TAU); g.fill(); if (on) for (let i = 0; i < n; i++) { const a = i / n * TAU + t * 0.4, r0 = 4, r1 = 4 + s[i % s.length] * H * 0.45; line([[W / 2 + Math.cos(a) * r0, cy + Math.sin(a) * r0], [W / 2 + Math.cos(a) * r1, cy + Math.sin(a) * r1]]); } break; }
    case 'Stairs': { const n = 14, pts = []; for (let i = 0; i < n; i++) { const y = cy - Math.round(amp(i * 4, n * 4) * 3) / 3 * cy * 0.8; pts.push([i / n * W, y], [(i + 1) / n * W, y]); } line(pts); break; }
    case 'Heartbeat': { const pts = []; for (let i = 0; i <= 60; i++) { const x = i / 60 * W, ph = (i / 60 * 2 + t * (on ? 0.8 : 0)) % 1; let y = cy; if (on) { const q = ph * 10; if (q > 4 && q < 4.5) y -= (q - 4) * 2 * cy * 0.9 * (0.4 + rms); else if (q >= 4.5 && q < 5.2) y += (Math.sin((q - 4.5) / 0.7 * Math.PI)) * cy * 0.7 * (0.4 + rms); } pts.push([x, y]); } line(pts); break; }
    case 'Vinyl': {   // a record seen at an angle: thick disc, grooves, label, spindle; sheen sweeps round while it plays
      const cx = W / 2, R = Math.min(W * 0.46, H * 0.95), ry = R * 0.42, cyD = cy - 1.2, th = Math.max(1.5, R * 0.09), rot = on ? t * 3.2 : 0.6;
      const ell = (r, y = cyD) => { g.beginPath(); g.ellipse(cx, y, r, r * 0.42, 0, 0, TAU); };
      ell(R, cyD + th); g.fill(); g.fillRect(cx - R, cyD, R * 2, th); ell(R); g.fill();          // thickness + top face
      g.save(); g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 0.55; for (let i = 0; i < 5; i++) { const r = R * (0.88 - i * 0.1); g.globalAlpha = 0.55; ell(r); g.stroke(); }   // grooves
      g.globalAlpha = 0.45;                                                                                        // two sheen wedges (3D gloss), turning
      for (const off of [0, Math.PI]) { g.beginPath(); g.moveTo(cx, cyD); g.ellipse(cx, cyD, R * 0.92, ry * 0.92, 0, rot + off, rot + off + 0.45); g.closePath(); g.fill(); }
      g.globalAlpha = 1; ell(R * 0.34); g.fill(); g.restore();                                                     // label (paper shows through)
      g.lineWidth = 0.8; ell(R * 0.34); g.stroke();
      g.save(); g.beginPath(); g.ellipse(cx, cyD, R * 0.34, R * 0.34 * 0.42, 0, 0, TAU); g.clip(); g.lineWidth = 1.1;   // printed mark on the label, turning with it
      g.beginPath(); g.moveTo(cx + Math.cos(rot) * R * 0.1, cyD + Math.sin(rot) * R * 0.1 * 0.42); g.lineTo(cx + Math.cos(rot) * R * 0.28, cyD + Math.sin(rot) * R * 0.28 * 0.42); g.stroke(); g.restore();
      g.beginPath(); g.ellipse(cx, cyD, 1.3, 0.8, 0, 0, TAU); g.fill();                                          // spindle hole
      break; }
    case 'Speaker cone': { const cx = W / 2; for (const f of [0.18, 0.3, 0.44]) { g.beginPath(); g.arc(cx, cy, H * (f + (on ? rms * 0.06 * Math.sin(t * 30 + f * 9) : 0)), 0, TAU); g.stroke(); } if (!on) { line([[cx - H * 0.5, cy - H * 0.45], [cx + H * 0.5, cy + H * 0.45]]); } break; }
    case 'Knob': { const cx = W / 2, R = H * 0.38; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke(); const a = -Math.PI * 1.25 + (on ? 0.3 + rms * 2.2 : 0) ; line([[cx, cy], [cx + Math.cos(a) * R, cy + Math.sin(a) * R]]); for (let i = 0; i <= 8; i++) { const b = -Math.PI * 1.25 + i / 8 * Math.PI * 1.5; line([[cx + Math.cos(b) * (R + 2), cy + Math.sin(b) * (R + 2)], [cx + Math.cos(b) * (R + 4), cy + Math.sin(b) * (R + 4)]]); } break; }
    case 'Tape reels': { const R = H * 0.3, a = on ? t * 4 : 0; for (const x of [W * 0.3, W * 0.7]) { g.beginPath(); g.arc(x, cy - 2, R, 0, TAU); g.stroke(); for (let i = 0; i < 3; i++) { const b = a + i * TAU / 3; line([[x, cy - 2], [x + Math.cos(b) * R * 0.8, cy - 2 + Math.sin(b) * R * 0.8]]); } } line([[W * 0.3, cy - 2 + R], [W * 0.2, H - 1.5], [W * 0.8, H - 1.5], [W * 0.7, cy - 2 + R]]); break; }
    case 'LED meter': { const n = 10, lit = on ? Math.round(rms * n) : 0, w = W / n; for (let i = 0; i < n; i++) { if (i < lit) g.fillRect(i * w + 1, cy - 4, w - 2, 8); else g.strokeRect(i * w + 1.5, cy - 3.5, w - 3, 7); } break; }
    case 'Jumping letters': { const txt = on ? 'SOUND ON' : 'SOUND OFF'; let fs = H * 0.6; g.font = `${fs}px "${font}"`; const tw = g.measureText(txt).width + txt.length * 0.5; if (tw > W - 4) { fs *= (W - 4) / tw; g.font = `${fs}px "${font}"`; } g.textBaseline = 'middle'; let x = 2; for (let i = 0; i < txt.length; i++) { const ch = txt[i], dy = on ? -Math.abs(Math.sin(t * 8 + i * 0.7)) * s[i % s.length] * H * 0.35 : 0; g.fillText(ch, x, cy + dy + 1); x += g.measureText(ch).width + 0.5; } break; }
    case 'Bouncing ball': { line([[0, H - 2], [W, H - 2]]); const x = on ? (t * 18) % W : W / 2, bounce = on ? Math.abs(Math.sin(t * 6)) * (H - 8) * (0.3 + rms) : 0; g.beginPath(); g.arc(x, H - 5 - bounce, 3, 0, TAU); g.fill(); break; }
    case 'Spiral': { const pts = []; for (let i = 0; i <= 160; i++) { const a = i / 160 * TAU * 3.5 + t * (on ? 2 : 0), r = i / 160 * H * 0.45 * (on ? 0.8 + amp(i, 160) * 0.35 : 0.55); pts.push([W / 2 + Math.cos(a) * r, cy + Math.sin(a) * r]); } line(pts); break; }
    case 'Hatching': { const gap = on ? 3 + (1 - rms) * 6 : 10; g.save(); g.beginPath(); g.rect(0, 2, W, H - 4); g.clip(); for (let x = -H + ((on ? t * 20 : 0) % gap); x < W + H; x += gap) line([[x, H], [x + H, 0]]); g.restore(); g.strokeRect(0.5, 2.5, W - 1, H - 5); break; }
    case 'History': { const n = hist.length, w = W / n; for (let i = 0; i < n; i++) { const h = Math.max(0.6, hist[i] * cy * 0.95); g.fillRect(i * w, cy - h, Math.max(1, w - 0.6), h * 2); } break; }
    case 'Lissajous': { if (!on) { g.beginPath(); g.arc(W / 2, cy, 1.8, 0, TAU); g.fill(); break; } const pts = []; const L = wave ? wave.length : 256; for (let i = 0; i < 200; i++) { const a = wave ? wave[i * 2 % L] : Math.sin(i * 0.2 + t * 5) * 0.3, b = wave ? wave[(i * 2 + 37) % L] : Math.cos(i * 0.31 + t * 4) * 0.3; pts.push([W / 2 + a * W * 0.9, cy + b * H * 1.4]); } line(pts); break; }
    case 'Morse': { let x = 1; for (let i = 0; i < 12 && x < W; i++) { const v = on ? s[i * 2 % s.length] : (i % 3 === 0 ? 0.8 : 0.2); const len = v > 0.45 ? 7 : 2.5; g.fillRect(x, cy - 1.5, len, 3); x += len + 3; } break; }
  }
}
