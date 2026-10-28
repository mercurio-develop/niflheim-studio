"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { FadeImage } from "@/components/fade-image";
import { cn } from "@/lib/utils";

type Side = { src: string; label: string; dot: string };

// Two versions: swipe (one on top of the other, drag the divider) or side by side.
// Full screen uses the browser's own fullscreen; Esc leaves it, then closes.
export function CompareView(props: { a: Side; b: Side; onClose: () => void }) {
  const [at, setAt] = useState(50);
  const [mode, setMode] = useState<"swipe" | "side">("swipe");
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { onClose } = props;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
      if (e.key === "ArrowLeft") setAt((v) => Math.max(0, v - 5));
      if (e.key === "ArrowRight") setAt((v) => Math.min(100, v + 5));
      if (e.key.toLowerCase() === "f") void toggleFull();
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

  const tag = (v: Side, side: string) => (
    <span className={cn("absolute top-3 flex max-w-[45%] items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-xs backdrop-blur", side)}>
      <span className={cn("size-2 shrink-0 rounded-full", v.dot)} />
      <span className="truncate">{v.label}</span>
    </span>
  );
  // Biggest 7:9 frame that fits: the whole screen in full screen, most of the window otherwise.
  const frame = full ? "h-[calc(100svh-5rem)]" : "h-[min(80svh,calc((100vw-2rem)*9/7))]";

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal
      aria-label="Compare two versions"
      className="nifl-enter fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative flex max-h-full max-w-full flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        {mode === "swipe" ? (
          <div className={cn("relative aspect-[7/9] max-w-full select-none overflow-hidden rounded-xl border bg-card", frame)}>
            <FadeImage src={props.b.src} alt={props.b.label} className="absolute inset-0 h-full w-full object-cover" />
            <FadeImage src={props.a.src} alt={props.a.label} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }} />
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
        ) : (
          <div className="flex max-w-full gap-3">
            {[props.a, props.b].map((v) => (
              <div key={v.src} className={cn("relative aspect-[7/9] max-w-[calc(50vw-1.5rem)] overflow-hidden rounded-xl border bg-card", frame)}>
                <FadeImage src={v.src} alt={v.label} className="absolute inset-0 h-full w-full object-cover" />
                {tag(v, "left-3")}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <div className="flex gap-0.5 rounded-lg border bg-card/70 p-0.5">
            {(["swipe", "side"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn("rounded-md px-2.5 py-1 transition-colors", mode === m ? "bg-secondary text-foreground" : "hover:text-foreground")}
              >
                {m === "swipe" ? "Swipe" : "Side by side"}
              </button>
            ))}
          </div>
          {mode === "swipe" && <span className="hidden sm:inline">Drag across the image · ← →</span>}
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => void toggleFull()} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-card hover:text-foreground">
              {full ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {full ? "Exit full screen" : "Full screen"}
            </button>
            <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-card hover:text-foreground">
              <X className="size-3.5" /> Close
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
