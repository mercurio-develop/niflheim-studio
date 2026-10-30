// One-click characters for home and the Character step. The troll is the contest demo
// ("The Discovery"); the cyan dragon is a kids reel. Each sets prompt and style together.

export const CHARACTER_TEMPLATES = [
  {
    id: "troll",
    label: "Forest troll",
    style: "painterly",
    prompt:
      "a hulking forest troll with mossy grey-green skin, tusked underbite, bark-like shoulders, tattered hide loincloth, twigs in a shaggy mane",
  },
  {
    id: "dragon",
    label: "Cyan dragon",
    style: "kids3d",
    prompt:
      "a tiny friendly cyan dragon, round belly, big sparkling eyes, small bat wings, smooth turquoise scales, sitting like a puppy",
  },
  {
    id: "keeper",
    label: "Lantern keeper",
    style: "cinematic",
    prompt: "a young lantern keeper in a hooded wool coat, leather satchel, tall boots",
  },
  {
    id: "knight",
    label: "Clockwork knight",
    style: "painterly",
    prompt: "a clockwork knight with moss growing through the armour",
  },
] as const;
