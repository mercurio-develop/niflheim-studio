"use client";

import { useMemo, useState, useTransition } from "react";
import { Box, ImageUp, PaintBucket, PersonStanding, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { SectionTitle } from "@/components/section-title";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import { NextBar } from "@/features/wizard/components/next-bar";
import type { Job, SetData } from "@/lib/store";
import { STYLES } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { cancelSet, finishSet, paintSet, pickSet, rebuildStage, refillStage, uploadSet } from "../actions/set";
import { composeSetPrompt } from "../prompt";
import { StageViewer, StandIn, type StageLook, type StagePoint } from "./stage-viewer";

// Each example names the ground, then near, middle and far: what makes a good stage.
const EXAMPLES = [
  { label: "ruined courtyard", text: "a misty ruined stone courtyard at dusk: cracked flagstones with moss in front, broken columns and arches along the sides, an arched gateway far away in the fog" },
  { label: "rainy alley", text: "a narrow rainy alley at night: wet cobbles and puddles in front, shuttered shops and pipes along the walls, a glowing street far down the alley" },
  { label: "dark forest path", text: "a dark forest at night: a dirt path with roots and ferns in front, huge pine trunks on both sides, the path fading into mist far away" },
];

// Step 03, laid out like the steps before it: describe the place on top (or upload your own
// painting), then pick one of 2 or 4 paintings, then the 3D stage MoGe builds from it. The
// prompt is composed into a stage plate (features/set/prompt.ts); what will be sent is shown.
export function SetStep(props: { projectId: string; set: SetData | null; style: string; job?: Job }) {
  const s = props.set;
  const [prompt, setPrompt] = useState(s?.prompt ?? "");
  const [style, setStyle] = useState(s?.style || props.style);
  const [count, setCount] = useState<2 | 4>(s?.count === 2 ? 2 : 4);
  const [sameSeed, setSameSeed] = useState(false);
  const composed = useMemo(() => composeSetPrompt(prompt, style), [prompt, style]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [look, setLook] = useState<StageLook>("painting");
  const [standAt, setStandAt] = useState<StagePoint | null>(null);
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
  const painting = running && !!props.job?.detail?.startsWith("Painting");
  const options = s?.options ?? [];
  const earlier = (s?.paintings ?? []).filter((p) => !options.includes(p));
  const filling = running && !!props.job?.detail?.startsWith("Filling");
  const filled = fresh ? s!.stage!.fill : undefined;
  // Only a levelled stage (with a floor) takes the stand-in; older fills are shown as they were.
  const floor = !!filled?.camera?.floor;

  return (
    <>
      <JobPoller running={running} />
      <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Set</span>
          <h1 className="text-2xl font-semibold tracking-tight">Build the place</h1>
        </div>

        <section className="nifl-enter flex flex-col gap-5" style={{ "--i": 1 } as React.CSSProperties}>
          <SectionTitle n="1" tone="bg-tone-yellow" title="Describe" line="Where does the shot happen? Paint it from a prompt, or upload your own painting." />
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (prompt.trim().length >= 3) run(() => paintSet(props.projectId, prompt, style, { count, sameSeed }));
            }}
          >
            <label htmlFor="set-prompt" className="sr-only">
              Describe the place
            </label>
            <Textarea
              id="set-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="The place, near to far: what is on the ground in front, what stands along the sides, what fades away in the distance. Light and weather too."
              className="resize-none text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
            />
            {!prompt && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {EXAMPLES.map((x) => (
                  <button key={x.label} type="button" className={chip(false)} onClick={() => setPrompt(x.text)}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}

            {/* Options: one label column, one control column, as in the character's Describe. */}
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 pt-1">
              <span className="text-xs text-muted-foreground">Your own</span>
              <div className="flex min-h-8 flex-wrap items-center gap-2">
                <label className={cn("inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground", busy && "pointer-events-none opacity-50")}>
                  <ImageUp className="size-3.5" />
                  Upload a painting
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
                      run(() => uploadSet(props.projectId, form));
                    }}
                  />
                </label>
                <span className="text-xs text-muted-foreground">optional: wide, eye-level, open floor in front</span>
              </div>

              <span className="text-xs text-muted-foreground">Style</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {STYLES.map((x) => (
                  <button key={x.id} type="button" aria-pressed={style === x.id} className={chip(style === x.id)} onClick={() => setStyle(x.id)}>
                    {x.label}
                  </button>
                ))}
              </div>

              <span className="text-xs text-muted-foreground">Options</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {([2, 4] as const).map((n) => (
                  <button key={n} type="button" aria-pressed={count === n} className={chip(count === n)} onClick={() => setCount(n)}>
                    {n}
                  </button>
                ))}
                {s?.seed !== undefined && (
                  <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={sameSeed} onChange={(e) => setSameSeed(e.target.checked)} className="accent-primary" />
                    same seed (see what your words change)
                  </label>
                )}
              </div>
            </div>

            {prompt.trim().length >= 3 && (
              <div className="flex flex-col gap-1.5">
                {composed.warnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlert className="mt-px size-3.5 shrink-0 text-tone-yellow" />
                    {w}
                  </p>
                ))}
                <details className="group text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">What will be sent</summary>
                  <p className="mt-1.5 rounded-md border bg-card/40 p-2 font-mono text-[11px] leading-relaxed">{composed.text}</p>
                </details>
              </div>
            )}

            <div className="flex items-center gap-3 border-t pt-3">
              <span className="font-mono text-[11px] text-muted-foreground">~{10 + count * 5} s for {count} options · pick one to build its stage · earlier paintings are kept</span>
              <Button type="submit" size="lg" className="ml-auto" disabled={busy || prompt.trim().length < 3}>
                {pending && !running ? <LoadingDots /> : null}
                Paint the set
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>

          {(!!options.length || painting) && (
            <div className="flex flex-col gap-3">
              <SectionTitle n="" tone="bg-tone-yellow" title="Pick one" line="Empty, a floor in front, near-middle-far depth: the one that reads most like a stage. Its 3D stage is built when you pick it." />
              <div className={cn("grid gap-3", (painting ? count : options.length) === 2 ? "sm:grid-cols-2" : "grid-cols-2")}>
                {(painting ? Array.from({ length: count }, () => "") : options).map((p, i) =>
                  p ? (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => pickSet(props.projectId, p))}
                      className={cn("group relative overflow-hidden rounded-lg border bg-card transition-colors hover:border-ring/60", s?.image === p && "border-primary")}
                      aria-label={s?.image === p ? "Chosen painting" : `Use option ${i + 1}`}
                    >
                      <FadeImage src={file(p)} alt={`Set option ${i + 1}`} className="aspect-[7/4] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                      <span className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                        <span className="rounded border bg-background/80 px-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur">{s?.image === p ? "chosen" : `0${i + 1}`}</span>
                        <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Build this stage</span>
                      </span>
                    </button>
                  ) : (
                    <div key={i} className="aspect-[7/4] rounded-lg border border-primary/20 bg-card/30 motion-safe:animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
                  ),
                )}
              </div>
            </div>
          )}

          {!!earlier.length && (
            <div className="flex flex-col gap-3">
              <SectionTitle n="" tone="bg-tone-yellow" title="Earlier paintings" line="Pick one to build its stage instead." />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[...earlier].reverse().map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => pickSet(props.projectId, p))}
                    className={cn("group relative overflow-hidden rounded-md border bg-card transition-colors hover:border-ring/60", s?.image === p && "border-primary")}
                    aria-label={s?.image === p ? "Chosen painting" : "Use this painting"}
                  >
                    <FadeImage src={file(p)} alt="" className="aspect-[7/4] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="nifl-enter flex min-w-0 flex-col gap-3" style={{ "--i": 2 } as React.CSSProperties}>
          <div className="flex items-start justify-between gap-3">
            <SectionTitle n="2" tone="bg-tone-cyan" title="The stage" line={floor ? "Drag to look around, scroll to move in, click the floor to stand a 1.7 m figure there. Guide shows the shapes and a 1 m grid." : filled ? "Drag to look around, scroll to move in. What the painting does not show was painted in from nearby cameras." : fresh ? "Drag to look around, scroll to move in. Fog covers what the painting does not show." : "MoGe reads the painting as depth and builds a 3D stage."} />
            {s?.image && !running && (
              <div className="flex gap-1">
                {fresh && (
                  <Button variant="ghost" size="sm" onClick={() => run(() => refillStage(props.projectId))}>
                    <PaintBucket data-icon="inline-start" />
                    {filled ? "Fill again" : "Fill the holes"}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => run(() => rebuildStage(props.projectId))}>
                  <RefreshCw data-icon="inline-start" />
                  Rebuild
                </Button>
              </div>
            )}
          </div>
          {running && props.job && (
            <JobStatus message={props.job.detail ?? "Working"} startedAt={props.job.startedAt} expected={painting ? 30 : filling ? 260 : 10} onCancel={() => cancelSet(props.projectId)} />
          )}
          <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
            {fresh ? (
              <StageViewer
                key={filled?.mesh ?? s!.stage!.mesh}
                mesh={file(filled?.mesh ?? s!.stage!.mesh)}
                camera={filled?.camera}
                filled={!!filled}
                look={look}
                onFloor={floor ? setStandAt : undefined}
                className="absolute inset-0"
              >
                {floor && standAt && <StandIn at={standAt} />}
              </StageViewer>
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
            <div className="flex flex-wrap items-center gap-3">
              {filled && (
                <div className="flex items-center gap-1.5" role="group" aria-label="How the stage is shown">
                  {(["painting", "guide"] as const).map((x) => (
                    <button key={x} type="button" aria-pressed={look === x} className={chip(look === x)} onClick={() => setLook(x)}>
                      {x === "painting" ? "Painting" : "Guide"}
                    </button>
                  ))}
                  {floor && (
                    <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <PersonStanding className="size-3.5" />
                      {standAt ? `${Math.hypot(standAt[0], standAt[2]).toFixed(1)} m from the camera` : "click the floor"}
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-muted-foreground">Depth</span>
              <FadeImage src={file(s!.stage!.depth)} alt="Depth map of the set" className="h-14 rounded border" />
              {!!filled?.views.length && (
                <>
                  <span className="ml-2 text-xs text-muted-foreground">Painted views</span>
                  <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                    {filled.views.map((v) => (
                      <FadeImage key={v} src={file(v)} alt="A view painted to fill the stage" className="h-14 shrink-0 rounded border" />
                    ))}
                  </div>
                </>
              )}
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
