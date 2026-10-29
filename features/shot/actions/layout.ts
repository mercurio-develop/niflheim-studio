"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { frameCount, propsKey, renderKey } from "@/lib/camera";
import { currentFill } from "@/lib/progress";
import { getProject, projectDir, updateProject, type Project } from "@/lib/store";

// The shot's camera move as a clay clip: every frame drawn in the browser from the stage in the
// grey guide look (features/scene/components/key-capture.tsx, clay), uploaded as JPEGs and joined
// into an MP4 at 24 fps. It is the Layout-to-Render IC-LoRA's control video (Lightricks: "a clay
// viewport or a blocky playblast"), so a camera take follows the move and the blocking frame by frame.

const run = promisify(execFile);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const Frame = z.instanceof(File).refine((f) => f.type === "image/jpeg" && f.size < 200 * 1024, "Each clay frame must be a JPEG under 200 KB.");

// The move and stage a clip is drawn from; a clip with another key is out of date.
export async function layoutKey(p: Project) {
  const fill = currentFill(p);
  if (!fill?.camera?.floor || !p.stage?.at || !p.camera) return null;
  return renderKey(p.camera, p.stage.at, p.stage.height, fill.mesh, p.stage.turn) + propsKey(p.blocks, p.sceneAssets);
}

export async function saveClay(id: string, form: FormData) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const key = await layoutKey(p);
  if (!key) throw new Error("Place the character and choose a camera move first.");
  const frames = frameCount(p.camera!.seconds);
  const files = Array.from({ length: frames }, (_, i) => Frame.parse(form.get(`f${i}`)));
  const dir = path.join(projectDir(id), `shot/clay/${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  for (const [i, f] of files.entries()) await writeFile(path.join(dir, `${String(i).padStart(3, "0")}.jpg`), Buffer.from(await f.arrayBuffer()));
  const clip = path.join(dir, "clay.mp4");
  await run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "24", "-i", path.join(dir, "%03d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", clip]);
  await updateProject(id, (q) => void (q.layout = { clip: rel(id, clip), key, frames, at: new Date().toISOString() }));
  revalidatePath(`/p/${id}/shot`);
}
