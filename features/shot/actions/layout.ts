"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { frameCount } from "@/lib/camera";
import { startJob } from "@/lib/jobs";
import { sceneKey } from "@/lib/progress";
import { clayFrameMax } from "../state";
import { getProject, projectDir, updateProject } from "@/lib/store";

// The shot's camera move as a clay clip: every frame drawn in the browser from the stage in the
// grey guide look (features/scene/components/key-capture.tsx, clay), uploaded as JPEGs and joined
// into an MP4 at 24 fps. It is the Layout-to-Render IC-LoRA's control video (Lightricks: "a clay
// viewport or a blocky playblast"), so a camera take follows the move and the blocking frame by frame.

const run = promisify(execFile);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);

export async function saveClay(id: string, form: FormData) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const key = sceneKey(p);
  if (!key) throw new Error("Place the character and choose a camera move first.");
  const frames = frameCount(p.camera!.seconds);
  const max = clayFrameMax(frames);
  const Frame = z.instanceof(File).refine((f) => f.type === "image/jpeg" && f.size < max, "A clay frame came out too big to send; shorten the move.");
  const files = Array.from({ length: frames }, (_, i) => Frame.parse(form.get(`f${i}`)));
  const dir = path.join(projectDir(id), `shot/clay/${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  for (const [i, f] of files.entries()) await writeFile(path.join(dir, `${String(i).padStart(3, "0")}.jpg`), Buffer.from(await f.arrayBuffer()));
  // Joined into the MP4 as a job (a few seconds, but never inside the request).
  await startJob(id, "layout", async (ctx) => {
    const clip = path.join(dir, "clay.mp4");
    await run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "24", "-i", path.join(dir, "%03d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", clip]);
    if (await ctx.alive()) await updateProject(id, (q) => void (q.layout = { clip: rel(id, clip), key, frames, at: new Date().toISOString() }));
  }, "Joining the clay clip");
  revalidatePath(`/p/${id}/shot`);
}
