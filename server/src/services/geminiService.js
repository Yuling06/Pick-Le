/**
 * geminiService.js
 *
 * Phase 7 - Gemini Garment Analysis + Size Recommendation
 *
 * Model pinned to 'gemini-3.5-flash' explicitly (not the '-latest'
 * alias, which silently rolled forward to a newer model with
 * different behavior on this task).
 *
 * Two sequential Gemini calls:
 *   1. extractChartAsText() - plain text output, ONLY literal OCR
 *      extraction of every row/column actually printed on the chart.
 *      Confirmed reliable via testing.
 *   2. structureAndRecommend() - structured JSON output, reformats the
 *      already-extracted text and performs the style/material-aware
 *      size recommendation.
 *
 * SIZE_ENTRY_SCHEMA uses a {field, value} PAIR ARRAY for measurements,
 * rather than many independent optional named properties (bust,
 * length, cuff, waist, hip...). Testing confirmed the many-optional-
 * properties shape reliably produced duplicate/incomplete entries even
 * with finishReason: STOP (a schema-shape problem for constrained
 * decoding, not a truncation or prompting problem) - the {field,
 * value} pair shape produced a clean, complete, correct result on the
 * same input. flattenSizeEntries() converts the pair-array shape back
 * into flat objects for the rest of the pipeline to consume unchanged.
 *
 * cleanChartData() filters out-of-category fields and de-duplicates
 * entries by size, keeping the most complete one - retained as a
 * safety net even with the improved schema.
 */

import { GoogleGenAI } from '@google/genai';
import { readFile } from 'fs/promises';

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GEMINI_MODEL = 'gemini-3.6-flash';

// ===========================================================================
// Material stretch reference table
// ===========================================================================

export const MATERIAL_STRETCH_REFERENCE = {
  cotton_twill: { stretch_percent: 0, effect: 'Little to no give. Fits true to chart measurements. Runs slightly tight if user is between sizes.' },
  cotton_jersey: { stretch_percent: 5, effect: 'Slight give. Chart measurements are roughly accurate, minor comfort margin.' },
  cotton_spandex_blend: { stretch_percent: 18, effect: 'Notable stretch. A size that looks tight on the chart will likely still fit comfortably - consider sizing down from a pure-cotton recommendation.' },
  polyester: { stretch_percent: 3, effect: 'Minimal stretch, but often has a looser drape than cotton at the same measurement - can look larger than the number suggests.' },
  polyester_rib_knit: { stretch_percent: 12, effect: 'Moderate stretch, clings to body shape - true to chart size, sometimes slightly smaller-fitting.' },
  denim: { stretch_percent: 0, effect: 'Rigid, no give at all. Chart measurements are the hard ceiling - do not size down expecting stretch.' },
  denim_stretch_blend: { stretch_percent: 10, effect: 'Moderate stretch typical of modern stretch denim/jeans - some give, but chart measurements still matter more than with knit fabrics.' },
  linen: { stretch_percent: 0, effect: 'No stretch, and runs looser/boxier than the raw measurements suggest due to typical loose-weave cut.' },
  wool_blend: { stretch_percent: 4, effect: 'Minimal stretch, structured drape - true to chart.' },
  silk: { stretch_percent: 2, effect: 'Almost no stretch, drapes closely - true to chart, unforgiving of tight fits.' },
};

function buildMaterialReferenceText() {
  const lines = ['Reference table for fabric stretch behavior:'];
  for (const [material, data] of Object.entries(MATERIAL_STRETCH_REFERENCE)) {
    lines.push(`- ${material.replace(/_/g, ' ')}: ~${data.stretch_percent}% stretch. ${data.effect}`);
  }
  return lines.join('\n');
}

// ===========================================================================
// Category -> relevant measurement fields (used by cleanChartData)
// ===========================================================================

const CATEGORY_FIELDS = {
  top: ['bust', 'length', 'sleeve_length', 'cuff', 'neck_opening', 'shoulder_width'],
  bottom: ['waist', 'hip', 'inseam', 'thigh', 'rise', 'length'],
};

const MEASUREMENT_FIELD_NAMES = [
  'bust', 'length', 'sleeve_length', 'cuff', 'neck_opening', 'shoulder_width',
  'waist', 'hip', 'inseam', 'thigh', 'rise',
];

// ===========================================================================
// Response schema (used only by call 2)
// ===========================================================================

const MEASUREMENT_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    field: { type: 'string', enum: MEASUREMENT_FIELD_NAMES },
    value: { type: 'number' },
  },
  required: ['field', 'value'],
};

