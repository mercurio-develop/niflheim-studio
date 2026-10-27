import type { Project } from "./store";

// Where a version came from: its recorded parent, or (for versions made before parents were
// recorded) the one before it. Concepts are roots. The undo/redo actions and the UI share this.
export function parentOf(p: Project, i: number): number | null {
  const v = p.character.versions[i];
  if (v?.parent !== undefined) return v.parent;
  if (!v || v.label.startsWith("Concept")) return null;
  return i > 0 ? i - 1 : null;
}

// Where Undo and Redo would go from the current version.
export function historyMoves(p: Project): { undo: number | null; redo: number | null; parent: number | null } {
  const at = p.character.current;
  if (at === null) return { undo: null, redo: null, parent: null };
  const children = p.character.versions.map((_, i) => i).filter((i) => parentOf(p, i) === at);
  return { undo: parentOf(p, at), redo: children.length ? children[children.length - 1] : null, parent: parentOf(p, at) };
}
