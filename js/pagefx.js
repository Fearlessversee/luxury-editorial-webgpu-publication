// Page-to-page dissolve. The page you leave hands its last frame over (sessionStorage); the next page shows it on
// top of everything from its very first paint (a tiny inline snippet in its HTML), then burns it away like a card in
// the 404's deck: an ink-noise front eats the picture from the middle out, with a hot paper-coloured rim.
const KEY = 'pagefx-snap';

// leave: remember this frame, then go
export function leave(url, canvas) {
  try {
    const w = Math.min(1280, canvas.width), h = Math.round((canvas.height * w) / canvas.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    sessionStorage.setItem(KEY, JSON.stringify({ src: c.toDataURL('image/jpeg', 0.85), t: Date.now() }));
  } catch (e) {}
  location.href = url;
}

// arrive: #pagefx (made by the inline snippet) holds the old frame. It starts smouldering at once and burns away
// for real when `ready` resolves (or after `maxWait` ms). Drawn by a tiny WebGL2 shader (the noise is computed on
// the GPU), so the burn stays smooth even while the new page is busy; a CPU version is the fallback.
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;
const FS = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D img; uniform float t, w, z; uniform vec2 res;
float h(vec2 q, float k){ return fract(sin(q.x * 127.1 + q.y * 311.7 + k * 74.7) * 43758.5453); }
float vn(vec2 x, float k){ vec2 i = floor(x), f = fract(x), s = f * f * (3. - 2. * f);
  return mix(mix(h(i, k), h(i + vec2(1, 0), k), s.x), mix(h(i + vec2(0, 1), k), h(i + vec2(1, 1), k), s.x), s.y); }
vec3 hot(float q){ return vec3(255., 236. - 40. * q, 190. - 110. * q) / 255.; }
void main(){
  vec2 px = vec2(uv.x, 1. - uv.y) * res / 3.;   // the CPU version's 1/3-res pixel grid
  float n = vn(px / 30., 1.) * .5 + vn(px / 15., 2.) * .25 + vn(px / 7., 3.) * .15 + vn(px / 3., 4.) * .1;
  vec2 c = res / 6.; n = n * .62 + length(px - c) / length(c) * .38;
  vec2 iu = (vec2(uv.x, 1. - uv.y) - .5) * (1. - z) + .5;   // the old frame drifts slowly closer while it waits
  vec3 src = texture(img, iu).rgb, ash = vec3(.043, .035, .027); float E = .045;
  // two fronts: w (while the new page gets ready) burns the picture into ash, t (once it is ready) burns the ash away
  float v = n - t;
  if (v < 0.) { o = vec4(0.); return; }
  if (v < E) { float k = v / E; o = vec4(k < .4 ? hot(k / .4) : mix(vec3(40., 26., 12.) / 255., n < w ? ash : src, (k - .4) / .6), 1.); return; }
  float u = n - w;
  if (u < 0.) { o = vec4(ash, 1.); return; }
  if (u < E) { float k = u / E; o = vec4(k < .4 ? hot(k / .4) : mix(vec3(40., 26., 12.) / 255., src, (k - .4) / .6), 1.); return; }
  o = vec4(src, 1.);
}`;
function glBurn(img, el, ready, maxWait) {
  const cv = document.createElement('canvas'), dpr = Math.min(1.5, devicePixelRatio || 1);
  cv.width = Math.ceil(innerWidth * dpr); cv.height = Math.ceil(innerHeight * dpr);
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483001;pointer-events:none;will-change:transform;animation:pagefx-drift 9s cubic-bezier(.2,.6,.3,1) both';
  // the slow push-in runs on the compositor (CSS), so it keeps moving even while the new page's warm-up blocks scripts
  if (!document.getElementById('pagefx-css')) { const st = document.createElement('style'); st.id = 'pagefx-css'; st.textContent = '@keyframes pagefx-drift{from{transform:scale(1)}to{transform:scale(1.07)}}'; document.head.appendChild(st); }
  const gl = cv.getContext('webgl2', { premultipliedAlpha: false, alpha: true, antialias: false }); if (!gl) return false;
  const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  const uT = gl.getUniformLocation(pr, 't'), uW = gl.getUniformLocation(pr, 'w'), uZ = gl.getUniformLocation(pr, 'z'), uR = gl.getUniformLocation(pr, 'res');
  gl.uniform2f(uR, innerWidth, innerHeight); gl.viewport(0, 0, cv.width, cv.height);
  const draw = (t, w, z) => { gl.uniform1f(uT, t); gl.uniform1f(uW, w); gl.uniform1f(uZ, z); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  draw(-0.02, -0.02, 0); document.body.appendChild(cv); el.remove();
  // never a still frame: while the next page warms up the old one keeps moving (drifts in, burns slowly into ash);
  // the moment it's ready the ash burns away onto it
  let go = false, t0 = performance.now(), tGo = 0, wGo = 0, zGo = 0;
  Promise.race([ready, new Promise((r) => setTimeout(r, maxWait))]).then(() => { go = true; tGo = performance.now(); });
  const tick = (now) => {
    const e = (now - t0) / 1000;
    let w = -0.02 + 0.5 * (1 - Math.exp(-e / 3.2)), z = 0, t = -0.02;
    if (go) { const k = Math.min(1, (now - tGo) / 1300); if (!wGo) { wGo = w; zGo = z; } w = wGo; z = zGo; t = -0.02 + 1.12 * (k * k * (3 - 2 * k)); }
    draw(t, w, z);
    if (t < 1.08) requestAnimationFrame(tick); else { cv.remove(); const x = gl.getExtension('WEBGL_lose_context'); x && x.loseContext(); }
  };
  requestAnimationFrame(tick);
  return true;
}
export function arrive(ready, maxWait = 14000) {
  const el = document.getElementById('pagefx'); if (!el) return;
  const img = new Image();
  img.onload = () => {
    try { if (glBurn(img, el, ready, maxWait)) return; } catch (e) { console.warn('pagefx', e); }
    cpuBurn(img, el, ready, maxWait);
  };
  img.onerror = () => el.remove();
  img.src = el.dataset.src;
}
function cpuBurn(img, el, ready, maxWait) {
  {
    const S = 3, W = Math.max(2, Math.ceil(innerWidth / S)), H = Math.max(2, Math.ceil(innerHeight / S));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483001;pointer-events:none';
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H); const src = g.getImageData(0, 0, W, H).data;
    // noise: four octaves of smooth value noise, plus distance from the middle (the middle goes first)
    const N = new Float32Array(W * H), hash = (x, y, k) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
    for (const [cell, amp, k] of [[30, 0.5, 1], [15, 0.25, 2], [7, 0.15, 3], [3, 0.1, 4]]) {
      const cs = cell;
      for (let y = 0; y < H; y++) { const fy = y / cs, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < W; x++) { const fx = x / cs, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
          const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
          N[y * W + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy); } }
    }
    const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; N[i] = N[i] * 0.62 + (Math.hypot(x - cx, y - cy) / R) * 0.38; }
    const out = g.createImageData(W, H), o = out.data, E = 0.045;
    document.body.appendChild(cv); el.remove();
    let t = -0.02, go = false, t0 = performance.now(), tGo = 0;
    Promise.race([ready, new Promise((r) => setTimeout(r, maxWait))]).then(() => { go = true; tGo = performance.now(); });
    const tick = (now) => {
      if (!go) t = -0.02 + 0.1 * Math.min(1, (now - t0) / 1800);   // smouldering while the page loads
      else { const k = Math.min(1, (now - tGo) / 1500); t = 0.08 + (1.1 - 0.08) * (k * k * (3 - 2 * k)); }
      for (let i = 0, j = 0; i < N.length; i++, j += 4) {
        const v = N[i] - t;
        if (v >= E) { o[j] = src[j]; o[j + 1] = src[j + 1]; o[j + 2] = src[j + 2]; o[j + 3] = 255; }
        else if (v >= 0) { const k = v / E;   // the rim: white-hot at the front, charred behind it, then the picture
          if (k < 0.4) { const q = k / 0.4; o[j] = 255; o[j + 1] = 236 - 40 * q; o[j + 2] = 190 - 110 * q; }
          else { const q = (k - 0.4) / 0.6; o[j] = 40 + (src[j] - 40) * q; o[j + 1] = 26 + (src[j + 1] - 26) * q; o[j + 2] = 12 + (src[j + 2] - 12) * q; }
          o[j + 3] = 255; }
        else o[j + 3] = 0;
      }
      g.putImageData(out, 0, 0);
      if (t < 1.08) requestAnimationFrame(tick); else cv.remove();
    };
    requestAnimationFrame(tick);
  }
}
