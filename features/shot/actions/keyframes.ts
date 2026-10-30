"use server";

import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { focusPhrase, keyFrames } from "@/lib/camera";
import { runWorkflow } from "@/lib/comfy";
import { startJob } from "@/lib/jobs";
import { sceneKey } from "@/lib/progress";
import { getProject, projectDir, updateProject, type Keyframes, type Project } from "@/lib/store";
import { styleById } from "@/lib/styles";
import { asShot, beatsKey } from "../state";
import { faceFixable, faceReference, matchFace } from "../face";
import { nameInCaption, whoOf } from "../ingredients";

// Another character stands on the stage: a caption's creature may be them, so it is left as said.
const alongside = (p: Project) => (p.sceneAssets ?? []).some((a) => a.kind === "character" && a.at);

const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const done = (id: string) => {
  revalidatePath(`/p/${id}/scene`);
  revalidatePath(`/p/${id}/shot`);
};
const seed = () => Math.floor(Math.random() * 2 ** 31);

async function load(id: string): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error("Project not found.");
  return p;
}

// Today's move, placement and stage, as the camera render keys them; null when not ready.

// Every key is the capture repainted on its own with one strict prompt and one seed: keep
// everything, add nothing, fill the stage's black holes. No character description: naming "a
// lantern keeper" made Qwen add a lantern, and a key that invents things makes the take invent
// them. Matching keys to key 0 collapsed the camera move (04_shot ACCEPT proof 5: method M, camera
// travel 10 px, worst pop-in 5.8, no frame over the line). The note is the one thing that may be added.
// The greybox blocks become what their labels say; an unlabelled one is left to fit the scene.
function blocksPhrase(p: Project) {
  const named = (p.blocks ?? []).map((b) => b.label.trim()).filter(Boolean);
  if (!p.blocks?.length) return "";
  return named.length
    ? `The plain grey shapes are stand-ins: paint each as what it is (${named.join("; ")}), the same size and place, solid, in the scene's style.`
    : "The plain grey shapes are stand-ins: paint each as a fitting object of the same size and place, in the scene's style.";
}

const KEEP = "Keep everything in this picture exactly where it is and add nothing new: no new objects, nothing in the hands that is not already there.";
function keyPrompt(p: Project, note: string) {
  const style = styleById(p.set?.style || p.character.style).phrase;
  return [
    KEEP,
    `Make it one finished frame, ${style}: light the character so they belong in the scene with a soft shadow on the ground, repaint smeared, jagged or broken patches cleanly, and fill any black holes at the edges with the scene around them. Same camera framing.`,
    // Relighting turned a black cat brown with glowing eyes (06_cast stage-cast proof): the light may
    // change, the characters may not.
    "Every character keeps their own colours, markings, fur, skin and clothes exactly as they are; only the light on them changes.",
    // Named, so the repaint keeps what they are (a cyan dragon stayed a dragon, not a dinosaur).
    p.character.prompt ? `The main character is ${whoOf(p.character.prompt).name.replace(/^the /, "a ")}, exactly as in the picture.` : "",
    blocksPhrase(p),
    focusPhrase(p.camera),
    note,
  ]
    .filter(Boolean)
    .join(" ");
}

const Key = z.instanceof(File).refine((f) => f.type === "image/jpeg" && f.size < 900 * 1024, "Each key must be a JPEG under 900 KB.");
const Note = z.string().trim().max(300);

