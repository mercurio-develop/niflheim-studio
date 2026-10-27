// Proof of the stage fill without the UI: one painting and its MoGe stage in, a filled stage out,
// with the hole share from test cameras (not the probes) before and after, and the time it took.
// Run: node --env-file=.env scripts/try-set-fill.ts <painting.png> <stage.glb> [place]
import { fillStage } from "../lib/stage-fill.ts";

const [image, mesh, place = ""] = process.argv.slice(2);
if (!image || !mesh) throw new Error("usage: try-set-fill.ts <painting.png> <stage.glb> [place]");
const t0 = performance.now();
const r = await fillStage({ image, mesh, place, dir: `${process.cwd()}/data/proof/set-fill/${Date.now().toString(36)}`, seed: 7, progress: (d) => console.log(d, `${((performance.now() - t0) / 1000).toFixed(1)} s`) });
console.log(JSON.stringify(r, null, 1), `${((performance.now() - t0) / 1000).toFixed(1)} s`);
