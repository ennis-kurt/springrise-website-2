import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { csvResponse, toCsv } from "../../../../lib/server/csv";
import type { SubscriberRow } from "../../../../lib/server/db";
import { formatEt } from "../../../../lib/server/time";

export const GET: APIRoute = async () => {
  const { results } = await env.DB.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all<SubscriberRow>();
  return csvResponse(
    "springrise-subscribers.csv",
    toCsv(["Email", "Source", "Subscribed (ET)"], results.map((r) => [r.email, r.source, formatEt(r.created_at, false)])),
  );
};
