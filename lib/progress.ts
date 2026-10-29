import type { CharacterData, Project, TurnaroundOptions, ViewId } from "./store";
import type { StepSlug } from "./steps";

// lib/store.ts charOf, without importing it: store pulls in node:fs and this file reaches the browser.
export function charIn(p: Project, cid = "c1"): CharacterData {
  const c = cid === "c1" ? p : p.cast?.find((x) => x.id === cid);
  if (!c) throw new Error("No such character.");
  return c;
}

// The turnaround's views. Front is made from the character with the chosen pose and hidden
// objects; every other view is made from that front, so they all stay the same character.
export const VIEWS: { id: ViewId; label: string; optional?: boolean; prompt: string }[] = [
  { id: "front", label: "Front", prompt: "Rotate this character so the whole body faces the camera straight on: face, chest, hips and both feet point directly at the viewer, shoulders level and square, a symmetrical full-body front view. Camera at chest height, the whole figure in frame." },
  { id: "threequarter", label: "Three-quarter", prompt: "Rotate the character 45 degrees to their left for a full-body three-quarter view: we see their front and their right side at an angle, the far shoulder partly hidden, the feet pointing diagonally." },
  { id: "side", label: "Side", prompt: "Turn the character to face left, showing a full-body left side profile view." },
  { id: "back", label: "Back", prompt: "Turn the character around to show a full-body back view, seen from behind." },
  { id: "top", label: "Top", optional: true, prompt: "Show the same character from directly above, a top-down view looking down at the whole figure." },
  { id: "bottom", label: "Bottom", optional: true, prompt: "Show the same character from directly below, a low worm's-eye view looking up at the whole figure." },
];

// "Model sheet" in a view prompt made Qwen draw callout lines and labels, so it is said here never to.
const KEEP = "Same character, same face, same outfit, same colours, same proportions, same plain light grey background. No text, labels, arrows or lines.";

// Four legs: an animal is painted standing on all four, its body level, never upright on two legs
// and never in a T-pose; every view says so, or Qwen stands it up like a person.
export const fourLegs = (o?: Pick<TurnaroundOptions, "body">) => o?.body === "animal";
// The view a turnaround paints first, from the character; every other view is turned from it. An
// animal starts from the side: asked head-on, Qwen kept a cat upright or sat it down, while a side
// profile on four legs came out right the first time (2026-10-29, data/proof/four-legs).
export const firstView = (o?: Pick<TurnaroundOptions, "body">): ViewId => (fourLegs(o) ? "side" : "front");
const FOUR_LEGS = "This is an animal that walks on four legs: it stands on all four legs with all four paws on the ground, the body level, never upright on two legs and never in a T-pose.";
const FOUR_VIEWS: Partial<Record<ViewId, string>> = {
  front: "Show it head on: its face and chest point directly at the viewer, the two front legs side by side, the whole animal in frame, the camera at its chest height.",
  threequarter: "Turn the animal 45 degrees for a full-body three-quarter view: we see its front and one side at an angle, all four legs on the ground.",
  side: "Show the animal from the side: a full-body left side profile with all four legs and the tail.",
  back: "Turn the animal around: a full-body back view from behind, with its hind legs and tail.",
};
const viewWords = (id: ViewId, o?: Pick<TurnaroundOptions, "body">) => (fourLegs(o) && FOUR_VIEWS[id]) || VIEWS.find((x) => x.id === id)!.prompt;

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// The front's prompt. A pose change has to lead the prompt or Qwen keeps the original pose;
// "for a 3D model sheet" gave the straightest T in tests (2026-10-27). "Keep the character's own
// pose" kept the concept's slight turn too, so the front came out a copy of the concept; asking
// for face, chest, hips and feet square to the camera makes a real front (2026-10-27).
// For an animal it paints the side instead (firstView), on all four legs.
export function frontPrompt(o: TurnaroundOptions): string {
  const legs = fourLegs(o);
  const hide = o.hide.length ? `Remove ${list(o.hide.map((h) => `the ${h}`))} completely; ${legs ? "nothing is worn or carried" : "the hands are empty and nothing is held or carried"}.` : "";
  if (legs) return ["Change the pose: redraw this animal as a real animal standing on all four legs, body horizontal, all four paws on the ground, seen from the side in a full left profile, head and tail in frame, never upright on its hind legs.", hide, "Add nothing that is not in this picture.", KEEP].filter(Boolean).join(" ");
  const pose =
    o.pose === "tpose"
      ? "Make this character do a T-pose for a 3D model sheet: arms fully extended sideways in a straight horizontal line, forming a T shape with the body, legs together and straight."
      : "";
  const view = o.pose === "tpose" ? "Front view, full body, facing the viewer." : VIEWS[0].prompt + " Keep the arm positions. Add nothing that is not in this picture.";
  return [pose, hide, view, KEEP].filter(Boolean).join(" ");
}

