// Proof for the Turnaround's 3D model: Hunyuan3D-2 MV turbo from a project's current front, side
// and back views (the right side is the side view mirrored inside the graph) -> GLB.
// Run: node --env-file=.env scripts/try-turnaround-mesh.ts [projectId]
import path from "node:path";
import { readFile } from "node:fs/promises";
import { runWorkflow } from "../lib/comfy.ts";

const root = path.join(process.cwd(), "data", "projects");
const id = process.argv[2] ?? "440d836dcb";
const project = JSON.parse(await readFile(path.join(root, id, "project.json"), "utf8"));
const view = (v: string) => {
  const s = project.turnaround?.views?.[v];
  if (!s?.versions?.[s.current]) throw new Error(`${id} has no ${v} view`);
  return path.join(root, id, s.versions[s.current].image);
};

const t0 = performance.now();
const files = await runWorkflow({
  workflow: "02_turnaround_mesh.api.json",
  set: [["3", "seed", 42]],
  images: [["56", view("front")], ["85", view("side")], ["82", view("back")]],
  output: "67",
  ext: "glb",
  outDir: path.join(process.cwd(), "data", "proof", "turnaround-mesh", id),
  timeoutMs: 20 * 60_000,
});
console.log(`mesh: ${((performance.now() - t0) / 1000).toFixed(1)}s`, files);
