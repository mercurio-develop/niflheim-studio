"use server";

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { focusPhrase, frameCount, keyFrames, momentsOf, poses, sees } from "@/lib/camera";
import { currentFill } from "@/lib/progress";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob } from "@/lib/jobs";
import { getProject, projectDir, updateProject, type Project, type TakeScore } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { DEFAULT_NEGATIVE, END_NEW_POSE_STRENGTH, END_STRENGTH, middleImageNode, shapeShot } from "../graph";
import { sceneKey } from "@/lib/progress";
import { keysProblem, suggestedKind } from "../state";
import { addIngredients, firstKeyOnly, sheetOnly, SHEET_FRAMES, SHEET_NODE, sheetPrompt, whoOf, withSheet } from "../ingredients";
import { PYTHON } from "@/lib/python";
import { goodTake, takeRank } from "@/lib/score";
import { saveKeys } from "./keyframes";
import { saveClay } from "./layout";

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const run = promisify(execFile);
const SCORE = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "score_take.py");

// Five frames of a take side by side (0, 30, 60, 90 and 120, or as far as it goes), to see at a
// glance whether the character stays themselves through it. A take without one is kept as it is.
async function stripOf(file: string, frames: number): Promise<string | undefined> {
  const out = path.join(path.dirname(file), "strip.jpg");
  const at = [0, 30, 60, 90, 120].filter((f) => f < frames);
  const select = at.map((f) => `eq(n\\,${f})`).join("+");
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `select='${select}',scale=192:-1,tile=${at.length}x1`, "-frames:v", "1", out]);
    return out;
  } catch {
    return undefined;
  }
}

// How a take moves and whether things pop in (scripts/score_take.py, a few seconds); a take that
// cannot be scored is kept without one.
async function scoreTake(file: string): Promise<TakeScore | undefined> {
  try {
    const { stdout } = await run(PYTHON, ["-I", SCORE, file], { maxBuffer: 1 << 20 });
    const s = JSON.parse(stdout) as { camera_travel_px: number; popin_frames: number; popin_max: number };
    return { travel: s.camera_travel_px, popins: s.popin_frames, worst: s.popin_max };
  } catch {
    return undefined;
  }
}
// The reel shows the picked takes too.
const done = (id: string) => {
  revalidatePath(`/p/${id}/shot`);
  revalidatePath(`/p/${id}/export`);
};


// The camera, said relative to them (LTX prompting guide: the move, its speed, and what the frame
// looks like after it).
const MOVE_WORDS: Record<string, { move: string; ends: string }> = {
  static: { move: "holds still on them", ends: "on the same framing" },
  push: { move: "pushes in slowly toward them", ends: "closer on them" },
  pull: { move: "pulls back slowly", ends: "wider, the place around them in view" },
  arc: { move: "arcs slowly around them", ends: "on them from a new angle" },
  crane: { move: "cranes slowly while looking at them", ends: "on them from a new height" },
  track: { move: "tracks sideways, keeping them in frame", ends: "with them still in frame" },
  follow: { move: "follows them at the same distance", ends: "still with them" },
};
const FRAMING_WORDS: Record<string, string> = { long: "Wide shot", mid: "Medium shot", close: "Close-up", pov: "First-person shot", free: "Shot", painting: "Shot" };

export type Beats = { start: string; then?: string; end?: string };

