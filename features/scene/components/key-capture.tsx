"use client";

import { useRef, useState } from "react";
import type { Block, SceneAsset, ViewId } from "@/lib/store";
import { Blocks } from "./blocks";
import { SceneAssets } from "./scene-assets";
import type { StageCamera } from "@/lib/stage-fill";
import { CharacterCard } from "./character-card";
import { StageViewer, type StagePoint, type StagePose } from "./stage-viewer";

// The share of a frame that is the viewer's empty background (#0d0c0b, the fog colour), on a small copy.
function emptyShare(canvas: HTMLCanvasElement) {
  const w = 96;
  const h = 56;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return 0;
  g.drawImage(canvas, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 22 && px[i + 1] < 21 && px[i + 2] < 20) n++;
  return n / (w * h);
}

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
    // A key that sees mostly outside the stage (the viewer's empty background) gives Qwen nothing
    // to keep: it invents a new place for every key and the take jumps between them. Stop there.
    const empty = emptyShare(canvas);
    if (empty > 0.4) {
      busy.current = false;
      return props.onError(`Key ${i + 1} sees mostly outside the stage (${Math.round(empty * 100)}% empty). Bring the camera nearer the painting's view, or shorten the move.`);
    }
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
      <StageViewer mesh={props.mesh} camera={props.camera} filled pose={{ ...props.poses[i], n: i }} onDrawn={drawn} className="size-full">
        <Blocks blocks={props.blocks} />
        <SceneAssets projectId={props.projectId} assets={props.assets} wait />
        <CharacterCard cutouts={(props.poses[i].card as typeof props.cutouts | undefined) ?? props.cutouts} at={props.poses[i].at ?? props.at} height={props.height} turn={props.turn} />
      </StageViewer>
    </div>
  );
}
