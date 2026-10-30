"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { startJob } from "@/lib/jobs";
import { getProject, updateProject } from "@/lib/store";
import { renderSheet } from "@/features/turnaround/sheet";
import { DEFAULT_NEGATIVE } from "../graph";

// The shot's own reference sheet for its Character takes: the character's sheet with, in the front
// close-up's place, one of their painted expressions; a pose's four views in place of the
// turnaround's; and up to two scene assets (objects, cast members) beside them as props, from up to
// three angles each. Drawn as a job (a couple of seconds), kept with the shot.

const Choice = z.object({
  expression: z.string().regex(/^expr-[a-z0-9-]{1,16}$/).optional(),
  pose: z.string().regex(/^[a-z0-9]{1,16}$/).optional(),
  props: z.array(z.string().regex(/^[a-z0-9]{1,16}$/)).max(2).default([]),
});
const ANGLES = ["front", "threequarter", "side"] as const;

export async function drawShotSheet(id: string, raw: unknown) {
  const choice = Choice.parse(raw);
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!p.sheet?.drawn) throw new Error("Make the character's sheet first (Character, Turnaround).");
  const face = choice.expression ? p.sheet.cells.find((c) => c.id === choice.expression && c.image)?.image : undefined;
  if (choice.expression && !face) throw new Error("That expression is not painted yet.");
  const pose = choice.pose ? p.poses?.find((x) => x.id === choice.pose) : undefined;
  if (choice.pose && !pose) throw new Error("No such pose.");
  const props = choice.props.map((aid) => {
    const a = p.sceneAssets?.find((x) => x.id === aid);
    const views = a && (a.kind === "character" ? a.cutouts : a.views);
    if (!a || !views) throw new Error("A prop has no pictures yet.");
    return ANGLES.map((v) => views[v]).filter(Boolean) as string[];
  });
  await startJob(id, "shotsheet", async (ctx) => {
    const r = await renderSheet(id, "c1", {
      face,
      views: pose ? (["front", "threequarter", "side", "back"] as const).map((v) => pose.views[v]) : undefined,
      props,
      out: `shot/sheet/${Date.now().toString(36)}.png`,
    });
    if (!r || !(await ctx.alive())) return;
    await updateProject(id, (q) => void (q.shot = { action: "", negative: DEFAULT_NEGATIVE, takes: [], ...q.shot, sheet: { ...choice, ...r } }));
  }, "Drawing the shot's sheet");
  revalidatePath(`/p/${id}/shot`);
}
