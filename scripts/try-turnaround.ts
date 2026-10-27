// Proof for turnaround-views: the front from the character with a pose and hidden objects, then
// the other views from that front, with the app's own prompts (lib/progress.ts).
// Run: node --env-file=.env scripts/try-turnaround.ts <character.png> [tpose|designed] [hide,comma,list]
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";
import { frontPrompt, viewPrompt, viewsFor } from "../lib/progress.ts";

const [image, pose = "tpose", hide = "shield"] = process.argv.slice(2);
const options = { pose: pose as "tpose" | "designed", hide: hide ? hide.split(",") : [], keep: [] as string[], extras: [] as ("top" | "bottom")[] };
const out = path.join(process.cwd(), "data", "proof", `turnaround-${Date.now().toString(36)}`);
const edit = async (from: string, prompt: string, name: string) => {
  const t0 = performance.now();
  const [f] = await runWorkflow({ workflow: "01_edit.api.json", set: [["17", "prompt", prompt], ["22", "seed", 7]], images: [["1", from]], output: "28", outDir: path.join(out, name) });
  console.log(name, ((performance.now() - t0) / 1000).toFixed(1) + "s", f);
  return f;
};
const front = await edit(path.resolve(image), frontPrompt(options), "front");
for (const v of viewsFor(options).slice(1)) await edit(front, viewPrompt(v.id, options), v.id);
console.log("out", out);
