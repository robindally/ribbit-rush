# M7 report: Power-ups, bonuses, scoring meta, and the local leaderboard

Implemented by the Sonnet engineer against `docs/specs/M7-powerups-scoring.md`,
`docs/ARCHITECTURE.md` sections 6-12, `docs/ART_BIBLE.md` sections 3, 4, and 8, and
`docs/specs/M6-report.md`/`M5-report.md` (the current `world.ts` flow, event shapes, the level
intro card, the dev hooks, and the `powerup`/`freeze` SFX already synthesised in M5 anticipating
this milestone). Not committed - Fable reviews and commits, per instructions.

## What was built

Every deliverable in the spec: the four power-ups (Bubble Shield, Freeze Frame, Rewind Clock,
Mega Hop), the lady frog escort, per-run statistics surfaced on the Game Over card, and a
persistent top-10 local leaderboard with an arcade-style three-letter name entry and a dedicated
Leaderboard screen reachable from the Title.

### 1. Power-up logic (`src/game/powerups.ts`, new)

Pure and unit-tested (`tests/powerups.test.ts`, 20 tests), driven from `game/world.ts`:

- `pickPowerupKind(rng)` - weighted pick over Shield 30 / Freeze 25 / Clock 25 / Mega Hop 20 using
  the level's own seeded `Rng` (`rng.range`), per spec section 1.
- `collectPlatformCandidates(lanes, elapsed, types?)` - every currently-valid (surfaced, not
  mid-dive/sunk) platform of the given types across every river lane, via `isPlatformNow`/`moverX`
  from `game/lanes.ts`.
