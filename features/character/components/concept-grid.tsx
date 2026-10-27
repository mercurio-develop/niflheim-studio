"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateConcepts, pickConcept } from "../actions/character";

export function ConceptGrid(props: {
  projectId: string;
  concepts: string[];
  picked: string | null;
  running: boolean;
}) {
  const [pending, start] = useTransition();
  const busy = pending || props.running;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Concepts</h2>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => start(() => generateConcepts(props.projectId, true))}>
          <RefreshCw data-icon="inline-start" />
          New set
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(props.concepts.length ? props.concepts : Array.from({ length: 4 }, () => "")).map((src, i) =>
          src ? (
            <button
              key={src}
              type="button"
              disabled={busy}
              onClick={() => start(() => pickConcept(props.projectId, i))}
              className={cn(
                "group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-ring/60",
                props.picked === src && "border-foreground",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${props.projectId}/${src}`} alt={`Concept ${i + 1}`} className="aspect-[7/9] w-full object-cover" />
              <span className="absolute bottom-2 left-2 rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">
                {props.picked === src ? "picked" : `0${i + 1}`}
              </span>
            </button>
          ) : (
            <div key={i} className={cn("aspect-[7/9] rounded-lg border bg-card/60", props.running && "animate-pulse")} />
          ),
        )}
      </div>
    </section>
  );
}
