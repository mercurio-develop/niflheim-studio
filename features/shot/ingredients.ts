// The Ingredients reference sheet in a take (scripts/make_sheet.py draws it). Lightricks' own
// LTX-2.5 Ingredients graph: the IC-LoRA on the model, the sheet held on every frame as a guide
// video at frame 0, cropped out again before decoding (LTXVCropGuides crops every guide). Here it
// goes in before the keyframe guides, so the keys still set where things are and the sheet keeps
// who and what they are. On Comfy Cloud only the 2.3 file exists; Lightricks' 2.5 graph runs it
// on the 2.5 distilled model too.

import type { Project, SheetRow } from "@/lib/store";

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

export const INGREDIENTS_LORA = process.env.LTX_INGREDIENTS_LORA || "ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors";
// The 2.3 file ships unscaled (its card: 1.4; Lightricks' 2.5 graph: 1.3); the 2.5 file is pre-scaled to 1.0.
export const INGREDIENTS_STRENGTH = INGREDIENTS_LORA.includes("2.5") ? 1 : 1.3;
export const SHEET_NODE = "300";
export const SHEET_FRAMES = 121; // the trained length: 768x448, 121 frames, 24 fps

const FIRST_GUIDE = "31";

export function addIngredients(g: Graph, length: number) {
  g["301"] = { class_type: "LoraLoaderModelOnly", inputs: { model: ["10", 0], lora_name: INGREDIENTS_LORA, strength_model: INGREDIENTS_STRENGTH }, _meta: { title: "Ingredients IC-LoRA" } };
  g["41"].inputs.model = ["301", 0];
  g[SHEET_NODE] = { class_type: "LoadImage", inputs: { image: "sheet.png" }, _meta: { title: "Reference sheet" } };
  g["302"] = { class_type: "ImageScale", inputs: { image: [SHEET_NODE, 0], upscale_method: "lanczos", width: 768, height: 448, crop: "disabled" } };
  // The held sheet is as long as the take: LTXVAddGuide refuses a guide longer than the latent. The
  // card wants it at least 121 frames, so a shot with a sheet should be 5 s (SHEET_FRAMES); at 97
  // it still runs (04_shot proof v2) but outside the trained bucket.
  g["303"] = { class_type: "RepeatImageBatch", inputs: { image: ["302", 0], amount: length } };
  g["304"] = { class_type: "GetICLoRAParameters", inputs: { iclora_model: ["301", 0] } };
  g["305"] = {
    class_type: "LTXVAddGuide",
    inputs: { positive: ["22", 0], negative: ["22", 1], vae: ["11", 0], latent: ["30", 0], image: ["303", 0], frame_idx: 0, strength: 1, iclora_parameters: ["304", 0] },
    _meta: { title: "Guide: reference sheet" },
  };
  g[FIRST_GUIDE].inputs = { ...g[FIRST_GUIDE].inputs, positive: ["305", 0], negative: ["305", 1], latent: ["305", 2] };
}

// The rows scripts/make_sheet.py drew, top to bottom; its cell labels (face, front,
// three-quarter, side, back, item1..3, prop1:1.., place) are the contract sheetPrompt reads.
export type SheetRows = SheetRow[];
export type SheetElement = { name: string; description?: string; kind?: "object" | "character" };

// "a young lantern keeper in a hooded wool coat, leather satchel" becomes the young lantern keeper,
// described as in a hooded wool coat, leather satchel: how a sheet's prompt names its character.
export function whoOf(prompt: string): SheetElement {
  const [first, ...rest] = prompt.split(",");
  const [name, wearing] = first.split(/ in (?=a |an |the )/);
  return { name: name.trim().replace(/^(a|an) /, "the ") || "the character", description: [wearing && `in ${wearing}`, ...rest].filter(Boolean).join(",").trim() };
}

// Florence-2 names the character by what it looks like ("a small blue dinosaur" for a cyan dragon),
// and the take then plays that. When the caption does not say the character's own noun, its first
// guess becomes the character's name and later mentions their noun. others: names on the stage
// (props, cast) that are never swapped.
const GUESS = "dinosaur|dragon|lizard|reptile|creature|monster|animal|beast|cartoon character|character|figure|toy|doll|mascot|alien|troll|ogre|giant|robot|knight|man|woman|boy|girl|person|kid|child";
export function nameInCaption(caption: string, prompt: string, others: string[] = []) {
  const full = whoOf(prompt).name.split(/ (?:with|wearing|holding|carrying|in|on|of|who|that) /)[0];
  const noun = full.split(/\s+/).at(-1)?.toLowerCase();
  if (!noun || noun === "character" || new RegExp(`\\b${noun}s?\\b`, "i").test(caption)) return caption;
  const keep = new Set(others.map((x) => x.toLowerCase()));
  const guesses = GUESS.split("|").filter((g) => !keep.has(g));
  const first = new RegExp(`\\b(?:a|an|the)\\s+(?:[\\w-]+\\s+){0,3}?(?:${guesses.join("|")})(s?)\\b`, "i");
  if (!first.test(caption)) return caption;
  const out = caption.replace(first, (m, s: string) => {
    const said = s ? `the ${noun}s` : full;
    return /^[A-Z]/.test(m) ? said.charAt(0).toUpperCase() + said.slice(1) : said;
  });
  return out.replace(new RegExp(`\\b(${guesses.join("|")})(s?)\\b`, "gi"), (_m, _g, s: string) => noun + s);
}

