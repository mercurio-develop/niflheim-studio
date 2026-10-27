// Turnaround proof: the app's view prompts (lib/progress.ts VIEWS) on the plain edit graph.
// Run: node --env-file=.env scripts/try-angles.ts <front.png>
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";
import { VIEWS } from "../lib/progress.ts";

const src = path.resolve(process.argv[2] ?? "data/proof/swap/00.png");
for (const v of VIEWS) {
  const t0 = performance.now();
  const [f] = await runWorkflow({
    workflow: "01_edit.api.json",
    set: [["17", "prompt", v.prompt], ["22", "seed", 7]],
    images: [["1", src]],
    output: "28",
    outDir: path.join(process.cwd(), `data/proof/turn-${v.id}`),
  });
  console.log(v.id, ((performance.now() - t0) / 1000).toFixed(1) + "s", f);
}
