"""Fill the holes of a MoGe set stage: render it from nearby cameras, let an inpainter paint what
is missing (in lib, via ComfyUI), lift the painted pixels back into 3D and merge them in.

MoGe's mesh has the painting's camera at the origin looking down -z (glTF, y up), and every
vertex lies on a pixel ray, so the painting's intrinsics are read off the GLB's uvs. base levels
it: the ground plane is fitted, MoGe's bumpy floor is replaced by that exact plane (textured with
the painting), and the world is turned and scaled so the floor is y = 0 and the painting's camera
stands at eye height (cam.json c2w). The state of one fill lives in a folder: cam.json,
points.npz (everything known so far, as dense coloured points), stage.glb, floor.glb, sky.glb,
and one folder per probe view (render, hole mask, depth, fragment.glb, fragment-floor.glb).

  python set_fill.py base   --glb stage.glb --image set.png --dir D
  python set_fill.py render --dir D --probe 0 --out D/v0
  python set_fill.py add    --dir D --view D/v0 --filled filled.png --moge filled.glb
  python set_fill.py merge  --dir D --image set.png --out D/filled.glb
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
# (yaw rad, pitch rad, distance x middle, field of view x). They span the viewer's orbit
# (stage-viewer.tsx ORBIT: yaw 0.3, up 0.12), the camera moves an LTX shot can make from the
# painting; the last one steps back and widens the view, which paints past the painting's edges.
PROBES = [(0.3, 0.0, 1.0, 1.0), (-0.3, 0.0, 1.0, 1.0), (0.0, 0.12, 1.0, 1.0), (0.0, 0.0, 1.15, 1.15)]
# Where the hole share is measured: inside the viewer's orbit, never a probe.
TESTS = [(0.2, 0.06, 0.95, 1.0), (-0.2, 0.06, 0.95, 1.0), (0.1, -0.03, 0.8, 1.0), (-0.28, 0.1, 1.05, 1.0)]
SAMPLES = np.array([[1, 1, 1], [4, 1, 1], [1, 4, 1], [1, 1, 4], [2, 2, 1], [1, 2, 2]], np.float32)
SAMPLES /= SAMPLES.sum(1, keepdims=True)
SKY = 1.6  # the sky sits this far past the 98th-percentile depth
GROW = 6  # px a hole mask grows, so the paint blends into what is known
# A pixel is floor unless MoGe's point stands higher above the plane than this: 8 cm, plus 1.5%
# of its depth, since MoGe's far floor bends away from the plane (2026-10-27 courtyard: a raised
# strip at the walls' feet when the test was 3% in depth either way).
FLOOR_TOL = (0.08, 0.015)
# The painting is asked for at eye level, but MoGe's metric scale drifts on paintings (0.8 m for
# the courtyard proof): the camera height is brought into this range (m) and the world with it,
# so a 1.7 m character stands right against the set.
EYE = (1.4, 1.9)


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


def fit_floor(v, cam, seed=0):
    """The ground plane under the painting's camera: RANSAC over what the lower part of the frame
    sees, keeping only planes within 35 degrees of level. v: vertices in the painting camera's
    frame. Returns n (unit, pointing up to the camera), d (n.x + d = 0), the inlier share, the
    inliers' spread (m) and the camera's height above the plane, or None when there is no floor."""
    z = -v[:, 2]
    row = cam["cy"] - cam["fy"] * v[:, 1] / np.clip(z, 1e-6, None)
    near = (z > 0) & (row > cam["H"] * 0.55) & (z < np.percentile(z[z > 0], 90))
    pts = v[near]
    if len(pts) < 500:
        return None
    rng = np.random.default_rng(seed)
    pts = pts[rng.choice(len(pts), min(len(pts), 200_000), replace=False)]
    tau = 0.01 * cam["middle"]
    best, best_n = None, 0
    for _ in range(400):
        a, b, c = pts[rng.choice(len(pts), 3, replace=False)]
        n = np.cross(b - a, c - a)
        if np.linalg.norm(n) < 1e-9:
            continue
        n /= np.linalg.norm(n)
        if n[1] < 0:
            n = -n
        if n[1] < math.cos(math.radians(35)):
            continue
        inl = np.abs((pts - a) @ n) < tau
        if inl.sum() > best_n:
            best, best_n = inl, inl.sum()
    if best is None or best_n < 0.15 * len(pts):
        return None
    # Least squares on the inliers: the normal is the direction they spread least in.
    q = pts[best]
    mid = q.mean(0)
    n = np.linalg.svd(q - mid, full_matrices=False)[2][2]
    n = n if n[1] > 0 else -n
    d = -float(n @ mid)
    return dict(n=n.tolist(), d=d, inliers=float(best_n / len(pts)), spread=float(np.std(q @ n + d)), height=d, tau=tau)


def level(floor):
    """Camera-to-world for the painting's camera in a world with the floor at y = 0 and y up:
    the smallest turn that takes the floor's normal to +y, so the camera keeps its heading."""
    n = np.array(floor["n"])
    y = np.array([0.0, 1.0, 0.0])
    k = np.cross(n, y)
    s, c = np.linalg.norm(k), float(n @ y)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    R = np.eye(3) + K + K @ K * ((1 - c) / (s * s)) if s > 1e-9 else np.eye(3)
    c2w = np.eye(4)
    c2w[:3, :3] = R
    c2w[:3, 3] = [0, floor["height"], 0]
    return c2w


