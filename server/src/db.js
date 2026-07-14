import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Supabase (and most hosted Postgres providers) require SSL - a plain local dev
// Postgres install usually doesn't have it configured at all. Detecting "is this
// localhost" lets the same code work for both without needing a separate env var.
const connectionString = process.env.DATABASE_URL || '';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

export const pool = new pg.Pool({
  connectionString,
  // rejectUnauthorized: false is the standard, documented approach for connecting
  // node-postgres to Supabase - Node's default CA bundle doesn't always validate
  // Supabase's certificate chain cleanly, and Supabase's own docs recommend this.
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Database schema is ready.');
}