// The keys' captions with the main character named; left as said when another character stands on
// the stage (the creature in a caption may be them).
export function namedCaptions(p: Pick<Project, "character" | "sceneAssets" | "keyframes">) {
  const caps = p.keyframes?.captions ?? [];
  const assets = p.sceneAssets ?? [];
  if (assets.some((a) => a.kind === "character" && a.at)) return caps;
  return caps.map((x) => (x ? nameInCaption(x, p.character.prompt ?? "", assets.map((a) => a.name)) : x));
}

const sentence = (x: string) => x.trim().replace(/[.\s]+$/, "");
const VIEWS = ["front", "three-quarter", "side", "back"];
const ROW_NAMES = [["Sheet"], ["Top Row", "Bottom Row"], ["Top Row", "Middle Row", "Bottom Row"]];

// The sheet said cell by cell. The model card's trained form is two labelled parts, "Reference
// sheet:" (the cells) then "Generated video:" (what happens); each cell is named by its place and
// kind as in the card's gallery ("**Top Row Left (Character):** ..."), so the model knows which
// cell is which and the video can refer to them. items: what the character wears or carries, in
// the order the sheet shows them.
export function sheetPrompt(rows: SheetRows, who: SheetElement, props: SheetElement[], place?: string, items: string[] = []) {
  const lines = ["Reference sheet:"];
  const desc = who.description ? `, ${sentence(who.description)}` : "";
  const names = ROW_NAMES[rows.length - 1] ?? ROW_NAMES[2];
  for (const [r, row] of rows.entries()) {
    const at = names[r];
    const faces = row.cells.filter((c) => c === "face").length;
    if (faces) lines.push(`**${at} Left (Character):** ${faces > 1 ? `${faces} close-ups of the face` : "A close-up of the face"} of ${who.name}${faces > 1 ? ", from the front, three-quarter and side" : ""}${desc}.`);
    const shownItems = row.cells.filter((c) => c.startsWith("item")).map((c) => items[Number(c.slice(4)) - 1]).filter(Boolean);
    if (shownItems.length) lines.push(`**${at} Right (Wardrobe and Props):** ${who.name}'s ${shownItems.join(" and ")}, each on its own.`);
    if (row.cells.some((c) => VIEWS.includes(c))) lines.push(`**${at} (Character Turnaround):** ${who.name}, full body, seen from the front, three-quarter, side and back, the same look in every view${desc}.`);
    const shown = new Set(row.cells.filter((c) => c.startsWith("prop")).map((c) => Number(c.slice(4, c.indexOf(":"))) - 1));
    [...shown].forEach((i) => {
      const p = props[i];
      if (!p) return;
      lines.push(`**${at} Right (${p.kind === "character" ? "Character" : "Object"}):** ${p.name}${p.description ? `, ${sentence(p.description)}` : ""}, seen from several angles.`);
    });
    if (row.cells.includes("place")) lines.push(`**${at} (Setting):** ${place ? sentence(place) : "the place"}.`);
  }
  return lines.join("\n");
}

// A character take: only the first key guides it (frame 0, LTX-2.5's own image guide); the last key
// and any middle ones come out, and the sheet carries who they are for the rest (05_submit proof v3:
// the sheet alone kept the right character with no pop-ins).
export function firstKeyOnly(g: Graph) {
  for (const n of Object.keys(g)) if (["2", "4", "6", "32"].includes(n) || Number(n) >= 200 && Number(n) < 300) delete g[n];
  g["34"].inputs.video_latent = ["31", 2];
  for (const n of ["41", "51"]) g[n].inputs = { ...g[n].inputs, positive: ["31", 0], negative: ["31", 1] };
}

// The sheet alone, without keyframes (Lightricks' own Ingredients graph): the keyframe guides come
// out and the sampler, the audio-video latent and the crop read the sheet's guide directly.
export function sheetOnly(g: Graph) {
  for (const n of ["1", "2", "3", "4", "5", "6", "31", "32"]) delete g[n];
  for (const n of Object.keys(g)) if (Number(n) >= 200 && Number(n) < 300) delete g[n];
  g["34"].inputs.video_latent = ["305", 2];
  for (const n of ["41", "51"]) g[n].inputs = { ...g[n].inputs, positive: ["305", 0], negative: ["305", 1] };
}

export const withSheet = (sheet: string, video: string) => `${sheet}\n\nGenerated video: ${video}`;
