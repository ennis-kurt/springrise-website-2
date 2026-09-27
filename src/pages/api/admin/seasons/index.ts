import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { ApiError } from "../../../../lib/server/http";
import { createSeason, seasonSlugExists } from "../../../../lib/server/db";
import { seasonInputFromForm } from "../../../../lib/server/season-input";

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();
    const input = seasonInputFromForm(form);
    if (await seasonSlugExists(env.DB, input.slug)) throw new ApiError(409, "A season with this slug already exists.", "slug");
    const id = input.slug;
    await createSeason(env.DB, id, input);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/${id}?saved=1` } });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    if (!(err instanceof ApiError)) console.error("create season error", err);
    return new Response(null, { status: 303, headers: { Location: `/admin/seasons/new?error=${encodeURIComponent(message)}` } });
  }
};
