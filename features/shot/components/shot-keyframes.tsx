"use client";

import { useMemo, useState, useTransition } from "react";
import { Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { LoadingDots } from "@/components/loading-dots";
import { DEFAULT_MOVE, cardAt, frameCount, keyFrames, placeAt, propsKey, poses, renderKey, type CameraMove } from "@/lib/camera";
import type { Block, CharacterPose, Job, Keyframes, LayoutClip, SceneAsset, SeededFrom, SetData, StageData } from "@/lib/store";
import { continueFromPrevious, stopContinuing } from "../actions/continuity";
import { ClayClip } from "./clay-clip";
import { KeyframesPanel } from "./keyframes";

// The active shot's keyframes, made here from the Scene's stage, placement and camera move (moved
// from Scene, decision 0010): the stage is captured off screen at each key pose and painted.
export function ShotKeyframes(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; keyframes: Keyframes | null; blocks: Block[]; assets: SceneAsset[]; poses: CharacterPose[]; job?: Job; continuity: { from: string; hasTake: boolean; seeded: SeededFrom | null } | null; layout: LayoutClip | null; layoutJob?: Job }) {
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
  const key = renderKey(move, at, props.placement.height, fill.mesh, props.placement.turn) + propsKey(props.blocks, props.assets);
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
    at,
    height: props.placement.height,
    turn: props.placement.turn,
    blocks: props.blocks,
    assets: props.assets,
  };
  return (
    <div className="flex flex-col gap-3">
      {props.continuity && <Continue projectId={props.projectId} {...props.continuity} busy={props.job?.status === "running"} />}
      <KeyframesPanel
        projectId={props.projectId}
        keyframes={props.keyframes}
        current={!!props.keyframes && props.keyframes.key === key}
        frames={keyFrames(move)}
        job={props.job}
        move={move}
        // Each key wears the pose the move (or its moments) gives at its frame.
        capture={{ ...base, poses: keyFrames(move).map(poseAt) }}
      />
      <ClayClip projectId={props.projectId} layout={props.layout} job={props.layoutJob} current={props.layout?.key === key} capture={{ ...base, poses: Array.from({ length: frameCount(move.seconds) }, (_, f) => poseAt(Math.min(f, path.length - 1))) }} />
    </div>
  );
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
            Continue from {props.from}
          </Button>
        </>
      )}
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
