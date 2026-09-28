import { HttpError } from "./http";

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/** Read a trimmed string field; throws HttpError(400) with a human message. */
export function text(
  fields: Record<string, string>,
  name: string,
  label: string,
  opts: { required?: boolean; max?: number; min?: number } = {},
): string {
  const { required = true, max = 200, min = 0 } = opts;
  const v = (fields[name] ?? "").trim();
  if (!v) {
    if (required) throw new HttpError(400, `Please enter ${label}.`, name);
    return "";
  }
  if (v.length > max) throw new HttpError(400, `${cap(label)} must be ${max.toLocaleString("en-US")} characters or fewer.`, name);
  if (v.length < min) throw new HttpError(400, `${cap(label)} must be at least ${min} characters.`, name);
  return v;
}

export function email(fields: Record<string, string>, name: string, label = "your email address", required = true): string {
  const v = text(fields, name, label, { required, max: 254 }).toLowerCase();
  if (v && !EMAIL_RE.test(v)) throw new HttpError(400, `Please check ${label} — it doesn’t look like a valid email.`, name);
  return v;
}

export const isEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

export function phone(fields: Record<string, string>, name: string, label: string, required = true): string {
  const v = text(fields, name, label, { required, max: 30 });
  if (!v) return v;
  const digits = v.replace(/\D/g, "").length;
  if (!/^[0-9+().\-\s]+$/.test(v) || digits < 7 || digits > 20) {
    throw new HttpError(400, `Please check ${label} — use 7 to 20 digits.`, name);
  }
  return v;
}

export function oneOf<T extends string>(fields: Record<string, string>, name: string, label: string, allowed: readonly T[]): T {
  const v = (fields[name] ?? "").trim();
  if (!allowed.includes(v as T)) throw new HttpError(400, `Please choose ${label}.`, name);
  return v as T;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isoDate(fields: Record<string, string>, name: string, label: string): string {
  const v = (fields[name] ?? "").trim();
  const m = DATE_RE.exec(v);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new HttpError(400, `Please enter ${label} as a date (YYYY-MM-DD).`, name);
  }
  return v;
}

/** Whole years between a YYYY-MM-DD birth date and today's date (YYYY-MM-DD). */
export function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Dollars string ("4,750.50", "$4750") → integer cents, or null if malformed. */
export function parseDollars(raw: string | null | undefined): number | null {
  const v = (raw ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const cap = (s: string) => s.replace(/^(your |a |an |the )/, "").replace(/^./, (c) => c.toUpperCase());
