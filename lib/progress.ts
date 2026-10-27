import type { Project, TurnaroundOptions, ViewId } from "./store";
import type { StepSlug } from "./steps";

// The turnaround's views. Front is made from the character with the chosen pose and hidden
// objects; every other view is made from that front, so they all stay the same character.
export const VIEWS: { id: ViewId; label: string; optional?: boolean; prompt: string }[] = [
  { id: "front", label: "Front", prompt: "Rotate this character so the whole body faces the camera straight on: face, chest, hips and both feet point directly at the viewer, shoulders level and square, a symmetrical full-body front view for a character model sheet. Camera at chest height, the whole figure in frame." },
  { id: "threequarter", label: "Three-quarter", prompt: "Rotate the character 45 degrees to their left for a full-body three-quarter view: we see their front and their right side at an angle, the far shoulder partly hidden, the feet pointing diagonally." },
  { id: "side", label: "Side", prompt: "Turn the character to face left, showing a full-body left side profile view." },
  { id: "back", label: "Back", prompt: "Turn the character around to show a full-body back view, seen from behind." },
  { id: "top", label: "Top", optional: true, prompt: "Show the same character from directly above, a top-down view looking down at the whole figure." },
  { id: "bottom", label: "Bottom", optional: true, prompt: "Show the same character from directly below, a low worm's-eye view looking up at the whole figure." },
];

const KEEP = "Same character, same face, same outfit, same colours, same proportions, same plain light grey background.";

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The front's prompt. A pose change has to lead the prompt or Qwen keeps the original pose;
// "for a 3D model sheet" gave the straightest T in tests (2026-10-27). "Keep the character's own
// pose" kept the concept's slight turn too, so the front came out a copy of the concept; asking
// for face, chest, hips and feet square to the camera makes a real front (2026-10-27).
export function frontPrompt(o: TurnaroundOptions): string {
  const hide = o.hide.length ? `Remove ${list(o.hide.map((h) => `the ${h}`))} completely; the hands are empty and nothing is held or carried.` : "";
  const pose =
    o.pose === "tpose"
      ? "Make this character do a T-pose for a 3D model sheet: arms fully extended sideways in a straight horizontal line, forming a T shape with the body, legs together and straight."
      : "";
  const view = o.pose === "tpose" ? "Front view, full body, facing the viewer." : VIEWS[0].prompt + " Keep the arm positions and the items carried.";
  return [pose, hide, view, KEEP].filter(Boolean).join(" ");
}

// Every other view: made from the front, so it inherits the pose and the missing objects.
// From the side a T-pose's arms point at the camera, and Qwen drops them unless told not to.
export function viewPrompt(id: ViewId, o?: TurnaroundOptions): string {
  const v = VIEWS.find((x) => x.id === id)!;
  const tpose =
    o?.pose === "tpose"
      ? id === "side"
        ? "Keep the T-pose: both arms stay stretched straight out at shoulder height, the near arm pointing toward the viewer, foreshortened."
        : "Keep the T-pose: both arms stay stretched straight out sideways at shoulder height."
      : "Keep the same stance and arm positions; only the angle changes.";
  return `${v.prompt} ${tpose} Keep the same items as in this image. ${KEEP}`;
}

// The views a Generate makes: the four main ones plus the chosen extras.
export const viewsFor = (o: TurnaroundOptions) => VIEWS.filter((v) => !v.optional || o.extras.includes(v.id as "top" | "bottom"));

// The image a view shows now (its current version), for the UI and for the mesh.
export function viewImage(p: Project, id: ViewId): string | null {
  const s = p.turnaround?.views[id];
  return s ? (s.versions[s.current]?.image ?? null) : null;
}

export const characterImage = (p: Project) =>
  p.character.current === null ? null : p.character.versions[p.character.current].image;

// done = finished and still matches what came before it; stale = made from an older character.
export type StepState = "done" | "stale" | "todo";

export function stepStates(p: Project): Partial<Record<StepSlug, StepState>> {
  const t = p.turnaround;
  const allViews = !!t && viewsFor(t.options).every((v) => t.views[v.id]?.versions.length);
  return {
    character: p.character.doneAt ? "done" : "todo",
    turnaround: !allViews ? "todo" : t!.source === characterImage(p) ? "done" : "stale",
    set: !p.set?.stage ? "todo" : p.set.stage.image === p.set.image ? "done" : "stale",
  };
}
