/**
 * garmentFitter.js
 *
 * Phase 7 (Gemini) -> Phase 4/5 (garment_engine) -> Phase 6 (FabricDiffusion
 * compositing) orchestration, all in Node.
 *
 * Material-aware backstop: after fits_user passes, independently checks
 * EVERY size in chart_data against the user's primary body measurement
 * (chest for tops, waist for bottoms), factoring in the material's
 * stretch allowance. If no size - even with maximum stretch applied -
 * can physically reach the user's measurement, the request is rejected
 * regardless of what fits_user said.
 *
 * cropToCenterSquare: FabricDiffusion is trained on square fabric
 * close-ups - center-crop the front photo before handing it off, using
 * only a fraction (CROP_SIZE_RATIO) of the shorter dimension, not the
 * full shorter dimension. Cropping to the full shorter side alone still
 * captures the entire width/height of that axis, which can include
 * background/border/contrasting panels outside the actual fabric area -
 * confirmed via testing (white border + red inner panel both showing up
 * in generated textures) before this ratio was added.
 */

import { spawn } from 'child_process';
import { readFile, unlink, mkdir, writeFile, mkdtemp } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { pool } from '../db.js';
import { analyzeGarment, MATERIAL_STRETCH_REFERENCE } from './geminiService.js';

const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';
const GARMENT_ENGINE_PIPELINE = process.env.GARMENT_ENGINE_PIPELINE
  || path.resolve('garment_engine/core/pipeline.py');
const GARMENT_ENGINE_COMPOSITING = process.env.GARMENT_ENGINE_COMPOSITING
  || path.resolve('garment_engine/core/apply_texture_and_export.py');
const GARMENT_ENGINE_TIMEOUT_MS = Number(process.env.GARMENT_ENGINE_TIMEOUT_MS || 180_000);

const FABRIC_DIFFUSION_PYTHON = process.env.FABRIC_DIFFUSION_PYTHON;
const FABRIC_DIFFUSION_REPO = process.env.FABRIC_DIFFUSION_REPO
  || path.resolve('fabric_diffusion');
const FABRIC_DIFFUSION_TIMEOUT_MS = Number(process.env.FABRIC_DIFFUSION_TIMEOUT_MS || 300_000);

const TEMPLATES_ROOT = process.env.GARMENT_TEMPLATES_ROOT
  || path.resolve('garment_engine/templates');

const MEASUREMENT_VERTEX_GROUP_MAP = {
  top: {
    bust: 'VG_Bust',
    length: 'VG_Length',
    shoulder_width: 'VG_ShoulderWidth',
    sleeve_length: 'VG_SleeveLength',
    neck_opening: 'VG_NeckOpening',
    cuff: 'VG_Cuff',
  },
  bottom: {
    waist: 'VG_Waist',
    hip: 'VG_Hip',
    inseam: 'VG_Inseam',
    thigh: 'VG_Thigh',
    rise: 'VG_Rise',
    length: 'VG_Length',
  },
};

const PRIMARY_CIRCUMFERENCE_FIELD = { top: 'bust', bottom: 'waist' };
const PRIMARY_BODY_MEASUREMENT_KEY = { top: 'chest_cm', bottom: 'waist_cm' };

const CM_TO_METERS = 0.01;

// Crop the center 50% of the shorter image dimension before handing to
// FabricDiffusion. Tune this if photos still show background/border
// content in generated textures - lower it (e.g. 0.4, 0.3) to zoom in
// further.
const CROP_SIZE_RATIO = 0.5;

