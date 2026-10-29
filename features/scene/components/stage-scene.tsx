"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Block, SceneAsset, ViewId } from "@/lib/store";
import { placeAsset } from "../actions/assets";
import { placeCharacter, saveBlocks } from "../actions/scene";
import { Blocks } from "./blocks";
import { CharacterCard } from "./character-card";
import { FloorGizmo, SceneAssets } from "./scene-assets";
import type { StagePoint } from "./stage-viewer";

// Everything that stands on a stage, drawn the same way in every viewer (Scene's stage, a shot's
// camera, the off-screen keyframe capture): the greybox blocks, the scene's assets and the main
// character's card. One thing is picked at a time; it carries the floor gizmo. A click that barely
// moved picks (so a double-click does too: picking never toggles off); without onPick nothing is
// pickable (captures). Escape lets go (useStageEdits).

export type StagePick = { kind: "main" | "asset" | "block"; id: string } | null;
export type MainCard = { cutouts: Partial<Record<ViewId, string>>; at: StagePoint; height: number; turn: number; live?: React.RefObject<StagePoint | null> };

export function StageScene(props: {
  projectId: string;
  blocks: Block[];
  assets: SceneAsset[];
  main?: MainCard | null; // cutouts as URLs
  picked?: StagePick;
  onPick?: (p: StagePick) => void;
  onMoveMain?: (at: StagePoint, turn: number) => void;
  onMoveAsset?: (id: string, at: StagePoint, turn: number) => void;
  onMoveBlock?: (id: string, at: StagePoint) => void;
  wait?: boolean; // captures: no Suspense of their own, so the viewer waits for every model
}) {
  const p = props.picked;
  const pick = props.onPick;
  const select = (next: Exclude<StagePick, null>) => pick?.(next);
  return (
    <>
      <Blocks blocks={props.blocks} picked={p?.kind === "block" ? p.id : null} onPick={pick && ((id) => select({ kind: "block", id }))} onMove={props.onMoveBlock} />
      <SceneAssets
        projectId={props.projectId}
        assets={props.assets}
        wait={props.wait}
        picked={p?.kind === "asset" ? p.id : null}
        onPick={pick && ((id) => select({ kind: "asset", id }))}
        onMove={props.onMoveAsset}
      />
      {props.main && (
        <CharacterCard
          cutouts={props.main.cutouts}
          at={props.main.at}
          height={props.main.height}
          turn={props.main.turn}
          live={props.main.live}
          picked={p?.kind === "main"}
          onPick={pick && (() => select({ kind: "main", id: "main" }))}
        />
      )}
      {props.main && p?.kind === "main" && props.onMoveMain && <FloorGizmo at={props.main.at} turn={props.main.turn} onMove={props.onMoveMain} />}
    </>
  );
}

// Moving things on the stage from a viewer that is not the Scene's (a shot's camera): the picked
// thing follows the gizmo here at once and is saved a moment after the last change, through the
// same actions the Scene uses. main: the placement as saved; assets, blocks: as saved.
export function useStageEdits(projectId: string, main: { at: StagePoint; height: number; turn: number } | null, assets: SceneAsset[], blocks: Block[]) {
  const [picked, setPicked] = useState<StagePick>(null);
  const [mainSpot, setMainSpot] = useState<{ at: StagePoint; turn: number } | null>(null);
  const [spots, setSpots] = useState<Record<string, { at: StagePoint; turn: number }>>({});
  const [blockAt, setBlockAt] = useState<Record<string, StagePoint>>({});
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => start(() => fn().then(() => setError(null), (e: Error) => setError(e.message)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPicked(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const liveAssets = useMemo(() => assets.map((a) => (spots[a.id] ? { ...a, ...spots[a.id] } : a)), [assets, spots]);
  const liveBlocks = useMemo(() => blocks.map((b) => (blockAt[b.id] ? { ...b, at: blockAt[b.id] } : b)), [blocks, blockAt]);
  const liveMain = useMemo(() => (main ? { ...main, ...mainSpot } : null), [main?.at, main?.height, main?.turn, mainSpot]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = useRef("");
  const json = JSON.stringify([mainSpot, spots, blockAt]);
  useEffect(() => {
    if (json === saved.current || json === JSON.stringify([null, {}, {}])) return;
    const t = setTimeout(() => {
      saved.current = json;
      if (mainSpot && main) run(() => placeCharacter(projectId, { at: mainSpot.at, height: main.height, turn: mainSpot.turn }));
      for (const [id, s] of Object.entries(spots)) {
        const a = assets.find((x) => x.id === id);
        if (a) run(() => placeAsset(projectId, id, { at: s.at, height: a.height, turn: s.turn }));
      }
      if (Object.keys(blockAt).length) run(() => saveBlocks(projectId, liveBlocks));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json]);

  return {
    picked,
    setPicked,
    error,
    main: liveMain,
    assets: liveAssets,
    blocks: liveBlocks,
    onMoveMain: (at: StagePoint, turn: number) => setMainSpot({ at, turn }),
    onMoveAsset: (id: string, at: StagePoint, turn: number) => setSpots((s) => ({ ...s, [id]: { at, turn } })),
    onMoveBlock: (id: string, at: StagePoint) => setBlockAt((b) => ({ ...b, [id]: at })),
  };
}
