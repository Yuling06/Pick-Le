# FabricDiffusion (Phase 2.2b)

AI fabric texture normalization, used to generate a clean, tileable
texture from a real garment photo, applied to the fitted 3D garment mesh
during compositing.

## What It Does

FabricDiffusion is a diffusion-based model (SIGGRAPH Asia 2024) trained
to rectify real-world garment photos — removing lighting artifacts,
perspective distortion, and pose-related deformation — into normalized,
flat texture maps suitable for 3D rendering. It does **not** classify
garments or extract measurements; that is Gemini's job (see
`GEMINI_README.md`).

## Pipeline Integration

1. The garment's front photo is **center-cropped** before being handed
   to FabricDiffusion (`cropToCenterSquare()` in `garmentFitter.js`,
   using `sharp`). This isolates a representative patch of fabric,
   avoiding background, borders, or unrelated contrasting panels that
   would otherwise be picked up and appear in the generated texture.
2. The cropped image is copied into a temporary input directory (the
   real CLI batch-processes a whole directory, not a single file).
3. `inference_texture.py` is run in its own conda environment (separate
   from Node and from Blender), producing a normalized texture PNG.
4. The generated texture is applied as a material (`Base Color`) on the
   fitted garment mesh during the final compositing step
   (`apply_texture_and_export.py`), with a per-template UV rotation
   correction applied where needed (see `template_registry.json`'s
   `uv_rotation_degrees`).

## Environment

FabricDiffusion requires its own conda environment (Python 3.10,
PyTorch, diffusers, transformers — see `fabric_diffusion/environment.yml`).
It is invoked from Node via `spawn()`, pointing directly at that
environment's `python.exe`/`python` binary (set via
`FABRIC_DIFFUSION_PYTHON` in `.env`) — the environment is never
"activated" at runtime; Node just calls the interpreter binary directly.

## Known Limitations

- **Significant latency.** The model is reloaded fresh on every
  subprocess invocation (no persistent worker process), which adds
  meaningful time on top of the actual inference cost. This is the
  primary contributor to the "long wait" limitation noted in the top-
  level Project Report.
- **No dedicated print/logo handling.** FabricDiffusion ships a separate
  `inference_print.py` model for graphic prints/logos, which is not
  currently wired into the pipeline — only the plain-texture model
  (`inference_texture.py`) is used.
- **Only the front photo is used** for texture generation; the back
  photo is currently only used by Gemini for classification/fit
  analysis, not for texture.
