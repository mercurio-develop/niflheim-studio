"""Fill the holes of a MoGe set stage: render it from nearby cameras, let an inpainter paint what
is missing (in lib, via ComfyUI), lift the painted pixels back into 3D and merge them in.

World = glTF: x right, y up, the painting's camera at the origin looking down -z. Every MoGe
vertex lies on a pixel ray, so the painting's intrinsics are read off the GLB's uvs. The state
of one fill lives in a folder: cam.json, points.npz (everything known so far, as dense coloured
points), sky.glb, and one folder per probe view (render, hole mask, depth, fragment.glb).

  python set_fill.py base   --glb stage.glb --image set.png --dir D
  python set_fill.py render --dir D --probe 0 --out D/v0
  python set_fill.py add    --dir D --view D/v0 --filled filled.png --moge filled.glb
  python set_fill.py merge  --dir D --base stage.glb --out D/filled.glb
  python set_fill.py holes  --dir D            (hole share from test cameras that are not probes)

Each command prints one JSON line. Run with the ComfyUI venv (torch, trimesh, cv2, scipy).
"""

import argparse
import json
import math
import os
import sys

import cv2
import numpy as np
import torch
import trimesh
from PIL import Image
from scipy import ndimage

DEV = "cuda" if torch.cuda.is_available() else "cpu"

# Orbit poses around the set's middle, nearest first, so each fill sees the earlier ones:
# (yaw rad, pitch rad, distance x middle, field of view x). The last one steps back and widens
# the view, which paints past the painting's edges.
PROBES = [(0.22, 0.0, 1.0, 1.0), (-0.22, 0.0, 1.0, 1.0), (0.42, 0.05, 0.9, 1.0), (-0.42, 0.05, 0.9, 1.0), (0.0, 0.18, 1.0, 1.0), (0.0, 0.0, 1.1, 1.15)]
# Where the hole share is measured: inside the viewer's orbit, never a probe.
TESTS = [(0.32, 0.1, 0.95, 1.0), (-0.32, 0.1, 0.95, 1.0), (0.15, -0.1, 0.7, 1.0), (-0.45, 0.2, 1.1, 1.0)]
SAMPLES = np.array([[1, 1, 1], [4, 1, 1], [1, 4, 1], [1, 1, 4], [2, 2, 1], [1, 2, 2]], np.float32)
SAMPLES /= SAMPLES.sum(1, keepdims=True)
SKY = 1.6  # the sky sits this far past the 98th-percentile depth
GROW = 6  # px a hole mask grows, so the paint blends into what is known


def out(**kw):
    print(json.dumps(kw), flush=True)


def load_mesh(path):
    scene = trimesh.load(path, force="scene")
    return [g for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh)]


def texture(mesh):
    img = mesh.visual.material.baseColorTexture
    return np.asarray(img.convert("RGB"))


def intrinsics(mesh, W, H):
    """Fit u = cx + fx x/z, row = cy - fy y/z from the vertices and their uvs."""
    v, uv = mesh.vertices, mesh.visual.uv
    z = -v[:, 2]
    ok = z > 1e-6
    a = np.linalg.lstsq(np.c_[v[ok, 0] / z[ok], np.ones(ok.sum())], uv[ok, 0], rcond=None)[0]
    b = np.linalg.lstsq(np.c_[v[ok, 1] / z[ok], np.ones(ok.sum())], uv[ok, 1], rcond=None)[0]
    return dict(W=W, H=H, fx=a[0] * W, cx=a[1] * W, fy=b[0] * H, cy=(1 - b[1]) * H)


def mesh_points(mesh):
    """Dense coloured points on every face (6 per face, colour from the texture)."""
    tex = texture(mesh)
    th, tw = tex.shape[:2]
    f = mesh.faces
    pts = np.einsum("sk,fkd->fsd", SAMPLES, mesh.vertices[f]).reshape(-1, 3)
    uv = np.einsum("sk,fkd->fsd", SAMPLES, mesh.visual.uv[f]).reshape(-1, 2)
    col = tex[np.clip(((1 - uv[:, 1]) * th).astype(int), 0, th - 1), np.clip((uv[:, 0] * tw).astype(int), 0, tw - 1)]
    return pts.astype(np.float32), col.astype(np.uint8)


def rot(axis, a):
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def pose(cam, p):
    """Camera-to-world 4x4 for an orbit around (0, 0, -middle); yaw 0, pitch 0, distance 1 is the painting."""
    yaw, pitch, dist, _ = p
    R = rot("y", yaw) @ rot("x", -pitch)
    target = np.array([0, 0, -cam["middle"]])
    c2w = np.eye(4)
    c2w[:3, :3] = R
    c2w[:3, 3] = target + R @ np.array([0, 0, cam["middle"] * dist])
    return c2w


