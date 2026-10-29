// Proof for Layout-to-Render takes: the shot's clay clip (Shots > Draw the clay clip) as the
// full-length guide and its painted first key as the reference (frame -1), LTX-2.5 distilled with
// the Layout-to-Render IC-LoRA (workflows/03_shot_layout.api.json). Writes the take's MP4.
// Run: node --env-file=.env scripts/try-layout.ts [projectId] "what happens"
import path from "node:path";
import { readFileSync } from "node:fs";
import { runWorkflow } from "../lib/comfy.ts";

const id = process.argv[2] ?? "c4a7105e01";
const action = process.argv[3] ?? "walks slowly down the alley, looking around, the coat stirring in the wind";
const dir = path.join(process.cwd(), "data", "projects", id);
const p = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
if (!p.layout?.clip) throw new Error(`${id} has no clay clip: draw it in Shots first`);
if (!p.keyframes?.keys?.[0]) throw new Error(`${id} has no painted first key`);
const frames = p.layout.frames as number;
// One or two sentences of the finished shot, matching the first frame; never "clay", "3D" or "Unreal" (the card).
const prompt = `The camera pushes in slowly down ${p.set.prompt.split(":")[0]} toward ${p.character.prompt}, who ${action}. Rain falls, the wet cobbles shine.`;
const t0 = performance.now();
const [file] = await runWorkflow({
  workflow: "03_shot_layout.api.json",
  edit: (g) => {
    g["30"].inputs.length = frames;
    g["33"].inputs.frames_number = frames;
  },
  set: [["20", "text", prompt], ["21", "text", "worst quality, inconsistent motion, blurry, jittery, distorted"], ["40", "noise_seed", 42]],
  images: [["1", path.join(dir, p.keyframes.keys[0])]],
  videos: [["401", path.join(dir, p.layout.clip)]],
  output: "55",
  ext: "mp4",
  outDir: path.join(process.cwd(), "data", "proof", "layout", id),
  timeoutMs: 25 * 60_000,
});
console.log(`layout take: ${((performance.now() - t0) / 1000).toFixed(0)}s, ${frames} frames -> ${file}\n  prompt: ${prompt}`);
