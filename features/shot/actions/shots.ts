"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_MOVE, MOVES, presetMove } from "@/lib/camera";
import { currentFill } from "@/lib/progress";
import { DEFAULT_NEGATIVE } from "../graph";
import { SHOT_TYPES } from "../state";
import { SHOT_FIELDS, updateProject, type Project, type ShotData } from "@/lib/store";

const done = (id: string) => {
  revalidatePath(`/p/${id}/scene`);
  revalidatePath(`/p/${id}/shot`);
};

// A job writes into the active shot when it ends; switching under it would land it in the wrong one.
const JOBS = ["stage", "keyframes", "shot"];
function idle(p: Project) {
  const busy = JOBS.find((k) => p.jobs[k]?.status === "running");
  if (busy) throw new Error("Wait for the running job to finish before changing shots.");
}

function park(q: Project) {
  const data = Object.fromEntries(SHOT_FIELDS.map((f) => [f, q[f]])) as ShotData;
  q.stash = { ...q.stash, [q.activeShot!]: data };
}

function load(q: Project, shot: string) {
  const data = q.stash?.[shot] ?? {};
  for (const f of SHOT_FIELDS) (q as Record<string, unknown>)[f] = data[f];
  delete q.stash?.[shot];
  q.activeShot = shot;
}

const ShotId = z.string().regex(/^s\d{1,3}$/);
const Name = z.string().trim().min(1).max(40);

// A new shot of the same scene, starting from a camera move preset; it becomes the active one.
// A new shot from a preset (SHOT_TYPES: framing, move, the actor's walk, kind and length together)
// or, under More, from a bare camera move. The walk needs the actor on the stage; without them the
// shot gets the camera half and the walk comes when the preset is picked again in Camera.
export async function newShot(id: string, raw: unknown) {
  const key = z.enum([...SHOT_TYPES.map((t) => t.id), ...MOVES.map((m) => m.id)] as [string, ...string[]]).parse(raw);
  const type = SHOT_TYPES.find((t) => t.id === key);
  const spec = MOVES.find((m) => m.id === (type?.move ?? key))!;
  await updateProject(id, (q) => {
    idle(q);
    park(q);
    const n = Math.max(0, ...(q.shots ?? []).map((s) => Number(s.id.slice(1)))) + 1;
    const shot = `s${n}`;
    q.shots = [...(q.shots ?? []), { id: shot, name: `Shot ${n} · ${type?.label ?? spec.label}` }];
    load(q, shot);
    const cam = currentFill(q)?.camera;
    const at = q.stage?.at;
    q.camera = type
      ? cam && at
        ? presetMove(cam, { at, height: q.stage!.height, turn: q.stage!.turn }, type)
        : { ...DEFAULT_MOVE, preset: type.id, framing: type.framing, move: type.move, amount: type.amount, seconds: type.seconds }
      : { ...DEFAULT_MOVE, move: spec.id, amount: spec.value };
    if (type) q.shot = { action: "", negative: DEFAULT_NEGATIVE, takes: [], kind: type.kind };
  });
  done(id);
}

export async function selectShot(id: string, raw: unknown) {
  const shot = ShotId.parse(raw);
  await updateProject(id, (q) => {
    if (q.activeShot === shot) return;
    if (!q.shots?.some((s) => s.id === shot)) throw new Error("No such shot.");
    idle(q);
    park(q);
    load(q, shot);
  });
  done(id);
}

export async function renameShot(id: string, raw: unknown, rawName: unknown) {
  const shot = ShotId.parse(raw);
  const name = Name.parse(rawName);
  await updateProject(id, (q) => void (q.shots = q.shots?.map((s) => (s.id === shot ? { ...s, name } : s))));
  done(id);
}

// Removes a shot and what it made from the list (files stay on disk); the last shot stays.
export async function deleteShot(id: string, raw: unknown) {
  const shot = ShotId.parse(raw);
  await updateProject(id, (q) => {
    if ((q.shots?.length ?? 0) < 2) throw new Error("A scene keeps at least one shot.");
    idle(q);
    if (q.activeShot === shot) {
      const next = q.shots!.find((s) => s.id !== shot)!.id;
      load(q, next);
    } else delete q.stash?.[shot];
    q.shots = q.shots!.filter((s) => s.id !== shot);
  });
  done(id);
}
