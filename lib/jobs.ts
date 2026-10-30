import { cancelComfyJob } from "./comfy";
import { randomUUID } from "node:crypto";
import { getProject, updateProject, type Project } from "./store";

// A job is one GPU step for one project, e.g. "concepts" or "swap". It runs in the server
// process (not awaited by the request) and records its state in project.json, so the page can
// poll it and a reload never loses it. ComfyUI queues the GPU work itself; the ComfyUI job id is
// kept so the user can cancel.

// alive(): still this run and not cancelled, checked before a result is written.
// progress(): update the line the UI shows while a multi-step job runs ("Making the side view (3/6)").
export type JobCtx = { track: (comfyJobId: string) => Promise<unknown>; alive: () => Promise<boolean>; progress: (detail: string) => Promise<unknown> };

// Jobs that change the same thing never run at once: building the set moves the floor the
// character is cut out to stand on, so set and stage share one scene lock.
const SHARED: Record<string, { keys: string[]; busy: string }> = {
  set: { keys: ["stage"], busy: "The character is being cut out; wait for it or cancel it first." },
  stage: { keys: ["set"], busy: "The set is being built; wait for it or cancel it first." },
};

// beside: jobs this one may start next to because it waits for them before it uses the GPU (a
// take waiting on the keyframes it is shot from).
export async function startJob(projectId: string, key: string, work: (ctx: JobCtx) => Promise<void>, detail?: string, beside: string[] = []) {
  // Each run gets its own id, so a late finish (or failure) of a cancelled run never
  // overwrites the run that replaced it under the same key.
  const run = randomUUID();
  await updateProject(projectId, (p) => {
    if (p.jobs[key]?.status === "running") throw new Error(`${key} is already running`);
    const shared = SHARED[key];
    if (shared?.keys.some((k) => p.jobs[k]?.status === "running")) throw new Error(shared.busy);
    // One GPU job at a time: a second Generate used to start while the first was still on Comfy.
    const other = Object.entries(p.jobs).find(([k, j]) => k !== key && !beside.includes(k) && j.status === "running");
    if (other) throw new Error("A generation is already running; wait for it or cancel it first.");
    p.jobs[key] = { status: "running", startedAt: new Date().toISOString(), run, ...(detail ? { detail } : {}) };
  });
  const mine = (p: Project) => p.jobs[key]?.run === run;
  const track = (comfyId: string) => updateProject(projectId, (p) => void (mine(p) && (p.jobs[key] = { ...p.jobs[key], comfyId })));
  const progress = (detail: string) => updateProject(projectId, (p) => void (mine(p) && (p.jobs[key] = { ...p.jobs[key], detail })));
  const alive = async () => { const p = await getProject(projectId); return !!p && mine(p) && p.jobs[key].status === "running"; };
  void work({ track, alive, progress })
    .then(() =>
      updateProject(projectId, (p) => {
        if (mine(p) && p.jobs[key].status === "running") p.jobs[key] = { ...p.jobs[key], status: "done" };
      }),
    )
    .catch((err: unknown) =>
      updateProject(projectId, (p) => {
        if (!mine(p) || p.jobs[key].status !== "running") return; // cancelled or replaced: leave it
        p.jobs[key] = { ...p.jobs[key], status: "error", error: err instanceof Error ? err.message : String(err) };
      }),
    );
}

export async function cancelJob(projectId: string, key: string) {
  const p = await getProject(projectId);
  const job = p?.jobs[key];
  if (!job || job.status !== "running") return;
  await updateProject(projectId, (q) => void (q.jobs[key] = { ...q.jobs[key], status: "cancelled" }));
  if (job.comfyId) await cancelComfyJob(job.comfyId).catch(() => {});
}
