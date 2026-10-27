"use client";

import { useRef, useState, useTransition } from "react";
import { ArrowRight, Brush, Eraser, Search, Tags, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Box } from "@/lib/brush";
import type { Job, Version } from "@/lib/store";
import { cn } from "@/lib/utils";
import { brushEdit, cancel, maskPart, swapPart } from "../actions/character";
import { BrushCanvas, type BrushHandle } from "./brush-canvas";

const FALLBACK = ["hair", "face", "coat", "pants", "boots"];

export function PartEditor(props: {
  projectId: string;
  version: Version;
  jobs: { mask?: Job; swap?: Job; tags?: Job; brush?: Job };
}) {
  const [part, setPart] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [change, setChange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tool, setTool] = useState<"parts" | "brush">("parts");
  const [brushMode, setBrushMode] = useState<"add" | "remove">("add");
  const [brushSize, setBrushSize] = useState(60);
  const [thing, setThing] = useState("");
  const [box, setBox] = useState<Box | null>(null);
  const [strokeCount, setStrokeCount] = useState(0);
  const brush = useRef<BrushHandle>(null);
  const is = (j?: Job) => j?.status === "running";
  const masking = is(props.jobs.mask);
  const swapping = is(props.jobs.swap);
  const brushing = is(props.jobs.brush);
  const tagging = is(props.jobs.tags) && !props.version.tags;
  const busy = pending || masking || swapping || brushing;
  const mask = part ? props.version.parts[part] : undefined;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const chips = props.version.tags?.length ? props.version.tags : tagging ? [] : FALLBACK;

  const choose = (name: string) => {
    if (name !== part) setChange("");
    setPart(name);
    setError(null);
    if (!props.version.parts[name]) start(() => maskPart(props.projectId, name).catch((e: Error) => setError(e.message)));
  };

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="relative self-start overflow-hidden rounded-xl border bg-card">
        <FadeImage key={props.version.image} src={file(props.version.image)} alt={props.version.label} className="aspect-[7/9] w-full object-cover" />
        {tool === "parts" && mask && !swapping && (
          <>
            {/* Spotlight: dim the whole figure, show the chosen part at full strength through its mask. */}
            <div aria-hidden className="absolute inset-0 bg-background/70 transition-opacity" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              aria-hidden
              src={file(props.version.image)}
              alt=""
              className="absolute inset-0 aspect-[7/9] w-full object-cover"
              style={{ maskImage: `url(${file(mask)})`, maskMode: "luminance", maskSize: "cover", maskPosition: "center" }}
            />
          </>
        )}
        {masking && props.jobs.mask && (
          <FogLoader className="absolute inset-0" compact message={`Finding the ${part ?? "part"}`} startedAt={props.jobs.mask.startedAt} expected={8} onCancel={() => cancel(props.projectId, "mask")} />
        )}
        {tool === "brush" && (
          <BrushCanvas
            ref={brush}
            src={file(props.version.image)}
            size={brushSize}
            disabled={busy}
            onChange={(b, n) => {
              setBox(b);
              setStrokeCount(n);
            }}
          />
        )}
        {brushing && props.jobs.brush && (
          <FogLoader
            className="absolute inset-0"
            message={props.jobs.brush.detail ?? "Painting"}
            startedAt={props.jobs.brush.startedAt}
            expected={30}
            onCancel={() => cancel(props.projectId, "brush")}
          />
        )}
        {swapping && props.jobs.swap && (
          <FogLoader className="absolute inset-0" message={`Repainting the ${part ?? "part"}`} startedAt={props.jobs.swap.startedAt} expected={45} onCancel={() => cancel(props.projectId, "swap")} />
        )}
        <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
          {props.version.label}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div role="tablist" aria-label="Edit tool" className="flex w-fit gap-1 rounded-lg border bg-card/60 p-1">
          {([["parts", "Parts", Tags], ["brush", "Brush", Brush]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tool === id}
              onClick={() => setTool(id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                tool === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>

        {tool === "parts" && (
        <>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Parts</h2>
            <p className="text-sm text-muted-foreground">
              {tagging ? (
                <span className="flex items-center gap-2 text-foreground">
                  Naming the parts <LoadingDots className="text-primary" />
                </span>
              ) : (
                "These are the parts we can see. Pick one, then say what it becomes."
              )}
            </p>
          </div>
          <div className="flex min-h-7 flex-wrap gap-2">
            {chips.map((name) => (
              <button
                key={name}
                type="button"
                disabled={busy}
                onClick={() => choose(name)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50",
                  part === name ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                )}
              >
                {props.version.parts[name] && <span className={cn("size-1.5 rounded-full", part === name ? "bg-primary-foreground" : "bg-primary")} />}
                {name}
                {masking && part === name && <LoadingDots />}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) choose(custom.trim().toLowerCase());
              setCustom("");
            }}
          >
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Another part, e.g. scarf" className="max-w-60" />
            <Button type="submit" variant="outline" disabled={busy || !custom.trim()}>
              <Search data-icon="inline-start" />
              Find
            </Button>
          </form>
        </div>

        {part && (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(() =>
                swapPart(props.projectId, { part, change })
                  .then(() => setChange(""))
                  .catch((err: Error) => setError(err.message)),
              );
            }}
          >
            <label htmlFor="change" className="text-base">
              Change the <span className="font-semibold">{part}</span> into
            </label>
            <div className="flex items-center gap-2 rounded-xl border bg-card/60 p-1.5 pl-3 focus-within:border-ring/60">
              <input
                id="change"
                value={change}
                onChange={(e) => setChange(e.target.value)}
                placeholder="a dented bronze helmet with a red plume"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="lg" disabled={busy || !mask || change.trim().length < 3}>
                Repaint
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {masking ? `finding the ${part}...` : mask ? "only the lit area changes; the rest stays pixel for pixel" : ""}
            </p>
          </form>
        )}
        </>
        )}

        {tool === "brush" && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!box) return;
              setError(null);
              start(() =>
                brushEdit(props.projectId, { mode: brushMode, thing, strokes: box })
                  .then(() => setThing(""))
                  .catch((err: Error) => setError(err.message)),
              );
            }}
          >
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Brush</h2>
              <p className="text-sm text-muted-foreground">
                Paint over the area, then say what to {brushMode === "add" ? "add there" : "remove"}. Only a box around your strokes can change.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-lg border bg-card/60 p-1">
                {(["add", "remove"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBrushMode(m)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm capitalize transition-colors",
                      brushMode === m ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Size
                <input
                  type="range"
                  min={16}
                  max={200}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-28 accent-primary"
                />
                <span className="w-8 font-mono">{brushSize}</span>
              </label>
              <Button type="button" variant="ghost" size="sm" disabled={!strokeCount || busy} onClick={() => brush.current?.undo()}>
                <Undo2 data-icon="inline-start" />
                Undo
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={!strokeCount || busy} onClick={() => brush.current?.clear()}>
                <Eraser data-icon="inline-start" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-card/60 p-1.5 pl-3 focus-within:border-ring/60">
              <span className="text-sm text-muted-foreground">{brushMode === "add" ? "Add" : "Remove"}</span>
              <input
                aria-label={brushMode === "add" ? "What to add" : "What to remove"}
                value={thing}
                onChange={(e) => setThing(e.target.value)}
                placeholder={brushMode === "add" ? "a black raven perched on the shoulder" : "the shield"}
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="lg" disabled={busy || !box || thing.trim().length < 2}>
                {pending && !brushing ? <LoadingDots /> : "Paint it"}
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {strokeCount ? `${strokeCount} stroke${strokeCount > 1 ? "s" : ""} · changes stay inside the box around them` : "paint on the character to start"}
            </p>
            {props.jobs.brush?.status === "error" && <p className="text-sm text-destructive">Painting failed: {props.jobs.brush.error}</p>}
          </form>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {props.jobs.swap?.status === "error" && <p className="text-sm text-destructive">Repaint failed: {props.jobs.swap.error}</p>}
        {props.jobs.mask?.status === "error" && <p className="text-sm text-destructive">Could not find that part: {props.jobs.mask.error}</p>}
      </div>
    </section>
  );
}