def view_intr(cam, p):
    k = 1 / p[3]
    return dict(W=cam["W"], H=cam["H"], fx=cam["fx"] * k, fy=cam["fy"] * k, cx=cam["cx"], cy=cam["cy"])


def render(xyz, rgb, K, c2w):
    """Splat points (2x2 px each) through a z-buffer. Returns colour, z-depth (nan = nothing) and the hole mask."""
    W, H = K["W"], K["H"]
    p = torch.from_numpy(xyz).to(DEV)
    c = torch.from_numpy(rgb).to(DEV)
    R = torch.from_numpy(c2w[:3, :3]).float().to(DEV)
    t = torch.from_numpy(c2w[:3, 3]).float().to(DEV)
    pc = (p - t) @ R
    z = -pc[:, 2]
    ok = z > 0.05
    pc, z, c = pc[ok], z[ok], c[ok]
    u = (K["cx"] + K["fx"] * pc[:, 0] / z).floor().long()
    v = (K["cy"] - K["fy"] * pc[:, 1] / z).floor().long()
    zbuf = torch.full((H * W,), float("inf"), device=DEV)
    col = torch.zeros((H * W, 3), dtype=torch.uint8, device=DEV)
    for du, dv in ((0, 0), (1, 0), (0, 1), (1, 1)):
        uu, vv = u + du, v + dv
        inside = (uu >= 0) & (uu < W) & (vv >= 0) & (vv < H)
        idx = vv[inside] * W + uu[inside]
        zbuf.scatter_reduce_(0, idx, z[inside], reduce="amin")
    for du, dv in ((0, 0), (1, 0), (0, 1), (1, 1)):
        uu, vv = u + du, v + dv
        inside = (uu >= 0) & (uu < W) & (vv >= 0) & (vv < H)
        idx = vv[inside] * W + uu[inside]
        win = z[inside] <= zbuf[idx] * 1.002
        col[idx[win]] = c[inside][win]
    zbuf = zbuf.view(H, W).cpu().numpy()
    img = col.view(H, W, 3).cpu().numpy()
    hole = ~np.isfinite(zbuf)
    # Pinholes between splats are not holes: patch them from their neighbours.
    big = cv2.morphologyEx(hole.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
    small = hole & ~big
    if small.any():
        img = cv2.inpaint(img, small.astype(np.uint8), 3, cv2.INPAINT_TELEA)
        zf = np.where(hole, 0, zbuf).astype(np.float32)
        zbuf = np.where(small, cv2.dilate(zf, np.ones((5, 5), np.uint8)), zbuf)
    zbuf[big] = np.nan
    return img, zbuf, big


def backproject(z, K, c2w, us, vs):
    x = (us + 0.5 - K["cx"]) / K["fx"] * z
    y = -(vs + 0.5 - K["cy"]) / K["fy"] * z
    pc = np.stack([x, y, -z], -1)
    return pc @ c2w[:3, :3].T + c2w[:3, 3]


def grid_mesh(img, z, keep, K, c2w, step=2, rtol=0.06):
    """A textured grid mesh over the pixels in keep, lifted to world with z-depth z."""
    H, W = z.shape
    ys, xs = np.mgrid[0:H:step, 0:W:step]
    zz = z[ys, xs]
    kk = keep[ys, xs] & np.isfinite(zz)
    gh, gw = zz.shape
    ids = -np.ones((gh, gw), np.int64)
    ids[kk] = np.arange(kk.sum())
    verts = backproject(zz[kk], K, c2w, xs[kk].astype(np.float64), ys[kk].astype(np.float64))
    uv = np.stack([(xs[kk] + 0.5) / W, 1 - (ys[kk] + 0.5) / H], -1)
    a, b, c, d = ids[:-1, :-1], ids[:-1, 1:], ids[1:, :-1], ids[1:, 1:]
    za, zb, zc, zd = zz[:-1, :-1], zz[:-1, 1:], zz[1:, :-1], zz[1:, 1:]
    with np.errstate(invalid="ignore"):
        zs = np.stack([za, zb, zc, zd])
        smooth = np.nanmax(zs, 0) / np.nanmin(zs, 0) < 1 + rtol
    quad = (a >= 0) & (b >= 0) & (c >= 0) & (d >= 0) & smooth
    faces = np.concatenate([np.stack([a[quad], c[quad], b[quad]], -1), np.stack([b[quad], c[quad], d[quad]], -1)])
    if not len(faces):
        return None
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=Image.fromarray(img), metallicFactor=0, roughnessFactor=1)
    return trimesh.Trimesh(verts, faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False)


def load_state(d):
    cam = json.load(open(os.path.join(d, "cam.json")))
    s = np.load(os.path.join(d, "points.npz"))
    return cam, s["xyz"], s["rgb"]


