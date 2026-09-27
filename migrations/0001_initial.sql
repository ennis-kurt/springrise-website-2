-- Springrise Foundation — initial schema
-- Seasons are scholarship application windows (e.g. "Spring 2027").
CREATE TABLE seasons (
  id            TEXT PRIMARY KEY,               -- same as slug, e.g. 'spring-2027'
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,                  -- 'Spring 2027 Tuition Scholarship'
  term          TEXT NOT NULL CHECK (term IN ('Spring','Summer','Fall','Winter')),
  year          INTEGER NOT NULL,
  opens_at      TEXT,                           -- ISO-8601 UTC; required unless archived
  closes_at     TEXT,                           -- ISO-8601 UTC; required unless archived
  decision_at   TEXT,                           -- optional ISO date when decisions are expected
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  summary       TEXT NOT NULL DEFAULT '',       -- one or two sentence announcement
  announcement  TEXT NOT NULL DEFAULT '',       -- longer announcement; blank lines separate paragraphs
  eligibility   TEXT NOT NULL DEFAULT '',       -- one criterion per line
  requirements  TEXT NOT NULL DEFAULT '',       -- one requirement/instruction per line
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX seasons_by_date ON seasons(year DESC, opens_at DESC);

CREATE TABLE applications (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,       -- e.g. 'SR-S27-7KQ4XD'
  season_id         TEXT NOT NULL REFERENCES seasons(id),
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  email_normalized  TEXT NOT NULL,
  phone             TEXT NOT NULL,
  institution       TEXT NOT NULL DEFAULT '',
  tuition_cents     INTEGER NOT NULL,
  data_json         TEXT NOT NULL,              -- every submitted field, as JSON
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','under_review','needs_information','awarded','not_awarded','withdrawn')),
  award_cents       INTEGER,
  staff_notes       TEXT NOT NULL DEFAULT '',
  idempotency_hash  TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (season_id, email_normalized),
  UNIQUE (season_id, idempotency_hash)
);
CREATE INDEX applications_recent ON applications(created_at DESC);
CREATE INDEX applications_by_season ON applications(season_id, status);

CREATE TABLE documents (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                -- resume | transcript | enrollment | statement | tuition | disability
  object_key      TEXT NOT NULL UNIQUE,         -- R2 key
  filename        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (application_id, kind)
);

-- Audit trail for staff actions on an application
CREATE TABLE application_events (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                -- submitted | status | note | award
  detail          TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX application_events_by_app ON application_events(application_id, created_at);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  topic       TEXT NOT NULL DEFAULT 'general'
              CHECK (topic IN ('general','scholarship','donation','volunteer','partnership')),
  subject     TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','archived')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX messages_recent ON messages(created_at DESC);

CREATE TABLE subscribers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  source      TEXT NOT NULL DEFAULT 'site',     -- footer | season-alert | home
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL,                 -- epoch ms
  created_at  INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE rate_limits (
  bucket        TEXT NOT NULL,
  subject_hash  TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL,
  PRIMARY KEY (bucket, subject_hash, window_start)
);

-- ---------------------------------------------------------------------------
-- Seed: the foundation's real scholarship history (from springrise.org).
-- Only Fall 2026 has verified dates: June 25, 2026 9:00 AM EDT – Aug 15, 2026 11:59 PM EDT.
INSERT INTO seasons (id, slug, title, term, year, opens_at, closes_at, status, summary) VALUES
 ('spring-2024','spring-2024','Spring 2024 Tuition Scholarship','Spring',2024,NULL,NULL,'archived','Tuition support for the Spring 2024 semester.'),
 ('fall-2024','fall-2024','Fall 2024 Tuition Scholarship','Fall',2024,NULL,NULL,'archived','Tuition support for the Fall 2024 semester.'),
 ('spring-2025','spring-2025','Spring 2025 Tuition Scholarship','Spring',2025,NULL,NULL,'archived','Tuition support for the Spring 2025 semester.'),
 ('fall-2025','fall-2025','Fall 2025 Tuition Scholarship','Fall',2025,NULL,NULL,'archived','Tuition support for the Fall 2025 semester.'),
 ('spring-2026','spring-2026','Spring 2026 Tuition Scholarship','Spring',2026,NULL,NULL,'archived','Tuition support for the Spring 2026 semester.');

INSERT INTO seasons (id, slug, title, term, year, opens_at, closes_at, status, summary, announcement) VALUES
 ('fall-2026','fall-2026','Fall 2026 Tuition Scholarship','Fall',2026,
  '2026-06-25T13:00:00.000Z','2026-08-16T03:59:00.000Z','published',
  'Tuition support for students of Turkish descent pursuing higher education in the United States.',
  'Applications for the Fall 2026 semester were accepted from June 25 through August 15, 2026. Thank you to every student who applied — the Board of Directors is reviewing applications.');

-- A draft for staff to review, adjust and publish from the staff workspace.
-- Drafts are never shown publicly.
INSERT INTO seasons (id, slug, title, term, year, opens_at, closes_at, status, summary, announcement) VALUES
 ('spring-2027','spring-2027','Spring 2027 Tuition Scholarship','Spring',2027,
  '2026-11-01T13:00:00.000Z','2026-12-16T04:59:00.000Z','draft',
  'Tuition support for the Spring 2027 semester for students of Turkish descent in U.S. higher education.',
  'DRAFT — review the dates and wording before publishing.');
