"use client";

import { useRef, useState, useTransition } from "react";
import { Check, CircleAlert, Play, RotateCcw, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/loading-dots";
import { Section } from "@/components/section";
import { KeyCapture } from "@/features/scene/components/key-capture";
import type { StagePose } from "@/features/scene/components/stage-viewer";
import { saveKeys } from "@/features/shot/actions/keyframes";
import { renderTake } from "@/features/shot/actions/shot";
import { selectShot } from "@/features/shot/actions/shots";
import { keyFrames, poses, type CameraMove } from "@/lib/camera";
import type { StageCamera } from "@/lib/stage-fill";
import type { Autopilot as Pilot, AutopilotShot, AutopilotStep, Join, ViewId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { jobState, markStep, pickBest, savePlan, startAutopilot, stopAutopilot } from "../actions/autopilot";
import { exportReel, saveReel } from "../actions/reel";

export type PilotShot = { id: string; name: string; move: CameraMove | null };
export type SceneCapture = { mesh: string; camera: StageCamera; cutouts: Partial<Record<ViewId, string>>; at: [number, number, number]; height: number; turn: number };

const JOINS: { id: Join; label: string }[] = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "dip", label: "Dip to black" },
];
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
export function AutopilotPanel(props: { projectId: string; shots: PilotShot[]; pilot: Pilot | null; scene: SceneCapture | null }) {
  const id = props.projectId;
  const [plan, setPlan] = useState<AutopilotShot[]>(() =>
    props.shots.map((s) => props.pilot?.plan.find((p) => p.shot === s.id) ?? { shot: s.id, include: !!s.move, action: "", takes: 2 }),
  );
  const [join, setJoin] = useState<Join>(props.pilot?.join ?? "fade");
  const [steps, setSteps] = useState(props.pilot?.steps ?? []);
  const [driving, setDriving] = useState(false);
  const [capture, setCapture] = useState<{ poses: StagePose[]; done: (b: Blob[]) => void; fail: (m: string) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const stop = useRef(false);
  const name = (sid: string) => props.shots.find((s) => s.id === sid)?.name ?? sid;
  const remaining = steps.some((s) => s.status !== "done");
  const canResume = !driving && !!props.pilot && props.pilot.state !== "done" && props.pilot.state !== "idle" && remaining;

  const edit = (i: number, patch: Partial<AutopilotShot>) => setPlan(plan.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  // Capture a shot's keyframes in the browser (the stage viewer off screen at each key pose).
  const captureKeys = (move: CameraMove) =>
    new Promise<Blob[]>((resolve, reject) => {
      const s = props.scene!;
      const ps = poses(s.camera, s, move);
      setCapture({ poses: keyFrames(move).map((f) => ps[f]), done: (b) => (setCapture(null), resolve(b)), fail: (m) => (setCapture(null), reject(new Error(m))) });
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
        if (!move) throw new Error(`${name(st.shot)} has no camera move: set one in Scene.`);
        const pngs = await captureKeys(move);
        const form = new FormData();
        pngs.forEach((b, k) => form.set(`key${k}`, new File([b], `key${k}.jpg`, { type: "image/jpeg" })));
        await saveKeys(id, form, "");
        await wait(id, "keyframes");
      } else if (st.kind === "take") {
        await renderTake(id, { action: plan.find((p) => p.shot === st.shot)!.action });
        await wait(id, "shot");
      } else if (st.kind === "pick") {
        await pickBest(id, st.shot);
      } else {
        const order = plan.filter((p) => p.include).map((p) => p.shot);
        await saveReel(id, { order, joins: order.slice(1).map(() => join) });
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
        await savePlan(id, { plan, join });
        await startAutopilot(id);
        // The same steps startAutopilot saved: per shot keyframes, takes, the pick; then the reel.
        const list: AutopilotStep[] = plan
          .filter((p) => p.include)
          .flatMap((p): AutopilotStep[] => [
            { shot: p.shot, kind: "keys", status: "todo" },
            ...Array.from({ length: p.takes }, (_, n): AutopilotStep => ({ shot: p.shot, kind: "take", n: n + 1, status: "todo" })),
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
  const label = (s: (typeof steps)[number]) => (s.kind === "export" ? "Put the reel together" : `${name(s.shot)} · ${s.kind === "keys" ? "keyframes" : s.kind === "take" ? `take ${s.n}` : "pick the best take"}`);

  return (
    <Section id="autopilot" n="1" tone="bg-tone-yellow" title="Autopilot" line="Say what happens in each shot and press Make the reel: keyframes, takes, the best take of each and the reel, one after another. Keep this page open while it runs."
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
          <div key={s.id} className={cn("grid grid-cols-[auto_minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2", !plan[i].include && "opacity-60")}>
            <input type="checkbox" checked={plan[i].include} disabled={driving || !s.move} onChange={(e) => edit(i, { include: e.target.checked })} aria-label={`Include ${s.name}`} className="accent-primary" />
            <span className="truncate text-sm" title={s.name}>
              {s.name}
            </span>
            <Input value={plan[i].action} disabled={driving} onChange={(e) => edit(i, { action: e.target.value })} placeholder="what happens: slowly turns to look toward the camera" aria-label={`What happens in ${s.name}`} />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              takes
              <select value={plan[i].takes} disabled={driving} onChange={(e) => edit(i, { takes: Number(e.target.value) })} className="rounded border bg-background px-1 py-0.5 text-xs">
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">Between shots</span>
          {JOINS.map((j) => (
            <button key={j.id} type="button" disabled={driving} aria-pressed={join === j.id} onClick={() => setJoin(j.id)} className={cn("rounded-full border px-2 py-0.5 text-[11px] transition-colors", join === j.id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground")}>
              {j.label}
            </button>
          ))}
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">~{Math.round(plan.filter((p) => p.include).reduce((t, p) => t + 2.5 + p.takes * 2, 0))} min</span>
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
      {capture && props.scene && <KeyCapture {...props.scene} poses={capture.poses} onDone={capture.done} onError={capture.fail} />}
    </Section>
  );
}
