-- Migration: initial-schema
-- Creates all core tables for wisper-lib Phase 1.
-- Schema follows docs/architecture.md data model.

-- ─── Extensions ───────────────────────────────────────────────────────────────

-- gen_random_uuid() — available in PostgreSQL 13+ without extension
-- Verify it works:
SELECT gen_random_uuid();

-- ─── users ────────────────────────────────────────────────────────────────────
-- Account identity and preferences.
-- id is TEXT so it accepts both the local stub ('local-user-001')
-- and Cognito sub UUIDs in Phase 2 without a schema migration.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT        PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  display_name  TEXT,
  preferences   JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── books ────────────────────────────────────────────────────────────────────
-- One row per book per owner.
-- format: 'epub' | 'pdf' | 'mobi' | 'kf8' | 'fb2' | 'cbz' | 'manual'
-- import_state: 'pending' | 'processing' | 'ready' | 'failed'

CREATE TABLE IF NOT EXISTS books (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  author        TEXT,
  format        TEXT        NOT NULL,
  file_path     TEXT,                          -- NULL for manual entries
  cover_path    TEXT,
  description   TEXT,
  tags          JSONB       NOT NULL DEFAULT '[]',
  isbn          TEXT,
  import_state  TEXT        NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT books_format_check CHECK (
    format IN ('epub', 'pdf', 'mobi', 'kf8', 'fb2', 'cbz', 'manual')
  ),
  CONSTRAINT books_import_state_check CHECK (
    import_state IN ('pending', 'processing', 'ready', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_books_owner_created
  ON books (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_books_owner_format
  ON books (owner_id, format);

-- ─── reading_records ──────────────────────────────────────────────────────────
-- One record per reading attempt per book.
-- Re-reads get a new record; old records are preserved.
-- status: 'unread' | 'reading' | 'paused' | 'finished' | 'dnf'
-- last_location: CFI string (EPUB), page index as text (PDF), fractional (MOBI/FB2)
-- manual_progress: 0.00–100.00 for physical/manual books

CREATE TABLE IF NOT EXISTS reading_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id          UUID        NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_id         TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'unread',
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  last_location    TEXT,
  manual_progress  NUMERIC(5,2),
  revision         INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reading_records_status_check CHECK (
    status IN ('unread', 'reading', 'paused', 'finished', 'dnf')
  ),
  CONSTRAINT reading_records_progress_range CHECK (
    manual_progress IS NULL OR (manual_progress >= 0 AND manual_progress <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_reading_records_book_owner
  ON reading_records (book_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_reading_records_owner_status
  ON reading_records (owner_id, status);

-- ─── reading_sessions ─────────────────────────────────────────────────────────
-- Each time a reader opens and closes a book, a session is recorded.
-- client_op_id ensures idempotency if a mobile client retries on a flaky connection.

CREATE TABLE IF NOT EXISTS reading_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_record_id UUID        NOT NULL REFERENCES reading_records(id) ON DELETE CASCADE,
  owner_id          TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL,
  duration_seconds  INTEGER     NOT NULL DEFAULT 0,
  progress_delta    NUMERIC(5,2),
  client_op_id      TEXT        UNIQUE,       -- idempotency key from client

  CONSTRAINT reading_sessions_duration_check CHECK (duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_record
  ON reading_sessions (reading_record_id);

CREATE INDEX IF NOT EXISTS idx_reading_sessions_owner
  ON reading_sessions (owner_id, started_at DESC);

-- ─── annotations ──────────────────────────────────────────────────────────────
-- A highlighted passage in a book.
-- location: CFI string, page index, or fractional position depending on format.
-- highlight_color: 'yellow' | 'blue' | 'green' | 'pink' | 'none'

CREATE TABLE IF NOT EXISTS annotations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id         UUID        NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  owner_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location        TEXT        NOT NULL,
  selected_text   TEXT        NOT NULL,
  highlight_color TEXT        NOT NULL DEFAULT 'yellow',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT annotations_color_check CHECK (
    highlight_color IN ('yellow', 'blue', 'green', 'pink', 'none')
  )
);

CREATE INDEX IF NOT EXISTS idx_annotations_book_owner
  ON annotations (book_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_annotations_owner
  ON annotations (owner_id, created_at DESC);

-- ─── notes ────────────────────────────────────────────────────────────────────
-- A note written by the reader. May be:
--   - Book-level (book_id set, annotation_id NULL)
--   - Passage note (both book_id and annotation_id set)
--   - Standalone (both NULL)
-- revision is incremented on each update for optimistic concurrency control.
-- tags is a JSONB array of strings for GIN indexing.

CREATE TABLE IF NOT EXISTS notes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       UUID        REFERENCES books(id) ON DELETE SET NULL,
  annotation_id UUID        REFERENCES annotations(id) ON DELETE SET NULL,
  title         TEXT,
  body          TEXT        NOT NULL DEFAULT '',
  tags          JSONB       NOT NULL DEFAULT '[]',
  revision      INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_owner_created
  ON notes (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_book
  ON notes (book_id)
  WHERE book_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_annotation
  ON notes (annotation_id)
  WHERE annotation_id IS NOT NULL;

-- GIN index for fast tag filtering: WHERE tags @> '["history"]'
CREATE INDEX IF NOT EXISTS idx_notes_tags
  ON notes USING GIN (tags);

-- Full-text search on title + body for the /notes?q= search endpoint
CREATE INDEX IF NOT EXISTS idx_notes_fts
  ON notes USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  );

-- ─── whisper_assets ───────────────────────────────────────────────────────────
-- Cached Amazon Polly TTS output for book whispers.
-- text_hash is SHA-256 of the full SSML string.
-- Unique on (text_hash, voice, engine, locale) — same text + settings = same audio.
-- state: 'pending' | 'ready' | 'failed'

CREATE TABLE IF NOT EXISTS whisper_assets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id     UUID        REFERENCES books(id) ON DELETE CASCADE,
  text_hash   TEXT        NOT NULL,
  voice       TEXT        NOT NULL,
  engine      TEXT        NOT NULL DEFAULT 'standard',
  locale      TEXT        NOT NULL DEFAULT 'en-US',
  audio_path  TEXT,
  transcript  TEXT        NOT NULL,
  state       TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT whisper_assets_state_check CHECK (
    state IN ('pending', 'ready', 'failed')
  ),
  CONSTRAINT whisper_assets_unique_params
    UNIQUE (text_hash, voice, engine, locale)
);

CREATE INDEX IF NOT EXISTS idx_whisper_assets_owner
  ON whisper_assets (owner_id);

CREATE INDEX IF NOT EXISTS idx_whisper_assets_book
  ON whisper_assets (book_id)
  WHERE book_id IS NOT NULL;

-- ─── updated_at trigger ───────────────────────────────────────────────────────
-- Automatically update updated_at on any row change for tables that have it.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER reading_records_updated_at
  BEFORE UPDATE ON reading_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
