import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Comfy } from "@comfyorg/sdk";

// All ComfyUI traffic goes through here (Comfy SDK -> COMFY_BASE_URL). Server only.
// A blank COMFY_BASE_URL means Comfy Cloud (the SDK's own rule), with COMFY_API_KEY as the key.

const WORKFLOWS = path.join(/* turbopackIgnore: true */ process.cwd(), "workflows");

let client: Comfy | null = null;
function comfy(): Comfy {
  client ??= new Comfy(process.env.COMFY_API_KEY ? { apiKey: process.env.COMFY_API_KEY } : {});
  return client;
}

const CLOUD = "https://cloud.comfy.org";
function comfyBase(): string {
  return process.env.COMFY_BASE_URL?.trim().replace(/\/+$/, "") || CLOUD;
}
export function onCloud(): boolean {
  return comfyBase() === CLOUD;
}
function auth(): Record<string, string> {
  return process.env.COMFY_API_KEY ? { Authorization: `Bearer ${process.env.COMFY_API_KEY}` } : {};
}

export type RunSpec = {
  workflow: string; // file name in workflows/, e.g. "01_concept.api.json"
  set?: [node: string, field: string, value: unknown][];
  images?: [node: string, filePath: string][]; // LoadImage nodes
  videos?: [node: string, filePath: string][]; // LoadVideo nodes (input "file")
  output: string; // node id whose outputs we keep
  outDir: string; // absolute folder for downloaded files
  ext?: string; // file extension for outputs (default png)
  timeoutMs?: number;
  onSubmit?: (comfyJobId: string) => unknown; // so the job can be cancelled while it runs
  edit?: (graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => void; // reshape the graph before it is sent (e.g. one guide per keyframe)
};

export async function runWorkflow(spec: RunSpec): Promise<string[]> {
  const c = comfy();
  const graph = JSON.parse(await readFile(path.join(/* turbopackIgnore: true */ WORKFLOWS, spec.workflow), "utf8"));
  spec.edit?.(graph);
  const wf = c.workflows.fromJson(graph);
  for (const [node, field, value] of spec.set ?? []) wf.setInput(node, field, value);
  for (const [node, file] of spec.images ?? []) wf.setInput(node, "image", c.assets.fromFile(file));
  for (const [node, file] of spec.videos ?? []) wf.setInput(node, "file", c.assets.fromFile(file));

  const job = await c.submit(wf).catch((e: unknown) => {
    throw unreachable(e) ?? e;
  });
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
  if (!files.length) files.push(...(await fromHistory(job.id, spec)));
  return files;
}

// SaveGLB writes under a "3d" key, which the SDK's outputs leave out. ComfyUI's own history
// has it (the proxy's job id is ComfyUI's prompt id), so those files are fetched from there.
// On Comfy Cloud the same history and files sit behind /api/history_v2 and /api/view.
async function fromHistory(jobId: string, spec: RunSpec): Promise<string[]> {
  const cloud = onCloud();
  const base = cloud ? `${CLOUD}/api` : (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188");
  const res = await fetch(`${base}/${cloud ? "history_v2" : "history"}/${jobId}`, { headers: auth(), cache: "no-store" });
  if (!res.ok) throw new Error(`ComfyUI history ${jobId}: ${res.status}`);
  const history = await res.json();
  const entry = history[jobId] ?? history;
  const outputs: Record<string, { filename: string; subfolder: string; type: string }[]> = entry?.outputs?.[spec.output] ?? {};
  const files: string[] = [];
  for (const item of Object.values(outputs).flat()) {
    if (!item?.filename) continue;
    const res = await fetch(`${base}/view?${new URLSearchParams({ filename: item.filename, subfolder: item.subfolder, type: item.type })}`, { headers: auth() });
    if (!res.ok) throw new Error(`ComfyUI output ${item.filename}: ${res.status}`);
    const file = path.join(/* turbopackIgnore: true */ spec.outDir, `${String(files.length).padStart(2, "0")}.${spec.ext ?? "png"}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    files.push(file);
  }
  return files;
}

export async function cancelComfyJob(comfyJobId: string) {
  const job = await comfy().jobs.get(comfyJobId);
  await job.cancel();
}

// A refused or dropped connection says only "fetch failed": say what is down and how to start it.
const OFFLINE = "Can't reach ComfyUI: start the Comfy proxy (mw serve start comfy-proxy) and ComfyUI, then try again.";
function unreachable(e: unknown): Error | null {
  const err = e as { message?: string; cause?: { code?: string } };
  const down = err?.message === "fetch failed" || ["ECONNREFUSED", "ECONNRESET", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(err?.cause?.code ?? "");
  return down ? new Error(onCloud() ? "Can't reach Comfy Cloud: check the network, then try again." : OFFLINE) : null;
}

// Is the Comfy API v2 surface answering (and taking our key)? For the status badge; never throws.
export async function comfyHealth(): Promise<boolean> {
  try {
    // Cloud has no /api/v2/health; /api/user answers 200 only for a good key.
    const url = onCloud() ? `${CLOUD}/api/user` : `${comfyBase()}/api/v2/health`;
    const res = await fetch(url, { headers: auth(), signal: AbortSignal.timeout(onCloud() ? 4000 : 1500), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
