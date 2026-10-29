"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ASSET_VIEWS } from "@/lib/asset-3d";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { getProject, projectDir, updateProject, type AssetView, type CharacterPose } from "@/lib/store";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (pid: string) => `pose:${pid}`;
const Pid = z.string().regex(/^[a-z0-9]{1,16}$/);
const Input = z.object({ label: z.string().trim().min(2).max(30), prompt: z.string().trim().min(3).max(200) });

const KEEP = "Same character: the same face, body, clothes, colours and art style. Full body in frame, plain light grey background, nothing else in the image.";

// The pose's views: the front from the turnaround's front (the pose is asked for there), then each
// other angle from that new front, as the turnaround does; then each view cut out for the stage
// card. About 2.5 min.
async function build(id: string, pid: string, ctx: JobCtx) {
  const p = await getProject(id);
  const pose = p?.poses?.find((x) => x.id === pid);
  const source = p && viewImage(p, "front");
  if (!pose || !source) return;
  const dir = `turnaround/poses/${pid}`;
  const set = (fn: (x: CharacterPose) => void) =>
    updateProject(id, (q) => {
      const x = q.poses?.find((y) => y.id === pid);
      if (x) fn(x);
    });
  let front: string | null = null;
  for (const v of ASSET_VIEWS) {
    await ctx.progress(`Painting ${pose.label.toLowerCase()} ${v.from}`);
    const prompt = front
      ? `Show this same character in exactly the same pose ${v.from}. Keep the pose, the arms and the legs as they are; only the angle changes. ${KEEP}`
      : `Make this character ${pose.prompt}, a clear full-body pose that reads at once. Front view, facing the viewer. ${KEEP}`;
    const [out] = await runWorkflow({
      workflow: "01_edit.api.json",
      onSubmit: ctx.track,
      set: [["17", "prompt", prompt], ["22", "seed", seed()]],
      images: [["1", front ?? abs(id, source)]],
      output: "28",
      outDir: abs(id, `${dir}/${v.id}-${Date.now().toString(36)}`),
    });
    if (!(await ctx.alive())) return;
    await set((x) => void (x.views[v.id] = rel(id, out)));
    front ??= out;
  }
  const views = (await getProject(id))?.poses?.find((x) => x.id === pid)?.views ?? {};
  for (const [v, image] of Object.entries(views) as [AssetView, string][]) {
    await ctx.progress(`Cutting out ${pose.label.toLowerCase()} (${v === "threequarter" ? "three-quarter" : v})`);
    const [file] = await runWorkflow({ onSubmit: ctx.track, workflow: "02_cutout.api.json", images: [["1", abs(id, image)]], output: "6", outDir: abs(id, `${dir}/cutouts/${v}`) });
    if (!(await ctx.alive())) return;
    await set((x) => void (x.cutouts[v] = rel(id, file)));
  }
}

// A new pose of the character, made right away from the turnaround.
export async function makePose(id: string, raw: unknown) {
  const { label, prompt } = Input.parse(raw);
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!viewImage(p, "front")) throw new Error("Make the turnaround first: poses are painted from its front.");
  if ((p.poses?.length ?? 0) >= 8) throw new Error("Up to 8 poses.");
  const pid = Date.now().toString(36);
  await updateProject(id, (q) => void (q.poses = [...(q.poses ?? []), { id: pid, label, prompt, views: {}, cutouts: {} }]));
  await startJob(id, jobKey(pid), (ctx) => build(id, pid, ctx), `Painting ${label.toLowerCase()}`);
  done(id);
}

// Paint it again from the start (a failed or poor pose).
export async function remakePose(id: string, rawPid: string) {
  const pid = Pid.parse(rawPid);
  const pose = (await getProject(id))?.poses?.find((x) => x.id === pid);
  if (!pose) throw new Error("No such pose.");
  await updateProject(id, (q) => {
    const x = q.poses?.find((y) => y.id === pid);
    if (x) Object.assign(x, { views: {}, cutouts: {} });
  });
  await startJob(id, jobKey(pid), (ctx) => build(id, pid, ctx), `Painting ${pose.label.toLowerCase()}`);
  done(id);
}

// Off the list (files stay). A shot that used it goes back to the character as designed.
export async function deletePose(id: string, rawPid: string) {
  const pid = Pid.parse(rawPid);
  await updateProject(id, (q) => {
    if (q.jobs[jobKey(pid)]?.status === "running") throw new Error("It is still being painted; stop that first.");
    q.poses = (q.poses ?? []).filter((x) => x.id !== pid);
  });
  done(id);
}

export async function cancelPose(id: string, rawPid: string) {
  await cancelJob(id, jobKey(Pid.parse(rawPid)));
  done(id);
}
