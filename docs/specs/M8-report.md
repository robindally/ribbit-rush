# M8 report: UI, settings, and input polish

Implemented by the Sonnet engineer against `docs/specs/M8-ui-input.md`, `docs/ART_BIBLE.md`
sections 1, 8, and 9, `docs/ARCHITECTURE.md` sections 4 and 5, and `docs/specs/M7-report.md`/
`M6-report.md`/`M5-report.md` (the pre-M8 scenes, `fx/transitions.ts`, the audio API, the
`reduceMotion` plumbing, and the dev hooks). Not committed - Fable reviews and commits, per
instructions.

## What was built

Every deliverable in the spec: a reusable UI kit (`src/render/ui.ts`) with Button/Slider/
Toggle/Card and a `FocusManager` that keyboard, gamepad, and pointer all drive; a finished Title
per the bible's composition paragraph; polished Level intro, Pause, Game Over, and a new Results
screen; a Settings screen with live-preview sliders, a reduce-motion toggle, key remap, an
on-screen d-pad toggle, and reset-best-scores; first-class touch (on-screen d-pad, pause button,
swipe/tap already existed) and gamepad (d-pad/stick/A/B/Start, edge-detected, now unit-tested);
and layout/accessibility passes (page-level letterbox vignette, reduce motion honoured in the new
Results animation too).

### 1. UI kit (`src/render/ui.ts`, new)

- **Button**: pill, accent fill, 4px 22%-darker bottom edge, 2px press-down, 3px cream focus ring
  - exactly ART_BIBLE.md section 8. **Slider**: track + knob, drag or arrow-key/gamepad-stick
  adjust. **Toggle**: sliding knob. **Card**: the same rounded-24px/cream-96%/accent-stripe
  treatment every pre-M8 scene had already hand-rolled, now centralised - `pause.ts`,
  `gameOver.ts`, `leaderboard.ts`, `levelIntro.ts`, `results.ts`, `settings.ts`, and `howToPlay.ts`
  all call it.
- **`FocusManager`**: one instance per menu scene. Keyboard/gamepad drive it through the *same*
  `InputAction` stream everything else already used (`handleAction(a)`, called from a scene's own
  `onAction`) - up/down move focus, left/right adjust a focused slider, confirm activates, back/
  pause cancels. Pointer (mouse + touch) is read directly off the canvas via its own
  mousedown/mousemove/mouseup/touchstart/touchmove/touchend listeners, converting client
  coordinates to the renderer's logical 624x720 space, since a click needs real coordinates an
  `InputAction` doesn't carry.
- Every control's rect is registered with `core/input.ts`'s touch-exclusion stack, so a tap on a
  button never *also* fires a swipe/tap gameplay hop for the same gesture.
- `window.__rr.ui.current` (a live getter, same "live getters, not a snapshot" precedent
  `audio.devHook()` set in M5) exposes whichever menu's `FocusManager` is on top of the scene
  stack, for a reviewer/test script to drive or inspect directly.

### 2. Title (`src/scenes/title.ts`, rewritten)

