import type { APIRoute } from "astro";
import { phaseOf, spotlight } from "../../lib/season";
import { publishedSeasons } from "../../lib/server/db";
import { json } from "../../lib/server/http";

export const GET: APIRoute = async () => {
  const s = spotlight(await publishedSeasons());
  const season = s
    ? { slug: s.slug, title: s.title, term: s.term, year: s.year, opens_at: s.opens_at, closes_at: s.closes_at, phase: phaseOf(s), headline: s.headline }
    : null;
  return json({ season }, 200, { "Cache-Control": "public, max-age=60" });
};
