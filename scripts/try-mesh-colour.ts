// Proof for colouring the Turnaround's 3D model: scripts/mesh_colour.py on a project's current
// model and its current front, side, back and three-quarter views -> coloured GLB and a front/side/back preview.
// Run: node scripts/try-mesh-colour.ts [projectId]
import path from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const root = path.join(process.cwd(), "data", "projects");
const id = process.argv[2] ?? "440d836dcb";
const dir = path.join(root, id);
const project = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
if (!project.mesh?.glb) throw new Error(`${id} has no 3D model yet`);
const view = (v: string) => {
  const s = project.turnaround?.views?.[v];
  if (!s?.versions?.[s.current]) throw new Error(`${id} has no ${v} view`);
  return path.join(dir, s.versions[s.current].image);
};

const out = path.join(process.cwd(), "data", "proof", "mesh-colour", id);
mkdirSync(out, { recursive: true });
const python = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const t0 = performance.now();
const res = execFileSync(python, ["-I", "scripts/mesh_colour.py", path.join(dir, project.mesh.glb), path.join(out, "coloured.glb"), view("front"), view("side"), view("back"), view("threequarter"), path.join(out, "preview.png")], { encoding: "utf8" });
console.log(`colour: ${((performance.now() - t0) / 1000).toFixed(1)}s`, res.trim());
