"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { KeyCapture } from "@/features/scene/components/key-capture";
import { saveCamera } from "@/features/scene/actions/camera";
import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { DEFAULT_MOVE, cardAt, frameCount, keyFrames, placeAt, poses, type CameraMove } from "@/lib/camera";
import { sceneKeyFrom } from "@/lib/progress";
import type { Block, CharacterPose, Job, Keyframes, LayoutClip, SceneAsset, SeededFrom, SetData, StageData } from "@/lib/store";
import { continueFromPrevious, stopContinuing } from "../actions/continuity";
import { ClayClip } from "./clay-clip";
import { KeyframesPanel } from "./keyframes";

// The active shot's keyframes, made here from the Scene's stage, placement and camera move (moved
// from Scene, decision 0010): the stage is captured off screen at each key pose and painted.
export function ShotKeyframes(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; keyframes: Keyframes | null; blocks: Block[]; assets: SceneAsset[]; poses: CharacterPose[]; job?: Job; continuity: { from: string; hasTake: boolean; seeded: SeededFrom | null } | null; layout: LayoutClip | null; layoutJob?: Job; beatsChanged?: boolean; noMain?: boolean; canCut?: boolean }) {
  const s = props.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const cam = fill?.camera;
  const at = props.placement?.at;
  const move = props.camera ?? DEFAULT_MOVE;
  const path = useMemo(
    () => (cam?.floor && at && props.placement ? poses(cam, { at, height: props.placement.height, turn: props.placement.turn }, move, props.assets) : null),
    [cam, at, props.placement, move, props.assets],
  );
  if (!fill || !cam || !at || !path || !props.placement) {
    return <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Build the scene first: a stage, the character standing in it and a camera move.</p>;
  }
  const urls = (c: Partial<Record<string, string>>) => Object.fromEntries(Object.entries(c).map(([v, f]) => [v, `/api/files/${props.projectId}/${f}`]));
  const cards = props.poses.map((p) => ({ id: p.id, cutouts: urls(p.cutouts) }));
  const key = sceneKeyFrom(move, at, props.placement.height, fill.mesh, props.placement.turn, props.blocks, props.assets, props.placement.source, !props.noMain);
  // The stage at frame f of the move: the camera, the character's pose and turn, every object's spot
  // (with key moments, the moment's).
  const poseAt = (f: number) => ({
    ...path[f],
    card: cardAt(move, f, urls(props.placement!.cutouts), cards),
    turn: placeAt(move, "main", { at, turn: props.placement!.turn }, f).turn,
    assets: props.assets.map((a) => (a.at ? { ...a, ...(({ at, turn }) => ({ at, turn }))(placeAt(move, a.id, { at: a.at, turn: a.turn }, f)) } : a)),
  });
  const base = {
    mesh: `/api/files/${props.projectId}/${fill.mesh}`,
    camera: cam,
    cutouts: urls(props.placement.cutouts),
    noMain: props.noMain,
    at,
    height: props.placement.height,
    turn: props.placement.turn,
    blocks: props.blocks,
    assets: props.assets,
  };
  return (
    <div className="flex flex-col gap-3">
      <ShootCapturer projectId={props.projectId} move={move} base={base} keys={keyFrames(move).map(poseAt)} clay={Array.from({ length: frameCount(move.seconds) }, (_, f) => poseAt(Math.min(f, path.length - 1)))} keysCurrent={!!props.keyframes && props.keyframes.key === key && props.keyframes.keys.every(Boolean) && (props.keyframes.full ?? props.keyframes.frames.at(-1)) === frameCount(move.seconds) - 1} clayCurrent={props.layout?.key === key && props.layout.frames === frameCount(move.seconds)} />
      {props.continuity && <Continue projectId={props.projectId} {...props.continuity} busy={props.job?.status === "running"} />}
      <KeyframesPanel
        projectId={props.projectId}
        keyframes={props.keyframes}
        current={!!props.keyframes && props.keyframes.key === key && !props.beatsChanged}
        beatsChanged={props.beatsChanged}
        canCut={props.canCut}
        frames={keyFrames(move)}
        job={props.job}
      />
      <ClayClip projectId={props.projectId} layout={props.layout} job={props.layoutJob} current={props.layout?.key === key} />
    </div>
  );
}

// What One Shoot (shot-step.tsx) asks of the stage: which captures are stale, and the captures
// themselves, drawn off screen here where the stage's props are. Registered while this panel is mounted.
export type Capturer = { keysCurrent: boolean; clayCurrent: boolean; capture: (what: "keys" | "clay") => Promise<Blob[]> };
let capturer: Capturer | null = null;
export const shootCapturer = () => capturer;

function ShootCapturer(props: { projectId: string; move: CameraMove; base: Omit<React.ComponentProps<typeof KeyCapture>, "projectId" | "poses" | "onDone" | "onError" | "clay" | "onFrame">; keys: React.ComponentProps<typeof KeyCapture>["poses"]; clay: React.ComponentProps<typeof KeyCapture>["poses"]; keysCurrent: boolean; clayCurrent: boolean }) {
  const [job, setJob] = useState<{ what: "keys" | "clay"; resolve: (b: Blob[]) => void; reject: (e: Error) => void } | null>(null);
  const { projectId, move } = props;
  useEffect(() => {
    capturer = {
      keysCurrent: props.keysCurrent,
      clayCurrent: props.clayCurrent,
      capture: async (what) => {
        // Saved first, so the server keys the same frames as the browser draws.
        if (what === "keys") await saveCamera(projectId, move);
        return new Promise((resolve, reject) => setJob({ what, resolve, reject }));
      },
    };
    return () => void (capturer = null);
  }, [props.keysCurrent, props.clayCurrent, projectId, move]);
  if (!job) return null;
  const end = () => setJob(null);
  return <KeyCapture {...props.base} projectId={props.projectId} poses={job.what === "clay" ? props.clay : props.keys} clay={job.what === "clay"} onDone={(b) => (end(), job.resolve(b))} onError={(m) => (end(), job.reject(new Error(m)))} />;
}

// Continue from the shot before: its picked take's last frame becomes key 1 as it is, and the
// first moment puts everyone where that shot left them. Make the keyframes after it.
function Continue(props: { projectId: string; from: string; hasTake: boolean; seeded: SeededFrom | null; busy: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  const s = props.seeded;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
      {s ? (
        <>
          <FadeImage src={`/api/files/${props.projectId}/${s.frame}`} alt={`Last frame of ${props.from}`} className="aspect-[768/448] w-24 rounded-sm border object-cover" />
          <p className="min-w-0 flex-1 text-sm">
            Continues {props.from}, take {s.take + 1}: key 1 is its last frame. <span className="text-muted-foreground">Make the keyframes to use it.</span>
          </p>
          <Button size="sm" variant="ghost" disabled={pending || props.busy} onClick={() => act(() => stopContinuing(props.projectId))}>
            <Link2Off data-icon="inline-start" />
            Start fresh
          </Button>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{props.hasTake ? `Start this shot where ${props.from} ends: its last frame, everyone where they stood.` : `${props.from} has no take yet: shoot one to continue from it.`}</p>
          <Button size="sm" variant="outline" disabled={!props.hasTake || pending || props.busy} onClick={() => act(() => continueFromPrevious(props.projectId))}>
            {pending ? <LoadingDots /> : <Link2 data-icon="inline-start" />}
            Start where {props.from} ends
          </Button>
        </>
      )}
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
