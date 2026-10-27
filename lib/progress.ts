import type { Project, ViewId } from "./store";
import type { StepSlug } from "./steps";

export const VIEWS: { id: ViewId; label: string; prompt: string }[] = [
  { id: "threequarter", label: "Three-quarter", prompt: "Turn the character slightly to their left to show a full-body three-quarter view. Same character, same outfit, same proportions, standing upright, same plain grey background." },
  { id: "side", label: "Side", prompt: "Turn the character to face left, showing a full-body left side profile view. Same character, same outfit, same proportions, standing upright, same plain grey background." },
  { id: "back", label: "Back", prompt: "Turn the character around to show a full-body back view, seen from behind. Same character, same outfit, same proportions, standing upright, same plain grey background." },
];

export const characterImage = (p: Project) =>
  p.character.current === null ? null : p.character.versions[p.character.current].image;

// done = finished and still matches what came before it; stale = made from an older character.
export type StepState = "done" | "stale" | "todo";

export function stepStates(p: Project): Partial<Record<StepSlug, StepState>> {
  const views = p.turnaround;
  const allViews = !!views && VIEWS.every((v) => views.views[v.id]);
  return {
    character: p.character.doneAt ? "done" : "todo",
    turnaround: !allViews ? "todo" : views!.source === characterImage(p) ? "done" : "stale",
  };
}
