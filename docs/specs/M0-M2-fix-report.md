# M0-M2 fix report: hop-time collision rule, occupied homes, input fallback

Three small, precise fixes against a playtest bug, made against `docs/ARCHITECTURE.md` section 7
(Frog), which now documents the intended hop-time collision rule. Not committed - Fable reviews
and commits.

## What changed

### 1. `src/game/world.ts`: hop-time collision rule

`tryHop` already committed `frog.row` to the target row at hop start (kept, unchanged - rendering
and tests rely on it). The bug was in `update(dt)`: it called `resolveRowEffects(dt)` on every
step whenever `frog.state` was `'idle'` **or** `'hopping'`, with no regard for how far into the
hop the frog was. That meant a hop toward a river row could drown the frog ~16 ms in, before a
platform arriving shortly after had a chance to get there, and a hop into a road lane could squish
the frog immediately, before it was anywhere near the target tile visually.

`update(dt)` now branches on state explicitly:

- **`hopping`, `hopT < 0.5`:** no platform, drown, or vehicle check at all.
- **`hopping`, `hopT >= 0.5` (and `hopT < 1`):** a vehicle check only, against the target row
  (`frog.row`, already committed), using the frog's current interpolated hitbox. No platform/drown
  check.
- **`hopping`, `hopT` reaches `1` (landing):** state flips to `idle`, then a new method,
  `resolveLandingRow()`, runs the full row resolution for the landing row before anything else
  (including a buffered hop starting a new one) can move the frog again that tick: home row as
  before (`resolveHomeLanding()`), road row runs the vehicle check, river row drowns the frog
  unless a platform is under its centre.
- **`idle`:** unchanged - every step still runs `resolveRowEffects(dt)` (vehicle check on road,
  platform ride or drown on river, off-screen check).

`onLanded()` now calls `resolveLandingRow()` instead of only special-casing `HOME_ROW` inline;
`resolveHomeLanding()` itself is unchanged and is called from inside `resolveLandingRow()` for the
home-row case.

One intentional, minor side effect: previously, a hop that landed on an idle-eligible row with no
buffered next hop would also run one extra `resolveRowEffects(dt)` in the very same tick it
landed (a leftover from the old unconditional check). That extra call is gone - a platform ride's
`x` nudge and the off-screen check now start on the next tick instead, a sub-frame (<=16.7 ms)
difference that isn't perceptible.

### 2. `src/game/types.ts` + `src/game/world.ts`: `'occupied'` death cause

`DeathCause` gained `'occupied'`. Landing on a home slot that already holds a frog
(`resolveHomeLanding`) now calls `this.die('occupied')` instead of reusing `'squish'` (which had
no dedicated cause before this fix, only a comment explaining the reuse). Landing on a `'croc'`
slot is unchanged and still dies with `'croc'`.

### 3. `src/core/input.ts`: fall back to `e.key` when `e.code` is empty

The keydown handling is now built on a new pure function, `mapKeyToAction(e: KeyLike)` (exported,
`KeyLike = { code: string; key: string }`, no DOM dependency), which `onKeyDown` calls. It matches
on `code` first, exactly as before (`KEY_DIR`, `Enter`/`Space`, `Escape`/`KeyP`) - behaviour is
unchanged whenever `code` is present, even if that code is unrecognised (it does **not** fall
through to `key` in that case). Only when `code` is the empty string does it fall back to a second
table keyed on `e.key`: `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`, `w`/`W`/`a`/`A`/`s`/`S`/
`d`/`D`, `Enter`, `' '` (space) for confirm, and `Escape`/`p`/`P` for pause.

## Tests added

`tests/world.test.ts` (new describe blocks, using a minimal one-lane `LevelDef` per test and the
frog placed directly at the median so each test isolates exactly the hop under test; `HOP_S`
(0.11 s) at the fixed 1/60 s step means a hop lands on simulation step 7 and crosses `hopT >= 0.5`
on step 4):

- `hop-time collision rule: river rows > does not drown when the only platform arrives under the
  frog before landing` - a log drifts in and only covers the centre column from ~0.083 s into the
  0.11 s hop; asserts the frog is still `'hopping'` (not dead) after step 1, and lands `'idle'`
  riding the platform, `deathCause` undefined.
- `hop-time collision rule: river rows > drowns when no platform is under the centre at landing` -
  an empty river lane; asserts `'hopping'` with no death through steps 1-6, then `'dying'` with
  `deathCause === 'drown'` on the landing step.
- `hop-time collision rule: road rows > does not kill when a vehicle covers the target tile only
  before hopT reaches 0.5` - a car overlaps the hitbox at hop start but has passed by step 4
  (`hopT >= 0.5`) and stays clear through landing; asserts `'idle'`, no death.
- `hop-time collision rule: road rows > kills with squish when a vehicle covers the target tile
  once hopT reaches 0.5` - a stationary car sits on the hitbox throughout; asserts `'hopping'`
  through steps 1-3, then `'dying'` with `deathCause === 'squish'` on step 4 (the first step the
  check runs).
- `home slot occupancy > landing on an occupied home slot dies with cause occupied` - pre-fills a
  home slot with `'frog'`, hops into it, asserts `'dying'` with `deathCause === 'occupied'`.

`tests/input.test.ts` (new file), all against the exported `mapKeyToAction`:

- `maps a hop from key when code is empty (virtual keyboards/automation send no code)` - covers
  all four arrow keys, including the spec's `key: 'ArrowUp'` case.
- `maps wasd via key fallback in either case`
- `maps confirm and pause via key fallback`
- `returns null for an unmapped key when code is empty`
- `does not change behaviour when code is present, even if unrecognised`
- `maps normally from code when code is present (unchanged behaviour)`

## Command results

- `npm run typecheck` - passes, no errors.
- `npm run lint` - the files touched by this fix (`src/game/world.ts`, `src/game/types.ts`,
  `src/core/input.ts`, `tests/world.test.ts`, `tests/input.test.ts`) are clean (verified with
  `npx eslint <those files>`, zero problems). A plain `npm run lint` across the whole repo
  currently fails with 7 `no-undef` errors, all in `scripts/playbot.js` (an untracked browser
  console dev-tool referencing `window`/`KeyboardEvent`/`performance`/`setTimeout` with no
  browser globals configured for `scripts/` in `eslint.config.js`). That file is unrelated to
  this fix - not touched here, not part of `docs/ARCHITECTURE.md`'s `src/`/`tests/` layout, and
  it and several new sprite assets appear to be from concurrent, unrelated work already in the
  working tree before this session started. Left as-is rather than editing eslint config or an
  unrelated script outside this task's scope.
- `npm test` - passes: 6 test files, 51 tests (up from 40; +5 in `world.test.ts`, +6 in the new
  `input.test.ts`).
- `npm run build` - passes (`vite build`, 36 modules transformed).

No git commit made, per instructions.
