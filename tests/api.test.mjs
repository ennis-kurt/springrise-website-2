#!/usr/bin/env node
// Exercises the Springrise API against a running dev server. No dependencies —
// uses Node's built-in fetch/FormData/Blob.
//
//   npx astro dev --port 4400 &
//   npx wrangler d1 migrations apply springrise --local
//   npx wrangler d1 execute springrise --local --file scripts/seed-demo.sql
//   node tests/api.test.mjs
//
// Set BASE_URL to point at a different dev server.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:4400";
const ORIGIN = new URL(BASE).origin;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Astro's built-in CSRF check (security.checkOrigin) requires the Origin header to
// match the request URL for any non-GET request with a form-like (or missing)
// Content-Type. A real browser sends this automatically for same-origin form
// posts; this plain Node script has to set it explicitly.
function postHeaders(extra = {}) {
  return { Origin: ORIGIN, ...extra };
}

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ok  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

function readAdminPassword() {
  const raw = readFileSync(path.join(ROOT, ".dev.vars"), "utf8");
  const match = /^ADMIN_PASSWORD=(.*)$/m.exec(raw);
  if (!match) throw new Error("ADMIN_PASSWORD not found in .dev.vars");
  return match[1].trim();
}

function uniqueEmail(tag) {
  return `sr-test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PDF_BYTES = "%PDF-1.4\n1 0 obj<< /Type /Catalog >>\nendobj\ntrailer<< /Root 1 0 R >>\n%%EOF\n";
function pdfBlob() {
  return new Blob([PDF_BYTES], { type: "application/pdf" });
}

function buildApplicationForm({ email, ref1Email, ref2Email, seasonId, badPdf = false }) {
  const form = new FormData();
  const fields = {
    seasonId,
    firstName: "Test",
    lastName: "Applicant",
    email,
    phone: "5551234567",
    birthday: "2000-01-01",
    country: "United States",
    address: "123 Main St",
    city: "Denville",
    region: "NJ",
    postalCode: "07834",
    institution: "Test University",
    studyLevel: "Undergraduate",
    major: "Computer Science",
    tuitionAmount: "1500.00",
    tuitionDeadline: "2026-12-01",
    reference1Name: "Ref One",
    reference1Email: ref1Email,
    reference1Phone: "5551112222",
    reference1Relationship: "Teacher",
    reference2Name: "Ref Two",
    reference2Email: ref2Email,
    reference2Phone: "5553334444",
    reference2Relationship: "Counselor",
    consent: "yes",
  };
  for (const [key, value] of Object.entries(fields)) form.set(key, value);

  const docKeys = ["resume", "transcript", "enrollment", "statement", "tuition"];
  for (const key of docKeys) {
    if (badPdf && key === "resume") {
      form.set(key, new Blob(["not actually a pdf"], { type: "application/pdf" }), "resume.pdf");
    } else {
      form.set(key, pdfBlob(), `${key}.pdf`);
    }
  }
  return form;
}

function extractCookie(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")];
  for (const entry of raw) {
    if (entry && entry.startsWith("sr_staff=")) return entry.split(";")[0];
  }
  return null;
}

async function main() {
  console.log(`Testing against ${BASE}\n`);

  // --- GET /api/seasons/current ------------------------------------------
  const currentRes = await fetch(`${BASE}/api/seasons/current`);
  const currentBody = await currentRes.json();
  ok("GET /api/seasons/current -> 200", currentRes.status === 200, currentRes.status);
  ok("season is currently open (run scripts/seed-demo.sql first)", currentBody.season && currentBody.season.state === "open", currentBody);
  if (!currentBody.season) {
    console.log("\nNo open season found — apply migrations and scripts/seed-demo.sql, then re-run.");
    process.exit(1);
  }
  const seasonId = currentBody.season.slug;

  // --- POST /api/applications ---------------------------------------------
  const applicantEmail = uniqueEmail("applicant");
  const idempotencyKey = crypto.randomUUID();
  const form1 = buildApplicationForm({
    email: applicantEmail,
    ref1Email: uniqueEmail("ref1"),
    ref2Email: uniqueEmail("ref2"),
    seasonId,
  });
  const submitRes = await fetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: postHeaders({ "Idempotency-Key": idempotencyKey }),
    body: form1,
  });
  const submitBody = await submitRes.json();
  ok("POST /api/applications -> 201", submitRes.status === 201, { status: submitRes.status, body: submitBody });
  ok("response has reference/email/season/submittedAt", !!(submitBody.reference && submitBody.email && submitBody.season && submitBody.submittedAt), submitBody);
  const reference = submitBody.reference;

  // Duplicate: same email, same season, different idempotency key -> 409.
  const dupForm = buildApplicationForm({
    email: applicantEmail,
    ref1Email: uniqueEmail("ref1b"),
    ref2Email: uniqueEmail("ref2b"),
    seasonId,
  });
  const dupRes = await fetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: postHeaders({ "Idempotency-Key": crypto.randomUUID() }),
    body: dupForm,
  });
  ok("duplicate email for season -> 409", dupRes.status === 409, dupRes.status);

  // Idempotent replay: same Idempotency-Key -> 200, same reference, no new row created.
  const replayForm = buildApplicationForm({
    email: applicantEmail,
    ref1Email: uniqueEmail("ref1"),
    ref2Email: uniqueEmail("ref2"),
    seasonId,
  });
  const replayRes = await fetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: postHeaders({ "Idempotency-Key": idempotencyKey }),
    body: replayForm,
  });
  const replayBody = await replayRes.json();
  ok("idempotent replay -> 200", replayRes.status === 200, replayRes.status);
  ok("idempotent replay returns same reference", replayBody.reference === reference, { got: replayBody.reference, want: reference });

  // Bad PDF -> 400.
  const badForm = buildApplicationForm({
    email: uniqueEmail("badpdf"),
    ref1Email: uniqueEmail("ref1"),
    ref2Email: uniqueEmail("ref2"),
    seasonId,
    badPdf: true,
  });
  const badRes = await fetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: postHeaders({ "Idempotency-Key": crypto.randomUUID() }),
    body: badForm,
  });
  ok("invalid PDF content -> 400", badRes.status === 400, badRes.status);

  // --- POST /api/applications/status ---------------------------------------
  const statusRes = await fetch(`${BASE}/api/applications/status`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reference, email: applicantEmail }),
  });
  const statusBody = await statusRes.json();
  ok("POST /api/applications/status -> 200", statusRes.status === 200, statusRes.status);
  ok("status lookup returns 'received'", statusBody.status === "received" && statusBody.statusLabel === "Received", statusBody);

  const badStatusRes = await fetch(`${BASE}/api/applications/status`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ reference: "SR-XXX-000000", email: applicantEmail }),
  });
  ok("status lookup with wrong reference -> 404", badStatusRes.status === 404, badStatusRes.status);

  // --- POST /api/contact ----------------------------------------------------
  const contactRes = await fetch(`${BASE}/api/contact`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: "Test Contact",
      email: uniqueEmail("contact"),
      topic: "general",
      message: "This is a test message from the automated API test suite.",
    }),
  });
  const contactBody = await contactRes.json();
  ok("POST /api/contact -> 201 { ok: true }", contactRes.status === 201 && contactBody.ok === true, { status: contactRes.status, body: contactBody });

  const honeypotRes = await fetch(`${BASE}/api/contact`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name: "Bot", website: "http://spam.example" }),
  });
  const honeypotBody = await honeypotRes.json();
  ok("contact honeypot -> 200 { ok: true } without saving", honeypotRes.status === 200 && honeypotBody.ok === true, { status: honeypotRes.status, body: honeypotBody });

  // --- POST /api/subscribe ---------------------------------------------------
  const subscribeEmail = uniqueEmail("subscribe");
  const subscribeRes = await fetch(`${BASE}/api/subscribe`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: subscribeEmail, source: "test" }),
  });
  const subscribeBody = await subscribeRes.json();
  ok("POST /api/subscribe -> 200 { ok: true }", subscribeRes.status === 200 && subscribeBody.ok === true, { status: subscribeRes.status, body: subscribeBody });

  const subscribeAgainRes = await fetch(`${BASE}/api/subscribe`, {
    method: "POST",
    headers: postHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email: subscribeEmail }),
  });
  ok("duplicate subscribe is idempotent -> 200", subscribeAgainRes.status === 200, subscribeAgainRes.status);

  // --- Unauthenticated admin access ------------------------------------------
  const noAuthPageRes = await fetch(`${BASE}/admin`, { redirect: "manual" });
  ok(
    "GET /admin without session -> 303 to /admin/login",
    noAuthPageRes.status === 303 && (noAuthPageRes.headers.get("location") || "").startsWith("/admin/login"),
    { status: noAuthPageRes.status, location: noAuthPageRes.headers.get("location") },
  );

  const noAuthApiRes = await fetch(`${BASE}/api/admin/export/applications.csv`);
  ok("GET /api/admin/... without session -> 401", noAuthApiRes.status === 401, noAuthApiRes.status);

  // --- Admin login ------------------------------------------------------------
  const adminPassword = readAdminPassword();
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: postHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ password: adminPassword, next: "/admin" }),
  });
  const cookie = extractCookie(loginRes);
  ok("admin login -> 303 with session cookie", loginRes.status === 303 && !!cookie, { status: loginRes.status, cookie });

  const badLoginRes = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    redirect: "manual",
    headers: postHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ password: "definitely-wrong-password", next: "/admin" }),
  });
  ok(
    "admin login with wrong password -> 303 to /admin/login?error=1",
    badLoginRes.status === 303 && (badLoginRes.headers.get("location") || "").includes("/admin/login?error=1"),
    badLoginRes.headers.get("location"),
  );

  if (!cookie) {
    console.log("\nCould not obtain a staff session; skipping authenticated checks.");
    printSummary();
    return;
  }

  const overviewRes = await fetch(`${BASE}/admin`, { headers: { Cookie: cookie } });
  ok("GET /admin with session -> 200", overviewRes.status === 200, overviewRes.status);

  // --- CSV export contains the reference --------------------------------------
  const csvRes = await fetch(`${BASE}/api/admin/export/applications.csv?season=${encodeURIComponent(seasonId)}`, {
    headers: { Cookie: cookie },
  });
  const csvText = await csvRes.text();
  ok("applications CSV export -> 200 text/csv", csvRes.status === 200 && (csvRes.headers.get("content-type") || "").includes("text/csv"), csvRes.status);
  ok("applications CSV contains our reference", csvText.includes(reference), reference);

  // --- Document download --------------------------------------------------------
  const listHtml = await (await fetch(`${BASE}/admin/applications?q=${encodeURIComponent(reference)}`, { headers: { Cookie: cookie } })).text();
  const appIdMatch = /\/admin\/applications\/([a-f0-9-]{36})/.exec(listHtml);
  ok("found application detail link in admin list", !!appIdMatch, listHtml.slice(0, 200));

  if (appIdMatch) {
    const detailHtml = await (await fetch(`${BASE}${appIdMatch[0]}`, { headers: { Cookie: cookie } })).text();
    const docIdMatch = /\/api\/admin\/documents\/([a-f0-9-]{36})/.exec(detailHtml);
    ok("found a document link on the application page", !!docIdMatch, detailHtml.slice(0, 200));
    if (docIdMatch) {
      const docRes = await fetch(`${BASE}${docIdMatch[0]}`, { headers: { Cookie: cookie } });
      ok(
        "GET /api/admin/documents/:id -> 200 application/pdf",
        docRes.status === 200 && (docRes.headers.get("content-type") || "").includes("application/pdf"),
        docRes.status,
      );
    }
  }

  // --- Logout --------------------------------------------------------------------
  const logoutRes = await fetch(`${BASE}/api/admin/logout`, { method: "POST", redirect: "manual", headers: postHeaders({ Cookie: cookie }) });
  ok("POST /api/admin/logout -> 303 to /admin/login", logoutRes.status === 303 && (logoutRes.headers.get("location") || "") === "/admin/login", logoutRes.status);

  printSummary();
}

function printSummary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
