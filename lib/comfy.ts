import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Comfy } from "@comfyorg/sdk";

// All ComfyUI traffic goes through here (Comfy SDK -> COMFY_BASE_URL). Server only.

const WORKFLOWS = path.join(/* turbopackIgnore: true */ process.cwd(), "workflows");

let client: Comfy | null = null;
function comfy(): Comfy {
  client ??= new Comfy(process.env.COMFY_API_KEY ? { apiKey: process.env.COMFY_API_KEY } : {});
  return client;
}

export type RunSpec = {
  workflow: string; // file name in workflows/, e.g. "01_concept.api.json"
  set?: [node: string, field: string, value: unknown][];
  images?: [node: string, filePath: string][]; // LoadImage nodes
  output: string; // node id whose outputs we keep
  outDir: string; // absolute folder for downloaded files
  ext?: string; // file extension for outputs (default png)
  timeoutMs?: number;
  onSubmit?: (comfyJobId: string) => unknown; // so the job can be cancelled while it runs
};

export async function runWorkflow(spec: RunSpec): Promise<string[]> {
  const c = comfy();
  const graph = JSON.parse(await readFile(path.join(/* turbopackIgnore: true */ WORKFLOWS, spec.workflow), "utf8"));
  const wf = c.workflows.fromJson(graph);
  for (const [node, field, value] of spec.set ?? []) wf.setInput(node, field, value);
  for (const [node, file] of spec.images ?? []) wf.setInput(node, "image", c.assets.fromFile(file));

  const job = await c.submit(wf);
  await spec.onSubmit?.(job.id);
  await job.wait(spec.timeoutMs ?? 15 * 60_000);
  if (job.status !== "succeeded") throw new Error(job.status === "canceled" ? "cancelled" : `ComfyUI job ${job.status}`);
  await mkdir(spec.outDir, { recursive: true });
  const files: string[] = [];
  for (const [i, out] of job.getOutputs(spec.output).entries()) {
    const file = path.join(/* turbopackIgnore: true */ spec.outDir, `${String(i).padStart(2, "0")}.${spec.ext ?? "png"}`);
    await out.toFile(file);
    files.push(file);
  }
  return files;
}

export async function cancelComfyJob(comfyJobId: string) {
  const job = await comfy().jobs.get(comfyJobId);
  await job.cancel();
}

// Is the Comfy API v2 surface answering? For the status badge; never throws.
export async function comfyHealth(): Promise<boolean> {
  const base = process.env.COMFY_BASE_URL ?? "http://127.0.0.1:8189";
  try {
    const res = await fetch(`${base}/api/v2/health`, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
