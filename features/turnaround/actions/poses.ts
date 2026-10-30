"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ASSET_VIEWS } from "@/lib/asset-3d";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { CID, charDir, charKey, charOf, getProject, projectDir, updateProject, type AssetView, type CharacterPose } from "@/lib/store";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (pid: string, cid = "c1") => charKey(cid, `pose:${pid}`);
const Cid = z.string().regex(CID).optional(); // which character: c1 unless another is named
const Pid = z.string().regex(/^[a-z0-9]{1,16}$/);
const Input = z.object({ label: z.string().trim().min(2).max(30), prompt: z.string().trim().min(3).max(200) });

const KEEP = "Same character: the same face, body, clothes, colours and art style. Full body from head to feet in frame, not cropped, plain light grey background, nothing else in the image.";
const View = z.enum(["front", "threequarter", "side", "back"]);
const LABELS: Record<AssetView, string> = { front: "front", threequarter: "three-quarter", side: "side", back: "back" };

const setPose = (id: string, cid: string, pid: string, fn: (x: CharacterPose) => void) =>
  updateProject(id, (q) => {
    const x = charOf(q, cid).poses?.find((y) => y.id === pid);
    if (x) fn(x);
  });

async function paintPoseView(id: string, pid: string, view: AssetView, ctx: JobCtx, cid: string) {
  const p = await getProject(id);
  const pose = p && charOf(p, cid).poses?.find((x) => x.id === pid);
  if (!pose) return;
  const spec = ASSET_VIEWS.find((v) => v.id === view)!;
  const from = view === "front" ? viewImage(p, "front", cid) : pose.views.front;
  if (!from) return;
  const dir = charDir(cid, `turnaround/poses/${pid}`);
  await ctx.progress(`Painting ${pose.label.toLowerCase()} ${spec.from}`);
  const prompt =
    view === "front"
      ? `Make this character ${pose.prompt}, a clear full-body pose that reads at once. The whole figure from head to feet stays in frame. Front view, facing the viewer. ${KEEP}`
      : `Show this same character in exactly the same pose ${spec.from}. Keep the pose, the arms and the legs as they are; only the angle changes. ${KEEP}`;
  const [out] = await runWorkflow({
    workflow: "01_edit.api.json",
    onSubmit: ctx.track,
    set: [["17", "prompt", prompt], ["22", "seed", seed()]],
    images: [["1", abs(id, from)]],
    output: "28",
    outDir: abs(id, `${dir}/${view}-${Date.now().toString(36)}`),
  });
  if (!(await ctx.alive())) return;
  await setPose(id, cid, pid, (x) => {
    x.views[view] = rel(id, out);
    delete x.cutouts[view];
  });
  await ctx.progress(`Cutting out ${pose.label.toLowerCase()} (${LABELS[view]})`);
  const [file] = await runWorkflow({ onSubmit: ctx.track, workflow: "02_cutout.api.json", images: [["1", out]], output: "6", outDir: abs(id, `${dir}/cutouts/${view}`) });
  if (!(await ctx.alive())) return;
  await setPose(id, cid, pid, (x) => void (x.cutouts[view] = rel(id, file)));
}

// The pose's views: the front from the turnaround's front, then each other angle from that front,
// then each view cut out for the stage card. About 2.5 min.
async function build(id: string, pid: string, ctx: JobCtx, cid = "c1") {
  for (const v of ASSET_VIEWS) {
    await paintPoseView(id, pid, v.id, ctx, cid);
    if (!(await ctx.alive())) return;
  }
}

// A new pose of the character, made right away from the turnaround.
export async function makePose(id: string, raw: unknown, rawCid?: unknown) {
  const { label, prompt } = Input.parse(raw);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!viewImage(p, "front", cid)) throw new Error("Make the turnaround first: poses are painted from its front.");
  if ((charOf(p, cid).poses?.length ?? 0) >= 8) throw new Error("Up to 8 poses.");
  const pid = Date.now().toString(36);
  await updateProject(id, (q) => {
    const c = charOf(q, cid);
    c.poses = [...(c.poses ?? []), { id: pid, label, prompt, views: {}, cutouts: {} }];
  });
  await startJob(id, jobKey(pid, cid), (ctx) => build(id, pid, ctx, cid), `Painting ${label.toLowerCase()}`);
  done(id);
}

// Paint it again from the start (a failed or poor pose).
export async function remakePose(id: string, rawPid: string, rawCid?: unknown) {
  const pid = Pid.parse(rawPid);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const pose = p && charOf(p, cid).poses?.find((x) => x.id === pid);
  if (!pose) throw new Error("No such pose.");
  await updateProject(id, (q) => {
    const x = charOf(q, cid).poses?.find((y) => y.id === pid);
    if (x) Object.assign(x, { views: {}, cutouts: {} });
  });
  await startJob(id, jobKey(pid, cid), (ctx) => build(id, pid, ctx, cid), `Painting ${pose.label.toLowerCase()}`);
  done(id);
}

// Off the list (files stay). A shot that used it goes back to the character as designed.
export async function deletePose(id: string, rawPid: string, rawCid?: unknown) {
  const pid = Pid.parse(rawPid);
  const cid = Cid.parse(rawCid) ?? "c1";
  await updateProject(id, (q) => {
    const prefix = jobKey(pid, cid);
    if (Object.entries(q.jobs).some(([k, j]) => j.status === "running" && (k === prefix || k.startsWith(`${prefix}:`)))) throw new Error("It is still being painted; stop that first.");
    const c = charOf(q, cid);
    c.poses = (c.poses ?? []).filter((x) => x.id !== pid);
  });
  done(id);
}

export async function cancelPose(id: string, rawPid: string, rawCid?: unknown, rawView?: unknown) {
  const pid = Pid.parse(rawPid);
  const cid = Cid.parse(rawCid) ?? "c1";
  const view = rawView === undefined || rawView === null || rawView === "" ? undefined : View.parse(rawView);
  await cancelJob(id, view ? charKey(cid, `pose:${pid}:${view}`) : jobKey(pid, cid));
  done(id);
}

// One view of a pose again: the front from the turnaround, any other view from that pose's front.
export async function remakePoseView(id: string, rawPid: string, rawView: string, rawCid?: unknown) {
  const pid = Pid.parse(rawPid);
  const view = View.parse(rawView);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const pose = p && charOf(p, cid).poses?.find((x) => x.id === pid);
  if (!pose) throw new Error("No such pose.");
  if (view !== "front" && !pose.views.front) throw new Error("Paint the front of this pose first.");
  if (view === "front" && !viewImage(p, "front", cid)) throw new Error("Generate the turnaround first.");
  await startJob(id, charKey(cid, `pose:${pid}:${view}`), (ctx) => paintPoseView(id, pid, view, ctx, cid), `Painting ${pose.label.toLowerCase()} ${LABELS[view]}`);
  done(id);
}
