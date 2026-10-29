"use client";

import { useState, useTransition } from "react";
import { Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import type { CharacterPose, Job } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelPose, deletePose, makePose, remakePose } from "../actions/poses";

// Poses a shot can put the character in: each says, in plain words, what Qwen should make of the
// turnaround's front.
const PRESETS = [
  { label: "Running", prompt: "run toward the viewer at full speed, one leg forward, arms pumping" },
  { label: "Walking", prompt: "walk forward calmly, mid-step, arms swinging naturally" },
  { label: "Angry", prompt: "stand angry, fists clenched, leaning forward, teeth bared, a furious face" },
  { label: "Happy", prompt: "stand happy and relaxed, arms open, a big warm smile" },
  { label: "Scared", prompt: "recoil scared, arms raised to protect the face, knees bent, wide eyes" },
  { label: "Attacking", prompt: "attack, lunging forward in a fighting stance, one arm swinging" },
  { label: "Waving", prompt: "wave hello with one raised hand, smiling" },
  { label: "Sitting", prompt: "sit on the ground with legs crossed, hands on the knees" },
];
const ORDER = ["front", "threequarter", "side", "back"] as const;

// The character in other poses, made from the turnaround: four views each, cut out for the stage.
// In Shots, a shot picks one (and one to switch to halfway).
export function PosesPanel(props: { projectId: string; poses: CharacterPose[]; jobs: Record<string, Job>; locked: boolean }) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const taken = new Set(props.poses.map((p) => p.label.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">The same character in other poses, each with its four views. In Shots, a shot can use one, and switch to another halfway: the keyframes show the change and LTX animates it. About 2.5 min a pose.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.filter((x) => !taken.has(x.label.toLowerCase())).map((x) => (
          <button
            key={x.label}
            type="button"
            disabled={pending || props.locked}
            onClick={() => run(() => makePose(props.projectId, x))}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3" />
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:max-w-xl">
        <input aria-label="Pose name" value={label} maxLength={30} placeholder="name: Dancing" onChange={(e) => setLabel(e.target.value)} className="h-8 w-32 rounded-md border bg-transparent px-2 text-sm" />
        <input aria-label="What they do" value={prompt} maxLength={200} placeholder="what they do: dance with both arms raised" onChange={(e) => setPrompt(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm" />
        <Button
          size="sm"
          disabled={pending || props.locked || label.trim().length < 2 || prompt.trim().length < 3}
          onClick={() =>
            run(async () => {
              await makePose(props.projectId, { label, prompt });
              setLabel("");
              setPrompt("");
            })
          }
        >
          {pending ? <LoadingDots /> : <Plus data-icon="inline-start" />}
          Make pose
        </Button>
      </div>
      {props.poses.length > 0 && (
        <ul className="flex flex-col gap-2">
          {props.poses.map((p) => {
            const job = props.jobs[`pose:${p.id}`];
            const running = job?.status === "running";
            const ready = ORDER.every((v) => p.cutouts[v]);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 shrink-0 font-medium">{p.label}</span>
                <span className="flex gap-1">
                  {ORDER.map((v) => (p.views[v] ? <FadeImage key={v} src={file(p.views[v]!)} alt={`${p.label}, ${v}`} className="h-14 w-11 rounded border object-cover" /> : <span key={v} className={cn("h-14 w-11 rounded border bg-card/40", running && "nifl-loading")} />))}
                </span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {running ? (
                    <span className="inline-flex items-center gap-1.5">
                      <LoadingDots />
                      {job.detail}
                    </span>
                  ) : job?.status === "error" ? (
                    <span className="text-destructive">Failed: {job.error}</span>
                  ) : ready ? (
                    "Ready for Shots"
                  ) : (
                    "Stopped before it was finished"
                  )}
                </span>
                {running ? (
                  <Button variant="ghost" size="icon" aria-label={`Stop painting ${p.label}`} onClick={() => run(() => cancelPose(props.projectId, p.id))}>
                    <Square />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" aria-label={`Paint ${p.label} again`} disabled={props.locked} onClick={() => run(() => remakePose(props.projectId, p.id))}>
                    <RefreshCw />
                  </Button>
                )}
                <Button variant="ghost" size="icon" aria-label={`Remove ${p.label}`} disabled={running} onClick={() => run(() => deletePose(props.projectId, p.id))}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
