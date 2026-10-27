import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Projects live on disk: data/projects/<id>/project.json, step results beside it.

export type Project = {
  id: string;
  createdAt: string;
  character: { prompt: string };
};

const ROOT = path.join(process.cwd(), "data", "projects");

export const projectDir = (id: string) => path.join(ROOT, id);

export async function createProject(prompt: string): Promise<Project> {
  const project: Project = {
    id: randomBytes(5).toString("hex"),
    createdAt: new Date().toISOString(),
    character: { prompt },
  };
  await mkdir(projectDir(project.id), { recursive: true });
  await writeFile(path.join(projectDir(project.id), "project.json"), JSON.stringify(project, null, 2));
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!/^[0-9a-f]{10}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(projectDir(id), "project.json"), "utf8"));
  } catch {
    return null;
  }
}
