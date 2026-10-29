import { charIn } from "./progress";
import type { Project, Version } from "./store";

type Stack = { versions: Version[]; current: number | null };

// Where a version came from: its recorded parent, or (for versions made before parents were
// recorded) the one before it. Concepts are roots. The undo/redo actions and the UI share this.
// Works on any stack of versions: the character's, or one turnaround view's.
export function parentIn(versions: Version[], i: number): number | null {
  const v = versions[i];
  if (v?.parent !== undefined) return v.parent;
  if (!v || v.label.startsWith("Concept")) return null;
  return i > 0 ? i - 1 : null;
}
export const parentOf = (p: Project, i: number, cid = "c1") => parentIn(charIn(p, cid).character.versions, i);

// Where Undo and Redo would go from a stack's current version.
export function stackMoves(s: Stack): { undo: number | null; redo: number | null; parent: number | null } {
  const at = s.current;
  if (at === null) return { undo: null, redo: null, parent: null };
  const children = s.versions.map((_, i) => i).filter((i) => parentIn(s.versions, i) === at);
  const parent = parentIn(s.versions, at);
  return { undo: parent, redo: children.length ? children[children.length - 1] : null, parent };
}
export const historyMoves = (p: Project, cid = "c1") => stackMoves(charIn(p, cid).character);
