"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { CID, charKey, charOf, getProject, updateProject } from "@/lib/store";
import { drawSheet, expressionCell, paintCell, paintSheet, planCells } from "../sheet";

// The character's Ingredients reference sheet (features/turnaround/sheet.ts). Generate in the
// turnaround makes it with the views; these remake it, or one of its pictures, on their own.

const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (cid = "c1") => charKey(cid, "sheet");
const Cid = z.string().regex(CID).optional();
const Items = z.array(z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/)).max(3);
const Cell = z.string().regex(/^(face|item|expr)-[a-z0-9-]{1,16}$/);
const Word = z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z][a-z ,'-]*$/, "Say the expression in a few words.");
const MAX_EXPRESSIONS = 6;
const Prompt = z.string().trim().min(10).max(600);

// The faces and items painted again from today's turnaround, then the sheet drawn.
export async function makeSheet(id: string, rawItems: unknown, rawCid?: unknown) {
  const items = Items.parse(rawItems);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!viewImage(p, "front", cid)) throw new Error("Generate the turnaround first: the sheet is painted from its front.");
  await startJob(id, jobKey(cid), (ctx) => paintSheet(id, cid, items, ctx), "Painting the sheet");
  done(id);
}

// One face or item again, with its prompt as it is or as edited; then the sheet is drawn again.
// (The views are the turnaround's: Again or Fix on a view, then the sheet redraws.)
export async function rerollCell(id: string, rawCell: unknown, rawPrompt?: unknown, rawCid?: unknown) {
  const cellId = Cell.parse(rawCell);
  const prompt = rawPrompt === undefined || rawPrompt === null ? undefined : Prompt.parse(rawPrompt);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const cell = p ? charOf(p, cid).sheet?.cells.find((c) => c.id === cellId) : undefined;
  if (!cell) throw new Error("Make the sheet first.");
  const next = { ...cell, prompt: prompt ?? cell.prompt };
  await updateProject(id, (q) => {
    const c = charOf(q, cid).sheet?.cells.find((x) => x.id === cellId);
    if (c) c.prompt = next.prompt;
  });
  await startJob(
    id,
    jobKey(cid),
    async (ctx) => {
      await paintCell(id, cid, next, ctx);
      if (cell.kind !== "expression" && (await ctx.alive())) await drawSheet(id, cid);
    },
    `Painting ${cell.label.toLowerCase()} again`,
  );
  done(id);
}

// A new expression of the face (smiling, angry, scared... or the user's words), painted from the
// front close-up; a shot can put it in its sheet. Up to 6; the same word again is re-rolled.
export async function addExpression(id: string, rawWord: unknown, rawCid?: unknown) {
  const word = Word.parse(rawWord);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const sheet = p ? charOf(p, cid).sheet : undefined;
  if (!sheet?.cells.some((c) => c.id === "face-front" && c.image)) throw new Error("Make the sheet first: expressions are painted from its front close-up.");
  const cell = expressionCell(word);
  const others = sheet.cells.filter((c) => c.kind === "expression" && c.id !== cell.id);
  if (others.length >= MAX_EXPRESSIONS) throw new Error(`Up to ${MAX_EXPRESSIONS} expressions.`);
  await updateProject(id, (q) => {
    const s = charOf(q, cid).sheet;
    if (s) s.cells = [...s.cells.filter((c) => c.id !== cell.id), cell];
  });
  await startJob(id, jobKey(cid), (ctx) => paintCell(id, cid, cell, ctx), `Painting ${word}`);
  done(id);
}

// A thing they wear or carry, in the user's words (the tags may miss it: the troll was tagged
// armor, belt, gun), painted on its own and added to the sheet. Up to 3.
export async function addItem(id: string, rawWord: unknown, rawCid?: unknown) {
  const [word] = Items.parse([rawWord]);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const sheet = p ? charOf(p, cid).sheet : undefined;
  if (!sheet) throw new Error("Make the sheet first.");
  const items = sheet.cells.filter((c) => c.kind === "item");
  if (items.some((c) => c.label === word)) throw new Error(`The ${word} is on the sheet already.`);
  if (items.length >= 3) throw new Error("Up to 3 things on the sheet: remove one first.");
  const cell = planCells([word])[3];
  cell.id = `item-${Date.now().toString(36).slice(-6)}`;
  await updateProject(id, (q) => {
    const s = charOf(q, cid).sheet;
    if (s) s.cells = [...s.cells, cell];
  });
  await startJob(
    id,
    jobKey(cid),
    async (ctx) => {
      await paintCell(id, cid, cell, ctx);
      if (await ctx.alive()) await drawSheet(id, cid);
    },
    `Painting the ${word}`,
  );
  done(id);
}

// A thing or an expression off the sheet (its picture stays on disk); the sheet is drawn again
// when a thing goes.
export async function removeCell(id: string, rawCell: unknown, rawCid?: unknown) {
  const cellId = Cell.parse(rawCell);
  const cid = Cid.parse(rawCid) ?? "c1";
  let item = false;
  await updateProject(id, (q) => {
    const s = charOf(q, cid).sheet;
    if (!s) return;
    item = s.cells.some((c) => c.id === cellId && c.kind === "item");
    s.cells = s.cells.filter((c) => !(c.id === cellId && (c.kind === "expression" || c.kind === "item")));
  });
  if (item) await startJob(id, jobKey(cid), () => drawSheet(id, cid), "Drawing the sheet");
  done(id);
}


// The sheet drawn again from the views as they are now (after Again or Fix on a view).
export async function redrawSheet(id: string, rawCid?: unknown) {
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!p || !charOf(p, cid).sheet) throw new Error("Make the sheet first.");
  await startJob(id, jobKey(cid), () => drawSheet(id, cid), "Drawing the sheet");
  done(id);
}

export async function cancelSheet(id: string, rawCid?: unknown) {
  await cancelJob(id, jobKey(Cid.parse(rawCid) ?? "c1"));
  done(id);
}
