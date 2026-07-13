import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Database schema is ready.');
}