def rot(axis, a):
    c, s = math.cos(a), math.sin(a)
    if axis == "x":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def pose(cam, p):
    """Camera-to-world 4x4 for an orbit around the point middle ahead of the painting's camera;
    yaw 0, pitch 0, distance 1 is the painting. The orbit turns about the levelled world's up."""
    yaw, pitch, dist, _ = p
    start = np.array(cam.get("c2w", np.eye(4).tolist()))
    # Heading of the painting's camera, without its tilt, so yaw turns about the world's y.
    fwd = -start[:3, 2]
    heading = math.atan2(-fwd[0], -fwd[2])
    target = start[:3, 3] + fwd * cam["middle"]
    R = rot("y", heading + yaw) @ rot("x", -pitch) @ rot("y", -heading) @ start[:3, :3]
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


def floor_pixels(zm, floor, K):
    """Which pixels of the painting are floor, and the plane's exact z-depth on every pixel ray
    (nan above the horizon). Floor: MoGe's point within FLOOR_TOL of the plane; the gaps MoGe's
    edge cut left between floor pixels are closed, and specks smaller than 0.2% are dropped."""
    H, W = zm.shape
    ys, xs = np.mgrid[0:H, 0:W]
    rx, ry = (xs + 0.5 - K["cx"]) / K["fx"], -(ys + 0.5 - K["cy"]) / K["fy"]
    n = floor["n"]
    down = n[0] * rx + n[1] * ry - n[2]  # n . ray, ray = (rx, ry, -1); below zero it meets the floor
    with np.errstate(divide="ignore", invalid="ignore"):
        zp = np.where(down < -1e-6, -floor["d"] / down, np.nan)
        # A point at depth zm on this ray sits (1 - zm / zp) x the camera's height above the plane.
        # Below it is still floor: nothing stands under the ground, MoGe's far floor just sags.
        above = (1 - zm / zp) * floor["height"]
        # MoGe's far floor also rises (half a metre at 20 m on the courtyard): what faces up within
        # 25 degrees of the plane and is not far above it is floor too. Step tops and plinths are
        # smaller than the specks dropped below, or more than 5% of their depth above the plane.
        p = np.stack([rx * zm, ry * zm, -zm], -1)
        nrm = np.cross(np.gradient(p, axis=1), np.gradient(p, axis=0))
        up = (nrm @ np.asarray(n)) / (np.linalg.norm(nrm, axis=-1) + 1e-12)
        on = np.isfinite(zm) & ((above < FLOOR_TOL[0] + FLOOR_TOL[1] * zm) | ((np.abs(up) > math.cos(math.radians(25))) & (above < 0.05 * zm)))
        # Below the horizon, what MoGe left empty is floor: its edge cut tears the far floor,
        # which it sees almost edge-on (2026-10-27 courtyard: a band across the middle).
        on = np.isfinite(zp) & (on | np.isnan(zm))
    on = cv2.morphologyEx(on.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)).astype(bool) & np.isfinite(zp)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(on.astype(np.uint8), connectivity=4)
    big = np.zeros(count, bool)
    big[1:] = stats[1:, cv2.CC_STAT_AREA] > 0.002 * H * W
    return big[labels], zp


