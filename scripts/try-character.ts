// Proof for 01_character: concept -> parts mask -> swap -> angle, through the Comfy SDK.
// Run: node --env-file=.env scripts/try-character.ts
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";

const out = (s: string) => path.join(process.cwd(), "data", "proof", s);
const t = () => performance.now();
let t0 = t();
const lap = (label: string, files: string[]) => {
  console.log(`${label}: ${((t() - t0) / 1000).toFixed(1)}s`, files);
  t0 = t();
};

const concepts = await runWorkflow({
  workflow: "01_concept.api.json",
  set: [
    ["5", "text", "Full-body character concept art of a young lantern keeper in a hooded wool coat, leather satchel, tall boots, holding an iron lantern, standing, neutral pose, front view, plain light grey background, painterly, clean silhouette"],
    ["8", "seed", 42],
  ],
  output: "10",
  outDir: out("concept"),
});
lap("concept x4", concepts);

const mask = await runWorkflow({
  workflow: "01_parts.api.json",
  set: [["2", "prompt", "coat"]],
  images: [["1", concepts[0]]],
  output: "4",
  outDir: out("parts-coat"),
});
lap("parts mask", mask);

const swap = await runWorkflow({
  workflow: "01_swap.api.json",
  set: [["17", "prompt", "Change only the coat into a red leather coat with brass buttons. Keep the face, pose, lantern, boots and background exactly the same."], ["22", "seed", 7]],
  images: [["1", concepts[0]], ["2", mask[0]]],
  output: "28",
  outDir: out("swap"),
});
lap("swap", swap);

const angle = await runWorkflow({
  workflow: "01_angle.api.json",
  set: [["17", "prompt", "Rotate the camera 90 degrees to the left."], ["22", "seed", 7]],
  images: [["1", swap[0]]],
  output: "28",
  outDir: out("angle-90l"),
});
lap("angle", angle);
