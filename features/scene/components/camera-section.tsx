"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Clapperboard, Eye, Map as MapIcon, Play, Square, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/section";
import { LoadingDots } from "@/components/loading-dots";
import { JobStatus } from "@/features/wizard/components/job-status";
import { FPS, MOVES, frameCount, type CameraMove } from "@/lib/camera";
import type { CameraRender, Job } from "@/lib/store";
import { renderCamera, saveCamera } from "../actions/camera";
import { chip } from "./chip";

// Step 3 of the scene: the camera move, aimed at the character. Pick a move, tune how far and how
// long; the path shows in the stage above (Overview), Play flies it, and frames that leave the
// space the stage holds are counted. Saved a moment after the last change. Render makes the depth
// video the shot follows, and a colour preview of what the stage gives along the path.
export function CameraSection(props: {
  projectId: string;
  move: CameraMove;
  onMove: (m: CameraMove) => void;
  outside: number; // frames outside the stage's space
  overview: boolean;
  onOverview: (on: boolean) => void;
  playing: boolean;
  onPlay: (on: boolean) => void;
  ready: boolean; // a character stands on the stage
  render: CameraRender | null;
  renderKey: string | null; // today's move, placement and stage, to tell an old render
  job?: Job; // the stage job, which renders run under
}) {
  const m = props.move;
  const spec = MOVES.find((x) => x.id === m.move)!;
  const frames = frameCount(m.seconds);
  const [error, setError] = useState<string | null>(null);
  const [starting, start] = useTransition();
  const rendering = props.job?.status === "running" && props.job.detail === "Rendering the camera move";
  const busy = props.job?.status === "running";
  const current = !!props.render && props.render.key === props.renderKey;
  const worst = props.render ? Math.max(...props.render.holes) : 0;
  const set = (patch: Partial<CameraMove>) => props.onMove({ ...m, ...patch });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => start(() => saveCamera(props.projectId, m).then(() => setError(null), (e: Error) => setError(e.message))), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.move, m.amount, m.seconds, m.ease]);

  return (
    <Section
      n="3"
      tone="bg-tone-pink"
      title="Camera"
      line={props.ready ? "A move aimed at the character. Overview shows the path in the stage; Play flies it from the painting's view." : "Stand the character on the stage first: every move is aimed at them."}
      summary={`${spec.label}${m.move === "static" ? "" : ` ${m.amount}${spec.unit}`} · ${m.seconds} s${m.ease ? " · eased" : ""}`}
      open={props.ready}
      actions={
        props.ready && (
          <>
            <Button variant="ghost" size="sm" aria-pressed={props.overview} onClick={() => props.onOverview(!props.overview)}>
              {props.overview ? <Eye data-icon="inline-start" /> : <MapIcon data-icon="inline-start" />}
              {props.overview ? "Painting view" : "Overview"}
            </Button>
            <Button size="sm" onClick={() => props.onPlay(!props.playing)}>
              {props.playing ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              {props.playing ? "Stop" : "Play"}
            </Button>
          </>
        )
      }
      className="nifl-enter"
      style={{ "--i": 3 } as React.CSSProperties}
    >
      {props.ready && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:max-w-xl">
          <span className="text-xs text-muted-foreground">Move</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {MOVES.map((x) => (
              <button key={x.id} type="button" aria-pressed={m.move === x.id} className={chip(m.move === x.id)} onClick={() => set({ move: x.id, amount: x.value })}>
                {x.label}
              </button>
            ))}
          </div>
          <span />
          <p className="-mt-1 text-xs text-muted-foreground">{spec.line}</p>

          {spec.max !== spec.min && (
            <>
              <label htmlFor="cam-amount" className="text-xs text-muted-foreground">
                {spec.unit === "°" ? "Angle" : "Distance"}
              </label>
              <div className="flex items-center gap-3">
                <input id="cam-amount" type="range" min={spec.min} max={spec.max} step={spec.step} value={m.amount} onChange={(e) => set({ amount: Number(e.target.value) })} className="w-full accent-primary" />
                <span className="w-14 text-right font-mono text-xs text-muted-foreground">
                  {m.amount}
                  {spec.unit === "°" ? "°" : ` ${spec.unit}`}
                </span>
              </div>
            </>
          )}

          <label htmlFor="cam-seconds" className="text-xs text-muted-foreground">
            Length
          </label>
          <div className="flex items-center gap-3">
            <input id="cam-seconds" type="range" min={2} max={10} step={0.5} value={m.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} className="w-full accent-primary" />
            <span className="w-14 text-right font-mono text-xs text-muted-foreground">{m.seconds} s</span>
          </div>

          <span className="text-xs text-muted-foreground">Ease</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" aria-pressed={m.ease} className={chip(m.ease)} onClick={() => set({ ease: !m.ease })}>
              Ease in and out
            </button>
            <span className="ml-2 font-mono text-[11px] text-muted-foreground">
              {frames} frames at {FPS} fps
            </span>
          </div>
        </div>
      )}

      {props.ready && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-muted-foreground">
              {current ? `Rendered: ${frames} frames, holes up to ${(worst * 100).toFixed(1)}% of a frame` : props.render ? "The move or the stage changed since the last render" : "~15 s · a depth video for the shot, and a preview"}
            </span>
            <Button
              size="sm"
              variant={current ? "ghost" : "default"}
              className="ml-auto"
              disabled={busy || starting}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await saveCamera(props.projectId, m);
                    await renderCamera(props.projectId);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })
              }
            >
              {starting && !busy ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
              {current ? "Render again" : "Render"}
            </Button>
          </div>
          {rendering && props.job && <JobStatus message="Rendering the camera move" startedAt={props.job.startedAt} expected={15} />}
          {props.render && !rendering && (
            <div className={`grid gap-3 sm:grid-cols-2 ${current ? "" : "opacity-50"}`}>
              {(["preview", "depth"] as const).map((k) => (
                <figure key={k} className="flex flex-col gap-1">
                  <video key={props.render![k]} src={`/api/files/${props.projectId}/${props.render![k]}`} autoPlay loop muted playsInline className="aspect-[832/480] w-full rounded-md border bg-black" />
                  <figcaption className="text-xs text-muted-foreground">{k === "preview" ? "What the stage gives along the path (holes black)" : "Depth the shot follows (near is white)"}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}

      {props.ready && props.outside > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-tone-yellow" />
          {props.outside} of {frames} frames leave the space the stage holds (red in Overview): those will show holes or stretched shapes. A smaller move stays clean.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Section>
  );
}
