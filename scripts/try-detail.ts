// Proof for the face and hand pass: one painted key through 03_key_detail (SAM3 finds faces and
// hands by text, Z-Image repaints each crop at denoise 0.35), saved beside the original.
// Run: node --env-file=.env scripts/try-detail.ts <image.png> [denoise]
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";

const [image, denoise = "0.35"] = process.argv.slice(2);
const t0 = performance.now();
const [out] = await runWorkflow({
  workflow: "03_key_detail.api.json",
  set: [["6", "denoise", +denoise], ["7", "denoise", +denoise]],
  images: [["1", path.resolve(image)]],
  output: "8",
  outDir: path.join(process.cwd(), "data", "proof", `detail-${Date.now().toString(36)}`),
});
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`, out);
