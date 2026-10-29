import type { StageCamera } from "./stage-fill";

// Camera moves for a scene, in the levelled stage's own space (metres, floor y = 0, y up), all
// aimed at the character. Each move starts or ends on the painting's own camera, the one view
// the stage is sure of, and stays inside the space the stage was filled for (set_fill.py PROBES,
// the viewer's ORBIT). A move becomes frames for the shot: LTX takes 8n + 1 frames at 24 fps.

export type Vec = [number, number, number];
export type MoveId = "static" | "push" | "pull" | "arc" | "crane" | "track" | "follow";
export type FramingId = "painting" | "long" | "mid" | "close" | "pov" | "free";
export type FocusId = "deep" | "soft" | "strong";
// framing: where the move starts (none: the painting's camera); from: the start a Free framing keeps.
// to: where the camera ends, when moved off the preset's end. walk: the character crosses the stage
// from one spot to another over the shot (none: they stand at the placement). pose: one of the
// character's poses (none: as designed); poseThen: the pose the second half of the keys show.
export type CameraMove = { move: MoveId; amount: number; seconds: number; ease: boolean; framing?: FramingId; from?: Vec; to?: Vec; walk?: { from: Vec; to: Vec }; focus?: FocusId; pose?: string; poseThen?: string };
// at: where the character stands at that frame.
export type Pose = { position: Vec; target: Vec; at?: Vec };
// Who the camera is about: where they stand, how tall, which way they face (degrees, CharacterCard's).
export type Subject = { at: Vec; height: number; turn: number };

export const FPS = 24;

// amount: what the slider sets for each move, its unit, range and default.
export const MOVES: { id: MoveId; label: string; line: string; unit: string; min: number; max: number; step: number; value: number }[] = [
  { id: "static", label: "Static", line: "A locked shot from the painting's own view.", unit: "", min: 0, max: 0, step: 1, value: 0 },
  { id: "push", label: "Push in", line: "Moves toward them.", unit: "m", min: 0.2, max: 4, step: 0.1, value: 1.2 },
  { id: "pull", label: "Pull out", line: "Starts close and backs away to the painting's view.", unit: "m", min: 0.2, max: 4, step: 0.1, value: 1.2 },
  { id: "arc", label: "Arc", line: "Circles them, keeping the distance. Negative goes left.", unit: "°", min: -40, max: 40, step: 1, value: 12 },
  { id: "crane", label: "Crane", line: "Rises while looking at them. Negative sinks.", unit: "m", min: -1, max: 2, step: 0.05, value: 0.5 },
  { id: "track", label: "Track", line: "Slides sideways, keeping them in frame. Negative goes left.", unit: "m", min: -2, max: 2, step: 0.05, value: 0.8 },
  { id: "follow", label: "Follow", line: "Keeps its distance as they walk.", unit: "", min: 0, max: 0, step: 1, value: 0 },
];
// Where a shot starts. Long, mid and close stand between the character and the painting's camera
// (the side the stage holds best), at distances for a 1.7 m character, scaled with their height;
// first person is their eyes, looking the way they face.
export const FRAMINGS: { id: FramingId; label: string; line: string }[] = [
  { id: "painting", label: "Painting", line: "From the painting's own camera: the view the stage is surest of." },
  { id: "long", label: "Long", line: "Long shot: all of them and the place around them." },
  { id: "mid", label: "Mid", line: "Mid shot: waist up." },
  { id: "close", label: "Close-up", line: "Close-up: head and shoulders." },
  { id: "pov", label: "First person", line: "First person: through their eyes, looking the way they face." },
  { id: "free", label: "Free", line: "Where you put it: drag the camera in Overview, set its height below." },
];
// How much of the frame is sharp. The 3D preview has no blur: the keyframes and the take paint it,
// from these words.
export const FOCUS: { id: FocusId; label: string; phrase: string }[] = [
  { id: "deep", label: "Everything sharp", phrase: "" },
  { id: "soft", label: "Soft background", phrase: "Shallow depth of field: the character in sharp focus, the background softly out of focus." },
  { id: "strong", label: "Strong bokeh", phrase: "Very shallow depth of field with strong bokeh: the character crisp, the background melted into a soft blur." },
];
export const focusPhrase = (m?: CameraMove | null) => FOCUS.find((f) => f.id === (m?.focus ?? "deep"))!.phrase;

const SHOT = { long: { dist: 6, eye: 0.95, look: 0.5 }, mid: { dist: 2.4, eye: 0.75, look: 0.7 }, close: { dist: 1.1, eye: 0.9, look: 0.88 } };

// 4 s = 97 frames: the length LTX-2.5 shot best on 16 GB (04_shot ACCEPT: 768x448, 97 frames).
export const DEFAULT_MOVE: CameraMove = { move: "push", amount: 1.2, seconds: 4, ease: true };

