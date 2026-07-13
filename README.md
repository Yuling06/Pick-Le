# Pick-le

A full-stack app for AI-assisted clothing fit recommendations, with a React
(Vite) frontend, an Express API, and PostgreSQL for storage — no third-party
backend dependency.

## Project structure

```
Pick-le/
├── src/            # React frontend (Vite)
├── server/         # Express + PostgreSQL API
└── index.html
```

## Prerequisites

- Node.js 18+
- A running PostgreSQL instance (local or hosted)

## 1. Backend setup (`server/`)

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/pickle
JWT_SECRET=<a long random string>
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Start the API (it creates all tables automatically on boot from `src/schema.sql`):

```bash
npm run dev
```

The API listens on `http://localhost:3001`. Health check: `GET /api/health`.

## 2. Frontend setup

From the project root:

```bash
npm install
cp .env.example .env   # VITE_API_URL=http://localhost:3001
npm run dev
```

The app runs on `http://localhost:5173`.

## How auth works

- Email/password signup & login, issuing a JWT (30-day expiry) stored in
  `localStorage`.
- `ProtectedRoute` gates authenticated pages and redirects to `/login`.

## File uploads

Uploaded images (clothing photos, size charts, AI visualizations) are
stored as `BYTEA` blobs directly in the `files` table in Postgres, and served
back via `GET /api/files/:id`.

## Data model

| Table              | Purpose                                   |
|---------------------|--------------------------------------------|
| `users`             | Accounts (email, password hash, role, gender - required at signup) |
| `user_profiles`     | Body measurements, style preference, avatar reference |
| `fit_requests`      | Clothing fit requests submitted by users  |
| `fit_results`       | AI-provided fit recommendations        |
| `feedback_surveys`  | Post-result user feedback                 |
| `files`             | Uploaded image blobs + generated `.glb` avatars |

See **[Phase 1: Body Scanner & 3D Avatar](#phase-1-body-scanner--3d-avatar)** below for how `user_profiles`' measurement and avatar fields actually get populated.

## Build for production

```bash
npm run build   # frontend -> dist/
```

Deploy `server/` as a normal Node process (or behind a process manager like
pm2), and point `VITE_API_URL` at its public URL when building the frontend.

---

## Phase 1: Body Scanner & 3D Avatar

After signup (email, password, and a **required** gender selection), a user
enters their height and weight, then takes two photos (front and side) with
their camera. From those two photos alone, the app estimates their body
measurements and generates a personalized, posable 3D avatar - no manual
measuring, no tape measure, no third-party body-scanning service.

### How the body scanner works

**1. Pose detection (client-side, in the browser)**

Each photo is run through [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe)
entirely in the browser (WASM, no server round-trip) - it returns 33 named
skeleton points (shoulders, hips, knees, ankles, elbows, wrists, nose, ears),
each with an `(x, y, z)` position and a `visibility` confidence score.

Before any measurement math runs, the photo is validated: if major landmarks
have low visibility, the person appears heavily rotated (not facing the
camera), or an arm reads as blocking the torso, the scan is rejected with a
specific retake instruction rather than silently producing bad numbers.

**2. Calibrating real-world scale**

Since a photo only gives pixel positions, not centimeters, the app needs a
reference to convert one to the other. It computes **four independent**
height estimates (from shoulder height, hip height, knee height, and nose
height, each using a standard anthropometric proportion of total human
height) and takes the **median** - so one landmark being slightly off (due to
pose or angle) can't throw off the whole calibration, since the other three
outvote it.

**3. Skeletal measurements**

Shoulder width, hip width, arm length, leg length, torso length, and inseam
all come directly from landmark-to-landmark pixel distances, converted to cm
using the calibrated scale.

**4. Body silhouette width & depth**

MediaPipe's landmarks are joints - there's no "chest" or "waist" landmark.
To get those, each photo is *also* run through MediaPipe's Selfie
Segmentation model, producing a pixel mask of exactly which parts of the
image are "person." At each body height (chest/waist/hip, derived as a
proportion between the shoulder and hip landmarks), the app scans outward
from the body's centerline until it hits background - the front photo gives
**width** this way, the side photo gives **depth**.

**5. Circumference via ellipse geometry**

Each cross-section (chest/waist/hip) is modelled as an ellipse using the
measured width and depth, and converted to a circumference with Ramanujan's
approximation. If only a front photo were available, depth would be
estimated from a published width-to-depth anthropometric ratio instead - but
since the side photo is now a required step, this is always the
real-measurement path.

**6. Guaranteed realistic output**

Every final chest/waist/hip/shoulder value passes through a validation step
that compares it against a realistic range for the person's actual
height/BMI (scaled from a reference build) and clamps anything outside that
range. If a measurement fails to compute at all (e.g. a body part wasn't
clearly visible in the mask), it's substituted with that same reference
model's estimate rather than ever being left blank - chest/waist/hip are
guaranteed to always have a plausible value, never `null`.

### How the 3D avatar works

**1. A single neutral base model**

`server/blender/neutral_base_avatar.glb` is a rigged/shape-keyed human mesh
built in Blender using the MPFB (MakeHuman Plugin For Blender) addon. It has
no gender variant - one mesh, deformed per-user by shape keys.

**2. Shape keys, not custom code**

The mesh has MPFB's own built-in `measure-*` morph targets - each
measurement (bust, waist, hips, neck, thigh, calf, etc.) is actually **two**
shape keys, one to shrink below the mesh's default size and one to grow
above it. Given a target measurement in cm, the server picks whichever
direction is needed and dials that shape key's weight in proportion to how
far the target is from the mesh's calibrated baseline.

Height and weight use two more custom-baked shape keys (`Key_HeightMin/Max`,
`Key_WeightMin/Max`) instead of scaling the mesh - height is calibrated
against real measured centimeters at each extreme; weight is anchored to
BMI (17/22/32 = slim/average/heavy), since there's no way to read "weight"
directly off a static mesh's geometry the way height can be measured.

**3. Headless Blender generation**

When a scan completes, `server/src/services/avatarGenerator.js` spawns
Blender in the background (`blender -b --python generate_avatar.py`), which
imports the neutral base, sets every shape key according to the user's
measurements, and exports a new `.glb`. This runs as a background job so the
HTTP request returns immediately - the frontend polls `user_profiles` for
`profile_status` to become `completed`.

**4. Storage and display**

The generated `.glb` is stored as a `bytea` blob in the `files` table (same
mechanism as any other uploaded file) and referenced from
`user_profiles.avatar_url`. `AvatarViewer.jsx` loads it with Three.js's
`GLTFLoader`, with `OrbitControls` for drag-to-rotate and scroll-to-zoom -
this is what makes the avatar "posable" in the sense of being freely
viewable from any angle, though it isn't rigged with a skeleton for pose
animation in this phase.

### Known limitations (honest, not hidden)

- Circumference accuracy depends on photo quality and pose - this is an
  estimate, not a substitute for a real tape measure or 3D body scanner.
- `neck-height` (one of the 14 avatar shape keys) has no scan-based estimate
  at all - MediaPipe's body pose model has no chin/jaw landmark, so it's
  left at the mesh's default rather than guessed at.
- The realistic-range validation is calibrated against one reference build
  (170cm, BMI ~19) and scaled from there - it's a reasonable general-purpose
  safety net, not a clinically validated model.
