import { SND, setMuted, soundEnable, playSfx } from './sound.js';
import { leave } from './pagefx.js';
import { stageAt, STAGES } from './titles.js';

// The HUD (bottom right, a game's ammo corner): the MILK bar is the progress (a milk carton, the chapter number and
// one segment per scene, filling as you scroll); the RECORD inside the ring is the sound (spins while the music
// plays, click = on / off); the CROW is the gun — press and hold it for a second (the ring fills) and you shoot
// it: a bang, feathers, the 3D crow burns away, and the page dissolves into the 404.
// Flat cream shapes blended by difference, so they read as ink on the paper scenes and light on the dark ones.

const HOLD = 1.0;
const NS = 'http://www.w3.org/2000/svg';
const CSS = `
#hud{position:fixed;right:calc(21px*var(--k));bottom:calc(18px*var(--k));width:calc(330px*var(--k));height:calc(104px*var(--k));z-index:11;color:#f1e8d0;mix-blend-mode:difference;pointer-events:none;opacity:0;transform:translateY(8px);transition:opacity .8s ease,transform .8s ease;user-select:none;-webkit-user-select:none}
#hud.on{opacity:1;transform:none}
#hud svg{display:block;overflow:visible}
#hud .h-ring{position:absolute;right:0;top:0;width:calc(100px*var(--k));height:calc(100px*var(--k))}
#hud .h-ring circle{fill:none;stroke:currentColor}
#hud .h-rec{position:absolute;right:calc(23px*var(--k));top:calc(23px*var(--k));width:calc(54px*var(--k));height:calc(54px*var(--k));pointer-events:auto;cursor:pointer;border-radius:50%;transition:opacity .3s}
#hud .h-rec svg{width:100%;height:100%;animation:hudspin 1.8s linear infinite;animation-play-state:paused}
#hud.snd .h-rec svg{animation-play-state:running}
#hud:not(.snd) .h-rec{opacity:.45}
#hud .h-rec:hover{opacity:1}
@keyframes hudspin{to{transform:rotate(360deg)}}
#hud .h-crow{position:absolute;right:calc(116px*var(--k));top:calc(28px*var(--k));width:calc(62px*var(--k));height:calc(40px*var(--k));pointer-events:auto;cursor:pointer;touch-action:none;transform-origin:60% 70%}
#hud .h-crow svg{width:100%;height:100%}
#hud .h-crow.hold{animation:hudshake .09s linear infinite}
@keyframes hudshake{0%{transform:translate(0,0)}25%{transform:translate(.6px,-.5px)}50%{transform:translate(-.5px,.4px)}75%{transform:translate(.4px,.6px)}}
#hud .h-crow.dead{animation:none;transition:transform .7s cubic-bezier(.5,0,.9,.6),opacity .7s ease .15s;transform:translate(-6px,30px) rotate(-150deg);opacity:0}
#hud .h-tip{position:absolute;right:calc(120px*var(--k));top:calc(10px*var(--k));font:400 calc(9px*var(--k))/1 'PP Supply Mono',ui-monospace,monospace;letter-spacing:.02em;text-transform:uppercase;white-space:nowrap;opacity:0;transition:opacity .25s}
#hud .h-crow:hover~.h-tip,#hud.holding .h-tip{opacity:.85}
#hud .h-row{position:absolute;right:calc(108px*var(--k));top:calc(72px*var(--k));display:flex;align-items:center;gap:calc(8px*var(--k))}
#hud .h-milk{width:calc(11px*var(--k));height:calc(16px*var(--k))}
#hud .h-n{font:400 calc(16px*var(--k))/1 'PP Supply Mono',ui-monospace,monospace;min-width:calc(20px*var(--k));text-align:left}
#hud .h-bar{display:flex;gap:calc(2px*var(--k));width:calc(164px*var(--k));height:calc(7px*var(--k))}
#hud .h-bar i{position:relative;flex:1;background:color-mix(in srgb,currentColor 24%,transparent)}
#hud .h-bar b{position:absolute;inset:0 auto 0 0;width:0;background:currentColor}
#hud .h-feather{position:absolute;width:calc(7px*var(--k));height:calc(2.4px*var(--k));background:currentColor;border-radius:50%;left:0;top:0;transition:transform .9s cubic-bezier(.15,.7,.3,1),opacity .9s ease .2s}
#hud-flash{position:fixed;inset:0;z-index:50;background:#f1e8d0;mix-blend-mode:difference;pointer-events:none;opacity:0}
#hud-flash.go{animation:hudflash .32s ease-out}
@keyframes hudflash{0%{opacity:.95}30%{opacity:.6}100%{opacity:0}}
#gl.hud-shot{animation:hudkick .42s cubic-bezier(.2,.8,.3,1)}
@keyframes hudkick{0%{transform:translate(0,0) scale(1)}12%{transform:translate(-9px,5px) scale(1.012)}30%{transform:translate(6px,-4px) scale(1.006)}55%{transform:translate(-3px,2px)}100%{transform:none}}
`;

