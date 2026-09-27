// Parses and validates the staff season create/edit form.
import { fail } from "./http";
import { str } from "./validate";
import { easternWallTimeToUtcIso } from "./time";
import type { SeasonInput } from "./db";
import type { SeasonStatus, Term } from "../seasons";

const TERMS: Term[] = ["Spring", "Summer", "Fall", "Winter"];
const STATUSES: SeasonStatus[] = ["draft", "published", "archived"];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SEASON_FORM_FIELDS = [
  "title",
  "slug",
  "term",
  "year",
  "status",
  "opensAt",
  "closesAt",
  "decisionAt",
  "summary",
  "announcement",
  "eligibility",
  "requirements",
] as const;

export type SeasonFormValues = Partial<Record<(typeof SEASON_FORM_FIELDS)[number], string>>;

/** Raw (unvalidated) string values from a season form submission, for re-rendering the form after a validation error. */
export function rawSeasonFormValues(form: FormData): SeasonFormValues {
  const out: SeasonFormValues = {};
  for (const key of SEASON_FORM_FIELDS) {
    const value = form.get(key);
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function toUtcOrFail(wallTime: string, field: string, label: string): string {
  try {
    return easternWallTimeToUtcIso(wallTime);
  } catch {
    fail(400, `${label} isn't a valid date/time.`, field);
  }
}

export function seasonInputFromForm(form: FormData): SeasonInput {
  const title = str(form.get("title"), { field: "title", label: "Title", max: 200 });
  const slug = str(form.get("slug"), { field: "slug", label: "Slug", max: 100 }).toLowerCase();
  if (!SLUG_RE.test(slug)) fail(400, "Slug must be lowercase letters, numbers and hyphens only.", "slug");

  const termRaw = str(form.get("term"), { field: "term", label: "Term", max: 10 });
  if (!TERMS.includes(termRaw as Term)) fail(400, "Please choose a valid term.", "term");
  const term = termRaw as Term;

  const yearRaw = str(form.get("year"), { field: "year", label: "Year", max: 10 });
  const year = Number(yearRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) fail(400, "Please enter a valid year.", "year");

  const statusRaw = str(form.get("status"), { field: "status", label: "Status", max: 20 });
  if (!STATUSES.includes(statusRaw as SeasonStatus)) fail(400, "Please choose a valid status.", "status");
  const status = statusRaw as SeasonStatus;

  const opensAtLocal = str(form.get("opensAt"), { field: "opensAt", label: "Opens at", max: 40, required: false });
  const closesAtLocal = str(form.get("closesAt"), { field: "closesAt", label: "Closes at", max: 40, required: false });
  const decisionAtLocal = str(form.get("decisionAt"), { field: "decisionAt", label: "Decision date", max: 40, required: false });

  if (status !== "archived") {
    if (!opensAtLocal) fail(400, "Opening date/time is required unless the season is archived.", "opensAt");
    if (!closesAtLocal) fail(400, "Closing date/time is required unless the season is archived.", "closesAt");
  }

  const opensAt = opensAtLocal ? toUtcOrFail(opensAtLocal, "opensAt", "Opening date/time") : null;
  const closesAt = closesAtLocal ? toUtcOrFail(closesAtLocal, "closesAt", "Closing date/time") : null;
  const decisionAt = decisionAtLocal ? toUtcOrFail(decisionAtLocal, "decisionAt", "Decision date") : null;

  if (opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt)) {
    fail(400, "The closing time must be after the opening time.", "closesAt");
  }

  return {
    title,
    slug,
    term,
    year,
    opensAt,
    closesAt,
    decisionAt,
    status,
    summary: str(form.get("summary"), { field: "summary", label: "Summary", max: 500, required: false }),
    announcement: str(form.get("announcement"), { field: "announcement", label: "Announcement", max: 8000, required: false }),
    eligibility: str(form.get("eligibility"), { field: "eligibility", label: "Eligibility", max: 8000, required: false }),
    requirements: str(form.get("requirements"), { field: "requirements", label: "Requirements", max: 8000, required: false }),
  };
}
