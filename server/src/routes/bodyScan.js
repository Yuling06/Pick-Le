import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { computeMeasurements } from '../services/measurements.js';
import { generateAvatarAsync } from '../services/avatarGenerator.js';

const router = Router();

// POST /api/body-scan
// body: { height_cm, weight_kg, geometry: {...skeletal pixel distances},
//         frontSilhouette?: {...}, sideSilhouette?: {...} - optional, enables real
//         ellipse-based circumference instead of the BMI-formula fallback }
router.post('/body-scan', requireAuth, async (req, res) => {
  const { height_cm, weight_kg, geometry, frontSilhouette, sideSilhouette } = req.body || {};

  if (!height_cm || !weight_kg || !geometry) {
    return res.status(400).json({ error: 'height_cm, weight_kg and geometry are required' });
  }

  let measurements;
  try {
    measurements = computeMeasurements({
      height_cm,
      weight_kg,
      gender: req.user.gender,
      geometry,
      frontSilhouette,
      sideSilhouette,
    });
  } catch (err) {
    return res.status(400).json({ error: `Could not compute measurements: ${err.message}` });
  }

  try {
    // One profile row per user - update the existing one (created in /setup with height/weight)
    // if present, otherwise create it now.
    const existing = await pool.query('SELECT id FROM user_profiles WHERE user_email = $1', [req.user.email]);

    let profile;
    if (existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE user_profiles
         SET height_cm = $1, weight_kg = $2, chest_cm = $3, waist_cm = $4, hip_cm = $5, shoulder_cm = $6,
             profile_status = 'pending', updated_date = now()
         WHERE user_email = $7
         RETURNING *`,
        [height_cm, weight_kg, measurements.chest_cm, measurements.waist_cm, measurements.hip_cm, measurements.shoulder_cm, req.user.email]
      );
      profile = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO user_profiles
          (user_email, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, shoulder_cm, profile_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
         RETURNING *`,
        [req.user.email, height_cm, weight_kg, measurements.chest_cm, measurements.waist_cm, measurements.hip_cm, measurements.shoulder_cm]
      );
      profile = result.rows[0];
    }

    // Fire-and-forget: don't block the HTTP response on Blender's several-second runtime.
    // The frontend already polls /api/user-profiles (via /loading/profile) for profile_status.
    generateAvatarAsync(profile.id, req.user.email, {
      height_cm,
      weight_kg,
      gender: req.user.gender,
      chest_cm: measurements.chest_cm,
      waist_cm: measurements.waist_cm,
      hip_cm: measurements.hip_cm,
      shoulder_cm: measurements.shoulder_cm,
      avatarOnly: measurements.avatarOnly,
    });

    res.status(202).json({ profile, measurements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save scan results' });
  }
});

export default router;
