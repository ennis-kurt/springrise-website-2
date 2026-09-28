// Eastern-time helpers for staff forms. Self-contained (no imports) so the
// test script can load it directly with Node's type stripping.
//
// Staff type wall-clock times into <input type="datetime-local"> meaning
// America/New_York. We store ISO UTC strings.

const TZ = "America/New_York";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }

function wallAt(ms: number): Wall {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** Offset of New York from UTC at a given instant, in ms (e.g. -4h during EDT). */
export function etOffsetMs(ms: number): number {
  const w = wallAt(ms);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "2026-11-02T09:00" (New York wall time) → "2026-11-02T14:00:00.000Z".
 * Ambiguous fall-back times resolve to the first (EDT) occurrence; times that
 * don't exist (spring-forward gap) move forward by the gap. Returns null if invalid.
 */
export function etLocalToUtc(value: string | null | undefined): string | null {
  const m = LOCAL_RE.exec((value ?? "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Try both candidate offsets around the instant; prefer the earliest that round-trips.
  const offsets = [etOffsetMs(naive - 86_400_000), etOffsetMs(naive + 86_400_000)].sort((a, b) => b - a);
  for (const off of offsets) {
    const t = naive - off;
    if (etOffsetMs(t) === off) return new Date(t).toISOString();
  }
  // Gap (nonexistent local time): use the offset before the transition.
  return new Date(naive - offsets[1]).toISOString();
}

/** ISO UTC → "YYYY-MM-DDTHH:mm" in New York, for datetime-local inputs. */
export function utcToEtLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const w = wallAt(ms);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(w.y, 4)}-${p(w.mo)}-${p(w.d)}T${p(w.h)}:${p(w.mi)}`;
}

/** "Sep 28, 2026, 9:05 AM EDT" */
export function formatEt(iso: string | null | undefined, withZone = true): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" } : {}),
  });
}

/** Today's date in New York as YYYY-MM-DD. */
export function etToday(now = Date.now()): string {
  return utcToEtLocal(new Date(now).toISOString()).slice(0, 10);
}
