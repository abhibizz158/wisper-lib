/**
 * db-reset.mjs
 * Drops and recreates the public schema, then runs all migrations fresh.
 * Equivalent to a full database wipe for local development.
 *
 * Usage: pnpm db:reset
 * Loaded via dotenv-cli so DATABASE_URL is available from .env
 */

import { execSync } from 'child_process';
import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Run: pnpm db:reset from apps/api with a .env file.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

console.log('⚠️  Resetting database — all data will be lost...');

try {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO PUBLIC');
  console.log('✓  Schema dropped and recreated');
} finally {
  await pool.end();
}

// Run migrations fresh
console.log('Running migrations...');
execSync(
  'node-pg-migrate up --migrations-dir ./migrations',
  { stdio: 'inherit', env: process.env }
);

console.log('✓  Database reset complete');
