// Staff session management: password check, session tokens/cookies.
import { fail } from "./http";
import { sha256hex, timingSafeEqual } from "./security";

export const SESSION_COOKIE = "sr_staff";
export const SESSION_TTL_SECONDS = 8 * 3600;

/** Throws if the admin password secret is missing or too short to be a real secret. */
export function assertAdminPasswordConfigured(password: string | undefined | null): asserts password is string {
  if (!password || password.length < 16) fail(503, "Staff login is not available right now.");
}

export async function verifyPassword(candidate: string, expected: string): Promise<boolean> {
  return timingSafeEqual(candidate, expected);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomSessionToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(db: D1Database, token: string): Promise<void> {
  const now = Date.now();
  // Opportunistic cleanup of expired sessions.
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(now).run();
  await db
    .prepare("INSERT INTO admin_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)")
    .bind(await sha256hex(token), now + SESSION_TTL_SECONDS * 1000, now)
    .run();
}

export async function destroySession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256hex(token)).run();
}

export async function isValidSession(db: D1Database, token: string | null): Promise<boolean> {
  if (!token || !/^[A-Za-z0-9_-]{20,80}$/.test(token)) return false;
  const row = await db
    .prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?")
    .bind(await sha256hex(token))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Builds a `Set-Cookie` header value; `maxAgeSeconds` 0 clears the cookie. */
export function sessionCookieHeader(request: Request, token: string, maxAgeSeconds: number): string {
  const secure = new URL(request.url).protocol === "https:";
  const parts = [`${SESSION_COOKIE}=${token}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function requireStaff(request: Request, db: D1Database): Promise<boolean> {
  return isValidSession(db, readSessionCookie(request));
}
