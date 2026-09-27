// Typed D1 queries. Every function that can be reached from a public route
// must never expose a draft season or another applicant's data.
import type { Season, SeasonStatus, Term } from "../seasons";
import { STATUS_LABELS } from "../seasons";
import { randomId } from "./ids";

const SEASON_COLUMNS =
  "id, slug, title, term, year, opens_at, closes_at, decision_at, status, summary, announcement, eligibility, requirements, created_at, updated_at";

// --------------------------------------------------------------------------
// Seasons
// --------------------------------------------------------------------------

export async function listPublicSeasons(db: D1Database): Promise<Season[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SEASON_COLUMNS} FROM seasons
       WHERE status IN ('published','archived')
       ORDER BY (opens_at IS NULL) ASC, opens_at DESC, year DESC`,
    )
    .all<Season>();
  return results;
}

export async function getPublicSeason(db: D1Database, slug: string): Promise<Season | null> {
  const row = await db
    .prepare(`SELECT ${SEASON_COLUMNS} FROM seasons WHERE slug = ? AND status IN ('published','archived')`)
    .bind(slug)
    .first<Season>();
  return row ?? null;
}

/** Fetches a season by id regardless of status — for internal validation only, never for a public response. */
export async function getSeasonForApplication(db: D1Database, id: string): Promise<Season | null> {
  const row = await db.prepare(`SELECT ${SEASON_COLUMNS} FROM seasons WHERE id = ?`).bind(id).first<Season>();
  return row ?? null;
}

export async function getSeason(db: D1Database, id: string): Promise<Season | null> {
  return getSeasonForApplication(db, id);
}

export interface SeasonWithCounts extends Season {
  application_count: number;
}

export async function listSeasonsWithCounts(db: D1Database): Promise<SeasonWithCounts[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.slug, s.title, s.term, s.year, s.opens_at, s.closes_at, s.decision_at, s.status,
              s.summary, s.announcement, s.eligibility, s.requirements, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM applications a WHERE a.season_id = s.id) AS application_count
       FROM seasons s
       ORDER BY (s.opens_at IS NULL) ASC, s.opens_at DESC, s.year DESC`,
    )
    .all<SeasonWithCounts>();
  return results;
}

export interface SeasonInput {
  title: string;
  slug: string;
  term: Term;
  year: number;
  opensAt: string | null;
  closesAt: string | null;
  decisionAt: string | null;
  status: SeasonStatus;
  summary: string;
  announcement: string;
  eligibility: string;
  requirements: string;
}

export async function createSeason(db: D1Database, id: string, input: SeasonInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO seasons
         (id, slug, title, term, year, opens_at, closes_at, decision_at, status, summary, announcement, eligibility, requirements)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.slug,
      input.title,
      input.term,
      input.year,
      input.opensAt,
      input.closesAt,
      input.decisionAt,
      input.status,
      input.summary,
      input.announcement,
      input.eligibility,
      input.requirements,
    )
    .run();
}

export async function updateSeason(db: D1Database, id: string, input: SeasonInput): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE seasons SET
         slug = ?, title = ?, term = ?, year = ?, opens_at = ?, closes_at = ?, decision_at = ?,
         status = ?, summary = ?, announcement = ?, eligibility = ?, requirements = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    )
    .bind(
      input.slug,
      input.title,
      input.term,
      input.year,
      input.opensAt,
      input.closesAt,
      input.decisionAt,
      input.status,
      input.summary,
      input.announcement,
      input.eligibility,
      input.requirements,
      id,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function seasonSlugExists(db: D1Database, slug: string, excludeId?: string): Promise<boolean> {
  const row = excludeId
    ? await db.prepare("SELECT id FROM seasons WHERE slug = ? AND id <> ?").bind(slug, excludeId).first()
    : await db.prepare("SELECT id FROM seasons WHERE slug = ?").bind(slug).first();
  return !!row;
}

export async function seasonHasApplications(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 FROM applications WHERE season_id = ? LIMIT 1").bind(id).first();
  return !!row;
}

// --------------------------------------------------------------------------
// Applications
// --------------------------------------------------------------------------

export interface ApplicationData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday: string;
  country: string;
  address: string;
  address2: string;
  city: string;
  region: string;
  postalCode: string;
  institution: string;
  studyLevel: string;
  major: string;
  tuitionDeadline: string;
  reference1Name: string;
  reference1Email: string;
  reference1Phone: string;
  reference1Relationship: string;
  reference2Name: string;
  reference2Email: string;
  reference2Phone: string;
  reference2Relationship: string;
  note: string;
}

