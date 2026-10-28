"use server";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { redirect } from "next/navigation";
import { cropBox, maskBox, pngSize, removePrompt, type Box } from "@/lib/brush";
import { parentIn, stackMoves } from "@/lib/history";
import { mergeParts, partsFromTags } from "@/lib/parts";
import { getProject, projectDir, updateProject, type Edit, type Project, type Version, type ViewId } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { Count, Index, Prompt, REFERENCE_TYPES, StyleId, referenceError } from "../schemas";

const rel = (id: string, files: string[]) => files.map((f) => path.relative(projectDir(id), f));
const abs = (id: string, file: string) => path.join(projectDir(id), file);
const stamp = () => Date.now().toString(36);
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/turnaround`);
};

// What an edit works on: the character, or one turnaround view ("view:side"). Each is a stack
// of versions with a current one; the edit actions below take the target and work on its stack.
const Target = z.union([z.literal("character"), z.string().regex(/^view:(front|threequarter|side|back|top|bottom)$/)]);
type Stack = { versions: Version[]; current: number | null };
function stackOf(p: Project, target: string): Stack {
  if (target === "character") return p.character;
  const s = p.turnaround?.views[target.slice(5) as ViewId];
  if (!s) throw new Error("Paint the turnaround first.");
  return s;
}
// Job keys and output folders per target, so a view's edit never blocks the character's.
const keyOf = (target: string, key: string) => (target === "character" ? key : `${target}:${key}`);
const dirOf = (target: string) => (target === "character" ? "character" : `turnaround/${target.slice(5)}`);
// A new version made from version `at` becomes the current one.
const pushVersion = (q: Project, target: string, v: Version) => {
  const s = stackOf(q, target);
  s.versions.push(v);
  s.current = s.versions.length - 1;
  return s.current;
};

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

function currentVersion(s: Stack) {
  if (s.current === null || !s.versions[s.current]) throw new Error("Pick a concept first.");
  return s.versions[s.current];
}

const sketchPrompt = (prompt: string, style: string) =>
  `Turn this sketch into finished full-body character concept art of ${prompt}. Keep the pose, proportions and silhouette of the sketch. A face with eyes, nose and mouth, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

// "A face with eyes, nose and mouth": flat styles (pixel art, low poly) otherwise often leave the
// face blank (2026-10-27, a pixel-art elf).
const conceptPrompt = (prompt: string, style: string) =>
  `Full-body character concept art of ${prompt}. Standing, neutral pose, front view, whole figure in frame, a face with eyes, nose and mouth, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;




export async function generateConcepts(id: string, options: { reseed?: boolean; style?: string; prompt?: string; count?: number } = {}) {
  const p = await load(id);
  const count = options.count !== undefined ? Count.parse(options.count) : (p.character.count ?? 4);
  const style = options.style ? StyleId.parse(options.style) : p.character.style;
  const prompt = options.prompt !== undefined ? Prompt.parse(options.prompt) : p.character.prompt;
  const seed = options.reseed || options.style || options.prompt !== undefined ? newSeed() : p.character.seed;
  const reference = p.character.reference;
  await startJob(id, "concepts", async ({ track, alive }) => {
    let files: string[];
    if (reference) {
      // From a sketch: Qwen-Image-Edit paints over it, one image per run, a new seed each.
      files = [];
      for (let i = 0; i < count; i++) {
        const [f] = await runWorkflow({
          onSubmit: track,
          workflow: "01_edit.api.json",
          set: [["17", "prompt", sketchPrompt(prompt, style)], ["22", "seed", seed + i]],
          images: [["1", abs(id, reference)]],
          output: "28",
          outDir: abs(id, `character/concepts/${seed}/${i}`),
        });
        files.push(f);
        if (!(await alive())) return;
      }
    } else {
      files = await runWorkflow({
        onSubmit: track,
        workflow: "01_concept.api.json",
        set: [["5", "text", conceptPrompt(prompt, style)], ["8", "seed", seed], ["7", "batch_size", count]],
        output: "10",
        outDir: abs(id, `character/concepts/${seed}`),
      });
    }
    if (!(await alive())) return; // cancelled after ComfyUI had already finished
    await updateProject(id, (q) => {
      const c = q.character;
      // The set on screen moves to the history; nothing the user saw is thrown away.
      if (c.concepts.length) (c.sets ??= []).push({ prompt: c.prompt, style: c.style, seed: c.seed, images: c.concepts });
      c.prompt = prompt;
      c.seed = seed;
      c.style = style;
      c.concepts = rel(id, files);
    });
  }, style);
  if (count !== p.character.count) await updateProject(id, (q) => void (q.character.count = count));
  done(id);
}


// A drawn sketch or an uploaded image; later concepts follow its pose and silhouette.
export async function setReference(id: string, form: FormData) {
  const image = form.get("image");
  const bad = referenceError(image);
  if (bad || !(image instanceof File)) throw new Error(bad ?? "The image did not come through.");
  await load(id);
  const file = abs(id, `character/reference/${stamp()}.${REFERENCE_TYPES[image.type]}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await image.arrayBuffer()));
  await updateProject(id, (q) => void (q.character.reference = rel(id, [file])[0]));
  done(id);
}

