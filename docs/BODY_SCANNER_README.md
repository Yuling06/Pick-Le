# Body Scanner (Phase 1.1 – 1.2)

Converts a user's raw body input (photos and/or manual entry) into a
clean, complete set of calibrated body measurements ready for avatar
generation.

## What It Does

- Captures body measurements needed downstream: height, weight, chest,
  waist, hip, shoulder (centimeters), plus a style preference used later
  in Phase 2 sizing logic.
- Applies multi-landmark height calibration and ellipse-circumference
  math for circumferential measurements derived from photo-based
  scanning, to reduce single-landmark measurement error.
- Guarantees a **never-null measurement set** — every required field is
  populated (calibrated from photos, or from manual input) before the
  profile is considered complete, so downstream avatar generation never
  receives partial data.

## Where It Lives

- Client: measurement collection UI (setup flow, `EditMeasurementsDialog`
  for later edits).
- Server: measurement storage on `user_profiles`
  (`chest_cm`, `waist_cm`, `hip_cm`, `shoulder_cm`, `height_cm`,
  `weight_kg`, `style_preference`).

## Output

A complete `user_profiles` row, which Phase 1.3 (Avatar Generation) reads
to drive Blender shape-key deformation, and which Phase 2 (Gemini
Analysis) later reads as the user's real-world body measurements for
size recommendation.

## Known Limitation

Weight is collected and stored but is not currently used by the Phase 2
Gemini sizing logic (it factors into Phase 1.3's avatar body-shape
generation via BMI-based shape key blending, not into garment sizing
directly).
