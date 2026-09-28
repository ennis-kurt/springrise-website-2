// Render an HTML string to PNG with the repo's Playwright and Chromium (CHROMIUM_PATH overrides the executable).
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "springrise-brand-"));
let browser;
async function get() {
  browser ??= await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  return browser;
}

/** Write `html` to a temp file and screenshot it. omit: transparent background; fullPage: whole document. */
export async function render(html, out, { w, h, scale = 1, omit = false, fullPage = false }) {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  const page = await (await get()).newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out, omitBackground: omit, fullPage });
  await page.close();
  console.log("wrote", out);
}

export async function close() { await browser?.close(); }
