"""Numbers for a set stage's quality, so a change to the stage can be compared with the one before.

  python stage_metrics.py --glb stage.glb --cam cam.json

stretched: share of faces (and of their area) seen almost edge-on from the painting's camera that
           are not floor or ceiling: the ramps MoGe draws across a depth edge, which smear when
           the camera turns (a real wall is rarely seen this edge-on).
floor:     the ground plane fitted to the stage (set_fill.fit_floor): its inlier share, the spread
           of the inliers (m) and the camera's height above it (m; eye level is 1.4 to 1.9).
Prints one JSON line. Run with the ComfyUI venv.
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder out
from set_fill import fit_floor, load_mesh  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--glb", required=True)
    ap.add_argument("--cam", required=True)
    a = ap.parse_args()
    cam = json.load(open(a.cam))
    start = np.array(cam.get("c2w", np.eye(4).tolist()))
    meshes = load_mesh(a.glb)
    m = max(meshes, key=lambda g: len(g.faces))
    # Faces in the painting camera's frame, so pixel sizes are what the painting saw.
    v = (m.vertices - start[:3, 3]) @ start[:3, :3]
    f = v[m.faces]
    cross = np.cross(f[:, 1] - f[:, 0], f[:, 2] - f[:, 0])
    area = np.linalg.norm(cross, axis=1) / 2
    n = cross / np.clip(2 * area, 1e-12, None)[:, None]
    ray = f.mean(1) / np.clip(np.linalg.norm(f.mean(1), axis=1), 1e-9, None)[:, None]
    long = (np.abs((n * ray).sum(1)) < 0.12) & (np.abs(n[:, 1]) < 0.7)
    allv = np.concatenate([(g.vertices - start[:3, 3]) @ start[:3, :3] for g in meshes if len(g.vertices)])
    floor = fit_floor(allv, cam)
    print(json.dumps(dict(
        meshes=len(meshes), faces=int(sum(len(g.faces) for g in meshes)),
        stretched=round(float(long.mean()), 4), stretched_area=round(float(area[long].sum() / area.sum()), 4),
        floor=floor and dict(inliers=round(floor["inliers"], 3), spread=round(floor["spread"], 4), height=round(floor["height"], 3)),
    )))


if __name__ == "__main__":
    main()
