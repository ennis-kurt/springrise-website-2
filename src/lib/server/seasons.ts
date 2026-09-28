// Staff season editing: form parsing, validation and persistence.
import { env } from "cloudflare:workers";
import type { Season, SeasonStatus, Term } from "../season";
import { countApplications, getSeason, nowIso } from "./db";
import { etLocalToUtc, utcToEtLocal } from "./time";

export const TERMS: Term[] = ["Spring", "Summer", "Fall", "Winter"];
export const STATUSES: SeasonStatus[] = ["draft", "published", "archived"];

/** Raw form values as shown in inputs (datetimes in ET wall time). */
export interface SeasonForm {
  title: string; term: string; year: string; slug: string; status: string;
  opens: string; closes: string; decision: string;
  headline: string; announcement: string; eligibility: string; requirements: string;
}

export const emptyForm = (): SeasonForm => {
  const y = new Date().getUTCFullYear() + 1;
  return {
    title: `Spring ${y} Scholarship`, term: "Spring", year: String(y), slug: `spring-${y}`, status: "draft",
    opens: "", closes: "", decision: "", headline: `Tuition support for the Spring ${y} semester.`,
    announcement: "", eligibility: "", requirements: "",
  };
};

export const formFromSeason = (s: Season): SeasonForm => ({
  title: s.title, term: s.term, year: String(s.year), slug: s.slug, status: s.status,
  opens: utcToEtLocal(s.opens_at), closes: utcToEtLocal(s.closes_at), decision: utcToEtLocal(s.decision_at),
  headline: s.headline, announcement: s.announcement, eligibility: s.eligibility, requirements: s.requirements,
});

export function formFromData(fd: FormData): SeasonForm {
  const g = (k: string) => String(fd.get(k) ?? "").replace(/\r\n/g, "\n");
  return {
    title: g("title").trim(), term: g("term"), year: g("year").trim(), slug: g("slug").trim().toLowerCase(),
    status: g("status"), opens: g("opens").trim(), closes: g("closes").trim(), decision: g("decision").trim(),
    headline: g("headline").trim(), announcement: g("announcement").trim(), eligibility: g("eligibility").trim(),
    requirements: g("requirements").trim(),
  };
}

export interface SeasonValues {
  slug: string; term: Term; year: number; title: string; status: SeasonStatus;
  opens_at: string | null; closes_at: string | null; decision_at: string | null;
  headline: string; announcement: string; eligibility: string; requirements: string;
}

export class FormError extends Error {
  constructor(message: string, public field: string) { super(message); }
}

export function validateSeason(f: SeasonForm): SeasonValues {
  if (!f.title || f.title.length > 120) throw new FormError("Give the season a title (up to 120 characters).", "title");
  if (!TERMS.includes(f.term as Term)) throw new FormError("Choose a term.", "term");
  const year = Number(f.year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new FormError("Enter a four-digit year.", "year");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug) || f.slug.length > 60) {
    throw new FormError("The URL slug may use lowercase letters, numbers and single hyphens, e.g. spring-2027.", "slug");
  }
  if (!STATUSES.includes(f.status as SeasonStatus)) throw new FormError("Choose a status.", "status");
  const conv = (v: string, field: string, label: string) => {
    if (!v) return null;
    const iso = etLocalToUtc(v);
    if (!iso) throw new FormError(`${label} isn't a valid date and time.`, field);
    return iso;
  };
  const opens_at = conv(f.opens, "opens", "The opening time");
  const closes_at = conv(f.closes, "closes", "The closing time");
  const decision_at = conv(f.decision, "decision", "The decision date");
  if (f.status === "published" && (!opens_at || !closes_at)) {
    throw new FormError("A published season needs both an opening and a closing time.", !opens_at ? "opens" : "closes");
  }
  if (opens_at && closes_at && Date.parse(closes_at) <= Date.parse(opens_at)) {
    throw new FormError("Applications must close after they open.", "closes");
  }
  if (f.headline.length > 200) throw new FormError("Keep the headline to 200 characters.", "headline");
  for (const [k, label] of [["announcement", "The announcement"], ["eligibility", "Eligibility"], ["requirements", "Requirements"]] as const) {
    if (f[k].length > 10_000) throw new FormError(`${label} is too long (10,000 characters max).`, k);
  }
  return {
    slug: f.slug, term: f.term as Term, year, title: f.title, status: f.status as SeasonStatus,
    opens_at, closes_at, decision_at, headline: f.headline, announcement: f.announcement,
    eligibility: f.eligibility, requirements: f.requirements,
  };
}

export async function createSeason(v: SeasonValues): Promise<void> {
  if (await getSeason(v.slug)) throw new FormError("A season with that URL slug already exists.", "slug");
  const at = nowIso();
  await env.DB.prepare(
    `INSERT INTO seasons (slug, term, year, title, status, opens_at, closes_at, decision_at, headline, announcement, eligibility, requirements, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)`,
  ).bind(v.slug, v.term, v.year, v.title, v.status, v.opens_at, v.closes_at, v.decision_at, v.headline, v.announcement, v.eligibility, v.requirements, at).run();
}

export async function updateSeason(oldSlug: string, v: SeasonValues): Promise<void> {
  if (v.slug !== oldSlug) {
    if ((await countApplications(oldSlug)) > 0) {
      throw new FormError("The URL slug can't change once applications exist for this season.", "slug");
    }
    if (await getSeason(v.slug)) throw new FormError("A season with that URL slug already exists.", "slug");
  }
  await env.DB.prepare(
    `UPDATE seasons SET slug = ?1, term = ?2, year = ?3, title = ?4, status = ?5, opens_at = ?6, closes_at = ?7, decision_at = ?8,
       headline = ?9, announcement = ?10, eligibility = ?11, requirements = ?12, updated_at = ?13
     WHERE slug = ?14`,
  ).bind(v.slug, v.term, v.year, v.title, v.status, v.opens_at, v.closes_at, v.decision_at, v.headline, v.announcement, v.eligibility, v.requirements, nowIso(), oldSlug).run();
}
