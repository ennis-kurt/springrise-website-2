-- Tracks whether/when staff have emailed subscribers about a season.
ALTER TABLE seasons ADD COLUMN announced_at TEXT;
ALTER TABLE seasons ADD COLUMN announced_count INTEGER NOT NULL DEFAULT 0;