// Where the stage holds up, around the point the painting's camera looks at (the viewer's ORBIT
// for a filled stage): yaw either side, up and down, and how near and far.
export const SPACE = { yaw: 0.3, up: 0.12, down: 0.06, near: 0.35, far: 1.15 };

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: Vec, b: Vec, t: number): Vec => add(a, scale(sub(b, a), t));

// 8n + 1 frames closest to `seconds` at 24 fps (5 s: 121).
export const frameCount = (seconds: number) => Math.max(1, Math.round((seconds * FPS - 1) / 8)) * 8 + 1;

// The painting's camera: where it is and the point it looks at, `middle` metres ahead.
export function home(cam: StageCamera) {
  const m = cam.c2w;
  const position: Vec = [m[0][3], m[1][3], m[2][3]];
  const ahead: Vec = [-m[0][2], -m[1][2], -m[2][2]];
  return { position, look: add(position, scale(ahead, cam.middle)) };
}

// What the camera aims at: the character's chest, or the painting's look point with nobody placed.
export function aim(cam: StageCamera, at?: Vec | null, height = 1.7): Vec {
  return at ? [at[0], at[1] + height * 0.6, at[2]] : home(cam).look;
}

// Where a move starts and what it looks at, for the move's framing.
export function start(cam: StageCamera, who: Subject, m: CameraMove): Pose {
  const chest = aim(cam, who.at, who.height);
  const f = m.framing ?? "painting";
  if (f === "free" && m.from) return { position: m.from, target: chest };
  if (f === "pov") {
    const a = (who.turn * Math.PI) / 180;
    const facing: Vec = [Math.sin(a), 0, Math.cos(a)];
    const eyes = add(who.at, [0, who.height * 0.93, 0]);
    return { position: add(eyes, scale(facing, 0.1)), target: add(eyes, scale(facing, 3)) };
  }
  if (f === "long" || f === "mid" || f === "close") {
    const s = SHOT[f];
    const k = who.height / 1.7;
    const back = sub(home(cam).position, who.at);
    const flat: Vec = [back[0], 0, back[2]];
    const dir = scale(flat, 1 / (len(flat) || 1));
    const position = add(who.at, add(scale(dir, s.dist * k), [0, Math.max(0.3, who.height * s.eye), 0]));
    return { position, target: add(who.at, [0, who.height * s.look, 0]) };
  }
  return { position: home(cam).position, target: chest };
}

// The first and last pose of a move; frames ease between them (an arc turns on its circle).
function ends(p0: Vec, aimAt: Vec, m: CameraMove): { from: Vec; to: Vec; arc?: { centre: Vec; angle: number } } {
  const toAim = sub(aimAt, p0);
  const dir = scale(toAim, 1 / (len(toAim) || 1));
  const right: Vec = [-dir[2], 0, dir[0]]; // horizontal, screen right
  const r = len([right[0], 0, right[2]]) || 1;
  switch (m.move) {
    case "push":
      return { from: p0, to: add(p0, scale(dir, Math.min(m.amount, len(toAim) - 0.6))) };
    case "pull":
      return { from: add(p0, scale(dir, Math.min(m.amount, len(toAim) - 0.6))), to: p0 };
    case "arc":
      return { from: p0, to: p0, arc: { centre: aimAt, angle: (m.amount * Math.PI) / 180 } };
    case "crane":
      return { from: p0, to: add(p0, [0, m.amount, 0]) };
    case "track":
      return { from: p0, to: add(p0, scale([right[0] / r, 0, right[2] / r], m.amount)) };
    default:
      return { from: p0, to: p0 };
  }
}

// Every frame's pose, from the framing's start, eased in and out when asked. A walking character
// carries the aim (and a following or first-person camera) along with them; a camera end moved off
// the preset's goes straight there.
export function poses(cam: StageCamera, who: Subject, m: CameraMove): Pose[] {
  const n = frameCount(m.seconds);
  const a0 = m.walk?.from ?? who.at;
  const a1 = m.walk?.to ?? a0;
  const { position: p0, target: aimAt } = start(cam, { ...who, at: a0 }, m);
  const preset = ends(p0, aimAt, m);
  const e = m.to ? { from: preset.from, to: m.to } : preset;
  const carry = m.move === "follow" || m.framing === "pov";
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = n === 1 ? 0 : i / (n - 1);
    const t = m.ease ? t0 * t0 * (3 - 2 * t0) : t0;
    let position = lerp(e.from, e.to, t);
    if (e.arc) {
      // Turn the start about the vertical through the character: positive angle goes right.
      const off = sub(e.from, e.arc.centre);
      const a = -e.arc.angle * t;
      position = add(e.arc.centre, [off[0] * Math.cos(a) - off[2] * Math.sin(a), off[1], off[0] * Math.sin(a) + off[2] * Math.cos(a)]);
    }
    const at = lerp(a0, a1, t);
    const moved = sub(at, a0);
    out.push({ position: carry ? add(position, moved) : position, target: add(aimAt, moved), at });
  }
  return out;
}

