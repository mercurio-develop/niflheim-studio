"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runWorkflow } from "@/lib/comfy";
import { cancelJob, startJob, type JobCtx } from "@/lib/jobs";
import { characterImage, frontPrompt, viewImage, viewPrompt, VIEWS, viewsFor } from "@/lib/progress";
import { getProject, projectDir, updateProject, type TurnaroundOptions, type ViewId } from "@/lib/store";

const View = z.enum(["front", "threequarter", "side", "back", "top", "bottom"]);
const Options = z.object({
  pose: z.enum(["designed", "tpose"]),
  hide: z.array(z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/)).max(12),
  extras: z.array(z.enum(["top", "bottom"])).max(2),
});
const abs = (id: string, f: string) => path.join(projectDir(id), f);
const rel = (id: string, f: string) => path.relative(projectDir(id), f);
const seed = () => Math.floor(Math.random() * 2 ** 31);
const done = (id: string) => revalidatePath(`/p/${id}/turnaround`);
const label = (v: ViewId) => VIEWS.find((x) => x.id === v)!.label;

// One Qwen edit for one view; the result becomes that view's newest version.
async function makeView(id: string, view: ViewId, from: string, prompt: string, ctx: JobCtx, note: string) {
  const [image] = await runWorkflow({
    workflow: "01_edit.api.json",
    onSubmit: ctx.track,
    set: [["17", "prompt", prompt], ["22", "seed", seed()]],
    images: [["1", abs(id, from)]],
    output: "28",
    outDir: abs(id, `turnaround/${view}-${Date.now().toString(36)}`),
  });
  if (!(await ctx.alive())) return null; // cancelled after ComfyUI had already finished
  await updateProject(id, (q) => {
    const t = q.turnaround!;
    const stack = (t.views[view] ??= { versions: [], current: 0 });
    // The view shows the character's own parts, less what was hidden: the editor's chips, no Florence run.
    const tags = q.character.versions[q.character.current ?? -1]?.tags?.filter((x) => !t.options.hide.includes(x));
    stack.versions.push({ image: rel(id, image), label: note, parts: {}, tags, parent: stack.versions.length ? stack.current : undefined });
    stack.current = stack.versions.length - 1;
  });
  return rel(id, image);
}

// True when a mask PNG (8-bit, as ComfyUI saves it) has no white at all: the object was not found.
async function blank(file: string) {
  const png = await readFile(file);
  const width = png.readUInt32BE(16), channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[png[25]] ?? 3;
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at), type = png.toString("ascii", at + 4, at + 8);
    if (type === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), row = 1 + width * channels; // each row starts with its filter byte
  for (let i = 0; i < raw.length; i++) if (i % row && raw[i]) return false;
  return true;
}

// A hidden object is kept before it is painted out: its mask (found now if it was not yet),
// a transparent cutout and the object on grey. One asset per name; a new Generate refreshes it.
async function keepAsset(id: string, name: string, source: string, ctx: JobCtx) {
  const p = await getProject(id);
  const version = p?.character.versions[p.character.current ?? -1];
  let mask = version && Object.hasOwn(version.parts, name) ? version.parts[name] : null;
  const dir = `turnaround/assets/${name.replace(/ /g, "-")}-${Date.now().toString(36)}`;
  if (!mask) {
    const [m] = await runWorkflow({ workflow: "01_parts.api.json", onSubmit: ctx.track, set: [["2", "prompt", name]], images: [["1", abs(id, source)]], output: "4", outDir: abs(id, `${dir}/mask`) });
    mask = rel(id, m);
  }
  if (await blank(abs(id, mask))) {
    // Not found in the picture: keep the name, and paint its views from the whole character.
    await updateProject(id, (q) => {
      q.assets = [...(q.assets ?? []).filter((a) => a.name !== name), { name, image: source, mask, source }];
    });
    return;
  }
  const crop = (node: string, sub: string) =>
    runWorkflow({ workflow: "02_asset_crop.api.json", onSubmit: ctx.track, images: [["1", abs(id, source)], ["2", abs(id, mask!)]], output: node, outDir: abs(id, `${dir}/${sub}`) });
  const [cutout] = await crop("10", "cutout");
  const [grey] = await crop("11", "grey");
  if (!(await ctx.alive())) return;
  await updateProject(id, (q) => {
    const assets = (q.assets ??= []).filter((a) => a.name !== name);
    assets.push({ name, image: rel(id, grey), cutout: rel(id, cutout), mask: mask!, source });
    q.assets = assets;
  });
}

