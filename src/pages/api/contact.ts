import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { later } from "../../lib/server/background";
import { newId, nowIso } from "../../lib/server/db";
import { clientIp, handle, json, readFields, redirectBack, wantsHtml } from "../../lib/server/http";
import { inquiryNotice } from "../../lib/server/mail";
import { enforce } from "../../lib/server/throttle";
import { email, oneOf, phone, text } from "../../lib/server/validate";

const REASONS = ["general", "scholarship", "giving", "mentor", "board", "internships", "partnership"] as const;

export const POST: APIRoute = ({ request, locals }) =>
  handle(request, async () => {
    const f = await readFields(request);
    const ok = () => (wantsHtml(request) ? redirectBack(request, { sent: true }, "/contact") : json({ ok: true }, 201));
    if ((f.company ?? "").trim()) return wantsHtml(request) ? ok() : json({ ok: true }, 200);
    await enforce("contact", clientIp(request));
    const i = {
      name: text(f, "name", "your name", { max: 120 }),
      email: email(f, "email", "your email address"),
      phone: phone(f, "phone", "your phone number", false),
      reason: oneOf(f, "reason", "what your message is about", REASONS),
      message: text(f, "message", "your message", { min: 10, max: 5000 }),
    };
    await env.DB.prepare(
      "INSERT INTO inquiries (id, name, email, phone, reason, message, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    ).bind(newId(), i.name, i.email, i.phone, i.reason, i.message, nowIso()).run();
    later(locals, inquiryNotice(i));
    return ok();
  }, "/contact");
