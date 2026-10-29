"""The Ingredients reference sheet for an LTX-2.5 take: one 768x448 picture, no text.

Laid out like Lightricks' own Ingredients sheets: rows of cells that fill the whole picture,
thin black gutters between them, characters and props on a light studio grey.

  top row      close-ups of the face (front, three-quarter, side) and up to three things the
               character wears or carries, each on its own
  middle row   the character's body from the front, three-quarter, side and back, then up to two
               props or cast members from up to three angles each
  bottom row   the place: a wide strip of the set painting

Every row spans the full width (a cell's width follows its picture's shape) and has a fixed
share of the height, so nothing is left empty. With no faces given, the face is cropped from the
front view and leads the middle row. Bigger cells carry over more faithfully, so cutouts are
cropped tight to what they show.

Run: python make_sheet.py '{"out": "sheet.png", "faces": [front, threequarter, side],
                            "items": [bag, coat], "views": [front, threequarter, side, back],
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
SHARES = {"faces+items": 0.3, "bodies": 0.45, "set": 0.25}  # of the sheet's height, over the rows drawn


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


def picture(path):
    """A face or an item: a cutout on studio grey, or a picture as it is (it has its own grey)."""
    im = Image.open(path)
    return cutout(path) if im.mode in ("RGBA", "LA") else im.convert("RGB")


def main():
    spec = json.loads(sys.argv[1])
    rows = []  # each: kind, cells of (label, image, aspect, fill)
    shape = lambda im, least=0.6: max(least, im.width / im.height)  # noqa: E731

    views = [(VIEW_LABELS[i], v) for i, v in enumerate(spec.get("views", [])) if v]
    faces = [("face", picture(f)) for f in spec.get("faces", []) if f]
    items = [(f"item{i + 1}", picture(f)) for i, f in enumerate(spec.get("items", [])[:3]) if f]
    if not faces and views:
        faces = [("face", face(views[0][1]))]

    # Faces and the things they wear or carry up top when there is more than one face or any item,
    # like the reference sheets; a single cropped face otherwise leads the bodies' row.
    top = [(label, im, shape(im, 0.75), False) for label, im in faces + items]
    bodies = [(label, im, shape(im), False) for label, im in ((label, cutout(v)) for label, v in views)]
    for i, p in enumerate([[v for v in p if v][:3] for p in spec.get("props", [])][:2]):
        for j, v in enumerate(p):
            im = cutout(v)
            bodies.append((f"prop{i + 1}:{j + 1}", im, shape(im), False))
    if len(top) > 1:
        rows.append(("faces+items", top))
    else:
        bodies = top + bodies
    if bodies:
        rows.append(("bodies", bodies))
    if spec.get("set"):
        rows.append(("set", [("place", Image.open(spec["set"]).convert("RGB"), 1, True)]))

    share = [SHARES[kind] for kind, _ in rows]
    inner_h = H - GUTTER * (len(rows) + 1)
    sheet = Image.new("RGB", (W, H), (0, 0, 0))
    y = GUTTER
    for r, ((kind, cells), s) in enumerate(zip(rows, share)):
        h = round(inner_h * s / sum(share)) if r < len(rows) - 1 else H - GUTTER - y
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
