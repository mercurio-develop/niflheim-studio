import { frameCount } from "@/lib/camera";
import { sceneKey } from "@/lib/progress";
import type { ShotPreset } from "@/lib/camera";
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

// The shot presets: framing, camera move and what the actor does, chosen together with one click
// (Camera, and New shot). They are the moves that held in the 05_submit tests: a standing actor
// with a simple move, or one short walk; a walk with a moving camera popped the most, and walking
// off never happened. Each was checked on the fox, the troll and the keeper: never too close, the
// actor in frame (lib/camera.ts presetMove). Mid and close shots follow their keyframes (faces
// matched to the sheet). The bare controls stay under More.
export const SHOT_TYPES: (ShotPreset & { label: string; line: string; kind: ShotKind })[] = [
  { id: "establish", label: "Establish", line: "From the painting's own view, the camera pushes in slowly; they stand in the place.", framing: "painting", move: "push", amount: 0.8, seconds: 4, actor: "stands", kind: "camera" },
  { id: "across", label: "Walk across", line: "The painting's own view holds; they cross the frame.", framing: "painting", move: "static", amount: 0, seconds: 4, actor: "across", kind: "camera" },
  { id: "approach", label: "Approach", line: "They walk up to their mark as the camera eases back.", framing: "long", move: "pull", amount: 0.8, seconds: 4, actor: "approach", kind: "camera" },
  { id: "orbit", label: "Hero orbit", line: "The camera circles them, 30 degrees; they stand.", framing: "mid", move: "arc", amount: 30, seconds: 4, actor: "stands", kind: "camera" },
  { id: "reaction", label: "Reaction", line: "Close on their face; the camera holds.", framing: "close", move: "static", amount: 0, seconds: 4, actor: "stands", kind: "camera" },
];
