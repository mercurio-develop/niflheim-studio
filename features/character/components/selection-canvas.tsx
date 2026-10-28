"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Box } from "@/lib/brush";

export type SelectionHandle = {
  exportMask: () => Promise<Blob | null>; // white = selected, black = kept, at the image's own size
  clear: () => void;
};

// The selection, Photoshop-style: start from a found part (its SAM mask) and/or paint, then add
// to it (paint) or take away (erase). Two alpha canvases at the image's natural size:
//   mask = everything selected (what the actions use)
//   part = the share that came from a tag, minus erasing
// Drawn so you can tell them apart: a part is animated cyan stripes, painted strokes are a
// solid peach tint. Only this area changes when an action runs.
export const SelectionCanvas = forwardRef<SelectionHandle, {
  src: string;
  baseMask?: string; // URL of a part mask (white on black) to start from
  tool: "add" | "erase" | null; // null = look only
  size: number;
  onChange: (box: Box | null) => void;
  onPaint?: () => void; // a stroke was painted (the selection is now the user's own)
}>(function SelectionCanvas(props, ref) {
  const view = useRef<HTMLCanvasElement>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const part = useRef<HTMLCanvasElement | null>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const stripes = useRef<HTMLCanvasElement | null>(null);
  const hasPart = useRef(false);
  const raf = useRef(0);
  const last = useRef<[number, number] | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const { onChange } = props;

  useEffect(() => {
    last.current = null; // a stroke never carries over onto another image
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.src;
  }, [props.src]);

  // One frame: peach where selected, then the part's moving stripes over the part's own area.
  const render = useCallback((t = 0) => {
    const c = view.current, m = mask.current, p = part.current;
    if (!c || !m) return;
    const css = getComputedStyle(c);
    const peach = css.getPropertyValue("--primary").trim() || "#f38d70";
    const cyan = css.getPropertyValue("--tone-cyan").trim() || "#85dacc";
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = peach;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-over";
    if (!p || !hasPart.current) return;

    if (!stripes.current) {
      // 28 px tile, one 45-degree cyan band per 14 px.
      const s = (stripes.current = document.createElement("canvas"));
      s.width = s.height = 28;
      const g = s.getContext("2d")!;
      g.fillStyle = cyan;
      for (let i = -28; i <= 28; i += 14) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 6, 0); g.lineTo(i + 34, 28); g.lineTo(i + 28, 28); g.closePath(); g.fill();
      }
    }
    const layer = (scratch.current ??= document.createElement("canvas"));
    if (layer.width !== c.width || layer.height !== c.height) { layer.width = c.width; layer.height = c.height; }
    const l = layer.getContext("2d")!;
    l.globalCompositeOperation = "source-over";
    l.clearRect(0, 0, layer.width, layer.height);
    l.globalAlpha = 0.4;
    l.fillStyle = cyan;
    l.fillRect(0, 0, layer.width, layer.height); // soft cyan wash under the stripes
    l.globalAlpha = 1;
    const pattern = l.createPattern(stripes.current, "repeat")!;
    pattern.setTransform(new DOMMatrix().translate((t / 45) % 28, 0)); // the stripes crawl sideways
    l.fillStyle = pattern;
    l.fillRect(0, 0, layer.width, layer.height);
    l.globalCompositeOperation = "destination-in";
    l.drawImage(p, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }, []);

  // Animate while a part is shown (unless reduced motion); one loop at a time.
  const animate = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (t: number) => {
      render(still ? 0 : t);
      if (hasPart.current && !still) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [render]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const report = useCallback(() => {
    const m = mask.current;
    if (!m) return onChange(null);
    const { data, width, height } = m.getContext("2d")!.getImageData(0, 0, m.width, m.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
      if (data[(y * width + x) * 4 + 3] > 64) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    onChange(x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 2, height: y1 - y0 + 2 });
  }, [onChange]);

  // (Re)start from the part's mask whenever it changes: luminance -> alpha, into both layers.
  useEffect(() => {
    if (!natural) return;
    const m = (mask.current ??= document.createElement("canvas"));
    const p = (part.current ??= document.createElement("canvas"));
    for (const c of [m, p]) { c.width = natural.w; c.height = natural.h; }
    const ctx = m.getContext("2d", { willReadFrequently: true })!;
    hasPart.current = false;
    if (!props.baseMask) { render(); report(); return; }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, m.width, m.height);
      const d = ctx.getImageData(0, 0, m.width, m.height);
      for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a; }
      ctx.putImageData(d, 0, 0);
      p.getContext("2d")!.drawImage(m, 0, 0);
      hasPart.current = true;
      report();
      animate();
    };
    img.src = props.baseMask;
  }, [natural, props.baseMask, render, report, animate]);

  useImperativeHandle(ref, () => ({
    clear: () => {
      for (const c of [mask.current, part.current]) c?.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      hasPart.current = false;
      render(); report();
    },
    exportMask: () =>
      new Promise((resolve) => {
        const m = mask.current;
        if (!m) return resolve(null);
        const out = document.createElement("canvas");
        out.width = m.width; out.height = m.height;
        const ctx = out.getContext("2d")!;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(m, 0, 0);
        out.toBlob((b) => resolve(b), "image/png");
      }),
  }), [render, report]);

  // From the canvas the event came from, not view.current: React empties that ref while the
  // canvas is swapped (a new image), and a stroke's next move would read null (2026-10-27).
  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
  };
  // A stroke ends on release, and also when the pointer is cancelled or loses capture, or the
  // next move would keep painting with no button down.
  const endStroke = () => {
    if (!last.current) return;
    last.current = null;
    report();
    props.onPaint?.();
  };
  // Painting adds to the selection only; erasing takes from the selection and the part alike.
  const paint = (from: [number, number], to: [number, number]) => {
    const layers = props.tool === "erase" ? [mask.current, part.current] : [mask.current];
    for (const c of layers) {
      if (!c) continue;
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = props.tool === "erase" ? "destination-out" : "source-over";
      ctx.strokeStyle = "#fff"; ctx.lineWidth = props.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
    if (!hasPart.current) render(); // with a part shown, the animation loop redraws anyway
  };

  if (!natural) return null;
  return (
    <canvas
      ref={view}
      width={natural.w}
      height={natural.h}
      aria-label="Selection: paint to add, erase to remove"
      className={`absolute inset-0 h-full w-full touch-none opacity-55 ${props.tool ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={(e) => {
        if (!props.tool) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e); last.current = p; paint(p, p);
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        if (!e.buttons) return endStroke();
        const p = at(e); paint(last.current, p); last.current = p;
      }}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}
    />
  );
});
