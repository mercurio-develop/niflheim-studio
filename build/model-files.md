# Model files

Every model the workflows load, where ComfyUI expects it, and its licence. All open weights;
no partner (API) nodes. Folders are relative to ComfyUI's model root (here `~/models`, see
ComfyUI's `extra_model_paths.yaml`). Licences marked *check* were not re-read for this build:
read the model card before redistributing.

| File | Folder | Used by | Source | Licence |
| --- | --- | --- | --- | --- |
| `z_image_turbo_int8_convrot.safetensors` | `diffusion_models/` | 01_concept | Comfy-Org/z_image_turbo (Tongyi-MAI/Z-Image-Turbo) | Apache-2.0 |
| `qwen_3_4b_fp8_mixed.safetensors` | `text_encoders/` | 01_concept | Comfy-Org/z_image_turbo | Apache-2.0 |
| `ae.safetensors` | `vae/` | 01_concept | FLUX.1-schnell autoencoder | Apache-2.0 (*check*) |
| `qwen_image_edit_2511_int8_convrot.safetensors` | `diffusion_models/` | 01_swap, 01_brush, 01_remove, 01_edit | Comfy-Org (Qwen/Qwen-Image-Edit-2511) | Apache-2.0 |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `text_encoders/` | the Qwen graphs | Comfy-Org/Qwen-Image_ComfyUI | Apache-2.0 |
| `qwen_image_vae.safetensors` | `vae/` | the Qwen graphs | Comfy-Org/Qwen-Image_ComfyUI | Apache-2.0 |
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `loras/` | the Qwen graphs (4 steps, CFG 1) | lightx2v/Qwen-Image-Edit-2511-Lightning | Apache-2.0 |
| `sam3.1_multiplex_fp16.safetensors` | `sam3/` (downloaded by ComfyUI-RMBG from 1038lab/sam3) | 01_parts (find a part by name) | facebook/sam3 (SAM 3.1) | SAM License (Meta; open weights, *check* terms) |
| `MiaoshouAI/Florence-2-large-PromptGen-v2.0` | `LLM/` (downloaded by ComfyUI-Florence2) | 01_tags | MiaoshouAI | MIT (*check*) |
| `moge_2_vitl_normal_fp16.safetensors` | `geometry_estimation/` | 02_moge (the set as a 3D stage: mesh and depth) | Comfy-Org (Ruicheng/moge-2-vitl-normal) | MIT (*check*) |

Custom node packs: ComfyUI-RMBG (`SAM3Segment`), ComfyUI-Florence2 (`DownloadAndLoadFlorence2Model`,
`Florence2Run`), ComfyUI-KJNodes (`GrowMaskWithBlur`). Everything else is core ComfyUI (v0.38+).

02_set_paint reuses the Z-Image files above at 1344x768. Later stages add LTX-2.5 (LTX-2.x
Community License: open weights, free under USD 10M revenue); listed here when its workflows land.
