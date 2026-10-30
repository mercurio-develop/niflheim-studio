"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cropBox, maskBox, pngSize, removePrompt, type Box } from "@/lib/brush";
import { ASSETS } from "../flags";
import { paintViews } from "@/lib/asset-3d";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { drawSheet, paintSheet } from "../sheet";
import { characterImage, firstView, frontPrompt, viewImage, viewPrompt, VIEWS, viewsFor } from "@/lib/progress";
import { CID, charDir, charKey, charOf, getProject, projectDir, updateProject, type Edit, type TurnaroundOptions, type ViewId } from "@/lib/store";

// Which character: c1 (the top-level fields) unless another is named.
const Cid = z.string().regex(CID).optional();
const View = z.enum(["front", "threequarter", "side", "back", "top", "bottom"]);
const Name = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/);
const Options = z.object({
  pose: z.enum(["relaxed", "designed", "tpose"]),
  hide: z.array(Name).max(12),
  keep: z.array(Name).max(12).default([]),
  extras: z.array(z.enum(["top", "bottom"])).max(2),
  body: z.enum(["person", "animal", "creature"]).default("person"),
  items: z.array(z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/)).max(3).default([]),
});
const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const stamp = () => Date.now().toString(36);
const slug = (name: string) => name.replace(/ /g, "-");
const done = (id: string) => revalidatePath(`/p/${id}/character`); // the turnaround lives on the Character step
const label = (v: ViewId) => VIEWS.find((x) => x.id === v)!.label;

// One Qwen edit for one view; the result becomes that view's newest version.
async function makeView(id: string, view: ViewId, from: string, prompt: string, ctx: JobCtx, note: string, cid = "c1") {
  const [image] = await runWorkflow({
    workflow: "01_edit.api.json",
    onSubmit: ctx.track,
    set: [["17", "prompt", prompt], ["22", "seed", seed()]],
    images: [["1", abs(id, from)]],
    output: "28",
    outDir: abs(id, charDir(cid, `turnaround/${view}-${Date.now().toString(36)}`)),
  });
  if (!(await ctx.alive())) return null; // cancelled after ComfyUI had already finished
  await updateProject(id, (q) => {
    const c = charOf(q, cid);
    const t = c.turnaround!;
    const stack = (t.views[view] ??= { versions: [], current: 0 });
    // The view shows the character's own parts, less what was hidden: the editor's chips, no Florence run.
    const tags = c.character.versions[c.character.current ?? -1]?.tags?.filter((x) => !t.options.hide.includes(x));
    stack.versions.push({ image: rel(id, image), label: note, parts: {}, tags, parent: stack.versions.length ? stack.current : undefined });
    stack.current = stack.versions.length - 1;
  });
  return rel(id, image);
}

// Other words SAM may know an object by, tried when its own name finds nothing.
const SYNONYMS: Record<string, string[]> = { bag: ["satchel", "backpack"], cape: ["cloak"], cloak: ["cape"], sword: ["blade"], hat: ["cap"], helmet: ["helm"], shield: ["buckler"], staff: ["stick", "pole"] };

// The words and confidence thresholds to try, most exact first. SAM 3.1 missed "shoulder bag" at
// 0.5 and found it at 0.3, and as "bag" (2026-10-27); each try is about half a second.
function searches(name: string): [string, number][] {
  const last = name.split(" ").at(-1)!;
  const words = [...new Set([last, ...(SYNONYMS[last] ?? [])])].filter((w) => w !== name);
  return [[name, 0.5], [name, 0.3], ...words.map((w): [string, number] => [w, 0.3])];
}

