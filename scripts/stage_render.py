"""Render a set stage GLB from the fill's orbit cameras, for checking its quality by eye.

  blender -b -P scripts/stage_render.py -- --glb stage.glb --cam cam.json --out sheet.png [--guide]

Cameras are set_fill.py's: the painting's own view, then a few poses inside the viewer's orbit.
The default look is the texture, unlit (as the app shows it); --guide shades the geometry with no
texture, so stretched faces and a bumpy floor show at once. Writes one contact sheet (2 x 3).
"""

import json
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix

argv = sys.argv[sys.argv.index("--") + 1 :]
GUIDE = "--guide" in argv
argv = [a for a in argv if a != "--guide"]
args = dict(zip(argv[::2], argv[1::2]))
cam = json.load(open(args["--cam"]))
# (yaw, pitch, distance x middle, fov x) as in set_fill.py; the first is the painting.
POSES = [(0, 0, 1, 1), (0.25, 0.0, 1.0, 1.0), (-0.25, 0.0, 1.0, 1.0), (0.0, 0.12, 1.0, 1.0), (0.3, 0.1, 0.8, 1.0), (0.0, 0.0, 1.15, 1.15)]


def rot(axis, a):
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def pose(p):
    """set_fill.pose: an orbit about the levelled world's up, around the point middle ahead."""
    yaw, pitch, dist, _ = p
    start = np.array(cam.get("c2w", np.eye(4).tolist()))
    fwd = -start[:3, 2]
    heading = math.atan2(-fwd[0], -fwd[2])
    target = start[:3, 3] + fwd * cam["middle"]
    R = rot("y", heading + yaw) @ rot("x", -pitch) @ rot("y", -heading) @ start[:3, :3]
    c2w = np.eye(4)
    c2w[:3, :3] = R
    c2w[:3, 3] = target + R @ np.array([0, 0, cam["middle"] * dist])
    return c2w


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args["--glb"])
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO" if GUIDE else "FLAT"
shading.color_type = "SINGLE" if GUIDE else "TEXTURE"
shading.single_color = (0.75, 0.74, 0.72)
shading.show_backface_culling = False
scene.render.resolution_x, scene.render.resolution_y = cam["W"] // 2, cam["H"] // 2
scene.world = bpy.data.worlds.new("w")
scene.world.color = (0.05, 0.05, 0.05)

c = bpy.data.cameras.new("c")
c.sensor_fit = "HORIZONTAL"
c.sensor_width = 36
c.clip_start, c.clip_end = 0.05, cam["far"] * 3
o = bpy.data.objects.new("c", c)
scene.collection.objects.link(o)
scene.camera = o
# glTF is y up; Blender's importer turns it z up: x stays, y -> z, z -> -y.
GL2B = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))

tiles = []
tmp = tempfile.mkdtemp()
for i, p in enumerate(POSES):
    c.lens = cam["fx"] / p[3] * 36 / cam["W"]
    o.matrix_world = GL2B @ Matrix(pose(p).tolist())
    scene.render.filepath = os.path.join(tmp, f"{i}.png")
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(scene.render.filepath)
    w, h = img.size
    tiles.append(np.array(img.pixels[:]).reshape(h, w, 4))

# Blender's pixels run bottom row first, so the first pose ends up top left.
rows = [np.concatenate(tiles[r * 3 : r * 3 + 3], 1) for r in (1, 0)]
sheet = np.concatenate(rows, 0)
out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
out.pixels = sheet.ravel().tolist()
out.filepath_raw = args["--out"]
out.file_format = "PNG"
out.save()
print(json.dumps(dict(out=args["--out"], tiles=len(tiles))))
