import { Router } from 'express';
import multer from 'multer';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = Router();

// Matches base44's integrations.Core.UploadFile({file}) -> { file_url }
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO files (filename, mimetype, data) VALUES ($1, $2, $3) RETURNING id`,
      [req.file.originalname, req.file.mimetype, req.file.buffer]
    );
    const id = result.rows[0].id;
    res.status(201).json({ file_url: `/api/files/${id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Publicly servable so <img src="/api/files/:id"> works without auth headers
router.get('/files/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT filename, mimetype, data FROM files WHERE id = $1', [req.params.id]);
    const file = result.rows[0];
    if (!file) return res.status(404).send('Not found');
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
    // "inline" (not "attachment") - this keeps existing <img src="..."> and GLTFLoader
    // usage across the app working (rendering in place), while still giving the
    // browser a real filename (with extension) to use if the user opens the URL
    // directly or does "Save As", instead of a bare UUID with no extension.
    if (file.filename) {
      res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(file.data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to fetch file');
  }
});

export default router;
