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
// subject: what the camera works around: "main" (the default, the step-1 character), an asset id
// (a cast member or an object on the stage) or "none" (the painting's look point, a free camera).
// moments: the shot blocked as key moments (decision 0013): at each, optionally where the camera is
// and looks, and for anyone on the stage (who: "main" or an asset id) where they stand, which way
// they face and which pose they wear. The keys are taken at the moments; between them positions
// and turns ease, a pose holds until the next moment sets another. None: the move above as before.
export type CameraMove = { move: MoveId; amount: number; seconds: number; ease: boolean; framing?: FramingId; from?: Vec; to?: Vec; walk?: { from: Vec; to: Vec }; focus?: FocusId; pose?: string; poseThen?: string; subject?: string; moments?: Moment[] };
export type Mark = { at?: Vec; turn?: number; pose?: string };
export type Moment = { frame: number; camera?: { from: Vec; look: Vec }; marks: Record<string, Mark> };
// at: where the character stands at that frame.
export type Pose = { position: Vec; target: Vec; at?: Vec };
// Who the camera is about: where they stand, how tall, which way they face (degrees, CharacterCard's).
// frame: the size Long, Mid and Close frame them at (default their height); an object is framed at
// least as a person would be, since a low wide thing is not shorter in the frame.
export type Subject = { at: Vec; height: number; turn: number; frame?: number };
// What else stands on the stage and can be a subject (SceneAsset's spot).
export type Others = { id: string; kind?: string; at?: Vec; height: number; turn: number }[];

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

// The subject a move works around: the main character, an asset with a spot, or the painting's
// look point (on the floor, at a person's height) for "none". An asset that is gone falls back to main.
export function subjectOf(cam: StageCamera, main: Subject, m: CameraMove, others: Others = []): Subject {
  if (!m.subject || m.subject === "main") return main;
  if (m.subject === "none") {
    const l = home(cam).look;
    return { at: [l[0], 0, l[2]], height: 1.7, turn: 0 };
  }
  const a = others.find((o) => o.id === m.subject && o.at);
  return a ? { at: a.at!, height: a.height, turn: a.turn, ...(a.kind === "character" ? {} : { frame: Math.max(1.7, a.height) }) } : main;
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
    const k = (who.frame ?? who.height) / 1.7;
    const back = sub(home(cam).position, who.at);
    const flat: Vec = [back[0], 0, back[2]];
    const dir = scale(flat, 1 / (len(flat) || 1));
    const position = add(who.at, add(scale(dir, s.dist * k), [0, Math.max(0.3, who.height * s.eye), 0]));
    return { position, target: add(who.at, [0, who.height * s.look, 0]) };
  }
  return { position: home(cam).position, target: chest };
}