def save_points(d, xyz, rgb):
    np.savez(os.path.join(d, "points.npz"), xyz=xyz, rgb=rgb)


def cmd_base(a):
    os.makedirs(a.dir, exist_ok=True)
    painting = np.asarray(Image.open(a.image).convert("RGB"))
    H, W = painting.shape[:2]
    meshes = load_mesh(a.glb)
    m = max(meshes, key=lambda g: len(g.faces))
    K = intrinsics(m, W, H)
    z = -m.vertices[:, 2]
    cam = dict(K, middle=float(np.median(z[z > 0])), far=float(np.percentile(z[z > 0], 98)) * SKY)
    xyz, rgb = mesh_points(m)
    # What the painting's own view leaves empty in big patches is sky (MoGe masks it): put it on
    # a sphere far behind the set, so turning the camera shows sky there and never a hole.
    _, _, hole = render(xyz, rgb, K, np.eye(4))
    sky = cv2.morphologyEx(hole.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)).astype(bool)
    sky_n = 0
    if sky.any():
        keep = cv2.dilate(sky.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        ys, xs = np.mgrid[0:H, 0:W]
        # z-depth for a sphere of radius far: z = far / |(x/z, y/z, 1)|
        rays = np.sqrt(((xs + 0.5 - K["cx"]) / K["fx"]) ** 2 + ((ys + 0.5 - K["cy"]) / K["fy"]) ** 2 + 1)
        zs = cam["far"] / rays
        g = grid_mesh(painting, zs, keep, K, np.eye(4), step=4, rtol=1)
        if g is not None:
            g.export(os.path.join(a.dir, "sky.glb"))
            sky_n = int(sky.sum())
            sp = backproject(zs[sky], K, np.eye(4), xs[sky].astype(np.float64), ys[sky].astype(np.float64)).astype(np.float32)
            xyz, rgb = np.concatenate([xyz, sp]), np.concatenate([rgb, painting[sky]])
    json.dump(cam, open(os.path.join(a.dir, "cam.json"), "w"))
    json.dump([], open(os.path.join(a.dir, "fragments.json"), "w"))
    save_points(a.dir, xyz, rgb)
    out(probes=len(PROBES), middle=cam["middle"], far=cam["far"], points=len(xyz), sky=sky_n / (W * H))


def cmd_render(a):
    cam, xyz, rgb = load_state(a.dir)
    p = PROBES[a.probe]
    K, c2w = view_intr(cam, p), pose(cam, p)
    img, z, hole = render(xyz, rgb, K, c2w)
    os.makedirs(a.out, exist_ok=True)
    grow = cv2.dilate(hole.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * GROW + 1, 2 * GROW + 1)))
    Image.fromarray(img).save(os.path.join(a.out, "render.png"))
    Image.fromarray(grow).save(os.path.join(a.out, "mask.png"))
    np.save(os.path.join(a.out, "depth.npy"), z)
    json.dump(dict(K=K, c2w=c2w.tolist(), probe=p), open(os.path.join(a.out, "view.json"), "w"))
    out(holes=float(hole.mean()))


def moge_depth(glb, W, H):
    """Per-pixel z-depth of a MoGe GLB, in its own (unknown-scale) units; nan where it has nothing."""
    m = max(load_mesh(glb), key=lambda g: len(g.faces))
    v, uv = m.vertices, m.visual.uv
    u = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
    r = np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1)
    z = np.full((H, W), np.nan)
    z[r, u] = -v[:, 2]
    have = np.isfinite(z)
    dist, (iy, ix) = ndimage.distance_transform_edt(~have, return_indices=True)
    z = z[iy, ix]
    z[dist > 3] = np.nan
    return z


