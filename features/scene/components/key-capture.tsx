"use client";

import { useRef, useState } from "react";
import type { Block, SceneAsset, ViewId } from "@/lib/store";
import { Blocks } from "./blocks";
import { SceneAssets } from "./scene-assets";
import type { StageCamera } from "@/lib/stage-fill";
import { CharacterCard } from "./character-card";
import { StageViewer, type StagePoint, type StagePose } from "./stage-viewer";

// The stage viewer drawn off screen at 768x448, the shot's size, flown to each key pose in turn;
// each frame is taken as a JPEG (four PNGs pass a server action's 1 MB limit) once the stage and the character card have loaded and drawn.
export function KeyCapture(props: {
  mesh: string;
  camera: StageCamera;
  cutouts: Partial<Record<ViewId, string>>;
  at: StagePoint;
  height: number;
  turn: number;
  blocks: Block[];
  assets: SceneAsset[];
  projectId: string;
  poses: StagePose[];
  onDone: (pngs: Blob[]) => void;
  onError: (message: string) => void;
}) {
  const [i, setI] = useState(0);
  const shots = useRef<Blob[]>([]);
  const busy = useRef(false);
  const drawn = (canvas: HTMLCanvasElement) => {
    if (busy.current) return;
    busy.current = true;
    canvas.toBlob((b) => {
      busy.current = false;
      if (!b) return props.onError("The browser could not capture the stage.");
      shots.current[i] = b;
      if (i + 1 < props.poses.length) setI(i + 1);
      else props.onDone(shots.current);
    }, "image/jpeg", 0.92);
  };
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 -left-[9999px]" style={{ width: 768, height: 448 }}>
      <StageViewer mesh={props.mesh} camera={props.camera} filled pose={props.poses[i]} onDrawn={drawn} className="size-full">
        <Blocks blocks={props.blocks} />
        <SceneAssets projectId={props.projectId} assets={props.assets} wait />
        <CharacterCard cutouts={props.cutouts} at={props.poses[i].at ?? props.at} height={props.height} turn={props.turn} />
      </StageViewer>
    </div>
  );
}
