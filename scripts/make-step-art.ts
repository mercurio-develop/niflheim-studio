// Home page art: one tall painting per wizard step, same world, made with Z-Image Turbo.
// Run: node --env-file=.env scripts/make-step-art.ts   (then scripts/step-art-webp.py)
import path from "node:path";
import { runWorkflow } from "../lib/comfy.ts";

const LOOK =
  "Cinematic painterly concept art, moody volumetric fog, teal and amber colour palette, glowing lantern light, rich saturated colours, dramatic lighting, high detail, no text, no letters, no watermark.";

const ART: [string, string][] = [
  ["01-character", "A concept art sheet on a drafting table: several sketches of a young lantern keeper in a hooded wool coat, pencil lines and watercolour, one finished colourful painting of the character in the middle."],
  ["02-turnaround", "A character turnaround lineup of the same hooded lantern keeper shown four times side by side: front view, three-quarter view, side view and back view, on a misty grey studio floor."],
  ["03-set", "A misty nordic fishing village at dusk, wooden houses on stilts over dark water, lanterns glowing in windows, mountains fading into fog, wide establishing painting."],
  ["04-style", "The same misty village repainted in a bold Japanese ukiyo-e woodblock style, great stylised waves, flat vivid colour blocks, paint swatches and brush strokes spilling across the image."],
  ["05-stage", "A holographic 3D stage of a misty village made of glowing points and wireframe, a small hooded figure standing on a grid floor, a translucent camera frustum aiming at the figure, dark void around it."],
  ["06-vfx", "Swirling embers, sparks and drifting rain in thick fog at night around a hooded figure raising a lantern, magic particles spiralling upward, strong orange glow against deep teal darkness."],
  ["07-shot", "A cinematic anamorphic film still: a hooded lantern keeper raises a glowing lantern on a foggy pier at night, shallow depth of field, lens flare, dramatic rim light, movie frame."],
  ["08-export", "A village and a hooded figure dissolving into millions of glowing coloured gaussian splat particles floating in space, holographic point cloud, film strip frames and light trails."],
];

for (const [name, prompt] of ART) {
  const t0 = performance.now();
  const [file] = await runWorkflow({
    workflow: "01_concept.api.json",
    set: [
      ["5", "text", `${prompt} ${LOOK}`],
      ["7", "width", 768],
      ["7", "height", 1344],
      ["7", "batch_size", 1],
      ["8", "seed", 1234],
    ],
    output: "10",
    outDir: path.join(process.cwd(), "data", "step-art", name),
  });
  console.log(name, ((performance.now() - t0) / 1000).toFixed(1) + "s", file);
}
