# wisper-lib

### A candlelit library where your unread books whisper.

wisper-lib is a personal book library, reader, and reading tracker with a quiet haunted-library feel. Keep your own books on the shelves, pick up where you stopped, and leave notes beside the passages you want to remember. The books you haven't opened can whisper a little invitation through Amazon Polly.

The reading experience takes inspiration from Kindle: comfortable typography, bookmarks, highlights, and a place for every book. The setting is Kiro-themed, with warm candlelight, dark shelves, parchment notes, and a restrained Kiroween mood.

**Status: Planning.** This repository contains product documentation and existing Kiro project configuration. There is no runnable app, published demo, or connected AWS service yet. The features below describe the intended product.

## Inside the library

| Part of the library | What it should do |
| --- | --- |
| Your shelves | Add books manually or upload supported files. Organize them by collection, author, tags, and reading status. |
| The reader | Read personal EPUB books, adjust type and spacing, search inside a book, use the table of contents, and save bookmarks and highlights. PDF reading follows as a separate reader. |
| Reading tracker | Track unread, reading, paused, finished, and did-not-finish books. Record sessions, set optional goals, and see your reading history. |
| Book notes | Write thoughts about a book or attach notes to a passage. Search, edit, tag, and export them. |
| Whispering books | Opt in to short, spoiler-free whispers from unread books using Amazon Polly. Every whisper has visible text and a mute control. |
| Place memories | Attach a note to a location and choose when to revisit it. All notes remain available in the regular notes view. |
| Camera notes | Use the phone camera to create and revisit AR notes attached to a real surface or a recognized marker. |
| The VR library | Visit a virtual reading room, arrange notes in space, and open the same books and notes used elsewhere. |

## A visit to the library

Add a book to the unread shelf. When you choose to listen, it might whisper, “You left a story waiting on this shelf.” Open it, read a chapter, highlight a line, and write a note. Your place and reading progress should be saved together.

Later, attach that note to the place where you read it. On the phone app, a camera view can bring the note back into the room. In VR, the same note can sit beside the book on a virtual desk.

The ordinary shelf, reader, and notes list remain the main way to use the app. Audio and immersive views are optional.

## Build order

1. **Website:** Responsive shelves, EPUB reading, tracking, book notes, and a small Polly whisper demo.
2. **Phone app:** The same account and library, reading on the go, offline work, and location-linked notes.
3. **Phone AR:** Camera note creation and a reliable way to find saved notes again.
4. **VR:** A virtual library with note creation and editing, after the shared library and note system work well.

The website and phone app should share books, progress, and notes. Camera anchoring, background location reminders, and headset features will depend on device support. The website will always offer a normal list view for spatial notes.

## Reading and privacy

Start with personal uploads, original writing, and books made available for this use. The first reader targets DRM-free EPUB files. Kindle purchases, Amazon account syncing, and a commercial book store are outside the initial scope.

Books and notes are private by default. Camera and location access should be requested when someone uses those features. The plan uses selected location pins, with no continuous location history. Whisper generation sends only the short text needed for that whisper to Polly; private notes are excluded by default.

## Perl and AWS

The backend will use **Perl 5**, with Mojolicious proposed for the web application and API. The website starts with server-rendered HTML, CSS, and focused browser code for reading. Amazon RDS for PostgreSQL is the selected hosted database for books, progress, and notes; local development uses PostgreSQL. This gives the project a practical way to bring mature web technology into a modern reading experience.

The planned AWS stack uses RDS for PostgreSQL for library data, S3 for private files, Polly for whispers, Cognito for accounts, and ECS/Fargate with ECR for the Perl application. Secrets Manager holds service secrets; CloudWatch provides operational logs and metrics. Hosting sizes and costs will be checked before resources are created. Phone AR and browser VR will use the same API while keeping their device-specific interfaces.

Amazon's [early online bookstore](https://press.aboutamazon.com/1995/10/worlds-largest-bookseller-opens-on-the-web) is part of the inspiration. AWS has also published [guidance for Perl developers](https://aws.amazon.com/blogs/developer/hello-perl-developers/). The project does not claim to recreate Amazon's original technology stack.

## Later experiments

- **Photo-to-note capture:** Select a page image, extract text with Amazon Textract, correct it, and attach it to a book note.
- **Reading recall:** Revisit saved highlights through optional prompts. Later, Amazon Bedrock could help draft questions from notes the reader chooses to share with it.
- **Connected notes:** Link ideas across books and view them as a constellation, with an ordinary searchable list alongside it.

These follow the core reader and tracking work. They are planned experiments; no AWS service is connected yet.

## Project documents

- [Product plan](docs/product-plan.md): Features, release stages, completion criteria, and remaining decisions.
- [Architecture](docs/architecture.md): Proposed services, shared data, Polly, syncing, and spatial notes.
- [Design guide](docs/design-guide.md): The Kiro theme, screens, reading controls, and accessibility.

## Working on the project

```bash
git clone https://github.com/abhibizz158/wisper-lib.git
cd wisper-lib
```

There are no installation or run commands yet because the application stack has not been implemented. The architecture document proposes a starting point; it is not a list of installed dependencies.

Kiro steering, hooks, and agent configuration are already tracked in [`.kiro/`](.kiro/). As implementation begins, the steering documents should follow the actual product decisions. Build evidence and service integrations should be documented as they happen.

The project license still needs to be chosen. A license file has not been added.