const describe = (o: TurnaroundOptions) => [o.pose === "tpose" ? "T-pose" : "as designed", ...o.hide.map((h) => `no ${h}`)].join(", ");

// Generate: the front from the character (pose, hidden objects), then every view from that front.
export async function generateTurnaround(id: string, rawOptions: z.input<typeof Options>) {
  const options = Options.parse(rawOptions);
  const p = await getProject(id);
  const source = p && characterImage(p);
  if (!source) throw new Error("Finish the character first.");
  const views = viewsFor(options);
  await startJob(
    id,
    "turnaround",
    async (ctx) => {
      // A new set starts from this character with these options; earlier views stay in each stack.
      await updateProject(id, (q) => {
        q.turnaround = { source, options, views: q.turnaround?.source === source ? q.turnaround.views : {} };
      });
      for (const name of options.hide) {
        await ctx.progress(`Keeping the ${name} as an asset`);
        await keepAsset(id, name, source, ctx);
        if (!(await ctx.alive())) return;
      }
      await ctx.progress(`Making the front view (1/${views.length})`);
      const front = await makeView(id, "front", source, frontPrompt(options), ctx, `Front · ${describe(options)}`);
      if (!front) return;
      for (const [i, v] of views.slice(1).entries()) {
        await ctx.progress(`Making the ${label(v.id).toLowerCase()} view (${i + 2}/${views.length})`);
        if (!(await makeView(id, v.id, front, viewPrompt(v.id, options), ctx, `${label(v.id)} · from the front`))) return;
      }
    },
    `Making the front view (1/${views.length})`,
  );
  done(id);
}

// Again for one view: the front again from the character, any other view from the current front.
export async function generateView(id: string, rawView: string) {
  const view = View.parse(rawView);
  const p = await getProject(id);
  const source = p && characterImage(p);
  if (!p || !source) throw new Error("Finish the character first.");
  const t = p.turnaround;
  if (!t) throw new Error("Generate the turnaround first.");
  const front = viewImage(p, "front");
  if (view !== "front" && !front) throw new Error("Make the front view first.");
  await startJob(
    id,
    `view:${view}`,
    (ctx) =>
      makeView(id, view, view === "front" ? source : front!, view === "front" ? frontPrompt(t.options) : viewPrompt(view, t.options), ctx, `${label(view)} · again`).then(() => {}),
    `Making the ${label(view).toLowerCase()} view again`,
  );
  done(id);
}

const AssetName = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z][a-z \-]*$/);
const assetKey = (name: string) => `asset:${name.replace(/ /g, "-")}`;

// Later, on demand: the hidden object's own front and side views, from its picture on grey.
export async function makeAssetViews(id: string, rawName: string) {
  const name = AssetName.parse(rawName);
  const p = await getProject(id);
  const asset = p?.assets?.find((a) => a.name === name);
  if (!asset) throw new Error(`No asset called ${name}.`);
  await startJob(
    id,
    assetKey(name),
    async (ctx) => {
      for (const side of ["front", "side"] as const) {
        await ctx.progress(`Painting the ${name} from the ${side}`);
        const [image] = await runWorkflow({
          workflow: "01_edit.api.json",
          onSubmit: ctx.track,
          set: [["17", "prompt", `Show only the ${name}${asset.cutout ? "" : " from this picture"} on its own, as a clean product view from the ${side}, centred, nothing else in the image, plain light grey background.`], ["22", "seed", seed()]],
          images: [["1", abs(id, asset.image)]],
          output: "28",
          outDir: abs(id, `turnaround/assets/${name.replace(/ /g, "-")}-${side}-${Date.now().toString(36)}`),
        });
        if (!(await ctx.alive())) return;
        await updateProject(id, (q) => {
          const a = q.assets?.find((x) => x.name === name);
          if (a) a.views = { ...a.views, [side]: rel(id, image) };
        });
      }
    },
    `Painting the ${name}`,
  );
  done(id);
}

export async function cancelTurnaround(id: string, rawKey: string) {
  const key = z.union([z.literal("turnaround"), z.string().regex(/^view:(front|threequarter|side|back|top|bottom)$/), z.string().regex(/^asset:[a-z][a-z-]{1,39}$/)]).parse(rawKey);
  await cancelJob(id, key);
  done(id);
}
