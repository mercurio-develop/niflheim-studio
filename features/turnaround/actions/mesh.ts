"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { colourMesh as colour, meshFromViews, type ColourViews } from "@/lib/asset-3d";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { CID, charDir, charKey, charOf, getProject, updateProject, type MeshColourView, type Project } from "@/lib/store";

const done = (id: string) => revalidatePath(`/p/${id}/character`); // the turnaround lives on the Character step
const Cid = z.string().regex(CID).optional(); // which character: c1 unless another is named

// The views the colour is projected from: the current front, side, back and (when painted)
// three-quarter. Front, side and back are required.
function colourViews(p: Project, cid = "c1") {
  const views: Partial<Record<MeshColourView, string>> = {};
  for (const v of ["front", "side", "back", "threequarter"] as const) {
    const img = viewImage(p, v, cid);
    if (img) views[v] = img;
  }
  if (!views.front || !views.side || !views.back) throw new Error("The 3D model needs the front, side and back views first.");
  return views as ColourViews;
}

// The character in 3D: each view padded to a square, Hunyuan3D-2 MV turbo from front, side, back
// and the side mirrored as right, then coloured from the views. About 50 s on the 4080. Optional:
// Next does not wait for it.
export async function generateMesh(id: string, rawCid?: unknown) {
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const views = colourViews(p, cid);
  await startJob(id, charKey(cid, "mesh"), async (ctx) => {
    const made = await meshFromViews(id, views, charDir(cid, "turnaround/mesh"), ctx);
    if (!made || !(await ctx.alive())) return;
    await updateProject(id, (q) => void (charOf(q, cid).mesh = { glb: made.glb, front: views.front, at: new Date().toISOString(), coloured: made.coloured, colours: views }));
  }, "Building the 3D model");
  done(id);
}

// Colour the current model again from today's views, without rebuilding its shape (a view was
// fixed, or the model was made before it had colour).
export async function colourMesh(id: string, rawCid?: unknown) {
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const mesh = charOf(p, cid).mesh;
  if (!mesh) throw new Error("Generate the 3D model first.");
  const views = colourViews(p, cid);
  const glb = mesh.glb;
  await startJob(id, charKey(cid, "mesh"), async (ctx) => {
    const coloured = await colour(id, glb, views);
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => {
      const m = charOf(q, cid).mesh;
      if (m?.glb === glb) Object.assign(m, { coloured, colours: views });
    });
  }, "Colouring the 3D model");
  done(id);
}

export async function cancelMesh(id: string, rawCid?: unknown) {
  await cancelJob(id, charKey(Cid.parse(rawCid) ?? "c1", "mesh"));
  done(id);
}
