"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { REFERENCE_TYPES, referenceError } from "@/features/character/schemas";
import { meshFromViews, paintViews } from "@/lib/asset-3d";
import { cropBox, pngSize, removePrompt, type Box } from "@/lib/brush";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { CID, getProject, projectDir, updateProject, type SceneAsset } from "@/lib/store";
import { defaultHeight, viewImage } from "@/lib/progress";
import { mediumOf, styleById } from "@/lib/styles";

const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const stamp = () => Date.now().toString(36);
const done = (id: string) => {
  revalidatePath(`/p/${id}/scene`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (aid: string) => `scene-asset:${aid}`;

const Name = z.string().trim().min(2).max(40);
const Aid = z.string().regex(/^[a-z0-9]{1,16}$/);
const Source = z.discriminatedUnion("from", [
  z.object({ from: z.literal("prompt"), name: Name, prompt: z.string().trim().min(3).max(300) }),
  z.object({ from: z.literal("upload"), name: Name }),
  z.object({ from: z.literal("character"), name: Name }),
]);

// A cast member, painted like the main character's concepts: whole figure, front view, on grey.
const castPrompt = (prompt: string, style: string) =>
  `Full-body character ${mediumOf(style)} of ${prompt}. Standing, natural relaxed pose, front view, whole figure in frame, a face with eyes, nose and mouth, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

// A single object, whole and centred on grey, the way the views and the 3D model want it.
const conceptPrompt = (prompt: string, style: string) =>
  `${capital(mediumOf(style))} of ${prompt}: one single object on its own, whole, centred, front view, plain light grey background, clean silhouette, nothing else. ${styleById(style).phrase}.`;

// The object from its picture to a coloured 3D model: a concept first when it was described, its
// four views (kept from the character's asset when it has them), then the model. About 3 min.
// A character (a cast member) is painted like the main one and its views cut out instead, about
// 2.5 min: a card on the stage that turns with the camera.
async function build(id: string, aid: string, ctx: JobCtx) {
  const p = await getProject(id);
  const a = p?.sceneAssets?.find((x) => x.id === aid);
  if (!p || !a) return;
  const dir = `scene/assets/${aid}`;
  const set = (patch: Partial<SceneAsset>) =>
    updateProject(id, (q) => {
      const x = q.sceneAssets?.find((y) => y.id === aid);
      if (x) Object.assign(x, patch);
    });
  let image = a.image;
  if (!image && a.prompt) {
    await ctx.progress(`Painting the ${a.name}`);
    const [file] = await runWorkflow({
      workflow: "01_concept.api.json",
      onSubmit: ctx.track,
      set: [["5", "text", (a.kind === "character" ? castPrompt : conceptPrompt)(a.prompt, p.set?.style || p.character.style)], ["8", "seed", Math.floor(Math.random() * 2 ** 31)], ["7", "batch_size", 1]],
      output: "10",
      outDir: abs(id, `${dir}/concept`),
    });
    if (!(await ctx.alive())) return;
    image = rel(id, file);
    await set({ image });
  }
  if (!image) throw new Error("The asset has no picture to work from.");
  if (a.hold) return; // kept for editing: the 3D waits for "Make 3D"
  const views = { ...a.views };
  const cast = a.kind === "character";
  if (!views.front || !views.side || !views.back) {
    const whole = a.from === "character";
    const ok = await paintViews(id, a.name, image, whole, `${dir}/views`, ctx, (v, f) => ((views[v] = f), set({ views: { ...views } })), cast);
    if (!ok) return;
  }
  if (cast) {
    const cutouts: SceneAsset["cutouts"] = {};
    for (const [v, f] of Object.entries(views) as [keyof typeof views, string][]) {
      await ctx.progress(`Cutting out the ${a.name} (${v === "threequarter" ? "three-quarter" : v})`);
      const [file] = await runWorkflow({ onSubmit: ctx.track, workflow: "02_cutout.api.json", images: [["1", abs(id, f)]], output: "6", outDir: abs(id, `${dir}/cutouts/${v}`) });
      if (!(await ctx.alive())) return;
      cutouts[v] = rel(id, file);
      await set({ cutouts: { ...cutouts } });
    }
    return;
  }
  await ctx.progress(`Building the ${a.name} in 3D`);
  const made = await meshFromViews(id, { ...views, front: views.front!, side: views.side!, back: views.back! }, `${dir}/mesh`, ctx);
  if (!made || !(await ctx.alive())) return;
  await set({ glb: made.coloured });
}

// A new asset for the scene: described, uploaded, or one of the character's assets (by name). Its
// model is made right away; it stands on the stage once placed.
export async function makeAsset(id: string, form: FormData) {
  const src = Source.parse({ from: form.get("from"), name: form.get("name"), prompt: form.get("prompt") ?? undefined });
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if ((p.sceneAssets?.length ?? 0) >= 12) throw new Error("A scene holds up to 12 assets.");
  const aid = stamp();
  // An object starts in proportion to the main character (a 1 m lantern towered over a 0.55 m fox).
  const near = Math.min(1, Math.max(0.3, (p.stage?.height ?? 1.7) * 0.6));
  const asset: SceneAsset = { id: aid, name: src.name, kind: "object", from: src.from, height: near, turn: 0 };
  if (form.get("edit") === "1") asset.hold = true;
  if (src.from === "prompt") asset.prompt = src.prompt;
  if (src.from === "upload") {
    const file = form.get("image");
    const bad = referenceError(file);
    if (bad || !(file instanceof File)) throw new Error(bad ?? "The image did not come through.");
    const out = abs(id, `scene/assets/${aid}/upload.${REFERENCE_TYPES[file.type]}`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(await file.arrayBuffer()));
    asset.image = rel(id, out);
  }
  if (src.from === "character") {
    const c = p.assets?.find((x) => x.name === src.name);
    if (!c) throw new Error(`The character has no asset called ${src.name}.`);
    asset.image = c.image;
    asset.views = c.views;
  }
  await updateProject(id, (q) => void (q.sceneAssets = [...(q.sceneAssets ?? []), asset]));
  await startJob(id, jobKey(aid), (ctx) => build(id, aid, ctx), `Making the ${src.name}`);
  done(id);
}

// A character made in the Character step, stood on the stage: its turnaround views (as they are
// now) cut out into a card, like the main character's (about 10 s). Its prompt names it in shots.
export async function addCastMember(id: string, rawCid: unknown) {
  const cid = z.string().regex(CID).refine((x) => x !== "c1", "The first character is already on the stage.").parse(rawCid);
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const m = p.cast?.find((x) => x.id === cid);
  if (!m) throw new Error("No such character.");
  if (p.sceneAssets?.some((x) => x.cid === cid)) throw new Error(`${m.name} is already on the stage.`);
  if ((p.sceneAssets?.length ?? 0) >= 12) throw new Error("A scene holds up to 12 assets.");
  const views: SceneAsset["views"] = {};
  for (const v of ["front", "threequarter", "side", "back"] as const) {
    const f = viewImage(p, v, cid);
    if (f) views[v] = f;
  }
  if (!views.front || !views.side || !views.back) throw new Error(`Paint ${m.name}'s turnaround first (front, side and back).`);
  const aid = stamp();
  const asset: SceneAsset = { id: aid, name: m.name, kind: "character", from: "cast", cid, prompt: m.character.prompt, image: views.front, views, height: defaultHeight(m.turnaround?.options), turn: 0 };
  await updateProject(id, (q) => void (q.sceneAssets = [...(q.sceneAssets ?? []), asset]));
  await startJob(id, jobKey(aid), (ctx) => build(id, aid, ctx), `Cutting out ${asset.name}`);
  done(id);
}

// Try again after a failure or a cancel: keeps what was made (the concept, the views).
export async function remakeAsset(id: string, rawAid: string) {
  const aid = Aid.parse(rawAid);
  const a = (await getProject(id))?.sceneAssets?.find((x) => x.id === aid);
  if (!a) throw new Error("No such asset.");
  await startJob(id, jobKey(aid), (ctx) => build(id, aid, ctx), `Making the ${a.name}`);
  done(id);
}

// ---- Editing the object's picture before it becomes 3D: the character editor's brush graphs
// (change, add, remove, parts) run on the asset's own picture.
const editKey = (aid: string) => `scene-asset-edit:${aid}`;
const Strokes = z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() });
const Part = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/, "Use plain words, e.g. wheel.");
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const about = (a: SceneAsset) =>
  `This is a picture of an object: ${a.prompt || a.name}. Match this picture's own art style exactly: the same shapes, level of detail, line work, shading and palette, nothing more detailed or realistic than the rest of it.`;

