# Pick-le — Server (Backend)

Node.js + Express backend orchestrating authentication, data storage, and
the full Phase 1 / Phase 2 pipeline (body scan → avatar, and garment →
AI recommendation + fitted 3D visualization).

## Stack

- Node.js (ESM), Express
- PostgreSQL (hosted via Supabase in this prototype)
- Blender (headless, invoked as a subprocess) for avatar generation and
  garment deformation/registration/export
- FabricDiffusion (Python, separate conda environment) for AI fabric
  texture generation
- Google Gemini API for garment/size-chart analysis and recommendation

## Structure

```
server/
├── blender/                    # Phase 1: avatar generation scripts
│   └── generate_avatar.py
├── garment_engine/              # Phase 2 (geometry): garment fitting engine
│   ├── core/                    # deformation, registration, collision, export
│   ├── models/                  # Measurement, MeasurementRegion data classes
│   ├── templates/                # Pre-built garment .blend templates + registry
│   └── validation/
├── fabric_diffusion/             # Phase 2 (texture): AI fabric texture model
│   ├── inference_texture.py
│   ├── inference_print.py
│   └── pipeline.py
└── src/
    ├── server.js                 # Express app entry point
    ├── db.js                     # Postgres pool + schema init
    ├── schema.sql                 # Full DB schema
    ├── middleware/
    │   └── auth.js                # JWT auth middleware
    ├── routes/                    # REST endpoints (entities, auth, files,
    │                              # fit-requests, feedback-surveys, etc.)
    └── services/
        ├── avatarGenerator.js      # Phase 1 orchestration (spawns Blender)
        ├── geminiService.js        # Phase 2 branch A: Gemini analysis
        └── garmentFitter.js        # Phase 2 orchestration (Gemini + garment_engine
                                     # + FabricDiffusion + compositing)
```

## Architecture Notes

- **Three separate runtime environments are involved**: Node (the server
  itself), Blender's embedded Python (for `garment_engine` and avatar
  generation), and a dedicated conda environment (for FabricDiffusion,
  which requires PyTorch/diffusers/transformers). These are bridged via
  `child_process.spawn()`, not in-process imports — each is invoked as a
  subprocess with file-based input/output (paths, not shared memory).

- **Fire-and-forget async pipeline**: routes that trigger long-running
  work (avatar generation, garment fitting) respond immediately after
  creating a database row, then run the actual pipeline in the
  background. The client polls for status via `LoadingScreen`.

- **Concurrent branches in Phase 2**: `garmentFitter.js` kicks off the
  Gemini analysis and the FabricDiffusion texture generation at the same
  time, since neither depends on the other's result. The garment_engine
  step (deformation/registration/collision) only starts once Gemini's
  result is available, since it needs the recommended size's target
  measurements.

- **Unit conversion**: Gemini's extracted chart measurements are always
  in centimeters; the garment templates' reference measurements are in
  meters (Blender scene units). `garmentFitter.js` converts between the
  two before building the measurements file `garment_engine` consumes.

## Environment Variables

See `.env.example` for the full list. Notable ones:

- `DATABASE_URL` — Postgres connection string
- `GEMINI_API_KEY` — Google Gemini API key
- `BLENDER_PATH` — path to the Blender executable (if not on system PATH)
- `FABRIC_DIFFUSION_PYTHON` — path to the conda environment's Python
  executable (required; no safe default, since it must point into a
  specific environment)
- `GARMENT_ENGINE_TIMEOUT_MS` / `FABRIC_DIFFUSION_TIMEOUT_MS` — subprocess
  timeouts

## Running Locally

```bash
cd server
npm install
node src/server.js
```

FabricDiffusion's conda environment must be created separately (see
`FABRICDIFFUSION_README.md`) and its Python path set in `.env` before the
garment-fitting pipeline will work end to end.
