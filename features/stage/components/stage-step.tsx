"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PersonStanding, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/section-title";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { JobStatus } from "@/features/wizard/components/job-status";
import { NextBar } from "@/features/wizard/components/next-bar";
import { StageViewer, type StageLook, type StagePoint } from "@/features/set/components/stage-viewer";
import type { Job, StageData, StageFill } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelStage, cutOutCharacter, placeCharacter } from "../actions/stage";
import { CharacterCard } from "./character-card";

// Step 05: stand the character in the set. The levelled stage from step 03 (floor y = 0, metres),
// the character as a card cut from the turnaround: click the floor to put them there, then set
// their height and which way they face. Every change is saved; the shot (07) starts from here.
export function StageStep(props: { projectId: string; fill: StageFill & { camera: NonNullable<StageFill["camera"]> }; stage: StageData | null; front: string; job?: Job }) {
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const running = props.job?.status === "running";
  const stale = !!props.stage && props.stage.source !== props.front;
  const ready = !!props.stage && Object.keys(props.stage.cutouts).length > 0;
  const [at, setAt] = useState<StagePoint | null>(props.stage?.at ?? null);
  const [height, setHeight] = useState(props.stage?.height ?? 1.7);
  const [turn, setTurn] = useState(props.stage?.turn ?? 0);
  const [look, setLook] = useState<StageLook>("painting");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    start(() => fn().then(() => {}, (e: Error) => setError(e.message)));
  };

  // The first visit cuts the character out by itself; a new turnaround front asks again.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || running || props.stage || props.job?.status === "error") return;
    asked.current = true;
    run(() => cutOutCharacter(props.projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved a moment after the last change, so dragging a slider is one save.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!at || !ready) return;
    const t = setTimeout(() => run(() => placeCharacter(props.projectId, { at, height, turn })), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, height, turn]);

  const chip = (on: boolean) =>
    cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground");
  const distance = at ? Math.hypot(at[0] - props.fill.camera.c2w[0][3], at[2] - props.fill.camera.c2w[2][3]) : null;

  return (
    <>
      <JobPoller running={running} />
      <div className="flex min-w-0 flex-col gap-8">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">05 · Stage</span>
          <h1 className="text-2xl font-semibold tracking-tight">Stand the character in the set</h1>
        </div>

        <section className="nifl-enter flex min-w-0 flex-col gap-3" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="flex items-start justify-between gap-3">
            <SectionTitle n="1" tone="bg-tone-cyan" title="Place" line="Click the floor where they stand. Drag to look around: the card turns to you and shows the matching view of the turnaround." />
            {!running && (stale || props.job?.status === "error") && (
              <Button variant="ghost" size="sm" onClick={() => run(() => cutOutCharacter(props.projectId))}>
                <Scissors data-icon="inline-start" />
                {stale ? "Cut out the new turnaround" : "Cut out again"}
              </Button>
            )}
          </div>
          {running && props.job && <JobStatus message={props.job.detail ?? "Cutting out the character"} startedAt={props.job.startedAt} expected={10} onCancel={() => cancelStage(props.projectId)} />}
          <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
            <StageViewer mesh={file(props.fill.mesh)} camera={props.fill.camera} filled look={look} onFloor={ready ? setAt : undefined} className="absolute inset-0">
              {ready && at && <CharacterCard cutouts={Object.fromEntries(Object.entries(props.stage!.cutouts).map(([v, f]) => [v, file(f!)]))} at={at} height={height} turn={turn} />}
            </StageViewer>
            {ready && !at && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-sm backdrop-blur">
                  <PersonStanding className="size-4 text-primary" />
                  Click the floor to stand them there
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 pt-1 sm:max-w-xl">
            <span className="text-xs text-muted-foreground">Show</span>
            <div className="flex items-center gap-1.5">
              {(["painting", "guide"] as const).map((x) => (
                <button key={x} type="button" aria-pressed={look === x} className={chip(look === x)} onClick={() => setLook(x)}>
                  {x === "painting" ? "Painting" : "Guide"}
                </button>
              ))}
              {distance !== null && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{distance.toFixed(1)} m from the camera</span>}
            </div>

            <label htmlFor="stage-height" className="text-xs text-muted-foreground">
              Height
            </label>
            <div className="flex items-center gap-3">
              <input id="stage-height" type="range" min={0.5} max={3} step={0.05} value={height} disabled={!ready} onChange={(e) => setHeight(Number(e.target.value))} className="w-full accent-primary" />
              <span className="w-14 text-right font-mono text-xs text-muted-foreground">{height.toFixed(2)} m</span>
            </div>

            <label htmlFor="stage-turn" className="text-xs text-muted-foreground">
              Facing
            </label>
            <div className="flex items-center gap-3">
              <input id="stage-turn" type="range" min={-180} max={180} step={5} value={turn} disabled={!ready} onChange={(e) => setTurn(Number(e.target.value))} className="w-full accent-primary" />
              <span className="w-14 text-right font-mono text-xs text-muted-foreground">{turn === 0 ? "camera" : `${turn > 0 ? "→" : "←"} ${Math.abs(turn)}°`}</span>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {props.job?.status === "error" && <p className="text-sm text-destructive">The cutout failed: {props.job.error}</p>}
          {pending && !running && <p className="font-mono text-[11px] text-muted-foreground">Saving…</p>}
        </section>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/set`, label: "Set" }}
        summary={at ? `Standing ${distance!.toFixed(1)} m from the camera, ${height.toFixed(2)} m tall.` : running ? (props.job?.detail ?? "Working...") : "Click the floor to place the character."}
        next={{ label: "Shot", disabled: true, hint: at ? "The shot step comes next" : undefined }}
      />
    </>
  );
}
