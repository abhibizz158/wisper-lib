/**
 * API request/response Zod schemas and inferred TypeScript types.
 * Import these in the API for runtime validation and in the web/mobile app for form validation.
 * No DOM or Node.js imports.
 */

import { z } from 'zod';
import type {
  Book,
  BookDetail,
  Note,
  NoteDetail,
  Annotation,
  ReadingRecord,
  ReadingSession,
  WhisperAsset,
  User,
  BookStatus,
  HighlightColor,
} from './models.js';

// ─── Generic response envelope ────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    nextCursor?: string | null;
    total?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// ─── Pagination ────────────────────────────────────────────────────────────────

export const PaginationQuerySchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

// ─── Books ────────────────────────────────────────────────────────────────────

export const CreateManualBookSchema = z.object({
  title: z.string().min(1).max(500),
  author: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(100)).max(20).default([]),
  isbn: z.string().max(20).optional(),
  clientOperationId: z.string().uuid().optional(),
});
export type CreateManualBookBody = z.infer<typeof CreateManualBookSchema>;

export const UpdateBookSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  author: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  isbn: z.string().max(20).optional(),
});
export type UpdateBookBody = z.infer<typeof UpdateBookSchema>;

export const ListBooksQuerySchema = PaginationQuerySchema.extend({
  status: z
    .enum(['unread', 'reading', 'paused', 'finished', 'dnf'])
    .optional(),
  q: z.string().max(200).optional(),
});
export type ListBooksQuery = z.infer<typeof ListBooksQuerySchema>;

// Response types (re-exported for convenience)
export type BookResponse = ApiResponse<Book>;
export type BookDetailResponse = ApiResponse<BookDetail>;
export type BookListResponse = ApiResponse<Book[]>;

// ─── Reading records ───────────────────────────────────────────────────────────

export const CreateOrGetReadingRecordSchema = z.object({
  bookId: z.string().uuid(),
  clientOperationId: z.string().uuid().optional(),
});
export type CreateOrGetReadingRecordBody = z.infer<
  typeof CreateOrGetReadingRecordSchema
>;

export const UpdateReadingRecordSchema = z.object({
  status: z
    .enum(['unread', 'reading', 'paused', 'finished', 'dnf'])
    .optional(),
  lastLocation: z.string().max(2000).optional(),
  manualProgress: z.number().min(0).max(100).optional(),
  finishedAt: z.string().datetime().optional(),
});
export type UpdateReadingRecordBody = z.infer<typeof UpdateReadingRecordSchema>;

export type ReadingRecordResponse = ApiResponse<ReadingRecord>;

// ─── Reading sessions ──────────────────────────────────────────────────────────

export const CreateReadingSessionSchema = z.object({
  startedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(0),
  progressDelta: z.number().min(-100).max(100).optional(),
  clientOperationId: z.string().uuid(),
});
export type CreateReadingSessionBody = z.infer<
  typeof CreateReadingSessionSchema
>;

export type ReadingSessionResponse = ApiResponse<ReadingSession>;

// ─── Annotations ──────────────────────────────────────────────────────────────

export const CreateAnnotationSchema = z.object({
  bookId: z.string().uuid(),
  location: z.string().min(1).max(2000),
  selectedText: z.string().min(1).max(10000),
  highlightColor: z
    .enum(['yellow', 'blue', 'green', 'pink', 'none'])
    .default('yellow'),
  clientOperationId: z.string().uuid().optional(),
});
export type CreateAnnotationBody = z.infer<typeof CreateAnnotationSchema>;

export type AnnotationResponse = ApiResponse<Annotation>;
export type AnnotationListResponse = ApiResponse<Annotation[]>;

// ─── Notes ────────────────────────────────────────────────────────────────────

export const CreateNoteSchema = z.object({
  bookId: z.string().uuid().optional(),
  annotationId: z.string().uuid().optional(),
  title: z.string().max(500).optional(),
  body: z.string().max(100000).default(''),
  tags: z.array(z.string().max(100)).max(20).default([]),
  clientOperationId: z.string().uuid().optional(),
});
export type CreateNoteBody = z.infer<typeof CreateNoteSchema>;

export const UpdateNoteSchema = z.object({
  title: z.string().max(500).optional(),
  body: z.string().max(100000).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  revision: z.number().int().min(0),
});
export type UpdateNoteBody = z.infer<typeof UpdateNoteSchema>;

export const ListNotesQuerySchema = PaginationQuerySchema.extend({
  bookId: z.string().uuid().optional(),
  tag: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
});
export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

export const ExportNotesQuerySchema = z.object({
  format: z.enum(['markdown', 'json']).default('json'),
  bookId: z.string().uuid().optional(),
});
export type ExportNotesQuery = z.infer<typeof ExportNotesQuerySchema>;

export type NoteResponse = ApiResponse<Note>;
export type NoteDetailResponse = ApiResponse<NoteDetail>;
export type NoteListResponse = ApiResponse<NoteDetail[]>;

// ─── Whispers ─────────────────────────────────────────────────────────────────

export interface WhisperResponse {
  audioUrl: string | null;
  transcript: string;
  cached: boolean;
}

export type WhisperApiResponse = ApiResponse<WhisperResponse>;

// ─── Health / me ──────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export type MeResponse = ApiResponse<Pick<User, 'id' | 'email' | 'displayName'>>;

// ─── Re-export model types for convenience ────────────────────────────────────

export type {
  Book,
  BookDetail,
  BookStatus,
  Note,
  NoteDetail,
  Annotation,
  HighlightColor,
  ReadingRecord,
  ReadingSession,
  WhisperAsset,
  User,
};
