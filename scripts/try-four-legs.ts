// Proof for four-legged characters: an animal's turnaround painted with the animal prompts
// (lib/progress.ts with body "animal"): the side first, on all four legs, then every other view
// turned from it, as generateTurnaround does.
// Run: node --env-file=.env scripts/try-four-legs.ts <image> [outName]
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";
import { firstView, frontPrompt, viewPrompt } from "../lib/progress.ts";
import type { TurnaroundOptions, ViewId } from "../lib/store.ts";

const image = process.argv[2];
const out = path.join(process.cwd(), "data", "proof", "four-legs", process.argv[3] ?? "animal");
const o: TurnaroundOptions = { pose: "designed", hide: [], keep: [], extras: [], body: "animal" };
const edit = async (label: string, from: string, prompt: string) => {
  const [file] = await runWorkflow({ workflow: "01_edit.api.json", set: [["17", "prompt", prompt], ["22", "seed", 11]], images: [["1", from]], output: "28", outDir: path.join(out, label) });
  console.log(label, file);
  return file;
};
const first = firstView(o);
const anchor = await edit(first, image, frontPrompt(o));
await Promise.all((["front", "threequarter", "side", "back"] as ViewId[]).filter((v) => v !== first).map((v) => edit(v, anchor, viewPrompt(v, o))));
