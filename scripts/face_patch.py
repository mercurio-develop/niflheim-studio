"""Cut a face out of a keyframe and put a repainted one back (the key face pass).

crop:  python face_patch.py crop <image> <mask> <out.png>
       The face's box from SAM3's mask (white = face), widened to a square with room for the hair
       and the chin, cut out of the image. Prints {"box": [x0, y0, x1, y1]}, or {"box": null} when
       the mask is empty or the face is too small to repaint (under 24 px).
paste: python face_patch.py paste <image> <face.png> <x0,y0,x1,y1> <out.png>
       The repainted face scaled back into its box and blended in with a soft oval edge, so the
       hair and the collar meet the frame without a seam.
"""

import json
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOM = 1.9  # the square's side over the face's longer side: the hair, the ears and the chin
MIN_FACE = 24


def crop(image, mask, out):
    im = Image.open(image).convert("RGB")
    m = Image.open(mask).convert("L").resize(im.size)
    box = m.point(lambda v: 255 if v > 127 else 0).getbbox()
    if not box or max(box[2] - box[0], box[3] - box[1]) < MIN_FACE:
        print(json.dumps({"box": None}))
        return
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2 - (box[3] - box[1]) * 0.1
    side = min(max(box[2] - box[0], box[3] - box[1]) * ROOM, im.width, im.height)
    x0 = round(min(max(cx - side / 2, 0), im.width - side))
    y0 = round(min(max(cy - side / 2, 0), im.height - side))
    sq = (x0, y0, x0 + round(side), y0 + round(side))
    im.crop(sq).save(out)
    print(json.dumps({"box": list(sq)}))


def paste(image, face, box, out):
    im = Image.open(image).convert("RGB")
    x0, y0, x1, y1 = (int(v) for v in box.split(","))
    w, h = x1 - x0, y1 - y0
    patch = Image.open(face).convert("RGB").resize((w, h), Image.LANCZOS)
    edge = Image.new("L", (w, h), 0)
    inset = round(min(w, h) * 0.1)
    ImageDraw.Draw(edge).ellipse((inset, inset, w - inset, h - inset), fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(min(w, h) * 0.08))
    im.paste(patch, (x0, y0), edge)
    im.save(out)


if __name__ == "__main__":
    if sys.argv[1] == "crop":
        crop(*sys.argv[2:5])
    else:
        paste(*sys.argv[2:6])
