import { open } from "node:fs/promises";

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

// A square-ish box around the strokes with room for the new thing, at least 384 px, inside the image.
export function cropBox(strokes: Box, image: { width: number; height: number }): Box {
  const side = Math.max(384, Math.max(strokes.width, strokes.height) * 1.8);
  const width = Math.round(Math.min(image.width, side));
  const height = Math.round(Math.min(image.height, side));
  const cx = strokes.x + strokes.width / 2;
  const cy = strokes.y + strokes.height / 2;
  const x = Math.round(Math.min(Math.max(0, cx - width / 2), image.width - width));
  const y = Math.round(Math.min(Math.max(0, cy - height / 2), image.height - height));
  return { x, y, width, height };
}