// a crow standing in profile (drawn facing right, flipped to face left), cream on transparent, eye + wing cut out
const CROW = `<svg viewBox="0 0 64 40"><defs><mask id="hud-cm"><rect width="64" height="40" fill="#fff"/>
<circle cx="46.4" cy="9" r="1.3" fill="#000"/><path d="M38 13.2C31 16.4 23 20 15 23.6" stroke="#000" stroke-width=".8" fill="none" stroke-linecap="round"/><path d="M51.6 11.3 58 11.9" stroke="#000" stroke-width=".55" stroke-linecap="round"/></mask></defs>
<g mask="url(#hud-cm)" transform="translate(64 0) scale(-1 1)"><path fill="currentColor" d="M63.4 12.4C59.4 9.8 55.6 8.2 51.4 7.4 49 4 43.8 3.2 40 5.4 37 7.2 35.4 9.6 33 11.4 27 14.2 18 15.6 9 19.8L1.2 24.6 3.4 27.6 12.6 25.2C16.6 28.8 23 31.2 30 30.8 37.6 30.4 43.6 25.8 45.2 19.6 46.2 16.6 48.6 14.8 52 14.4 55.8 14 59.8 13.6 63.4 12.4Z"/>
<path d="M27.6 30.4 26.6 38.4M26.6 38.4 23.4 39.4M26.6 38.4 29.2 39.6M32.6 30.2 33.6 38.2M33.6 38.2 31 39.4M33.6 38.2 36.6 39.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/></g></svg>`;
// a milk carton (gable top) with a drop on the label
const MILK = `<svg viewBox="0 0 11 16"><defs><mask id="hud-mm"><rect width="11" height="16" fill="#fff"/><path d="M5.5 8.1C4.4 9.7 3.9 10.5 3.9 11.2a1.6 1.6 0 0 0 3.2 0C7.1 10.5 6.6 9.7 5.5 8.1Z" fill="#000"/></mask></defs>
<g mask="url(#hud-mm)" fill="currentColor"><rect x="3.4" y="0" width="4.2" height="1.6"/><path d="M3.4 1.9h4.2L10.5 5.6H.5Z"/><rect x=".5" y="6" width="10" height="10"/></g></svg>`;
// a record: grooves, a sheen and the label cut out of a cream disc
const REC = `<svg viewBox="-1 -1 2 2"><defs><mask id="hud-rm"><rect x="-1" y="-1" width="2" height="2" fill="#fff"/>
<g fill="none" stroke="#000"><circle r=".88" stroke-width=".022"/><circle r=".76" stroke-width=".018"/><circle r=".64" stroke-width=".022"/><circle r=".52" stroke-width=".016"/>
<circle r=".34" stroke-width=".05"/><path d="M.18 -.84A.86 .86 0 0 1 .7 -.5" stroke-width=".07" stroke-linecap="round"/><path d="M-.2 .82A.84 .84 0 0 1 -.68 .48" stroke-width=".05" stroke-linecap="round"/></g>
<circle r=".055" fill="#000"/><rect x="-.025" y="-.27" width=".05" height=".14" fill="#000"/></mask></defs><circle r="1" fill="currentColor" mask="url(#hud-rm)"/></svg>`;

