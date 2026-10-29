"use client";

import { useMemo, useRef, useState } from "react";
import { Blocks } from "@/features/scene/components/blocks";
import { CameraPath } from "@/features/scene/components/camera-path";
import { CameraSection } from "@/features/scene/components/camera-section";
import { CharacterCard } from "@/features/scene/components/character-card";
import { StageViewer } from "@/features/scene/components/stage-viewer";
import { ViewSwitch } from "@/features/scene/components/view-switch";
import { DEFAULT_MOVE, inside, poses, renderKey, type CameraMove, type Vec } from "@/lib/camera";
import type { Block, CameraRender, Job, SetData, StageData } from "@/lib/store";

// The active shot's camera (decision 0011): the Scene's stage with the character standing where
// the Scene put them, and this shot's framing, move and walk. Overview shows the path with a gizmo
// on each end and on the walk; Play flies it. Each shot keeps its own; saved as it is tuned.
export function ShotCamera(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; cameraRender: CameraRender | null; blocks: Block[]; stageJob?: Job }) {
  const s = props.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const cam = fill?.camera;
  const pl = props.placement;
  const ready = !!cam?.floor && !!pl?.at;
  const [move, setMove] = useState<CameraMove>(props.camera ?? DEFAULT_MOVE);
  const [overview, setOverview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const live = useRef<Vec | null>(null); // where the character stands this frame, when they walk
  const path = useMemo(() => {
    if (!ready) return null;
    const ps = poses(cam!, { at: pl!.at!, height: pl!.height, turn: pl!.turn }, move);
    return { poses: ps, inside: ps.map((p) => inside(cam!, p.position)) };
  }, [ready, cam, pl, move]);
  const pick = (m: CameraMove) => {
    setPlaying(false);
    setMove(m);
  };
  const view = (on: boolean) => {
    setPlaying(false);
    setOverview(on);
  };
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;

  const viewer = ready && path && (
    <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
      <StageViewer mesh={file(fill!.mesh)} camera={cam} filled overview={overview} className="absolute inset-0">
        <Blocks blocks={props.blocks} />
        <CharacterCard cutouts={Object.fromEntries(Object.entries(pl!.cutouts).map(([v, f]) => [v, file(f!)]))} at={pl!.at!} height={pl!.height} turn={pl!.turn} live={live} />
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
      outside={path ? path.inside.filter((x) => !x).length : 0}
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
