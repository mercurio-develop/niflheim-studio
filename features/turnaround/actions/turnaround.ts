"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { characterImage, VIEWS } from "@/lib/progress";
import { getProject, projectDir, updateProject } from "@/lib/store";

const View = z.enum(["threequarter", "side", "back"]);
const done = (id: string) => revalidatePath(`/p/${id}/turnaround`);

// One job per view, so each can be regenerated or cancelled on its own. ComfyUI queues them.
export async function generateView(id: string, rawView: string) {
  const view = View.parse(rawView);
  const p = await getProject(id);
  const source = p && characterImage(p);
  if (!source) throw new Error("Finish the character first.");
  const spec = VIEWS.find((v) => v.id === view)!;
  await startJob(id, `view:${view}`, async ({ track }) => {
    const [image] = await runWorkflow({
      workflow: "01_angle.api.json",
      onSubmit: track,
      set: [["17", "prompt", spec.prompt], ["22", "seed", Math.floor(Math.random() * 2 ** 31)], ["9", "strength_model", 0]],
      images: [["1", path.join(projectDir(id), source)]],
      output: "28",
      outDir: path.join(projectDir(id), "turnaround", `${view}-${Date.now().toString(36)}`),
    });
    await updateProject(id, (q) => {
      // Views made from a different character are thrown away: the turnaround is one character.
      if (q.turnaround?.source !== source) q.turnaround = { source, views: {} };
      q.turnaround.views[view] = path.relative(projectDir(id), image);
    });
  });
  done(id);
}

export async function generateMissingViews(id: string) {
  const p = await getProject(id);
  if (!p) return;
  const source = characterImage(p);
  const fresh = p.turnaround?.source === source;
  for (const v of VIEWS) {
    if (fresh && p.turnaround!.views[v.id]) continue;
    if (p.jobs[`view:${v.id}`]?.status === "running") continue;
    await generateView(id, v.id);
  }
}

export async function cancelView(id: string, rawView: string) {
  await cancelJob(id, `view:${View.parse(rawView)}`);
  done(id);
}