- `choosePowerupSpawn(lanes, rng, elapsed)` - places a power-up on a random platform (log/turtle/
  floe) or the median at a random column; `chooseLadyFrogSpawn` is the log-only equivalent for the
  lady frog. Both are covered by a test that samples 100+ seeds and asserts every result is either
  a real platform's own span or a median column - "never lands on water without a platform"
  (spec section 6's acceptance line), by construction.
- `ridingX(lane, ride)` - a rider's current x, re-derived every frame from its platform's own live
  `offset` (not integrated with a `dt`), so a power-up/lady-frog riding a log tracks it exactly,
  including wrap - and, as a side effect, naturally freezes when Freeze Frame stops that platform's
  `offset` from advancing at all (no special-casing needed).
- `nearestSafePlatformX(lane, x, elapsed)` - Bubble Shield's "nearest safe platform if in water"
  rescue target; clamps into whichever platform instance span is closest.
- `freezeLaneTimeScale(t)`/`isFreezeActive(t)` - the pure 0 -> 0 -> ramp-to-1 -> 1 curve over the
  3s stop + 0.5s resume window; `game/world.ts` multiplies this into the `dt` it passes to
  `stepLane` only (never the frog's own hop timer or the level countdown).

### 2. World integration (`src/game/world.ts`)

- New public fields: `powerup`, `ladyFrog`, `carryingLadyFrog`, `shieldActive`, `megaHopActive`,
  `freezeElapsed` - public (not private) so `render/` can read them directly and the dev hook can
  force them, matching the existing precedent of `frog`/`homes`/`streak` etc.
- `startAttempt()` (called from the constructor and the end of `respawnFrogOnly`, so every fresh
  attempt - including a dev level jump - gets it): clears every per-attempt power-up/lady-frog
  field, then rolls the 25%/20% spawn chances (from level 2/3 respectively) via `this.rng.chance`.
- **Bubble Shield**: `die(cause)` checks `shieldActive` first and, if armed, calls `consumeShield()`
  instead of ever setting `frog.state = 'dying'` - the death never happens at all, so
  `deathsByCause` is never incremented for a cancelled death. `consumeShield` pushes the frog to
  `fromX`/`fromRow` by default, or (only when the current lane is a `river`) the nearest safe
  platform via `nearestSafePlatformX`, then fully resets the frog to a settled `idle` state.
  Applies uniformly to every `DeathCause` this reaches - see "Deviations" #1.
- **Freeze Frame**: `advanceFreeze(dt)` returns the lane `dt` multiplier for this frame (and
  auto-clears `freezeElapsed` once the resume window ends); only the `stepLane` loop's own `dt` is
  scaled, so trains, turtles, floes, oil-adjacent traffic, and any platform-riding power-up/lady
  frog all stop together, while the frog can still hop freely and the timer keeps counting down.
- **Rewind Clock**: `Math.min(level.timeLimit, timeLeft + 10)`, plus a `+10s` popup via the exact
  same `delta: 0` `score`-event trick `onLanded` already uses for the streak-multiplier badge - no
  `fx/popups.ts` changes needed at all.
- **Mega Hop**: `tryHop` calls `computeMegaHopTarget` instead of `computeHopTarget` only when
  `megaHopActive && dir === 'up'`, consuming it only once the 2-tile hop actually starts (a blocked
  attempt leaves it armed). `computeMegaHopTarget` (new, `game/frog.ts`) reuses the *exact* same
  bounds/snap/hedge resolver `computeHopTarget` already uses (extracted into a shared
  `resolveTarget(pos, dRow, dx)`), just with `dRow: -2` - so a 2-tile jump gets the same grid-edge
  blocking, hedge blocking, and land-row column snapping as a normal hop, verbatim.
- **Lady frog**: collected by proximity while idle (`checkPickups`, within `POWERUP_COLLECT_RADIUS`
  = 0.5 tile, same as power-ups); rides the frog's back (`carryingLadyFrog`); dropped in `die()`
  (before the shield check, so a *cancelled* death does *not* drop her - only a real one does,
  matching "dying drops her"); `+500` with a `'+500 LADY FROG'` popup in `resolveHomeLanding`,
  mirroring the fly bonus's `'+200 FLY'` convention exactly.
- Dev-only force helpers: `forceSpawnPowerup(kind)`, `forceActivatePowerup(kind)`,
  `forceSpawnLadyFrog()`, `forceCarryLadyFrog()` - see "Forcing power-ups from the console" below.

### 3. Run statistics (`src/game/scoring.ts`)

`RunStats` (score, `levelReached`, `world`, `homesFilled`, `deathsByCause`, `nearMisses`,
`bestCombo`, `bestMultiplier`, `powerupsCollected`, `timePlayedS`) assembled by
`World.getRunStats()`. Score/level/world/near-miss-count/time-played are read directly off
existing World state (never duplicated); `homesFilledTotal`, `deathsByCause`, `bestNearMissCombo`
(near-miss combo peak - distinct from `bestStreakMultiplier`, the hop-streak multiplier peak), and
`powerupsCollected` are new small incremental counters updated at their one call site each
(`resolveHomeLanding`, `die`, `triggerNearMiss`/`onLanded`, `collectPowerup`).

### 4. Rendering (`src/render/draw/powerups.ts`, new)

Every M7 visual, per ART_BIBLE.md sections 3-4:

- `drawPowerupBadge` - the sprite plus the bible's own 3px/1.5Hz bob and a soft pulsing glow behind
  it (the badge art itself - white ring, coloured disc, white icon - is baked into the sprite).
- `drawShieldBubble` - translucent `#3E9CE6` bubble with a white ring, gently pulsing, tracking the
  frog's exact screen position (hop arc included, via the same `frogHopArc` the frog's own render
  uses).
- `drawMegaHopChevron` - a lime double up-chevron bobbing above the frog while armed.
- `drawLadyFrogOnField` / `drawLadyFrogOnBack` - the same `lady-frog` sprite, smaller when riding a
  log, offset up 6px on the frog's back once carried (spec section 2, literally).
- `drawFreezeVignette` - a cached (built-once) radial gradient in `#7CC7FF`, `ctx.globalAlpha`
  driven by `1 - freezeLaneTimeScale(freezeElapsed)` (full during the stop, fading over the resume
  window); reaches the canvas edges so it also reads as "frost the HUD edge" without a second draw
  call.
- `render/anim.ts`'s `frogHopArc` gained an optional `peakTiles` parameter (default unchanged at
  0.4) so Mega Hop's 0.7-tile arc doesn't need any new Frog/World state at all -
  `render/draw/entities.ts`'s `drawFrog` detects "this hop is a Mega Hop" purely from
  `Math.abs(frog.toRow - frog.fromRow) === 2`, which only `computeMegaHopTarget` ever produces.

