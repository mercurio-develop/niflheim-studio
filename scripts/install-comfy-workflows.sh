#!/usr/bin/env bash
# Copy this repo's graphs into a local ComfyUI so they show under Workflows → niflheim.
# The app still POSTs workflows/*.api.json; these copies are for opening in the ComfyUI UI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMFY="${COMFYUI_DIR:-$HOME/ComfyUI}"
DEST="$COMFY/user/default/workflows/niflheim"

if [ ! -d "$COMFY" ]; then
  echo "No ComfyUI at $COMFY. Set COMFYUI_DIR=/path/to/ComfyUI" >&2
  exit 1
fi

mkdir -p "$DEST"
cp -f "$ROOT"/workflows/*.api.json "$DEST/"
cp -f "$ROOT"/workflows/ui/*.json "$DEST/"
echo "Installed $(ls -1 "$DEST" | wc -l) graphs into $DEST"
echo "Open ComfyUI → Workflows → niflheim"
