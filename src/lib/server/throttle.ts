import { env } from "cloudflare:workers";
import { HttpError } from "./http";

export const LIMITS = {
  apply: { limit: 20, window: 3600 },
  status: { limit: 20, window: 3600 },
  contact: { limit: 10, window: 3600 },
  subscribe: { limit: 20, window: 3600 },
  signin: { limit: 10, window: 900 },
} as const;
export type Bucket = keyof typeof LIMITS;

/**
 * Fixed-window counter. Returns true while under the limit.
 * One upsert per call; old windows are pruned opportunistically.
 */
export async function allow(bucket: Bucket, who: string, now = Date.now()): Promise<boolean> {
  const { limit, window } = LIMITS[bucket];
  const win = Math.floor(now / 1000 / window);
  const row = await env.DB.prepare(
    `INSERT INTO throttle (bucket, who, window, hits) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT (bucket, who, window) DO UPDATE SET hits = hits + 1
     RETURNING hits`,
  )
    .bind(bucket, who.slice(0, 100), win)
    .first<{ hits: number }>();
  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM throttle WHERE bucket = ?1 AND window < ?2").bind(bucket, win - 1).run();
  }
  return (row?.hits ?? 0) <= limit;
}

export async function enforce(bucket: Bucket, who: string): Promise<void> {
  if (!(await allow(bucket, who))) {
    throw new HttpError(429, "Too many attempts from your connection. Please wait a little while and try again.");
  }
}
