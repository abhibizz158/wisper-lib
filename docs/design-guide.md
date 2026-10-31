# Design guide

The library should feel like a place to settle into a book: dark wood shelves, a small pool of candlelight, and notes on warm paper. Keep the Kiro and Kiroween character in the shelves and transitions. Reading pages need generous space and steady lighting.

## Visual direction

| Element | Direction |
| --- | --- |
| Library background | Ink brown `#171411`, with a slightly lighter surface `#24201B`. |
| Reading paper | Warm parchment `#F3E8D0` with dark ink `#29231D`. |
| Dark-mode text | Warm white `#F5EAD6`; secondary text `#C7BBA8`. |
| Candle accent | Amber `#D6AA63` for the current shelf, progress, and selected controls. |
| Kiro accent | Muted violet `#B6A0E8` for note markers and occasional spectral details. |
| Typography | A readable serif for reading and book titles; a plain sans serif for controls and metadata. Choose fonts and record their licenses during implementation. |
| Surfaces | Thin borders, subtle paper grain outside reading text, and shallow shadows. |

These colors are proposed project colors, not official Kiro brand specifications. Check contrast for each actual pairing, including disabled, hover, selected, and focus states. Book covers should retain their original colors.

Candle movement and a faint glow can appear around an unread shelf when sound is available. Avoid flickering text, jump scares, forced audio, or motion behind reading pages. Reduced-motion mode uses static lighting. A plain reading theme should be available at any time.

## Screens

### Library

Lead with “Continue reading,” followed by shelves and reading status filters. Keep search and “Add book” easy to find. Show book title and author as text, even when a cover is missing. On phones, use a compact shelf and an optional list view. Whisper controls belong to the book and the global sound setting.

### Book detail and reader

The detail page shows the cover, metadata, status, progress, notes, and session history. A prominent “Read” or “Continue reading” action opens the reader. Manual books offer “Update progress” in the same position.

The reader opens at the saved location with restrained controls for contents, search, typography, bookmarks, and notes. Selecting text reveals highlight and note actions. A side panel on larger screens becomes a sheet on phones. Exiting the reader returns to the same shelf position.

### Notes and tracking

The notes view supports search, book and tag filters, and a direct route back to each source passage. Place and spatial attachments appear as small indicators, with a list view that does not need camera or location access.

Tracking shows reading history and optional goals. Use calm language for paused books, missed days, and unfinished reads. Avoid streak-loss warnings and guilt-based whispers.

### Camera and VR notes

Before opening the camera, explain what placing a note does and request access. Show tracking quality, an obvious placement target, and a save confirmation. If tracking fails, keep the text in an ordinary editor and offer to place it again.

In VR, put shelves and note cards within comfortable reach and viewing distance. Provide seated use, adjustable text scale, a predictable exit, and a movement option that avoids forced camera motion. Validate text entry on the first target headset before designing long writing sessions.

### Capture, recall, and connected notes

A capture preview should show the selected crop beside editable extracted text before saving. A recall card needs the source highlight, a place to write a response, and clear skip and disable controls. Connected notes can use a constellation view with gentle movement, with the same links available as a keyboard-accessible list. Show any model suggestion as a suggestion the reader can accept or dismiss.

Keep the older-technology influence in readable typography, shelf indexes, and simple page navigation. The interface should remain responsive and usable with modern accessibility controls.

## Accessibility and feedback

Target WCAG 2.2 AA for the website and validate the finished screens with keyboard and assistive technology. Provide visible focus, text labels for icon controls, sufficient contrast, and controls that remain usable when text is enlarged.

Whispers need transcripts, separate volume, and mute. Status must be visible through text as well as color. Camera, sound, location, and VR permissions are optional to the core library. Save states must distinguish saved, saving, offline, and conflict without making the reader guess.

## Copy examples

| Situation | Suggested wording |
| --- | --- |
| Empty shelf | “Your shelves are ready. Add your first book.” |
| Whisper invitation | “You left a story waiting on this shelf.” |
| Sound preference | “Let unread books whisper” |
| Paused book | “Waiting for whenever you're ready.” |
| Offline note | “Saved on this device. Syncing when you're back online.” |
| Missing AR anchor | “This note is safe. Place it in the room again.” |
| Location permission | “Use your location to find notes you've pinned nearby.” |
