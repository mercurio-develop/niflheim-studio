import { updateProject } from "./store";

// A job is one GPU step for one project, e.g. "concepts" or "swap". It runs in the server
// process (not awaited by the request) and records its state in project.json, so the page can
// poll it and a reload never loses it. ComfyUI queues the GPU work itself.

export async function startJob(projectId: string, key: string, work: () => Promise<void>) {
  await updateProject(projectId, (p) => {
    if (p.jobs[key]?.status === "running") throw new Error(`${key} is already running`);
    p.jobs[key] = { status: "running", startedAt: new Date().toISOString() };
  });
  void work()
    .then(() => updateProject(projectId, (p) => void (p.jobs[key] = { ...p.jobs[key], status: "done" })))
    .catch((err: unknown) =>
      updateProject(projectId, (p) => {
        p.jobs[key] = { ...p.jobs[key], status: "error", error: err instanceof Error ? err.message : String(err) };
      }),
    );
}
