import path from "node:path";
import { homedir } from "node:os";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runWorkflow } from "@/lib/comfy";
import type { JobCtx } from "@/lib/jobs";
import { projectDir, type AssetView, type MeshColourView } from "@/lib/store";

// An object in 3D from one picture of it, with the graphs the character uses: its four views
// painted by Qwen (the front from the picture, every other angle from that front), then
// Hunyuan3D-2 MV from the front, side and back, coloured from the views (scripts/mesh_colour.py).

const run = promisify(execFile);
const PYTHON = process.env.NIFL_PYTHON || path.join(homedir(), "ComfyUI", ".venv", "bin", "python");
const COLOUR = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "mesh_colour.py");
const PAD = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "pad_square.py");
const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const square = (src: string, dest: string, flip = false) => run(PYTHON, ["-I", PAD, src, dest, ...(flip ? ["--flip"] : [])], { maxBuffer: 1 << 20 });

export const ASSET_VIEWS: { id: AssetView; from: string }[] = [
  { id: "front", from: "from the front" },
  { id: "threequarter", from: "from a three-quarter angle" },
  { id: "side", from: "from the side" },
  { id: "back", from: "from the back" },
];

// The prompt for one view: the first is the object alone from its picture (whole: complete it,
// including what the picture hides), the others turn that front. A character (a cast member) is
// shown whole, standing, like the main character's turnaround.
// look: a style phrase the first view is repainted in (an upload made to match the scene).
export function assetViewPrompt(name: string, v: (typeof ASSET_VIEWS)[number], first: boolean, whole: boolean, character = false, look?: string) {
  if (character)
    return first
      ? `Show only this character, ${name}, on their own: full body from head to feet, standing in a relaxed natural pose, front view, facing the viewer, centred, plain light grey background, nothing else in the image. Keep the face, body, clothes, colours and art style.`
      : `Show this same character ${v.from}, full body from head to feet, in the same pose, centred, plain light grey background, nothing else in the image. Keep the face, body, clothes, colours and art style.`;
  return first
    ? `Show only the ${name}${whole ? ", complete and whole, including the parts hidden in this picture," : " from this picture"} on its own, as a clean product view from the front, centred, nothing else in the image, plain light grey background.${look ? ` Repaint it in this art style, keeping its shape and colours: ${look}.` : ""}`
    : `Show this same ${name} ${v.from}, as a clean product view, centred, nothing else in the image, plain light grey background. Keep the same art style.`;
}

// Paint the four views from `image` (project-relative); `onView` gets each as it lands. false when
// cancelled.
export async function paintViews(id: string, name: string, image: string, whole: boolean, dir: string, ctx: JobCtx, onView: (v: AssetView, file: string) => Promise<unknown>, character = false, look?: string) {
  let front: string | null = null;
  for (const v of ASSET_VIEWS) {
    await ctx.progress(`Painting the ${name} ${v.from}`);
    const [out] = await runWorkflow({
      workflow: "01_edit.api.json",
      onSubmit: ctx.track,
      set: [["17", "prompt", assetViewPrompt(name, v, !front, whole, character, look)], ["22", "seed", seed()]],
      images: [["1", front ?? abs(id, image)]],
      output: "28",
      outDir: abs(id, `${dir}/${v.id}-${Date.now().toString(36)}`),
    });
    if (!(await ctx.alive())) return false;
    await onView(v.id, rel(id, out));
    front ??= out;
  }
  return true;
}

export type ColourViews = Partial<Record<MeshColourView, string>> & { front: string; side: string; back: string };

// Vertex colours from the views (about 5 s), written next to the shape under a new name each time,
// so a browser never shows a cached older one.
export async function colourMesh(id: string, glb: string, views: ColourViews) {
  const out = path.join(path.dirname(abs(id, glb)), `coloured-${Date.now().toString(36)}.glb`);
  const quarter = views.threequarter ? abs(id, views.threequarter) : "-";
  await run(PYTHON, ["-I", COLOUR, abs(id, glb), out, abs(id, views.front), abs(id, views.side), abs(id, views.back), quarter], { maxBuffer: 1 << 20 });
  return rel(id, out);
}

// The shape from the front, side and back. Each view is padded to a square on its own studio grey
// (Hunyuan3D-2 MV wants square; the painted views are 7:9) and the right is the side mirrored, then
// Hunyuan (~50 s on the 4080) and colour. null when cancelled.
export async function meshFromViews(id: string, views: ColourViews, dir: string, ctx: JobCtx) {
  await ctx.progress("Preparing the views");
  const work = abs(id, `${dir}/${Date.now().toString(36)}`);
  await mkdir(work, { recursive: true });
  const front = path.join(work, "front.png");
  const side = path.join(work, "left.png");
  const back = path.join(work, "back.png");
  const right = path.join(work, "right.png");
  await square(abs(id, views.front), front);
  await square(abs(id, views.side), side);
  await square(abs(id, views.back), back);
  await square(abs(id, views.side), right, true);
  if (!(await ctx.alive())) return null;
  await ctx.progress("Building the 3D model");
  const [glb] = await runWorkflow({
    workflow: "02_turnaround_mesh.api.json",
    onSubmit: ctx.track,
    set: [["3", "seed", seed()]],
    images: [["56", front], ["85", side], ["82", back], ["87", right]],
    output: "67",
    ext: "glb",
    outDir: work,
    timeoutMs: 20 * 60_000,
  });
  if (!glb) throw new Error("ComfyUI made no model.");
  if (!(await ctx.alive())) return null;
  await ctx.progress("Colouring it from the views");
  const coloured = await colourMesh(id, rel(id, glb), views);
  return { glb: rel(id, glb), coloured };
}
