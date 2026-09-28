// Outline text into SVG path data with fontkit (variable instances, kerning, tracking).
// The fonts are the site's own self-hosted woff2 files, decoded once into .cache/ (fontkit reads TTF).
import * as fontkit from "fontkit";
import { decompress } from "wawoff2";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..");
const CACHE = join(here, ".cache");
mkdirSync(CACHE, { recursive: true });

async function open(name, woff2) {
  const ttf = join(CACHE, name);
  if (!existsSync(ttf)) writeFileSync(ttf, await decompress(readFileSync(join(ROOT, "node_modules/@fontsource-variable", woff2))));
  return fontkit.openSync(ttf);
}
const fraunces = await open("Fraunces-full.ttf", "fraunces/files/fraunces-latin-full-normal.woff2");
const inter = await open("Inter-wght.ttf", "inter/files/inter-latin-wght-normal.woff2");

const f2 = (n) => Number(n.toFixed(2));

// Convert a fontkit path (font units, y up) into SVG path data at scale s, translated to (x, baseline).
function pathToSvg(path, s, x, baseline) {
  let d = "";
  for (const c of path.commands) {
    const a = c.args;
    switch (c.command) {
      case "moveTo": d += `M${f2(x + a[0] * s)} ${f2(baseline - a[1] * s)}`; break;
      case "lineTo": d += `L${f2(x + a[0] * s)} ${f2(baseline - a[1] * s)}`; break;
      case "quadraticCurveTo": d += `Q${f2(x + a[0] * s)} ${f2(baseline - a[1] * s)} ${f2(x + a[2] * s)} ${f2(baseline - a[3] * s)}`; break;
      case "bezierCurveTo": d += `C${f2(x + a[0] * s)} ${f2(baseline - a[1] * s)} ${f2(x + a[2] * s)} ${f2(baseline - a[3] * s)} ${f2(x + a[4] * s)} ${f2(baseline - a[5] * s)}`; break;
      case "closePath": d += "Z"; break;
    }
  }
  return d;
}

/**
 * Lay out `text` at `size` px. Returns { d, width, glyphs:[{name, x, adv, bbox}], metrics }.
 * tracking is in em. features: fontkit feature list (e.g. ["kern"]).
 */
export function outline({ font = "fraunces", text, size, vars = {}, tracking = 0, features, x = 0, baseline = 0 }) {
  const base = font === "fraunces" ? fraunces : inter;
  const v = Object.keys(vars).length ? base.getVariation(vars) : base;
  const run = features ? v.layout(text, features) : v.layout(text);
  const s = size / v.unitsPerEm;
  let cx = x;
  let d = "";
  const glyphs = [];
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    const gx = cx + p.xOffset * s;
    d += pathToSvg(g.path, s, gx, baseline - p.yOffset * s);
    const b = g.bbox;
    glyphs.push({ name: g.name, x: gx, adv: p.xAdvance * s, bbox: { minX: gx + b.minX * s, maxX: gx + b.maxX * s, minY: baseline - b.maxY * s, maxY: baseline - b.minY * s }, path: g.path, s });
    cx += p.xAdvance * s + tracking * size;
  });
  const width = cx - x - tracking * size;
  const m = { cap: v.capHeight * s, xh: v.xHeight * s, asc: v.ascent * s, desc: -v.descent * s };
  return { d, width, glyphs, metrics: m, size };
}

/** Bounding box of the contour(s) of a glyph above a given font-unit y (used to find the dot of an i). */
export function contourAbove(glyph, yMin) {
  let cur = null; const contours = [];
  for (const c of glyph.path.commands) {
    if (c.command === "moveTo") { cur = { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 }; contours.push(cur); }
    if (!cur) continue;
    const a = c.args;
    for (let i = 0; i + 1 < a.length; i += 2) { cur.minX = Math.min(cur.minX, a[i]); cur.maxX = Math.max(cur.maxX, a[i]); cur.minY = Math.min(cur.minY, a[i + 1]); cur.maxY = Math.max(cur.maxY, a[i + 1]); }
  }
  return contours.find((c) => c.minY > yMin) ?? null;
}
