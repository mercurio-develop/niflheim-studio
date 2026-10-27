"use server";

import path from "node:path";
import { readFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { redirect } from "next/navigation";
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

const conceptPrompt = (prompt: string, style: string) =>
  `Full-body character concept art of ${prompt}. Standing, neutral pose, front view, whole figure in frame, plain light grey background, clean silhouette. ${styleById(style).phrase}.`;

const StyleId = z.enum(STYLES.map((s) => s.id) as [string, ...string[]]);

export async function generateConcepts(id: string, options: { reseed?: boolean; style?: string } = {}) {
  const p = await load(id);
  const style = options.style ? StyleId.parse(options.style) : p.character.style;
  const seed = options.reseed || options.style ? newSeed() : p.character.seed;
  await startJob(id, "concepts", async ({ track }) => {
    const files = await runWorkflow({
      onSubmit: track,
      workflow: "01_concept.api.json",
      set: [["5", "text", conceptPrompt(p.character.prompt, style)], ["8", "seed", seed]],
      output: "10",
      outDir: abs(id, `character/concepts/${seed}`),
    });
    await updateProject(id, (q) => {
      q.character.seed = seed;
      q.character.style = style;
      q.character.concepts = rel(id, files);
    });
  });
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

export async function pickConcept(id: string, index: number) {
  const p = await updateProject(id, (q) => {
    const image = q.character.concepts[index];
    if (!image) throw new Error("No such concept.");
    q.character.versions.push({ image, label: `Concept ${index + 1}`, parts: {} });
    q.character.current = q.character.versions.length - 1;
  });
  const at = p.character.current!;
  await startJob(id, "tags", (ctx) => tagVersion(id, at, p.character.versions[at].image, ctx)).catch(() => {});
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
  await startJob(id, "mask", async ({ track }) => {
    const [mask] = await runWorkflow({
      onSubmit: track,
      workflow: "01_parts.api.json",
      set: [["2", "prompt", part]],
      images: [["1", abs(id, version.image)]],
      output: "4",
      outDir: abs(id, `character/masks/${stamp()}-${part.replace(/ /g, "-")}`),
    });
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
    const q = await updateProject(id, (q) => {
      q.character.versions.push({ image: rel(id, [image])[0], label: `${part} → ${change}`, parts: {}, tags: version.tags });
      q.character.current = q.character.versions.length - 1;
    });
    await tagVersion(id, q.character.current!, q.character.versions[q.character.current!].image, ctx);
  });
  done(id);
}

const JobKey = z.enum(["concepts", "mask", "swap", "tags"]);

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
