import { access } from "node:fs/promises";
import path from "node:path";
import { sheetInputs } from "@/features/turnaround/sheet";
import { charOf, projectDir, type JobRecord, type Project } from "./store";

// One job record per step, read from the project before anyone clicks and before any Comfy call:
// what the step is, which workflow or script runs it, the pictures it reads and makes by role
// (project-relative), and which of those are not on disk. Node ids stay inside the workflow call.

export type JobStep = "sheet" | "stage";
export type JobSheet = JobRecord & { step: JobStep; missing: string[]; blocked: boolean };

const VIEWS = ["front", "threequarter", "side", "back"] as const;
const exists = (id: string, f: string) => access(path.join(projectDir(id), f)).then(() => true, () => false);

type Roles = Record<string, (string | undefined | null)[]>;
// Roles with only the paths that are set; a role whose picture is not set yet is kept as an empty
// slot (missing), so a missing expression or view is named, not silently dropped.
const named = (r: Roles) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map((f) => f ?? "")]));

function sheetRecord(p: Project, cid: string): Pick<JobRecord, "description" | "workflow" | "inputs" | "outputs"> {
  const choice = p.shot?.sheet;
  const cells = charOf(p, cid).sheet?.cells ?? [];
  const pose = choice?.pose ? p.poses?.find((x) => x.id === choice.pose) : undefined;
  const exprCells = cells.filter((c) => c.kind === "expression" && (!choice?.expression || c.id === choice.expression));
  const face = choice?.expression ? cells.find((c) => c.id === choice.expression)?.image : undefined;
  const { faces, items, views } = sheetInputs(p, cid, { face, views: pose && VIEWS.map((v) => pose.views[v]) });
  const inputs: Roles = {
    ...Object.fromEntries(exprCells.map((c) => [`expression:${c.label}`, [c.image]])),
    faces,
    items,
    ...(pose ? Object.fromEntries(VIEWS.map((v, i) => [`pose:${v}`, [views[i]]])) : { views: views as (string | undefined)[] }),
  };
  const s = charOf(p, cid).sheet;
  return {
    description: pose ? `Draws the reference sheet with ${pose.label} and ${choice?.expression ? "the chosen expression" : "the base face"}` : "Draws the reference sheet from the faces, items and four views",
    workflow: "scripts/make_sheet.py",
    inputs: named(inputs),
    outputs: { sheet: [choice?.drawn ?? s?.drawn ?? ""] },
  };
}

function stageRecord(p: Project): Pick<JobRecord, "description" | "workflow" | "inputs" | "outputs"> {
  const k = p.keyframes;
  return {
    description: "Paints the keyframes along the camera move",
    workflow: "01_edit.api.json",
    inputs: named({ raw: k?.raw ?? [] }),
    outputs: named({ keyframes: k?.keys ?? [] }),
  };
}

// The record for a step. A path that is empty or not on disk is missing; the step is blocked when
// the files it needs are: the sheet step's inputs, the stage step's keyframes (its outputs).
export async function expect(p: Project, step: JobStep, cid = "c1"): Promise<JobSheet> {
  const r = step === "sheet" ? sheetRecord(p, cid) : stageRecord(p);
  const gone = async (roles: Record<string, string[]>) => {
    const out: string[] = [];
    for (const [role, files] of Object.entries(roles)) {
      for (const [i, f] of files.entries()) if (!f || !(await exists(p.id, f))) out.push(f || `${role}[${i}]`);
    }
    return out;
  };
  const nothing = step === "stage" && !Object.values(r.outputs).flat().length;
  const missing = await gone(step === "sheet" ? r.inputs : r.outputs);
  if (nothing) missing.push("keyframes");
  return { step, ...r, missing, blocked: missing.length > 0 };
}
