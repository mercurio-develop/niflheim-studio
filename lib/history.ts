import type { Project } from "./store";

// Same rule as the undo/redo actions, for the UI: where Undo and Redo would go from here.
export function historyMoves(p: Project): { undo: number | null; redo: number | null; parent: number | null } {
  const vs = p.character.versions;
  const parentOf = (i: number) => {
    const v = vs[i];
    if (v?.parent !== undefined) return v.parent;
    if (!v || v.label.startsWith("Concept")) return null;
    return i > 0 ? i - 1 : null;
  };
  const at = p.character.current;
  if (at === null) return { undo: null, redo: null, parent: null };
  const children = vs.map((_, i) => i).filter((i) => parentOf(i) === at);
  return { undo: parentOf(at), redo: children.length ? children[children.length - 1] : null, parent: parentOf(at) };
}
