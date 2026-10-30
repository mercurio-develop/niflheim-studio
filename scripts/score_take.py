"""Score an LTX take for the two failures we fight (04_shot ACCEPT proof 5):
- camera travel: summed median optical flow (px at 384x224). Near 0 = a frozen take; the 1.2 m
  push-in on 440d836dcb travels about 10.
- pop-in: in an 8x8 grid, each step's change against that block's median change; the worst spike
  and how many frames go over 6 (things appearing, melting, black streaks). A cut shows as a large
  max/mean of the whole-frame change.
Writes a contact sheet (frames 0, 1/5 ... last) when asked.

Usage: score_take.py TAKE.mp4 [--sheet SHEET.png]
Prints JSON: {frames, camera_travel_px, local_motion, popin_max, popin_frames, change_max_over_mean}."""
import argparse
import json

import cv2
import numpy as np
from PIL import Image

W, H = 384, 224


def frames(path):
    cap, out = cv2.VideoCapture(path), []
    while True:
        ok, f = cap.read()
        if not ok:
            return out
        out.append(cv2.resize(f, (W, H)))


def score(fs):
    g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in fs]
    cam, local = [], []
    for a, b in zip(g, g[1:]):
        m = np.linalg.norm(cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 3, 15, 3, 5, 1.2, 0), axis=2)
        cam.append(np.median(m))
        local.append(np.percentile(m, 90) - np.median(m))
    gf = [x.astype(np.float32) for x in g]
    diffs = [np.abs(b - a) for a, b in zip(gf, gf[1:])]
    d = np.array([x.mean() for x in diffs])
    # Pop-in: what the motion does not explain. Each frame is predicted from the one before by
    # warping it along the backward flow; a moving character or camera is explained, a thing that
    # appears or melts is not. (Plain frame differences counted a fox trotting into a calm patch.)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    resid = []
    for a, b, fa, fb in zip(g, g[1:], gf, gf[1:]):
        back = cv2.calcOpticalFlowFarneback(b, a, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        pred = cv2.remap(fa, xs + back[..., 0], ys + back[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        resid.append(np.abs(fb - pred))
    blocks = np.array([[x[y:y + H // 8, c:c + W // 8].mean() for y in range(0, H, H // 8) for c in range(0, W, W // 8)] for x in resid])
    spikes = (blocks / (np.median(blocks, axis=0) + 0.5)).max(axis=1)
    return dict(frames=len(fs), camera_travel_px=round(float(np.sum(cam)), 1), local_motion=round(float(np.mean(local)), 3),
                popin_max=round(float(spikes.max()), 1), popin_frames=int((spikes > 6).sum()), change_max_over_mean=round(float(d.max() / (d.mean() + 1e-6)), 1))


def sheet(fs, out, n=6):
    picks = [round(i * (len(fs) - 1) / (n - 1)) for i in range(n)]
    tiles = [Image.fromarray(cv2.cvtColor(fs[i], cv2.COLOR_BGR2RGB)) for i in picks]
    img = Image.new("RGB", (W * n + 4 * (n - 1), H), (20, 20, 20))
    for i, t in enumerate(tiles):
        img.paste(t, (i * (W + 4), 0))
    img.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("take")
    ap.add_argument("--sheet")
    a = ap.parse_args()
    fs = frames(a.take)
    if len(fs) < 2:
        raise SystemExit(f"{a.take}: no frames")
    if a.sheet:
        sheet(fs, a.sheet)
    print(json.dumps(score(fs)))


if __name__ == "__main__":
    main()
