"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { frameCount } from "@/lib/camera";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { DEFAULT_NEGATIVE, middleImageNode, shapeShot } from "../graph";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const done = (id: string) => revalidatePath(`/p/${id}/shot`);


const MOVE_WORDS: Record<string, string> = {
  static: "The camera holds still on",
  push: "The camera pushes in slowly toward",
  pull: "The camera pulls back slowly from",
  arc: "The camera arcs slowly around",
  crane: "The camera cranes slowly while looking at",
  track: "The camera tracks sideways, keeping in frame",
};

// LTX reads one paragraph: the take is continuous, how the camera moves and onto whom, what they
// do, where, and the look (04_shot proof 2: "one continuous take" kept the move from cutting).
function shotPrompt(p: Project, action: string) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  return `One continuous take with no cuts. ${MOVE_WORDS[p.camera?.move ?? "static"]} ${p.character.prompt}, who ${action}. ${p.set?.prompt ?? ""}. ${style}, consistent art style.`;
}

const Input = z.object({ action: z.string().trim().min(3, "Say what happens in a few words.").max(500), negative: z.string().trim().max(500) });

// One take: LTX-2.5 distilled guided by every keyframe (ends 0.7, middle 0.5), with audio. About
// 1.5 to 2 minutes on the 4080 for 97 to 121 frames.
export async function renderTake(id: string, raw: unknown) {
  const { action, negative } = Input.parse(raw);
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const k = p.keyframes;
  if (!p.camera || !k?.keys.length || !k.keys.every(Boolean)) throw new Error("Make the keyframes in the Scene step first.");
  const length = frameCount(p.camera.seconds);
  if (k.frames.at(-1) !== length - 1) throw new Error("The camera move changed since the keyframes were made: make them again.");
  const keys = k.keys as string[];
  const seed = Math.floor(Math.random() * 2 ** 31);
  await updateProject(id, (q) => void (q.shot = { takes: [], ...q.shot, action, negative }));
  await startJob(id, "shot", async (ctx) => {
    const [video] = await runWorkflow({
      workflow: "03_shot.api.json",
      onSubmit: ctx.track,
      edit: (g) => shapeShot(g, k.frames, length),
      set: [["20", "text", shotPrompt(p, action)], ["21", "text", negative || DEFAULT_NEGATIVE], ["40", "noise_seed", seed]],
      images: [["1", abs(id, keys[0])], ["2", abs(id, keys.at(-1)!)], ...keys.slice(1, -1).map((f, i) => [middleImageNode(i), abs(id, f)] as [string, string])],
      output: "55",
      ext: "mp4",
      outDir: abs(id, `shot/takes/${Date.now().toString(36)}`),
      timeoutMs: 20 * 60_000,
    });
    if (!video) throw new Error("LTX made no video.");
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => {
      const take = { video: path.relative(projectDir(id), video), action, seed, frames: length, keys: k.at, seconds: p.camera!.seconds, at: new Date().toISOString() };
      q.shot = { action, negative, ...q.shot, takes: [...(q.shot?.takes ?? []), take] };
    });
  }, "Shooting the take");
  done(id);
}

export async function pickTake(id: string, raw: unknown) {
  const i = z.number().int().min(0).parse(raw);
  await updateProject(id, (q) => {
    if (!q.shot?.takes[i]) throw new Error("No such take.");
    q.shot.picked = i;
  });
  done(id);
}

export async function cancelShot(id: string) {
  await cancelJob(id, "shot");
  done(id);
}
