"use client";

import { useRef, useState, useTransition } from "react";
import { Brush, Eraser, Paintbrush, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { savePart } from "@/features/character/actions/character";
import { SelectionCanvas, type SelectionHandle } from "@/features/character/components/selection-canvas";
import { cn } from "@/lib/utils";

// Each hidden object with its mask on the character (pink), so you see what will be painted out
// before anything runs. Keep as asset: also save it to make on its own later. Refine: paint or
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file(props.character)} alt="" className="block h-auto w-full" />
                {mask ? (
                  <div aria-hidden className="absolute inset-0 bg-tone-pink opacity-70" style={{ maskImage: `url(${file(mask)})`, maskMode: "luminance", maskSize: "100% 100%" }} />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/50 text-[11px] text-muted-foreground">
                    {props.finding === name ? <>Finding <LoadingDots /></> : "Waiting"}
                  </span>
                )}
                <button type="button" onClick={() => props.onUnhide(name)} aria-label={`Show the ${name} again`} className="absolute top-1 right-1 flex size-6 items-center justify-center rounded border bg-background/80 text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              </div>
              <span className="truncate text-xs">{name}</span>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input type="checkbox" checked={props.keep.includes(name)} onChange={(e) => props.onKeep(name, e.target.checked)} className="accent-tone-pink" />
                Keep as asset
              </label>
              <Button variant="ghost" size="xs" disabled={!mask || props.disabled} onClick={() => setRefining(refining === name ? null : name)}>
                <Paintbrush data-icon="inline-start" />
                Refine
              </Button>
            </li>
          );
        })}
      </ul>
      <span className="text-[11px] text-muted-foreground">Pink is what gets painted out. Too much or too little? Refine it; nothing pink means it was not found.</span>
      {refining && props.parts[refining] && (
        <Refine key={refining} projectId={props.projectId} name={refining} src={file(props.character)} mask={file(props.parts[refining])} onDone={() => setRefining(null)} />
      )}
    </div>
  );
}

function Refine(props: { projectId: string; name: string; src: string; mask: string; onDone: () => void }) {
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