export async function fitGarmentAsync(
  fitRequestId,
  userEmail,
  avatarGlbPath,
  frontPhotoPath,
  backPhotoPath,
  sizeChartPath,
  bodyMeasurements,
  stylePreference
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'pickle-fit-'));
  const measurementsJsonPath = path.join(tempDir, 'measurements.json');
  const fittedGlbPath = path.join(tempDir, 'fitted.glb');
  const finalGlbPath = path.join(tempDir, 'final.glb');

  try {
    const geminiPromise = analyzeGarment({
      frontPhotoPath, backPhotoPath, sizeChartPath, bodyMeasurements, stylePreference,
    });

    const texturePromise = generateFabricTexture(frontPhotoPath, tempDir);

    const geminiResult = await geminiPromise;
    console.log('[garmentFitter] Gemini analysis complete.');

    if (!geminiResult.chart_has_measurements) {
      await pool.query(
        `INSERT INTO fit_results (request_id, user_email, recommended_size, style_suggestion)
         VALUES ($1, $2, $3, $4)`,
        [fitRequestId, userEmail, null, geminiResult.chart_issue_reason]
      );
      await pool.query(
        `UPDATE fit_requests SET status = 'chart_unusable', updated_date = now() WHERE id = $1`,
        [fitRequestId]
      );
      return;
    }

    if (!geminiResult.fits_user) {
      await pool.query(
        `INSERT INTO fit_results (request_id, user_email, recommended_size, style_suggestion)
         VALUES ($1, $2, $3, $4)`,
        [fitRequestId, userEmail, null, geminiResult.rejection_reason]
      );
      await pool.query(
        `UPDATE fit_requests SET status = 'rejected', updated_date = now() WHERE id = $1`,
        [fitRequestId]
      );
      return;
    }

    const materialCheck = checkMaterialAwareFit(
      geminiResult.chart_data,
      geminiResult.garment_category,
      geminiResult.material_guess,
      bodyMeasurements
    );

    if (!materialCheck.fits) {
      console.warn(`[garmentFitter] Material-aware backstop rejected request ${fitRequestId}: ${materialCheck.reason}`);

      await pool.query(
        `INSERT INTO fit_results (request_id, user_email, recommended_size, style_suggestion)
         VALUES ($1, $2, $3, $4)`,
        [fitRequestId, userEmail, null, materialCheck.reason]
      );
      await pool.query(
        `UPDATE fit_requests SET status = 'rejected', updated_date = now() WHERE id = $1`,
        [fitRequestId]
      );
      return;
    }

    const recommendedSize = geminiResult.recommended_size;
    const garmentCategory = geminiResult.garment_category;

    const targetEntry = geminiResult.chart_data.find(
      (entry) => entry.size === recommendedSize
    );

    if (!targetEntry) {
      const available = geminiResult.chart_data.map((e) => e.size).join(', ') || '(none)';
      throw new Error(
        `Gemini recommended size '${recommendedSize}' but chart_data has no ` +
        `entry for it. Available sizes: ${available}`
      );
    }

    const template = await resolveTemplate(geminiResult.garment_type);

    await buildMeasurementsJson(template, targetEntry, garmentCategory, measurementsJsonPath);

    console.log('[garmentFitter] Starting garment_engine (Blender)...');
    await runGarmentEngine(avatarGlbPath, template, measurementsJsonPath, fittedGlbPath);
    console.log('[garmentFitter] garment_engine complete.');

    console.log('[garmentFitter] Waiting for FabricDiffusion texture...');
    const texturePath = await texturePromise;
    console.log('[garmentFitter] FabricDiffusion texture ready.');

    console.log('[garmentFitter] Starting final compositing (Blender)...');
    await runCompositing(fittedGlbPath, texturePath, template.objectName, template.uvRotationDegrees, finalGlbPath);
    console.log('[garmentFitter] Compositing complete.');

    const glbBuffer = await readFile(finalGlbPath);

    const fileResult = await pool.query(
      `INSERT INTO files (filename, mimetype, data) VALUES ($1, $2, $3) RETURNING id`,
      [`fit-${fitRequestId}.glb`, 'model/gltf-binary', glbBuffer]
    );
    const fileId = fileResult.rows[0].id;

    await pool.query(
      `INSERT INTO fit_results
        (request_id, user_email, recommended_size, confidence_score, visualization_image_url,
         chest_fit_note, waist_fit_note, shoulder_fit_note, style_suggestion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        fitRequestId, userEmail, recommendedSize, geminiResult.confidence_score,
        `/api/files/${fileId}`,
        geminiResult.primary_fit_note,
        geminiResult.secondary_fit_note,
        geminiResult.tertiary_fit_note,
        geminiResult.style_suggestion,
      ]
    );

    await pool.query(
      `UPDATE fit_requests SET status = 'completed', updated_date = now() WHERE id = $1`,
      [fitRequestId]
    );
  } catch (err) {
    console.error(`[garmentFitter] failed for fit request ${fitRequestId}:`, err);
    await pool.query(
      `UPDATE fit_requests SET status = 'failed', updated_date = now() WHERE id = $1`,
      [fitRequestId]
    );
  } finally {
    for (const file of [measurementsJsonPath, fittedGlbPath, finalGlbPath]) {
      unlink(file).catch(() => {});
    }
  }
}

// ===========================================================================
// Material-aware fit backstop
// ===========================================================================

function checkMaterialAwareFit(chartData, garmentCategory, materialGuess, bodyMeasurements) {
  const field = PRIMARY_CIRCUMFERENCE_FIELD[garmentCategory];
  const bodyKey = PRIMARY_BODY_MEASUREMENT_KEY[garmentCategory];

  if (!field || !bodyKey) {
    return { fits: true };
  }

  const bodyValue = Number(bodyMeasurements[bodyKey]);
  if (!bodyValue) {
    return { fits: true };
  }

  const stretchPercent = MATERIAL_STRETCH_REFERENCE[materialGuess]?.stretch_percent ?? 0;

  let bestEffectiveMax = -Infinity;

  for (const entry of chartData) {
    if (!(field in entry)) continue;

    const effectiveMax = entry[field] * (1 + stretchPercent / 100);
    bestEffectiveMax = Math.max(bestEffectiveMax, effectiveMax);
  }

  if (bestEffectiveMax === -Infinity) {
    return { fits: true };
  }

  if (bestEffectiveMax < bodyValue) {
    return {
      fits: false,
      reason:
        `Even the largest available size (${bestEffectiveMax.toFixed(1)}cm ${field}, ` +
        `including ${stretchPercent}% material stretch) is smaller than your ` +
        `${bodyValue}cm ${bodyKey.replace('_cm', '')} measurement. This garment ` +
        `cannot fit at any size.`,
    };
  }

  return { fits: true };
}

async function resolveTemplate(garmentType) {
  const registryPath = path.join(TEMPLATES_ROOT, 'template_registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf-8'));

  const normalized = garmentType.toLowerCase().trim();

  // Exact match first
  let entry = registry[normalized];
  let matchedKey = normalized;

  // Fall back to substring match - e.g. "polo shirt" or "men's polo"
  // should both resolve to the "polo" registry entry.
  if (!entry) {
    matchedKey = Object.keys(registry).find(
      (key) => normalized.includes(key) || key.includes(normalized)
    );
    entry = matchedKey ? registry[matchedKey] : undefined;
  }

  if (!entry) {
    const available = Object.keys(registry).join(', ');
    throw new Error(`Unknown garment_type '${garmentType}'. Available: ${available}`);
  }

  return {
    blendPath: path.join(TEMPLATES_ROOT, entry.blend_path),
    objectName: entry.object_name,
    referenceMeasurementsPath: path.join(TEMPLATES_ROOT, entry.reference_measurements),
    uvRotationDegrees: entry.uv_rotation_degrees || 0,
  };
}

async function buildMeasurementsJson(template, targetEntry, garmentCategory, outputPath) {
  const referenceData = JSON.parse(await readFile(template.referenceMeasurementsPath, 'utf-8'));
  const referenceValues = referenceData.measurements;

  const vertexGroupMap = MEASUREMENT_VERTEX_GROUP_MAP[garmentCategory];

  if (!vertexGroupMap) {
    const available = Object.keys(MEASUREMENT_VERTEX_GROUP_MAP).join(', ');
    throw new Error(`Unknown garment_category '${garmentCategory}'. Available: ${available}`);
  }

  const allowedFields = new Set(Object.keys(vertexGroupMap));
  const strayFields = Object.keys(targetEntry).filter(
    (key) => key !== 'size' && !allowedFields.has(key)
  );

  if (strayFields.length > 0) {
    console.warn(
      `[garmentFitter] Gemini returned unexpected fields for category ` +
      `'${garmentCategory}': ${strayFields.join(', ')} - ignoring them.`
    );
  }

  const measurements = [];
  const skippedFields = [];

  for (const [name, vertexGroup] of Object.entries(vertexGroupMap)) {
    if (!(name in referenceValues)) continue;

    if (!(name in targetEntry)) {
      skippedFields.push(name);
      continue;
    }

    const targetInMeters = targetEntry[name] * CM_TO_METERS;

    measurements.push({
      name: name.replace(/_/g, ' '),
      vertex_group: vertexGroup,
      reference: referenceValues[name],
      target: targetInMeters,
    });
  }

  if (skippedFields.length > 0) {
    console.warn(
      `[garmentFitter] Chart for size '${targetEntry.size}' had no value for: ` +
      `${skippedFields.join(', ')}. Leaving those dimensions at template ` +
      `default (not deformed).`
    );
  }

  if (measurements.length === 0) {
    throw new Error(
      `No usable measurements found for size '${targetEntry.size}' - ` +
      `chart_data had no overlap with this template's supported dimensions.`
    );
  }

  await writeFile(outputPath, JSON.stringify({ measurements }, null, 2));
}

