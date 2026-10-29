"use server";

import path from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { relaxedPrompt, turnPrompt, viewImage } from "@/lib/progress";
import { CID, charDir, charKey, charOf, getProject, projectDir, updateProject, type SheetCell, type TurnaroundOptions } from "@/lib/store";

// The character's Ingredients reference sheet (the LTX-2.5 IC-LoRA that keeps who and what is in a
// take): pictures painted from the turnaround's front with Qwen-Image-Edit, like Lightricks' own
// sheets. The body in a relaxed pose (never the T-pose) from four sides, three close-ups of the
// face, and up to three things they wear or carry on their own as product shots; then the sheet is
// drawn from them (scripts/make_sheet.py) to see. 05_submit proof v3: with this sheet alone a take
// kept the lantern keeper's face, coat and bag with no pop-ins.

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const run = promisify(execFile);
const PYTHON = process.env.NIFL_PYTHON ?? path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const DRAW = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "make_sheet.py");
const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (cid = "c1") => charKey(cid, "sheet");
const Cid = z.string().regex(CID).optional();
const Item = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/);
const Cell = z.string().regex(/^(view|face|item)-[a-z0-9]{1,16}$/);
const Prompt = z.string().trim().min(10).max(600);

const TURNS: [string, string, string][] = [
  ["threequarter", "Three-quarter", "from a three-quarter angle, turned 45 degrees to their left"],
  ["side", "Side", "from the side, a left profile"],
  ["back", "Back", "from behind, a back view"],
];
const FACES: [string, string, string][] = [
  ["front", "Face · front", "from the front"],
  ["threequarter", "Face · three-quarter", "from a three-quarter angle"],
  ["side", "Face · side", "in side profile"],
];
const face = (from: string) => `A close-up portrait of this same character's face ${from}: head and shoulders filling the frame, a calm expression, the same face, hair, markings and colours, the same art style. Plain light grey background, no text.`;
const item = (thing: string) => `Show only the character's ${thing} on its own, with no one wearing or holding it, laid out as a clean product shot that shows its shape, colour and details, the same art style. Plain light grey background, nothing else, no text.`;

// The cells of a new sheet, prompts written out so each can be edited and re-rolled.
function plan(o: TurnaroundOptions | undefined, items: string[]): SheetCell[] {
  return [
    { id: "view-front", kind: "view", label: "Front", prompt: relaxedPrompt(o) },
    ...TURNS.map(([v, label, from]): SheetCell => ({ id: `view-${v}`, kind: "view", label, prompt: turnPrompt(from, o) })),
    ...FACES.map(([v, label, from]): SheetCell => ({ id: `face-${v}`, kind: "face", label, prompt: face(from) })),
    ...items.map((x, i): SheetCell => ({ id: `item-${i + 1}`, kind: "item", label: x, prompt: item(x) })),
  ];
}

// What a cell is painted from: the relaxed front and the items from the turnaround's front, every
// other cell from the relaxed front, so they all share its pose and look.
const fromOf = (cell: SheetCell, front: string, relaxed?: string) => (cell.id === "view-front" || cell.kind === "item" ? front : relaxed);

async function paint(id: string, cid: string, cell: SheetCell, from: string, ctx: JobCtx) {
  const dir = charDir(cid, `sheet/${cell.id}-${Date.now().toString(36)}`);
  const [image] = await runWorkflow({ workflow: "01_edit.api.json", onSubmit: ctx.track, set: [["17", "prompt", cell.prompt], ["22", "seed", seed()]], images: [["1", abs(id, from)]], output: "28", outDir: abs(id, dir) });
  if (!(await ctx.alive())) return;
  // Bodies and items are cut out for the sheet's grey cells; faces keep their own grey.
  const [cutout] = cell.kind === "face" ? [undefined] : await runWorkflow({ workflow: "02_cutout.api.json", onSubmit: ctx.track, images: [["1", image]], output: "6", outDir: abs(id, `${dir}/cut`) });
  if (!(await ctx.alive())) return;
  await updateProject(id, (q) => {
    const c = charOf(q, cid).sheet?.cells.find((x) => x.id === cell.id);
    if (c) Object.assign(c, { image: rel(id, image), cutout: cutout && rel(id, cutout) });
  });
}