export async function clearReference(id: string) {
  await updateProject(id, (q) => void delete q.character.reference);
  done(id);
}

// Florence-2 lists what it sees; the chips for this version come from that.
// What Florence-2 sees in an image, as part names.
async function readTags(id: string, image: string, ctx?: JobCtx, target = "character") {
  const [file] = await runWorkflow({
    onSubmit: ctx?.track,
    workflow: "01_tags.api.json",
    images: [["1", abs(id, image)]],
    output: "4",
    outDir: abs(id, `${dirOf(target)}/tags/${stamp()}`),
    ext: "txt",
  });
  return partsFromTags(await readFile(file, "utf8"));
}

// Florence only names parts from a fixed list; what has a mask, or was just added, always stays.
function mergeTags(found: string[], v: Pick<Version, "parts" | "tags" | "edit">) {
  const pinned = [...Object.keys(v.parts), ...(v.edit?.kind === "add" && v.tags?.length ? [v.tags.at(-1)!] : [])];
  const merged = mergeParts(found, v.tags);
  return [...new Set([...merged, ...pinned])];
}

async function tagVersion(id: string, at: number, image: string, ctx?: JobCtx, target = "character") {
  const found = await readTags(id, image, ctx, target);
  await updateProject(id, (q) => {
    const v = stackOf(q, target).versions[at];
    if (v) v.tags = mergeTags(found, v);
  });
}

// set: index into character.sets for an earlier set; omitted = the set on screen.
export async function pickConcept(id: string, rawIndex: number, rawSet?: number) {
  const index = Index.parse(rawIndex);
  const set = rawSet === undefined ? undefined : Index.parse(rawSet);
  const p = await updateProject(id, (q) => {
    const images = set === undefined ? q.character.concepts : q.character.sets?.[set]?.images;
    const image = images?.[index];
    if (!image) throw new Error("No such concept.");
    // Picking the same image again just goes back to that version.
    const existing = q.character.versions.findIndex((v) => v.image === image);
    if (existing >= 0) {
      q.character.current = existing;
      return;
    }
    q.character.versions.push({ image, label: `Concept ${index + 1}${set === undefined ? "" : ` · set ${set + 1}`}`, parts: {} });
    q.character.current = q.character.versions.length - 1;
  });
  const at = p.character.current!;
  if (!p.character.versions[at].tags) await startJob(id, "tags", (ctx) => tagVersion(id, at, p.character.versions[at].image, ctx)).catch(() => {});
  done(id);
}

export async function selectVersion(id: string, rawIndex: number, rawTarget = "character") {
  const index = Index.parse(rawIndex);
  const target = Target.parse(rawTarget);
  await updateProject(id, (p) => {
    const s = stackOf(p, target);
    if (!s.versions[index]) throw new Error("No such version.");
    s.current = index;
  });
  done(id);
}

const Part = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/, "Use plain words, e.g. coat.");

