"use client";

import { useMemo, useState } from "react";
import { JobPoller } from "@/features/wizard/components/job-poller";
import { NextBar } from "@/features/wizard/components/next-bar";
import { KeyframesPanel } from "@/features/shot/components/keyframes";
import { DEFAULT_MOVE, aim, inside, keyFrames, poses, renderKey, type CameraMove } from "@/lib/camera";
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
  // The shot can start once every key is painted from today's move, placement and stage.
  const keysReady = ready && !!props.keyframes?.keys.every(Boolean) && props.keyframes.key === renderKey(move, at!, props.placement!.height, props.set!.stage!.fill!.mesh);
  const [overview, setOverview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const path = useMemo(() => {
    if (!ready) return null;
    const ps = poses(cam!, aim(cam!, at, props.placement!.height), move);
    return { poses: ps, inside: ps.map((p) => inside(cam!, p.position)) };
  }, [ready, cam, at, props.placement, move]);
  return (
    <>
      <JobPoller running={building || stageBusy || props.keyJob?.status === "running"} />
      <div className="flex min-w-0 flex-col gap-10">
        <div className="nifl-enter flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">03 · Scene</span>
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
          layer={path && <CameraPath poses={path.poses} inside={path.inside} overview={overview} playing={playing} onDone={() => setPlaying(false)} />}
        />
        <CameraSection
          projectId={props.projectId}
          move={move}
          onMove={(m) => {
            setPlaying(false);
            setMove(m);
          }}
          outside={path ? path.inside.filter((x) => !x).length : 0}
          overview={overview}
          onOverview={(on) => {
            setPlaying(false);
            setOverview(on);
          }}
          playing={playing}
          onPlay={setPlaying}
          ready={ready}
          render={props.cameraRender}
          renderKey={ready ? renderKey(move, at!, props.placement!.height, props.set!.stage!.fill!.mesh) : null}
          job={props.stageJob}
        />
        {ready && path && (
          <KeyframesPanel
            projectId={props.projectId}
            keyframes={props.keyframes}
            current={!!props.keyframes && props.keyframes.key === renderKey(move, at!, props.placement!.height, props.set!.stage!.fill!.mesh)}
            frames={keyFrames(move)}
            job={props.keyJob}
            move={move}
            capture={{
              mesh: `/api/files/${props.projectId}/${props.set!.stage!.fill!.mesh}`,
              camera: cam!,
              cutouts: Object.fromEntries(Object.entries(props.placement!.cutouts).map(([v, f]) => [v, `/api/files/${props.projectId}/${f}`])),
              at: at!,
              height: props.placement!.height,
              turn: props.placement!.turn,
              poses: keyFrames(move).map((f) => path.poses[f]),
            }}
          />
        )}
      </div>
      <NextBar
        back={{ href: `/p/${props.projectId}/turnaround`, label: "Turnaround" }}
        summary={building || cutting ? ((building ? props.setJob : props.stageJob)?.detail ?? "Working...") : at && !props.moved ? `Standing in the set, ${props.placement!.height.toFixed(2)} m tall.` : fresh ? "Stand the character on the stage to continue." : "Paint or upload a set to continue."}
        next={{ label: "Shot", href: `/p/${props.projectId}/shot`, disabled: !keysReady, hint: at && !keysReady ? "Make the keyframes first" : undefined }}
      />
    </>
  );
}
