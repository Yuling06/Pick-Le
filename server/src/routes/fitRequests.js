import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parseFilters, parseSort } from './entityHelpers.js';
import { fitGarmentAsync } from '../services/garmentFitter.js';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import path from 'path';
import os from 'os';

const router = Router();

const FILTERABLE = ['user_email', 'status'];
const SORTABLE = ['created_date', 'updated_date'];

router.get('/fit-requests', requireAuth, async (req, res) => {
  const { where, values } = parseFilters(req.query, FILTERABLE);
  const order = parseSort(req.query.sort, SORTABLE);

  const filteredEmail = req.query.user_email;
  if (filteredEmail && filteredEmail !== req.user.email) {
    return res.status(403).json({ error: 'Cannot access another user\'s requests' });
  }

  try {
    const result = await pool.query(`SELECT * FROM fit_requests ${where} ${order}`, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/fit-requests', requireAuth, async (req, res) => {
  const b = req.body || {};

  // Front photo, back photo, and size chart are all required at upload
  // time now (ClothingUpload.jsx only lets the user submit once all three
  // are attached) - validate server-side too rather than trusting the client.
  const missing = [];
  if (!b.clothing_image_url) missing.push('front clothing photo');
  if (!b.back_image_url) missing.push('back clothing photo');
  if (!b.size_chart_url) missing.push('size chart');
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required upload(s): ${missing.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `INSERT INTO fit_requests
        (user_email, clothing_image_url, back_image_url, size_chart_url, status)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [req.user.email, b.clothing_image_url, b.back_image_url, b.size_chart_url, 'pending']
    );

    const fitRequest = result.rows[0];
    res.status(201).json(fitRequest);

    // Fire-and-forget: kick off the real pipeline after responding, so
    // the client isn't blocked on a multi-minute job. Status updates
    // happen via DB writes that LoadingScreen.jsx already polls for.
    runPipelineForRequest(fitRequest).catch((err) => {
      console.error(`[fitRequests] unexpected error running pipeline for ${fitRequest.id}:`, err);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

router.delete('/fit-requests/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM fit_requests WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// ===========================================================================
// Pipeline trigger - fetches everything fitGarmentAsync needs from the DB,
// writes it to temp files (Blender/FabricDiffusion are separate processes
// that need real files on disk, not DB rows), then hands off.
// ===========================================================================

async function runPipelineForRequest(fitRequest) {
  const { id: fitRequestId, user_email: userEmail, clothing_image_url, back_image_url, size_chart_url } = fitRequest;

  // Front/back/chart are enforced at the POST route above, but this is
  // fired-and-forgotten from there, so double-check before doing any work -
  // a row with a gap here (e.g. inserted directly, or an older row from
  // before this field existed) should fail clearly, not hang at 'pending'.
  if (!clothing_image_url || !back_image_url || !size_chart_url) {
    await pool.query(
      `UPDATE fit_requests SET status = 'failed', updated_date = now() WHERE id = $1`,
      [fitRequestId]
    );
    console.error(`[fitRequests] Request ${fitRequestId} is missing a required photo - cannot run pipeline.`);
    return;
  }

  const profileResult = await pool.query(
    `SELECT * FROM user_profiles WHERE user_email = $1 ORDER BY created_date DESC LIMIT 1`,
    [userEmail]
  );
  const profile = profileResult.rows[0];

  if (!profile || !profile.avatar_url) {
    await pool.query(
      `UPDATE fit_requests SET status = 'failed', updated_date = now() WHERE id = $1`,
      [fitRequestId]
    );
    console.error(`[fitRequests] No avatar found for ${userEmail} - cannot run pipeline.`);
    return;
  }

  const bodyMeasurements = {
    chest_cm: Number(profile.chest_cm),
    waist_cm: Number(profile.waist_cm),
    hip_cm: Number(profile.hip_cm),
    shoulder_cm: Number(profile.shoulder_cm),
    height_cm: Number(profile.height_cm),
  };
  const stylePreference = profile.style_preference || 'regular fit';

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'pickle-request-'));
  const avatarPath = path.join(tempDir, 'avatar.glb');
  const frontPhotoPath = path.join(tempDir, 'front.jpg');
  const backPhotoPath = path.join(tempDir, 'back.jpg');
  const sizeChartPath = path.join(tempDir, 'chart.jpg');

  try {
    await Promise.all([
      writeFileFromUrl(profile.avatar_url, avatarPath),
      writeFileFromUrl(clothing_image_url, frontPhotoPath),
      writeFileFromUrl(back_image_url, backPhotoPath),
      writeFileFromUrl(size_chart_url, sizeChartPath),
    ]);

    // fitGarmentAsync sends the front+back photos to Gemini as-is (full
    // garment in frame, for sizing/fit analysis), and separately center-crops
    // the front photo to a square before handing it to FabricDiffusion for
    // texture generation - see generateFabricTexture() in garmentFitter.js.
    await fitGarmentAsync(
      fitRequestId,
      userEmail,
      avatarPath,
      frontPhotoPath,
      backPhotoPath,
      sizeChartPath,
      bodyMeasurements,
      stylePreference
    );
  } catch (err) {
    // fitGarmentAsync already sets 'failed' internally on its own errors, but
    // anything thrown before it gets there (e.g. a missing/corrupt file, a bad
    // file URL, a DB error reading the blob) would otherwise leave the request
    // stuck at 'pending' forever. Mirror avatarGenerator.js's catch-all here.
    console.error(`[fitRequests] pipeline setup failed for ${fitRequestId}:`, err);
    await pool.query(
      `UPDATE fit_requests SET status = 'failed', updated_date = now() WHERE id = $1`,
      [fitRequestId]
    ).catch(() => {});
  } finally {
    for (const file of [avatarPath, frontPhotoPath, backPhotoPath, sizeChartPath]) {
      unlink(file).catch(() => {});
    }
  }
}

// Files are stored as /api/files/:id in Postgres bytea - extract the id
// and read the blob directly from the DB, rather than making an HTTP
// round-trip to our own server.
async function writeFileFromUrl(fileUrl, destPath) {
  const match = fileUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
  if (!match) throw new Error(`Unrecognized file URL: ${fileUrl}`);

  const fileId = match[1];
  const result = await pool.query('SELECT data FROM files WHERE id = $1', [fileId]);
  if (!result.rows[0]) throw new Error(`File not found: ${fileId}`);

  await writeFile(destPath, result.rows[0].data);
}

export default router;
