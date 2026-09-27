// End-to-end: fill and submit a scholarship application in a real browser.
// Usage: node tests/e2e-apply.mjs [baseUrl] [seasonSlug]
// Requires an OPEN season (locally: npm run db:seed-demo) and Chromium for Playwright.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4321";
const SLUG = process.argv[3] ?? "spring-2027";
const run = Date.now().toString(36);
const pdf = (name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n% ${name}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const hydrated = () => page.waitForSelector("astro-island:not([ssr])", { state: "attached", timeout: 20000 });
const step = async (label) => { await page.getByRole("button", { name: label }).click(); await page.waitForTimeout(250); };
const assert = (cond, msg) => { if (!cond) { console.error("✗", msg); process.exitCode = 1; throw new Error(msg); } console.log("✓", msg); };

try {
  await page.goto(`${BASE}/scholarships/${SLUG}/apply`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await hydrated();

  // Validation blocks an empty step
  await step(/Continue to study/);
  assert(await page.locator(".field__error").count() > 0, "empty step shows inline errors");

  // Step 1
  await page.fill("#f-firstName", "Ayşe");
  await page.fill("#f-lastName", `Tester-${run}`);
  await page.fill("#f-email", `ayse.${run}@example.com`);
  await page.fill("#f-phone", "(973) 555-0142");
  await page.fill("#f-birthday", "2004-05-17");
  await page.fill("#f-address", "12 Maple Avenue");
  await page.fill("#f-city", "Paterson");
  await page.selectOption("#f-region", "NJ");
  await page.fill("#f-postalCode", "07501");

  // Draft survives a reload
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "networkidle" });
  await hydrated();
  await page.waitForTimeout(400);
  assert((await page.inputValue("#f-city")) === "Paterson", "draft restored after reload");
  await step(/Continue to study/);

  // Step 2
  await page.fill("#f-institution", "Rutgers University–Newark");
  await page.locator(".choice", { hasText: "Undergraduate" }).click();
  await page.fill("#f-major", "Computer Science");
  await page.locator(".calc input").nth(0).fill("6200");
  await page.locator(".calc input").nth(1).fill("1450");
  await page.getByRole("button", { name: "Use this amount" }).click();
  assert((await page.inputValue("#f-tuitionAmount")) === "4750", "tuition calculator fills the request");
  await page.fill("#f-tuitionDeadline", "2027-01-20");
  await step(/Continue to references/);

  // Step 3
  for (const n of [1, 2]) {
    await page.fill(`#f-reference${n}Name`, n === 1 ? "Dr. Elif Kaya" : "Marcus Reed");
    await page.fill(`#f-reference${n}Relationship`, n === 1 ? "Professor" : "Supervisor");
    await page.fill(`#f-reference${n}Email`, `ref${n}.${run}@example.org`);
    await page.fill(`#f-reference${n}Phone`, `201-555-01${n}0`);
  }
  await step(/Continue to documents/);

  // Step 4 — a non-PDF is rejected, then real PDFs are accepted
  await page.setInputFiles("#file-resume", { name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  assert(await page.locator(".drop.has-error").count() === 1, "non-PDF rejected");
  for (const key of ["resume", "transcript", "enrollment", "statement", "tuition"]) {
    await page.setInputFiles(`#file-${key}`, pdf(`${key}.pdf`));
  }
  await page.waitForTimeout(300);
  assert(await page.locator(".drop.has-file").count() === 5, "five PDFs attached");
  await step(/Continue to review/);

  // Step 5
  assert(await page.locator(".review").count() === 4, "review shows four sections");
  await page.check("#f-consent");
  await page.getByRole("button", { name: /Submit application/ }).click();
  await page.waitForSelector(".receipt__ref", { timeout: 20000 });
  const ref = (await page.textContent(".receipt__ref"))?.trim();
  assert(/^SR-[A-Z]\d{2}-[A-Z0-9]{6}$/.test(ref ?? ""), `submitted with reference ${ref}`);
  assert(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("springrise-draft")).length === 0), "draft cleared after submit");

  // Status lookup
  await page.goto(`${BASE}/scholarships/status`, { waitUntil: "networkidle" });
  const res = await page.evaluate(async ([reference, email]) => {
    const r = await fetch("/api/applications/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, email }) });
    return { status: r.status, body: await r.json() };
  }, [ref, `ayse.${run}@example.com`]);
  assert(res.status === 200 && res.body.status === "received", "status lookup returns 'received'");

  assert(errors.length === 0, `no page errors${errors.length ? ": " + errors.join("; ") : ""}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
