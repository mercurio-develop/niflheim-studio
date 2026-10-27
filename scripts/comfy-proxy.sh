#!/usr/bin/env bash
# Comfy API v2 proxy in front of the local ComfyUI. The app's Comfy SDK talks to this.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/comfy-api-proxy ] || { uv venv .venv -q && uv pip install -q --python .venv/bin/python comfy-api-proxy; }
exec .venv/bin/comfy-api-proxy run --comfyui "${COMFYUI_URL:-http://127.0.0.1:8188}" --port 8189 --state-dir data/proxy
