import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError, fail } from "../../../../../lib/server/http";
import { getSeason, getSeasonAnnouncementInfo, listSubscribers, markSeasonAnnounced } from "../../../../../lib/server/db";
import { seasonState } from "../../../../../lib/seasons";
import { buildAnnouncementMessage, emailEnabled, sendBatch } from "../../../../../lib/server/email";

export const POST: APIRoute = async ({ request, params }) => {
  const id = params.id!;
  try {
    const season = await getSeason(env.DB, id);
    if (!season) fail(404, "Season not found.");
    if (season.status !== "published") fail(400, "Only a published season can be announced.");

    const state = seasonState(season);
    if (state !== "upcoming" && state !== "open") fail(400, "This season is closed and can't be announced.");

    const form = await request.formData();
    const force = form.get("force") === "1";

    const info = await getSeasonAnnouncementInfo(env.DB, id);
    if (info?.announced_at && !force) {
      fail(409, "This season was already announced. Use \"send again\" if you're sure.");
    }

    if (!emailEnabled()) fail(503, "Email sending isn't configured (RESEND_API_KEY).");

    const subscribers = await listSubscribers(env.DB);
    if (subscribers.length === 0) fail(400, "There are no subscribers to email.");

    const messages = await Promise.all(subscribers.map((sub) => buildAnnouncementMessage(season, state, sub.email)));
    const result = await sendBatch(messages);
    if (!result.ok && result.sent === 0) fail(502, result.error || "Could not send announcement emails.");

    await markSeasonAnnounced(env.DB, id, result.sent);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/${id}?announced=${result.sent}` } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("announce season error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/${id}?error=${encodeURIComponent(message)}` } });
  }
};