// LTX reads one flowing paragraph in the present tense (its prompting guide): the shot and the
// place, who it is and what they do first, what happens as the camera moves, how it ends and how
// the frame ends, then the look. "One continuous take" keeps the move from cutting (04_shot proof 2).
function shotPrompt(p: Project, b: Beats) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  const m = p.camera;
  const pov = m?.framing === "pov";
  const cam = MOVE_WORDS[m?.move ?? "static"];
  const clean = (x?: string) => x?.trim().replace(/[.\s]+$/, "");
  const lines = [
    `${FRAMING_WORDS[m?.framing ?? "painting"]}${p.set?.prompt ? ` of ${clean(p.set.prompt)}` : ""}.`,
    pov ? `Seen through the eyes of ${clean(p.character.prompt)}, who ${clean(b.start)}.` : `${capital(clean(p.character.prompt)!)} ${clean(b.start)}.`,
    cast(p) ? `Also in the scene: ${cast(p)}.` : "",
    m?.walk ? "They walk steadily across the ground." : "",
    poseOf(p, m?.pose) ? `They ${poseOf(p, m?.pose)}.` : "",
    m?.poseThen ? `Halfway through, they ${poseOf(p, m.poseThen) ?? "return to how they stood at first"}.` : "",
    clean(b.then) ? `As the camera ${cam.move}, the character ${clean(b.then)}.` : `The camera ${cam.move}.`,
    clean(b.end) ? `A moment later, the character ${clean(b.end)}.` : "",
    pov ? "" : `The shot ends ${cam.ends}.`,
    keysPhrase(p),
    `One continuous take with no cuts, ${style}, consistent art style.`,
    focusPhrase(m),
  ];
  return lines.filter(Boolean).join(" ");
}
// The cast members the shot's keys can see, by name and description. One out of frame is left
// unsaid: named, LTX paints them in between the keys and they fade out at the next one.
const cast = (p: Project) => {
  const cam = currentFill(p)?.camera;
  const m = p.camera;
  const st = p.stage;
  const path = cam && m && st?.at ? poses(cam, { at: st.at, height: st.height, turn: st.turn }, m, p.sceneAssets ?? []) : null;
  const keys = path && m ? keyFrames(m).map((f) => path[f]) : [];
  return (p.sceneAssets ?? [])
    .filter((a) => a.kind === "character" && a.at && keys.some((k) => sees(k, [a.at![0], a.at![1] + a.height * 0.6, a.at![2]], cam!.fov, 768 / 448)))
    .map((a) => ((x) => (x ? `${a.name}, ${x}` : a.name))(p.cast?.find((m) => m.id === a.cid)?.character.prompt ?? a.prompt))
    .join("; ");
};
// A caption that names no one (Florence-2 sometimes sees only the place: "a forest scene, fallen
// leaves") would tell the take there is nobody there, so only those that name a figure are kept.
const FIGURE = /\b(man|woman|boy|girl|person|people|child|kid|figure|character|creature|monster|animal|beast|he|she)\b/i;
function namesSomeone(p: Project, caption: string) {
  // The character's own noun: the last word before what they have or wear ("troll", "fox", "keeper").
  const noun = whoOf(p.character.prompt ?? "").name.split(/ (?:with|on|in|of|wearing|holding|carrying) /)[0].split(/\s+/).at(-1);
  return FIGURE.test(caption) || (!!noun && new RegExp(`\\b${noun}`, "i").test(caption));
}
// What the keys show, in order (Florence-2 captions, or the user's edits of them): the frame the take
// starts on, passes through and ends on. Keys without a caption are skipped.
function keysPhrase(p: Project) {
  const c = (p.keyframes?.captions ?? []).map((x) => x?.trim().replace(/[.\s]+$/, "")).filter((x) => x && namesSomeone(p, x)) as string[];
  if (!c.length) return "";
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  if (c.length === 1) return `At the start, ${lower(c[0])}.`;
  const middle = c.slice(1, -1).map((x) => ` Then, ${lower(x)}.`).join("");
  return `At the start, ${lower(c[0])}.${middle} By the end, ${lower(c.at(-1)!)}.`;
}
const poseOf = (p: Project, id?: string) => p.poses?.find((x) => x.id === id)?.prompt;
const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

// No negative from the user: the distilled graph runs at CFG 1, where a negative prompt has no
// effect (04_shot ACCEPT proof 3: take D = take B frame for frame). The graph keeps a default.
const Beat = z.string().trim().max(300);
const Input = z
  .object({ action: z.string().trim().max(500).optional(), beats: z.object({ start: Beat, then: Beat.optional(), end: Beat.optional() }).optional(), tries: z.number().int().min(1).max(4).optional(), expression: z.string().trim().max(60).optional(), fromKey: z.boolean().optional() })
  .transform((x) => {
    const beats: Beats = x.beats ?? { start: x.action ?? "" };
    return { beats, action: [beats.start, beats.then, beats.end].map((s) => s?.trim()).filter(Boolean).join(", then "), tries: x.tries ?? 1, expression: x.expression || undefined, fromKey: x.fromKey ?? false };
  })
  .refine((x) => x.beats.start.length >= 3, "Say what happens first, in a few words.");


// The beats, saved as they are typed: the keyframes paint the later ones (actions/keyframes.ts
// beatOf), so they have to be on the shot before the keys are made, not only when a take is shot.
const BeatSet = z.object({ start: Beat, then: Beat.optional(), end: Beat.optional() });
export async function saveBeats(id: string, raw: unknown) {
  const beats = BeatSet.parse(raw);
  if (!(await getProject(id))) throw new Error("Project not found.");
  const action = [beats.start, beats.then, beats.end].map((s) => s?.trim()).filter(Boolean).join(", then ");
  await updateProject(id, (q) => void (q.shot = { negative: DEFAULT_NEGATIVE, takes: [], ...q.shot, beats, action }));
}

