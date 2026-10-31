# Requirements — local web reading room

## Scope

This specification describes the implemented local website in the current branch. It does not claim a deployed service, multi-user authentication, native app, AR, VR, translation, or full layout rendering. The website uses a Fastify API, PostgreSQL, and shared Zod contracts. The local API user is a development stub.

## Requirements

### R1 — Local operation

1. `run.sh` and `run.cmd` launch the shared Node development runner.
2. The website defaults to port 5173, the API to loopback port 3001, and managed local PostgreSQL to loopback port 5432.
3. The runner installs declared workspace packages, builds shared contracts, applies migrations, checks service readiness, and stops child processes on exit.
4. A normal run never resets existing database contents.

### R2 — Private personal library

1. The development user can create manual entries and import DRM-free EPUB, PDF, Markdown, and UTF-8 text.
2. Library lists are cursor-paginated and can be searched/filtered by supported metadata, shelf, reading state, and wishlist.
3. Each entry can have a custom validated cover, tags, language, accent, and collection.
4. Grid, shelf, list, and table views are available. A reader may create, edit, color, lay out, reorder, and remove collections.
5. Removing a collection moves its books to the general library. Removing a book is an explicit, confirmed action.
6. Every read/write is scoped to the local `request.user.id`; this stub does not isolate multiple people because it is not authentication.

### R3 — Reading and progress

1. The reader presents normalized text in stable chapter/page sections and restores the last saved location.
2. Reader controls change text size and paper, sepia, or night theme; page bookmarks persist.
3. PDF text is extracted for the reader, and an option opens the owner-checked original PDF.
4. Progress and reading status persist. Reading statuses include unread, reading, paused, finished, and stopped.
5. Imported editions cannot be overwritten through the original-book writing endpoint.
6. Full EPUB layout, MOBI/KF8, FB2, CBZ, highlights, whole-book search, and reading-session analytics are outside this build.

### R4 — Original books

1. A reader can create a manuscript and edit its metadata, chapters, section type, references, and language.
2. Chapters can be added, removed, reordered, previewed as Markdown, and exported as Markdown or EPUB.
3. Writing goals count words in the current manuscript.
4. IndexedDB keeps local draft recovery separate from server-saved content.
5. Content revisions reject stale saves without discarding the local draft.
6. References accept only valid HTTP(S) URLs without embedded credentials.

### R5 — Notes

1. A note may stand alone or reference an owned book, chapter, reader location, and selected text.
2. Notes can be searched, tagged, edited, removed, and exported as Markdown or JSON.
3. Note revisions detect a stale edit and preserve the reader's local draft.
4. Deleting a referenced chapter does not delete the note.

### R6 — Reviews and sharing

1. A personal review may reference an owned book or a source note, with a title, body, rating, poster theme, and editable caption.
2. The browser can render a 1080 × 1350 PNG poster and download it.
3. A supported device share sheet can receive a user-selected PNG and caption. The app does not post to a social network itself.
4. Long poster text is shortened visually with a notice; saved review text remains complete.

### R7 — Speech previews

1. A preview returns readable transcript text before any speech provider request.
2. Passage selection prefers a saved reading location and may fall back to glossary, body, or description while skipping non-reading material.
3. The default free voice runs the Kokoro model in the browser after Listen. Model files download on first use; the selected passage stays on-device.
4. If the selected language is outside the local English voices, use a matching installed device voice when available.
5. Polly is an optional, explicit provider. Only its Listen action may submit the visible short passage to Amazon Polly.
6. The API validates Polly consent and transcript freshness. Private notes and reviews are never sent to Polly.
7. Polly uses Standard voices when configured. Missing credentials/provider access yields a useful transcript fallback.
8. The language picker chooses an available voice and is not a translation service.
9. Available UI language choices are English (US/UK), Spanish, French, German, Italian, Brazilian Portuguese, Hindi, and Japanese.

### R8 — Licensed samples

1. The sample import adds selected chapters from The Rust Programming Language, The Cargo Book, and Rust by Example.
2. Each sample identifies its upstream source and carries its MIT notice into stored content and exports.
3. Repeating sample import does not add another copy of each sample to the same owner.
4. The samples are selected excerpts, not full copies of those books.

### R9 — Responsive experience

1. Library and reader routes work without full-page navigation and load route code on demand.
2. Ambient atmosphere and preview sound are optional; reduced motion is respected.
3. Pages include semantic labels, loading/error/empty states, and responsive layouts.
4. Keyboard and narrow-screen behavior must be verified manually before claiming accessibility conformance.

## Not implemented

Native iOS/Android, Cognito, production hosting, S3, geo memories, phone AR, VR, OCR, translation, social-network posting, full-layout EPUB rendering, and the unsupported file formats listed in R3. These require their own scope and verification before being described as available.
