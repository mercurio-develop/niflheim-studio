// The set painting is a stage plate, not a postcard: MoGe reads it as the 3D stage the character
// stands on, and LTX paints the final look later (decision 0007). So the prompt Z-Image gets is
// composed, not concatenated: the user's place (their words, people taken out), the light and
// weather they asked for (said twice, so "dark" stays dark), a fixed stage contract (empty,
// eye level, a floor to stand on, three depth layers, things of human size), and a style phrase
// written for sets. Z-Image runs at CFG 1 with no negative prompt, so "empty" is said in the
// prompt itself. Pure: the server action and the page's preview use the same function.
// Measured failures this answers (2026-10-27): a flat side-on pixel-art port with a strip of
// asphalt; a "dark forest" painted in daylight; a neon alley with a figure and readable signs.

import type { StyleId } from "@/lib/styles";

// Per style, the phrase for a set. The character's phrases ("soft brush strokes", pixels, clay)
// blur or flatten depth; here every style keeps hard, readable planes. `plate` is set where
// the style itself does not reconstruct well: the set is painted in a near style instead, and
// the page says so (the chip still styles the character, and LTX the final look).
export const SET_STYLES: Record<StyleId, { phrase: string; plate?: string }> = {
  photo: { phrase: "photorealistic location photograph, natural light, sharp detail, true perspective" },
  cinematic: { phrase: "cinematic film still of a location, anamorphic wide lens, rich colour grading, clear depth" },
  storybook: { phrase: "children's picture-book background, bright cheerful colours, rounded friendly shapes, clear solid ground" },
  kids3d: { phrase: "cute 3D animated family-film environment, bright colours, soft rounded shapes, clear solid ground" },
  painterly: { phrase: "painterly matte painting for a film, confident brushwork, clear hard-edged forms" },
  anime: { phrase: "anime background art, clean shapes, cel-shaded planes, painted sky" },
  "ukiyo-e": { phrase: "ukiyo-e woodblock landscape, bold outlines, flat colour planes with clear perspective" },
  comic: { phrase: "comic book background, heavy ink lines, solid black shadows, clear perspective" },
  watercolour: { phrase: "watercolour illustration with firm edges, clear shapes and solid ground", plate: "Watercolour's soft edges blur the depth; the set is painted with firmer edges." },
  clay: { phrase: "stylised 3D-rendered environment, handmade miniature look, clear solid shapes", plate: "Clay is painted as a stylised 3D environment, so the floor reads as ground." },
  pixel: { phrase: "crisp digital matte painting, simple clean shapes, a limited palette", plate: "Pixel art paints flat side-on views; the set is painted crisp and simple instead." },
  noir: { phrase: "black and white noir matte painting, dramatic light, deep shadows, clear forms" },
};

// Words for people and other figures. A clause that names one is left out of the place.
const PEOPLE = /\b(man|men|woman|women|girl|girls|boy|boys|lady|ladies|guy|people|person|persons|crowd|crowds|figure|figures|child|children|kid|kids|knight|knights|warrior|warriors|soldier|soldiers|hero|heroine|character|characters|elf|elves|wizard|witch|king|queen|princess|prince|someone|somebody|he|she|they|him|her|couple|family|tourists?|pedestrians?|villagers?|monk|samurai|ninja|robot|animals?|dogs?|cats?|horses?|birds?)\b/i;
// Light and weather the user asked for, and how to say them so the painter keeps them.
const MOOD: [RegExp, string][] = [
  [/\b(dark|gloomy|shadowy|dim)\b/i, "dark, dim low-key light, deep shadows"],
  [/\b(night|nighttime|midnight)\b/i, "at night, moonlight and a few practical lights"],
  [/\b(dusk|twilight|evening)\b/i, "at dusk, low warm light fading to blue"],
  [/\b(dawn|sunrise|morning)\b/i, "early morning light, low sun"],
  [/\b(sunset)\b/i, "at sunset, low golden light"],
  [/\b(rain|rainy|raining|storm|stormy)\b/i, "rain, wet reflective ground"],
  [/\b(fog|foggy|mist|misty|haze|hazy)\b/i, "mist and fog in the distance"],
  [/\b(snow|snowy|winter)\b/i, "snow on the ground"],
  [/\b(neon)\b/i, "neon light"],
];
const GROUND = /\b(floor|ground|street|streets|road|path|trail|courtyard|square|plaza|dock|docks|pier|quay|harbou?r|port|beach|shore|sand|field|meadow|clearing|bridge|deck|alley|market|hall|room|interior|corridor|cave|tunnel|garden|park|yard|platform|station|stairs|steps|terrace|rooftop|camp|village|town|city|forest|woods|jungle|desert|ruins|temple|castle|throne|arena|stage)\b/i;
const PORTRAIT = /\b(portrait|close-?up|headshot|face|selfie|bust)\b/i;

