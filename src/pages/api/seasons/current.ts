import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { apiRoute, jsonResponse } from "../../../lib/server/http";
import { listPublicSeasons } from "../../../lib/server/db";
import { featuredSeason, seasonState } from "../../../lib/seasons";

export const GET: APIRoute = apiRoute(async () => {
  const seasons = await listPublicSeasons(env.DB);
  const season = featuredSeason(seasons);
  const body = season
    ? {
        season: {
          slug: season.slug,
          title: season.title,
          term: season.term,
          year: season.year,
          opens_at: season.opens_at,
          closes_at: season.closes_at,
          state: seasonState(season),
          summary: season.summary,
        },
      }
    : { season: null };
  return jsonResponse(body, 200, { "Cache-Control": "public, max-age=60" });
});
