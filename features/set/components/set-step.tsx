"use client";

import { useRef, useState, useTransition } from "react";
import { Box, ImageUp, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { SectionTitle } from "@/components/section-title";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, SetData } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancelSet, finishSet, paintSet, pickSet, rebuildStage, uploadSet } from "../actions/set";
import { StageViewer } from "./stage-viewer";

const EXAMPLES = ["a misty ruined stone courtyard at dusk, broken columns, an arched gateway", "a neon-lit rainy alley in a cyberpunk city at night", "a sunlit forest clearing with giant roots and drifting pollen"];

// Step 03: a concept painting (painted from a prompt, or your own) becomes a 3D stage.
// Left: describe or upload, earlier paintings. Right: the stage itself, to look around in.
export function SetStep(props: { projectId: string; set: SetData | null; style: string; job?: Job }) {
  const s = props.set;
  const [prompt, setPrompt] = useState(s?.prompt ?? "");
  const [style, setStyle] = useState(s?.style || props.style);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const upload = useRef<HTMLInputElement>(null);
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const running = props.job?.status === "running";
  const busy = pending || running;
  const fresh = !!s?.stage && s.stage.image === s.image;
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    start(() => fn().then(() => {}, (e: Error) => setError(e.message)));
  };
  const chip = (on: boolean) =>
    cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground");
  const painting = running && props.job?.detail === "Painting the set";

  return (
    <>
      <JobPoller running={running} />
      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <section className="flex flex-col gap-5">
          <SectionTitle n="1" tone="bg-tone-yellow" title="The place" line="Paint one from a prompt, or upload." />
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => paintSet(props.projectId, prompt, style));
            }}
          >
            <label htmlFor="set-prompt" className="sr-only">
              Describe the place
            </label>
            <Textarea id="set-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder={EXAMPLES[0]} disabled={busy} />
            {!prompt && (
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" className={chip(false)} onClick={() => setPrompt(x)}>
                    {x.split(",")[0]}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Style">
              {STYLES.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={style === x.id} className={chip(style === x.id)} onClick={() => setStyle(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busy || prompt.trim().length < 3}>
                <Sparkles data-icon="inline-start" />
                Paint the set
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => upload.current?.click()}>
                <ImageUp data-icon="inline-start" />
                Upload
              </Button>
              <input
                ref={upload}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const form = new FormData();
                  form.set("image", f);
                  run(() => uploadSet(props.projectId, form));
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Wide, eye-level paintings with open floor in front make the best stages.</p>
          </form>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!!s?.paintings.length && (
            <div className="flex flex-col gap-2">
              <SectionTitle n="" tone="bg-tone-yellow" title="Paintings" line="Pick one to build its stage." />
              <div className="grid grid-cols-2 gap-2">
                {[...s.paintings].reverse().map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => pickSet(props.projectId, p))}
                    className={cn("overflow-hidden rounded-md border transition-colors hover:border-ring/60", s.image === p && "border-primary ring-2 ring-primary/30")}
                    aria-label={s.image === p ? "Chosen painting" : "Use this painting"}
                  >
                    <FadeImage src={file(p)} alt="" className="aspect-[7/4] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <SectionTitle n="2" tone="bg-tone-cyan" title="The stage" line={fresh ? "Drag to look around, scroll to move in. Fog covers what the painting does not show." : "MoGe reads the painting as depth and builds a 3D stage."} />
            {s?.image && !running && (
              <Button variant="ghost" size="sm" onClick={() => run(() => rebuildStage(props.projectId))}>
                <RefreshCw data-icon="inline-start" />
                Rebuild
              </Button>
            )}
          </div>
          {running && props.job && (
            <JobStatus message={props.job.detail ?? "Working"} startedAt={props.job.startedAt} expected={painting ? 30 : 10} onCancel={() => cancelSet(props.projectId)} />
          )}
          <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
            {fresh ? (
              <StageViewer key={s!.stage!.mesh} mesh={file(s!.stage!.mesh)} className="absolute inset-0" />
            ) : s?.image ? (
              <FadeImage src={file(s.image)} alt="The chosen painting" className={cn("absolute inset-0 size-full object-cover", running && "opacity-60 motion-safe:animate-pulse")} />
            ) : (
              <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/30 text-sm text-muted-foreground", running && "motion-safe:animate-pulse")}>
                <Box className="size-6" />
                {running ? "Painting..." : "Your stage appears here."}
              </div>
            )}
          </div>
          {fresh && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Depth</span>
              <FadeImage src={file(s!.stage!.depth)} alt="Depth map of the set" className="h-14 rounded border" />
            </div>
          )}
          {props.job?.status === "error" && <p className="text-sm text-destructive">The set failed: {props.job.error}</p>}
          {props.job?.status === "cancelled" && <p className="text-sm text-muted-foreground">Cancelled.</p>}
        </section>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/turnaround`, label: "Turnaround" }}
        summary={fresh ? "A 3D stage from your painting." : running ? (props.job?.detail ?? "Working...") : "Paint or upload a set to continue."}
        next={{ label: "Stage", onNext: () => finishSet(props.projectId), disabled: true, hint: fresh ? "Stage step comes next" : undefined }}
      />
    </>
  );
}
