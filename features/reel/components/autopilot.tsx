"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, Play, RotateCcw, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { KeyCapture } from "@/features/scene/components/key-capture";
import type { StagePose } from "@/features/scene/components/stage-viewer";
import { saveCamera } from "@/features/scene/actions/camera";
import { oneShoot, shotBeats } from "@/features/shot/actions/shot";
import { clayFrameMax } from "@/features/shot/state";
import { selectShot } from "@/features/shot/actions/shots";
import { cardAt, frameCount, keyFrames, poses, type CameraMove } from "@/lib/camera";
import type { StageCamera } from "@/lib/stage-fill";
import type { Autopilot as Pilot, AutopilotShot, AutopilotStep, Block, Join, SceneAsset, ViewId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { jobState, markStep, savePlan, startAutopilot, stopAutopilot } from "../actions/autopilot";
import { exportReel, saveReel } from "../actions/reel";

export type PilotShot = { id: string; name: string; move: CameraMove | null };
export type SceneCapture = { mesh: string; camera: StageCamera; cutouts: Partial<Record<ViewId, string>>; at: [number, number, number]; height: number; turn: number; blocks: Block[]; assets: SceneAsset[]; poses: { id: string; cutouts: Partial<Record<ViewId, string>> }[] };

// A shot's beats are kept in its action joined as "first, then next, then last".
const beatsOf = (action: string) => {
  const [start = "", then, end] = action.split(/,\s*then\s+/i);
  return { start, then: then || undefined, end: end || undefined };
};
const joinBeats = (b: { start: string; then?: string; end?: string }) => [b.start, b.then, b.end].map((x) => x?.trim()).filter(Boolean).join(", then ");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait for a job to leave "running"; throws its error when it fails.
async function wait(id: string, key: "keyframes" | "shot" | "reel") {
  await sleep(1500);
  for (;;) {
    const j = await jobState(id, key);
    if (j.status !== "running") {
      if (j.status === "error" || j.status === "cancelled") throw new Error(j.error ?? `${key} ${j.status}`);
      return;
    }
    await sleep(3000);
  }
}

// Autopilot: per shot what happens and how many takes, then Make the reel runs every step in
// order (keyframes, takes, the best take, the reel) from this page, which must stay open; the
// queue is saved, so reopening the page offers Resume from the step it stopped at.
// joins: the reel's own (Order sets them; a fade where none is chosen). Autopilot keeps them.
export function AutopilotPanel(props: { projectId: string; shots: PilotShot[]; pilot: Pilot | null; scene: SceneCapture | null; joins: Join[] }) {
  const id = props.projectId;
  const [plan, setPlan] = useState<AutopilotShot[]>(() =>
    props.shots.map((s) => props.pilot?.plan.find((p) => p.shot === s.id) ?? { shot: s.id, include: !!s.move, action: "", takes: 1 }),
  );
  const join: Join = props.pilot?.join ?? "fade";
  const [steps, setSteps] = useState(props.pilot?.steps ?? []);
  const [driving, setDriving] = useState(false);
  const [capture, setCapture] = useState<{ clay: boolean; poses: StagePose[]; done: (b: Blob[]) => void; fail: (m: string) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const stop = useRef(false);
  const name = (sid: string) => props.shots.find((s) => s.id === sid)?.name ?? sid;
  const remaining = steps.some((s) => s.status !== "done");
  const canResume = !driving && !!props.pilot && props.pilot.state !== "done" && props.pilot.state !== "idle" && remaining;

  // Each shot's beats come from the shot itself (typed in its Shoot step) until written here.
  useEffect(() => {
    shotBeats(id).then((all) => setPlan((cur) => cur.map((p) => (p.action.trim() || !all[p.shot] ? p : { ...p, action: joinBeats(all[p.shot]!) })))).catch(() => {});
  }, [id]);
  const edit = (i: number, patch: Partial<AutopilotShot>) => setPlan(plan.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Capture a shot's keyframes in the browser (the stage viewer off screen at each key pose).
  const captureKeys = (move: CameraMove, clay = false) =>
    new Promise<Blob[]>((resolve, reject) => {
      const s = props.scene!;
      const ps = poses(s.camera, s, move, s.assets);
      const at = clay ? Array.from({ length: frameCount(move.seconds) }, (_, f) => Math.min(f, ps.length - 1)) : keyFrames(move);
      setCapture({ clay, poses: at.map((f) => ({ ...ps[f], card: cardAt(move, f, s.cutouts, s.poses) })), done: (b) => (setCapture(null), resolve(b)), fail: (m) => (setCapture(null), reject(new Error(m))) });
    });

  async function runStep(i: number, list: typeof steps) {
    const st = list[i];
    const key = st.kind === "keys" ? "keyframes" : st.kind === "take" ? "shot" : st.kind === "export" ? "reel" : null;
    // A step left running when the page closed: its job may still be going on the server.
    // Wait for it and count it rather than start it twice.
    const interrupted = st.status === "running";
    const set = (status: (typeof steps)[number]["status"], err?: string) => {
      list[i] = { ...st, status, error: err };
      setSteps([...list]);
      return markStep(id, { step: i, status, error: err });
    };
    await set("running");
    try {
      if (key) {
        const j = await jobState(id, key);
        if (j.status === "running") {
          await wait(id, key);
          if (interrupted) {
            await set("done");
            return true;
          }
        }
      }
      if (st.kind !== "export") await selectShot(id, st.shot);
      if (st.kind === "keys") {
        const move = props.shots.find((s) => s.id === st.shot)?.move;
        if (!move) throw new Error(`${name(st.shot)} has no camera move: set one in Shots.`);
        // One Shoot per shot: draw the keys and the clay clip here, the server paints them (face
        // pass on), shoots up to 3 takes with the shot's beats and picks the steadiest.
        await saveCamera(id, move);
        const form = new FormData();
        (await captureKeys(move)).forEach((b, k) => form.set(`key${k}`, new File([b], `key${k}.jpg`, { type: "image/jpeg" })));
        const clay = await captureKeys(move, true);
        if (clay.some((b) => b.size >= clayFrameMax(clay.length))) throw new Error("A clay frame came out too big to send; shorten the move.");
        clay.forEach((b, k) => form.set(`f${k}`, new File([b], `${k}.jpg`, { type: "image/jpeg" })));
        await oneShoot(id, form, { beats: beatsOf(plan.find((p) => p.shot === st.shot)!.action), tries: 3 });
        await wait(id, "keyframes");
        await wait(id, "shot");
      } else if (st.kind === "take" || st.kind === "pick") {
        // Done by One Shoot above (its takes and its pick).
      } else {
        const order = plan.filter((p) => p.include).map((p) => p.shot);
        await saveReel(id, { order, joins: order.slice(1).map((_, i) => props.joins[i] ?? "fade") });
        await exportReel(id);
        await wait(id, "reel");
      }
      await set("done");
      return true;
    } catch (e) {
      await set("error", (e as Error).message);
      setError(`${name(st.shot) || "Reel"}: ${(e as Error).message}`);
      return false;
    }
  }

  async function drive(list: typeof steps) {
    setDriving(true);
    stop.current = false;
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break;
      if (list[i].status === "done") continue;
      if (!(await runStep(i, list))) break;
    }
    setDriving(false);
  }

  const make = () =>
    start(async () => {
      setError(null);
      try {
        await savePlan(id, { plan: plan.map((p) => ({ ...p, takes: 1 })), join });
        await startAutopilot(id);
        // The same steps startAutopilot saved: per shot keyframes, takes, the pick; then the reel.
        const list: AutopilotStep[] = plan
          .filter((p) => p.include)
          .flatMap((p): AutopilotStep[] => [
            { shot: p.shot, kind: "keys", status: "todo" },
            { shot: p.shot, kind: "take", n: 1, status: "todo" },
            { shot: p.shot, kind: "pick", status: "todo" },
          ]);
        list.push({ shot: "", kind: "export", status: "todo" });
        setSteps(list);
        await drive(list);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  const resume = () => start(() => drive([...steps]));
  const retry = (i: number) => {
    const list = [...steps];
    list[i] = { ...list[i], status: "todo", error: undefined };
    setSteps(list);
    setError(null);
    start(() => drive(list));
  };
  const label = (s: (typeof steps)[number]) => (s.kind === "export" ? "Put the reel together" : `${name(s.shot)} · ${s.kind === "keys" ? "One Shoot: keys, clay clip, beats" : s.kind === "take" ? "up to 3 takes" : "steadiest take picked"}`);

  return (
    <Section id="autopilot" n="1" tone="bg-tone-yellow" title="Autopilot" line="Say what happens in each shot in up to three beats (first, then, by the end) and press Make the reel: One Shoot per shot (keyframes painted with the beats, up to 3 takes, the steadiest picked), then the reel. Keep this page open while it runs."
      summary={driving ? "Running…" : "Make the whole reel in one press"}
      actions={
        <>
          <div className="flex gap-1">
            {driving && (
              <Button size="sm" variant="ghost" onClick={() => ((stop.current = true), start(() => stopAutopilot(id)))}>
                <Square data-icon="inline-start" />
                Stop after this step
              </Button>
            )}
            {canResume && (
              <Button size="sm" variant="outline" onClick={resume}>
                <Play data-icon="inline-start" />
                Resume
              </Button>
            )}
            <Button size="sm" disabled={driving || !props.scene || !plan.some((p) => p.include)} onClick={make}>
              {driving ? <LoadingDots /> : <Wand2 data-icon="inline-start" />}
              Make the reel
            </Button>
          </div>
        </>
      }
      className="nifl-enter"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      {!props.scene && <p className="text-sm text-muted-foreground">Build the scene and stand the character in it first.</p>}

      <div className="flex flex-col gap-2">
        {props.shots.map((s, i) => (
          <div key={s.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)_auto]", !plan[i].include && "opacity-60")}>
            <input type="checkbox" checked={plan[i].include} disabled={driving || !s.move} onChange={(e) => edit(i, { include: e.target.checked })} aria-label={`Include ${s.name}`} className="accent-primary" />
            <span className="truncate text-sm" title={s.name}>
              {s.name}
            </span>
            <div className="col-span-full row-start-2 grid gap-1 sm:col-span-1 sm:row-start-auto sm:grid-cols-3">
              {(["start", "then", "end"] as const).map((n) => (
                <Input key={n} value={beatsOf(plan[i].action)[n] ?? ""} disabled={driving} maxLength={300} onChange={(e) => edit(i, { action: joinBeats({ ...beatsOf(plan[i].action), [n]: e.target.value }) })} placeholder={n === "start" ? "first: lifts the tire" : n === "then" ? "then: bites it" : "by the end: walks off"} aria-label={`Beat ${n} of ${s.name}`} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">3 takes</span>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">Joins between shots: as set in Order below (a fade unless you choose).</span>
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">~{plan.filter((p) => p.include).length * 12} min</span>
        </div>
      </div>

      {!!steps.length && (
        <ol className="flex flex-col gap-1 rounded-lg border p-2 text-sm" aria-label="Autopilot queue">
          {steps.map((s, i) => (
            <li key={i} className={cn("flex items-center gap-2", s.status === "todo" && "text-muted-foreground")}>
              <span className="flex size-4 items-center justify-center">
                {s.status === "done" ? <Check className="size-3.5 text-primary" /> : s.status === "running" ? <LoadingDots /> : s.status === "error" ? <CircleAlert className="size-3.5 text-destructive" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{label(s)}</span>
              {s.status === "error" && (
                <>
                  <span className="max-w-[40%] truncate text-xs text-destructive" title={s.error}>
                    {s.error}
                  </span>
                  {!driving && (
                    <Button size="sm" variant="ghost" onClick={() => retry(i)}>
                      <RotateCcw data-icon="inline-start" />
                      Retry
                    </Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {capture && props.scene && <KeyCapture {...props.scene} projectId={props.projectId} poses={capture.poses} clay={capture.clay} onDone={capture.done} onError={capture.fail} />}
    </Section>
  );
}
