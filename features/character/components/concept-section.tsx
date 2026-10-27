"use client";

import { useState, useTransition } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { Job } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancel, generateConcepts, pickConcept } from "../actions/character";

// While a set is painted, say which style it is in; a style switch reads as a new set in that style.
function conceptMessage(current: string, requested: string | undefined, hadSet: boolean) {
  const label = (id: string) => STYLES.find((s) => s.id === id)?.label ?? id;
  if (requested && requested !== current && hadSet) return `Creating new concepts in the ${label(requested)} style`;
  return `Painting four ${label(requested ?? current).toLowerCase()} concepts`;
}

export function ConceptSection(props: {
  projectId: string;
  concepts: string[];
  style: string;
  picked: number | null; // index into concepts, if the current version is one of them
  hasVersion: boolean;
  job?: Job;
}) {
  const [open, setOpen] = useState(!props.hasVersion);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const expanded = open || running || !props.hasVersion;

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card/40 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">Concepts</h2>
        {!expanded && (
          <div className="flex items-center gap-1.5">
            {props.concepts.map((src, i) => (
              <FadeImage
                key={src}
                src={file(src)}
                alt={`Concept ${i + 1}`}
                className={cn("h-10 w-8 rounded-sm border object-cover", props.picked === i ? "border-foreground" : "opacity-40")}
              />
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {expanded && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => start(() => generateConcepts(props.projectId, { reseed: true }))}>
              <RefreshCw data-icon="inline-start" />
              New set
            </Button>
          )}
          {props.hasVersion && !running && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
              {expanded ? "Done" : "Change concept"}
              <ChevronDown data-icon="inline-end" className={cn("transition-transform", expanded && "rotate-180")} />
            </Button>
          )}
        </div>
      </div>

      {/* grid-rows 0fr/1fr collapses the grid smoothly to the thumbnail bar above */}
      <div className={cn("grid transition-[grid-template-rows] duration-500 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Style</span>
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => start(() => generateConcepts(props.projectId, { style: s.id }))}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-50",
                  props.style === s.id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(props.concepts.length ? props.concepts : ["", "", "", ""]).map((src, i) =>
              src ? (
                <button
                  key={src}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      await pickConcept(props.projectId, i);
                      setOpen(false);
                    })
                  }
                  className={cn(
                    "group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-ring/60",
                    props.picked === i && "border-foreground",
                  )}
                >
                  <FadeImage src={file(src)} alt={`Concept ${i + 1}`} className="aspect-[7/9] w-full object-cover" />
                  <span className="absolute bottom-2 left-2 rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
                    {props.picked === i ? "chosen" : `0${i + 1}`}
                  </span>
                </button>
              ) : (
                <div key={i} className="aspect-[7/9] rounded-lg border bg-card/60" />
              ),
            )}
            {running && props.job && (
              <FogLoader
                className="absolute inset-0 rounded-lg"
                message={conceptMessage(props.style, props.job.detail, props.concepts.length > 0)}
                startedAt={props.job.startedAt}
                expected={60}
                onCancel={() => cancel(props.projectId, "concepts")}
              />
            )}
          </div>
          {props.job?.status === "error" && <p className="text-sm text-destructive">Painting failed: {props.job.error}</p>}
          {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Painting cancelled.</p>}
        </div>
      </div>
    </section>
  );
}
