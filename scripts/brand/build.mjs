// Build every Springrise brand deliverable from the parametric mark and the outlined wordmark.
// See README.md in this folder. Run with: npm run build (from scripts/brand).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { yPath, leafPath, P, PS } from "./mark.mjs";
import { wordmark, horizontal, stacked, wordmarkOnly, markOnly, appIcon, PAL, C } from "./lockup.mjs";
import { render, close } from "./shot.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BRAND = `${REPO}/public/brand`;
const F = `file://${REPO}/node_modules/@fontsource-variable`;
mkdirSync(BRAND, { recursive: true });
mkdirSync(`${REPO}/docs/brand`, { recursive: true });
const f1 = (n) => Number(n.toFixed(1));

// ============================================================ site assets


// ---------------------------------------------------------------- SVG brand files
const files = {
  "springrise-mark.svg": markOnly({ y: C.clay, sun: C.marigold }),
  "springrise-mark-on-dark.svg": markOnly({ y: C.bone, sun: C.marigold }),
  "springrise-mark-mono.svg": markOnly({ y: C.espresso, sun: C.espresso }),
  "springrise-mark-mono-reverse.svg": markOnly({ y: C.bone, sun: C.bone }),
  "springrise-mark-small.svg": markOnly({ y: C.clay, sun: C.marigold, p: PS }),
  "springrise-app-icon.svg": appIcon(),
  "springrise-logo.svg": horizontal(PAL.light),
  "springrise-logo-on-dark.svg": horizontal({ ...PAL.dark, bg: undefined }),   // transparent: bone and marigold
  "springrise-logo-mono.svg": horizontal(PAL.mono),
  "springrise-logo-mono-reverse.svg": horizontal(PAL.monoReverse),
  "springrise-logo-stacked.svg": stacked(PAL.light),
  "springrise-logo-stacked-on-dark.svg": stacked({ ...PAL.dark, bg: undefined }),
  "springrise-wordmark.svg": wordmarkOnly(PAL.light),
};
for (const [n, s] of Object.entries(files)) writeFileSync(`${BRAND}/${n}`, s);
writeFileSync(`${REPO}/public/favicon.svg`, appIcon());

// ---------------------------------------------------------------- sprite for the site header (name + sub as symbols)
const wm = wordmark(100, { sub: true });
// name box: from the higher of (cap line, sun top) to the descender, optical left → right
const nameTop = Math.min(wm.top - 1.5, wm.sun.cy - wm.sun.r);
const nameBox = { x: f1(wm.left), y: f1(nameTop), w: f1(wm.right - wm.left), h: f1(wm.descender - nameTop) };
const subTop = wm.sub.baseline - wm.sub.cap;
const subBox = { x: f1(wm.left), y: f1(subTop), w: f1(wm.sub.right - wm.left), h: f1(wm.sub.cap) };
const round1 = (d) => d.replace(/-?\d+\.\d+/g, (m) => String(Number(Number(m).toFixed(1))));
const defs = `---
// Vector wordmark, drawn once per page and referenced by <Wordmark />. Fraunces (opsz 36, wght 560, SOFT 50)
// and Inter (wght 600) outlined to paths so the logo never depends on font loading, and the tittle of the
// "i" in "rise" can be the sun. Generated from the brand sources; see docs/brand/README.md.
---
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="sr-name" viewBox="${nameBox.x} ${nameBox.y} ${nameBox.w} ${nameBox.h}">
    <path fill="currentColor" d="${round1(wm.d)}" />
    <circle class="sr-sun" fill="var(--wm-sun, #f0b44c)" cx="${wm.sun.cx}" cy="${wm.sun.cy}" r="${wm.sun.r}" />
  </symbol>
  <symbol id="sr-sub" viewBox="${subBox.x} ${subBox.y} ${subBox.w} ${subBox.h}">
    <path fill="currentColor" d="${round1(wm.sub.d)}" />
  </symbol>
</svg>
`;
writeFileSync(`${REPO}/src/components/BrandDefs.astro`, defs);

// Constants for Wordmark.astro (all relative to name size 100)
const consts = {
  nameBox, subBox,
  capTop: f1(wm.top), descender: f1(wm.descender), subBaseline: f1(wm.sub.baseline), subCap: f1(wm.sub.cap),
  blockWithSub: f1(wm.bottom - wm.top), blockNoSub: f1(wm.descender - wm.top),
  markVisible: { top: 7, bottom: 56.5, left: 13.5, right: 50.5 },
  yPath: yPath(P), leafPath: leafPath(P), sun: { cx: P.cx, cy: P.cy, r: P.r },
};

