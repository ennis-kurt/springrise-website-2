import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { destroySession, readSessionCookie, sessionCookieHeader } from "../../../lib/server/auth";

export const POST: APIRoute = async ({ request }) => {
  const token = readSessionCookie(request);
  if (token) await destroySession(env.DB, token);
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/login", "Set-Cookie": sessionCookieHeader(request, "", 0) },
  });
};
