import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parseFilters, parseSort, parseUpdate } from './entityHelpers.js';

const router = Router();

const FILTERABLE = ['user_email', 'profile_status'];
const SORTABLE = ['created_date', 'updated_date'];
const UPDATABLE = [
  'height_cm', 'weight_kg', 'chest_cm', 'waist_cm', 'hip_cm', 'shoulder_cm',
  'style_preference', 'body_type_label', 'profile_status',
];
// avatar_url / avatar_type are intentionally excluded - they're only ever written by
// server/src/services/avatarGenerator.js once Blender actually produces a real avatar.
// This used to be admin/user-writable (the old manual approval flow), which is exactly
// what let someone "complete" a profile without a real avatar behind it.

router.get('/user-profiles', requireAuth, async (req, res) => {
  const { where, values, hasFilters } = parseFilters(req.query, FILTERABLE);
  const order = parseSort(req.query.sort, SORTABLE);

  const filteredEmail = req.query.user_email;

  if (filteredEmail && filteredEmail !== req.user.email) {
    return res.status(403).json({ error: 'Cannot access another user\'s profile' });
  }

  try {
    const result = await pool.query(`SELECT * FROM user_profiles ${where} ${order}`, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

router.post('/user-profiles', requireAuth, async (req, res) => {
  const b = req.body || {};
  try {
    const result = await pool.query(
      `INSERT INTO user_profiles
        (user_email, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, shoulder_cm, style_preference, profile_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        req.user.email, // always the requester's own email, never trust client input
        b.height_cm, b.weight_kg, b.chest_cm, b.waist_cm, b.hip_cm, b.shoulder_cm,
        b.style_preference, b.profile_status || 'pending',
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

router.put('/user-profiles/:id', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [req.params.id]);
    const row = existing.rows[0];
    if (!row) return res.status(404).json({ error: 'Profile not found' });

    if (row.user_email !== req.user.email) {
      return res.status(403).json({ error: 'Cannot modify another user\'s profile' });
    }

    const { setClause, values } = parseUpdate(req.body || {}, UPDATABLE);
    if (!setClause) return res.json(row);

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE user_profiles SET ${setClause}, updated_date = now() WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;