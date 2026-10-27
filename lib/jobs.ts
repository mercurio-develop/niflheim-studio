import { cancelComfyJob } from "./comfy";
import { getProject, updateProject } from "./store";

// A job is one GPU step for one project, e.g. "concepts" or "swap". It runs in the server
// process (not awaited by the request) and records its state in project.json, so the page can
// poll it and a reload never loses it. ComfyUI queues the GPU work itself; the ComfyUI job id is
// kept so the user can cancel.

export type JobCtx = { track: (comfyJobId: string) => Promise<unknown> };

export async function startJob(projectId: string, key: string, work: (ctx: JobCtx) => Promise<void>) {
  await updateProject(projectId, (p) => {
    if (p.jobs[key]?.status === "running") throw new Error(`${key} is already running`);
    p.jobs[key] = { status: "running", startedAt: new Date().toISOString() };
  });
  const track = (comfyId: string) => updateProject(projectId, (p) => void (p.jobs[key] = { ...p.jobs[key], comfyId }));
  void work({ track })
    .then(() =>
      updateProject(projectId, (p) => {
        if (p.jobs[key]?.status === "running") p.jobs[key] = { ...p.jobs[key], status: "done" };
      }),
    )
    .catch((err: unknown) =>
      updateProject(projectId, (p) => {
        if (p.jobs[key]?.status !== "running") return; // cancelled: keep it that way
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
