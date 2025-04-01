import { DEFS, TABS, DEF, LOOKS } from './params.js';

// ---------------------------------------------------------------- icons (24px stroke glyphs)
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  Titles: I('<path d="M4 6h16M4 12h11M4 18h7"/>'),
  Bird: I('<path d="M3 13c2.5 0 4-1.5 5.5-4 1.2-2 2.8-3 4.5-3 1.8 0 3 1 3.5 2.5l2.5 1-2.5 1c-.3 3.5-3 6.5-7.5 6.5-2 0-4-.6-5.5-2"/><path d="M8 16l-4 4M13 16.5L12 21"/><circle cx="15.3" cy="8.3" r=".6" fill="currentColor"/>'),
  Environment: I('<path d="M2 20l6-9 4 5 3-4 7 8z"/><path d="M12 20c0-3 1-6 3-8M7 20c0-2 .5-4 2-6"/><circle cx="17" cy="5" r="2"/>'),
  Camera: I('<path d="M3 8h12v10H3z"/><path d="M15 11l6-3v10l-6-3"/><circle cx="7" cy="5" r="2"/><circle cx="12" cy="5" r="2"/>'),
  Light: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  Physics: I('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>'),
  Shader: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  Color: I('<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>'),
  Dust: I('<circle cx="6" cy="7" r="1.2"/><circle cx="15" cy="5" r="1"/><circle cx="18" cy="12" r="1.5"/><circle cx="9" cy="14" r="1.8"/><circle cx="14" cy="19" r="1"/><circle cx="5" cy="19" r=".8"/>'),
  Lens: I('<circle cx="12" cy="12" r="9"/><path d="M12 3l3.5 6M21 12h-7M16.5 19.8L13 14M7.5 19.8L11 14M3 12h7M7.5 4.2L11 10"/>'),
  Material: I('<circle cx="12" cy="12" r="9"/><path d="M8 8.5a5 5 0 0 1 5-2"/>'),
  Film: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>'),
  Project: I('<rect x="2" y="8" width="13" height="9" rx="2"/><circle cx="8.5" cy="12.5" r="2.5"/><path d="M15 11l6-3v9l-6-3"/>'),
  Rays: I('<circle cx="12" cy="6" r="2"/><path d="M12 10v11M9 9.5L4 21M15 9.5L20 21M10.5 10L8 21M13.5 10L16 21"/>'),
  Grade: I('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  Render: I('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  Rig: I('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7.5 7.5l9 9"/><circle cx="18" cy="6" r="1.5"/><path d="M16.8 7.2L13 11"/>'),
};
const UI = {
  undo: I('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: I('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  ab: I('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  fs: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  min: I('<path d="M5 12h14"/>'),
  neg: I('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>'),
  cam: I('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  chev: I('<path d="M6 9l6 6 6-6"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  paste: I('<path d="M9 4h6v3H9z"/><path d="M15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'),
  ok: I('<path d="M5 12l5 5 9-10"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
};
const TAB_LABEL = { Titles: 'Титри', Bird: 'Птах', Environment: 'Оточення', Camera: 'Камера', Light: 'Світло', Physics: 'Фізика', Shader: 'Шейдери', Color: 'Колір', Dust: 'Пил', Lens: 'Лінза', Material: 'Матеріали', Film: 'Плівка', Project: 'Проєктор', Rays: 'God rays', Grade: 'Грейдинг', Render: 'Якість', Rig: 'Риг' };
const HINTS = {
  Bird: 'Усе для ворони: поза, світло, колір, матеріал, шейдери, грейдинг. Діє тільки на птаха.',
  Environment: 'Фон, гілки, пил, листя — власне світло і власний грейдинг, птаха не чіпають.',
  Camera: 'Скрол — камера віддаляється до озера й пагорбів (⌥ + скрол — зум). Shift + тягни по сцені — посунути кадр. Focal length > 0 перекриває FOV.',
  Render: 'Tone mapper спільний для птаха й оточення.',
  Light: 'Усе світло діє лише на ворону — фон і пил сцена не освітлює.',
  Physics: 'Голова — пружина до курсора. Пил рахується на GPU: вітер, гравітація, турбулентність, відштовхування курсором.',
  Rays: 'Промені падають лише на ворону (фон не світиться). Джерело — rim-світло за птахом або вручну X/Y.',
  Lens: 'Speed-ефекти (розмиття, шлейф, лінії швидкості) діють лише на птаха — пил і листя не чіпають.',
  Grade: 'Грейдинг і експозиція діють лише на ворону. Фон налаштовується у вкладці «Колір → Background».',
  Rig: 'Скрол — зум. «Scroll scenes» вмикає сцени 1 ↔ 2 на скролі (тоді зум — ⌥ + скрол). Shift + тягни по сцені — посунути ворону в кадрі. 21 кістка: root · hips · spine · chest · neck · neck2 · head · tail0-1 · thigh/shin/foot L/R · upperarm/forearm/hand L/R.',
};
const LOOK_SW = { 'Ink lake': '#e9e4d6', 'Blue rim': '#3f8cff', 'Night teal': '#5fdcff', Noir: '#d9d9d9', Ember: '#ff7a3a', Moonlit: '#a9c4ff', 'Oil-slick': '#b36bff', Hologram: '#48ffe0', 'Old reel': '#d8b27a' };

const css = `
#cx{--bg:rgba(13,15,19,.72);--line:rgba(255,255,255,.07);--line2:rgba(255,255,255,.12);--tx:#e6ecf0;--tx2:#98a4ad;--tx3:#5f6b74;--ac:#9be7ff;--ac2:rgba(155,231,255,.16);
  position:fixed;top:14px;right:14px;bottom:14px;width:384px;display:flex;z-index:20;color:var(--tx);
  font:12px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;-webkit-font-smoothing:antialiased;user-select:none;
  background:var(--bg);backdrop-filter:blur(22px) saturate(1.4);-webkit-backdrop-filter:blur(22px) saturate(1.4);
  border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 60px -12px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;
  transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .25s}
#cx.hidden{transform:translateX(calc(100% + 24px));opacity:0;pointer-events:none}
#cx *{box-sizing:border-box}
#cx svg{width:17px;height:17px;display:block}
#cx .rail{width:52px;flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 0;border-right:1px solid var(--line);overflow-y:auto;scrollbar-width:none}
#cx .rail::-webkit-scrollbar{display:none}
#cx .logo{width:28px;height:28px;border-radius:9px;margin-bottom:10px;background:radial-gradient(circle at 30% 30%,#b9f1ff,#2b7f99 60%,#0c2a33);box-shadow:0 0 18px rgba(155,231,255,.35)}
#cx .rt{position:relative;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:var(--tx3);cursor:pointer;transition:background .15s,color .15s}
#cx .rt:hover{color:var(--tx);background:rgba(255,255,255,.05)}
#cx .rt.on{color:var(--ac);background:var(--ac2)}
#cx .rt.on::before{content:"";position:absolute;left:-8px;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--ac)}
#cx .rt .tip{position:absolute;left:44px;top:50%;transform:translateY(-50%);white-space:nowrap;background:#1b2027;color:var(--tx);padding:4px 8px;border-radius:6px;font-size:11px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5;border:1px solid var(--line2)}
#cx .rt:hover .tip{opacity:1}
#cx .main{flex:1;min-width:0;display:flex;flex-direction:column}
#cx .top{display:flex;align-items:center;gap:4px;padding:12px 10px 10px 14px}
#cx .top .ttl{margin-right:4px}
#cx .ttl{font-weight:600;font-size:13px;letter-spacing:-.01em}
#cx .pill{display:inline-flex;align-items:center;gap:6px;font:500 10.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tx2);background:rgba(255,255,255,.05);border:1px solid var(--line);padding:3px 8px;border-radius:20px;white-space:nowrap}
#cx .dot{width:6px;height:6px;border-radius:50%;background:#62f0a8;box-shadow:0 0 8px #62f0a8}
#cx .dot.warn{background:#ffc15e;box-shadow:0 0 8px #ffc15e}
#cx .sp{flex:1}
#cx .ib{flex:none;width:26px;height:26px;border-radius:8px;border:0;background:transparent;color:var(--tx2);display:grid;place-items:center;cursor:pointer;transition:background .15s,color .15s}
#cx .ib:hover{background:rgba(255,255,255,.07);color:var(--tx)} #cx .ib.on{background:var(--ac2);color:var(--ac)}
#cx .ib svg{width:15px;height:15px}
#cx .ib.shot{color:var(--ac);background:var(--ac2)} #cx .ib.shot:hover{background:rgba(155,231,255,.28)}
#cxToast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);z-index:40;padding:10px 16px;border-radius:12px;background:rgba(13,15,19,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1);color:#e6ecf0;font:500 12px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;opacity:0;transition:all .3s cubic-bezier(.2,.8,.2,1);pointer-events:none}
#cxToast.show{opacity:1;transform:translate(-50%,0)}
#cx .srch{margin:0 12px;display:flex;align-items:center;gap:8px;padding:0 10px;height:32px;border-radius:9px;background:rgba(0,0,0,.28);border:1px solid var(--line);color:var(--tx3);transition:border-color .15s}
#cx .srch:focus-within{border-color:rgba(155,231,255,.45)}
#cx .srch svg{width:14px;height:14px}
#cx .srch input{flex:1;min-width:0;background:none;border:0;outline:none;color:var(--tx);font:inherit}
#cx .kbd{font:10px ui-monospace,monospace;color:var(--tx3);border:1px solid var(--line2);border-radius:4px;padding:0 4px}
#cx .looks{display:flex;gap:6px;overflow-x:auto;padding:10px 12px 4px;scrollbar-width:none}
#cx .looks::-webkit-scrollbar{display:none}
#cx .chip{flex:none;display:flex;align-items:center;gap:6px;padding:5px 10px 5px 7px;border-radius:20px;background:rgba(255,255,255,.04);border:1px solid var(--line);cursor:pointer;color:var(--tx2);transition:all .15s;white-space:nowrap}
#cx .chip i{width:10px;height:10px;border-radius:50%}
#cx .chip:hover{color:var(--tx);border-color:var(--line2)} #cx .chip.on{color:var(--tx);border-color:rgba(155,231,255,.5);background:var(--ac2)}
#cx .head2{display:flex;align-items:baseline;gap:8px;padding:12px 14px 4px}
#cx .head2 h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-.02em}
#cx .head2 span{color:var(--tx3);font-size:11px}
#cx .body{flex:1;overflow-y:auto;padding:4px 12px 12px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.12) transparent}
#cx .card{background:rgba(255,255,255,.028);border:1px solid var(--line);border-radius:12px;margin-top:8px;overflow:hidden}
#cx .ch{display:flex;align-items:center;gap:6px;padding:9px 10px 7px 12px;cursor:pointer;color:var(--tx2);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
#cx .ch:hover{color:var(--tx)}
#cx .ch svg{width:13px;height:13px;margin-left:auto;transition:transform .2s}
#cx .card.closed .ch svg{transform:rotate(-90deg)} #cx .card.closed .cb{display:none}
#cx .cb{padding:0 12px 8px}
#cx .row{display:flex;align-items:center;gap:10px;min-height:30px}
#cx .row>label{flex:1;min-width:0;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:ew-resize}
#cx .row.nodrag>label{cursor:default}
#cx .row:hover>label{color:var(--tx)}
#cx .val{flex:none;width:50px;height:22px;text-align:right;padding:0 7px;border-radius:6px;border:1px solid transparent;background:rgba(0,0,0,.25);color:var(--tx);font:500 10.5px ui-monospace,SFMono-Regular,Menlo,monospace;outline:none}
#cx .val:focus{border-color:rgba(155,231,255,.45)}
#cx .sl{flex:none;width:100px;position:relative;height:22px;display:flex;align-items:center}
#cx .sl input{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:4px;margin:0;cursor:pointer;
  background:linear-gradient(90deg,var(--ac) 0,var(--ac) var(--p,0%),rgba(255,255,255,.1) var(--p,0%));outline:none}
#cx .sl input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5),0 0 0 3px rgba(155,231,255,.0);transition:box-shadow .15s}
#cx .sl input:hover::-webkit-slider-thumb{box-shadow:0 1px 4px rgba(0,0,0,.5),0 0 0 4px rgba(155,231,255,.22)}
#cx .sl input::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#fff}
#cx .sw{flex:none;display:flex;align-items:center;gap:8px;cursor:pointer;padding:3px 8px 3px 3px;border-radius:8px;background:rgba(0,0,0,.25);border:1px solid var(--line)}
#cx .sw:hover{border-color:var(--line2)}
#cx .sw i{width:18px;height:18px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
#cx .sw span{font:500 10.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--tx2);width:56px;text-transform:uppercase}
#cx .sw input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
#cx .tg{flex:none;width:32px;height:18px;border-radius:18px;background:rgba(255,255,255,.12);position:relative;cursor:pointer;transition:background .2s}
#cx .tg::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .22s cubic-bezier(.3,1.4,.5,1);box-shadow:0 1px 3px rgba(0,0,0,.4)}
#cx .tg.on{background:var(--ac)} #cx .tg.on::after{transform:translateX(14px)}
#cx .seg{flex:none;display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.28);border:1px solid var(--line);max-width:190px;overflow-x:auto;scrollbar-width:none}
#cx .seg b{flex:none;font-weight:500;padding:3px 7px;border-radius:6px;color:var(--tx2);cursor:pointer;font-size:11px;transition:all .15s}
#cx .seg b:hover{color:var(--tx)} #cx .seg b.on{background:rgba(255,255,255,.12);color:var(--tx);box-shadow:0 1px 2px rgba(0,0,0,.3)}
#cx select{flex:none;width:150px;height:26px;background:rgba(0,0,0,.28);color:var(--tx);border:1px solid var(--line);border-radius:8px;font:inherit;padding:0 8px;outline:none}
#cx .wheelrow{display:flex;align-items:center;gap:14px;padding:6px 0 8px}
#cx .wheelrow canvas{cursor:crosshair;border-radius:50%;touch-action:none}
#cx .wmeta{display:flex;flex-direction:column;gap:8px;min-width:0}
#cx .wlab{color:var(--tx2)} #cx .wsw{width:38px;height:22px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
#cx .whint{color:var(--tx3);font-size:10.5px;line-height:1.35}
#cx .hint{display:flex;gap:8px;margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(155,231,255,.06);border:1px solid rgba(155,231,255,.12);color:#a9c6d0;font-size:11px;line-height:1.45}
#cx .foot{display:flex;gap:6px;padding:10px 12px 12px;border-top:1px solid var(--line)}
#cx .fb{flex:1;height:28px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--tx2);font:inherit;font-size:11px;cursor:pointer;transition:all .15s;white-space:nowrap}
#cx .fb:hover{color:var(--tx);border-color:var(--line2);background:rgba(255,255,255,.06)}
#cx .fb.ico{flex:none;width:34px;display:grid;place-items:center;padding:0}
#cx .fb.ico svg{width:15px;height:15px}
#cx .empty{color:var(--tx3);text-align:center;padding:30px 0}
#cxShow{position:fixed;top:14px;right:14px;z-index:19;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;cursor:pointer;
  background:rgba(13,15,19,.6);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);color:#c8d3da;
  font:500 12px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .25s}
#cxShow.show{opacity:1;pointer-events:auto}
#cxShow kbd{font:10px ui-monospace,monospace;border:1px solid rgba(255,255,255,.15);border-radius:4px;padding:0 4px;color:#8a969f}
@media (max-width:560px){#cx{left:8px;right:8px;top:auto;bottom:8px;width:auto;height:58vh}}
`;

export function createConsole(ctl, edit = true) {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'cx';
  el.innerHTML = `
    <nav class="rail"><div class="logo" title="Crow"></div></nav>
    <div class="main">
      <div class="top"><span class="ttl">Console</span><span class="pill"><i class="dot"></i><span class="fps">— fps</span></span><span class="sp"></span>
        <button class="ib shot" data-a="shot" title="Рендер у високій якості → Робочий стіл (P)">${UI.cam}</button><button class="ib" data-a="undo" title="Undo ⌘Z">${UI.undo}</button><button class="ib" data-a="redo" title="Redo ⇧⌘Z">${UI.redo}</button>
        <button class="ib" data-a="neg" title="Негатив (N)">${UI.neg}</button><button class="ib" data-a="ab" title="Без пост-обробки (B)">${UI.ab}</button><button class="ib" data-a="fs" title="Фулскрін (F)">${UI.fs}</button>
        <button class="ib" data-a="hide" title="Сховати (H)">${UI.min}</button></div>
      <label class="srch">${UI.search}<input placeholder="Пошук контролу"><span class="kbd">/</span></label>
      <div class="looks"></div>
      <div class="head2"><h3></h3><span></span></div>
      <div class="body"></div>
      <div class="foot"><button class="fb" data-a="resetTab">Скинути вкладку</button><button class="fb" data-a="resetAll">Скинути все</button><button class="fb ico" data-a="copy" title="Копіювати налаштування (JSON)">${UI.copy}</button><button class="fb ico" data-a="paste" title="Вставити налаштування (JSON)">${UI.paste}</button></div>
    </div>`;
  document.body.appendChild(el);
  const showBtn = document.createElement('div'); showBtn.id = 'cxShow'; showBtn.innerHTML = 'Console <kbd>H</kbd>'; document.body.appendChild(showBtn);
  const $ = (s) => el.querySelector(s);
  const P = ctl.P;
  let tab = 'Bird', query = '';
  const closed = new Set();
  try { tab = localStorage.getItem('cx-tab') || tab; JSON.parse(localStorage.getItem('cx-closed') || '[]').forEach((g) => closed.add(g)); } catch {}
  if (!TABS.includes(tab)) tab = 'Bird';

  // history
  const hist = [JSON.stringify(P)]; let hi = 0, htimer = null, silent = false;
  const pushHist = () => { clearTimeout(htimer); htimer = setTimeout(() => { const s = JSON.stringify(P); if (s !== hist[hi]) { hist.splice(hi + 1); hist.push(s); if (hist.length > 200) hist.shift(); hi = hist.length - 1; } }, 250); };
  const restore = (s) => { silent = true; ctl.setMany(JSON.parse(s)); silent = false; render(); };
  const set = (k, v) => { ctl.set(k, v); if (!silent) pushHist(); };

  // rail
  const rail = $('.rail');
  TABS.forEach((t) => {
    const b = document.createElement('div'); b.className = 'rt'; b.dataset.t = t;
    b.innerHTML = `${ICON[t] || ''}<span class="tip">${TAB_LABEL[t] || t}</span>`;
    b.onclick = () => { tab = t; query = ''; $('.srch input').value = ''; try { localStorage.setItem('cx-tab', t); } catch {} render(); };
    rail.appendChild(b);
  });

  // looks
  const looks = $('.looks');
  Object.keys(LOOKS).forEach((n) => {
    const c = document.createElement('span'); c.className = 'chip'; c.innerHTML = `<i style="background:${LOOK_SW[n] || '#888'};box-shadow:0 0 8px ${LOOK_SW[n] || '#888'}"></i>${n}`;
    c.onclick = () => { ctl.setMany({ ...DEF, ...LOOKS[n], clip: P.clip, crowYaw: P.crowYaw, pixelRatio: P.pixelRatio }); pushHist(); looks.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); render(); };
    looks.appendChild(c);
  });
  $('.srch input').oninput = (e) => { query = e.target.value.trim().toLowerCase(); render(); };

  // ---------- controls
  const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : (+v).toFixed(step < 0.01 ? 3 : 2));
  const pct = (v, a, b) => `${((v - a) / (b - a)) * 100}%`;
  function rowRange(d) {
    const [, , k, label, , min, max, step, def] = d;
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<label title="${label} · подвійний клік — скинути · тягни — точно">${label}</label><div class="sl"><input type="range" min="${min}" max="${max}" step="${step}"></div><input class="val">`;
    const lb = r.children[0], rg = r.querySelector('input[type=range]'), nm = r.querySelector('.val');
    const show = (v) => { rg.value = v; nm.value = fmt(v, step); rg.style.setProperty('--p', pct(v, min, max)); };
    const put = (v) => { v = Math.min(max, Math.max(min, Math.round(v / step) * step)); set(k, v); show(v); };
    show(P[k]);
    rg.oninput = () => put(+rg.value);
    nm.onchange = () => put(+nm.value || 0);
    nm.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); put(P[k] + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)); } };
    lb.ondblclick = () => put(def);
    // scrub on the label (hold Alt for fine)
    lb.onpointerdown = (e) => {
      const x0 = e.clientX, v0 = P[k]; lb.setPointerCapture(e.pointerId);
      lb.onpointermove = (m) => put(v0 + ((m.clientX - x0) / 240) * (max - min) * (m.altKey ? 0.1 : 1));
      lb.onpointerup = () => { lb.onpointermove = null; };
    };
    return r;
  }
  function rowColor(d) {
    const [, , k, label] = d; const r = document.createElement('div'); r.className = 'row nodrag';
    r.innerHTML = `<label>${label}</label><label class="sw"><i></i><span></span><input type="color"></label>`;
    const sw = r.querySelector('i'), tx = r.querySelector('span'), inp = r.querySelector('input');
    const show = (v) => { sw.style.background = v; tx.textContent = v; inp.value = v; };
    show(P[k]); inp.oninput = () => { set(k, inp.value); show(inp.value); };
    r.children[0].ondblclick = () => { set(k, d[5]); show(d[5]); };
    return r;
  }
  function rowToggle(d) {
    const [, , k, label] = d; const r = document.createElement('div'); r.className = 'row nodrag';
    r.innerHTML = `<label>${label}</label><div class="tg"></div>`;
    const t = r.children[1]; t.classList.toggle('on', !!P[k]);
    const flip = () => { set(k, P[k] ? 0 : 1); t.classList.toggle('on', !!P[k]); };
    t.onclick = flip; r.children[0].onclick = flip;
    return r;
  }
  function rowSelect(d) {
    const [, , k, label, , opts] = d; const r = document.createElement('div'); r.className = 'row nodrag';
    const short = opts.length <= 5 && opts.join('').length <= 26;
    if (short) {
      r.innerHTML = `<label>${label}</label><div class="seg">${opts.map((o) => `<b class="${String(o) === String(P[k]) ? 'on' : ''}">${o}</b>`).join('')}</div>`;
      r.querySelectorAll('.seg b').forEach((b) => (b.onclick = () => { set(k, b.textContent); r.querySelectorAll('.seg b').forEach((x) => x.classList.toggle('on', x === b)); }));
    } else {
      r.innerHTML = `<label>${label}</label><select>${opts.map((o) => `<option ${String(o) === String(P[k]) ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      r.querySelector('select').onchange = (e) => set(k, e.target.value);
    }
    return r;
  }
  function rowWheel(d) {
    const k = d[2], W = 150;
    const r = document.createElement('div'); r.className = 'wheelrow';
    r.innerHTML = `<canvas width="${W * 2}" height="${W * 2}" style="width:${W}px;height:${W}px"></canvas><div class="wmeta"><div class="wlab">${d[3]}</div><i class="wsw"></i><div class="whint">Тягни по колу · подвійний клік — скинути</div></div>`;
    const cv = r.querySelector('canvas'), ctx = cv.getContext('2d'), sw = r.querySelector('.wsw');
    const hsl = (x, y) => `hsl(${((Math.atan2(y, x) * 180) / Math.PI + 360) % 360},${Math.min(1, Math.hypot(x, y)) * 100}%,50%)`;
    const draw = () => {
      const R = W; ctx.clearRect(0, 0, 2 * R, 2 * R);
      const g = ctx.createConicGradient ? ctx.createConicGradient(0, R, R) : null;
      if (g) { for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(R, R, R - 4, 0, 7); ctx.fill(); }
      const w = ctx.createRadialGradient(R, R, 0, R, R, R - 4); w.addColorStop(0, 'rgba(128,128,128,1)'); w.addColorStop(1, 'rgba(128,128,128,0)');
      ctx.fillStyle = w; ctx.beginPath(); ctx.arc(R, R, R - 4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(R, R, R - 4, 0, 7); ctx.stroke();
      const [x, y] = P[k]; const px = R + x * (R - 14), py = R + y * (R - 14);
      ctx.beginPath(); ctx.arc(px, py, 11, 0, 7); ctx.fillStyle = hsl(x, y); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
      sw.style.background = hsl(x, y);
    };
    const pick = (e) => {
      const b = cv.getBoundingClientRect(); let x = ((e.clientX - b.left) / b.width) * 2 - 1, y = ((e.clientY - b.top) / b.height) * 2 - 1;
      const L = Math.hypot(x, y); if (L > 1) { x /= L; y /= L; }
      set(k, [+x.toFixed(3), +y.toFixed(3)]);
      if (k === 'bgWheel' && !P.bgWheelMix) { set('bgWheelMix', 1); render(); return; }
      draw();
    };
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); pick(e); cv.onpointermove = pick; };
    cv.onpointerup = () => { cv.onpointermove = null; };
    cv.ondblclick = () => { set(k, [0, 0]); draw(); };
    draw(); return r;
  }
  function rowText(d) {
    const [, , k, label] = d; const r = document.createElement('div'); r.className = 'row nodrag'; r.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px;height:auto';
    r.innerHTML = `<label>${label}</label><textarea spellcheck="false" style="resize:vertical;width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 10px;font:600 13px/1.35 ui-sans-serif,system-ui;text-transform:uppercase"></textarea>`;
    const ta = r.querySelector('textarea'); ta.value = P[k]; ta.rows = Math.max(1, String(P[k]).split('\n').length);
    ta.oninput = () => { set(k, ta.value); ta.rows = Math.max(1, ta.value.split('\n').length); };
    ta.onkeydown = (e) => e.stopPropagation();   // typing must not trigger the console hotkeys
    r.children[0].ondblclick = () => { set(k, d[5]); ta.value = d[5]; };
    return r;
  }
  const ROW = { range: rowRange, color: rowColor, toggle: rowToggle, select: rowSelect, wheel: rowWheel, text: rowText };

  function render() {
    const nb = el.querySelector('[data-a=neg]'); if (nb) nb.classList.toggle('on', !!P.negOn);
    rail.querySelectorAll('.rt').forEach((x) => x.classList.toggle('on', !query && x.dataset.t === tab));
    $('.head2 h3').textContent = query ? 'Пошук' : (TAB_LABEL[tab] || tab);
    const list = DEFS.filter((d) => (query ? (d[3] + ' ' + d[2] + ' ' + d[1] + ' ' + d[0] + ' ' + (TAB_LABEL[d[0]] || '')).toLowerCase().includes(query) : d[0] === tab));
    $('.head2 span').textContent = `${list.length} контрол${list.length === 1 ? '' : 'ів'}`;
    const body = $('.body'); body.innerHTML = '';
    if (!list.length) { body.innerHTML = '<div class="empty">Нічого не знайдено</div>'; return; }
    let card = null, g = null;
    for (const d of list) {
      const gname = query ? `${TAB_LABEL[d[0]] || d[0]} · ${d[1]}` : d[1];
      if (gname !== g) {
        g = gname; const id = d[0] + '/' + d[1];
        card = document.createElement('div'); card.className = 'card' + (!query && closed.has(id) ? ' closed' : '');
        card.innerHTML = `<div class="ch">${g}${UI.chev}</div><div class="cb"></div>`;
        card.querySelector('.ch').onclick = ((c, i) => () => { c.classList.toggle('closed'); c.classList.contains('closed') ? closed.add(i) : closed.delete(i); try { localStorage.setItem('cx-closed', JSON.stringify([...closed])); } catch {} })(card, id);
        body.appendChild(card);
      }
      card.querySelector('.cb').appendChild(ROW[d[4]](d));
    }
    if (!query && HINTS[tab]) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = HINTS[tab]; body.appendChild(h); }
    if (!query && tab === 'Render') { const h = document.createElement('div'); h.className = 'hint'; h.textContent = 'Бекенд: ' + ctl.backend() + ' · додай ?webgl до адреси, щоб примусово ввімкнути WebGL2.'; body.appendChild(h); }
  }
  render();

  const hide = (v) => { el.classList.toggle('hidden', v); showBtn.classList.toggle('show', v && edit); };
  if (!edit) { el.style.display = 'none'; showBtn.style.display = 'none'; }
  showBtn.onclick = () => hide(false);
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-a]'); if (!btn) return; const a = btn.dataset.a;
    if (a === 'shot') ctl.capture();
    if (a === 'neg') { btn.classList.toggle('on', ctl.toggleNeg()); render(); }
    if (a === 'hide') hide(true);
    if (a === 'fs') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    if (a === 'ab') btn.classList.toggle('on', ctl.toggleBypass());
    if (a === 'undo' && hi > 0) restore(hist[--hi]);
    if (a === 'redo' && hi < hist.length - 1) restore(hist[++hi]);
    if (a === 'resetTab') { const o = {}; DEFS.filter((d) => d[0] === tab).forEach((d) => (o[d[2]] = DEF[d[2]])); ctl.setMany(o); pushHist(); render(); }
    if (a === 'resetAll') { ctl.setMany({ ...DEF }); pushHist(); looks.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); render(); }
    if (a === 'copy') { let ok = true; try { await navigator.clipboard.writeText(JSON.stringify(P, null, 1)); } catch { ok = false; prompt('JSON:', JSON.stringify(P)); } if (ok) { btn.innerHTML = UI.ok; setTimeout(() => (btn.innerHTML = UI.copy), 1200); } }
    if (a === 'paste') { let t = null; try { t = await navigator.clipboard.readText(); } catch { t = prompt('JSON:'); } if (t) { try { ctl.setMany(JSON.parse(t)); pushHist(); render(); } catch {} } }
  });
  addEventListener('keydown', (e) => {
    if (!edit) return;
    const tag = e.target.tagName; const typing = (tag === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'SELECT';
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) { if (hi < hist.length - 1) restore(hist[++hi]); } else if (hi > 0) restore(hist[--hi]); return; }
    if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'h' || e.key === 'H') hide(!el.classList.contains('hidden'));
    if (e.key === 'b' || e.key === 'B') $('[data-a=ab]').classList.toggle('on', ctl.toggleBypass());
    if (e.key === '/') { e.preventDefault(); $('.srch input').focus(); }
  });
  const toastEl = document.createElement('div'); toastEl.id = 'cxToast'; document.body.appendChild(toastEl);
  let toastT = null;
  const toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3200); };
  return {
    toast,
    fps: (t, low, title) => { $('.fps').textContent = t; $('.pill').title = title || ''; $('.dot').classList.toggle('warn', !!low); },
    render,
  };
}
