import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectDir } from "@/lib/store";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".glb": "model/gltf-binary" };

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]/[...path]">) {
  const { id, path: parts } = await ctx.params;
  if (!/^[0-9a-f]{10}$/.test(id)) return new Response("not found", { status: 404 });
  const root = projectDir(id);
  const file = path.resolve(root, ...parts);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(root + path.sep) || !type) return new Response("not found", { status: 404 });
  try {
    // Step results never change in place (new runs get new folders), so they cache forever.
    return new Response(await readFile(file), {
      headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