// The first frame where the camera comes closer to the character than half their height (at least
// 0.7 m) across the ground, or -1. Keys there show a flat card from inside or edge on, and a path
// that crosses them turns round them in a frame. First person stands in them on purpose.
export function tooClose(ps: Pose[], who: Subject, m: CameraMove) {
  if (m.framing === "pov") return -1;
  const near = Math.max(0.7, who.height * 0.45);
  return ps.findIndex((p) => p.at && Math.hypot(p.position[0] - p.at[0], p.position[2] - p.at[2]) < near);
}

// Is a camera position inside the space the stage holds? Measured like the viewer's orbit:
// around the painting's look point, against where the painting's camera sits.
export function inside(cam: StageCamera, p: Vec): boolean {
  const h = home(cam);
  const base = sub(h.position, h.look);
  const off = sub(p, h.look);
  const d = len(off);
  const az = (v: Vec) => Math.atan2(v[0], v[2]);
  const po = (v: Vec) => Math.acos(Math.max(-1, Math.min(1, v[1] / (len(v) || 1))));
  let yaw = az(off) - az(base);
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = po(off) - po(base); // negative: higher than the painting's camera
  const eps = 1e-6;
  return Math.abs(yaw) <= SPACE.yaw + eps && pitch >= -SPACE.up - eps && pitch <= SPACE.down + eps && d >= cam.middle * SPACE.near - eps && d <= cam.middle * SPACE.far + eps;
}

// Camera-to-world (OpenGL: looks down -z, y up, row-major like StageCamera.c2w) for a pose.
export function c2w(p: Pose): number[][] {
  const f = sub(p.target, p.position);
  const z = scale(f, -1 / (len(f) || 1));
  const upW: Vec = [0, 1, 0];
  let x: Vec = [upW[1] * z[2] - upW[2] * z[1], upW[2] * z[0] - upW[0] * z[2], upW[0] * z[1] - upW[1] * z[0]];
  x = scale(x, 1 / (len(x) || 1));
  const y: Vec = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [
    [x[0], y[0], z[0], p.position[0]],
    [x[1], y[1], z[1], p.position[1]],
    [x[2], y[2], z[2], p.position[2]],
    [0, 0, 0, 1],
  ];
}

// What a camera render was made from: the move and its framing, where the character stands and the
// stage. A render whose key differs from today's is out of date. The painting's framing adds
// nothing, so renders from before framings stay current.
export const renderKey = (m: CameraMove, at: Vec, height: number, mesh: string, turn = 0) => {
  const f = m.framing ?? "painting";
  const v = (p?: Vec) => (p ?? []).map((x) => x.toFixed(2));
  const framing = f === "painting" ? [] : f === "free" ? [f, ...v(m.from)] : f === "pov" ? [f, turn] : [f];
  const more = [...(m.to ? ["to", ...v(m.to)] : []), ...(m.walk ? ["walk", ...v(m.walk.from), ...v(m.walk.to)] : []), ...(m.focus && m.focus !== "deep" ? [m.focus] : []), ...(m.pose ? ["pose", m.pose] : []), ...(m.poseThen ? ["then", m.poseThen] : [])];
  return [m.move, m.amount, m.seconds, m.ease ? 1 : 0, ...at.map((x) => x.toFixed(3)), height.toFixed(2), mesh, ...framing, ...more].join("|");
};

// What stood on the stage when a set of keyframes was painted (greybox blocks, placed assets), as
// a suffix to the render key: keys made before a block or an asset moved are old. Empty with none.
export function propsKey(blocks: { kind: string; at: Vec; size: Vec; turn: number; label: string }[] = [], assets: { id: string; glb?: string; at?: Vec; height: number; turn: number }[] = []) {
  const v = (p: Vec) => p.map((x) => x.toFixed(2));
  const b = blocks.map((x) => [x.kind, ...v(x.at), ...v(x.size), x.turn, x.label].join(",")).join(";");
  const a = assets.filter((x) => x.glb && x.at).map((x) => [x.id, x.glb, ...v(x.at!), x.height.toFixed(2), x.turn].join(",")).join(";");
  return (b ? `|blocks:${b}` : "") + (a ? `|assets:${a}` : "");
}

// The cutouts the card wears at a frame of the move: the shot's pose, or the one it switches to for
// the second half; the turnaround's own (as designed) when the shot has none or it is gone.
export function cardAt<C>(m: CameraMove, frame: number, base: C, poses: { id: string; cutouts: C }[] = []): C {
  const id = m.poseThen && frame >= (frameCount(m.seconds) - 1) / 2 ? m.poseThen : m.pose;
  return poses.find((p) => p.id === id)?.cutouts ?? base;
}

// The frames the shot is guided at: every 32nd frame of the move and its last (97 frames: 0, 32,
// 64, 96), as LTX-2.5 kept a move continuous with guides that close (04_shot proof 2).
export function keyFrames(m: CameraMove): number[] {
  const n = frameCount(m.seconds);
  const out: number[] = [];
  for (let f = 0; f < n; f += 32) out.push(f);
  if (out.at(-1) !== n - 1) out.push(n - 1);
  return out;
}
