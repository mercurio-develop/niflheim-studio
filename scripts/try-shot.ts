// Proof for the Shot step: one LTX-2.5 take from a project's keyframes (one guide per key, ends at
// 0.7, middle at 0.5), length from its camera move. Writes the MP4 and a contact sheet's frames.
// Run: node --env-file=.env scripts/try-shot.ts [projectId] "what happens"
import path from "node:path";
import { readFileSync } from "node:fs";
import { runWorkflow } from "../lib/comfy.ts";
import { frameCount } from "../lib/camera.ts";
import { middleImageNode, shapeShot } from "../features/shot/graph.ts";

const id = process.argv[2] ?? "440d836dcb";
const action = process.argv[3] ?? "stands still, then lifts the lantern and looks around, the coat stirring in the wind";
const dir = path.join(process.cwd(), "data", "projects", id);
const p = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
const k = p.keyframes;
if (!k?.keys?.every(Boolean)) throw new Error(`${id} has no painted keyframes`);
const length = frameCount(p.camera.seconds);
const keys = k.keys.map((f: string) => path.join(dir, f));
const t0 = performance.now();
const files = await runWorkflow({
  workflow: "03_shot.api.json",
  edit: (g) => shapeShot(g, k.frames, length),
  set: [
    ["20", "text", `One continuous take with no cuts. The camera ${p.camera.move === "push" ? "pushes in slowly" : "moves"} toward ${p.character.prompt}, who ${action}. ${p.set.prompt}. Consistent art style.`],
    ["21", "text", "Jitter, warping face, morphing limbs, flickering textures, blurry, changing art style, extra limbs. Cut, scene change, jump cut, static camera."],
    ["40", "noise_seed", 42],
  ],
  images: [["1", keys[0]], ["2", keys.at(-1)], ...keys.slice(1, -1).map((f: string, i: number) => [middleImageNode(i), f] as [string, string])],
  output: "55",
  ext: "mp4",
  outDir: path.join(process.cwd(), "data", "proof", "shot", id),
  timeoutMs: 20 * 60_000,
});
console.log(`take: ${((performance.now() - t0) / 1000).toFixed(1)}s, ${length} frames, keys at ${k.frames.join("/")}`, files);
