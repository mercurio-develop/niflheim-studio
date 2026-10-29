import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { runWorkflow } from "./comfy.ts";
import { PYTHON } from "./python";

// Fill the holes of a MoGe stage (behind columns, past the frame, under the sky): render the
// stage from a few cameras around the painting's own (scripts/set_fill.py), let Qwen paint the
// holes of each render (02_set_fill), read the painted view with MoGe again (02_moge), and lift
// only the painted pixels into the stage. Nearest cameras first, so each sees the earlier fills.
// Server only; the app and scripts/try-set-fill.ts both run it.

const run = promisify(execFile);
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "set_fill.py");
const MIN_HOLES = 0.02; // a view with less missing than this is not worth painting

async function py<T>(...args: string[]): Promise<T> {
  const { stdout } = await run(PYTHON, ["-I", SCRIPT, ...args], { maxBuffer: 1 << 24 });
  return JSON.parse(stdout.trim().split("\n").at(-1)!);
}

// The style is named, not only "the same": Qwen sees a render with grey holes, and on its own it
// drifts to its own look (blue-grey sky over a warm grey painting, 2026-10-27 courtyard).
export const fillPrompt = (place: string, style: string) =>
  `Paint the flat grey areas so they continue the scene${place ? ` (${place})` : ""}: the walls, floor, ground, sky and objects that would be there, seen from this camera. ${style ? `${style}, ` : ""}the same art style, light and colours as the rest, seamless with it. Do not change anything outside the grey areas. No people, no new characters.`;

export type FillView = { render: string; mask: string; filled: string; holes: number };
// The painting's camera in the levelled stage (floor at y = 0, y up, metres): glTF camera-to-world
// (row-major 4x4), vertical field of view (degrees), how far ahead the set's middle is, and
// whether a floor was found (without one the camera stays at the origin and nothing is level).
export type StageCamera = { c2w: number[][]; fov: number; aspect: number; middle: number; far: number; height: number; floor: boolean };
export type FillHooks = {
  track?: (comfyJobId: string) => unknown;
  alive?: () => Promise<boolean>;
  progress?: (detail: string) => unknown;
  seed?: number;
};

// dir: absolute folder for this fill; returns its mesh, cameras and painted views (absolute paths).
export async function fillStage(spec: { image: string; mesh: string; place: string; style?: string; dir: string } & FillHooks) {
  const alive = spec.alive ?? (async () => true);
  const seed = spec.seed ?? Math.floor(Math.random() * 2 ** 31);
  const base = await py<{ probes: number }>("base", "--glb", spec.mesh, "--image", spec.image, "--dir", spec.dir);
  const before = await py<{ mean: number }>("holes", "--dir", spec.dir);
  const views: FillView[] = [];
  for (let i = 0; i < base.probes; i++) {
    if (!(await alive())) return null;
    await spec.progress?.(`Filling the stage (${i + 1}/${base.probes})`);
    const v = path.join(spec.dir, `v${i}`);
    const { holes } = await py<{ holes: number }>("render", "--dir", spec.dir, "--probe", String(i), "--out", v);
    if (holes < MIN_HOLES) continue;
    const [filled] = await runWorkflow({
      onSubmit: spec.track,
      workflow: "02_set_fill.api.json",
      set: [["17", "prompt", fillPrompt(spec.place, spec.style ?? "")], ["22", "seed", seed + i]],
      images: [["1", path.join(v, "render.png")], ["2", path.join(v, "mask.png")]],
      output: "28",
      outDir: path.join(v, "fill"),
    });
    if (!(await alive())) return null;
    const [moge] = await runWorkflow({ onSubmit: spec.track, workflow: "02_moge.api.json", images: [["1", filled]], output: "5", ext: "glb", outDir: path.join(v, "moge") });
    await py("add", "--dir", spec.dir, "--view", v, "--filled", filled, "--moge", moge);
    views.push({ render: path.join(v, "render.png"), mask: path.join(v, "mask.png"), filled, holes });
  }
  const mesh = path.join(spec.dir, "filled.glb");
  await py("merge", "--dir", spec.dir, "--image", spec.image, "--out", mesh);
  const after = await py<{ mean: number }>("holes", "--dir", spec.dir);
  const cam = JSON.parse(await readFile(path.join(spec.dir, "cam.json"), "utf8"));
  const camera: StageCamera = {
    c2w: cam.c2w,
    fov: (2 * Math.atan(cam.H / 2 / cam.fy) * 180) / Math.PI,
    aspect: cam.W / cam.H,
    middle: cam.middle,
    far: cam.far,
    height: cam.c2w[1][3],
    floor: !!cam.floor,
  };
  return { mesh, cameras: path.join(spec.dir, "transforms.json"), camera, views, holes: { before: before.mean, after: after.mean } };
}