export async function maskPart(id: string, rawPart: string, rawTarget = "character") {
  const part = Part.parse(rawPart);
  const target = Target.parse(rawTarget);
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  const version = currentVersion(stack);
  if (Object.hasOwn(version.parts, part)) return;
  await startJob(id, keyOf(target, "mask"), async ({ track, alive }) => {
    const [mask] = await runWorkflow({
      onSubmit: track,
      workflow: "01_parts.api.json",
      set: [["2", "prompt", part]],
      images: [["1", abs(id, version.image)]],
      output: "4",
      outDir: abs(id, `${dirOf(target)}/masks/${stamp()}-${part.replace(/ /g, "-")}`),
    });
    if (!(await alive())) return; // cancelled after ComfyUI had already finished
    await updateProject(id, (q) => {
      stackOf(q, target).versions[at].parts[part] = rel(id, [mask])[0];
    });
  });
  done(id);
}

// The bounding box of the strokes, in the image's own pixels.
const Strokes = z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() });

// What was added, as a part name for the chips: "a small red bird perched on the shoulder" -> "small red bird".
const POSE = /^(perched|sitting|standing|resting|hanging|flying|held|worn|attached|placed|tucked|strapped|tied)$/;
const partName = (thing: string) => {
  const words = thing.toLowerCase().split(/\s+(?:on|with|in|at|to|near|over|under|holding|by)\s+/)[0].replace(/[^a-z \-]/g, " ").split(/\s+/).filter((w) => w && !["a", "an", "the", "some", "two", "pair", "of"].includes(w));
  while (words.length > 1 && POSE.test(words.at(-1)!)) words.pop();
  const name = words.slice(-3).join(" ").slice(0, 40).trim();
  return Part.safeParse(name).success ? name : null;
};

// One edit run, from version `at` of a stack. Each runner makes the new version and records the
// edit with its inputs, so Try again can run it once more from the same version with a new seed.
type Run = { id: string; target: string; at: number; version: Version; ctx: JobCtx };

// A finished edit becomes the new current version only once it is complete (its new part found,
// its tags read), so the page shows it once, when the loader ends, not half-way through the job.
async function finish(r: Run, image: string, v: Omit<Version, "image" | "parts" | "parent">, extra?: { name: string; ctx: JobCtx }) {
  const parts: Record<string, string> = {};
  // An added thing becomes a part at once: SAM 3 finds it on the new image.
  if (extra) {
    const [m] = await runWorkflow({ onSubmit: r.ctx.track, workflow: "01_parts.api.json", set: [["2", "prompt", extra.name]], images: [["1", abs(r.id, image)]], output: "4", outDir: abs(r.id, `${dirOf(r.target)}/masks/${stamp()}-${extra.name.replace(/ /g, "-")}`) });
    if (await maskBox(m)) parts[extra.name] = rel(r.id, [m])[0];
  }
  const found = await readTags(r.id, image, r.ctx, r.target);
  if (!(await r.ctx.alive())) return;
  await updateProject(r.id, (q) => {
    const version = { image, parts, parent: r.at, ...v };
    pushVersion(q, r.target, { ...version, tags: mergeTags(found, version) });
  });
}

// Add inside the painted shape (01_fill): the shape is blanked grey inside a crop, Qwen paints the
// thing filling it, and the shape plus a soft 40 px margin is pasted back, so what is added is
// drawn whole where you painted and is not cut at its edges. "Placeholder ... no grey left" stops a
// grey ring staying around it (2026-10-27, a skull in a hand). Edits made before there was a mask
// fall back to the whole-crop paste (01_brush).
const addPrompt = (thing: string, about: string) =>
  `${about} The flat grey shape is a placeholder: replace all of it. Paint ${thing} inside it, whole and sized to fill most of it, nothing cut off; the rest of the grey becomes what is around it, continuing the background and the character. No grey left. Same art style, lighting and colours as the rest of the picture; ${keepFace(thing)}everything outside the shape stays exactly the same.`;

// Add and Change edit a close-up crop, so Qwen does not see the whole character: it is told what
// the picture is and to keep to the picture's own look, or it paints in its own (2026-10-27: a face
// added to a flat, blocky pixel-art elf came back as a smooth, detailed cartoon face). The style
// chip is not named: the picture is what counts, and the chip can disagree with the prompt
// ("pixal art lady elf" made with Painterly).
async function about(id: string) {
  const c = (await load(id)).character;
  return `This is a close-up of a character: ${c.prompt}, ${styleById(c.style).phrase}. Match this picture's own art style exactly: the same shapes, level of detail, line work, shading and palette, nothing more detailed or realistic than the rest of it.`;
}
// The face stays (eyes, nose, mouth), unless the edit is about the face itself.
const FACE = /\b(face|head|eyes?|nose|mouth|lips|expression|glasses|mask|makeup|beard)\b/i;
const keepFace = (...words: string[]) => (FACE.test(words.join(" ")) ? "" : "the face keeps its eyes, nose and mouth exactly as they are; ");

