import { cancelComfyJob } from "./comfy";
import { randomUUID } from "node:crypto";
import { getProject, updateProject, type Project } from "./store";

// A job is one GPU step for one project, e.g. "concepts" or "swap". It runs in the server
// process (not awaited by the request) and records its state in project.json, so the page can
// poll it and a reload never loses it. ComfyUI queues the GPU work itself; the ComfyUI job id is
// kept so the user can cancel.

// alive(): still this run and not cancelled, checked before a result is written.
export type JobCtx = { track: (comfyJobId: string) => Promise<unknown>; alive: () => Promise<boolean> };

export async function startJob(projectId: string, key: string, work: (ctx: JobCtx) => Promise<void>, detail?: string) {
  // Each run gets its own id, so a late finish (or failure) of a cancelled run never
  // overwrites the run that replaced it under the same key.
  const run = randomUUID();
  await updateProject(projectId, (p) => {
    if (p.jobs[key]?.status === "running") throw new Error(`${key} is already running`);
    p.jobs[key] = { status: "running", startedAt: new Date().toISOString(), run, ...(detail ? { detail } : {}) };
  });
  const mine = (p: Project) => p.jobs[key]?.run === run;
  const track = (comfyId: string) => updateProject(projectId, (p) => void (mine(p) && (p.jobs[key] = { ...p.jobs[key], comfyId })));
  const alive = async () => { const p = await getProject(projectId); return !!p && mine(p) && p.jobs[key].status === "running"; };
  void work({ track, alive })
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