export type SetPrompt = {
  text: string; // what Z-Image gets
  place: string; // the user's place without its people
  mood: string; // the light and weather to keep ("" if none was asked for)
  dropped: string[]; // the clauses taken out because they name a person
  warnings: string[]; // for the page: portrait, no ground, a style restyled for the plate
};

// The place without its people: clauses ("a, b with c") naming a figure are dropped; if every
// clause names one, the figure words alone go and the rest is kept.
function stripPeople(user: string) {
  const clauses = user.split(/\s*(?:[,;]|\bwith\b|\bwhere\b|\band\b)\s*/i).filter(Boolean);
  const kept = clauses.filter((c) => !PEOPLE.test(c));
  const dropped = clauses.filter((c) => PEOPLE.test(c));
  if (kept.length) return { place: dropped.length ? kept.join(", ") : user.trim(), dropped };
  return { place: user.replace(new RegExp(PEOPLE.source, "gi"), "").replace(/\s{2,}/g, " ").trim(), dropped };
}

export function composeSetPrompt(user: string, style: string): SetPrompt {
  const { place, dropped } = stripPeople(user);
  const mood = MOOD.filter(([re]) => re.test(user)).map(([, say]) => say).join(", ");
  const s = SET_STYLES[style as StyleId] ?? SET_STYLES.painterly;
  const warnings: string[] = [];
  if (PORTRAIT.test(user)) warnings.push("This reads like a portrait. Describe the place itself; the character is placed in it later.");
  if (!GROUND.test(place)) warnings.push("Say what the ground is (a path, a street, a stone floor), so the character has somewhere to stand.");
  if (dropped.length) warnings.push(`Left out, since the set is painted empty: ${dropped.join("; ")}.`);
  if (s.plate) warnings.push(s.plate);
  // Worded from what Z-Image did with it (seed 7, 2026-10-27): "where a person could stand",
  // "human scale" and even "no people" painted a figure in; "film set" and "28 mm lens" turned
  // every style photographic; a list of scale cues ("a door, a lamp") was painted literally. So
  // the style leads and closes, emptiness is said in positive words, nothing names a person or
  // a camera, and the scale is "details of everyday size that belong here". "An empty stretch of
  // floor" and "plain unmarked surfaces" then left the near ground bare, so the near ground is
  // asked for richly textured and the sides framed, and only walls and signs are blank.
  const text = [
    `${s.phrase}: ${place}${mood ? `, ${mood}` : ""}.`,
    "A wide establishing view at eye level, looking along the ground deep into the distance.",
    "Clear, continuous, walkable ground fills the lower third, richly textured close by (stones, cracks, puddles, plants, whatever belongs here) and opening into a clear stretch in the middle distance.",
    "Layered depth: something solid frames the near sides close to the eye, a middle ground of solid shapes to walk past, and a far background fading into atmospheric haze.",
    "Details of everyday size that belong to this place make its scale clear.",
    mood ? `The light and weather stay exactly as described: ${mood}.` : "",
    "The whole place is completely deserted, quiet and still; walls and signs are blank.",
    `${s.phrase}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { text, place, mood, dropped, warnings };
}

// For the fill (lib/stage-fill.ts): the place with its mood, or a generic one for an upload,
// so the holes continue the picture instead of drifting to Qwen's own blue sky.
export function fillPlace(user: string) {
  if (!user.trim()) return "the place in this picture, continuing its ground, buildings and sky";
  const p = composeSetPrompt(user, "painterly");
  return `${p.place}${p.mood ? `, ${p.mood}` : ""}`;
}
