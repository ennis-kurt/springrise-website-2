// Compose the Springrise lockups from the mark and the outlined wordmark.
// Units: the name is set at size 100 (cap height 70); everything else is relative to that.
import { writeFileSync, mkdirSync } from "node:fs";
import { yPath, leafPath, P, PS } from "./mark.mjs";
import { outline, contourAbove } from "./type.mjs";

export const C = {
  clay: "#b4502d", marigold: "#f0b44c", espresso: "#2b2320", bone: "#f7f1e7", paper: "#fffcf6",
  muted: "#5f534c", nightMuted: "#c4beb5", leaf: "#7f9f5c",
};

const NAME_VARS = { opsz: 36, wght: 560, SOFT: 50, WONK: 0 };
const f1 = (n) => Number(n.toFixed(1));

/** The outlined wordmark at name size `size`: returns paths and geometry relative to (0, baseline 0). */
export function wordmark(size = 100, { sub = true } = {}) {
  const name = outline({ text: "Springrıse", size, vars: NAME_VARS, tracking: -0.012, features: ["kern"] });
  const iGlyph = outline({ text: "i", size, vars: NAME_VARS, features: ["kern"] }).glyphs[0];
  const dot = contourAbove(iGlyph, 940);
  const g = name.glyphs[7]; // the dotless ı of "rise"
  const s = g.s;
  const sun = {
    cx: f1((g.bbox.minX + g.bbox.maxX) / 2),
    cy: f1(-((dot.minY + dot.maxY) / 2) * s - ((dot.maxY - dot.minY) / 2) * s * 0.15),
    r: f1(((dot.maxY - dot.minY) / 2) * s * 1.25),
  };
  const left = name.glyphs[0].bbox.minX;              // optical left edge (the S)
  const right = name.glyphs.at(-1).bbox.maxX;         // optical right edge (the e)
  const top = -name.metrics.cap;                       // cap height line
  const descender = Math.max(...name.glyphs.map((x) => x.bbox.maxY));
  let subline = null;
  if (sub) {
    const subSize = size * 0.31;
    const t = outline({ font: "inter", text: "FOUNDATION", size: subSize, vars: { wght: 600 }, tracking: 0.32 });
    const cap = t.metrics.cap;
    const baseline = descender + size * 0.062 + cap;
    const tl = t.glyphs[0].bbox.minX;
    const shift = left - tl;                           // align the F's stem with the S's left edge
    subline = { d: outline({ font: "inter", text: "FOUNDATION", size: subSize, vars: { wght: 600 }, tracking: 0.32, x: shift, baseline }).d, baseline, cap, right: t.glyphs.at(-1).bbox.maxX + shift };
  }
  return { d: name.d, sun, left, right, top, descender, bottom: subline ? subline.baseline : descender, sub: subline, size };
}

/** Render the mark's inner elements scaled so its visible height (7 → 56.5) equals `h`, with top-left at (x, y). */
export function markGroup({ x, y, h, yColor, sunColor, leafColor, p = P }) {
  const vis = { top: 7, bottom: 56.5, left: 13.5, right: 50.5 };
  const sc = h / (vis.bottom - vis.top);
  const tx = x - vis.left * sc, ty = y - vis.top * sc;
  const leaf = p.leaf ? `<path fill="${leafColor ?? yColor}" d="${leafPath(p)}"/>` : "";
  return {
    svg: `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${sc.toFixed(4)})"><path fill="${yColor}" d="${yPath(p)}"/>${leaf}<circle fill="${sunColor}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/></g>`,
    width: (vis.right - vis.left) * sc, height: h,
  };
}

export function svgDoc({ w, h, body, bg }) {
  const bgRect = bg ? `<rect width="${f1(w)}" height="${f1(h)}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f1(w)} ${f1(h)}" width="${f1(w)}" height="${f1(h)}">${bgRect}${body}</svg>\n`;
}

