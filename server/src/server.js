import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';

import authRoutes from './routes/auth.js';
import filesRoutes from './routes/files.js';
import userProfileRoutes from './routes/userProfiles.js';
import bodyScanRoutes from './routes/bodyScan.js';
import fitRequestRoutes from './routes/fitRequests.js';
import fitResultRoutes from './routes/fitResults.js';
import feedbackSurveyRoutes from './routes/feedbackSurveys.js';
import usersRoutes from './routes/users.js';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', filesRoutes);
app.use('/api', userProfileRoutes);
app.use('/api', bodyScanRoutes);
app.use('/api', fitRequestRoutes);
app.use('/api', fitResultRoutes);
app.use('/api', feedbackSurveyRoutes);
app.use('/api', usersRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Pick-le API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
