# Design — local web reading room

## System shape

```text
Browser: React/Vite SPA :5173
  ├─ route-loaded library, reader, notes, writing desk, reviews
  ├─ lazy browser-local Kokoro TTS after Listen (English)
  └─ /api/v1 proxy
       ↓
Fastify API :3001 (loopback)
  ├─ Zod validation and local user pre-handler
  ├─ owner-scoped PostgreSQL queries
  ├─ bounded import workers and private local files
  └─ optional Polly Standard request only when selected and then listened to
       ↓
PostgreSQL :5432 (existing local database or managed dev container)
```

No AWS resource is created by the development launcher. The API currently substitutes one local user identity for authentication.

## Browser structure

`main.tsx` owns router and query-cache setup. `AppShell.tsx` provides navigation, mood preferences, and route announcements. Route components live under `apps/web/src/routes/`; reader, writer, notes, and reviews are loaded on demand. `apiClient.ts` sends same-origin requests to `/api/v1`.

The library stores selection and view preferences in browser state/local storage and server records in PostgreSQL. TanStack Query caches list/detail responses. Manuscript, note, and review drafts use IndexedDB so local recovery stays available if an API save fails.

## API and persistence

Shared contracts are in `packages/shared-types/src/features.ts` and legacy core models remain in `models.ts`. Fastify routes are mounted under `/api/v1`; `library.ts` contains books, files, progress, shelves, notes, reviews, samples, and speech endpoints. SQL migrations define ownership constraints, foreign keys, revisions, cursor indexes, and cache uniqueness.

Content saves use optimistic revisions. Shelf order is changed as one owner-checked transaction. Note and review references are validated against records owned by the current user. Deleting a collection leaves its books in the general library.

## Import and reader flow

1. The API validates the upload envelope, signature/extension, file bounds, and archive metadata.
2. EPUB structure and PDF text extraction run in bounded worker threads. Text/Markdown input is normalized without executing markup.
3. Chapter text and the private original file are stored with owner references. No archive path from the source is written to disk.
4. The browser requests normalized content and presents stable chapter/page sections. Reading position and percentage are saved through the progress route.
5. Notes attach to a book and optional chapter/location/selected passage; they remain if the chapter is later removed.

The current EPUB reader displays extracted text. The original PDF can be opened inline. Full EPUB rendering and other ebook formats need a separate design and security review.

## Whisper flow

The preview GET selects a short readable passage and returns its transcript without contacting AWS. The Listen action posts that exact transcript, language choice, and literal consent. The API rechecks ownership and transcript freshness. If Polly is configured, the API synthesizes with a Standard voice and caches by owner/text hash/voice settings. If it is not configured, the transcript remains available with no audio. Notes and reviews are not part of the request.

## User-generated review poster

Review content is saved as text. The browser draws a local PNG at 1080 × 1350 from the chosen theme, with full review text preserved in the record and caption even if the design must shorten its displayed copy. A user action downloads the file or opens the device's supported share sheet; no social API is called.

## Quality boundaries

- SQL values are parameterized; library operations include an owner filter.
- Files and covers are accessed only through owner-checked endpoints.
- Imported Markdown does not enable raw HTML.
- Use bounded parsing, pagination, lazy route loading, and local draft recovery before adding infrastructure for performance.
- Verify accessibility, browser support, backup/restore, and account boundaries before public hosting.
