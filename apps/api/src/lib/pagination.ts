/**
 * Cursor-based pagination utilities.
 *
 * Cursor encodes { id, createdAt } as base64 JSON.
 * Query pattern:
 *   WHERE (created_at, id) < (cursor.createdAt, cursor.id)
 *   ORDER BY created_at DESC, id DESC
 *   LIMIT $n
 *
 * This gives stable, consistent pages even when new rows are inserted.
 */

export interface CursorPayload {
  id: string;
  createdAt: string;
}

/** Encode a cursor from the last row of a result page. */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Decode a cursor string. Returns null if invalid (treat as no cursor = first page). */
export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as unknown;
    if (
      decoded !== null &&
      typeof decoded === 'object' &&
      'id' in decoded &&
      'createdAt' in decoded &&
      typeof (decoded as CursorPayload).id === 'string' &&
      typeof (decoded as CursorPayload).createdAt === 'string'
    ) {
      return decoded as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build the WHERE clause fragment and params for cursor pagination.
 *
 * @param cursor     Decoded cursor (null = first page)
 * @param paramIndex Starting index for $N params (e.g. if 2 params already used, pass 3)
 * @returns { clause, params, nextParamIndex }
 *
 * Usage:
 *   const { clause, params, nextParamIndex } = cursorClause(cursor, 2);
 *   // clause: "AND (created_at, id) < ($2::timestamptz, $3)"  (if cursor set)
 *   //         ""                                               (if no cursor)
 *   db.query(`SELECT ... WHERE owner_id = $1 ${clause} ORDER BY created_at DESC, id DESC LIMIT $${nextParamIndex}`,
 *            ['owner-id', ...params, limit])
 */
export function cursorClause(
  cursor: CursorPayload | null,
  paramIndex: number
): { clause: string; params: string[]; nextParamIndex: number } {
  if (!cursor) {
    return { clause: '', params: [], nextParamIndex: paramIndex };
  }
  const clause = `AND (created_at, id) < ($${paramIndex}::timestamptz, $${paramIndex + 1}::uuid)`;
  return {
    clause,
    params: [cursor.createdAt, cursor.id],
    nextParamIndex: paramIndex + 2,
  };
}

/**
 * Given a result array (one more than the requested limit),
 * determine whether there is a next page and trim the extra row.
 */
export function paginateResults<T extends { id: string; createdAt: string }>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({ id: lastItem.id, createdAt: lastItem.createdAt })
      : null;
  return { items, nextCursor };
}
