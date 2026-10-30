import { frameCount } from "@/lib/camera";
import { sceneKey } from "@/lib/progress";
import type { FramingId, MoveId } from "@/lib/camera";
import type { Project, ShotKind } from "@/lib/store";

// What the Shots page and the take action both need to know about the active shot. Plain helpers
// (not server actions), shared by app/p/[id]/shot/page.tsx and features/shot/actions/shot.ts.

// The clay clip's frames share one upload under the 11 MB body limit (next.config.ts): each frame
// may take its share of 10.5 MB (108 KB at 4 s, 44 KB at 10 s). A detailed stage made a fixed
// 44 KB cap refuse every 4 s clip (05_submit demo).
export const clayFrameMax = (frames: number) => Math.floor((10.5 * 1024 * 1024) / Math.max(1, frames));

// Why the keyframes cannot guide a take, or null when they can: every key painted, covering today's
// move, and drawn from today's stage (a key of a stage that has changed since, say with someone
// who has left it, paints them into the take: the cat-headed walker, 05_submit 2026-10-29).
export function keysProblem(p: Project): string | null {
  const k = p.keyframes;
  if (!p.camera || !k?.keys.length || !k.keys.every(Boolean)) return "Make the keyframes first.";
  if (k.frames.at(-1) !== frameCount(p.camera.seconds) - 1) return "The camera move changed since the keyframes were made: make them again.";
  if (k.key !== sceneKey(p)) return "The stage changed since the keyframes were made (someone moved, came or left): make them again.";
  return null;
}

// The kind a shot is suggested to be (decision 0014): still, close or first-person shots are about
// the character; anything that moves through the set is about the camera.
export const suggestedKind = (p: Project): ShotKind => ((p.camera?.move ?? "static") === "static" || ["close", "pov"].includes(p.camera?.framing ?? "") ? "character" : "camera");

// The kinds of shot New shot offers: framing, move, kind and length chosen together from what
// worked in the 05_submit tests. Mid and close shots follow their keyframes (faces matched to the
// sheet): on one mid shot that faced the camera, steady, the right person, where the sheet's takes
// turned away or brought in a double. The sheet (Character) is for action, where the character moves
// a lot and keyframes cannot follow (the fox trotting to the lantern). The bare moves stay under More.
export const SHOT_TYPES: { id: string; label: string; line: string; framing: FramingId; move: MoveId; kind: ShotKind; seconds: number }[] = [
  { id: "wide-push", label: "Wide · push in", line: "The place and the character, the camera moving in.", framing: "long", move: "push", kind: "camera", seconds: 4 },
  { id: "mid-acting", label: "Mid · acting", line: "Waist up, holding on what they do.", framing: "mid", move: "static", kind: "camera", seconds: 5 },
  { id: "close-reaction", label: "Close-up · reaction", line: "Their face, their expression.", framing: "close", move: "static", kind: "camera", seconds: 5 },
  { id: "action", label: "Action · keep their look", line: "They move a lot; their sheet keeps them the same.", framing: "long", move: "static", kind: "character", seconds: 5 },
  { id: "wide-follow", label: "Wide · follow", line: "The camera goes with them as they move.", framing: "long", move: "follow", kind: "camera", seconds: 4 },
];
