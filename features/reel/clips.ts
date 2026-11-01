import { allShots, type Project } from "@/lib/store";

// The reel's order: the saved order of shots that still exist, then any shot added since.
export function reelOrder(p: Project): string[] {
  const ids = (p.shots ?? []).map((s) => s.id);
  const saved = (p.reel?.order ?? []).filter((s) => ids.includes(s));
  return [...saved, ...ids.filter((s) => !saved.includes(s))];
}

// The shot just before the active one in the reel's order (null when it is first or not in the reel).
export function previousInReel(p: Project) {
  const order = reelOrder(p);
  const at = order.indexOf(p.activeShot ?? "");
  if (at < 1) return null;
  return allShots(p).find((s) => s.id === order[at - 1]) ?? null;
}

// The reel's clips: each listed shot's picked take, in the reel's order (shots with no pick are left out).
export function reelClips(p: Project) {
  const shots = allShots(p);
  const order = reelOrder(p);
  return order
    .map((sid) => shots.find((s) => s.id === sid))
    .filter((s): s is NonNullable<typeof s> => !!s && s.shot?.picked !== undefined && !!s.shot.takes[s.shot.picked])
    .map((s) => ({ shot: s.id, name: s.name, video: s.shot!.takes[s.shot!.picked!].video }));
}
