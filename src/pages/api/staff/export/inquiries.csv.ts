import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { csvResponse, toCsv } from "../../../../lib/server/csv";
import type { InquiryRow } from "../../../../lib/server/db";
import { formatEt } from "../../../../lib/server/time";

export const GET: APIRoute = async ({ url }) => {
  const show = url.searchParams.get("show");
  const where = show === "handled" ? "WHERE handled = 1" : show === "open" ? "WHERE handled = 0" : "";
  const { results } = await env.DB.prepare(`SELECT * FROM inquiries ${where} ORDER BY created_at DESC`).all<InquiryRow>();
  return csvResponse(
    "springrise-inquiries.csv",
    toCsv(
      ["Received (ET)", "Name", "Email", "Phone", "Topic", "Message", "Handled"],
      results.map((r) => [formatEt(r.created_at, false), r.name, r.email, r.phone, r.reason, r.message, r.handled ? "yes" : "no"]),
    ),
  );
};
