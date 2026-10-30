# The app and the helper scripts it runs (scripts/*.py with Python, the reel with ffmpeg).
# ComfyUI is not in here: Comfy Cloud (COMFY_API_KEY) or a ComfyUI behind the Comfy API proxy.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*
COPY scripts/requirements.txt /tmp/requirements.txt
# CPU torch: the image needs no GPU (Comfy does the generation).
RUN python3 -m venv /opt/py \
  && /opt/py/bin/pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r /tmp/requirements.txt
ENV NODE_ENV=production NIFL_PYTHON=/opt/py/bin/python
COPY --from=build /app ./
EXPOSE 4800
CMD ["npm", "start"]
