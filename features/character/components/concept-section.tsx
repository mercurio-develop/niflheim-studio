"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { ConceptSet, Job } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancel, generateConcepts, pickConcept } from "../actions/character";

const label = (id: string) => STYLES.find((s) => s.id === id)?.label ?? id;

// Generate: one composer (prompt + style), one primary button. Earlier sets stay browsable;
// after a pick the section folds to a thumbnail strip with "New concepts".
export function ConceptSection(props: {
  projectId: string;
  prompt: string;
  style: string;
  seed: number;
  concepts: string[];
  sets: ConceptSet[];
  pickedImage: string | null;
  hasVersion: boolean;
  job?: Job;
}) {
  const [open, setOpen] = useState(!props.hasVersion);
  const [prompt, setPrompt] = useState(props.prompt);
  const [style, setStyle] = useState(props.style);
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
  const changed = prompt.trim() !== props.prompt || style !== props.style;

  const generate = () => {
    setError(null);
    start(async () => {
      try {
        await generateConcepts(props.projectId, { prompt: prompt.trim(), style, reseed: true });
        setViewing(null);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  if (!expanded) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/40 p-3">
        <h2 className="text-sm font-medium">Concepts</h2>
        <div className="flex items-center gap-1.5">
          {props.concepts.map((src, i) => (
            <FadeImage key={src} src={file(src)} alt={`Concept ${i + 1}`} className={cn("h-10 w-8 rounded-sm border object-cover", props.pickedImage === src ? "border-primary" : "opacity-40")} />
          ))}
        </div>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{label(props.style)}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Sparkles data-icon="inline-start" />
          New concepts
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card/40 p-4">
      {/* Composer */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label htmlFor="concept-prompt" className="text-sm font-medium">
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
          <Button type="submit" size="lg" disabled={busy || prompt.trim().length < 3}>
            {pending && !running ? <LoadingDots /> : <Sparkles data-icon="inline-start" />}
            {changed ? "Generate 4 concepts" : "Generate 4 more"}
          </Button>
          <span className="font-mono text-xs text-muted-foreground">~1 min · your current set is kept</span>
          {props.hasVersion && !running && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(false)}>
              Back to editing
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>

      {/* Results */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{shown.at === null ? "Latest set" : `Set ${shownIndex + 1}`}</h2>
        <span className="truncate text-xs text-muted-foreground">
          {label(shown.style)} · {shown.prompt}
        </span>
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
      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(shown.images.length ? shown.images : ["", "", "", ""]).map((src, i) =>
          src ? (
            <button
              key={src}
              type="button"
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
            <div key={i} className="aspect-[7/9] rounded-lg border bg-card/60" />
          ),
        )}
        {running && props.job && (
          <FogLoader
            className="absolute inset-0 rounded-lg"
            message={props.job.detail && props.job.detail !== props.style ? `Painting four ${label(props.job.detail).toLowerCase()} concepts` : "Painting four new concepts"}
            startedAt={props.job.startedAt}
            expected={60}
            onCancel={() => cancel(props.projectId, "concepts")}
          />
        )}
      </div>
      {props.job?.status === "error" && <p className="text-sm text-destructive">Painting failed: {props.job.error}</p>}
      {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Painting cancelled.</p>}
    </section>
  );
}
