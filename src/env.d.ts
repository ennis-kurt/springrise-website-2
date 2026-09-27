/// <reference types="astro/client" />

// Cloudflare bindings, available via `import { env } from "cloudflare:workers"`.
// Declaration-merges into the ambient `Cloudflare.Env` interface that
// `@cloudflare/workers-types` defines (see its `cloudflare:workers` module).
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    DOCS: R2Bucket;
    ADMIN_PASSWORD: string;
    SITE_NAME: string;
    /** Optional transactional email (Resend). All of these are optional — see src/lib/server/email.ts. */
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    STAFF_NOTIFY_EMAIL?: string;
    CONTACT_NOTIFY_EMAIL?: string;
    SITE_URL?: string;
    EMAIL_SIGNING_SECRET?: string;
  }
}

// Astro locals set by src/middleware.ts.
declare namespace App {
  interface Locals {
    /** True when the current request carries a valid staff session. */
    staff: boolean;
  }
}
