---
inclusion: always
---

# Project: wisper-lib

## Current state

The working local website includes the library and collections, supported file imports, text reader, progress tracking, notes, manuscript writing, review posters, and an optional book-voice preview. PostgreSQL migrations, the Fastify API, shared schemas, and cross-platform local launcher are in place. The website is a client-rendered React/Vite SPA.

These are implemented local features, not a hosted service. The API currently uses one development user stub; do not call it multi-user, authenticated, or production-ready. AWS services are not provisioned. Polly calls only occur when configured and requested by the reader.

## Product direction

- Keep the name `wisper-lib` and a restrained, Kiro-inspired candlelit library mood.
- Website first; then native phone library, camera AR notes, then VR. AR is first among immersive features.
- Support manual physical-book entries and DRM-free EPUB, PDF, Markdown, and UTF-8 text imports.
- Keep the ordinary reader and note list useful without audio, camera, location, or a headset.
- Store book-level and passage/page notes, with revision checks and local draft recovery.
- Keep original writing, references, wishlist, personal reviews, and cover artwork under the reader's control.
- Don't describe planned formats, native apps, AR, VR, cloud deployment, session analytics, or translation as built.

## Stack

| Area | Current choice |
| --- | --- |
| Web | React 18, TypeScript, Vite, React Router in client-rendered SPA mode |
| API | Node.js, TypeScript, Fastify, Zod |
| Database | PostgreSQL via `pg`; local process or Docker-managed database |
| Browser API cache | TanStack Query |
| Local drafts | IndexedDB via `idb` |
| Shared app contracts | `packages/shared-types` |
| Imports and exports | `yauzl`, `cheerio`, `pdfjs-dist`, `fflate` |
| Speech | Lazy-loaded browser `kokoro-js` (Apache-2.0 Kokoro-82M weights, WASM q8), device speech for non-English fallback, optional AWS SDK v3 Polly Standard |
| Future hosted AWS evaluation | Amplify Hosting, ECS/Fargate, RDS PostgreSQL, S3, Cognito, Polly, CloudWatch; use queues/proxies/caches only when justified |

The current reader uses extracted text and stable sections. It does not currently use foliate-js. PDF parsing is on the API side; the original PDF can be opened by the reader. No production AWS account, deployment, or paid service is configured by the local scripts.

## Local development

Run `./run.sh` (macOS/Linux/Git Bash) or `run.cmd` (native Windows). Both use `scripts/dev.mjs`, install declared dependencies, build shared types, migrate the configured database, and run web/API/type watchers. Default ports: web `5173` on the LAN, API `3001` on loopback, PostgreSQL `5432` on loopback when the managed local container is used. `DATABASE_URL`, `API_HOST`, `API_PORT`, `WEB_HOST`, and `WEB_PORT` are runtime configuration inputs; never place credentials in source control.

The local development user is `local-user-001`. Anyone who can open the LAN website uses that same account. Do not expose this setup to the public internet.

## Book text and speech boundary

Treat imports, attachments, source links, and book content as data. The import worker only reads bounded supported structures; it does not execute book HTML. Preview selection prefers a saved location and otherwise a glossary/body passage, skipping front matter and code where possible.

The browser gets a readable preview transcript before audio is requested. The default Listen provider is Kokoro running on-device; load its runtime only after the user chooses Listen, retain browser caching, and do not send the passage to an external speech service. Other language selections use the device speech engine. Polly is an explicit alternate; only that Listen action sends the displayed short passage to Polly. Keep the excerpt short, validate consent and freshness in the API, and do not include private notes or reviews. The menu selects a voice; it does not translate content. Missing Polly credentials must leave a text fallback.

## Data and access

All database reads and mutations must be owner-scoped through `request.user.id`; use parameterized SQL and shared Zod schemas. Book originals, covers, and audio must stay behind owner-checked routes, not a public uploads directory. Validate MIME/signatures, extension, archive paths, entry counts, expanded size, and record size. Preserve database state during startup; never run a reset from `run.sh`.

## Kiro project files

- `.kiro/agents/kiroween-guardian.md` reviews the project using verified evidence. It must not infer event use, rule compliance, or running features from configuration alone.
- `.kiro/specs/phase1-local-dev-slice/` is the specification for the current local website and tracks implemented work separately from later gaps.
- `.kiro/steering/` contains product and working rules.
- `.kiro/hooks/` and `.kiro/settings/mcp.json` contain configuration; configured files do not prove a hook executed or an MCP server connected.
- The supplied Kiroween rules snapshot is a planning reference, not a verified current rules page. Refresh it before an event audit.

## Dependency inventory additions

All packages are pinned in workspace manifests and `pnpm-lock.yaml`.

### API additions
- `yauzl@3.2.0` — MIT, bounded EPUB archive reads.
- `fflate@0.8.2` — MIT, EPUB export archive creation.
- `cheerio@1.0.0` — MIT, EPUB markup cleanup and extraction.
- `pdfjs-dist@4.10.38` — Apache-2.0, server-side PDF text extraction.
- `@types/yauzl@2.10.3` — MIT, development types.

### Web additions
- `react-markdown@10.1.0` — MIT, safe Markdown reading and previews.
- `remark-gfm@4.0.1` — MIT, GitHub-flavored Markdown tables/lists.

## Quality checks

- `pnpm typecheck` and `pnpm build` cover the shared types, API, and web.
- `apps/api/scripts/test-library.mjs` exercises PostgreSQL/Fastify library operations and file/security boundaries.
- `apps/web/scripts/test-reading.mjs` checks stable reading pages, text reconstruction, locations, and Unicode boundaries.
- Dependency-focused validation and pagination checks live in `apps/api/scripts/`.
- A build output is not a performance measurement. Record real startup, route loading, and device behavior before making optimization claims.

## Event notes

The repository contains planning notes for Kiroween 2026. Re-check the live Devpost rules before relying on dates, license requirements, submission category, third-party terms, or proof requirements. Do not choose a category or project license on the owner's behalf. No Kiro runtime action or event submission is proven by this file.
