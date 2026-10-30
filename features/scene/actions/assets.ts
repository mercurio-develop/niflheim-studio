"use server";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { REFERENCE_TYPES, referenceError } from "@/features/character/schemas";
import { meshFromViews, paintViews } from "@/lib/asset-3d";
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
const Kind = z.enum(["object", "character"]).default("object");
const Source = z.discriminatedUnion("from", [
  z.object({ from: z.literal("prompt"), name: Name, prompt: z.string().trim().min(3).max(300), kind: Kind }),
  z.object({ from: z.literal("upload"), name: Name, kind: Kind }),
  z.object({ from: z.literal("character"), name: Name, kind: Kind }),
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
  const src = Source.parse({ from: form.get("from"), name: form.get("name"), prompt: form.get("prompt") ?? undefined, kind: form.get("kind") ?? undefined });
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if ((p.sceneAssets?.length ?? 0) >= 12) throw new Error("A scene holds up to 12 assets.");
  const aid = stamp();
  // An object starts in proportion to the main character (a 1 m lantern towered over a 0.55 m fox).
  const near = Math.min(1, Math.max(0.3, (p.stage?.height ?? 1.7) * 0.6));
  const asset: SceneAsset = { id: aid, name: src.name, kind: src.kind, from: src.from, height: src.kind === "character" ? 1.7 : near, turn: 0 };
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
