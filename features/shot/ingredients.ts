// The Ingredients reference sheet in a take (scripts/make_sheet.py draws it). Lightricks' own
// LTX-2.5 Ingredients graph: the IC-LoRA on the model, the sheet held on every frame as a guide
// video at frame 0, cropped out again before decoding (LTXVCropGuides crops every guide). Here it
// goes in before the keyframe guides, so the keys still set where things are and the sheet keeps
// who and what they are. On Comfy Cloud only the 2.3 file exists; Lightricks' 2.5 graph runs it
// on the 2.5 distilled model too.

type Graph = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

export const INGREDIENTS_LORA = process.env.LTX_INGREDIENTS_LORA || "ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors";
// The 2.3 file ships unscaled (its card: 1.4; Lightricks' 2.5 graph: 1.3); the 2.5 file is pre-scaled to 1.0.
export const INGREDIENTS_STRENGTH = INGREDIENTS_LORA.includes("2.5") ? 1 : 1.3;
export const SHEET_STRENGTH = 1;
export const SHEET_NODE = "300";

const FIRST_GUIDE = "31";

export function addIngredients(g: Graph, length: number) {
  g["301"] = { class_type: "LoraLoaderModelOnly", inputs: { model: ["10", 0], lora_name: INGREDIENTS_LORA, strength_model: INGREDIENTS_STRENGTH }, _meta: { title: "Ingredients IC-LoRA" } };
  g["41"].inputs.model = ["301", 0];
  g[SHEET_NODE] = { class_type: "LoadImage", inputs: { image: "sheet.png" }, _meta: { title: "Reference sheet" } };
  g["302"] = { class_type: "ImageScale", inputs: { image: [SHEET_NODE, 0], upscale_method: "lanczos", width: 768, height: 448, crop: "disabled" } };
  g["303"] = { class_type: "RepeatImageBatch", inputs: { image: ["302", 0], amount: length } };
  g["304"] = { class_type: "GetICLoRAParameters", inputs: { iclora_model: ["301", 0] } };
  g["305"] = {
    class_type: "LTXVAddGuide",
    inputs: { positive: ["22", 0], negative: ["22", 1], vae: ["11", 0], latent: ["30", 0], image: ["303", 0], frame_idx: 0, strength: SHEET_STRENGTH, iclora_parameters: ["304", 0] },
    _meta: { title: "Guide: reference sheet" },
  };
  g[FIRST_GUIDE].inputs = { ...g[FIRST_GUIDE].inputs, positive: ["305", 0], negative: ["305", 1], latent: ["305", 2] };
}

// The rows scripts/make_sheet.py drew, top to bottom.
export type SheetRows = { kind: "character" | "set" | "props+set"; cells: string[] }[];
export type SheetElement = { name: string; description?: string; kind?: "object" | "character" };

const sentence = (x: string) => x.trim().replace(/[.\s]+$/, "");

// The sheet said cell by cell, in the form of Lightricks' Ingredients examples (a "Reference Sheet
// Description" with a bold position and kind per cell, then the video), so the model knows which
// cell is which and the video can refer to them.
export function sheetPrompt(rows: SheetRows, who: SheetElement, props: SheetElement[], place?: string) {
  const lines = ["### Reference Sheet Description"];
  const desc = who.description ? `, ${sentence(who.description)}` : "";
  for (const [r, row] of rows.entries()) {
    const at = rows.length > 1 ? (r === 0 ? "Top Row" : "Bottom Row") : "Sheet";
    if (row.kind === "character") {
      lines.push(`**${at} Left (Character):** A close-up of the face of ${who.name}${desc}.`);
      lines.push(`**${at} (Character Turnaround):** ${who.name}, full body, seen from the front, three-quarter, side and back, in the same clothes${desc}.`);
      continue;
    }
    const shown = new Set(row.cells.filter((c) => c.startsWith("prop")).map((c) => Number(c.slice(4, c.indexOf(":"))) - 1));
    [...shown].forEach((i, n) => {
      const p = props[i];
      if (!p) return;
      const kind = p.kind === "character" ? "Character" : "Object";
      lines.push(`**${at} ${n === 0 ? "Left" : "Middle"} (${kind}):** ${p.name}${p.description ? `, ${sentence(p.description)}` : ""}, seen from several angles.`);
    });
    if (row.cells.includes("place")) lines.push(`**${at} ${shown.size ? "Right" : ""} (Setting):** ${place ? sentence(place) : "the place"}.`.replace("  ", " "));
  }
  return lines.join("\n");
}

export const withSheet = (sheet: string, video: string) => `${sheet}\n\n### Generated Video\n${video}`;
