// The wizard, in order. Home and the step rail both read this.
export const STEPS = [
  { slug: "character", n: "01", title: "Character", line: "Concept art from a prompt. Swap any part.", art: "/steps/01-character.webp", body: "Describe someone and get four concepts. Pick one, point at a part (the coat, the boots) and say what it becomes. Only that part changes.", ready: true },
  { slug: "turnaround", n: "02", title: "Turnaround", line: "Front, three-quarter, side and back.", art: "/steps/02-turnaround.webp", body: "The same character from the front, three-quarter, side and back, so every later shot keeps them recognisable.", ready: true },
  { slug: "set", n: "03", title: "Set", line: "A concept painting becomes a 3D stage.", art: "/steps/03-set.webp", body: "Drop in a concept painting, or paint one from a prompt. Depth turns it into a 3D stage you can walk around, with fog where nothing is known.", ready: false },
  { slug: "style", n: "04", title: "Style", line: "A style image or LoRA restyles it all.", art: "/steps/04-style.webp", body: "Add a style image or a LoRA and the whole world, character included, is repainted in that look.", ready: false },
  { slug: "stage", n: "05", title: "Stage", line: "Place the character, aim the camera.", art: "/steps/05-stage.webp", body: "Stand the character in the set and choose a camera move aimed at them: orbit, push in, crane, track.", ready: false },
  { slug: "vfx", n: "06", title: "VFX", line: "Fog, embers, rain, sparks, placed in 3D.", art: "/steps/06-vfx.webp", body: "Place embers, rain, snow, sparks or magic in 3D. They move with the camera and take on the painting's look.", ready: false },
  { slug: "shot", n: "07", title: "Shot", line: "Say what happens. LTX-2.5 shoots it.", art: "/steps/07-shot.webp", body: "Say what the character does. LTX-2.5 shoots the move as video on your own GPU. Keep the best take, build a sequence.", ready: false },
  { slug: "export", n: "08", title: "Export", line: "MP4, comp passes and a Gaussian splat.", art: "/steps/08-export.webp", body: "Take the MP4, the comp passes (depth, FX mask, camera) and a Gaussian splat of the shot you can fly through.", ready: false },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
