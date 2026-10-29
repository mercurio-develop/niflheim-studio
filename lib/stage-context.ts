import type { CharacterPose, SetData, ViewId } from "./store";

// What every stage viewer reads off a project the same way: file URLs, the levelled stage the
// set is filled to (only a fill made from today's painting counts), and the finished poses.

export const fileUrl = (projectId: string, f: string) => `/api/files/${projectId}/${f}`;

// A view -> file map (cutouts) as view -> URL.
export const urlsOf = (projectId: string, c: Partial<Record<string, string>>) => Object.fromEntries(Object.entries(c).map(([v, f]) => [v, fileUrl(projectId, f!)])) as Partial<Record<ViewId, string>>;

// The set's fill when it was made from the painting chosen now; undefined otherwise.
export const freshFill = (set: SetData | null | undefined) => (set?.stage && set.stage.image === set.image ? set.stage.fill : undefined);

// Poses with all four views cut out: the only ones a character card can wear.
export const finishedPoses = (poses: CharacterPose[]) => poses.filter((p) => (["front", "threequarter", "side", "back"] as const).every((v) => p.cutouts[v]));