def cmd_add(a):
    cam, xyz, rgb = load_state(a.dir)
    view = json.load(open(os.path.join(a.view, "view.json")))
    K, c2w = view["K"], np.array(view["c2w"])
    W, H = K["W"], K["H"]
    filled = np.asarray(Image.open(a.filled).convert("RGB").resize((W, H), Image.LANCZOS))
    Image.fromarray(filled).save(os.path.join(a.view, "filled.png"))  # transforms.json points here
    known = np.load(os.path.join(a.view, "depth.npy"))
    fill = np.asarray(Image.open(os.path.join(a.view, "mask.png"))) > 127
    zm = moge_depth(a.moge, W, H)
    # MoGe's depth of the painted view has its own scale: fit z = s*zm + t on what was already
    # known (away from the holes), dropping outliers once, so the new pixels meet the old ones.
    ring = ~cv2.dilate(fill.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    ok = ring & np.isfinite(known) & np.isfinite(zm) & (known < cam["far"] * 0.95)
    s, t = 1.0, 0.0
    if ok.sum() > 500:
        A = np.c_[zm[ok], np.ones(ok.sum())]
        s, t = np.linalg.lstsq(A, known[ok], rcond=None)[0]
        r = np.abs(A @ [s, t] - known[ok])
        good = r < 2.5 * np.median(r) + 1e-6
        s, t = np.linalg.lstsq(A[good], known[ok][good], rcond=None)[0]
    z = np.clip(s * zm + t, 0.1, cam["far"])
    # Where MoGe sees nothing (sky) the paint goes on the sky sphere.
    ys, xs = np.mgrid[0:H, 0:W]
    rays = np.sqrt(((xs + 0.5 - K["cx"]) / K["fx"]) ** 2 + ((ys + 0.5 - K["cy"]) / K["fy"]) ** 2 + 1)
    z = np.where(np.isfinite(z), z, cam["far"] / rays)
    g = grid_mesh(filled, z, fill, K, c2w)
    kept = 0
    if g is not None:
        path = os.path.join(a.view, "fragment.glb")
        g.export(path)
        frags = json.load(open(os.path.join(a.dir, "fragments.json")))
        frags.append(os.path.relpath(path, a.dir))
        json.dump(frags, open(os.path.join(a.dir, "fragments.json"), "w"))
        new = fill & np.isnan(known)
        np_ = backproject(z[new], K, c2w, xs[new].astype(np.float64), ys[new].astype(np.float64)).astype(np.float32)
        xyz, rgb = np.concatenate([xyz, np_]), np.concatenate([rgb, filled[new]])
        save_points(a.dir, xyz, rgb)
        kept = int(len(g.faces))
    out(scale=float(s), shift=float(t), fit=int(ok.sum()), faces=kept)


def cmd_merge(a):
    scene = trimesh.Scene()
    for i, g in enumerate(load_mesh(a.base)):
        scene.add_geometry(g, geom_name=f"stage{i}")
    extra = (["sky.glb"] if os.path.exists(os.path.join(a.dir, "sky.glb")) else []) + json.load(open(os.path.join(a.dir, "fragments.json")))
    for name in extra:
        for j, g in enumerate(load_mesh(os.path.join(a.dir, name))):
            scene.add_geometry(g, geom_name=f"{os.path.dirname(name) or 'sky'}{j}")
    scene.export(a.out)
    # The views and their cameras, in nerfstudio's transforms.json (OpenGL camera-to-world),
    # which Brush reads: the painting first, then every painted probe view.
    cam = json.load(open(os.path.join(a.dir, "cam.json")))
    frames = [dict(file_path=os.path.relpath(a.image, a.dir), transform_matrix=np.eye(4).tolist(), fl_x=cam["fx"], fl_y=cam["fy"], cx=cam["cx"], cy=cam["cy"], w=cam["W"], h=cam["H"])] if a.image else []
    for name in json.load(open(os.path.join(a.dir, "fragments.json"))):
        vd = os.path.join(a.dir, os.path.dirname(name))
        v = json.load(open(os.path.join(vd, "view.json")))
        K = v["K"]
        frames.append(dict(file_path=os.path.join(os.path.dirname(name), "filled.png"), transform_matrix=v["c2w"], fl_x=K["fx"], fl_y=K["fy"], cx=K["cx"], cy=K["cy"], w=K["W"], h=K["H"]))
    json.dump(dict(camera_model="PINHOLE", frames=frames), open(os.path.join(a.dir, "transforms.json"), "w"), indent=1)
    out(meshes=len(scene.geometry), frames=len(frames))


def cmd_holes(a):
    cam, xyz, rgb = load_state(a.dir)
    shares = []
    for p in TESTS:
        _, _, hole = render(xyz, rgb, view_intr(cam, p), pose(cam, p))
        shares.append(float(hole.mean()))
    out(holes=shares, mean=float(np.mean(shares)))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("base")
    b.add_argument("--glb", required=True)
    b.add_argument("--image", required=True)
    b.add_argument("--dir", required=True)
    r = sub.add_parser("render")
    r.add_argument("--dir", required=True)
    r.add_argument("--probe", type=int, required=True)
    r.add_argument("--out", required=True)
    d = sub.add_parser("add")
    d.add_argument("--dir", required=True)
    d.add_argument("--view", required=True)
    d.add_argument("--filled", required=True)
    d.add_argument("--moge", required=True)
    m = sub.add_parser("merge")
    m.add_argument("--dir", required=True)
    m.add_argument("--base", required=True)
    m.add_argument("--image")
    m.add_argument("--out", required=True)
    h = sub.add_parser("holes")
    h.add_argument("--dir", required=True)
    a = ap.parse_args()
    {"base": cmd_base, "render": cmd_render, "add": cmd_add, "merge": cmd_merge, "holes": cmd_holes}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
