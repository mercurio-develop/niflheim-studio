// Is a ComfyUI ready for this app? Lists every node class and model file the graphs in workflows/
// use, then asks a ComfyUI (default COMFYUI_URL, else :8188) which of them it lacks: a faster
// machine is a COMFY_BASE_URL away only when this says nothing is missing.
// Run: node scripts/comfy-check.ts [http://host:8188]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const base = (process.argv[2] ?? process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const dir = path.join(process.cwd(), "workflows");
// Inputs that name a model file, and the folder ComfyUI lists it under.
// MoGe and BiRefNet name their models too; SAM3Segment downloads its own. The Ingredients LoRA is
// added in code (features/shot/ingredients.ts), so it is checked by name below.
const MODEL_FIELDS: Record<string, string> = { unet_name: "diffusion_models", clip_name: "text_encoders", vae_name: "vae", lora_name: "loras", ckpt_name: "checkpoints", control_net_name: "controlnet", model_name: "geometry_estimation", bg_removal_name: "background_removal" };

const nodes = new Map<string, Set<string>>();
const models = new Map<string, Set<string>>();
for (const f of readdirSync(dir).filter((x) => x.endsWith(".api.json"))) {
  const g = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  for (const n of Object.values(g)) {
    (nodes.get(n.class_type) ?? nodes.set(n.class_type, new Set()).get(n.class_type)!).add(f);
    for (const [k, v] of Object.entries(n.inputs)) if (MODEL_FIELDS[k] && typeof v === "string") (models.get(`${MODEL_FIELDS[k]}/${v}`) ?? models.set(`${MODEL_FIELDS[k]}/${v}`, new Set()).get(`${MODEL_FIELDS[k]}/${v}`)!).add(f);
  }
}

models.set(`loras/${process.env.LTX_INGREDIENTS_LORA || "ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors"}`, new Set(["Character takes (features/shot/ingredients.ts)"]));

const info = (await (await fetch(`${base}/object_info`)).json()) as Record<string, unknown>;
const missingNodes = [...nodes].filter(([c]) => !info[c]);
const folders = new Map<string, Set<string>>();
const missingModels: [string, Set<string>][] = [];
for (const [m, used] of models) {
  const [folder, ...rest] = m.split("/");
  if (!folders.has(folder)) folders.set(folder, new Set(await fetch(`${base}/models/${folder}`).then((r) => (r.ok ? r.json() : []), () => [])));
  if (!folders.get(folder)!.has(rest.join("/"))) missingModels.push([m, used]);
}
console.log(`${base}: ${nodes.size} node classes, ${models.size} model files in ${readdirSync(dir).filter((x) => x.endsWith(".api.json")).length} graphs`);
for (const [c, used] of missingNodes) console.log(`MISSING node ${c} (${[...used].join(", ")})`);
for (const [m, used] of missingModels) console.log(`MISSING model ${m} (${[...used].join(", ")})`);
if (!missingNodes.length && !missingModels.length) console.log("Ready: every node and model is there.");
