// Home page art: one tall painting per wizard step, one hero across all eight (sketch -> splat),
// made with Z-Image Turbo through the Comfy SDK. Writes 4 candidates per step to
// data/step-art/<step>/; the chosen ones are copied to public/steps/ as webp.
// Run: node --env-file=.env scripts/make-step-art.ts [step ...]
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";

const HERO = "a young lantern keeper in a hooded deep teal wool coat holding a glowing amber iron lantern";
const LOOK =
  "Cinematic concept art, striking composition, strong silhouette, volumetric fog, teal and amber palette with one vivid accent, dramatic rim light, rich saturated colour, highly detailed, no text, no letters, no watermark, no frame.";

const ART: Record<string, string> = {
  "01-character": `An artist's desk seen from above: loose pencil sketches of ${HERO}, and in the centre one finished, vividly coloured painting of the character, brushes and ink around it.`,
  "02-turnaround": `A character turnaround of ${HERO}: the same figure four times in a row, front view, three-quarter view, side view and back view, standing on a glowing floor line in a misty studio.`,
  "03-set": `A breathtaking misty nordic fishing village at dusk, wooden houses on stilts over dark mirror water, warm windows, towering mountains dissolving into fog, tiny ${HERO} on the pier.`,
  "04-style": `The same hooded lantern keeper painted four times side by side in four different art styles: anime cel shading, loose watercolour, pixel art and comic ink, each a vertical strip, colourful.`,
  "05-stage": `A dark void with a glowing holographic 3D stage of a village made of luminous points and wireframe, ${HERO} standing on a grid floor, a translucent camera frustum and dotted camera path circling the figure.`,
  "06-vfx": `${HERO} at night in thick fog, holding the lantern high as a roaring spiral of orange magical fire bursts out of the lantern and coils around them, flames and glowing embers swirling through the fog, intense firelight on the coat against deep teal darkness, the face in shadow under the hood.`,
  "07-shot": `A widescreen cinematic film still from behind: ${HERO} walks down a foggy wooden pier toward a distant lighthouse at night, anamorphic lens flare, shallow depth of field, film grain, letterbox framing.`,
  "08-export": `${HERO} and the village around them dissolving into millions of glowing coloured gaussian splat particles floating in a dark void, holographic point cloud, light trails orbiting the figure.`,
};

const only = process.argv.slice(2);
for (const [name, prompt] of Object.entries(ART)) {
  if (only.length && !only.includes(name)) continue;
  const t0 = performance.now();
  const files = await runWorkflow({
    workflow: "01_concept.api.json",
    set: [
      ["5", "text", `${prompt} ${LOOK}`],
      ["7", "width", 768],
      ["7", "height", 1344],
      ["7", "batch_size", 4],
      ["8", "seed", 2026],
    ],
    output: "10",
    outDir: path.join(process.cwd(), "data", "step-art", name),
  });
  console.log(name, ((performance.now() - t0) / 1000).toFixed(1) + "s", files.length);
}
