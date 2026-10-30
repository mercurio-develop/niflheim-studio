"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CameraPath } from "@/features/scene/components/camera-path";
import { assetReady } from "@/features/scene/components/scene-assets";
import { StageScene, useStageEdits } from "@/features/scene/components/stage-scene";
import { CameraSection } from "@/features/scene/components/camera-section";
import { StageViewer } from "@/features/scene/components/stage-viewer";
import { finishedPoses, fileUrl, urlsOf } from "@/lib/stage-context";
import { ViewSwitch } from "@/features/scene/components/view-switch";
import { DEFAULT_MOVE, cardAt, clampWalk, presetMove, frameCount, inside, momentsOf, placeAt, poses, tooClose, type CameraMove, type Moment, type Vec } from "@/lib/camera";
import { saveMoments } from "../actions/moments";
import { MomentsBar } from "./moments-bar";
import { SHOT_TYPES } from "../state";
import type { Block, CharacterPose, SceneAsset, SetData, StageData } from "@/lib/store";

// Where camera mode's camera is and looks, every frame, for Take shot.
function CameraProbe(props: { report: (v: { from: Vec; look: Vec }) => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;
  useFrame(() => {
    const look = controls?.target ?? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3).add(camera.position);
    props.report({ from: [camera.position.x, camera.position.y, camera.position.z], look: [look.x, look.y, look.z] });
  });
  return null;
}

