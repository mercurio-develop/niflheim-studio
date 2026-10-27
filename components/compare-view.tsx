"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Two versions on top of each other with a draggable divider: left of it is A, right is B.
export function CompareView(props: {
  a: { src: string; label: string; dot: string };
  b: { src: string; label: string; dot: string };
  onClose: () => void;
}) {
  const [at, setAt] = useState(50);
  const { onClose } = props;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setAt((v) => Math.max(0, v - 5));
      if (e.key === "ArrowRight") setAt((v) => Math.min(100, v + 5));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const tag = (v: typeof props.a, side: string) => (
    <span className={cn("absolute top-3 flex max-w-[45%] items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs backdrop-blur", side)}>
      <span className={cn("size-2 shrink-0 rounded-full", v.dot)} />
      <span className="truncate">{v.label}</span>
    </span>
  );

  // Portal: the sidebar is sticky and animated, which would trap a fixed overlay.
  return createPortal(
    <div role="dialog" aria-modal aria-label="Compare two versions" className="nifl-enter fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-full flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[7/9] h-[min(82svh,calc((100vw-2rem)*9/7))] select-none overflow-hidden rounded-xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.b.src} alt={props.b.label} className="absolute inset-0 h-full w-full object-cover" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.a.src} alt={props.a.label} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }} />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_12px_var(--primary)]" style={{ left: `${at}%` }} />
          {tag(props.a, "left-3")}
          {tag(props.b, "right-3")}
          <input
            type="range"
            min={0}
            max={100}
            value={at}
            onChange={(e) => setAt(Number(e.target.value))}
            aria-label="Drag to compare"
            className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Drag across the image · ← → keys</span>
          <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-card hover:text-foreground">
            <X className="size-3.5" /> Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
