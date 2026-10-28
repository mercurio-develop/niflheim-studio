// Proof of the Set step's painting without the UI: three places, each painted with the old
// one-line prompt and the composed stage prompt (features/scene/prompt.ts), same seeds, then MoGe 2
// makes each stage mesh. Run: node --env-file=.env scripts/try-set.ts [seed]
import { runWorkflow } from "../lib/comfy.ts";
import { styleById } from "../lib/styles.ts";
import { composeSetPrompt } from "../features/scene/prompt.ts";

const seed = Number(process.argv[2] ?? 7);
const out = `${process.cwd()}/data/proof/set-prompt/${seed}`;
const PLACES: [string, string, "painterly" | "pixel"][] = [
  ["courtyard", "a misty ruined stone courtyard at dusk, broken columns, an arched gateway", "painterly"],
  ["portland", "portland maine a port with boat around and a forest behind", "pixel"],
  ["forest", "a path in the dark forest with big pine trees", "painterly"],
];
// The prompt before 2026-10-27 (features/scene/actions/scene.ts setPrompt).
const before = (prompt: string, style: string) =>
  `Concept painting of ${prompt}. Wide establishing shot, eye-level camera, an open floor in the foreground, depth into the distance, no people, no characters. ${styleById(style).phrase}, cinematic light.`;

for (const [name, prompt, style] of PLACES) {
  for (const [tag, text] of [["before", before(prompt, style)], ["after", composeSetPrompt(prompt, style).text]] as const) {
    const t0 = performance.now();
    const [set] = await runWorkflow({ workflow: "02_set_paint.api.json", set: [["5", "text", text], ["8", "seed", seed]], output: "10", outDir: `${out}/${name}-${tag}` });
    const [glb] = await runWorkflow({ workflow: "02_moge.api.json", images: [["1", set]], output: "5", ext: "glb", outDir: `${out}/${name}-${tag}/glb` });
    console.log(name, tag, `${((performance.now() - t0) / 1000).toFixed(1)} s`, set, glb);
  }
}
