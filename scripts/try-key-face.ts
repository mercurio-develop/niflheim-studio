// Proof for the key face pass: SAM3 finds the face in a frame, the crop is repainted by
// Qwen-Image-Edit from the crop and a reference face (workflows/03_key_face.api.json), and pasted
// back. Writes the mask, the crop, the repaint and the fixed frame.
// Run: node --env-file=.env scripts/try-key-face.ts <frame.png> <reference-face.png> [outName]
import path from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { runWorkflow } from "../lib/comfy.ts";

const [frame, reference, name = "face"] = process.argv.slice(2);
const out = path.join(process.cwd(), "data", "proof", "key-face", name);
const python = process.env.NIFL_PYTHON || path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const patch = (...args: string[]) => execFileSync(python, ["-I", "scripts/face_patch.py", ...args], { encoding: "utf8" });
const PROMPT = "Repaint the face in image 1 so it is the same character as image 2: the same face shape, eyes, nose, mouth, skin, hair and markings as image 2. Keep everything else in image 1 exactly as it is: the head's angle, the expression, the light and shadows, the colours of the scene, the framing and the art style. No text.";

const t0 = performance.now();
const [mask] = await runWorkflow({ workflow: "01_parts.api.json", set: [["2", "prompt", "head"], ["2", "confidence_threshold", 0.4]], images: [["1", frame]], output: "4", outDir: path.join(out, "mask") });
const { box } = JSON.parse(patch("crop", frame, mask, path.join(out, "crop.png"))) as { box: number[] | null };
if (!box) throw new Error("no face found, or too small to repaint");
const [face] = await runWorkflow({ workflow: "03_key_face.api.json", set: [["17", "prompt", PROMPT], ["22", "seed", 5]], images: [["1", path.join(out, "crop.png")], ["2", reference]], output: "28", outDir: path.join(out, "face") });
patch("paste", frame, face, box.join(","), path.join(out, "fixed.png"));
console.log(`face pass: ${((performance.now() - t0) / 1000).toFixed(0)}s box ${box.join(",")} -> ${path.join(out, "fixed.png")}`);
