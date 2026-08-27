/**
 * Drawing toolkit for the architectural construction animation.
 *
 * Everything lives in a fixed "paper" coordinate space (see `scene.ts`) and is
 * stroked with slightly imperfect lines so the result reads as ink and
 * graphite on paper rather than as vector art. Every wobble is derived from a
 * seed carried by the element itself — never from the clock — so lines shake
 * in place instead of boiling from frame to frame.
 *
 * The whole animation is a pure function of a normalised loop time `t` in
 * [0, 1): strokes are born, drawn, held and then lifted off the paper before
 * `t` comes back around, which is what makes the loop seamless.
 */

export type Pt = [number, number];

export const TAU = Math.PI * 2;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Deterministic PRNG — used at build time only, never per frame. */
export function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth pseudo-noise in roughly [-1, 1] as a function of a seed and a
 * distance travelled along a line (in paper units). Three octaves give a hand
 * that drifts slowly and trembles slightly.
 */
export function wob(seed: number, d: number): number {
  const s = seed * 0.7211 + 1.37;
  return (
    Math.sin(d * 0.0271 + s * 3.11) * 0.55 +
    Math.sin(d * 0.0669 + s * 7.93) * 0.3 +
    Math.sin(d * 0.1373 + s * 2.29) * 0.15
  );
}

/** Extends both ends of a polyline — the architect's crossing overshoot. */
export function overshoot(pts: Pt[], amount: number): Pt[] {
  if (pts.length < 2 || amount <= 0) return pts;
  const out = pts.map((p) => [p[0], p[1]] as Pt);
  const push = (a: Pt, b: Pt): Pt => {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const l = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx / l) * amount, a[1] + (dy / l) * amount];
  };
  out[0] = push(out[0], out[1]);
  out[out.length - 1] = push(out[out.length - 1], out[out.length - 2]);
  return out;
}

/**
 * Resamples a polyline and pushes each sample sideways by seeded noise. The
 * offset is a function of distance along the line, so the same wobble sticks
 * to a shape even when that shape moves (the crane jib, a walking figure).
 */
export function jitter(pts: Pt[], amp: number, seed: number, step = 34): Pt[] {
  if (pts.length < 2 || amp <= 0) return pts;

  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  if (total < 1e-3) return pts;

  const out: Pt[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const n = Math.max(1, Math.round(len / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const f = k / n;
      const d = dist + len * f;
      // Steadier where the pen lands and where it stops, so corners still meet.
      const grip = 0.32 + 0.68 * smoothstep(0, 48, Math.min(d, total - d));
      const o = wob(seed, d) * amp * grip;
      out.push([x0 + dx * f + nx * o, y0 + dy * f + ny * o]);
    }
    dist += len;
  }
  return out.length > 1 ? out : pts;
}

export type Measured = { pts: Pt[]; cum: number[]; len: number };

export function measure(pts: Pt[]): Measured {
  const cum = new Array<number>(pts.length);
  cum[0] = 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum[i] = len;
  }
  return { pts, cum, len };
}

export type Stroke = Measured & {
  /** Line width in paper units. */
  w: number;
  /** Base opacity — the whole palette is black at varying strength. */
  a: number;
  dash: number[] | null;
  /** Loop time the pen touches down. */
  t0: number;
  /** How long the stroke takes to draw, in loop units. */
  dur: number;
  /** Loop time the ink starts lifting, and how long that takes. */
  fs: number;
  fd: number;
  /** Draw a pen tip while the stroke is still being laid down. */
  tip: boolean;
};

export type StrokeOpts = {
  t: number;
  dur?: number;
  w?: number;
  a?: number;
  dash?: number[] | null;
  /** Wobble amplitude in paper units. 0 gives a ruled, technical line. */
  amp?: number;
  /** Crossing overshoot at both ends. */
  over?: number;
  /** Wobble frequency: sample step in paper units. */
  step?: number;
  seed?: number;
  /** 0 lifts first, 1 lifts last. Defaults to reverse drawing order. */
  fo?: number;
  tip?: boolean;
};

