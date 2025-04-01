import { paletteMap } from './palette.js';
import * as THREE from 'three';
import { screenFX, HU } from './screenfx.js';
import { cursorUV, cursorColor, winFlip } from './cursorfx.js';
import {
  Fn, uniform, pass, uv, vec2, vec3, vec4, float, int, mix, smoothstep, step, clamp, length, dot, abs, sin, cos, fract, floor,
  exp, pow, max, min, luminance, hash, Loop, If, rtt, mrt, output, cameraNear, cameraFar, perspectiveDepthToViewZ, mod, bloom, dof, renderOutput, convertToTexture, vibrance, fxaa, texture, select, screenCoordinate,
} from 'three';

// Post uniforms (continuous controls). Discrete switches rebuild the graph (see buildPost).
export const EU = {
  exposure: uniform(1), contrast: uniform(1), sat: uniform(1), temp: uniform(0), gtint: uniform(0), gamma: uniform(1), fade: uniform(0),
  shadowTint: uniform(new THREE.Color('#123a44')), shadowAmt: uniform(0),
};
export const PU = {
  zoomBlur: uniform(0),
  markOn: uniform(1), markBg: uniform(1), bgMatch: uniform(new THREE.Color('#050608')), eyeFinal: uniform(new THREE.Color('#ffffff')), beakColor: uniform(new THREE.Color('#ffffff')), outlineColor: uniform(new THREE.Color('#000000')), outlineW: uniform(2.5),
  res: uniform(new THREE.Vector2(1, 1)), time: uniform(0), seed: uniform(0),
  // lens
  distort: uniform(0.04), ca: uniform(0.6), vignette: uniform(0.55), vignetteSoft: uniform(0.65),
  bloomStr: uniform(0.35), bloomMask: uniform(1), bloomRadius: uniform(0.45), bloomThresh: uniform(0.55),
  focus: uniform(5.2), aperture: uniform(0.025), maxBlur: uniform(0.01),
  camNear: uniform(0.05), camFar: uniform(900), focalM: uniform(0.05), fstop: uniform(2.8), sceneScale: uniform(0.25), dofBoost: uniform(1), maxBlurPx: uniform(24), bokehBoost: uniform(1.5), bladeRot: uniform(0.3), anamorph: uniform(1),
  // rays
  raysInt: uniform(0.9), raysColor: uniform(new THREE.Color('#8fdcff')), raysDecay: uniform(0.965), raysDensity: uniform(0.85),
  raysSize: uniform(0.3), raysSrc: uniform(new THREE.Vector2(0.56, 0.72)),
  // film
  grain: uniform(0.07), grainSize: uniform(1.3), grainLuma: uniform(0.6), grainColor: uniform(0.25),
  halation: uniform(0.35), halColor: uniform(new THREE.Color('#ff4a1c')), flickerMul: uniform(1), scan: uniform(0),
  // projector
  weaveOff: uniform(new THREE.Vector2()), weaveRot: uniform(0), specks: uniform(0.25), scratches: uniform(0.2),
  scratchX: uniform(new THREE.Vector4(-1, -1, -1, -1)), burn: uniform(0), burnPos: uniform(new THREE.Vector2(0.8, 0.2)),
  hotspot: uniform(0.2), leak: uniform(0), leakColor: uniform(new THREE.Color('#ff6a2a')), leakPos: uniform(new THREE.Vector2(0, 0.5)),
  letterbox: uniform(0),
  neg: uniform(0), negInk: uniform(new THREE.Color('#141312')), negPaper: uniform(new THREE.Color('#e9e4d6')), negGamma: uniform(1.4), negColor: uniform(0), negPaperTex: uniform(0.6), negSky: uniform(0.6),
  // speed (dive)
  motionAmt: uniform(0), birdSharp: uniform(0.6), motionDir: uniform(new THREE.Vector2(0, 1)), blurLen: uniform(0.12), smearDecay: uniform(0.12),
  streaks: uniform(0.6), streakDensity: uniform(0.35), streakSpeed: uniform(3), streakColor: uniform(new THREE.Color('#cfefff')),
  // grade
  exposure: uniform(1.1), contrast: uniform(1.08), fade: uniform(0.02), gamma: uniform(1), gain: uniform(1),
  sat: uniform(0.92), vibrance: uniform(0), temp: uniform(-0.08), gtint: uniform(0),
  shadowTint: uniform(new THREE.Color('#123a44')), shadowAmt: uniform(0.35), highTint: uniform(new THREE.Color('#ffd9b0')), highAmt: uniform(0.15),
};

