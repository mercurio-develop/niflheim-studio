import { access } from "node:fs/promises";
import path from "node:path";
import { sheetInputs } from "@/features/turnaround/sheet";
import { allShots, charOf, projectDir, type JobRecord, type Project } from "./store";

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

const present = async (id: string, roles: Record<string, string[]>) => {
  const out: Record<string, string[]> = {};
  for (const [role, files] of Object.entries(roles)) out[role] = (await Promise.all(files.map(async (f) => (f && (await exists(id, f)) ? f : "")))).filter(Boolean);
  return out;
};

// The record a job stores when it starts: what it is and the input paths that are on disk (outputs
// empty until it finishes). `missing` names the inputs that are not: the step is blocked and no
// Comfy call is made. The stage step's raw pictures only block when they are set but gone.
export async function startRecord(p: Project, step: JobStep, cid = "c1"): Promise<{ record: JobRecord; missing: string[] }> {
  const r = step === "sheet" ? sheetRecord(p, cid) : stageRecord(p);
  const missing: string[] = [];
  for (const [role, files] of Object.entries(r.inputs)) {
    for (const [i, f] of files.entries()) if (!f ? step === "sheet" : !(await exists(p.id, f))) missing.push(f || `${role}[${i}]`);
  }
  return {
    record: { description: r.description, workflow: r.workflow, inputs: await present(p.id, r.inputs), outputs: Object.fromEntries(Object.keys(r.outputs).map((k) => [k, []])) },
    missing,
  };
}

// Why a take of this kind cannot start, or null: a character take needs the drawn sheet on disk, a
// camera take needs the stage keyframes on disk. Read from the project, before any Comfy call.
export async function takeProblem(p: Project, kind: "character" | "camera", cid = "c1"): Promise<string | null> {
  if (kind === "character") {
    const drawn = p.shot?.sheet?.drawn ?? charOf(p, cid).sheet?.drawn;
    return drawn && (await exists(p.id, drawn)) ? null : "Make the character's sheet first (sheet.drawn is missing).";
  }
  const { missing } = await expect(p, "stage", cid);
  return missing.length ? `Make the keyframes first (missing: ${missing.join(", ")}).` : null;
}

// The output paths once the job is done: the files that exist, by role.
export async function finishOutputs(p: Project, step: JobStep, cid = "c1") {
  return present(p.id, (step === "sheet" ? sheetRecord(p, cid) : stageRecord(p)).outputs);
}

export type FlowBox = { step: JobStep; description: string; workflow: string; blocked: boolean; missing: string[]; output: string | null };

export type FlowLine = { shot: string; from: string; frame: string | null; missing: string | null };

// One line per shot after the first: it takes the previous shot's last frame as key 1
// (seededFrom.frame). `missing` names the frame path when it is gone, or says it was not taken yet.
export async function flowLines(p: Project): Promise<FlowLine[]> {
  const shots = allShots(p);
  return Promise.all(
    shots.slice(1).map(async (s, i) => {
      const frame = s.seededFrom?.frame ?? null;
      const there = frame ? await exists(p.id, frame) : false;
      return { shot: s.name, from: shots[i].name, frame: there ? frame : null, missing: frame ? (there ? null : frame) : "not taken yet" };
    }),
  );
}

// One box per expect() step for the support view: its state, what it is, and the first output
// picture on disk (null when none). Reads only; nothing here writes the project.
export async function flowBoxes(p: Project, cid = "c1"): Promise<FlowBox[]> {
  const steps: JobStep[] = ["sheet", "stage"];
  return Promise.all(
    steps.map(async (step) => {
      const r = await expect(p, step, cid);
      const [output] = (await finishOutputs(p, step, cid))[step === "sheet" ? "sheet" : "keyframes"] ?? [];
      return { step, description: r.description, workflow: r.workflow, blocked: r.blocked, missing: r.missing, output: output ?? null };
    }),
  );
}

export type FlowPicture = { id: string; label: string; feeds: string | null; workflow: string | null; file: string | null; image: string | null; missing: string | null };

// The picture chain for the support view, in order: turnaround views, the character sheet, a face
// expression, pose views, the stage card, the shot sheet, the clay clip, the LTX take. `feeds` names
// the box a picture goes into: a character take is fed by the shot sheet, a camera take by the clay
// clip; the stage card feeds the clay clip and never the take. A path that is unset or gone is
// missing. Reads only.
export async function flowChain(p: Project, cid = "c1"): Promise<FlowPicture[]> {
  const c = charOf(p, cid);
  const kind = p.shot?.kind ?? "camera";
  const choice = p.shot?.sheet;
  const cells = c.sheet?.cells ?? [];
  const pose = choice?.pose ? c.poses?.find((x) => x.id === choice.pose) : undefined;
  const expr = choice?.expression ? cells.find((x) => x.id === choice.expression) : undefined;
  const take = p.shot?.takes?.[p.shot.picked ?? p.shot.takes.length - 1];
  const stageCard = p.stage ? (p.stage.cutouts.front ?? Object.values(p.stage.cutouts)[0]) : undefined;
  type Item = { id: string; label: string; feeds: string | null; workflow: string | null; file: string | null | undefined; video?: boolean };
  const items: Item[] = [
    ...VIEWS.map((v) => {
      const s = c.turnaround?.views[v];
      return { id: `view:${v}`, label: `Turnaround ${v}`, feeds: "Character sheet", workflow: null, file: s?.versions[s.current]?.image };
    }),
    { id: "sheet", label: "Character sheet", feeds: kind === "character" ? "Shot sheet" : null, workflow: "scripts/make_sheet.py", file: c.sheet?.drawn },
    ...(choice?.expression ? [{ id: "expression", label: `Face expression${expr ? `: ${expr.label}` : ""}`, feeds: "Shot sheet", workflow: null, file: expr?.image }] : []),
    ...(pose ? VIEWS.map((v) => ({ id: `pose:${v}`, label: `Pose ${pose.label} ${v}`, feeds: "Shot sheet", workflow: null, file: pose.views[v] })) : []),
    { id: "stage", label: "Stage card", feeds: kind === "camera" ? "Clay clip" : null, workflow: null, file: stageCard },
    ...(kind === "character" ? [{ id: "shot-sheet", label: "Shot sheet", feeds: "LTX take", workflow: "features/shot/actions/sheet.ts", file: choice?.drawn }] : []),
    ...(kind === "camera" ? [{ id: "clay", label: "Clay clip", feeds: "LTX take", workflow: null, file: p.layout?.clip, video: true }] : []),
    { id: "take", label: "LTX take", feeds: null, workflow: null, file: take?.video, video: true },
  ];
  return Promise.all(
    items.map(async (i) => {
      const there = i.file ? await exists(p.id, i.file) : false;
      return { id: i.id, label: i.label, feeds: i.feeds, workflow: i.workflow, file: there ? i.file! : null, image: there && !i.video ? i.file! : null, missing: there ? null : i.file || i.label };
    }),
  );
}
