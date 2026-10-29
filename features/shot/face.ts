import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runWorkflow } from "@/lib/comfy";
import type { Project } from "@/lib/store";
import { PYTHON } from "@/lib/python";

// The key face pass (server only, not an action: it takes file paths): SAM3 finds the head in a
// key, the crop is repainted by Qwen-Image-Edit from the crop and the character's face reference
// (the sheet's front close-up, workflows/03_key_face.api.json), and pasted back with a soft edge
// (scripts/face_patch.py). "head", not "face": a face mask left a cat's ears on the lantern
// keeper (05_submit data/proof/key-face). About 45 s on Comfy Cloud.

const run = promisify(execFile);
const PATCH = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "face_patch.py");
const PROMPT =
  "Repaint the face in image 1 so it is the same character as image 2: the same face shape, eyes, nose, mouth, skin, hair and markings as image 2. Keep everything else in image 1 exactly as it is: the head's angle, the expression, the light and shadows, the colours of the scene, the framing and the art style. No text.";

// The face every key is matched to: the sheet's front close-up of the main character.
export const faceReference = (p: Project) => p.sheet?.cells.find((c) => c.id === "face-front")?.image;

// Only with the main character alone on the stage: with others there, SAM3 finds their heads too
// and every one would get the main character's face.
export const faceFixable = (p: Project) => !!faceReference(p) && !(p.sceneAssets ?? []).some((a) => a.kind === "character" && a.at);

// The key with its face matched, or null when no head was found (or one too small to repaint).
export async function matchFace(image: string, reference: string, outDir: string, track?: (jobId: string) => unknown): Promise<string | null> {
  const [mask] = await runWorkflow({ workflow: "01_parts.api.json", onSubmit: track, set: [["2", "prompt", "head"], ["2", "confidence_threshold", 0.4]], images: [["1", image]], output: "4", outDir: `${outDir}/mask` });
  const crop = `${outDir}/crop.png`;
  const { stdout } = await run(PYTHON, ["-I", PATCH, "crop", image, mask, crop]);
  const { box } = JSON.parse(stdout) as { box: number[] | null };
  if (!box) return null;
  const [face] = await runWorkflow({ workflow: "03_key_face.api.json", onSubmit: track, set: [["17", "prompt", PROMPT], ["22", "seed", 5]], images: [["1", crop], ["2", reference]], output: "28", outDir: `${outDir}/face` });
  const out = `${outDir}/fixed.png`;
  await run(PYTHON, ["-I", PATCH, "paste", image, face, box.join(","), out]);
  return out;
}
