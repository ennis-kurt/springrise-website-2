// Read-only public data used by the public pages (never returns drafts).
import { env } from "cloudflare:workers";
import { featuredSeason, seasonState, type Season, type SeasonState } from "./seasons";

export interface PublicSeason extends Season { state: SeasonState }

const TERM_ORDER: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };

export async function getPublicSeasons(): Promise<PublicSeason[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM seasons WHERE status IN ('published','archived')",
    ).all<Season>();
    const now = Date.now();
    return (results ?? [])
      .map((s) => ({ ...s, state: seasonState(s, now) }))
      .sort((a, b) => b.year - a.year || TERM_ORDER[b.term] - TERM_ORDER[a.term]);
  } catch (err) {
    console.error("getPublicSeasons failed", err);
    return [];
  }
}

export async function getPublicSeason(slug: string): Promise<PublicSeason | null> {
  const all = await getPublicSeasons();
  return all.find((s) => s.slug === slug) ?? null;
}

export async function getSiteState() {
  const seasons = await getPublicSeasons();
  const featured = featuredSeason(seasons);
  const current = featured ? (seasons.find((s) => s.id === featured.id) ?? null) : null;
  return { seasons, current };
}
