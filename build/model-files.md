# Model files

Every model the workflows load, where ComfyUI expects it, and its licence. All open weights;
no partner (API) nodes. Folders are relative to ComfyUI's model root (here `~/models`, see
ComfyUI's `extra_model_paths.yaml`). Weights are not part of this repository: each is downloaded
by the user and keeps its own licence. Licences were read from the model cards on 2026-10-29;
this is not legal advice. `node scripts/comfy-check.ts <comfy url>` says which are missing.

| File | Folder | Used by | Source | Licence |
| --- | --- | --- | --- | --- |
| `z_image_turbo_int8_convrot.safetensors` | `diffusion_models/` | 01_concept, 02_set_paint, 03_key_detail | Comfy-Org/z_image_turbo (Tongyi-MAI/Z-Image-Turbo) | Apache-2.0 |
| `qwen_3_4b_fp8_mixed.safetensors` | `text_encoders/` | the Z-Image graphs | Comfy-Org/z_image_turbo | Apache-2.0 |
| `ae.safetensors` | `vae/` | the Z-Image graphs | black-forest-labs/FLUX.1-schnell autoencoder | Apache-2.0 |
| `qwen_image_edit_2511_int8_convrot.safetensors` | `diffusion_models/` | 01_swap, 01_brush, 01_remove, 01_fill, 01_change, 01_edit, 02_set_fill | Comfy-Org (Qwen/Qwen-Image-Edit-2511) | Apache-2.0 |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `text_encoders/` | the Qwen graphs | Comfy-Org/Qwen-Image_ComfyUI | Apache-2.0 |
| `qwen_image_vae.safetensors` | `vae/` | the Qwen graphs | Comfy-Org/Qwen-Image_ComfyUI | Apache-2.0 |
| `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | `loras/` | the Qwen graphs (4 steps, CFG 1) | lightx2v/Qwen-Image-Edit-2511-Lightning | Apache-2.0 |
| `sam3.1_multiplex_fp16.safetensors` | `sam3/` (downloaded by ComfyUI-RMBG from 1038lab/sam3) | 01_parts, 03_key_detail | facebook/sam3 (SAM 3.1), gated | SAM License (Meta): royalty-free, commercial use allowed; no military, weapons or sanctioned use |
| `MiaoshouAI/Florence-2-base-PromptGen-v1.5` | `LLM/` (downloaded by ComfyUI-Florence2) | 01_tags | MiaoshouAI | MIT |
| `microsoft/Florence-2-large` | `LLM/` (downloaded by ComfyUI-Florence2) | 03_key_caption | Microsoft | MIT |
| `birefnet.safetensors` | `background_removal/` | 02_cutout | ZhengPeng7/BiRefNet | MIT |
| `moge_2_vitl_normal_fp16.safetensors` | `geometry_estimation/` | 02_moge (the set as a 3D stage: mesh and depth) | Comfy-Org (Ruicheng/moge-2-vitl-normal) | MIT |
| `hunyuan3d-dit-v2-mv-turbo_fp16.safetensors` | `checkpoints/` | 02_turnaround_mesh (the character in 3D) | tencent/Hunyuan3D-2mv | Tencent Hunyuan Community License: **not licensed in the EU, UK or South Korea**; outputs may not train other models |
| `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` | `diffusion_models/` | 03_shot | Lightricks/LTX-2.5 (int8 repack), gated | LTX-2.x Community License: free under USD 10M yearly revenue; acceptable-use policy |
| `ltx-2.5-video-vae-bf16.safetensors` | `vae/` | 03_shot | Lightricks/LTX-2.5 | LTX-2.x Community License |
| `ltx-2.5-audio-vae-bf16.safetensors` | `vae/` | 03_shot | Lightricks/LTX-2.5 | LTX-2.x Community License |
| `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors` | `text_encoders/` | 03_shot | Lightricks/LTX-2.5 (Gemma 4 12B + projection) | Gemma 4 is Apache-2.0; this Lightricks file ships under the LTX-2.x Community License |

Custom node packs: ComfyUI-RMBG (`SAM3Segment`), ComfyUI-Florence2
(`DownloadAndLoadFlorence2Model`, `Florence2Run`), ComfyUI-KJNodes (`GrowMaskWithBlur`),
ComfyUI-Impact-Pack (`MaskToSEGS`, `DetailerForEach`). Everything else is core ComfyUI (v0.38+).

## Licence notes

- **LTX-2.5** is open weights, not OSI open source: free for people and companies under USD 10M
  yearly revenue, under an acceptable-use policy Lightricks may update; derivatives stay under
  the same licence. It is the video model, so every shot depends on it.
- **Hunyuan3D-2** does not cover the EU, the UK or South Korea. Users there should skip the
  character's 3D model (Character step); the rest of the wizard does not need it.
- **SAM 3** is gated: accept Meta's terms on Hugging Face before ComfyUI-RMBG can download it.
