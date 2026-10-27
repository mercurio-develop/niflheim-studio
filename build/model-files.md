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
| `sam2.1_hiera_base_plus` | `sam2/` (downloaded by ComfyUI-RMBG) | 01_parts | facebook/sam2.1-hiera-base-plus | Apache-2.0 |
| `GroundingDINO_SwinT_OGC` | `grounding-dino/` (downloaded by ComfyUI-RMBG) | 01_parts | IDEA-Research/GroundingDINO | Apache-2.0 |
| `MiaoshouAI/Florence-2-large-PromptGen-v2.0` | `LLM/` (downloaded by ComfyUI-Florence2) | 01_tags | MiaoshouAI | MIT (*check*) |

Custom node packs: ComfyUI-RMBG (`SAM2Segment`), ComfyUI-Florence2 (`DownloadAndLoadFlorence2Model`,
`Florence2Run`), ComfyUI-KJNodes (`GrowMaskWithBlur`). Everything else is core ComfyUI (v0.38+).

Later stages add LTX-2.5 (LTX-2.x Community License: open weights, free under USD 10M revenue)
and MoGe; they are listed here when their workflows land.
