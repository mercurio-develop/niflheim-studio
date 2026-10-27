import type { Version } from "./store";

// What made a version, for its colour: concept (yellow), change (peach accent), add (green),
// remove (pink), restyle (lilac). Read from the label the actions write.
export type VersionKind = "concept" | "change" | "add" | "remove" | "restyle";

export function versionKind(v: Pick<Version, "label">): VersionKind {
  if (v.label.startsWith("Concept")) return "concept";
  if (v.label.startsWith("Style:")) return "restyle";
  if (v.label.startsWith("+")) return "add";
  if (v.label.startsWith("−")) return "remove";
  return "change";
}

export const KIND_DOT: Record<VersionKind, string> = {
  concept: "bg-tone-yellow",
  change: "bg-primary",
  add: "bg-tone-green",
  remove: "bg-tone-pink",
  restyle: "bg-tone-lilac",
};
