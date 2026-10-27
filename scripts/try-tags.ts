// Proof: Florence-2 PromptGen tags for a character image, returned as a text output.
// Run: node --env-file=.env scripts/try-tags.ts <image>
import path from "node:path";
import { readFile } from "node:fs/promises";
import { Comfy } from "@comfyorg/sdk";

const c = new Comfy({});
const wf = c.workflows.fromJson(JSON.parse(await readFile("workflows/01_tags.api.json", "utf8")));
wf.setInput("1", "image", c.assets.fromFile(path.resolve(process.argv[2])));
const t0 = performance.now();
const job = await c.run(wf, { timeoutMs: 600_000 });
const outs = job.getOutputs("4");
console.log(`${((performance.now() - t0) / 1000).toFixed(1)}s types=${outs.map((o) => o.type)}`);
if (outs[0]) console.log(new TextDecoder().decode(await outs[0].toBytes()));
