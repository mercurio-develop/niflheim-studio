"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Brush, Check, Eraser, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const W = 896;
const H = 1152; // the concepts' own size, so the sketch maps 1:1

// Draw the character: black ink on white, pen or eraser, undo, clear. "Use sketch" hands back a PNG.
export function SketchPad(props: { onDone: (png: Blob) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const history = useRef<ImageData[]>([]);
  const last = useRef<[number, number] | null>(null);
  const undoKey = useRef<() => void>(() => {}); // the key handler always calls the current undo
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [size, setSize] = useState(8);
  const [strokes, setStrokes] = useState(0);
  const { onClose } = props;

  useEffect(() => {
    const ctx = canvas.current!.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undoKey.current(); }
      if (e.key.toLowerCase() === "e") setTool((t) => (t === "pen" ? "eraser" : "pen"));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const ctx = () => canvas.current!.getContext("2d", { willReadFrequently: true })!;
  const at = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const line = (a: [number, number], b: [number, number], pressure: number) => {
    const c = ctx();
    c.strokeStyle = tool === "pen" ? "#111" : "#fff";
    c.lineWidth = (tool === "pen" ? size : size * 4) * (0.5 + pressure);
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke();
  };
  undoKey.current = () => undo();
  function undo() {
    const prev = history.current.pop();
    if (!prev) return;
    ctx().putImageData(prev, 0, 0);
    setStrokes((n) => Math.max(0, n - 1));
  }
  const clear = () => {
    history.current.push(ctx().getImageData(0, 0, W, H));
    const c = ctx();
    c.fillStyle = "#fff";
    c.fillRect(0, 0, W, H);
    setStrokes(0);
  };

  const tools: ["pen" | "eraser", string, typeof Brush][] = [["pen", "Pen", Brush], ["eraser", "Eraser", Eraser]];

  return createPortal(
    <div role="dialog" aria-modal aria-label="Draw a sketch" className="nifl-enter fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="flex max-h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-base font-semibold">Sketch your character</h2>
          <div className="flex gap-0.5 rounded-lg border bg-card/70 p-0.5">
            {tools.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tool === id}
                onClick={() => setTool(id)}
                className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors", tool === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Size
            <input type="range" min={2} max={32} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-28 accent-primary" />
          </label>
          <Button variant="ghost" size="sm" onClick={undo} disabled={!strokes}>
            <Undo2 data-icon="inline-start" />
            Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={clear} disabled={!strokes}>
            <Trash2 data-icon="inline-start" />
            Clear
          </Button>
          <div className="ml-auto flex gap-1.5">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X data-icon="inline-start" />
              Cancel
            </Button>
            <Button size="sm" disabled={!strokes} onClick={() => canvas.current!.toBlob((b) => b && props.onDone(b), "image/png")}>
              <Check data-icon="inline-start" />
              Use sketch
            </Button>
          </div>
        </div>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Sketch canvas"
          className="aspect-[7/9] h-[min(78svh,calc((100vw-2rem)*9/7))] cursor-crosshair touch-none rounded-xl border bg-white shadow-lg"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            history.current.push(ctx().getImageData(0, 0, W, H));
            if (history.current.length > 30) history.current.shift();
            const p = at(e);
            last.current = p;
            line(p, p, e.pressure || 0.5);
          }}
          onPointerMove={(e) => {
            if (!last.current) return;
            const p = at(e);
            line(last.current, p, e.pressure || 0.5);
            last.current = p;
          }}
          onPointerUp={() => {
            if (!last.current) return;
            last.current = null;
            setStrokes((n) => n + 1);
          }}
        />
        <p className="text-center text-[11px] text-muted-foreground">
          Rough is fine: pose, silhouette and big shapes are what count. E switches pen / eraser · Ctrl/⌘ Z undo · Esc cancel
        </p>
      </div>
    </div>,
    document.body,
  );
}
