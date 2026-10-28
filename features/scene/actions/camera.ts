"use server";

import path from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MOVES, aim, c2w, poses, renderKey } from "@/lib/camera";
import { startJob } from "@/lib/jobs";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject } from "@/lib/store";

const run = promisify(execFile);
const PYTHON = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "stage_path.py");
const done = (id: string) => revalidatePath(`/p/${id}/scene`);

const Move = z
  .object({
    move: z.enum(MOVES.map((m) => m.id) as [string, ...string[]]),
    amount: z.number(),
    seconds: z.number().min(2).max(10),
    ease: z.boolean(),
  })
  .refine((m) => {
    const spec = MOVES.find((x) => x.id === m.move)!;
    return m.amount >= spec.min && m.amount <= spec.max;
  }, "That amount is out of range for this move.");

// The scene's camera move, saved as it is tuned.
export async function saveCamera(id: string, raw: unknown) {
  const camera = Move.parse(raw) as z.infer<typeof Move> & { move: (typeof MOVES)[number]["id"] };
  await updateProject(id, (q) => void (q.camera = camera));
  done(id);
}

// Render the saved move through the filled stage: depth.mp4 for the shot and preview.mp4, about
// 15 s for 5 s of camera. Runs under the stage job, so it never overlaps a set build.
export async function renderCamera(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const fill = currentFill(p);
  const cam = fill?.camera;
  if (!cam?.floor || !p.stage?.at) throw new Error("Stand the character on the stage first.");
  const move = p.camera;
  if (!move) throw new Error("Choose a camera move first.");
  const at = p.stage.at;
  const height = p.stage.height;
  const key = renderKey(move, at, height, fill!.mesh);
  await startJob(id, "stage", async (ctx) => {
    const out = path.join(projectDir(id), "scene", "camera", Date.now().toString(36));
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "poses.json"), JSON.stringify(poses(cam, aim(cam, at, height), move).map(c2w)));
    const dir = path.join(projectDir(id), path.dirname(fill!.mesh));
    await run(PYTHON, ["-I", SCRIPT, "--dir", dir, "--poses", path.join(out, "poses.json"), "--fov", String(cam.fov), "--out", out], { maxBuffer: 1 << 20 });
    if (!(await ctx.alive())) return;
    const info = JSON.parse(await readFile(path.join(out, "render.json"), "utf8")) as { holes: number[] };
    const rel = (f: string) => path.relative(projectDir(id), path.join(out, f));
    await updateProject(id, (q) => void (q.cameraRender = { depth: rel("depth.mp4"), preview: rel("preview.mp4"), holes: info.holes, key, at: new Date().toISOString() }));
  }, "Rendering the camera move");
  done(id);
}
