# Brand tooling

The Springrise mark is parametric. `mark.mjs` holds the geometry (sun radius, ring, stem width, petal control
points, leaf), `type.mjs` outlines the wordmark from the self-hosted Fraunces and Inter variable fonts, and
`lockup.mjs` composes the lockups. `build.mjs` writes everything that depends on them:

- `public/brand/*` (SVG and PNG marks, lockups and the app icon),
- `public/favicon.svg`, `public/apple-touch-icon.png` and `public/og.png`,
- `src/components/BrandDefs.astro`, the sprite the site header draws the wordmark from,
- `docs/brand/logo-board.png` and `docs/brand/logo-applications.png`.

```sh
cd scripts/brand
npm install            # fontkit and wawoff2, kept out of the site's own dependencies
npm run build          # uses the repo's Playwright; set CHROMIUM_PATH if Chromium isn't installed for it
```

Change a number in `mark.mjs`, run the build, and the favicon, the header, the boards and the brand files all move
together. See `docs/brand/README.md` for what the mark means and how to use it.
