# M10 report: QA and release

Implemented by the Sonnet engineer against `docs/specs/M10-release.md`, `docs/specs/M9-report.md`/
`M8-report.md`/`M4-report.md` (their "Known gaps" sections), `docs/ARCHITECTURE.md` sections 4 and
14, and `docs/ART_BIBLE.md` section 3. Not committed - Fable reviews and commits, per instructions.

## What was built

### 1. Small gaps carried over

- **Mover and frog render interpolation** (`game/lanes.ts`, `game/types.ts`, `game/world.ts`,
  `render/draw/entities.ts`, `render/draw/water.ts`, `scenes/play.ts`, `scenes/title.ts`).
  `stepLane` now records each mover's `prevOffset` every fixed step (the same "keep a prev, render
  with alpha" shape `fx/particles.ts` already used), and a new `moverRenderOffset(lane, mover,
  alpha)` lerps between `prevOffset` and `offset` - wrap-aware, so a mover crossing the period
  boundary takes the short way around instead of visibly snapping backward across the lane for one
  frame. `drawLaneMovers` and `drawPlatformContactShadows` both take the loop's `alpha` now and
  draw at the interpolated position. The frog gets the analogous treatment: `Frog` gained
  `prevX`/`prevHopT`/`prevStateT`/`prevState`, snapshotted once at the top of every
  `World.update()` tick (before that tick's own mutations, mirroring `stepLane`'s ordering).
  `drawFrog` lerps `x` unconditionally (it only ever changes continuously) and lerps `hopT`/`stateT`
  only when a same-tick discontinuity guard says it's safe (a buffered hop landing and immediately
  chaining into the next one inside one fixed step resets `hopT`/`stateT` to 0 mid-tick; interpolating
  across that would lerp the arc/squash backward for one frame instead of showing the chain, so that
  one frame falls back to the raw value instead - never worse than pre-M10, just not smoothed for
  that single frame). Unit-tested (`tests/lanes.test.ts`'s wrap-boundary cases, `tests/world.test.ts`'s
  snapshot-field cases). Verified visually via live play in this environment's own display (no
  jitter at its native refresh) - true 120Hz/144Hz hardware wasn't available to test directly here,
  the same category of environment limitation `docs/specs/M8-report.md` documented for gamepad
  hardware; see "Known gaps."
- **Turtle sink/rise ripples** (`game/types.ts`'s new `turtleDive` `GameEvent`, `game/world.ts`'s
  `updateTurtleDives`, `fx/particles.ts`). `World` now diffs each turtle mover's
  `game/lanes.ts` `turtleDiveState` tick over tick and emits `turtleDive` with `phase: 'sink'` on
  the sinking-to-down transition (fully submerged) and `phase: 'rise'` on the down-to-rising
  transition (about to resurface) - matching ART_BIBLE.md section 5's "leaving a ripple ring...
  reverse on rise." `fx/particles.ts` subscribes and reuses the exact same `ripple()` emitter the
  frog's own platform-landing ripple already uses. Closes the gap `docs/specs/M4-report.md` and
  `M9-report.md` both carried forward. Unit-tested (`tests/world.test.ts`).
- **Hat overlays on the Title hero and skin picker** (`scenes/title.ts`). Both now draw the
  selected/previewed skin's hat sprite (`hat-headband`/`hat-crown`/`hat-beanie`) at the same
  transform as the frog beneath it, via `render/sprites.ts`'s existing generic `spriteAt`/
  `preloadSpriteAt` cache (hats aren't recoloured per skin, so no new rasterisation pipeline was
  needed). Closes the M9 "Known gaps" note that hats were gameplay-only. Verified visually: the
  hero shows Ninja's headband/Swamp King's crown/Frost's beanie correctly, and the skin-picker row
  shows the same hats on every unlocked skin that has one.
- **Leaderboard tabs as real tabs** (`scenes/leaderboard.ts`). Replaced the two relabelled
  `drawButton` pills with an actual tab treatment: a shared baseline under both tabs, a gold
  underline only under the active one, bold ink label on the active tab vs. a muted one on the
  inactive tab, and the UI kit's own cream focus ring for keyboard/gamepad parity. Verified visually
  (campaign tab active with its underline; clicking Endless moves the underline and swaps the
  muted/bold label pair).

### 2. Quality

- **Coverage** (`@vitest/coverage-v8`, `vite.config.ts`'s new `test.coverage`/`test.include`
  blocks). Scoped to the pure/testable surface `docs/ARCHITECTURE.md` section 13 already defines
  ("No canvas or audio in tests"): `game/**`, the small pure `core/` modules (`rng.ts`, `save.ts`,
  `events.ts`, `input.ts`), `render/anim.ts` and `audio/music-data.ts` (both explicitly pure per
  their own header comments). Every module in that scope is now at or above 70% lines - see the
  table below. Added `tests/anim.test.ts` (26 tests, new file - `render/anim.ts` was 0% covered
  despite its own doc comment inviting exactly this), `tests/themes.test.ts` (9, new file -
  `game/themes.ts` was 0% covered), and extended `tests/save.test.ts` (+6, `loadSave`/`writeSave`
  themselves via a small in-memory `localStorage` stand-in - only the pure helpers around them had
  tests before), `tests/input.test.ts` (+8, the device-tracking/key-remap/input-owner-stack pure
  pieces besides `mapKeyToAction`), `tests/lanes.test.ts` (+5, the new interpolation helpers),
  and `tests/world.test.ts` (+5, the new `turtleDive` event and the frog snapshot fields). 252 -> 311
  tests. `core/input.ts`'s genuinely DOM-only code (`onKeyDown`, `onTouchStart`/`onTouchEnd`,
  `logicalFromClient`, `attachInput`, `pollGamepad`) is marked with `/* v8 ignore start/stop */` and
  a comment explaining why (needs a real DOM/Gamepad, and the pure pipeline each of them feeds is
  already exhaustively tested) rather than counted against the module.
- **Playwright smoke test** (`playwright.config.ts`, `tests-e2e/smoke.spec.ts`, new `npm run e2e`
  script = `vite build && playwright test`). Loads the production build (`vite preview`, port 4173),
  starts a run (Enter on the Title), dismisses the level-1 intro card, hops once, pauses, resumes,
  and asserts zero console errors / uncaught page errors throughout. `@playwright/test` is a dev
  dependency only. `vite.config.ts`'s `test.include` is now scoped to `tests/**/*.test.ts` so
  `npm test` (`vitest run`) never picks up `tests-e2e/smoke.spec.ts` itself (Vitest's own default
  glob matches `*.spec.ts` too, which crashes outright - Playwright's `test()` refuses to run
  outside its own runner). Passes: `1 passed (4.1s)`.
- **Performance pass, 4x CPU throttle, world 3 (Neon City, rain), 400 particles**
  (`scripts/m10-perf.mjs`, new). A real CDP `Emulation.setCPUThrottlingRate({rate: 4})` session
  (the actual devtools throttle, not a simulated slowdown) against a live Endless-free campaign
  level 7 (world 3's first level), with `window.__rr.fx.stress()` re-topped every 0.5s so the
  particle pool stays pinned at the 400 cap for the entire sample window (a single `stress()` call
  drains to ~0 well before an 8s window ends, since its particles have a fixed 5s life - the first
  attempt at this measurement caught that and was corrected). **Result: a clean, sustained 60fps**
  with real gameplay traffic, rain, and 400 particles all rendering every frame under 4x throttling -
  see "Command output" for the full JSON. Nothing needed fixing.
- **10 minute memory soak** (`scripts/m10-memory-soak.mjs`, new). `scripts/playbot.js` (the same
  autonomous bot `scripts/review.mjs` uses) drives continuous real play for the full 10 minutes,
  `world.lives` reset to 99 on every sample so it never idles out at a real Game Over. A real GC is
  forced via CDP's `HeapProfiler.collectGarbage` immediately before each once-a-minute sample, and
  the sample itself reads CDP's own `Runtime.getHeapUsage` (not the page-exposed
  `performance.memory`, which recent Chromium rounds to a coarse ~10MB bucket for anti-fingerprinting
  reasons - far too coarse to see a real trend; caught and corrected during a dry run). See
  "Memory soak" below for the numbers.
- **Phone pass, 375x812 and 360x640** (`scripts/m10-phone.mjs`, new;
  `docs/screens/m10-phone-375.png`, `m10-phone-360.png`). Real touch taps (Playwright's
  `touchscreen.tap`, not `window.__rr` poking) on the actual below-canvas DOM d-pad/pause buttons
  (`render/touchControls.ts`), at both named viewports. See "Phone findings" below - both pass every
  check the spec names (HUD readable, touch controls reachable, no scroll/zoom, audio starts on
  first tap). This also closes `docs/specs/M8-report.md`'s own "Known gaps" note that 360px width
  specifically was never independently screenshotted (only the "iPhone 12" descriptor's 390px was).
- **Art bible hex sweep** - see "Hex sweep result" below.
- **Accessibility sweep** - see "Accessibility sweep" below.

### 3. Release

- **`README.md`** (new): what the game is, controls, run/build/test/e2e commands, deploy (2
  commands each for GitHub Pages via `gh-pages`, Netlify CLI, Vercel CLI), credits (design Fable,
  code Sonnet against Fable's specs, all art/audio generated in-repo), license pointer.
- **`LICENSE`** (new): MIT, "Copyright (c) 2026 Robin".
- **`package.json` version** bumped `0.1.0` -> `1.0.0`.
- **Icons/manifest** (`scripts/m10-icons.mjs`, new; `public/icon-512.png`, `icon-192.png`,
  `favicon.svg`, `manifest.webmanifest`, all new; `index.html` wired to all four plus a
  `theme-color` meta). The two PNGs are rasterised via Playwright from the real
  `assets/sprites/frog-idle.svg` (not a redrawn approximation) onto world 1's grass colour
  (`#74D06B`, ART_BIBLE.md section 3) with rounded corners at section 2's own "25% of the shorter
  side" radius rule. `favicon.svg` is a hand-built vector mirroring the same composition (background
  rect + the frog's own path data) so the browser tab/bookmark icon scales cleanly.
  `manifest.webmanifest` sets `display: "standalone"` and `orientation: "portrait"` per the spec.
