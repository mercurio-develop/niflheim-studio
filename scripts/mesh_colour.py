"""Colour the turnaround's 3D model from its views. Hunyuan3D-2 MV gives shape only; the front,
side and back views (the right is the side mirrored) are projected onto the mesh, orthographic and
depth-tested, and blended by how squarely each vertex faces each view. Vertices no view sees (under
the arms, the soles) take their neighbours' colour. Which way the model faces is found by trying
the four camera layouts and keeping the one where the views agree most.

The three-quarter view, when given, fills the diagonals the straight views miss (inside the arms,
coat folds); it and its mirror are placed on whichever diagonal agrees with the front and side.

Usage: mesh_colour.py IN.glb OUT.glb FRONT.png SIDE.png BACK.png [THREEQUARTER.png|-] [PREVIEW.png]
Prints JSON: {"glb", "seen" (share of vertices a view saw), "front", "side", "error"}."""
import json
import sys

import numpy as np
import trimesh
from PIL import Image

GRID = 512  # depth-buffer resolution (long side)
UP = np.array([0.0, 1.0, 0.0])


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255


def figure(im):
    """A view with its foreground mask (anything off the plain background) and the figure's box."""
    border = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
    fg = np.abs(im - np.median(border, axis=0)).max(axis=2) > 0.06
    ys, xs = np.nonzero(fg)
    return im, fg, (xs.min(), ys.min(), xs.max(), ys.max())


def cameras(sf, ss, tq=0):
    """The views' camera directions. sf: the front camera on +z (1) or -z (-1); ss: the side camera
    on +x (1) or -x (-1). Back and right sit opposite them. tq: the three-quarter camera between the
    front and the side (1) or the front and the right (-1); its mirror takes the other diagonal."""
    f, sd = np.array([0, 0, sf], float), np.array([ss, 0, 0], float)
    cams = {"front": f, "back": -f, "side": sd, "right": -sd}
    if tq:
        cams["threequarter"] = (f + tq * sd) / np.sqrt(2)
        cams["threequarter-mirror"] = (f - tq * sd) / np.sqrt(2)
    return cams


def project(v, cam):
    """Image-plane coords (u right, w up) and depth (bigger = nearer) seen from `cam`."""
    return v @ np.cross(UP, cam), v[:, 1], v @ cam


def sample(v, n, view, cam):
    """Each vertex's colour in one view and how much to trust it (0 when hidden or off the figure)."""
    im, fg, (x0, y0, x1, y1) = view
    h, w = fg.shape
    u, up, d = project(v, cam)
    # The mesh's projected box onto the figure's box.
    px = x0 + (u - u.min()) / (np.ptp(u) or 1) * (x1 - x0)
    py = y1 - (up - up.min()) / (np.ptp(up) or 1) * (y1 - y0)
    # A coarse depth buffer, dilated a pixel so far vertices showing between near ones stay hidden.
    s = GRID / max(h, w)
    gx = np.clip((px * s).astype(int), 0, int(w * s) - 1)
    gy = np.clip((py * s).astype(int), 0, int(h * s) - 1)
    z = np.full((int(h * s), int(w * s)), -np.inf)
    np.maximum.at(z, (gy, gx), d)
    near = z.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            near = np.maximum(near, np.roll(np.roll(z, dy, 0), dx, 1))
    seen = d >= near[gy, gx] - 0.02 * np.ptp(v[:, 1])
    ix = np.clip(np.round(px).astype(int), 0, w - 1)
    iy = np.clip(np.round(py).astype(int), 0, h - 1)
    facing = np.clip(n @ cam, 0, 1) ** 2
    return im[iy, ix], facing * seen * fg[iy, ix]


