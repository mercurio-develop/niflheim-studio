// The wizard, in order: three screens, Person, Place, Film. Home and the step rail both read this.
// The routes keep their slugs (character, scene, shot); Film is the shot page and the reel page
// behind it, so "export" stays a valid slug but is not a step of its own.
export const STEPS = [
  { slug: "character", n: "01", title: "Person", line: "One sentence or one photo. Pick a picture.", art: "/steps/01-character.webp", body: "Describe someone in a sentence or drop in a photo, press Generate and pick a picture. Pose, expressions and the other sides wait behind More.", ready: true },
  { slug: "scene", n: "02", title: "Place", line: "One painting becomes the stage.", art: "/steps/03-scene.webp", body: "Paint a place or drop in a painting. It becomes a 3D stage seen from the painting's own camera, with a short push in. Stand your person in it.", ready: true },
  { slug: "shot", n: "03", title: "Film", line: "One button makes two shots and plays the reel.", art: "/steps/07-shot.webp", body: "One button makes two shots and plays the reel. Framing, moments, flying the camera and the cuts wait behind More.", ready: true },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"] | "export";
