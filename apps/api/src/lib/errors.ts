/**
 * API error helpers.
 * Centralized so every route throws the same shape and HTTP status codes are consistent.
 */

import type { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode } from '@wisper-lib/shared-types';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(resource: string): ApiError {
  return new ApiError(404, ErrorCode.NOT_FOUND, `${resource} not found`);
}

export function forbidden(): ApiError {
  return new ApiError(403, ErrorCode.FORBIDDEN, 'Access denied');
}

export function validationError(message: string, details?: Record<string, string[]>): ApiError {
  return new ApiError(422, ErrorCode.VALIDATION_ERROR, message, details);
}

export function internalError(message = 'Internal server error'): ApiError {
  return new ApiError(500, ErrorCode.INTERNAL_ERROR, message);
}

/**
 * Sends the correct error response for any error type.
 * Handles ApiError, ZodError, and unknown errors uniformly.
 */
export function sendError(reply: FastifyReply, err: unknown): void {
  if (err instanceof ApiError) {
    void reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || 'root';
      details[key] = [...(details[key] ?? []), issue.message];
    }
    void reply.status(422).send({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
      },
    });
    return;
  }

  if (err && typeof err === 'object' && 'statusCode' in err) {
    const status = Number(err.statusCode);
    if (status >= 400 && status < 500) {
      void reply.status(status).send({ error: { code: status === 413 ? 'FILE_TOO_LARGE' : 'INVALID_REQUEST', message: status === 413 ? 'The upload or request exceeds its size limit.' : 'The request could not be read. Check the file and form fields.' } });
      return;
    }
  }

  // Unknown error — don't leak internals
  console.error('[api] Unhandled error:', err);
  void reply.status(500).send({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    },
  });
}
