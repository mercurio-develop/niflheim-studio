import path from "node:path";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { runWorkflow } from "@/lib/comfy";
import type { JobCtx } from "@/lib/jobs";
import { characterImage, viewImage } from "@/lib/progress";
import { PYTHON } from "@/lib/python";
import { charDir, charOf, getProject, projectDir, updateProject, type SheetCell, type SheetRow } from "@/lib/store";

// The character's Ingredients reference sheet (the LTX-2.5 IC-LoRA that keeps who and what is in a
// take), laid out like Lightricks' own sheets: three close-ups of the face and the things they wear
// or carry on top, the turnaround's four views below, the place at the bottom (scripts/make_sheet.py).
// The views are the turnaround's own (painted once, in a relaxed pose); the faces and the items are
// painted here with Qwen-Image-Edit. Server only: these take file paths, the actions call them.

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const run = promisify(execFile);
const DRAW = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "make_sheet.py");

const FACES: [string, string, string][] = [
  ["front", "Face · front", "from the front"],
  ["threequarter", "Face · three-quarter", "from a three-quarter angle"],
  ["side", "Face · side", "in side profile"],
];
const face = (from: string) => `A close-up portrait of this same character's face ${from}: head and shoulders filling the frame, a calm expression, the same face, hair, markings and colours, the same art style. Plain light grey background, no text.`;
const item = (thing: string) => `Show only the character's ${thing} on its own, with no one wearing or holding it, laid out as a clean product shot that shows its shape, colour and details, the same art style. Plain light grey background, nothing else, no text.`;

// An expression of the face, painted from the front close-up so it stays the same person.
export const expressionCell = (word: string): SheetCell => ({
  id: `expr-${word.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "").slice(0, 16)}`,
  kind: "expression",
  label: word,
  prompt: `Change only the expression of this face: make it ${word}. Keep the same face, hair, markings, colours, head angle, framing, light and art style. Plain light grey background, no text.`,
});

// The cells the sheet paints itself: the faces and the items, prompts written out so each can be
// edited and re-rolled.
export function planCells(items: string[]): SheetCell[] {
  return [
    ...FACES.map(([v, label, from]): SheetCell => ({ id: `face-${v}`, kind: "face", label, prompt: face(from) })),
    ...items.map((x, i): SheetCell => ({ id: `item-${i + 1}`, kind: "item", label: x, prompt: item(x) })),
  ];
}

// What a cell is painted from: a face from the turnaround's front, an item from the character as
// drawn (the turnaround may have hidden it).
async function fromOf(id: string, cid: string, cell: SheetCell) {
  const p = await getProject(id);
  if (!p) return null;
  if (cell.kind === "expression") return charOf(p, cid).sheet?.cells.find((c) => c.id === "face-front")?.image ?? null;
  return cell.kind === "item" ? (charOf(p, cid).turnaround?.source ?? characterImage(p, cid)) : viewImage(p, "front", cid);
}

export async function paintCell(id: string, cid: string, cell: SheetCell, ctx: JobCtx) {
  const from = await fromOf(id, cid, cell);
  if (!from) return;
  const dir = charDir(cid, `sheet/${cell.id}-${Date.now().toString(36)}`);
  const [image] = await runWorkflow({ workflow: "01_edit.api.json", onSubmit: ctx.track, set: [["17", "prompt", cell.prompt], ["22", "seed", seed()]], images: [["1", abs(id, from)]], output: "28", outDir: abs(id, dir) });
  if (!(await ctx.alive())) return;
  // Items are cut out for the sheet's grey cells; faces keep their own grey.
  const [cutout] = cell.kind === "item" ? await runWorkflow({ workflow: "02_cutout.api.json", onSubmit: ctx.track, images: [["1", image]], output: "6", outDir: abs(id, `${dir}/cut`) }) : [undefined];
  if (!(await ctx.alive())) return;
  await updateProject(id, (q) => {
    const c = charOf(q, cid).sheet?.cells.find((x) => x.id === cell.id);
    if (c) Object.assign(c, { image: rel(id, image), cutout: cutout && rel(id, cutout) });
  });
}

// What a shot changes in the sheet it draws (all project-relative paths): the front close-up (an
// expression), the four views (a pose), the props beside the character, and where it is written.
export type SheetOverrides = { face?: string; views?: (string | undefined)[]; props?: string[][]; out?: string };

// The sheet drawn from the turnaround's views and the painted cells, with the place when the
// project has one, or with a shot's overrides. Returns the file and the rows it drew, so a take's
// prompt can say each cell by its place.
export async function renderSheet(id: string, cid: string, o: SheetOverrides = {}) {
  const p = await getProject(id);
  const sheet = p ? charOf(p, cid).sheet : undefined;
  if (!p || !sheet) return null;
  const painted = (kind: SheetCell["kind"]) => sheet.cells.filter((c) => c.kind === kind && c.image);
  const faces = painted("face").map((c) => c.image!);
  if (o.face) faces[0] = o.face;
  const views = o.views ?? (["front", "threequarter", "side", "back"] as const).map((v) => viewImage(p, v, cid) ?? undefined);
  const out = o.out ?? charDir(cid, `sheet/sheet-${Date.now().toString(36)}.png`);
  const spec = {
    out: abs(id, out),
    faces: faces.map((f) => abs(id, f)),
    items: painted("item").map((c) => abs(id, c.cutout ?? c.image!)),
    views: views.map((f) => (f ? abs(id, f) : null)),
    props: (o.props ?? []).map((p) => p.map((f) => abs(id, f))),
    set: p.set?.image ? abs(id, p.set.image) : null,
  };
  await mkdir(path.dirname(spec.out), { recursive: true });
  const { stdout } = await run(PYTHON, ["-I", DRAW, JSON.stringify(spec)], { maxBuffer: 1 << 20 });
  return { drawn: out, rows: JSON.parse(stdout) as SheetRow[] };
}

export async function drawSheet(id: string, cid: string) {
  const r = await renderSheet(id, cid);
  if (!r) return;
  await updateProject(id, (q) => {
    const s = charOf(q, cid).sheet;
    if (s) Object.assign(s, { ...r, at: new Date().toISOString() });
  });
}

// A new sheet for the character's turnaround: its faces and items painted side by side (about a
// minute on Comfy Cloud), then drawn.
export async function paintSheet(id: string, cid: string, items: string[], ctx: JobCtx) {
  const cells = planCells(items);
  await updateProject(id, (q) => void (charOf(q, cid).sheet = { cells }));
  await ctx.progress(`Painting the sheet: ${cells.length} close-ups and things`);
  await Promise.all(cells.map((c) => paintCell(id, cid, c, ctx)));
  if (!(await ctx.alive())) return;
  await ctx.progress("Drawing the sheet");
  await drawSheet(id, cid);
}
