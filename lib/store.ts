import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Projects live on disk: data/projects/<id>/project.json, step results beside it.
// Image paths in a project are relative to its folder and served by /api/files/<id>/<path>.

export type Job = { status: "running" | "done" | "error"; startedAt: string; error?: string };

export type Version = {
  image: string;
  label: string;
  parts: Record<string, string>; // part name -> mask image, for this version
};

export type Project = {
  id: string;
  createdAt: string;
  character: {
    prompt: string;
    seed: number;
    concepts: string[];
    versions: Version[];
    current: number | null; // index into versions
  };
  jobs: Record<string, Job>;
};

const ROOT = path.join(process.cwd(), "data", "projects");
const ID = /^[0-9a-f]{10}$/;

export const projectDir = (id: string) => path.join(ROOT, id);
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

export async function createProject(prompt: string): Promise<Project> {
  const project: Project = {
    id: randomBytes(5).toString("hex"),
    createdAt: new Date().toISOString(),
    character: { prompt, seed: Math.floor(Math.random() * 2 ** 31), concepts: [], versions: [], current: null },
    jobs: {},
  };
  await mkdir(projectDir(project.id), { recursive: true });
  await save(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ID.test(id)) return null;
  try {
    return JSON.parse(await readFile(projectFile(id), "utf8"));
  } catch {
    return null;
  }
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
