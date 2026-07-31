# Pick-le — Prototype v2 Project Report

## Overview

Pick-le is a virtual try-on and AI-powered garment sizing prototype. A user
generates a personalized 3D avatar from body measurements, then uploads a
garment (photo + size chart) to receive an AI-driven size recommendation and
a 3D visualization of the garment fitted onto their own avatar.

This document describes how the prototype is built, its current
limitations, and the planned next steps. It complements the system-specific
README files (client, server, body scanner, 3D avatar, FabricDiffusion,
Gemini integration).

---

## Prerequisites

Running this prototype locally requires setting up **three separate
runtime environments**, since the system deliberately bridges Node,
Blender's embedded Python, and a dedicated conda environment via
subprocess calls rather than shared in-process imports.

### 1. Node.js (server + client)

- Node.js (project developed/tested on Node 22.x)
- `npm install` in both the project root (client) and `server/`

### 2. PostgreSQL database

- A Postgres database (this prototype uses a hosted Supabase instance,
  but any Postgres instance works)
- `DATABASE_URL` set in `server/.env`
- Schema is applied automatically on server startup via `initDb()`
  (`server/src/schema.sql`)

### 3. Blender (headless)

- Blender installed locally (tested on Blender 5.2 LTS)
- The MPFB (MakeHuman Plugin For Blender) add-on installed and enabled
  inside that Blender installation — required for avatar generation
  (Phase 1.3) and for the shape-key-based neck anchor extraction used in
  garment registration (Phase 2.3a)
- `BLENDER_PATH` set in `.env` if `blender` is not on the system PATH

### 4. Conda environment (FabricDiffusion)

- Miniconda or Anaconda installed
- A dedicated conda environment created from
  `server/fabric_diffusion/environment.yml`:
  ```bash
  cd server/fabric_diffusion
  conda env create --file=environment.yml
  ```
  This installs Python 3.10, PyTorch, diffusers, and transformers into an
  isolated environment named `fabric-diff`.
- **This environment is never manually activated at runtime** — the
  server invokes its Python executable directly by full path. After
  creating the environment, find that path once:
  ```bash
  conda activate fabric-diff
  where python      # Windows
  which python      # macOS/Linux
  ```
  and set the result as `FABRIC_DIFFUSION_PYTHON` in `server/.env`. There
  is no safe default for this variable — it must point into the
  `fabric-diff` environment specifically, not the system Python.
- A GPU with CUDA support is strongly recommended; FabricDiffusion will
  run on CPU but significantly slower (see the latency limitation noted
  below).

### 5. Google Gemini API key

- A Gemini API key from Google AI Studio, set as `GEMINI_API_KEY` in
  `server/.env`
- **Billing must be enabled on the associated Google Cloud project**,
  with a spending cap configured. The free tier's daily/per-minute
  request quotas are too low for anything beyond light, occasional
  testing — this pipeline makes two Gemini calls per garment-fitting
  request (see `GEMINI_README.md`), which exhausts the free tier
  quickly.
- The specific model version in use is pinned in `geminiService.js`
  (not a `-latest` alias) — check that string is still available to your
  account/region before relying on it; Gemini model availability differs
  by account tier and can change over time.

### 6. Environment files

Copy `.env.example` → `.env` at both the project root and inside
`server/`, and fill in all of the above (`DATABASE_URL`,
`GEMINI_API_KEY`, `BLENDER_PATH`, `FABRIC_DIFFUSION_PYTHON`, and any
timeout overrides).

---

## Roadmap — Two Main Phases

The system is built in two major phases, each broken into subphases.

### Phase 1 — User → Body Scanner → 3D Avatar

Goal: turn a user's photos/measurements into a personalized, riggable 3D
avatar.

**Phase 1.1 — Body Measurement Acquisition**
User provides body photos and/or manual measurements (height, weight,
chest, waist, hip, shoulder) through the client. See `BODY_SCANNER_README.md`.

**Phase 1.2 — Measurement Processing**
Raw measurements are calibrated (multi-landmark height calibration, ellipse
circumference math for circumferential measurements) and validated to
guarantee a complete, non-null measurement set.

**Phase 1.3 — Avatar Generation**
A neutral MPFB base mesh is reshaped via Blender shape keys
(`measure-*-incr`/`-decr`, height/weight macro keys) to match the user's
calibrated measurements, then exported as a `.glb`. See
`AVATAR_3D_README.md`.

**Output of Phase 1:** a personalized avatar `.glb`, stored against the
user's profile, ready to receive garments.

---

### Phase 2 — Cloth → AI Analysis + Garment Fitting → Fitted Avatar

Goal: take an uploaded garment (photo + size chart), determine the best
size for the user, deform and fit a matching pre-built garment template
onto the user's avatar, and texture it to resemble the real garment.

This phase splits into two branches that run **concurrently**, since
neither depends on the other's output, before being combined in a final
compositing step.

**Phase 2.1 — Garment Intake**
User uploads a garment front photo, back photo, and size chart image
(optionally, manual sizes — not yet wired into the AI flow, see
Limitations).

**Branch A — Sizing & Geometry**

- **Phase 2.2a — Gemini Analysis** (`GEMINI_README.md`)
  Gemini extracts the size chart's real measurements, classifies the
  garment (type, category, material), and produces a size recommendation
  that accounts for the user's body measurements, stated style preference
  (e.g. slim vs. streetwear), and the garment's material stretch
  behavior. Includes safeguards for unusable charts (label-only
  conversion tables) and garments that cannot fit any size.

