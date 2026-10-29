"use server";

import path from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { focusPhrase, frameCount } from "@/lib/camera";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { getProject, projectDir, updateProject, type Project, type TakeScore } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { DEFAULT_NEGATIVE, middleImageNode, shapeShot } from "../graph";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const run = promisify(execFile);
const PYTHON = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const SCORE = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "score_take.py");

// How a take moves and whether things pop in (scripts/score_take.py, a few seconds); a take that
// cannot be scored is kept without one.
async function scoreTake(file: string): Promise<TakeScore | undefined> {
  try {
    const { stdout } = await run(PYTHON, ["-I", SCORE, file], { maxBuffer: 1 << 20 });
    const s = JSON.parse(stdout) as { camera_travel_px: number; popin_frames: number; popin_max: number };
    return { travel: s.camera_travel_px, popins: s.popin_frames, worst: s.popin_max };
  } catch {
    return undefined;
  }
}
const done = (id: string) => revalidatePath(`/p/${id}/shot`);


const MOVE_WORDS: Record<string, string> = {
  static: "The camera holds still on",
  push: "The camera pushes in slowly toward",
  pull: "The camera pulls back slowly from",
  arc: "The camera arcs slowly around",
  crane: "The camera cranes slowly while looking at",
  track: "The camera tracks sideways, keeping in frame",
  follow: "The camera follows",
};

// LTX reads one paragraph: the take is continuous, how the camera moves and onto whom, what they
// do, where, and the look (04_shot proof 2: "one continuous take" kept the move from cutting).
function shotPrompt(p: Project, action: string) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  const m = p.camera;
  const who = m?.framing === "pov" ? `A first-person view through the eyes of ${p.character.prompt}, who` : `${MOVE_WORDS[m?.move ?? "static"]} ${p.character.prompt}, who`;
  const walk = m?.walk ? " They walk steadily across the ground as they do." : "";
  return `One continuous take with no cuts. ${who} ${action}.${walk} ${p.set?.prompt ?? ""}. ${style}, consistent art style. ${focusPhrase(m)}`.trim();
}

// No negative from the user: the distilled graph runs at CFG 1, where a negative prompt has no
// effect (04_shot ACCEPT proof 3: take D = take B frame for frame). The graph keeps a default.
const Input = z.object({ action: z.string().trim().min(3, "Say what happens in a few words.").max(500) });

// One take: LTX-2.5 distilled guided by every keyframe (ends 0.7, middle 0.5), with audio. About
// 1.5 to 2 minutes on the 4080 for 97 to 121 frames.
export async function renderTake(id: string, raw: unknown) {
  const { action } = Input.parse(raw);
  const negative = DEFAULT_NEGATIVE;
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
      set: [["20", "text", shotPrompt(p, action)], ["21", "text", negative], ["40", "noise_seed", seed]],
      images: [["1", abs(id, keys[0])], ["2", abs(id, keys.at(-1)!)], ...keys.slice(1, -1).map((f, i) => [middleImageNode(i), abs(id, f)] as [string, string])],
      output: "55",
      ext: "mp4",
      outDir: abs(id, `shot/takes/${Date.now().toString(36)}`),
      timeoutMs: 20 * 60_000,
    });
    if (!video) throw new Error("LTX made no video.");
    if (!(await ctx.alive())) return;
    await ctx.progress("Checking the take");
    const score = await scoreTake(video);
    await updateProject(id, (q) => {
      const take = { video: path.relative(projectDir(id), video), action, seed, frames: length, keys: k.at, seconds: p.camera!.seconds, at: new Date().toISOString(), score };
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
