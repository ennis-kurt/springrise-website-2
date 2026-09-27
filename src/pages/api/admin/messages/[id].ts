import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, fail } from "../../../../lib/server/http";
import { str } from "../../../../lib/server/validate";
import { setMessageStatus } from "../../../../lib/server/db";

const STATUSES = ["new", "read", "archived"];

export const POST: APIRoute = async ({ request, params }) => {
  const id = params.id!;
  try {
    const form = await request.formData();
    const status = str(form.get("status"), { field: "status", label: "Status", max: 20 });
    if (!STATUSES.includes(status)) fail(400, "Please choose a valid status.", "status");

    const ok = await setMessageStatus(env.DB, id, status);
    if (!ok) fail(404, "Message not found.");

    return new Response(null, { status: 303, headers: { Location: "/admin/messages?saved=1" } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("update message error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/messages?error=${encodeURIComponent(message)}` } });
  }
};
