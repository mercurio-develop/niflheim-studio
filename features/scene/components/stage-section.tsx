"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { Box, PaintBucket, PersonStanding, Plus, RefreshCw, Scissors, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeImage } from "@/components/fade-image";
import { More, Section } from "@/components/section";
import { JobStatus } from "@/features/wizard/components/job-status";
import type { Block, Job, SceneAsset, SetData, StageData } from "@/lib/store";
import { cn } from "@/lib/utils";
import { cancelSet, cancelStage, cutOutCharacter, placeCharacter, rebuildStage, refillStage, saveBlocks } from "../actions/scene";
import { placeAsset } from "../actions/assets";
import { AssetsPanel } from "./assets-panel";
import { Blocks } from "./blocks";
import { SceneAssets } from "./scene-assets";
import { CharacterCard } from "./character-card";
import { chip } from "./chip";
import { StageViewer, type StageLook, type StagePoint } from "./stage-viewer";

const SIZES: Record<Block["kind"], Block["size"]> = { box: [1, 1, 1], cylinder: [0.6, 1.2, 0.6], ramp: [1.5, 0.6, 2] };

// The 3D stage MoGe builds from the chosen painting, and the character standing in it: one
// viewer. Once the stage is levelled (floor y = 0, metres), the character is cut out of the
// turnaround by itself and stands where the floor is clicked, as a card that turns with the
// camera; height and facing are saved a moment after the last change.
export function StageSection(props: {
  projectId: string;
  set: SetData | null;
  placement: StageData | null;
  blocks: Block[]; // greybox shapes on the stage
  assets: SceneAsset[]; // objects made for the scene in 3D
  assetJobs: Record<string, Job>; // their jobs, by key
  characterAssets: string[]; // names of the assets taken off the character
  front: string | null; // the current turnaround front, to tell when the cutouts are old
  moved: boolean; // the set was rebuilt or refilled since the character was placed
  setJob?: Job;
  stageJob?: Job;
}) {
  const s = props.set;
  const file = (f: string) => `/api/files/${props.projectId}/${f}`;
  const building = props.setJob?.status === "running";
  // The stage job also renders the camera move; that one shows in the Camera section.
  const cutting = props.stageJob?.status === "running" && props.stageJob.detail !== "Rendering the camera move";
  const fresh = !!s?.stage && s.stage.image === s.image;
  const filled = fresh ? s!.stage!.fill : undefined;
  const floor = !!filled?.camera?.floor; // only a levelled stage takes the character
  const cut = !!props.placement && Object.keys(props.placement.cutouts).length > 0;
  const oldCut = !!props.placement && !!props.front && props.placement.source !== props.front;
  const ready = floor && cut;
  const [at, setAt] = useState<StagePoint | null>(props.placement?.at ?? null);
  const [height, setHeight] = useState(props.placement?.height ?? 1.7);
  const [turn, setTurn] = useState(props.placement?.turn ?? 0);
  const [look, setLook] = useState<StageLook>("painting");
  const [blocks, setBlocks] = useState<Block[]>(props.blocks);
  const [picked, setPicked] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Block["kind"] | null>(null); // the next floor click puts this down
  const block = blocks.find((b) => b.id === picked);
  const change = (id: string, patch: Partial<Block>) => setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  // Assets: placed and sized here, saved a moment after the last change; made on the server.
  type Spot = Pick<SceneAsset, "at" | "height" | "turn">;
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const [pickedAsset, setPickedAsset] = useState<string | null>(null);
  const [placingAsset, setPlacingAsset] = useState<string | null>(null);
  const assets = props.assets.map((a) => ({ ...a, ...spots[a.id] }));
  const spot = (id: string, patch: Partial<Spot>) => {
    const a = assets.find((x) => x.id === id)!;
    setSpots({ ...spots, [id]: { at: a.at, height: a.height, turn: a.turn, ...patch } });
  };
  const putAsset = (p: StagePoint) => {
    spot(placingAsset!, { at: p });
    setPickedAsset(placingAsset);
    setPlacingAsset(null);
  };
  const assetsBusy = Object.entries(props.assetJobs).some(([k, j]) => k.startsWith("scene-asset:") && j.status === "running");

  const put = (p: StagePoint) => {
    const b: Block = { id: Date.now().toString(36), kind: placing!, at: p, size: SIZES[placing!], turn: 0, label: "" };
    setBlocks([...blocks, b]);
    setPicked(b.id);
    setPlacing(null);
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    start(() => fn().then(() => {}, (e: Error) => setError(e.message)));
  };
  const filling = building && !!props.setJob?.detail?.startsWith("Filling");
  const painting = building && !!props.setJob?.detail?.startsWith("Painting");

  const spotsJson = JSON.stringify(spots);
  const firstSpots = useRef(true);
  useEffect(() => {
    if (firstSpots.current) return void (firstSpots.current = false);
    const t = setTimeout(() => {
      for (const [id, v] of Object.entries(spots)) if (v.at) run(() => placeAsset(props.projectId, id, v));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotsJson]);

  // A levelled stage with no cutouts yet: cut the character out by itself, once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !floor || !props.front || props.placement || building || cutting || props.stageJob?.status === "error") return;
    asked.current = true;
    run(() => cutOutCharacter(props.projectId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  // Saved a moment after the last change, so dragging a slider is one save.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!at || !ready) return;
    const t = setTimeout(() => run(() => placeCharacter(props.projectId, { at, height, turn })), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, height, turn]);

  // Blocks saved like the placement: a moment after the last change.
  const firstBlocks = useRef(true);
  const blocksJson = JSON.stringify(blocks);
  useEffect(() => {
    if (firstBlocks.current) return void (firstBlocks.current = false);
    const t = setTimeout(() => run(() => saveBlocks(props.projectId, blocks)), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksJson]);

  const cam = filled?.camera;
  const distance = at && cam ? Math.hypot(at[0] - cam.c2w[0][3], at[2] - cam.c2w[2][3]) : null;
  const line = ready
    ? "Click the floor where they stand. Drag to look around: the card turns to you and shows the matching view of the turnaround."
    : floor
      ? "The stage is ready. The character is being cut out of the turnaround to stand in it."
      : filled
        ? "Drag to look around, scroll to move in. What the painting does not show was painted in from nearby cameras."
        : fresh
          ? "Drag to look around. The holes are being painted in from nearby cameras; then the character can stand in it."
          : "Pick a painting: MoGe reads it as depth and builds a 3D stage you can stand the character in.";

  return (
    <Section
      id="stage"
      n="2"
      tone="bg-tone-cyan"
      title="Stage"
      line={line}
      summary={at ? `The character stands ${distance ? `${distance.toFixed(1)} m from the camera` : "on the stage"}, ${height.toFixed(2)} m tall` : fresh ? "Stage built" : "No stage yet"}
      open={!!s?.image || building}
      actions={
        s?.image && !building && !cutting && (
          <>
            {(oldCut || props.stageJob?.status === "error") && floor && (
              <Button variant="ghost" size="sm" onClick={() => run(() => cutOutCharacter(props.projectId))}>
                <Scissors data-icon="inline-start" />
                {oldCut ? "Cut out the new turnaround" : "Cut out again"}
              </Button>
            )}
            {fresh && (
              <Button variant="ghost" size="sm" onClick={() => run(() => refillStage(props.projectId))}>
                <PaintBucket data-icon="inline-start" />
                {filled ? "Fill again" : "Fill the holes"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => run(() => rebuildStage(props.projectId))}>
              <RefreshCw data-icon="inline-start" />
              Rebuild
            </Button>
          </>
        )
      }
      className="nifl-enter"
      style={{ "--i": 2 } as React.CSSProperties}
    >
      {building && props.setJob && <JobStatus message={props.setJob.detail ?? "Working"} startedAt={props.setJob.startedAt} expected={painting ? 30 : filling ? 260 : 10} onCancel={() => cancelSet(props.projectId)} />}
      {cutting && props.stageJob && <JobStatus message={props.stageJob.detail ?? "Cutting out the character"} startedAt={props.stageJob.startedAt} expected={10} onCancel={() => cancelStage(props.projectId)} />}

      <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
        {fresh ? (
          <StageViewer
            key={filled?.mesh ?? s!.stage!.mesh}
            mesh={file(filled?.mesh ?? s!.stage!.mesh)}
            camera={filled?.camera}
            filled={!!filled}
            look={look}
            onFloor={placing && floor ? put : placingAsset && floor ? putAsset : ready ? setAt : undefined}
            className="absolute inset-0"
          >
            {floor && <Blocks blocks={blocks} picked={picked} onPick={setPicked} onMove={(id, p) => change(id, { at: p })} />}
            {floor && <SceneAssets projectId={props.projectId} assets={assets} picked={pickedAsset} onPick={setPickedAsset} onMove={(id, p) => spot(id, { at: p })} />}
            {ready && at && <CharacterCard cutouts={Object.fromEntries(Object.entries(props.placement!.cutouts).map(([v, f]) => [v, file(f!)]))} at={at} height={height} turn={turn} />}
          </StageViewer>
        ) : s?.image ? (
          <FadeImage src={file(s.image)} alt="The chosen painting" className={cn("absolute inset-0 size-full object-cover", building && "opacity-60")} />
        ) : (
          <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/30 text-sm text-muted-foreground", painting && "nifl-loading")}>
            {!painting && (
              <>
                <Box className="size-6" />
                Your stage appears here.
              </>
            )}
          </div>
        )}
        {building && s?.image && !fresh && <div aria-hidden className="nifl-loading pointer-events-none absolute inset-0 bg-transparent" />}
        {placingAsset && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-center text-sm backdrop-blur">
              <Plus className="size-4 shrink-0 text-primary" />
              Click the floor to stand the {assets.find((a) => a.id === placingAsset)?.name} there
            </span>
          </div>
        )}
        {placing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-center text-sm backdrop-blur">
              <Plus className="size-4 shrink-0 text-primary" />
              Click the floor to put the {placing} there
            </span>
          </div>
        )}
        {ready && !placing && !placingAsset && (!at || props.moved) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-center text-sm backdrop-blur">
              <PersonStanding className="size-4 shrink-0 text-primary" />
              {at ? "The set changed since you placed them: click the floor to stand them again" : "Click the floor to stand them there"}
            </span>
          </div>
        )}
      </div>

      {fresh && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 pt-1 sm:max-w-xl">
          {filled && (
            <>
              <span className="text-xs text-muted-foreground">Show</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(["painting", "guide"] as const).map((x) => (
                  <button key={x} type="button" aria-pressed={look === x} className={chip(look === x)} onClick={() => setLook(x)}>
                    {x === "painting" ? "Painting" : "Guide"}
                  </button>
                ))}
                {distance !== null && <span className="ml-2 font-mono text-[11px] text-muted-foreground">{distance.toFixed(1)} m from the camera</span>}
              </div>
            </>
          )}
          {ready && (
            <>
              <label htmlFor="scene-height" className="text-xs text-muted-foreground">
                Height
              </label>
              <div className="flex items-center gap-3">
                <input id="scene-height" type="range" min={0.5} max={3} step={0.05} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full accent-primary" />
                <span className="w-14 text-right font-mono text-xs text-muted-foreground">{height.toFixed(2)} m</span>
              </div>
              <label htmlFor="scene-turn" className="text-xs text-muted-foreground">
                Facing
              </label>
              <div className="flex items-center gap-3">
                <input id="scene-turn" type="range" min={-180} max={180} step={5} value={turn} onChange={(e) => setTurn(Number(e.target.value))} className="w-full accent-primary" />
                <span className="w-14 text-right font-mono text-xs text-muted-foreground">{turn === 0 ? "camera" : `${turn > 0 ? "→" : "←"} ${Math.abs(turn)}°`}</span>
              </div>
            </>
          )}
        </div>
      )}

      {floor && (
        <More
          label="Assets"
          summary={assets.length ? `${assets.length}: ${assets.map((a) => a.name).join(", ")}` : "objects made in 3D from a description, a picture or the character's assets"}
          open={!!placingAsset || !!pickedAsset || assetsBusy || assets.some((x) => x.glb && !x.at)}
        >
          <AssetsPanel
            projectId={props.projectId}
            assets={assets}
            jobs={props.assetJobs}
            characterAssets={props.characterAssets}
            picked={pickedAsset}
            onPick={setPickedAsset}
            placing={placingAsset}
            onPlace={(id) => (setPlacing(null), setPlacingAsset(id))}
            onChange={spot}
          />
        </More>
      )}

      {floor && (
        <More label="Blocks" summary={blocks.length ? `${blocks.length} on the stage: ${blocks.map((b) => b.label || b.kind).join(", ")}` : "grey shapes the keyframes paint into props"} open={!!placing || !!picked}>
          <p className="text-xs text-muted-foreground">Put plain shapes on the stage and say what each one is: the keyframes paint them as that, in the scene&apos;s style. Click one to select it and drag it in the stage.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["box", "cylinder", "ramp"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={placing === k} className={chip(placing === k)} onClick={() => setPlacing(placing === k ? null : k)}>
                <Plus className="mr-1 inline size-3" />
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {blocks.length > 0 && (
            <ul className="flex flex-col gap-2">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <button type="button" aria-pressed={picked === b.id} className={chip(picked === b.id)} onClick={() => setPicked(picked === b.id ? null : b.id)}>
                    {b.kind}
                  </button>
                  <input
                    aria-label={`What the ${b.kind} is`}
                    value={b.label}
                    maxLength={80}
                    placeholder="what it is: a wooden cart"
                    onChange={(e) => change(b.id, { label: e.target.value })}
                    className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm"
                  />
                  <Button variant="ghost" size="icon" aria-label={`Remove the ${b.kind}`} onClick={() => (setBlocks(blocks.filter((x) => x.id !== b.id)), picked === b.id && setPicked(null))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {block && (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:max-w-xl">
              {(["Width", "Height", "Depth"] as const).map((name, i) => (
                <Fragment key={name}>
                  <label htmlFor={`block-${i}`} className="text-xs text-muted-foreground">
                    {name}
                  </label>
                  <div className="flex items-center gap-3">
                    <input id={`block-${i}`} type="range" min={0.1} max={6} step={0.05} value={block.size[i]} onChange={(e) => change(block.id, { size: block.size.map((x, j) => (j === i ? Number(e.target.value) : x)) as Block["size"] })} className="w-full accent-primary" />
                    <span className="w-14 text-right font-mono text-xs text-muted-foreground">{block.size[i].toFixed(2)} m</span>
                  </div>
                </Fragment>
              ))}
              <label htmlFor="block-turn" className="text-xs text-muted-foreground">
                Turn
              </label>
              <div className="flex items-center gap-3">
                <input id="block-turn" type="range" min={-180} max={180} step={5} value={block.turn} onChange={(e) => change(block.id, { turn: Number(e.target.value) })} className="w-full accent-primary" />
                <span className="w-14 text-right font-mono text-xs text-muted-foreground">{block.turn}°</span>
              </div>
            </div>
          )}
        </More>
      )}

      {fresh && (
        <More label="How the stage was built" summary="depth and the painted views">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Depth</span>
            <FadeImage src={file(s!.stage!.depth)} alt="Depth map of the set" className="h-14 rounded border" />
            {!!filled?.views.length && (
              <>
                <span className="ml-2">Painted views</span>
                <div className="flex min-w-0 gap-1.5 overflow-x-auto">
                  {filled.views.map((v) => (
                    <FadeImage key={v} src={file(v)} alt="A view painted to fill the stage" className="h-14 shrink-0 rounded border" />
                  ))}
                </div>
              </>
            )}
          </div>
        </More>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {props.setJob?.status === "error" && <p className="text-sm text-destructive">The stage failed: {props.setJob.error}</p>}
      {props.stageJob?.status === "error" && <p className="text-sm text-destructive">The cutout failed: {props.stageJob.error}</p>}
      {pending && !building && !cutting && at && <p className="font-mono text-[11px] text-muted-foreground">Saving…</p>}
    </Section>
  );
}
