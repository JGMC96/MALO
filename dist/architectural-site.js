/* Dibujar la obra — animacion de obra en construccion, en perspectiva.
   Bucle de 40 s cerrado por cambio de hoja. Canvas 2D, sin dependencias.
   Compilado desde src/sketch.ts y src/scene.ts. */
(function () {
"use strict";
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
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(edge0, edge1, v) {
    const t = clamp01((v - edge0) / (edge1 - edge0 || 1e-6));
    return t * t * (3 - 2 * t);
}
const lerp = (a, b, f) => a + (b - a) * f;
/** Deterministic PRNG — used at build time only, never per frame. */
function makeRng(seed) {
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
function wob(seed, d) {
    const s = seed * 0.7211 + 1.37;
    return (Math.sin(d * 0.0271 + s * 3.11) * 0.55 +
        Math.sin(d * 0.0669 + s * 7.93) * 0.3 +
        Math.sin(d * 0.1373 + s * 2.29) * 0.15);
}
/** Extends both ends of a polyline — the architect's crossing overshoot. */
function overshoot(pts, amount) {
    if (pts.length < 2 || amount <= 0)
        return pts;
    const out = pts.map((p) => [p[0], p[1]]);
    const push = (a, b) => {
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
function jitter(pts, amp, seed, step = 34) {
    if (pts.length < 2 || amp <= 0)
        return pts;
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
    if (total < 1e-3)
        return pts;
    const out = [];
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1e-3)
            continue;
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
function measure(pts) {
    const cum = new Array(pts.length);
    cum[0] = 0;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        cum[i] = len;
    }
    return { pts, cum, len };
}
/**
 * When the drawing starts dissolving, and the span the dissolve is spread
 * over. A FADE_BEGIN of 1 or more disables the lift entirely — the loop is
 * then closed by the scene's page-slide instead of by fading ink.
 */
const FADE_BEGIN = 1.5;
const FADE_DUR = 0.05;
const FADE_SPREAD = 1 - FADE_BEGIN - FADE_DUR;
/** Strokes born after this are treated as pure annotation for fade ordering. */
const BUILD_END = 0.78;
function makeStroke(raw, o) {
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
function strokeState(s, t) {
    const raw = s.dur <= 0 ? 1 : (t - s.t0) / s.dur;
    if (raw <= 0)
        return null;
    const fade = 1 - smoothstep(s.fs, s.fs + s.fd, t);
    if (fade <= 0)
        return null;
    // Pen pressure: the first stretch of a stroke is lighter than the rest.
    const pressure = 0.4 + 0.6 * clamp01(raw * 5);
    const p = raw >= 1 ? 1 : raw * raw * (3 - 2 * raw);
    return { p, a: s.a * fade * pressure };
}
/**
 * The same birth / draw / hold / lift envelope as `strokeState`, for elements
 * that are rebuilt every frame instead of being baked into a stroke.
 */
function windowState(t, t0, dur, fo) {
    const raw = dur <= 0 ? 1 : (t - t0) / dur;
    if (raw <= 0)
        return null;
    const order = fo ?? clamp01(1 - t0 / BUILD_END);
    const fs = FADE_BEGIN >= 1 ? 9 : FADE_BEGIN + order * FADE_SPREAD;
    const fade = 1 - smoothstep(fs, fs + FADE_DUR, t);
    if (fade <= 0)
        return null;
    const p = raw >= 1 ? 1 : raw * raw * (3 - 2 * raw);
    return { p, k: fade * (0.4 + 0.6 * clamp01(raw * 5)) };
}
const NO_DASH = [];
/** Strokes a measured polyline up to `p` of its length. */
function paint(ctx, m, p, style) {
    const { pts, cum, len } = m;
    if (p <= 0 || style.a <= 0.004 || pts.length < 2)
        return;
    ctx.globalAlpha = style.a;
    ctx.lineWidth = Math.max(style.w, style.minW ?? 0);
    ctx.setLineDash(style.dash ?? NO_DASH);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    let tx = pts[pts.length - 1][0];
    let ty = pts[pts.length - 1][1];
    if (p >= 1) {
        for (let i = 1; i < pts.length; i++)
            ctx.lineTo(pts[i][0], pts[i][1]);
    }
    else {
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
function live(ctx, raw, o) {
    const p = o.p ?? 1;
    if (p <= 0 || o.a <= 0.004 || raw.length < 2)
        return;
    const pts = jitter(overshoot(raw, o.over ?? 0), o.amp ?? 1.1, o.seed, o.step ?? 34);
    paint(ctx, measure(pts), p, o);
}
/** A filled ink dot — leader terminations, bolts, joints. */
function dot(ctx, x, y, r, a) {
    if (a <= 0.004)
        return;
    ctx.globalAlpha = a;
    ctx.setLineDash(NO_DASH);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
}
/* ------------------------------------------------------------------ *
 * Shape helpers — all return raw (un-jittered) polylines.
 * ------------------------------------------------------------------ */
const seg = (a, b) => [a, b];
function rectPath(x, y, w, h) {
    return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
    ];
}
function circlePath(cx, cy, r, steps = 26) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU - Math.PI * 0.5;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}
function arcPath(cx, cy, r, a0, a1, steps = 18) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = lerp(a0, a1, i / steps);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}
/** Zig-zag between two vertical rails — mast lattice, ladder bracing. */
function zigzagV(xa, xb, yTop, yBottom, bays) {
    const pts = [];
    for (let i = 0; i <= bays; i++) {
        const y = lerp(yTop, yBottom, i / bays);
        pts.push([i % 2 === 0 ? xa : xb, y]);
    }
    return pts;
}
/** Zig-zag between two horizontal rails — jib and beam lattice. */
function zigzagH(ya, yb, x0, x1, bays, y0Slope = 0, y1Slope = 0) {
    const pts = [];
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
function clipSeg(a, b, x, y, w, h) {
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy];
    const q = [a[0] - x, x + w - a[0], a[1] - y, y + h - a[1]];
    for (let i = 0; i < 4; i++) {
        if (Math.abs(p[i]) < 1e-9) {
            if (q[i] < 0)
                return null;
            continue;
        }
        const r = q[i] / p[i];
        if (p[i] < 0) {
            if (r > t1)
                return null;
            if (r > t0)
                t0 = r;
        }
        else {
            if (r < t0)
                return null;
            if (r < t1)
                t1 = r;
        }
    }
    if (t1 - t0 < 1e-4)
        return null;
    return [
        [a[0] + dx * t0, a[1] + dy * t0],
        [a[0] + dx * t1, a[1] + dy * t1],
    ];
}
/** Section hatch (45°) clipped to a rectangle, as individual segments. */
function hatchRect(x, y, w, h, spacing = 15, back = false) {
    const out = [];
    const span = w + h;
    for (let c = -h; c < span; c += spacing) {
        const a = back ? [x + c, y + h] : [x + c, y];
        const b = back ? [x + c + h, y] : [x + c + h, y + h];
        const clipped = clipSeg(a, b, x, y, w, h);
        if (clipped)
            out.push(clipped);
    }
    return out;
}

/**
 * The construction site as a timed architectural drawing — perspective cut.
 *
 * Everything is authored in metres in a 3D world (x along the building,
 * y up, z toward the viewer) and pushed through a fixed pinhole camera onto
 * the same 1600 x 1000 sheet the flat version used. The look follows the
 * reference: a concrete frame in two-point-ish perspective, a tower crane
 * over it, trenches and rebar in the foreground, material stacks to the
 * right, and soft grey washes on the concrete faces under crisp ink lines.
 *
 * The loop contract is unchanged: every element carries the loop time its
 * pen touches down; everything that moves completes a whole number of
 * cycles per loop; past FADE_BEGIN the ink lifts in reverse and the sheet
 * is blank exactly at t = 1.
 */
const PAPER = { w: 1600, h: 1000 };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const norm3 = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};
const EYE = [21, 8.5, 30];
const TGT = [-5.5, 4.6, -2];
const FOCAL = 1200;
const CX = 815;
const CY = 515;
const FW = norm3(sub(TGT, EYE));
const RT = norm3(cross(FW, [0, 1, 0]));
const UP = cross(RT, FW);
/** World point → paper point. */
function P(p) {
    const d = sub(p, EYE);
    const zc = dot3(d, FW);
    const s = FOCAL / Math.max(zc, 1);
    return [CX + dot3(d, RT) * s, CY - dot3(d, UP) * s];
}
const seg3 = (a, b) => [P(a), P(b)];
const path3 = (pts) => pts.map(P);
/** Circle lying on the ground plane. */
function circle3(cx, cz, r, steps = 22) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU;
        pts.push([cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]);
    }
    return path3(pts);
}
/* --- Layout (metres) ---------------------------------------------------- */
// Building footprint: front face at z = 0, right face at x = 0.
const XL = -21;
const XR = 0;
const ZB = -12.6;
const ZF = 0;
const BAY = 4.2;
const LVL = [0, 3.8, 7.6]; // top of foundation, slab 1, roof
const TH = 0.35; // slab thickness
const CW = 0.19; // column half width
// Core (rises past the roof, right-of-centre like the reference).
const CORE = { xl: -6.4, xr: -1.6, zb: -9.4, zf: -4.6, top: 9.8 };
// Crane, standing to the right and slightly behind the building front.
const CR = { x: 9.0, z: -5.5, top: 16.6, hw: 0.8, jibY: 17.2, apex: 19.2 };
const JIB = 17.5;
const CJIB = 3.8;
const BUILD_DONE = 0.78;
class Ink {
    constructor() {
        this.strokes = [];
        this.washes = [];
        this.n = 0;
    }
    add(pts, o) {
        if (pts.length < 2)
            return;
        this.n += 1;
        this.strokes.push(makeStroke(pts, { ...o, seed: o.seed ?? this.n * 2.371 + 0.73 }));
    }
    many(list, o, stagger = 0) {
        list.forEach((pts, i) => this.add(pts, { ...o, t: o.t + i * stagger }));
    }
    /** A flat tone laid under the linework — graphite side of the palette. */
    wash(pts, o) {
        const fo = o.fo ?? clamp01(1 - o.t / BUILD_DONE);
        this.washes.push({
            pts,
            a: o.a,
            t0: o.t,
            dur: o.dur ?? 0.05,
            fs: FADE_BEGIN >= 1 ? 9 : FADE_BEGIN + fo * (1 - FADE_BEGIN - FADE_DUR),
        });
    }
}
/* --- Small idioms -------------------------------------------------------- */
const tick = (x, y, r = 7) => [
    [x - r, y + r],
    [x + r, y - r],
];
const triangle = (x, y, r) => [
    [x - r, y - r * 1.5],
    [x + r, y - r * 1.5],
    [x, y],
    [x - r, y - r * 1.5],
];
/** The two vertical edges of a column, offset along a facade direction. */
function colEdges(x, z, y0, y1, dx, dz) {
    return [
        seg3([x - dx * CW, y0, z - dz * CW], [x - dx * CW, y1, z - dz * CW]),
        seg3([x + dx * CW, y0, z + dz * CW], [x + dx * CW, y1, z + dz * CW]),
    ];
}
/** Zigzag between two projected rails of equal length. */
function latticeBetween(a, b) {
    const out = [];
    for (let i = 0; i < a.length; i++)
        out.push(i % 2 === 0 ? a[i] : b[i]);
    return out;
}
/* --- Ground and setting out ---------------------------------------------- */
function ground(ink, full) {
    // The first line on the sheet: the front edge of the site.
    ink.add(seg3([-24.5, 0, 8.4], [15.5, 0, 8.4]), {
        t: 0, dur: 0.055, w: 1.35, a: 0.5, amp: 1.7, step: 64, tip: true,
    });
    // A second, fainter pass just behind it.
    ink.add(seg3([-22, 0, 8.9], [13, 0, 8.9]), {
        t: 0.012, dur: 0.06, w: 0.8, a: 0.12, amp: 2.4, step: 84,
    });
    // Two loose gestures feeling out the massing before anything is set out.
    ink.add(path3([[-23, 1.2, 2], [-14, 9.6, -3], [0, 10.4, -6], [12, 6.5, -6]]), {
        t: 0.004, dur: 0.05, w: 1, a: 0.05, amp: 5, step: 76,
    });
    ink.add(path3([[-20, 0.5, 6], [-8, 8.6, 0], [6, 6.5, -2]]), {
        t: 0.016, dur: 0.05, w: 1, a: 0.035, amp: 6, step: 76,
    });
    // Ghost of the finished massing, dashed, before a single column exists.
    ink.add(path3([
        [XL, 0, ZF], [XL, LVL[2] + TH, ZF], [XR, LVL[2] + TH, ZF],
        [XR, 0, ZF],
    ]), { t: 0.026, dur: 0.045, w: 0.8, a: 0.1, dash: [12, 8], amp: 1.2 });
    ink.add(path3([[XR, LVL[2] + TH, ZF], [XR, LVL[2] + TH, ZB], [XR, 0, ZB]]), {
        t: 0.042, dur: 0.035, w: 0.8, a: 0.08, dash: [12, 8], amp: 1.2,
    });
    // Setting-out lines through the footprint, dash-dot, and the front grid.
    [XL, XL + 2 * BAY, XL + 3 * BAY, XR].forEach((x, i) => {
        ink.add(seg3([x, 0, ZB - 1.5], [x, 0, 6.4]), {
            t: 0.045 + i * 0.014, dur: 0.06, w: 0.8, a: 0.15,
            dash: [22, 6, 3, 6], step: 120,
        });
    });
    [ZF + 1.2, ZB].forEach((z, i) => {
        ink.add(seg3([XL - 3.5, 0, z], [XR + 4, 0, z]), {
            t: 0.06 + i * 0.016, dur: 0.05, w: 0.75, a: 0.12,
            dash: [22, 6, 3, 6], step: 120,
        });
    });
    // Axis verticals rising into the air off the two front corners, with
    // their grid bubbles floating at the top — the reference's survey poles.
    [[XL, 12.6], [XR, 13.4]].forEach(([x, top], i) => {
        ink.add(seg3([x, 0, ZF], [x, top, ZF]), {
            t: 0.07 + i * 0.02, dur: 0.05, w: 0.75, a: 0.14, dash: [3, 7], step: 90,
        });
        const b = P([x, top, ZF]);
        ink.add(circlePath(b[0], b[1] - 15, 15, 16), {
            t: 0.098 + i * 0.02, dur: 0.04, w: 1, a: 0.3, amp: 0.9,
        });
    });
    // Survey marks on the ground: circle-and-cross targets.
    [[-13.5, 4.6], [6.2, 5.4]].forEach(([x, z], i) => {
        ink.add(circle3(x, z, 0.65), { t: 0.08 + i * 0.014, dur: 0.024, w: 0.9, a: 0.26, amp: 0.6 });
        ink.add(seg3([x - 1.2, 0, z], [x + 1.2, 0, z]), { t: 0.09 + i * 0.014, dur: 0.01, w: 0.8, a: 0.22, amp: 0.4 });
        ink.add(seg3([x, 0, z - 1.2], [x, 0, z + 1.2]), { t: 0.094 + i * 0.014, dur: 0.01, w: 0.8, a: 0.22, amp: 0.4 });
    });
    // A soft tone across the slab-on-grade area.
    ink.wash(path3([[XL, 0, ZF], [XR, 0, ZF], [XR, 0, ZB], [XL, 0, ZB]]), {
        t: 0.14, dur: 0.08, a: 0.028,
    });
    if (full) {
        // Short survey ticks along the front edge, left and right of the works.
        const ticks = [];
        for (let x = -23; x < 15; x += 2.6) {
            if (x < -20 || x > 12)
                ticks.push(seg3([x, 0, 8.4], [x - 0.5, 0, 9.1]));
        }
        ink.many(ticks, { t: 0.1, dur: 0.016, w: 0.8, a: 0.12, amp: 0.6 }, 0.002);
    }
}
/* --- Excavation, footings, rebar ----------------------------------------- */
function pit(ink, x0, x1, z0, z1, d, t, full) {
    const i = 0.55; // batter inset
    // Top edge of the cut.
    ink.add(path3([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, 0, z0]]), {
        t, dur: 0.05, w: 1.05, a: 0.4, amp: 1.1, over: 1.5,
    });
    // Bottom of the cut, inset by the batter.
    ink.add(path3([
        [x0 + i, -d, z0 + i], [x1 - i, -d, z0 + i],
        [x1 - i, -d, z1 - i], [x0 + i, -d, z1 - i], [x0 + i, -d, z0 + i],
    ]), { t: t + 0.018, dur: 0.045, w: 0.9, a: 0.3, amp: 0.9 });
    // Batter lines at the three visible corners.
    [[x0, z1], [x1, z1], [x1, z0]].forEach(([px, pz], k) => {
        const bx = px === x0 ? px + i : px - i;
        const bz = pz === z0 ? pz + i : pz - i;
        ink.add(seg3([px, 0, pz], [bx, -d, bz]), {
            t: t + 0.03 + k * 0.005, dur: 0.012, w: 0.85, a: 0.28, amp: 0.5,
        });
    });
    // Tone on the far wall of the cut.
    ink.wash(path3([[x0, 0, z0], [x1, 0, z0], [x1 - i, -d, z0 + i], [x0 + i, -d, z0 + i]]), {
        t: t + 0.03, dur: 0.05, a: 0.055,
    });
    if (full) {
        // A footing pad sitting on the pit floor with its starter bars.
        const px = (x0 + x1) / 2;
        const pz = (z0 + z1) / 2;
        ink.add(path3([
            [px - 1.1, -d + 0.45, pz - 0.8], [px + 1.1, -d + 0.45, pz - 0.8],
            [px + 1.1, -d + 0.45, pz + 0.8], [px - 1.1, -d + 0.45, pz + 0.8],
            [px - 1.1, -d + 0.45, pz - 0.8],
        ]), { t: t + 0.04, dur: 0.03, w: 0.95, a: 0.34, amp: 0.7 });
        for (let b = -1; b <= 1; b++) {
            ink.add(path3([
                [px + b * 0.35, -d + 0.45, pz], [px + b * 0.35, 1.15 - d + 0.9, pz],
                [px + b * 0.35 + 0.22, 1.15 - d + 1.05, pz],
            ]), { t: t + 0.055 + (b + 1) * 0.004, dur: 0.014, w: 0.7, a: 0.34, amp: 0.6 });
        }
    }
}
function excavation(ink, full) {
    pit(ink, -19.5, -8.5, 4.0, 6.9, 1.15, 0.088, full);
    pit(ink, -6.2, -1.8, 4.6, 7.1, 0.9, 0.118, full);
    // A row of starter bars waiting along the front, tied through the middle.
    const bars = [];
    for (let x = -17.2; x <= -9.6; x += 0.74) {
        bars.push(path3([[x, 0, 3.2], [x, 1.15, 3.2], [x + 0.18, 1.32, 3.2]]));
    }
    ink.many(bars, { t: 0.138, dur: 0.012, w: 0.7, a: 0.3, amp: 0.5 }, 0.0018);
    ink.add(seg3([-17.4, 0.62, 3.2], [-9.4, 0.62, 3.2]), {
        t: 0.165, dur: 0.024, w: 0.7, a: 0.22, amp: 0.7,
    });
    ink.add(seg3([-17.4, 0.18, 3.2], [-9.4, 0.18, 3.2]), {
        t: 0.172, dur: 0.024, w: 0.7, a: 0.18, amp: 0.7,
    });
}
/* --- The frame ------------------------------------------------------------ */
function slab(ink, y, x1, t, full) {
    const yt = y + TH;
    // Top outline, drawn as one long pass around the visible edges.
    ink.add(path3([
        [XL, yt, ZB], [x1, yt, ZB], [x1, yt, ZF], [XL, yt, ZF], [XL, yt, ZB],
    ]), { t, dur: 0.08, w: 1.35, a: 0.6, amp: 1.1, over: 2, tip: true });
    // Soffit lines along the two visible faces.
    ink.add(seg3([XL, y, ZF], [x1, y, ZF]), {
        t: t + 0.016, dur: 0.055, w: 1, a: 0.4, amp: 1, over: 2,
    });
    ink.add(seg3([x1, y, ZF], [x1, y, ZB]), {
        t: t + 0.03, dur: 0.04, w: 1, a: 0.36, amp: 1, over: 2,
    });
    // Slab-edge verticals at the three visible corners.
    [[XL, ZF], [x1, ZF], [x1, ZB]].forEach(([px, pz], k) => {
        ink.add(seg3([px, y, pz], [px, yt, pz]), {
            t: t + 0.045 + k * 0.004, dur: 0.01, w: 1, a: 0.4, amp: 0.4,
        });
    });
    // Shadow band under the slab edge.
    ink.wash(path3([[XL, y, ZF], [x1, y, ZF], [x1, yt, ZF], [XL, yt, ZF]]), {
        t: t + 0.05, dur: 0.04, a: 0.06,
    });
    ink.wash(path3([[x1, y, ZF], [x1, y, ZB], [x1, yt, ZB], [x1, yt, ZF]]), {
        t: t + 0.055, dur: 0.04, a: 0.085,
    });
    if (full) {
        // A couple of downstand beam lines under the soffit, along the front.
        ink.add(seg3([XL + 0.5, y - 0.45, ZF - 0.02], [x1 - 0.5, y - 0.45, ZF - 0.02]), {
            t: t + 0.06, dur: 0.035, w: 0.8, a: 0.2, amp: 0.9,
        });
    }
}
function frame(ink, full) {
    // Ground-floor columns: the front row and the right row.
    for (let lvl = 0; lvl < 2; lvl++) {
        const y0 = LVL[lvl] + (lvl ? TH : 0);
        const y1 = LVL[lvl + 1];
        const t0 = 0.16 + lvl * 0.12;
        for (let i = 0; i <= 5; i++) {
            const x = XL + i * (21 / 5);
            colEdges(x, ZF, y0, y1, 1, 0).forEach((e, n) => ink.add(e, {
                t: t0 + i * 0.011 + n * 0.005, dur: 0.045, w: 1.25, a: 0.58,
                amp: 0.9, over: 1.6, tip: n === 0,
            }));
        }
        for (let k = 1; k <= 3; k++) {
            const z = ZF - k * BAY;
            colEdges(XR, z, y0, y1, 0, 1).forEach((e, n) => ink.add(e, {
                t: t0 + 0.066 + k * 0.011 + n * 0.005, dur: 0.045, w: 1.15,
                a: 0.5, amp: 0.9, over: 1.6,
            }));
        }
        if (full) {
            // Two interior columns read through the frame, fainter.
            for (const [x, z] of [[-12.6, -8.4], [-4.2, -8.4]]) {
                colEdges(x, z, y0, y1, 1, 0).forEach((e, n) => ink.add(e, {
                    t: t0 + 0.09 + n * 0.005, dur: 0.04, w: 0.9, a: 0.26, amp: 0.8,
                }));
            }
        }
    }
    slab(ink, LVL[1], XR, 0.225, full);
    // Prop shores still standing under the fresh slab.
    if (full) {
        const props = [];
        for (const px of [-17.5, -13.3, -9.1, -4.9]) {
            for (const pz of [-2.2, -6.6])
                props.push(seg3([px, 0, pz], [px, LVL[1], pz]));
        }
        ink.many(props, { t: 0.3, dur: 0.016, w: 0.7, a: 0.2, amp: 0.5 }, 0.003);
    }
    // Formwork panels leaning against the slab edge, waiting to go up.
    for (let i = 0; i < 3; i++) {
        const x0 = -7.3 - i * 0.5;
        ink.add(path3([
            [x0, 0, 1.5], [x0 - 0.4, 2.55, 0.4], [x0 - 1.5, 2.55, 0.4], [x0 - 1.1, 0, 1.5], [x0, 0, 1.5],
        ]), { t: 0.565 + i * 0.01, dur: 0.02, w: 0.8, a: 0.24 - i * 0.03, amp: 0.7 });
    }
    // Roof: slab over the left three bays, open beams over the right two.
    const xEdge = XL + 3 * (21 / 5);
    slab(ink, LVL[2], xEdge, 0.345, full);
    // Edge beams around the open bays.
    ink.add(path3([
        [xEdge, LVL[2] + TH, ZF], [XR, LVL[2] + TH, ZF], [XR, LVL[2] + TH, ZB],
    ]), { t: 0.405, dur: 0.05, w: 1.2, a: 0.52, amp: 1, over: 2, tip: true });
    ink.add(path3([
        [xEdge, LVL[2], ZF], [XR, LVL[2], ZF], [XR, LVL[2], ZB],
    ]), { t: 0.418, dur: 0.05, w: 0.95, a: 0.36, amp: 1 });
    if (full) {
        for (const z of [-4.2, -8.4]) {
            ink.add(seg3([xEdge, LVL[2] + TH, z], [XR, LVL[2] + TH, z]), {
                t: 0.432 + (z === -8.4 ? 0.008 : 0), dur: 0.02, w: 0.85, a: 0.26, amp: 0.8,
            });
        }
    }
    // Starter bars sprouting from the columns that will carry the next pour.
    const heads = [
        [XR, ZF], [XR, -4.2], [XR, -8.4], [xEdge + 0.02, ZF], [-4.2, ZF],
    ];
    heads.forEach(([x, z], k) => {
        for (let b = -1; b <= 1; b++) {
            ink.add(path3([
                [x + b * 0.12, LVL[2] + TH, z], [x + b * 0.12, LVL[2] + 1.9, z],
                [x + b * 0.12 + 0.16, LVL[2] + 2.05, z],
            ]), {
                t: 0.45 + k * 0.009 + (b + 1) * 0.003, dur: 0.014, w: 0.7, a: 0.36, amp: 0.6,
            });
        }
    });
    // Guardrails along the first slab's front and right edges.
    const gy = LVL[1] + TH;
    const posts = [];
    for (let x = XL + 0.6; x <= XR - 0.4; x += 2.9)
        posts.push(seg3([x, gy, ZF], [x, gy + 1.1, ZF]));
    for (let z = ZF - 2.4; z >= ZB + 0.6; z -= 3.0)
        posts.push(seg3([XR, gy, z], [XR, gy + 1.1, z]));
    ink.many(posts, { t: 0.43, dur: 0.01, w: 0.8, a: 0.32, amp: 0.5 }, 0.0022);
    [1.1, 0.6].forEach((h, n) => {
        ink.add(path3([[XL + 0.4, gy + h, ZF], [XR, gy + h, ZF], [XR, gy + h, ZB + 0.4]]), {
            t: 0.455 + n * 0.012, dur: 0.045, w: 0.75, a: 0.28, amp: 0.9,
        });
    });
}
/* --- Core and its scaffold ------------------------------------------------ */
function core(ink, full) {
    const { xl, xr, zb, zf, top } = CORE;
    // The three visible vertical edges rise first.
    [[xr, zf], [xl, zf], [xr, zb]].forEach(([x, z], k) => {
        ink.add(seg3([x, 0, z], [x, top, z]), {
            t: 0.36 + k * 0.012, dur: 0.06, w: 1.2, a: 0.5, amp: 0.9, tip: k === 0,
        });
    });
    ink.add(path3([[xl, top, zf], [xr, top, zf], [xr, top, zb]]), {
        t: 0.405, dur: 0.03, w: 1.2, a: 0.5, amp: 0.9, over: 1.5,
    });
    // Lift joints from the successive pours.
    [3.3, 6.6].forEach((y, n) => {
        ink.add(path3([[xl, y, zf], [xr, y, zf], [xr, y, zb]]), {
            t: 0.42 + n * 0.012, dur: 0.03, w: 0.7, a: 0.2, amp: 0.7,
        });
    });
    // Washes: the front face light, the return face darker.
    ink.wash(path3([[xl, 0, zf], [xr, 0, zf], [xr, top, zf], [xl, top, zf]]), {
        t: 0.43, dur: 0.06, a: 0.05,
    });
    ink.wash(path3([[xr, 0, zf], [xr, 0, zb], [xr, top, zb], [xr, top, zf]]), {
        t: 0.445, dur: 0.06, a: 0.09,
    });
    // Door void on the front face.
    ink.add(path3([[-5.3, 0, zf], [-5.3, 2.2, zf], [-4.2, 2.2, zf], [-4.2, 0, zf]]), {
        t: 0.46, dur: 0.024, w: 0.9, a: 0.34, amp: 0.6,
    });
    ink.wash(path3([[-5.3, 0, zf], [-4.2, 0, zf], [-4.2, 2.2, zf], [-5.3, 2.2, zf]]), {
        t: 0.475, dur: 0.04, a: 0.13,
    });
    // Light access scaffold against the core, standing on the roof.
    const sx = xr + 0.55;
    const sTop = top + 0.7;
    [zb + 0.3, (zb + zf) / 2, zf - 0.3].forEach((z, k) => {
        ink.add(seg3([sx, LVL[2] + TH, z], [sx, sTop, z]), {
            t: 0.5 + k * 0.01, dur: 0.03, w: 0.9, a: 0.34, amp: 0.8,
        });
    });
    [LVL[2] + 1.5, top - 0.9].forEach((y, n) => {
        ink.add(seg3([sx, y, zb + 0.2], [sx, y, zf - 0.2]), {
            t: 0.525 + n * 0.01, dur: 0.02, w: 0.8, a: 0.3, amp: 0.7,
        });
    });
    ink.add(seg3([sx, LVL[2] + 1.5, zb + 0.3], [sx, top - 0.9, zf - 0.3]), {
        t: 0.545, dur: 0.018, w: 0.75, a: 0.22, amp: 0.8,
    });
    if (full) {
        // Board line of the working platform.
        ink.add(seg3([sx + 0.3, top - 0.9, zb + 0.2], [sx + 0.3, top - 0.9, zf - 0.2]), {
            t: 0.555, dur: 0.016, w: 0.9, a: 0.3, amp: 0.6,
        });
    }
}
/* --- Crane: the static parts ---------------------------------------------- */
function craneStatic(ink, full) {
    const { x, z, top, hw } = CR;
    // Ballast base.
    ink.add(path3([
        [x - 1.9, 0.55, z + 1.9], [x + 1.9, 0.55, z + 1.9],
        [x + 1.9, 0.55, z - 1.9], [x + 1.9, 0, z - 1.9],
    ]), { t: 0.24, dur: 0.03, w: 1.05, a: 0.42, amp: 0.8 });
    ink.add(seg3([x - 1.9, 0, z + 1.9], [x + 1.9, 0, z + 1.9]), {
        t: 0.25, dur: 0.014, w: 1, a: 0.36, amp: 0.7,
    });
    ink.add(seg3([x - 1.9, 0, z + 1.9], [x - 1.9, 0.55, z + 1.9]), {
        t: 0.255, dur: 0.008, w: 1, a: 0.34, amp: 0.5,
    });
    ink.wash(path3([
        [x - 1.9, 0, z + 1.9], [x + 1.9, 0, z + 1.9],
        [x + 1.9, 0.55, z + 1.9], [x - 1.9, 0.55, z + 1.9],
    ]), { t: 0.26, dur: 0.04, a: 0.07 });
    // Mast legs: the three visible chords climb first.
    const legs = [
        [x - hw, z + hw], [x + hw, z + hw], [x + hw, z - hw],
    ];
    legs.forEach(([lx, lz], k) => {
        ink.add(seg3([lx, 0.55, lz], [lx, top, lz]), {
            t: 0.252 + k * 0.011, dur: 0.08, w: 1.15, a: 0.52, amp: 0.85,
            step: 90, tip: k === 0,
        });
    });
    // Lattice: one zigzag per visible face, climbing with the chords.
    const panels = 11;
    const face = (a, b, t0) => {
        const ra = [];
        const rb = [];
        for (let i = 0; i <= panels; i++) {
            const y = lerp(0.55, top, i / panels);
            ra.push(P([a[0], y, a[1]]));
            rb.push(P([b[0], y, b[1]]));
        }
        ink.add(latticeBetween(ra, rb), {
            t: t0, dur: 0.07, w: 0.75, a: 0.3, amp: 0.6, step: 60,
        });
        if (full) {
            for (let i = 2; i <= panels; i += 3) {
                const y = lerp(0.55, top, i / panels);
                ink.add(seg3([a[0], y, a[1]], [b[0], y, b[1]]), {
                    t: t0 + 0.02 + i * 0.003, dur: 0.008, w: 0.7, a: 0.24, amp: 0.4,
                });
            }
        }
    };
    face([x - hw, z + hw], [x + hw, z + hw], 0.29);
    face([x + hw, z + hw], [x + hw, z - hw], 0.305);
    // Slewing platform.
    ink.add(path3([
        [x - 1.1, top, z + 1.1], [x + 1.1, top, z + 1.1],
        [x + 1.1, top + 0.5, z + 1.1], [x - 1.1, top + 0.5, z + 1.1],
        [x - 1.1, top, z + 1.1],
    ]), { t: 0.352, dur: 0.024, w: 1, a: 0.4, amp: 0.6 });
}
/* --- Materials, ladder, small site kit ------------------------------------ */
function materials(ink, full) {
    // Long steel profiles laid flat, running toward the viewer.
    for (let i = 0; i < 3; i++) {
        const x0 = 4.2 + i * 1.05;
        ink.add(path3([
            [x0, 0.3, 2.6], [x0, 0.3, 7.2], [x0 + 0.7, 0.3, 7.2], [x0 + 0.7, 0.3, 2.6], [x0, 0.3, 2.6],
        ]), { t: 0.52 + i * 0.012, dur: 0.03, w: 0.95, a: 0.38, amp: 0.7 });
        ink.add(seg3([x0, 0, 7.2], [x0 + 0.7, 0, 7.2]), {
            t: 0.535 + i * 0.012, dur: 0.008, w: 0.85, a: 0.3, amp: 0.4,
        });
        ink.add(seg3([x0, 0.3, 7.2], [x0, 0, 7.2]), {
            t: 0.54 + i * 0.012, dur: 0.006, w: 0.85, a: 0.3, amp: 0.4,
        });
        ink.add(seg3([x0 + 0.7, 0.3, 7.2], [x0 + 0.7, 0, 7.2]), {
            t: 0.542 + i * 0.012, dur: 0.006, w: 0.85, a: 0.3, amp: 0.4,
        });
    }
    // A stack of hollow sections seen end-on, pyramid-fashion.
    const sq = (x, y, s, t) => {
        ink.add(path3([
            [x, y, 5.9], [x + s, y, 5.9], [x + s, y + s, 5.9], [x, y + s, 5.9], [x, y, 5.9],
        ]), { t, dur: 0.014, w: 0.9, a: 0.4, amp: 0.5 });
        ink.add(path3([
            [x + 0.12, y + 0.12, 5.9], [x + s - 0.12, y + 0.12, 5.9],
            [x + s - 0.12, y + s - 0.12, 5.9],
        ]), { t: t + 0.006, dur: 0.01, w: 0.7, a: 0.24, amp: 0.4 });
        // Length lines running away from the viewer.
        ink.add(seg3([x, y + s, 5.9], [x, y + s, 2.9]), { t: t + 0.01, dur: 0.012, w: 0.75, a: 0.24, amp: 0.5 });
    };
    for (let i = 0; i < 3; i++)
        sq(8.8 + i * 0.56, 0, 0.5, 0.556 + i * 0.01);
    for (let i = 0; i < 2; i++)
        sq(9.08 + i * 0.56, 0.52, 0.5, 0.585 + i * 0.01);
    ink.wash(path3([
        [8.8, 0, 5.9], [10.48, 0, 5.9], [10.48, 0.5, 5.9], [10.14, 1.02, 5.9], [9.08, 1.02, 5.9], [8.8, 0.5, 5.9],
    ]), { t: 0.6, dur: 0.04, a: 0.05 });
    // Pallet of blocks close to the building corner.
    const bx = 3.3;
    ink.add(path3([
        [bx, 0, 1.75], [bx + 1.8, 0, 1.75], [bx + 1.8, 0.95, 1.75], [bx, 0.95, 1.75], [bx, 0, 1.75],
    ]), { t: 0.6, dur: 0.03, w: 1, a: 0.42, amp: 0.7 });
    ink.add(path3([[bx + 1.8, 0, 1.75], [bx + 1.8, 0, 0.45], [bx + 1.8, 0.95, 0.45], [bx + 1.8, 0.95, 1.75]]), {
        t: 0.614, dur: 0.024, w: 0.9, a: 0.32, amp: 0.6,
    });
    ink.add(path3([[bx, 0.95, 1.75], [bx + 1.8, 0.95, 1.75], [bx + 1.8, 0.95, 0.45]]), {
        t: 0.624, dur: 0.016, w: 0.9, a: 0.34, amp: 0.6,
    });
    if (full) {
        [0.32, 0.64].forEach((y, n) => {
            ink.add(seg3([bx, y, 1.75], [bx + 1.8, y, 1.75]), {
                t: 0.63 + n * 0.006, dur: 0.01, w: 0.65, a: 0.2, amp: 0.4,
            });
        });
        for (let k = 1; k < 4; k++) {
            ink.add(seg3([bx + k * 0.45, 0.64, 1.75], [bx + k * 0.45, 0.95, 1.75]), {
                t: 0.642 + k * 0.004, dur: 0.006, w: 0.6, a: 0.18, amp: 0.3,
            });
        }
    }
    ink.wash(path3([[bx + 1.8, 0, 1.75], [bx + 1.8, 0, 0.45], [bx + 1.8, 0.95, 0.45], [bx + 1.8, 0.95, 1.75]]), {
        t: 0.64, dur: 0.04, a: 0.06,
    });
    // The beam stack the crane is working from, laid out under the hook.
    for (let i = 0; i < 2; i++) {
        const z0 = 2.42 + i * 0.44;
        ink.add(path3([[0.4, 0.4, z0], [5.0, 0.4, z0], [5.0, 0, z0], [0.4, 0, z0], [0.4, 0.4, z0]]), {
            t: 0.44 + i * 0.012, dur: 0.026, w: 0.95, a: 0.36, amp: 0.6,
        });
        ink.add(seg3([0.4, 0.4, z0], [0.4, 0.4, z0 + 0.4]), {
            t: 0.452 + i * 0.012, dur: 0.006, w: 0.8, a: 0.26, amp: 0.3,
        });
    }
    ink.add(path3([[0.75, 0.82, 2.64], [5.35, 0.82, 2.64], [5.35, 0.42, 2.64], [0.75, 0.42, 2.64], [0.75, 0.82, 2.64]]), {
        t: 0.466, dur: 0.026, w: 0.95, a: 0.38, amp: 0.6,
    });
    // Bearers under the stack.
    [1.2, 4.3].forEach((x, i) => ink.add(seg3([x, 0, 0.45], [x, 0, 3.3]), { t: 0.582 + i * 0.005, dur: 0.008, w: 0.8, a: 0.24, amp: 0.4 }));
    // Mortar tub and a leaning plank.
    ink.add(circle3(-7.4, 3.3, 0.55, 16), { t: 0.63, dur: 0.02, w: 0.95, a: 0.34, amp: 0.5 });
    ink.add(circle3(-7.4, 3.3, 0.34, 12), { t: 0.64, dur: 0.014, w: 0.75, a: 0.22, amp: 0.4 });
    ink.add(seg3([2.6, 0, 1.2], [1.4, 3.95, 0.15]), { t: 0.648, dur: 0.018, w: 0.9, a: 0.3, amp: 0.8 });
}
/* --- La valla de obra del estudio ---------------------------------------- */
// Un plano vertical encarado a cámara, a la derecha del acopio de perfiles.
const SIGN = (() => {
    const c = [13.0, 0, 3.7];
    const d = norm3([0.72, 0, -0.694]);
    const half = 1.62;
    const A = add(c, mul3(d, -half));
    const B = add(c, mul3(d, half));
    return { A, B, y0: 0.98, y1: 2.3 };
})();
const signAt = (p, y) => [p[0], y, p[2]];
function signage(ink, full) {
    const { A, B, y0, y1 } = SIGN;
    // Postes hincados, con un palmo por encima del tablero.
    ink.add(seg3(signAt(A, 0), signAt(A, y1 + 0.22)), { t: 0.572, dur: 0.014, w: 1, a: 0.4, amp: 0.6 });
    ink.add(seg3(signAt(B, 0), signAt(B, y1 + 0.22)), { t: 0.578, dur: 0.014, w: 1, a: 0.4, amp: 0.6 });
    // El tablero.
    ink.add(path3([signAt(A, y1), signAt(B, y1), signAt(B, y0), signAt(A, y0), signAt(A, y1)]), {
        t: 0.588, dur: 0.03, w: 0.95, a: 0.42, amp: 0.6,
    });
    if (full) {
        ink.add(seg3(signAt(A, y0), signAt(A, y1)), { t: 0.602, dur: 0.006, w: 0.7, a: 0.22, amp: 0.4 });
    }
}
// El rótulo es la imagen del logo, proyectada sobre el plano del tablero.
let SIGN_IMG = null;
function setSignLogo(url) {
    if (!url || typeof Image === "undefined") { SIGN_IMG = null; return; }
    SIGN_IMG = new Image();
    SIGN_IMG.src = url;
}
function signLogo(f) {
    const img = SIGN_IMG;
    if (!img || !img.complete || !img.naturalWidth) return;
    // Aparece cuando el tablero ya está trazado.
    const a = clamp01((f.tau - 0.605) / 0.045) * 0.82 * f.mul;
    if (a <= 0) return;
    const { A, B, y0, y1 } = SIGN;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const dir = norm3(sub(B, A));
    const c3 = mul3(add(A, B), 0.5);
    const availW = Math.hypot(B[0] - A[0], B[2] - A[2]) - 0.44;
    let h = (y1 - y0) - 0.3;
    let w = h * iw / ih;
    if (w > availW) { w = availW; h = w * ih / iw; }
    const yMid = (y0 + y1) / 2;
    const L = add(c3, mul3(dir, -w / 2));
    const R = add(c3, mul3(dir, w / 2));
    const TL = P([L[0], yMid + h / 2, L[2]]);
    const TR = P([R[0], yMid + h / 2, R[2]]);
    const BL = P([L[0], yMid - h / 2, L[2]]);
    const ctx = f.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.transform((TR[0] - TL[0]) / iw, (TR[1] - TL[1]) / iw, (BL[0] - TL[0]) / ih, (BL[1] - TL[1]) / ih, TL[0], TL[1]);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
}
function siteKit(ink, full) {
    // Ladder up to the first slab, leaning near the right corner.
    const base = [1.6, 0, 1.7];
    const head = [0.45, LVL[1] + 0.55, 0.2];
    const off = mul3(norm3(cross(sub(head, base), [0, 1, 0])), 0.26);
    ink.add(path3([add(base, off), add(head, off)]), {
        t: 0.5, dur: 0.03, w: 0.95, a: 0.4, amp: 0.8, over: 2,
    });
    ink.add(path3([sub(base, off), sub(head, off)]), {
        t: 0.508, dur: 0.03, w: 0.95, a: 0.4, amp: 0.8, over: 2,
    });
    for (let i = 1; i < 9; i++) {
        const f = i / 9;
        const c = [lerp(base[0], head[0], f), lerp(base[1], head[1], f), lerp(base[2], head[2], f)];
        ink.add(path3([add(c, off), sub(c, off)]), {
            t: 0.52 + i * 0.003, dur: 0.007, w: 0.75, a: 0.3, amp: 0.4,
        });
    }
    if (full) {
        // Two cones marking the haul route.
        [[-11.8, 8.0], [0.8, 8.4]].forEach(([cx, cz], i) => {
            const b = P([cx, 0, cz]);
            const tp = P([cx, 0.62, cz]);
            ink.add([[b[0] - 7, b[1]], [tp[0], tp[1]], [b[0] + 7, b[1]], [b[0] - 7, b[1]]], {
                t: 0.68 + i * 0.008, dur: 0.014, w: 0.85, a: 0.26, amp: 0.5,
            });
        });
    }
}
/* --- Notation -------------------------------------------------------------- */
function notation(ink, full) {
    // Dimension chain across the front of the building, on the ground.
    ink.add(seg3([XL, 0, 7.6], [XR, 0, 7.6]), {
        t: 0.66, dur: 0.045, w: 0.8, a: 0.24, amp: 0.8,
    });
    [XL, XL + 2 * BAY, XL + 3 * BAY, XR].forEach((x, i) => {
        ink.add(seg3([x, 0, 6.9], [x, 0, 8.1]), {
            t: 0.672 + i * 0.006, dur: 0.008, w: 0.7, a: 0.18, amp: 0.4,
        });
        const p = P([x, 0, 7.6]);
        ink.add(tick(p[0], p[1]), { t: 0.685 + i * 0.006, dur: 0.007, w: 0.9, a: 0.3, amp: 0.4 });
    });
    // Level datums on the core face.
    [LVL[1], LVL[2]].forEach((y, i) => {
        const p = P([CORE.xl - 0.3, y + TH, CORE.zf]);
        ink.add([[p[0] - 62, p[1]], [p[0], p[1]]], {
            t: 0.7 + i * 0.012, dur: 0.016, w: 0.7, a: 0.16, amp: 0.6, dash: [12, 7],
        });
        ink.add(triangle(p[0] - 46, p[1], 7), { t: 0.712 + i * 0.012, dur: 0.01, w: 0.9, a: 0.28, amp: 0.4 });
    });
    // A leader from the crane mast out to a shelf on the right margin.
    const m = P([CR.x, 13.5, CR.z]);
    ink.add([[m[0], m[1]], [1462, 372], [1532, 372]], {
        t: 0.725, dur: 0.028, w: 0.8, a: 0.22, amp: 0.8,
    });
    // And one from the roof edge beams to the left.
    const rb = P([XL + 3 * (21 / 5), LVL[2] + TH, ZF]);
    ink.add([[rb[0] - 8, rb[1] - 6], [176, 300], [116, 300]], {
        t: 0.74, dur: 0.028, w: 0.8, a: 0.2, amp: 0.8,
    });
    if (full) {
        // North arrow, small, top left.
        ink.add(circlePath(112, 214, 22, 20), { t: 0.752, dur: 0.02, w: 0.9, a: 0.24, amp: 0.7 });
        ink.add([[112, 230], [112, 198], [105, 210], [112, 198], [119, 210]], {
            t: 0.762, dur: 0.014, w: 0.9, a: 0.3, amp: 0.4,
        });
    }
}
/**
 * Real loop time -> authoring time.
 *
 * The scene is authored on a relaxed clock; this piecewise map compresses
 * the empty opening (the sheet fills fast), keeps the build brisk, and
 * stretches the finished-site hold so the crane has time to work. The ends
 * pin 0 to 0 and 1 to 1, which is what keeps the loop seamless.
 */