export async function findApplicationByEmail(
  db: D1Database,
  seasonId: string,
  emailNormalized: string,
): Promise<{ id: string; reference: string } | null> {
  const row = await db
    .prepare("SELECT id, reference FROM applications WHERE season_id = ? AND email_normalized = ?")
    .bind(seasonId, emailNormalized)
    .first<{ id: string; reference: string }>();
  return row ?? null;
}

export interface IdempotentApplication {
  reference: string;
  email_normalized: string;
  created_at: string;
}

export async function findApplicationByIdempotency(
  db: D1Database,
  seasonId: string,
  idempotencyHash: string,
): Promise<IdempotentApplication | null> {
  const row = await db
    .prepare("SELECT reference, email_normalized, created_at FROM applications WHERE season_id = ? AND idempotency_hash = ?")
    .bind(seasonId, idempotencyHash)
    .first<IdempotentApplication>();
  return row ?? null;
}

export interface DocumentToInsert {
  id: string;
  kind: string;
  objectKey: string;
  filename: string;
  size: number;
}

export interface InsertApplicationInput {
  id: string;
  reference: string;
  seasonId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailNormalized: string;
  phone: string;
  institution: string;
  tuitionCents: number;
  dataJson: string;
  idempotencyHash: string | null;
  createdAt: string;
}

/** Builds the batch of statements (application + documents + submitted event) for one D1Database.batch() call. */
export function buildApplicationStatements(
  db: D1Database,
  input: InsertApplicationInput,
  documents: DocumentToInsert[],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO applications
           (id, reference, season_id, first_name, last_name, email, email_normalized, phone, institution,
            tuition_cents, data_json, idempotency_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.reference,
        input.seasonId,
        input.firstName,
        input.lastName,
        input.email,
        input.emailNormalized,
        input.phone,
        input.institution,
        input.tuitionCents,
        input.dataJson,
        input.idempotencyHash,
        input.createdAt,
        input.createdAt,
      ),
  ];
  for (const doc of documents) {
    statements.push(
      db
        .prepare("INSERT INTO documents (id, application_id, kind, object_key, filename, size) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(doc.id, input.id, doc.kind, doc.objectKey, doc.filename, doc.size),
    );
  }
  statements.push(
    db
      .prepare("INSERT INTO application_events (id, application_id, kind, detail) VALUES (?, ?, ?, ?)")
      .bind(randomId(), input.id, "submitted", `Application ${input.reference} submitted.`),
  );
  return statements;
}

export interface ApplicationListFilters {
  seasonId?: string;
  status?: string;
  search?: string;
  page?: number;
}