// Every other view: made from the front, so it inherits the pose and the missing objects.
// From the side a T-pose's arms point at the camera, and Qwen drops them unless told not to.
export function viewPrompt(id: ViewId, o?: TurnaroundOptions): string {
  if (fourLegs(o)) return `${viewWords(id, o)} ${FOUR_LEGS} Keep the same standing stance and markings; only the angle changes, it does not sit. ${KEEP}`;
  const v = VIEWS.find((x) => x.id === id)!;
  const tpose =
    o?.pose === "tpose"
      ? id === "side"
        ? "Keep the T-pose: both arms stay stretched straight out at shoulder height, the near arm pointing toward the viewer, foreshortened."
        : "Keep the T-pose: both arms stay stretched straight out sideways at shoulder height."
      : "Keep the same stance and arm positions; only the angle changes.";
  return `${v.prompt} ${tpose} Keep the same items as in this image. ${KEEP}`;
}

// The sheet's pictures (the Ingredients reference sheet, features/turnaround/actions/sheet.ts): a
// relaxed pose, never the T-pose, then the same pose from every side; an animal stays on all four.
const SHEET_KEEP = "Same character: the same face, body, clothes, colours and art style. Plain light grey background, nothing else in the image, no text.";
export function relaxedPrompt(o?: Pick<TurnaroundOptions, "body">): string {
  const pose = fourLegs(o)
    ? `${FOUR_LEGS} Make it stand relaxed and natural, its weight even on all four paws, head up.`
    : "Make this character stand in a relaxed, natural pose: arms down at their sides, hands relaxed, weight on one leg, not a T-pose.";
  return `${pose} Front view, full body, facing the viewer, the whole figure in frame. ${SHEET_KEEP}`;
}
export function turnPrompt(from: string, o?: Pick<TurnaroundOptions, "body">): string {
  const keep = fourLegs(o) ? `${FOUR_LEGS} Keep its legs as they are` : "Keep the arms and legs as they are";
  return `Show this same character in exactly the same relaxed pose ${from}. ${keep}; only the angle changes. Full body in frame. ${SHEET_KEEP}`;
}

// The views a Generate makes: the four main ones plus the chosen extras.
export const viewsFor = (o: TurnaroundOptions) => VIEWS.filter((v) => !v.optional || o.extras.includes(v.id as "top" | "bottom"));

// The image a view shows now (its current version), for the UI and for the mesh.
// cid: which character (lib/store.ts charOf); c1 by default.
export function viewImage(p: Project, id: ViewId, cid = "c1"): string | null {
  const s = charIn(p, cid).turnaround?.views[id];
  return s ? (s.versions[s.current]?.image ?? null) : null;
}

export const characterImage = (p: Project, cid = "c1") => {
  const c = charIn(p, cid).character;
  return c.current === null ? null : c.versions[c.current].image;
};

// done = finished and still matches what came before it; stale = made from an older character.
export type StepState = "done" | "stale" | "todo";

// The filled stage the user stands the character on: the fill of the chosen painting's stage.
export const currentFill = (p: Project) => (p.set?.stage && p.set.stage.image === p.set.image ? p.set.stage.fill : undefined);

// Why a placement no longer fits: the turnaround front changed (cut out again) or the set was
// rebuilt or refilled since it was placed (place again). Placements from before stage.fill are
// taken as they were.
export function placementStale(p: Project, cid = "c1"): "turnaround" | "set" | null {
  const s = p.stage;
  if (!s) return null;
  if (s.source !== viewImage(p, "front", cid)) return "turnaround";
  if (s.at && s.fill && s.fill !== currentFill(p)?.mesh) return "set";
  return null;
}

// The scene: a stage built from the chosen painting, and the character placed on it. Stale when
// the painting changed since the stage was built, or the placement no longer fits (lib above).
function sceneState(p: Project): StepState {
  if (!p.set?.stage || !p.stage?.at) return "todo";
  return p.set.stage.image !== p.set.image || placementStale(p) ? "stale" : "done";
}

export function stepStates(p: Project, cid = "c1"): Partial<Record<StepSlug, StepState>> {
  const c = charIn(p, cid);
  const t = c.turnaround;
  const allViews = !!t && viewsFor(t.options).every((v) => t.views[v.id]?.versions.length);
  return {
    // The turnaround is part of Character: done once it is finished and every view is from the current version.
    character: !c.character.doneAt || !allViews ? "todo" : t!.source === characterImage(p, cid) ? "done" : "stale",
    scene: sceneState(p),
  };
}
