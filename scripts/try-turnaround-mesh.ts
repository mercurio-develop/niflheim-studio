// Proof for the Turnaround's 3D model: Hunyuan3D-2 MV turbo from a project's current front, side
// and back views (right is the side mirrored by pad_square.py) -> GLB.
// Run: node --env-file=.env scripts/try-turnaround-mesh.ts [projectId]
import path from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { runWorkflow } from "../lib/comfy.ts";

const root = path.join(process.cwd(), "data", "projects");
const python = process.env.NIFL_PYTHON || path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const pad = path.join(process.cwd(), "scripts", "pad_square.py");
const id = process.argv[2] ?? "440d836dcb";
const project = JSON.parse(await readFile(path.join(root, id, "project.json"), "utf8"));
const view = (v: string) => {
  const s = project.turnaround?.views?.[v];
  if (!s?.versions?.[s.current]) throw new Error(`${id} has no ${v} view`);
  return path.join(root, id, s.versions[s.current].image);
};

const outDir = path.join(process.cwd(), "data", "proof", "turnaround-mesh", id);
await mkdir(outDir, { recursive: true });
const square = (src: string, name: string, flip = false) => {
  const dest = path.join(outDir, name);
  execFileSync(python, ["-I", pad, src, dest, ...(flip ? ["--flip"] : [])]);
  return dest;
};
const front = square(view("front"), "front.png");
const side = square(view("side"), "left.png");
const back = square(view("back"), "back.png");
const right = square(view("side"), "right.png", true);

const t0 = performance.now();
const files = await runWorkflow({
  workflow: "02_turnaround_mesh.api.json",
  set: [["3", "seed", 42]],
  images: [["56", front], ["85", side], ["82", back], ["87", right]],
  output: "67",
  ext: "glb",
  outDir,
  timeoutMs: 20 * 60_000,
});
console.log(`mesh: ${((performance.now() - t0) / 1000).toFixed(1)}s`, files);
