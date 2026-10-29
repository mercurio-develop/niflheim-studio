"use server";

import { revalidatePath } from "next/cache";
import { colourMesh as colour, meshFromViews, type ColourViews } from "@/lib/asset-3d";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { getProject, updateProject, type MeshColourView, type Project } from "@/lib/store";

const done = (id: string) => revalidatePath(`/p/${id}/character`); // the turnaround lives on the Character step

// The views the colour is projected from: the current front, side, back and (when painted)
// three-quarter. Front, side and back are required.
function colourViews(p: Project) {
  const views: Partial<Record<MeshColourView, string>> = {};
  for (const v of ["front", "side", "back", "threequarter"] as const) {
    const img = viewImage(p, v);
    if (img) views[v] = img;
  }
  if (!views.front || !views.side || !views.back) throw new Error("The 3D model needs the front, side and back views first.");
  return views as ColourViews;
}

// The character in 3D: Hunyuan3D-2 MV turbo from the current front, side and back views (the
// graph pads each to a square and mirrors the side for the missing right view), then coloured
// from the views. About 50 s on the 4080.
export async function generateMesh(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const views = colourViews(p);
  await startJob(id, "mesh", async (ctx) => {
    const made = await meshFromViews(id, views, "turnaround/mesh", ctx);
    if (!made || !(await ctx.alive())) return;
    await updateProject(id, (q) => void (q.mesh = { glb: made.glb, front: views.front, at: new Date().toISOString(), coloured: made.coloured, colours: views }));
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
