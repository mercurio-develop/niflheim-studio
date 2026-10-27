import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Projects live on disk: data/projects/<id>/project.json, step results beside it.
// Image paths in a project are relative to its folder and served by /api/files/<id>/<path>.

export type Job = { status: "running" | "done" | "error" | "cancelled"; startedAt: string; error?: string; comfyId?: string; run?: string };

export type ViewId = "threequarter" | "side" | "back";

export type Version = {
  image: string;
  label: string;
  parts: Record<string, string>; // part name -> mask image, for this version
  tags?: string[]; // parts Florence-2 sees in this version
};

export type Project = {
  id: string;
  createdAt: string;
  character: {
    prompt: string;
    style: string; // lib/styles.ts id
    seed: number;
    concepts: string[];
    versions: Version[];
    current: number | null; // index into versions
    doneAt?: string; // the user pressed Next with this version
  };
  turnaround?: {
    source: string; // the character version image the views were made from
    views: Partial<Record<ViewId, string>>;
  };
  jobs: Record<string, Job>;
};

const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "projects");
const ID = /^[0-9a-f]{10}$/;

export const projectDir = (id: string) => path.join(ROOT, id);
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

export async function createProject(prompt: string): Promise<Project> {
  const project: Project = {
    id: randomBytes(5).toString("hex"),
    createdAt: new Date().toISOString(),
    character: { prompt, style: "painterly", seed: Math.floor(Math.random() * 2 ** 31), concepts: [], versions: [], current: null },
    jobs: {},
  };
  await mkdir(projectDir(project.id), { recursive: true });
  await save(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ID.test(id)) return null;
  try {
    return normalize(JSON.parse(await readFile(projectFile(id), "utf8")));
  } catch {
    return null;
  }
}

// Projects made by older builds miss fields added since; fill them so every page can read them.
function normalize(p: Project): Project {
  const c = (p.character ??= { prompt: "" } as Project["character"]);
  c.style ??= "painterly";
  c.seed ??= Math.floor(Math.random() * 2 ** 31);
  c.concepts ??= [];
  c.versions ??= [];
  c.current ??= null;
  p.jobs ??= {};
  return p;
}

async function save(p: Project) {
  const tmp = `${projectFile(p.id)}.tmp`;
  await writeFile(tmp, JSON.stringify(p, null, 2));
  await rename(tmp, projectFile(p.id));
}

// One writer per project at a time: background jobs and actions both update project.json.
const locks = new Map<string, Promise<unknown>>();

export function updateProject(id: string, fn: (p: Project) => void): Promise<Project> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const p = await getProject(id);
    if (!p) throw new Error(`no project ${id}`);
    fn(p);
    await save(p);
    return p;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}
