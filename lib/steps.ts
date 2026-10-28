// The wizard, in order. Home and the step rail both read this.
// Style and VFX stay off until they work (decision 0010); Shots and Reel keep the shot/export routes.
export const STEPS = [
  { slug: "character", n: "01", title: "Character", line: "Concept art from a prompt. Swap any part.", art: "/steps/01-character.webp", body: "Describe someone and get four concepts. Pick one, point at a part (the coat, the boots) and say what it becomes. Only that part changes.", ready: true },
  { slug: "turnaround", n: "02", title: "Turnaround", line: "Front, three-quarter, side and back.", art: "/steps/02-turnaround.webp", body: "The same character from the front, three-quarter, side and back, so every later shot keeps them recognisable.", ready: true },
  { slug: "scene", n: "03", title: "Scene", line: "One painting becomes a 3D stage. Stand them in it.", art: "/steps/03-scene.webp", body: "Paint a place or drop in a painting. It becomes a 3D stage; stand the character in it and choose a camera move aimed at them: push in, orbit, crane, track.", ready: true },
  { slug: "shot", n: "04", title: "Shots", line: "Keyframes per shot, then LTX-2.5 takes.", art: "/steps/07-shot.webp", body: "For each shot: keyframes of the camera move, then say what the character does and LTX-2.5 shoots takes on your own GPU. Keep the best one.", ready: true },
  { slug: "export", n: "05", title: "Reel", line: "Autopilot or by hand: one MP4 reel.", art: "/steps/08-export.webp", body: "Autopilot plans the shots and makes the reel in one press, or order the picked takes yourself, choose the cuts and export one MP4.", ready: true },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];