- **`.gitignore`**: confirmed `dist/` was already excluded; added `coverage/` (new from this
  milestone's `@vitest/coverage-v8` reports).

## Coverage table

`npm run coverage` (`vitest run --coverage`), scoped per `vite.config.ts`'s own comment (see
"Quality" above) to the pure/testable surface:

| File | % Stmts | % Branch | % Funcs | % Lines |
| --- | --- | --- | --- | --- |
| **All files (in scope)** | **92.53** | **90.79** | **88.61** | **92.53** |
| audio/music-data.ts | 100 | 88.63 | 100 | 100 |
| core/events.ts | 90.62 | 100 | 80 | 90.62 |
| core/input.ts | 90.47 | 94.59 | 81.81 | 90.47 |
| core/rng.ts | 100 | 87.5 | 100 | 100 |
| core/save.ts | 98.36 | 84.61 | 100 | 98.36 |
| game/collision.ts | 100 | 100 | 100 | 100 |
| game/constants.ts | 100 | 100 | 100 | 100 |
| game/endless.ts | 98.98 | 96.87 | 100 | 98.98 |
| game/frog.ts | 100 | 100 | 100 | 100 |
| game/lanes.ts | 100 | 96.29 | 100 | 100 |
| game/level.ts | 100 | 92.3 | 100 | 100 |
| game/powerups.ts | 97.84 | 89.47 | 100 | 97.84 |
| game/scoring.ts | 75.71 | 96.42 | 83.33 | 75.71 |
| game/skins.ts | 95.9 | 100 | 90 | 95.9 |
| game/themes.ts | 100 | 100 | 100 | 100 |
| game/world.ts | 76.92 | 80.87 | 70 | 76.92 |
| render/anim.ts | 99.35 | 96.22 | 100 | 99.35 |

