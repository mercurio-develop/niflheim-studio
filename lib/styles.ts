// Style presets for the whole character. The phrase goes into the concept prompt.
export const STYLES = [
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
export const styleById = (id: string | undefined) => STYLES.find((s) => s.id === id) ?? STYLES[0];
