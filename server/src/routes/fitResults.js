import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parseFilters, parseSort } from './entityHelpers.js';

const router = Router();

const FILTERABLE = ['request_id', 'user_email'];
const SORTABLE = ['created_date'];

router.get('/fit-results', requireAuth, async (req, res) => {
  const { where, values, hasFilters } = parseFilters(req.query, FILTERABLE);
  const order = parseSort(req.query.sort, SORTABLE);

  // users may only see their own results. If they filtered by request_id
  // without a user_email, verify the underlying fit request belongs to them.
  if (req.query.user_email && req.query.user_email !== req.user.email) {
    return res.status(403).json({ error: 'Cannot access another user\'s results' });
  }
  if (req.query.request_id && !req.query.user_email) {
    const owner = await pool.query('SELECT user_email FROM fit_requests WHERE id = $1', [req.query.request_id]);
    if (!owner.rows[0] || owner.rows[0].user_email !== req.user.email) {
      return res.status(403).json({ error: 'Cannot access another user\'s results' });
    }
  }

  try {
    const result = await pool.query(`SELECT * FROM fit_results ${where} ${order}`, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

export default router;