// Takes of the shot: LTX-2.5 distilled guided by every keyframe (ends 0.7, middle 0.5), with
// audio, about 1.5 to 2 minutes each on the 4080 for 97 to 121 frames. With tries > 1 it shoots
// until one is good (new seed each time), at most `tries`, and picks the best of them.
// A character take (kind "character"): the sheet's cells said by place, then the shot.
// The shot's own sheet when it drew one (an expression, a pose, props), else the character's.
function sheetFor(p: Project, video: string, expression?: string) {
  const sheet = p.sheet;
  if (!sheet?.drawn || !sheet.rows) throw new Error("Make the character's sheet first (Character, Turnaround).");
  const own = p.shot?.sheet;
  const who = whoOf(p.character.prompt ?? "");
  // Numbered as the sheet drew them: the painted ones only (make_sheet.py's item1, item2...).
  const items = sheet.cells.filter((c) => c.kind === "item" && c.image).map((c) => c.label);
  const props = (own?.props ?? []).map((aid) => p.sceneAssets?.find((a) => a.id === aid)).filter(Boolean).map((a) => ({ name: a!.name, description: a!.prompt, kind: a!.kind }));
  const said = expression ? `${video} Their expression: ${expression}.` : video;
  return { file: own?.drawn ?? sheet.drawn, prompt: withSheet(sheetPrompt(own?.rows ?? sheet.rows, who, props, p.set?.prompt, items), said) };
}

export async function renderTake(id: string, raw: unknown) {
  await shoot(id, Input.parse(raw), false);
}

// One Shoot: the browser's captures of today's stale keys and of the move's clay clip are saved
// (the keys painted and the clip joined, each as its own job), then one shot job waits for them,
// shoots up to `tries` takes and picks the steadiest. The browser draws only what is stale.
export async function oneShoot(id: string, form: FormData, raw: unknown) {
  const input = Input.parse(raw);
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  if (!p.camera) throw new Error("Choose a camera move first.");
  if (p.jobs.shot?.status === "running") throw new Error("A take is still being shot; wait for it or cancel it first.");
  await updateProject(id, (q) => void (q.shot = { negative: DEFAULT_NEGATIVE, takes: [], ...q.shot, beats: input.beats, action: input.action }));
  if (form.has("key0")) await saveKeys(id, form, p.keyframes?.note ?? "", true);
  if (form.has("f0")) await saveClay(id, form);
  await shoot(id, input, true);
}

