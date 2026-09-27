// Crypto primitives and fixed-window rate limiting shared across the API.
import { fail } from "./http";

const encoder = new TextEncoder();

export async function sha256hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (via equal-length SHA-256 digests) — safe for secrets. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  // Both are fixed-length (32-byte) SHA-256 digests, so this loop's timing never
  // depends on where `a` and `b` first differ.
  let diff = va.length ^ vb.length;
  for (let i = 0; i < va.length && i < vb.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "local";
}

export interface RateLimitOptions {
  /** Logical bucket name, e.g. "applications", "contact", "admin-login". */
  bucket: string;
  /** The thing being limited — usually an IP address. */
  subject: string;
  limit: number;
  windowMs: number;
}

/**
 * Fixed-window rate limiter backed by the `rate_limits` table. Also
 * opportunistically deletes stale windows so the table doesn't grow forever.
 */
export async function rateLimit(db: D1Database, opts: RateLimitOptions): Promise<void> {
  const windowStart = Math.floor(Date.now() / opts.windowMs) * opts.windowMs;
  const subjectHash = await sha256hex(`${opts.bucket}:${opts.subject}`);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, subject_hash, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(bucket, subject_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(opts.bucket, subjectHash, windowStart)
    .first<{ count: number }>();

  // Opportunistic cleanup: cheap, and only needs to happen occasionally.
  if (!row || row.count === 1 || Math.random() < 0.01) {
    await db
      .prepare("DELETE FROM rate_limits WHERE window_start < ?")
      .bind(Date.now() - 7 * 24 * 3_600_000)
      .run();
  }

  if (!row || row.count > opts.limit) fail(429, "Too many requests. Please try again later.");
}