// The first and last pose of a move; frames ease between them (an arc turns on its circle). gap:
// how near a push may come to what it aims at, in proportion to the subject (0.6 m for a person;
// a fixed 0.6 m put the camera inside a 0.55 m fox, 05_submit Chrome test).
function ends(p0: Vec, aimAt: Vec, m: CameraMove, gap = 0.6): { from: Vec; to: Vec; arc?: { centre: Vec; angle: number } } {
  const toAim = sub(aimAt, p0);
  const dir = scale(toAim, 1 / (len(toAim) || 1));
  const right: Vec = [-dir[2], 0, dir[0]]; // horizontal, screen right
  const r = len([right[0], 0, right[2]]) || 1;
  switch (m.move) {
    case "push":
      return { from: p0, to: add(p0, scale(dir, Math.max(0, Math.min(m.amount, len(toAim) - gap)))) };
    case "pull":
      return { from: add(p0, scale(dir, Math.max(0, Math.min(m.amount, len(toAim) - gap)))), to: p0 };
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

// Every frame's pose, from the framing's start, eased in and out when asked. who is the main
// character (pose.at is where they stand, walking or not); the move is framed on the subject
// (subjectOf). A walking main subject carries the aim (and a following or first-person camera)
// along with them; a camera end moved off the preset's goes straight there.
export function poses(cam: StageCamera, who: Subject, m: CameraMove, others: Others = []): Pose[] {
  const n = frameCount(m.seconds);
  if (m.moments?.some((x) => x.camera)) return momentPoses(who, m, n);
  const a0 = m.walk?.from ?? who.at;
  const a1 = m.walk?.to ?? a0;
  const main = !m.subject || m.subject === "main" || subjectOf(cam, who, m, others) === who;
  const subject = main ? { ...who, at: a0 } : subjectOf(cam, who, m, others);
  const { position: p0, target: aimAt } = start(cam, subject, m);
  // A push stops short of where tooClose would flag it (a 2.5 m troll's Close-up push crossed it).
  const preset = ends(p0, aimAt, m, Math.max(0.3, (0.6 * (subject.frame ?? subject.height)) / 1.7, nearOf(subject.height) + 0.1));
  const e = m.to ? { from: preset.from, to: m.to } : preset;
  const carry = main && (m.move === "follow" || m.framing === "pov");
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
    const at = m.moments?.length ? placeAt(m, "main", { at: who.at, turn: who.turn }, i).at : lerp(a0, a1, t);
    const moved = main ? sub(at, a0) : ([0, 0, 0] as Vec);
    out.push({ position: carry ? add(position, moved) : position, target: add(aimAt, moved), at });
  }
  return out;
}

// The default walk: across the frame, sideways to the camera, towards the side they face (screen
// right when they face the camera), about a body and a half long (0.8 to 2 m). Walking along
// their facing sent a character who faces the camera into it in every default shot.
export const WALK_MAX = 3; // m: a ring dragged further is pulled back, the take cannot carry more
export function crossWalk(who: Subject, cam: Vec): { from: Vec; to: Vec } {
  const d = sub(who.at, cam);
  const across: Vec = [-d[2], 0, d[0]];
  const facing: Vec = [Math.sin((who.turn * Math.PI) / 180), 0, Math.cos((who.turn * Math.PI) / 180)];
  const side = across[0] * facing[0] + across[2] * facing[2] < -0.01 ? -1 : 1;
  const step = Math.min(2, Math.max(0.8, who.height * 1.5)) / (Math.hypot(across[0], across[2]) || 1);
  return { from: who.at, to: add(who.at, scale(across, side * step)) };
}
export function clampWalk(from: Vec, to: Vec): Vec {
  const d = sub(to, from);
  const k = Math.min(1, WALK_MAX / (Math.hypot(d[0], d[2]) || 1));
  return [from[0] + d[0] * k, to[1], from[2] + d[2] * k];
}

const nearOf = (height: number) => Math.max(0.25, height * 0.45);
// The first frame where the camera comes closer to the character than about half their height (at
// least 0.25 m: a fixed 0.7 m flagged every Mid shot of a small animal) across the ground, or -1. Keys there show a flat card from inside or edge on, and a path
// that crosses them turns round them in a frame. First person stands in them on purpose.
export function tooClose(ps: Pose[], who: Subject, m: CameraMove) {
  if (m.framing === "pov") return -1;
  const near = nearOf(who.height);
  return ps.findIndex((p) => p.at && Math.hypot(p.position[0] - p.at[0], p.position[2] - p.at[2]) < near);
}

// Does the camera at this pose see the point? fov is the vertical field of view in degrees, aspect
// width / height; a small margin keeps a figure cut by the frame edge out.
export function sees(p: Pose, point: Vec, fov: number, aspect: number) {
  const f = sub(p.target, p.position);
  const fl = len(f) || 1;
  const fw = scale(f, 1 / fl);
  const right: Vec = [-fw[2], 0, fw[0]];
  const rl = len(right) || 1;
  const rt = scale(right, 1 / rl);
  const up: Vec = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const d = sub(point, p.position);
  const z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
  if (z <= 0.1) return false;
  const x = d[0] * rt[0] + d[1] * rt[1] + d[2] * rt[2];
  const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const ty = Math.tan(((fov / 2) * Math.PI) / 180) * 0.95;
  return Math.abs(y / z) < ty && Math.abs(x / z) < ty * aspect;
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
  const more = [...(m.to ? ["to", ...v(m.to)] : []), ...(m.walk ? ["walk", ...v(m.walk.from), ...v(m.walk.to)] : []), ...(m.focus && m.focus !== "deep" ? [m.focus] : []), ...(m.pose ? ["pose", m.pose] : []), ...(m.poseThen ? ["then", m.poseThen] : []), ...(m.subject && m.subject !== "main" ? ["subject", m.subject] : []), ...(m.moments?.length ? ["moments", JSON.stringify(momentsOf(m))] : [])];
  return [m.move, m.amount, m.seconds, m.ease ? 1 : 0, ...at.map((x) => x.toFixed(3)), height.toFixed(2), mesh, ...framing, ...more].join("|");
};

// What stood on the stage when a set of keyframes was painted (greybox blocks, placed assets), as
// a suffix to the render key: keys made before a block or an asset moved are old. Empty with none.
export function propsKey(blocks: { kind: string; at: Vec; size: Vec; turn: number; label: string }[] = [], assets: { id: string; glb?: string; cutouts?: { front?: string }; at?: Vec; height: number; turn: number }[] = []) {
  const v = (p: Vec) => p.map((x) => x.toFixed(2));
  const b = blocks.map((x) => [x.kind, ...v(x.at), ...v(x.size), x.turn, x.label].join(",")).join(";");
  const a = assets.filter((x) => (x.glb || x.cutouts?.front) && x.at).map((x) => [x.id, x.glb ?? x.cutouts!.front, ...v(x.at!), x.height.toFixed(2), x.turn].join(",")).join(";");
  return (b ? `|blocks:${b}` : "") + (a ? `|assets:${a}` : "");
}

// The cutouts the card wears at a frame of the move: with moments, the main character's pose there
// (placeAt); otherwise the shot's pose, or the one it switches to for the second half; the
// turnaround's own (as designed) when the shot has none or it is gone.
export function cardAt<C>(m: CameraMove, frame: number, base: C, poses: { id: string; cutouts: C }[] = [], who = "main"): C {
  const id = m.moments?.length ? placeAt(m, who, { at: [0, 0, 0], turn: 0 }, frame).pose : m.poseThen && frame >= (frameCount(m.seconds) - 1) / 2 ? m.poseThen : m.pose;
  return poses.find((p) => p.id === id)?.cutouts ?? base;
}

// The main character moved on the stage by d: their marks in the move's key moments, the camera
// those moments aim at them and their walk move with them, so the shot keeps its blocking around
// them instead of filming the spot they left (05_submit: a character moved from 25 m to 14.6 m was
// still framed at 25 m and the keys painted a stranger). A move with no moments is relative already.
export function shiftMain(m: CameraMove, d: Vec): CameraMove {
  const add = (v: Vec): Vec => [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
  return {
    ...m,
    walk: m.walk && { from: add(m.walk.from), to: add(m.walk.to) },
    moments: m.moments?.map((x) => ({
      ...x,
      camera: x.camera && { from: add(x.camera.from), look: add(x.camera.look) },
      marks: { ...x.marks, ...(x.marks.main?.at ? { main: { ...x.marks.main, at: add(x.marks.main.at) } } : {}) },
    })),
  };
}

// The moments in frame order, each frame snapped to the 8n grid LTX guides sit on and kept inside
// the shot; two on the same frame keep the later one.
export function momentsOf(m: CameraMove): Moment[] {
  const n = frameCount(m.seconds);
  const snapped = (m.moments ?? []).map((x) => ({ ...x, frame: Math.min(n - 1, Math.max(0, Math.round(x.frame / 8) * 8)) }));
  const out: Moment[] = [];
  for (const x of snapped.sort((a, b) => a.frame - b.frame)) {
    if (out.at(-1)?.frame === x.frame) out[out.length - 1] = x;
    else out.push(x);
  }
  if (out.length && out.at(-1)!.frame > n - 9) out[out.length - 1] = { ...out.at(-1)!, frame: n - 1 };
  return out;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const turnLerp = (a: number, b: number, t: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

// Where someone (who: "main" or an asset id) stands, faces and which pose they wear at a frame:
// eased between the moments that set them, held before the first and after the last; a pose holds
// until a later moment sets another. Without moments: base, the main character walking as the
// move says (m.walk) and wearing the shot's pose.
export function placeAt(m: CameraMove, who: string, base: { at: Vec; turn: number }, frame: number): { at: Vec; turn: number; pose?: string } {
  const ms = momentsOf(m);
  if (!ms.length) {
    if (who !== "main") return base;
    const n = frameCount(m.seconds);
    const t0 = n === 1 ? 0 : frame / (n - 1);
    const t = m.ease ? ease(t0) : t0;
    const at = m.walk ? lerp(m.walk.from, m.walk.to, t) : base.at;
    return { at, turn: base.turn, pose: m.poseThen && frame >= (n - 1) / 2 ? m.poseThen : m.pose };
  }
  const along = <T>(get: (k: Mark) => T | undefined, mix: (a: T, b: T, t: number) => T, fallback: T): T => {
    const set = ms.filter((x) => x.marks[who] && get(x.marks[who]) !== undefined);
    if (!set.length) return fallback;
    const next = set.findIndex((x) => x.frame >= frame);
    if (next === -1) return get(set.at(-1)!.marks[who])!;
    if (next === 0 || set[next].frame === frame) return get(set[next].marks[who])!;
    const a = set[next - 1];
    const b = set[next];
    const t = (frame - a.frame) / (b.frame - a.frame);
    return mix(get(a.marks[who])!, get(b.marks[who])!, m.ease ? ease(t) : t);
  };
  const posed = ms.filter((x) => x.frame <= frame && x.marks[who]?.pose !== undefined).at(-1);
  return {
    at: along((k) => k.at, lerp, base.at),
    turn: along((k) => k.turn, turnLerp, base.turn),
    pose: posed?.marks[who]?.pose || undefined,
  };
}

// A move blocked with cameras at its moments: the camera eases from one moment's camera to the
// next (held before the first and after the last that sets one); the main character stands where
// placeAt puts them. A moment without a camera keeps the line between its neighbours.
function momentPoses(who: Subject, m: CameraMove, n: number): Pose[] {
  const shots = momentsOf(m).filter((x) => x.camera);
  const out: Pose[] = [];
  for (let f = 0; f < n; f++) {
    const next = shots.findIndex((x) => x.frame >= f);
    let position: Vec;
    let target: Vec;
    if (next === -1 || next === 0 || shots[next].frame === f) {
      const c = shots[next === -1 ? shots.length - 1 : next].camera!;
      position = c.from;
      target = c.look;
    } else {
      const a = shots[next - 1];
      const b = shots[next];
      const t0 = (f - a.frame) / (b.frame - a.frame);
      const t = m.ease ? ease(t0) : t0;
      position = lerp(a.camera!.from, b.camera!.from, t);
      target = lerp(a.camera!.look, b.camera!.look, t);
    }
    out.push({ position, target, at: placeAt(m, "main", { at: who.at, turn: who.turn }, f).at });
  }
  return out;
}

// The frames the shot is guided at: with moments, the moments' frames; otherwise every 32nd frame
// of the move and its last (97 frames: 0, 32, 64, 96), as LTX-2.5 kept a move continuous with
// guides that close (04_shot proof 2).
export function keyFrames(m: CameraMove): number[] {
  const n = frameCount(m.seconds);
  const ms = momentsOf(m);
  if (ms.length >= 2) {
    const frames = ms.map((x) => x.frame);
    if (frames[0] !== 0) frames.unshift(0);
    if (frames.at(-1) !== n - 1) frames.push(n - 1);
    return frames;
  }
  const out: number[] = [];
  for (let f = 0; f < n; f += 32) out.push(f);
  if (out.at(-1) !== n - 1) out.push(n - 1);
  return out;
}