function runGarmentEngine(avatarGlbPath, template, measurementsJsonPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--background', '--python', GARMENT_ENGINE_PIPELINE, '--',
      '--avatar_glb', avatarGlbPath,
      '--garment_blend', template.blendPath,
      '--garment_name', template.objectName,
      '--measurements', measurementsJsonPath,
      '--output', outputPath,
    ];

    const proc = spawn(BLENDER_PATH, args, { timeout: GARMENT_ENGINE_TIMEOUT_MS });

    let stderr = '';
    proc.stdout.on('data', (chunk) => process.stdout.write(chunk));
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`Failed to launch Blender for garment_engine: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      console.log(`[garmentFitter] garment_engine process closed - code=${code}, signal=${signal}`);

      if (code === 0 && existsSync(outputPath)) {
        resolve(outputPath);
        return;
      }

      if (signal) {
        reject(new Error(
          `garment_engine pipeline was killed by signal ${signal} - most likely ` +
          `GARMENT_ENGINE_TIMEOUT_MS (${GARMENT_ENGINE_TIMEOUT_MS}ms) was exceeded, ` +
          `not a Blender-side crash. Consider raising the timeout in .env.`
        ));
        return;
      }

      if (code !== 0) {
        reject(new Error(`garment_engine pipeline exited with code ${code}: ${stderr}`));
        return;
      }

      reject(new Error(
        `garment_engine reported success (code 0) but ${outputPath} was not ` +
        `created. Check Blender's stdout/stderr above for a silent Python ` +
        `traceback.`
      ));
    });
  });
}

