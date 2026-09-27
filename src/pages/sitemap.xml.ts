import type { APIRoute } from "astro";
import { getPublicSeasons } from "../lib/site";

const STATIC = ["/", "/about", "/scholarships", "/scholarships/status", "/get-involved", "/donate", "/contact", "/privacy"];

export const GET: APIRoute = async ({ site, url }) => {
  const base = (site ?? url).origin;
  const seasons = await getPublicSeasons();
  const paths = [...STATIC, ...seasons.map((s) => `/scholarships/${s.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n")}
</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
