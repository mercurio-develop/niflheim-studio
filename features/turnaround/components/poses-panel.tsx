"use client";

import { useState, useTransition } from "react";
import { Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { FogLoader } from "@/features/wizard/components/fog-loader";
import type { CharacterPose, Job } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelPose, deletePose, makePose, remakePose, remakePoseView } from "../actions/poses";

// Poses a shot can put the character in: each says, in plain words, what Qwen should make of the
// turnaround's front. Running is a three-quarter stride so the whole figure stays in frame (a
// head-on sprint cropped the left of the picture, 2026-10-30).
const PRESETS = [
  { label: "Running", prompt: "run in a three-quarter view to the right, mid-stride, one leg forward, arms pumping, the whole body from head to feet in frame" },
  { label: "Walking", prompt: "walk forward calmly, mid-step, arms swinging naturally, the whole body from head to feet in frame" },
  { label: "Angry", prompt: "stand angry, fists clenched, leaning forward, teeth bared, a furious face, the whole body from head to feet in frame" },
  { label: "Happy", prompt: "stand happy and relaxed, arms open, a big warm smile, the whole body from head to feet in frame" },
  { label: "Scared", prompt: "recoil scared, arms raised to protect the face, knees bent, wide eyes, the whole body from head to feet in frame" },
  { label: "Attacking", prompt: "attack in a three-quarter view, lunging forward in a fighting stance, one arm swinging, the whole body from head to feet in frame" },
  { label: "Waving", prompt: "wave hello with one raised hand, smiling, the whole body from head to feet in frame" },
  { label: "Sitting", prompt: "sit on the ground with legs crossed, hands on the knees, the whole body in frame" },
];
const ORDER = ["front", "threequarter", "side", "back"] as const;
const VIEW_LABEL: Record<(typeof ORDER)[number], string> = { front: "Front", threequarter: "Three-quarter", side: "Side", back: "Back" };
const PER_VIEW = 25;

// The character in other poses, made from the turnaround: four views each, cut out for the stage.
// Each view can be painted again on its own. In Shots, a shot picks one (and one to switch to).
export function PosesPanel(props: { projectId: string; poses: CharacterPose[]; jobs: Record<string, Job>; locked: boolean; busy?: boolean; cid?: string }) {
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const taken = new Set(props.poses.map((p) => p.label.toLowerCase()));
  const blocked = pending || props.locked || !!props.busy;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">About 2.5 min a pose. Generate the turnaround first, then pick a preset or name one. Each photo has Again.</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.filter((x) => !taken.has(x.label.toLowerCase())).map((x) => (
          <button
            key={x.label}
            type="button"
            disabled={blocked}
            onClick={() => run(() => makePose(props.projectId, x, props.cid))}
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
          disabled={blocked || label.trim().length < 2 || prompt.trim().length < 3}
          onClick={() =>
            run(async () => {
              await makePose(props.projectId, { label, prompt }, props.cid);
              setLabel("");
              setPrompt("");
            })
          }
        >
          {pending ? <LoadingDots /> : <Plus data-icon="inline-start" />}
          Make pose
        </Button>
      </div>
      {props.poses.map((p) => {
        const job = props.jobs[`pose:${p.id}`];
        const running = job?.status === "running";
        const viewJob = (v: (typeof ORDER)[number]) => props.jobs[`pose:${p.id}:${v}`];
        const ready = ORDER.every((v) => p.cutouts[v]);
        return (
          <article key={p.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{p.label}</h3>
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
                ) : ORDER.some((v) => p.views[v]) ? (
                  "A view is missing: Again on the empty one"
                ) : (
                  "Not painted yet"
                )}
              </span>
              {running ? (
                <Button variant="ghost" size="icon" aria-label={`Stop painting ${p.label}`} onClick={() => run(() => cancelPose(props.projectId, p.id, props.cid))}>
                  <Square />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" aria-label={`Paint every view of ${p.label} again`} disabled={blocked} onClick={() => run(() => remakePose(props.projectId, p.id, props.cid))}>
                  <RefreshCw />
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label={`Remove ${p.label}`} disabled={running || ORDER.some((v) => viewJob(v)?.status === "running")} onClick={() => run(() => deletePose(props.projectId, p.id, props.cid))}>
                <Trash2 />
              </Button>
            </div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ORDER.map((v) => {
                const img = p.views[v];
                const j = viewJob(v);
                const busy = j?.status === "running";
                const painting = running || busy;
                return (
                  <li key={v} className="flex flex-col gap-1">
                    <div className={cn("relative overflow-hidden rounded-xl border bg-card", !img && "bg-card/40")}>
                      {img ? (
                        <FadeImage key={img} src={file(img)} alt={`${p.label}, ${VIEW_LABEL[v]}`} className="aspect-[7/9] w-full object-cover" />
                      ) : (
                        <div className={cn("flex aspect-[7/9] w-full items-center justify-center text-xs text-muted-foreground", painting && "nifl-loading")}>{painting ? "" : "Not painted yet"}</div>
                      )}
                      {busy && j && (
                        <FogLoader className="absolute inset-0" compact message={`Painting the ${VIEW_LABEL[v].toLowerCase()}`} startedAt={j.startedAt} expected={PER_VIEW} onCancel={() => cancelPose(props.projectId, p.id, props.cid, v)} />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs">{VIEW_LABEL[v]}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={blocked || painting || (v !== "front" && !p.views.front)}
                        onClick={() => run(() => remakePoseView(props.projectId, p.id, v, props.cid))}
                      >
                        <RefreshCw data-icon="inline-start" />
                        Again
                      </Button>
                    </div>
                    {j?.status === "error" && <p className="text-xs text-destructive">{j.error}</p>}
                  </li>
                );
              })}
            </ol>
          </article>
        );
      })}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
