// The shot graph (workflows/03_shot.api.json) guides LTX-2.5 at its first and last frame; a key
// in between gets its own guide, chained between the two, so the move stays one continuous take
// (04_shot proof 2: guides at 0, 32, 64, 96 at 0.7, 0.5, 0.5, 0.7). Length is the move's 8n+1.

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

// The graph's negative prompt. At CFG 1 (the distilled model) it changes nothing (04_shot ACCEPT
// proof 3); it is kept so a later non-distilled graph has one.
export const DEFAULT_NEGATIVE = "Jitter, warping face, morphing limbs, flickering textures, blurry, changing art style, extra limbs. Cut, scene change, jump cut, static camera.";

export const END_STRENGTH = 0.7;
export const MIDDLE_STRENGTH = 0.5;
// The last key held more loosely when the character ends in another pose than they start in, so
// LTX has room to move into it instead of snapping at the end (decision 0013).
export const END_NEW_POSE_STRENGTH = 0.45;
const GUIDE_FIRST = "31";
const GUIDE_LAST = "32";

// Nodes 200+ hold the middle keys: LoadImage, ImageScale, LTXVPreprocess and LTXVAddGuide each.
export const middleImageNode = (i: number) => String(200 + i * 4);

export function shapeShot(g: Graph, frames: number[], length: number, endStrength = END_STRENGTH) {
  g["30"].inputs.length = length;
  g["33"].inputs.frames_number = length;
  g[GUIDE_FIRST].inputs.strength = END_STRENGTH;
  g[GUIDE_LAST].inputs.strength = endStrength;
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

// The Layout-to-Render graph (03_shot_layout) with the keyframes added as guides on top of the
// clay clip, chained after its first-key reference (node 31): the guided arm of a layout pair.
export const keyImageNode = (i: number) => String(300 + i * 4);
export function addKeyGuides(g: Graph, frames: number[], length: number) {
  g["30"].inputs.length = length;
  g["33"].inputs.frames_number = length;
  let prev = "31";
  frames.forEach((frame, i) => {
    const [load, scale, prep, guide] = [0, 1, 2, 3].map((d) => String(300 + i * 4 + d));
    const edge = i === 0 || i === frames.length - 1;
    g[load] = { class_type: "LoadImage", inputs: { image: "key.png" }, _meta: { title: `Key at frame ${frame}` } };
    g[scale] = { class_type: "ImageScale", inputs: { ...(g["3"].inputs as object), image: [load, 0] } };
    g[prep] = { class_type: "LTXVPreprocess", inputs: { ...(g["5"].inputs as object), image: [scale, 0] } };
    g[guide] = {
      class_type: "LTXVAddGuide",
      inputs: { positive: [prev, 0], negative: [prev, 1], vae: ["11", 0], latent: [prev, 2], image: [prep, 0], frame_idx: frame, strength: edge ? END_STRENGTH : MIDDLE_STRENGTH },
      _meta: { title: `Guide: frame ${frame}` },
    };
    prev = guide;
  });
  g["34"].inputs.video_latent = [prev, 2];
  for (const n of ["41", "51"]) g[n].inputs = { ...g[n].inputs, positive: [prev, 0], negative: [prev, 1] };
}

// The shot graph (03_shot) with no guide at all: the empty video latent goes to the sampler as
// it is and the move is only what the prompt says. The words-only arm of a layout pair.
export function wordsOnly(g: Graph, length: number) {
  g["30"].inputs.length = length;
  g["33"].inputs.frames_number = length;
  for (const n of ["1", "2", "3", "4", "5", "6", "31", "32"]) delete g[n];
  g["34"].inputs.video_latent = ["30", 0];
  for (const n of ["41", "51"]) g[n].inputs = { ...g[n].inputs, positive: ["22", 0], negative: ["22", 1] };
}
