import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { nowIso } from "../../lib/server/db";
import { clientIp, handle, json, readFields, redirectBack, wantsHtml } from "../../lib/server/http";
import { enforce } from "../../lib/server/throttle";
import { email } from "../../lib/server/validate";

export const POST: APIRoute = ({ request }) =>
  handle(request, async () => {
    const f = await readFields(request);
    const ok = () => (wantsHtml(request) ? redirectBack(request, { sent: true }) : json({ ok: true }));
    if ((f.company ?? "").trim()) return ok();
    await enforce("subscribe", clientIp(request));
    const e = email(f, "email", "your email address");
    const source = (f.source ?? "").trim().replace(/[^\w:/.-]/g, "").slice(0, 40) || "site";
    await env.DB.prepare("INSERT INTO subscribers (email, source, created_at) VALUES (?1, ?2, ?3) ON CONFLICT (email) DO NOTHING")
      .bind(e, source, nowIso())
      .run();
    return ok();
  });