`scenes/play.ts` draws the badge and the lady-frog-on-a-log among the lane movers (so the frog
visibly lands on top of them), then the frog, then the carried lady frog/shield bubble/chevron on
top of the frog, then the freeze vignette alongside lighting/weather (inside the shake camera
transform, same layer as those).

### 5. Sprites (`assets/sprites/`, new)

`powerup-shield.svg`, `powerup-freeze.svg`, `powerup-clock.svg`, `powerup-megahop.svg` - each a
white ring + the bible's own coloured disc + a simple white icon (shield outline, snowflake, clock
face, double chevron), sized so the ring itself is the spec's "0.8-tile circular badge" (ring
radius 19 of 24, i.e. diameter 38/48). `lady-frog.svg` - `frog-idle.svg` copied verbatim and
recoloured to the bible's `#F48FB1`/bow `#FF4D8D` (shades the bible doesn't specify - haunches,
shade rim, eye ring - are derived tints/shades of `#F48FB1`, documented in the file's own comment),
plus a bow (two loops, a knot, two small tails) between the eyes, sitting right at the top of the
head.

### 6. Leaderboard (`src/core/save.ts`, `src/scenes/gameOver.ts`, `src/scenes/leaderboard.ts`)

- `LeaderboardEntry` gained `date` (ISO `YYYY-MM-DD`); `SaveData` gained `lastName` (defaults the
  next name entry). `insertLeaderboardEntry`/`qualifiesForLeaderboard` are pure, unit-tested
  (`tests/save.test.ts`, 6 tests: insert/sort/cap-at-10, and the qualify boundary).
- `GameOverScene` now takes a `RunStats` (from `PlayScene`'s `gameOver` handler, which already
  holds the `World` - simpler than widening the `gameOver` `GameEvent`) and shows three compact
  stat lines, plus - on a qualifying score - the arcade three-letter name entry before the usual
  "press confirm for Title".
