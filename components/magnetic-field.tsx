"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Particles drifting along a slow flow field (the fog). The pointer is a magnet: near it the
// particles are pulled in and swirl around it like field lines, then relax back when it leaves.
// Canvas only, no libraries. Pauses when hidden; a still frame under prefers-reduced-motion.

type P = { x: number; y: number; vx: number; vy: number; life: number };

export function MagneticField({ className, density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, t = 0;
    let parts: P[] = [];
    const css = getComputedStyle(canvas);
    const cool = css.getPropertyValue("--field").trim().split(/\s+/).map(Number);
    const hot = css.getPropertyValue("--field-hot").trim().split(/\s+/).map(Number);
    const base = cool.length === 3 && !cool.some(isNaN) ? cool : [255, 255, 255];
    const heat = hot.length === 3 && !hot.some(isNaN) ? hot : base;
    const pointer = { x: -1e4, y: -1e4, on: 0 };

    const spawn = (): P => ({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, life: 200 + Math.random() * 400 });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(260, (w * h) / 2600) * density);
      parts = Array.from({ length: n }, spawn);
      ctx.fillStyle = "rgba(0,0,0,0)"; ctx.clearRect(0, 0, w, h);
    };

    // The overlay ignores the pointer (pointer-events: none), so track it on the window.
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
      pointer.on = pointer.x > -40 && pointer.y > -40 && pointer.x < w + 40 && pointer.y < h + 40 ? 1 : 0;
    };
    const leave = () => { pointer.on = 0; };

    const step = () => {
      t += 0.004;
      // Trails: fade the previous frame instead of clearing it.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      const R = Math.max(90, Math.min(w, h) * 0.45);
      for (const p of parts) {
        // Flow field: smooth angles from layered sines, slowly changing over time.
        const a = Math.sin(p.x * 0.006 + t) * 1.4 + Math.cos(p.y * 0.007 - t * 1.3) * 1.4;
        p.vx += Math.cos(a) * 0.035; p.vy += Math.sin(a) * 0.035;

        if (pointer.on) {
          const dx = pointer.x - p.x, dy = pointer.y - p.y;
          const d = Math.hypot(dx, dy) + 0.001;
          if (d < R) {
            const f = (1 - d / R) ** 2;
            // Pull in, plus a tangential swirl: field lines wrapping the magnet.
            p.vx += (dx / d) * f * 0.55 + (-dy / d) * f * 0.9;
            p.vy += (dy / d) * f * 0.55 + (dx / d) * f * 0.9;
            if (d < 14) { p.vx -= (dx / d) * 1.2; p.vy -= (dy / d) * 1.2; } // never collapse to a dot
          }
        }
        p.vx *= 0.94; p.vy *= 0.94;
        const ox = p.x, oy = p.y;
        p.x += p.vx; p.y += p.vy; p.life--;
        if (p.life < 0 || p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) { Object.assign(p, spawn()); continue; }

        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 2.5);
        // Calm particles are cream; the fast ones the magnet whips around run hot.
        const c = base.map((b, k) => Math.round(b + (heat[k] - b) * speed));
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.2 + speed * 0.6})`;
        ctx.lineWidth = 0.8 + speed * 1.1;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = () => { step(); raf = requestAnimationFrame(loop); };
    const visibility = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) raf = requestAnimationFrame(loop); };

    resize();
    if (reduce) for (let i = 0; i < 60; i++) step(); // one settled frame
    else raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 h-full w-full", className)} />;
}