export interface ApplicationListItem {
  id: string;
  reference: string;
  season_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  status: string;
  tuition_cents: number;
  award_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationListResult {
  rows: ApplicationListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export async function listApplications(db: D1Database, filters: ApplicationListFilters): Promise<ApplicationListResult> {
  const pageSize = 50;
  const page = Math.max(1, filters.page ?? 1);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.seasonId) {
    clauses.push("season_id = ?");
    params.push(filters.seasonId);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  if (filters.search) {
    const like = `%${filters.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    clauses.push("(first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')");
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS n FROM applications ${where}`)
    .bind(...params)
    .first<{ n: number }>();
  const total = countRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * pageSize;

  const { results } = await db
    .prepare(
      `SELECT id, reference, season_id, first_name, last_name, email, phone, status, tuition_cents, award_cents, created_at, updated_at
       FROM applications ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, pageSize, offset)
    .all<ApplicationListItem>();

  return { rows: results, total, page: safePage, pageSize, pageCount };
}

export async function listRecentApplications(db: D1Database, limit = 8): Promise<ApplicationListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, reference, season_id, first_name, last_name, email, phone, status, tuition_cents, award_cents, created_at, updated_at
       FROM applications ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<ApplicationListItem>();
  return results;
}

export interface ApplicationDetail {
  id: string;
  reference: string;
  seasonId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  institution: string;
  tuitionCents: number;
  data: ApplicationData;
  status: string;
  awardCents: number | null;
  staffNotes: string;
  createdAt: string;
  updatedAt: string;
  documents: DocumentRow[];
  events: EventRow[];
}

export interface DocumentRow {
  id: string;
  application_id: string;
  kind: string;
  object_key: string;
  filename: string;
  size: number;
  created_at: string;
}

export interface EventRow {
  id: string;
  application_id: string;
  kind: string;
  detail: string;
  created_at: string;
}

export async function getApplicationDetail(db: D1Database, id: string): Promise<ApplicationDetail | null> {
  const app = await db
    .prepare(
      `SELECT id, reference, season_id, first_name, last_name, email, phone, institution, tuition_cents,
              data_json, status, award_cents, staff_notes, created_at, updated_at
       FROM applications WHERE id = ?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!app) return null;
  const [docs, events] = await Promise.all([
    db
      .prepare("SELECT id, application_id, kind, object_key, filename, size, created_at FROM documents WHERE application_id = ? ORDER BY kind")
      .bind(id)
      .all<DocumentRow>(),
    db
      .prepare("SELECT id, application_id, kind, detail, created_at FROM application_events WHERE application_id = ? ORDER BY created_at DESC, id DESC")
      .bind(id)
      .all<EventRow>(),
  ]);
  return {
    id: String(app.id),
    reference: String(app.reference),
    seasonId: String(app.season_id),
    firstName: String(app.first_name),
    lastName: String(app.last_name),
    email: String(app.email),
    phone: String(app.phone),
    institution: String(app.institution),
    tuitionCents: Number(app.tuition_cents),
    data: JSON.parse(String(app.data_json)) as ApplicationData,
    status: String(app.status),
    awardCents: app.award_cents === null || app.award_cents === undefined ? null : Number(app.award_cents),
    staffNotes: String(app.staff_notes ?? ""),
    createdAt: String(app.created_at),
    updatedAt: String(app.updated_at),
    documents: docs.results,
    events: events.results,
  };
}

export interface ApplicationStatusLookup {
  reference: string;
  status: string;
  created_at: string;
  updated_at: string;
  season_title: string;
}

export async function getApplicationStatusLookup(
  db: D1Database,
  reference: string,
  emailNormalized: string,
): Promise<ApplicationStatusLookup | null> {
  const row = await db
    .prepare(
      `SELECT a.reference, a.status, a.created_at, a.updated_at, s.title AS season_title
       FROM applications a JOIN seasons s ON s.id = a.season_id
       WHERE a.reference = ? AND a.email_normalized = ?`,
    )
    .bind(reference, emailNormalized)
    .first<ApplicationStatusLookup>();
  return row ?? null;
}

export interface UpdateApplicationStaffInput {
  status: string;
  awardCents: number | null;
  staffNotes: string;
}

export async function updateApplicationStaff(
  db: D1Database,
  id: string,
  input: UpdateApplicationStaffInput,
): Promise<boolean> {
  const current = await db
    .prepare("SELECT status, award_cents, staff_notes FROM applications WHERE id = ?")
    .bind(id)
    .first<{ status: string; award_cents: number | null; staff_notes: string }>();
  if (!current) return false;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE applications SET status = ?, award_cents = ?, staff_notes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      )
      .bind(input.status, input.awardCents, input.staffNotes, id),
  ];

  if (current.status !== input.status) {
    const from = STATUS_LABELS[current.status] ?? current.status;
    const to = STATUS_LABELS[input.status] ?? input.status;
    statements.push(
      db
        .prepare("INSERT INTO application_events (id, application_id, kind, detail) VALUES (?, ?, 'status', ?)")
        .bind(randomId(), id, `${from} → ${to}`),
    );
  }
  if ((current.award_cents ?? null) !== (input.awardCents ?? null)) {
    const detail = input.awardCents == null ? "Award cleared." : `Award set to $${(input.awardCents / 100).toFixed(2)}.`;
    statements.push(
      db.prepare("INSERT INTO application_events (id, application_id, kind, detail) VALUES (?, ?, 'award', ?)").bind(randomId(), id, detail),
    );
  }
  if ((current.staff_notes ?? "") !== input.staffNotes) {
    statements.push(
      db
        .prepare("INSERT INTO application_events (id, application_id, kind, detail) VALUES (?, ?, 'note', ?)")
        .bind(randomId(), id, "Staff notes updated."),
    );
  }

