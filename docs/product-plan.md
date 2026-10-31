# Product plan

wisper-lib is a personal reading room: a useful book shelf and reader first, with a quiet candlelit Kiro mood around it. It helps readers keep their books, their own writing, their progress, and the thoughts they want to find again.

## Decisions that guide the build

- Build the client-rendered website first, then a phone app using the same API, then phone AR notes, then VR.
- Use the existing React/TypeScript/Vite frontend, Fastify API, PostgreSQL database, and shared Zod contracts. Perl is not part of the current stack.
- Use Amazon services where they solve a real need. Polly is optional for short book previews now; Cognito, S3, RDS, Amplify Hosting, ECS/Fargate, and CloudWatch are deployment choices, not provisioned services.
- Let a reader use the library, write, read, track, and take ordinary notes without speech, camera, location, or a headset.
- Keep book text, notes, and reviews private. The default Kokoro voice runs locally in the browser after Listen; Polly is an explicit alternate that receives the selected short excerpt only after the user chooses it and presses Listen. A language choice does not translate that text.
- Do not describe planned format, platform, deployment, or performance support as already working.

## Website capabilities in the current build

| Capability | Current behavior |
| --- | --- |
| Library and shelves | Add manual books, DRM-free EPUB/PDF, Markdown, or UTF-8 text. Search title/author, set tags, filter reading states and wishlist, upload PNG/JPEG/WebP covers, create and order collections, and choose grid/shelf/list/table views. |
| Book tracking | Keep unread, reading, paused, finished, and stopped states, plus reading percentage and saved location. |
| Reader | Read imported text in stable chapter/page sections; restore the last saved location; change type size and paper, sepia, or night theme; bookmark a page; optionally open the original PDF. EPUB layout is currently text-based. |
| Original writing | Create a manuscript, add/reorder chapters, classify body/glossary/front matter, edit Markdown with preview/formatting controls, set a word-count goal, organize references, and export Markdown or EPUB. Recoverable editor drafts are stored in that browser. |
| Book notes | Write a general note or attach it to a chapter/page and selected text. Search, tag, edit with revision conflict detection, and export Markdown or JSON. Recoverable note drafts are stored in that browser. |
| Personal reviews | Draft a review from a book or note, save it privately, adjust its rating/theme/caption, render a PNG poster, and download or share through the device share sheet. The app does not post directly to social accounts. |
| Whisper preview | Find a short passage near the last saved location, falling back to glossary/body/description. Read the transcript in the library; load Kokoro locally after Listen by default. Other languages use the device voice; Polly is available as an explicit alternate. |
| Sample editions | Add selected technical chapters from three MIT-licensed Rust books. Source links and complete MIT notices are kept with each edition. |

### Reading support that is not in this build

MOBI/KF8, FB2, and CBZ import/rendering; original EPUB pagination; text search inside a whole imported file; highlights; session history; reading goals; and OCR are future work. The current importer accepts EPUB, PDF, Markdown, and UTF-8 text. PDFs retain a link to the original file while the accessible text reader works from extracted page text.

## Next milestones

### Web polish and operating baseline

Finish manual verification of add/edit/remove, covers, shelf ordering, notes, manuscript conflicts, exports, poster download, reduced motion, keyboard use, and narrow layouts. Measure cold and repeat startup, route chunks, and reader responsiveness before making performance claims. Add no infrastructure until deployment cost and account/region choices are understood.

### Native phone app

Build on the current API and shared contracts. Add sign-in with Cognito before multi-user hosting, then offline book downloads and queued note edits. Resolve sync conflicts without silently replacing either version. Start location features with manually opened place memories; request location permission only for a reader-selected feature.

### Phone AR notes

Use the camera to place a note at a recognized surface or recoverable visual anchor. Store the camera anchor separately from optional geographic coordinates. Include a normal note list and a way to recover or re-place a lost anchor. Validate with a real target phone before promising persistence.

### VR reading room

After the shared reader and phone note model are stable, prototype a small WebXR reading room with books and note cards. Support seated use, text entry, adjustable scale, and a clear exit to the ordinary reader. Do not load 3D code into the library's initial bundle.

## Ideas for later

| Idea | A modest first version | Guardrail |
| --- | --- | --- |
| Geographic memories | A reader-selected place label and optional coarse map point attached to an existing note. | Location permission is optional; geographic proximity is not a reliable room anchor. |
| Photo-to-note | Capture a chosen page, extract text with an optional OCR service, and let the reader correct it. | Explain where the image and extracted text go; do not upload a photo without the reader's action. |
| Reading recall | Resurface saved notes or highlights on a chosen schedule. | Every reminder links to the reader's own source and is easy to dismiss. |
| Idea links | Connect notes across books and show both a visual map and an accessible list. | Links are user-created; no automatic relationship is treated as fact. |

## Deployment direction

For a future AWS hosted version, evaluate Amplify Hosting for static assets, ECS/Fargate for the API, RDS PostgreSQL, S3 for private books/covers, Cognito for accounts, Polly for speech, and CloudWatch for operational metrics. Prefer a simple indexed PostgreSQL query and paginated API before adding RDS Proxy or ElastiCache. Consider SQS when a real import/audio workload needs asynchronous jobs. Measure latency and concurrency, estimate regional network/storage costs, and get the owner's budget before provisioning.

## Decisions still owned by the project owner

- Choose the project's own open-source license before public release.
- Choose the first AR test phone and VR headset when those milestones begin.
- Set an AWS region, budget, and public hosting plan before creating paid cloud resources.
- Replace the local-user stub with authentication before exposing a multi-user deployment.
- Confirm the supported EPUB corpus and accessibility requirements before adding a full layout renderer.