async function runAdd(r: Run, thing: string, strokes: Box, mask?: string) {
  const source = abs(r.id, r.version.image);
  const picture = await about(r.id);
  const outDir = abs(r.id, `${dirOf(r.target)}/brush/${stamp()}`);
  let image: string;
  if (mask) {
    const box = cropBox(strokes, await pngSize(source), { grow: 2.0, min: 448 });
    const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
    [image] = await runWorkflow({
      workflow: "01_fill.api.json",
      onSubmit: r.ctx.track,
      set: [["17", "prompt", addPrompt(thing, picture)], ["22", "seed", newSeed()], ...crop("4"), ...crop("5"), ["27", "x", box.x], ["27", "y", box.y]],
      images: [["1", source], ["2", abs(r.id, mask)]],
      output: "28",
      outDir,
    });
  } else {
    const box = cropBox(strokes, await pngSize(source), { grow: 2.2, min: 448 });
    [image] = await runWorkflow({
      workflow: "01_brush.api.json",
      onSubmit: r.ctx.track,
      set: [
        ["17", "prompt", `${picture} Add ${thing}. Draw all of it, small enough to fit inside this picture, in the same art style; ${keepFace(thing)}everything else keeps exactly the same size, position, art style and lighting.`],
        ["22", "seed", newSeed()],
        ["4", "x", box.x], ["4", "y", box.y], ["4", "width", box.width], ["4", "height", box.height],
        ["27", "x", box.x], ["27", "y", box.y],
      ],
      images: [["1", source]],
      output: "28",
      outDir,
    });
  }
  if (!(await r.ctx.alive())) return;
  const name = partName(thing);
  await finish(r, rel(r.id, [image])[0], { label: `+ ${thing}`, tags: name ? [...(r.version.tags ?? []), name] : r.version.tags, edit: { kind: "add", what: "", change: thing, box: strokes, ...(mask ? { mask } : {}) } }, name ? { name, ctx: r.ctx } : undefined);
}

// Change in a close-up (01_change): a crop around the selection is edited at full size, so small
// parts (hands, a buckle) really change. The old part is greyed out first, as Add does: shown the
// old part, Qwen painted the new one over a faint copy of it (2026-10-28, a club came out ghosted).
// The selection plus 64 px with a 6 px edge is pasted back, so a bigger new part is not faded out.
async function runChange(r: Run, what: string, change: string, mask: string) {
  const old = what === "selection" ? "what was there" : `the ${what}`;
  const prompt = `${await about(r.id)} The flat grey shape is where ${old} was: replace all of it. Paint ${change} there, whole, solid and attached naturally, filling the shape; the rest of the grey becomes what is around it. No grey left. The pose stays; ${keepFace(what, change)}${what === "selection" ? "everything else" : "every other part"} and the background stay exactly the same.`;
  const source = abs(r.id, r.version.image);
  const strokes = await maskBox(abs(r.id, mask));
  if (!strokes) throw new Error("The selection is empty; paint or pick a part first.");
  const box = cropBox(strokes, await pngSize(source), { grow: 2.0, min: 448 });
  const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
  const [image] = await runWorkflow({
    onSubmit: r.ctx.track,
    workflow: "01_change.api.json",
    set: [["17", "prompt", prompt], ["22", "seed", newSeed()], ...crop("4"), ...crop("5"), ["27", "x", box.x], ["27", "y", box.y]],
    images: [["1", source], ["2", abs(r.id, mask)]],
    output: "28",
    outDir: abs(r.id, `${dirOf(r.target)}/swaps/${stamp()}`),
  });
  if (!(await r.ctx.alive())) return;
  await finish(r, rel(r.id, [image])[0], { label: `${what} → ${change}`, tags: r.version.tags, edit: { kind: "change", what: what === "selection" ? "" : what, change, mask } });
}

