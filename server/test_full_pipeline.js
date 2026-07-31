/**
 * test_full_pipeline.js
 *
 * Full end-to-end test: Gemini (Phase 7) + garment_engine (Phase 4/5)
 * + FabricDiffusion (Phase 6), all through the real fitGarmentAsync
 * orchestration function - not individual pieces tested in isolation.
 *
 * Not part of the real app; delete once confident this works.
 */

import 'dotenv/config';
import { pool } from './src/db.js';
import { fitGarmentAsync } from './src/services/garmentFitter.js';

async function main() {
  const userEmail = 'test@example.com';

  const avatarGlbPath = './test_data/sample_avatar.glb';
  const frontPhotoPath = './test_data/garment_photo.jpg';
  const backPhotoPath = './test_data/garment_photo.jpg'; // swap for a real back photo if you have one
  const sizeChartPath = './test_data/size_chart.jpg';

  const bodyMeasurements = {
    chest_cm: 88.4,
    waist_cm: 69.7,
    hip_cm: 85.4,
    shoulder_cm: 39.6,
    height_cm: 167,
  };

  const stylePreference = 'regular fit';

  console.log('Creating fit_requests row...');

  const requestResult = await pool.query(
    `INSERT INTO fit_requests (user_email, status) VALUES ($1, 'pending') RETURNING id`,
    [userEmail]
  );
  const fitRequestId = requestResult.rows[0].id;

  console.log(`Created fit_requests row: ${fitRequestId}`);
  console.log('Running full pipeline (Gemini -> garment_engine + FabricDiffusion -> compositing)...');
  console.log('This may take a while - watch for progress in the terminal.');

  const startTime = Date.now();

  await fitGarmentAsync(
    fitRequestId,
    userEmail,
    avatarGlbPath,
    frontPhotoPath,
    backPhotoPath,
    sizeChartPath,
    bodyMeasurements,
    stylePreference
  );

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Pipeline finished in ${elapsedSeconds}s. Checking results...`);

  const requestRow = await pool.query(
    `SELECT status FROM fit_requests WHERE id = $1`,
    [fitRequestId]
  );
  console.log('fit_requests.status:', requestRow.rows[0]?.status);

  const resultRow = await pool.query(
    `SELECT * FROM fit_results WHERE request_id = $1`,
    [fitRequestId]
  );

  if (resultRow.rows.length === 0) {
    console.log('No fit_results row found.');
  } else {
    console.log('fit_results row:');
    console.log(JSON.stringify(resultRow.rows[0], null, 2));
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});