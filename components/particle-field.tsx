"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// A page-wide particle field for long GPU waits, behind the content.
//  active=true:  particles drift on a slow flow field; the pointer is a magnet (pull + swirl).
//  active→false: they rush onto the elements marked [data-land] (the new results), gather,
//                then burst outward and fade. Then the canvas goes quiet and stops drawing.
// No libraries. One canvas at device-pixel ratio 1 (it is soft light, not detail).

type P = { x: number; y: number; vx: number; vy: number; a: number; tx: number; ty: number };
type Mode = "off" | "field" | "gather" | "burst";

export function ParticleField({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mode = useRef<Mode>("off");
  const kick = useRef<(m: Mode) => void>(() => {});

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const css = getComputedStyle(document.documentElement);
    const rgb = (v: string, d: number[]) => {
      const n = css.getPropertyValue(v).trim().split(/\s+/).map(Number);
      return n.length === 3 && !n.some(isNaN) ? n : d;
    };
    const cool = rgb("--field", [249, 226, 210]);
    const hot = rgb("--field-hot", [243, 141, 112]);
    let w = 0, h = 0, t = 0, raf = 0, phaseAt = 0;
    let parts: P[] = [];
    const pointer = { x: -1e4, y: -1e4, on: false };

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    const spawn = (): P => ({ x: Math.random() * w, y: Math.random() * h, vx: 0, vy: 0, a: 0, tx: 0, ty: 0 });
    const count = () => Math.round(Math.min(520, (w * h) / 3200));

    const step = () => {
      t += 0.004;
      const m = mode.current;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = m === "burst" ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      const since = performance.now() - phaseAt;

      for (const p of parts) {
        if (m === "field") {
          const ang = Math.sin(p.x * 0.004 + t) * 1.4 + Math.cos(p.y * 0.005 - t * 1.3) * 1.4;
          p.vx += Math.cos(ang) * 0.03;
          p.vy += Math.sin(ang) * 0.03;
          if (pointer.on) {
            const dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.hypot(dx, dy) + 0.001, R = 220;
            if (d < R) {
              const f = (1 - d / R) ** 2;
              p.vx += (dx / d) * f * 0.5 + (-dy / d) * f * 0.85;
              p.vy += (dy / d) * f * 0.5 + (dx / d) * f * 0.85;
            }
          }
          p.vx *= 0.94; p.vy *= 0.94;
          p.a = Math.min(1, p.a + 0.02);
        } else if (m === "gather") {
          // Spring onto a point inside one of the new results; tighter as time goes on.
          const k = 0.012 + Math.min(1, since / 700) * 0.05;
          p.vx += (p.tx - p.x) * k; p.vy += (p.ty - p.y) * k;
          p.vx *= 0.82; p.vy *= 0.82;
          p.a = Math.min(1, p.a + 0.05);
        } else if (m === "burst") {
          p.vx *= 0.95; p.vy *= 0.95;
          p.a *= 0.955;
        }
        const ox = p.x, oy = p.y;
        p.x += p.vx; p.y += p.vy;
        if (m === "field" && (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20)) Object.assign(p, spawn());
        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / (m === "field" ? 2.5 : 9));
        const c = cool.map((b, i) => Math.round(b + (hot[i] - b) * speed));
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.26 + speed * 0.6) * p.a})`;
        ctx.lineWidth = 0.8 + speed * 1.4;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";

      if (m === "gather" && since > 900) go("burst");
      if (m === "burst" && since > 1300) go("off");
    };

    const loop = () => { step(); raf = mode.current === "off" ? 0 : requestAnimationFrame(loop); };
    const run = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); };

    const go = (next: Mode) => {
      mode.current = next;
      phaseAt = performance.now();
      if (next === "field") {
        resize();
        if (parts.length === 0) parts = Array.from({ length: count() }, spawn);
        run();
      } else if (next === "gather") {
        const targets = [...document.querySelectorAll<HTMLElement>("[data-land]")].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.bottom > 0 && r.top < h);
        if (!targets.length || reduce) return go("off");
        parts.forEach((p, i) => {
          const r = targets[i % targets.length];
          p.tx = r.left + r.width * (0.15 + Math.random() * 0.7);
          p.ty = r.top + r.height * (0.15 + Math.random() * 0.7);
        });
        run();
      } else if (next === "burst") {
        // Outward from each particle's landing point, fast at first.
        for (const p of parts) {
          const ang = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
          p.vx = Math.cos(ang) * s; p.vy = Math.sin(ang) * s;
        }
      } else {
        parts = [];
        ctx.clearRect(0, 0, w, h);
      }
    };
    kick.current = go;

    const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true; };
    const leave = () => { pointer.on = false; };
    const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (mode.current !== "off") run(); };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  // Drive the phases from the job: start the field, or land it on the results when it ends.
  useEffect(() => {
    if (active && mode.current !== "field") kick.current("field");
    else if (!active && mode.current === "field") kick.current("gather");
  }, [active]);

  if (typeof document === "undefined") return null;
  return createPortal(<canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-[1]" />, document.body);
}
