"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { getProject, projectDir, updateProject } from "@/lib/store";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const done = (id: string) => revalidatePath(`/p/${id}/turnaround`);

// The character in 3D: Hunyuan3D-2 MV turbo from the current front, side and back views. The
// turnaround has no right view, so the graph mirrors the side for it. About 45 s on the 4080.
export async function generateMesh(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const front = viewImage(p, "front");
  const side = viewImage(p, "side");
  const back = viewImage(p, "back");
  if (!front || !side || !back) throw new Error("The 3D model needs the front, side and back views first.");
  await startJob(id, "mesh", async (ctx) => {
    const [glb] = await runWorkflow({
      workflow: "02_turnaround_mesh.api.json",
      onSubmit: ctx.track,
      set: [["3", "seed", Math.floor(Math.random() * 2 ** 31)]],
      images: [["56", abs(id, front)], ["85", abs(id, side)], ["82", abs(id, back)]],
      output: "67",
      ext: "glb",
      outDir: abs(id, `turnaround/mesh/${Date.now().toString(36)}`),
      timeoutMs: 20 * 60_000,
    });
    if (!glb) throw new Error("ComfyUI made no model.");
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => void (q.mesh = { glb: rel(id, glb), front, at: new Date().toISOString() }));
  }, "Building the 3D model");
  done(id);
}

export async function cancelMesh(id: string) {
  await cancelJob(id, "mesh");
  done(id);
}
