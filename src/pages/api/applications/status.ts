import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { apiRoute, jsonResponse, readJsonBody, fail } from "../../../lib/server/http";
import { str, emailField } from "../../../lib/server/validate";
import { clientIp, rateLimit } from "../../../lib/server/security";
import { getApplicationStatusLookup } from "../../../lib/server/db";
import { STATUS_LABELS } from "../../../lib/seasons";

export const POST: APIRoute = apiRoute(async ({ request }) => {
  await rateLimit(env.DB, { bucket: "status", subject: clientIp(request), limit: 20, windowMs: 3_600_000 });

  const body = await readJsonBody(request, 4096);
  const reference = str(body.reference, { field: "reference", label: "Reference", max: 40 }).toUpperCase();
  const email = emailField(body.email, "email");

  const row = await getApplicationStatusLookup(env.DB, reference, email);
  if (!row) fail(404, "We couldn't find an application with those details.");

  return jsonResponse({
    reference: row.reference,
    season: row.season_title,
    status: row.status,
    statusLabel: STATUS_LABELS[row.status] ?? row.status,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
  });
});
