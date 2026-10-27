// Proof: Florence-2 PromptGen tags for a character image, through lib/comfy like the app.
// Run: node --env-file=.env scripts/try-tags.ts <image>
import path from "node:path";
import { readFile } from "node:fs/promises";
import { runWorkflow } from "../lib/comfy.ts";
import { partsFromTags } from "../lib/parts.ts";

const t0 = performance.now();
const [file] = await runWorkflow({
  workflow: "01_tags.api.json",
  images: [["1", path.resolve(process.argv[2])]],
  output: "4",
  outDir: path.join(process.cwd(), "data", "proof", `tags-${Date.now().toString(36)}`),
  ext: "txt",
});
const text = await readFile(file, "utf8");
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`);
console.log(text);
console.log("parts:", partsFromTags(text));
