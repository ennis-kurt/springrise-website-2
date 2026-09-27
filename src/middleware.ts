import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { LEGACY_REDIRECTS } from "./lib/content";
import { isValidSession, readSessionCookie } from "./lib/server/auth";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const CSP =
  "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // --- Legacy Wix URL redirects -------------------------------------------
  const legacyTarget = LEGACY_REDIRECTS[pathname];
  if (legacyTarget) return context.redirect(legacyTarget, 301);
  if (pathname.startsWith("/event-details-registration/")) return context.redirect("/scholarships", 301);

  // --- Staff auth guard ----------------------------------------------------
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isAdminApi = pathname.startsWith("/api/admin/") && pathname !== "/api/admin/login";

  if (isAdminPage || isAdminApi) {
    const staff = await isValidSession(env.DB, readSessionCookie(context.request));
    context.locals.staff = staff;
    if (!staff) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: "Authentication required." }), {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const next = encodeURIComponent(pathname + context.url.search);
      return context.redirect(`/admin/login?next=${next}`, 303);
    }
  } else {
    context.locals.staff = false;
  }

  const response = await next();

  // --- Security headers on every response -----------------------------------
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  // Skip CSP in dev so Vite's inline HMR client keeps working.
  if (!import.meta.env.DEV) headers.set("Content-Security-Policy", CSP);
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/")) {
    // Let a route set its own Cache-Control (e.g. /api/seasons/current) — default to no-store otherwise.
    if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex");
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
