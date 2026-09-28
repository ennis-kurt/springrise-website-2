// Public, read-only data access for the website. Never returns drafts to the public.
import { env } from "cloudflare:workers";
import { chronological, phaseOf, spotlight, type Phase, type Season } from "./season";

export interface LiveSeason extends Season { phase: Phase }

const withPhase = (s: Season): LiveSeason => ({ ...s, phase: phaseOf(s) });

export async function publicSeasons(): Promise<LiveSeason[]> {
  try {
    const { results } = await env.DB.prepare("SELECT * FROM seasons WHERE status IN ('published','archived')").all<Season>();
    return (results ?? []).map(withPhase).sort(chronological);
  } catch (err) {
    console.error("publicSeasons", err);
    return [];
  }
}

export async function siteData() {
  const seasons = await publicSeasons();
  const lit = spotlight(seasons);
  return { seasons, spotlight: lit ? (seasons.find((s) => s.slug === lit.slug) ?? null) : null };
}
export type SiteData = Awaited<ReturnType<typeof siteData>>;

/** A season by slug. Drafts are returned only when the request carries a valid staff session. */
export async function seasonForRequest(slug: string, request: Request, site?: SiteData) {
  const known = (site ?? (await siteData())).seasons.find((s) => s.slug === slug);
  if (known) return { season: known, preview: false };
  if (!(await isStaff(request))) return { season: null, preview: false };
  const row = await env.DB.prepare("SELECT * FROM seasons WHERE slug = ?").bind(slug).first<Season>();
  return { season: row ? withPhase(row) : null, preview: !!row };
}

async function isStaff(request: Request) {
  const m = /(?:^|;\s*)sr_session=([^;]+)/.exec(request.headers.get("Cookie") ?? "");
  if (!m) return false;
  const bytes = new TextEncoder().encode(decodeURIComponent(m[1]));
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const row = await env.DB.prepare("SELECT expires_at FROM staff_sessions WHERE token_hash = ?").bind(hash).first<{ expires_at: number }>();
  return !!row && row.expires_at > Date.now();
}
