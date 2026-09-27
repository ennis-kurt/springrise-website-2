import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { csvResponse } from "../../../../lib/server/csv";
import { listSubscribersForExport } from "../../../../lib/server/db";

const COLUMNS = ["email", "source", "created_at"];

export const GET: APIRoute = async () => {
  const rows = await listSubscribersForExport(env.DB);
  return csvResponse("springrise-subscribers.csv", COLUMNS, rows);
};
