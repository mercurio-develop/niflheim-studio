// Proof for the brush: add something inside a box around the strokes; nothing outside changes.
// Run: node --env-file=.env scripts/try-brush.ts <image.png> <x> <y> <w> <h> "<thing to add>"
import path from "node:path";
import { cropBox, pngSize } from "../lib/brush.ts";
import { runWorkflow } from "../lib/comfy.ts";

const [image, x, y, w, h, thing] = process.argv.slice(2);
const src = path.resolve(image);
const box = cropBox({ x: +x, y: +y, width: +w, height: +h }, await pngSize(src));
const t0 = performance.now();
const [result] = await runWorkflow({
  workflow: "01_brush.api.json",
  set: [
    ["17", "prompt", `Add ${thing}. Keep everything else exactly the same, in the same art style and lighting.`],
    ["22", "seed", 7],
    ["4", "x", box.x], ["4", "y", box.y], ["4", "width", box.width], ["4", "height", box.height],
    ["27", "x", box.x], ["27", "y", box.y],
  ],
  images: [["1", src]],
  output: "28",
  outDir: path.join(process.cwd(), "data", "proof", `brush-${Date.now().toString(36)}`),
});
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`, box, result);
