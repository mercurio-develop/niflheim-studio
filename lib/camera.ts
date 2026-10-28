import type { StageCamera } from "./stage-fill";

// Camera moves for a scene, in the levelled stage's own space (metres, floor y = 0, y up), all
// aimed at the character. Each move starts or ends on the painting's own camera, the one view
// the stage is sure of, and stays inside the space the stage was filled for (set_fill.py PROBES,
// the viewer's ORBIT). A move becomes frames for the shot: LTX takes 8n + 1 frames at 24 fps.

export type Vec = [number, number, number];
export type MoveId = "static" | "push" | "pull" | "arc" | "crane" | "track";
export type CameraMove = { move: MoveId; amount: number; seconds: number; ease: boolean };
export type Pose = { position: Vec; target: Vec };

export const FPS = 24;

// amount: what the slider sets for each move, its unit, range and default.
export const MOVES: { id: MoveId; label: string; line: string; unit: string; min: number; max: number; step: number; value: number }[] = [
  { id: "static", label: "Static", line: "A locked shot from the painting's own view.", unit: "", min: 0, max: 0, step: 1, value: 0 },
  { id: "push", label: "Push in", line: "Moves toward them.", unit: "m", min: 0.2, max: 4, step: 0.1, value: 1.2 },
  { id: "pull", label: "Pull out", line: "Starts close and backs away to the painting's view.", unit: "m", min: 0.2, max: 4, step: 0.1, value: 1.2 },
  { id: "arc", label: "Arc", line: "Circles them, keeping the distance. Negative goes left.", unit: "°", min: -40, max: 40, step: 1, value: 12 },
  { id: "crane", label: "Crane", line: "Rises while looking at them. Negative sinks.", unit: "m", min: -1, max: 2, step: 0.05, value: 0.5 },
  { id: "track", label: "Track", line: "Slides sideways, keeping them in frame. Negative goes left.", unit: "m", min: -2, max: 2, step: 0.05, value: 0.8 },
];
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

// The first and last pose of a move; frames ease between them (an arc turns on its circle).
function ends(cam: StageCamera, aimAt: Vec, m: CameraMove): { from: Vec; to: Vec; arc?: { centre: Vec; angle: number } } {
  const p0 = home(cam).position;
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

// Every frame's pose, eased in and out when asked.
export function poses(cam: StageCamera, aimAt: Vec, m: CameraMove): Pose[] {
  const n = frameCount(m.seconds);
  const e = ends(cam, aimAt, m);
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
    out.push({ position, target: aimAt });
  }
  return out;
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

// What a camera render was made from: the move, where the character stands and the stage. A render
// whose key differs from today's is out of date.
export const renderKey = (m: CameraMove, at: Vec, height: number, mesh: string) =>
  [m.move, m.amount, m.seconds, m.ease ? 1 : 0, ...at.map((x) => x.toFixed(3)), height.toFixed(2), mesh].join("|");
