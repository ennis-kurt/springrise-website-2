import { env } from "cloudflare:workers";
import type { AstroCookies } from "astro";
import { randomToken, safeEqual, sha256Hex } from "./crypto";
import { allow } from "./throttle";

export const COOKIE = "sr_session";
export const SESSION_HOURS = 8;
const SESSION_MS = SESSION_HOURS * 3600_000;

export const passwordConfigured = () => (env.ADMIN_PASSWORD ?? "").length >= 16;

export type SignInResult = { ok: true; token: string } | { ok: false; status: number; error: string };

export async function signIn(password: string, ip: string): Promise<SignInResult> {
  if (!passwordConfigured()) {
    return { ok: false, status: 503, error: "Staff sign-in is not configured. Set an ADMIN_PASSWORD of at least 16 characters." };
  }
  if (!(await allow("signin", ip))) {
    return { ok: false, status: 429, error: "Too many sign-in attempts. Please wait 15 minutes and try again." };
  }
  if (!password || !(await safeEqual(password, env.ADMIN_PASSWORD!))) {
    return { ok: false, status: 401, error: "That password isn't right." };
  }
  const token = randomToken(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM staff_sessions WHERE expires_at < ?1").bind(now),
    env.DB.prepare("INSERT INTO staff_sessions (token_hash, expires_at) VALUES (?1, ?2)").bind(await sha256Hex(token), now + SESSION_MS),
  ]);
  return { ok: true, token };
}

export async function isValidSession(token: string | undefined | null): Promise<boolean> {
  if (!token || token.length > 100 || !passwordConfigured()) return false;
  const row = await env.DB.prepare("SELECT expires_at FROM staff_sessions WHERE token_hash = ?1")
    .bind(await sha256Hex(token))
    .first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}

export async function endSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await env.DB.prepare("DELETE FROM staff_sessions WHERE token_hash = ?1").bind(await sha256Hex(token)).run();
}

export function setSessionCookie(cookies: AstroCookies, token: string, url: URL) {
  cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: url.protocol === "https:",
    maxAge: SESSION_MS / 1000,
  });
}

export function clearSessionCookie(cookies: AstroCookies, url: URL) {
  cookies.delete(COOKIE, { path: "/", httpOnly: true, sameSite: "strict", secure: url.protocol === "https:" });
}

/** Only allow same-site relative paths under /staff as post-sign-in targets. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !/^\/staff(?:[/?#]|$)/.test(next) || next.includes("\\")) return "/staff";
  if (next.startsWith("/staff/sign-in")) return "/staff";
  return next;
}
