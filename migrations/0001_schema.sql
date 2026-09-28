-- Springrise Foundation — schema v2

-- A scholarship "season" is one application window for one semester.
CREATE TABLE seasons (
  slug          TEXT PRIMARY KEY,                     -- 'spring-2027'
  term          TEXT NOT NULL CHECK (term IN ('Spring','Summer','Fall','Winter')),
  year          INTEGER NOT NULL,
  title         TEXT NOT NULL,                        -- 'Spring 2027 Scholarship'
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  opens_at      TEXT,                                 -- ISO UTC; required when published
  closes_at     TEXT,                                 -- ISO UTC; required when published
  decision_at   TEXT,                                 -- optional ISO UTC
  headline      TEXT NOT NULL DEFAULT '',             -- one-line announcement
  announcement  TEXT NOT NULL DEFAULT '',             -- paragraphs separated by blank lines
  eligibility   TEXT NOT NULL DEFAULT '',             -- one item per line; blank = standard criteria
  requirements  TEXT NOT NULL DEFAULT '',             -- one item per line; blank = standard terms
  announced_at  TEXT,
  announced_to  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE applications (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,              -- applicant-facing reference, e.g. 'S27-4KQ9-XD'
  season_slug      TEXT NOT NULL REFERENCES seasons(slug),
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,                     -- lower-cased
  phone            TEXT NOT NULL,
  school           TEXT NOT NULL,
  level            TEXT NOT NULL,
  tuition_cents    INTEGER NOT NULL,
  answers          TEXT NOT NULL,                     -- JSON of every submitted field
  stage            TEXT NOT NULL DEFAULT 'received'
                   CHECK (stage IN ('received','in_review','more_info','awarded','declined','withdrawn')),
  award_cents      INTEGER,
  notes            TEXT NOT NULL DEFAULT '',
  submit_key       TEXT,                              -- sha256 of client idempotency key
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (season_slug, email),
  UNIQUE (season_slug, submit_key)
);
CREATE INDEX applications_season_stage ON applications(season_slug, stage);
CREATE INDEX applications_created ON applications(created_at DESC);

CREATE TABLE attachments (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                      -- resume | transcript | enrollment | statement | tuitionBill | disability
  storage_key     TEXT NOT NULL UNIQUE,
  file_name       TEXT NOT NULL,
  bytes           INTEGER NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (application_id, kind)
);

CREATE TABLE activity (
  id              TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  what            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX activity_by_app ON activity(application_id, created_at);

CREATE TABLE inquiries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  reason      TEXT NOT NULL DEFAULT 'general'
              CHECK (reason IN ('general','scholarship','giving','mentor','board','internships','partnership')),
  message     TEXT NOT NULL,
  handled     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX inquiries_created ON inquiries(created_at DESC);

CREATE TABLE subscribers (
  email       TEXT PRIMARY KEY,
  source      TEXT NOT NULL DEFAULT 'site',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE staff_sessions (
  token_hash  TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE throttle (
  bucket    TEXT NOT NULL,
  who       TEXT NOT NULL,
  window    INTEGER NOT NULL,
  hits      INTEGER NOT NULL,
  PRIMARY KEY (bucket, who, window)
);

-- Real season history. Only Fall 2026 has verified dates
-- (June 25, 2026 9:00 AM EDT – August 15, 2026 11:59 PM EDT).
INSERT INTO seasons (slug, term, year, title, status, headline) VALUES
 ('spring-2024','Spring',2024,'Spring 2024 Scholarship','archived','Tuition support for the Spring 2024 semester.'),
 ('fall-2024','Fall',2024,'Fall 2024 Scholarship','archived','Tuition support for the Fall 2024 semester.'),
 ('spring-2025','Spring',2025,'Spring 2025 Scholarship','archived','Tuition support for the Spring 2025 semester.'),
 ('fall-2025','Fall',2025,'Fall 2025 Scholarship','archived','Tuition support for the Fall 2025 semester.'),
 ('spring-2026','Spring',2026,'Spring 2026 Scholarship','archived','Tuition support for the Spring 2026 semester.');
INSERT INTO seasons (slug, term, year, title, status, opens_at, closes_at, headline, announcement) VALUES
 ('fall-2026','Fall',2026,'Fall 2026 Scholarship','published','2026-06-25T13:00:00.000Z','2026-08-16T03:59:00.000Z',
  'Tuition support for the Fall 2026 semester.',
  'Applications for Fall 2026 were accepted June 25 – August 15, 2026. Thank you to every student who applied.');
-- Draft for staff to finalise (dates are placeholders). Drafts are never public.
INSERT INTO seasons (slug, term, year, title, status, opens_at, closes_at, headline, announcement) VALUES
 ('spring-2027','Spring',2027,'Spring 2027 Scholarship','draft','2026-11-02T14:00:00.000Z','2026-12-16T04:59:00.000Z',
  'Tuition support for the Spring 2027 semester.',
  'DRAFT — confirm dates and wording before publishing.');
