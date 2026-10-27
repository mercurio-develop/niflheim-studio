"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { ParticleField } from "@/components/particle-field";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { ConceptSet, Job } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancel, clearReference, generateConcepts, pickConcept, setReference } from "../actions/character";
import { Composer, type ComposerValues } from "@/components/composer";
import { SectionTitle } from "@/components/section-title";

const label = (id: string) => STYLES.find((s) => s.id === id)?.label ?? id;

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

  const generate = (v: ComposerValues) => {
    setError(null);
    start(async () => {
      try {
        await generateConcepts(props.projectId, { ...v, reseed: true });
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
      <Composer
        key={`${props.style}:${props.prompt}:${props.count}`}
        id="concept-prompt"
        defaults={{ prompt: props.prompt, style: props.style, count: props.count }}
        reference={props.reference ? file(props.reference) : null}
        onReference={(image) => {
          const form = new FormData();
          form.set("image", image);
          start(() => setReference(props.projectId, form).catch((err: Error) => setError(err.message)));
        }}
        onClearReference={() => start(() => clearReference(props.projectId).catch((err: Error) => setError(err.message)))}
        onGenerate={generate}
        busy={busy}
        pending={pending && !running}
        error={error}
      />

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
          expected={10 + props.count * perImage}
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
                  try {
                    await pickConcept(props.projectId, i, shown.at ?? undefined);
                    setOpen(false);
                  } catch (err) {
                    setError((err as Error).message);
                  }
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
              className={cn("aspect-[7/9] rounded-lg border bg-card/30 backdrop-blur-[1px]", running && "motion-safe:animate-pulse border-primary/20")}
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
