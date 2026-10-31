# wisper-lib

### A candlelit reading room for the books that stay with you.

wisper-lib is a personal library, reader, writing desk, and reading tracker. Browse a shelf with a quiet Kiro-inspired glow, keep your own books and covers, and leave notes beside the passages you want to remember. The atmosphere stays subtle; the reading tools stay in front.

**Current build:** a client-rendered website backed by a local Fastify API and PostgreSQL. It includes book shelves and collections, original manuscript writing, EPUB/PDF/text reading, progress, page notes, book reviews with poster export, and optional short audio previews. Phone AR and VR are planned; they are not part of this web build yet.

## What works today

| Area | Included in this build |
| --- | --- |
| Library | Add a manual book, import a DRM-free EPUB or PDF, or add Markdown/UTF-8 text. Search and filter books, use custom collections, choose grid/shelf/list/table views, set a wishlist, and upload a PNG, JPEG, or WebP cover. |
| Reader | Reflowable extracted text for EPUB and text files; extracted PDF text with an option to open the original PDF. Read by chapter/page, adjust text size and paper/sepia/night theme, bookmark, and save a reading location. |
| Tracker | Mark books unread, reading, paused, finished, or stopped; save a percentage and last location. |
| Notes | Keep a book note or attach a note to a reader page and selected passage. Search and tag notes, recover an in-progress draft on the same browser, and export Markdown or JSON. |
| Writing desk | Create an original book, arrange chapters, choose body/glossary/front matter, draft in Markdown with a preview and formatting tools, track a word goal, organize citations, and export Markdown or EPUB. Local drafts can be recovered after a browser interruption. |
| Personal reviews | Save a review with a star rating, write a caption, preview a 1080 × 1350 poster, download it as PNG, or use the device share sheet when supported. Nothing is posted automatically. |
| Book whispers | Preview a short readable passage from the last saved location, a glossary passage, or book text. Audio is opt-in. Configure Amazon Polly Standard credentials for server-side speech; otherwise the preview remains readable text. |
| Sample shelf | Add selected technical chapters from *The Rust Programming Language*, *The Cargo Book*, and *Rust by Example*. These are samples, not complete editions; their MIT notices and source links travel with the books. |

The supported import formats are DRM-free EPUB, PDF, Markdown, and UTF-8 text. Other ebook formats, OCR, online book discovery, phone AR, location memories, and VR are future work. An EPUB is currently read as extracted text rather than in its original page layout. PDFs retain the original file viewer as an option.

## Product direction

The website comes first, followed by a shared-library phone app, phone AR notes, and a VR reading room. AR notes will be anchored through the phone camera first; VR note placement comes later. A normal list and text editor remain available even when immersive features arrive.

For whispers, the website first shows a transcript selected from book text. If the reader chooses **Listen**, the API sends that short passage and the selected language/voice request to Amazon Polly. Private notes are never included. The language menu selects a voice; it does not translate the book. The web build offers English (US and UK), Spanish, French, German, Italian, Brazilian Portuguese, Hindi, and Japanese voice options. Availability depends on the configured AWS account and region.

## Technology

| Layer | Choice |
| --- | --- |
| Website | React 18, TypeScript, Vite, React Router in SPA mode |
| API | Node.js, TypeScript, Fastify, Zod contracts |
| Database | PostgreSQL through `pg`; local PostgreSQL or a Docker-managed development database |
| Browser state | TanStack Query; IndexedDB for recoverable writing and note drafts |
| Imports and exports | `yauzl`, `cheerio`, `pdfjs-dist`, `fflate` |
| Speech | Optional AWS SDK for JavaScript v3 client for Amazon Polly Standard |
| Shared contracts | `packages/shared-types` for browser and API schemas |

There is no deployed AWS environment yet. The local build does not need AWS credentials. Before deploying, a suitable AWS path can use Amplify Hosting for the static website, ECS/Fargate for the API, RDS PostgreSQL, S3 for book files and covers, Cognito for real accounts, Polly for speech, and CloudWatch for service monitoring. Add queues, caches, or database proxies only when measured workload justifies them. Estimate account-specific costs before provisioning.

## Run on this computer or your local network

Requirements: Node.js 20 or newer with npm. Docker Desktop/Engine is needed only when you do not already have a PostgreSQL database configured. Clone the repository, open its root folder, then run one of:

```bash
./run.sh
```

On native Windows, run `run.cmd` in PowerShell or Command Prompt. Both scripts use the same Node-based launcher. The launcher bootstraps the workspace package manager into npm's cache, installs declared dependencies, builds shared contracts, applies pending database migrations, and starts the API and website. It does not reset the database.

| Service | Default port | Use |
| --- | ---: | --- |
| Website | `5173` | `http://localhost:5173`; other devices on the same network can use the LAN address printed by the launcher. |
| Fastify API | `3001` | Loopback only; the website proxies `/api/v1` requests to it. |
| PostgreSQL | `5432` | Loopback only for the managed Docker setup, or the address in your existing `DATABASE_URL`. |

Useful options:

```bash
./run.sh --localhost                    # keep the website on this computer
./run.sh --web-port 5180 --api-port 3002
./run.sh --setup-only                   # install, build shared contracts, and migrate
./run.sh --skip-install                 # skip dependency installation on a repeat run
./run.sh --help
```

Keep the terminal open while using the app; Ctrl+C stops the development servers. On a first run without a database URL or API `.env`, the launcher prepares a local ignored configuration and starts PostgreSQL in Docker. Existing database settings and data are retained. See [architecture](docs/architecture.md) for service boundaries and [product plan](docs/product-plan.md) for future work.

### Local account and privacy

The development API uses one local account stub and has no sign-in screen. Anyone who can access the website on the LAN shares that account and its books, notes, and reviews. Use a trusted network. There is no deployed URL or multi-user authentication yet.

Audio starts only after an explicit listening action, unless the reader separately enables automatic previews. A short excerpt from book text can be sent to Polly when credentials are configured. Notes, AWS credentials, and database credentials stay out of browser requests. Camera, location, and VR access are not requested by this web version.

### Checks

```bash
pnpm typecheck
pnpm build
pnpm --filter api exec tsx scripts/test-validation.mjs
pnpm --filter api exec tsx scripts/test-pagination.mjs
pnpm --filter api exec tsx scripts/test-library.mjs
pnpm --filter api exec tsx ../web/scripts/test-reading.mjs
```

The API integration check uses the configured PostgreSQL database and cleans up its own test records. Do not point it at a database with important data.

## Project notes

- [Product plan](docs/product-plan.md) — what is implemented and what comes next.
- [Architecture](docs/architecture.md) — routes, persistence, deployment direction, and privacy boundaries.
- [Design guide](docs/design-guide.md) — the reading room's visual and interaction language.
- [Kiro project steering](.kiro/steering/) — current implementation decisions and working constraints.

The sample editions retain their source and MIT license notices in the imported book content and exports. The project's own license has not been selected.
