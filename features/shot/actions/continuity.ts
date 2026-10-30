"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { DEFAULT_MOVE, momentsOf, type CameraMove, type Mark } from "@/lib/camera";
import { allShots, getProject, projectDir, updateProject, type Project } from "@/lib/store";
import { PYTHON } from "@/lib/python";
import { startJob } from "@/lib/jobs";

const run = promisify(execFile);
const LAST_FRAME = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "last_frame.py");
const done = (id: string) => revalidatePath(`/p/${id}/shot`);

// The shot before the active one and the take it would hand on: the picked one, else the newest.
async function previousTake(p: Project) {
  const shots = allShots(p);
  const at = shots.findIndex((s) => s.active);
  const prev = at > 0 ? shots[at - 1] : null;
  const takes = prev?.shot?.takes ?? [];
  if (!prev || !takes.length) return null;
  const take = prev.shot?.picked ?? takes.length - 1;
  return { shot: prev, take, video: takes[take]?.video };
}

// Where everyone stood when the previous shot ended: its last moment's marks, or, for an older
// walk shot, the main character at the walk's end.
function lastMarks(m?: CameraMove): Record<string, Mark> {
  if (!m) return {};
  const last = momentsOf(m).at(-1);
  if (last) return last.marks;
  return m.walk ? { main: { at: m.walk.to } } : {};
}

// The active shot starts where the previous one ended: that take's last frame becomes key 1 (no
// repaint, and the later keys are painted to match it), and the first moment's marks are the
// previous shot's last ones. Make the keyframes after this, so they are captured from those marks.
export async function continueFromPrevious(id: string) {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const prev = await previousTake(p);
  if (!prev?.video) throw new Error("The shot before this one has no take yet.");
  const video = prev.video;
  // The last frame is grabbed in the keyframes job (a second, but never inside the request); the
  // job's lock also keeps it from racing a keyframe paint.
  await startJob(id, "keyframes", async (ctx) => {
    const frame = path.join(projectDir(id), "shot", "seed", `${Date.now().toString(36)}.png`);
    await mkdir(path.dirname(frame), { recursive: true });
    await run(PYTHON, ["-I", LAST_FRAME, path.join(projectDir(id), video), frame]);
    if (!(await ctx.alive())) return;
    const marks = lastMarks(prev.shot.camera);
    await updateProject(id, (q) => {
      const m: CameraMove = { ...(q.camera ?? DEFAULT_MOVE) };
      const ms = momentsOf(m);
      if (Object.keys(marks).length) {
        m.moments = ms[0]?.frame === 0 ? [{ ...ms[0], marks: { ...ms[0].marks, ...marks } }, ...ms.slice(1)] : [{ frame: 0, marks }, ...ms];
      }
      q.camera = m;
      q.seededFrom = { shot: prev.shot.id, take: prev.take, frame: path.relative(projectDir(id), frame) };
    });
  }, "Taking the last frame of the shot before");
  done(id);
}

// Key 1 is painted from the capture again; the moments stay as they are.
export async function stopContinuing(id: string) {
  await updateProject(id, (q) => void delete q.seededFrom);
  done(id);
}
