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
  return renderKey(p.camera, p.stage.at, p.stage.height, fill.mesh);
}

// Key 0: keep everything, add nothing (a key that invents things makes the take invent them),
// light the character into the place, clean the smears. The note is the one thing that may be added.
function keyPrompt(p: Project, note: string) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  return [
    `Keep everything in this picture exactly where it is and add nothing new. Make it one finished frame, ${style}:`,
    `light ${p.character.prompt} so they belong in the scene, with a soft shadow on the ground, and clean up smeared or broken patches and black holes at the edges. Same character, same clothes, same objects.`,
    note,
  ]
    .filter(Boolean)
    .join(" ");
}

// Every other key is matched to the painted key 0 (a second image), so all keys share one look
// and the take has nothing to morph between (04_shot ACCEPT proof 3: pop-ins 8.0 -> 4.0).
const MATCH =
  "Repaint picture 1 to match picture 2 exactly: the same lighting, colours, materials, style and the same character with the same clothes and what they carry. Keep picture 1's camera framing, layout and the character's position and size. Add nothing that is not in picture 1 or picture 2. Clean up smeared or broken patches and black holes at the edges.";

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

// Repaint keys as one job, about 30 s each: key 0 with 01_edit and its own prompt, every other key
// with 03_keyframe_match against the painted key 0. Repainting key 0 repaints them all, since the
// others follow it; a re-roll takes a new seed.
async function refine(id: string, which: number[], reroll = false) {
  const p = await load(id);
  const k = p.keyframes;
  if (!k) throw new Error("Make the keyframes first.");
  const keys = which.includes(0) ? k.raw.map((_, i) => i) : which;
  await startJob(id, "keyframes", async (ctx) => {
    // The painted key 0 the others match: today's, unless key 0 is being repainted too.
    let first: string | null = keys[0] === 0 ? null : k.keys[0];
    for (const [n, i] of keys.entries()) {
      await ctx.progress(`Painting key ${n + 1} of ${keys.length}`);
      const s = reroll ? seed() : k.seed;
      const outDir = path.join(path.dirname(abs(id, k.raw[i])), `key-${String(k.frames[i]).padStart(3, "0")}-${Date.now().toString(36)}`);
      const [image] =
        i === 0
          ? await runWorkflow({ workflow: "01_edit.api.json", onSubmit: ctx.track, set: [["17", "prompt", k.prompt], ["22", "seed", s]], images: [["1", abs(id, k.raw[0])]], output: "28", outDir })
          : await runWorkflow({
              workflow: "03_keyframe_match.api.json",
              onSubmit: ctx.track,
              set: [["17", "prompt", MATCH], ["22", "seed", s]],
              images: [["1", abs(id, k.raw[i])], ["2", abs(id, first!)]],
              output: "28",
              outDir,
            });
      if (!(await ctx.alive())) return;
      if (i === 0) first = rel(id, image);
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
  if (i > 0 && !p.keyframes.keys[0]) throw new Error("Paint the first key first: the others follow it.");
  await refine(id, [i], true);
  done(id);
}
