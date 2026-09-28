/// <reference types="astro/client" />

declare namespace Cloudflare {
  interface Env {
    /** D1 database (migrations/). */
    DB: D1Database;
    /** R2 bucket for application PDFs. */
    FILES: R2Bucket;
    /** Static assets binding added by the adapter. */
    ASSETS: Fetcher;
    /** Shared staff password (secret, ≥ 16 chars). */
    ADMIN_PASSWORD?: string;
    /** Public origin, e.g. https://springrise.org (no trailing slash). */
    SITE_URL?: string;
    /** Optional: enables email through Resend. */
    RESEND_API_KEY?: string;
    /** Optional: sender, e.g. "Springrise Foundation <no-reply@springrise.org>". */
    EMAIL_FROM?: string;
    /** Optional: where new-application notices go (default scholarship@springrise.org). */
    STAFF_EMAIL?: string;
    /** Optional: HMAC key for unsubscribe links (falls back to a key derived from ADMIN_PASSWORD). */
    SIGNING_SECRET?: string;
  }
}

interface Env extends Cloudflare.Env {}

declare namespace App {
  interface Locals {
    /** True when the request carries a valid staff session cookie. */
    staff: boolean;
  }
}