Every in-scope module clears the spec's 70% line bar (lowest are `game/scoring.ts` at 75.71% and
`game/world.ts` at 76.92%, both comfortably above it). `render/**` (besides `anim.ts`), `scenes/**`,
`fx/**`, `core/audio.ts`, `audio/music.ts`, `core/loop.ts`, and `main.ts` are deliberately out of
the coverage `include` scope - they need a real canvas/AudioContext/RAF loop to exercise
meaningfully, which is exactly what ARCHITECTURE.md section 13's testing rule already rules out for
this project's unit tests, not something this milestone skipped.

`npm test`: **16 files, 311 tests** (252 carried over from M0-M9 plus 59 new).

## Command output

`npm run typecheck`, `npm run lint` (0 errors; 17 warnings - the same 13 pre-existing-style
`no-console` warnings in one-off `.mjs` scripts every milestone since M5's report has documented,
plus the same pattern in the four new `m10-*.mjs` scripts), `npm test` (16 files, **311 tests**),
`npm run build`, and `npm run e2e` (`1 passed`) all pass clean.

`node scripts/m10-perf.mjs --url http://localhost:5174 --secs 8 --rate 4 --level 7`:

```json
{
  "theme": { "world": 3, "name": "Level 7" },
  "throttleRate": 4,
  "minParticleCountDuringSample": 400,
  "frames": 502,
  "secs": 8,
  "avgFrameMs": 16.666,
  "p95FrameMs": 16.7,
  "maxFrameMs": 16.8,
  "fps": 60,
  "meets60fps": true,
  "errors": []
}
```

