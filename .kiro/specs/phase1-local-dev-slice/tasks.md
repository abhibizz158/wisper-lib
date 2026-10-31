# Delivery record — local web reading room

The table records what is present in the current branch. “Implemented” means the code exists; it does not imply a production deployment or exhaustive accessibility/device audit.

| Area | Status | Current evidence |
| --- | --- | --- |
| Workspace, launcher, shared types | Implemented | `run.sh`, `run.cmd`, `scripts/dev.mjs`, migrations, workspace build and typecheck. |
| Library API and database | Implemented | Owner-scoped books, custom covers, shelves, ordering, progress, cursor pagination, wishlist, demo imports, and validation. |
| File imports | Implemented with limits | DRM-free EPUB/PDF and Markdown/UTF-8 text; archive/file bounds; PDF/EPUB parsing runs off the API request thread. MOBI/KF8/FB2/CBZ are not supported. |
| Library website | Implemented | Search/filter, add/edit/delete, custom covers, collections, four layouts, selection stage, responsive styles, and whisper preview. |
| Text reader | Implemented | Extracted stable sections, saved position/progress, bookmarks, size/theme controls, page notes, and original PDF viewer. Not a full EPUB-layout renderer. |
| Notes | Implemented | Book/passage links, search/tags, revision-aware updates, browser draft recovery, and exports. |
| Original writing | Implemented | Chapters, section types, Markdown preview/formatting, references, word goal, local draft recovery, conflict handling, Markdown/EPUB export. |
| Reviews | Implemented | Private review records, source-note/book selection, editable caption, canvas poster generation, download, and device share handoff. No direct social posting. |
| Speech | Implemented; cloud account not verified | Lazy browser-local Kokoro English voice, device voice for other selected locales, saved-location-first excerpt selection, transcript-first UX, optional Polly provider with explicit consent/freshness checks and bounded synthesis/cache. No production Polly credentials were available for a real AWS call. |
| Free technical books | Implemented | Three selected Rust book editions with pinned sources and retained MIT notices. |
| Mobile, AR, VR, geo memories | Future work | Product plan records website → phone app → phone AR → VR. No implementation is claimed. |

## Remaining web verification

- Verify collection movement and persistence in the running browser.
- Verify cover upload/removal, file import, note and review journeys, and export downloads in the browser.
- Check 320/375 px layouts, keyboard-only navigation, dialog behavior, and contrast in each mood.
- Check direct route refresh and confirm route-specific chunks are not loaded with the initial library.
- Run with Polly credentials in a deliberately chosen AWS test account before claiming provider speech works end to end.
- Measure cold/repeat local startup and real device/browser behavior before claiming optimization results.

## Before a hosted release

- Replace the local account stub with Cognito-backed authentication and verify multi-owner isolation.
- Select an AWS region and budget; provision hosting, API, database, and private file storage only after review.
- Configure TLS, backups/retention, privacy controls, operational monitoring, and account-specific service costs.
- Choose the project's own license. The demo books retain their separate upstream MIT notices.
- Define support for full EPUB layout, highlights, remaining formats, and reader accessibility before implementing them.
