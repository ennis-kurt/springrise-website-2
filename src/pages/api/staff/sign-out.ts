import type { APIRoute } from "astro";
import { clearSessionCookie, COOKIE, endSession } from "../../../lib/server/auth";
import { json, wantsHtml } from "../../../lib/server/http";

export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  await endSession(cookies.get(COOKIE)?.value);
  clearSessionCookie(cookies, url);
  return wantsHtml(request) ? redirect("/staff/sign-in?signedOut=1", 303) : json({ ok: true });
};
