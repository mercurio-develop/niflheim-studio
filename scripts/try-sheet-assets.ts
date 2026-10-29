// Proof for the sheet's own pictures, like Lightricks' Ingredients examples: from the turnaround's
// front, the character in a relaxed pose (no T-pose) from four sides, three close-ups of the face,
// and the things they wear or carry on their own as product shots; then the sheet from them.
// Writes everything under data/proof/ingredients/<id>/assets and sheet-assets.png + .json.
// Run: node --env-file=.env scripts/try-sheet-assets.ts [projectId] [item, item]
import path from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { runWorkflow } from "../lib/comfy.ts";

const id = process.argv[2] ?? "c4a7105e01";
const dir = path.join(process.cwd(), "data", "projects", id);
const out = path.join(process.cwd(), "data", "proof", "ingredients", id);
const p = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
const front = p.turnaround.views.front;
const source = path.join(dir, front.versions[front.current].image);
const items = process.argv.slice(3).length ? process.argv.slice(3) : ["shoulder bag", "brown coat"];

const KEEP = "Same character: the same face, body, clothes, colours and art style. Plain light grey background, nothing else in the image, no text.";
const edit = async (label: string, image: string, prompt: string) => {
  const [file] = await runWorkflow({
    workflow: "01_edit.api.json",
    set: [["17", "prompt", prompt], ["22", "seed", 7]],
    images: [["1", image]],
    output: "28",
    outDir: path.join(out, "assets", label),
  });
  console.log(`${label}: ${file}`);
  return file;
};
const cut = async (label: string, image: string) => {
  const [file] = await runWorkflow({ workflow: "02_cutout.api.json", images: [["1", image]], output: "6", outDir: path.join(out, "assets", `${label}-cut`) });
  return file;
};

const t0 = performance.now();
const relaxed = await edit(
  "front",
  source,
  `Make this character stand in a relaxed, natural pose: arms down at their sides, hands relaxed, weight on one leg, not a T-pose. Front view, full body, facing the viewer, the whole figure in frame. ${KEEP}`,
);
const turn = (from: string) => `Show this same character in exactly the same relaxed pose ${from}. Keep the arms and legs as they are; only the angle changes. Full body in frame. ${KEEP}`;
const face = (from: string) => `A close-up portrait of this same character's face ${from}: head and shoulders filling the frame, a calm expression, the same face, hair and colours, the same art style. Plain light grey background, no text.`;
const item = (thing: string) => `Show only the character's ${thing} on its own, with no person, laid out as a clean product shot that shows its shape, colour and details, the same art style. Plain light grey background, nothing else, no text.`;
const [threequarter, side, back, ...rest] = await Promise.all([
  edit("threequarter", relaxed, turn("from a three-quarter angle, turned 45 degrees to their left")),
  edit("side", relaxed, turn("from the side, a left profile")),
  edit("back", relaxed, turn("from behind, a back view")),
  edit("face-front", relaxed, face("from the front")),
  edit("face-threequarter", relaxed, face("from a three-quarter angle")),
  edit("face-side", relaxed, face("in side profile")),
  ...items.map((x, i) => edit(`item${i + 1}`, source, item(x))),
]);
const faces = rest.slice(0, 3);
const bodies = await Promise.all([relaxed, threequarter, side, back].map((f, i) => cut(`view${i + 1}`, f)));
const things = await Promise.all(rest.slice(3).map((f, i) => cut(`item${i + 1}`, f)));
console.log(`assets: ${((performance.now() - t0) / 1000).toFixed(0)}s`);

const python = process.env.NIFL_PYTHON || path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const spec = { out: path.join(out, "sheet-assets.png"), faces, items: things, views: bodies, set: path.join(dir, p.set.image) };
const rows = JSON.parse(execFileSync(python, ["-I", "scripts/make_sheet.py", JSON.stringify(spec)], { encoding: "utf8" }));
writeFileSync(path.join(out, "sheet-assets.json"), JSON.stringify({ rows, items }, null, 2));
console.log(spec.out, JSON.stringify(rows));
