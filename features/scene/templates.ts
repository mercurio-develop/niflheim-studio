// One-click places for Scene, paired by id with CHARACTER_TEMPLATES. Same style as the character.
// Each prompt names the ground in front, what stands along the sides, then what fades far away.
// No people or creatures: the composer strips those, and the stage must stay empty to stand on.

export const SCENE_TEMPLATES = [
  {
    id: "troll",
    label: "Dark forest",
    style: "painterly",
    prompt:
      "a dark pine forest at dusk: a dirt path with roots, ferns and a half-buried truck tire in front, huge mossy trunks on both sides, the path fading into mist far away",
  },
  {
    id: "dragon",
    label: "Sunny meadow",
    style: "kids3d",
    prompt:
      "a sunny meadow: round pebbles and clover on the ground in front, candy-coloured mushrooms and soft green hills along the sides, a bright clear sky far away",
  },
  {
    id: "keeper",
    label: "Night courtyard",
    style: "cinematic",
    prompt:
      "a misty stone courtyard at night: wet flagstones and a standing lantern in front, colonnades and hanging lanterns along the sides, an arched gateway glowing far away in the fog",
  },
  {
    id: "knight",
    label: "Mossy ruins",
    style: "painterly",
    prompt:
      "a ruined mossy courtyard at dusk: cracked flagstones with moss in front, broken clockwork columns and brass arches along the sides, a collapsed gateway far away in the fog",
  },
] as const;
