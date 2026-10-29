"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN = 1;
const MAX = 6;

// See the details: the image as big as the screen allows. Wheel zooms around the pointer,
// drag pans, double-click toggles fit / 2x. Full screen uses the browser's own (F); Esc closes.
// onPrev / onNext: a set of images (the turnaround's views) stepped through with the side arrows or
// the arrow keys; each new image opens fitted.
export function ImageViewer(props: { src: string; label: string; dot?: string; onClose: () => void; onPrev?: () => void; onNext?: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [shown, setShown] = useState(props.src);
  if (shown !== props.src) {
    setShown(props.src);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const { onClose } = props;

  // Zoom keeping the point under (cx, cy) still; pan is clamped so the image never leaves the frame.
  const zoomAt = (next: number, cx?: number, cy?: number) => {
    const z = Math.min(MAX, Math.max(MIN, next));
    const r = stage.current?.getBoundingClientRect();
    setPan((p) => {
      if (!r || z === 1) return { x: 0, y: 0 };
      const ox = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
      const oy = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
      const k = z / zoom;
      return clamp({ x: ox - (ox - p.x) * k, y: oy - (oy - p.y) * k }, z, r);
    });
    setZoom(z);
  };
  const clamp = (p: { x: number; y: number }, z: number, r: DOMRect) => {
    const mx = ((z - 1) * r.width) / 2;
    const my = ((z - 1) * r.height) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX, z * 1.25));
      if (e.key === "-") setZoom((z) => Math.max(MIN, z / 1.25));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
      if (e.key.toLowerCase() === "f") void toggleFull();
      if (e.key === "ArrowLeft") props.onPrev?.();
      if (e.key === "ArrowRight") props.onNext?.();
    };
    const fs = () => setFull(!!document.fullscreenElement);
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", fs);
    };
  });

  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await root.current?.requestFullscreen().catch(() => {});
  }

  const tool = "flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-card hover:text-foreground disabled:opacity-40";

  return createPortal(
    <div ref={root} role="dialog" aria-modal aria-label={`View ${props.label}`} className="nifl-enter fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        {props.dot && <span className={cn("size-2 rounded-full", props.dot)} />}
        <span className="truncate text-foreground">{props.label}</span>
        <span className="ml-auto font-mono">{Math.round(zoom * 100)}%</span>
        <button type="button" className={tool} onClick={() => zoomAt(zoom / 1.25)} disabled={zoom <= MIN} aria-label="Zoom out">
          <Minus className="size-3.5" />
        </button>
        <button type="button" className={tool} onClick={() => zoomAt(zoom * 1.25)} disabled={zoom >= MAX} aria-label="Zoom in">
          <Plus className="size-3.5" />
        </button>
        <button type="button" className={tool} onClick={() => zoomAt(1)} disabled={zoom === 1}>
          Fit
        </button>
        <button type="button" className={tool} onClick={() => void toggleFull()}>
          {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {full ? "Exit full screen" : "Full screen"}
        </button>
        <button type="button" className={tool} onClick={onClose}>
          <X className="size-3.5" /> Close
        </button>
      </div>
      <div
        ref={stage}
        className={cn("relative min-h-0 flex-1 touch-none overflow-hidden", zoom > 1 ? (drag.current ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in")}
        onWheel={(e) => zoomAt(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)}
        onDoubleClick={(e) => zoomAt(zoom > 1 ? 1 : 2, e.clientX, e.clientY)}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !stage.current) return;
          setPan(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }, zoom, stage.current.getBoundingClientRect()));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={props.src}
          alt={props.label}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain transition-transform duration-150 ease-out"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
        {props.onPrev && (
          <button type="button" onClick={props.onPrev} onPointerDown={(e) => e.stopPropagation()} aria-label="Previous" className="absolute top-1/2 left-4 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground">
            <ChevronLeft className="size-5" />
          </button>
        )}
        {props.onNext && (
          <button type="button" onClick={props.onNext} onPointerDown={(e) => e.stopPropagation()} aria-label="Next" className="absolute top-1/2 right-4 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground">
            <ChevronRight className="size-5" />
          </button>
        )}
      </div>
      <p className="px-4 py-2 text-center text-[11px] text-muted-foreground">Scroll to zoom · drag to move · double-click for 2× · {props.onPrev || props.onNext ? "← → step · " : ""}F full screen · Esc close</p>
    </div>,
    document.body,
  );
}
