// Proof for Focus: one keyframe capture painted with the key prompt plus the focus words, to see
// the background blur while the character stays sharp.
// Run: node --env-file=.env scripts/try-focus.ts <projectId> [soft|strong] [key index]
import path from "node:path";
import { readFileSync } from "node:fs";
import { runWorkflow } from "../lib/comfy.ts";
import { FOCUS } from "../lib/camera.ts";

const [id, focus = "strong", i = "0"] = process.argv.slice(2);
const dir = path.join(process.cwd(), "data", "projects", id);
const p = JSON.parse(readFileSync(path.join(dir, "project.json"), "utf8"));
const k = p.keyframes;
const phrase = FOCUS.find((f) => f.id === focus)!.phrase;
const t0 = performance.now();
const [result] = await runWorkflow({
  workflow: "01_edit.api.json",
  set: [["17", "prompt", `${k.prompt} ${phrase}`], ["22", "seed", k.seed]],
  images: [["1", path.join(dir, k.raw[+i])]],
  output: "28",
  outDir: path.join(process.cwd(), "data", "proof", `focus-${Date.now().toString(36)}`),
});
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s`, result, "· before:", k.keys[+i] && path.join(dir, k.keys[+i]));
