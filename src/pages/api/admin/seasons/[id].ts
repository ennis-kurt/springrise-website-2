import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError } from "../../../../lib/server/http";
import { getSeason, seasonHasApplications, seasonSlugExists, updateSeason } from "../../../../lib/server/db";
import { seasonInputFromForm } from "../../../../lib/server/season-input";

export const POST: APIRoute = async ({ request, params }) => {
  const id = params.id!;
  try {
    const existing = await getSeason(env.DB, id);
    if (!existing) throw new ApiError(404, "Season not found.");

    const form = await request.formData();
    const input = seasonInputFromForm(form);

    if (input.slug !== existing.slug) {
      if (await seasonHasApplications(env.DB, id)) {
        throw new ApiError(400, "The slug can't be changed once a season has applications.", "slug");
      }
      if (await seasonSlugExists(env.DB, input.slug, id)) throw new ApiError(409, "A season with this slug already exists.", "slug");
    }

    await updateSeason(env.DB, id, input);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/${id}?saved=1` } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("update season error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/${id}?error=${encodeURIComponent(message)}` } });
  }
};
