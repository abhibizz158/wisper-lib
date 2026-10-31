/**
 * Quick smoke-test for validation and error helpers.
 */

import { parseBody, parseQuery } from '../src/lib/validation.js';
import { ApiError, notFound, forbidden } from '../src/lib/errors.js';
import { CreateNoteSchema, ListBooksQuerySchema } from '@wisper-lib/shared-types';

let passed = 0;
function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`✓  ${label}`);
  passed++;
}

// 1. parseBody — valid input
const validNote = parseBody(CreateNoteSchema, {
  body: 'A great passage',
  tags: ['fiction'],
});
assert(validNote.body === 'A great passage', 'parseBody: valid input accepted');
assert(Array.isArray(validNote.tags), 'parseBody: tags is array');
assert(validNote.tags[0] === 'fiction', 'parseBody: tag value preserved');

// 2. parseBody — invalid input throws ApiError
let threw = false;
try {
  parseBody(CreateNoteSchema, { body: 'x'.repeat(100_001) }); // exceeds max
} catch (err) {
  threw = err instanceof ApiError && err.statusCode === 422;
}
assert(threw, 'parseBody: invalid input throws ApiError 422');

// 3. parseBody — defaults applied
const withDefaults = parseBody(CreateNoteSchema, {});
assert(withDefaults.body === '', 'parseBody: default body is empty string');
assert(Array.isArray(withDefaults.tags) && withDefaults.tags.length === 0, 'parseBody: default tags is []');

// 4. parseQuery — valid with coercion
const query = parseQuery(ListBooksQuerySchema, { limit: '10', status: 'reading' });
assert(query.limit === 10, 'parseQuery: limit coerced to number');
assert(query.status === 'reading', 'parseQuery: status preserved');

// 5. parseQuery — defaults applied
const defaultQuery = parseQuery(ListBooksQuerySchema, {});
assert(defaultQuery.limit === 20, 'parseQuery: default limit is 20');

// 6. parseQuery — invalid status throws
let threwStatus = false;
try {
  parseQuery(ListBooksQuerySchema, { status: 'invalid-status' });
} catch (err) {
  threwStatus = err instanceof ApiError && err.statusCode === 422;
}
assert(threwStatus, 'parseQuery: invalid status throws ApiError 422');

// 7. Error helpers
const nf = notFound('Book');
assert(nf instanceof ApiError, 'notFound returns ApiError');
assert(nf.statusCode === 404, 'notFound status is 404');
assert(nf.message === 'Book not found', 'notFound message correct');

const fb = forbidden();
assert(fb instanceof ApiError, 'forbidden returns ApiError');
assert(fb.statusCode === 403, 'forbidden status is 403');

console.log(`\nAll ${passed} validation tests passed ✓`);
