# Gemini Integration (Phase 2.2a)

Uses Google's Gemini API to analyze an uploaded garment (front/back
photos + size chart) and produce a structured, style- and material-aware
size recommendation.

## What It Does

Given a garment's front photo, back photo, size chart image, the user's
body measurements, and their stated style preference, Gemini determines:

- **Garment type & category** (top vs. bottom) — used to select the
  matching pre-built garment template.
- **Material category** — matched against a fixed, code-side reference
  table of fabric stretch behaviors (e.g. cotton twill: 0% stretch,
  cotton/spandex blend: ~18% stretch), so material reasoning is grounded
  in defined data rather than free-form model guessing.
- **Full chart data** — every size row actually printed on the chart,
  with only the measurement columns that genuinely exist on that chart
  (never inventing values for missing columns).
- **A recommended size** — chosen based on the user's raw body
  measurements, adjusted for style preference (e.g. sizing up for an
  oversized/streetwear preference, sizing at or below raw match for a
  slim/fitted preference) and the garment's material stretch behavior.
- **Fit notes and a style suggestion**, and a **fit/no-fit determination**
  (see safeguards below).

## Two-Call Design

The chart-extraction step (a table-reading task) is split into two
sequential Gemini calls rather than one combined structured-output call:

1. **Extraction call** — plain text output, no schema constraint. Asked
   to read every row/column of the chart and report a `TOTAL ROWS: N`
   count. This gives the model room to reason step-by-step before
   committing to a final answer.
2. **Structuring call** — takes the extracted text and reformats it into
   the required JSON schema, plus performs the size recommendation.

This split exists because testing showed that asking a single structured
(schema-constrained) call to both extract *and* reason about a multi-row
table reliably produced incomplete results (missing rows, invented
fields) — separating "read the table" from "structure and recommend"
resolved this. A code-side check compares the extraction call's reported
row count against the final structured result and retries the
structuring call (up to a few times) if they don't match.

## Safeguards

- **Unusable chart detection** — Gemini is instructed to distinguish a
  real measurement chart from a size-*label* conversion table (e.g. a
  table only mapping UK/US/EU size names to each other, with no
  centimeter/inch values). If the chart has no real measurements, the
  request is marked `chart_unusable` rather than proceeding.
- **`fits_user` check** — Gemini determines whether any size on the
  chart could reasonably fit the user, accounting for style and material
  stretch. If not, the request is marked `rejected` with a reason.
- **Material-aware backstop (code-side)** — as an additional, independent
  check after Gemini's own `fits_user` determination, the server
  re-verifies that at least one size's primary circumference (bust for
  tops, waist for bottoms), including the material's stretch allowance,
  can reach the user's corresponding body measurement. This exists as a
  safety net against Gemini's own reasoning being wrong on this
  specific, most-important dimension.

## Model Versioning Note

The integration pins to a specific Gemini model version rather than a
`-latest` alias, since `-latest` was observed to silently roll forward to
a newer model mid-project with materially different behavior on this
exact chart-extraction task. Model version changes should be tested
deliberately (using the isolated `debug_structuring.js`-style test
scripts) before adopting a newer version.

## Known Limitations

- Free-tier daily/per-minute request quotas can be hit during heavy
  testing; billing must be enabled (with a spending cap configured) for
  sustained use.
- Model availability varies by account/region — not all model version
  strings are guaranteed accessible.
- The two-call design roughly doubles Gemini latency/cost per request
  compared to a single call, in exchange for reliability.
