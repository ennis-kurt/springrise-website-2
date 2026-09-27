import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, fail } from "../../../../lib/server/http";
import { str } from "../../../../lib/server/validate";
import { getApplicationEmailInfo, getSeason, insertApplicationEmailEvent, updateApplicationStaff } from "../../../../lib/server/db";
import { emailEnabled, sendApplicantStatusEmail } from "../../../../lib/server/email";
import { STATUS_LABELS } from "../../../../lib/seasons";

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
    const notifyApplicant = form.get("notifyApplicant") === "on";
    const applicantMessage = str(form.get("applicantMessage"), { field: "applicantMessage", label: "Message to applicant", max: 2000, required: false });

    const ok = await updateApplicationStaff(env.DB, id, { status, awardCents, staffNotes });
    if (!ok) fail(404, "Application not found.");

    if (notifyApplicant && status !== "received") {
      if (!emailEnabled()) {
        await insertApplicationEmailEvent(env.DB, id, "Status update email skipped: email sending isn't configured.");
      } else {
        const info = await getApplicationEmailInfo(env.DB, id);
        if (info) {
          const season = await getSeason(env.DB, info.season_id);
          const result = await sendApplicantStatusEmail({
            to: info.email,
            firstName: info.first_name,
            statusLabel: STATUS_LABELS[status] ?? status,
            seasonTitle: season?.title ?? "your application",
            message: applicantMessage,
          });
          await insertApplicationEmailEvent(
            env.DB,
            id,
            result.ok ? "Status update email sent to applicant." : `Status update email failed: ${result.error ?? "unknown error"}`,
          );
        }
      }
    }

    return new Response(null, { status: 303, headers: { Location: `/admin/applications/${id}?saved=1` } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("update application error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/applications/${id}?error=${encodeURIComponent(message)}` } });
  }
};