const SIZE_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    size: { type: 'string', description: 'The size label exactly as printed on the chart, e.g. "S", "M", "L", "XL".' },
    measurements: {
      type: 'array',
      items: MEASUREMENT_ENTRY_SCHEMA,
      description: 'One {field, value} pair per measurement actually printed for this size row.',
    },
  },
  required: ['size', 'measurements'],
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    chart_has_measurements: {
      type: 'boolean',
      description: 'False if the chart contains ONLY size-label conversions (e.g. UK/US/EU/IT size numbers) with no real cm/inch measurements.',
    },
    chart_issue_reason: {
      type: 'string',
      description: 'Required if chart_has_measurements is false. Empty string otherwise.',
    },
    garment_type: {
      type: 'string',
      enum: ['polo'], // update this list as you add more templates to template_registry.json
      description: 'Must be exactly one of the supported garment types listed.',
    },
    garment_category: {
      type: 'string',
      enum: ['top', 'bottom'],
    },
    material_guess: {
      type: 'string',
      description: 'Must be one of the keys from the provided material stretch reference table.',
    },
    chart_data: {
      type: 'array',
      items: SIZE_ENTRY_SCHEMA,
      description: 'One entry per size row that was actually extracted - must match the "TOTAL ROWS" count from the extraction text.',
    },
    fits_user: {
      type: 'boolean',
      description: 'False if no extracted size could fit this user, or if chart_has_measurements is false.',
    },
    rejection_reason: {
      type: 'string',
      description: 'Required if fits_user is false and chart_has_measurements is true.',
    },
    recommended_size: {
      type: 'string',
      description: 'Must exactly match the "size" field of one of the entries in chart_data.',
    },
    confidence_score: { type: 'number' },
    primary_fit_note: { type: 'string' },
    secondary_fit_note: { type: 'string' },
    tertiary_fit_note: { type: 'string' },
    style_suggestion: { type: 'string' },
  },
  required: [
    'chart_has_measurements', 'chart_issue_reason', 'garment_type', 'garment_category',
    'material_guess', 'chart_data', 'fits_user', 'rejection_reason', 'recommended_size',
    'confidence_score', 'primary_fit_note', 'secondary_fit_note', 'tertiary_fit_note',
    'style_suggestion',
  ],
};

// ===========================================================================
// Call 1: Literal OCR extraction only
// ===========================================================================

async function extractChartAsText(frontBytes, backBytes, chartBytes) {
  const prompt = `Look carefully at the THIRD image, a garment size chart.

STEP 1: Determine if this chart contains actual measurements (cm/inches for chest, bust, length, waist, etc.) or if it ONLY converts between size-label systems (e.g. UK/US/EU/IT size numbers/labels with no physical measurements anywhere). If it's ONLY a label-conversion table, say so clearly and stop here.

STEP 2: If real measurements are present, count the number of size rows in the chart. State this count explicitly as: "TOTAL ROWS: N" (replace N with the actual number).

STEP 3: Read EVERY size row, one at a time, in order shown in the image.
For every measurement column visible in the chart:
- If the column exists, extract it.
- Do not skip any visible measurement.
- Do not stop after extracting one or two columns.
- Every row should contain every measurement printed for that row, not a subset.
Do not skip any row - go through all of them, even ones that require more careful reading.
Do NOT guess, estimate, or extrapolate any size that is not literally printed as its own row in the image. Only report what is actually shown.

STEP 4: Also identify (from the first two images, front/back):
- The garment type (e.g. polo, hoodie, jeans, chinos).
- Whether it is a TOP or a BOTTOM.
- Which single fabric/material category best matches its visible texture and drape - choose exactly ONE from: cotton twill, cotton jersey, cotton spandex blend, polyester, polyester rib knit, denim, denim stretch blend, linen, wool blend, silk.

Respond in plain text, clearly organized by row. Do not respond in JSON.`;

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      { text: prompt },
      { inlineData: { data: frontBytes.toString('base64'), mimeType: 'image/jpeg' } },
      { inlineData: { data: backBytes.toString('base64'), mimeType: 'image/jpeg' } },
      { inlineData: { data: chartBytes.toString('base64'), mimeType: 'image/jpeg' } },
    ],
  });

  return response.text;
}