def cmd_base(a):
    os.makedirs(a.dir, exist_ok=True)
    painting = np.asarray(Image.open(a.image).convert("RGB"))
    H, W = painting.shape[:2]
    meshes = load_mesh(a.glb)
    m = max(meshes, key=lambda g: len(g.faces))
    K = intrinsics(m, W, H)
    z = -m.vertices[:, 2]
    floor = fit_floor(m.vertices, dict(K, middle=float(np.median(z[z > 0]))))
    # Bring the camera to eye height: everything in the painting camera's frame scales alike.
    scale = float(np.clip(floor["height"], *EYE) / floor["height"]) if floor else 1.0
    m.vertices = m.vertices * scale
    z = z * scale
    cam = dict(K, middle=float(np.median(z[z > 0])), far=float(np.percentile(z[z > 0], 98)) * SKY, scale=scale, floor=bool(floor))
    eye = np.eye(4)
    parts = {}
    floor_n = 0
    if floor:
        floor.update(d=floor["d"] * scale, height=floor["height"] * scale)
        # MoGe's floor is bumpy and torn at its far edge: the plane itself, textured with the
        # painting, takes its place, and MoGe's faces on those pixels go.
        on, zp = floor_pixels(depth_map(m, W, H), floor, K)
        uv = m.visual.uv
        vu = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
        vr = np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1)
        m.update_faces(~on[vr, vu][m.faces].any(1))
        m.remove_unreferenced_vertices()
        # Grown by 2 px under MoGe's mesh, so no seam opens where the two meet.
        grown = cv2.dilate(on.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & np.isfinite(zp)
        parts["floor"] = grid_mesh(painting, zp, grown, K, eye, rtol=1)
        floor_n = int(on.sum())
    # MoGe's pixels along the sky are half sky (the painting blends its edges): 2 px go.
    zm_all = depth_map(m, W, H)
    sky_px = np.isnan(zm_all) & ~np.isfinite(zp) if floor else np.isnan(zm_all)
    rim = cv2.dilate(cv2.morphologyEx(sky_px.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)), np.ones((5, 5), np.uint8)).astype(bool)
    uv = m.visual.uv
    vu = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
    vr = np.clip(((1 - uv[:, 1]) * H).astype(int), 0, H - 1)
    m.update_faces(~rim[vr, vu][m.faces].any(1))
    m.remove_unreferenced_vertices()
    parts["stage"] = m
    xyz, rgb = map(np.concatenate, zip(*[mesh_points(g) for g in parts.values() if g is not None]))
    # What the painting's own view leaves empty in big patches is sky (MoGe masks it): put it on
    # a sphere far behind the set, so turning the camera shows sky there and never a hole.
    _, _, hole = render(xyz, rgb, K, eye)
    sky = cv2.morphologyEx(hole.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8)).astype(bool)
    sky_n = 0
    if sky.any():
        # Grown past its 4 px grid step and under the objects' trimmed rims, so no gap opens.
        keep = cv2.dilate(sky.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
        ys, xs = np.mgrid[0:H, 0:W]
        # z-depth for a sphere of radius far: z = far / |(x/z, y/z, 1)|
        rays = np.sqrt(((xs + 0.5 - K["cx"]) / K["fx"]) ** 2 + ((ys + 0.5 - K["cy"]) / K["fy"]) ** 2 + 1)
        zs = cam["far"] / rays
        # The sky is seen past the objects' edges once the camera turns: paint the objects out
        # of its texture, or their outlines show on it as pale halos.
        core = cv2.erode(sky.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        sky_img = cv2.inpaint(painting, (keep & ~core).astype(np.uint8), 7, cv2.INPAINT_TELEA)
        parts["sky"] = grid_mesh(sky_img, zs, keep, K, eye, step=4, rtol=1)
        if parts["sky"] is not None:
            sky_n = int(sky.sum())
            sp = backproject(zs[sky], K, eye, xs[sky].astype(np.float64), ys[sky].astype(np.float64)).astype(np.float32)
            xyz, rgb = np.concatenate([xyz, sp]), np.concatenate([rgb, painting[sky]])
    # Level the world: floor at y = 0, y up, the painting's camera at eye height above it.
    start = level(floor) if floor else eye
    cam["c2w"] = start.tolist()
    for name, g in parts.items():
        if g is not None:
            g.apply_transform(start)
            g.export(os.path.join(a.dir, f"{name}.glb"))
    xyz = (xyz @ start[:3, :3].T + start[:3, 3]).astype(np.float32)
    json.dump(cam, open(os.path.join(a.dir, "cam.json"), "w"))
    json.dump([], open(os.path.join(a.dir, "fragments.json"), "w"))
    save_points(a.dir, xyz, rgb)
    out(probes=len(PROBES), middle=cam["middle"], far=cam["far"], points=len(xyz), sky=sky_n / (W * H), floor=floor_n / (W * H), height=floor["height"] if floor else None, scale=scale)


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


def depth_map(m, W, H):
    """Per-pixel z-depth of a MoGe mesh in its own camera frame; nan where it has nothing."""
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
    zm = depth_map(max(load_mesh(a.moge), key=lambda g: len(g.faces)), W, H)
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
    # Painted floor goes onto the floor plane (y = 0): where a pixel's ray heads down and the
    # fitted depth lands near the plane, the plane's own depth is taken, so the floor stays flat.
    on_floor = np.zeros_like(fill)
    if cam.get("floor"):
        d = np.stack([(xs + 0.5 - K["cx"]) / K["fx"], -(ys + 0.5 - K["cy"]) / K["fy"], -np.ones_like(xs, float)], -1) @ c2w[:3, :3].T
        with np.errstate(divide="ignore", invalid="ignore"):
            zf = np.where(d[..., 1] < -1e-6, -c2w[1, 3] / d[..., 1], np.nan)
            above = (1 - z / zf) * c2w[1, 3]
            on_floor = np.isfinite(zf) & (above < FLOOR_TOL[0] + FLOOR_TOL[1] * z)
        z = np.where(on_floor, zf, z)
    # Only what was missing is new: the grown edge of the mask lies over pixels the stage already
    # has, and meshing it would put a second layer there. 1 px of overlap keeps the seam shut.
    new = fill & np.isnan(known)
    keep = cv2.dilate(new.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & fill
    # Qwen drifts the colours, and not evenly (a blue sky in one corner of a grey one): along the
    # grown edge, where both the render and the paint have the stage, their difference is
    # measured and spread into the new paint (a wide blur, weighted), so each patch meets its
    # surroundings; paint far from any edge takes the view's mean difference.
    edge = fill & ~new & np.isfinite(known)
    if edge.sum() > 200 and new.any():
        render_img = np.asarray(Image.open(os.path.join(a.view, "render.png")).convert("RGB")).astype(np.float32)
        f32 = filled.astype(np.float32)
        w = edge.astype(np.float32)
        diff = (render_img - f32) * w[..., None]
        sigma = 0.04 * max(W, H)
        num = cv2.GaussianBlur(diff, (0, 0), sigma)
        den = cv2.GaussianBlur(w, (0, 0), sigma)[..., None]
        mean = diff.sum((0, 1)) / w.sum()
        shift = np.where(den > 1e-3, num / np.maximum(den, 1e-3), mean)
        f32[keep] += shift[keep]
        filled = np.clip(f32, 0, 255).astype(np.uint8)
    kept = 0
    frags = json.load(open(os.path.join(a.dir, "fragments.json")))
    for name, part in (("fragment", keep & ~on_floor), ("fragment-floor", keep & on_floor)):
        g = grid_mesh(filled, z, part, K, c2w)
        if g is None:
            continue
        path = os.path.join(a.view, f"{name}.glb")
        g.export(path)
        frags.append(os.path.relpath(path, a.dir))
        kept += int(len(g.faces))
    json.dump(frags, open(os.path.join(a.dir, "fragments.json"), "w"))
    if kept:
        np_ = backproject(z[new], K, c2w, xs[new].astype(np.float64), ys[new].astype(np.float64)).astype(np.float32)
        xyz, rgb = np.concatenate([xyz, np_]), np.concatenate([rgb, filled[new]])
        save_points(a.dir, xyz, rgb)
    out(scale=float(s), shift=float(t), fit=int(ok.sum()), faces=kept, floor=int((new & on_floor).sum()))


def cmd_merge(a):
    # One mesh per part, named for the viewer: every "floor" one is ground the character can
    # stand on (the plane, and the painted floor of each view).
    scene = trimesh.Scene()
    names = [n for n in ("stage.glb", "floor.glb", "sky.glb") if os.path.exists(os.path.join(a.dir, n))]
    frags = json.load(open(os.path.join(a.dir, "fragments.json")))
    for name in names + frags:
        view, file = os.path.split(name)
        tag = file[:-4] if not view else ("floor-" if "floor" in file else "") + view
        for j, g in enumerate(load_mesh(os.path.join(a.dir, name))):
            scene.add_geometry(g, geom_name=f"{tag}{j}")
    scene.export(a.out)
    # The views and their cameras, in nerfstudio's transforms.json (OpenGL camera-to-world),
    # which Brush reads: the painting first, then every painted probe view.
    cam = json.load(open(os.path.join(a.dir, "cam.json")))
    start = cam.get("c2w", np.eye(4).tolist())
    frames = [dict(file_path=os.path.relpath(a.image, a.dir), transform_matrix=start, fl_x=cam["fx"], fl_y=cam["fy"], cx=cam["cx"], cy=cam["cy"], w=cam["W"], h=cam["H"])] if a.image else []
    for view in dict.fromkeys(os.path.dirname(n) for n in frags):
        v = json.load(open(os.path.join(a.dir, view, "view.json")))
        K = v["K"]
        frames.append(dict(file_path=os.path.join(view, "filled.png"), transform_matrix=v["c2w"], fl_x=K["fx"], fl_y=K["fy"], cx=K["cx"], cy=K["cy"], w=K["W"], h=K["H"]))
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
    m.add_argument("--base")  # unused: base saved the stage in --dir
    m.add_argument("--image")
    m.add_argument("--out", required=True)
    h = sub.add_parser("holes")
    h.add_argument("--dir", required=True)
    a = ap.parse_args()
    {"base": cmd_base, "render": cmd_render, "add": cmd_add, "merge": cmd_merge, "holes": cmd_holes}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
