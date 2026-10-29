// Style presets for the whole character. The phrase goes into the concept prompt; `medium` is what
// a concept is called in it (a photo style asks for a photograph, not concept art, or Z-Image paints).
export const STYLES = [
  { id: "photo", label: "Photoreal", phrase: "photorealistic, natural skin texture, true-to-life detail, soft natural daylight, 35mm photograph", medium: "photograph" },
  { id: "cinematic", label: "Cinematic", phrase: "cinematic film still, anamorphic look, rich colour grading, shallow depth of field, dramatic lighting", medium: "film still" },
  { id: "storybook", label: "Kids storybook", phrase: "friendly children's picture-book illustration, rounded shapes, bright cheerful colours, gentle kind expressions", medium: "illustration" },
  { id: "kids3d", label: "Kids 3D cartoon", phrase: "cute 3D animated family-film style, big expressive eyes, soft rounded shapes, bright colours, warm lighting", medium: "3D render" },
  { id: "painterly", label: "Painterly", phrase: "painterly concept art, soft brush strokes" },
  { id: "anime", label: "Anime", phrase: "anime cel shading, clean line art, vibrant flat colours" },
  { id: "ukiyo-e", label: "Ukiyo-e", phrase: "Japanese ukiyo-e woodblock print, bold outlines, flat colour blocks" },
  { id: "comic", label: "Comic ink", phrase: "western comic book art, heavy black ink, halftone shading" },
  { id: "watercolour", label: "Watercolour", phrase: "loose watercolour illustration, soft bleeding edges, paper texture" },
  { id: "clay", label: "Clay 3D", phrase: "stylised 3D clay render, soft studio lighting, handmade claymation look" },
  { id: "pixel", label: "Pixel art", phrase: "detailed 32-bit pixel art sprite, crisp pixels, limited palette" },
  { id: "noir", label: "Noir", phrase: "high-contrast black and white noir illustration, dramatic shadows" },
] as const;

export type StyleId = (typeof STYLES)[number]["id"];
export const styleById = (id: string | undefined) => STYLES.find((s) => s.id === id) ?? STYLES.find((s) => s.id === "painterly")!;
// What a concept is called in a prompt for this style: "concept art" unless the style says otherwise.
export const mediumOf = (id: string | undefined) => ("medium" in styleById(id) ? (styleById(id) as { medium: string }).medium : "concept art");
