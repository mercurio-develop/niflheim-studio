import { z } from "zod";
import { STYLES } from "@/lib/styles";

// Inputs shared by the character actions and the home page's start, checked once, the same way.
export const Prompt = z.string().trim().min(3, "Describe your character in a few words.").max(600);
export const StyleId = z.enum(STYLES.map((s) => s.id) as [string, ...string[]]);
// 6 at 896x1152 still fits the 16 GB card next to Z-Image Turbo int8; 8 does not reliably.
export const Count = z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6)]);
export const Index = z.number().int().min(0);

export const REFERENCE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// A sketch or image to follow: a real file of a type ComfyUI's LoadImage reads, under 12 MB.
export function referenceError(image: FormDataEntryValue | null): string | null {
  if (!(image instanceof File) || image.size === 0) return "The image did not come through; try again.";
  if (!REFERENCE_TYPES[image.type] || image.size > 12_000_000) return "Use a PNG, JPG or WebP image under 12 MB.";
  return null;
}
