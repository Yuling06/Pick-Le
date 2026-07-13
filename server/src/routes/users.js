import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth} from '../middleware/auth.js';

const router = Router();

router.get('/users', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, gender, created_date FROM users ORDER BY created_date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

export default router;
