import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { StageCamera } from "./stage-fill";
import type { CameraMove } from "./camera";

// Projects live on disk: data/projects/<id>/project.json, step results beside it.
// Image paths in a project are relative to its folder and served by /api/files/<id>/<path>.

export type Job = { status: "running" | "done" | "error" | "cancelled"; startedAt: string; error?: string; comfyId?: string; run?: string; detail?: string }; // detail: what this run makes, e.g. the concepts' style

export type ViewId = "front" | "threequarter" | "side" | "back" | "top" | "bottom";

export type Version = {
  image: string;
  label: string;
  parts: Record<string, string>; // part name -> mask image, for this version
  tags?: string[]; // parts Florence-2 sees in this version
  parent?: number; // the version this one was made from; Undo goes there
  edit?: Edit; // what made it, so the same change can be repeated on other views
};
// what: the part ("" = a painted selection); change: what it became, or what was added.
// mask/box: the selection and strokes it used (project-relative), so Try again can run it again.
export type Edit = { kind: "change" | "add" | "remove"; what: string; change?: string; mask?: string; box?: { x: number; y: number; width: number; height: number } };

// hide: left out of every view; keep: the hidden ones also kept as assets.
export type TurnaroundOptions = { pose: "designed" | "tpose"; hide: string[]; keep: string[]; extras: ("top" | "bottom")[] };
export type AssetView = "front" | "threequarter" | "side" | "back";
export type ViewStack = { versions: Version[]; current: number };
// A hidden object: its cutout and mask from the character it came off, and its own views once made.
export type Asset = {
  name: string;
  image: string; // the object on plain grey (what its views are made from), or the whole character if it was not found
  cutout?: string; // the object with a transparent background (none if it was not found)
  mask: string;
  source: string; // the character image it came off
  views?: Partial<Record<AssetView, string>>;
};

// The set: paintings made from a prompt (or uploaded), the one picked, and the 3D stage MoGe
// built from it (a textured depth mesh plus its depth map). stage.image says which painting it
// was built from, so a new pick shows the stage is out of date. stage.fill: the same stage with
// its holes painted from nearby cameras (lib/stage-fill.ts), the views it painted and their
// cameras (nerfstudio transforms.json, for the splat later), and the hole share before/after.
export type SetData = {
  prompt: string;
  style: string;
  paintings: string[]; // every painting made or uploaded, oldest first
  options?: string[]; // the last Paint's paintings, to pick one from (also in paintings)
  seed?: number; // the last Paint's seed; option i used seed + i
  count?: number; // how many options one Paint makes (2 or 4)
  image?: string; // the chosen painting
  stage?: { image: string; mesh: string; depth: string; fill?: StageFill };
};

// camera: the painting's camera in the levelled stage (floor at y = 0, metres); fills made before
// the floor step (2026-10-27) have none and are shown as they were.
export type StageFill = { mesh: string; cameras: string; views: string[]; holes: { before: number; after: number }; camera?: StageCamera };

// The character standing in the set (step 05). cutouts: each turnaround view with its background
// removed (02_cutout), cut from `source` (the front image at the time; a new front makes them
// stale). at: where they stand in the levelled stage (metres, floor y = 0), height: their height
// in metres, turn: which way they face in degrees (0 = towards the painting's camera, positive
// towards screen right). fill: the filled stage mesh `at` was placed on; a rebuilt or refilled set
// moves the floor, so a different current fill makes the placement out of date.
// A greybox shape standing on the stage (metres, floor y = 0): at is the middle of its base, size
// width, height, depth, turn degrees about y. The keyframes paint it as its label ("a wooden cart").
export type Block = { id: string; kind: "box" | "cylinder" | "ramp"; at: [number, number, number]; size: [number, number, number]; turn: number; label: string };
export type StageData = { source: string; cutouts: Partial<Record<ViewId, string>>; at?: [number, number, number]; height: number; turn: number; fill?: string };

