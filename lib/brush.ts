import { open, readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

// Brush edits work like a detailer: crop a box around the strokes, let Qwen edit the crop at
// full resolution, paste it back with feathered edges. Nothing outside the box changes.

export type Box = { x: number; y: number; width: number; height: number };

// Width and height from a PNG's IHDR chunk (bytes 16-23), so we need no image library.
export async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(24);
    await fh.read(buf, 0, 24, 0);
    if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error("not a PNG");
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    await fh.close();
  }
}

// The box around a mask's white pixels (first channel over half), or null when nothing is white.
// Reads the 8-bit PNGs ComfyUI and the browser save (grey, RGB or RGBA), so we need no image library.
export async function maskBox(file: string): Promise<Box | null> {
  const png = await readFile(file);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const bpp = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[png[25]];
  if (png[24] !== 8 || !bpp || png[28] !== 0) throw new Error("A mask must be an 8-bit, non-interlaced PNG.");
  const idat: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    if (png.toString("ascii", at + 4, at + 8) === "IDAT") idat.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp;
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      // Undo the row filter (PNG spec: None, Sub, Up, Average, Paeth).
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      cur[i] = (line[i] + add) & 255;
    }
    for (let x = 0; x < width; x++)
      if (cur[x * bpp] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    [prev, cur] = [cur, prev];
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// For 01_remove (the selection is a flat grey shape by then). Naming the object and forbidding
// clothing matters: "fill with the body and clothing" made Qwen paint a new shirt where one was removed.
const HEADWEAR = /^(hat|helmet|hood|crown|cap|helm)s?$/i;

export const removePrompt = (what: string) => {
  const noun = what.trim().split(/\s+/).at(-1) ?? "";
  if (HEADWEAR.test(noun)) {
    return `Remove the flat grey shape completely; it was the ${what}. Paint the character's own hair and head as if the ${what} was never worn: no visor, brim, straps or visor slit. Fill with hair, skin or the plain background, in the same art style. Do not paint any ${noun} or other headwear in its place.`;
  }
  return `Remove the flat grey shape completely${what ? `; it was the ${what}` : ""}. Fill the space with what is underneath it on this character, continuing the surrounding skin, fur, body or material, and the plain background, in the same art style. Do not paint ${what ? `any ${what}, ` : ""}clothing or any new object in its place.`;
};

// A square-ish box around the strokes with room for the new thing (at least `min` px), inside the image.
// grow/min: more room for Add, so the new thing is drawn whole inside the crop.
export function cropBox(strokes: Box, image: { width: number; height: number }, { grow = 1.8, min = 384 } = {}): Box {
  const side = Math.max(min, Math.max(strokes.width, strokes.height) * grow);
  const width = Math.round(Math.min(image.width, side));
  const height = Math.round(Math.min(image.height, side));
  const cx = strokes.x + strokes.width / 2;
  const cy = strokes.y + strokes.height / 2;
  const x = Math.round(Math.min(Math.max(0, cx - width / 2), image.width - width));
  const y = Math.round(Math.min(Math.max(0, cy - height / 2), image.height - height));
  return { x, y, width, height };
}
