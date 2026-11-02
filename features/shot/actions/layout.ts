"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { frameCount } from "@/lib/camera";
import { startJob } from "@/lib/jobs";
import { sceneKey } from "@/lib/progress";
import { runWorkflow } from "@/lib/comfy";
import { clayFrameMax, keysProblem } from "../state";
import { DEFAULT_NEGATIVE, addKeyGuides, keyImageNode, wordsOnly } from "../graph";
import { getProject, projectDir, updateProject } from "@/lib/store";

// The shot's camera move as a clay clip: every frame drawn in the browser from the stage in the
// grey guide look (features/scene/components/key-capture.tsx, clay), uploaded as JPEGs and joined
// into an MP4 at 24 fps. It is the Layout-to-Render IC-LoRA's control video (Lightricks: "a clay
// viewport or a blocky playblast"), so a camera take follows the move and the blocking frame by frame.

const run = promisify(execFile);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);

export async function saveClay(id: string, form: FormData) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const key = sceneKey(p);
  if (!key) throw new Error("Place the character and choose a camera move first.");
  const frames = frameCount(p.camera!.seconds);
  const max = clayFrameMax(frames);
  const Frame = z.instanceof(File).refine((f) => f.type === "image/jpeg" && f.size < max, "A clay frame came out too big to send; shorten the move.");
  const files = Array.from({ length: frames }, (_, i) => Frame.parse(form.get(`f${i}`)));
  const dir = path.join(projectDir(id), `shot/clay/${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  for (const [i, f] of files.entries()) await writeFile(path.join(dir, `${String(i).padStart(3, "0")}.jpg`), Buffer.from(await f.arrayBuffer()));
  // Joined into the MP4 as a job (a few seconds, but never inside the request).
  await startJob(id, "layout", async (ctx) => {
    const clip = path.join(dir, "clay.mp4");
    await run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "24", "-i", path.join(dir, "%03d.jpg"), "-vf", "scale=768:448", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", clip]);
    if (await ctx.alive()) await updateProject(id, (q) => void (q.layout = { clip: rel(id, clip), key, frames, at: new Date().toISOString() }));
  }, "Joining the clay clip");
  revalidatePath(`/p/${id}/shot`);
}

// The layout pair: one sentence shot twice with one seed. The guided take has the keyframes at
// 0, 32, 64 and 96 and the clay clip; the words-only take has no guide at all, the move only in
// the prompt. Both are kept in shot/pairs/<id>/ with pair.json, the basis a later change to the
// stage is judged against. It runs as a job, never inside the request.
const PAIR_FRAMES = [0, 32, 64, 96];
const PairInput = z.object({ beats: z.object({ start: z.string().trim().min(3).max(300), then: z.string().trim().max(300).optional(), end: z.string().trim().max(300).optional() }), seed: z.number().int().min(0).max(2 ** 31).optional() });

export async function shootPair(id: string, raw: unknown) {
  const { beats, seed = Math.floor(Math.random() * 2 ** 31) } = PairInput.parse(raw);
  const p = await getProject(id);
  if (!p?.camera) throw new Error("Choose a camera move first.");
  if (p.jobs.shot?.status === "running") throw new Error("A take is still being shot; wait for it or cancel it first.");
  await startJob(id, "shot", async (ctx) => {
    const q = await getProject(id);
    const k = q?.keyframes;
    const clip = q?.layout;
    if (!q || !k || k.frames.join() !== PAIR_FRAMES.join()) throw new Error("The pair needs keyframes at 0, 32, 64 and 96: paint them first.");
    const late = keysProblem(q);
    if (late) throw new Error(late);
    const length = PAIR_FRAMES.at(-1)! + 1;
    if (!clip || clip.key !== sceneKey(q) || clip.frames !== length) throw new Error("The clay clip is not today's stage at 97 frames: shoot it again first.");
    // Loaded here: shot.ts imports this file.
    const { videoLine } = await import("./shot");
    const prompt = await videoLine(id, beats);
    const dir = path.join(projectDir(id), `shot/pairs/${Date.now().toString(36)}`);
    const keys = k.keys as string[];
    const abs = (f: string) => path.join(projectDir(id), f);
    const common = { onSubmit: ctx.track, set: [["20", "text", prompt], ["21", "text", DEFAULT_NEGATIVE], ["40", "noise_seed", seed]] as [string, string, unknown][], output: "55", ext: "mp4", timeoutMs: 20 * 60_000 };
    await ctx.progress("Pair 1 of 2: guided by the keys and the clay clip");
    const [guided] = await runWorkflow({
      ...common,
      workflow: "03_shot_layout.api.json",
      edit: (g) => addKeyGuides(g, PAIR_FRAMES, length),
      videos: [["401", abs(clip.clip)]],
      images: [["1", abs(keys[0])], ...keys.map((f, i) => [keyImageNode(i), abs(f)] as [string, string])],
      outDir: path.join(dir, "guided"),
    });
    if (!guided || !(await ctx.alive())) return;
    await ctx.progress("Pair 2 of 2: the move in words, no guides");
    const [words] = await runWorkflow({ ...common, workflow: "03_shot.api.json", edit: (g) => wordsOnly(g, length), outDir: path.join(dir, "words") });
    if (!words || !(await ctx.alive())) return;
    const meta = { sentence: prompt, beats, seed, frames: length, guideFrames: PAIR_FRAMES, move: q.camera!.move, stageKey: clip.key, clay: clip.clip, keys, guided: rel(id, guided), words: rel(id, words), at: new Date().toISOString() };
    await writeFile(path.join(dir, "pair.json"), JSON.stringify(meta, null, 2));
  }, "Shooting the pair");
  revalidatePath(`/p/${id}/shot`);
}
