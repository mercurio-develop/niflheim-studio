// Proof that every graph in workflows/ runs on the configured Comfy target (Comfy Cloud when
// COMFY_BASE_URL is blank): each one with real inputs and the node ids the app sets, in three
// waves (what needs only a concept, then the painted set, then the shot). Outputs and report.json
// land in data/proof/workflows/<label>. Needs ImageMagick (magick) for the test masks.
// Run: node --env-file=.env scripts/try-workflows.ts [label] [only,these,graphs]
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { runWorkflow, onCloud, type RunSpec } from "../lib/comfy.ts";

const sh = promisify(execFile);
const OUT = path.join(process.cwd(), "data/proof/workflows", process.argv[2] ?? "baseline");
const ONLY = process.argv[3]?.split(",");
const TROLL = "a forest troll with mossy green skin and a huge underbite, painterly concept art";
const box = { x: 192, y: 352, width: 512, height: 512 };
const crop = (n: string): RunSpec["set"] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
const paste: RunSpec["set"] = [["27", "x", box.x], ["27", "y", box.y]];
const qwen = (prompt: string): RunSpec["set"] => [["17", "prompt", prompt], ["22", "seed", 7]];

type Row = { name: string; ok: boolean; seconds: number; files: string[]; error?: string };
const report: Row[] = [];

async function run(name: string, spec: Omit<RunSpec, "workflow" | "outDir">): Promise<string[]> {
  if (ONLY && !ONLY.includes(name)) return [];
  const t = Date.now();
  try {
    const files = await runWorkflow({ ...spec, workflow: `${name}.api.json`, outDir: path.join(OUT, name), timeoutMs: 20 * 60_000 });
    report.push({ name, ok: files.length > 0, seconds: (Date.now() - t) / 1000, files, ...(files.length ? {} : { error: "no outputs" }) });
    console.log(`ok   ${name} ${((Date.now() - t) / 1000).toFixed(1)}s ${files.length} file(s)`);
    return files;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    report.push({ name, ok: false, seconds: (Date.now() - t) / 1000, files: [], error });
    console.log(`FAIL ${name}: ${error}`);
    return [];
  }
}

console.log("target", onCloud() ? "Comfy Cloud" : "local", "->", OUT);
await mkdir(path.join(OUT, "in"), { recursive: true });

// Wave 0: the concept every other graph starts from, and the test masks.
const [concept] = await runWorkflow({ workflow: "01_concept.api.json", set: [["5", "text", TROLL], ["8", "seed", 7], ["7", "batch_size", 1]], output: "10", outDir: path.join(OUT, "01_concept") });
report.push({ name: "01_concept", ok: !!concept, seconds: 0, files: [concept] });
const mask = path.join(OUT, "in/mask.png"); // an ellipse over the torso, 896x1152
const setMask = path.join(OUT, "in/setmask.png"); // a hole on the right of the 1344x768 set
await sh("magick", ["-size", "896x1152", "xc:black", "-fill", "white", "-draw", "ellipse 448,600 150,170 0,360", mask]);
await sh("magick", ["-size", "1344x768", "xc:black", "-fill", "white", "-draw", "rectangle 900,300 1200,700", setMask]);

// Wave 1: everything that needs only the concept and the masks.
const [[set], , , , [side]] = await Promise.all([
  run("02_set_paint", { set: [["5", "text", "a misty pine forest clearing at dusk with an old rusty truck, painterly concept art"], ["8", "seed", 7]], output: "10" }),
  run("01_tags", { images: [["1", concept]], output: "4", ext: "txt" }),
  run("01_parts", { set: [["2", "prompt", "head"]], images: [["1", concept]], output: "4" }),
  run("02_cutout", { images: [["1", concept]], output: "6" }),
  run("01_edit", { set: qwen(`${TROLL}. Turn the character to show its left side, full body, same art style.`), images: [["1", concept]], output: "28" }),
  run("01_brush", { set: [...qwen(`${TROLL}. Add a leather satchel strap across the chest, same art style.`), ["4", "x", box.x], ["4", "y", box.y], ["4", "width", box.width], ["4", "height", box.height], ...paste], images: [["1", concept]], output: "28" }),
  run("01_fill", { set: [...qwen("Add a wooden shield, same art style."), ...crop("4"), ...crop("5"), ...paste], images: [["1", concept], ["2", mask]], output: "28" }),
  run("01_change", { set: [...qwen("Change the torso to wear a ragged fur vest, same art style."), ...crop("4"), ...crop("5"), ...paste], images: [["1", concept], ["2", mask]], output: "28" }),
  run("01_remove", { set: [...qwen("Remove what is in the masked area and paint the troll's bare mossy skin there."), ...crop("4"), ...crop("5"), ...paste], images: [["1", concept], ["2", mask]], output: "28" }),
  run("01_swap", { set: qwen("Replace the masked area with a rusty chain armour, same art style."), images: [["1", concept], ["2", mask]], output: "28" }),
  run("02_asset_crop", { images: [["1", concept], ["2", mask]], output: "10" }),
  run("03_key_detail", { set: [["14", "text", `the face of ${TROLL}, clean and well drawn`], ["6", "denoise", 0.22], ["7", "denoise", 0.35], ["6", "seed", 7], ["7", "seed", 7]], images: [["1", concept]], output: "8" }),
]);

// Wave 2: needs the painted set and a side view. The fill gets real holes, as set_fill.py's renders
// have them: the masked pixels blacked out, not content under a mask.
const setImg = set ?? concept;
const holed = path.join(OUT, "in/set-holed.png");
if (set) await sh("magick", [set, setMask, "-alpha", "off", "-negate", "-compose", "multiply", "-composite", holed]);
const [[filled]] = await Promise.all([
  run("02_set_fill", { set: [["17", "prompt", "Fill the empty area with more misty pine forest, same painterly style."], ["22", "seed", 7]], images: [["1", set ? holed : setImg], ["2", setMask]], output: "28" }),
  run("02_moge", { images: [["1", setImg]], output: "5", ext: "glb" }),
  run("02_turnaround_mesh", { set: [["3", "seed", 7]], images: [["56", concept], ["85", side ?? concept], ["82", concept]], output: "67", ext: "glb" }),
]);

// Wave 3: a two-key shot (the app's shapeShot only adds middle keys).
await run("03_shot", { set: [["20", "text", "The camera pushes in slowly through the misty forest clearing toward the rusty truck."], ["21", "text", "blurry, distorted, text, watermark"], ["40", "noise_seed", 7]], images: [["1", setImg], ["2", filled ?? setImg]], output: "55", ext: "mp4" });

await writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const bad = report.filter((r) => !r.ok);
console.log(`${report.length - bad.length}/${report.length} ok${bad.length ? `; failed: ${bad.map((r) => r.name).join(", ")}` : ""}`);
