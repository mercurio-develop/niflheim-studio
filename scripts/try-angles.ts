// Turnaround prompt test: angles LoRA on vs off, character-turn wording.
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";
const src = path.join(process.cwd(), "data/proof/swap/00.png");
const views = {
  side: "Turn the character to face left, showing a full-body left side profile view. Same character, same outfit, same proportions, standing upright, same plain grey background.",
  back: "Turn the character around to show a full-body back view, seen from behind. Same character, same outfit, same proportions, standing upright, same plain grey background.",
};
for (const lora of [0, 1]) for (const [name, prompt] of Object.entries(views)) {
  const t0 = performance.now();
  const f = await runWorkflow({
    workflow: "01_angle.api.json",
    set: [["17", "prompt", prompt], ["22", "seed", 7], ["9", "strength_model", lora]],
    images: [["1", src]], output: "28", outDir: path.join(process.cwd(), `data/proof/turn-${name}-lora${lora}`),
  });
  console.log(name, "lora", lora, ((performance.now() - t0) / 1000).toFixed(1) + "s", f[0]);
}
