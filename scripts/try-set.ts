// Proof of the Set step without the UI: paint a set (Z-Image), then MoGe 2 makes the stage mesh
// and depth. Run: node --env-file=.env scripts/try-set.ts
import { runWorkflow } from "../lib/comfy.ts";

const out = `${process.cwd()}/data/proof/set`;
const time = async <T>(label: string, fn: () => Promise<T>) => {
  const t0 = performance.now();
  const r = await fn();
  console.log(label, `${((performance.now() - t0) / 1000).toFixed(1)} s`, r);
  return r;
};
const prompt = "Concept painting of a misty ruined stone courtyard at dusk, broken columns, a mossy stone floor in the foreground, an arched gateway in the distance. Wide establishing shot, eye-level camera, no people. Painterly concept art, cinematic light.";
const [set] = await time("set", () => runWorkflow({ workflow: "02_set_paint.api.json", set: [["5", "text", prompt], ["8", "seed", 7]], output: "10", outDir: `${out}/paint` }));
await time("mesh", () => runWorkflow({ workflow: "02_moge.api.json", images: [["1", set]], output: "5", ext: "glb", outDir: `${out}/glb` }));
await time("depth", () => runWorkflow({ workflow: "02_moge.api.json", images: [["1", set]], output: "7", outDir: `${out}/depth` }));