// The character as a 3D model (Hunyuan3D-2 MV from the front, side and back views). front: the
// front view image the shape was made from; a new front makes it out of date. coloured: the same
// mesh with vertex colours projected from the views (scripts/mesh_colour.py); colours: the view
// images they came from, so a fixed view offers "Colour again". Kept beside the turnaround, not
// in it, so a new Generate of the views does not lose it.
export type MeshColourView = "front" | "side" | "back" | "threequarter";
export type Mesh = { glb: string; front: string; at: string; coloured?: string; colours?: Partial<Record<MeshColourView, string>> };

// The scene's camera move rendered through the filled stage (scripts/stage_path.py): a depth video
// for LTX to follow and a colour preview, both 832x480 at 24 fps; holes: the share of each frame
// the stage does not cover. key: the move, placement and stage it was rendered from, so a change
// to any of them shows it is out of date.
export type CameraRender = { depth: string; preview: string; holes: number[]; key: string; at: string };

// Keyframes for the shot: the stage viewer captured at frames 0, 32, 64... of the camera move with
// the character card in (raw), each repainted by Qwen-Image-Edit into one finished frame (keys,
// null until done). One prompt and seed for all, so they share a look; note: what the user asked
// to see in the frame. key: the camera render key (lib/camera.ts renderKey) they were made from.
export type Keyframes = { frames: number[]; raw: string[]; keys: (string | null)[]; prompt: string; note: string; seed: number; key: string; at: string };

// The shot: what happens, and the LTX-2.5 takes of it (MP4 with audio, 768x448, the camera move's
// 8n+1 frames at 24 fps), each guided by the keyframes it was made from (keys: Keyframes.at).
// score: scripts/score_take.py on arrival: camera travel (px of flow), pop-in frames and worst spike.
export type TakeScore = { travel: number; popins: number; worst: number };
export type Take = { video: string; action: string; seed: number; frames: number; keys: string; seconds: number; at: string; score?: TakeScore };
export type Shot = { action: string; negative: string; takes: Take[]; picked?: number };

// One shot of the scene: its name, and (while not active) its move, render, keyframes and takes.
export type ShotRef = { id: string; name: string };
export type ShotData = Pick<Project, "camera" | "cameraRender" | "keyframes" | "shot">;
export const SHOT_FIELDS = ["camera", "cameraRender", "keyframes", "shot"] as const;

// Every shot with its data, the active one read from the top level.
export function allShots(p: Project): (ShotRef & ShotData & { active: boolean })[] {
  return (p.shots ?? []).map((s) => {
    const active = s.id === p.activeShot;
    const data = active ? Object.fromEntries(SHOT_FIELDS.map((f) => [f, p[f]])) : (p.stash?.[s.id] ?? {});
    return { ...s, ...data, active };
  });
}

// The reel: which shots, in what order, and how each joins the next (cut, a 0.5 s crossfade, or a
// dip through black); export: the last MP4 made (scripts/reel.py) and what it was made from (key).
export type Join = "cut" | "fade" | "dip";
export type Reel = { order: string[]; joins: Join[]; export?: { video: string; seconds: number; key: string; at: string } };

// Autopilot: per shot what happens and how many takes; the steps it runs in order (keyframes, the
// takes, the pick, then the reel), each with its state, so a reopened page resumes where it stopped.
export type AutopilotShot = { shot: string; include: boolean; action: string; takes: number };
export type AutopilotStep = { shot: string; kind: "keys" | "take" | "pick" | "export"; n?: number; status: "todo" | "running" | "done" | "error"; error?: string };
export type Autopilot = { plan: AutopilotShot[]; join: Join; steps: AutopilotStep[]; state: "idle" | "running" | "done" | "error" | "stopped"; at: string };

// One "Generate" press: the prompt and style it used and the four images it made.
export type ConceptSet = { prompt: string; style: string; seed: number; images: string[] };

