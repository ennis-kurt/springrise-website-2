// Scholarship season model + pure helpers (usable on server and in the browser).

export type Term = "Spring" | "Summer" | "Fall" | "Winter";
export type SeasonStatus = "draft" | "published" | "archived";
export type Phase = "upcoming" | "open" | "closed";

export interface Season {
  slug: string;
  term: Term;
  year: number;
  title: string;
  status: SeasonStatus;
  opens_at: string | null;
  closes_at: string | null;
  decision_at: string | null;
  headline: string;
  announcement: string;
  eligibility: string;
  requirements: string;
  announced_at: string | null;
  announced_to: number;
  created_at: string;
  updated_at: string;
}

export const ZONE = "America/New_York";

export function phaseOf(s: Pick<Season, "status" | "opens_at" | "closes_at">, now = Date.now()): Phase {
  if (s.status !== "published" || !s.opens_at || !s.closes_at) return "closed";
  if (now < Date.parse(s.opens_at)) return "upcoming";
  if (now >= Date.parse(s.closes_at)) return "closed";
  return "open";
}

/** Which season the public site should spotlight: open → soonest upcoming → most recently closed. */
export function spotlight<T extends Season>(seasons: T[], now = Date.now()): T | null {
  const live = seasons.filter((s) => s.status === "published" && s.opens_at && s.closes_at);
  const by = (k: "opens_at" | "closes_at", dir: 1 | -1) => (a: T, b: T) => dir * (Date.parse(a[k]!) - Date.parse(b[k]!));
  return (
    live.filter((s) => phaseOf(s, now) === "open").sort(by("closes_at", 1))[0] ??
    live.filter((s) => phaseOf(s, now) === "upcoming").sort(by("opens_at", 1))[0] ??
    live.sort(by("closes_at", -1))[0] ??
    null
  );
}

export const TERM_RANK: Record<Term, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
export const chronological = <T extends Pick<Season, "year" | "term">>(a: T, b: T) =>
  a.year - b.year || TERM_RANK[a.term] - TERM_RANK[b.term];

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: ZONE, ...opts });
}
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE, timeZoneName: "short",
  });
}
export const shortDate = (iso: string | null | undefined) => formatDate(iso, { month: "short", year: undefined });

export function daysFrom(iso: string | null | undefined, now = Date.now()) {
  return iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000)) : 0;
}

export const lines = (t: string | null | undefined) =>
  (t ?? "").split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
export const paragraphs = (t: string | null | undefined) =>
  (t ?? "").split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);

export const STAGES = {
  received: "Received",
  in_review: "In review",
  more_info: "More information needed",
  awarded: "Awarded",
  declined: "Not awarded",
  withdrawn: "Withdrawn",
} as const;
export type Stage = keyof typeof STAGES;