- **Phase 2.3a — Garment Engine (Deformation + Registration + Collision)**
  A pre-built garment template (`.blend`) is selected based on Gemini's
  classification, then:
  - **Deformation** — the template mesh is reshaped per-region (bust,
    length, shoulder, sleeve, cuff) to match the recommended size's real
    measurements.
  - **Registration** — the deformed garment is positioned onto the user's
    avatar using a shape-key-derived neck anchor.
  - **Collision Correction** — any remaining garment/body intersections
    are pushed out along the avatar's surface normal.

**Branch B — Texture**

- **Phase 2.2b — FabricDiffusion** (`FABRICDIFFUSION_README.md`)
  The garment's front photo is center-cropped and passed through
  FabricDiffusion, an AI texture-normalization model, to produce a clean,
  tileable fabric texture representative of the real garment's material.

**Phase 2.4 — Compositing**
Once both branches complete, the generated texture is applied as a
material to the fitted garment mesh, and the avatar + garment are
exported together as a final `.glb`.

**Output of Phase 2:** a fitted, textured 3D avatar (`.glb`) plus a
structured AI recommendation (recommended size, confidence score, fit
notes per body region, and a style suggestion), stored and displayed to
the user, with an option to submit feedback afterward.

---

## Known Limitations

1. **Neck anchor extraction is a manually-controlled heuristic, not
   fully automatic.** The avatar's neck anchor is derived from MPFB shape
   keys (`measure-neck-circ-incr`/`-decr`). Testing showed that using all
   affected vertices sometimes includes lower-head/jaw vertices that get
   pulled in by the shape key's weight painting, resulting in the
   garment registering too high. The current extractor always uses only
   the lowest 20% of affected vertices by height to correct for this. If
   a future avatar/template combination causes the garment to sit too
   *low* instead, the extractor should be switched back to using all
   vertices (no 20% restriction) for that case — this switch is currently
   manual, not auto-detected, since reliable automatic detection would
   require an independent signal not currently available from inside the
   extractor itself.

2. **Fitted avatar generation has a long wait time**, primarily due to
   FabricDiffusion's texture generation step, which can take several
   minutes depending on hardware (GPU availability, model load time
   since the model is reloaded fresh per request rather than kept in a
   persistent worker process).

3. **Only regular and slim-fit polo shirts are reliably supported by
   the current garment template.** Testing found that large deformation
   ratios (e.g. oversized sizing, where target measurements differ
   significantly from the template's own baseline) can produce visible
   mesh artifacts — pleating, bulging, or twisting — particularly from
   an identified bust/shoulder region interaction. A partial mitigation
   (capping the bust ratio) is in place, but oversized fits are not
   fully resolved. For user testing purposes, a manually-authored size
   chart calibrated to this template's safe range is used, so oversized
   recommendations remain visually acceptable during testing even though
   a real-world oversized garment chart would likely trigger the same
   artifact.

4. **Gemini API calls can fail** due to rate limits, daily free-tier
   quotas, or model availability changes (model aliases like
   `-latest` can silently point to a different, newer model version
   with different behavior). The pipeline logs and fails these requests
   gracefully (marking the request `failed`), but does not currently
   retry across model versions automatically.

5. **No dedicated manual-size-input flow.** The client UI collects an
   optional manual size input, but the backend pipeline currently only
   processes the AI chart-analysis path. If no size chart is uploaded,
   the request is marked `chart_unusable` rather than falling back to
   manual sizing.

6. **Only front and back garment photos are used as a single combined
   input for FabricDiffusion** (the front photo, center-cropped); there
   is no separate handling for prints/logos distinct from plain fabric
   texture (FabricDiffusion supports a separate print-focused model,
   `inference_print.py`, which is not currently wired into the
   pipeline).

7. **No automated regression test suite.** Verification so far has been
   done through targeted manual test scripts (isolating individual
   measurements, isolating pipeline stages) rather than an automated CI
   test suite.

8. **Admin visibility is limited to feedback.** Per this prototype's
   scope, there is no admin approval/moderation workflow for fit
   requests — the admin panel only surfaces aggregated user feedback.

---

## Future Plans

1. **Expand the garment template library**, including bottoms (pants,
   jeans, shorts). The pipeline's category-aware measurement mapping
   (`top` vs. `bottom`) and Gemini schema already anticipate this; what's
   needed is building and calibrating the actual `.blend` templates,
   their reference measurements, and their vertex-group landmarks.

2. **Resolve the neck anchor extraction limitation properly** — likely
   by replacing the current shape-key-vertex heuristic with a
   geometry-based neck ring detector that doesn't depend on how a given
   avatar's shape keys happen to be weight-painted, removing the need
   for a manually-chosen correction mode.

3. **Improve avatar and garment accuracy**, including:
   - Investigating and resolving the bust/shoulder deformation
     interaction directly (rather than only capping the ratio), likely
     via boundary-aware blending between adjacent deformation regions.
   - Increasing safe deformation range to properly support oversized and
     other extreme fits.
   - Adding mesh smoothing/relaxation after deformation for a more
     natural drape.

4. **Reduce fitted-avatar generation latency**, primarily by running
   FabricDiffusion as a persistent worker process (loading the model
   once) rather than a fresh subprocess per request.

5. **Build a manual-size-input fallback path** for garments without a
   usable size chart.

6. **Wire in FabricDiffusion's print/logo model** for garments with
   graphic prints, alongside the existing plain-texture model.

7. **Add an automated test suite** covering the deformation solver,
   registration, and the Gemini response schema, to catch regressions
   earlier than manual testing currently allows.

8. **Revisit rate-limit/model-availability resilience** for the Gemini
   integration — e.g. automatic fallback across pinned model versions,
   or a queued-retry mechanism for transient failures.
