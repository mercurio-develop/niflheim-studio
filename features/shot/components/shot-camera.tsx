"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Blocks } from "@/features/scene/components/blocks";
import { CameraPath } from "@/features/scene/components/camera-path";
import { SceneAssets, assetReady } from "@/features/scene/components/scene-assets";
import { CameraSection } from "@/features/scene/components/camera-section";
import { CharacterCard } from "@/features/scene/components/character-card";
import { StageViewer } from "@/features/scene/components/stage-viewer";
import { ViewSwitch } from "@/features/scene/components/view-switch";
import { DEFAULT_MOVE, cardAt, inside, poses, renderKey, tooClose, type CameraMove, type Vec } from "@/lib/camera";
import type { Block, CameraRender, CharacterPose, Job, SceneAsset, SetData, StageData } from "@/lib/store";

// The active shot's camera (decision 0011): the Scene's stage with the character standing where
// the Scene put them, and this shot's framing, move and walk. Overview shows the path with a gizmo
// on each end and on the walk; Play flies it. Each shot keeps its own; saved as it is tuned.
export function ShotCamera(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; cameraRender: CameraRender | null; blocks: Block[]; assets: SceneAsset[]; poses: CharacterPose[]; stageJob?: Job }) {
  const s = props.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const cam = fill?.camera;
  const pl = props.placement;
  const ready = !!cam?.floor && !!pl?.at;
  const [move, setMove] = useState<CameraMove>(props.camera ?? DEFAULT_MOVE);
  const [overview, setOverview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const live = useRef<Vec | null>(null); // where the character stands this frame, when they walk
  const setLive = useCallback((at: Vec | null) => void (live.current = at), []);
  const path = useMemo(() => {
    if (!ready) return null;
    const ps = poses(cam!, { at: pl!.at!, height: pl!.height, turn: pl!.turn }, move, props.assets);
    const who = { at: pl!.at!, height: pl!.height, turn: pl!.turn };
    return { poses: ps, inside: ps.map((p) => inside(cam!, p.position)), close: tooClose(ps, who, move) };
  }, [ready, cam, pl, move, props.assets]);
  const pick = (m: CameraMove) => {
    setPlaying(false);
    setMove(m);
  };
  const view = (on: boolean) => {
    setPlaying(false);
    setOverview(on);
  };
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const urls = (c: Partial<Record<string, string>>) => Object.fromEntries(Object.entries(c).map(([v, f]) => [v, file(f!)]));
  // Finished poses only (all four views cut out); the card wears the shot's first pose here.
  const ready4 = props.poses.filter((p) => ["front", "threequarter", "side", "back"].every((v) => p.cutouts[v as keyof typeof p.cutouts]));

  const viewer = ready && path && (
    <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
      <StageViewer mesh={file(fill!.mesh)} camera={cam} filled overview={overview} className="absolute inset-0">
        <Blocks blocks={props.blocks} />
        <SceneAssets projectId={props.projectId} assets={props.assets} />
        <CharacterCard cutouts={cardAt(move, 0, urls(pl!.cutouts), ready4.map((p) => ({ id: p.id, cutouts: urls(p.cutouts) })))} at={pl!.at!} height={pl!.height} turn={pl!.turn} live={live} />
        <CameraPath
          poses={path.poses}
          inside={path.inside}
          overview={overview}
          playing={playing}
          onDone={() => setPlaying(false)}
          onStart={(from: Vec) => pick({ ...move, framing: "free", from })}
          onEnd={(to: Vec) => pick({ ...move, to })}
          onWalk={(to: Vec) => move.walk && pick({ ...move, walk: { ...move.walk, to } })}
          onLive={setLive}
        />
      </StageViewer>
      <ViewSwitch overview={overview} onOverview={view} />
    </div>
  );

  return (
    <CameraSection
      projectId={props.projectId}
      n="1"
      move={move}
      onMove={pick}
      start={path?.poses[0].position ?? null}
      subject={ready ? { at: pl!.at!, turn: pl!.turn } : null}
      subjects={[{ id: "main", label: "The character" }, ...props.assets.filter((a) => a.at && assetReady(a)).map((a) => ({ id: a.id, label: a.name })), { id: "none", label: "Nothing (free)" }]}
      poses={ready4.map((p) => ({ id: p.id, label: p.label }))}
      outside={path ? path.inside.filter((x) => !x).length : 0}
      close={path?.close ?? -1}
      playing={playing}
      onPlay={setPlaying}
      top={viewer}
      ready={ready}
      render={props.cameraRender}
      renderKey={ready ? renderKey(move, pl!.at!, pl!.height, fill!.mesh, pl!.turn) : null}
      job={props.stageJob}
    />
  );
}
