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
