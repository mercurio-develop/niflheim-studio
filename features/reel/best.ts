import type { Take } from "@/lib/store";

// The take autopilot keeps: one that moves when the camera moves (travel above 3 px; a static shot
// is exempt), then the fewest pop-in frames, then the mildest worst spike. Unscored takes come last.
export function bestTake(takes: Take[], moving: boolean): number | null {
  const ranked = takes
    .map((t, i) => ({ i, s: t.score }))
    .filter((x) => x.s)
    .sort((a, b) => {
      const still = (x: typeof a) => (moving && x.s!.travel < 3 ? 1 : 0);
      return still(a) - still(b) || a.s!.popins - b.s!.popins || a.s!.worst - b.s!.worst;
    });
  return ranked[0]?.i ?? (takes.length ? takes.length - 1 : null);
}
