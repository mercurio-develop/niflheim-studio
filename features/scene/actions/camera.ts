"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FOCUS, FRAMINGS, MOVES, c2w, poses, renderKey, type CameraMove } from "@/lib/camera";
import { startJob } from "@/lib/jobs";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject } from "@/lib/store";
import { PYTHON } from "@/lib/python";

const run = promisify(execFile);
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "stage_path.py");
const done = (id: string) => {
  revalidatePath(`/p/${id}/scene`);
  revalidatePath(`/p/${id}/shot`);
};

const Point = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Number.isFinite(x) && Math.abs(x) < 500));
const Move = z
  .object({
    move: z.enum(MOVES.map((m) => m.id) as [string, ...string[]]),
    amount: z.number(),
    seconds: z.number().min(2).max(10),
    ease: z.boolean(),
    framing: z.enum(FRAMINGS.map((f) => f.id) as [string, ...string[]]).optional(),
    from: Point.optional(),
    to: Point.optional(),
    walk: z.object({ from: Point, to: Point }).optional(),
    focus: z.enum(FOCUS.map((f) => f.id) as [string, ...string[]]).optional(),
    pose: z.string().regex(/^[a-z0-9]{1,16}$/).optional(),
    poseThen: z.string().regex(/^[a-z0-9]{1,16}$/).optional(),
    subject: z.string().regex(/^(main|none|[a-z0-9]{1,24})$/).optional(),
    moments: z
      .array(
        z.object({
          frame: z.number().int().min(0).max(400),
          camera: z.object({ from: Point, look: Point }).optional(),
          marks: z.record(z.string().regex(/^(main|[a-z0-9]{1,24})$/), z.object({ at: Point.optional(), turn: z.number().min(-360).max(360).optional(), pose: z.string().regex(/^[a-z0-9]{0,16}$/).optional() })),
        }),
      )
      .max(8)
      .optional(),
  })
  .refine((m) => {
    const spec = MOVES.find((x) => x.id === m.move)!;
    return m.amount >= spec.min && m.amount <= spec.max;
  }, "That amount is out of range for this move.");

// The active shot's camera move, saved as it is tuned.
export async function saveCamera(id: string, raw: unknown) {
  const camera = Move.parse(raw) as CameraMove;
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
  const turn = p.stage.turn;
  const key = renderKey(move, at, height, fill!.mesh, turn);
  await startJob(id, "stage", async (ctx) => {
    const out = path.join(projectDir(id), "scene", "camera", Date.now().toString(36));
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "poses.json"), JSON.stringify(poses(cam, { at, height, turn }, move, p.sceneAssets ?? []).map(c2w)));
    const dir = path.join(projectDir(id), path.dirname(fill!.mesh));
    await run(PYTHON, ["-I", SCRIPT, "--dir", dir, "--poses", path.join(out, "poses.json"), "--fov", String(cam.fov), "--out", out], { maxBuffer: 1 << 20 });
    if (!(await ctx.alive())) return;
    const info = JSON.parse(await readFile(path.join(out, "render.json"), "utf8")) as { holes: number[] };
    const rel = (f: string) => path.relative(projectDir(id), path.join(out, f));
    await updateProject(id, (q) => void (q.cameraRender = { depth: rel("depth.mp4"), preview: rel("preview.mp4"), holes: info.holes, key, at: new Date().toISOString() }));
  }, "Rendering the camera move");
  done(id);
}
