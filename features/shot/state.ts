import { frameCount } from "@/lib/camera";
import { sceneKey } from "@/lib/progress";
import type { Project, ShotKind } from "@/lib/store";

// What the Shots page and the take action both need to know about the active shot. Plain helpers
// (not server actions), shared by app/p/[id]/shot/page.tsx and features/shot/actions/shot.ts.

// A grey clay frame is about 25 KB; the cap keeps a 10 s move (241 frames) under the 11 MB body limit.
export const CLAY_FRAME_MAX = 44 * 1024;

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
