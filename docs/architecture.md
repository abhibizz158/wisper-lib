# Architecture

This describes the running local implementation and the boundaries for later work. The website, Fastify API, and PostgreSQL migrations are in the repository. No production AWS resources or authentication provider are configured.

## Current stack

| Part | Technology | Responsibility |
| --- | --- | --- |
| Website | React 18, TypeScript, React Router, Vite SPA | Client-rendered screens and route-level code splitting. |
| Browser cache | TanStack Query | Cache API results and refresh lists after changes. |
| Recoverable drafts | IndexedDB | Keep manuscript, note, and review drafts on the current browser. This is not cloud sync. |
| API | Node.js, Fastify, TypeScript, Zod | Input validation, owner-scoped operations, file imports/exports, and optional speech synthesis. |
| Database | PostgreSQL through `pg` | Library, chapters, references, reading progress, notes, collections, reviews, and speech cache records. |
| Shared contract | `packages/shared-types` | Runtime schemas and TypeScript shapes used by the browser and API. |
| Import/export | `yauzl`, `cheerio`, `pdfjs-dist`, `fflate` | Bounded EPUB reading, HTML cleanup, PDF text extraction, and EPUB export. |
| Speech | AWS SDK for JavaScript v3 and Polly Standard | Optional server-side short-passage audio. An unavailable credential falls back to text. |

## Local processes

`run.sh` and `run.cmd` invoke the cross-platform Node launcher in `scripts/dev.mjs`. It bootstraps the pinned pnpm version into npm's cache, installs workspace packages, builds shared types, applies pending migrations, and runs the web/API/type watchers. It reuses a configured local database or starts the managed PostgreSQL development container when Docker is available. It never resets an existing database.

The Vite website listens on `0.0.0.0:5173` by default for LAN access. The API binds to `127.0.0.1:3001`; Vite proxies `/api/v1` to it so a phone on the same trusted LAN does not need direct API access. PostgreSQL uses the configured `DATABASE_URL`, or loopback `5432` for the managed dev database. Port overrides are passed through the launcher.

## Request and data boundaries

- The API lives under `/api/v1` and returns `{ data, meta? }` envelopes. List routes use cursor pagination.
- Shared Zod schemas validate books, manuscripts, references, notes, reviews, shelves, and whisper languages before database writes.
- Database queries scope records by `request.user.id`. The current local pre-handler sets one development user (`local-user-001`); this is not multi-user authentication.
- PostgreSQL uses parameterized queries, foreign keys, and migrations. Indexes cover owner/shelf ordering, wishlist lookup, title lookup, chapter ordering, note book/time lookup, review ordering, and speech-cache uniqueness.
- Manuscript saves use a book content revision. Note updates use their own revision. A stale save returns a conflict so the browser can preserve the unsaved draft.
- Notes support an optional chapter identity, page/location token, and selected passage. Chapter deletion clears the reference while retaining the note.
- The original book file and custom cover are served from owner-checked API routes. There is no public static `/uploads` mapping.
- EPUB import reads bounded archive entries without extracting user paths to disk. PDF extraction, file size, archive expansion, chapter length, and worker concurrency are bounded. DRM and unsupported ebook formats are rejected with an explanation.
- Markdown is rendered without raw HTML. Imported book text is treated as content, not executable application instructions.
- Audio cache metadata is scoped to the local owner. Whisper synthesis has bounded concurrency and request counts. Browser code never receives AWS credentials.

## Main API surfaces

| Route | Purpose |
| --- | --- |
| `GET/POST /books`, `GET/PATCH/DELETE /books/:id` | Browse, create, edit, and remove library entries. |
| `POST /books/upload`, `GET /books/:id/file` | Import an allowed book file and retrieve its private original. |
| `GET/PUT /books/:id/content`, `GET /books/:id/export` | Edit a new manuscript and export Markdown/EPUB. Imported editions are read-only. |
| `POST /books/:id/progress` | Save state, position, and percentage. |
| `GET/POST/PATCH/DELETE /shelves`, `PUT /shelves/order` | Manage and reorder personal collections. |
| `GET/POST/PATCH/DELETE /notes` | Find, create, revise, remove, and export personal notes. |
| `GET/POST/PATCH/DELETE /reviews` | Manage private reviews and editable sharing captions. |
| `GET /speech/languages`, `GET /books/:id/preview` | List configured voice options and select a readable passage without contacting Polly. |
| `POST /books/:id/whisper`, `GET /whispers/:id/audio` | After consent, synthesize or retrieve the selected passage audio. |
| `POST /demo/import` | Import the three pinned, MIT-licensed sample editions once per owner. |

## Data model at a glance

`books` stores imported and manual metadata, optional private file/cover paths, shelf, wishlist, and sample-license/source fields. `chapters` stores normalized reader text and original manuscript sections. `book_references` stores author-added citation details. `reading_records` stores status, last location, and progress. `notes` can link to a book, chapter, selected text, and page token. `reviews` can link to a book or source note. `shelves` stores each user's collection name, color, layout, and order. `whisper_assets` stores owner-scoped synthesis cache metadata.

Search currently uses title/author matching for books and PostgreSQL text search for notes. A dedicated full-text index, richer tag filters, reading session analytics, and cross-device synchronization can be added when their product needs are defined.

## Optional Polly flow

1. The browser requests `GET /books/:id/preview?language=...`; the API uses the saved location first, then glossary, body, or description and returns a short transcript. This step does not call AWS.
2. Only after the reader chooses **Listen** does the browser post the displayed transcript, selected language, and explicit consent.
3. The API checks ownership, consent, source transcript freshness, request bounds, and available credentials. If no credentials are configured, it returns the readable-text fallback.
4. When enabled, the API wraps the excerpt in the Polly whisper SSML effect, uses a Standard voice, and caches the resulting audio by text hash and voice parameters.

The selected passage comes from book text and is sent to the configured AWS service only on the listening action. Private notes and reviews are not submitted to Polly. Voice language selection is not translation. Confirm account, region, retention, and pricing before enabling a hosted integration.

## Performance approach

- Keep the initial app shell small and defer route-specific reader, writing, note, and review code.
- Paginate book and note lists; keep result sets bounded.
- Keep PDF parsing on the API's bounded import worker path; do not put the PDF package in the browser shell.
- Use indexed, owner-scoped PostgreSQL queries before adding a cache or proxy service.
- Keep decorative motion brief and respect `prefers-reduced-motion`; audio is never forced.
- The last recorded production build splits route CSS and JavaScript. Re-measure compressed initial chunks and real-device loading before making target claims.

## Deployment direction (not yet provisioned)

For a hosted AWS deployment, evaluate Amplify Hosting for the static website, ECS/Fargate for the API, RDS PostgreSQL, S3 for private books and covers, Cognito for accounts, Polly for speech, and CloudWatch for operational telemetry. Keep database and file storage private; issue short-lived authorized file access only after owner checks. Introduce SQS for long import/speech work only when measured duration or traffic requires it. RDS Proxy, ElastiCache, and private-media CloudFront are conditional optimizations, not default prerequisites.

Before creating resources, select an AWS region and budget, estimate compute/database/storage/transfer charges, decide backups and retention, add production authentication and HTTPS, and test file and account isolation. None of the future resources is created by `run.sh`.
