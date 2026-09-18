// M10 e2e smoke test (docs/specs/M10-release.md section 1): loads the production build (via
// playwright.config.ts's `webServer`, `vite preview` on port 4173), starts a run, hops once,
// pauses, resumes, and asserts no console errors. Dev-only `window.__rr` hooks are unavailable in
// a production build (gated on `import.meta.env.DEV` - see `src/main.ts`/`src/scenes/play.ts`), so
// every step here drives the game exactly the way a real player would: keyboard input only, no
// dev-hook shortcuts. Not part of `npm test` (`vitest run`) - run with `npm run e2e`.

import { expect, test } from '@playwright/test';

test('start a run, hop, pause, resume - clean console throughout', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle('Ribbit Rush');

  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  // Fonts (Fredoka) and the sprite atlas both load before the Title's first render
  // (`main.ts`'s `boot()`); give them a moment to settle before driving input.
  await page.waitForTimeout(500);

  // Title: Enter with nothing focused still starts the game (the acceptance's own long-standing
  // wording - docs/specs/M8-report.md "Deviations" #7), the same key the reviewer's own harness
  // uses (scripts/review.mjs).
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600); // Title -> Play iris transition (350ms) plus settle

  // Level 1's intro card auto-shows on every fresh run and dismisses on any input
  // (scenes/levelIntro.ts's `onAction`).
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);

  // Hop once (HOP_S is 110ms).
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);

  // Pause, then resume - both map to the same 'pause' action (Escape), which opens PauseScene the
  // first time and closes it (FocusManager's own onCancel -> `resume()`) the second.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  expect(pageErrors, `uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  expect(consoleErrors, `console.error calls: ${consoleErrors.join('; ')}`).toEqual([]);
});
