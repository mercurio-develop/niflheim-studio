"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Box } from "@/lib/brush";

export type SelectionHandle = {
  exportMask: () => Promise<Blob | null>; // white = selected, black = kept, at the image's own size
  clear: () => void;
};

// The selection, Photoshop-style: start from a found part (its SAM mask) and/or paint, then add
// to it (brush +) or take away (brush −). Kept as an alpha canvas at the image's natural size;
// shown as an accent tint. Only this area changes when the prompt bar acts on it.
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
  const last = useRef<[number, number] | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const { onChange } = props;

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.src;
  }, [props.src]);

  const render = useCallback(() => {
    const c = view.current, m = mask.current;
    if (!c || !m) return;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(m, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = getComputedStyle(c).getPropertyValue("--primary").trim() || "#f38d70";
    ctx.fillRect(0, 0, c.width, c.height);
  }, []);

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

  // (Re)start from the part's mask whenever it changes: luminance -> alpha.
  useEffect(() => {
    if (!natural) return;
    const m = (mask.current ??= document.createElement("canvas"));
    m.width = natural.w; m.height = natural.h;
    const ctx = m.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, m.width, m.height);
    if (!props.baseMask) { render(); report(); return; }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, m.width, m.height);
      const d = ctx.getImageData(0, 0, m.width, m.height);
      for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a; }
      ctx.putImageData(d, 0, 0);
      render(); report();
    };
    img.src = props.baseMask;
  }, [natural, props.baseMask, render, report]);

  useImperativeHandle(ref, () => ({
    clear: () => { const m = mask.current; if (m) m.getContext("2d")!.clearRect(0, 0, m.width, m.height); render(); report(); },
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

  const at = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * view.current!.width, ((e.clientY - r.top) / r.height) * view.current!.height];
  };
  const paint = (from: [number, number], to: [number, number]) => {
    const ctx = mask.current!.getContext("2d")!;
    ctx.globalCompositeOperation = props.tool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "#fff"; ctx.lineWidth = props.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    render();
  };

  if (!natural) return null;
  return (
    <canvas
      ref={view}
      width={natural.w}
      height={natural.h}
      aria-label="Selection: paint to add, erase to remove"
      className={`absolute inset-0 h-full w-full touch-none opacity-50 ${props.tool ? "cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={(e) => {
        if (!props.tool) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e); last.current = p; paint(p, p);
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const p = at(e); paint(last.current, p); last.current = p;
      }}
      onPointerUp={() => { if (last.current) { last.current = null; report(); props.onPaint?.(); } }}
    />
  );
});