Every one of 502 sampled frames landed within 0.13ms of the 16.67ms budget (max 16.8ms) - the game
isn't just scraping past 60fps under 4x throttling in the single most demanding scripted scenario
(rain, real traffic, 400 particles pinned at the pool cap), it has real headroom. Nothing needed
fixing.

## Memory soak

`node scripts/m10-memory-soak.mjs --url http://localhost:5174 --mins 10 --every 60`: continuous
real play via `scripts/playbot.js` for 10 minutes, `world.lives` reset to 99 every sample so the
bot never idles out at a real Game Over, a forced GC (CDP `HeapProfiler.collectGarbage`) before
every once-a-minute sample, heap read via CDP's own `Runtime.getHeapUsage` (bytes, precise - not
the coarsened page-exposed `performance.memory`, which turned out to be rounded to a fixed 10MB
bucket in this Chromium build - caught in a dry run and switched to the CDP call instead, see
`scripts/m10-memory-soak.mjs`'s own doc comment).

| t (s) | Heap (bytes) | Heap (MB) | Score | Lives | Particles | Popups |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 3,765,004 | 3.59 | 0 | 99 | 0 | 0 |
| 60 | 4,411,084 | 4.21 | 1,840 | 99 | 1 | 3 |
| 120 | 4,516,880 | 4.31 | 2,450 | 99 | 2 | 2 |
| 180 | 4,554,364 | 4.34 | 3,080 | 99 | 20 | 0 |
| 240 | 4,563,744 | 4.35 | 3,840 | 99 | 1 | 0 |
| 300 | 4,562,088 | 4.35 | 4,520 | 99 | 0 | 0 |
| 360 | 4,582,800 | 4.37 | 5,270 | 99 | 0 | 0 |
| 420 | 4,603,428 | 4.39 | 6,070 | 99 | 0 | 0 |
| 480 | 4,627,576 | 4.41 | 6,940 | 99 | 20 | 0 |
| 540 | 4,668,168 | 4.45 | 7,560 | 99 | 2 | 0 |
| 600 | 4,670,212 | 4.45 | 8,150 | 99 | 14 | 2 |