def disagreement(per):
    """Mean colour difference where a front/back view and a side view both see a vertex: lowest
    when the cameras are where they really were."""
    errs = []
    pairs = [(a, b) for a in ("front", "back") for b in ("side", "right")]
    pairs += [(a, b) for a in ("threequarter", "threequarter-mirror") for b in ("front", "side", "right") if a in per]
    for a, b in pairs:
            (ca, wa), (cb, wb) = per[a], per[b]
            both = (wa > 0.05) & (wb > 0.05)
            if both.sum() > 200:
                errs.append(np.abs(ca[both] - cb[both]).mean())
    return float(np.mean(errs)) if errs else 1.0


def fill(mesh, c, known, passes=40):
    """Unseen vertices take the average of their known neighbours, spreading inwards."""
    e = mesh.edges_unique
    c, known = c.copy(), known.copy()
    for _ in range(passes):
        if known.all():
            break
        total, count = np.zeros_like(c), np.zeros(len(c))
        for a, b in ((e[:, 0], e[:, 1]), (e[:, 1], e[:, 0])):
            k = known[b]
            np.add.at(total, a[k], c[b[k]])
            np.add.at(count, a[k], 1)
        new = ~known & (count > 0)
        c[new] = total[new] / count[new, None]
        known |= new
    return c


def preview(mesh, c, sf, ss, out):
    """Front, side and back of the coloured vertices (point splats), for proofs."""
    v, tiles, H, W = mesh.vertices, [], 480, 300
    cams = cameras(sf, ss)
    for cam in (cams["front"], cams["side"], cams["back"]):
        u, up, d = project(v, cam)
        k = (H - 20) / np.ptp(up)
        px = np.clip(((u - u.min()) * k + (W - np.ptp(u) * k) / 2).astype(int), 0, W - 1)
        py = np.clip(((up.max() - up) * k + 10).astype(int), 0, H - 1)
        z = np.full((H, W), -np.inf)
        np.maximum.at(z, (py, px), d)
        top = d >= z[py, px]
        img = np.full((H, W, 3), 0.15)
        img[py[top], px[top]] = c[top]
        tiles.append(img)
    Image.fromarray((np.concatenate(tiles, 1) * 255).astype(np.uint8)).save(out)


def main():
    src, out, front, side, back = sys.argv[1:6]
    quarter = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != "-" else None
    mesh = trimesh.load(src, force="mesh")
    v, n = mesh.vertices, mesh.vertex_normals
    side_im = load(side)
    views = {"front": figure(load(front)), "back": figure(load(back)),
             "side": figure(side_im), "right": figure(side_im[:, ::-1].copy())}
    best = None
    for sf in (1, -1):
        for ss in (1, -1):
            per = {k: sample(v, n, views[k], cam) for k, cam in cameras(sf, ss).items()}
            err = disagreement(per)
            if best is None or err < best[0]:
                best = (err, sf, ss, per)
    err, sf, ss, per = best
    tq = 0
    if quarter:
        q = load(quarter)
        views["threequarter"], views["threequarter-mirror"] = figure(q), figure(q[:, ::-1].copy())
        tries = []
        for t in (1, -1):
            cams = cameras(sf, ss, t)
            extra = {k: sample(v, n, views[k], cams[k]) for k in ("threequarter", "threequarter-mirror")}
            tries.append((disagreement({**per, **extra}), t, extra))
        err, tq, extra = min(tries, key=lambda x: x[0])
        per = {**per, **extra}
    acc = sum(col * wt[:, None] for col, wt in per.values())
    weight = sum(wt for _, wt in per.values())
    known = weight > 1e-4
    c = np.zeros_like(acc)
    c[known] = acc[known] / weight[known, None]
    c = np.clip(fill(mesh, c, known), 0, 1)
    rgba = np.concatenate([c, np.ones((len(c), 1))], 1)
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=(rgba * 255).astype(np.uint8))
    mesh.export(out)
    if len(sys.argv) > 7:
        preview(mesh, c, sf, ss, sys.argv[7])
    print(json.dumps({"glb": out, "seen": round(float(known.mean()), 3), "front": sf, "side": ss, "threequarter": tq, "error": round(err, 4)}))


if __name__ == "__main__":
    main()
