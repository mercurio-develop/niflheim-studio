"""The Ingredients reference sheet for an LTX-2.5 take: one 768x448 picture, no text.

Laid out like Lightricks' own Ingredients sheets: rows of cells that fill the whole picture,
thin black gutters between them, characters and props on a light studio grey.

  top row      the character: a face close-up, then front, three-quarter, side and back
  bottom row   up to two props or cast members, each from up to three angles, then the place
               (the set painting) filling the rest of the row

Both rows span the full width (a cell's width follows its picture's shape); the character gets
55% of the height, so nothing is left empty. Bigger cells carry over more faithfully, so cutouts
are cropped tight to what they show.

Run: python make_sheet.py '{"out": "sheet.png", "views": [front, threequarter, side, back],
                            "props": [[view, view], [view]], "set": painting}'
Prints the rows it drew, top to bottom, as JSON: [{"kind": ..., "cells": [label, ...]}].
"""

import json
import sys

from PIL import Image

W, H = 768, 448
GUTTER = 4
GREY = (196, 196, 196)
VIEW_LABELS = ["front", "three-quarter", "side", "back"]
CHARACTER_SHARE = 0.55  # of the sheet's height
SET_MIN = 0.4  # of the bottom row's width


def cutout(path):
    """A picture cropped to what it shows: a cutout to its opaque pixels, laid on studio grey."""
    im = Image.open(path).convert("RGBA")
    box = im.getchannel("A").getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    grey = Image.new("RGBA", im.size, GREY + (255,))
    return Image.alpha_composite(grey, im).convert("RGB")


def face(path):
    """The head from a front cutout: the top band of the figure, narrowed to the opaque columns
    there (so T-pose arms are left out), with a little room around it."""
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A")
    x0, y0, x1, y1 = a.getbbox() or (0, 0, im.width, im.height)
    band = round((y1 - y0) * 0.16)
    hx0, _, hx1, _ = a.crop((x0, y0, x1, y0 + band)).getbbox() or (0, 0, x1 - x0, band)
    cx, side = x0 + (hx0 + hx1) / 2, max(hx1 - hx0, band) * 1.35
    box = (round(cx - side / 2), max(0, y0 - round(side * 0.08)), round(cx + side / 2), y0 + round(side * 1.15))
    crop = im.crop(box)
    grey = Image.new("RGBA", crop.size, GREY + (255,))
    return Image.alpha_composite(grey, crop).convert("RGB")


def contain(im, w, h, bg):
    s = min(w / im.width, h / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    cell = Image.new("RGB", (w, h), bg)
    cell.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return cell


def cover(im, w, h):
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def main():
    spec = json.loads(sys.argv[1])
    rows = []  # each: kind, cells of (label, image, aspect, fill)

    views = [(VIEW_LABELS[i], v) for i, v in enumerate(spec.get("views", [])) if v]
    if views:
        cells = [("face", face(views[0][1]), 0.8, False)]
        for label, v in views:
            im = cutout(v)
            cells.append((label, im, im.width / im.height, False))
        rows.append(("character", cells))

    # The bottom row: each prop or cast member from up to three angles at its own width (a cell is
    # never narrower than 0.6 of its height), the place filling the rest, at least 40% of the width.
    bottom_h = H - GUTTER * (len(rows) + 2) - round((H - GUTTER * 3) * CHARACTER_SHARE) if rows else H - 2 * GUTTER
    cells = []
    for i, p in enumerate([[v for v in p if v][:3] for p in spec.get("props", [])][:2]):
        for j, v in enumerate(p):
            im = cutout(v)
            cells.append((f"prop{i + 1}:{j + 1}", im, max(0.6, im.width / im.height), False))
    room = W * (1 - SET_MIN) if spec.get("set") else W
    widths = [a * bottom_h for _, _, a, _ in cells]
    squeeze = min(1, (room - GUTTER * len(cells)) / sum(widths)) if widths else 1
    cells = [(label, im, a * squeeze, fill) for label, im, a, fill in cells]
    if spec.get("set"):
        rest = W - GUTTER * (len(cells) + 2) - sum(a * bottom_h for _, _, a, _ in cells)
        cells.append(("place", Image.open(spec["set"]).convert("RGB"), rest / bottom_h, True))
    if cells:
        rows.append(("props+set" if len(cells) > 1 else "set", cells))

    sheet = Image.new("RGB", (W, H), (0, 0, 0))
    y = GUTTER
    for r, (kind, cells) in enumerate(rows):
        h = round((H - GUTTER * 3) * CHARACTER_SHARE) if kind == "character" and len(rows) > 1 else H - GUTTER - y
        inner = W - GUTTER * (len(cells) + 1)
        total = sum(a for _, _, a, _ in cells)
        x = GUTTER
        for i, (_, im, a, fill) in enumerate(cells):
            w = round(inner * a / total) if i < len(cells) - 1 else W - GUTTER - x
            sheet.paste(cover(im, w, h) if fill else contain(im, w, h, GREY), (x, y))
            x += w + GUTTER
        y += h + GUTTER

    sheet.save(spec["out"])
    print(json.dumps([{"kind": kind, "cells": [label for label, _, _, _ in cells]} for kind, cells in rows]))


if __name__ == "__main__":
    main()
