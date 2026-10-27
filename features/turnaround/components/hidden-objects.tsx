"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Brush, Eraser, Paintbrush, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { savePart } from "@/features/character/actions/character";
import { SelectionCanvas, type SelectionHandle } from "@/features/character/components/selection-canvas";
import { cn } from "@/lib/utils";
import { ASSETS } from "../flags";

// Each hidden object with its mask on the character (pink), zoomed in on the object, so you see
// what will be painted out before anything runs. An empty mask says it was not found. Keep as asset: also save it to make on its own later. Refine: paint or
// erase the mask; it is saved as that part of the character version.
export function HiddenObjects(props: {
  projectId: string;
  character: string;
  hide: string[];
  keep: string[];
  parts: Record<string, string>;
  finding: string | null; // the name whose mask is being found
  disabled: boolean;
  onKeep: (name: string, on: boolean) => void;
  onUnhide: (name: string) => void;
}) {
  const [refining, setRefining] = useState<string | null>(null);
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  if (!props.hide.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-3">
        {props.hide.map((name) => {
          const mask = props.parts[name];
          return (
            <li key={name} className={cn("flex w-36 flex-col gap-1.5 rounded-lg border bg-card/40 p-1.5", refining === name && "border-tone-pink")}>
              <div className="relative overflow-hidden rounded-md border bg-card">
                <Zoomed character={file(props.character)} mask={mask ? file(mask) : null} finding={props.finding === name} />
                <button type="button" onClick={() => props.onUnhide(name)} aria-label={`Show the ${name} again`} className="absolute top-1 right-1 flex size-6 items-center justify-center rounded border bg-background/80 text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
              <span className="truncate text-xs">{name}</span>
              {ASSETS && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={props.keep.includes(name)} onChange={(e) => props.onKeep(name, e.target.checked)} className="accent-tone-pink" />
                  Keep as asset
                </label>
              )}
              <Button variant="ghost" size="xs" disabled={props.disabled} onClick={() => setRefining(refining === name ? null : name)}>
                <Paintbrush data-icon="inline-start" />
                Refine
              </Button>
            </li>
          );
        })}
      </ul>
      <span className="text-[11px] text-muted-foreground">Pink is what gets painted out. Too much or too little? Refine it; nothing pink means it was not found.</span>
      {refining && (
        <Refine key={refining} projectId={props.projectId} name={refining} src={file(props.character)} mask={props.parts[refining] ? file(props.parts[refining]) : undefined} onDone={() => setRefining(null)} />
      )}
    </div>
  );
}

// The white area of a mask as fractions of the image, or null when it is empty.
type Frame = { x: number; y: number; w: number; h: number };
function useMaskFrame(url: string | null) {
  const [frame, setFrame] = useState<Frame | null | undefined>(undefined); // undefined = still reading
  useEffect(() => {
    if (!url) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      const w = 128, h = Math.max(1, Math.round((128 * img.naturalHeight) / img.naturalWidth));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4] > 127) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (live) setFrame(x1 < 0 ? null : { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h });
    };
    img.src = url;
    return () => void (live = false);
  }, [url]);
  return url ? frame : undefined;
}

// A square window on the character around the mask (with a margin), the mask in pink on top.
function Zoomed(props: { character: string; mask: string | null; finding: boolean }) {
  const frame = useMaskFrame(props.mask);
  if (!props.mask || frame === undefined || frame === null) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.character} alt="" className="block h-auto w-full opacity-60" />
        <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/40 px-2 text-center text-[11px] text-muted-foreground">
          {props.finding ? <>Finding <LoadingDots /></> : frame === null ? "Not found. Refine to paint it." : "Waiting"}
        </span>
      </div>
    );
  }
  // Grow the box by a fifth and make it square in image fractions (the image is 7:9).
  const side = Math.min(1, Math.max(frame.w, (frame.h * 9) / 7) * 1.25);
  const sw = side, sh = Math.min(1, (side * 7) / 9);
  const cx = Math.min(Math.max(frame.x + frame.w / 2, sw / 2), 1 - sw / 2), cy = Math.min(Math.max(frame.y + frame.h / 2, sh / 2), 1 - sh / 2);
  const layer = { width: `${100 / sw}%`, height: `${100 / sh}%`, left: `${(-(cx - sw / 2) / sw) * 100}%`, top: `${(-(cy - sh / 2) / sh) * 100}%` };
  return (
    <div className="relative aspect-square overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.character} alt="" className="absolute max-w-none" style={layer} />
      <div aria-hidden className="absolute bg-tone-pink opacity-60" style={{ ...layer, maskImage: `url(${props.mask})`, maskMode: "luminance", maskSize: "100% 100%" }} />
    </div>
  );
}

function Refine(props: { projectId: string; name: string; src: string; mask?: string; onDone: () => void }) {
  const canvas = useRef<SelectionHandle>(null);
  const [tool, setTool] = useState<"add" | "erase">("add");
  const [size, setSize] = useState(32);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      try {
        const blob = await canvas.current?.exportMask();
        if (!blob) throw new Error("Nothing to save.");
        const form = new FormData();
        form.set("name", props.name);
        form.set("mask", new File([blob], "mask.png", { type: "image/png" }));
        await savePart(props.projectId, form, "character");
        props.onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  return (
    <div className="nifl-enter flex flex-wrap items-start gap-4 rounded-xl border bg-card/30 p-3">
      <div className="relative w-full max-w-xs overflow-hidden rounded-md border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.src} alt={`The character, refining the ${props.name}`} className="block h-auto w-full" />
        <SelectionCanvas ref={canvas} src={props.src} baseMask={props.mask} tool={tool} size={size} onChange={() => {}} />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-3">
        <h3 className="text-sm font-semibold">Refine the {props.name}</h3>
        <div className="flex gap-1.5">
          <Button variant={tool === "add" ? "secondary" : "ghost"} size="sm" aria-pressed={tool === "add"} onClick={() => setTool("add")}>
            <Brush data-icon="inline-start" />
            Paint
          </Button>
          <Button variant={tool === "erase" ? "secondary" : "ghost"} size="sm" aria-pressed={tool === "erase"} onClick={() => setTool("erase")}>
            <Eraser data-icon="inline-start" />
            Erase
          </Button>
          <Button variant="ghost" size="sm" onClick={() => canvas.current?.clear()}>
            Clear
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Size
          <input type="range" min={8} max={160} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-primary" />
          <span className="w-8 font-mono">{size}</span>
        </label>
        <div className="mt-auto flex gap-2">
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? <LoadingDots /> : "Save mask"}
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onDone}>
            Cancel
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