/** The finished sheet starts lifting off the board here. */
const SLIDE_START = 0.945;
const WARP = [
    [0, 0],
    [0.22, 0.4],
    [0.5, 0.78],
    [SLIDE_START, 1],
];
function warp(t) {
    if (t >= SLIDE_START)
        return 1;
    for (let i = 1; i < WARP.length; i++) {
        if (t <= WARP[i][0]) {
            const [t0, a0] = WARP[i - 1];
            const [t1, a1] = WARP[i];
            return a0 + ((t - t0) / (t1 - t0)) * (a1 - a0);
        }
    }
    return t;
}
function fillPoly(ctx, pts, a) {
    if (a <= 0.004 || pts.length < 3)
        return;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++)
        ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
}
/* --- The crane at work ----------------------------------------------------- */
// Where the hook picks (the beam stack by the pallet) and where it places
// (the open roof bays), in jib coordinates around the mast.
const PICK = { th: 2.24, r: 10.5 };
const PLACE = { th: Math.PI - 0.12, r: 13.1 };
/** Keyframes of one delivery: park, dip, rig, hoist, slew, place, return. */
const RIG_KEYS = [
    [0.0, PICK.th, PICK.r, 8.0],
    [0.3, PICK.th, PICK.r, 8.0],
    [0.36, PICK.th, PICK.r, 2.05],
    [0.41, PICK.th, PICK.r, 2.05],
    [0.49, PICK.th, PICK.r, 12.6],
    [0.61, PLACE.th, PLACE.r, 12.6],
    [0.67, PLACE.th, PLACE.r, 8.55],
    [0.71, PLACE.th, PLACE.r, 8.55],
    [0.77, PLACE.th, PLACE.r, 12.8],
    [0.9, PICK.th, PICK.r, 8.0],
    [1.0, PICK.th, PICK.r, 8.0],
];
/** Slew angle, trolley radius and hook height at real loop time t. */
function rig(t) {
    let i = 1;
    while (i < RIG_KEYS.length - 1 && t > RIG_KEYS[i][0])
        i++;
    const a = RIG_KEYS[i - 1];
    const b = RIG_KEYS[i];
    const f = 0.5 - 0.5 * Math.cos(clamp01((t - a[0]) / (b[0] - a[0] || 1)) * Math.PI);
    return { th: lerp(a[1], b[1], f), r: lerp(a[2], b[2], f), y: lerp(a[3], b[3], f) };
}
function craneDyn(f) {
    const { ctx, t, tau, mul, minW } = f;
    const pose = rig(t);
    const th = pose.th + 0.006 * Math.sin(TAU * 3 * t);
    const dir = [Math.cos(th), 0, Math.sin(th)];
    const side = [-Math.sin(th), 0, Math.cos(th)];
    const jp = (r, y) => [CR.x + dir[0] * r, y, CR.z + dir[2] * r];
    // Cab, riding the slewing ring.
    const cab = windowState(tau, 0.36, 0.04);
    if (cab) {
        const k = cab.k * mul;
        const c0 = jp(0.7, CR.top + 0.5);
        const c1 = jp(2.3, CR.top + 0.5);
        const c2 = jp(2.3, CR.top + 1.7);
        const c3 = jp(0.7, CR.top + 1.9);
        live(ctx, path3([c0, c1, c2, c3, c0]), { seed: 61, w: 1.05, a: 0.44 * k, p: cab.p, amp: 0.6, minW });
        live(ctx, path3([jp(1.6, CR.top + 0.5), jp(1.6, CR.top + 1.8)]), {
            seed: 62, w: 0.8, a: 0.26 * k, p: cab.p, amp: 0.4, minW,
        });
        fillPoly(ctx, path3([c0, c1, c2, c3]), 0.05 * k * cab.p);
    }
    // Apex.
    const ap = windowState(tau, 0.372, 0.035);
    const apex = [CR.x, CR.apex, CR.z];
    if (ap) {
        const k = ap.k * mul;
        live(ctx, path3([jp(0.9, CR.top + 1.9), apex, jp(-0.9, CR.top + 1.9)]), {
            seed: 63, w: 1, a: 0.42 * k, p: ap.p, amp: 0.7, minW,
        });
    }
    // Counter-jib and counterweight.
    const cj = windowState(tau, 0.385, 0.045);
    if (cj) {
        const k = cj.k * mul;
        live(ctx, path3([jp(-0.9, CR.jibY), jp(-CJIB, CR.jibY - 0.15)]), {
            seed: 64, w: 1.1, a: 0.46 * k, p: cj.p, amp: 0.8, minW,
        });
        live(ctx, path3([jp(-0.9, CR.jibY - 0.7), jp(-CJIB, CR.jibY - 0.75)]), {
            seed: 65, w: 0.95, a: 0.36 * k, p: cj.p, amp: 0.8, minW,
        });
        const w0 = jp(-CJIB + 1.2, CR.jibY - 0.75);
        const w1 = jp(-CJIB - 0.1, CR.jibY - 0.75);
        const w2 = jp(-CJIB - 0.1, CR.jibY - 2.1);
        const w3 = jp(-CJIB + 1.2, CR.jibY - 2.1);
        live(ctx, path3([w0, w1, w2, w3, w0]), { seed: 66, w: 1.05, a: 0.44 * k, p: cj.p, amp: 0.6, minW });
        fillPoly(ctx, path3([w0, w1, w2, w3]), 0.08 * k * cj.p);
    }
    // Jib: two chords with a lattice between, drawn outward from the mast.
    const jb = windowState(tau, 0.375, 0.07);
    if (jb) {
        const k = jb.k * mul;
        const N = 16;
        const topR = [];
        const botR = [];
        for (let i = 0; i <= N; i++) {
            const r = lerp(1.0, JIB, i / N);
            topR.push(P(jp(r, CR.jibY + 0.65 - 0.35 * (i / N))));
            botR.push(P(jp(r, CR.jibY - 0.35)));
        }
        live(ctx, topR, { seed: 71, w: 1.4, a: 0.62 * k, p: jb.p, amp: 0.9, minW, step: 80 });
        live(ctx, botR, { seed: 72, w: 1.2, a: 0.5 * k, p: jb.p, amp: 0.9, minW, step: 80 });
        live(ctx, latticeBetween(topR, botR), { seed: 73, w: 0.75, a: 0.28 * k, p: jb.p, amp: 0.6, minW, step: 70 });
        live(ctx, path3([jp(JIB, CR.jibY + 0.3), jp(JIB, CR.jibY - 0.35)]), {
            seed: 74, w: 0.9, a: 0.32 * k, p: jb.p, amp: 0.5, minW,
        });
    }
    // Pendants from the apex.
    const pd = windowState(tau, 0.43, 0.04);
    if (pd) {
        const k = pd.k * mul;
        live(ctx, path3([apex, jp(JIB * 0.55, CR.jibY + 0.47)]), { seed: 75, w: 0.75, a: 0.28 * k, p: pd.p, amp: 0.7, minW, step: 110 });
        live(ctx, path3([apex, jp(JIB * 0.97, CR.jibY + 0.31)]), { seed: 76, w: 0.75, a: 0.24 * k, p: pd.p, amp: 0.7, minW, step: 110 });
        live(ctx, path3([apex, jp(-CJIB + 0.3, CR.jibY - 0.1)]), { seed: 77, w: 0.75, a: 0.26 * k, p: pd.p, amp: 0.7, minW });
    }
    // Trolley, hoist and the beam being delivered to the open bays.
    const hk = windowState(tau, 0.47, 0.05);
    if (!hk)
        return;
    const k = hk.k * mul;
    const rTr = pose.r;
    const trolley = jp(rTr, CR.jibY - 0.35);
    const yLoad = pose.y;
    const swayA = 0.3 * Math.sin(TAU * 5 * t) * clamp01((yLoad - 2.2) / 10);
    const loadC = add(jp(rTr, yLoad), mul3(side, swayA));
    live(ctx, path3([jp(rTr - 0.5, CR.jibY - 0.35), jp(rTr + 0.5, CR.jibY - 0.35)]), {
        seed: 81, w: 1.6, a: 0.5 * k, p: hk.p, amp: 0.4, minW,
    });
    live(ctx, path3([trolley, add(loadC, [0, 1.0, 0])]), {
        seed: 82, w: 0.75, a: 0.34 * k * hk.p, amp: 0.5, minW, step: 130,
    });
    // Spreader and slings, riding parallel to the jib.
    const s0 = add(add(loadC, [0, 0.9, 0]), mul3(dir, -1.1));
    const s1 = add(add(loadC, [0, 0.9, 0]), mul3(dir, 1.1));
    live(ctx, path3([s0, s1]), { seed: 83, w: 1, a: 0.4 * k * hk.p, amp: 0.4, minW });
    const b0 = add(loadC, mul3(dir, -2.3));
    const b1 = add(loadC, mul3(dir, 2.3));
    live(ctx, path3([s0, b0]), { seed: 84, w: 0.75, a: 0.3 * k * hk.p, amp: 0.4, minW });
    live(ctx, path3([s1, b1]), { seed: 85, w: 0.75, a: 0.3 * k * hk.p, amp: 0.4, minW });
    const bl0 = add(b0, [0, -0.42, 0]);
    const bl1 = add(b1, [0, -0.42, 0]);
    live(ctx, path3([b0, b1, bl1, bl0, b0]), { seed: 86, w: 1.05, a: 0.46 * k * hk.p, amp: 0.5, minW });
    fillPoly(ctx, path3([b0, b1, bl1, bl0]), 0.06 * k * hk.p);
}
function figure2d(f, x, y, h, dir, ph, pose, alpha, seed) {
    if (alpha <= 0.006 || h < 8)
        return;
    const { ctx, minW } = f;
    const walking = pose === "walk" || pose === "carry" || pose === "push";
    const swing = walking ? Math.sin(ph * TAU) : 0;
    const bob = walking
        ? Math.abs(Math.sin(ph * TAU)) * h * 0.02
        : Math.sin(ph * TAU * 0.25) * h * 0.007;
    const stride = h * (pose === "push" ? 0.12 : 0.16) * swing;
    const lean = walking ? dir * h * (pose === "push" ? 0.06 : 0.035) : 0;
    const bent = pose === "work";
    const hipY = y - h * 0.46 - bob;
    const shY = y - h * (bent ? 0.62 : 0.79) - bob;
    const headR = h * 0.078;
    const halfSh = h * 0.1;
    const halfHip = h * 0.052;
    const hipX = x + lean * 0.4;
    const shX = x + lean + (bent ? dir * h * 0.2 : 0);
    const base = { w: Math.max(h * 0.03, 1.05), a: alpha, minW, amp: h * 0.012, step: h * 0.42 };
    const legs = [
        { hx: hipX - halfHip, fx: x + dir * stride, fy: y, knee: 1 },
        { hx: hipX + halfHip, fx: x - dir * stride, fy: y - Math.max(0, -swing) * h * 0.05, knee: -1 },
    ];
    legs.forEach((l, i) => live(ctx, [
        [l.hx, hipY],
        [lerp(l.hx, l.fx, 0.52) + dir * h * 0.018 * l.knee, lerp(hipY, y, 0.55)],
        [l.fx, l.fy],
    ], { ...base, seed: seed + i }));
    live(ctx, [[hipX - halfHip, hipY], [hipX + halfHip, hipY]], { ...base, seed: seed + 2, a: alpha * 0.75 });
    live(ctx, [[shX, shY], [hipX, hipY]], { ...base, seed: seed + 3 });
    live(ctx, [[shX - halfSh, shY + h * 0.01], [shX + halfSh, shY - h * 0.01]], { ...base, seed: seed + 4, a: alpha * 0.9 });
    const reach = pose === "point" ? Math.sin(ph * TAU * 0.5) * 0.06 : 0;
    const workSwing = bent ? Math.sin(ph * TAU) : 0;
    let arms;
    if (pose === "point") {
        arms = [
            [[shX + dir * halfSh, shY], [shX + dir * h * 0.22, shY + h * 0.06], [shX + dir * h * 0.4, shY - h * (0.19 + reach)]],
            [[shX - dir * halfSh, shY], [shX - dir * h * 0.13, shY + h * 0.15], [shX - dir * h * 0.09, shY + h * 0.29]],
        ];
    }
    else if (pose === "work") {
        // Bent over the work, the leading arm rising and falling as it ties.
        arms = [
            [[shX + dir * halfSh * 0.6, shY], [shX + dir * h * 0.24, shY + h * 0.14], [shX + dir * h * 0.32, y - h * (0.14 + 0.08 * workSwing)]],
            [[shX - dir * halfSh * 0.4, shY], [shX + dir * h * 0.06, shY + h * 0.18], [shX + dir * h * 0.14, y - h * 0.2]],
        ];
    }
    else if (pose === "carry") {
        // Both hands up at the load on the shoulder.
        arms = [
            [[shX + dir * halfSh, shY], [shX + dir * h * 0.22, shY - h * 0.05], [shX + dir * h * 0.26, shY - h * 0.14]],
            [[shX - dir * halfSh, shY], [shX - dir * h * 0.1, shY - h * 0.04], [shX - dir * h * 0.06, shY - h * 0.13]],
        ];
    }
    else if (pose === "push") {
        // Both arms forward and down, onto the handles.
        arms = [
            [[shX + dir * halfSh, shY], [shX + dir * h * 0.24, shY + h * 0.12], [shX + dir * h * 0.34, shY + h * 0.22]],
            [[shX + dir * halfSh * 0.4, shY + h * 0.02], [shX + dir * h * 0.2, shY + h * 0.14], [shX + dir * h * 0.3, shY + h * 0.24]],
        ];
    }
    else {
        arms = [
            [[shX - dir * halfSh, shY], [shX - dir * (halfSh + stride * 0.3), shY + h * 0.15], [shX - dir * stride * 0.9, shY + h * 0.29]],
            [[shX + dir * halfSh, shY], [shX + dir * (halfSh - stride * 0.3), shY + h * 0.15], [shX + dir * stride * 0.9, shY + h * 0.29]],
        ];
    }
    arms.forEach((arm, i) => live(ctx, arm, { ...base, seed: seed + 5 + i, a: alpha * 0.85 }));
    const hx = shX + dir * h * (bent ? 0.06 : 0.02);
    const hy = shY - headR * (bent ? 1.1 : 1.55);
    live(ctx, circlePath(hx, hy, headR, 12), { ...base, seed: seed + 7, a: alpha * 0.9 });
    live(ctx, arcPath(hx, hy - headR * 0.2, headR * 1.12, Math.PI, TAU, 10), { ...base, seed: seed + 8, a: alpha * 0.85 });
    live(ctx, [
        [hx - headR * 1.3 - (dir < 0 ? headR * 0.5 : 0), hy - headR * 0.3],
        [hx + headR * 1.3 + (dir > 0 ? headR * 0.5 : 0), hy - headR * 0.42],
    ], { ...base, seed: seed + 9, a: alpha * 0.8, w: Math.max(h * 0.026, 0.95) });
}
/** A figure standing at a world position; height comes from the projection. */
function figure3d(f, pos, dir, ph, pose, alpha, seed) {
    const foot = P(pos);
    const head = P(add(pos, [0, 1.78, 0]));
    figure2d(f, foot[0], foot[1], foot[1] - head[1], dir, ph, pose, alpha, seed);
}
/** The wheelbarrow, drawn at a world position heading along d. */
function barrowAt(f, pos, d, alpha) {
    if (alpha <= 0.006)
        return;
    const { ctx, minW } = f;
    const at = (r, y) => [pos[0] + d[0] * r, y, pos[2] + d[2] * r];
    live(ctx, path3([at(0, 0.55), at(1.4, 0.62), at(1.25, 0.25), at(0.25, 0.25), at(0, 0.55)]), {
        seed: 310, w: 0.95, a: alpha, amp: 0.6, minW,
    });
    const wc = P(at(1.42, 0.28));
    const wr = Math.max(3, (P(at(1.42, 0.0))[1] - P(at(1.42, 0.56))[1]) * 0.5);
    live(ctx, circlePath(wc[0], wc[1], wr, 12), { seed: 311, w: 0.85, a: alpha * 0.9, amp: 0.4, minW });
    live(ctx, path3([at(0.05, 0.5), at(-0.55, 0.72)]), { seed: 312, w: 0.85, a: alpha * 0.85, amp: 0.4, minW });
}
const edgeFade = (u) => smoothstep(0, 0.06, u) * (1 - smoothstep(0.9, 1, u));
function figures(f) {
    const { t, tau, mul } = f;
    const step = t * 46; // whole number of paces per loop
    // Crossing the site along the front walkway, and coming back deeper in.
    const w1 = windowState(tau, 0.34, 0.04);
    if (w1) {
        const u = clamp01((t - 0.22) / 0.64);
        figure3d(f, [lerp(-17, 3.5, u), 0, 2.4], 1, step, "walk", 0.5 * w1.k * mul * edgeFade(u), 210);
    }
    const w2 = windowState(tau, 0.45, 0.04);
    if (w2) {
        const u = clamp01((t - 0.34) / 0.52);
        figure3d(f, [lerp(6.5, -12, u), 0, 3.0], -1, step + 0.4, "walk", 0.42 * w2.k * mul * edgeFade(u), 220);
    }
    // Pacing the first slab; reading the incoming beam against the crane.
    const w3 = windowState(tau, 0.44, 0.04);
    if (w3) {
        const sweep = 0.5 - 0.5 * Math.cos(TAU * 2 * t);
        const dir = Math.sin(TAU * 2 * t) >= 0 ? -1 : 1;
        figure3d(f, [lerp(-4, -15, sweep), LVL[1] + TH, -1.1], dir, step, "walk", 0.44 * w3.k * mul, 230);
    }
    const w4 = windowState(tau, 0.5, 0.04);
    if (w4)
        figure3d(f, [-2.2, LVL[1] + TH, -2.6], 1, step, "point", 0.46 * w4.k * mul, 240);
    // Rigging by the beam stack while the hook is down; guiding on the roof.
    const w5 = windowState(tau, 0.52, 0.04);
    if (w5)
        figure3d(f, [5.4, 0, 3.1], -1, step, "work", 0.46 * w5.k * mul, 250);
    const w6 = windowState(tau, 0.56, 0.04);
    if (w6)
        figure3d(f, [-9.6, LVL[2] + TH, -5.6], 1, step, "point", 0.4 * w6.k * mul, 260);
    // Tying rebar down in the trench, only the top half showing.
    const w7 = windowState(tau, 0.4, 0.04);
    if (w7)
        figure3d(f, [-14.5, -1.05, 5.4], 1, step + 0.2, "work", 0.44 * w7.k * mul, 270);
    // Pushing the barrow from the stacks toward the frame.
    const w8 = windowState(tau, 0.54, 0.04);
    if (w8) {
        const u = clamp01((t - 0.46) / 0.4);
        const px = lerp(6.2, -6.8, u);
        const k = 0.44 * w8.k * mul * edgeFade(u);
        const pos = [px, 0, 2.0];
        barrowAt(f, [px + 0.45, 0, 2.0], [-1, 0, 0.02], k * 0.85);
        figure3d(f, [px + 2.0, 0, 2.05], -1, step, "push", k, 280);
    }
    // Two of them carrying a board across the yard.
    const w9 = windowState(tau, 0.6, 0.04);
    if (w9) {
        const u = clamp01((t - 0.55) / 0.36);
        const k = 0.42 * w9.k * mul * edgeFade(u);
        const ax = lerp(5.2, -3.2, u);
        const a3 = [ax, 0, 5.3];
        const b3 = [ax + 2.1, 0, 5.45];
        figure3d(f, a3, -1, step, "carry", k, 290);
        figure3d(f, b3, -1, step + 0.5, "carry", k, 296);
        const pa = P(add(a3, [-0.35, 1.42, 0]));
        const pb = P(add(b3, [0.55, 1.44, 0]));
        live(f.ctx, [pa, pb], { seed: 302, w: 1.15, a: k, amp: 0.6, minW: f.minW });
    }
    // Coming down the ladder from the first slab.
    const w10 = windowState(tau, 0.58, 0.04);
    if (w10) {
        const v = 0.5 - 0.5 * Math.cos(TAU * t);
        const base3 = [1.6, 0, 1.7];
        const head3 = [0.45, LVL[1] + 0.55, 0.2];
        const pos = [
            lerp(base3[0], head3[0], v * 0.9),
            lerp(base3[1], head3[1], v * 0.9),
            lerp(base3[2], head3[2], v * 0.9),
        ];
        figure3d(f, pos, -1, step, "carry", 0.4 * w10.k * mul, 320);
    }
}
function buildScene(detail = "full") {
    const full = detail === "full";
    const ink = new Ink();
    ground(ink, full);
    excavation(ink, full);
    frame(ink, full);
    core(ink, full);
    craneStatic(ink, full);
    siteKit(ink, full);
    materials(ink, full);
    signage(ink, full);
    notation(ink, full);
    return {
        strokes: ink.strokes,
        washes: ink.washes,
        dynamic: (f) => {
            craneDyn(f);
            figures(f);
            signLogo(f);
        },
    };
}
/**
 * Chooses the slice of paper to show for a given box aspect ratio: wide
 * boxes get the whole site, narrow ones crop toward the frame and crane.
 */
