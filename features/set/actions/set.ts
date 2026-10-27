"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { REFERENCE_TYPES, StyleId, referenceError } from "@/features/character/schemas";

const rel = (id: string, file: string) => path.relative(projectDir(id), file);
const abs = (id: string, file: string) => path.join(projectDir(id), file);
const stamp = () => Date.now().toString(36);
const done = (id: string) => revalidatePath(`/p/${id}/set`);

const Prompt = z.string().trim().min(3, "Describe the place in a few words.").max(600);
const Image = z.string().regex(/^set\/[\w./-]+\.(png|jpg|webp)$/);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

// A wide establishing shot with an open floor in front, so there is somewhere to stand the
// character and MoGe gets a clear ground plane. No people: the character is placed later.
const setPrompt = (prompt: string, style: string) =>
  `Concept painting of ${prompt}. Wide establishing shot, eye-level camera, an open floor in the foreground, depth into the distance, no people, no characters. ${styleById(style).phrase}, cinematic light.`;

// Paint one set (Z-Image Turbo, 1344x768) and pick it; the stage is built from it right away.
export async function paintSet(id: string, rawPrompt: string, rawStyle: string) {
  const prompt = Prompt.parse(rawPrompt);
  const style = StyleId.parse(rawStyle);
  await load(id);
  const seed = Math.floor(Math.random() * 2 ** 31);
  await startJob(id, "set", async (ctx) => {
    const [file] = await runWorkflow({
      onSubmit: ctx.track,
      workflow: "02_set_paint.api.json",
      set: [["5", "text", setPrompt(prompt, style)], ["8", "seed", seed]],
      output: "10",
      outDir: abs(id, `set/paint/${seed}`),
    });
    if (!(await ctx.alive())) return;
    const image = rel(id, file);
    await updateProject(id, (q) => {
      const s = (q.set ??= { prompt, style, paintings: [] });
      Object.assign(s, { prompt, style, image });
      s.paintings.push(image);
    });
    await ctx.progress("Building the 3D stage");
    await buildStage(id, image, ctx);
  }, "Painting the set");
  done(id);
}

// Your own concept painting instead of a painted one.
export async function uploadSet(id: string, form: FormData) {
  const file = form.get("image");
  const bad = referenceError(file);
  if (bad || !(file instanceof File)) throw new Error(bad ?? "The image did not come through.");
  await load(id);
  const out = abs(id, `set/upload/${stamp()}.${REFERENCE_TYPES[file.type]}`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await file.arrayBuffer()));
  const image = rel(id, out);
  await updateProject(id, (q) => {
    const s = (q.set ??= { prompt: "", style: "painterly", paintings: [] });
    s.paintings.push(image);
    s.image = image;
  });
  await startJob(id, "set", (ctx) => buildStage(id, image, ctx), "Building the 3D stage");
  done(id);
}

// Choose an earlier painting; its stage is built again (2-3 s) unless it is the one shown.
export async function pickSet(id: string, rawImage: string) {
  const image = Image.parse(rawImage);
  const p = await updateProject(id, (q) => {
    if (!q.set?.paintings.includes(image)) throw new Error("No such painting.");
    q.set.image = image;
  });
  if (p.set!.stage?.image !== image) await startJob(id, "set", (ctx) => buildStage(id, image, ctx), "Building the 3D stage");
  done(id);
}

export async function rebuildStage(id: string) {
  const p = await load(id);
  const image = p.set?.image;
  if (!image) throw new Error("Paint or upload a set first.");
  await startJob(id, "set", (ctx) => buildStage(id, image, ctx), "Building the 3D stage");
  done(id);
}

// MoGe 2 reads the painting as geometry: one graph saves a textured mesh (GLB) and its depth map.
async function buildStage(id: string, image: string, ctx: JobCtx) {
  const dir = `set/stage/${stamp()}`;
  const run = (output: string, ext: string) =>
    runWorkflow({ onSubmit: ctx.track, workflow: "02_moge.api.json", images: [["1", abs(id, image)]], output, ext, outDir: abs(id, `${dir}/${ext}`) });
  const [mesh] = await run("5", "glb");
  if (!mesh) throw new Error("MoGe made no mesh.");
  if (!(await ctx.alive())) return;
  const [depth] = await run("7", "png");
  if (!(await ctx.alive())) return;
  await updateProject(id, (q) => {
    if (q.set?.image === image) q.set.stage = { image, mesh: rel(id, mesh), depth: rel(id, depth) };
  });
}

export async function cancelSet(id: string) {
  await cancelJob(id, "set");
  done(id);
}

export async function finishSet(id: string) {
  const p = await load(id);
  if (!p.set?.stage || p.set.stage.image !== p.set.image) throw new Error("Build the stage first.");
  redirect(`/p/${id}/stage`);
}
