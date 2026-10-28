"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject, type Project, type ViewId } from "@/lib/store";

const abs = (id: string, file: string) => path.join(projectDir(id), file);
const rel = (id: string, file: string) => path.relative(projectDir(id), file);
const stamp = () => Date.now().toString(36);
const done = (id: string) => revalidatePath(`/p/${id}/stage`);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

// The current image of each turnaround view.
function viewImages(p: Project) {
  const out: Partial<Record<ViewId, string>> = {};
  for (const [v, s] of Object.entries(p.turnaround?.views ?? {})) if (s?.versions[s.current]) out[v as ViewId] = s.versions[s.current].image;
  return out;
}

// Cut every turnaround view out of its grey background (02_cutout: BiRefNet, native nodes, about
// 2 s a view), so the character can stand in the set as a card that turns with the camera.
export async function cutOutCharacter(id: string) {
  const p = await load(id);
  const views = viewImages(p);
  if (!views.front) throw new Error("Make the turnaround first.");
  await startJob(id, "stage", async (ctx) => {
    const cutouts: Partial<Record<ViewId, string>> = {};
    const dir = `stage/cutouts/${stamp()}`;
    for (const [v, image] of Object.entries(views) as [ViewId, string][]) {
      await ctx.progress(`Cutting out the ${v === "threequarter" ? "three-quarter" : v} view`);
      const [file] = await runWorkflow({ onSubmit: ctx.track, workflow: "02_cutout.api.json", images: [["1", abs(id, image)]], output: "6", outDir: abs(id, `${dir}/${v}`) });
      if (!(await ctx.alive())) return;
      cutouts[v] = rel(id, file);
    }
    await updateProject(id, (q) => {
      q.stage = { height: 1.7, turn: 0, ...q.stage, source: views.front!, cutouts };
    });
  }, "Cutting out the character");
  done(id);
}

const Placement = z.object({
  at: z.tuple([z.number(), z.number(), z.number()]).refine((a) => a.every((x) => Number.isFinite(x) && Math.abs(x) < 500), "The spot is off the stage."),
  height: z.number().min(0.5).max(3),
  turn: z.number().min(-180).max(180),
});

// Where the character stands, how tall, which way they face. Saved as you place them.
export async function placeCharacter(id: string, raw: unknown) {
  const place = Placement.parse(raw);
  await updateProject(id, (q) => {
    if (!q.stage) throw new Error("Cut out the character first.");
    // A new spot is placed on today's set; a height or turn change alone keeps the set it was placed on.
    const spot = !q.stage.fill || !q.stage.at || place.at.some((x, i) => x !== q.stage!.at![i]);
    Object.assign(q.stage, place, spot ? { fill: currentFill(q)?.mesh } : {});
  });
  done(id);
}

export async function cancelStage(id: string) {
  await cancelJob(id, "stage");
  done(id);
}