/**
 * When the drawing starts dissolving, and the span the dissolve is spread
 * over. A FADE_BEGIN of 1 or more disables the lift entirely — the loop is
 * then closed by the scene's page-slide instead of by fading ink.
 */
export const FADE_BEGIN = 1.5;
export const FADE_DUR = 0.05;
const FADE_SPREAD = 1 - FADE_BEGIN - FADE_DUR;
/** Strokes born after this are treated as pure annotation for fade ordering. */
const BUILD_END = 0.78;

export function makeStroke(raw: Pt[], o: StrokeOpts): Stroke {
  const seed = o.seed ?? raw.length * 13.7 + raw[0][0] * 0.31 + raw[0][1] * 0.17;
  const pts = jitter(overshoot(raw, o.over ?? 0), o.amp ?? 1.3, seed, o.step ?? 34);
  const fo = o.fo ?? clamp01(1 - o.t / BUILD_END);
  return {
    ...measure(pts),
    w: o.w ?? 1,
    a: o.a ?? 0.55,
    dash: o.dash ?? null,
    t0: o.t,
    dur: o.dur ?? 0.05,
    fs: FADE_BEGIN >= 1 ? 9 : FADE_BEGIN + fo * FADE_SPREAD,
    fd: FADE_DUR,
    tip: o.tip ?? false,
  };
}

/**
 * How far a stroke is drawn and how dark it is at loop time `t`.
 * Returns null while the stroke is off the paper.
 */
export function strokeState(s: Stroke, t: number): { p: number; a: number } | null {
  const raw = s.dur <= 0 ? 1 : (t - s.t0) / s.dur;
  if (raw <= 0) return null;
  const fade = 1 - smoothstep(s.fs, s.fs + s.fd, t);
  if (fade <= 0) return null;
  // Pen pressure: the first stretch of a stroke is lighter than the rest.
  const pressure = 0.4 + 0.6 * clamp01(raw * 5);
  const p = raw >= 1 ? 1 : raw * raw * (3 - 2 * raw);
  return { p, a: s.a * fade * pressure };
}

/**
 * The same birth / draw / hold / lift envelope as `strokeState`, for elements
 * that are rebuilt every frame instead of being baked into a stroke.
 */
export function windowState(
  t: number,
  t0: number,
  dur: number,
  fo?: number
): { p: number; k: number } | null {
  const raw = dur <= 0 ? 1 : (t - t0) / dur;
  if (raw <= 0) return null;
  const order = fo ?? clamp01(1 - t0 / BUILD_END);
  const fs = FADE_BEGIN >= 1 ? 9 : FADE_BEGIN + order * FADE_SPREAD;
  const fade = 1 - smoothstep(fs, fs + FADE_DUR, t);
  if (fade <= 0) return null;
  const p = raw >= 1 ? 1 : raw * raw * (3 - 2 * raw);
  return { p, k: fade * (0.4 + 0.6 * clamp01(raw * 5)) };
}

const NO_DASH: number[] = [];

/** Strokes a measured polyline up to `p` of its length. */
export function paint(
  ctx: CanvasRenderingContext2D,
  m: Measured,
  p: number,
  style: {
    w: number;
    a: number;
    dash?: number[] | null;
    tip?: boolean;
    /** Floor for the line width, in paper units — keeps hairlines visible
     *  once the paper is scaled down onto a small screen. */
    minW?: number;
  }
): void {
  const { pts, cum, len } = m;
  if (p <= 0 || style.a <= 0.004 || pts.length < 2) return;

  ctx.globalAlpha = style.a;
  ctx.lineWidth = Math.max(style.w, style.minW ?? 0);
  ctx.setLineDash(style.dash ?? NO_DASH);

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);

  let tx = pts[pts.length - 1][0];
  let ty = pts[pts.length - 1][1];

  if (p >= 1) {
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  } else {
    const target = p * len;
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] <= target) {
        ctx.lineTo(pts[i][0], pts[i][1]);
        continue;
      }
      const span = cum[i] - cum[i - 1] || 1;
      const f = (target - cum[i - 1]) / span;
      tx = lerp(pts[i - 1][0], pts[i][0], f);
      ty = lerp(pts[i - 1][1], pts[i][1], f);
      ctx.lineTo(tx, ty);
      break;
    }
  }
  ctx.stroke();

  // The pen itself: a small mark riding the leading edge of a live stroke.
  if (style.tip && p > 0.015 && p < 0.99) {
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = Math.min(0.5, style.a * 1.6);
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(1.1, style.w * 0.9), 0, TAU);
    ctx.fill();
  }
}

