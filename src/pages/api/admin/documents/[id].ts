import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getDocumentForDownload } from "../../../../lib/server/db";

function sanitizeNamePart(value: string): string {
  const cleaned = (value || "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "applicant";
}

export const GET: APIRoute = async ({ params }) => {
  const doc = await getDocumentForDownload(env.DB, params.id!);
  if (!doc) return new Response("Not found", { status: 404 });

  const object = await env.DOCS.get(doc.object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const filename = `${sanitizeNamePart(doc.last_name)}_${sanitizeNamePart(doc.first_name)}_${sanitizeNamePart(doc.kind)}.pdf`;

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
};
