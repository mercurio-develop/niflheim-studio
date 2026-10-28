// Proof for the scene camera: every move's frames for a project's placed character, whether each
// stays inside the space the stage holds, and the frame count LTX gets.
// Run: node scripts/try-stage-path.ts [projectId]
import path from "node:path";
import { readFileSync } from "node:fs";
import { DEFAULT_MOVE, MOVES, aim, frameCount, inside, poses, type CameraMove } from "../lib/camera.ts";

const id = process.argv[2] ?? "440d836dcb";
const p = JSON.parse(readFileSync(path.join(process.cwd(), "data", "projects", id, "project.json"), "utf8"));
const cam = p.set.stage.fill.camera;
const target = aim(cam, p.stage?.at, p.stage?.height);
const check = (m: CameraMove) => {
  const ps = poses(cam, target, m);
  const out = ps.filter((x) => !inside(cam, x.position)).length;
  const f = (v: number[]) => v.map((x) => x.toFixed(2)).join(", ");
  return `${m.move.padEnd(6)} ${String(m.amount).padStart(5)} · ${ps.length} frames · from [${f(ps[0].position)}] to [${f(ps.at(-1)!.position)}] · ${out ? `${out} frames OUTSIDE` : "inside"}`;
};
console.log(`5 s = ${frameCount(5)} frames; character at ${p.stage?.at?.map((x: number) => x.toFixed(2))}`);
for (const m of MOVES) console.log(check({ ...DEFAULT_MOVE, move: m.id, amount: m.value }));
console.log(check({ ...DEFAULT_MOVE, move: "arc", amount: 40 }));
console.log(check({ ...DEFAULT_MOVE, move: "track", amount: -2 }));

// With --render: the default push-in rendered along its path (scripts/stage_path.py), timed.
if (process.argv.includes("--render")) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { homedir } = await import("node:os");
  const { c2w } = await import("../lib/camera.ts");
  const out = path.join(process.cwd(), "data", "proof", "stage-path", id);
  mkdirSync(out, { recursive: true });
  const ps = poses(cam, target, DEFAULT_MOVE);
  writeFileSync(path.join(out, "poses.json"), JSON.stringify(ps.map(c2w)));
  const dir = path.join(process.cwd(), "data", "projects", id, path.dirname(p.set.stage.fill.mesh));
  const python = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
  const t0 = performance.now();
  const res = execFileSync(python, ["-I", "scripts/stage_path.py", "--dir", dir, "--poses", path.join(out, "poses.json"), "--fov", String(cam.fov), "--out", out], { encoding: "utf8" });
  console.log(`render: ${((performance.now() - t0) / 1000).toFixed(1)}s`, res.trim());
}
