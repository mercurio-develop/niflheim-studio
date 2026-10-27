"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Box } from "@/lib/brush";

type Stroke = { size: number; points: [number, number][] };
export type BrushHandle = { undo: () => void; clear: () => void };

// A painting layer over the character. It works in the image's own pixels (canvas size = the
// image's natural size), so the box we send matches the file exactly. Strokes show in the accent.
export const BrushCanvas = forwardRef<BrushHandle, {
  src: string;
  size: number; // brush diameter in image pixels
  disabled?: boolean;
  onChange: (box: Box | null, strokes: number) => void;
}>(function BrushCanvas(props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const { onChange } = props;

  // The canvas needs the image's natural size; read it from the same file.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = props.src;
  }, [props.src]);

  const redraw = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const accent = getComputedStyle(c).getPropertyValue("--primary").trim() || "#f38d70";
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Paint opaque on the canvas; the canvas element itself is semi-transparent, so overlaps stay even.
    for (const s of [...strokes.current, ...(drawing.current ? [drawing.current] : [])]) {
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.points.length === 1) ctx.arc(s.points[0][0], s.points[0][1], s.size / 2, 0, Math.PI * 2);
      if (s.points.length === 1) ctx.fill();
      else ctx.stroke();
    }
  }, []);

  const report = useCallback(() => {
    const all = strokes.current;
    if (!all.length) return onChange(null, 0);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of all) for (const [x, y] of s.points) {
      x0 = Math.min(x0, x - s.size / 2); y0 = Math.min(y0, y - s.size / 2);
      x1 = Math.max(x1, x + s.size / 2); y1 = Math.max(y1, y + s.size / 2);
    }
    const w = natural?.w ?? x1, h = natural?.h ?? y1;
    const bx = Math.max(0, x0), by = Math.max(0, y0);
    onChange({ x: Math.round(bx), y: Math.round(by), width: Math.round(Math.min(w, x1) - bx), height: Math.round(Math.min(h, y1) - by) }, all.length);
  }, [natural, onChange]);

  useImperativeHandle(ref, () => ({
    undo: () => { strokes.current.pop(); redraw(); report(); },
    clear: () => { strokes.current = []; redraw(); report(); },
  }), [redraw, report]);

  useEffect(redraw, [natural, redraw]);

  const toImage = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.current!.width, ((e.clientY - r.top) / r.height) * canvas.current!.height];
  };

  if (!natural) return null;
  return (
    <canvas
      ref={canvas}
      width={natural.w}
      height={natural.h}
      aria-label="Paint where to add or remove something"
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none opacity-55 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-25"
      data-disabled={props.disabled}
      onPointerDown={(e) => {
        if (props.disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = { size: props.size, points: [toImage(e)] };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        drawing.current.points.push(toImage(e));
        redraw();
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        strokes.current.push(drawing.current);
        drawing.current = null;
        redraw();
        report();
      }}
    />
  );
});
