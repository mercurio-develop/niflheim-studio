// The wizard, in order. Home and the step rail both read this.
export const STEPS = [
  { slug: "character", n: "01", title: "Character", line: "Concept art from a prompt. Swap any part.", ready: true },
  { slug: "turnaround", n: "02", title: "Turnaround", line: "Front, three-quarter, side and back.", ready: true },
  { slug: "set", n: "03", title: "Set", line: "A concept painting becomes a 3D stage.", ready: false },
  { slug: "style", n: "04", title: "Style", line: "A style image or LoRA restyles it all.", ready: false },
  { slug: "stage", n: "05", title: "Stage", line: "Place the character, aim the camera.", ready: false },
  { slug: "vfx", n: "06", title: "VFX", line: "Fog, embers, rain, sparks, placed in 3D.", ready: false },
  { slug: "shot", n: "07", title: "Shot", line: "Say what happens. LTX-2.5 shoots it.", ready: false },
  { slug: "export", n: "08", title: "Export", line: "MP4, comp passes and a Gaussian splat.", ready: false },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
