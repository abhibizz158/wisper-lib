/**
 * Core domain model interfaces.
 * No DOM or Node.js imports — this file is safe for React Native.
 */

export type BookFormat = 'epub' | 'pdf' | 'mobi' | 'kf8' | 'fb2' | 'cbz' | 'manual';
export type BookStatus = 'unread' | 'reading' | 'paused' | 'finished' | 'dnf';
export type ImportState = 'pending' | 'processing' | 'ready' | 'failed';
export type HighlightColor = 'yellow' | 'blue' | 'green' | 'pink' | 'none';
export type WhisperState = 'pending' | 'ready' | 'failed';
export type NoteExportFormat = 'markdown' | 'json';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
}

export interface Book {
  id: string;
  ownerId: string;
  title: string;
  author: string | null;
  format: BookFormat;
  filePath: string | null;
  coverPath: string | null;
  description: string | null;
  tags: string[];
  isbn: string | null;
  importState: ImportState;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingRecord {
  id: string;
  bookId: string;
  ownerId: string;
  status: BookStatus;
  startedAt: string | null;
  finishedAt: string | null;
  lastLocation: string | null;
  manualProgress: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingSession {
  id: string;
  readingRecordId: string;
  ownerId: string;
  startedAt: string;
  durationSeconds: number;
  progressDelta: number | null;
  clientOpId: string | null;
}

export interface Annotation {
  id: string;
  bookId: string;
  ownerId: string;
  location: string;
  selectedText: string;
  highlightColor: HighlightColor;
  createdAt: string;
}

export interface Note {
  id: string;
  ownerId: string;
  bookId: string | null;
  annotationId: string | null;
  title: string | null;
  body: string;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhisperAsset {
  id: string;
  ownerId: string;
  bookId: string | null;
  textHash: string;
  voice: string;
  engine: string;
  locale: string;
  audioPath: string | null;
  transcript: string;
  state: WhisperState;
  createdAt: string;
}

/** Enriched book with current reading record — returned by detail endpoints */
export interface BookDetail extends Book {
  currentReadingRecord: ReadingRecord | null;
}

/** Enriched note with book and annotation info — returned by list/detail */
export interface NoteDetail extends Note {
  book: Pick<Book, 'id' | 'title' | 'author'> | null;
  annotation: Pick<Annotation, 'id' | 'location' | 'selectedText'> | null;
}
