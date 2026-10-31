-- Migration: seed-local-user
-- Inserts the hardcoded local development user.
-- This user is the owner of all data created during Phase 1 (no-auth) dev.
-- ON CONFLICT DO NOTHING — safe to re-run.

INSERT INTO users (id, email, display_name, preferences)
VALUES (
  'local-user-001',
  'reader@local',
  'Local Reader',
  '{}'
)
ON CONFLICT (id) DO NOTHING;
