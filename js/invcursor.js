// Invert cursor: a disc that follows the pointer and turns everything under it into its negative — the 3D scene
// and the titles / carton / badge on top of it. It is a plain page element with mix-blend-mode: difference
// (white − colour = inverted colour), so it costs nothing on the GPU. Reads its settings live from P.
export function makeInvCursor(P) {
  const el = document.createElement('div');
  el.id = 'invCursor';
  Object.assign(el.style, {
    position: 'fixed', left: '0', top: '0', width: '100px', height: '100px', borderRadius: '50%',
    pointerEvents: 'none', zIndex: '15', mixBlendMode: 'difference', background: '#fff',
    opacity: '0', willChange: 'transform', transition: 'opacity .25s',
  });
  document.body.appendChild(el);

  let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, inside = false, down = false, s = 0, sv = 0, last = performance.now();
  addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (!inside) { x = tx; y = ty; } inside = true; }, { passive: true });
  document.addEventListener('pointerleave', () => (inside = false));
  addEventListener('blur', () => (inside = false));
  addEventListener('pointerdown', () => (down = true));
  addEventListener('pointerup', () => (down = false));

  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const on = !!P.invOn && inside;
    el.style.display = P.invOn ? '' : 'none';
    if (!P.invOn) return;
    // follow: 0 = glued to the pointer, 1 = lazy
    const k = P.invLag <= 0 ? 1 : 1 - Math.exp(-dt * (30 * (1 - P.invLag) + 2));
    x += (tx - x) * k; y += (ty - y) * k;
    // size springs (grows in, shrinks while pressed)
    const target = on ? (down ? P.invPress : 1) : 0;
    sv += ((target - s) * 260 - sv * 22) * dt; s += sv * dt;
    const d = P.invSize;
    el.style.width = el.style.height = d + 'px';
    el.style.background = P.invColor;
    el.style.opacity = on ? '1' : '0';
    el.style.transform = `translate(${x - d / 2}px, ${y - d / 2}px) scale(${Math.max(0, s)})`;
  };
  requestAnimationFrame(frame);
  return el;
}
