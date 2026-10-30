"use client";

import { useState, useTransition } from "react";
import { LoadingDots } from "@/components/loading-dots";
import type { Job } from "@/lib/store";
import { chooseEffect, makeEffect } from "../actions/effects";

// The chips under a reel clip: the take as shot, or one of its effects (features/reel/effects.ts).
// An effect not made yet is made on Comfy Cloud first (a job), then used; a made one is one click.
const EFFECTS = [
  { id: "refine", label: "Refine to HD" },
  { id: "night", label: "Night" },
] as const;

export function ClipEffects(props: { projectId: string; shot: string; made: string[]; use: string | null; job?: Job }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const running = props.job?.status === "running";
  const busy = pending || running;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const chip = (on: boolean) => `rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground"}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Effect">
      <span className="text-[11px] text-muted-foreground">Effect</span>
      <button type="button" aria-pressed={!props.use} disabled={busy} onClick={() => run(() => chooseEffect(props.projectId, props.shot, "none"))} className={chip(!props.use)}>
        None
      </button>
      {EFFECTS.map((e) => (
        <button
          key={e.id}
          type="button"
          aria-pressed={props.use === e.id}
          disabled={busy}
          title={props.made.includes(e.id) ? undefined : "Made on Comfy Cloud first: about a minute"}
          onClick={() => run(() => (props.made.includes(e.id) ? chooseEffect(props.projectId, props.shot, e.id) : makeEffect(props.projectId, props.shot, e.id)))}
          className={chip(props.use === e.id)}
        >
          {e.label}
          {!props.made.includes(e.id) && " +"}
        </button>
      ))}
      {running && (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <LoadingDots /> {props.job?.detail}
        </span>
      )}
      {props.job?.status === "error" && <span className="text-[11px] text-destructive">{props.job.error}</span>}
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
