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


// The camera, said relative to them (LTX prompting guide: the move, its speed, and what the frame
// looks like after it).
const MOVE_WORDS: Record<string, { move: string; ends: string }> = {
  static: { move: "holds still on them", ends: "on the same framing" },
  push: { move: "pushes in slowly toward them", ends: "closer on them" },
  pull: { move: "pulls back slowly", ends: "wider, the place around them in view" },
  arc: { move: "arcs slowly around them", ends: "on them from a new angle" },
  crane: { move: "cranes slowly while looking at them", ends: "on them from a new height" },
  track: { move: "tracks sideways, keeping them in frame", ends: "with them still in frame" },
  follow: { move: "follows them at the same distance", ends: "still with them" },
};
const FRAMING_WORDS: Record<string, string> = { long: "Wide shot", mid: "Medium shot", close: "Close-up", pov: "First-person shot", free: "Shot", painting: "Shot" };

export type Beats = { start: string; then?: string; end?: string };

// LTX reads one flowing paragraph in the present tense (its prompting guide): the shot and the
// place, who it is and what they do first, what happens as the camera moves, how it ends and how
// the frame ends, then the look. "One continuous take" keeps the move from cutting (04_shot proof 2).
function shotPrompt(p: Project, b: Beats) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  const m = p.camera;
  const pov = m?.framing === "pov";
  const cam = MOVE_WORDS[m?.move ?? "static"];
  const clean = (x?: string) => x?.trim().replace(/[.\s]+$/, "");
  const lines = [
    `${FRAMING_WORDS[m?.framing ?? "painting"]}${p.set?.prompt ? ` of ${clean(p.set.prompt)}` : ""}.`,
    pov ? `Seen through the eyes of ${clean(p.character.prompt)}, who ${clean(b.start)}.` : `${capital(clean(p.character.prompt)!)} ${clean(b.start)}.`,
    cast(p) ? `Also in the scene: ${cast(p)}.` : "",
    m?.walk ? "They walk steadily across the ground." : "",
    poseOf(p, m?.pose) ? `They ${poseOf(p, m?.pose)}.` : "",
    m?.poseThen ? `Halfway through, they ${poseOf(p, m.poseThen) ?? "return to how they stood at first"}.` : "",
    clean(b.then) ? `As the camera ${cam.move}, the character ${clean(b.then)}.` : `The camera ${cam.move}.`,
    clean(b.end) ? `A moment later, the character ${clean(b.end)}.` : "",
    pov ? "" : `The shot ends ${cam.ends}.`,
    `One continuous take with no cuts, ${style}, consistent art style.`,
    focusPhrase(m),
  ];
  return lines.filter(Boolean).join(" ");
}
// The cast members standing on the stage, by name and description.
const cast = (p: Project) =>
  (p.sceneAssets ?? [])
    .filter((a) => a.kind === "character" && a.at)
    .map((a) => (a.prompt ? `${a.name}, ${a.prompt}` : a.name))
    .join("; ");
const poseOf = (p: Project, id?: string) => p.poses?.find((x) => x.id === id)?.prompt;
const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

// No negative from the user: the distilled graph runs at CFG 1, where a negative prompt has no
// effect (04_shot ACCEPT proof 3: take D = take B frame for frame). The graph keeps a default.
const Beat = z.string().trim().max(300);
const Input = z
  .object({ action: z.string().trim().max(500).optional(), beats: z.object({ start: Beat, then: Beat.optional(), end: Beat.optional() }).optional(), tries: z.number().int().min(1).max(4).optional() })
  .transform((x) => {
    const beats: Beats = x.beats ?? { start: x.action ?? "" };
    return { beats, action: [beats.start, beats.then, beats.end].map((s) => s?.trim()).filter(Boolean).join(", then "), tries: x.tries ?? 1 };
  })
  .refine((x) => x.beats.start.length >= 3, "Say what happens first, in a few words.");

// A take is good when nothing pops in and the worst frame-to-frame change stays small; of several,
// the one with the fewest pop-ins, then the calmest.
const good = (s?: TakeScore) => !!s && s.popins === 0 && s.worst < 6;
const rank = (s?: TakeScore) => (s ? s.popins * 100 + s.worst : 1e9);

// Takes of the shot: LTX-2.5 distilled guided by every keyframe (ends 0.7, middle 0.5), with
// audio, about 1.5 to 2 minutes each on the 4080 for 97 to 121 frames. With tries > 1 it shoots
// until one is good (new seed each time), at most `tries`, and picks the best of them.
export async function renderTake(id: string, raw: unknown) {
  const { beats, action, tries } = Input.parse(raw);
  const negative = DEFAULT_NEGATIVE;
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const k = p.keyframes;
  if (!p.camera || !k?.keys.length || !k.keys.every(Boolean)) throw new Error("Make the keyframes first.");
  const length = frameCount(p.camera.seconds);
  if (k.frames.at(-1) !== length - 1) throw new Error("The camera move changed since the keyframes were made: make them again.");
  const keys = k.keys as string[];
  const prompt = shotPrompt(p, beats);
  await updateProject(id, (q) => void (q.shot = { takes: [], ...q.shot, action, beats, negative }));
  await startJob(id, "shot", async (ctx) => {
    const made: { index: number; score?: TakeScore }[] = [];
    for (let n = 1; n <= tries; n++) {
      if (tries > 1) await ctx.progress(`Shooting take ${n} of up to ${tries}`);
      const seed = Math.floor(Math.random() * 2 ** 31);
      const [video] = await runWorkflow({
        workflow: "03_shot.api.json",
        onSubmit: ctx.track,
        edit: (g) => shapeShot(g, k.frames, length),
        set: [["20", "text", prompt], ["21", "text", negative], ["40", "noise_seed", seed]],
        images: [["1", abs(id, keys[0])], ["2", abs(id, keys.at(-1)!)], ...keys.slice(1, -1).map((f, i) => [middleImageNode(i), abs(id, f)] as [string, string])],
        output: "55",
        ext: "mp4",
        outDir: abs(id, `shot/takes/${Date.now().toString(36)}`),
        timeoutMs: 20 * 60_000,
      });
      if (!video) throw new Error("LTX made no video.");
      if (!(await ctx.alive())) return;
      await ctx.progress(tries > 1 ? `Checking take ${n}` : "Checking the take");
      const score = await scoreTake(video);
      let index = 0;
      await updateProject(id, (q) => {
        const take = { video: path.relative(projectDir(id), video), action, seed, frames: length, keys: k.at, seconds: p.camera!.seconds, at: new Date().toISOString(), score, prompt };
        q.shot = { action, negative, ...q.shot, takes: [...(q.shot?.takes ?? []), take] };
        index = q.shot.takes.length - 1;
      });
      made.push({ index, score });
      if (good(score)) break;
    }
    if (tries > 1) {
      const best = made.reduce((a, b) => (rank(b.score) < rank(a.score) ? b : a));
      await updateProject(id, (q) => void (q.shot && (q.shot.picked = best.index)));
    }
  }, tries > 1 ? `Shooting up to ${tries} takes` : "Shooting the take");
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
