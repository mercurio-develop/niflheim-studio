// Proof for Change (01_change): the selection is greyed out, repainted as the new part and pasted
// back solid: no faint copy of the old part, no faded ends.
// Run: node --env-file=.env scripts/try-edit.ts <image.png> <mask.png> "<what it becomes>" [seed]
import path from "node:path";
import { cropBox, maskBox, pngSize } from "../lib/brush.ts";
import { runWorkflow } from "../lib/comfy.ts";

const [image, mask, change, seed = "7"] = process.argv.slice(2);
const src = path.resolve(image);
const strokes = await maskBox(path.resolve(mask));
if (!strokes) throw new Error("empty mask");
const box = cropBox(strokes, await pngSize(src), { grow: 2.0, min: 448 });
const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
const t0 = performance.now();
const [result] = await runWorkflow({
  workflow: "01_change.api.json",
  set: [
    ["17", "prompt", `The flat grey shape is where what was there was: replace all of it. Paint ${change} there, whole, solid and attached naturally, filling the shape; the rest of the grey becomes what is around it. No grey left. The pose stays; everything else and the background stay exactly the same.`],
    ["22", "seed", +seed],
    ...crop("4"), ...crop("5"),
    ["27", "x", box.x], ["27", "y", box.y],
  ],
  images: [["1", src], ["2", path.resolve(mask)]],
  output: "28",
  outDir: path.join(process.cwd(), "data", "proof", `edit-${Date.now().toString(36)}`),
});
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`, box, result);
