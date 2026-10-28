// The shot graph (workflows/03_shot.api.json) guides LTX-2.5 at its first and last frame; a key
// in between gets its own guide, chained between the two, so the move stays one continuous take
// (04_shot proof 2: guides at 0, 32, 64, 96 at 0.7, 0.5, 0.5, 0.7). Length is the move's 8n+1.

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

// What LTX is asked to avoid unless the user says otherwise; the cut words keep the move one take.
export const DEFAULT_NEGATIVE = "Jitter, warping face, morphing limbs, flickering textures, blurry, changing art style, extra limbs. Cut, scene change, jump cut, static camera.";

export const END_STRENGTH = 0.7;
export const MIDDLE_STRENGTH = 0.5;
const GUIDE_FIRST = "31";
const GUIDE_LAST = "32";

// Nodes 200+ hold the middle keys: LoadImage, ImageScale, LTXVPreprocess and LTXVAddGuide each.
export const middleImageNode = (i: number) => String(200 + i * 4);

export function shapeShot(g: Graph, frames: number[], length: number) {
  g["30"].inputs.length = length;
  g["33"].inputs.frames_number = length;
  g[GUIDE_FIRST].inputs.strength = END_STRENGTH;
  g[GUIDE_LAST].inputs.strength = END_STRENGTH;
  let prev = GUIDE_FIRST;
  frames.slice(1, -1).forEach((frame, i) => {
    const [load, scale, prep, guide] = [0, 1, 2, 3].map((d) => String(200 + i * 4 + d));
    g[load] = { class_type: "LoadImage", inputs: { image: "key.png" }, _meta: { title: `Key at frame ${frame}` } };
    g[scale] = { class_type: "ImageScale", inputs: { ...(g["3"].inputs as object), image: [load, 0] } };
    g[prep] = { class_type: "LTXVPreprocess", inputs: { ...(g["5"].inputs as object), image: [scale, 0] } };
    g[guide] = {
      class_type: "LTXVAddGuide",
      inputs: { positive: [prev, 0], negative: [prev, 1], vae: ["11", 0], latent: [prev, 2], image: [prep, 0], frame_idx: frame, strength: MIDDLE_STRENGTH },
      _meta: { title: `Guide: frame ${frame}` },
    };
    prev = guide;
  });
  g[GUIDE_LAST].inputs = { ...g[GUIDE_LAST].inputs, positive: [prev, 0], negative: [prev, 1], latent: [prev, 2] };
}