async function pictureOf(id: string, aid: string) {
  const a = (await getProject(id))?.sceneAssets?.find((x) => x.id === aid);
  if (!a?.image) throw new Error("The object has no picture yet.");
  return a as SceneAsset & { image: string };
}

// The edited picture becomes the object's picture; the old one is kept for Undo. The views and the
// parts belong to the old picture, so they go (the views are painted again at Make 3D).
const setPicture = (id: string, aid: string, from: string, image: string) =>
  updateProject(id, (q) => {
    const x = q.sceneAssets?.find((y) => y.id === aid);
    if (!x || x.image !== from) return;
    x.before = [...(x.before ?? []), from];
    x.image = image;
    x.views = undefined;
    x.parts = undefined;
  });

async function saveMask(id: string, aid: string, mask: FormDataEntryValue | null) {
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const file = abs(id, `scene/assets/${aid}/selections/${stamp()}.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await mask.arrayBuffer()));
  return file;
}

// Change, add or remove with the brush: the browser sends the mask (white = selected) and its box.
export async function editAsset(id: string, rawAid: string, form: FormData) {
  const aid = Aid.parse(rawAid);
  const kind = z.enum(["change", "add", "remove"]).parse(form.get("kind"));
  const text = z.string().trim().max(300).parse(form.get("text") ?? "");
  if (kind !== "remove" && text.length < 2) throw new Error(kind === "change" ? "Say what it becomes." : "Say what to add.");
  const what = z.string().trim().max(40).parse(form.get("what") ?? "");
  let raw: unknown = null;
  try { raw = JSON.parse(String(form.get("box") ?? "null")); } catch {}
  const strokes: Box = Strokes.parse(raw);
  const a = await pictureOf(id, aid);
  if ((await getProject(id))?.jobs[jobKey(aid)]?.status === "running") throw new Error("It is being made; stop that first.");
  const mask = await saveMask(id, aid, form.get("mask"));
  const detail = kind === "change" ? `Changing the ${what || "selection"}` : kind === "add" ? `Adding ${text}` : `Removing ${what || "the selection"}`;
  await startJob(id, editKey(aid), async (ctx) => {
    const source = abs(id, a.image);
    const box = cropBox(strokes, await pngSize(source), kind === "remove" ? undefined : { grow: 2.0, min: 448 });
    const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
    const prompt =
      kind === "remove"
        ? removePrompt(what)
        : kind === "add"
          ? `${about(a)} The flat grey shape is a placeholder: replace all of it. Paint ${text} inside it, whole and sized to fill most of it, nothing cut off; the rest of the grey becomes what is around it. No grey left. Same art style, lighting and colours as the rest; everything outside the shape stays exactly the same.`
          : `${about(a)} The flat grey shape is where ${what ? `the ${what}` : "what was there"} was: replace all of it. Paint ${text} there, whole, solid and attached naturally, filling the shape; the rest of the grey becomes what is around it. No grey left. Everything else and the background stay exactly the same.`;
    const [file] = await runWorkflow({
      onSubmit: ctx.track,
      workflow: kind === "remove" ? "01_remove.api.json" : kind === "add" ? "01_fill.api.json" : "01_change.api.json",
      set: [["17", "prompt", prompt], ["22", "seed", newSeed()], ...crop("4"), ...crop("5"), ["27", "x", box.x], ["27", "y", box.y]],
      images: [["1", source], ["2", mask]],
      output: "28",
      outDir: abs(id, `scene/assets/${aid}/edits/${stamp()}`),
    });
    if (!(await ctx.alive())) return;
    await setPicture(id, aid, a.image, rel(id, file));
  }, detail);
  done(id);
}

// Find a named part of the picture (SAM 3), so it can be selected by name.
export async function maskAssetPart(id: string, rawAid: string, rawPart: string) {
  const aid = Aid.parse(rawAid);
  const part = Part.parse(rawPart);
  const a = await pictureOf(id, aid);
  if (a.parts && Object.hasOwn(a.parts, part)) return;
  await startJob(id, editKey(aid), async (ctx) => {
    const [mask] = await runWorkflow({
      onSubmit: ctx.track,
      workflow: "01_parts.api.json",
      set: [["2", "prompt", part]],
      images: [["1", abs(id, a.image)]],
      output: "4",
      outDir: abs(id, `scene/assets/${aid}/masks/${stamp()}-${part.replace(/ /g, "-")}`),
    });
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => {
      const x = q.sceneAssets?.find((y) => y.id === aid);
      if (x && x.image === a.image) x.parts = { ...x.parts, [part]: rel(id, mask) };
    });
  }, `Finding the ${part}`);
  done(id);
}

// Back to the picture before the last edit.
export async function undoAssetEdit(id: string, rawAid: string) {
  const aid = Aid.parse(rawAid);
  await updateProject(id, (q) => {
    const x = q.sceneAssets?.find((y) => y.id === aid);
    const prev = x?.before?.at(-1);
    if (!x || !prev) throw new Error("Nothing to undo.");
    x.before = x.before!.slice(0, -1);
    x.image = prev;
    x.views = undefined;
    x.parts = undefined;
  });
  done(id);
}

// The edited picture goes on to 3D.
export async function meshAsset(id: string, rawAid: string) {
  const aid = Aid.parse(rawAid);
  const a = (await getProject(id))?.sceneAssets?.find((x) => x.id === aid);
  if (!a?.image) throw new Error("The object has no picture yet.");
  await updateProject(id, (q) => {
    const x = q.sceneAssets?.find((y) => y.id === aid);
    if (x) x.hold = false;
  });
  await startJob(id, jobKey(aid), (ctx) => build(id, aid, ctx), `Making the ${a.name}`);
  done(id);
}

const Placement = z.object({
  at: z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Number.isFinite(x) && Math.abs(x) < 500), "The spot is off the stage."),
  height: z.number().min(0.1).max(10),
  turn: z.number().min(-180).max(180),
});

// Where an asset stands, how tall, which way it faces. Saved as it is placed.
export async function placeAsset(id: string, rawAid: string, raw: unknown) {
  const aid = Aid.parse(rawAid);
  const place = Placement.parse(raw);
  await updateProject(id, (q) => {
    const a = q.sceneAssets?.find((x) => x.id === aid);
    if (!a) throw new Error("No such asset.");
    Object.assign(a, place);
  });
  done(id);
}

// Off the scene (its files stay on disk).
export async function deleteAsset(id: string, rawAid: string) {
  const aid = Aid.parse(rawAid);
  await updateProject(id, (q) => {
    if (q.jobs[jobKey(aid)]?.status === "running") throw new Error("It is still being made; cancel that first.");
    q.sceneAssets = (q.sceneAssets ?? []).filter((x) => x.id !== aid);
  });
  done(id);
}

export async function cancelAsset(id: string, rawAid: string) {
  await cancelJob(id, jobKey(Aid.parse(rawAid)));
  done(id);
}
