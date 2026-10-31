/**
 * User domain queries.
 * All queries are scoped to a specific user ID — never return rows for other owners.
 */

import { db } from './client.js';
import type { User } from '@wisper-lib/shared-types';

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  preferences: Record<string, unknown>;
  created_at: Date;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    preferences: row.preferences,
    createdAt: row.created_at.toISOString(),
  };
}

/** Find a user by ID. Returns null if not found. */
export async function findUserById(id: string): Promise<User | null> {
  const result = await db.query<UserRow>(
    `SELECT id, email, display_name, preferences, created_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

/** Upsert a user (used when Cognito auth is wired in Phase 2). */
export async function upsertUser(user: {
  id: string;
  email: string;
  displayName?: string;
}): Promise<User> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = COALESCE(EXCLUDED.display_name, users.display_name)
     RETURNING id, email, display_name, preferences, created_at`,
    [user.id, user.email, user.displayName ?? null]
  );
  return rowToUser(result.rows[0]);
}
