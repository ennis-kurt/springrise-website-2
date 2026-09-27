import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, fail } from "../../../../lib/server/http";
import { str } from "../../../../lib/server/validate";
import { updateApplicationStaff } from "../../../../lib/server/db";

const STATUSES = ["received", "under_review", "needs_information", "awarded", "not_awarded", "withdrawn"];

export const POST: APIRoute = async ({ request, params }) => {
  const id = params.id!;
  try {
    const form = await request.formData();
    const status = str(form.get("status"), { field: "status", label: "Status", max: 30 });
    if (!STATUSES.includes(status)) fail(400, "Please choose a valid status.", "status");

    const awardRaw = str(form.get("awardAmount"), { field: "awardAmount", label: "Award amount", max: 20, required: false });
    let awardCents: number | null = null;
    if (awardRaw) {
      if (!/^\d+(\.\d{1,2})?$/.test(awardRaw)) fail(400, "Award amount must be a valid dollar amount.", "awardAmount");
      const amount = Number(awardRaw);
      if (amount < 0 || amount > 100_000) fail(400, "Award amount looks out of range.", "awardAmount");
      awardCents = Math.round(amount * 100);
    }

    const staffNotes = str(form.get("staffNotes"), { field: "staffNotes", label: "Staff notes", max: 4000, required: false });

    const ok = await updateApplicationStaff(env.DB, id, { status, awardCents, staffNotes });
    if (!ok) fail(404, "Application not found.");

    return new Response(null, { status: 303, headers: { Location: `/admin/applications/${id}?saved=1` } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("update application error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/applications/${id}?error=${encodeURIComponent(message)}` } });
  }
};
