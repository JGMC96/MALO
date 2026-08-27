"use client";
/**
 * A construction site drawing itself, in perspective — black ink, a few
 * graphite washes, white paper, on a seamless loop. The cycle ends with the
 * finished sheet lifting off the board while the next one is already being
 * drawn beneath it. Built for use as a hero or section background: the ink
 * stays light enough that type sits comfortably on top.
 *
 *   <ArchitecturalSite className="absolute inset-0" />
 *
 * The drawing is authored on a fixed 1600 x 1000 sheet (see `scene.ts`) and
 * mapped onto whatever box this component is given, so the composition holds
 * from a phone to an ultrawide display.
 */
import { useEffect, useRef } from "react";
import { buildScene, renderScene, viewport, type Scene } from "./scene";
import { TAU } from "./sketch";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Props = {
  className?: string;
  /** Length of one full construction cycle, in seconds. */
  duration?: number;
  /** Global ink strength — lower it when type sits directly on top. */
  intensity?: number;
  /** Sheet colour. `null` leaves the canvas transparent. */
  background?: string | null;
  /** Where in the cycle a fresh mount starts, in [0, 1). */
  offset?: number;
  /** Force the detail level instead of picking it from the viewport. */
  detail?: "full" | "lite";
};

/** Never zoom the sheet in further than this — big screens see more paper. */
const MAX_SCALE = 1.3;
/** Minimum stroke width in CSS pixels, so hairlines survive a small sheet. */
const MIN_STROKE = 0.62;
/** The frame reduced-motion users get: the drawing complete, holding still. */
const STILL_FRAME = 0.8;

export function ArchitecturalSite({
  className,
  duration = 40,
  intensity = 1,
  background = "#ffffff",
  offset = 0,
  detail,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const canvas = el.querySelector("canvas");
    const ctx = canvas?.getContext("2d", { alpha: background === null });
    if (!canvas || !ctx) return;

    let scene: Scene | null = null;
    let sceneDetail: "full" | "lite" | null = null;
    let scale = 1;
    let view = viewport(1);
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;

    const layout = () => {
      const rect = el.getBoundingClientRect();
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      // Frame the sheet for this box, then let the paper beyond the frame
      // spill quietly into the margins — it is white on white anyway.
      view = viewport(cssW / cssH);
      scale = Math.min(cssW / view.w, MAX_SCALE);

      const wanted: "full" | "lite" =
        detail ?? (cssW < 720 || cssW * cssH > 4.2e6 ? "lite" : "full");
      if (wanted !== sceneDetail) {
        scene = buildScene(wanted);
        sceneDetail = wanted;
      }
    };

    const frame = (t: number) => {
      if (!scene) return;
      const { cx, cy } = view;
      // A drift slow enough to read as a hand shifting the sheet, not motion.
      const dx = Math.sin(TAU * t) * 4.5;
      const dy = Math.cos(TAU * t) * 3;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (background === null) ctx.clearRect(0, 0, canvas.width, canvas.height);
      else {
        ctx.globalAlpha = 1;
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.setTransform(
        scale * dpr,
        0,
        0,
        scale * dpr,
        (cssW / 2 - (cx + dx) * scale) * dpr,
        (cssH / 2 - (cy + dy) * scale) * dpr
      );

      renderScene(scene, {
        ctx,
        t,
        mul: intensity,
        minW: MIN_STROKE / scale,
        full: sceneDetail === "full",
        view: { cx: view.cx, cy: view.cy, w: cssW / scale, h: cssH / scale },
      });
      ctx.globalAlpha = 1;
    };

    layout();

    if (reduced) {
      frame(STILL_FRAME);
      const ro = new ResizeObserver(() => {
        layout();
        frame(STILL_FRAME);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }

    // Animate on an accumulated clock so pausing never jumps the loop.
    let raf = 0;
    let last = performance.now();
    let elapsed = offset * duration;
    let running = true;
    let onScreen = true;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      if (!running || !onScreen) return;
      elapsed += dt;
      frame((elapsed / duration) % 1);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      layout();
      frame((elapsed / duration) % 1);
    });
    ro.observe(el);

    const onVisibility = () => {
      running = !document.hidden;
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        last = performance.now();
      },
      { rootMargin: "120px" }
    );
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, duration, intensity, background, offset, detail]);

  return (
    <div ref={host} className={className} aria-hidden="true">
      <canvas className="block h-full w-full" />
    </div>
  );
}