// Waits for the keys and the clay clip being made for this shoot; a key that failed ends it.
async function settled(id: string, ctx: { alive: () => Promise<boolean>; progress: (d: string) => Promise<unknown> }) {
  for (;;) {
    const p = await getProject(id);
    if (!p || !(await ctx.alive())) return false;
    const j = p.jobs;
    if (j.keyframes?.status === "error") throw new Error(`Keyframes failed: ${j.keyframes.error}`);
    if (j.keyframes?.status === "cancelled") throw new Error("The keyframes were cancelled.");
    const busy = [j.keyframes, j.layout].find((x) => x?.status === "running");
    if (!busy) return true;
    await ctx.progress(busy.detail ?? "Painting the keyframes");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function shoot(id: string, input: ReturnType<typeof Input.parse>, wait: boolean) {
  const { beats, action, tries, expression, fromKey } = input;
  const negative = DEFAULT_NEGATIVE;
  const first = await getProject(id);
  if (!first) throw new Error("Project not found.");
  if (!first.camera) throw new Error("Choose a camera move first.");
  // Keys guide every take but a character take from the sheet alone; they must be today's.
  const problem = keysProblem(first);
  if (!wait && problem && ((first.shot?.kind ?? suggestedKind(first)) === "camera" || fromKey)) throw new Error(problem);
  await updateProject(id, (q) => void (q.shot = { takes: [], ...q.shot, action, beats, negative, expression }));
  await startJob(id, "shot", async (ctx) => {
  if (wait && !(await settled(id, ctx))) return;
  const p = await getProject(id);
  if (!p?.camera) throw new Error("Choose a camera move first.");
  const k = p.keyframes;
  const kind = p.shot?.kind ?? suggestedKind(p);
  const late = keysProblem(p);
  if (late && (kind === "camera" || fromKey)) throw new Error(late);
  const length = frameCount(p.camera.seconds);
  const keys = (k?.keys ?? []) as string[];
  // A character take is the sheet's trained length, from the sheet alone or from the first key too
  // (only when that key shows the same character: a key painted with someone else wins the face,
  // 05_submit take mvu4qdjl); a camera take follows every key over the move.
  const sheet = kind === "character" ? sheetFor(p, shotPrompt(p, beats), expression) : null;
  // A camera take with an up-to-date clay clip runs Layout-to-Render (03_shot_layout): the clip
  // guides every frame and only the first key is painted (the take follows the move and the
  // blocking; 05_submit proof: camera travel 33 px and no pop-ins against 1.2 px and 41 keys-only).
  const clip = !sheet && p.layout && p.layout.frames === length && p.layout.key === sceneKey(p) ? p.layout : null;
  const frames = sheet ? SHEET_FRAMES : length;
  // Lightricks: never "clay", "3D" or "Unreal" in a Layout-to-Render prompt, or the take looks like the clip.
  const prompt = sheet?.prompt ?? (clip ? shotPrompt(p, beats).replace(/\b(clay|3D|Unreal)\b\s*/gi, "") : shotPrompt(p, beats));
  const ms = momentsOf(p.camera);
  const endStrength = ms.length > 1 && (ms[0].marks.main?.pose ?? "") !== (ms.at(-1)!.marks.main?.pose ?? "") ? END_NEW_POSE_STRENGTH : END_STRENGTH;
    const made: { index: number; score?: TakeScore }[] = [];
    for (let n = 1; n <= tries; n++) {
      if (tries > 1) await ctx.progress(`Shooting take ${n} of up to ${tries}`);
      const seed = Math.floor(Math.random() * 2 ** 31);
      const [video] = await runWorkflow({
        workflow: clip ? "03_shot_layout.api.json" : "03_shot.api.json",
        onSubmit: ctx.track,
        edit: (g) => {
          if (clip) {
            g["30"].inputs.length = frames;
            g["33"].inputs.frames_number = frames;
            return;
          }
          if (!sheet) return shapeShot(g, k!.frames, length, endStrength);
          shapeShot(g, [0, frames - 1], frames);
          firstKeyOnly(g);
          addIngredients(g, frames);
          if (!fromKey) sheetOnly(g);
        },
        set: [["20", "text", prompt], ["21", "text", negative], ["40", "noise_seed", seed]],
        videos: clip ? [["401", abs(id, clip.clip)]] : undefined,
        images: clip
          ? [["1", abs(id, keys[0])]]
          : sheet
          ? [...(fromKey ? [["1", abs(id, keys[0])] as [string, string]] : []), [SHEET_NODE, abs(id, sheet.file)]]
          : [["1", abs(id, keys[0])], ["2", abs(id, keys.at(-1)!)], ...keys.slice(1, -1).map((f, i) => [middleImageNode(i), abs(id, f)] as [string, string])],
        output: "55",
        ext: "mp4",
        outDir: abs(id, `shot/takes/${Date.now().toString(36)}`),
        timeoutMs: 20 * 60_000,
      });
      if (!video) throw new Error("LTX made no video.");
      if (!(await ctx.alive())) return;
      await ctx.progress(tries > 1 ? `Checking take ${n}` : "Checking the take");
      const [score, strip] = await Promise.all([scoreTake(video), stripOf(video, frames)]);
      let index = 0;
      await updateProject(id, (q) => {
        const take = { video: path.relative(projectDir(id), video), action, seed, frames, keys: k?.at ?? "", seconds: Math.round((frames - 1) / 24), at: new Date().toISOString(), score, prompt, kind, layout: !!clip, strip: strip && path.relative(projectDir(id), strip) };
        q.shot = { action, negative, ...q.shot, takes: [...(q.shot?.takes ?? []), take] };
        index = q.shot.takes.length - 1;
      });
      made.push({ index, score });
      if (goodTake(score, frames)) break;
    }
    if (tries > 1) {
      const best = made.reduce((a, b) => (takeRank(b.score, frames) < takeRank(a.score, frames) ? b : a));
      await updateProject(id, (q) => void (q.shot && (q.shot.picked = best.index)));
    }
  }, tries > 1 ? `Shooting up to ${tries} takes` : "Shooting the take");
  done(id);
}

// What guides the shot's takes: the keyframes along the move, or the character's sheet.
export async function setShotKind(id: string, raw: unknown) {
  const kind = z.enum(["camera", "character"]).parse(raw);
  await updateProject(id, (q) => void (q.shot = { action: "", negative: DEFAULT_NEGATIVE, takes: [], ...q.shot, kind }));
  done(id);
}

export async function pickTake(id: string, raw: unknown) {
  const i = z.number().int().min(0).parse(raw);
  await updateProject(id, (q) => {
    if (!q.shot?.takes[i]) throw new Error("No such take.");
    q.shot.picked = i;
  });
  done(id);
}

export async function cancelShot(id: string) {
  await cancelJob(id, "shot");
  done(id);
}