// A hidden object's mask on the character version, found with SAM (01_parts) if it has none yet.
// It is saved as a part of that version, so the Character editor and Refine see the same mask.
// An empty mask saved earlier counts as none, so it is searched for again.
async function ensureMask(id: string, name: string, ctx: JobCtx, cid = "c1") {
  const p = await getProject(id);
  const c = p && charOf(p, cid).character;
  const at = c?.current ?? -1;
  const version = c?.versions[at];
  if (!version) throw new Error("Finish the character first.");
  const saved = version.parts[name];
  if (saved && (await maskBox(abs(id, saved)))) return saved;
  let m = "";
  for (const [word, threshold] of searches(name)) {
    [m] = await runWorkflow({ workflow: "01_parts.api.json", onSubmit: ctx.track, set: [["2", "prompt", word], ["2", "confidence_threshold", threshold]], images: [["1", abs(id, version.image)]], output: "4", outDir: abs(id, charDir(cid, `character/masks/${stamp()}-${slug(name)}`)) });
    if (!(await ctx.alive())) return null;
    if (await maskBox(m)) break;
  }
  await updateProject(id, (q) => void (charOf(q, cid).character.versions[at].parts[name] = rel(id, m)));
  return rel(id, m);
}

// Nothing found to mask: ask Qwen to paint it out of the whole picture instead.
async function removeByWords(id: string, from: string, name: string, ctx: JobCtx, cid = "c1") {
  const [image] = await runWorkflow({
    workflow: "01_edit.api.json",
    onSubmit: ctx.track,
    set: [["17", "prompt", removePrompt(name)], ["22", "seed", seed()]],
    images: [["1", abs(id, from)]],
    output: "28",
    outDir: abs(id, charDir(cid, `turnaround/clean/${stamp()}`)),
  });
  return rel(id, image);
}

// Find the masks of the objects chosen in Hide, so the user sees (and can refine) them first.
export async function findMasks(id: string, rawNames: string[], rawCid?: unknown) {
  const names = z.array(Name).max(12).parse(rawNames);
  const cid = Cid.parse(rawCid) ?? "c1";
  await startJob(
    id,
    charKey(cid, "hide-masks"),
    async (ctx) => {
      for (const name of names) {
        await ctx.progress(`Finding the ${name}`);
        if (!(await ensureMask(id, name, ctx, cid))) return;
      }
    },
    `Finding the ${names[0] ?? "parts"}`,
  );
  done(id);
}

// Kept before it is painted out: a transparent cutout and the object on grey. If the mask is
// empty (SAM found nothing) the asset is painted from the whole character. Its views survive a
// new Generate while the mask and source are the same.
async function keepAsset(id: string, name: string, source: string, mask: string, found: boolean, ctx: JobCtx, cid = "c1") {
  const p = await getProject(id);
  const old = p && charOf(p, cid).assets?.find((a) => a.name === name);
  if (old && old.mask === mask && old.source === source) return;
  let image = source, cutout: string | undefined;
  if (found) {
    const dir = charDir(cid, `turnaround/assets/${slug(name)}-${stamp()}`);
    const crop = (node: string, sub: string) =>
      runWorkflow({ workflow: "02_asset_crop.api.json", onSubmit: ctx.track, images: [["1", abs(id, source)], ["2", abs(id, mask)]], output: node, outDir: abs(id, `${dir}/${sub}`) });
    cutout = rel(id, (await crop("10", "cutout"))[0]);
    image = rel(id, (await crop("11", "grey"))[0]);
  }
  if (!(await ctx.alive())) return;
  await updateProject(id, (q) => {
    const c = charOf(q, cid);
    c.assets = [...(c.assets ?? []).filter((a) => a.name !== name), { name, image, cutout, mask, source }];
  });
}