// ---------------------------------------------------------------- PNG renders
const shot = (html, out, w, h, scale = 1, omit = false) => render(html, out, { w, h, scale, omit });
const page = (inner, bg = "transparent") => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${bg}}svg{display:block}</style>${inner}`;
const dims = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1, 3).map(Number);

// Horizontal lockups at ~2000 px wide
for (const [name, pal, omit] of [["springrise-logo", PAL.light, true], ["springrise-logo-on-dark", PAL.dark, false], ["springrise-logo-mono", PAL.mono, true]]) {
  const svg = horizontal(pal);
  const [w, h] = dims(svg);
  const k = 2000 / w;
  await shot(page(svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`)), `${BRAND}/${name}.png`, Math.round(w * k), Math.round(h * k), 1, omit);
}
// Stacked at 1400 wide
{
  const svg = stacked(PAL.light);
  const [w, h] = dims(svg);
  const k = 1400 / w;
  await shot(page(svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(w * k)}" height="${Math.round(h * k)}"`)), `${BRAND}/springrise-logo-stacked.png`, Math.round(w * k), Math.round(h * k), 1, true);
}
// Mark and app icon at 1024
await shot(page(markOnly({ y: C.clay, sun: C.marigold }).replace("<svg ", '<svg width="1024" height="1024" ')), `${BRAND}/springrise-mark.png`, 1024, 1024, 1, true);
await shot(page(appIcon().replace("<svg ", '<svg width="1024" height="1024" ')), `${BRAND}/springrise-app-icon.png`, 1024, 1024, 1, true);
// Apple touch icon: full-bleed square (iOS rounds it)
await shot(page(appIcon({ rx: 0 }).replace("<svg ", '<svg width="180" height="180" ')), `${REPO}/public/apple-touch-icon.png`, 180, 180, 1, false);

// ---------------------------------------------------------------- OG image 1200×630
{
    const rand = ((seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646)(20250625);
  let stems = "";
  const groups = [{ n: 25, c: "#b4502d" }, { n: 19, c: "#7f9f5c" }];
  const total = 44; const slots = Array.from({ length: total }, (_, i) => i).sort(() => rand() - 0.5); let k = 0;
  for (const g of groups) for (let i = 0; i < g.n; i++) {
    const slot = slots[k++]; const x = 640 + ((slot + 0.5 + (rand() - 0.5) * 0.8) / total) * 560;
    const h = 200 + rand() * 330; const bend = (rand() - 0.5) * 40; const tipX = x + bend, tipY = 660 - h;
    const cx = x + bend * 0.15, cy = 660 - h * 0.55; const a = g === groups[0] ? 0.95 : 0.75;
    const lt = 0.5 + rand() * 0.3; const lx = (1 - lt) ** 2 * x + 2 * (1 - lt) * lt * cx + lt * lt * tipX; const ly = (1 - lt) ** 2 * 660 + 2 * (1 - lt) * lt * cy + lt * lt * tipY;
    const ls = 7 + h * 0.02;
    stems += `<path d="M${x} 662Q${cx} ${cy} ${tipX} ${tipY}" stroke="${g.c}" stroke-opacity="${a}" stroke-width="${g === groups[0] ? 2.2 : 1.7}" fill="none" stroke-linecap="round"/>`;
    stems += `<circle cx="${tipX}" cy="${tipY}" r="${ls * 1.6}" fill="${g.c}" opacity=".18"/><circle cx="${tipX}" cy="${tipY}" r="3.6" fill="${g.c}" opacity="${a}"/>`;
    stems += `<g transform="translate(${lx} ${ly}) rotate(-52)"><path d="M0 0Q${ls * .55} ${-ls * .48} ${ls} 0Q${ls * .55} ${ls * .48} 0 0Z" fill="${g.c}" opacity="${0.6 * a}"/></g>`;
  }
  const lock = horizontal(PAL.light, { pad: 0 });
  const [lw, lh] = dims(lock);
  const lockScale = 62 / lh;
  const html = `<!doctype html><meta charset="utf-8"><style>
  @font-face{font-family:Fraunces;src:url(${F}/fraunces/files/fraunces-latin-full-normal.woff2) format("woff2");font-weight:100 900}
  @font-face{font-family:FrauncesI;src:url(${F}/fraunces/files/fraunces-latin-full-italic.woff2) format("woff2");font-weight:100 900;font-style:italic}
  @font-face{font-family:Inter;src:url(${F}/inter/files/inter-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
  html,body{margin:0}body{width:1200px;height:630px;background:linear-gradient(180deg,#fffcf6,#f7f1e7);font-family:Inter;color:#2b2320;position:relative;overflow:hidden}
  .glow{position:absolute;inset:0;background:radial-gradient(ellipse at 78% 110%,rgba(240,180,76,.28),rgba(240,180,76,0) 60%)}
  .lock{position:absolute;left:84px;top:78px;width:${Math.round(lw * lockScale)}px}
  h1{position:absolute;left:84px;top:170px;margin:0;font-family:Fraunces;font-variation-settings:"opsz" 144,"SOFT" 60,"WONK" 0;font-weight:500;font-size:132px;line-height:.96;letter-spacing:-.02em}
  h1 em{font-family:FrauncesI;font-style:italic;color:#b4502d;font-variation-settings:"opsz" 144,"SOFT" 60,"WONK" 0}
  p{position:absolute;left:84px;top:440px;margin:0;width:590px;font-size:26px;line-height:1.4;color:#5f534c;font-weight:450}
  svg.field{position:absolute;left:0;top:0}
  </style><div class="glow"></div><svg class="field" width="1200" height="630" viewBox="0 0 1200 630">${stems}</svg>
  <div class="lock">${lock.replace(/width="[\d.]+" height="[\d.]+"/, 'width="100%" height="auto"')}</div>
  <h1>Room to<br><em>rise.</em></h1>
  <p>Scholarships, internships and mentorship for students of Turkish descent in U.S. higher education.</p>`;
  await shot(html, `${REPO}/public/og.png`, 1200, 630, 1, false);
}

// ============================================================ identity boards


const fit = (svg) => svg.replace(/width="[\d.]+" height="[\d.]+"/, "");
const mark = (o = {}) => markOnly({ y: C.clay, sun: C.marigold, ...o }).replace("<svg ", `<svg class="m" `);
const inner = (y, sun, p = P, leaf) => `<path fill="${y}" d="${yPath(p)}"/>${p.leaf ? `<path fill="${leaf ?? y}" d="${leafPath(p)}"/>` : ""}<circle fill="${sun}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>`;

const css = `
@font-face{font-family:Fraunces;src:url(${F}/fraunces/files/fraunces-latin-full-normal.woff2) format("woff2");font-weight:100 900}
@font-face{font-family:FrauncesI;src:url(${F}/fraunces/files/fraunces-latin-full-italic.woff2) format("woff2");font-weight:100 900;font-style:italic}
@font-face{font-family:Inter;src:url(${F}/inter/files/inter-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box}html,body{margin:0}
body{width:1600px;background:#f7f1e7;font-family:Inter;color:#2b2320;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.board{padding:56px 64px 64px;display:grid;gap:28px}
.card{background:#fffcf6;border:1px solid rgba(43,35,32,.1);border-radius:22px;padding:36px 40px;position:relative}
.card.night{background:#2b2320;color:#f7f1e7;border-color:transparent}.card.clay{background:#b4502d;color:#fffcf6;border-color:transparent}
h1,h2,h3{font-family:Fraunces;font-variation-settings:"opsz" 96,"SOFT" 60,"WONK" 0;font-weight:500;margin:0;letter-spacing:-.015em;line-height:1.05}
h1{font-size:54px}h2{font-size:30px}h3{font-size:21px;margin-bottom:6px}
em{font-family:FrauncesI;font-style:italic;color:#b4502d;font-variation-settings:"opsz" 96,"SOFT" 60,"WONK" 0}.night em{color:#f0b44c}
.k{font-size:11.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8a3a1f;margin-bottom:14px;display:flex;gap:10px;align-items:center}
.k::before{content:"";width:18px;height:2px;background:#f0b44c;border-radius:2px}.night .k{color:#f0b44c}.night .k::before{background:#f0b44c}
p{margin:0;color:#5f534c;max-width:62ch}.night p{color:#c4beb5}.clay p{color:#f3d9c9}
.row{display:grid;gap:28px}.c2{grid-template-columns:1fr 1fr}.c3{grid-template-columns:1fr 1fr 1fr}.c4{grid-template-columns:repeat(4,1fr)}.c5{grid-template-columns:repeat(5,1fr)}
svg{display:block}.m{width:100%;height:auto}
.hero{display:grid;grid-template-columns:1.05fr 1fr;gap:40px;align-items:center;padding:56px 64px}
.hero .lock{width:100%}.hero .big{width:380px;justify-self:center}
.readings figure{margin:0;display:grid;gap:14px;justify-items:center;text-align:center}.readings figure svg{width:200px}
.readings figcaption{font-size:14px;color:#5f534c;max-width:30ch}.readings b{display:block;font-family:Fraunces;font-size:20px;font-weight:500;color:#2b2320;margin-bottom:4px}
.swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}.sw{border-radius:14px;padding:16px 14px;min-height:130px;display:grid;align-content:end;gap:2px;font-size:12.5px}
.sw b{font-family:Fraunces;font-size:16px;font-weight:500}.sw span{opacity:.75;letter-spacing:.04em}
.versions{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}.v{border-radius:16px;min-height:170px;display:grid;place-items:center;padding:24px;border:1px solid rgba(43,35,32,.1)}
.v svg{width:100%;max-width:200px}.v.dark{background:#2b2320;border-color:transparent}.v.clay{background:#b4502d;border-color:transparent}.v.bone{background:#efe5d5}
.sizes{display:flex;align-items:flex-end;gap:34px}.sizes figure{margin:0;display:grid;gap:10px;justify-items:center;font-size:12px;color:#5f534c}
.lockups{display:grid;grid-template-columns:1.35fr 1fr;gap:28px;align-items:center}.lockups .stack{width:70%;margin:auto}
.cap{font-size:13px;color:#5f534c;margin-top:12px}
.note{font-size:13.5px;color:#5f534c;display:grid;gap:8px}.note li{margin:0}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:#6f635c;padding:0 8px}
`;

// ------------------------------------------------------------------ diagrams
const grid = (p = P, size = 420) => {
  const R = p.r + p.gap;
  return `<svg viewBox="-2 -2 68 68" width="${size}" height="${size}" font-family="Inter" font-size="2.2" fill="#5f534c">
  <defs><pattern id="g" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M4 0H0V4" fill="none" stroke="#2b2320" stroke-opacity=".1" stroke-width=".2"/></pattern></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <rect width="64" height="64" fill="none" stroke="#2b2320" stroke-opacity=".25" stroke-width=".25"/>
  <path d="${yPath(p)}" fill="#b4502d" fill-opacity=".16" stroke="#b4502d" stroke-width=".35"/>
  <path d="${leafPath(p)}" fill="#b4502d" fill-opacity=".16" stroke="#b4502d" stroke-width=".35"/>
  <circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" fill="#f0b44c" fill-opacity=".45" stroke="#2b2320" stroke-width=".3"/>
  <circle cx="${p.cx}" cy="${p.cy}" r="${R}" fill="none" stroke="#2b2320" stroke-width=".3" stroke-dasharray="1 .8"/>
  <circle cx="${p.cx}" cy="${p.cy}" r="${R * 2.35}" fill="none" stroke="#2b2320" stroke-opacity=".35" stroke-width=".25" stroke-dasharray=".6 .8"/>
  <path d="M${p.cx} 2V62M2 ${p.cy}H62" stroke="#2b2320" stroke-opacity=".4" stroke-width=".22" stroke-dasharray="1 1"/>
  <path d="M8 ${p.tip[1]}H56" stroke="#2b2320" stroke-opacity=".4" stroke-width=".22" stroke-dasharray="1 1"/>
  <path d="M8 ${p.stemBottom}H56" stroke="#2b2320" stroke-opacity=".4" stroke-width=".22" stroke-dasharray="1 1"/>
  <path d="M${p.leaf.a[0]} ${p.leaf.a[1]}L${p.leaf.t[0] + 6} ${p.leaf.t[1] - 5.3}" stroke="#2b2320" stroke-opacity=".4" stroke-width=".22" stroke-dasharray="1 1"/>
  <path d="M${p.cx} ${p.cy}L${p.cx + p.r * 0.7071} ${p.cy - p.r * 0.7071}" stroke="#2b2320" stroke-width=".25"/>
  <text x="${p.cx + 3.2}" y="${p.cy - 3.8}">r</text>
  <text x="${p.cx + R + 0.8}" y="${p.cy - 0.6}">r + 0.29 r</text>
  <text x="57" y="${p.tip[1] + 0.8}">tips</text>
  <text x="57" y="${p.cy + 0.8}">equator</text>
  <text x="57" y="${p.stemBottom + 0.8}">base</text>
  <text x="${p.leaf.t[0] + 3}" y="${p.leaf.t[1] - 6}">41°</text>
  <text x="3" y="61.5">64 × 64 · stem 4.6 · sun r 8.4 · ring 2.4</text>
</svg>`;
};

const reading = (which) => {
  const faint = "rgba(180,80,45,.22)";
  if (which === "tulip") return `<svg viewBox="4 4 56 56">${inner(C.clay, "rgba(240,180,76,.28)")}</svg>`;
  if (which === "sun") return `<svg viewBox="4 4 56 56"><path fill="${faint}" d="${yPath(P)}"/><path fill="${faint}" d="${leafPath(P)}"/>
    <g stroke="#f0b44c" stroke-width="1.1" stroke-linecap="round" opacity=".9">${[-60, -35, -10, 10, 35, 60].map((a) => { const t = ((a - 90) * Math.PI) / 180; const r1 = P.r + 3.2, r2 = P.r + 6.5; return `<path d="M${(P.cx + r1 * Math.cos(t)).toFixed(2)} ${(P.cy + r1 * Math.sin(t)).toFixed(2)}L${(P.cx + r2 * Math.cos(t)).toFixed(2)} ${(P.cy + r2 * Math.sin(t)).toFixed(2)}"/>`; }).join("")}</g>
    <circle fill="#f0b44c" cx="${P.cx}" cy="${P.cy}" r="${P.r}"/></svg>`;
  return `<svg viewBox="4 4 56 56">${inner(C.espresso, C.espresso)}</svg>`;
};

const clearSpace = () => {
  const d = P.r * 2; // clear space = the sun's diameter
  const vis = { l: 13.5, r: 50.5, t: 7, b: 56.5 };
  return `<svg viewBox="${vis.l - d - 4} ${vis.t - d - 4} ${vis.r - vis.l + 2 * d + 8} ${vis.b - vis.t + 2 * d + 8}" width="300" font-family="Inter" font-size="2.4" fill="#5f534c">
    <rect x="${vis.l - d}" y="${vis.t - d}" width="${vis.r - vis.l + 2 * d}" height="${vis.b - vis.t + 2 * d}" fill="none" stroke="#2b2320" stroke-width=".3" stroke-dasharray="1.2 1"/>
    <rect x="${vis.l}" y="${vis.t}" width="${vis.r - vis.l}" height="${vis.b - vis.t}" fill="none" stroke="#2b2320" stroke-opacity=".3" stroke-width=".25"/>
    ${inner(C.clay, C.marigold)}
    <circle cx="${vis.l - d / 2}" cy="${vis.t - d / 2}" r="${P.r}" fill="none" stroke="#f0b44c" stroke-width=".5"/>
    <text x="${vis.r + 2}" y="${vis.t - d / 2 + 1}">= sun ⌀</text>
  </svg>`;
};

const motion = () => [0, -1.25, -2.5].map((dy, i) => `<figure><svg viewBox="8 2 48 56" width="120"><path fill="#b4502d" d="${yPath(P)}"/><path fill="#b4502d" d="${leafPath(P)}"/><circle fill="#f0b44c" cx="${P.cx}" cy="${P.cy + dy}" r="${P.r}"/></svg><span>${["rest", "hover · 0.4 s", "hover · 0.9 s"][i]}</span></figure>`).join("");

// ------------------------------------------------------------------ board 1: identity
const board1 = `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="board">
<div class="card hero">
  <div>
    <div class="k">Springrise Foundation · identity</div>
    <h1>A tulip holding<br>the <em>rising sun.</em></h1>
    <p style="margin-top:18px;font-size:17px">Springrise gives students of Turkish descent room to rise. The mark is a tulip, the lale of Turkish heritage and the flower of spring, whose middle petal is the sun coming up. Two petals, one stem, one leaf and one sun: nothing else.</p>
    <div class="lock" style="margin-top:34px;width:78%">${fit(horizontal(PAL.light, { pad: 0 }))}</div>
  </div>
  <div class="big">${mark()}</div>
</div>

<div class="card">
  <div class="k">One mark, three readings</div>
  <div class="row c3 readings">
    <figure>${reading("tulip")}<figcaption><b>A tulip</b>The lale: cultivated in Anatolia, painted on İznik tiles, the flower of spring. Heritage and season in one shape.</figcaption></figure>
    <figure>${reading("sun")}<figcaption><b>A sunrise</b>The sun sits where the third petal would be, held in the cup with a ring of light around it. Room to rise, made literal.</figcaption></figure>
    <figure>${reading("figure")}<figcaption><b>A scholar, lifted</b>In one colour the stem becomes a body and the petals become raised arms: a student at the moment things go right.</figcaption></figure>
  </div>
</div>

<div class="row c2">
  <div class="card">
    <div class="k">Construction</div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center">
      ${grid()}
      <ul class="note" style="padding-left:18px">
        <li>Drawn on a 64-unit square. The sun is a circle of radius <b>r</b>; the cup's inner edge is an arc <b>concentric</b> with it, so the ring of clear space around the sun is constant (0.29 r) and survives in one colour.</li>
        <li>The stem and both petals are <b>one closed path</b>. Petal tips point straight up and are softened by 0.9 units, so the mark feels grown rather than cut.</li>
        <li>The leaf is a lens at 41°, the same leaf the site's Rising Field draws on every stem: the logo is one stem from that field.</li>
        <li>Tips, equator and base fall on the same guides at every size. The cup is 1.12× the height of the text block in the lockup.</li>
      </ul>
    </div>
  </div>
  <div class="card">
    <div class="k">Lockups</div>
    <div class="lockups">
      <div>${fit(horizontal(PAL.light, { pad: 6 }))}<div class="cap">Primary. Fraunces (optical size 36, weight 560, softness 50) outlined to paths; Inter 600 for the sub-line, tracked 32%.</div></div>
      <div class="stack">${fit(stacked(PAL.light, { pad: 6 }))}<div class="cap" style="text-align:center">Stacked, for squares and print.</div></div>
    </div>
    <div style="margin-top:26px;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center">
      <div class="cap" style="margin:0">The tittle of the <b>i</b> in <b>rise</b> is the sun: the one custom letter in the wordmark, and the only place the marigold appears in type. The name works alone, and so does the mark.</div>
      <div style="width:300px">${fit(wordmarkOnly(PAL.light, { pad: 4 }))}</div>
    </div>
  </div>
</div>

<div class="card">
  <div class="k">Colour</div>
  <div class="swatches">
    <div class="sw" style="background:#b4502d;color:#fffcf6"><b>Clay</b><span>#B4502D · petals and stem</span></div>
    <div class="sw" style="background:#f0b44c;color:#2b2320"><b>Marigold</b><span>#F0B44C · the sun</span></div>
    <div class="sw" style="background:#2b2320;color:#f7f1e7"><b>Espresso</b><span>#2B2320 · name, one colour</span></div>
    <div class="sw" style="background:#f7f1e7;color:#2b2320;border:1px solid rgba(43,35,32,.12)"><b>Bone</b><span>#F7F1E7 · on dark</span></div>
    <div class="sw" style="background:#fffcf6;color:#2b2320;border:1px solid rgba(43,35,32,.12)"><b>Paper</b><span>#FFFCF6 · ground</span></div>
    <div class="sw" style="background:#7f9f5c;color:#fffcf6"><b>Leaf</b><span>#7F9F5C · the field, not the mark</span></div>
  </div>
</div>

<div class="card">
  <div class="k">Versions</div>
  <div class="versions">
    <div class="v">${mark()}</div>
    <div class="v dark">${mark({ y: C.bone })}</div>
    <div class="v clay">${mark({ y: C.paper })}</div>
    <div class="v">${mark({ y: C.espresso, sun: C.espresso })}</div>
    <div class="v dark">${mark({ y: C.bone, sun: C.bone })}</div>
  </div>
  <div class="row c5" style="margin-top:12px;font-size:12.5px;color:#5f534c;text-align:center"><span>Full colour on light</span><span>On espresso</span><span>On clay</span><span>One colour</span><span>One colour, reversed</span></div>
  <div class="row c2" style="margin-top:20px">
    <div class="v dark" style="min-height:120px;padding:18px 28px"><div style="width:60%">${fit(horizontal(PAL.dark, { pad: 4 })).replace('<rect', '<rect fill="none" x')}</div></div>
    <div class="v" style="min-height:120px;padding:18px 28px"><div style="width:60%">${fit(horizontal(PAL.mono, { pad: 4 }))}</div></div>
  </div>
</div>

<div class="foot"><span>Springrise Foundation, Inc. · Denville, New Jersey · 501(c)(3)</span><span>Identity board 1 of 2 · files in public/brand</span></div>
</div>`;

// ------------------------------------------------------------------ board 2: applications
const tab = `<div style="background:#e8e2d8;border-radius:12px 12px 0 0;padding:10px 10px 0;width:520px">
  <div style="display:flex;gap:8px;align-items:center;background:#fffcf6;border-radius:10px 10px 0 0;padding:9px 14px;font-size:13px;color:#2b2320">
    <span style="width:16px;height:16px">${appIcon().replace("<svg ", '<svg width="16" height="16" ')}</span><span>Springrise Foundation · Room to rise</span><span style="margin-left:auto;color:#8a8079">✕</span></div>
  <div style="background:#fffcf6;padding:9px 14px;font-size:12.5px;color:#6f635c;border-top:1px solid rgba(43,35,32,.08)">🔒 springrise.org</div></div>`;

const phone = `<div style="width:230px;height:300px;border-radius:32px;background:linear-gradient(160deg,#3a2f2a,#1d1715);padding:34px 22px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-content:start;justify-items:center">
  ${[0, 1, 2, 3].map((i) => i === 1 ? `<div style="display:grid;gap:7px;justify-items:center"><div style="width:52px;height:52px;border-radius:13px;overflow:hidden">${appIcon({ rx: 0 }).replace("<svg ", '<svg width="52" height="52" ')}</div><span style="font-size:10px;color:#f7f1e7">Springrise</span></div>` : `<div style="display:grid;gap:7px;justify-items:center"><div style="width:52px;height:52px;border-radius:13px;background:rgba(247,241,231,.14)"></div><span style="font-size:10px;color:rgba(247,241,231,.6)">App</span></div>`).join("")}
</div>`;

const cardFront = `<div style="width:420px;height:240px;border-radius:14px;background:#fffcf6;border:1px solid rgba(43,35,32,.12);display:grid;place-items:center;box-shadow:0 20px 40px -24px rgba(43,35,32,.45)"><div style="width:170px">${fit(stacked(PAL.light, { pad: 0 }))}</div></div>`;
const cardBack = `<div style="width:420px;height:240px;border-radius:14px;background:#b4502d;color:#fffcf6;padding:28px 30px;position:relative;box-shadow:0 20px 40px -24px rgba(43,35,32,.45)">
  <div style="position:absolute;right:26px;top:22px;width:54px">${markOnly({ y: C.paper, sun: C.marigold })}</div>
  <div style="font-family:Fraunces;font-size:22px;font-variation-settings:'opsz' 36,'SOFT' 50;font-weight:560;margin-top:96px">Ayşe Demir</div>
  <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f3d9c9;margin-top:4px">Scholarship Committee</div>
  <div style="font-size:12.5px;color:#f3d9c9;margin-top:16px">scholarship@springrise.org · springrise.org</div></div>`;

const letterhead = `<div style="width:100%;height:250px;border-radius:14px;background:#fffcf6;border:1px solid rgba(43,35,32,.12);padding:30px 36px;position:relative;overflow:hidden">
  <div style="width:210px">${fit(horizontal(PAL.light, { pad: 0 }))}</div>
  <div style="position:absolute;left:36px;right:36px;top:98px;height:1px;background:#f0b44c"></div>
  <div style="margin-top:56px;font-family:Fraunces;font-size:20px;font-variation-settings:'opsz' 36,'SOFT' 50;font-weight:500">Dear Ayşe,</div>
  <div style="margin-top:8px;font-size:13px;color:#5f534c;max-width:52ch;line-height:1.5">On behalf of the Board of Trustees, it is a pleasure to tell you that you have been selected as a Springrise Scholar for Spring 2027. Your tuition award will be paid directly to your university.</div>
  <div style="position:absolute;right:-40px;bottom:-70px;width:220px;opacity:.07">${markOnly({ y: C.espresso, sun: C.espresso })}</div></div>`;

const pin = `<div style="width:150px;height:150px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#c9613c,#a3452a 70%);box-shadow:inset 0 0 0 6px rgba(255,252,246,.14),0 18px 30px -18px rgba(43,35,32,.6);display:grid;place-items:center"><div style="width:84px">${markOnly({ y: C.paper, sun: C.marigold })}</div></div>`;
const avatar = `<div style="width:150px;height:150px;border-radius:50%;background:#2b2320;display:grid;place-items:center"><div style="width:88px">${markOnly({ y: C.bone, sun: C.marigold })}</div></div>`;
const avatarLight = `<div style="width:150px;height:150px;border-radius:50%;background:#f7f1e7;border:1px solid rgba(43,35,32,.12);display:grid;place-items:center"><div style="width:88px">${markOnly({ y: C.clay, sun: C.marigold })}</div></div>`;

const board2 = `<!doctype html><meta charset="utf-8"><style>${css}
.sizes svg{display:block}.apps{display:grid;grid-template-columns:1fr 1fr;gap:28px}.motion{display:flex;gap:40px;align-items:flex-end}.motion figure{margin:0;display:grid;gap:10px;justify-items:center;font-size:12px;color:#5f534c}
</style><div class="board">
<div class="row c2">
  <div class="card">
    <div class="k">Sizes and the small cut</div>
    <div class="sizes">
      ${[128, 64, 48, 32, 24].map((s) => `<figure>${mark().replace('class="m"', `width="${s}" height="${s}"`)}<span>${s}px</span></figure>`).join("")}
      <figure style="padding-left:20px;border-left:1px dashed rgba(43,35,32,.25)">${markOnly({ y: C.clay, sun: C.marigold, p: PS }).replace("<svg ", '<svg width="24" height="24" ')}<span>small&nbsp;cut</span></figure>
      <figure>${markOnly({ y: C.clay, sun: C.marigold, p: PS }).replace("<svg ", '<svg width="16" height="16" ')}<span>16</span></figure>
      <figure>${appIcon().replace("<svg ", '<svg width="16" height="16" ')}<span>favicon</span></figure>
    </div>
    <p class="cap" style="margin-top:22px">Below 24 px the mark switches to its <b>small cut</b>: the leaf goes, the stem thickens from 4.6 to 6.2 units and the ring widens to 3, so the sun still floats at 16 px. Minimum sizes: mark 16 px or 5 mm, horizontal lockup 120 px or 32 mm wide.</p>
  </div>
  <div class="card">
    <div class="k">Clear space and don'ts</div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center">
      ${clearSpace()}
      <ul class="note" style="padding-left:18px">
        <li>Keep a margin of at least one sun diameter around the mark and the lockups.</li>
        <li>Don't recolour the sun: it is marigold, or the same colour as the tulip in one-colour use.</li>
        <li>Don't rotate, outline, add gradients or shadows, or place the mark on busy photography without the bone or espresso panel.</li>
        <li>Don't set the name in another face, or re-typeset it: the wordmark is drawn, not typed.</li>
        <li>Don't drop the leaf above 24 px, or keep it below.</li>
      </ul>
    </div>
  </div>
</div>

<div class="card">
  <div class="k">In use</div>
  <div class="apps">
    <div style="display:grid;gap:22px;align-content:start">
      ${tab}
      <div style="display:flex;gap:22px;align-items:center">${pin}${avatar}${avatarLight}</div>
      <div class="cap" style="margin:0">Browser tab, enamel pin, and the two social avatars: on espresso and on bone. Below, the award letter.</div>
      ${letterhead}
    </div>
    <div style="display:flex;gap:22px;align-items:flex-start">${phone}<div style="display:grid;gap:16px">${cardFront}<div style="transform:translateX(24px)">${cardBack}</div></div></div>
  </div>
</div>

<div class="row c2">
  <div class="card">
    <div class="k">Motion</div>
    <div class="motion">${motion()}<div class="cap" style="margin:0;max-width:34ch">On the website, hovering the logo lets the sun rise 2.5 units out of the tulip, and the sun above the <b>i</b> in <b>rise</b> lifts with it: 0.9 s on the site's own ease. Nothing moves for people who prefer reduced motion.</div></div>
  </div>
  <div class="card night">
    <div class="k">Where it comes from</div>
    <p style="font-size:15px">The site's hero is a field of stems, one per scholar the foundation has funded, growing toward the light. The mark is a single stem from that field in bloom: same leaf, same lean toward the sun. The logo is not decoration on the website; it is the website's idea, made small enough to fit on a pin.</p>
    <div style="margin-top:26px;width:62%">${fit(horizontal(PAL.dark, { pad: 4 })).replace('<rect', '<rect fill="none" x')}</div>
  </div>
</div>

<div class="foot"><span>Springrise Foundation, Inc. · Denville, New Jersey · 501(c)(3)</span><span>Identity board 2 of 2 · files in public/brand</span></div>
</div>`;

for (const [name, html] of [["logo-board", board1], ["logo-applications", board2]]) {
  await render(html, `${REPO}/docs/brand/${name}.png`, { w: 1600, h: 1000, scale: 1.5, fullPage: true });
}
await close();