/** Paints a stroke that is rebuilt every frame (anything that moves). */
export function live(
  ctx: CanvasRenderingContext2D,
  raw: Pt[],
  o: {
    seed: number;
    w: number;
    a: number;
    p?: number;
    amp?: number;
    over?: number;
    step?: number;
    dash?: number[] | null;
    minW?: number;
    tip?: boolean;
  }
): void {
  const p = o.p ?? 1;
  if (p <= 0 || o.a <= 0.004 || raw.length < 2) return;
  const pts = jitter(overshoot(raw, o.over ?? 0), o.amp ?? 1.1, o.seed, o.step ?? 34);
  paint(ctx, measure(pts), p, o);
}

/** A filled ink dot — leader terminations, bolts, joints. */
export function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a: number
): void {
  if (a <= 0.004) return;
  ctx.globalAlpha = a;
  ctx.setLineDash(NO_DASH);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/* ------------------------------------------------------------------ *
 * Shape helpers — all return raw (un-jittered) polylines.
 * ------------------------------------------------------------------ */

export const seg = (a: Pt, b: Pt): Pt[] => [a, b];

export function rectPath(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
}

export function circlePath(cx: number, cy: number, r: number, steps = 26): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU - Math.PI * 0.5;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

export function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  steps = 18
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, a1, i / steps);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Zig-zag between two vertical rails — mast lattice, ladder bracing. */
export function zigzagV(
  xa: number,
  xb: number,
  yTop: number,
  yBottom: number,
  bays: number
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= bays; i++) {
    const y = lerp(yTop, yBottom, i / bays);
    pts.push([i % 2 === 0 ? xa : xb, y]);
  }
  return pts;
}

/** Zig-zag between two horizontal rails — jib and beam lattice. */
export function zigzagH(
  ya: number,
  yb: number,
  x0: number,
  x1: number,
  bays: number,
  y0Slope = 0,
  y1Slope = 0
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= bays; i++) {
    const f = i / bays;
    const x = lerp(x0, x1, f);
    const top = ya + y0Slope * f;
    const bottom = yb + y1Slope * f;
    pts.push([x, i % 2 === 0 ? top : bottom]);
  }
  return pts;
}

/** Liang–Barsky clip of a segment against an axis-aligned rect. */
function clipSeg(
  a: Pt,
  b: Pt,
  x: number,
  y: number,
  w: number,
  h: number
): Pt[] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - x, x + w - a[0], a[1] - y, y + h - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return null;
      continue;
    }
    const r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  if (t1 - t0 < 1e-4) return null;
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Section hatch (45°) clipped to a rectangle, as individual segments. */
export function hatchRect(
  x: number,
  y: number,
  w: number,
  h: number,
  spacing = 15,
  back = false
): Pt[][] {
  const out: Pt[][] = [];
  const span = w + h;
  for (let c = -h; c < span; c += spacing) {
    const a: Pt = back ? [x + c, y + h] : [x + c, y];
    const b: Pt = back ? [x + c + h, y] : [x + c + h, y + h];
    const clipped = clipSeg(a, b, x, y, w, h);
    if (clipped) out.push(clipped);
  }
  return out;
}
