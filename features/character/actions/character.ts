"use server";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { redirect } from "next/navigation";
import { cropBox, pngSize } from "@/lib/brush";
import { mergeParts, partsFromTags } from "@/lib/parts";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";
import { STYLES, styleById } from "@/lib/styles";

const rel = (id: string, files: string[]) => files.map((f) => path.relative(projectDir(id), f));
const abs = (id: string, file: string) => path.join(projectDir(id), file);
const stamp = () => Date.now().toString(36);
const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const done = (id: string) => revalidatePath(`/p/${id}/character`);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

function currentVersion(p: Project) {
  if (p.character.current === null) throw new Error("Pick a concept first.");
  return p.character.versions[p.character.current];
}

const sketchPrompt = (prompt: string, style: string) =>
  `Turn this sketch into finished full-body character concept art of ${prompt}. Keep the pose, proportions and silhouette of the sketch. Plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

const conceptPrompt = (prompt: string, style: string) =>
  `Full-body character concept art of ${prompt}. Standing, neutral pose, front view, whole figure in frame, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

const StyleId = z.enum(STYLES.map((s) => s.id) as [string, ...string[]]);

const Prompt = z.string().trim().min(3, "Describe your character in a few words.").max(600);

// 6 at 896x1152 still fits the 16 GB card next to Z-Image Turbo int8; 8 does not reliably.
const Count = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]);

export async function generateConcepts(id: string, options: { reseed?: boolean; style?: string; prompt?: string; count?: number } = {}) {
  const p = await load(id);
  const count = options.count !== undefined ? Count.parse(options.count) : (p.character.count ?? 4);
  if (count !== p.character.count) await updateProject(id, (q) => void (q.character.count = count));
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
          workflow: "01_sketch.api.json",
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
  done(id);
}

const REFERENCE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// A drawn sketch or an uploaded image; later concepts follow its pose and silhouette.
export async function setReference(id: string, form: FormData) {
  const image = form.get("image");
  if (!(image instanceof File) || !REFERENCE_TYPES[image.type] || image.size > 12_000_000) throw new Error("Use a PNG, JPG or WebP image under 12 MB.");
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
async function tagVersion(id: string, at: number, image: string, ctx?: JobCtx) {
  const [file] = await runWorkflow({
    onSubmit: ctx?.track,
    workflow: "01_tags.api.json",
    images: [["1", abs(id, image)]],
    output: "4",
    outDir: abs(id, `character/tags/${stamp()}`),
    ext: "txt",
  });
  const tags = partsFromTags(await readFile(file, "utf8"));
  await updateProject(id, (q) => {
    const v = q.character.versions[at];
    if (v) v.tags = mergeParts(tags, v.tags);
  });
}

// set: index into character.sets for an earlier set; omitted = the set on screen.
export async function pickConcept(id: string, index: number, set?: number) {
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

export async function selectVersion(id: string, index: number) {
  await updateProject(id, (p) => {
    if (!p.character.versions[index]) throw new Error("No such version.");
    p.character.current = index;
  });
  done(id);
}

const Part = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/, "Use plain words, e.g. coat.");

export async function maskPart(id: string, rawPart: string) {
  const part = Part.parse(rawPart);
  const p = await load(id);
  const at = p.character.current;
  const version = currentVersion(p);
  if (version.parts[part]) return;
  await startJob(id, "mask", async ({ track, alive }) => {
    const [mask] = await runWorkflow({
      onSubmit: track,
      workflow: "01_parts.api.json",
      set: [["2", "prompt", part]],
      images: [["1", abs(id, version.image)]],
      output: "4",
      outDir: abs(id, `character/masks/${stamp()}-${part.replace(/ /g, "-")}`),
    });
    if (!(await alive())) return; // cancelled after ComfyUI had already finished
    await updateProject(id, (q) => {
      q.character.versions[at!].parts[part] = rel(id, [mask])[0];
    });
  });
  done(id);
}

const SwapInput = z.object({
  part: Part,
  change: z.string().trim().min(3, "Say what it should become.").max(300),
});

export async function swapPart(id: string, input: { part: string; change: string }) {
  const { part, change } = SwapInput.parse(input);
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p);
  const mask = version.parts[part];
  if (!mask) throw new Error(`Find the ${part} first.`);
  const prompt = `Change only the ${part} into ${change}. Keep the face, pose, every other part and the background exactly the same.`;
  await startJob(id, "swap", async (ctx) => {
    const [image] = await runWorkflow({
      onSubmit: ctx.track,
      workflow: "01_swap.api.json",
      set: [["17", "prompt", prompt], ["22", "seed", newSeed()]],
      images: [["1", abs(id, version.image)], ["2", abs(id, mask)]],
      output: "28",
      outDir: abs(id, `character/swaps/${stamp()}`),
    });
    if (!(await ctx.alive())) return; // cancelled after ComfyUI had already finished
    const q = await updateProject(id, (q) => {
      q.character.versions.push({ image: rel(id, [image])[0], label: `${part} → ${change}`, parts: {}, tags: version.tags, parent: at });
      q.character.current = q.character.versions.length - 1;
    });
    await tagVersion(id, q.character.current!, q.character.versions[q.character.current!].image, ctx);
  });
  done(id);
}

