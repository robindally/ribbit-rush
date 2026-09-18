# M9 report: Endless mode and frog skins

Implemented by the Sonnet engineer against `docs/specs/M9-endless-skins.md`, `docs/LEVELS.md`'s
Endless section, `docs/ART_BIBLE.md` sections 3-4, and `docs/specs/M8-report.md`/`M7-report.md`
(the current Title, `ui.ts` kit, save shape, leaderboard, results/game-over flows, the theme
crossfade, and the dev hooks). Not committed - Fable reviews and commits, per instructions.

## What was built

Every deliverable in the spec: `game/endless.ts`'s pure crossing generator; `World` extended with
an Endless mode that never fills homes and hands off to a fresh crossing on any single landing;
the theme/difficulty spine, 1s palette crossfade, and `music.play(worldId)` on every 5th crossing;
the HUD's "CROSSING N" + difficulty badge; the unlock gate and the Title's Endless start card
(Daily seed / Random); nine frog skins recoloured by SVG string-replace, three hat overlays, a
Title skin picker, and skin persistence; a separate Endless leaderboard with a Campaign/Endless
tab on the Leaderboard screen; and unlock-toast checks wired into both Results and Game Over.

### 1. Endless generator (`src/game/endless.ts`, new)

Pure and unit-tested (`tests/endless.test.ts`, 26 tests):

- `makeEndlessCrossing(d, rng, worldId)` builds a 13-lane `LevelDef` (5 river, 5 road/rail/
  motorbike, 1 median, home, bank) per docs/LEVELS.md's own "Endless" section: river lanes pick
  from the 7-option {log, turtle, floe} x {w4/w3/w2} pool via `weightedPick`, weighted so width-2
  and turtle (diving) options grow likelier as `d` rises (`riverOptionWeight`); road lanes pick a
  vehicle from a per-world pool (`WORLD_VEHICLES`); one road lane is forced to motorbikes once
  `d > 1.6`, one has a 10% chance of becoming a rail lane once `d > 2.0`; river lanes get a 20%
  chance of an extra jetski/otter killer once `d > 1.8`, the median a 20% chance of a snake; oil
  hazard tiles (1-3) appear once `d > 1.5`. Every lane's period is `shrinkingPeriod` - drawn from
  `[COLS+width+2, COLS+width+7]` then shrunk (floored at `COLS+width`, the hard period rule) as
  `d` grows, matching "Period... shrinking with d."
- `endlessDifficultyForCrossing(n) = 1.2 + 0.04*(n-1)`, `endlessWorldForCrossing(n)` cycles 1-5
  every 5 crossings, `endlessTimeLimit(d) = max(14, 26 - 2*(d-1))`, `utcDateSeed(now)` - the UTC
  `YYYYMMDD` integer the Daily seed toggle uses.
