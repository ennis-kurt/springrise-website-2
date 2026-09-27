import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, errorBody, formRedirect, jsonResponse, prefersHtml, readFormOrJsonBody } from "../../lib/server/http";
import { str, emailField } from "../../lib/server/validate";
import { clientIp, rateLimit } from "../../lib/server/security";
import { insertSubscriber } from "../../lib/server/db";

export const POST: APIRoute = async ({ request }) => {
  const wantsHtml = prefersHtml(request);
  try {
    await rateLimit(env.DB, { bucket: "subscribe", subject: clientIp(request), limit: 20, windowMs: 3_600_000 });
    const body = await readFormOrJsonBody(request);

    // Honeypot: bots fill this hidden field. Pretend success without saving.
    const honeypot = typeof body.website === "string" ? body.website.trim() : "";
    if (!honeypot) {
      const email = emailField(body.email, "email");
      const source = str(body.source, { field: "source", label: "Source", max: 60, required: false }) || "site";
      await insertSubscriber(env.DB, email, source);
    }

    return wantsHtml ? formRedirect(request, { sent: "subscribe" }) : jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return wantsHtml ? formRedirect(request, { error: err.message }) : jsonResponse(errorBody(err), err.status);
    }
    console.error("subscribe error", err);
    return wantsHtml
      ? formRedirect(request, { error: "Something went wrong. Please try again." })
      : jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
};
