"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelJob, startJob } from "@/lib/jobs";
import { viewImage } from "@/lib/progress";
import { CID, charKey, charOf, getProject, updateProject } from "@/lib/store";
import { drawSheet, paintCell, paintSheet } from "../sheet";

// The character's Ingredients reference sheet (features/turnaround/sheet.ts). Generate in the
// turnaround makes it with the views; these remake it, or one of its pictures, on their own.

const done = (id: string) => {
  revalidatePath(`/p/${id}/character`);
  revalidatePath(`/p/${id}/shot`);
};
const jobKey = (cid = "c1") => charKey(cid, "sheet");
const Cid = z.string().regex(CID).optional();
const Items = z.array(z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/)).max(3);
const Cell = z.string().regex(/^(face|item)-[a-z0-9]{1,16}$/);
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
      if (await ctx.alive()) await drawSheet(id, cid);
    },
    `Painting ${cell.label.toLowerCase()} again`,
  );
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
