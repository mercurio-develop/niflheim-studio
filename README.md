# NIFLheim Studio

**An open-source shot pipeline studio: design a character, drop in a concept painting, direct
the camera and VFX in 3D, LTX-2.5 shoots it, then fly through your shot as a Gaussian splat.**
Open weights only, one 16 GB GPU, built on the [Comfy SDK](https://docs.comfy.org/development/api-development/sdks).

> Work in progress: entry for Comfy's [Open Source Higgsfield](https://comfy.org/open-source-higgsfield/).

## The wizard

Every step runs one small ComfyUI workflow through the Comfy SDK; every result is kept, can be
compared, swapped or undone, and re-running a step marks the later ones stale.

1. **Character**: describe them, optionally **draw a sketch or upload an image** they should
   follow, pick a style and how many concepts (1, 2, 4 or 6). Then edit the one you choose:
   select a part by name (Florence-2 tags, SAM 2.1 masks) or paint a selection, and
   **Change**, **Add object** or **Remove** inside it; **Restyle** the whole character;
   undo/redo, compare any two versions, zoom in full screen.
2. **Turnaround**: three-quarter, side and back views of the same character.
3. **Set**: a concept painting becomes a 3D stage (MoGe depth); fog where nothing is known.
4. **Style**: optional style image and LoRA.
5. **Stage**: place the character, pick a camera move aimed at them.
6. **VFX**: fog, embers, rain, snow, sparks, magic, placed in 3D.
7. **Shot**: say what the character does; LTX-2.5 renders takes; build a sequence.
8. **Export**: MP4, comp passes (depth, FX mask, camera) and a Gaussian splat of the shot.

Steps 1 and 2 are built; 3 to 8 are in progress.

## Run it locally

Needs Node 22+, [uv](https://docs.astral.sh/uv/), a ComfyUI (v0.38+) with the models in
`build/model-files.md`, and an NVIDIA GPU with 16 GB.

```bash
cp .env.example .env
npm ci
~/ComfyUI/run.sh --port 8188          # or however you start ComfyUI
./scripts/comfy-proxy.sh              # Comfy API v2 proxy on :8189 (the SDK talks to it)
npm run dev                           # http://localhost:4800
```

Proof scripts (run a step end to end without the UI):

```bash
node --env-file=.env scripts/try-character.ts   # concept, part mask, swap, side view
node --env-file=.env scripts/try-brush.ts <image> <x> <y> <w> <h> "<thing>"
```

Docker: `docker compose up -d` serves the app on :4800 and reaches the Comfy API proxy on the host
at `host.docker.internal:8189` (start the proxy so it listens there).

To use Comfy Cloud instead of a local ComfyUI, set `COMFY_BASE_URL=https://cloud.comfy.org`
and `COMFY_API_KEY` in `.env`.

## Layout

```
app/          routes and layouts
features/     one folder per wizard step
lib/comfy.ts  every ComfyUI call (Comfy SDK)
workflows/    API-format graphs, one per step
scripts/      proxy launcher, proofs, splat tools
```

## Models

Open-weight models only, no partner nodes or closed APIs: Z-Image Turbo, Qwen-Image-Edit-2511
(+ Lightning LoRA), Florence-2 PromptGen v2, GroundingDINO + SAM 2.1, and later MoGe and LTX-2.5
(LTX-2.x Community License) with its IC-LoRAs. Files, folders and licences: `build/model-files.md`.
Third-party assets: `THIRD_PARTY_NOTICES/`.

## License

Code: [MIT](LICENSE). Model weights are under their own licenses.
