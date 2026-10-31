# Product plan

wisper-lib should make it easy to choose a book, read it, and remember what stayed with you. Its candlelit setting and whispering shelves give the library its character. The reader and tracker need to work well before the immersive parts grow.

## Agreed direction

- Keep the project name `wisper-lib`.
- Build the website first, then the phone app.
- Support both phone AR notes and a VR library, with AR first.
- Use Perl for the backend, refine mature web technology where it fits, and prefer AWS services for clear product needs.
- Use Amazon RDS for PostgreSQL as the primary hosted database, with S3 for files, Cognito for accounts, and ECS/Fargate for the hosted Perl application.
- Use Amazon Polly for book whispers.
- Keep a Kiro-themed, candlelit library throughout the experience.

The release boundaries below are proposed planning decisions. No feature is implemented yet.

## First release: The website

### Shelves and book details

Support manual entries for physical books as well as uploaded reading files. A manual entry should still have tracking and notes without requiring an ebook. Store a title, author, cover, description, tags, and optional ISBN. Let the owner correct imported metadata.

Provide grid and list views, search, collections, and filters for unread, reading, paused, finished, and did not finish. A book detail page brings together progress, sessions, notes, and the option to read or hear a whisper.

### Reader

Start with reflowable, DRM-free EPUB. Include a table of contents, text search, bookmarks, highlights, and passage notes. Reading controls cover font size, font choice, line spacing, content width, and paper, sepia, and dark themes.

Save a stable location in the book so changing type size does not lose the reader's place. Treat PDF as a later format with its own page-based behavior. Fixed-layout EPUB and complex publications need compatibility work before they are advertised as supported.

### Tracking

Let readers update status and progress themselves. In the EPUB reader, record the last location and derive approximate percentage from positions in that edition. For physical books, allow page counts or a manual percentage.

Record session dates and duration, allow corrections, and offer optional daily or yearly goals. Finishing a book records the date; rereading starts a new reading record while preserving earlier history. Pausing or stopping a book should be an ordinary action, without guilt-based messages.

### Notes

Support book-level notes and passage notes with a short title, body, tags, and timestamps. Selecting a passage note should return to its source when the same edition is available. Search notes across the library and export them as Markdown or JSON.

Save drafts locally if the connection drops. Show whether changes are saved, pending, or need attention. If two devices edit a note, preserve both versions for resolution.

### Whispers

Use short templates drawn from book metadata and reading status. An initial whisper can be an invitation to read; it does not need generated plot summaries or an additional AI service. Keep it spoiler-free and avoid speaking private notes.

Ask readers to enable sound. Offer a visible transcript, replay, volume, and mute. Play one whisper at a time and keep shelves silent during reading. If Polly fails, show the text and let the reader continue.

### First-release completion criteria

- A reader can add a manual book and import a supported EPUB, then find both on their shelf.
- An imported book opens, supports reader controls, and returns to the saved location after reopening.
- A highlight and its note survive reopening and return to the correct passage.
- Status changes, manual progress, sessions, and rereading history remain consistent.
- Notes can be searched and exported without losing their book and passage references.
- An unread book can play a Polly whisper after sound is enabled, with a transcript and mute control.
- One user's books and notes cannot be accessed from another user's account.
- The hosted release saves library records in private RDS PostgreSQL, retrieves files through authorized S3 access, and handles database reconnects without losing or duplicating updates.
- Shelf, reader, and note flows work with keyboard navigation and on a narrow phone screen.

## Second release: Phone app and place memories

Bring the same account, books, reader state, tracker, and notes to the phone. Provide explicit download controls for offline reading, note drafts, pending changes, and a way to resolve conflicting edits.

Allow the reader to attach a place label and optional location pin to a note. Start with manually opening nearby notes. Background arrival reminders follow only after battery use, permissions, and mobile platform behavior have been validated. Let readers adjust the reminder radius, remove location data, or use a place label alone.

Completion means a book and note created on the website appear on the phone; offline edits sync without silent data loss; denied location permission still leaves the notes fully usable.

## Third release: Phone AR notes

Open the camera from a book or note, choose a detected surface or known marker, and place a note card. Support creating, editing, moving, and deleting the card. Always provide a normal editor alongside the camera view.

Prototype returning to a saved anchor on one target device before committing to persistent notes everywhere. A marker or user-assisted placement can be the first reliable approach. GPS identifies an approximate area; a spatial anchor identifies a position relative to the camera's surroundings. Store them separately.

Completion means a note can be placed, saved, and found again under documented conditions. If the anchor cannot be recovered, show the note in a list and offer to place it again. Camera frames stay on the device unless a clearly explained, optional anchoring service requires otherwise.

## Fourth release: VR library

Build a small virtual room with shelves, a reading desk, and spatial note cards. Support opening books, creating and editing notes, moving cards, and saving room placement through the shared account. Prototype text entry and passage selection on the chosen headset before promising a full reader.

Include a seated mode, adjustable scale, comfortable movement, and a way to return to a standard screen. Ship against a named device and browser support list, based on real testing. Completion includes opening and editing the same note on web, phone, and VR without losing its content.

## Further experiments

These are proposals after the core website is useful. They do not expand the first-release completion criteria or change the agreed phone, AR, and VR order.

| Experiment | Reader experience | Smallest useful version | Completion check |
| --- | --- | --- | --- |
| Photo-to-note capture | Turn a photographed passage into an editable note. | A selected image, optional Textract extraction, text correction, and manual book selection. Camera integration follows on the phone. | Extracted text is editable, the source is visible, and temporary image deletion is documented. |
| Reading recall | Revisit ideas from books already read. | Resurface saved highlights on chosen dates; optionally draft questions with Bedrock later. | Prompts link to their actual source notes and can be skipped or disabled. |
| Note constellation | See connections between ideas across books. | User-created links and tags, a small graph, and an accessible list. | Opening any connection returns to the correct notes; no invented book passages appear. |

Use the same note system for these features so an extracted passage or recall response can later be attached to a place, viewed through AR, or placed in the VR room. Keep each cloud-assisted action explicit and show what content it will send.

## Decisions before implementation

| Decision | Proposed starting point | When it matters |
| --- | --- | --- |
| First mobile platform | Choose Android or iOS based on the phone available for AR development. | Before the mobile and anchor prototype. |
| Book sources | Personal uploads, manual entries, and a small permitted demo collection. | Before importing sample books. |
| Custom books | Treat these as personal uploaded files initially; a book-writing editor would be a separate feature. | Before finalizing the reader scope. |
| Offline support | Website saves note drafts first; full downloaded books follow with the phone app. | Before reader storage is implemented. |
| Perl and AWS compatibility | Validate Mojo::Pg/DBD::Pg against RDS PostgreSQL, Cognito sign-in, and a Paws adapter for S3 and Polly. Framework and module choices remain proposals until that check. | Before committing to service integrations. |
| Hosting and budget | Choose the AWS region, RDS size, availability and backup settings; estimate ECS/Fargate, RDS, storage, and service usage, with quotas and alerts. | Before creating paid infrastructure. |
| License and event submission | Owner chooses a license and confirms the submission category and current event requirements. | Before a release or submission. |

A book store, social feed, subscription billing, automatic whole-book summaries, and full-book narration can wait until the core library is useful. Optional recall questions use selected notes and do not require whole-book summaries.
