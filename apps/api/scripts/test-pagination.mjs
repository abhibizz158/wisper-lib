/**
 * Quick smoke-test for pagination helpers.
 * Run: node scripts/test-pagination.mjs (from apps/api)
 */

// We use the compiled JS from dist, so build first or run via tsx
import { encodeCursor, decodeCursor, cursorClause, paginateResults } from '../src/lib/pagination.js';

let passed = 0;
function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓  ${label}`);
  passed++;
}

// 1. encode/decode roundtrip
const payload = { id: 'abc-123', createdAt: '2026-10-31T10:00:00.000Z' };
const encoded = encodeCursor(payload);
const decoded = decodeCursor(encoded);
assert(decoded?.id === payload.id, 'cursor id roundtrip');
assert(decoded?.createdAt === payload.createdAt, 'cursor createdAt roundtrip');

// 2. invalid cursor → null
assert(decodeCursor('not-valid') === null, 'invalid cursor returns null');
assert(decodeCursor('') === null, 'empty cursor returns null');

// 3. cursorClause — no cursor
const { clause: noClause, nextParamIndex: idx1 } = cursorClause(null, 2);
assert(noClause === '', 'no cursor → empty clause');
assert(idx1 === 2, 'no cursor → nextParamIndex unchanged');

// 4. cursorClause — with cursor
const { clause, params, nextParamIndex } = cursorClause(decoded, 2);
assert(clause.includes('$2') && clause.includes('$3'), 'clause references $2 and $3');
assert(params.length === 2, 'two params for cursor');
assert(nextParamIndex === 4, 'nextParamIndex advanced to 4');

// 5. paginateResults — exact page
const rows = [
  { id: 'a', createdAt: '2026-10-31T10:00:00Z' },
  { id: 'b', createdAt: '2026-10-31T09:00:00Z' },
];
const { items: exactItems, nextCursor: exactCursor } = paginateResults(rows, 2);
assert(exactItems.length === 2, 'exact page: 2 items');
assert(exactCursor === null, 'exact page: no next cursor');

// 6. paginateResults — has more
const rowsPlus = [
  { id: 'a', createdAt: '2026-10-31T10:00:00Z' },
  { id: 'b', createdAt: '2026-10-31T09:00:00Z' },
  { id: 'c', createdAt: '2026-10-31T08:00:00Z' },
];
const { items: moreItems, nextCursor: moreCursor } = paginateResults(rowsPlus, 2);
assert(moreItems.length === 2, 'has-more: trimmed to 2 items');
assert(moreCursor !== null, 'has-more: next cursor set');
const decodedMore = decodeCursor(moreCursor);
assert(decodedMore !== null && decodedMore.id === 'b', 'cursor points to last returned item');

// 7. paginateResults — empty
const { items: emptyItems, nextCursor: emptyCursor } = paginateResults([], 20);
assert(emptyItems.length === 0, 'empty: zero items');
assert(emptyCursor === null, 'empty: no next cursor');

console.log(`\nAll ${passed} pagination tests passed ✓`);
