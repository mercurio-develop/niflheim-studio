export const STEPS = [
  { slug: "character", label: "Character" },
  { slug: "turnaround", label: "Turnaround" },
  { slug: "set", label: "Set" },
  { slug: "stage", label: "Stage" },
  { slug: "vfx", label: "VFX" },
  { slug: "shot", label: "Shot" },
  { slug: "splat", label: "Splat" },
  { slug: "export", label: "Export" },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
export type StepStatus = "empty" | "done" | "stale";

export function isStep(s: string): s is StepSlug {
  return STEPS.some((x) => x.slug === s);
}
