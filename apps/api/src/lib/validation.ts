/**
 * Zod request body / query validation helpers.
 * Usage:
 *   const body = parseBody(CreateNoteSchema, request.body);
 *   const query = parseQuery(ListBooksQuerySchema, request.query);
 *
 * Both throw ApiError(422) on validation failure, handled by sendError().
 */

import { type ZodSchema, ZodError } from 'zod';
import { ApiError } from './errors.js';
import { ErrorCode } from '@wisper-lib/shared-types';

export function parseBody<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw zodToApiError(result.error);
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw zodToApiError(result.error);
  }
  return result.data;
}

function zodToApiError(err: ZodError): ApiError {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || 'root';
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return new ApiError(
    422,
    ErrorCode.VALIDATION_ERROR,
    'Validation failed',
    details
  );
}
