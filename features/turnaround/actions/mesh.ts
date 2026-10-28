"use server";

import path from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { getProject, projectDir, updateProject, type MeshColourView, type Project } from "@/lib/store";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const done = (id: string) => revalidatePath(`/p/${id}/character`); // the turnaround lives on the Character step
const run = promisify(execFile);
const PYTHON = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "mesh_colour.py");

// The views the colour is projected from: the current front, side, back and (when painted)
// three-quarter. Front, side and back are required.
function colourViews(p: Project) {
  const views: Partial<Record<MeshColourView, string>> = {};
  for (const v of ["front", "side", "back", "threequarter"] as const) {
    const img = viewImage(p, v);
    if (img) views[v] = img;
  }
  if (!views.front || !views.side || !views.back) throw new Error("The 3D model needs the front, side and back views first.");
  return views as Required<Pick<typeof views, "front" | "side" | "back">> & typeof views;
}

// Vertex colours from the views (scripts/mesh_colour.py, about 5 s), written next to the shape.
// Each colouring gets its own file name, so a browser never shows a cached older one.
async function colour(id: string, glb: string, views: ReturnType<typeof colourViews>) {
  const out = path.join(path.dirname(abs(id, glb)), `coloured-${Date.now().toString(36)}.glb`);
  const quarter = views.threequarter ? abs(id, views.threequarter) : "-";
  await run(PYTHON, ["-I", SCRIPT, abs(id, glb), out, abs(id, views.front), abs(id, views.side), abs(id, views.back), quarter], { maxBuffer: 1 << 20 });
  return rel(id, out);
}

// The character in 3D: Hunyuan3D-2 MV turbo from the current front, side and back views (the
// graph pads each to a square and mirrors the side for the missing right view), then coloured
// from the views. About 50 s on the 4080.
export async function generateMesh(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const views = colourViews(p);
  await startJob(id, "mesh", async (ctx) => {
    const [glb] = await runWorkflow({
      workflow: "02_turnaround_mesh.api.json",
      onSubmit: ctx.track,
      set: [["3", "seed", Math.floor(Math.random() * 2 ** 31)]],
      images: [["56", abs(id, views.front)], ["85", abs(id, views.side)], ["82", abs(id, views.back)]],
      output: "67",
      ext: "glb",
      outDir: abs(id, `turnaround/mesh/${Date.now().toString(36)}`),
      timeoutMs: 20 * 60_000,
    });
    if (!glb) throw new Error("ComfyUI made no model.");
    if (!(await ctx.alive())) return;
    await ctx.progress("Colouring it from the views");
    const coloured = await colour(id, rel(id, glb), views);
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => void (q.mesh = { glb: rel(id, glb), front: views.front, at: new Date().toISOString(), coloured, colours: views }));
  }, "Building the 3D model");
  done(id);
}

// Colour the current model again from today's views, without rebuilding its shape (a view was
// fixed, or the model was made before it had colour).
export async function colourMesh(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!p.mesh) throw new Error("Generate the 3D model first.");
  const views = colourViews(p);
  const glb = p.mesh.glb;
  await startJob(id, "mesh", async (ctx) => {
    const coloured = await colour(id, glb, views);
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => {
      if (q.mesh?.glb === glb) Object.assign(q.mesh, { coloured, colours: views });
    });
  }, "Colouring the 3D model");
  done(id);
}

export async function cancelMesh(id: string) {
  await cancelJob(id, "mesh");
  done(id);
}