/** Horizontal lockup. Palette: { y, sun, name, sub, bg } */
export function horizontal(pal, { sub = true, pad = 24 } = {}) {
  const size = 100;
  const wm = wordmark(size, { sub });
  const blockH = wm.bottom - wm.top;                   // cap top → sub baseline (or descender)
  const markH = blockH * (sub ? 1.12 : 1.34);          // the mark sits a little taller than the text block
  const markTop = wm.top - (markH - blockH) * (sub ? 0.5 : 0.62);
  const gap = size * 0.26;
  const mk = markGroup({ x: pad, y: markTop + pad - wm.top, h: markH, yColor: pal.y, sunColor: pal.sun });
  const textX = pad + mk.width + gap - wm.left;
  const baseline = pad - wm.top;                       // name baseline in the document
  const w = pad + mk.width + gap + (wm.right - wm.left) + pad;
  const h = Math.max(markTop + markH, wm.bottom) - Math.min(markTop, wm.top) + pad * 2;
  const top = Math.min(markTop, wm.top);
  const dy = pad - top;                                 // document y for wm.top→pad
  const body = [
    markGroup({ x: pad, y: markTop + dy, h: markH, yColor: pal.y, sunColor: pal.sun }).svg,
    `<g transform="translate(${f1(textX)} ${f1(dy)})">`,
    `<path fill="${pal.name}" d="${wm.d}"/>`,
    `<circle fill="${pal.tittle ?? pal.sun}" cx="${wm.sun.cx}" cy="${wm.sun.cy}" r="${wm.sun.r}"/>`,
    sub ? `<path fill="${pal.sub}" d="${wm.sub.d}"/>` : "",
    `</g>`,
  ].join("");
  void baseline;
  return svgDoc({ w, h, body, bg: pal.bg });
}

/** Stacked lockup: mark above, name and sub centred. */
export function stacked(pal, { pad = 32 } = {}) {
  const size = 100;
  const wm = wordmark(size, { sub: true });
  const textW = wm.right - wm.left;
  const markH = size * 1.55;
  const mkW = markGroup({ x: 0, y: 0, h: markH, yColor: pal.y, sunColor: pal.sun }).width;
  const w = Math.max(textW, mkW) + pad * 2;
  const gap = size * 0.34;
  const nameTop = pad + markH + gap;                    // cap line
  const dy = nameTop - wm.top;
  const h = nameTop + (wm.bottom - wm.top) + pad;
  const body = [
    markGroup({ x: (w - mkW) / 2, y: pad, h: markH, yColor: pal.y, sunColor: pal.sun }).svg,
    `<g transform="translate(${f1((w - textW) / 2 - wm.left)} ${f1(dy)})">`,
    `<path fill="${pal.name}" d="${wm.d}"/>`,
    `<circle fill="${pal.tittle ?? pal.sun}" cx="${wm.sun.cx}" cy="${wm.sun.cy}" r="${wm.sun.r}"/>`,
    // centre FOUNDATION under the name
    `<g transform="translate(${f1((textW - (wm.sub.right - wm.left)) / 2)} 0)"><path fill="${pal.sub}" d="${wm.sub.d}"/></g>`,
    `</g>`,
  ].join("");
  return svgDoc({ w, h, body, bg: pal.bg });
}

/** Wordmark alone (name + sub). */
export function wordmarkOnly(pal, { pad = 20 } = {}) {
  const wm = wordmark(100, { sub: true });
  const w = wm.right - wm.left + pad * 2, h = wm.bottom - wm.top + pad * 2;
  const body = `<g transform="translate(${f1(pad - wm.left)} ${f1(pad - wm.top)})"><path fill="${pal.name}" d="${wm.d}"/><circle fill="${pal.tittle ?? pal.sun}" cx="${wm.sun.cx}" cy="${wm.sun.cy}" r="${wm.sun.r}"/><path fill="${pal.sub}" d="${wm.sub.d}"/></g>`;
  return svgDoc({ w, h, body, bg: pal.bg });
}

/** Mark alone in the 64 box. */
export function markOnly({ y, sun, leaf, p = P }) {
  const leafEl = p.leaf ? `<path fill="${leaf ?? y}" d="${leafPath(p)}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${y}" d="${yPath(p)}"/>${leafEl}<circle fill="${sun}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/></svg>\n`;
}

/** App icon: rounded clay square with the small cut of the mark. */
export function appIcon({ bg = C.clay, y = C.paper, sun = C.marigold, p = PS, rx = 15 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rx}" fill="${bg}"/><g transform="translate(32 32.6) scale(.84) translate(-32 -32)"><path fill="${y}" d="${yPath(p)}"/><circle fill="${sun}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/></g></svg>\n`;
}

export const PAL = {
  light: { y: C.clay, sun: C.marigold, name: C.espresso, sub: C.muted },
  dark: { y: C.bone, sun: C.marigold, name: C.bone, sub: C.nightMuted, bg: C.espresso },
  mono: { y: C.espresso, sun: C.espresso, name: C.espresso, sub: C.espresso },
  monoReverse: { y: C.bone, sun: C.bone, name: C.bone, sub: C.bone },
  clay: { y: C.paper, sun: C.marigold, name: C.paper, sub: "#f3d9c9", bg: C.clay },
};