export function makeHud(P, canvas) {
  if (!document.getElementById('hud-css')) { const s = document.createElement('style'); s.id = 'hud-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.id = 'hud';
  root.innerHTML = `<div class="h-ring"></div><div class="h-rec" role="button" aria-label="Sound on / off">${REC}</div>
    <div class="h-crow" role="button" aria-label="Press and hold to shoot the crow">${CROW}</div><div class="h-tip">Press and hold</div>
    <div class="h-row"><div class="h-milk">${MILK}</div><div class="h-n">1</div><div class="h-bar">${STAGES.map(() => '<i><b></b></i>').join('')}</div></div>`;
  document.body.appendChild(root);
  const flash = document.createElement('div'); flash.id = 'hud-flash'; document.body.appendChild(flash);
  // the ring: a faint track, the gauge from the top going clockwise, a tick at 12 o'clock
  const ring = document.createElementNS(NS, 'svg'); ring.setAttribute('viewBox', '0 0 100 100');
  const R = 45, C = 2 * Math.PI * R;
  ring.innerHTML = `<circle cx="50" cy="50" r="${R}" stroke-width="7" opacity=".22"/><circle class="g" cx="50" cy="50" r="${R}" stroke-width="7" transform="rotate(-90 50 50)" stroke-dasharray="0 ${C}"/><line x1="50" y1="0" x2="50" y2="12" stroke="currentColor" stroke-width="1.6"/>`;
  root.querySelector('.h-ring').appendChild(ring);
  const gauge = ring.querySelector('.g'), crowEl = root.querySelector('.h-crow'), rec = root.querySelector('.h-rec'), num = root.querySelector('.h-n');
  const segs = [...root.querySelectorAll('.h-bar b')];

  // sound
  rec.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  rec.addEventListener('click', () => { if (!SND.enabled) { SND.muted = false; soundEnable(); } else setMuted(!SND.muted); });

  // the crow: press and hold
  let holding = false, hold = 0, dead = false, deadT = 0, left = false, lvl = 0, stage = 0;
  const stop = () => { holding = false; crowEl.classList.remove('hold'); root.classList.remove('holding'); };
  crowEl.addEventListener('pointerdown', (e) => { if (dead) return; e.stopPropagation(); e.preventDefault(); holding = true; crowEl.classList.add('hold'); root.classList.add('holding'); try { crowEl.setPointerCapture(e.pointerId); } catch (_) {} });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) crowEl.addEventListener(ev, stop);
  function kill() {
    dead = true; deadT = 0; stop();
    playSfx('shot'); setTimeout(() => playSfx('crow'), 140);
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    canvas.classList.remove('hud-shot'); void canvas.offsetWidth; canvas.classList.add('hud-shot');
    crowEl.classList.add('dead');
    // feathers out of the hit
    const r0 = root.getBoundingClientRect(), rc = crowEl.getBoundingClientRect(), x0 = rc.left - r0.left + rc.width * 0.55, y0 = rc.top - r0.top + rc.height * 0.45;
    for (let i = 0; i < 14; i++) {
      const f = document.createElement('i'); f.className = 'h-feather'; root.appendChild(f);
      f.style.transform = `translate(${x0}px,${y0}px) rotate(${Math.random() * 180}deg)`;
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 70;
      requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${x0 + Math.cos(a) * d}px,${y0 + Math.sin(a) * d * 0.7 + 25}px) rotate(${Math.random() * 720 - 360}deg)`; f.style.opacity = '0'; }));
    }
  }

  return {
    // every frame, right after the frame is drawn (so the page-dissolve snapshot has a picture)
    update(dt, pullS, total) {
      root.classList.toggle('on', !window.__loaderHold && P.hudOn !== 0);
      root.style.display = P.hudOn === 0 ? 'none' : '';
      root.classList.toggle('snd', SND.enabled && !SND.muted);
      // progress: chapter number + one segment per scene
      const st = stageAt(Math.max(0, pullS), P); if (st >= 0) stage = st;
      num.textContent = String(stage + 1);
      const p = Math.min(1, Math.max(0, pullS / Math.max(0.001, total))) * segs.length;
      for (let i = 0; i < segs.length; i++) segs[i].style.width = `${Math.min(1, Math.max(0, p - i)) * 100}%`;
      // the ring: the hold to shoot; otherwise a quiet pulse while the record plays
      if (holding && !dead) { hold += dt / HOLD; if (hold >= 1) { hold = 1; kill(); } }
      else if (!dead) hold = Math.max(0, hold - dt * 2.5);
      const want = SND.enabled && !SND.muted ? 0.12 + 0.04 * Math.sin(performance.now() / 300) : 0;
      lvl += (want - lvl) * Math.min(1, dt * 4);
      const g = dead ? 1 : Math.max(hold, lvl);
      gauge.setAttribute('stroke-dasharray', `${(g * C).toFixed(2)} ${C}`);
      if (dead) {
        deadT += dt;
        P.dissolve = Math.min(1, deadT / 0.8);   // the 3D crow burns away (main.js takes the max with its own dissolve)
        if (deadT > 0.9 && !left) { left = true; leave('/404', canvas); }
      }
    },
  };
}
