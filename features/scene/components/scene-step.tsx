"use client";

import { SectionNav } from "@/components/section-nav";
import { useMemo, useRef, useState } from "react";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import { ShotTabs, type ShotTab } from "@/features/shot/components/shot-tabs";
import { DEFAULT_MOVE, inside, poses, renderKey, type CameraMove, type Vec } from "@/lib/camera";
import type { CameraRender, Job, Keyframes, SetData, StageData } from "@/lib/store";
import { CameraPath } from "./camera-path";
import { CameraSection } from "./camera-section";
import { DescribeSection } from "./describe-section";
import { StageSection } from "./stage-section";

// Step 03: one painting becomes a 3D stage, and the character stands in it. Describe (or upload)
// the place and pick a painting; its stage is built and filled; the character is cut out of the
// turnaround and placed on the floor; then a camera move aimed at them, shown and played in the
// same viewer.
export function SceneStep(props: {
  projectId: string;
  set: SetData | null;
  style: string; // the character's style, the set's default
  placement: StageData | null;
  front: string | null;
  moved: boolean;
  camera: CameraMove | null; // the saved move
  cameraRender: CameraRender | null;
  keyframes: Keyframes | null;
  keyJob?: Job;
  shots: ShotTab[]; // the scene's shots; the camera below is the active one's
  setJob?: Job;
  stageJob?: Job;
}) {
  const building = props.setJob?.status === "running";
  const cutting = props.stageJob?.status === "running" && props.stageJob.detail !== "Rendering the camera move";
  const stageBusy = props.stageJob?.status === "running";
  const at = props.placement?.at;
  const fresh = !!props.set?.stage && props.set.stage.image === props.set.image;
  const cam = fresh ? props.set!.stage!.fill?.camera : undefined;
  const ready = !!cam?.floor && !!at;
  const [move, setMove] = useState<CameraMove>(props.camera ?? DEFAULT_MOVE);
  const [overview, setOverview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const live = useRef<Vec | null>(null); // where the character stands this frame, when they walk
  const path = useMemo(() => {
    if (!ready) return null;
    const ps = poses(cam!, { at: at!, height: props.placement!.height, turn: props.placement!.turn }, move);
    return { poses: ps, inside: ps.map((p) => inside(cam!, p.position)) };
  }, [ready, cam, at, props.placement, move]);
  const pick = (m: CameraMove) => {
    setPlaying(false);
    setMove(m);
  };
  const view = (on: boolean) => {
    setPlaying(false);
    setOverview(on);
  };
  // Play and Overview happen in the stage viewer: bring it into view.
  const toStage = () => document.getElementById("stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <>
      <JobPoller running={building || stageBusy || props.keyJob?.status === "running"} />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <SectionNav items={[{ id: "describe", n: "1", title: "Describe", tone: "bg-tone-yellow" }, { id: "stage", n: "2", title: "Stage", tone: "bg-tone-cyan" }, { id: "camera", n: "3", title: "Camera", tone: "bg-tone-pink" }]} />
        <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">02 · Scene</span>
          <h1 className="text-2xl font-semibold tracking-tight">Build the place, stand them in it</h1>
        </div>
        <DescribeSection projectId={props.projectId} set={props.set} style={props.style} job={props.setJob} locked={stageBusy} />
        <StageSection
          projectId={props.projectId}
          set={props.set}
          placement={props.placement}
          front={props.front}
          moved={props.moved}
          setJob={props.setJob}
          stageJob={props.stageJob}
          overview={ready && overview}
          onOverview={ready ? view : undefined}
          live={live}
          layer={
            path && (
              <CameraPath
                poses={path.poses}
                inside={path.inside}
                overview={overview}
                playing={playing}
                onDone={() => setPlaying(false)}
                onStart={(from: Vec) => pick({ ...move, framing: "free", from })}
                onEnd={(to: Vec) => pick({ ...move, to })}
                onWalk={(to: Vec) => move.walk && pick({ ...move, walk: { ...move.walk, to } })}
                live={live}
              />
            )
          }
        />
        <CameraSection
          projectId={props.projectId}
          move={move}
          onMove={pick}
          start={path?.poses[0].position ?? null}
          subject={ready ? { at: at!, turn: props.placement!.turn } : null}
          outside={path ? path.inside.filter((x) => !x).length : 0}
          overview={overview}
          onOverview={(on) => {
            view(on);
            if (on) toStage();
          }}
          playing={playing}
          onPlay={(on) => {
            setPlaying(on);
            if (on) toStage();
          }}
          tabs={ready && <ShotTabs projectId={props.projectId} shots={props.shots} locked={stageBusy || props.keyJob?.status === "running"} />}
          ready={ready}
          render={props.cameraRender}
          renderKey={ready ? renderKey(move, at!, props.placement!.height, props.set!.stage!.fill!.mesh, props.placement!.turn) : null}
          job={props.stageJob}
        />
        </div>
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/character`, label: "Character" }}
        summary={building || cutting ? ((building ? props.setJob : props.stageJob)?.detail ?? "Working...") : at && !props.moved ? `Standing in the set, ${props.placement!.height.toFixed(2)} m tall.` : fresh ? "Stand the character on the stage to continue." : "Paint or upload a set to continue."}
        next={{ label: "Shots", href: `/p/${props.projectId}/shot`, disabled: !ready, hint: at && !ready ? "Choose a camera move first" : undefined }}
      />
    </>
  );
}