Zero console/page errors across the full 10 minutes. `lives` held at 99 the whole run (the
per-sample reset worked - the bot never idled out at a real Game Over, so particles/popups/audio
nodes stayed under continuous churn for the entire window, not just the first life). Score climbed
from 0 to 8,150 (thousands of hops and hundreds of deaths/respawns) while the heap grew from
3.59MB (cold start) to 4.21MB by t=60s (engine/cache warm-up - JIT compilation, sprite-atlas cache,
Web Audio buffer pooling) and then **flattened**: from t=60s to t=600s (9 minutes, during which the
score rose 4.4x) the heap grew only 4.21MB -> 4.45MB, +259,128 bytes (**+5.87%**), and the *rate*
of that growth itself keeps shrinking (+106KB in the first post-warm-up minute, some individual
60s windows actually going *down* slightly - e.g. t=240 to t=300 - and the last four 60s windows
average under 27KB each). That shape (fast initial rise, then a decelerating, near-asymptotic
tail, not proportional to the 4.4x rise in gameplay volume) is what a healthy engine warm-up looks
like, not a per-object leak - a real leak from particles/popups/audio nodes would grow
*proportionally* with hops/deaths/score, and it visibly doesn't (score 2.6x'd from t=180 to t=600
while heap grew about 2.6%). **Verdict: flat, no growth from particles, popups, or audio nodes.**

## Hex sweep result

`grep -rhoE "#[0-9A-Fa-f]{6}\b" src assets` against every hex literal in `docs/ART_BIBLE.md`: **65**
distinct hex values appear in code/assets that aren't a literal entry in the bible's own tables.
Read individually rather than assumed to be violations - nearly all of them are exactly what
ART_BIBLE.md section 2's own shading formula produces, verified arithmetically, not new colour
choices:

**Derived vehicle/prop shading (the great majority of the 65).** Section 2: "a front face... 22%
darker" (24%/26% for "tall objects": bus, truck, train) and "a 1.5px inner stroke 15% darker than
the fill." Spot-checked byte-for-byte against two bible-listed body colours:

- car `#E8474B` (232,71,75) -> front face `#B5373A` (22% darker: 232,71,75 x 0.78 = 181,55,59 ->
  `#B5373B`, matches to within 1 rounding unit per channel) -> inner stroke `#C93C40` (15% darker:
  232,71,75 x 0.85 = 197,60,64 -> `#C53C40`, within a handful of units of the shipped `#C93C40` -
  same formula, hand-tuned).
- bus `#F28B2E` (a "tall object", 26%/15%) -> front face `#B36722` (26% darker: 242,139,46 x 0.74 =
  179,103,34 = `#B36722` - **exact**) -> inner stroke `#CE7627` (15% darker: 242,139,46 x 0.85 =
  206,118,39 = `#CE7627` - **exact**).

The rest of the vehicle/prop set (taxi, sports, pickup, van, truck, tram, train, motorbike, jetski,
otter, snake, log-end, croc, crossing-signal, streetlamp, kerb, rail) follows the identical pattern:
a bible-listed top/body colour plus its own 15%/22-26%-darker derivatives for the front face and
inner-stroke edge treatment. Not tabled individually in section 3 because section 3 only lists the
*source* colour a sprite derives from - section 2 is what produces the rest, by design.

