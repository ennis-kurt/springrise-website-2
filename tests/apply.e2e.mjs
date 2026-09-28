// Real-browser test of the scholarship application.
// Usage: node tests/apply.e2e.mjs [baseUrl] [season]   (needs an open season: npm run db:demo)
// Set CHROMIUM_PATH to use a preinstalled Chromium; SHOTS=dir to save screenshots.
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:4321";
const SEASON = process.argv[3] ?? "spring-2027";
const run = Date.now().toString(36);
const email = `deniz.${run}@example.com`;
const pdf = (n) => ({ name: `${n}.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n%${n}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`) });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1320, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const ok = (c, m) => { console.log(c ? "✓" : "✗", m); if (!c) failed++; };
const ready = () => page.waitForSelector("astro-island:not([ssr])", { state: "attached", timeout: 20000 });
const next = async (name) => { await page.getByRole("button", { name }).click(); await page.waitForTimeout(250); };

try {
  await page.goto(`${BASE}/scholarships/${SEASON}/apply`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await ready();

  await next(/Next: Your studies/);
  ok((await page.locator(".field__error").count()) > 0, "empty chapter shows inline errors");

  await page.fill("#q-firstName", "Deniz");
  await page.fill("#q-lastName", `Aydın-${run}`);
  await page.fill("#q-email", email);
  await page.fill("#q-phone", "(201) 555-0187");
  await page.fill("#q-birthDate", "2004-03-11");
  await page.fill("#q-address1", "48 Orchard Street");
  await page.fill("#q-city", "Clifton");
  await page.selectOption("#q-state", "NJ");
  await page.fill("#q-postalCode", "07011");
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "networkidle" });
  await ready();
  await page.waitForTimeout(400);
  ok((await page.inputValue("#q-city")) === "Clifton", "draft survives a reload");
  await next(/Next: Your studies/);

  await page.fill("#q-school", "Montclair State University");
  await page.locator(".ap-choice", { hasText: "Undergraduate" }).click();
  await page.fill("#q-major", "Biology");
  await page.locator(".ap-calc input").nth(0).fill("7300");
  await page.locator(".ap-calc input").nth(1).fill("2100");
  await page.getByRole("button", { name: "Use this" }).click();
  ok((await page.inputValue("#q-tuitionAmount")) === "5200", "calculator fills the tuition request");
  await page.fill("#q-tuitionDueDate", "2027-01-15");
  await next(/Next: Your people/);

  for (const n of [1, 2]) {
    await page.fill(`#q-ref${n}Name`, n === 1 ? "Prof. Selin Arslan" : "Jordan Blake");
    await page.fill(`#q-ref${n}Relation`, n === 1 ? "Professor" : "Manager");
    await page.fill(`#q-ref${n}Email`, `ref${n}.${run}@example.org`);
    await page.fill(`#q-ref${n}Phone`, `973-555-01${n}9`);
  }
  await next(/Next: Documents/);

  await page.setInputFiles("#file-resume", { name: "resume.docx", mimeType: "application/msword", buffer: Buffer.from("nope") });
  ok((await page.locator(".ap-drop.has-err").count()) === 1, "non-PDF is rejected");
  for (const k of ["resume", "transcript", "enrollment", "statement", "tuitionBill"]) await page.setInputFiles(`#file-${k}`, pdf(k));
  await page.waitForTimeout(300);
  ok((await page.locator(".ap-drop.has-file").count()) === 5, "five PDFs attached");
  await next(/Next: Send/);

  ok((await page.locator(".ap-review").count()) === 4, "review shows all four sections");
  await page.check("#q-consent");
  await page.getByRole("button", { name: /Send my application/ }).click();
  await page.waitForSelector(".ap-ticket strong.mono", { timeout: 20000 });
  const code = (await page.textContent(".ap-ticket strong.mono"))?.trim();
  ok(/^[SFWU]\d{2}-[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code ?? ""), `submitted — reference ${code}`);
  if (process.env.SHOTS) { await page.waitForTimeout(2200); await page.screenshot({ path: `${process.env.SHOTS}/apply-done.png` }); }
  ok(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith("springrise-application"))), "draft cleared after sending");

  await page.goto(`${BASE}/scholarships/status`, { waitUntil: "networkidle" });
  await page.fill("#st-code", code);
  await page.fill("#st-email", email);
  await page.getByRole("button", { name: /Check status/ }).click();
  await page.waitForSelector("[data-result]:not([hidden])", { timeout: 10000 });
  ok((await page.textContent("[data-stage]"))?.includes("Received"), "status page shows 'Received'");
  ok(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  await browser.close();
  process.exitCode = failed ? 1 : 0;
}
