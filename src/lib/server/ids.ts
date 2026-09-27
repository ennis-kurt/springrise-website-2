// Entity ids and the public-facing application reference code.
import { seasonCode } from "../seasons";
import type { Season } from "../seasons";

/** A random opaque id for a database row (applications, documents, messages, ...). */
export function randomId(): string {
  return crypto.randomUUID();
}

// Excludes visually-ambiguous characters: 0/O, 1/I/L.
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReferenceSuffix(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length];
  return out;
}

/**
 * Generates a unique application reference like `SR-S27-7KQ4XD`, retrying on
 * the rare unique-constraint collision.
 */
export async function generateReference(
  db: D1Database,
  season: Pick<Season, "term" | "year">,
): Promise<string> {
  const code = seasonCode(season);
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `SR-${code}-${randomReferenceSuffix()}`;
    const existing = await db
      .prepare("SELECT 1 FROM applications WHERE reference = ?")
      .bind(candidate)
      .first();
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique application reference.");
}
