// Turn Florence-2 PromptGen tags ("brown leather bag, hood up, 1girl, ...") into part chips a
// person can click and GroundingDINO can find: one chip per part, ordered head to toe.

const ORDER = [
  "hat", "helmet", "crown", "hood", "hair", "horns", "mask", "goggles", "glasses", "face", "scarf", "necklace",
  "cape", "cloak", "coat", "jacket", "armor", "armour", "robe", "dress", "shirt", "vest", "sweater", "sleeves",
  "pauldrons", "bracers", "gauntlets", "gloves", "belt", "pouch", "bag", "satchel", "backpack", "skirt", "pants",
  "shorts", "boots", "shoes", "wings", "tail",
  "sword", "dagger", "axe", "spear", "staff", "wand", "bow", "shield", "gun", "lantern", "book", "umbrella",
] as const;

const RANK = new Map<string, number>(ORDER.map((p, i) => [p, i]));
const ALIAS: Record<string, string> = { boot: "boots", glove: "gloves", gauntlet: "gauntlets", shoe: "shoes", wing: "wings", armour: "armor", trousers: "pants" };

// Other words SAM may know an object by, tried when its own name finds nothing.
const SYNONYMS: Record<string, string[]> = { bag: ["satchel", "backpack"], cape: ["cloak"], cloak: ["cape"], sword: ["blade"], hat: ["cap"], helmet: ["helm"], shield: ["buckler"], staff: ["stick", "pole"] };

// The words and confidence thresholds to try, most exact first. SAM 3.1 missed "shoulder bag" at
// 0.5 and found it at 0.3, and as "bag" (2026-10-27); each try is about half a second.
export function partSearches(name: string): [string, number][] {
  const last = name.split(" ").at(-1)!;
  const words = [...new Set([last, ...(SYNONYMS[last] ?? [])])].filter((w) => w !== name);
  return [[name, 0.5], [name, 0.3], ...words.map((w): [string, number] => [w, 0.3])];
}

// Keep the parts a version already had (a repaint rarely removes one), new names win.
export function mergeParts(next: string[], prev: string[] = [], max = 10): string[] {
  const head = (t: string) => ALIAS[t.split(" ").at(-1)!] ?? t.split(" ").at(-1)!;
  const byHead = new Map(prev.map((t) => [head(t), t]));
  for (const t of next) byHead.set(head(t), t);
  return [...byHead.entries()].sort((a, b) => (RANK.get(a[0]) ?? 99) - (RANK.get(b[0]) ?? 99)).map(([, t]) => t).slice(0, max);
}

export function partsFromTags(text: string, max = 10): string[] {
  const best = new Map<string, string>(); // head noun -> chip text
  for (const raw of text.split(",")) {
    let tag = raw.trim().toLowerCase().replace(/^holding /, "").replace(/ (up|down|on|off)$/, "");
    const words = tag.split(/\s+/);
    const head = ALIAS[words.at(-1)!] ?? words.at(-1)!;
    if (!RANK.has(head) || words.length > 3 || words.some((w) => ["on", "with", "of", "in", "and"].includes(w))) continue;
    tag = [...words.slice(0, -1), head].join(" ");
    const prev = best.get(head);
    // Prefer a little description ("brown boots") over the bare noun, but not a long phrase.
    if (!prev || (prev.split(" ").length < 2 && words.length >= 2)) best.set(head, tag);
  }
  return [...best.entries()].sort((a, b) => RANK.get(a[0])! - RANK.get(b[0])!).map(([, t]) => t).slice(0, max);
}
