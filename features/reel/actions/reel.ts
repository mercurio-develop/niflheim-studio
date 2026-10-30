"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { startJob } from "@/lib/jobs";
import { getProject, projectDir, updateProject } from "@/lib/store";
import { reelClips } from "../clips";
import { PYTHON } from "@/lib/python";

const run = promisify(execFile);
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "reel.py");
const done = (id: string) => revalidatePath(`/p/${id}/export`);

const Plan = z.object({ order: z.array(z.string().regex(/^s\d{1,3}$/)).max(40), joins: z.array(z.enum(["cut", "fade", "dip"])).max(40) });

export async function saveReel(id: string, raw: unknown) {
  const plan = Plan.parse(raw);
  await updateProject(id, (q) => {
    const known = new Set((q.shots ?? []).map((s) => s.id));
    if (plan.order.some((s) => !known.has(s))) throw new Error("A shot in the reel no longer exists.");
    q.reel = { ...q.reel, order: plan.order, joins: plan.joins };
  });
  done(id);
}

// One MP4 of the picked takes with their joins (scripts/reel.py: ffmpeg concat, xfade and
// acrossfade at 24 fps), a few seconds of work.
export async function exportReel(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const clips = reelClips(p);
  if (!clips.length) throw new Error("Pick a take in at least one shot first.");
  // A join nobody chose is a fade (the reel's one join control, Order; Autopilot keeps it).
  const joins = clips.slice(1).map((_, i) => p.reel?.joins[i] ?? "fade");
  const key = JSON.stringify({ clips: clips.map((c) => c.video), joins });
  await startJob(id, "reel", async (ctx) => {
    const dir = path.join(projectDir(id), "reel", Date.now().toString(36));
    await mkdir(dir, { recursive: true });
    const out = path.join(dir, "reel.mp4");
    const args = [out, path.join(projectDir(id), clips[0].video)];
    clips.slice(1).forEach((c, i) => args.push(joins[i], path.join(projectDir(id), c.video)));
    const { stdout } = await run(PYTHON, ["-I", SCRIPT, ...args], { maxBuffer: 1 << 20 });
    if (!(await ctx.alive())) return;
    const { seconds } = JSON.parse(stdout) as { seconds: number };
    await updateProject(id, (q) => void (q.reel = { order: q.reel?.order ?? [], joins: q.reel?.joins ?? [], export: { video: path.relative(projectDir(id), out), seconds, key, at: new Date().toISOString() } }));
  }, "Putting the reel together");
  done(id);
}
