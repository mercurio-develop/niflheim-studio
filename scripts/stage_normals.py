"""Put MoGe's normal map on the stage mesh as vertex normals, in glTF space.

MoGe's normal image is in the painting camera's frame, OpenGL convention (+x right, +y up, +z
toward the viewer), which is the frame set_fill.py's stage vertices had before it levelled them.
Each vertex of the MoGe part ("stage<n>") reads its normal at its own uv, then turns with the
level (cam.json c2w) like the vertices did. Other parts (floor plane, sky, painted fragments) are
left as they are.

Usage: stage_normals.py FILLED.glb NORMAL.png CAM.json
Rewrites FILLED.glb. Prints JSON: {"normals": vertices written}."""
import json
import re
import sys

import numpy as np
import trimesh
from PIL import Image


def main(glb, normal, cam):
    rgb = np.asarray(Image.open(normal).convert("RGB")).astype(np.float32) / 255 * 2 - 1
    H, W = rgb.shape[:2]
    R = np.array(json.load(open(cam))["c2w"])[:3, :3]
    scene = trimesh.load(glb, force="scene")
    n_done = 0
    for name, g in scene.geometry.items():
        if not re.fullmatch(r"stage\d+", name) or not isinstance(g, trimesh.Trimesh):
            continue
        uv = np.asarray(g.visual.uv)
        x = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
        y = np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1)
        n = rgb[y, x] @ R.T
        length = np.linalg.norm(n, axis=1, keepdims=True)
        ok = length[:, 0] > 1e-6
        if not ok.all():  # a vertex on an empty pixel keeps the mesh's own normal
            n[~ok] = g.vertex_normals[~ok] if len(g.vertex_normals) == len(n) else [0, 1, 0]
            length[~ok] = np.linalg.norm(n[~ok], axis=1, keepdims=True)
        g.vertex_normals = (n / np.maximum(length, 1e-6)).astype(np.float32)
        n_done += len(n)
    if n_done:
        scene.export(glb)
    print(json.dumps({"normals": n_done}))


if __name__ == "__main__":
    main(*sys.argv[1:4])
