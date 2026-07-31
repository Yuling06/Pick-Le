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
  // Keeps idle connections alive longer, reducing (but not eliminating) how
  // often Supabase's pooler drops them.
  keepAlive: true,
});

// REQUIRED: without this listener, any idle connection dropped by Supabase's
// pooler (normal, expected behavior on their end) throws as an unhandled
// 'error' event and crashes the entire Node process. This just logs it -
// the pool automatically opens a fresh connection for the next query, so
// no other code needs to change.
pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client:', err.message);
});

export async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Database schema is ready.');
}