// Remove = inpainting: the selection is blanked inside a crop, Qwen fills what was underneath, and
// only the selection's pixels are pasted back (01_remove).
async function runRemove(r: Run, what: string, strokes: Box, mask: string) {
  const source = abs(r.id, r.version.image);
  const box = cropBox(strokes, await pngSize(source));
  const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
  const [image] = await runWorkflow({
    onSubmit: r.ctx.track,
    workflow: "01_remove.api.json",
    set: [["17", "prompt", removePrompt(what)], ["22", "seed", newSeed()], ...crop("4"), ...crop("5"), ["27", "x", box.x], ["27", "y", box.y]],
    images: [["1", source], ["2", abs(r.id, mask)]],
    output: "28",
    outDir: abs(r.id, `${dirOf(r.target)}/removes/${stamp()}`),
  });
  if (!(await r.ctx.alive())) return;
  await finish(r, rel(r.id, [image])[0], { label: `− ${what || "selection"}`, tags: r.version.tags?.filter((t) => t !== what), edit: { kind: "remove", what, mask, box: strokes } });
}

// The browser's selection (a part's mask plus/minus brush strokes) saved beside the stack.
async function saveSelection(id: string, target: string, mask: FormDataEntryValue | null) {
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const file = abs(id, `${dirOf(target)}/selections/${stamp()}/mask.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await mask.arrayBuffer()));
  return rel(id, [file])[0];
}

const jobFor = (kind: Edit["kind"]) => (kind === "change" ? "swap" : "brush");

async function start(id: string, target: string, kind: Edit["kind"], detail: string, work: (r: Run) => Promise<void>) {
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  const version = currentVersion(stack);
  await startJob(id, keyOf(target, jobFor(kind)), (ctx) => work({ id, target, at, version, ctx }), detail);
  done(id);
}

// Add with the brush (remove goes through removeSelection, which has the exact mask).
// Add something inside the painted selection: the browser sends the mask and its box.
export async function addSelection(id: string, form: FormData, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const thing = z.string().trim().min(2, "Say what to add.").max(200).parse(form.get("thing"));
  let box0: unknown = null;
  try { box0 = JSON.parse(String(form.get("box") ?? "null")); } catch {}
  const strokes = Strokes.parse(box0);
  const mask = await saveSelection(id, target, form.get("mask"));
  await start(id, target, "add", `Painting ${thing}`, (r) => runAdd(r, thing, strokes, mask));
}

// Change the selection: the browser sends the final mask; Qwen repaints a close-up (01_change).
export async function repaintSelection(id: string, form: FormData, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const change = z.string().trim().min(3, "Say what it should become.").max(300).parse(form.get("change"));
  const what = z.string().trim().max(40).parse(form.get("what") ?? "") || "selection";
  const mask = await saveSelection(id, target, form.get("mask"));
  await start(id, target, "change", `Repainting the ${what}`, (r) => runChange(r, what, change, mask));
}

export async function removeSelection(id: string, form: FormData, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const what = z.string().trim().max(40).parse(form.get("what") ?? "");
  let box0: unknown = null;
  try { box0 = JSON.parse(String(form.get("box") ?? "null")); } catch {}
  const strokes = Strokes.parse(box0);
  const mask = await saveSelection(id, target, form.get("mask"));
  await start(id, target, "remove", `Removing ${what ? `the ${what}` : "the selection"}`, (r) => runRemove(r, what, strokes, mask));
}

// Try again: the current version's edit, run once more from the version it was made from, with a
// new seed. The result is a new version beside it; the one you did not like stays in the history.
export async function retryEdit(id: string, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const stack = stackOf(await load(id), target);
  const v = stack.versions[stack.current ?? -1];
  const e = v?.edit;
  if (!v || !e || v.parent === undefined) throw new Error("Nothing to try again here.");
  const at = v.parent;
  const version = stack.versions[at];
  const run = (work: (r: Run) => Promise<void>) =>
    startJob(id, keyOf(target, jobFor(e.kind)), (ctx) => work({ id, target, at, version, ctx }), `Trying ${v.label} again`);
  if (e.kind === "add" && e.box) await run((r) => runAdd(r, e.change ?? "", e.box!, e.mask));
  else if (e.kind === "change" && e.mask) await run((r) => runChange(r, e.what || "selection", e.change ?? "", e.mask!));
  else if (e.kind === "remove" && e.mask && e.box) await run((r) => runRemove(r, e.what, e.box!, e.mask!));
  else throw new Error("This edit was made before Try again existed; do it once more by hand.");
  done(id);
}

// A painted selection becomes a named part of this version, like the ones Florence-2 found.
export async function savePart(id: string, form: FormData, rawTarget = "character") {
  const name = Part.parse(form.get("name"));
  const target = Target.parse(rawTarget);
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  currentVersion(stack);
  const file = abs(id, `${dirOf(target)}/masks/${stamp()}-${name.replace(/ /g, "-")}/00.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await mask.arrayBuffer()));
  await updateProject(id, (q) => {
    const v = stackOf(q, target).versions[at];
    v.parts[name] = rel(id, [file])[0];
    v.tags = [...(v.tags ?? []).filter((t) => t !== name), name];
  });
  done(id);
}