// Paint an object out with its mask (01_remove: blank the mask inside a crop, Qwen fills in what
// was behind it, only the mask's pixels are pasted back). More exact than asking in the prompt.
async function removeObject(id: string, from: string, mask: string, strokes: Box, ctx: JobCtx, what = "", cid = "c1") {
  const box = cropBox(strokes, await pngSize(abs(id, from)));
  const crop = (n: string): [string, string, number][] => [[n, "x", box.x], [n, "y", box.y], [n, "width", box.width], [n, "height", box.height]];
  const [image] = await runWorkflow({
    onSubmit: ctx.track,
    workflow: "01_remove.api.json",
    set: [
      ["17", "prompt", removePrompt(what)],
      ["22", "seed", seed()],
      ...crop("4"),
      ...crop("5"),
      ["27", "x", box.x],
      ["27", "y", box.y],
    ],
    images: [["1", abs(id, from)], ["2", abs(id, mask)]],
    output: "28",
    outDir: abs(id, charDir(cid, `turnaround/clean/${stamp()}`)),
  });
  return rel(id, image);
}

const describe = (o: TurnaroundOptions) => [o.body === "animal" ? "on four legs" : o.pose === "tpose" ? "T-pose" : o.pose === "relaxed" ? "relaxed" : "as designed", ...o.hide.map((h) => `no ${h}`)].join(", ");

// Generate: each hidden object is found, kept (if asked) and painted out of the character with its
// mask; then the front from that clean character (pose, prompt), then every view from that front.
export async function generateTurnaround(id: string, rawOptions: z.input<typeof Options>, rawCid?: unknown) {
  const options = Options.parse(rawOptions);
  if (options.body === "animal") options.pose = "designed"; // on four legs: never a T-pose
  const cid = Cid.parse(rawCid) ?? "c1";
  options.keep = ASSETS ? options.keep.filter((k) => options.hide.includes(k)) : [];
  const p = await getProject(id);
  const source = p && characterImage(p, cid);
  if (!source) throw new Error("Finish the character first.");
  const views = viewsFor(options);
  await startJob(
    id,
    charKey(cid, "turnaround"),
    async (ctx) => {
      // A new set starts from this character with these options; earlier views stay in each stack.
      await updateProject(id, (q) => {
        const c = charOf(q, cid);
        c.turnaround = { source, options, views: c.turnaround?.source === source ? c.turnaround.views : {} };
      });
      let clean = source;
      for (const name of options.hide) {
        await ctx.progress(`Finding the ${name}`);
        const mask = await ensureMask(id, name, ctx, cid);
        if (!mask) return;
        const box = await maskBox(abs(id, mask));
        if (options.keep.includes(name)) {
          await ctx.progress(`Keeping the ${name} as an asset`);
          await keepAsset(id, name, source, mask, !!box, ctx, cid);
        }
        await ctx.progress(`Removing the ${name}`);
        clean = box ? await removeObject(id, clean, mask, box, ctx, name, cid) : await removeByWords(id, clean, name, ctx, cid);
        if (!(await ctx.alive())) return;
      }
      await updateProject(id, (q) => {
        const t = charOf(q, cid).turnaround;
        if (t) t.clean = clean;
      });
      // The first view comes from the character (the front; an animal's side), the rest from it.
      const first = firstView(options);
      await ctx.progress(`Making the ${label(first).toLowerCase()} view (1/${views.length})`);
      const anchor = await makeView(id, first, clean, frontPrompt(options), ctx, `${label(first)} · ${describe(options)}`, cid);
      if (!anchor) return;
      for (const [i, v] of views.filter((x) => x.id !== first).entries()) {
        await ctx.progress(`Making the ${label(v.id).toLowerCase()} view (${i + 2}/${views.length})`);
        if (!(await makeView(id, v.id, anchor, viewPrompt(v.id, options), ctx, `${label(v.id)} · from the ${label(first).toLowerCase()}`, cid))) return;
      }
      // The sheet comes with the views: the faces and the chosen items, then the sheet drawn
      // (features/turnaround/sheet.ts). The views are already its bodies.
      await paintSheet(id, cid, options.items, ctx);
    },
    `Making the front view (1/${views.length})`,
  );
  done(id);
}

