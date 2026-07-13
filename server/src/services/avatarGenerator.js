import { spawn } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { pool } from '../db.js';

const BLENDER_PATH = process.env.BLENDER_PATH || 'blender';
const NEUTRAL_BASE_AVATAR = process.env.NEUTRAL_BASE_AVATAR || path.resolve('blender/neutral_base_avatar.glb');
const GENERATE_SCRIPT = path.resolve('blender/generate_avatar.py');
const BLENDER_TIMEOUT_MS = Number(process.env.BLENDER_TIMEOUT_MS || 60_000);

/**
 * Runs Blender headless to deform the rigged base mesh according to `measurements`
 * and export it as a .glb. Then stores that .glb as a bytea row in `files` (reusing
 * the existing file storage/serving pattern) and updates the user's profile.
 *
 * This is fire-and-forget from the route's point of view - call it without awaiting
 * inside the request handler so the HTTP response returns immediately, and let the
 * frontend poll /api/user-profiles like it already does for fit results.
 */
export async function generateAvatarAsync(profileId, userEmail, measurements) {
  const outputPath = path.join(os.tmpdir(), `avatar-${profileId}.glb`);

  try {
    await runBlender(measurements, NEUTRAL_BASE_AVATAR, outputPath);
    const glbBuffer = await readFile(outputPath);

    const fileResult = await pool.query(
      `INSERT INTO files (filename, mimetype, data) VALUES ($1, $2, $3) RETURNING id`,
      [`avatar-${profileId}.glb`, 'model/gltf-binary', glbBuffer]
    );
    const fileId = fileResult.rows[0].id;

    await pool.query(
      `UPDATE user_profiles
       SET avatar_url = $1, avatar_type = 'glb', profile_status = 'completed', updated_date = now()
       WHERE id = $2`,
      [`/api/files/${fileId}`, profileId]
    );
  } catch (err) {
    console.error(`[avatarGenerator] failed for profile ${profileId} (${userEmail}):`, err);
    await pool.query(
      `UPDATE user_profiles SET profile_status = 'failed', updated_date = now() WHERE id = $1`,
      [profileId]
    );
  } finally {
    unlink(outputPath).catch(() => {});
  }
}

function runBlender(measurements, basePath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '--background',
      '--factory-startup',
      '--python',
      GENERATE_SCRIPT,
      '--',
      '--base',
      basePath,
      '--measurements',
      JSON.stringify(measurements),
      '--output',
      outputPath,
    ];

    const proc = spawn(BLENDER_PATH, args, { timeout: BLENDER_TIMEOUT_MS });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      // Usually means the `blender` binary wasn't found on PATH - see BLENDER_PATH env var.
      reject(new Error(`Failed to launch Blender: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Blender exited with code ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}
