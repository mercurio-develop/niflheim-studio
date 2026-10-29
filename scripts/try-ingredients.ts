// Proof for the Ingredients sheet: the same LTX-2.5 take (same keys, prompt and seed) shot twice,
// once from the keyframes alone and once with the reference sheet as a held IC-LoRA guide, so the
// two can be compared side by side. Writes sheet.png and both MP4s.
// Run: node --env-file=.env scripts/try-ingredients.ts [projectId] "what happens" [sheet|keys|both]
import path from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";
import { runWorkflow } from "../lib/comfy.ts";
import { frameCount } from "../lib/camera.ts";
import { middleImageNode, shapeShot } from "../features/shot/graph.ts";
import { addIngredients, sheetPrompt, SHEET_NODE, withSheet, type SheetRows } from "../features/shot/ingredients.ts";

const id = process.argv[2] ?? "c4a7105e01";
const action = process.argv[3] ?? "walks slowly down the alley toward the camera, looking around, the coat stirring in the wind";
const which = process.argv[4] ?? "both";
const dir = path.join(process.cwd(), "data", "projects", id);
const out = path.join(process.cwd(), "data", "proof", "ingredients", id);
mkdirSync(out, { recursive: true });
const p = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
const k = p.keyframes;
if (!k?.keys?.every(Boolean)) throw new Error(`${id} has no painted keyframes`);
const length = frameCount(p.camera.seconds);
const keys = k.keys.map((f: string) => path.join(dir, f));

const cut = p.stage?.cutouts ?? {};
const views = ["front", "threequarter", "side", "back"].map((v) => (cut[v] ? path.join(dir, cut[v]) : null));
const sheet = path.join(out, "sheet.png");
const python = process.env.NIFL_PYTHON || path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const spec = { out: sheet, views, props: [], set: p.set?.image ? path.join(dir, p.set.image) : null };
const rows = JSON.parse(execFileSync(python, ["-I", "scripts/make_sheet.py", JSON.stringify(spec)], { encoding: "utf8" })) as SheetRows;

const [name, ...rest] = String(p.character.prompt).split(",");
const who = { name: name.trim(), description: rest.join(",").trim() };
const video = `One continuous take with no cuts. The camera ${p.camera.move === "push" ? "pushes in slowly" : "moves"} toward ${p.character.prompt}, who ${action}, with a calm, curious expression. ${p.set.prompt}. Consistent art style.`;
const negative = "worst quality, inconsistent motion, blurry, jittery, distorted, cut, scene change";
const images = (): [string, string][] => [["1", keys[0]], ["2", keys.at(-1)], ...keys.slice(1, -1).map((f: string, i: number) => [middleImageNode(i), f] as [string, string])];

async function take(label: string, sheetOn: boolean) {
  const prompt = sheetOn ? withSheet(sheetPrompt(rows, who, [], p.set?.prompt), video) : video;
  const t0 = performance.now();
  const [file] = await runWorkflow({
    workflow: "03_shot.api.json",
    edit: (g) => {
      shapeShot(g, k.frames, length);
      if (sheetOn) addIngredients(g, length);
    },
    set: [["20", "text", prompt], ["21", "text", negative], ["40", "noise_seed", 42]],
    images: sheetOn ? [...images(), [SHEET_NODE, sheet]] : images(),
    output: "55",
    ext: "mp4",
    outDir: path.join(out, label),
    timeoutMs: 25 * 60_000,
  });
  console.log(`${label}: ${((performance.now() - t0) / 1000).toFixed(0)}s ${file}\n  prompt: ${prompt}`);
}

console.log(`sheet: ${sheet} ${JSON.stringify(rows)}; ${length} frames, keys at ${k.frames.join("/")}`);
await Promise.all([which !== "keys" && take("sheet", true), which !== "sheet" && take("keys", false)].filter(Boolean));
