"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, ImageUp, PenLine, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { ParticleField } from "@/components/particle-field";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { ConceptSet, Job } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancel, clearReference, generateConcepts, pickConcept, setReference } from "../actions/character";
import { SketchPad } from "./sketch-pad";

const label = (id: string) => STYLES.find((s) => s.id === id)?.label ?? id;

// A numbered section heading with its colour dot and one short line.
export function SectionTitle(props: { n: string; tone: string; title: string; line?: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {props.n ? (
        <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold text-background ${props.tone}`}>{props.n}</span>
      ) : (
        <span className={`mt-2 ml-2 size-2 shrink-0 rounded-full ${props.tone}`} />
      )}
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6">{props.title}</h2>
        {props.line && <p className="truncate text-sm text-muted-foreground">{props.line}</p>}
      </div>
    </div>
  );
}

// Generate: one composer (prompt + style), one primary button. Earlier sets stay browsable;
// after a pick the section folds to a thumbnail strip with "New concepts".
export function ConceptSection(props: {
  projectId: string;
  prompt: string;
  style: string;
  seed: number;
  count: number;
  reference: string | null;
  concepts: string[];
  sets: ConceptSet[];
  pickedImage: string | null;
  hasVersion: boolean;
  job?: Job;
}) {
  const [open, setOpen] = useState(!props.hasVersion);
  const [prompt, setPrompt] = useState(props.prompt);
  const [style, setStyle] = useState(props.style);
  const [count, setCount] = useState(props.count);
  const [sketching, setSketching] = useState(false);
  const perImage = props.reference ? 22 : 12; // seconds: a sketch is one Qwen edit per concept
  const [viewing, setViewing] = useState<number | null>(null); // index into sets; null = the current set
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const expanded = open || running || !props.hasVersion;

  const all: (ConceptSet & { at: number | null })[] = [
    ...props.sets.map((s, i) => ({ ...s, at: i })),
    { prompt: props.prompt, style: props.style, seed: props.seed, images: props.concepts, at: null },
  ];
  const shownIndex = viewing === null ? all.length - 1 : viewing;
  const shown = all[shownIndex];

  const generate = () => {
    setError(null);
    start(async () => {
      try {
        await generateConcepts(props.projectId, { prompt: prompt.trim(), style, count, reseed: true });
        setViewing(null);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  if (!expanded) {
    return (
      <section className="flex flex-wrap items-center gap-3">
        <SectionTitle n="1" tone="bg-tone-yellow" title="Concept" />
        <div className="flex items-center gap-1.5">
          {props.concepts.map((src, i) => (
            <FadeImage key={src} src={file(src)} alt={`Concept ${i + 1}`} className={cn("h-10 w-8 rounded-sm border object-cover", props.pickedImage === src ? "border-primary" : "opacity-40")} />
          ))}
        </div>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{label(props.style)}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <RefreshCw data-icon="inline-start" />
          New concepts
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle n="1" tone="bg-tone-yellow" title="Describe" line="Who are they, and what look? Choose how many concepts to paint." />
        {props.hasVersion && !running && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close and keep editing">
            <X data-icon="inline-start" />
            Close
          </Button>
        )}
      </div>
      {/* Composer */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label htmlFor="concept-prompt" className="sr-only">
          Describe your character
        </label>
        <Textarea
          id="concept-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="resize-none text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">Style</span>
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                style === s.id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted-foreground">Reference</span>
          {props.reference ? (
            <span className="flex items-center gap-2 rounded-lg border bg-card/60 p-1 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file(props.reference)} alt="Your reference" className="h-12 w-[37px] rounded-md border bg-white object-cover" />
              <span className="text-xs">Concepts follow this sketch</span>
              <button
                type="button"
                aria-label="Remove the reference"
                disabled={busy}
                onClick={() => start(() => clearReference(props.projectId))}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">optional</span>
          )}
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setSketching(true)}>
            <PenLine data-icon="inline-start" />
            {props.reference ? "New sketch" : "Draw a sketch"}
          </Button>
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground", busy && "pointer-events-none opacity-50")}>
            <ImageUp className="size-3.5" />
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const form = new FormData();
                form.set("image", f);
                start(() => setReference(props.projectId, form).catch((err: Error) => setError(err.message)));
              }}
            />
          </label>
        </div>
        {sketching && (
          <SketchPad
            onClose={() => setSketching(false)}
            onDone={(png) => {
              setSketching(false);
              const form = new FormData();
              form.set("image", new File([png], "sketch.png", { type: "image/png" }));
              start(() => setReference(props.projectId, form).catch((err: Error) => setError(err.message)));
            }}
          />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="How many concepts">
            <span className="mr-1 text-xs text-muted-foreground">How many</span>
            {[1, 2, 4, 6].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                onClick={() => setCount(n)}
                className={cn(
                  "min-w-8 rounded-full border px-2.5 py-0.5 font-mono text-xs transition-colors",
                  count === n ? "border-tone-yellow bg-tone-yellow text-background" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                )}
              >
                {n}
              </button>
            ))}
            <span className="ml-1 font-mono text-[11px] text-muted-foreground">~{Math.max(1, Math.round((10 + count * perImage) / 10) * 10)} s</span>
          </div>
          <Button type="submit" size="lg" className="ml-auto" disabled={busy || prompt.trim().length < 3}>
            {pending && !running ? <LoadingDots /> : null}
            Generate
          </Button>
        </div>
        <p className="-mt-1 text-right text-[11px] text-muted-foreground">Earlier sets are kept.</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {/* Results */}
      <div className="flex items-end gap-3">
        <SectionTitle n="" tone="bg-tone-yellow" title="Pick one" line={`${shown.at === null ? "Latest set" : `Set ${shownIndex + 1}`} · ${label(shown.style)}`} />
        {all.length > 1 && (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Earlier set" disabled={shownIndex === 0} onClick={() => setViewing(shownIndex - 1)}>
              <ChevronLeft />
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              {shownIndex + 1}/{all.length}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Later set" disabled={shownIndex === all.length - 1} onClick={() => setViewing(shownIndex + 1 === all.length - 1 ? null : shownIndex + 1)}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      {/* While painting: the field fills the page, one status line here, placeholders below.
          When the set lands, the particles gather onto the new tiles ([data-land]) and burst. */}
      <ParticleField active={!!running} />
      {running && props.job && (
        <JobStatus
          message={`Painting ${props.count === 1 ? "one" : props.count} ${props.job.detail && props.job.detail !== props.style ? `${label(props.job.detail).toLowerCase()} ` : "new "}concept${props.count === 1 ? "" : "s"}${props.reference ? " from your sketch" : ""}`}
          startedAt={props.job.startedAt}
          expected={10 + props.count * 12}
          onCancel={() => cancel(props.projectId, "concepts")}
        />
      )}
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(running ? Array.from({ length: props.count }, () => "") : shown.images.length ? shown.images : Array.from({ length: props.count }, () => "")).map((src, i) =>
          src ? (
            <button
              key={src}
              type="button"
              data-land
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await pickConcept(props.projectId, i, shown.at ?? undefined);
                  setOpen(false);
                })
              }
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-ring/60",
                props.pickedImage === src && "border-primary",
              )}
            >
              <FadeImage src={file(src)} alt={`Concept ${i + 1}`} className="aspect-[7/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
              <span className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                <span className="rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
                  {props.pickedImage === src ? "chosen" : `0${i + 1}`}
                </span>
                <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Use this
                </span>
              </span>
            </button>
          ) : (
            <div
              key={i}
              className={cn("aspect-[7/9] rounded-lg border bg-card/30 backdrop-blur-[1px]", running && "animate-pulse border-primary/20")}
              style={running ? { animationDelay: `${i * 120}ms` } : undefined}
            />
          ),
        )}
      </div>
      {props.job?.status === "error" && <p className="text-sm text-destructive">Painting failed: {props.job.error}</p>}
      {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Painting cancelled.</p>}
    </section>
  );
}
