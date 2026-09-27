# Springrise Foundation — website

A complete redesign of [springrise.org](https://springrise.org) for **Springrise Foundation**, a New Jersey 501(c)(3)
that supports students of Turkish descent in U.S. higher education with seasonal tuition scholarships, mentorship,
partnerships and advocacy.

It is both a public website and a small scholarship-management platform. Staff can **announce seasonal
scholarships**, and applicants can **apply online** with PDFs. Staff then **review, track and export** applications.

![Home page](docs/screenshots/home.png)

## Design

The visual identity comes from the foundation's name and heritage:

- **The mark** is an İznik-style tulip rising from a sun on the horizon. The tulip stands for spring and for
  Turkish heritage, the sun for *rise*, and the horizon for the ground students stand on.
- **Colour** comes from İznik ceramics: cobalt, Turkish turquoise and bole red on warm paper, with deep night-cobalt
  sections and a saffron sun.
- **Type**: *Instrument Serif* for editorial display headlines, each with an italic accent phrase. *Geist* is used for
  text and *Geist Mono* for small labels. All fonts are self-hosted (no third-party requests) and cover Turkish
  characters.
- **Signature shapes**: arched windows (a nod to Ottoman arcades and to doorways into education), a tulip-lattice
  tile pattern, and a sun that rises through the pages. On the home page the sun travels its arc as you scroll.
- **Motion** is quiet and purposeful: line-by-line headline reveals, scroll reveals and a news ticker. It respects
  `prefers-reduced-motion`.

## What's included

**Public site**: Home, About, Scholarships (landing, per-season pages and the application), Application status
lookup, Get involved, Donate, Contact, Privacy, a custom 404 page, `sitemap.xml`, `robots.txt`, Open Graph image and
structured data (schema.org `NGO`). Legacy Wix URLs (`/about-4`, `/blank-2`, `/event-details-registration/*`, and
others) redirect with 301s.

**Seasonal scholarships**
- Each season (e.g. *Spring 2027*) has an opening time, a closing time, an optional decision date, an announcement,
  and optional season-specific eligibility and requirements. When those are blank, the verified defaults from the
  current springrise.org listing apply.
- The site announces the featured season everywhere: a live status pill in the header, the home-page season card
  with a countdown, the news ticker, the scholarships page and the season page with its window progress bar.
- Opening and closing happen automatically at the configured times, and the server enforces them.
- Drafts are never public. Archived seasons stay visible as history.

**The application** (`/scholarships/<season>/apply`) is a guided five-step form:
1. About you: name, contact details, date of birth, mailing address.
2. Study and tuition: institution, level, major, and the requested tuition amount (with a built-in
   *owed − other aid* calculator) and payment deadline.
3. References: two non-relatives.
4. Documents: resume, transcript, enrollment verification, personal statement and tuition statement (all required),
   plus optional disability documentation. Drag and drop is supported. Files must be real PDFs of 5 MB or less.
5. Review and submit, with a declaration. An upload progress bar shows while sending. The applicant then gets a
   reference number, a downloadable receipt and a printable confirmation.

Drafts save automatically on the applicant's device, including the PDFs (stored in IndexedDB), so applicants can
close the tab and come back later. Validation runs on both client and server. Other protections: one application per
email per season, idempotent resubmits, rate limits and a honeypot on public forms. `?preview=1` lets anyone explore
the form when a season isn't open. Nothing is submitted in preview mode.

These fields follow the foundation's existing Wix questionnaire. The redesign also adds the institution, level of
study, major and reference relationship, which help reviewers. The semester is bound to the season, which prevents
the mismatched-semester errors found on the old form.

**Staff workspace** (`/admin`, password-protected):
- An overview showing the current season, counts by status and recent applications.
- Seasons: create, edit, publish, archive, and announce a new season.
- Applications: filter and search, open a full application, view each PDF, set the status (received → under review →
  needs information → awarded / not awarded / withdrawn), record the award amount and private notes, see an audit
  timeline and email the applicant.
- Messages from the contact forms, and the season-alert subscriber list.
- CSV exports for applications, messages and subscribers. Cells are protected against formula injection.

## Tech

- [Astro 7](https://astro.build) with server rendering on **Cloudflare Workers** (`@astrojs/cloudflare`).
- **Cloudflare D1** (SQLite) holds seasons, applications, messages, subscribers, staff sessions and rate limits.
- **Cloudflare R2** stores the private application PDFs.
- **Preact** powers the one interactive island (the application form). Everything else is HTML and CSS with tiny
  inline scripts.
- Security: strict CSP and security headers. Staff sessions are HttpOnly, SameSite=Strict cookies that store only a
  hashed token server-side. All SQL is parameterized. Origin checks guard form posts. Admin and API responses are set
  to `noindex` and `no-store`.

```
src/
  components/          UI (Header, Footer, Mark, SeasonCard, PageHero, CtaBand, TilePattern, Icon…)
  components/apply/    ApplicationForm.tsx — the application island
  components/admin/    staff workspace components
  layouts/             BaseLayout (public), AdminLayout (staff)
  lib/                 content.ts (verified facts), seasons.ts (season logic), site.ts (public queries)
  lib/server/          db, auth, validation, rate limiting, CSV, time-zone helpers
  middleware.ts        redirects, security headers, staff guard
  pages/               routes (public pages, /admin, /api)
  styles/              tokens.css, global.css, apply.css, admin.css
migrations/            D1 schema + seed (real season history; Spring 2027 as a draft)
scripts/seed-demo.sql  local-only: opens Spring 2027 so you can try the full flow
tests/                 api.test.mjs (API) and e2e-apply.mjs (browser end-to-end)
```

## Run it locally

```sh
npm install
npm run db:migrate            # create the local D1 database
npm run db:seed-demo          # optional: open Spring 2027 locally so you can apply
echo 'ADMIN_PASSWORD=choose-a-long-local-password' > .dev.vars
npm run dev                   # http://localhost:4321  ·  staff: http://localhost:4321/admin
```

Tests (with the dev server running and the demo season open):

```sh
npm run test:api              # API contract, validation, auth, exports
npm run test:e2e              # real-browser application flow (Playwright + Chromium)
```

## Deploy to Cloudflare

```sh
npx wrangler login
npx wrangler d1 create springrise                 # copy the database_id into wrangler.jsonc
npx wrangler r2 bucket create springrise-documents
npm run db:migrate:remote
npx wrangler secret put ADMIN_PASSWORD             # at least 16 characters
npm run deploy
```

Then add `springrise.org` as a custom domain on the Worker, in the Cloudflare dashboard under Workers → springrise →
Settings → Domains.

## Running the scholarship season (staff)

See **[docs/STAFF-GUIDE.md](docs/STAFF-GUIDE.md)**. In short: in `/admin`, open **Seasons**, then create the season or
edit the Spring 2027 draft. Set the dates (Eastern Time), write the announcement and save it as **Published**. The
site announces the season right away and opens applications automatically at the start time.

## Content and honesty

Every fact on the site comes from the current springrise.org: the mission, programs, eligibility, award terms,
contact details, Zelle and Benevity giving, and the season history since Spring 2024. No statistics, testimonials,
names or dollar amounts were invented. Photographs are illustrative stock images from Pexels (free licence), shown
with a new art-directed treatment. They are not claims about actual recipients:
[George Pak](https://www.pexels.com/photo/three-young-people-studying-together-outdoors-with-laptops-7972948/),
[Charlotte May](https://www.pexels.com/photo/serious-students-taking-notes-at-table-5965699/),
[Yan Krukau](https://www.pexels.com/photo/professor-helping-student-at-university-8199146/).