// The viewer's captures at the key frames, uploaded from the browser; then each is refined.
export async function saveKeys(id: string, form: FormData, rawNote: unknown, rawDetail: unknown = true) {
  const p = await load(id);
  const key = sceneKey(p);
  if (!key) throw new Error("Place the character and choose a camera move first.");
  const frames = keyFrames(p.camera!);
  const files = frames.map((_, i) => Key.parse(form.get(`key${i}`)));
  const note = Note.parse(rawNote ?? "");
  const detail = z.boolean().parse(rawDetail);
  // Checked before anything is written: a key being painted (or its face fixed) holds the lock,
  // and new raws saved under it would wait for a job that never starts.
  if (p.jobs.keyframes?.status === "running") throw new Error("A key is still being painted; wait for it or cancel it first.");
  const dir = abs(id, `shot/keys/${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  const raw: string[] = [];
  for (const [i, f] of files.entries()) {
    const file = path.join(dir, `raw-${String(frames[i]).padStart(3, "0")}.jpg`);
    await writeFile(file, Buffer.from(await f.arrayBuffer()));
    raw.push(rel(id, file));
  }
  const s = seed();
  await updateProject(id, (q) => void (q.keyframes = { frames, raw, keys: raw.map(() => null), captions: raw.map(() => null), prompt: keyPrompt(asShot(q), note), note, seed: s, key, at: new Date().toISOString(), detail }));
  await refine(id, raw.map((_, i) => i));
  done(id);
}

// Florence-2-large on the painted key (03_key_caption, about 12 s on Cloud): what is in the frame,
// for the take prompt. It opens with "The image is a digital illustration of" and closes on the
// mood or the background; only the first two sentences about the subject are kept.
async function caption(image: string, outDir: string, track?: (jobId: string) => unknown) {
  const [file] = await runWorkflow({ workflow: "03_key_caption.api.json", onSubmit: track, images: [["1", image]], output: "4", outDir, ext: "txt" });
  const text = (await readFile(file, "utf8"))
    .trim()
    .replace(/^(the|this) (image|picture|frame|scene) (is|shows|depicts)( an? [\w\s,-]*?(illustration|painting|image|render|artwork|drawing) of)? /i, "");
  return text
    .split(/(?<=\.)\s+/)
    .filter((x) => !/\b(overall|mood|atmosphere|background)\b/i.test(x))
    .slice(0, 2)
    .join(" ");
}

// The beat a later key shows: the beats in order over the keys after the first (with four keys:
// first, then, by the end), the first key staying as the stage shows. The stage only stands them in
// place, so without it no key showed the action and neither did the take (the troll never bit the
// tire: 05_submit troll reel); with only the later beats, key 2 jumped from standing to the tire at
// its mouth in 1.3 s and the take cut there (pilot C, 32 and 51 frames popping).
function beatOf(p: Project, i: number, n: number) {
  const b = p.shot?.beats;
  if (!b || i === 0) return undefined;
  const beats = [b.start, b.then, b.end].map((x) => x?.trim()).filter(Boolean) as string[];
  return beats[Math.min(beats.length - 1, Math.floor(((i - 1) * beats.length) / Math.max(1, n - 1)))];
}
const acting = (beat: string) => `Show the moment the character ${beat}: change their pose, hands and expression to show it clearly; things already in the picture may be in their hands or at their mouth. Keep the place, everything else where it is, the camera framing and the light.`;
const promptFor = (p: Project, k: Keyframes, i: number) => {
  const beat = beatOf(p, i, k.raw.length);
  if (!beat) return k.prompt;
  return k.prompt.includes(KEEP) ? k.prompt.replace(KEEP, acting(beat)) : `${acting(beat)} ${k.prompt}`;
};

// Later keys see the painted first key as Qwen's picture 2, so every key keeps the same person,
// clothes and light (without it each key invented its own character and the take swapped people).
const SAME_AS_FIRST = "Picture 2 is the first frame of this same shot: the character must be the same person as in picture 2 (face, hair, clothes, build and colours) under the same light. Keep the layout of picture 1.";
const withFirst = (g: Record<string, { class_type: string; inputs: Record<string, unknown> }>) => {
  g["30"] = { class_type: "LoadImage", inputs: { image: "" } };
  g["31"] = { class_type: "FluxKontextImageScale", inputs: { image: ["30", 0] } };
  g["17"].inputs.image2 = ["31", 0];
  g["18"].inputs.image2 = ["31", 0];
};

// Repaint the given keys with 01_edit (Qwen-Image-Edit 2511 + Lightning, about 30 s each) as one
// job; every key uses the saved prompt and seed, a re-rolled one a new seed. Key 1 goes first and
// is the reference for the rest (in a continued shot, key 1 is the previous take's last frame).
async function refine(id: string, which: number[], reroll = false) {
  const p = asShot(await load(id));
  const k = p.keyframes;
  if (!k) throw new Error("Make the keyframes first.");
  const all = which.length === k.raw.length;
  await startJob(id, "keyframes", async (ctx) => {
    if (all) await updateProject(id, (q) => void (q.keyframes?.raw[0] === k.raw[0] && (q.keyframes.beats = beatsKey(q))));
    let first = !which.includes(0) && k.keys[0] ? abs(id, k.keys[0]) : null;
    for (const [n, i] of which.entries()) {
      await ctx.progress(`Painting key ${n + 1} of ${which.length}`);
      const outDir = path.join(path.dirname(abs(id, k.raw[i])), `key-${String(k.frames[i]).padStart(3, "0")}-${Date.now().toString(36)}`);
      const ref = i > 0 ? first : null;
      // A shot that continues another starts on that take's last frame, as it is.
      const seeded = i === 0 && p.seededFrom ? abs(id, p.seededFrom.frame) : null;
      let [image] = seeded ? [seeded] : await runWorkflow({
        workflow: "01_edit.api.json",
        onSubmit: ctx.track,
        edit: ref ? withFirst : undefined,
        set: [["17", "prompt", ref ? `${promptFor(p, k, i)} ${SAME_AS_FIRST}` : promptFor(p, k, i)], ["22", "seed", reroll ? seed() : k.seed]],
        images: [["1", abs(id, k.raw[i])], ...(ref ? [["30", ref] as [string, string]] : [])],
        output: "28",
        outDir,
      });
      if (!(await ctx.alive())) return;
      if (k.detail && !seeded) {
        // Faces and hands: SAM3 finds them by name, Z-Image repaints each crop lightly (faces 0.22,
        // which keeps the expression and the person; hands 0.35, which fixes fingers).
        await ctx.progress(`Fixing faces and hands in key ${n + 1} of ${which.length}`);
        const style = styleById(p.set?.style || p.character.style).phrase;
        // With other characters on the stage every face gets the same prompt, so it names nobody:
        // naming the main character would repaint the others' faces as theirs.
        const who = (p.sceneAssets ?? []).some((a) => a.kind === "character" && a.at) ? "the same face as in the picture, keeping who it is" : `the face of ${p.character.prompt}`;
        [image] = await runWorkflow({
          workflow: "03_key_detail.api.json",
          onSubmit: ctx.track,
          set: [["14", "text", `${who}, clean and well drawn, clear eyes, nose and mouth, ${style}`], ["16", "text", `a well-drawn hand with five fingers, natural pose, ${style}`], ["6", "denoise", 0.22], ["7", "denoise", 0.35], ["6", "seed", k.seed], ["7", "seed", k.seed]],
          images: [["1", image]],
          output: "8",
          outDir: `${outDir}-detail`,
        });
        if (!(await ctx.alive())) return;
      }
      // The face matched to the character's sheet, when there is one and they are alone on the stage.
      if (faceFixable(p) && !seeded) {
        await ctx.progress(`Matching the face in key ${n + 1} of ${which.length} to the sheet`);
        image = (await matchFace(image, abs(id, faceReference(p)!), `${outDir}-face`, ctx.track)) ?? image;
        if (!(await ctx.alive())) return;
      }
      await updateProject(id, (q) => {
        if (q.keyframes?.raw[i] === k.raw[i]) q.keyframes.keys[i] = rel(id, image);
      });
      if (i === 0) first = image;
      // A caption that fails leaves the key without one; the take is still made from the context.
      await ctx.progress(`Describing key ${n + 1} of ${which.length}`);
      const said = await caption(image, `${outDir}-caption`, ctx.track).catch(() => null);
      const text = said && !alongside(p) ? nameInCaption(said, p.character.prompt ?? "", (p.sceneAssets ?? []).map((a) => a.name)) : said;
      if (!(await ctx.alive())) return;
      await updateProject(id, (q) => {
        if (q.keyframes?.raw[i] !== k.raw[i]) return;
        q.keyframes.captions ??= q.keyframes.raw.map(() => null);
        q.keyframes.captions[i] = text;
      });
    }
  }, "Painting the keyframes");
}

// A shorter take from the same move: the keys after key i go and the take ends on it (the camera
// covers the move up to there). Full length again marks the keys out of date, so Generate draws them all.
export async function cutKeys(id: string, rawIndex: unknown) {
  const i = z.number().int().min(1).max(8).parse(rawIndex);
  await updateProject(id, (q) => {
    const k = q.keyframes;
    if (!k || i >= k.frames.length - 1) throw new Error("Cut before the last key.");
    if (q.jobs.keyframes?.status === "running") throw new Error("A key is still being painted; wait for it first.");
    k.full ??= k.frames.at(-1);
    for (const list of [k.frames, k.raw, k.keys, k.captions ?? []]) list.splice(i + 1);
  });
  done(id);
}

export async function uncutKeys(id: string) {
  await updateProject(id, (q) => void (q.keyframes && q.keyframes.full !== undefined && ((q.keyframes.key = ""), (q.keyframes.full = undefined))));
  done(id);
}

// Every key painted again from the same captures, with today's beats (One Shoot, when only the beats changed).
export async function repaintKeys(id: string) {
  const p = await load(id);
  if (!p.keyframes?.raw.length) throw new Error("Make the keyframes first.");
  if (p.jobs.keyframes?.status === "running") throw new Error("A key is still being painted; wait for it or cancel it first.");
  await refine(id, p.keyframes.raw.map((_, i) => i));
  done(id);
}

export async function rerollKey(id: string, rawIndex: unknown) {
  const i = z.number().int().min(0).max(8).parse(rawIndex);
  const p = await load(id);
  if (!p.keyframes?.raw[i]) throw new Error("No such key.");
  await refine(id, [i], true);
  done(id);
}

// Match one key's face to the character's sheet again (Fix face), as it is now.
export async function fixKeyFace(id: string, rawIndex: unknown) {
  const i = z.number().int().min(0).max(8).parse(rawIndex);
  const p = asShot(await load(id));
  const key = p.keyframes?.keys[i];
  const ref = faceReference(p);
  if (!key) throw new Error("No such key.");
  if (!ref) throw new Error("Make the character's sheet first: its front close-up is the face to match.");
  await startJob(id, "keyframes", async (ctx) => {
    await ctx.progress(`Matching the face in key ${i + 1} to the sheet`);
    const out = await matchFace(abs(id, key), abs(id, ref), path.join(path.dirname(abs(id, key)), `face-${Date.now().toString(36)}`), ctx.track);
    if (!out) throw new Error("No face found in this key, or it is too small to repaint.");
    if (!(await ctx.alive())) return;
    await updateProject(id, (q) => {
      if (q.keyframes?.keys[i] === key) q.keyframes.keys[i] = rel(id, out);
    });
  }, `Matching the face in key ${i + 1}`);
  done(id);
}

// The user's own words for what is in a key; an empty one drops it from the take prompt.
export async function saveCaption(id: string, rawIndex: unknown, rawText: unknown) {
  const i = z.number().int().min(0).max(8).parse(rawIndex);
  const text = z.string().trim().max(600).parse(rawText);
  await updateProject(id, (q) => {
    const k = q.keyframes;
    if (!k?.raw[i]) throw new Error("No such key.");
    k.captions ??= k.raw.map(() => null);
    k.captions[i] = text || null;
  });
  done(id);
}
