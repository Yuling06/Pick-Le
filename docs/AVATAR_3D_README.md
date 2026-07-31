# 3D Avatar Generation (Phase 1.3)

Generates a personalized, riggable 3D avatar (`.glb`) from a user's
calibrated body measurements, using MPFB (MakeHuman Plugin For Blender)
and Blender's shape-key system.

## How It Works

1. A neutral base avatar mesh (`neutral_base_avatar.glb`) is loaded in a
   headless Blender instance.
2. A calibration table (`MEASURES`) maps each body dimension (bust,
   underbust, waist, hips, neck, shoulder) to a pair of shape keys —
   `measure-<dimension>-incr` and `measure-<dimension>-decr` — each with
   a baseline value and a positive/negative range.
3. For each measurement, the target value is converted into a shape-key
   blend value: values above baseline drive the `-incr` key, values
   below drive the `-decr` key, clamped to `[0, 1]`.
4. Height and weight are handled as macro keys (`Key_HeightMin/Max`,
   `Key_WeightMin/Max`), with weight expressed as BMI relative to a
   baseline BMI anchor.
5. The resulting avatar is exported as `.glb` and stored against the
   user's profile.

## Key Files

- `server/blender/generate_avatar.py` — the calibration table and
  shape-key blending logic described above.
- `server/src/services/avatarGenerator.js` — Node-side orchestration:
  spawns headless Blender, passes the user's measurements in, retrieves
  and stores the resulting `.glb`.

## Neck Anchor (used later, in Phase 2 registration)

The avatar's neck position — needed later to register a garment onto the
body — is derived from the same `measure-neck-circ-incr`/`-decr` shape
keys, via `ShapeKeyNeckExtractor` (in `garment_engine/core/`). See
`GARMENT_ENGINE` internals and the top-level Project Report's
Limitations section for the current caveat around this extractor.

## Known Limitations

- The `MEASURES` calibration table itself was originally calibrated
  against an earlier reference mesh, not the current neutral base avatar
  — some dimensions (e.g. bust, neck) can clamp at their shape key's
  maximum for larger body types, since the calibrated range is narrower
  than ideal. This is a documented, accepted limitation for this
  prototype stage.
- Shape-key weight painting on the base mesh isn't perfectly isolated to
  the intended body region for every key — see the Project Report's neck
  anchor limitation, which stems from this same underlying issue as seen
  from the garment-fitting side.
