import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  test: {
    // M10 spec: "A Playwright smoke test... run with a separate `npm run e2e` script, not part of
    // `npm test`." Vitest's own default include glob matches `*.spec.ts` too, which would
    // otherwise pick up tests-e2e/smoke.spec.ts and fail outright (Playwright's `test()` refuses
    // to run outside its own runner) - scope `vitest run` to this project's actual unit tests only.
    include: ['tests/**/*.test.ts'],
    // M10 spec: "coverage with @vitest/coverage-v8 (add tests where a pure module is under 70%
    // lines)". ARCHITECTURE.md section 13's own testing rule is "No canvas or audio in tests" -
    // so the coverage *report* scopes to the pure/testable surface (game/ logic, the small pure
    // core/ modules, and render/anim.ts and game/themes.ts, both explicitly pure per their own
    // header comments) rather than counting canvas-drawing (render/draw/**, render/renderer.ts,
    // render/sprites.ts, render/ui.ts, render/touchControls.ts), scene wiring (scenes/**), fx
    // (self-subscribing GameEvent -> Canvas2D modules), Web Audio (core/audio.ts, src/audio/
    // music.ts - music-data.ts is pure data and stays in scope), the RAF loop (core/loop.ts),
    // and the boot script (main.ts) against a bar the project's own rules never asked them to
    // meet. See docs/specs/M10-report.md for the resulting per-module table.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/game/**',
        'src/core/rng.ts',
        'src/core/save.ts',
        'src/core/events.ts',
        'src/core/input.ts',
        'src/render/anim.ts',
        'src/audio/music-data.ts',
      ],
      exclude: ['src/game/types.ts'],
    },
  },
});
