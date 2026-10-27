import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { STEPS, type StepSlug, type StepStatus } from "../steps";

// Reads data/projects/<id>/steps/<slug>.json ({ savedAt: ISO string, files: string[] }).
// Stale = a step saved after this one was: re-running marks later steps stale, never deletes them.

const ROOT = path.join(process.cwd(), "data", "projects");
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type StepState = {
  slug: StepSlug;
  label: string;
  status: StepStatus;
  savedAt: string | null;
  files: string[];
};

async function readStep(id: string, slug: string): Promise<{ savedAt: string; files: string[] } | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(ROOT, id, "steps", `${slug}.json`), "utf8"));
    if (typeof raw?.savedAt !== "string" || Number.isNaN(Date.parse(raw.savedAt))) return null;
    return { savedAt: raw.savedAt, files: Array.isArray(raw.files) ? raw.files.map(String) : [] };
  } catch {
    return null;
  }
}

export async function projectExists(id: string): Promise<boolean> {
  if (!ID.test(id)) return false;
  try {
    await readdir(path.join(ROOT, id));
    return true;
  } catch {
    return false;
  }
}

export async function getStepStates(id: string): Promise<StepState[]> {
  const saved = await Promise.all(STEPS.map((s) => readStep(id, s.slug)));
  let newestBefore = -Infinity;
  return STEPS.map((s, i) => {
    const r = saved[i];
    const t = r ? Date.parse(r.savedAt) : null;
    const status: StepStatus = !r ? "empty" : t! < newestBefore ? "stale" : "done";
    if (t !== null) newestBefore = Math.max(newestBefore, t);
    return { slug: s.slug, label: s.label, status, savedAt: r?.savedAt ?? null, files: r?.files ?? [] };
  });
}