// Restyle the chosen character, not new concepts: same design and pose, another look.
export async function restyleCurrent(id: string, rawStyle: string) {
  const style = styleById(StyleId.parse(rawStyle));
  await repaintWhole(
    id,
    style,
    `Repaint this exact character as ${style.phrase}. Keep the same design, outfit, proportions, pose and the plain background; colours and rendering follow the new style.`,
    `Style: ${style.label}`,
    `Repainting as ${style.label}`,
  );
}

// Rebuild: after edits, each changed or added part can look a little different from the rest (each
// edit is its own close-up). One pass over the whole picture in the character's own style makes it
// read as one painting again. A new version: Undo brings the edited one back.
export async function rebuildStyle(id: string) {
  const style = styleById((await load(id)).character.style ?? "painterly");
  await repaintWhole(
    id,
    style,
    `Repaint this exact character as one consistent picture in ${style.phrase}: every part, including any that look newer or different, drawn with the same shapes, line work, shading, level of detail and lighting as the whole. Keep the same design, outfit, colours, proportions, pose and the plain background; change nothing else.`,
    `Rebuilt · ${style.label}`,
    `Rebuilding in one ${style.label.toLowerCase()} style`,
  );
}

// The whole picture through 01_edit as a new version made from the current one; it becomes the
// character's style.
async function repaintWhole(id: string, style: ReturnType<typeof styleById>, prompt: string, label: string, detail: string) {
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p.character);
  await startJob(
    id,
    "restyle",
    async (ctx) => {
      const [image] = await runWorkflow({
        onSubmit: ctx.track,
        workflow: "01_edit.api.json",
        set: [
          ["17", "prompt", prompt],
          ["22", "seed", newSeed()],
        ],
        images: [["1", abs(id, version.image)]],
        output: "28",
        outDir: abs(id, `character/restyles/${stamp()}-${style.id}`),
      });
      if (!(await ctx.alive())) return;
      await updateProject(id, (q) => {
        q.character.versions.push({ image: rel(id, [image])[0], label, parts: {}, tags: version.tags, parent: at });
        q.character.current = q.character.versions.length - 1;
        q.character.style = style.id; // later edits and the style chips follow the new look
      });
    },
    detail,
  );
  done(id);
}

// Undo goes to the version this one was made from; Redo to the newest version made from this one.
export async function undo(id: string, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  await updateProject(id, (p) => {
    const s = stackOf(p, target);
    const to = s.current === null ? null : parentIn(s.versions, s.current);
    if (to !== null) s.current = to;
  });
  done(id);
}

export async function redo(id: string, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  await updateProject(id, (p) => {
    const s = stackOf(p, target);
    const to = stackMoves(s).redo;
    if (to !== null) s.current = to;
  });
  done(id);
}

const JobKey = z.enum(["concepts", "mask", "swap", "tags", "brush", "restyle"]);

export async function cancel(id: string, key: string, rawTarget = "character") {
  await cancelJob(id, keyOf(Target.parse(rawTarget), JobKey.parse(key)));
  done(id);
}

// Next: this version is the character. Later steps read character.versions[current].
export async function finishCharacter(id: string) {
  await updateProject(id, (p) => {
    if (p.character.current === null) throw new Error("Pick a concept first.");
    p.character.doneAt = new Date().toISOString();
  });
  redirect(`/p/${id}/scene`);
}
