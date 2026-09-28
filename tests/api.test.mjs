#!/usr/bin/env node
// Springrise API + staff smoke test. Dependency-free (Node ≥ 22).
//
//   npx wrangler d1 migrations apply springrise --local
//   npx wrangler d1 execute springrise --local --file scripts/demo-open-season.sql
//   npx astro dev --port 4400 --ignore-lock        # in another terminal
//   node tests/api.test.mjs [baseUrl]              # or BASE_URL=… node tests/api.test.mjs
//
// Every run uses a unique fake client IP ("test-<run>") and unique emails, so runs never
// trip each other's rate limits. Against a localhost server, the throttle rows this run
// created are deleted at the end (set KEEP_THROTTLE=1 to skip). Manual cleanup:
//   npx wrangler d1 execute springrise --local --command "DELETE FROM throttle WHERE who LIKE 'test-%'"

import { createHmac, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL || process.argv[2] || "http://localhost:4400").replace(/\/+$/, "");
const RUN = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IP = `test-${RUN}`;

function devVars() {
  try {
    return Object.fromEntries(
      readFileSync(path.join(ROOT, ".dev.vars"), "utf8")
        .split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
}
const VARS = { ...devVars(), ...process.env };
const PASSWORD = VARS.ADMIN_PASSWORD || "";

// ---------- tiny harness ----------
let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${err?.message ?? err}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const eq = (a, b, msg) => assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

let cookie = "";
async function req(p, { method = "GET", headers = {}, body, json, form, staff = false } = {}) {
  const h = { "CF-Connecting-IP": IP, Origin: BASE, ...headers };
  if (json !== undefined) {
    h["Content-Type"] = "application/json";
    h.Accept ??= "application/json";
    body = JSON.stringify(json);
  } else if (form !== undefined) {
    h["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (staff && cookie) h.Cookie = cookie;
  const res = await fetch(BASE + p, { method, headers: h, body, redirect: "manual" });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  return { res, status: res.status, text, data, headers: res.headers };
}

// ---------- fixtures ----------
const DOCS = ["resume", "transcript", "enrollment", "statement", "tuitionBill"];
const pdf = (label) =>
  new Blob(
    [`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n% ${label}\ntrailer<</Root 1 0 R>>\n%%EOF\n`],
    { type: "application/pdf" },
  );

function applicant(email, overrides = {}) {
  return {
    season: "spring-2027",
    firstName: "Deniz",
    lastName: `Test-${RUN}`,
    email,
    phone: "(973) 555-0142",
    birthDate: "2004-05-17",
    country: "United States",
    address1: "12 Example Street",
    address2: "Apt 3",
    city: "Newark",
    state: "NJ",
    postalCode: "07102",
    school: "Rutgers University",
    level: "Undergraduate",
    major: "Computer Science",
    tuitionAmount: "4750.50",
    tuitionDueDate: "2027-01-15",
    ref1Name: "Ayşe Professor",
    ref1Email: `ref1-${RUN}@example.org`,
    ref1Phone: "973-555-0100",
    ref1Relation: "Professor",
    ref2Name: "Mehmet Mentor",
    ref2Email: `ref2-${RUN}@example.org`,
    ref2Phone: "+1 973 555 0199",
    ref2Relation: "Supervisor",
    note: "Thank you for considering my application.",
    consent: "yes",
    ...overrides,
  };
}

function applyForm(fields, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const k of DOCS) {
    if (files[k] === null) continue;
    fd.append(k, files[k] ?? pdf(k), files[`${k}Name`] ?? `${k}.pdf`);
  }
  return fd;
}

const apply = (fields, key = `k-${RUN}-${randomBytes(6).toString("hex")}`, files) =>
  req("/api/apply", { method: "POST", body: applyForm(fields, files), headers: { "Idempotency-Key": key, Accept: "application/json" } });

// ---------- tests ----------
const email = `applicant-${RUN}@example.com`;
let code = "";
let applicationId = "";

console.log(`Springrise API tests → ${BASE} (run ${RUN})\n`);

console.log("Time zone helper");
await test("ET wall time → UTC across DST", async () => {
  let t;
  try {
    t = await import(path.join(ROOT, "src/lib/server/time.ts"));
  } catch (err) {
    console.log(`      (skipped: Node can't load TypeScript here — ${err.message.split("\n")[0]})`);
    return;
  }
  eq(t.etLocalToUtc("2026-09-01T09:00"), "2026-09-01T13:00:00.000Z", "EDT");
  eq(t.etLocalToUtc("2026-12-15T23:59"), "2026-12-16T04:59:00.000Z", "EST");
  eq(t.etLocalToUtc("2026-11-01T01:30"), "2026-11-01T05:30:00.000Z", "ambiguous fall-back → first (EDT)");
  eq(t.etLocalToUtc("2026-11-01T03:00"), "2026-11-01T08:00:00.000Z", "after fall-back");
  eq(t.etLocalToUtc("2027-03-14T02:30"), "2027-03-14T07:30:00.000Z", "spring-forward gap moves forward");
  eq(t.etLocalToUtc("2027-03-14T03:00"), "2027-03-14T07:00:00.000Z", "after spring-forward");
  eq(t.etLocalToUtc("2026-02-30T10:00"), null, "invalid date");
  eq(t.utcToEtLocal("2026-12-16T04:59:00.000Z"), "2026-12-15T23:59", "UTC → ET input value");
  eq(t.utcToEtLocal("2026-06-25T13:00:00.000Z"), "2026-06-25T09:00", "UTC → ET input value (summer)");
});

console.log("\nPublic endpoints");
await test("GET /api/season returns the spotlight season", async () => {
  const r = await req("/api/season");
  eq(r.status, 200, "status");
  assert(/max-age=60/.test(r.headers.get("cache-control") ?? ""), "cache-control public, max-age=60");
  eq(r.headers.get("x-content-type-options"), "nosniff", "nosniff header");
  eq(r.headers.get("x-frame-options"), "DENY", "frame header");
  assert(r.data?.season, "season present (did you run scripts/demo-open-season.sql?)");
  eq(r.data.season.slug, "spring-2027", "slug");
  eq(r.data.season.phase, "open", "phase");
  for (const k of ["title", "term", "year", "opens_at", "closes_at", "headline"]) assert(k in r.data.season, `has ${k}`);
});

await test("legacy URLs redirect 301", async () => {
  const a = await req("/donate");
  eq(a.status, 301, "status");
  eq(a.headers.get("location"), "/give", "location");
  const b = await req("/event-details-registration/spring-2025-scholarship");
  eq(b.status, 301, "status");
  eq(b.headers.get("location"), "/scholarships", "location");
});

const firstKey = `first-${RUN}`;
await test("POST /api/apply accepts a valid application (201)", async () => {
  const r = await apply(applicant(email), firstKey);
  eq(r.status, 201, `status (${r.text.slice(0, 200)})`);
  assert(/^S27-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{2}$/.test(r.data.code), `code format ${r.data.code}`);
  eq(r.data.email, email, "email");
  eq(r.data.season, "Spring 2027 Scholarship", "season title");
  assert(!Number.isNaN(Date.parse(r.data.submittedAt)), "submittedAt");
  code = r.data.code;
});

await test("replaying the same Idempotency-Key returns 200 with the same code", async () => {
  const r = await apply(applicant(email), firstKey);
  eq(r.status, 200, "status");
  eq(r.data.code, code, "code");
});

await test("a second application with the same email is 409", async () => {
  const r = await apply(applicant(email));
  eq(r.status, 409, "status");
  assert(/scholarship@springrise\.org/.test(r.data.error), "mentions scholarship@springrise.org");
});

await test("a non-PDF document is rejected (400)", async () => {
  const r = await apply(applicant(`nonpdf-${RUN}@example.com`), undefined, {
    transcript: new Blob(["just some text, not a pdf"], { type: "application/pdf" }),
  });
  eq(r.status, 400, "status");
  eq(r.data.field, "transcript", "field");
  const r2 = await apply(applicant(`nonpdf2-${RUN}@example.com`), undefined, { resumeName: "resume.docx" });
  eq(r2.status, 400, "status for .docx");
  eq(r2.data.field, "resume", "field");
});

await test("validation errors name the field", async () => {
  const r = await apply(applicant(`val-${RUN}@example.com`, { ref1Email: `val-${RUN}@example.com` }));
  eq(r.status, 400, "status");
  eq(r.data.field, "ref1Email", "field");
  const r2 = await apply(applicant(`val2-${RUN}@example.com`, { tuitionAmount: "12.345" }));
  eq(r2.data.field, "tuitionAmount", "field");
  const r3 = await apply(applicant(`val3-${RUN}@example.com`), "bad key!");
  eq(r3.status, 400, "missing/invalid idempotency key");
});

await test("a closed season is 409", async () => {
  const r = await apply(applicant(`closed-${RUN}@example.com`, { season: "fall-2026" }));
  eq(r.status, 409, "status");
  eq(r.data.error, "Applications for this season are closed.", "message");
});

await test("POST /api/status finds the application", async () => {
  const r = await req("/api/status", { method: "POST", json: { code: code.toLowerCase(), email: email.toUpperCase() } });
  eq(r.status, 200, "status");
  eq(r.data.code, code, "code");
  eq(r.data.stage, "received", "stage");
  eq(r.data.stageLabel, "Received", "label");
  eq(r.data.season, "Spring 2027 Scholarship", "season");
  for (const k of ["submittedAt", "updatedAt"]) assert(r.data[k], `has ${k}`);
});

await test("POST /api/status with the wrong email is a generic 404", async () => {
  const r = await req("/api/status", { method: "POST", json: { code, email: `nobody-${RUN}@example.com` } });
  eq(r.status, 404, "status");
  assert(typeof r.data.error === "string", "error message");
});

await test("POST /api/contact saves a message (201); honeypot is silently accepted", async () => {
  const msg = { name: "Test Person", email: `contact-${RUN}@example.com`, reason: "mentor", message: `Hello from test run ${RUN}. I'd like to mentor.` };
  const r = await req("/api/contact", { method: "POST", json: msg });
  eq(r.status, 201, `status (${r.text})`);
  eq(r.data.ok, true, "ok");
  const bot = await req("/api/contact", { method: "POST", json: { ...msg, company: "Spam LLC", message: `bot ${RUN} honeypot message` } });
  eq(bot.status, 200, "honeypot status");
  eq(bot.data.ok, true, "honeypot ok");
  const bad = await req("/api/contact", { method: "POST", json: { ...msg, reason: "sales" } });
  eq(bad.status, 400, "bad reason");
  eq(bad.data.field, "reason", "field");
  const html = await req("/api/contact", {
    method: "POST",
    form: { ...msg, message: `Form post without JS, run ${RUN}.` },
    headers: { Accept: "text/html,application/xhtml+xml", Referer: `${BASE}/contact?x=1` },
  });
  eq(html.status, 303, "no-JS form redirect");
  assert(/^\/contact\?x=1&sent=1$/.test(html.headers.get("location") ?? ""), `location ${html.headers.get("location")}`);
});

const subEmail = `sub-${RUN}@example.com`;
await test("POST /api/subscribe is idempotent", async () => {
  const a = await req("/api/subscribe", { method: "POST", json: { email: subEmail, source: "test" } });
  eq(a.status, 200, "first");
  eq(a.data.ok, true, "ok");
  const b = await req("/api/subscribe", { method: "POST", json: { email: subEmail.toUpperCase() } });
  eq(b.status, 200, "second");
  const bad = await req("/api/subscribe", { method: "POST", json: { email: "not-an-email" } });
  eq(bad.status, 400, "invalid email");
});

console.log("\nStaff guard & sign-in");
await test("staff pages redirect 303 and staff APIs return 401 when signed out", async () => {
  const p = await req("/staff/applications?season=spring-2027");
  eq(p.status, 303, "page status");
  eq(p.headers.get("location"), "/staff/sign-in?next=%2Fstaff%2Fapplications%3Fseason%3Dspring-2027", "location");
  eq(p.headers.get("x-robots-tag"), "noindex", "noindex");
  const a = await req("/api/staff/export/applications.csv");
  eq(a.status, 401, "api status");
  assert(a.data?.error, "json error");
  const s = await req("/staff/sign-in");
  eq(s.status, 200, "sign-in page is public");
});

await test("sign-in with the wrong password fails", async () => {
  const r = await req("/api/staff/sign-in", { method: "POST", json: { password: "definitely-not-the-password" } });
  eq(r.status, 401, "status");
  assert(!r.headers.getSetCookie().some((c) => c.startsWith("sr_session=") && !/sr_session=;/.test(c)), "no session cookie");
  const page = await req("/staff/sign-in", { method: "POST", form: { password: "nope" } });
  eq(page.status, 401, "page status");
  assert(/isn(’|'|&#39;)t right/.test(page.text), "page shows error");
});

await test("sign-in with the right password sets a secure session cookie", async () => {
  assert(PASSWORD.length >= 16, "ADMIN_PASSWORD (env or .dev.vars) must be set and ≥ 16 chars");
  const r = await req("/staff/sign-in", { method: "POST", form: { password: PASSWORD, next: "/staff/inquiries" } });
  eq(r.status, 303, "status");
  eq(r.headers.get("location"), "/staff/inquiries", "honours next");
  const c = r.headers.getSetCookie().find((x) => x.startsWith("sr_session="));
  assert(c, "cookie set");
  assert(/HttpOnly/i.test(c) && /SameSite=Strict/i.test(c) && /Path=\//.test(c) && /Max-Age=28800/.test(c), `cookie flags: ${c}`);
  cookie = c.split(";")[0];
  const j = await req("/api/staff/sign-in", { method: "POST", json: { password: PASSWORD } });
  eq(j.status, 200, "json sign-in");
});

console.log("\nStaff workspace");
await test("overview renders", async () => {
  const r = await req("/staff", { staff: true });
  eq(r.status, 200, "status");
  assert(r.text.includes("Spring 2027 Scholarship"), "shows spotlight season");
  assert(r.text.includes(code), "shows latest application");
  assert(/no-store/.test(r.headers.get("cache-control") ?? ""), "no-store");
});

await test("a draft season (created in ET) rejects applications with 409", async () => {
  const slug = `test-draft-${RUN}`.toLowerCase();
  const create = await req("/staff/seasons/new", {
    method: "POST",
    staff: true,
    form: {
      title: `Test Draft ${RUN}`, term: "Winter", year: "2027", slug, status: "draft",
      opens: "2026-09-01T09:00", closes: "2027-03-14T03:00", decision: "", headline: "Test only", announcement: "", eligibility: "", requirements: "",
    },
  });
  eq(create.status, 303, `create status (${create.text.slice(0, 120)})`);
  const edit = await req(`/staff/seasons/${slug}`, { staff: true });
  eq(edit.status, 200, "edit page");
  assert(edit.text.includes('value="2026-09-01T09:00"') && edit.text.includes('value="2027-03-14T03:00"'), "ET values round-trip");
  const r = await apply(applicant(`draft-${RUN}@example.com`, { season: slug }));
  eq(r.status, 409, "apply status");
  eq(r.data.error, "Applications for this season are closed.", "message");
  const bad = await req(`/staff/seasons/${slug}`, { method: "POST", staff: true, form: { action: "save", title: "X", term: "Winter", year: "2027", slug, status: "published", opens: "", closes: "" } });
  eq(bad.status, 400, "published without dates is rejected");
  assert(bad.text.includes("needs both an opening and a closing time"), "error shown");
  const del = await req(`/staff/seasons/${slug}`, { method: "POST", staff: true, form: { action: "delete" } });
  eq(del.status, 303, "delete draft");
});

await test("applications list, detail and stage update", async () => {
  const list = await req(`/staff/applications?season=spring-2027&q=${encodeURIComponent(code)}`, { staff: true });
  eq(list.status, 200, "list status");
  const m = list.text.match(/\/staff\/applications\/([0-9a-f-]{36})/);
  assert(m, "row link");
  applicationId = m[1];
  const detail = await req(`/staff/applications/${applicationId}`, { staff: true });
  eq(detail.status, 200, "detail status");
  assert(detail.text.includes(code) && detail.text.includes("$4,750.50"), "shows code and money");
  const upd = await req(`/staff/applications/${applicationId}`, {
    method: "POST", staff: true, form: { stage: "in_review", award: "", notes: "Looks complete." },
  });
  eq(upd.status, 303, "update status");
  const st = await req("/api/status", { method: "POST", json: { code, email } });
  eq(st.data.stage, "in_review", "stage visible to applicant");
});

await test("CSV export contains the application code", async () => {
  const r = await req("/api/staff/export/applications.csv?season=spring-2027", { staff: true });
  eq(r.status, 200, "status");
  assert((r.headers.get("content-type") ?? "").startsWith("text/csv"), "content-type");
  assert(r.text.includes(code), "has code");
  const i = await req("/api/staff/export/inquiries.csv", { staff: true });
  assert(i.text.includes(`contact-${RUN}@example.com`), "inquiries csv");
  assert(!i.text.includes(`bot ${RUN} honeypot`), "honeypot message was not saved");
  const s = await req("/api/staff/export/subscribers.csv", { staff: true });
  assert(s.text.includes(subEmail), "subscribers csv");
});

await test("attachments download inline as PDF", async () => {
  const detail = await req(`/staff/applications/${applicationId}`, { staff: true });
  const ids = [...detail.text.matchAll(/\/api\/staff\/files\/([0-9a-f-]{36})/g)].map((x) => x[1]);
  eq(new Set(ids).size, 5, "five documents");
  const f = await fetch(`${BASE}/api/staff/files/${ids[0]}`, { headers: { Cookie: cookie } });
  eq(f.status, 200, "status");
  eq(f.headers.get("content-type"), "application/pdf", "content-type");
  assert(/^inline; filename="Test-[\w-]+_Deniz_\w+\.pdf"$/.test(f.headers.get("content-disposition") ?? ""), `disposition ${f.headers.get("content-disposition")}`);
  const bytes = Buffer.from(await f.arrayBuffer());
  eq(bytes.subarray(0, 5).toString(), "%PDF-", "pdf bytes");
  const anon = await req(`/api/staff/files/${ids[0]}`);
  eq(anon.status, 401, "anonymous download blocked");
});

console.log("\nUnsubscribe");
await test("unsubscribe: GET confirms, POST removes", async () => {
  const key = VARS.SIGNING_SECRET
    ? Buffer.from(VARS.SIGNING_SECRET)
    : createHash("sha256").update(`springrise-unsubscribe-v1:${PASSWORD}`).digest();
  const t = createHmac("sha256", key).update(`unsubscribe:${subEmail}`).digest("hex").slice(0, 32);
  const url = `/unsubscribe?e=${encodeURIComponent(subEmail)}&t=${t}`;
  const bad = await req(`/unsubscribe?e=${encodeURIComponent(subEmail)}&t=${"0".repeat(32)}`);
  eq(bad.status, 400, "bad token");
  const get = await req(url);
  eq(get.status, 200, "GET status");
  assert(get.text.includes('data-action="confirm-unsubscribe"'), "confirm button");
  const still = await req(`/staff/subscribers?q=${encodeURIComponent(subEmail)}`, { staff: true });
  assert(still.text.includes(subEmail), "GET did not unsubscribe");
  const post = await req(url, { method: "POST", form: {} });
  eq(post.status, 200, "POST status");
  assert(post.text.includes('data-state="done"'), "done message");
  const gone = await req(`/staff/subscribers?q=${encodeURIComponent(subEmail)}`, { staff: true });
  assert(!gone.text.includes(`mailto:${subEmail}`), "subscriber removed");
});

console.log("\nSign-out");
await test("sign-out ends the session", async () => {
  const r = await req("/api/staff/sign-out", { method: "POST", staff: true, json: {} });
  eq(r.status, 200, "status");
  const after = await req("/staff", { staff: true });
  eq(after.status, 303, "session no longer valid");
});

// ---------- cleanup ----------
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
if (local && !process.env.KEEP_THROTTLE) {
  const r = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "springrise", "--local", "--command", `DELETE FROM throttle WHERE who = '${IP}'`],
    { cwd: ROOT, encoding: "utf8" },
  );
  console.log(r.status === 0 ? `\nCleaned up throttle rows for ${IP}.` : `\n(Could not clean throttle rows: ${r.stderr?.slice(0, 200)})`);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
