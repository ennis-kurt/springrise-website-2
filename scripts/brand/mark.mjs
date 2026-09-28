// Parametric Springrise mark: a tulip whose middle petal is the rising sun.
// The stem and two petals are one closed path (the "Y"); the sun is a circle; an optional leaf.
// The cup's inner edge is an arc concentric with the sun, so the tulip cradles the sun
// with a constant gap — that gap is what keeps the mono version readable.

export const P = {
  cx: 32, cy: 25.2,     // sun centre
  r: 8.4,               // sun radius
  gap: 2.4,             // clear ring between sun and cup
  stemW: 4.6,           // stem width
  stemBottom: 56.5,     // y of stem end (round cap)
  fork: 41.5,           // y where the petal's outer edge leaves the stem
  belly: [14.6, 25.2],  // widest point of the petal's outer edge (at the sun's equator)
  oc1: [29.8, 35.8], oc2: [15.8, 35.8],   // fork → belly
  oc3: [13.5, 16.5], oc4: [14.0, 10.6],   // belly → tip
  tip: [15.4, 7.0],
  tipR: 0.9,            // soft tip: pull back this far along each edge and round through the tip
  ic1: [16.5, 11.2], ic2: [20.3, 14.9],   // tip → arc
  meetDeg: 150,
  leaf: { a: [33.2, 49.6], t: [44.6, 39.6], wu: 3.7, wl: 2.0 },
};

const f = (n) => Number(n.toFixed(2));
const pt = ([x, y]) => `${f(x)} ${f(y)}`;

export function yPath(p = P) {
  const R = p.r + p.gap;
  const th = (p.meetDeg * Math.PI) / 180;
  const M = [p.cx + R * Math.cos(th), p.cy - R * Math.sin(th)];
  const mirror = ([x, y]) => [2 * p.cx - x, y];
  const half = p.stemW / 2;
  const L = p.cx - half, Rt = p.cx + half;
  const m = (k) => mirror(p[k]);
  const large = p.meetDeg <= 180 ? 1 : 0;
  const unit = ([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
  const k = p.tipR ?? 0;
  const dOut = unit([p.tip[0] - p.oc4[0], p.tip[1] - p.oc4[1]]);
  const dIn = unit([p.ic1[0] - p.tip[0], p.ic1[1] - p.tip[1]]);
  const tA = [p.tip[0] - dOut[0] * k, p.tip[1] - dOut[1] * k];
  const tB = [p.tip[0] + dIn[0] * k, p.tip[1] + dIn[1] * k];
  const tAm = mirror(tA), tBm = mirror(tB);
  return [
    `M${pt([L, p.fork])}`,
    `C${pt(p.oc1)} ${pt(p.oc2)} ${pt(p.belly)}`,
    `C${pt(p.oc3)} ${pt(p.oc4)} ${pt(tA)}`,
    `Q${pt(p.tip)} ${pt(tB)}`,
    `C${pt(p.ic1)} ${pt(p.ic2)} ${pt(M)}`,
    `A${f(R)} ${f(R)} 0 ${large} 0 ${pt(mirror(M))}`,
    `C${pt(m("ic2"))} ${pt(m("ic1"))} ${pt(tBm)}`,
    `Q${pt(m("tip"))} ${pt(tAm)}`,
    `C${pt(m("oc4"))} ${pt(m("oc3"))} ${pt(m("belly"))}`,
    `C${pt(m("oc2"))} ${pt(m("oc1"))} ${pt([Rt, p.fork])}`,
    `L${pt([Rt, p.stemBottom - half])}`,
    `A${f(half)} ${f(half)} 0 0 1 ${pt([L, p.stemBottom - half])}`,
    `Z`,
  ].join("");
}

// A slender leaf: a lens from the stem edge to its tip. wu / wl are the upper and lower bulges.
export function leafPath(p = P) {
  if (!p.leaf) return "";
  const { a, t, wu, wl } = p.leaf;
  const d = [t[0] - a[0], t[1] - a[1]];
  const len = Math.hypot(...d);
  const n = [-d[1] / len, d[0] / len];              // unit normal (points down-right for an up-right leaf)
  const mid = [(a[0] + t[0]) / 2, (a[1] + t[1]) / 2];
  const cu = [mid[0] - n[0] * wu, mid[1] - n[1] * wu];
  const cl = [mid[0] + n[0] * wl, mid[1] + n[1] * wl];
  return `M${pt(a)}Q${pt(cu)} ${pt(t)}Q${pt(cl)} ${pt(a)}Z`;
}

export function markInner({ y = "#b4502d", sun = "#f0b44c", leaf, p = P } = {}) {
  const leafEl = p.leaf ? `<path fill="${leaf ?? y}" d="${leafPath(p)}"/>` : "";
  return `<path fill="${y}" d="${yPath(p)}"/>${leafEl}<circle fill="${sun}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>`;
}

export function markSvg({ y = "#b4502d", sun = "#f0b44c", leaf, p = P, attrs = "" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${attrs}>${markInner({ y, sun, leaf, p })}</svg>`;
}

// Small-size cut (favicon, 16–24 px): thicker stem, wider gap, bigger sun, no leaf.
export const PS = { ...P, leaf: null, stemW: 6.2, gap: 3, r: 8.8, cy: 25.6, fork: 42, oc1: [29, 36.2], tipR: 0.6 };