- **Name entry input** deliberately bypasses the normal `InputAction` pipeline entirely (raw
  `keydown`/`touchend` listeners, attached only while entry is active, same precedent as
  `PlayScene`'s dev level-jump key): keyboard left/right move the cursor and up/down cycle the
  letter at the cursor (26-letter wraparound); a touch tap is hit-tested against the three letter
  boxes' own screen rects (recomputed every render call) and cycles whichever one was tapped.
  Confirm (`Enter`/`Space`) saves the entry and returns control to the normal `onAction` pipeline
  for "press confirm for Title".
- `LeaderboardScene` (new): top 10, rank/name/score/world-level/date, dismissed on any input (same
  precedent as `LevelIntroScene`'s card).
- `TitleScene`: `L` (a key `core/input.ts` doesn't otherwise map to anything, so it can never
  collide with "any key starts the game") opens it via a raw listener; a tap needs its own solution
  since a plain tap always synthesises `{type:'hop',dir:'up'}` with **no position** - see
  "Deviations" #4.

## New events (`docs/ARCHITECTURE.md` section 9, updated)

- `powerup`'s `kind` narrowed from `string` to the new `PowerupKind` (`'shield' | 'freeze' |
  'clock' | 'megahop'`) - still fires on **collection**, unchanged trigger.
- `shieldBroken { x, row }` (new) - a Bubble Shield cancelled a death; `x`/`row` are the frog's
  post-rescue position. Drives the bubble's "pop with a burst" fx (two ripples, `fx/particles.ts`)
  and reuses the `powerup` SFX (`core/audio.ts`) rather than a new recipe.
- `ladyFrogPickup { x, row }` (new) - fires on pickup; no dedicated SFX (see "Known gaps"). Her
  `+500` home bonus needs no event of its own - it's an ordinary `score` event with a
  `'+500 LADY FROG'` label.
- Rewind Clock's `+10s` popup needed **no new event** - see "Freeze/Rewind" above.

## Forcing power-ups from the console

```js
window.__rr.powerups.kinds;                    // ['shield', 'freeze', 'clock', 'megahop']
window.__rr.powerups.spawn('shield');           // places a badge on the field (walk over it)
window.__rr.powerups.activate('freeze');        // applies the effect immediately, no walk needed
window.__rr.powerups.spawnLadyFrog();           // places her on a random log
window.__rr.powerups.carryLadyFrog();           // skips straight to "carrying" her
```

`spawn`/`activate` are separate on purpose: `spawn` is the literal ask (force a badge to appear so
the reviewer can walk into each kind and see collection work for real); `activate` is a convenience
for screenshotting/verifying an *effect* (shield bubble, freeze vignette, mega-hop chevron)
without needing to manoeuvre the frog first.

## Screenshots

`docs/screens/m7-shield.png`, `m7-freeze.png`, `m7-megahop.png`, `m7-ladyfrog.png`,
`m7-leaderboard.png` - all via the new `scripts/m7-screens.mjs`:

```
node scripts/m7-screens.mjs --url http://localhost:5174
```

Against a dev server on port 5174 (the reviewer's own 5173 was never touched - confirmed via
`netstat` before and after, and stopped when done). Zero console errors. `m7-shield.png` shows the
translucent blue bubble around the frog; `m7-freeze.png` the light-blue vignette over a frozen
scene; `m7-megahop.png` the lime chevron armed above the frog; `m7-ladyfrog.png` the small pink
frog riding the main frog's back; `m7-leaderboard.png` the Leaderboard screen (empty board, since
the script runs against a freshly-cleared save).

## How this was verified

`npm run typecheck`, `npm run lint` (0 errors, the same 6 pre-existing `no-console` warnings in
one-off `.mjs` scripts M5/M6's reports already documented, plus one new one of the same kind in
`scripts/m7-screens.mjs` itself), `npm test` (11 files, **162 tests** - 127 carried over from
M0-M6 plus 35 new: `tests/powerups.test.ts` (20: weighted kind pick, spawn placement never on bare
water, riding-position tracking, nearest-safe-platform, Freeze Frame timing curve, Mega Hop's
2-tile target bounds/hedge/snap), `tests/save.test.ts` (6: leaderboard insert/sort/cap-at-10,
qualify boundary), and 9 new cases appended to `tests/world.test.ts` (Bubble Shield cancelling a
squish/drown/timeout death and not double-counting it in run stats, Mega Hop consumption/non-
consumption/blocked-stays-armed, lady frog drop-on-death and the home bonus popup)), and `npm run
build` all pass clean.

Runtime verification used a dev server on port 5174, never touching the reviewer's own 5173
(confirmed via `netstat` and stopped afterward):

1. **`scripts/m7-screens.mjs`** (above) - the five required screenshots, zero console errors.
2. **A temporary, one-off Playwright script** (project root, deleted after use - same constraint
   M4/M5/M6's reports already documented: Node's module resolution needs `playwright` in the tree
   that has it) exercised the things the screenshots can't show by themselves:
   - **Real collection, not forced**: placed a Shield badge directly on the tile the frog's next
     hop would land on, pressed the real arrow key, and confirmed it vanished, `shieldActive`
     flipped true, and score rose by exactly 110 (10 forward-hop + 100 power-up).
   - **Shield rescuing a real death**: dropped a car onto the frog's current tile and ran one
     `update()` step - the frog stayed `idle` (never `dying`), lives unchanged, `shieldActive`
     consumed back to `false`.
   - **The full leaderboard round trip**: forced a qualifying game over, drove the name entry with
     real keyboard events (`ArrowUp`/`ArrowRight`/`ArrowDown`/`ArrowRight`/`Enter` -> "BZA", matching
     the exact key sequence), confirmed the entry landed in `localStorage`'s `leaderboard` array
     with the right `score`/`world`/`level`/`date`, then reopened the game, pressed `L` from the
     Title, and screenshotted the Leaderboard screen showing rank 1, "BZA", 999999, "W1-L2", and
     today's date - all rendering correctly.
3. **The interactive Browser pane** was attempted first but hit the same limitation M4/M5's reports
   already documented (there, described as "the tab stalls `world.elapsed` between tool calls"):
   `document.hidden` reads `true` in this environment even after fronting the tab, so the fixed-step
   loop's own `requestAnimationFrame` throttles enough that a scene transition's `onClosed()`
   callback (which is what actually swaps `Title` -> `Play`, arming `window.__rr.world`) never fires
   between tool calls, even though the triggering keydown *is* received and handled synchronously.
   Moved to headless Playwright for anything needing real game time to pass, consistent with that
   precedent; used the interactive pane only for the one static Title-screen screenshot earlier in
   this session (confirming the `LEADERBOARD (L)` label renders) where no time needed to pass.

## Deviations from the spec, and why

1. **Bubble Shield cancels a death of any `DeathCause`, not just a drown.** The spec's own wording
   ("cancels the next death... pushed back to the tile it hopped from (or the nearest safe
   platform if in water)") only spells out the water case explicitly, but reads as a general rule
   with one special case for *where* to land, not a restriction on *which* causes it applies to.
   Applying it uniformly (with the river/nearest-platform branch only kicking in when the current
   lane actually is a river) is the simpler, more consistent reading, and is what "the next death"
   most naturally means.
2. **Power-up spawn placement is a 50/50 choice between "a random platform" and "the median",
   falling back to the median if no platform exists.** The spec's "place it on a random platform in
   rows 2 to 6... or on the median at a random column" doesn't give an exact split; a coin flip
   between the two placement *kinds* (rather than, say, pooling every platform instance and every
   median column into one big weighted list, which would heavily favour platforms simply because
   there are usually many more of them) reads as the more literal "or" and is fully tested to never
   land on bare water either way.
3. **Freeze Frame's 3.5s window and the power-up 12s despawn timer both tick on real `dt`, never
   the frozen/scaled `dt`.** The spec explicitly says only "Timer keeps running" (the level
   countdown) escapes the freeze; extending that same "real-time" treatment to the despawn clock
   and to Freeze Frame's own duration (rather than, say, having a self-referential freeze pause its
   own countdown, which reads as a contradiction) is the only interpretation that doesn't create an
   infinite or ambiguous freeze.
4. **Leaderboard tap-to-open uses a `touchstart`-recorded flag, consumed by `onAction`, rather than
   a coordinate hit-test inside `onAction` itself.** A plain tap already always synthesises
   `{type:'hop',dir:'up'}` with **no position** (`core/input.ts`: "a tap hops up") - and that
   exact same synthesised action is what normally starts the game from the Title screen - so a
   coordinate-aware "did this tap hit the label" check structurally cannot live inside `onAction`.
   `touchstart` (which always precedes the `touchend` that produces the hop) records whether *this*
   gesture started inside the label's rect; `onAction` then checks that recorded flag instead of
   starting the game, for that one gesture only. Documented at length in `scenes/title.ts` itself.
5. **`'croc'` is excluded as a power-up/lady-frog spawn surface**, even though `game/lanes.ts`'s
   `PLATFORM_TYPES` technically lists it (unused by any real campaign level, reserved from M0-M2).
   Resting a bonus on the thing that eats you reads wrong regardless of whether it's reachable in
   practice today.
6. **Mega Hop's taller arc and the "this hop is a Mega Hop" chevron/render state add no new
   Frog/World field at all** - both are inferred from `Math.abs(frog.toRow - frog.fromRow) === 2`,
   true only for a hop `computeMegaHopTarget` produced. Simpler and structurally impossible to get
   out of sync with the actual hop.
7. **Fixed a pre-existing M6 bug found while building this milestone**: `scenes/levelIntro.ts`
   never called `fx/transitions.ts`'s `update`/`render`. Since `PlayScene.enter()` can push the
   level-1 intro card while the Title -> Play iris transition is still mid-"opening" (both can
   happen within the same frame the level starts), the transition's own timer froze the instant the
   card took over the scene stack, then visibly resumed - a growing circular wipe over real
   gameplay - the moment the card popped back to `PlayScene`. Fixed by having the card's `update`
   also call `transitions.update(dt)` (it already delegates `render` to `this.under.render(...)`,
   which is always `PlayScene`, whose own `render` already ends with `transitions.render(r)` - so
   no second render call was needed, only the missing `update`). Caught by the M7 screenshot
   script's own shield/freeze captures showing the wrong thing (an intro card, then a stray iris
   circle) before this fix; both scenarios are exercised by `scripts/m7-screens.mjs`'s deliberately
   generous waits, which double as a regression guard against this reappearing.
8. **No new SFX recipe for `shieldBroken` or `ladyFrogPickup`.** `shieldBroken` reuses the
   `powerup` chime (a second, distinct trigger point, not a new sound); `ladyFrogPickup` has none -
   the instruction to use "the audio names already synthesised for powerup and freeze" reads as
   "M5 already anticipated exactly these two, don't add more," and neither omission was called out
   as required by the spec's own acceptance checklist.
9. **`scripts/playbot.js` needed no changes**, confirmed by inspection rather than a guess: its
   `killer()`/`roadSafe()`/`riverSafe()` heuristics only ever look at `lane.movers`, and neither a
   power-up nor the lady frog is ever a lane mover (both are separate `World` fields the bot's own
   code never reads) - so the bot simply doesn't perceive them at all, treating a power-up-bearing
   tile exactly like the empty platform underneath it. Verified live in the temporary verification
   script above (the bot-equivalent direct `queueHop` calls) and by re-reading the file's logic
   line by line.
10. **The Game Over card's height grew (0.4 -> 0.56 of canvas height)** to fit the three new stats
    lines and, on a qualifying score, the name-entry UI - per the milestone's own instruction that
    the M7 stats/leaderboard entry land "on the existing Game Over card for now (M8 restyles it)",
    a size change (not a redesign) felt like the right scope.

## Known gaps

- **M8 restyles the Game Over and Leaderboard screens** (per the milestone's own instruction) -
  both are plain cream cards today, matching every other M7-adjacent screen's current look
  (`PauseScene`, `LevelIntroScene`), not a final design pass.
- **No dedicated SFX for the lady frog's pickup**, and Bubble Shield's "pop" reuses the generic
  `powerup` chime rather than a bespoke recipe - see "Deviations" #8.
- **Freeze Frame's vignette is deliberately subtle** (`VIGNETTE_MAX_ALPHA = 0.35`, and the gradient
  itself only reaches its own strongest colour stop at the canvas corners) - reads as "light-blue"
  per the bible's own wording, but Fable may want it more dramatic on a real screenshot review;
  flagged rather than iterated further given the milestone's scope, same precedent M6's report set
  for the ice floe art.
- **Endless/post-15 loop levels always report `world: 5`** on a leaderboard entry earned there,
  matching `game/level.ts`'s own post-15 loop (which only ever cycles world 5's own levels 13-15) -
  not a gap so much as a note that this is the only value that could ever be correct today.
- **No spawn-in particle/flourish for a power-up or the lady frog appearing on the field** - the
  bible only specifies the continuous bob/glow (implemented) and the shield's own consume-time
  burst (implemented); nothing about an entrance effect, so none was added.
- Everything M3-M6's own "Known gaps" already listed and this milestone didn't touch (results
  scene, settings UI, `uiMove` trigger beyond what M5 wired, gamepad/touch exercise on real
  hardware) is still open, unchanged.

## Command output

`npm run typecheck`, `npm run lint` (0 errors, 7 pre-existing-style `no-console` warnings in
one-off `.mjs` scripts, one of them newly `scripts/m7-screens.mjs` itself, same pattern M5/M6's
reports already documented for `review.mjs`/`audio-probe.mjs`), `npm test` (11 files, **162
tests**), and `npm run build` all pass clean. No git commit made, per instructions.