// Again for one view: the first view (the front; an animal's side) again from the character, any
// other view from the current first view.
export async function generateView(id: string, rawView: string, rawCid?: unknown) {
  const view = View.parse(rawView);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const source = p && characterImage(p, cid);
  if (!p || !source) throw new Error("Finish the character first.");
  const t = charOf(p, cid).turnaround;
  if (!t) throw new Error("Generate the turnaround first.");
  const first = firstView(t.options);
  const anchor = viewImage(p, first, cid);
  if (view !== first && !anchor) throw new Error(`Make the ${label(first).toLowerCase()} view first.`);
  await startJob(
    id,
    charKey(cid, `view:${view}`),
    (ctx) =>
      // The sheet shows the views, so it is drawn again with the new one.
      makeView(id, view, view === first ? (t.clean ?? source) : anchor!, view === first ? frontPrompt(t.options) : viewPrompt(view, t.options), ctx, `${label(view)} · again`, cid).then(async (made) => {
        if (made && charOf(p, cid).sheet) await drawSheet(id, cid);
      }),
    `Making the ${label(view).toLowerCase()} view again`,
  );
  done(id);
}

const assetKey = (name: string, cid = "c1") => charKey(cid, `asset:${slug(name)}`);
// The object's own views, like the character's: the front from its picture on grey (the parts
// that were visible; Qwen completes the rest), then every other angle from that front.
async function paintAsset(id: string, name: string, ctx: JobCtx, cid = "c1") {
  const p = await getProject(id);
  const asset = p && charOf(p, cid).assets?.find((a) => a.name === name);
  if (!asset) return;
  await paintViews(id, name, asset.image, !!asset.cutout, charDir(cid, `turnaround/assets/${slug(name)}`), ctx, (v, image) =>
    updateProject(id, (q) => {
      const a = charOf(q, cid).assets?.find((x) => x.name === name);
      if (a) a.views = { ...a.views, [v]: image };
    }),
  );
}

// Later, on demand: one asset's views, or every asset's in one go.
export async function makeAssetViews(id: string, rawName: string, rawCid?: unknown) {
  const name = Name.parse(rawName);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  if (!(p && charOf(p, cid).assets?.some((a) => a.name === name))) throw new Error(`No asset called ${name}.`);
  await startJob(id, assetKey(name, cid), (ctx) => paintAsset(id, name, ctx, cid), `Painting the ${name}`);
  done(id);
}

export async function makeAllAssetViews(id: string, rawCid?: unknown) {
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const names = ((p && charOf(p, cid).assets) ?? []).map((a) => a.name);
  if (!names.length) throw new Error("No assets yet.");
  await startJob(
    id,
    charKey(cid, "assets"),
    async (ctx) => {
      for (const name of names) {
        await paintAsset(id, name, ctx, cid);
        if (!(await ctx.alive())) return;
      }
    },
    `Painting ${names.length} assets`,
  );
  done(id);
}

// Take an asset off the list (its files stay on disk). The object stays hidden in the views.
export async function deleteAsset(id: string, rawName: string, rawCid?: unknown) {
  const name = Name.parse(rawName);
  const cid = Cid.parse(rawCid) ?? "c1";
  await updateProject(id, (q) => {
    if (q.jobs[assetKey(name, cid)]?.status === "running" || q.jobs[charKey(cid, "assets")]?.status === "running") throw new Error(`The ${name} is being painted; cancel that first.`);
    const c = charOf(q, cid);
    c.assets = (c.assets ?? []).filter((a) => a.name !== name);
  });
  done(id);
}

// Repeat a view's last edit on other views. A named part is found on each view (SAM) and only it
// is repainted (01_swap) or painted out (01_remove); an added thing or a painted selection has no
// place on the other views, so Qwen is told in words (01_edit).
const editPrompt = (e: Edit) =>
  e.kind === "add"
    ? `Add ${e.change} to the character, where it belongs on this view. Keep everything else exactly the same, in the same art style, pose and plain background.`
    : e.kind === "remove"
      ? `Remove the ${e.what || "object"} completely and fill in what would be behind it. Keep everything else exactly the same.`
      : `Change ${e.what ? `the ${e.what}` : "it"} into ${e.change}. Keep the face, pose, every other part and the background exactly the same.`;

