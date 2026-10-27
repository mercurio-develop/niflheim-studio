"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeImage } from "@/components/fade-image";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Job, Version } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancel, maskPart, swapPart } from "../actions/character";

const FALLBACK = ["hair", "face", "coat", "pants", "boots"];

export function PartEditor(props: {
  projectId: string;
  version: Version;
  jobs: { mask?: Job; swap?: Job; tags?: Job };
}) {
  const [part, setPart] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [change, setChange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const is = (j?: Job) => j?.status === "running";
  const masking = is(props.jobs.mask);
  const swapping = is(props.jobs.swap);
  const tagging = is(props.jobs.tags) && !props.version.tags;
  const busy = pending || masking || swapping;
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
        {mask && !swapping && (
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
        {swapping && props.jobs.swap && (
          <FogLoader className="absolute inset-0" message={`Repainting the ${part ?? "part"}`} startedAt={props.jobs.swap.startedAt} expected={45} onCancel={() => cancel(props.projectId, "swap")} />
        )}
        <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
          {props.version.label}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Parts</h2>
            <p className="text-sm text-muted-foreground">
              {tagging ? "Looking at the character to name its parts..." : "These are the parts we can see. Pick one, then say what it becomes."}
            </p>
          </div>
          <div className="flex min-h-7 flex-wrap gap-2">
            {tagging &&
              Array.from({ length: 6 }, (_, i) => <span key={i} className="h-7 w-20 animate-pulse rounded-full border bg-card" />)}
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        {props.jobs.swap?.status === "error" && <p className="text-sm text-destructive">Repaint failed: {props.jobs.swap.error}</p>}
        {props.jobs.mask?.status === "error" && <p className="text-sm text-destructive">Could not find that part: {props.jobs.mask.error}</p>}
      </div>
    </section>
  );
}
