"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { startJob } from "@/lib/jobs";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";

const rel = (id: string, files: string[]) => files.map((f) => path.relative(projectDir(id), f));
const abs = (id: string, file: string) => path.join(projectDir(id), file);
const stamp = () => Date.now().toString(36);
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

const CONCEPT_FRAME =
  "Full-body character concept art of {prompt}. Standing, neutral pose, front view, whole figure in frame, plain light grey background, painterly, clean silhouette.";

export async function generateConcepts(id: string, reseed = false) {
  const p = await load(id);
  const seed = reseed ? Math.floor(Math.random() * 2 ** 31) : p.character.seed;
  await startJob(id, "concepts", async () => {
    const files = await runWorkflow({
      workflow: "01_concept.api.json",
      set: [["5", "text", CONCEPT_FRAME.replace("{prompt}", p.character.prompt)], ["8", "seed", seed]],
      output: "10",
      outDir: abs(id, `character/concepts/${seed}`),
    });
    await updateProject(id, (q) => {
      q.character.seed = seed;
      q.character.concepts = rel(id, files);
    });
  });
  done(id);
}

export async function pickConcept(id: string, index: number) {
  await updateProject(id, (p) => {
    const image = p.character.concepts[index];
    if (!image) throw new Error("No such concept.");
    p.character.versions.push({ image, label: `Concept ${index + 1}`, parts: {} });
    p.character.current = p.character.versions.length - 1;
  });
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
  await startJob(id, "mask", async () => {
    const [mask] = await runWorkflow({
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
  await startJob(id, "swap", async () => {
    const [image] = await runWorkflow({
      workflow: "01_swap.api.json",
      set: [["17", "prompt", prompt], ["22", "seed", Math.floor(Math.random() * 2 ** 31)]],
      images: [["1", abs(id, version.image)], ["2", abs(id, mask)]],
      output: "28",
      outDir: abs(id, `character/swaps/${stamp()}`),
    });
    await updateProject(id, (q) => {
      q.character.versions.push({ image: rel(id, [image])[0], label: `${part}: ${change}`, parts: {} });
      q.character.current = q.character.versions.length - 1;
    });
  });
  done(id);
}