async function repeatEdit(id: string, view: ViewId, e: Edit, from: ViewId, ctx: JobCtx, cid = "c1") {
  const p = await getProject(id);
  const stack = p && charOf(p, cid).turnaround?.views[view];
  const version = stack?.versions[stack.current];
  if (!stack || !version) return;
  const image = abs(id, version.image);
  let mask: string | null = null;
  if (e.what && e.kind !== "add") {
    const [m] = await runWorkflow({ workflow: "01_parts.api.json", onSubmit: ctx.track, set: [["2", "prompt", e.what]], images: [["1", image]], output: "4", outDir: abs(id, charDir(cid, `turnaround/${view}/masks/${stamp()}-${slug(e.what)}`)) });
    mask = (await maskBox(m)) ? rel(id, m) : null; // not on this view: fall back to words
  }
  let out: string;
  if (mask && e.kind === "remove") out = await removeObject(id, version.image, mask, (await maskBox(abs(id, mask)))!, ctx, e.what, cid);
  else {
    const [o] = await runWorkflow({
      workflow: mask ? "01_swap.api.json" : "01_edit.api.json",
      onSubmit: ctx.track,
      set: [["17", "prompt", editPrompt(e)], ["22", "seed", seed()]],
      images: mask ? [["1", image], ["2", abs(id, mask)]] : [["1", image]],
      output: "28",
      outDir: abs(id, charDir(cid, `turnaround/${view}/repeats/${stamp()}`)),
    });
    out = rel(id, o);
  }
  if (!(await ctx.alive())) return;
  const what = e.kind === "add" ? `+ ${e.change}` : e.kind === "remove" ? `− ${e.what || "selection"}` : `${e.what || "selection"} → ${e.change}`;
  await updateProject(id, (q) => {
    const s = charOf(q, cid).turnaround?.views[view];
    if (!s) return;
    s.versions.push({ image: out, label: `${what} (as ${label(from).toLowerCase()})`, parts: {}, tags: version.tags, parent: s.current, edit: { kind: e.kind, what: e.what, change: e.change } }); // no mask: that was the other view's
    s.current = s.versions.length - 1;
  });
}

export async function replicateEdit(id: string, rawFrom: string, rawTo: string[], rawCid?: unknown) {
  const from = View.parse(rawFrom);
  const to = z.array(View).min(1).max(5).parse(rawTo).filter((v) => v !== from);
  const cid = Cid.parse(rawCid) ?? "c1";
  const p = await getProject(id);
  const stack = p && charOf(p, cid).turnaround?.views[from];
  const e = stack?.versions[stack.current]?.edit;
  if (!e) throw new Error("This view's last version is not an edit.");
  await startJob(
    id,
    charKey(cid, "replicate"),
    async (ctx) => {
      for (const [i, v] of to.entries()) {
        await ctx.progress(`Repeating on the ${label(v).toLowerCase()} view (${i + 1}/${to.length})`);
        await repeatEdit(id, v, e, from, ctx, cid);
        if (!(await ctx.alive())) return;
      }
    },
    `Repeating on ${to.length} view${to.length === 1 ? "" : "s"}`,
  );
  done(id);
}

export async function cancelTurnaround(id: string, rawKey: string, rawCid?: unknown) {
  const key = z.union([z.literal("turnaround"), z.string().regex(/^view:(front|threequarter|side|back|top|bottom)$/), z.string().regex(/^asset:[a-z][a-z-]{1,39}$/), z.literal("assets"), z.literal("hide-masks"), z.literal("replicate")]).parse(rawKey);
  await cancelJob(id, charKey(Cid.parse(rawCid) ?? "c1", key));
  done(id);
}