export type Project = {
  id: string;
  createdAt: string;
  character: {
    prompt: string;
    style: string; // lib/styles.ts id
    count?: number; // how many concepts one Generate makes (1, 2, 4 or 6)
    reference?: string; // a sketch or image the concepts should follow (pose, silhouette)
    seed: number;
    concepts: string[]; // the current set's images
    sets?: ConceptSet[]; // earlier sets, oldest first; a new set never replaces them
    versions: Version[];
    current: number | null; // index into versions
    doneAt?: string; // the user pressed Next with this version
  };
  turnaround?: {
    source: string; // the character version image the views were made from
    options: TurnaroundOptions; // what the last Generate used
    clean?: string; // the source with the hidden objects removed (what the front is painted from)
    views: Partial<Record<ViewId, ViewStack>>; // each view keeps its own versions, like the character
  };
  assets?: Asset[]; // objects hidden from the turnaround, kept to be made on their own later
  mesh?: Mesh; // the character in 3D, made from the turnaround views
  set?: SetData;
  stage?: StageData;
  blocks?: Block[]; // greybox shapes on the stage, painted into what their label says
  camera?: CameraMove; // the scene's camera move (lib/camera.ts), aimed at the placed character
  cameraRender?: CameraRender; // the move rendered along its path, for the shot
  keyframes?: Keyframes; // the shot's keyframes along the camera move
  shot?: Shot; // LTX-2.5 takes of the scene
  // A scene has several shots. camera, cameraRender, keyframes and shot above are the active
  // shot's; the others wait in stash under their id and are swapped in when selected.
  shots?: ShotRef[];
  activeShot?: string;
  stash?: Record<string, ShotData>;
  reel?: Reel; // the picked takes put together
  autopilot?: Autopilot; // the reel made in one press
  jobs: Record<string, Job>;
};

const ROOT = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "projects");
const ID = /^[0-9a-f]{10}$/;

export const projectDir = (id: string) => path.join(ROOT, id);
const projectFile = (id: string) => path.join(projectDir(id), "project.json");

export async function createProject(prompt: string): Promise<Project> {
  const project: Project = {
    id: randomBytes(5).toString("hex"),
    createdAt: new Date().toISOString(),
    character: { prompt, style: "painterly", seed: Math.floor(Math.random() * 2 ** 31), concepts: [], versions: [], current: null },
    jobs: {},
  };
  await mkdir(projectDir(project.id), { recursive: true });
  await save(project);
  return project;
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ID.test(id)) return null;
  try {
    return normalize(JSON.parse(await readFile(projectFile(id), "utf8")));
  } catch {
    return null;
  }
}

// Projects made by older builds miss fields added since; fill them so every page can read them.
function normalize(p: Project): Project {
  const c = (p.character ??= { prompt: "" } as Project["character"]);
  c.style ??= "painterly";
  c.seed ??= Math.floor(Math.random() * 2 ** 31);
  c.concepts ??= [];
  c.sets ??= [];
  c.versions ??= [];
  c.current ??= null;
  p.jobs ??= {};
  const t = p.turnaround as (Project["turnaround"] & { views: Record<string, unknown> }) | undefined;
  if (t) {
    t.options ??= { pose: "designed", hide: [], keep: [], extras: [] };
    t.options.keep ??= [...t.options.hide];
    // Turnarounds made before views had versions stored one image per view.
    for (const [k, v] of Object.entries(t.views)) {
      if (typeof v === "string") t.views[k] = { versions: [{ image: v, label: k, parts: {} }], current: 0 };
    }
  }
  // Projects from before shots: what they have is shot 1.
  if (!p.shots?.length) {
    p.shots = [{ id: "s1", name: "Shot 1" }];
    p.activeShot = "s1";
  }
  p.activeShot ??= p.shots[0].id;
  p.stash ??= {};
  return p;
}

async function save(p: Project) {
  const tmp = `${projectFile(p.id)}.tmp`;
  await writeFile(tmp, JSON.stringify(p, null, 2));
  await rename(tmp, projectFile(p.id));
}

// One writer per project at a time: background jobs and actions both update project.json.
const locks = new Map<string, Promise<unknown>>();

export function updateProject(id: string, fn: (p: Project) => void): Promise<Project> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const p = await getProject(id);
    if (!p) throw new Error(`no project ${id}`);
    fn(p);
    await save(p);
    return p;
  });
  locks.set(id, next.catch(() => {}));
  return next;
}
