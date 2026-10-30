import type { TakeScore } from "./store";

// How a take holds up (scripts/score_take.py): pop-ins are what the motion does not explain, so a
// take of fast close action is not punished for moving. Shared by "Shoot until good" and the reel's
// best-take pick.

// The share of a take's frames where something pops in or melts.
export const popinShare = (s: TakeScore, frames: number) => s.popins / Math.max(1, frames - 1);

// Good: at most 10% of frames flagged and no spike over 15 (05_submit, scored on known takes: a good
// fox take 9/121 frames and 10.6; a keys-only take with a stranger 33/97 and 22.4).
export const goodTake = (s: TakeScore | undefined, frames: number) => !!s && popinShare(s, frames) <= 0.1 && s.worst < 15;

// Lower is better: the share of flagged frames first, then the worst spike.
export const takeRank = (s: TakeScore | undefined, frames: number) => (s ? popinShare(s, frames) * 100 + s.worst / 10 : 1e9);
