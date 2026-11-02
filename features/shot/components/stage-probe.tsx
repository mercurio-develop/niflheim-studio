import { access } from "node:fs/promises";
import path from "node:path";
import { projectDir, type Keyframes, type LayoutClip, type Shot } from "@/lib/store";

// The stage probe lists what one shot's stage left on disk: the clay clip, each keyframe, and the
// take that used the clip. Read-only: it never writes the project.
export type ProbeRole = "clay" | "key" | "take";
export type ProbeRecord = {
  role: ProbeRole;
  label: string;
  path: string; // relative to the project folder, as /api/files/<id>/<path> serves it
  full: string; // data/projects/<id>/<path>, the path the box prints
  blocked: boolean; // the file is not on disk
};

const exists = (file: string) => access(file).then(() => true, () => false);

export async function probeRecords(
  projectId: string,
  shot: { layout?: LayoutClip | null; keyframes?: Keyframes | null; shot?: Pick<Shot, "takes"> | null },
): Promise<ProbeRecord[]> {
  const root = projectDir(projectId);
  const wanted: Omit<ProbeRecord, "full" | "blocked">[] = [];
  if (shot.layout) wanted.push({ role: "clay", label: "Clay clip", path: shot.layout.clip });
  const k = shot.keyframes;
  k?.keys.forEach((key, i) => {
    if (key) wanted.push({ role: "key", label: `Keyframe at frame ${k.frames[i]}`, path: key });
  });
  const take = [...(shot.shot?.takes ?? [])].reverse().find((t) => t.layout);
  if (take) wanted.push({ role: "take", label: "Layout take", path: take.video });
  return Promise.all(
    wanted.map(async (w) => {
      const abs = path.resolve(root, w.path);
      const inside = abs.startsWith(root + path.sep);
      return { ...w, full: path.join("data", "projects", projectId, w.path), blocked: !inside || !(await exists(abs)) };
    }),
  );
}
