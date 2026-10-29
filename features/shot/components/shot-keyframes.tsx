"use client";

import { useMemo } from "react";
import { DEFAULT_MOVE, keyFrames, propsKey, poses, renderKey, type CameraMove } from "@/lib/camera";
import type { Block, Job, Keyframes, SceneAsset, SetData, StageData } from "@/lib/store";
import { KeyframesPanel } from "./keyframes";

// The active shot's keyframes, made here from the Scene's stage, placement and camera move (moved
// from Scene, decision 0010): the stage is captured off screen at each key pose and painted.
export function ShotKeyframes(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; keyframes: Keyframes | null; blocks: Block[]; assets: SceneAsset[]; job?: Job }) {
  const s = props.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const cam = fill?.camera;
  const at = props.placement?.at;
  const move = props.camera ?? DEFAULT_MOVE;
  const path = useMemo(
    () => (cam?.floor && at && props.placement ? poses(cam, { at, height: props.placement.height, turn: props.placement.turn }, move) : null),
    [cam, at, props.placement, move],
  );
  if (!fill || !cam || !at || !path || !props.placement) {
    return <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">Build the scene first: a stage, the character standing in it and a camera move.</p>;
  }
  const key = renderKey(move, at, props.placement.height, fill.mesh, props.placement.turn) + propsKey(props.blocks, props.assets);
  return (
    <KeyframesPanel
      projectId={props.projectId}
      keyframes={props.keyframes}
      current={!!props.keyframes && props.keyframes.key === key}
      frames={keyFrames(move)}
      job={props.job}
      move={move}
      capture={{
        mesh: `/api/files/${props.projectId}/${fill.mesh}`,
        camera: cam,
        cutouts: Object.fromEntries(Object.entries(props.placement.cutouts).map(([v, f]) => [v, `/api/files/${props.projectId}/${f}`])),
        at,
        height: props.placement.height,
        turn: props.placement.turn,
        blocks: props.blocks,
        assets: props.assets,
        poses: keyFrames(move).map((f) => path[f]),
      }}
    />
  );
}