  await db.batch(statements);
  return true;
}

export async function countApplicationsByStatus(db: D1Database, seasonId: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare("SELECT status, COUNT(*) AS n FROM applications WHERE season_id = ? GROUP BY status")
    .bind(seasonId)
    .all<{ status: string; n: number }>();
  const counts: Record<string, number> = {};
  for (const row of results) counts[row.status] = row.n;
  return counts;
}

// --------------------------------------------------------------------------
// Documents
// --------------------------------------------------------------------------

export interface DocumentForDownload {
  object_key: string;
  kind: string;
  first_name: string;
  last_name: string;
}

export async function getDocumentForDownload(db: D1Database, id: string): Promise<DocumentForDownload | null> {
  const row = await db
    .prepare(
      `SELECT d.object_key, d.kind, a.first_name, a.last_name
       FROM documents d JOIN applications a ON a.id = d.application_id
       WHERE d.id = ?`,
    )
    .bind(id)
    .first<DocumentForDownload>();
  return row ?? null;
}

// --------------------------------------------------------------------------
// Messages
// --------------------------------------------------------------------------

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  [column: string]: unknown;
}

export interface InsertMessageInput {
  id: string;
  name: string;
  email: string;
  phone: string;
  topic: string;
  subject: string;
  message: string;
}

export async function insertMessage(db: D1Database, input: InsertMessageInput): Promise<void> {
  await db
    .prepare("INSERT INTO messages (id, name, email, phone, topic, subject, message) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(input.id, input.name, input.email, input.phone, input.topic, input.subject, input.message)
    .run();
}

export async function listMessages(db: D1Database, status?: string): Promise<MessageRow[]> {
  const { results } = status
    ? await db.prepare("SELECT * FROM messages WHERE status = ? ORDER BY created_at DESC").bind(status).all<MessageRow>()
    : await db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all<MessageRow>();
  return results;
}

export async function countMessagesByStatus(db: D1Database, status: string): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status = ?").bind(status).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function setMessageStatus(db: D1Database, id: string, status: string): Promise<boolean> {
  const result = await db.prepare("UPDATE messages SET status = ? WHERE id = ?").bind(status, id).run();
  return (result.meta.changes ?? 0) > 0;
}

// --------------------------------------------------------------------------
// Subscribers
// --------------------------------------------------------------------------

export interface SubscriberRow {
  id: string;
  email: string;
  source: string;
  created_at: string;
  [column: string]: unknown;
}

export async function insertSubscriber(db: D1Database, email: string, source: string): Promise<void> {
  await db
    .prepare("INSERT INTO subscribers (id, email, source) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(randomId(), email, source)
    .run();
}

export async function listSubscribers(db: D1Database): Promise<SubscriberRow[]> {
  const { results } = await db.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all<SubscriberRow>();
  return results;
}

export async function countSubscribers(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM subscribers").first<{ n: number }>();
  return row?.n ?? 0;
}

// --------------------------------------------------------------------------
// CSV export queries
// --------------------------------------------------------------------------

export interface ApplicationExportRow {
  reference: string;
  season_title: string;
  status: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  institution: string;
  tuition_cents: number;
  award_cents: number | null;
  staff_notes: string;
  data_json: string;
  created_at: string;
}

export async function listApplicationsForExport(db: D1Database, seasonId?: string): Promise<ApplicationExportRow[]> {
  const { results } = seasonId
    ? await db
        .prepare(
          `SELECT a.*, s.title AS season_title FROM applications a JOIN seasons s ON s.id = a.season_id
           WHERE a.season_id = ? ORDER BY a.created_at DESC`,
        )
        .bind(seasonId)
        .all<ApplicationExportRow>()
    : await db
        .prepare(`SELECT a.*, s.title AS season_title FROM applications a JOIN seasons s ON s.id = a.season_id ORDER BY a.created_at DESC`)
        .all<ApplicationExportRow>();
  return results;
}

export async function listMessagesForExport(db: D1Database): Promise<MessageRow[]> {
  const { results } = await db.prepare("SELECT * FROM messages ORDER BY created_at DESC").all<MessageRow>();
  return results;
}

export async function listSubscribersForExport(db: D1Database): Promise<SubscriberRow[]> {
  const { results } = await db.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all<SubscriberRow>();
  return results;
}
