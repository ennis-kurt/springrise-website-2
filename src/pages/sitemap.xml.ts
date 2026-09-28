import type { APIRoute } from "astro";
import { publicSeasons } from "../lib/public";

const PAGES = ["/", "/scholarships", "/scholarships/status", "/impact", "/about", "/get-involved", "/give", "/contact", "/governance", "/privacy"];

export const GET: APIRoute = async ({ site, url }) => {
  const base = (site ?? url).origin;
  const seasons = await publicSeasons();
  const urls = [...PAGES, ...seasons.map((s) => `/scholarships/${s.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