// ===========================================================================
// FabricDiffusion input preprocessing - center crop
// ===========================================================================

async function cropToCenterSquare(inputPath, outputPath) {
  const image = sharp(inputPath);
  const { width, height } = await image.metadata();

  if (!width || !height) {
    throw new Error(`Could not read image dimensions for ${inputPath}`);
  }

  const shorterSide = Math.min(width, height);
  const side = Math.round(shorterSide * CROP_SIZE_RATIO);

  const left = Math.floor((width - side) / 2);
  const top = Math.floor((height - side) / 2);

  await image
    .extract({ left, top, width: side, height: side })
    .toFile(outputPath);
}

function generateFabricTexture(referencePhotoPath, tempDir) {
  return new Promise(async (resolve, reject) => {
    try {
      const srcDir = path.join(tempDir, 'fd_src');
      const saveDir = path.join(tempDir, 'fd_save');

      await mkdir(srcDir, { recursive: true });
      await mkdir(saveDir, { recursive: true });

      const inputExt = path.extname(referencePhotoPath);
      const inputPath = path.join(srcDir, `input${inputExt}`);

      // FabricDiffusion is trained on square fabric close-ups - center-crop
      // to just the central portion of the photo before handing it off.
      // Gemini (analyzeGarment) still gets the original, uncropped front
      // and back photos separately, since it needs the full garment in
      // frame for sizing/fit analysis.
      await cropToCenterSquare(referencePhotoPath, inputPath);

      const args = [
        path.join(FABRIC_DIFFUSION_REPO, 'inference_texture.py'),
        '--texture_checkpoint=Yuanhao-Harry-Wang/fabric-diffusion-texture',
        `--src_dir=${srcDir}`,
        `--save_dir=${saveDir}`,
        '--n_samples=1',
      ];

      const proc = spawn(FABRIC_DIFFUSION_PYTHON, args, {
        cwd: FABRIC_DIFFUSION_REPO,
        timeout: FABRIC_DIFFUSION_TIMEOUT_MS,
      });

      let stderr = '';
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        reject(new Error(`Failed to launch FabricDiffusion: ${err.message}`));
      });

      proc.on('close', (code, signal) => {
        const outputPath = path.join(saveDir, 'input_gen_0.png');

        if (code === 0 && existsSync(outputPath)) {
          resolve(outputPath);
          return;
        }

        if (signal) {
          reject(new Error(
            `FabricDiffusion was killed by signal ${signal} - most likely ` +
            `FABRIC_DIFFUSION_TIMEOUT_MS (${FABRIC_DIFFUSION_TIMEOUT_MS}ms) was ` +
            `exceeded. Consider raising the timeout in .env.`
          ));
          return;
        }

        reject(new Error(`FabricDiffusion exited with code ${code}: ${stderr}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

function runCompositing(fittedGlbPath, texturePath, garmentObjectName, uvRotationDegrees, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--background', '--python', GARMENT_ENGINE_COMPOSITING, '--',
      '--fitted_glb', fittedGlbPath,
      '--texture_path', texturePath,
      '--garment_object_name', garmentObjectName,
      '--uv_rotation', String(uvRotationDegrees),
      '--output', outputPath,
    ];

    const proc = spawn(BLENDER_PATH, args, { timeout: GARMENT_ENGINE_TIMEOUT_MS });

    let stderr = '';
    proc.stdout.on('data', (chunk) => process.stdout.write(chunk));
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      reject(new Error(`Failed to launch Blender for compositing: ${err.message}`));
    });

    proc.on('close', (code, signal) => {
      console.log(`[garmentFitter] compositing process closed - code=${code}, signal=${signal}`);

      if (code === 0 && existsSync(outputPath)) {
        resolve(outputPath);
        return;
      }

      if (signal) {
        reject(new Error(
          `Compositing was killed by signal ${signal} - most likely ` +
          `GARMENT_ENGINE_TIMEOUT_MS (${GARMENT_ENGINE_TIMEOUT_MS}ms) was exceeded.`
        ));
        return;
      }

      if (code !== 0) {
        reject(new Error(`Compositing exited with code ${code}: ${stderr}`));
        return;
      }

      reject(new Error(
        `Compositing reported success (code 0) but ${outputPath} was not ` +
        `created. Check Blender's stdout/stderr above for a silent Python traceback.`
      ));
    });
  });
}