Composition per the spec's own paragraph, top to bottom: the logo (1.5x frog tucked behind the
first R - see "Deviations" #1 for the fix), an animated river band, a road strip carrying a slow
four-vehicle parade (reusing the real `drawLaneMovers` pipeline, not a fake), a grass bank (reusing
`draw/background.ts`'s own tuft-stripe renderer, now exported) with the 3x idle-breathing hero
sitting on it, then five `FocusManager` buttons: Start, Endless (locked with a lock glyph and
"Reach level 15" hint until `save.bestLevel >= 15`; pressing it once unlocked shows a "Coming
soon!" toast - M9 wires the real mode), Leaderboard, Settings, How to play. Enter/Space with
nothing focused still starts the game (`FocusManager.handleAction` returns `false` when nothing is
focused, and `TitleScene.onAction`'s own fallback starts the run on `confirm` in that case) -
verified against the reviewer's own harness, see "How this was verified".

### 3. Level intro, Pause, Game Over, Results, Leaderboard, How to play

- **Level intro** (`levelIntro.ts`): restyled onto `drawCard`; hazard icons now carry a short text
  label under each one (e.g. "Turtles", "Oil slick"); a pulsing "TAP OR PRESS TO GO!" hint (the
  spec's "'Go!' on dismiss").
- **Pause** (`pause.ts`, rewritten): Resume, Restart level, Settings, Quit to title, 60% dim
  (`rgba(10,10,20,0.6)`). "Restart level" reloads the current level via `World.jumpToLevel` on the
  same level number (keeps score/lives, resets homes/timer/frog). "Quit to title" surfaced a real
  bug in `core/loop.ts` - see "Deviations" #2.
- **Game Over** (`gameOver.ts`, restyled): the M7 stats and arcade name entry kept exactly as they
  worked (still bypasses the normal `InputAction` pipeline while entry is active, for the same
  reasons M7's report documented), now on a `drawCard` with Retry/Title buttons (disabled, via the
  kit's own `disabled` state, until a qualifying name entry is confirmed).
- **Results** (`results.ts`, new): pushed by `PlayScene` the instant a level clears, *instead of*
  the usual level-intro auto-push (see "Deviations" #3 for the event-timing trick this needed).
  Time bonus counts up with a `tick` SFX per newly-lit pad, five lily pads light in sequence, and -
  only when the new level's world differs from the old one - "NEXT WORLD: <name>" plus an accent
  swatch fades in over 1s. Any input skips the current animation to its end, then a further input
  advances to the usual level-intro card (so the reviewer's playbot, which only ever sends hops,
  gets through it exactly like it already gets through `LevelIntroScene`).
- **Leaderboard**/**How to play**: restyled onto the kit; How to play is one card with a controls
  list and exactly three tips, dismissible via its Back button, Escape/B, or any input.

### 4. Settings (`src/scenes/settings.ts`, new)

Master/Music/SFX sliders (0-100, live: each `onChange` calls `audio.set*Volume` immediately, SFX
also plays a throttled `hop` for an audible preview), Reduce motion toggle (calls all three
`fx/*.ts` `setReduceMotion`s), on-screen d-pad toggle, six key-remap rows (Up/Down/Left/Right/
Confirm/Pause - press the row, then press a key; Escape cancels), and Reset best scores (press
once arms a 3s "CONFIRM RESET?" state, a second press within that window clears `hiScore` and
`leaderboard`). Everything writes through `core/save.ts`'s `writeSave` immediately. Reachable from
the Title or from Pause; it's just pushed on the stack, so popping it returns to whichever opened
it.

### 5. Touch (`src/scenes/play.ts`, `src/core/input.ts`)

Swipe (24px) and tap-hops-up already existed pre-M8 and were left untouched (verified still
working via a real CDP-dispatched swipe - see "Phone findings"). New: an on-screen d-pad (default
on for a touch-capable device, `core/save.ts`'s `SaveSettings.onScreenDpad`, toggle in Settings) -
four 56px translucent buttons with press feedback, laid out as a compact plus/cross (not a single
row - see "Deviations" #4), and a pause button top-right on touch devices. `touch-action: none` on
the canvas (no scroll/pinch) already existed in `index.html` and needed no change.

### 6. Gamepad (`src/core/input.ts`, refactored)

D-pad + left stick (0.5 deadzone) with edge detection already worked pre-M8 for hop/confirm/pause;
`B` -> `back` is new. The mapping itself was pulled out into small pure functions with no
`Gamepad`/`navigator` dependency - `stickDir`, `readGamepadFrame` (one frame's held state),
`diffGamepadFrames` (rising-edge diff -> the `InputAction`s a poll emits) - so it's directly
unit-tested (see "Gamepad verification" below); `pollGamepad` is now a thin loop over
`navigator.getGamepads()` feeding this same pipeline. `render/ui.ts`'s `actionHint('confirm'|
'back')` shows a gamepad-style hint ("(A)"/"(B)") in the Title's own prompt once
`getLastInputDevice()` reports `'gamepad'` (tracked on every keyboard/touch/gamepad interaction).

### 7. Layout and accessibility

- Portrait-scales-to-width and letterboxing were already correct (`renderer.ts`'s
  `Math.min(viewportW/CANVAS_WIDTH, viewportH/CANVAS_HEIGHT)`); new this milestone is a page-level
  vignette (`render/ui.ts`'s `setPageVignette`, called every `PlayScene.render()` and from
  `TitleScene.enter()`) - a soft radial wash of the current world's `accentA` behind the canvas,
  replacing the flat backdrop, so the letterboxed area either side (or top/bottom, on a very tall
  phone) reads as world-coloured rather than plain navy.
- `visibilitychange` pause and resize-without-a-dropped-frame were already correct in
  `core/loop.ts`/`renderer.ts` and untouched.
- Focus ring on every control (the kit's own 3px cream ring); reduce motion now also covers
  `ResultsScene`'s own count-up/pad-stagger/world-reveal (not routed through any `fx/` module, so
  it reads `fx/transitions.ts`'s flag directly via a new `isReduceMotion()` getter and runs those
  animations at 25% duration rather than skip them outright).
- The HUD timer bar already both recoloured *and* shrank (`Math.max(barH, barW * pct)` in
  `draw/hud.ts`, pre-M8, unchanged) - checked per the spec's explicit callout, no bug found.

### 8. Dev hooks

`window.__rr` keeps `world`, `scenes`, `fx`, `audio`, `powerups`, `jumpToLevel` exactly as before.
Added `window.__rr.ui.current` (the active `FocusManager`, live getter - see section 1).

## Screen list and how to reach each

| Screen | How to reach |
| --- | --- |
| Title | Boot / any "Title" button |
| Level intro | Automatic on every level start (first level, level clear, dev jump) |
| Play | Title's Start, Game Over's Retry, Results -> next intro card |
| Pause | Escape/P/gamepad Start/touch pause button, during Play |
| Results | Automatic the instant a level's 5th home fills |
| Game Over | Automatic when the last life is lost |
| Leaderboard | Title's Leaderboard button |
| Settings | Title's or Pause's Settings button |
| How to play | Title's How to play button |

All nine reachable and returning correctly - verified interactively (see below) for every one,
including the nested Pause -> Settings -> back -> Pause case, which is where a real bug turned up
(see "Deviations" #5).

## Deviations from the spec, and why

1. **The logo frog is clipped to a fixed band, not left to the letter's own alpha to occlude it.**
   Pre-M8, the 1.5x frog was drawn once, relying on the R glyph's own ink to hide the rest of its
   body - but the glyph doesn't cover the frog's full width, so the body still jutted out to the
   sides (the bug the spec called out by name). Fixed by clipping the frog's draw call to a
   `peekPx`-tall band (30% of its height) sitting immediately above the glyph's own top edge, then
   drawing the logo on top as before - the clipped sliver (eyes + top of head) reads as "behind the
   letter" regardless of the glyph's exact shape, and nothing below the clip band is ever drawn at
   all, so there is no dependency on ink coverage.
2. **`core/loop.ts`'s `Scenes.replace` now tears down the whole stack, not just the top scene** -
   a real, if previously unexercised, bug. Pre-M8, every call site only ever had one scene on the
   stack when it called `replace` (Title -> Play, Play -> GameOver, GameOver -> Title), so popping
   just the top was indistinguishable from popping everything. M8's Pause "Quit to title" is the
   first call site with a *deeper* stack ([Play, Pause]) - the old code would exit only Pause,
   silently discarding PlayScene without ever calling its own `exit()` (leaking its `gameEvents`
   subscription, leaving the ambient horn enabled, and skipping the new best-level recording).
   Fixed by looping pop-and-exit over the whole stack before installing the new scene; every
   pre-M8 single-scene call site is unaffected (same final state either way).
3. **Results is inserted by intercepting `PlayScene`'s own `levelClear` handler, not by changing
   `World`.** `World.resolveHomeLanding()` emits `levelClear` (still carrying the *old* level
   number) and then synchronously calls `loadNextLevel()` in the very next statement - so the
   event handler is the only place that can grab the "just cleared" theme/level before the world
   moves on. `PlayScene` stashes that snapshot (`pendingResults`); its own level-number-changed
   check (which pre-M8 always auto-pushed `LevelIntroScene`) now pushes `ResultsScene` instead
   *when* a snapshot is pending, and `ResultsScene` itself pushes the usual `LevelIntroScene` when
   dismissed. No `World`/event-shape changes were needed.
4. **The on-screen d-pad is a compact plus/cross cluster, not a single row of four.** The spec's
   literal "translucent chunky buttons... in the bottom HUD band" read most naturally as a single
   row, but that overlapped the HUD's own lives icons (bottom-left) at every viewport size tested
   - confirmed via a real touch tap landing on both the "left" d-pad button and a lives icon at
   once. The cross layout (up on top, left/down/right in a row) clears both the lives icons and
   the timer bar with margin to spare, at the cost of bleeding slightly into the start-bank row
   above the HUD band - the same kind of translucent overlay-over-gameplay tradeoff the pause
   button already makes.
5. **A real interaction bug found and fixed while building the kit: a covered menu's raw pointer
   listeners kept acting even while it was hidden.** `Scenes.push` (Pause -> Settings) never calls
   `exit()` on the scene underneath, so `PauseScene`'s `FocusManager` stayed attached the whole
   time Settings was open - and since Pause's and Settings' card layouts both centre on the canvas,
   their button rects overlap in absolute coordinates. Clicking a Settings row (e.g. a key-remap
   button) also landed inside Pause's own "Resume" rect underneath, and Pause's *first-registered*
   listener fired first, popping Settings straight back off. Fixed with a small input-owner stack
   (`core/input.ts`'s `pushInputOwner`/`popInputOwner`/`isTopInputOwner`, the same shape as the
   pre-existing touch-exclusion stack): every raw listener owner (`FocusManager.attach`,
   `PlayScene`'s on-screen buttons, `LevelIntroScene` as a placeholder so Play's d-pad stays silent
   under it) registers a token and only acts while it's the top of that stack, even though every
   owner's DOM listeners stay registered the whole time. Caught by driving the interactive Browser
   pane through the exact Pause -> Settings -> remap path with real dispatched pointer events, not
   by code review - see "How this was verified".
6. **The Playwright "iPhone 12" device descriptor installed in this project (`playwright@1.63`) is
   a 390x664 viewport (390x844 screen), not 375x812.** Apple's own iPhone 12 CSS viewport is
   390x844; 375x812 is the iPhone X/11 Pro/12 Mini's. Used the named descriptor exactly as the
   acceptance criteria calls it out ("the iPhone 12 device descriptor"), rather than hand-rolling a
   375x812 context under a different device's name.
7. **A plain tap on blank Title space no longer starts the game** (pre-M8/M7 behaviour). Now that
   there are real Start/Endless/Leaderboard/Settings/How-to-play buttons, a blank-area tap just
   moves keyboard/gamepad focus (harmless) rather than falling through to "any tap starts the
   game"; a tap that actually lands on the Start button still starts it immediately via the kit's
   own pointer handling. Only `Enter`/`Space` with nothing focused keeps the old "start from
   anywhere" behaviour, per the acceptance's own explicit wording.
8. **`Results`'s "time bonus" is a presentational recap, not new score.** Each home landing already
   grants its own time-based bonus the instant it happens (`homeScore`, unchanged); the spec's "time
   bonus counts up with ticks" reads as a capstone animation for the level just cleared, not a
   second grant, so `ResultsScene` computes `floor(timeLeft at clear) * HOME_TIME_BONUS_PER_S` purely
   for display and never calls back into `World`/`addScore`.

## Phone findings

`node scripts/m8-phone.mjs --secs 30` (the "iPhone 12" descriptor, touch-only end to end):

- Tapped the Title's real Start button (via `page.touchscreen.tap`, coordinates read from
  `window.__rr.ui.current`'s own control rects - not `window.__rr.world` poking).
- Tapped through the level-1 intro card.
- A genuine drag-style swipe (CDP `Input.dispatchTouchEvent`, `touchStart`/`touchMove`/`touchEnd` -
  a plain `touchscreen.tap` can't express a drag) 60px up from mid-field hopped the frog forward
  one row, confirming the swipe gesture (not just the d-pad) works on this viewport.
- The rest of the run was driven entirely by tapping the on-screen d-pad's four buttons (a small
  heuristic reactive to lane state, adapted from `scripts/playbot.js`'s own safe-lane math since
  that script's `press()` is keyboard-only) - two home slots filled, score climbing to 1190+ over
  repeated runs, zero console errors in every run.
- `docs/screens/m8-phone.png`: mid-game, on-screen d-pad visible bottom-centre with the "up" button
  mid-press, 2 of 5 homes filled, pause button clean of the "HI <score>" text (see "Deviations"
  note on that button's position below), lives shown as "5 icons + xN" once past 5 (the pre-M8 HUD
  convention, unaffected).
- Also confirmed (found during phone testing and fixed): the pause button's original top-right
  position (`x: CANVAS_WIDTH-46, y: 6`) overlapped the HUD's own right-aligned "HI `<score>`" text.
  Moved it below that text row (`y: 40`) - both are legible now, at the cost of a small bleed into
  the home row underneath (translucent, same tradeoff as the on-screen d-pad's own bleed into the
  start bank).
- `docs/screens/m8-phone-01-title.png`/`m8-phone-02-dpad.png` (extra, not required) show the Title
  and the on-screen d-pad right after the intro card dismisses.

## Gamepad verification

No physical or virtual gamepad was available in this environment (no `navigator.getGamepads()`
device to poll, and no OS-level virtual-controller tooling reachable from here). Per the spec's own
acceptance fallback, unit-tested the mapping instead: `tests/gamepad.test.ts` (17 tests) exercises
`stickDir`'s 0.5 deadzone boundary and all four cardinal directions plus diagonal tie-breaking,
`readGamepadFrame`'s button-index mapping (12-15 d-pad, 0/1 A/B, 8-or-9 Start) and stick-merge,
and `diffGamepadFrames`'s rising-edge behaviour (fires once on press, nothing while held, nothing
on release, `prev = null` treated as a rising edge, multiple simultaneous new directions in a
fixed order, and a full three-frame press-hold-release cycle hopping exactly once). This is the
exact pipeline `pollGamepad` runs every frame; the only untested part is `navigator.getGamepads()`
itself, which is a browser API this project doesn't own.

## How this was verified

`npm run typecheck`, `npm run lint` (0 errors; the same 7 pre-existing-style `no-console` warnings
in one-off `.mjs` scripts M5-M7's reports already documented, plus the same pattern in the two new
`m8-*.mjs` scripts), `npm test` (12 files, **191 tests** - 162 carried over from M0-M7 plus 29 new:
`tests/gamepad.test.ts` (17), 6 key-remap cases appended to `tests/input.test.ts`, and 6
`isEndlessUnlocked`/`recordBestLevel` cases appended to `tests/save.test.ts`), and `npm run build`
all pass clean.

Runtime verification used a dev server on port 5174 (`npm run dev -- --port 5174`, stopped before
finishing - confirmed via `netstat` that only the reviewer's own 5173 remained listening
afterward), plus the interactive Browser pane for exploratory testing:

1. **The interactive Browser pane**, driving real dispatched `MouseEvent`/`KeyboardEvent`s at
   precise logical-to-client coordinates (computed the same way `render/ui.ts` itself does) rather
   than eyeballed screen pixels - this is what caught Deviation #5 (the covered-menu pointer bug):
   Pause -> Settings -> tapping a key-remap row was popping Settings back to Pause, traced to two
   `FocusManager`s reacting to the same click, fixed, then re-verified the exact same sequence
   landed correctly on `SettingsScene` with `awaitingBind: 'up'`. Also exercised: Title keyboard
   navigation (arrow-key focus, Enter activates, lock/disabled Endless bonks instead of
   navigating), the full key-remap round trip (bind `KeyJ` to "up", confirmed it persisted to
   `localStorage`, confirmed the *new* key hopped the frog in real gameplay while the *original*
   `ArrowUp` kept working too), Settings sliders/toggles via real clicks, Reset best scores'
   two-step confirm, a forced Results screen (via `World.resolveHomeLanding()` called directly with
   a real level clear's home/timer state) both with and without a world change (confirmed the
   "NEXT WORLD" reveal and its swatch), Game Over's full name-entry -> leaderboard round trip,
   Retry and Quit-to-title (confirmed `bestLevel`/`hiScore` persisted correctly via
   `localStorage`), and How to play/Leaderboard rendering.
2. **`node scripts/m8-screens.mjs`**: `docs/screens/m8-title.png`, `m8-settings.png`,
   `m8-results.png` (captured mid-world-reveal, level 3 -> 4, world 1 -> 2), `m8-gameover.png` - all
   via the dev hook forcing state the same way `scripts/m7-screens.mjs` already did for M7's own
   power-up screenshots. Zero console errors.
3. **`node scripts/m8-phone.mjs`** - see "Phone findings" above.
4. **`node scripts/review.mjs --secs 15`** against the reviewer's own port 5173 (never stopped or
   reconfigured, confirmed listening before and after): starts from the Title via a real `Enter`
   keypress, plays, zero console errors.

## Known gaps

- **Gamepad hardware/emulator verification** wasn't possible in this environment - see "Gamepad
  verification" above for the unit-test-only fallback the spec itself allows.
- **`actionHint`'s gamepad glyphs are used in only one place** (the Title's own "Enter or tap
  Start" hint). The spec's "glyphs in prompts when a pad was the last input" is satisfied at that
  one call site but wasn't threaded through every other screen's own hint text (Pause, Settings,
  etc.) given the milestone's scope - the helper is exported and ready for a follow-up to reuse.
- **HUD legibility at exactly 360px CSS width wasn't screenshotted separately** - verified at the
  iPhone 12 descriptor's 390px instead (see "Deviations" #6); the same fit-by-width scaling applies
  at any narrower width, but the text was not independently re-measured at 360px.
- **`docs/ARCHITECTURE.md` section 2's folder listing doesn't mention `render/ui.ts` or
  `scenes/howToPlay.ts`** (it already anticipated `results.ts`/`settings.ts` verbatim). Not
  updated, matching the precedent M4/M5's reports already set for files the architecture doc's
  fixed list didn't anticipate.
- **The Results screen's pad-lighting and world-reveal are cosmetic only** - see Deviation #8;
  `RunStats`/leaderboard scoring is entirely unaffected.
- Everything M5-M7's own "Known gaps" already listed and this milestone didn't touch (no dedicated
  SFX for the lady frog's pickup, Freeze Frame's subtle vignette, etc.) is still open, unchanged.

## Command output

`npm run typecheck`, `npm run lint` (0 errors, 9 pre-existing-style `no-console` warnings across
one-off `.mjs` scripts), `npm test` (12 files, **191 tests**), and `npm run build` all pass clean.
No git commit made, per instructions.