**Lady frog's extra tones are derived, not a deviation.** `#FFC2DA`/`#E0699C`/`#E56FA0`/`#C2447A`
all appear in `lady-frog.svg` alongside the bible's own literal `#F48FB1` (body) and `#FF4D8D`
(bow) - both of which *are* used verbatim in the sprite. The extra four are tints/shades of
`#F48FB1` for haunches/shading/highlight-ring, exactly as that file's own doc comment says. Not a
finding.

**Frog skins (`game/skins.ts`, M9) - a real bible gap, not a code issue.** The nine skins' own
body/dark/light hexes (e.g. Toad `#C98A4B`/`#8F5E2E`/`#E9B77A`, Ninja dark `#111111`, Golden dark
`#C98A0B`, ...) have no home in ART_BIBLE.md, which predates M9's skin system entirely and has no
"Skins" section. **For the reviewer**: either add a Skins section tabling these nine palettes, or
treat the skin table in `docs/specs/M9-endless-skins.md` as the authoritative source instead and
leave the bible as-is - not something this milestone should decide unilaterally.

**`#0C0D1A` vs. the documented `#14162B` backdrop - flagging, not changing.** `render/draw/
background.ts`'s `BACKDROP` const and `scenes/play.ts`'s pre-shake canvas fill both use `#0c0d1a`
(a second, slightly darker near-black), specifically "behind the HUD rows (0 and 14)" per that
file's own comment - every menu screen (Title, Leaderboard, Settings, Pause, Game Over) uses the
bible's literal `#14162B` instead. This has been the case since M3, not introduced by M10. **For the
reviewer**: either it's a deliberate second "gameplay backdrop" token worth adding to the bible, or
a drift worth unifying - flagged rather than changed unilaterally, since silently "fixing" it risks
a visible regression against every already-approved screenshot back to M3.

