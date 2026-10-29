"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { keyFrames, renderKey } from "@/lib/camera";
import { runWorkflow } from "@/lib/comfy";
import { startJob } from "@/lib/jobs";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";
import { styleById } from "@/lib/styles";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const done = (id: string) => revalidatePath(`/p/${id}/scene`);
const seed = () => Math.floor(Math.random() * 2 ** 31);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

// Today's move, placement and stage, as the camera render keys them; null when not ready.
function sceneKey(p: Project) {
  const fill = currentFill(p);
  if (!fill?.camera?.floor || !p.stage?.at || !p.camera) return null;
  return renderKey(p.camera, p.stage.at, p.stage.height, fill.mesh, p.stage.turn);
}

// Every key is the capture repainted on its own with one strict prompt and one seed: keep
// everything, add nothing, fill the stage's black holes. No character description: naming "a
// lantern keeper" made Qwen add a lantern, and a key that invents things makes the take invent
// them. Matching keys to key 0 collapsed the camera move (04_shot ACCEPT proof 5: method M, camera
// travel 10 px, worst pop-in 5.8, no frame over the line). The note is the one thing that may be added.
function keyPrompt(p: Project, note: string) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  return [
    "Keep everything in this picture exactly where it is and add nothing new: no new objects, nothing in the hands that is not already there.",
    `Make it one finished frame, ${style}: light the character so they belong in the scene with a soft shadow on the ground, repaint smeared, jagged or broken patches cleanly, and fill any black holes at the edges with the scene around them. Same camera framing.`,
    note,
  ]
    .filter(Boolean)
    .join(" ");
}

const Key = z.instanceof(File).refine((f) => f.type === "image/jpeg" && f.size < 900 * 1024, "Each key must be a JPEG under 900 KB.");
const Note = z.string().trim().max(300);

// The viewer's captures at the key frames, uploaded from the browser; then each is refined.
export async function saveKeys(id: string, form: FormData, rawNote: unknown) {
  const p = await load(id);
  const key = sceneKey(p);
  if (!key) throw new Error("Place the character and choose a camera move first.");
  const frames = keyFrames(p.camera!);
  const files = frames.map((_, i) => Key.parse(form.get(`key${i}`)));
  const note = Note.parse(rawNote ?? "");
  const dir = abs(id, `shot/keys/${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  const raw: string[] = [];
  for (const [i, f] of files.entries()) {
    const file = path.join(dir, `raw-${String(frames[i]).padStart(3, "0")}.jpg`);
    await writeFile(file, Buffer.from(await f.arrayBuffer()));
    raw.push(rel(id, file));
  }
  const s = seed();
  await updateProject(id, (q) => void (q.keyframes = { frames, raw, keys: raw.map(() => null), prompt: keyPrompt(q, note), note, seed: s, key, at: new Date().toISOString() }));
  await refine(id, raw.map((_, i) => i));
  done(id);
}

// Repaint the given keys with 01_edit (Qwen-Image-Edit 2511 + Lightning, about 30 s each) as one
// job; every key uses the saved prompt and seed, a re-rolled one a new seed.
async function refine(id: string, which: number[], reroll = false) {
  const p = await load(id);
  const k = p.keyframes;
  if (!k) throw new Error("Make the keyframes first.");
  await startJob(id, "keyframes", async (ctx) => {
    for (const [n, i] of which.entries()) {
      await ctx.progress(`Painting key ${n + 1} of ${which.length}`);
      const outDir = path.join(path.dirname(abs(id, k.raw[i])), `key-${String(k.frames[i]).padStart(3, "0")}-${Date.now().toString(36)}`);
      const [image] = await runWorkflow({ workflow: "01_edit.api.json", onSubmit: ctx.track, set: [["17", "prompt", k.prompt], ["22", "seed", reroll ? seed() : k.seed]], images: [["1", abs(id, k.raw[i])]], output: "28", outDir });
      if (!(await ctx.alive())) return;
      await updateProject(id, (q) => {
        if (q.keyframes?.raw[i] === k.raw[i]) q.keyframes.keys[i] = rel(id, image);
      });
    }
  }, "Painting the keyframes");
}

export async function rerollKey(id: string, rawIndex: unknown) {
  const i = z.number().int().min(0).max(8).parse(rawIndex);
  const p = await load(id);
  if (!p.keyframes?.raw[i]) throw new Error("No such key.");
  await refine(id, [i], true);
  done(id);
}
