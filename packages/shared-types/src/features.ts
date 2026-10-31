import { z } from 'zod';
import type { Book, BookStatus } from './models.js';

export const languageCodes = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'hi-IN', 'ja-JP'] as const;
export const LanguageSchema = z.enum(languageCodes);
export const AccentSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const LibraryBookInputSchema = z.object({
  title: z.string().trim().min(1).max(500), author: z.string().trim().max(300).default(''),
  description: z.string().max(10000).default(''), language: LanguageSchema.default('en-US'),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  shelfId: z.string().uuid().nullable().default(null), accent: AccentSchema.default('#B58A67'),
  isOriginal: z.boolean().default(false), isWishlist: z.boolean().default(false),
});
export type LibraryBookInput = z.infer<typeof LibraryBookInputSchema>;
export const LibraryBookUpdateSchema = LibraryBookInputSchema.partial();
export interface LibraryBook extends Book {
  language: string; accent: string; shelfId: string | null; shelfName: string | null;
  isOriginal: boolean; isWishlist: boolean; contentRevision: number;
  progress: number; status: BookStatus; lastLocation: string | null;
  chapterCount: number; sourceUrl: string | null; license: string | null;
}
export interface Chapter {
  id: string; bookId: string; title: string; body: string; position: number;
  kind: 'body' | 'glossary' | 'frontmatter';
}
export const ChapterInputSchema = z.object({
  id: z.string().uuid().optional(), title: z.string().trim().min(1).max(500),
  body: z.string().max(300000), kind: z.enum(['body', 'glossary', 'frontmatter']).default('body'),
});
export const ReferenceInputSchema = z.object({
  id: z.string().uuid().optional(), label: z.string().trim().min(1).max(500),
  author: z.string().max(300).default(''), url: z.string().trim().max(2000).refine(value => !value || (z.string().url().safeParse(value).success && /^https?:\/\/[^/@\s]+(?:[/?#]|$)/i.test(value)), 'Use a valid HTTP or HTTPS URL without credentials').default(''),
  locator: z.string().max(300).default(''), notes: z.string().max(5000).default(''),
});
export type BookReferenceInput = z.infer<typeof ReferenceInputSchema>;
export interface BookReference extends BookReferenceInput { id: string; bookId: string }
export const ContentUpdateSchema = z.object({
  revision: z.number().int().min(0), chapters: z.array(ChapterInputSchema).max(300),
  references: z.array(ReferenceInputSchema).max(200),
}).refine(value => value.chapters.reduce((sum, chapter) => sum + chapter.body.length, 0) <= 2000000, 'Book exceeds the editing size limit');
export type ContentUpdate = z.infer<typeof ContentUpdateSchema>;
export interface BookContent { chapters: Chapter[]; references: BookReference[]; revision: number; licenseText: string | null }
export const ShelfInputSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().max(500).default(''),
  color: AccentSchema.default('#B58A67'), layout: z.enum(['grid', 'list', 'shelf']).default('grid'),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});
export interface Shelf extends z.infer<typeof ShelfInputSchema> { id: string; bookCount: number }
export const ProgressInputSchema = z.object({
  lastLocation: z.string().max(2000), progress: z.number().min(0).max(100),
  status: z.enum(['unread', 'reading', 'paused', 'finished', 'dnf']).default('reading'),
});
export const PageNoteInputSchema = z.object({
  bookId: z.string().uuid().nullable().optional(), chapterId: z.string().uuid().nullable().optional(),
  location: z.string().max(2000).nullable().optional(), selectedText: z.string().max(10000).default(''),
  title: z.string().max(500).default(''), body: z.string().min(1).max(100000),
  tags: z.array(z.string().max(100)).max(20).default([]), clientOperationId: z.string().uuid().optional(),
});
export const PageNoteUpdateSchema = PageNoteInputSchema.omit({ clientOperationId: true }).partial().extend({ revision: z.number().int().min(0) });
export interface PageNote {
  id: string; bookId: string | null; chapterId: string | null; location: string | null;
  selectedText: string; title: string | null; body: string; tags: string[]; revision: number;
  bookTitle: string | null; createdAt: string; updatedAt: string;
}
export const ReviewInputSchema = z.object({
  bookId: z.string().uuid().nullable().default(null), sourceNoteId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(5000),
  rating: z.number().int().min(1).max(5).default(5), caption: z.string().max(8000).default(''), theme: z.enum(['midnight', 'parchment', 'ember']).default('midnight'),
});
export interface PersonalReview extends z.infer<typeof ReviewInputSchema> {
  id: string; bookTitle: string | null; author: string | null; createdAt: string; updatedAt: string;
}
export interface SpeechLanguage { code: string; label: string; voice: string }
export interface WhisperPreview {
  transcript: string; audioUrl: string | null; cached: boolean; provider: 'polly' | 'text';
  language: string; voice: string; location: string | null;
  source: 'last-location' | 'glossary' | 'body' | 'description'; message?: string;
}
