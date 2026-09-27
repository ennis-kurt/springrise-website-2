// Scholarship season model + pure helpers (safe to import on server and client).

export type SeasonStatus = "draft" | "published" | "archived";
export type SeasonState = "upcoming" | "open" | "closed";
export type Term = "Spring" | "Summer" | "Fall" | "Winter";

export interface Season {
  id: string;
  slug: string;
  title: string;
  term: Term;
  year: number;
  opens_at: string | null;
  closes_at: string | null;
  decision_at: string | null;
  status: SeasonStatus;
  summary: string;
  announcement: string;
  eligibility: string;
  requirements: string;
  created_at: string;
  updated_at: string;
}

export const TIME_ZONE = "America/New_York";

/** Public state of a season at `now`. Drafts should never reach the public site. */
export function seasonState(s: Pick<Season, "status" | "opens_at" | "closes_at">, now = Date.now()): SeasonState {
  if (s.status === "archived" || !s.opens_at || !s.closes_at) return "closed";
  if (now < Date.parse(s.opens_at)) return "upcoming";
  if (now >= Date.parse(s.closes_at)) return "closed";
  return "open";
}

/**
 * The season the public site should feature:
 * open > soonest upcoming > most recently closed (published) > null.
 */
export function featuredSeason(seasons: Season[], now = Date.now()): Season | null {
  const pub = seasons.filter((s) => s.status === "published");
  const open = pub.filter((s) => seasonState(s, now) === "open")
    .sort((a, b) => Date.parse(a.closes_at!) - Date.parse(b.closes_at!));
  if (open[0]) return open[0];
  const upcoming = pub.filter((s) => seasonState(s, now) === "upcoming")
    .sort((a, b) => Date.parse(a.opens_at!) - Date.parse(b.opens_at!));
  if (upcoming[0]) return upcoming[0];
  const closed = pub.filter((s) => s.closes_at)
    .sort((a, b) => Date.parse(b.closes_at!) - Date.parse(a.closes_at!));
  return closed[0] ?? null;
}

/** Short season code used in application references: Spring 2027 → S27 */
export function seasonCode(s: Pick<Season, "term" | "year">) {
  return s.term[0] + String(s.year).slice(-2);
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: TIME_ZONE, ...opts,
  });
}

export function fmtShortDate(iso: string | null | undefined) {
  return fmtDate(iso, { month: "short", day: "numeric", year: undefined });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: TIME_ZONE, timeZoneName: "short",
  });
}

/** Whole days from now until iso (never negative). */
export function daysUntil(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

export function lines(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "").split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
}

export const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  under_review: "Under review",
  needs_information: "Needs information",
  awarded: "Awarded",
  not_awarded: "Not awarded",
  withdrawn: "Withdrawn",
};
