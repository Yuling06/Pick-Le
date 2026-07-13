import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parseFilters, parseSort } from './entityHelpers.js';

const router = Router();

const FILTERABLE = ['request_id', 'user_email'];
const SORTABLE = ['created_date'];

router.get('/feedback-surveys', requireAuth, async (req, res) => {
  const { where, values, hasFilters } = parseFilters(req.query, FILTERABLE);
  const order = parseSort(req.query.sort, SORTABLE);

  if (req.query.user_email && req.query.user_email !== req.user.email) {
    return res.status(403).json({ error: 'Cannot access another user\'s feedback' });
  }

  try {
    const result = await pool.query(`SELECT * FROM feedback_surveys ${where} ${order}`, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

router.post('/feedback-surveys', requireAuth, async (req, res) => {
  const b = req.body || {};
  try {
    const result = await pool.query(
      `INSERT INTO feedback_surveys
        (request_id, user_email, confidence_rating, sizing_match_rating, visualization_rating, would_use_rating)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        b.request_id,
        req.user.email, // always the requester's own email
        b.confidence_rating, b.sizing_match_rating, b.visualization_rating, b.would_use_rating,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;
