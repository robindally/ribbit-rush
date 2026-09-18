// Config for the M10 Playwright smoke test (docs/specs/M10-release.md section 1: "A Playwright
// smoke test... run with a separate `npm run e2e` script, not part of `npm test`"). Dev dependency
// only - `@playwright/test` never ships in the game bundle.
//
// `webServer` runs the *production* build (`vite preview`, port 4173 - the reviewer's own dev
// server is 5173, this project's own dev server for manual work is 5174, per the milestone's own
// port convention) rather than the dev server, so the smoke test exercises exactly what a player
// would get from `npm run build`. Playwright starts it before the run and stops it again once the
// run finishes (it only reuses - and never stops - a server that was already listening, which
// isn't the case here), so nothing needs to be torn down by hand.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 624, height: 720 },
    trace: 'off',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