function parseReportedRowCount(extractedText) {
  const match = extractedText.match(/TOTAL ROWS:\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

// ===========================================================================
// Call 2: Structure the extraction into schema + perform recommendation.
// ===========================================================================

async function structureAndRecommend(extractedText, bodyMeasurements, stylePreference) {
  const materialReferenceText = buildMaterialReferenceText();

  const prompt = `Below is a plain-text extraction of a garment's size chart:

---
${extractedText}
---

Convert this into the required structured format.

chart_data must be an array with EXACTLY one entry per size row mentioned above - if the extraction states "TOTAL ROWS: N", chart_data must have exactly N entries, no more and no fewer. Never omit a row that was listed above, and never produce more than one entry for the same size. For each entry, populate "measurements" with one {field, value} pair per measurement column actually mentioned for that size in the text above - never invent a field or fill a missing value with 0, and never omit a measurement that was mentioned in the text.

If the extraction indicates the chart has NO real measurements (only size-label conversions), set chart_has_measurements=false, chart_data to an empty array, fits_user=false, recommended_size to an empty string, confidence_score to 0.0.

${materialReferenceText}

The user's body measurements (cm): ${JSON.stringify(bodyMeasurements)}
The user's style preference: '${stylePreference}'

Recommend a size that MUST exactly match one of the "size" values in your own chart_data output - never recommend a size that isn't one of the rows actually extracted above.
- Loose/oversized/streetwear preference -> prefer sizing UP from the user's raw body-measurement match.
- Regular/fitted/slim preference -> prefer sizing at or slightly below the user's raw body-measurement match.
- High-stretch material -> a size that looks tight on paper may still fit comfortably; consider sizing down one step from what a zero-stretch material would require.
- Zero-stretch/rigid/boxy material -> the chart measurement is a hard ceiling; do not size down expecting give that will not happen.
- For BOTTOMS: inseam/length is about proportions, not stretch or style - do not adjust it for style preference.

Only set fits_user=false if truly no extracted size could reasonably fit this user even with style and material factored in.

Provide primary_fit_note/secondary_fit_note/tertiary_fit_note (for TOPS: chest, shoulder, sleeve; for BOTTOMS: waist, hip, inseam) and a one-sentence style_suggestion.`;

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  return JSON.parse(response.text);
}

// ===========================================================================
// Flatten {field, value} pairs back into flat objects for the rest of
// the pipeline to consume, unchanged from before this schema fix.
// ===========================================================================

function flattenSizeEntries(chartData) {
  return chartData.map((entry) => {
    const flat = { size: entry.size };
    for (const { field, value } of entry.measurements || []) {
      flat[field] = value;
    }
    return flat;
  });
}

// ===========================================================================
// Code-side cleanup
// ===========================================================================

function cleanChartData(chartData, garmentCategory) {
  const categoryFields = CATEGORY_FIELDS[garmentCategory] || [];

  const withRealFieldCounts = chartData.map((entry) => {
    const filtered = { size: entry.size };
    let realFieldCount = 0;

    for (const field of categoryFields) {
      if (field in entry && entry[field] !== 0 && entry[field] !== null && entry[field] !== undefined) {
        filtered[field] = entry[field];
        realFieldCount++;
      }
    }

    return { entry: filtered, realFieldCount };
  });

  const bySize = new Map();

  for (const { entry, realFieldCount } of withRealFieldCounts) {
    const existing = bySize.get(entry.size);
    if (!existing || realFieldCount > existing.realFieldCount) {
      bySize.set(entry.size, { entry, realFieldCount });
    }
  }

  return Array.from(bySize.values())
    .filter(({ realFieldCount }) => realFieldCount > 0)
    .map(({ entry }) => entry);
}

// ===========================================================================
// Main call - retries Call 2 if its output doesn't match Call 1's
// reported row count.
// ===========================================================================

const MAX_STRUCTURING_ATTEMPTS = 3;

export async function analyzeGarment({
  frontPhotoPath,
  backPhotoPath,
  sizeChartPath,
  bodyMeasurements,
  stylePreference,
}) {
  const [frontBytes, backBytes, chartBytes] = await Promise.all([
    readFile(frontPhotoPath),
    readFile(backPhotoPath),
    readFile(sizeChartPath),
  ]);

  const extractedText = await extractChartAsText(frontBytes, backBytes, chartBytes);

  const reportedRowCount = parseReportedRowCount(extractedText);

  let result = null;

  for (let attempt = 1; attempt <= MAX_STRUCTURING_ATTEMPTS; attempt++) {

    result = await structureAndRecommend(extractedText, bodyMeasurements, stylePreference);

    if (result.chart_has_measurements) {
      result.chart_data = flattenSizeEntries(result.chart_data);
      result.chart_data = cleanChartData(result.chart_data, result.garment_category);
    }

    const rowCountMatches =
      !result.chart_has_measurements ||
      reportedRowCount === null ||
      result.chart_data.length === reportedRowCount;

    if (rowCountMatches) {
      if (attempt > 1) {
        console.log(`[geminiService] Structuring succeeded on attempt ${attempt}.`);
      }
      break;
    }

    console.warn(
      `[geminiService] Attempt ${attempt}/${MAX_STRUCTURING_ATTEMPTS}: extraction ` +
      `reported ${reportedRowCount} rows, cleaned chart_data only has ` +
      `${result.chart_data.length} entries. Retrying structuring call...`
    );
  }

  const finalRowCountMatches =
    !result.chart_has_measurements ||
    reportedRowCount === null ||
    result.chart_data.length === reportedRowCount;

  if (!finalRowCountMatches) {
    throw new Error(
      `Gemini structuring failed to produce complete chart_data after ` +
      `${MAX_STRUCTURING_ATTEMPTS} attempts. Extraction reported ` +
      `${reportedRowCount} rows, best result had ${result.chart_data.length} entries.`
    );
  }

  return result;

}