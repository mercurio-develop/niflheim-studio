"use server";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { redirect } from "next/navigation";
import { cropBox, pngSize } from "@/lib/brush";
import { parentIn, stackMoves } from "@/lib/history";
import { mergeParts, partsFromTags } from "@/lib/parts";
import { getProject, projectDir, updateProject, type Project, type Version, type ViewId } from "@/lib/store";
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
  `Turn this sketch into finished full-body character concept art of ${prompt}. Keep the pose, proportions and silhouette of the sketch. Plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

const conceptPrompt = (prompt: string, style: string) =>
  `Full-body character concept art of ${prompt}. Standing, neutral pose, front view, whole figure in frame, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;




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
async function tagVersion(id: string, at: number, image: string, ctx?: JobCtx, target = "character") {
  const [file] = await runWorkflow({
    onSubmit: ctx?.track,
    workflow: "01_tags.api.json",
    images: [["1", abs(id, image)]],
    output: "4",
    outDir: abs(id, `${dirOf(target)}/tags/${stamp()}`),
    ext: "txt",
  });
  const tags = partsFromTags(await readFile(file, "utf8"));
  await updateProject(id, (q) => {
    const v = stackOf(q, target).versions[at];
    if (v) v.tags = mergeParts(tags, v.tags);
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

export async function brushEdit(id: string, input: z.input<typeof BrushInput>, rawTarget = "character") {
  const { mode, thing, strokes } = BrushInput.parse(input);
  const target = Target.parse(rawTarget);
  if (mode === "add" && thing.length < 2) throw new Error("Say what to add.");
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  const version = currentVersion(stack);
  const source = abs(id, version.image);
  const box = cropBox(strokes, await pngSize(source));
  await startJob(
    id,
    keyOf(target, "brush"),
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
        outDir: abs(id, `${dirOf(target)}/brush/${stamp()}`),
      });
      if (!(await ctx.alive())) return; // cancelled after ComfyUI had already finished
      let made = 0;
      await updateProject(id, (q) => {
        made = pushVersion(q, target, { image: rel(id, [image])[0], label: `${mode === "add" ? "+" : "−"} ${thing || "selection"}`, parts: {}, tags: version.tags, parent: at });
      });
      await tagVersion(id, made, rel(id, [image])[0], ctx, target);
    },
    mode === "add" ? `Painting ${thing}` : `Removing ${thing || "the selection"}`,
  );
  done(id);
}

// Change the selection: the browser sends the final mask (a found part, plus and minus brush
// strokes), Qwen repaints the image, and only the mask's pixels are kept (01_swap).
export async function repaintSelection(id: string, form: FormData, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const change = z.string().trim().min(3, "Say what it should become.").max(300).parse(form.get("change"));
  const what = z.string().trim().max(40).parse(form.get("what") ?? "") || "selection";
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  const version = currentVersion(stack);
  const maskFile = abs(id, `${dirOf(target)}/selections/${stamp()}/mask.png`);
  await mkdir(path.dirname(maskFile), { recursive: true });
  await writeFile(maskFile, Buffer.from(await mask.arrayBuffer()));
  const prompt =
    what === "selection"
      ? `Change the highlighted area into ${change}. Keep the face, pose, everything else and the background exactly the same.`
      : `Change only the ${what} into ${change}. Keep the face, pose, every other part and the background exactly the same.`;
  await startJob(
    id,
    keyOf(target, "swap"),
    async (ctx) => {
      const [image] = await runWorkflow({
        onSubmit: ctx.track,
        workflow: "01_swap.api.json",
        set: [["17", "prompt", prompt], ["22", "seed", newSeed()]],
        images: [["1", abs(id, version.image)], ["2", maskFile]],
        output: "28",
        outDir: abs(id, `${dirOf(target)}/swaps/${stamp()}`),
      });
      if (!(await ctx.alive())) return;
      let made = 0;
      await updateProject(id, (q) => {
        made = pushVersion(q, target, { image: rel(id, [image])[0], label: `${what} → ${change}`, parts: {}, tags: version.tags, parent: at });
      });
      await tagVersion(id, made, rel(id, [image])[0], ctx, target);
    },
    `Repainting the ${what}`,
  );
  done(id);
}

// Remove = inpainting: the selection is blanked inside a crop, Qwen removes the blank shape and
// fills what was behind it, and only the selection's pixels are pasted back (01_remove).
export async function removeSelection(id: string, form: FormData, rawTarget = "character") {
  const target = Target.parse(rawTarget);
  const what = z.string().trim().max(40).parse(form.get("what") ?? "");
  let box0: unknown = null;
  try { box0 = JSON.parse(String(form.get("box") ?? "null")); } catch {}
  const strokes = BrushInput.shape.strokes.parse(box0);
  const mask = form.get("mask");
  if (!(mask instanceof File) || mask.type !== "image/png" || mask.size > 8_000_000) throw new Error("The selection did not come through; try again.");
  const stack = stackOf(await load(id), target);
  const at = stack.current!;
  const version = currentVersion(stack);
  const source = abs(id, version.image);
  const box = cropBox(strokes, await pngSize(source));
  const maskFile = abs(id, `${dirOf(target)}/selections/${stamp()}/mask.png`);
  await mkdir(path.dirname(maskFile), { recursive: true });
  await writeFile(maskFile, Buffer.from(await mask.arrayBuffer()));
  const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
  await startJob(
    id,
    keyOf(target, "brush"),
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
        outDir: abs(id, `${dirOf(target)}/removes/${stamp()}`),
      });
      if (!(await ctx.alive())) return;
      let made = 0;
      await updateProject(id, (q) => {
        made = pushVersion(q, target, { image: rel(id, [image])[0], label: `− ${what || "selection"}`, parts: {}, tags: version.tags?.filter((t) => t !== what), parent: at });
      });
      await tagVersion(id, made, rel(id, [image])[0], ctx, target);
    },
    `Removing ${what ? `the ${what}` : "the selection"}`,
  );
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
          ["17", "prompt", `Repaint this exact character as ${style.phrase}. Keep the same design, outfit, colours, proportions, pose and the plain background.`],
          ["22", "seed", newSeed()],
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
  redirect(`/p/${id}/turnaround`);
}
