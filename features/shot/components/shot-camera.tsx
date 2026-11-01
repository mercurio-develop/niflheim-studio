"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
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
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingDots } from "@/components/loading-dots";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

// What the character does, shared with the shot page so the strip on the picture reads and writes it.
const BEATS = [
  { id: "start", label: "First", placeholder: "stands still, breathing slowly" },
  { id: "then", label: "As the camera moves", placeholder: "turns their head toward the camera" },
  { id: "end", label: "By the end", placeholder: "narrows their eyes, shoulders tense" },
] as const;
type BeatId = (typeof BEATS)[number]["id"];
// shoot is the one Shoot button of the shot, kept by the shot page and worn by the picture.
export type ShootState = { label: string; busy: boolean; disabled: boolean; title: string; onShoot: () => void };
export const ShotFrameContext = createContext<{ beats: Record<BeatId, string>; setBeat: (id: BeatId, v: string) => void; shoot: ShootState } | null>(null);

// The strip on the picture: start pose, the three lines, end pose. A line edits in place and frames
// the end it belongs to (the first line the start, the last the end; the middle keeps the end shown).
type PoseChoice = { id: string; label: string; src?: string };
function Strip(props: { end: 0 | 1; onEnd: (e: 0 | 1) => void; start: string; finish: string; choices: PoseChoice[]; current: [string, string]; onPose: (e: 0 | 1, id: string) => void }) {
  const frame = useContext(ShotFrameContext)!;
  const [editing, setEditing] = useState<BeatId | null>(null);
  const [picking, setPicking] = useState<0 | 1 | null>(null);
  // A pose cell frames its end and opens the sheet pictures to pick that end's pose from, once.
  const pose = (label: string, on: boolean, title: string, e: 0 | 1) => (
    <div className="relative flex shrink-0">
      <button
        type="button"
        aria-pressed={on}
        aria-expanded={picking === e}
        onClick={() => {
          props.onEnd(e);
          setPicking(picking === e || !props.choices.length ? null : e);
        }}
        className="flex flex-col items-start rounded-md border bg-background/80 px-2 py-1 text-left text-xs backdrop-blur aria-pressed:border-primary"
      >
        <span className="text-[10px] text-muted-foreground">{title}</span>
        <span>{label}</span>
      </button>
      {picking === e && (
        <div role="listbox" aria-label={`${title} from the sheet`} className={cn("absolute bottom-full mb-1.5 flex max-w-[60vw] gap-1.5 overflow-x-auto rounded-md border bg-background/90 p-1.5 backdrop-blur", e ? "right-0" : "left-0")}>
          {[{ id: "", label: "As designed" } as PoseChoice, ...props.choices].map((c) => (
            <button key={c.id || "designed"} type="button" role="option" aria-selected={props.current[e] === c.id} onClick={() => (props.onPose(e, c.id), setPicking(null))} className="flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-md border p-1 text-[10px] aria-selected:border-primary">
              {c.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.src} alt="" className="aspect-square w-full rounded object-contain" />
              ) : (
                <span className="aspect-square w-full rounded bg-muted" />
              )}
              <span className="w-full truncate text-center">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 flex items-stretch gap-1.5" role="group" aria-label="The shot, start to end">
      {pose(props.start, props.end === 0, "Start pose", 0)}
      {BEATS.map((b) => (
        <div key={b.id} className="min-w-0 flex-1 rounded-md border bg-background/80 px-2 py-1 text-xs backdrop-blur">
          <span className="block text-[10px] text-muted-foreground">{b.label}</span>
          {editing === b.id ? (
            <Input autoFocus aria-label={b.label} value={frame.beats[b.id]} maxLength={300} placeholder={b.placeholder} onChange={(e) => frame.setBeat(b.id, e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && setEditing(null)} className="h-6 px-1 text-xs" />
          ) : (
            <button
              type="button"
              title={frame.beats[b.id] || b.placeholder}
              onClick={() => {
                setEditing(b.id);
                if (b.id !== "then") props.onEnd(b.id === "end" ? 1 : 0);
              }}
              className={cn("block w-full truncate text-left", !frame.beats[b.id] && "text-muted-foreground")}
            >
              {frame.beats[b.id] || b.placeholder}
            </button>
          )}
        </div>
      ))}
      {pose(props.finish, props.end === 1, "End pose", 1)}
    </div>
  );
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
  const [end, setEnd] = useState<0 | 1>(0); // the end the picture shows when no moment is picked
  const frame = moment?.frame ?? (end ? n - 1 : 0);
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
  const first = path?.poses[end ? n - 1 : 0] ?? path?.poses[0];
  const posed =
    overview || free || playing ? undefined : sel !== null && moment?.camera ? { position: moment.camera.from, target: moment.camera.look, n: sel } : first ? { position: first.position, target: first.target, n: -1 - end } : undefined;

  const frameCtx = useContext(ShotFrameContext);
  const inFrame = !!frameCtx;
  // The pose each end wears (moments, when blocked, set it on the first and last one).
  const endPose = (e: 0 | 1): string | undefined => {
    if (ms.length) return ms[e ? ms.length - 1 : 0].marks.main?.pose || undefined;
    return e ? (move.poseThen === "designed" ? undefined : (move.poseThen ?? move.pose)) : move.pose;
  };
  const setPose = (e: 0 | 1, id: string) => {
    if (ms.length) return setMoments(ms.map((x, i) => (i === (e ? ms.length - 1 : 0) ? { ...x, marks: { ...x.marks, main: { ...x.marks.main, pose: id } } } : x)));
    if (!e) return pick({ ...move, pose: id || undefined });
    pick({ ...move, poseThen: id === (move.pose ?? "") ? undefined : id || "designed" });
  };
  const poseName = (id?: string) => (id ? (ready4.find((p) => p.id === id)?.label ?? "As designed") : "As designed");
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
        className="absolute top-14 left-3 z-20 rounded-full border bg-background/80 px-2.5 py-1 text-xs backdrop-blur aria-pressed:border-primary aria-pressed:text-primary"
      >
        Fly the camera
      </button>}
      {inFrame && <Strip end={end} onEnd={(e) => (setSel(null), setEnd(e))} start={poseName(endPose(0))} finish={poseName(endPose(1))} choices={ready4.map((p) => ({ id: p.id, label: p.label, src: urls(p.views).front }))} current={[endPose(0) ?? "", endPose(1) ?? ""]} onPose={setPose} />}
      {edits.error && <p className="absolute bottom-20 left-2 z-20 rounded bg-background/80 px-2 py-1 text-xs text-destructive">{edits.error}</p>}
      <CameraSection
        projectId={props.projectId}
        move={move}
        onMove={pick}
        start={path?.poses[0].position ?? null}
        subject={ready ? { at: pl!.at!, height: pl!.height, turn: pl!.turn } : null}
        subjects={[{ id: "main", label: "The character" }, ...edits.assets.filter((a) => a.at && assetReady(a)).map((a) => ({ id: a.id, label: a.name })), { id: "none", label: "Nothing (free)" }]}
        outside={path ? path.inside.filter((x) => !x).length : 0}
        close={path?.close ?? -1}
        playing={playing}
        onPlay={setPlaying}
        ready={ready}
        presets={SHOT_TYPES}
        onPreset={(id, side) => {
          const p = SHOT_TYPES.find((x) => x.id === id);
          if (p && ready) pick({ ...presetMove(cam!, { at: pl!.at!, height: pl!.height, turn: pl!.turn }, p, side), subject: move.subject, pose: move.pose, focus: move.focus });
        }}
        more={more}
        onMore={(on) => (setMore(on), on || (setFree(false), setSel(null)))}
        extra={
          frameCtx && (
            <Button size="sm" disabled={frameCtx.shoot.disabled} onClick={frameCtx.shoot.onShoot} title={frameCtx.shoot.title}>
              {frameCtx.shoot.busy ? <LoadingDots /> : <Clapperboard data-icon="inline-start" />}
              {frameCtx.shoot.label}
            </Button>
          )
        }
      />
    </div>
  );

  return (
    <div id="camera" className="nifl-enter flex flex-col gap-3">
      {!ready && <p className="text-sm text-muted-foreground">Stand the character on the stage in Scene first: every move is aimed at them.</p>}
      {viewer && (
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
              canShoot={free && sel !== null}
              onShoot={() => probe.current && sel !== null && setMoments(ms.map((x, i) => (i === sel ? { ...x, camera: { ...probe.current! } } : x)))}
              warnings={warnings}
            />}
          </>
      )}
    </div>
  );
}
