/**
 * test_garment_engine_only.js
 *
 * Runs ONLY garment_engine (Phase 4/5) - no Gemini, no FabricDiffusion,
 * no compositing. Fastest possible way to check whether a given chart's
 * measurements deform cleanly onto this template, using the same real
 * pipeline.py that garmentFitter.js calls in production.
 *
 * Not part of the real app; delete once confident this works.
 */

import { spawn } from 'child_process';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import 'dotenv/config';

const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';
const GARMENT_ENGINE_PIPELINE = process.env.GARMENT_ENGINE_PIPELINE
  || path.resolve('garment_engine/core/pipeline.py');
const GARMENT_ENGINE_TIMEOUT_MS = Number(process.env.GARMENT_ENGINE_TIMEOUT_MS || 60_000);
const TEMPLATES_ROOT = process.env.GARMENT_TEMPLATES_ROOT
  || path.resolve('garment_engine/templates');

const CM_TO_METERS = 0.01;

// ===========================================================================
// Chart data to test - S size from the real chart you're checking:
// Size  Chest  Shoulder width  Front length  Sleeve length
// S     96.5   42.5            68.0          19.5
// ===========================================================================

const targetEntry = {
  bust: 92,           // "Chest"
  shoulder_width: 45,
  length: 64,         // "Front length"
  sleeve_length: 17,
  // no "cuff" column on this chart - will be skipped, matching
  // garmentFitter.js's real behavior for missing fields
};

const MEASUREMENT_VERTEX_GROUP_MAP = {
  bust: 'VG_Bust',
  length: 'VG_Length',
  shoulder_width: 'VG_ShoulderWidth',
  sleeve_length: 'VG_SleeveLength',
  neck_opening: 'VG_NeckOpening',
  cuff: 'VG_Cuff',
};

const AVATAR_GLB_PATH = './test_data/avatar-5e09acca-c02f-4c71-8852-4c36bccd8273.glb';
const GARMENT_TYPE = 'polo';
const OUTPUT_PATH = './test_garment_engine_only_output.glb';

async function main() {
  const measurementsJsonPath = './test_garment_engine_only_measurements.json';

  console.log('Resolving template...');
  const template = await resolveTemplate(GARMENT_TYPE);

  console.log('Building measurements.json + checking ratios...');
  await buildMeasurementsJson(template, targetEntry, measurementsJsonPath);

  console.log('\n[DEBUG] Spawning Blender...');
  await runGarmentEngine(AVATAR_GLB_PATH, template, measurementsJsonPath, OUTPUT_PATH);

  if (!existsSync(OUTPUT_PATH)) {
    throw new Error(`Blender reported success but ${OUTPUT_PATH} does not exist!`);
  }

  console.log(`\nDone. Output: ${path.resolve(OUTPUT_PATH)}`);
  console.log('Open this .glb in Blender to check the fit.');

  await unlink(measurementsJsonPath).catch(() => {});
}

async function resolveTemplate(garmentType) {
  const registryPath = path.join(TEMPLATES_ROOT, 'template_registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf-8'));

  const key = garmentType.toLowerCase().trim();
  const entry = registry[key];

  if (!entry) {
    const available = Object.keys(registry).join(', ');
    throw new Error(`Unknown garment_type '${garmentType}'. Available: ${available}`);
  }

  return {
    blendPath: path.join(TEMPLATES_ROOT, entry.blend_path),
    objectName: entry.object_name,
    referenceMeasurementsPath: path.join(TEMPLATES_ROOT, entry.reference_measurements),
  };
}

async function buildMeasurementsJson(template, targetEntry, outputPath) {
  const referenceData = JSON.parse(await readFile(template.referenceMeasurementsPath, 'utf-8'));
  const referenceValues = referenceData.measurements;

  const measurements = [];

  for (const [name, vertexGroup] of Object.entries(MEASUREMENT_VERTEX_GROUP_MAP)) {
    if (!(name in referenceValues)) continue;
    if (!(name in targetEntry)) continue;

    const targetMeters = targetEntry[name] * CM_TO_METERS;
    const ratio = targetMeters / referenceValues[name];

    console.log(`  ${name}: reference=${referenceValues[name]}m, target=${targetMeters.toFixed(3)}m, ratio=${ratio.toFixed(2)}x`);

    measurements.push({
      name: name.replace(/_/g, ' '),
      vertex_group: vertexGroup,
      reference: referenceValues[name],
      target: targetMeters,
    });
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

    console.log(`${BLENDER_PATH} ${args.join(' ')}`);

    const proc = spawn(BLENDER_PATH, args, { timeout: GARMENT_ENGINE_TIMEOUT_MS });

    let stderr = '';
    proc.stdout.on('data', (chunk) => process.stdout.write(chunk));
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); process.stderr.write(chunk); });

    proc.on('error', (err) => reject(new Error(`Failed to launch Blender: ${err.message}`)));
    proc.on('close', (code) => {
      console.log(`[DEBUG] Blender process closed with code ${code}`);
      if (code === 0) resolve(outputPath);
      else reject(new Error(`Blender exited with code ${code}: ${stderr}`));
    });
  });
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});