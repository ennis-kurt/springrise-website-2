import { defineMiddleware } from "astro:middleware";
import { REDIRECTS } from "./lib/facts";
import { COOKIE, isValidSession } from "./lib/server/auth";

const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const isStaffPage = (p: string) => p === "/staff" || p.startsWith("/staff/");
const isStaffApi = (p: string) => p.startsWith("/api/staff/");
const isSignIn = (p: string) => p === "/staff/sign-in" || p === "/api/staff/sign-in";

function withHeaders(res: Response, path: string): Response {
  let out = res;
  const set = (k: string, v: string) => out.headers.set(k, v);
  try {
    out.headers.set("X-Content-Type-Options", "nosniff");
  } catch {
    out = new Response(res.body, res); // immutable headers (e.g. Response.redirect)
  }
  set("X-Content-Type-Options", "nosniff");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("X-Frame-Options", "DENY");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!import.meta.env.DEV) set("Content-Security-Policy", CSP);
  if (isStaffPage(path) || path === "/api" || path.startsWith("/api/")) {
    if (!out.headers.has("Cache-Control")) set("Cache-Control", "no-store");
    set("X-Robots-Tag", "noindex");
  }
  return out;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const raw = ctx.url.pathname;
  const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  const target = REDIRECTS[path] ?? (/^\/event-details-registration(\/|$)/.test(path) ? "/scholarships" : null);
  if (target) {
    return withHeaders(new Response(null, { status: 301, headers: { Location: target } }), path);
  }

  const token = ctx.cookies.get(COOKIE)?.value;
  ctx.locals.staff = token ? await isValidSession(token).catch(() => false) : false;

  if (!ctx.locals.staff && !isSignIn(path)) {
    if (isStaffApi(path)) {
      return withHeaders(
        new Response(JSON.stringify({ error: "Please sign in to the staff workspace." }), {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
        path,
      );
    }
    if (isStaffPage(path)) {
      const next = encodeURIComponent(ctx.url.pathname + ctx.url.search);
      return withHeaders(new Response(null, { status: 303, headers: { Location: `/staff/sign-in?next=${next}` } }), path);
    }
  }

  return withHeaders(await next(), path);
});
