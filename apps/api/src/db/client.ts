import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required.\n' +
      'Copy apps/api/.env.example to apps/api/.env and fill in your values.'
  );
}

/**
 * Singleton connection pool for the application.
 * All queries go through this pool — never create an ad-hoc Pool elsewhere.
 */
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
});

db.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

/** Run a health check query — throws if the DB is unreachable. */
export async function checkDbConnection(): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
