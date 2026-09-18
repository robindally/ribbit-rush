# Spec M10: QA and release

Goal: the game is solid on desktop and phone, documented, and one command away from being hosted.

## 1. Quality

- Run the full test suite and add coverage for any pure module under 70% line coverage
  (`vitest --coverage`, add `@vitest/coverage-v8` as a dev dependency).
- A Playwright smoke test (dev dependency only, `tests-e2e/smoke.spec.ts`, run with a separate
  `npm run e2e` script, not part of `npm test`): loads the build, starts a run, hops once, pauses,
  resumes, and asserts no console errors.
- Performance pass with Chrome devtools CPU throttling at 4x: 60 fps in world 3 with rain and
  400 particles. Fix anything that misses. Record the numbers in the report.
- Memory: play 10 minutes; heap must be flat (no growth from particles, popups, or audio nodes).
- Phone pass on a 375 x 812 viewport and a 360 x 640 viewport: HUD readable, touch controls
  reachable, no scroll or zoom, audio starts on first tap.
- Art bible sweep: grep every hex in `src/` and `assets/` and confirm each is in the bible.
- Accessibility sweep: focus order, reduce motion, colourblind check on the timer bar.

## 2. Release

- `README.md`: what the game is, controls, how to run, how to build, how to deploy (static
  `dist/` to GitHub Pages, Netlify, or Vercel, with the two or three commands for each), credits.
- `package.json` version 1.0.0, a `LICENSE` (MIT, copyright the repo owner).
- Favicon and social preview: a 512 px PNG of the frog on the world 1 palette generated from the
  sprite, `public/icon-512.png`, plus `public/icon-192.png`, and a `manifest.webmanifest` so
  phones can add it to the home screen. Standalone display, portrait orientation.
- `npm run build` output is committed nowhere; confirm `.gitignore` excludes `dist/`.

## Acceptance

All gates pass, the e2e smoke test passes, the report has the perf numbers and screenshots from
both phone viewports in `docs/screens/m10-*.png`.

## Handoff

`docs/specs/M10-report.md`. Do not commit.
