import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, errorBody, formRedirect, jsonResponse, prefersHtml, readFormOrJsonBody } from "../../lib/server/http";
import { str, emailField, phoneField } from "../../lib/server/validate";
import { clientIp, rateLimit } from "../../lib/server/security";
import { insertMessage } from "../../lib/server/db";
import { randomId } from "../../lib/server/ids";
import { sendStaffContactNotificationEmail } from "../../lib/server/email";

const TOPICS = new Set(["general", "scholarship", "donation", "volunteer", "partnership"]);

export const POST: APIRoute = async ({ request }) => {
  const wantsHtml = prefersHtml(request);
  try {
    await rateLimit(env.DB, { bucket: "contact", subject: clientIp(request), limit: 10, windowMs: 3_600_000 });
    const body = await readFormOrJsonBody(request);

    // Honeypot: bots fill this hidden field. Pretend success without saving.
    const honeypot = typeof body.website === "string" ? body.website.trim() : "";
    if (honeypot) {
      return wantsHtml ? formRedirect(request, { sent: "contact" }) : jsonResponse({ ok: true });
    }

    const name = str(body.name, { field: "name", label: "Name", max: 200 });
    const email = emailField(body.email, "email");
    const phone = phoneField(body.phone, "phone", "Phone", false);
    const topic = typeof body.topic === "string" && TOPICS.has(body.topic) ? body.topic : "general";
    const subject = str(body.subject, { field: "subject", label: "Subject", max: 200, required: false });
    const message = str(body.message, { field: "message", label: "Message", max: 5000 });
    if (message.length < 10) throw new ApiError(400, "Message must be at least 10 characters.", "message");

    await insertMessage(env.DB, { id: randomId(), name, email, phone, topic, subject, message });
    await sendStaffContactNotificationEmail({ name, email, topic, message });

    return wantsHtml ? formRedirect(request, { sent: "contact" }) : jsonResponse({ ok: true }, 201);
  } catch (err) {
    if (err instanceof ApiError) {
      return wantsHtml ? formRedirect(request, { error: err.message }) : jsonResponse(errorBody(err), err.status);
    }
    console.error("contact error", err);
    return wantsHtml
      ? formRedirect(request, { error: "Something went wrong. Please try again." })
      : jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
};
