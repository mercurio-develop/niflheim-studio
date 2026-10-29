"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { fillStage } from "@/lib/stage-fill";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject, type Project, type ViewId } from "@/lib/store";
import { REFERENCE_TYPES, StyleId, referenceError } from "@/features/character/schemas";
import { SET_STYLES, composeSetPrompt, fillPlace } from "../prompt";

const rel = (id: string, file: string) => path.relative(projectDir(id), file);
const abs = (id: string, file: string) => path.join(projectDir(id), file);
const stamp = () => Date.now().toString(36);
const done = (id: string) => revalidatePath(`/p/${id}/scene`);

const Prompt = z.string().trim().min(3, "Describe the place in a few words.").max(600);
const Image = z.string().regex(/^set\/[\w./-]+\.(png|jpg|webp)$/);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

const Count = z.union([z.literal(2), z.literal(4)]);

// Paint 2 or 4 options of the set (Z-Image Turbo, 1344x768, one batch: option i is seed + i)
// from the composed stage prompt (features/set/prompt.ts). Picking one builds its stage, since a
// weak painting cannot be rescued by the fill. sameSeed repaints with the last seed, to see
// what a change of words does.
export async function paintSet(id: string, rawPrompt: string, rawStyle: string, options: { count?: number; sameSeed?: boolean } = {}) {
  const prompt = Prompt.parse(rawPrompt);
  const style = StyleId.parse(rawStyle);
  const p = await load(id);
  const count = Count.parse(options.count ?? p.set?.count ?? 4);
  const seed = options.sameSeed && p.set?.seed !== undefined ? p.set.seed : Math.floor(Math.random() * 2 ** 31);
  await startJob(id, "set", async (ctx) => {
    const files = await runWorkflow({
      onSubmit: ctx.track,
      workflow: "02_set_paint.api.json",
      set: [["5", "text", composeSetPrompt(prompt, style).text], ["8", "seed", seed], ["7", "batch_size", count]],
      output: "10",
      outDir: abs(id, `set/paint/${seed}-${stamp()}`),
    });
    if (!(await ctx.alive())) return;
    const images = files.map((f) => rel(id, f));
    await updateProject(id, (q) => {
      const s = (q.set ??= { prompt, style, paintings: [] });
      Object.assign(s, { prompt, style, seed, count, options: images });
      s.paintings.push(...images);
    });
  }, `Painting ${count} sets`);
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
  await fill(id, ctx);
}

// The stage is shown as soon as MoGe has it; the same job then paints its holes (1-2 min).
async function fill(id: string, ctx: JobCtx) {
  const p = await load(id);
  const stage = p.set?.stage;
  if (!stage) throw new Error("Build the stage first.");
  const r = await fillStage({
    image: abs(id, stage.image),
    mesh: abs(id, stage.mesh),
    // The place with its light kept; an upload has no words, so the fill keeps to the picture.
    place: fillPlace(p.set!.prompt),
    style: p.set!.prompt ? (SET_STYLES[p.set!.style as keyof typeof SET_STYLES] ?? SET_STYLES.painterly).phrase : "",
    dir: abs(id, `${path.dirname(path.dirname(stage.mesh))}/fill/${stamp()}`),
    track: ctx.track,
    alive: ctx.alive,
    progress: ctx.progress,
  });
  if (!r || !(await ctx.alive())) return;
  await updateProject(id, (q) => {
    if (q.set?.stage?.mesh !== stage.mesh) return; // rebuilt meanwhile
    q.set.stage.fill = { mesh: rel(id, r.mesh), cameras: rel(id, r.cameras), views: r.views.map((v) => rel(id, v.filled)), holes: r.holes, camera: r.camera };
  });
}

// Paint the holes again (new seeds), keeping the stage MoGe built.
export async function refillStage(id: string) {
  const p = await load(id);
  if (!p.set?.stage || p.set.stage.image !== p.set.image) throw new Error("Build the stage first.");
  await startJob(id, "set", (ctx) => fill(id, ctx), "Filling the stage");
  done(id);
}

export async function cancelSet(id: string) {
  await cancelJob(id, "set");
  done(id);
}

// The character in the scene: cut out of the turnaround, stood on the stage's floor.

// The current image of each turnaround view.
function viewImages(p: Project) {
  const out: Partial<Record<ViewId, string>> = {};
  for (const [v, s] of Object.entries(p.turnaround?.views ?? {})) if (s?.versions[s.current]) out[v as ViewId] = s.versions[s.current].image;
  return out;
}

// Cut every turnaround view out of its grey background (02_cutout: BiRefNet, native nodes, about
// 2 s a view), so the character can stand in the set as a card that turns with the camera.
export async function cutOutCharacter(id: string) {
  const p = await load(id);
  const views = viewImages(p);
  if (!views.front) throw new Error("Make the turnaround first.");
  await startJob(id, "stage", async (ctx) => {
    const cutouts: Partial<Record<ViewId, string>> = {};
    const dir = `stage/cutouts/${stamp()}`;
    for (const [v, image] of Object.entries(views) as [ViewId, string][]) {
      await ctx.progress(`Cutting out the ${v === "threequarter" ? "three-quarter" : v} view`);
      const [file] = await runWorkflow({ onSubmit: ctx.track, workflow: "02_cutout.api.json", images: [["1", abs(id, image)]], output: "6", outDir: abs(id, `${dir}/${v}`) });
      if (!(await ctx.alive())) return;
      cutouts[v] = rel(id, file);
    }
    await updateProject(id, (q) => {
      q.stage = { height: 1.7, turn: 0, ...q.stage, source: views.front!, cutouts };
    });
  }, "Cutting out the character");
  done(id);
}

const Placement = z.object({
  at: z.tuple([z.number(), z.number(), z.number()]).refine((a) => a.every((x) => Number.isFinite(x) && Math.abs(x) < 500), "The spot is off the stage."),
  height: z.number().min(0.5).max(3),
  turn: z.number().min(-180).max(180),
});

// Where the character stands, how tall, which way they face. Saved as you place them.
export async function placeCharacter(id: string, raw: unknown) {
  const place = Placement.parse(raw);
  await updateProject(id, (q) => {
    if (!q.stage) throw new Error("Cut out the character first.");
    // A new spot is placed on today's set; a height or turn change alone keeps the set it was placed on.
    const spot = !q.stage.fill || !q.stage.at || place.at.some((x, i) => x !== q.stage!.at![i]);
    Object.assign(q.stage, place, spot ? { fill: currentFill(q)?.mesh } : {});
  });
  done(id);
}

const Blocks = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9]{1,16}$/),
      kind: z.enum(["box", "cylinder", "ramp"]),
      at: z.tuple([z.number(), z.number(), z.number()]).refine((a) => a.every((x) => Number.isFinite(x) && Math.abs(x) < 500), "A block is off the stage."),
      size: z.tuple([z.number(), z.number(), z.number()]).refine((a) => a.every((x) => x >= 0.1 && x <= 20), "A block's size is out of range."),
      turn: z.number().min(-180).max(180),
      label: z.string().trim().max(80),
    }),
  )
  .max(12);

// The greybox blocks on the stage, saved as they are placed and sized. Every shot sees them.
export async function saveBlocks(id: string, raw: unknown) {
  const blocks = Blocks.parse(raw);
  await updateProject(id, (q) => void (q.blocks = blocks));
  done(id);
  revalidatePath(`/p/${id}/shot`);
}

export async function cancelStage(id: string) {
  await cancelJob(id, "stage");
  done(id);
}
