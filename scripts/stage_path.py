"""Render a filled set stage along a camera path: one frame per pose, for the shot. The stage is
set_fill.py's point cloud (points.npz, levelled metres) splatted through a z-buffer (set_fill.render),
so what the camera would see past the stage's edges shows as holes.

Writes, in OUT: depth.mp4 (inverse depth, near = white, one range for every frame so it does not
flicker; holes black, the guide LTX follows), preview.mp4 (the stage's colour, holes black) and
render.json {frames, fps, width, height, holes: share of each frame no point covers}.

Usage: stage_path.py --dir FILL_DIR --poses POSES.json --fov DEG --out OUT [--width 832 --height 480]
POSES.json: a list of 4x4 camera-to-world matrices (OpenGL: looks down -z, y up), row-major.
Sizes are rounded to multiples of 32, as LTX wants."""
import argparse
import json
import math
import os
import subprocess
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from set_fill import load_state, render  # noqa: E402

FPS = 24


def encode(frames_dir, out):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", os.path.join(frames_dir, "%04d.png"),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", out], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--poses", required=True)
    ap.add_argument("--fov", type=float, required=True)  # vertical, degrees
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=832)
    ap.add_argument("--height", type=int, default=480)
    a = ap.parse_args()
    W, H = (a.width // 32) * 32, (a.height // 32) * 32
    fy = (H / 2) / math.tan(math.radians(a.fov) / 2)
    K = dict(W=W, H=H, fx=fy, fy=fy, cx=W / 2, cy=H / 2)
    _, xyz, rgb = load_state(a.dir)
    poses = [np.array(p, dtype=np.float64) for p in json.load(open(a.poses))]
    dd, dp = os.path.join(a.out, "depth"), os.path.join(a.out, "preview")
    os.makedirs(dd, exist_ok=True)
    os.makedirs(dp, exist_ok=True)

    holes, rng = [], None
    for i, c2w in enumerate(poses):
        img, z, hole = render(xyz, rgb, K, c2w)
        holes.append(float(hole.mean()))
        inv = np.where(np.isfinite(z) & (z > 0), 1 / np.maximum(z, 1e-3), 0)
        if rng is None:  # one range, from the first frame, for the whole move
            seen = inv[inv > 0]
            rng = (np.percentile(seen, 2), np.percentile(seen, 99.5)) if seen.size else (0.0, 1.0)
        d = np.clip((inv - rng[0]) / max(rng[1] - rng[0], 1e-6), 0, 1)
        d[~np.isfinite(z)] = 0
        cv2.imwrite(os.path.join(dd, f"{i:04d}.png"), (d * 255).astype(np.uint8))
        prev = img.copy()
        prev[hole] = 0
        cv2.imwrite(os.path.join(dp, f"{i:04d}.png"), cv2.cvtColor(prev, cv2.COLOR_RGB2BGR))

    encode(dd, os.path.join(a.out, "depth.mp4"))
    encode(dp, os.path.join(a.out, "preview.mp4"))
    info = dict(frames=len(poses), fps=FPS, width=W, height=H, holes=[round(h, 4) for h in holes])
    json.dump(info, open(os.path.join(a.out, "render.json"), "w"))
    print(json.dumps({**info, "holes": {"max": max(holes), "mean": sum(holes) / len(holes)}}))


if __name__ == "__main__":
    main()
