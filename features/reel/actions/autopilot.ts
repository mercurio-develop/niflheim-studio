"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { allShots, getProject, updateProject, type AutopilotStep } from "@/lib/store";
import { bestTake } from "../best";

const done = (id: string) => revalidatePath(`/p/${id}/export`);
const ShotId = z.string().regex(/^s\d{1,3}$/);
const Plan = z.object({
  plan: z.array(z.object({ shot: ShotId, include: z.boolean(), action: z.string().trim().max(500), takes: z.number().int().min(1).max(4) })).max(20),
  join: z.enum(["cut", "fade", "dip"]),
});

export async function savePlan(id: string, raw: unknown) {
  const { plan, join } = Plan.parse(raw);
  await updateProject(id, (q) => void (q.autopilot = { steps: [], state: "idle", at: new Date().toISOString(), ...q.autopilot, plan, join }));
}

// The steps for the saved plan: per included shot keyframes, its takes and the pick; then the reel.
export async function startAutopilot(id: string) {
  await updateProject(id, (q) => {
    const a = q.autopilot;
    const shots = a?.plan.filter((s) => s.include) ?? [];
    if (!shots.length) throw new Error("Include at least one shot.");
    const empty = shots.find((s) => s.action.trim().length < 3);
    if (empty) throw new Error(`Say what happens in ${q.shots?.find((s) => s.id === empty.shot)?.name ?? "every shot"}.`);
    const steps: AutopilotStep[] = [];
    for (const s of shots) {
      steps.push({ shot: s.shot, kind: "keys", status: "todo" });
      for (let n = 1; n <= s.takes; n++) steps.push({ shot: s.shot, kind: "take", n, status: "todo" });
      steps.push({ shot: s.shot, kind: "pick", status: "todo" });
    }
    steps.push({ shot: "", kind: "export", status: "todo" });
    q.autopilot = { ...a!, steps, state: "running", at: new Date().toISOString() };
  });
  done(id);
}

const Mark = z.object({ step: z.number().int().min(0), status: z.enum(["todo", "running", "done", "error"]), error: z.string().max(500).optional() });

// The page reports each step as it runs it; the last done step finishes the run, an error stops it.
export async function markStep(id: string, raw: unknown) {
  const m = Mark.parse(raw);
  await updateProject(id, (q) => {
    const a = q.autopilot;
    if (!a?.steps[m.step]) throw new Error("No such step.");
    a.steps[m.step] = { ...a.steps[m.step], status: m.status, error: m.error };
    if (m.status === "error") a.state = "error";
    else if (a.steps.every((s) => s.status === "done")) a.state = "done";
    else a.state = "running";
  });
  done(id);
}

export async function stopAutopilot(id: string) {
  await updateProject(id, (q) => {
    if (q.autopilot) q.autopilot.state = "stopped";
  });
  done(id);
}

// Where a job stands, for the page to wait on.
export async function jobState(id: string, rawKey: unknown) {
  const key = z.enum(["keyframes", "shot", "reel", "stage"]).parse(rawKey);
  const p = await getProject(id);
  const j = p?.jobs[key];
  return { status: j?.status ?? "none", error: j?.error, startedAt: j?.startedAt };
}

// Keep the best take of a shot (it must be the active one): see ../best.ts for the rule.
export async function pickBest(id: string, rawShot: unknown) {
  const shot = ShotId.parse(rawShot);
  await updateProject(id, (q) => {
    if (q.activeShot !== shot) throw new Error("Select the shot first.");
    const takes = q.shot?.takes ?? [];
    if (!takes.length) throw new Error("The shot has no takes.");
    const moving = q.camera?.move !== "static";
    q.shot!.picked = bestTake(takes, moving) ?? undefined;
  });
  done(id);
}

// For the page: every shot's camera move and whether it has keys/takes, to build its captures.
export async function shotMoves(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return allShots(p).map((s) => ({ id: s.id, camera: s.camera ?? null }));
}