- Tested for `d` in {1.2, 2, 3, 4} x every world id: period rule holds (`period >= COLS +
  laneMaxWidth`, reusing `game/lanes.ts`'s own helper), every lane kind/mover type is valid, river
  speeds stay <= 4.5 and road speeds <= 5.0 (docs/LEVELS.md's own caps), oil only appears past
  `d > 1.5` and never more than 3 tiles. Theme cycling and the difficulty spine are tested directly
  against the table above. Daily seed determinism: two independently-seeded `Rng`s built from the
  same `utcDateSeed()` produce byte-for-byte identical 4-crossing sequences (`toEqual` on the
  generated `LevelDef[]`).

### 2. World integration (`src/game/world.ts`)

- New public fields: `mode: 'campaign' | 'endless'`, `difficulty`. A private `crossingRng` - a
  second `Rng` stream, entirely separate from the existing per-attempt `rng` (home hazards/
  power-up rolls) - so the sequence of *generated crossings* depends only on how many crossings
  have actually been completed, never on how many attempts/deaths it took to get there. That
  separation is what makes the Daily seed reproducible in real play, not just in the pure
  generator test above: `createEndlessWorld(startDifficulty, seed)` seeds `crossingRng` from
  `seed + 1` and hands the *same* `Rng` instance into every later `loadNextCrossing()` call.
- `resolveHomeLanding()` branches once, right after the shared occupant/fly/lady-frog/home-score
  logic every landing already runs: in Endless mode, `100 * streak.multiplier` is added (label
  `+N CROSSING`, docs/LEVELS.md: "standard scoring plus 100 per crossing times the current streak
  multiplier"), then `loadNextCrossing()` fires immediately - no "every home filled" check, no
  `levelClear` event, ever. `loadNextCrossing` mirrors campaign's own `loadLevel`: bump the
  crossing counter (`levelNumber`, reused - see Deviations #1), regenerate `level`/`lanes`/`homes`
  from `makeEndlessCrossing`, clear train-warning state, `respawnFrogOnly()` (the frog back at the
  start bank, per spec).
- `createEndlessWorld(startDifficulty = 1.2, seed = Date.now())`, alongside the existing
  `createCampaignWorld`.

### 3. Scenes (`src/scenes/play.ts`, `endlessStart.ts` new)

- `PlayScene`'s constructor takes an optional 3rd argument, `{ startDifficulty, seed }`; present,
  it builds via `createEndlessWorld` instead of `createCampaignWorld`. `enter()` skips the level-
  intro card in Endless mode (the start card already served that role); `update()`'s level-clear/
  Results/intro-push block is now guarded to campaign mode only (Endless never reaches it - proven
  in `tests/world.test.ts`'s "never emits levelClear" case).
- The 1s palette crossfade (`private crossfade` field) starts the instant `world.level.world`
  changes while in Endless mode - the exact same condition that already re-triggers
  `music.play(worldId)`, so the two can't drift apart. `render()` blends `game/themes.ts`'s new
  `blendWorldTheme(from, to, t)` (every hex palette field lerped; `timeOfDay`/`weather`/`tint` snap
  to the new theme immediately - those don't have a meaningful "halfway" value) and, only while
  the crossfade is active, rebuilds the static layer *every frame* with the blended theme (a rare,
  1s-bounded cost - see Deviations #2) rather than only on a level-number change.
- `EndlessStartScene` (new): "ENDLESS MODE" card, a DAILY SEED toggle (shows today's UTC date when
  on) built on the shared `ui.ts` kit, Start/Back. Start computes `seed = daily ? utcDateSeed() :
  Date.now()` and replaces the scene with a fresh Endless `PlayScene`.
- `PlayScene.bankProgress()` (new, public): folds this run's progress into the save's lifetime
  skin-unlock stats - `lifetimeHomesFilled` (delta-tracked against `this.lifetimeHomesBanked` so
  repeat calls never double-count), `bestNearMissesInRun` (a running max), and, campaign only,
  `recordBestLevel`/`hiScore` - then returns whichever skins just crossed their unlock threshold.
  Called from three checkpoints: `ResultsScene.enter()` (a campaign level clear), the `gameOver`
  event handler (before `GameOverScene` is even constructed), and `PlayScene.exit()` (quitting
  mid-run via Pause) - the last one has no card to toast on, so its return value is discarded.

### 4. Frog skins (`src/game/skins.ts`, `src/render/skinSprites.ts`, both new)

- `SKINS`: the nine skins from the spec's table, each `{ body, dark, light, hat, unlock, hint }`.
  `isSkinUnlocked`/`unlockedSkinIds` are pure functions of a small `SkinUnlockStats` snapshot
  (`bestLevel`, `hiScore`, `lifetimeHomesFilled`, `bestNearMissesInRun`) - the same "pure unlock
  check over save-shaped data" precedent `core/save.ts`'s own `isEndlessUnlocked` already set.
- `recolorFrogSvg(svgSource, skin)`: string-replaces the five distinct fill colours
  `frog-idle.svg`/`frog-jump.svg` actually use - `frogBody`/`frogDark`/`frogLight` straight from
  the skin table, plus two tones the reference art also carries (a body/haunch "shade rim", the
  eye-ring/mouth ink) *derived* by darkening body/dark, the same pattern `lady-frog.svg`'s own
  hand-recoloured doc comment already used. Eye-white and pupil are deliberately left out of the
  recolour map - every skin keeps plain white/ink eyes, matching lady-frog.svg's own precedent.
  Classic's own table values equal the reference art's originals, so it short-circuits to the
  source unchanged (the *derived* shade/eyeRing tones don't reproduce Fable's hand-picked
  #4BB650/#2F7A3A byte-for-byte through a generic darken formula - see Deviations #3).
- `render/sprites.ts` gained `setAtlasSprite`/`setScaledSprite` (overwrite an already-rasterised
  cache entry by name/scale), `getRawSpriteSource`, and `rasterizeSvgSource` (plus an `alpha`
  parameter on the internal `rasterize`, for baking Ghost's 70% transparency straight into the
  pixels). `render/skinSprites.ts`'s `applySkin(skinId)` recolours+rasterises `frog-idle`/
  `frog-jump` and overwrites the main atlas's 1x entries *and* the two (name, scale) pairs the
  Title actually uses above 1x (`HERO_SCALE`, `LOGO_FROG_SCALE`) - every existing call site
  (`draw/entities.ts`'s `drawFrog`, `draw/hud.ts`'s lives icons, `scenes/title.ts`'s hero and
  logo-peek frog) reads through those same caches by name, so the whole game reskins with zero
  changes at any of them.
- Hats: three new sprites (`assets/sprites/hat-headband.svg`/`hat-crown.svg`/`hat-beanie.svg`,
  48x48, art confined to y >= 0 since a `viewBox="0 0 48 48"` clips anything above it) drawn in
  `draw/entities.ts`'s `drawFrog` at the *exact* transform the frog sprite itself just used (same
  `cx`/`y`/`rot`/scale), so it rides the hop squash/stretch and rotates with facing for free - see
  Deviations #4 for where hats don't show.
- `main.ts` applies `save.selectedSkin` once at boot, before the Title's first render (a no-op for
  the default 'classic'). `TitleScene` gained a skin-picker row (one `FocusManager` control per
  skin, small recoloured `frog-idle` previews built once via the same recolour pipeline at a
  smaller scale, falling back to a flat colour disc for the frame or two before they land): tapping
  an unlocked swatch persists `save.selectedSkin` and calls `applySkin` immediately; a locked one
  shows its hint as a toast (the same toast the pre-M9 Endless button used for its own stub).

### 5. HUD, Leaderboard, unlock toasts

- `draw/hud.ts`'s `HudState` gained `mode`/`crossing`/`difficulty`; in Endless mode the centre
  label becomes "CROSSING N" and a small pill badge (`dX.X`) appears underneath it.
- `core/save.ts` gained `EndlessLeaderboardEntry` (`name`/`crossings`/`score`/`date`),
  `endlessLeaderboard`, `selectedSkin`, `lifetimeHomesFilled`, `bestNearMissesInRun` (all
  guarded/defaulted in `loadSave`, so an M8 save blob upgrades cleanly - verified live, see "How
  this was verified"), and pure `qualifiesForEndlessLeaderboard`/`insertEndlessLeaderboardEntry`
  (sorted by crossings, score as the tiebreaker) mirroring the campaign pair exactly.
- `GameOverScene` takes an optional `{ crossings }` and a `SkinDef[]` (both supplied by
  `PlayScene`'s `gameOver` handler, which calls `bankProgress()` *before* constructing this scene):
  present, it qualifies/inserts against the Endless board instead of the campaign one, and its
  stats line reads "Crossings N" instead of "Level N". hiScore/bestLevel/lifetime-stat writes moved
  out of this scene's constructor entirely (now solely `bankProgress()`'s job - see Deviations #5).
  A "New skin unlocked: X!" line renders whenever the list is non-empty.
- `ResultsScene` calls `this.under.bankProgress()` in `enter()` (campaign only - Endless never
  constructs this scene) and shows the same toast line on the card.
- `LeaderboardScene` gained a CAMPAIGN/ENDLESS tab pair (plain `FocusManager` buttons); the Endless
  table shows rank/name/"N crossings"/score/date.

### 6. Dev hooks

```js
window.__rr.endless.start(d);  // replaces the current scene with a fresh Endless run at difficulty d (default 1.2)
window.__rr.endless.d;         // the live World's current difficulty, or null outside an active Endless run
window.__rr.skins.names;       // every skin id, in table order
window.__rr.skins.unlockAll(); // forces every skin's unlock stat past its own threshold (never lowers one already higher)
window.__rr.skins.select(name); // persists the choice and re-skins the live sprites immediately
```

Both installed in `main.ts` (available from the Title, not only once a `PlayScene` exists) and
merged the same `{ ...w.__rr, ... }` way every earlier milestone's own hooks were, so nothing from
M5-M8 (`audio`, `ui`, and `PlayScene`'s own `world`/`scenes`/`fx`/`jumpToLevel`/`powerups`) was
displaced.

## Deviations from the spec, and why

1. **Endless reuses `World.levelNumber` as its own crossing counter, rather than a separate
   field.** The spec doesn't name one explicitly, and `levelNumber` already means "which
   attempt/level is this" everywhere it's read (the static-layer rebuild cache key in
   `scenes/play.ts`, `RunStats.levelReached`, the HUD's `level`) - a second counter would have to
   be kept in lockstep with it for no real benefit. The one place this needed an explicit guard is
   `PlayScene.bankProgress()`, which never calls `recordBestLevel` (a campaign-only concept) in
   Endless mode - tested indirectly via `tests/world.test.ts`'s Endless cases confirming
   `levelNumber` advances as a crossing counter, and manually verified live (a forced Endless
   game-over correctly wrote to `endlessLeaderboard`, never touched `leaderboard` - see "How this
   was verified").
2. **The 1s palette crossfade rebuilds the whole static layer every frame it's active**, rather
   than only blending the live-drawn layers (water animation, HUD, lighting). The static layer is
   where the *dominant* colours actually live (grass/road/median/hedge base fills, baked once per
   level/crossing) - blending only the live layers would have left those snapping instantly, which
   reads as "no crossfade" for anything except the thin animated overlays. The cost (one full
   `buildStaticLayer` call per frame, ~60 over the whole crossfade) only happens on every 5th
   crossing, for 1 second - confirmed still holding a clean 60fps well past that point (`scripts/
   m9-perf.mjs`, see "Command output" - measured during steady-state play, not the crossfade window
   itself, since it's rare and 1s-bounded by construction, but the same static-layer builder runs
   on every ordinary level/crossing change today too, at the same cost per call).
3. **Classic's SVG recolour is a literal identity short-circuit**, not "recolour to the same
   values." `recolorFrogSvg`'s two *derived* tones (a shade rim, the eye-ring ink) are computed by
   darkening the skin's own body/dark by a fixed percentage - a reasonable automation of the
   pattern `lady-frog.svg`'s own hand-recolour already used, but not a byte-for-byte reproduction
   of Fable's hand-picked `#4BB650`/`#2F7A3A`. Running that formula on Classic's own body/dark
   would shift the *default* look very slightly - the one skin that must never look different from
   the reference art - so the function checks for exactly the original three values first and
   returns the source untouched.
4. **Hat overlays only render in gameplay (`draw/entities.ts`'s `drawFrog`), not on the Title's 3x
   hero or the skin-picker previews.** The spec's own wording ("frog-idle, frog-jump, and the HUD
   lives icon and title hero must all use the chosen skin, plus optional hat overlay sprites...")
   reads the colour requirement and the hat requirement as two separate sentences, and the HUD
   lives icons are small enough (0.42x) that a hat would be imperceptible there regardless. Given
   the milestone's scope, hats landed at the one place they're most visible and gameplay-relevant;
   flagged rather than threaded through the Title's own separate sprite path too - see "Known
   gaps."
5. **`GameOverScene` no longer writes `hiScore`/`bestLevel` itself** - that moved entirely to
   `PlayScene.bankProgress()`, called once, right before the scene is constructed. Pre-M9,
   `GameOverScene`'s own constructor did this directly; once Endless game-overs needed the *same*
   hiScore/lifetime-stat bookkeeping but explicitly *not* `recordBestLevel` (crossing counts aren't
   campaign levels), duplicating that branch inside the scene would have meant two places knowing
   "is this Endless" instead of one. `bankProgress()` already had to exist for the Results-screen
   checkpoint, so Game Over now just calls it slightly earlier than it used to construct its own
   state, rather than inventing a second copy of the same logic.
6. **Oil hazard tiles for Endless don't dedupe or avoid road lanes that were already assigned a
   rail/motorbike identity in the same crossing.** docs/LEVELS.md's "one to three tiles" doesn't
   specify placement beyond that; a uniform `(col, row)` pick across all five road rows, allowing
   an occasional duplicate, is the simplest reading and matches campaign levels' own oil tiles
   being handpicked without an explicit no-overlap rule either.
7. **Rail lane speed in Endless has no explicit cap** (docs/LEVELS.md's Endless section only caps
   river at 4.5 and road at 5.0, not rail) - capped at 9 by analogy to World 5's own campaign
   trains (which already run faster than the road cap, -7.0 to -9.1 across levels 13-15).

## Screenshots

`docs/screens/m9-endless.png`, `m9-skins.png`, `m9-endless-leaderboard.png` - all via
`scripts/m9-screens.mjs`:

```
node scripts/m9-screens.mjs --url http://localhost:5174
```

- `m9-endless.png`: a crossing forced to d=3 (`window.__rr.endless.start(3)`), "CROSSING 1" and
  the "d3.0" difficulty badge both visible in the HUD, oil decals and a motorbike lane on the road,
  turtles/logs on the river.
- `m9-skins.png`: the Title with a save seeded to `bestLevel: 10` (worlds 1-3 cleared) - Tree Frog,
  Poison Dart, and Ninja unlocked and shown at full brightness in the picker row; Toad, Swamp King,
  Frost, Golden, and Ghost still greyed/locked; Classic selected (gold ring).
- `m9-endless-leaderboard.png`: the Leaderboard screen's ENDLESS tab, three seeded entries sorted
  by crossings (42, 31, 12).

Against a dev server on port 5174 - the reviewer's own 5173 was confirmed listening (a different
PID) before this milestone started and never touched, confirmed still listening, on the same PID,
afterward. Zero console errors in every capture.

## How this was verified

`npm run typecheck`, `npm run lint` (0 errors; the same pre-existing-style `no-console` warnings in
one-off `.mjs` scripts M5-M8's reports already documented, plus the same pattern in the two new
`m9-*.mjs` scripts), `npm test` (14 files, **252 tests** - 191 carried over from M0-M8 plus 61 new:
`tests/endless.test.ts` (26: generator validity across d x world, theme cycling, the difficulty
spine, oil gating, daily-seed determinism), `tests/skins.test.ts` (28: the skin table, every
unlock-boundary condition, and `recolorFrogSvg` leaving none of the original hex behind for every
non-Classic skin, against inlined snippets of the real sprite text so the test needs no Node `fs`/
`path` types - this project's tsconfig only pulls in `vite/client`, and `@types/node` isn't
installed), 4 new leaderboard cases appended to `tests/save.test.ts`, and 3 new World-level Endless
integration cases appended to `tests/world.test.ts` (a single home landing ends the crossing with
homes never filled/frog reset/difficulty risen/the `+100 CROSSING` label, and `levelClear` never
fires)), and `npm run build` all pass clean.

Runtime verification used a dev server on port 5174 (confirmed the reviewer's own port 5173 was a
different, already-running PID both before and after, per the note under "Screenshots"), plus the
interactive Browser pane end to end:

1. **The Title**, fresh and with a partially-progressed save: the Endless button shows locked
   (lock glyph, "Reach level 15") until `bestLevel >= 15`; the skin-picker row renders real
   recoloured mini frog-idle previews (not placeholders) with locked ones dimmed; tapping a locked
   swatch shows its unlock-hint toast without selecting it; tapping an unlocked one recolours the
   3x hero, the logo-peek frog, and the picker's own selection ring live, with no reload.
2. **Endless Start -> Play**: the DAILY SEED toggle shows today's UTC date string; Start drops
   straight into crossing 1 with no level-intro card; the HUD reads "CROSSING 1" / "d1.2"; a real
   hop and home landing regenerated crossing 2 with a fresh difficulty/lane layout and the frog
   back on the start bank, confirmed via `window.__rr.world` (`levelNumber`, `difficulty`, `homes`
   all read back correctly between crossings).
3. **Skin unlocking on a real campaign clear**: seeded a save just short of `bestLevel > 3`, played
   to a forced Level 3 clear via `World.resolveHomeLanding()` (the same technique `scripts/
   m8-screens.mjs` already used) - the Results card showed "NEXT WORLD: COASTAL HIGHWAY" *and*
   "New skin unlocked: Tree Frog!" on the same screen, and a second, unrelated Game Over
   immediately after showed no toast at all (the unlock had already been banked, confirming no
   double-count).
4. **A forced Endless Game Over** (`world.lives = 1; world.die('squish')`, with the current scene
   already an Endless `PlayScene` so `world.update()` was live) showed "Crossings 1 | Homes 0 |
   Power-ups 0" in place of the campaign stats line and a qualifying name entry; confirming the
   entry went into `save.endlessLeaderboard` (`{crossings:1, score:900,...}`) and left
   `save.leaderboard` (the campaign board) untouched.
5. **An old, pre-M9 save blob** (missing every new field) loaded without error - `core/save.ts`'s
   `loadSave` guards/defaults every one of them, so an M8 session's `localStorage` upgrades
   cleanly rather than crashing or silently discarding the player's existing progress.
6. **`node scripts/m9-perf.mjs --secs 5`** against a live Endless crossing forced to d=3: 300
   frames, avg 16.666ms, p95 16.7ms, max 16.8ms - a clean, stable 60fps, zero console errors -
   directly confirming the spec's own acceptance line ("Endless holds 60 fps at d = 3").
7. **`node scripts/review.mjs --secs 15`** against the reviewer's own port 5173 (confirmed the same
   PID before and after): starts the campaign from the Title via a real `Enter` keypress exactly as
   before M9, plays, zero console errors - confirming Endless's changes to `PlayScene`/`World`
   left ordinary campaign play unaffected.

One caveat on technique: keyboard `Return` dispatched through the interactive Browser pane's
`computer` tool didn't reliably reach `ResultsScene`/`GameOverScene`'s own input handling in this
session (the same class of limitation M4/M5/M7's reports already documented for this environment,
there described as the tab stalling `world.elapsed` between tool calls) - real dispatched clicks on
the same controls, and direct calls to a scene's own method via `window.__rr.scenes.current()`
(`['confirmName']()`, `['toTitle']()`), worked every time and are what items 3-4 above actually
used to advance past those cards; `scripts/m9-screens.mjs`'s own automation uses Playwright's
`page.keyboard.press`, a different code path, which had no such issue (see item 6's clean run and
the screenshots themselves, none of which needed a keyboard fallback).

## Known gaps

- **Hat overlays don't render on the Title's 3x hero or the skin-picker's own preview icons** -
  only in live gameplay (`draw/entities.ts`'s `drawFrog`) - see Deviations #4. The colour recolour
  itself is correct everywhere; only the hat art is gameplay-only today.
- **The palette crossfade blends the static layer and the live-drawn layers, but weather
  (rain/fog/snow) and time-of-day (day/dusk/night) snap to the new world instantly** rather than
  cross-fading - see Deviations #2. Reads fine in practice (the theme swap is already brief and
  attention is on the frog's next hop, not the sky), but it's a real, visible seam if watched for.
- **Endless crossings never spawn power-ups' or the lady frog's dedicated home-row croc/fly
  hazards** (`crocChance`/`flyChance` both fixed at 0 - see `game/endless.ts`'s own doc comment).
  Regular river/road power-up and lady-frog spawns (M7) are untouched and do appear in Endless from
  crossing 2 onward, same level-number gate as campaign.
- **The Leaderboard's tab buttons are plain `drawButton` pills relabelled small**, not a distinct
  "tab" visual treatment (underline, connected-to-content look) - functionally complete (keyboard/
  gamepad/pointer all switch tabs correctly), a cosmetic pass Fable may want on review.
- **`docs/ARCHITECTURE.md`'s file listing/event table don't mention `game/endless.ts`,
  `game/skins.ts`, `render/skinSprites.ts`, or `scenes/endlessStart.ts`** - not updated, matching
  the precedent M4/M5/M8's own reports already set for files their fixed lists didn't anticipate.
- Everything M5-M8's own "Known gaps" already listed and this milestone didn't touch (no dedicated
  SFX for a skin unlock or an Endless crossing, the Results screen's cosmetic-only pad-lighting,
  gamepad/touch exercise on real hardware) is still open, unchanged.

## Command output

`npm run typecheck`, `npm run lint` (0 errors, 13 pre-existing-style `no-console` warnings across
one-off `.mjs` scripts, two of them newly `scripts/m9-screens.mjs`/`m9-perf.mjs` themselves, same
pattern every milestone since M5's report has documented), `npm test` (14 files, **252 tests**),
and `npm run build` all pass clean. No git commit made, per instructions (this project also isn't a
git repository in this environment).
