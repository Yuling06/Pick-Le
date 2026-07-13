# Body Scan & 3D Avatar Pipeline (Phase 1)

## What was added

```
Registration -> Login -> /setup (height+weight) -> /scan (camera: front+side)
  -> MediaPipe Pose + Segmentation (in-browser)
  -> POST /api/body-scan  (server computes chest/waist/hip/shoulder)
  -> PostgreSQL user_profiles updated, profile_status = 'pending'
  -> Blender spawned headless -> avatar.glb
  -> stored in `files` table, avatar_url set, profile_status = 'completed'
  -> /home renders it with Three.js (AvatarViewer - drag to rotate, scroll to zoom, right-click to pan)
```

New/changed files:
- `src/pages/CameraScan.jsx` - camera capture UI
- `src/lib/poseUtils.js` - MediaPipe pose + segmentation -> pixel geometry
- `src/components/AvatarViewer.jsx` - Three.js glb viewer
- `server/src/routes/bodyScan.js` - POST /api/body-scan
- `server/src/services/measurements.js` - pixel geometry -> cm measurements
- `server/src/services/avatarGenerator.js` - spawns Blender, stores the glb
- `server/blender/generate_avatar.py` + `server/blender/README.md`
- `src/pages/BodyProfileSetup.jsx`, `src/pages/Home.jsx`, `src/pages/LoadingScreen.jsx` - updated for the new flow

## Setup checklist

1. `npm install` (root) - pulls in `@mediapipe/tasks-vision` (already added to package.json).
2. Install Blender locally (or on your server) and set `BLENDER_PATH` in `server/.env`.
3. Build/obtain a rigged base mesh with the shape keys the script expects - see
   `server/blender/README.md`. **This is the one piece you must create yourself** -
   nothing can generate a realistic human mesh without a base asset.
4. Run `blender -b ... -P generate_avatar.py -- ...` standalone (see README) before
   wiring it into the app, so you're debugging one thing at a time.
5. Start the server, run the app, go through Setup -> Scan -> Home.

## Known accuracy limitations (be upfront about these in your report)

- Two photos + height/weight give an **estimate**, not a lab-grade measurement.
  Expect roughly ±3-6cm error on chest/waist/hip versus a tape measure, more for
  loose clothing or poor lighting/pose.
- The chest/waist/hip Y-positions are estimated as fixed fractions between the
  shoulder and hip landmarks (industry systems use trained regression models on
  thousands of real scans instead - out of scope for a first phase project, but
  worth mentioning as future work).
- Segmentation mask quality (and thus width/depth) degrades with baggy clothing,
  poor contrast against the background, or partial body visibility.

## If something doesn't work

- **MediaPipe detects no person**: make sure the whole body is in frame, in decent
  lighting, and that `numPoses: 1` in `poseUtils.js` matches - check the browser console
  for the actual MediaPipe error before assuming it's a code bug.
- **Blender exits non-zero**: run the standalone command in `server/blender/README.md`
  directly in a terminal - Blender's own stderr will tell you exactly which shape key
  or object name is wrong. This is almost always a name mismatch between
  `generate_avatar.py` and your actual `base_avatar.blend`.
- **Avatar generation times out**: bump `BLENDER_TIMEOUT_MS`, or check the base mesh
  file size / your machine's Blender startup time.
- **Measurements look clearly wrong (too small/huge)**: the calibration is entirely
  driven by `front.pixelHeight` vs the user's `height_cm` - log that value first, it's
  the most common source of a wrong scale factor (e.g. camera crops out the feet).
- **If Blender integration proves too heavy for your timeline**: fall back gracefully -
  keep the manual measurement inputs as an alternate path (the old
  `BodyProfileSetup.jsx` code is easy to restore), and/or skip real avatar generation
  for phase 1, storing just the computed measurements and showing a generic avatar
  scaled by height/build category. A working "measurements pipeline + fake avatar"
  demo is safer for a deadline than a broken end-to-end Blender pipeline.
