# Design guide

The reading room has a little candlelit mystery around it, but it should still feel like a book app. Give covers the stage, keep controls clear, and let the reader choose how much atmosphere to keep on screen.

## Visual language

| Element | Direction |
| --- | --- |
| Library | Deep green-black shelves, warm amber light, and a small violet accent for notes. |
| Book surfaces | Rounded, slightly reflective cards with thin borders, restrained glass transparency, and a clear focus state. |
| Covers | Preserve an owner's uploaded cover. When there is no cover, use a typographic cover colored by the reader's chosen book accent. |
| Reading page | Separate the book from the darker application shell. Use generous line spacing and three paper themes: paper, sepia, and night. |
| Writing desk | Use the same warm/dark surfaces as the library, with an easy-to-find Markdown editor, preview, citations, and word goal. |
| Mood | Candlelight is the default. Moonlit and forest palettes and an ambient-effects switch offer quieter alternatives. No forced sound or horror imagery. |
| Type | System sans for controls; Georgia/serif stack for book text and selected titles; monospace for code examples. |

Kiro and Kiroween are a source of mood, not a borrowed product logo. This project does not claim to be an official Kiro/Amazon interface. Keep the seasonal touches restrained: warm light, a few spectral accents, and slow shelf transitions.

## Motion, sound, and accessibility

- Respect `prefers-reduced-motion`; transitions should collapse when the reader asks for less motion.
- Ambient shelf effects can be switched off. They never run behind the reading text.
- Preview audio is opt-in, shows its transcript, and has a volume control. Automatic preview is a separate choice.
- Use semantic headings, labelled inputs, visible focus, keyboard-operable controls, skip navigation, and dialog Escape behavior.
- Do not use color alone for book status, note presence, errors, or progress.
- Check foreground/background contrast and hit areas in every palette, at narrow widths, and at browser zoom before calling the UI accessible. Do not claim WCAG conformance without an audit.

## Screen patterns

### Library

The library opens as a quiet launch screen: one selected book is in the hero stage and a horizontal, keyboard-browsable rail gives neighboring covers room to move. The cover rail supports snap scrolling on touch, left/right keys and buttons, a visible book-options action, and a right-click shortcut. Keep search, reading-state filters, wishlist, sorting, and collection controls reachable without covering the books. Grid, shelf, list, and table layouts remain available as alternate views.

Use warm glass surfaces, subtle cover reflections, and short opacity/transform transitions to carry the same focus language into Notebook, Writing Desk, and Reviews. Keep the intro brief and skippable, and skip motion when reduced motion is enabled. Use ambient styling as a backdrop; never make sound automatic by default.

Book whispers should be transcript-first and opt-in. The current free voice is Kokoro TTS running in the browser, lazy-loaded after Listen; its English voice is slowed and given a restrained room tone. Other languages use the device speech engine. Amazon Polly remains a separately selected, server-side option. Do not send book text to Polly unless the reader selected that provider and presses Listen.

An empty library points to three practical next steps: add a book, write an original one, or browse the sample editions. Sample covers and labels identify them as selected editions.

### Reader

The current reader opens text extracted from the imported edition and arranges it into stable reading sections. Keep previous/next, chapter contents, bookmark, notes, type size, and paper theme easy to find. If a PDF was imported, make the original PDF available without blocking the text reader. Do not imply that EPUB pagination or arbitrary file search is implemented yet.

Reader controls should stay compact on a phone. Text should remain the primary surface, with a comfortable column width on larger screens and no horizontal scrolling at narrow widths.

### Notes and writing

Show the book, chapter/page token, and selected excerpt beside a passage note so it can be recognized later. Preserve the text in an IndexedDB draft until a confirmed save. When the server reports a revision conflict, keep the draft visible and offer a comparison path.

The writing desk keeps chapter navigation, section type, Markdown writing/preview, source list, and word goal close to the editor. Reference URLs must be valid HTTP(S) links. Make it clear which manuscript version is saved to the API and which text remains a local draft.

### Review poster

Keep the full review as editable text, and preview the shareable 1080 × 1350 image as a secondary view. Provide three restrained themes. Explain when poster text is shortened; retain the full review and caption. Let the reader download the PNG or open the device share sheet, but never publish a post automatically.

## Responsive and performance notes

- Keep the website usable at 320 px and 375 px, with narrower content flowing vertically rather than overflowing.
- Lazy-load reader, writing, note, and review routes. Do not put PDF parsing or future 3D code in the initial library bundle.
- Keep cover art lazy except for the featured cover and use bounded list pages.
- Test the ambient/transparency palette in browsers with reduced transparency and reduced motion enabled.
- The visual tokens live in `apps/web/src/styles/tokens.css`; global layouts and responsive states live in `apps/web/src/styles/global.css`, with route-specific details beside each page.
