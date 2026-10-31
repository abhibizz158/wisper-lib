/**
 * Shared error codes used by the API and understood by all clients.
 * No DOM or Node.js imports.
 */

export const ErrorCode = {
  // Generic
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',

  // Books
  BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
  BOOK_IMPORT_FAILED: 'BOOK_IMPORT_FAILED',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // Reading
  READING_RECORD_NOT_FOUND: 'READING_RECORD_NOT_FOUND',
  STALE_REVISION: 'STALE_REVISION',

  // Notes
  NOTE_NOT_FOUND: 'NOTE_NOT_FOUND',

  // Annotations
  ANNOTATION_NOT_FOUND: 'ANNOTATION_NOT_FOUND',

  // Whispers
  WHISPER_NOT_AVAILABLE: 'WHISPER_NOT_AVAILABLE',
  WHISPER_WRONG_STATUS: 'WHISPER_WRONG_STATUS',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCodeValue | string;
    message: string;
    details?: Record<string, string[]>;
  };
}
