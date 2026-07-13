import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, gender: user.gender },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, gender: user.gender, created_date: user.created_date };
}

router.post('/signup', async (req, res) => {
  const { email, password, gender } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!gender || !['male', 'female'].includes(gender)) {
    return res.status(400).json({ error: 'Gender (male or female) is required so we can pick your avatar base model' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, gender) VALUES ($1, $2, $3)
       RETURNING id, email, role, gender, created_date`,
      [email.toLowerCase(), passwordHash, gender]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(publicUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Stateless JWT - logout is handled client-side by deleting the token.
// This endpoint exists for symmetry / future server-side session support.
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

export default router;
