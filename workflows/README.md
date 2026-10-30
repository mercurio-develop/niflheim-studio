# Workflows

Two formats, same pipeline.

`*.api.json` — what the app POSTs (`lib/comfy.ts`). One small graph per job.

`ui/` — ComfyUI UI graphs from the local clone. Open these in ComfyUI to inspect or run by hand.

Install into a local ComfyUI (creates `user/default/workflows/niflheim/`):

```bash
./scripts/install-comfy-workflows.sh
# or: COMFYUI_DIR=/path/to/ComfyUI ./scripts/install-comfy-workflows.sh
```

Nodes and weights: [`build/model-files.md`](../build/model-files.md). Audit: `node scripts/comfy-check.ts http://127.0.0.1:8188`.

## API graphs (the app)

| File | Step |
| --- | --- |
| `01_concept.api.json` | Character paint |
| `01_edit.api.json` | Character Qwen edit |
| `01_brush.api.json` | Character add / change |
| `01_fill.api.json` | Inpaint fill |
| `01_remove.api.json` | Hide / erase |
| `01_swap.api.json` | Replace a part |
| `01_change.api.json` | Change a tagged part |
| `01_parts.api.json` | SAM 3 part masks |
| `01_tags.api.json` | Florence-2 tags |
| `02_turnaround_mesh.api.json` | Hunyuan mesh from views (optional, last) |
| `02_cutout.api.json` | Character cutout |
| `02_moge.api.json` | MoGe depth |
| `02_asset_crop.api.json` | Asset crop |
| `02_set_paint.api.json` | Set paint |
| `02_set_fill.api.json` | Set fill |
| `03_shot.api.json` | LTX-2.5 shot |
| `03_shot_layout.api.json` | Shot layout |
| `03_key_caption.api.json` | Keyframe caption |
| `03_key_detail.api.json` | Keyframe detail |
| `03_key_face.api.json` | Keyframe face |
| `04_effect_night.api.json` | Night effect |
| `04_effect_refine.api.json` | Effect refine |

## UI graphs (ComfyUI clone)

| File | What |
| --- | --- |
| `ui/01_concept.json` | Concept art, Z-Image Turbo |
| `ui/02_views.json` | Concept to views, Qwen Edit 2511 multi-angle |
| `ui/03_mesh.json` | Views to mesh, Hunyuan3D-2mv Turbo (the app uses this path) |
| `ui/03_mesh_textured.json` | Views to textured mesh, Pixal3D (optional) |
| `ui/04_trellis.json` | Image to 3D, TRELLIS.2 (optional) |
| `ui/05_splat.json` | Image to Gaussian splat, TripoSplat (optional; the app uses python splat) |
