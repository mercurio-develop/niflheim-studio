import type { TakeSetup } from "@/lib/store";

const BEAT_NAMES = { start: "First", then: "As the camera moves", end: "By the end" } as const;
const clean = (x?: string) => (x ?? "").trim();

// What changed from one take's setup to the next, said shortly ("+ butterfly", "expression: shy grin",
// "By the end changed"); empty when nothing did.
export function changes(before: TakeSetup, after: TakeSetup): string[] {
  const out: string[] = [];
  for (const n of after.in) if (!before.in.includes(n)) out.push(`+ ${n}`);
  for (const n of before.in) if (!after.in.includes(n)) out.push(`− ${n}`);
  if (clean(before.subject) !== clean(after.subject) && after.subject) out.push(`about ${after.subject}`);
  if (clean(before.expression) !== clean(after.expression)) out.push(after.expression ? `expression: ${after.expression}` : "no expression");
  for (const k of ["start", "then", "end"] as const) if (clean(before.beats[k]) !== clean(after.beats[k])) out.push(`${BEAT_NAMES[k]} changed`);
  if (before.kind !== after.kind) out.push(after.kind === "character" ? "guided by the sheet" : "guided by the keyframes");
  if (before.move !== after.move || before.seconds !== after.seconds) out.push("camera changed");
  return out;
}
