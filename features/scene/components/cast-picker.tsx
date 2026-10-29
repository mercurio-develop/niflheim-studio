"use client";

import { useState, useTransition } from "react";
import { Plus, UserRound, X } from "lucide-react";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import type { Job } from "@/lib/store";
import { cn } from "@/lib/utils";
import { addCastMember, deleteAsset } from "../actions/assets";
import { chip } from "./chip";

// A character made in the Character step (not the first, who is always on the stage). onStage:
// the scene asset that stands it there, if any.
export type CastOption = { cid: string; name: string; image: string | null; ready: boolean; onStage: string | null };

// The project's other characters as chips: one tap cuts it out and adds it to the stage (then
// Place puts it on the floor and the gizmo moves it), a second takes it off. A character whose
// turnaround is not finished waits in the Character step.
export function CastPicker(props: { projectId: string; cast: CastOption[]; jobs: Record<string, Job> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  if (!props.cast.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Your characters: tap one to stand it on the stage, again to take it off.</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {props.cast.map((c) => {
          const running = !!c.onStage && props.jobs[`scene-asset:${c.onStage}`]?.status === "running";
          return (
            <button
              key={c.cid}
              type="button"
              aria-pressed={!!c.onStage}
              disabled={pending || running || (!c.ready && !c.onStage)}
              title={!c.ready && !c.onStage ? `Finish ${c.name}'s turnaround in the Character step first` : undefined}
              onClick={() => run(() => (c.onStage ? deleteAsset(props.projectId, c.onStage) : addCastMember(props.projectId, c.cid)))}
              className={cn(chip(!!c.onStage), "inline-flex items-center gap-1.5")}
            >
              {c.image ? <FadeImage src={`/api/files/${props.projectId}/${c.image}`} alt="" className="size-4 rounded-full object-cover" /> : <UserRound className="size-3" />}
              {c.name}
              {running ? <LoadingDots /> : c.onStage ? <X className="size-3" /> : <Plus className="size-3" />}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
