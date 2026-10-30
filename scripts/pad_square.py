"""Pad a turnaround view to a square on its own background colour. Hunyuan3D-2 MV wants square
inputs; the painted views are 7:9. --flip writes the horizontal mirror (the missing right view
from the left side).

Usage: pad_square.py IN OUT [--flip]
"""
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
if "--flip" in sys.argv[3:]:
    im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
w, h = im.size
s = max(w, h)
px = im.load()
border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
n = len(border)
bg = tuple(sorted(c[i] for c in border)[n // 2] for i in range(3))
out = Image.new("RGB", (s, s), bg)
out.paste(im, ((s - w) // 2, (s - h) // 2))
out.save(dst)
