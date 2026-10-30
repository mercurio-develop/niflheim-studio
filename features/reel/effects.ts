import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { projectDir } from "@/lib/store";

// Effects on a finished take: one video-to-video pass of a Lightricks IC-LoRA on Comfy Cloud
// (workflows/04_effect_*). Refine to HD is refine-details: the take upscaled 2x with texture, for
// clean but soft LTX output (about 1.5 min). Night is day-to-night at strength 1.5: on the
// distilled model (cfg 1) the trained 1.0 left the take half day (about 40 s). What each makes is
// kept beside the take (fx/<effect>/00.mp4) and which one the reel uses in fx/use.txt, so a take
// keeps its effects when it is picked again. Server only.
export const EFFECTS = [
  { id: "refine", label: "Refine to HD", line: "Twice the size, with texture: faces, fur, edges." },
  { id: "night", label: "Night", line: "Day turned to moonlit night, the same shot." },
] as const;
export type EffectId = (typeof EFFECTS)[number]["id"];

const fxDir = (id: string, video: string) => path.join(projectDir(id), path.dirname(video), "fx");
export const effectFile = (video: string, effect: EffectId) => path.join(path.dirname(video), "fx", effect, "00.mp4");

// The effects made for a take and the one in use (none: the take as shot).
export function effectsOf(id: string, video: string) {
  const made = EFFECTS.filter((e) => existsSync(path.join(projectDir(id), effectFile(video, e.id)))).map((e) => e.id);
  let use: EffectId | null = null;
  try {
    const u = readFileSync(path.join(fxDir(id, video), "use.txt"), "utf8").trim() as EffectId;
    if (made.includes(u)) use = u;
  } catch {}
  return { made, use };
}

// The video the reel plays for a take: its effect in use, else the take.
export function clipVideo(id: string, video: string) {
  const { use } = effectsOf(id, video);
  return use ? effectFile(video, use) : video;
}