// The sheet drawn from the cells that are painted, with the place when the project has one.
async function draw(id: string, cid: string) {
  const p = await getProject(id);
  const sheet = p && charOf(p, cid).sheet;
  if (!p || !sheet) return;
  const pic = (c?: SheetCell) => c && abs(id, c.cutout ?? c.image ?? "");
  const view = (v: string) => sheet.cells.find((c) => c.id === `view-${v}` && c.image);
  const spec = {
    out: abs(id, charDir(cid, `sheet/sheet-${Date.now().toString(36)}.png`)),
    faces: sheet.cells.filter((c) => c.kind === "face" && c.image).map((c) => abs(id, c.image!)),
    items: sheet.cells.filter((c) => c.kind === "item" && c.image).map(pic),
    views: ["front", "threequarter", "side", "back"].map((v) => pic(view(v)) ?? null),
    set: p.set?.image ? abs(id, p.set.image) : null,
  };
  const { stdout } = await run(PYTHON, ["-I", DRAW, JSON.stringify(spec)], { maxBuffer: 1 << 20 });
  const rows = JSON.parse(stdout);
  await updateProject(id, (q) => {
    const s = charOf(q, cid).sheet;
    if (s) Object.assign(s, { drawn: rel(id, spec.out), rows, at: new Date().toISOString() });
  });
}

// Every picture of the sheet: the relaxed front first, then the rest from it side by side (about
// 3 min on Comfy Cloud), then the sheet drawn.
export async function makeSheet(id: string, rawItems: unknown, rawCid?: unknown) {
  const items = z.array(Item).max(3).parse(rawItems);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  const front = viewImage(p, "front", cid);
  if (!front) throw new Error("Make the turnaround first: the sheet is painted from its front.");
  const cells = plan(charOf(p, cid).turnaround?.options, items);
  await updateProject(id, (q) => void (charOf(q, cid).sheet = { cells }));
  await startJob(
    id,
    jobKey(cid),
    async (ctx) => {
      await ctx.progress("Painting the relaxed front");
      await paint(id, cid, cells[0], front, ctx);
      const q = await getProject(id);
      const relaxed = q ? charOf(q, cid).sheet?.cells[0].image : undefined;
      if (!relaxed || !(await ctx.alive())) return;
      await ctx.progress(`Painting ${cells.length - 1} more: the sides, the face, the items`);
      await Promise.all(cells.slice(1).map((c) => paint(id, cid, c, fromOf(c, front, relaxed)!, ctx)));
      if (!(await ctx.alive())) return;
      await ctx.progress("Drawing the sheet");
      await draw(id, cid);
    },
    "Painting the sheet",
  );
  done(id);
}

// One picture again, with its prompt as it is or as edited; then the sheet is drawn again.
export async function rerollCell(id: string, rawCell: unknown, rawPrompt?: unknown, rawCid?: unknown) {
  const cellId = Cell.parse(rawCell);
  const prompt = rawPrompt === undefined || rawPrompt === null ? undefined : Prompt.parse(rawPrompt);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const sheet = p ? charOf(p, cid).sheet : undefined;
  const cell = sheet?.cells.find((c) => c.id === cellId);
  const front = p ? viewImage(p, "front", cid) : null;
  if (!sheet || !cell || !front) throw new Error("Make the sheet first.");
  const relaxed = sheet.cells[0].image;
  if (cellId !== "view-front" && cell.kind !== "item" && !relaxed) throw new Error("Paint the relaxed front first.");
  const next = { ...cell, prompt: prompt ?? cell.prompt };
  await updateProject(id, (q) => {
    const c = charOf(q, cid).sheet?.cells.find((x) => x.id === cellId);
    if (c) c.prompt = next.prompt;
  });
  await startJob(
    id,
    jobKey(cid),
    async (ctx) => {
      await paint(id, cid, next, fromOf(next, front, relaxed)!, ctx);
      if (await ctx.alive()) await draw(id, cid);
    },
    `Painting ${cell.label.toLowerCase()} again`,
  );
  done(id);
}

export async function cancelSheet(id: string, rawCid?: unknown) {
  await cancelJob(id, jobKey(Cid.parse(rawCid) ?? "c1"));
  done(id);
}