const TONE = {
  ACES: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping,
  Reinhard: THREE.ReinhardToneMapping, Cineon: THREE.CineonToneMapping, None: THREE.NoToneMapping,
};

export function buildPost(renderer, scene, camera, P) {
  const post = new THREE.PostProcessing(renderer);
  post.outputColorTransform = false;
  const scenePass = pass(scene, camera);
  // second render target 'bird': the crow's materials write 1 there, everything else 0
  scenePass.setMRT(mrt({ output, bird: vec4(0, 0, 0, 0) }));
  const colorT = scenePass.getTextureNode('output');
  const birdT = scenePass.getTextureNode('bird');
  const depthT = scenePass.getTextureNode('depth');
  const aspect = PU.res.x.div(PU.res.y);

  // ---------- stage A: HDR, screen aligned (dof → bloom/halation → god rays)
  let hdr = colorT;
  if (P.dofOn) {
    // ---- real-lens depth of field: thin-lens circle of confusion + disc (or n-blade) bokeh gather.
    // CoC(px) = A·f·|d−S| / (d·(S−f)) / sensor · screen height,  A = f / N
    const cn = PU.camNear, cf = PU.camFar;   // scene camera (cameraNear/Far here would be the post quad's camera)
    const dist = (u) => perspectiveDepthToViewZ(depthT.uv(u).x, cn, cf).negate().mul(PU.sceneScale);
    const coc = (d) => {
      const f = PU.focalM, S = PU.focus.mul(PU.sceneScale).max(f.mul(1.01));
      const c = f.mul(f).div(PU.fstop).mul(d.sub(S).abs()).div(d.mul(S.sub(f)));
      const signed = c.div(0.024).mul(PU.res.y).mul(PU.dofBoost);
      return signed.min(PU.maxBlurPx);
    };
    const NS = parseInt(P.dofSamples, 10) || 48;
    const blades = parseInt(P.dofBlades, 10) || 0;
    hdr = convertToTexture(Fn(() => {
      const u0 = uv();
      const dC = dist(u0);
      const cC = coc(dC);
      const acc = vec4(colorT.uv(u0).rgb, 1).toVar();
      If(PU.maxBlurPx.greaterThan(0.5), () => {
        const px = vec2(1).div(PU.res);
        const accum = vec3(0).toVar(); const wsum = float(0).toVar();
        Loop(NS, ({ i }) => {
          const fi = float(i).add(0.5);
          const r = fi.div(NS).sqrt();                       // uniform disc
          const th = fi.mul(2.39996323).add(PU.seed.mul(0.001));
          let rr = r;
          if (blades > 2) {                                  // polygonal aperture
            const seg = float(Math.PI * 2 / blades);
            const tt = mod(th.add(PU.bladeRot), seg).sub(seg.mul(0.5));
            rr = r.mul(float(Math.cos(Math.PI / blades)).div(tt.cos()));
          }
          const R_ = rr.mul(PU.maxBlurPx);
          const off = vec2(th.cos(), th.sin().mul(PU.anamorph)).mul(R_).mul(px);
          const q = u0.add(off);
          const dS = dist(q);
          // farther samples can't spill over a sharper foreground
          const cS = select(dS.greaterThan(dC), coc(dS).min(cC), coc(dS));
          // anti-aliased crow edges carry crow colour on background depth — keep them out of background blur
          const bS = birdT.uv(q).r, bC = birdT.uv(u0).r;
          const w = smoothstep(R_.sub(1), R_.add(1), cS).mul(float(1).sub(bS.mul(float(1).sub(bC))));
          const col = colorT.uv(q).rgb;
          const bright = float(1).add(luminance(col).clamp(0, 2).pow(2).mul(PU.bokehBoost).mul(smoothstep(2, 6, cS)));   // only real out-of-focus highlights bloom into discs
          accum.addAssign(col.mul(w).mul(bright)); wsum.addAssign(w.mul(bright));
        });
        const center = colorT.uv(u0).rgb;
        const blurred = accum.add(center.mul(0.001)).div(wsum.add(0.001));
        acc.assign(vec4(mix(center, blurred, smoothstep(0.5, 1.5, cC)), 1));
      });
      return acc;
    })());
  }
  let a = vec3(hdr.rgb);
  // crow mask from the MRT (branches, background, dust and leaves are environment)
  const crowMask = birdT.r.clamp(0, 1);
  if (P.bloomOn) {
    const b = bloom(hdr, PU.bloomStr, PU.bloomRadius, PU.bloomThresh);
    const glow = b.rgb.add(b.rgb.mul(PU.halColor).mul(PU.halation));
    a = a.add(glow.mul(mix(float(1), crowMask, PU.bloomMask)));
  }
  if (P.raysOn) {
    // God rays are soft, so they are marched in a small off-screen buffer (Render → Ray resolution)
    // and only then masked onto the crow at full resolution. Background pixels never pay for the loop.
    const N = parseInt(P.raySamples, 10);
    const rays = Fn(() => {
      const u0 = uv();
      const acc = float(0).toVar();
      const nearCrow = birdT.uv(u0).r;
      If(nearCrow.greaterThan(0.5), () => {
        const delta = PU.raysSrc.sub(u0).mul(PU.raysDensity).div(N).toVar();
        const jit = hash(u0.x.mul(1733.1).add(u0.y.mul(2918.7)).add(PU.seed));
        const p = u0.add(delta.mul(jit)).toVar();
        const w = float(1).toVar();
        Loop(N, () => {
          p.addAssign(delta);
          const bg = step(0.99999, depthT.uv(p).x);
          const r = length(p.sub(PU.raysSrc).mul(vec2(aspect, 1)));
          acc.addAssign(bg.mul(smoothstep(PU.raysSize, 0.0, r).pow(2.2)).mul(w));
          w.mulAssign(PU.raysDecay);
        });
      });
      return vec4(acc.mul(3.0).div(N).pow(1.8), 0, 0, 1);
    })();
    const raysT = rtt(rays, 1, 1);
    raysT.setPixelRatio(1);
    post.raysT = raysT;
    // light only on the crow: shafts land on its feathers, never on the background
    a = a.add(PU.raysColor.mul(raysT.r).mul(PU.raysInt).mul(crowMask));
  }
  const texA = convertToTexture(vec4(a, crowMask));

  // ---------- stage B: gate weave + lens distortion + chromatic aberration
  // screen uv → lens-distorted uv (shared by stage B and the eye/beak overlay so they line up)
  const lensUV = (u0) => {
    let c = u0.sub(0.5);
    const cr = cos(PU.weaveRot), sr = sin(PU.weaveRot);
    c = vec2(c.x.mul(cr).sub(c.y.mul(sr)), c.x.mul(sr).add(c.y.mul(cr))).add(PU.weaveOff);
    const cc = c.mul(vec2(aspect, 1));
    c = c.mul(float(1).add(PU.distort.mul(dot(cc, cc))));
    return c.div(float(1).add(PU.distort.max(0).mul(0.45)).add(0.012)).add(0.5);
  };
  const lensed = Fn(() => {
    const u0 = uv();
    let c = u0.sub(0.5);
    const cr = cos(PU.weaveRot), sr = sin(PU.weaveRot);
    c = vec2(c.x.mul(cr).sub(c.y.mul(sr)), c.x.mul(sr).add(c.y.mul(cr))).add(PU.weaveOff);
    const cc = c.mul(vec2(aspect, 1));
    const r2 = dot(cc, cc);
    c = c.mul(float(1).add(PU.distort.mul(r2)));
    c = c.div(float(1).add(PU.distort.max(0).mul(0.45)).add(0.012)); // overscan: gate edges / distorted corners never show
    const k = PU.ca.mul(0.004).mul(r2.add(0.15));
    const uR = c.mul(float(1).add(k)).add(0.5), uG = c.add(0.5), uB = c.mul(float(1).sub(k)).add(0.5);
    const g = texA.uv(uG);
    const col = vec3(texA.uv(uR).r, g.g, texA.uv(uB).b).toVar();
    const smearMask = float(g.a).toVar();
    // camera motion blur while the scroll pulls the camera back: radial (zoom) streaks from the centre
    If(PU.zoomBlur.greaterThan(0.001), () => {
      const acc = vec3(col).toVar(); const d = uG.sub(0.5);
      Loop(12, ({ i }) => { acc.addAssign(texA.uv(uG.sub(d.mul(PU.zoomBlur).mul(float(i).add(1).div(12)))).rgb); });
      col.assign(acc.div(13));
    });
    if (P.motionOn) {
      // motion smear / blur: one-sided, sampled along the bird's screen motion so the image trails behind it
      If(PU.motionAmt.greaterThan(0.002), () => {
        const N = 14;
        const step_ = PU.motionDir.mul(PU.blurLen).mul(PU.motionAmt).div(N);
        const jit = hash(u0.x.mul(1931.7).add(u0.y.mul(2711.3)).add(PU.seed));
        // only the bird is smeared: samples that aren't crow (background, dust, leaves) are ignored
        const acc = col.mul(g.a).toVar(); const wc = float(g.a).toVar(); const wsum = float(1).toVar(); const w = float(1).toVar();
        Loop(N, ({ i }) => {
          w.mulAssign(float(1).sub(PU.smearDecay));
          const q = uG.add(step_.mul(float(i).add(1).add(jit.sub(0.5))));
          const sq = texA.uv(q);
          acc.addAssign(sq.rgb.mul(sq.a).mul(w)); wc.addAssign(sq.a.mul(w)); wsum.addAssign(w);
        });
        const cover = wc.div(wsum);                            // how much of the trail here is bird
        const smear = acc.div(wc.max(0.0001));
        const amt = PU.motionAmt.min(1);
        // inside the silhouette it only softens (stays readable); outside it lays down the trailing smear
        col.assign(mix(col, smear, amt.mul(mix(cover, float(1).sub(PU.birdSharp), g.a))));
        smearMask.assign(max(g.a, cover.mul(amt)));
      });
    }
    const inside = step(0.0, uG.x).mul(step(uG.x, 1.0)).mul(step(0.0, uG.y)).mul(step(uG.y, 1.0));
    return vec4(col.mul(inside).mul(PU.flickerMul), smearMask);
  })();
  const mask = lensed.a;

  // tone map + sRGB. Exposure and the whole grade act on the crow only; the background keeps its own look
  const tm = TONE[P.toneMap] ?? THREE.AgXToneMapping;
  const ldrBird = renderOutput(vec4(lensed.rgb.mul(PU.exposure), 1), tm, THREE.SRGBColorSpace).rgb;
  const ldrBg = renderOutput(vec4(lensed.rgb.mul(EU.exposure), 1), tm, THREE.SRGBColorSpace).rgb;
  const ldr = ldrBird;
  // environment grade (background, branches, dust, leaves) — independent of the bird's
  const envGraded = Fn(() => {
    const c = vec3(ldrBg).toVar();
    c.mulAssign(vec3(float(1).add(EU.temp.mul(0.12)), float(1).sub(EU.gtint.mul(0.08)), float(1).sub(EU.temp.mul(0.12))).add(vec3(EU.gtint.mul(0.04), 0, EU.gtint.mul(0.04))));
    c.assign(max(c, 0).pow(vec3(float(1).div(EU.gamma))));
    c.assign(c.sub(0.5).mul(EU.contrast).add(0.5));
    const l = luminance(c).clamp(0, 1);
    c.assign(mix(c, c.mul(EU.shadowTint.mul(2.2)), float(1).sub(l).pow(2).mul(EU.shadowAmt)));
    c.assign(mix(vec3(luminance(c)), c, EU.sat));
    c.assign(mix(vec3(EU.fade), vec3(1), c.clamp(0, 1)));
    return c;
  })();

  // ---------- stage C: grade (display space)
  const graded = Fn(() => {
    let c = vec3(ldr).toVar();
    // white balance
    c.mulAssign(vec3(float(1).add(PU.temp.mul(0.12)), float(1).sub(PU.gtint.mul(0.08)), float(1).sub(PU.temp.mul(0.12))).add(vec3(PU.gtint.mul(0.04), 0, PU.gtint.mul(0.04))));
    // gain / gamma
    c.assign(max(c.mul(PU.gain), 0).pow(vec3(float(1).div(PU.gamma))));
    // contrast around mid grey
    c.assign(c.sub(0.5).mul(PU.contrast).add(0.5));
    // split toning
    const l = luminance(c).clamp(0, 1);
    c.assign(mix(c, c.mul(PU.shadowTint.mul(2.2)), float(1).sub(l).pow(2).mul(PU.shadowAmt)));
    c.assign(mix(c, c.mul(PU.highTint.mul(1.25)), l.pow(2).mul(PU.highAmt).mul(smoothstep(1.0, 0.8, l)))); // pure whites (eyes) stay white
    // saturation & vibrance
    c.assign(mix(vec3(luminance(c)), c, PU.sat));
    c.assign(vibrance(c, PU.vibrance));
    // fade (lifted blacks)
    c.assign(mix(vec3(PU.fade), vec3(1), c.clamp(0, 1)));
    return mix(envGraded, c, mask);
  })();

  // ---------- stage D: film + projector overlays
  const film = Fn(() => {
    const u0 = uv();
    const px = u0.mul(PU.res);
    let c = vec3(graded).toVar();
    const l = luminance(c).clamp(0, 1);
    // grain
    const gp = floor(px.div(PU.grainSize));
    const gk = gp.x.add(gp.y.mul(1571.3)).add(PU.seed.mul(7.13));
    const gn = vec3(hash(gk), hash(gk.add(0.371)), hash(gk.add(0.917))).sub(0.5);
    const mono = gn.x;
    const g = mix(vec3(mono), gn, PU.grainColor).mul(mix(float(1), float(1).sub(l).mul(1.4).add(0.2), PU.grainLuma));
    c.addAssign(g.mul(PU.grain));
    // scanlines
    c.mulAssign(float(1).sub(PU.scan.mul(sin(px.y.mul(3.1416)).mul(0.5).add(0.5)).mul(0.6)));
    // speed streaks: thin dashes racing along the air flow
    {
      const d = PU.motionDir.normalize();
      const pa = vec2(u0.x.mul(aspect), u0.y);
      const along = dot(pa, vec2(d.x, d.y)), across = dot(pa, vec2(d.y.negate(), d.x));
      const lane = floor(across.mul(160));
      const hl = hash(lane.add(17.3));
      const on = step(float(1).sub(PU.streakDensity.mul(0.35)), hl);
      const seg = fract(along.mul(hl.mul(1.5).add(0.6)).add(PU.time.mul(PU.streakSpeed).mul(hl.mul(0.8).add(0.6))).add(hash(lane)));
      const dash = smoothstep(0.0, 0.08, seg).mul(smoothstep(0.55, 0.12, seg));
      const thin = smoothstep(0.5, 0.0, abs(fract(across.mul(160)).sub(0.5)));
      // streaks race across the bird (and its smear) only — never over background, dust or leaves
      c.addAssign(PU.streakColor.mul(on.mul(dash).mul(thin).mul(mask).mul(PU.streaks).mul(PU.motionAmt.min(1))).mul(0.55));
    }
    // dust specks (dark), new pattern every frame
    const cell = floor(u0.mul(vec2(aspect.mul(26), 26)));
    const ck = cell.x.add(cell.y.mul(97.13));
    const hc = hash(ck.add(PU.seed.mul(1.37)));
    const inCell = fract(u0.mul(vec2(aspect.mul(26), 26))).sub(0.5);
    const speck = step(float(1).sub(PU.specks.mul(0.012)), hc).mul(smoothstep(0.09, 0.03, length(inCell.mul(vec2(1, hash(ck.add(3.1)).mul(2).add(0.5))))));
    c.mulAssign(float(1).sub(speck.mul(0.85)));
    // vertical scratches
    const sx = PU.scratchX;
    const sline = (x) => exp(abs(u0.x.sub(x)).mul(PU.res.x).mul(-0.9)).mul(step(0, x));
    const scr = sline(sx.x).add(sline(sx.y)).add(sline(sx.z).mul(0.6)).add(sline(sx.w).mul(-0.8));
    c.addAssign(vec3(scr.mul(PU.scratches).mul(0.35)));
    // frame burn / splice flash
    const bd = length(u0.sub(PU.burnPos).mul(vec2(aspect, 1)));
    const burnM = smoothstep(0.55, 0.0, bd).mul(PU.burn);
    c.assign(mix(c, vec3(1.0, 0.72, 0.35).mul(1.4), burnM.clamp(0, 1)));
    // light leak
    const ld = length(u0.sub(PU.leakPos).mul(vec2(aspect, 1)));
    c.addAssign(PU.leakColor.mul(smoothstep(0.9, 0.0, ld).pow(2)).mul(PU.leak).mul(0.6));
    // lamp hotspot + vignette
    const cc = u0.sub(0.5).mul(vec2(aspect, 1));
    const r = length(cc);
    c.mulAssign(float(1).add(PU.hotspot.mul(0.35).sub(r.mul(r).mul(PU.hotspot).mul(1.2))));
    c.mulAssign(float(1).sub(PU.vignette.mul(smoothstep(float(0.98).sub(PU.vignetteSoft), 0.98, r))).max(0));
    // letterbox
    const L = PU.letterbox.max(0.001);
    const lb = step(0.001, PU.letterbox).mul(max(step(aspect.div(L).mul(0.5), abs(u0.y.sub(0.5))), step(L.div(aspect).mul(0.5), abs(u0.x.sub(0.5)))));
    // ---- negative (ink-on-paper, like an inverted print): black → warm paper, light → ink
    If(PU.neg.greaterThan(0.001), () => {
      const l0 = luminance(c.clamp(0, 1));
      const inv = float(1).sub(l0).pow(PU.negGamma);
      let n = mix(PU.negInk, PU.negPaper, inv);
      n = mix(n, vec3(1).sub(c.clamp(0, 1)), PU.negColor);            // 0 = monochrome paper, 1 = true colour negative
      // paper fibre / mottling
      const blot = sin(u0.x.mul(9.1).add(sin(u0.y.mul(5.3)).mul(1.7))).mul(sin(u0.y.mul(7.7).add(u0.x.mul(2.1)))).mul(0.5).add(0.5);
      n = n.mul(float(1).sub(PU.negPaperTex.mul(blot.mul(0.08))));   // soft mottling only — no fixed per-pixel fibre (read as static grain)
      // soft ink gradient from the top, like the reference's dark sky
      n = mix(n, PU.negInk, smoothstep(0.45, 0.0, u0.y).mul(PU.negSky));
      // wipe in/out: a soft edge sweeps across the frame while toggling
      const w = smoothstep(PU.neg.sub(0.08), PU.neg.add(0.08), float(1).sub(u0.x).mul(0.85).add(u0.y.mul(0.15)));
      c.assign(mix(c, n, float(1).sub(w)));
    });
    // ---- eyes & beak: painted last, so grade / negative never change them
    If(PU.markOn.greaterThan(0.5), () => {
      const q = lensUV(u0);
      const mk = birdT.uv(q);
      const beak = step(0.5, mk.g), eye = step(0.5, mk.b);
      const o = PU.outlineW.div(PU.res);
      const dil = float(0).toVar();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        dil.assign(max(dil, step(0.5, birdT.uv(q.add(o.mul(vec2(Math.cos(a), Math.sin(a))))).g)));
      }
      c.assign(mix(c, PU.outlineColor, dil.mul(float(1).sub(beak))));
      // 'match background': same colour as the backdrop at this height (paper in negative mode)
      const paper = mix(PU.negPaper, PU.negInk, smoothstep(0.45, 0.0, u0.y).mul(PU.negSky));
      const bgc = mix(PU.bgMatch, paper, PU.neg.clamp(0, 1));
      c.assign(mix(c, mix(PU.beakColor, bgc, PU.markBg), beak));
      c.assign(mix(c, PU.eyeFinal, eye));
    });
    c.mulAssign(float(1).sub(lb));
    return vec4(c.clamp(0, 1), 1);
  })();

  let aaN = P.fxaa ? fxaa(film) : film;
  if (P.sootheOn) {   // cursor fluid: bend the finished frame, then light + dither it
    const fin = convertToTexture(aaN);
    const stk = step(0.5, birdT.uv(uv()).a).mul(float(1).sub(step(0.5, birdT.uv(uv()).r)));   // click stickers (bird.a = 1, not the crow)
    aaN = vec4(mix(cursorColor(fin.uv(cursorUV(uv(), HU.s1)).rgb, uv(), screenCoordinate.xy, HU.s1), fin.uv(uv()).rgb, stk), 1);
  }
  aaN = vec4(paletteMap(aaN.rgb.clamp(0, 1), birdT.uv(uv()).z, HU.s1), 1);   // colour palette (the eye takes the accent)
  aaN = vec4(winFlip(aaN.rgb, HU.s1), 1);   // the win: light ↔ dark
  // print screen (dither / halftone) replaces the frame: it resamples the finished image per cell
  post.outputNode = vec4(screenFX(convertToTexture(aaN), HU.s1), 1);
  return post;
}
