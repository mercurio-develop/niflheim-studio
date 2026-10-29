"""The Ingredients reference sheet for an LTX-2.5 take: one 768x448 picture on black, no text.

Top row: the character's front, three-quarter, side and back cutouts. Bottom row: a medium shot
(head and chest from the front cutout), up to two props or cast members, and the set painting in the
rest. The Ingredients IC-LoRA was trained at 768x448 on black sheets with one clean panel per
element; bigger panels carry over more faithfully, so the character gets the whole top row.

Run: python make_sheet.py '{"out": "sheet.png", "views": [front, threequarter, side, back],
                            "props": [a, b], "set": painting}'
Prints the panels it drew, left to right per row, as JSON.
"""

import json
import sys

from PIL import Image

W, H = 768, 448
TOP = 280
PAD = 6


def on_black(path, medium=False):
    """The picture on black: a cutout's transparent parts go black. medium keeps the head and chest
    (the top 40%, the middle half across, so T-pose arms do not shrink the face)."""
    im = Image.open(path).convert("RGBA")
    box = im.getchannel("A").getbbox() or (0, 0, im.width, im.height)
    im = im.crop(box)
    if medium:
        im = im.crop((round(im.width * 0.25), 0, round(im.width * 0.75), max(1, round(im.height * 0.4))))
    black = Image.new("RGBA", im.size, (0, 0, 0, 255))
    return Image.alpha_composite(black, im).convert("RGB")


def fit(im, w, h):
    """Scale to fit inside w x h, keeping its shape."""
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def cover(im, w, h):
    """Scale and centre-crop to fill w x h (the set painting has no black to spare)."""
    s = max(w / im.width, h / im.height)
    im = im.resize((max(w, round(im.width * s)), max(h, round(im.height * s))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def paste(sheet, im, x, y, w, h, fill=False):
    im = cover(im, w - 2 * PAD, h - 2 * PAD) if fill else fit(im, w - 2 * PAD, h - 2 * PAD)
    sheet.paste(im, (x + (w - im.width) // 2, y + (h - im.height) // 2))


def main():
    spec = json.loads(sys.argv[1])
    views = [v for v in spec["views"] if v]
    props = [p for p in spec.get("props", []) if p][:2]
    sheet = Image.new("RGB", (W, H), (0, 0, 0))
    panels = {"top": [], "bottom": []}

    cw = W // max(1, len(views))
    for i, v in enumerate(views):
        paste(sheet, on_black(v), i * cw, 0, cw, TOP)
        panels["top"].append("view")

    x, bottom = 0, H - TOP
    if views:
        paste(sheet, on_black(views[0], medium=True), x, TOP, 168, bottom)
        panels["bottom"].append("medium")
        x += 168
    for p in props:
        paste(sheet, on_black(p), x, TOP, 150, bottom)
        panels["bottom"].append("prop")
        x += 150
    if spec.get("set"):
        paste(sheet, Image.open(spec["set"]).convert("RGB"), x, TOP, W - x, bottom, fill=True)
        panels["bottom"].append("set")

    sheet.save(spec["out"])
    print(json.dumps(panels))


if __name__ == "__main__":
    main()