const BrushInput = z.object({
  mode: z.enum(["add", "remove"]),
  thing: z.string().trim().max(200), // optional for remove: the strokes already say what
  // Bounding box of the strokes, in the image's own pixels.
  strokes: z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() }),
});

// The crop is centred on the strokes, so "in the centre" points Qwen at what was painted.
const brushPrompt = (mode: "add" | "remove", thing: string) =>
  mode === "add"
    ? `Add ${thing}. Keep everything else exactly the same, in the same art style and lighting.`
    : `Remove ${thing || "the object in the centre of the image"} and fill the space with what would be behind it. Keep everything else exactly the same, in the same art style.`;

export async function brushEdit(id: string, input: z.input<typeof BrushInput>) {
  const { mode, thing, strokes } = BrushInput.parse(input);
  if (mode === "add" && thing.length < 2) throw new Error("Say what to add.");
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p);
  const source = abs(id, version.image);
  const box = cropBox(strokes, await pngSize(source));
  await startJob(
    id,
    "brush",
    async (ctx) => {
      const [image] = await runWorkflow({
        workflow: "01_brush.api.json",
        onSubmit: ctx.track,
        set: [
          ["17", "prompt", brushPrompt(mode, thing)],
          ["22", "seed", newSeed()],
          ["4", "x", box.x], ["4", "y", box.y], ["4", "width", box.width], ["4", "height", box.height],
          ["27", "x", box.x], ["27", "y", box.y],
        ],
        images: [["1", source]],
        output: "28",
        outDir: abs(id, `character/brush/${stamp()}`),
      });
      if (!(await ctx.alive())) return; // cancelled after ComfyUI had already finished
      const q = await updateProject(id, (q) => {
        q.character.versions.push({ image: rel(id, [image])[0], label: `${mode === "add" ? "+" : "−"} ${thing || "selection"}`, parts: {}, tags: version.tags, parent: at });
        q.character.current = q.character.versions.length - 1;
      });
      await tagVersion(id, q.character.current!, q.character.versions[q.character.current!].image, ctx);
    },
    mode === "add" ? `Painting ${thing}` : `Removing ${thing || "the selection"}`,
  );
  done(id);
}

// Change the selection: the browser sends the final mask (a found part, plus and minus brush
// strokes), Qwen repaints the image, and only the mask's pixels are kept (01_swap).
export async function repaintSelection(id: string, form: FormData) {
  const change = z.string().trim().min(3, "Say what it should become.").max(300).parse(form.get("change"));
  const what = z.string().trim().max(40).parse(form.get("what") ?? "") || "selection";
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p);
  const maskFile = abs(id, `character/selections/${stamp()}/mask.png`);
  await mkdir(path.dirname(maskFile), { recursive: true });
  await writeFile(maskFile, Buffer.from(await mask.arrayBuffer()));
  const prompt =
    what === "selection"
      ? `Change the highlighted area into ${change}. Keep the face, pose, everything else and the background exactly the same.`
      : `Change only the ${what} into ${change}. Keep the face, pose, every other part and the background exactly the same.`;
  await startJob(
    id,
    "swap",
    async (ctx) => {
      const [image] = await runWorkflow({
        onSubmit: ctx.track,
        workflow: "01_swap.api.json",
        set: [["17", "prompt", prompt], ["22", "seed", newSeed()]],
        images: [["1", abs(id, version.image)], ["2", maskFile]],
        output: "28",
        outDir: abs(id, `character/swaps/${stamp()}`),
      });
      if (!(await ctx.alive())) return;
      const q = await updateProject(id, (q) => {
        q.character.versions.push({ image: rel(id, [image])[0], label: `${what} → ${change}`, parts: {}, tags: version.tags, parent: at });
        q.character.current = q.character.versions.length - 1;
      });
      await tagVersion(id, q.character.current!, q.character.versions[q.character.current!].image, ctx);
    },
    `Repainting the ${what}`,
  );
  done(id);
}

