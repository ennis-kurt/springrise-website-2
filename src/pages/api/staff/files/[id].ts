import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { fail } from "../../../../lib/server/http";

const clean = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";

export const GET: APIRoute = async ({ params }) => {
  const id = params.id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail(404, "File not found.");
  const row = await env.DB.prepare(
    `SELECT t.storage_key, t.kind, a.first_name, a.last_name
     FROM attachments t JOIN applications a ON a.id = t.application_id WHERE t.id = ?1`,
  ).bind(id).first<{ storage_key: string; kind: string; first_name: string; last_name: string }>();
  if (!row) return fail(404, "File not found.");
  const obj = await env.FILES.get(row.storage_key);
  if (!obj) return fail(404, "The stored file is missing.");
  const name = `${clean(row.last_name)}_${clean(row.first_name)}_${clean(row.kind)}.pdf`;
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(obj.size),
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
};
