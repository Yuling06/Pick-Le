import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth} from '../middleware/auth.js';
import { parseFilters, parseSort, parseUpdate } from './entityHelpers.js';

const router = Router();

const FILTERABLE = ['user_email', 'status'];
const SORTABLE = ['created_date', 'updated_date'];
const UPDATABLE = ['status', 'manual_sizes', 'product_info'];

router.get('/fit-requests', requireAuth, async (req, res) => {
  const { where, values, hasFilters } = parseFilters(req.query, FILTERABLE);
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
  try {
    const result = await pool.query(
      `INSERT INTO fit_requests
        (user_email, clothing_image_url, size_chart_url, manual_sizes, product_info, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [req.user.email, b.clothing_image_url, b.size_chart_url, b.manual_sizes, b.product_info, b.status || 'pending']
    );
    res.status(201).json(result.rows[0]);
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

export default router;
