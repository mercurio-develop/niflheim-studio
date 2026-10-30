import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PYTHON } from "@/lib/python";
import { allShots, getProject, projectDir } from "@/lib/store";

const run = promisify(execFile);

// Every shot's takes as one zip for your own editor, named so they sort: shot-1_take-3_seed-123.mp4.
// Stored (videos do not shrink), with Python's zipfile; made again only when the takes change.
const ZIP = "import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_STORED)\nfor src,name in json.loads(sys.argv[2]): z.write(src,name)\nz.close()";

export async function GET(_req: Request, ctx: RouteContext<"/api/takes/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{10}$/.test(id)) return new Response("not found", { status: 404 });
  const p = await getProject(id);
  if (!p) return new Response("not found", { status: 404 });
  const root = projectDir(id);
  const files = allShots(p).flatMap((s, n) => (s.shot?.takes ?? []).map((t, i) => [path.join(root, t.video), `shot-${n + 1}_take-${i + 1}_seed-${t.seed}.mp4`] as [string, string]));
  if (!files.length) return new Response("No takes yet.", { status: 404 });
  const key = createHash("sha1").update(JSON.stringify(files)).digest("hex").slice(0, 12);
  const out = path.join(root, "exports", `takes-${key}.zip`);
  try {
    await stat(out);
  } catch {
    await mkdir(path.dirname(out), { recursive: true });
    await run(PYTHON, ["-I", "-c", ZIP, out, JSON.stringify(files)], { maxBuffer: 1 << 20 });
  }
  return new Response(await readFile(out), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="takes-${id}.zip"` },
  });
}
