import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, fail } from "../../../lib/server/http";
import { clientIp, rateLimit } from "../../../lib/server/security";
import { assertAdminPasswordConfigured, createSession, randomSessionToken, sessionCookieHeader, verifyPassword, SESSION_TTL_SECONDS } from "../../../lib/server/auth";

export const POST: APIRoute = async ({ request }) => {
  try {
    await rateLimit(env.DB, { bucket: "admin-login", subject: clientIp(request), limit: 10, windowMs: 15 * 60_000 });

    const form = await request.formData();
    const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
    const nextRaw = typeof form.get("next") === "string" ? String(form.get("next")) : "/admin";
    const next = nextRaw.startsWith("/admin") ? nextRaw : "/admin";

    assertAdminPasswordConfigured(env.ADMIN_PASSWORD);
    if (!password) fail(401, "Invalid credentials.");
    const ok = await verifyPassword(password, env.ADMIN_PASSWORD);
    if (!ok) fail(401, "Invalid credentials.");

    const token = randomSessionToken();
    await createSession(env.DB, token);

    return new Response(null, {
      status: 303,
      headers: { Location: next, "Set-Cookie": sessionCookieHeader(request, token, SESSION_TTL_SECONDS) },
    });
  } catch (err) {
    if (!(err instanceof ApiError)) console.error("admin login error", err);
    return new Response(null, { status: 303, headers: { Location: "/admin/login?error=1" } });
  }
};
