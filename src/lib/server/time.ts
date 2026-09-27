// Conversions between America/New_York "wall clock" strings (what staff type
// into a <input type="datetime-local">) and UTC ISO strings (what we store),
// correct across the DST boundary.
import { TIME_ZONE } from "../seasons";

/** Offset (in minutes, UTC minus local) that `timeZone` observes at the instant `utcMillis`. */
function timeZoneOffsetMinutes(timeZone: string, utcMillis: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMillis));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Reinterpreting those same wall-clock numbers as UTC tells us how far "local" is from UTC.
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - utcMillis) / 60_000;
}

/**
 * Converts a `datetime-local` value (e.g. "2026-11-01T09:00") interpreted as
 * wall-clock time in America/New_York into a UTC ISO-8601 string.
 */
export function easternWallTimeToUtcIso(wallTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallTime.trim());
  if (!match) throw new Error("Invalid date/time.");
  const [, y, mo, d, h, mi, s] = match;
  // First guess: treat the wall-clock numbers as if they were already UTC, then
  // find the real offset New York observes at that instant (this correctly
  // resolves DST because it looks at the actual calendar date/time given).
  const guessUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), s ? Number(s) : 0);
  const offsetMinutes = timeZoneOffsetMinutes(TIME_ZONE, guessUtc);
  return new Date(guessUtc - offsetMinutes * 60_000).toISOString();
}

/** Formats a UTC ISO string as an America/New_York `datetime-local` value for form inputs. */
export function utcIsoToEasternWallTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
