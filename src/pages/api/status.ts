import type { APIRoute } from "astro";
import { STAGES } from "../../lib/season";
import { clientIp, fail, handle, json, readFields } from "../../lib/server/http";
import { enforce } from "../../lib/server/throttle";
import { env } from "cloudflare:workers";

const NOT_FOUND = "We couldn't find an application with that code and email. Check both and try again.";

export const POST: APIRoute = ({ request }) =>
  handle(request, async () => {
    await enforce("status", clientIp(request));
    const f = await readFields(request);
    const code = (f.code ?? "").trim().toUpperCase().slice(0, 20);
    const email = (f.email ?? "").trim().toLowerCase().slice(0, 254);
    if (!code || !email) return fail(400, "Please enter your reference code and email address.", !code ? "code" : "email");
    const row = await env.DB.prepare(
      `SELECT a.code, a.stage, a.created_at, a.updated_at, s.title
       FROM applications a JOIN seasons s ON s.slug = a.season_slug
       WHERE a.code = ?1 AND a.email = ?2`,
    ).bind(code, email).first<{ code: string; stage: keyof typeof STAGES; created_at: string; updated_at: string; title: string }>();
    if (!row) return fail(404, NOT_FOUND);
    return json({
      code: row.code,
      season: row.title,
      stage: row.stage,
      stageLabel: STAGES[row.stage],
      submittedAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }, "/scholarships/status");
