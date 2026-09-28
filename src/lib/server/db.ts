// Data access for API routes and the staff workspace. All SQL is parameterized.
import { env } from "cloudflare:workers";
import type { Season, Stage } from "../season";

export interface ApplicationRow {
  id: string;
  code: string;
  season_slug: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  school: string;
  level: string;
  tuition_cents: number;
  answers: string;
  stage: Stage;
  award_cents: number | null;
  notes: string;
  submit_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: string;
  application_id: string;
  kind: string;
  storage_key: string;
  file_name: string;
  bytes: number;
  created_at: string;
}

export interface InquiryRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  reason: string;
  message: string;
  handled: number;
  created_at: string;
}

export interface SubscriberRow { email: string; source: string; created_at: string }

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

// ---------- seasons ----------

export async function getSeason(slug: string): Promise<Season | null> {
  return env.DB.prepare("SELECT * FROM seasons WHERE slug = ?1").bind(slug).first<Season>();
}

export async function publishedSeasons(): Promise<Season[]> {
  const { results } = await env.DB.prepare("SELECT * FROM seasons WHERE status = 'published'").all<Season>();
  return results;
}

export type SeasonWithCount = Season & { applications: number };
export async function allSeasonsWithCounts(): Promise<SeasonWithCount[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM applications a WHERE a.season_slug = s.slug) AS applications
     FROM seasons s ORDER BY s.year DESC,
       CASE s.term WHEN 'Fall' THEN 0 WHEN 'Summer' THEN 1 WHEN 'Spring' THEN 2 ELSE 3 END`,
  ).all<SeasonWithCount>();
  return results;
}

export async function countApplications(slug: string): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM applications WHERE season_slug = ?1").bind(slug).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function stageCounts(slug: string): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare(
    "SELECT stage, COUNT(*) AS n FROM applications WHERE season_slug = ?1 GROUP BY stage",
  ).bind(slug).all<{ stage: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.stage, r.n]));
}

// ---------- applications ----------

export interface AppFilter { season?: string; stage?: string; q?: string }

export function filterFrom(url: URL): AppFilter {
  const stage = url.searchParams.get("stage") ?? "";
  return {
    season: (url.searchParams.get("season") ?? "").slice(0, 80) || undefined,
    stage: /^(received|in_review|more_info|awarded|declined|withdrawn)$/.test(stage) ? stage : undefined,
    q: (url.searchParams.get("q") ?? "").trim().slice(0, 100) || undefined,
  };
}

export function filterQuery(f: AppFilter, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams();
  if (f.season) p.set("season", f.season);
  if (f.stage) p.set("stage", f.stage);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

function appWhere(f: AppFilter): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  if (f.season) {
    args.push(f.season);
    parts.push(`season_slug = ?${args.length}`);
  }
  if (f.stage) {
    args.push(f.stage);
    parts.push(`stage = ?${args.length}`);
  }
  const q = (f.q ?? "").trim().toLowerCase().slice(0, 100);
  if (q) {
    args.push(`%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    const n = args.length;
    parts.push(
      `(lower(first_name || ' ' || last_name) LIKE ?${n} ESCAPE '\\' OR email LIKE ?${n} ESCAPE '\\' OR lower(code) LIKE ?${n} ESCAPE '\\')`,
    );
  }
  return { sql: parts.length ? "WHERE " + parts.join(" AND ") : "", args };
}

export async function listApplications(f: AppFilter, limit: number, offset: number) {
  const w = appWhere(f);
  const [rows, total] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM applications ${w.sql} ORDER BY created_at DESC LIMIT ?${w.args.length + 1} OFFSET ?${w.args.length + 2}`,
    ).bind(...w.args, limit, offset).all<ApplicationRow>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM applications ${w.sql}`).bind(...w.args).first<{ n: number }>(),
  ]);
  return { rows: rows.results, total: total?.n ?? 0 };
}

export async function getApplication(id: string) {
  return env.DB.prepare("SELECT * FROM applications WHERE id = ?1").bind(id).first<ApplicationRow>();
}

export async function getAttachments(applicationId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM attachments WHERE application_id = ?1 ORDER BY created_at, kind",
  ).bind(applicationId).all<AttachmentRow>();
  return results;
}

export async function getActivity(applicationId: string) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM activity WHERE application_id = ?1 ORDER BY created_at DESC, rowid DESC",
  ).bind(applicationId).all<{ id: string; what: string; created_at: string }>();
  return results;
}

export const activityStmt = (applicationId: string, what: string, at = nowIso()) =>
  env.DB.prepare("INSERT INTO activity (id, application_id, what, created_at) VALUES (?1, ?2, ?3, ?4)").bind(
    newId(),
    applicationId,
    what.slice(0, 500),
    at,
  );

// ---------- inquiries & subscribers ----------

export async function countUnhandledInquiries(): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM inquiries WHERE handled = 0").first<{ n: number }>();
  return r?.n ?? 0;
}

export async function countSubscribers(): Promise<number> {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers").first<{ n: number }>();
  return r?.n ?? 0;
}
