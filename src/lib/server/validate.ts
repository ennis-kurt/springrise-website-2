// Field-level validators for public and staff form input. Every validator
// throws an ApiError (400) with a human sentence and, where useful, the
// offending field name.
import { fail } from "./http";

export interface StrOptions {
  field: string;
  label: string;
  max: number;
  required?: boolean;
}

/** Trims a string field, enforcing presence and a max length. Rejects non-strings (e.g. a stray File or JSON number). */
export function str(value: unknown, opts: StrOptions): string {
  const { field, label, max, required = true } = opts;
  if (value === null || value === undefined) {
    if (required) fail(400, `${label} is required.`, field);
    return "";
  }
  if (typeof value !== "string") fail(400, `${label} is invalid.`, field);
  const trimmed = value.trim();
  if (required && !trimmed) fail(400, `${label} is required.`, field);
  if (trimmed.length > max) fail(400, `${label} is too long.`, field);
  return trimmed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailField(value: unknown, field: string, label = "Email"): string {
  const raw = str(value, { field, label, max: 254 });
  const lower = raw.toLowerCase();
  if (!EMAIL_RE.test(lower)) fail(400, `${label} looks invalid.`, field);
  return lower;
}

export function phoneField(
  value: unknown,
  field: string,
  label = "Phone",
  required = true,
): string {
  const raw = str(value, { field, label, max: 40, required });
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 20) fail(400, `${label} must have 7 to 20 digits.`, field);
  return raw;
}

export function isoDateField(value: unknown, field: string, label: string): string {
  const raw = str(value, { field, label, max: 12 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) fail(400, `${label} must be a valid date (YYYY-MM-DD).`, field);
  const parsed = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed)) fail(400, `${label} must be a valid date.`, field);
  return raw;
}

/** Whole years between `isoDate` and `now`, using UTC calendar math. */
export function ageInYears(isoDate: string, now: Date = new Date()): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) age--;
  return age;
}

/** Validates a plain dollar amount string (up to 2 decimals) and returns it in cents. */
export function moneyDollarsField(
  value: unknown,
  field: string,
  label: string,
  max: number,
): number {
  const raw = str(value, { field, label, max: 14 });
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) fail(400, `${label} must be a valid dollar amount.`, field);
  const amount = Number(raw);
  if (!(amount > 0) || amount > max) {
    fail(400, `${label} must be more than $0 and no more than $${max.toLocaleString("en-US")}.`, field);
  }
  return Math.round(amount * 100);
}
