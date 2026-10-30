"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { startJob } from "@/lib/jobs";
import { allShots, getProject, projectDir } from "@/lib/store";
import { EFFECTS, effectFile, type EffectId } from "../effects";

const run = promisify(execFile);
const ShotId = z.string().regex(/^s\d{1,3}$/);
const Effect = z.enum(EFFECTS.map((e) => e.id) as [EffectId, ...EffectId[]]);
const NIGHT = "Night under cold blue moonlight, deep shadows, dim cool light on the ground and on the figures, a dark sky. Only the lighting changes from day to night; identical composition, framing, camera movement and motion.";
const done = (id: string) => revalidatePath(`/p/${id}/export`);

// The shot's picked take: the one the reel plays.
async function pickedTake(id: string, shot: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const s = allShots(p).find((x) => x.id === shot);
  const take = s?.shot?.picked !== undefined ? s.shot.takes[s.shot.picked] : undefined;
  if (!take) throw new Error("Pick a take in this shot first.");
  return take;
}

// The take's size and frame count, read from the file: older takes do not say.
async function probe(file: string) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=width,height,nb_read_packets", "-of", "csv=p=0", file]);
  const [w, h, n] = stdout.trim().split(",").map(Number);
  return { w, h, n };
}

// Make one effect of the shot's picked take as a job (one per shot at a time), then use it.
export async function makeEffect(id: string, rawShot: unknown, rawEffect: unknown) {
  const shot = ShotId.parse(rawShot);
  const effect = Effect.parse(rawEffect);
  const take = await pickedTake(id, shot);
  const src = path.join(projectDir(id), take.video);
  await startJob(id, `fx-${shot}`, async (ctx) => {
    const { w, h, n } = await probe(src);
    // LTX wants 8n + 1 frames and sizes in 32s; the take already is, this only guards older ones.
    const frames = Math.max(9, Math.floor((n - 1) / 8) * 8 + 1);
    const size = (x: number) => Math.round(x / 32) * 32;
    const [W, H] = effect === "refine" ? [size(w * 2), size(h * 2)] : [size(w), size(h)];
    const out = path.join(projectDir(id), path.dirname(effectFile(take.video, effect)));
    const tmp = `${out}-${Date.now().toString(36)}`;
    await mkdir(tmp, { recursive: true });
    const [file] = await runWorkflow({
      workflow: effect === "refine" ? "04_effect_refine.api.json" : "04_effect_night.api.json",
      onSubmit: ctx.track,
      set: [
        ["30", "width", W],
        ["30", "height", H],
        ["30", "length", frames],
        ...(effect === "refine"
          ? ([["404", "width", W], ["404", "height", H], ["44", "seed", 42]] as [string, string, number][])
          : ([["33", "frames_number", frames], ["40", "noise_seed", 42], ["20", "text", NIGHT]] as [string, string, number | string][])),
      ],
      videos: [["401", src]],
      output: "55",
      ext: "mp4",
      outDir: tmp,
      timeoutMs: 20 * 60_000,
    });
    if (!(await ctx.alive())) return;
    await mkdir(out, { recursive: true });
    await rename(file, path.join(out, "00.mp4"));
    await writeFile(path.join(path.dirname(out), "use.txt"), effect);
  }, `${EFFECTS.find((e) => e.id === effect)!.label}: one pass on Comfy Cloud`);
  done(id);
}

// Which effect the reel plays for this shot's picked take ("none": the take as shot).
export async function chooseEffect(id: string, rawShot: unknown, rawEffect: unknown) {
  const shot = ShotId.parse(rawShot);
  const effect = z.union([Effect, z.literal("none")]).parse(rawEffect);
  const take = await pickedTake(id, shot);
  const dir = path.join(projectDir(id), path.dirname(take.video), "fx");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "use.txt"), effect === "none" ? "" : effect);
  done(id);
}