function viewport(aspect) {
    const wide = clamp01((aspect - 0.55) / 0.55);
    const coreW = lerp(900, 1445, wide);
    const coreH = lerp(960, 845, clamp01((aspect - 1.9) / 1.1));
    return {
        w: Math.max(coreW, coreH * aspect),
        cx: lerp(980, 805, wide),
        cy: lerp(465, 462, wide),
    };
}
function paintSheet(scene, f, tScene, tau) {
    const { ctx, mul } = f;
    for (let i = 0; i < scene.washes.length; i++) {
        const w = scene.washes[i];
        const raw = (tau - w.t0) / w.dur;
        if (raw <= 0)
            continue;
        const out = 1 - smoothstep(w.fs, w.fs + FADE_DUR, tau);
        if (out <= 0)
            continue;
        fillPoly(ctx, w.pts, w.a * clamp01(raw) * out * mul);
    }
    for (let i = 0; i < scene.strokes.length; i++) {
        const st = strokeState(scene.strokes[i], tau);
        if (!st)
            continue;
        const sk = scene.strokes[i];
        paint(ctx, sk, st.p, { w: sk.w, a: st.a * mul, dash: sk.dash, tip: sk.tip, minW: f.minW });
    }
    scene.dynamic({ ...f, t: tScene, tau });
}
function renderScene(scene, f) {
    const { ctx, mul } = f;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b0b0c";
    ctx.fillStyle = "#0b0b0c";
    // The loop's close: at SLIDE_START the finished sheet lifts off the board
    // and the next cycle is already being drawn on the clean paper beneath it.
    // The scene clock is phase-shifted so a cycle BEGINS the moment the old
    // sheet starts to lift — which is exactly what makes the seam invisible.
    const sT = (f.t - SLIDE_START + 1) % 1;
    const tau = warp(sT);
    // The sheet being drawn now.
    paintSheet(scene, f, sT, tau);
    // The previous, finished sheet on its way up and out.
    const LIFT = 1 - SLIDE_START;
    if (sT < LIFT) {
        const view = f.view ?? { cx: 800, cy: 500, w: 1700, h: 1060 };
        const u = sT / LIFT;
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const dy = -e * (view.h * 1.08 + 180);
        const yEdge = view.cy + view.h * 0.54 + 70 + dy;
        // The sheet itself is opaque paper: it hides the fresh drawing below.
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(view.cx - view.w * 1.2, yEdge - view.h * 3, view.w * 2.4, view.h * 3);
        ctx.fillStyle = "#0b0b0c";
        // Its drawing, complete, still alive while it leaves.
        ctx.save();
        ctx.translate(0, dy);
        paintSheet(scene, f, sT, 1);
        ctx.restore();
        // The bottom edge of the lifting sheet, and its shadow on the fresh one.
        ctx.globalAlpha = 0.15 * mul;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(view.cx - view.w * 0.7, yEdge);
        ctx.lineTo(view.cx + view.w * 0.7, yEdge);
        ctx.stroke();
        const grad = ctx.createLinearGradient(0, yEdge, 0, yEdge + 40);
        grad.addColorStop(0, "rgba(11,11,12,0.08)");
        grad.addColorStop(1, "rgba(11,11,12,0)");
        ctx.globalAlpha = mul;
        ctx.fillStyle = grad;
        ctx.fillRect(view.cx - view.w * 1.2, yEdge, view.w * 2.4, 40);
        ctx.fillStyle = "#0b0b0c";
    }
}