// Remove = inpainting: the selection is blanked inside a crop, Qwen removes the blank shape and
// fills what was behind it, and only the selection's pixels are pasted back (01_remove).
export async function removeSelection(id: string, form: FormData) {
  const what = z.string().trim().max(40).parse(form.get("what") ?? "");
  const strokes = BrushInput.shape.strokes.parse(JSON.parse(String(form.get("box") ?? "null")));
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p);
  const source = abs(id, version.image);
  const box = cropBox(strokes, await pngSize(source));
  const maskFile = abs(id, `character/selections/${stamp()}/mask.png`);
  await mkdir(path.dirname(maskFile), { recursive: true });
  await writeFile(maskFile, Buffer.from(await mask.arrayBuffer()));
  const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
  await startJob(
    id,
    "brush",
    async (ctx) => {
      const [image] = await runWorkflow({
        onSubmit: ctx.track,
        workflow: "01_remove.api.json",
        set: [
          ["17", "prompt", "Remove the flat grey shape completely and fill the space with what would be behind it: the character's body, clothing and the plain background, in the same art style. Do not add any new object."],
          ["22", "seed", newSeed()],
          ...crop("4"),
          ...crop("5"),
          ["27", "x", box.x],
          ["27", "y", box.y],
        ],
        images: [["1", source], ["2", maskFile]],
        output: "28",
        outDir: abs(id, `character/removes/${stamp()}`),
      });
      if (!(await ctx.alive())) return;
      const q = await updateProject(id, (q) => {
        q.character.versions.push({ image: rel(id, [image])[0], label: `− ${what || "selection"}`, parts: {}, tags: version.tags?.filter((t) => t !== what), parent: at });
        q.character.current = q.character.versions.length - 1;
      });
      await tagVersion(id, q.character.current!, q.character.versions[q.character.current!].image, ctx);
    },
    `Removing ${what ? `the ${what}` : "the selection"}`,
  );
  done(id);
}

// A painted selection becomes a named part of this version, like the ones Florence-2 found.
export async function savePart(id: string, form: FormData) {
  const name = Part.parse(form.get("name"));
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const p = await load(id);
  const at = p.character.current!;
  currentVersion(p);
  const file = abs(id, `character/masks/${stamp()}-${name.replace(/ /g, "-")}/00.png`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await mask.arrayBuffer()));
  await updateProject(id, (q) => {
    const v = q.character.versions[at];
    v.parts[name] = rel(id, [file])[0];
    v.tags = [...(v.tags ?? []).filter((t) => t !== name), name];
  });
  done(id);
}

// Restyle the chosen character, not new concepts: same design and pose, another look.
export async function restyleCurrent(id: string, rawStyle: string) {
  const style = styleById(StyleId.parse(rawStyle));
  const p = await load(id);
  const at = p.character.current!;
  const version = currentVersion(p);
  await startJob(
    id,
    "restyle",
    async (ctx) => {
      const [image] = await runWorkflow({
        onSubmit: ctx.track,
        workflow: "01_angle.api.json", // plain Qwen edit (the angles LoRA is switched off below)
        set: [
          ["17", "prompt", `Repaint this exact character as ${style.phrase}. Keep the same design, outfit, colours, proportions, pose and the plain background.`],
          ["22", "seed", newSeed()],
          ["9", "strength_model", 0],
        ],
        images: [["1", abs(id, version.image)]],
        output: "28",
        outDir: abs(id, `character/restyles/${stamp()}-${style.id}`),
      });
      if (!(await ctx.alive())) return;
      await updateProject(id, (q) => {
        q.character.versions.push({ image: rel(id, [image])[0], label: `Style: ${style.label}`, parts: {}, tags: version.tags, parent: at });
        q.character.current = q.character.versions.length - 1;
      });
    },
    `Repainting as ${style.label}`,
  );
  done(id);
}

// Undo goes to the version this one was made from; Redo to the newest version made from this one.
function parentOf(p: Project, i: number): number | null {
  const v = p.character.versions[i];
  if (v?.parent !== undefined) return v.parent;
  if (!v || v.label.startsWith("Concept")) return null;
  return i > 0 ? i - 1 : null; // versions from before parents were recorded
}

export async function undo(id: string) {
  await updateProject(id, (p) => {
    const to = p.character.current === null ? null : parentOf(p, p.character.current);
    if (to !== null) p.character.current = to;
  });
  done(id);
}

export async function redo(id: string) {
  await updateProject(id, (p) => {
    const at = p.character.current;
    if (at === null) return;
    const children = p.character.versions.map((_, i) => i).filter((i) => parentOf(p, i) === at);
    if (children.length) p.character.current = children[children.length - 1];
  });
  done(id);
}

const JobKey = z.enum(["concepts", "mask", "swap", "tags", "brush", "restyle"]);

export async function cancel(id: string, key: string) {
  await cancelJob(id, JobKey.parse(key));
  done(id);
}

// Next: this version is the character. Later steps read character.versions[current].
export async function finishCharacter(id: string) {
  await updateProject(id, (p) => {
    if (p.character.current === null) throw new Error("Pick a concept first.");
    p.character.doneAt = new Date().toISOString();
  });
  redirect(`/p/${id}/turnaround`);
}