const near = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// The active shot's camera (decision 0011): the Scene's stage with the character standing where
// the Scene put them, and this shot's framing, move and walk. Overview shows the path with a gizmo
// on each end and on the walk; Play flies it. Each shot keeps its own; saved as it is tuned.
export function ShotCamera(props: { projectId: string; set: SetData | null; placement: StageData | null; camera: CameraMove | null; blocks: Block[]; assets: SceneAsset[]; poses: CharacterPose[]; noMain?: boolean }) {
  const s = props.set;
  const fill = s?.stage && s.stage.image === s.image ? s.stage.fill : undefined;
  const cam = fill?.camera;
  // The stage is editable here too (decision 0013): a click or double-click picks a character, an
  // object or a block, the gizmo moves it, and it is saved for the whole scene.
  const edits = useStageEdits(props.projectId, props.placement?.at ? { at: props.placement.at, height: props.placement.height, turn: props.placement.turn } : null, props.assets, props.blocks);
  const { main: liveMain, assets: liveAssets } = edits;
  const [free, setFree] = useState(false);
  const pl = useMemo(() => (props.placement && liveMain ? { ...props.placement, at: liveMain.at, turn: liveMain.turn } : props.placement), [props.placement, liveMain]);
  const ready = !!cam?.floor && !!pl?.at;
  const [move, setMove] = useState<CameraMove>(props.camera ? { ...props.camera, seconds: Math.min(5, props.camera.seconds) } : DEFAULT_MOVE);
  const [overview, setOverview] = useState(false);
  // The expert controls (More): open by itself when the shot already uses moments.
  const [more, setMore] = useState(!!props.camera?.moments?.length);
  const [playing, setPlaying] = useState(false);
  const live = useRef<Vec | null>(null); // where the character stands this frame, when they walk
  const setLive = useCallback((at: Vec | null) => void (live.current = at), []);
  const path = useMemo(() => {
    if (!ready) return null;
    const ps = poses(cam!, { at: pl!.at!, height: pl!.height, turn: pl!.turn }, move, liveAssets);
    const who = { at: pl!.at!, height: pl!.height, turn: pl!.turn };
    return { poses: ps, inside: ps.map((p) => inside(cam!, p.position)), close: tooClose(ps, who, move) };
  }, [ready, cam, pl, move, liveAssets]);
  const pick = (m: CameraMove) => {
    setPlaying(false);
    setMove(m);
  };
  const view = (on: boolean) => {
    setPlaying(false);
    setFree(false);
    setOverview(on);
  };
  const urls = (c: Partial<Record<string, string>>) => urlsOf(props.projectId, c);
  // Finished poses only (all four views cut out); the card wears the shot's first pose here.
  const ready4 = finishedPoses(props.poses);

  // Key moments (decision 0013): the picked one poses the stage; the gizmo moves whoever is picked
  // for that moment only; Take shot stores camera mode's view as its camera.
  const ms = momentsOf(move);
  const n = frameCount(move.seconds);
  const [sel, setSel] = useState<number | null>(null);
  const moment = sel !== null ? ms[sel] ?? null : null;
  const frame = moment?.frame ?? 0;
  const probe = useRef<{ from: Vec; look: Vec } | null>(null);
  const report = useCallback((v: { from: Vec; look: Vec }) => void (probe.current = v), []);
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setMoments = (next: Moment[]) => {
    pick({ ...move, moments: next.length ? next : undefined });
    if (saving.current) clearTimeout(saving.current);
    saving.current = setTimeout(() => void saveMoments(props.projectId, next).catch(() => {}), 400);
  };
  const who = (id: string) => (id === "main" ? "The character" : (props.assets.find((a) => a.id === id)?.name ?? id));
  const placed = liveAssets.filter((a) => a.at);
  const marksAt = (f: number): Moment["marks"] => ({
    ...(pl?.at ? { main: (({ at, turn }) => ({ at, turn }))(placeAt(move, "main", { at: pl.at, turn: pl.turn }, f)) } : {}),
    ...Object.fromEntries(placed.map((a) => [a.id, (({ at, turn }) => ({ at, turn }))(placeAt(move, a.id, { at: a.at!, turn: a.turn }, f))])),
  });
  const block = () => {
    if (!path) return;
    const shot = (f: number) => ({ from: path.poses[f].position, look: path.poses[f].target });
    setMoments([{ frame: 0, camera: shot(0), marks: marksAt(0) }, { frame: n - 1, camera: shot(n - 1), marks: marksAt(n - 1) }]);
    setSel(0);
  };
  const add = () => {
    if (!path || ms.length < 2) return;
    const i = sel !== null && sel < ms.length - 1 ? sel : ms.length - 2;
    const f = Math.round((ms[i].frame + ms[i + 1].frame) / 16) * 8;
    if (f <= ms[i].frame || f >= ms[i + 1].frame) return;
    const next = [...ms.slice(0, i + 1), { frame: f, camera: { from: path.poses[f].position, look: path.poses[f].target }, marks: marksAt(f) }, ...ms.slice(i + 1)];
    setMoments(next);
    setSel(i + 1);
  };
  const mark = (id: string, patch: { at?: Vec; turn?: number; pose?: string }) =>
    sel !== null && setMoments(ms.map((x, i) => (i === sel ? { ...x, marks: { ...x.marks, [id]: { ...x.marks[id], ...patch } } } : x)));
  const warnings = ms.slice(1).flatMap((b, j) => {
    const a = ms[j];
    return Object.keys({ ...a.marks, ...b.marks }).flatMap((id) => {
      const p = placeAt(move, id, { at: [0, 0, 0], turn: 0 }, a.frame);
      const q = placeAt(move, id, { at: [0, 0, 0], turn: 0 }, b.frame);
      const d = near(p.at, q.at);
      const secs = (b.frame - a.frame) / 24;
      return d > 1.5 * Math.max(1, secs) ? [`${who(id)} moves ${d.toFixed(1)} m in ${secs.toFixed(1)} s between moments ${j + 1} and ${j + 2}: add a moment between, or LTX may smear the move.`] : [];
    });
  });
  const shownMain = pl?.at ? placeAt(move, "main", { at: pl.at, turn: pl.turn }, frame) : null;
  const shownAssets = liveAssets.map((a) => (a.at ? { ...a, ...(({ at, turn }) => ({ at, turn }))(placeAt(move, a.id, { at: a.at, turn: a.turn }, frame)) } : a));
  // Shot view: a selected moment's camera, else the shot's own first frame (its framing and start),
  // not the painting's camera (which showed whatever framing was chosen: 05_submit Chrome test).
  const first = path?.poses[0];
  const posed =
    overview || free || playing ? undefined : sel !== null && moment?.camera ? { position: moment.camera.from, target: moment.camera.look, n: sel } : first ? { position: first.position, target: first.target, n: -1 } : undefined;

  const viewer = ready && path && (
    <div className="relative aspect-[7/4] overflow-hidden rounded-lg border">
      <StageViewer mesh={fileUrl(props.projectId, fill!.mesh)} camera={cam} filled overview={overview && !free} free={free} pose={posed} className="absolute inset-0">
        {free && <CameraProbe report={report} />}
        <StageScene
          projectId={props.projectId}
          blocks={edits.blocks}
          assets={shownAssets}
          main={props.noMain ? null : { cutouts: cardAt(move, frame, urls(pl!.cutouts), ready4.map((p) => ({ id: p.id, cutouts: urls(p.cutouts) }))), at: shownMain!.at, height: pl!.height, turn: shownMain!.turn, live }}
          picked={edits.picked}
          onPick={playing ? undefined : edits.setPicked}
          onMoveMain={sel !== null ? (at, turn) => mark("main", { at, turn }) : edits.onMoveMain}
          onMoveAsset={sel !== null ? (id, at, turn) => mark(id, { at, turn }) : edits.onMoveAsset}
          onMoveBlock={edits.onMoveBlock}
        />
        <CameraPath
          poses={path.poses}
          inside={path.inside}
          overview={overview}
          playing={playing}
          onDone={() => setPlaying(false)}
          onStart={(from: Vec) => pick({ ...move, framing: "free", from })}
          onEnd={(to: Vec) => pick({ ...move, to })}
          onWalk={(to: Vec) => move.walk && pick({ ...move, walk: { ...move.walk, to: clampWalk(move.walk.from, to) } })}
          onLive={setLive}
        />
      </StageViewer>
      <ViewSwitch overview={overview} onOverview={view} home="Through the lens" />
      {(more || free) && <button
        type="button"
        aria-pressed={free}
        onClick={() => (setPlaying(false), setOverview(false), setFree(!free))}
        className="absolute top-2 right-2 z-20 rounded-full border bg-background/80 px-2.5 py-1 text-xs backdrop-blur aria-pressed:border-primary aria-pressed:text-primary"
      >
        Fly the camera
      </button>}
      {edits.error && <p className="absolute bottom-2 left-2 z-20 rounded bg-background/80 px-2 py-1 text-xs text-destructive">{edits.error}</p>}
    </div>
  );

  return (
    <CameraSection
      projectId={props.projectId}
      n="1"
      move={move}
      onMove={pick}
      start={path?.poses[0].position ?? null}
      subject={ready ? { at: pl!.at!, height: pl!.height, turn: pl!.turn } : null}
      subjects={[{ id: "main", label: "The character" }, ...edits.assets.filter((a) => a.at && assetReady(a)).map((a) => ({ id: a.id, label: a.name })), { id: "none", label: "Nothing (free)" }]}
      poses={ready4.map((p) => ({ id: p.id, label: p.label }))}
      outside={path ? path.inside.filter((x) => !x).length : 0}
      close={path?.close ?? -1}
      playing={playing}
      onPlay={setPlaying}
      top={
        viewer && (
          <>
            {viewer}
            {(more || ms.length > 0) && <MomentsBar
              moments={ms}
              frames={n}
              picked={sel}
              onPick={setSel}
              onBlock={block}
              onAdd={add}
              onDelete={(i) => (setMoments(ms.filter((_, j) => j !== i)), setSel(null))}
              onFrame={(i, f) => setMoments(ms.map((x, j) => (j === i ? { ...x, frame: Math.min(ms[i + 1].frame - 8, Math.max(ms[i - 1].frame + 8, f)) } : x)))}
              poses={ready4.map((p) => ({ id: p.id, label: p.label }))}
              onPose={(_, id) => mark("main", { pose: id })}
              canShoot={free && sel !== null}
              onShoot={() => probe.current && sel !== null && setMoments(ms.map((x, i) => (i === sel ? { ...x, camera: { ...probe.current! } } : x)))}
              warnings={warnings}
            />}
          </>
        )
      }
      ready={ready}
      presets={SHOT_TYPES}
      onPreset={(id, side) => {
        const p = SHOT_TYPES.find((x) => x.id === id);
        if (p && ready) pick({ ...presetMove(cam!, { at: pl!.at!, height: pl!.height, turn: pl!.turn }, p, side), subject: move.subject, pose: move.pose, focus: move.focus });
      }}
      more={more}
      onMore={(on) => (setMore(on), on || (setFree(false), setSel(null)))}
    />
  );
}