/* ------------------------------------------------------------------ *
 * API para HTML plano.
 *
 *   <div id="fondo" style="position:absolute; inset:0"></div>
 *   <script src="architectural-site.js"></script>
 *   <script>ArchitecturalSite.mount(document.getElementById("fondo"));</script>
 *
 * Opciones: { duration, intensity, background, offset, detail }
 * Devuelve: { play(), pause(), seek(t), destroy() }
 * ------------------------------------------------------------------ */
function mount(host, options) {
  var o = options || {};
  var duration = o.duration || 40;
  var intensity = o.intensity == null ? 1 : o.intensity;
  var background = o.background === null ? null : (o.background || "#ffffff");
  setSignLogo(o.logo === null ? null : (o.logo || "assets/logo-malo-negro.png"));
  var MAX_SCALE = 1.3;
  var MIN_STROKE = 0.62;
  var STILL_FRAME = 0.8;

  var canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  host.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);
  var ctx = canvas.getContext("2d", { alpha: background === null });

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var scene = null, detail = null, view = viewport(1);
  var scale = 1, cssW = 0, cssH = 0, dpr = 1;

  function layout() {
    var rect = host.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width));
    cssH = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view = viewport(cssW / cssH);
    scale = Math.min(cssW / view.w, MAX_SCALE);
    var wanted = o.detail || (cssW < 720 || cssW * cssH > 4.2e6 ? "lite" : "full");
    if (wanted !== detail) { scene = buildScene(wanted); detail = wanted; }
  }

  function frame(t) {
    if (!scene) return;
    var dx = Math.sin(TAU * t) * 4.5;
    var dy = Math.cos(TAU * t) * 3;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (background === null) ctx.clearRect(0, 0, canvas.width, canvas.height);
    else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr,
      (cssW / 2 - (view.cx + dx) * scale) * dpr,
      (cssH / 2 - (view.cy + dy) * scale) * dpr);
    renderScene(scene, {
      ctx: ctx, t: t, mul: intensity,
      minW: MIN_STROKE / scale, full: detail === "full",
      view: { cx: view.cx, cy: view.cy, w: cssW / scale, h: cssH / scale }
    });
    ctx.globalAlpha = 1;
  }

  layout();

  var elapsed = (o.offset || 0) * duration;
  var running = !reduced;
  var onScreen = true;
  var last = (window.performance || Date).now();
  var raf = 0;

  function now() { return (window.performance || Date).now(); }
  function current() { return reduced ? STILL_FRAME : (elapsed / duration) % 1; }

  function tick(time) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min(time - last, 100) / 1000;
    last = time;
    if (!running || !onScreen) return;
    elapsed += dt;
    frame((elapsed / duration) % 1);
  }

  var ro = new ResizeObserver(function () { layout(); frame(current()); });
  ro.observe(host);

  var io = null;
  function onVisibility() { running = !document.hidden && !reduced; last = now(); }

  frame(current());
  if (!reduced) {
    document.addEventListener("visibilitychange", onVisibility);
    io = new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      last = now();
    }, { rootMargin: "120px" });
    io.observe(host);
    raf = requestAnimationFrame(tick);
  }

  return {
    play: function () { running = true; last = now(); },
    pause: function () { running = false; },
    seek: function (t) { elapsed = t * duration; frame(t % 1); },
    destroy: function () {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      host.removeChild(canvas);
    }
  };
}

window.ArchitecturalSite = { mount: mount, buildScene: buildScene, viewport: viewport, renderScene: renderScene };

})();
