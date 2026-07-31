# Pick-le — Client (Frontend)

React + Vite single-page application for the Pick-le virtual try-on
prototype.

## Stack

- React (Vite)
- Tailwind CSS + shadcn/ui components
- Framer Motion for transitions
- `AvatarViewer` component for rendering `.glb` 3D models inline

## Structure

```
src/
├── App.jsx              # Route definitions
├── main.jsx             # Entry point
├── api/
│   └── apiClient.js      # Thin wrapper over the backend REST API
│                          # (auth, generic entity CRUD, file URL resolution)
├── components/           # Shared UI components (Button, Card, AvatarViewer,
│                          # FeedbackSurveyForm, EditMeasurementsDialog, etc.)
├── hooks/
├── lib/
│   └── AuthContext.jsx   # Auth state/session handling
├── pages/
│   ├── Home.jsx              # Landing/profile summary + past requests
│   ├── ClothingUpload.jsx    # Garment photo/chart upload form
│   ├── LoadingScreen.jsx     # Polls request status (profile or fit request)
│   ├── RecommendationPage.jsx# Displays AI result + 3D fitted avatar + feedback
│   └── Admin.jsx             # Feedback-only admin view
└── utils/
```

## Key Flows

**Onboarding:** user signs up → provides body measurements/photos → avatar
generation is triggered server-side → `LoadingScreen` polls until the
avatar is ready → `Home` displays the avatar and profile.

**Garment fitting:** user uploads a garment (front photo, back photo, size
chart) via `ClothingUpload` → a `fit_requests` row is created → the server
runs the full Phase 2 pipeline asynchronously → `LoadingScreen` polls the
request status → `RecommendationPage` displays the result: recommended
size, confidence, 3D visualization (or a graceful rejection message if the
chart was unusable or no size fits), per-region fit notes, a style
suggestion, and a feedback form.

**Admin:** `/admin` shows an aggregated view of submitted user feedback
(average ratings + individual responses). No fit-request approval/
moderation workflow exists in this prototype by design.

## Environment

Client-side environment variables (if any) are configured via Vite's
standard `.env` handling. The client communicates with the server's REST
API — see the server README for API base URL configuration.

## Running Locally

```bash
npm install
npm run dev
```

See the root `package.json` for the exact dev/build scripts in use.
