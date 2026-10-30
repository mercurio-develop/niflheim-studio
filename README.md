# NIFLheim Studio

**An open-source shot pipeline studio: design a character, paint a place, stand them in it as a
3D stage, direct the camera, and LTX-2.5 shoots the shot on your own GPU. Then cut the takes into
one reel.** Open weights only, one 16 GB GPU or Comfy Cloud, built on the
[Comfy SDK](https://docs.comfy.org/development/api-development/sdks).

Entry for Comfy's [Open Source Higgsfield](https://comfy.org/open-source-higgsfield/).

## Why it is different

Most video tools take a prompt and hope. Here the shot is designed before it is generated, and
every take is held to one guide for its whole length:

- the character is fixed first: concept, part edits, then one **Generate** paints every side in
  a relaxed pose plus face close-ups and the things they carry, laid out as a **reference sheet**
  (people, or animals on four legs);
- the place is a 3D stage made from one painting, so the camera move is a move through space,
  not a guess;
- each shot is one of two kinds, never both (Lightricks advises against mixing IC-LoRAs):
  - **Camera move**: the move is drawn from the 3D stage as a grey **clay clip**, every frame, and
    LTX-2.5 renders over it with the **Layout-to-Render** IC-LoRA from one painted first frame, so
    the camera and the blocking are followed frame by frame;
  - **Character**: the take is held to the character's sheet with the **Ingredients** IC-LoRA, so
    the face, clothes and things stay theirs (5 s, the sheet's trained length).
- faces in painted keyframes are matched to the sheet's close-up (SAM 3 finds the head,
  Qwen-Image-Edit repaints it), and takes are scored for camera travel and pop-ins, so the best
  one is picked for you.

## The wizard

Four steps, one job each. Every step runs small ComfyUI workflows; every result is kept, can be
compared, swapped or undone, and re-running a step marks the later ones stale.

1. **Character**: describe someone (or sketch or upload one) and get concepts. Pick one, point
   at a part by name or paint it, and **Change**, **Add**, **Remove** or **Restyle** it. Then
   **Generate** the turnaround: front, three-quarter, side and back in a relaxed pose (Body:
   person, animal on four legs, or creature), and with them the sheet. Poses and a 3D model are
   optional. A project can hold several characters.
2. **Scene**: paint a place or drop in a painting; it becomes a 3D stage (MoGe depth, filled
   behind the edges). Stand the characters in it and add objects.
3. **Shots**: per shot, a framing, a camera move and where the characters walk, blocked in the
   3D viewer (Shot view shows the shot's first frame). Pick the shot's kind: **Camera move**
   (draw the clay clip, paint the first keyframe) or **Character** (the sheet, an expression).
   Say what happens; LTX-2.5 shoots takes; keep the best one.
4. **Reel**: order the picked takes, choose a cut, fade or dip between them, export one MP4.
   **Autopilot** does shots, keyframes, takes, the best take and the reel in one press.

## Run it locally

Needs:

- Node 22.18+ (it runs the `.ts` scripts directly) and [uv](https://docs.astral.sh/uv/) for the
  Python helpers' venv and the Comfy API proxy
- ComfyUI v0.38+ with the custom node packs and models in [`build/model-files.md`](build/model-files.md)
- an NVIDIA GPU with 16 GB (or Comfy Cloud, below)
- ffmpeg on the `PATH`
- a Python with the packages in `scripts/requirements.txt` for the helper scripts
  (`NIFL_PYTHON` in `.env`; defaults to ComfyUI's `.venv`)

```bash
git clone https://github.com/mercurio-develop/niflheim-studio.git
cd niflheim-studio
npm ci
cp .env.example .env                                # Comfy Cloud: set COMFY_API_KEY, empty COMFY_BASE_URL
uv venv .pyenv && uv pip install --python .pyenv/bin/python -r scripts/requirements.txt
echo "NIFL_PYTHON=$PWD/.pyenv/bin/python" >> .env   # the helper scripts' Python
# Local ComfyUI only:
~/ComfyUI/run.sh --port 8188                        # or however you start ComfyUI
./scripts/comfy-proxy.sh                            # Comfy API v2 proxy on :8189 (the SDK talks to it)
node scripts/comfy-check.ts http://127.0.0.1:8188   # has it every node and model the graphs use?
npm run dev                                         # http://localhost:4800 (or: npm run build && npm start)
```

Docker: `docker compose up -d` serves the app on :4800 with Python and ffmpeg inside, so every
step runs in the container; your projects stay in `./data`. Comfy comes from `.env`: Comfy Cloud
(below), or the proxy on the host with `COMFY_BASE_URL=http://host.docker.internal:8189`. The
image needs no GPU, so a home server or NAS with Docker (x86, about 4 GB free) can run it while
Comfy Cloud renders.

## Run it on Comfy Cloud

No local GPU: leave `COMFY_BASE_URL` empty and set `COMFY_API_KEY`
(from [platform.comfy.org](https://platform.comfy.org)) in `.env`. Every node and model the
workflows use is in the Cloud catalog, so the graphs run unchanged. The badge in the header
says Cloud or Local. The Python helpers (stage fill, take scoring, reel) still run on your
machine.

## Proof scripts

Run a step end to end without the UI: `node --env-file=.env scripts/<name>.ts`, for example
`try-character`, `try-turnaround`, `try-set`, `try-shot`, or `try-workflows` (every graph once).

## Sample project

A finished project (character, stage, shots, takes; all made with this app) is attached to the
[latest release](../../releases/latest) as a zip. Unzip it into `data/projects/` and it shows on
the home page:

```bash
unzip sample-*.zip -d data/projects/
```

To pack one of your own: `python scripts/pack_sample.py data/projects/<id> sample.zip` (only the
files the project uses, not every version it kept).

## Layout

```
app/          routes and layouts
features/     one folder per wizard step: actions, queries, components
lib/comfy.ts  every ComfyUI call (Comfy SDK, local or Cloud)
workflows/    API-format graphs, one small graph per job
scripts/      proxy launcher, proofs, Python helpers (stage fill, scoring, reel)
data/         your projects (gitignored)
```

## Models

Open-weight models only, no partner (API) nodes or closed APIs: Z-Image Turbo,
Qwen-Image-Edit-2511 (+ Lightning LoRA), Florence-2, SAM 3, BiRefNet, MoGe-2, Hunyuan3D-2 MV
and LTX-2.5 with its Gemma 4 text encoder. Files, folders and licences:
[`build/model-files.md`](build/model-files.md). Third-party assets:
[`THIRD_PARTY_NOTICES/`](THIRD_PARTY_NOTICES/README.md).

Two licences to know: LTX-2.5 and its Layout-to-Render and Ingredients IC-LoRAs (LTX-2.x Community
License) are free under USD 10M yearly revenue,
and Hunyuan3D-2 (the character's 3D model) is not licensed in the EU, the UK or South Korea;
the 3D model is optional, the rest of the wizard works without it.

## License

Code: [MIT](LICENSE). Model weights are not in this repository and keep their own licences.
