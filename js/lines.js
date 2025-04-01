import { uniform, fwidth, smoothstep, abs, float } from 'three';

// One line thickness for the whole site. LINE.w = full line width in device pixels, used by the outline passes and
// by every pattern line drawn inside a material (boards, joints, cristae, ripples …), so they all match.
export const LINE = { w: uniform(2), pxAng: uniform(0.0005), wobAmp: uniform(1), wobScale: uniform(0.02), breakAmt: uniform(0.5) };
// coverage (0‥1) of a line centred where d = 0; d is any coordinate that varies smoothly across the line
export const inkLine = (d) => { const fw = fwidth(d).max(1e-6), half = LINE.w.mul(0.5).mul(fw); return float(1).sub(smoothstep(half.sub(fw.mul(0.5)), half.add(fw.mul(0.5)), abs(d))); };
