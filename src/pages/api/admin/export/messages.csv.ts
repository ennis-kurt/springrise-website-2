import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { csvResponse } from "../../../../lib/server/csv";
import { listMessagesForExport } from "../../../../lib/server/db";

const COLUMNS = ["name", "email", "phone", "topic", "subject", "message", "status", "created_at"];

export const GET: APIRoute = async () => {
  const rows = await listMessagesForExport(env.DB);
  return csvResponse("springrise-messages.csv", COLUMNS, rows);
};
