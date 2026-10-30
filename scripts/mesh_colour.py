"""Colour the turnaround's 3D model from its views. Hunyuan3D-2 MV gives shape only; the front,
side and back views (the right is the side mirrored) are projected onto the mesh, orthographic and
depth-tested, and blended by how squarely each vertex faces each view. Vertices no view sees (under
the arms, the soles) take their neighbours' colour. Hunyuan's model faces +z; which side the side
view was painted from is found by matching its silhouette, which is not mirror-symmetric (nose,
toes).

The three-quarter view, when given, fills the diagonals the straight views miss (inside the arms,
coat folds); it and its mirror go on whichever diagonal matches its silhouette.

Usage: mesh_colour.py IN.glb OUT.glb FRONT.png SIDE.png BACK.png [THREEQUARTER.png|-] [PREVIEW.png]
Prints JSON: {"glb", "seen" (share of vertices a view saw), "side", "threequarter", "fit"}."""
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


def cameras(ss, tq=0):
    """The views' camera directions: front on +z, back opposite. ss: the side camera on +x (1) or
    -x (-1); right sits opposite it. tq: the three-quarter camera between the front and the side
    (1) or the front and the right (-1); its mirror takes the other diagonal."""
    f, sd = np.array([0, 0, 1.0]), np.array([ss, 0, 0], float)
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


def overlap(v, view, cam, size=96):
    """How well the mesh's silhouette from `cam` matches the figure in `view` (IoU, both fitted to
    a size x size box)."""
    _, fg, (x0, y0, x1, y1) = view
    u, up, _ = project(v, cam)
    mesh = np.zeros((size, size), bool)
    mx = ((u - u.min()) / (np.ptp(u) or 1) * (size - 1)).astype(int)
    my = ((up.max() - up) / (np.ptp(up) or 1) * (size - 1)).astype(int)
    mesh[my, mx] = True
    ys, xs = np.mgrid[0:size, 0:size]
    fig = fg[(y0 + ys * (y1 - y0) / (size - 1)).astype(int), (x0 + xs * (x1 - x0) / (size - 1)).astype(int)]
    return float((mesh & fig).sum() / max((mesh | fig).sum(), 1))


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


def preview(mesh, c, ss, out):
    """Front, side and back of the coloured vertices (point splats), for proofs."""
    v, tiles, H, W = mesh.vertices, [], 480, 300
    cams = cameras(ss)
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


def trim_slab(mesh, band=0.02, share=0.25):
    """The model without the floor slab Hunyuan3D bakes under it from the views' studio floor and
    shadow: when the faces lying within the bottom 2% of the height hold more than a quarter of the
    surface, they are a plate, not the object (the troll's truck tire: 55%; a box's own bottom is
    about 17%), and they go."""
    y = mesh.vertices[:, 1]
    lo, h = y.min(), y.max() - y.min()
    flat = (mesh.vertices[mesh.faces][:, :, 1] < lo + band * h).all(axis=1)
    if h <= 0 or mesh.area_faces[flat].sum() <= share * mesh.area:
        return mesh
    mesh.update_faces(~flat)
    mesh.remove_unreferenced_vertices()
    return mesh


def main():
    src, out, front, side, back = sys.argv[1:6]
    quarter = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != "-" else None
    mesh = trim_slab(trimesh.load(src, force="mesh"))
    v, n = mesh.vertices, mesh.vertex_normals
    side_im = load(side)
    views = {"front": figure(load(front)), "back": figure(load(back)),
             "side": figure(side_im), "right": figure(side_im[:, ::-1].copy())}
    fit = {t: overlap(v, views["side"], cameras(t)["side"]) for t in (1, -1)}
    ss = max(fit, key=fit.get)
    tq = 0
    if quarter:
        q = load(quarter)
        views["threequarter"], views["threequarter-mirror"] = figure(q), figure(q[:, ::-1].copy())
        tq = max((1, -1), key=lambda t: overlap(v, views["threequarter"], cameras(ss, t)["threequarter"]))
    per = {k: sample(v, n, views[k], cam) for k, cam in cameras(ss, tq).items()}
    acc = sum(col * wt[:, None] for col, wt in per.values())
    weight = sum(wt for _, wt in per.values())
    known = weight > 1e-4
    c = np.zeros_like(acc)
    c[known] = acc[known] / weight[known, None]
    c = np.clip(fill(mesh, c, known), 0, 1)
    # glTF vertex colours are linear; the views are sRGB.
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    rgba = np.concatenate([lin, np.ones((len(c), 1))], 1)
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=(rgba * 255).astype(np.uint8))
    mesh.export(out)
    if len(sys.argv) > 7:
        preview(mesh, c, ss, sys.argv[7])
    print(json.dumps({"glb": out, "seen": round(float(known.mean()), 3), "side": ss, "threequarter": tq, "fit": {"side": round(fit[ss], 3), "flipped": round(fit[-ss], 3)}}))


if __name__ == "__main__":
    main()