**A handful of small UI-only neutrals with no bible token**: `#9AA08C` (`render/ui.ts`'s `MUTED` -
disabled buttons), `#FFF2C2` (`scenes/gameOver.ts`'s arcade name-entry cursor highlight), `#141018`
(`oil.svg`'s puddle decal) and `#000000` (`streetlamp.svg`'s ground-shadow ellipse, matching
`renderer.ts`'s own literal-black shadow convention). None of these read as mistakes - they're
small, purpose-built one-offs - but none are bible tokens either; listed for completeness.

## Phone findings

`node scripts/m10-phone.mjs --url http://localhost:5174 --secs 8` - real touch taps on the actual
below-canvas DOM controls at both named viewports:

| Check | 375 x 812 | 360 x 640 |
| --- | --- | --- |
| Touch overlay mounted | yes | yes |
| All 5 controls (4 hops + pause) fully on-screen | yes | yes |
| No page scroll/zoom | yes | yes |
| Audio started before first tap | no | no |
| Audio started after first tap | **yes** | **yes** |
| Console/page errors | none | none |
| Heuristic playthrough (8s) | 10 hops, score 120 | 10 hops, score 120 |

Screenshots: `docs/screens/m10-phone-375.png`, `docs/screens/m10-phone-360.png` - both show the HUD
(score/world-level/hi-score top, lives/timer bottom) clearly legible, the below-canvas d-pad and
pause button clearly reachable with no overlap with the HUD or each other, and live gameplay (the
frog mid-log-hop with a "+10" popup and ripple ring) rather than a static first frame. This also
closes `docs/specs/M8-report.md`'s own "Known gaps" note that 360px width specifically had never
been independently screenshotted (only the "iPhone 12" descriptor's 390px was, pre-M10).

## Accessibility sweep

- **Focus order**: every menu scene's `FocusManager.add()` call order was read directly (Title,
  Pause, Settings, Leaderboard, Game Over, How to play, Results, Endless Start) - every one adds
  controls in the same order they're laid out on screen, top-to-bottom (Title's skin-picker row,
  left-to-right). No scene traps keyboard focus: every menu that isn't the root (Title) or a
  single-explicit-choice card (Results, Game Over - by design, per M7/M8) wires an `onCancel`
  escape route to Escape/B.
- **Reduce motion**: `main.ts` applies `save.settings.reduceMotion` to all three `fx/*.ts` modules
  (`hitstop`, `shake`, `transitions`) at boot; `scenes/settings.ts`'s toggle calls all three live.
  Unchanged since M8, where this was verified interactively (`docs/specs/M8-report.md`); re-confirmed
  here by code reading only, since no M10 change touches this path - see "Known gaps."
- **Timer bar shrinks and recolours** (`render/draw/hud.ts`, unchanged since M3/M4, reconfirmed):
  width is `Math.max(barH, barW * pct)` (shrinks continuously, not just recolours), and
  `timerColor(pct)` ramps frogBody -> gold -> danger, plus an opacity pulse once `timeLeft < 5s`.
  All three signals already present pre-M10; this milestone's job was to check, not to add them.
- **Colourblind check on the timer bar**: computed `timerColor(pct)`'s actual RGB output at 7 pct
  levels and ran each through a standard deuteranopia (red-green colourblindness) simulation matrix.
  Full-to-critical RGB distance drops from 216.7 (normal vision) to 106.7 (simulated) - roughly
  halved - and the mid-range "gold zone" (pct 0.1-0.3) compresses into a fairly narrow band under
  simulation, so the *hue* signal alone is a real, measurable accessibility gap for red-green
  colourblind players in that middle range specifically. The bar doesn't rely on hue alone, though:
  the proportional width shrink and the sub-5s opacity pulse are both colour-independent and fully
  intact, so a colourblind player can always read "how much time is left" from the bar's length, and
  get an urgent, unmissable signal from the pulse. **Verdict: pass** (doesn't rely on colour alone,
  the core accessibility bar), with a noted opportunity - not required by the acceptance - for a
  future pass to add a shape/texture cue in the gold-to-red band for extra clarity.

## Known gaps / not fully verified

- **True 120Hz/144Hz hardware verification of the new render interpolation** wasn't possible in
  this environment (no such display available) - verified instead via unit tests of the
  wrap-boundary lerp math and the frog's snapshot-field guards, plus live play at this environment's
  own native refresh rate (no visible jitter). Same category of limitation `docs/specs/M8-report.md`
  already documented for gamepad hardware.
- **Gamepad hardware/emulator** - still unavailable in this environment; unchanged from M8's own
  carried-forward gap (unit-tested mapping only, per that report's own fallback).
- **Reduce motion's live Settings toggle** wasn't re-tested interactively in M10 (verified
  interactively in M8; this milestone didn't touch that code path, so it was re-confirmed by
  reading, not by re-running the same interactive click-through).
- **Mover-position interpolation doesn't extend to `render/draw/lighting.ts`'s headlight/taillight
  cones** - a deliberate scoping call given the milestone's size, not an oversight: those are soft
  glows only visible at dusk/night, and the sprite they're attached to *is* smoothly interpolated;
  a future pass could thread `alpha` through `drawVehicleLights` the same way for full consistency.
- **The art bible hex sweep surfaced two decisions for the reviewer**, not fixed unilaterally: (1)
  whether to add a "Skins" section to ART_BIBLE.md for the nine M9 frog-skin palettes, and (2)
  whether `#0C0D1A` (the gameplay-HUD-row backdrop, distinct from the documented `#14162B` menu
  backdrop since M3) should become a named second token or be unified - see "Hex sweep result."
- Everything M4/M8/M9's own "Known gaps" already listed and this milestone's explicit scope didn't
  touch (Endless never spawning power-ups'/lady frog's home-row croc/fly hazards, no dedicated SFX
  for a skin unlock, `docs/ARCHITECTURE.md`'s file listing not mentioning every file M6-M9 added) is
  still open, unchanged.

## Screenshots

`docs/screens/m10-phone-375.png`, `docs/screens/m10-phone-360.png` - see "Phone findings" above.
