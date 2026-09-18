# M3 report: Art pass 1

Implemented by the Sonnet engineer against `docs/ART_BIBLE.md`, `docs/ARCHITECTURE.md` section 11,
and `docs/specs/M3-art-pass.md`. Not committed - Fable reviews and commits.

## What was built

Every placeholder rectangle in `src/render/` and `src/scenes/` is gone. World 1 (Sunny Suburb) now
renders from the art bible: sprite vehicles, composited logs, turtle groups, an animated river,
Fredoka HUD/title/cards, and the full frog animation set.

### 1. Sprite pipeline (`src/render/sprites.ts`, `src/render/renderer.ts`)

Fixed a latent sizing bug rather than just wiring sprites in: `rasterize()` sized every sprite's
offscreen canvas at `TILE * dpr` square and `Renderer.sprite()` drew it back out at
`img.width * sx`, i.e. the *device-pixel* width used directly as a *logical-px* draw size. At
`dpr === 1` (the only case M0-M2 exercised, since gameplay was flat shapes, not sprites) this was
invisible; at `dpr > 1` every sprite would have rendered 2x-4x too large, and a 2-tile sprite
(pickup, van, truck, bus, croc) would have been squashed into a 1-tile square. `sprites.ts` now
reads each SVG's `viewBox` to get its true tile width/height, rasterises at that size `* dpr`, and
returns `{ canvas, width, height }` with `width`/`height` already in logical px; `renderer.ts`
draws using those instead of the canvas's own pixel dimensions. Also added `getSpriteAtlas()`, a
synchronous accessor to the atlas `loadSprites()` already resolved, so the static-layer builder
(which draws sprites onto its own offscreen canvas, not through `Renderer.sprite`) can reach
`hedge`/`kerb` tiles without threading the atlas through every scene constructor - purely additive,
`loadSprites`'s own contract is unchanged.

Logs compose from `log-end` + N `log-mid` + flipped `log-end`; turtle movers of width 2/3 draw that
many individual `turtle` sprites side by side (a "turtle" mover represents a group, per the classic
lane table); vehicles flip for negative-speed lanes, turtles flip for positive-speed ones; the frog
rotates 0/90/180/270 degrees for up/right/down/left, using the same `frog-idle`/`frog-jump` art at
every facing.

### 2. New sprites (`assets/sprites/`)

Eleven new SVGs, all following `car.svg`'s construction (front-face darker rect + shorter top-face
rect over it, wheels poking 3px past the body edges, one top-left highlight around 16-22% opacity,
no black outlines - a 1.5px stroke 15% darker than the fill instead):

`taxi.svg`, `sports.svg`, `pickup.svg`, `van.svg`, `truck.svg`, `bus.svg`, `motorbike.svg`,
`croc.svg`, `fly.svg`, `hedge.svg`, `kerb.svg`.

Every hex value in them is either a bible token verbatim (vehicle body colours, glass/glint/wheel/
light colours, croc/fly colours) or a shade of one, darkened/lightened by the bible's own stated
percentages - see "Hex values" below.

### 3. Environment, World 1 (`src/render/draw/background.ts`, `road.ts`, `water.ts`)

- **Static layer.** `buildStaticLayer(theme, seed)` pre-renders banks (grassA/grassB sub-bands +
  seeded tufts), road (fill + 6%-alpha speckle + dashed lane lines + kerb lines), median (`kerb.svg`
  tiled + 2px darker top/bottom line + a storm drain), home row (hedge tiles between slots + 6px
  soil strip), and the river's base fill + bank foam, to one offscreen canvas per level, keyed on
  `world.levelNumber` and rebuilt only on a level transition. `PlayScene` blits it with one
  `drawImage` call per frame.
- **Water.** Drawn per frame, on top of the static base: three sine-offset streak bands and a
  drifting 6px specular dash line per river row (scrolling with lane direction/speed and 1.5x that
  for the specular line), plus a 2px `waterDeep` contact shadow under every surfaced platform
  (skipped for a turtle that's fully dived).
- **Home row.** `drawHomeSlots` draws exactly one of lily pad / `frog-idle` / `croc` / `fly` per
  slot depending on state, plus the landing pulse/ring (see below).

### 4. Frog animation (`src/render/anim.ts`, `src/render/draw/entities.ts`)

All timing math lives in `render/anim.ts` as pure functions (hop squash/stretch, arc, shadow scale,
idle breathe/blink, per-cause death tweens, home-landing pulse/ring, turtle dive visuals) driven
entirely by fields the tested `Frog`/`DiveDef` types already expose (`hopT`, `stateT`, `elapsed`) -
no new gameplay state. One small, justified fix in `src/game/world.ts`: `frog.stateT` ("seconds in
current state" per `ARCHITECTURE.md` section 7) was only ever reset in `die()`, not on the
idle<->hopping transitions, so it couldn't drive the 90ms post-landing squash recovery. Added
`this.frog.stateT = 0` at the two transition points (`tryHop`, and the landing branch in
`update()`). This makes the field match its own documented contract; nothing in `game/` reads
`stateT` for collision, scoring, or timers (only the death timer, which already reset it), and no
test touches it, so this is not a gameplay behaviour change - see `docs/specs/M3-report.md`
"Deviations" below for the full reasoning trail.

Implemented: hop squash-and-stretch with the arc and `frog-jump` swap between t=0.15/0.85, shadow
shrink to 70% at the apex, idle breathing and blinking, squish/drown/timeout death tweens (with
tyre marks and a red flash respectively), and the home-landing icon pulse + lily-pad ring (captured
via the `home` `GameEvent` into a small `Map<slot, timeSinceLanding>` owned by `PlayScene`, not by
the frog - the frog itself respawns immediately, so this has to be scene-local).

### 5. Turtle dive visuals (`src/render/anim.ts`)

`turtleVisual(dive, t)` reproduces the sink/rise sub-phase interpolation (scale to 0.85, alpha to
0.45, invisible while down) and the pre-dive double-blink in the last 0.6s, reading the same
`DiveDef` the (untouched) `game/lanes.ts` state machine uses. `DIVE_SINK_S`/`DIVE_RISE_S` are
duplicated as local constants rather than exported from `lanes.ts`, so that gameplay file stays
completely untouched by this render-only concern.

### 6. HUD, Title, Pause, Game Over (Fredoka)

`main.ts` now imports the 400/600/700 weight CSS files and awaits `document.fonts.ready` before
`startLoop`. HUD matches bible section 8 (cream/ink text with outline, `frog-idle` life icons, a
6-tile timer bar that ramps frogBody -> gold -> danger by remaining-time percentage and pulses
under 5s - computed as a plain lerped colour per frame, not a cached/recreated gradient). The title
screen pre-renders the logo once (`buildLogoCanvas`, called from the scene constructor): each letter
individually rotated +/-3 degrees, a lime-to-green vertical gradient, a 4px dark-green extruded
edge, and a `source-atop`-clipped white top-third highlight; a small hero frog peeks over the first
letter; a 3x idle-breathing `frog-idle` hero sits below the logo; an animated river band (reusing
`drawWaterAnimated` with a synthetic `LaneDef`) runs behind it. Pause and Game Over both use the
rounded-cream-card-with-accent-stripe treatment from bible section 8.

### 7. Performance

`grep -rn "createLinearGradient\|createRadialGradient\|createPattern" src/` finds exactly one hit:
the logo build in `title.ts`, called once from the constructor, not from `render()`. Everything else
either reads a pre-rasterised sprite or fills with a plain (per-frame-computed, not cached-object)
colour. The static layer is rebuilt only on a level-number change.

## Frame time

The interactive automated browser tab used for visual QA throttles `requestAnimationFrame` to
near-zero once idle between tool calls (`document.hidden` reports `true` even when overridden) -
the exact same environment limitation the M0-M2 report documented for continuous-play testing, not
a property of the game. Rather than skip the measurement, I drove a short **headless** Playwright
session (see "How to reproduce" below) against the real dev build, hooked `PlayScene.update`/
`render` to time each call with `performance.now()`, and let it run Play at real speed for 4s:

```
elapsed: 4007.4 ms, 241 frames -> 60.1 fps
render(): avg 0.25 ms, p95 0.40 ms, max 2.4 ms (241 samples)
update(): avg 0.011 ms, p95 0.10 ms, max 0.1 ms (241 samples)
```

241 frames in 4007ms is 60.1 fps, confirming the loop holds 60Hz; `render()` (the static-layer
blit, water bands/specular/contact-shadows, every mover sprite, the frog, and the HUD) averages
0.25ms against the 16.67ms budget - about 1.5% of it. The one 2.4ms outlier is consistent with a
level-transition frame that rebuilds the static layer.

## Every new sprite file, for review

`assets/sprites/taxi.svg`, `sports.svg`, `pickup.svg`, `van.svg`, `truck.svg`, `bus.svg`,
`motorbike.svg`, `croc.svg`, `fly.svg`, `hedge.svg`, `kerb.svg`.

## Screenshots

`docs/screens/m3-title.png`, `docs/screens/m3-play.png` - captured at native 624x720 with a
headless Playwright script (see below), not the interactive pane, so they reflect the real,
un-throttled first frame of each scene.

### How to reproduce (dev-only, nothing added to package.json)

```
npm run dev -- --port 5174 --strictPort
npx --yes playwright install chromium   # once
npx --yes -p playwright node <script using require('playwright')>
```

The task note about a dev-only download-PNG keyboard shortcut wasn't needed since Playwright was
available and gave pixel-exact, un-throttled captures directly from the real dev server.

## Deviations from the specs, and why

1. **`sprites.ts`/`renderer.ts` sprite sizing fix** - see "Sprite pipeline" above. Required for any
   sprite to render at the correct size at all; without it every 2-tile sprite would be squashed
   into 1 tile and everything would be wrong-sized at `dpr != 1`.
2. **`getSpriteAtlas()` added to `sprites.ts`** - additive only; `loadSprites`'s existing contract
   and signature are unchanged.
3. **Two-line `stateT` reset in `world.ts`** - see "Frog animation" above. Makes `stateT` match its
   own documented "seconds in current state" contract; no test or other gameplay logic reads it
   during `hopping`/`idle`, so this is not an observable gameplay change.
4. **`render/draw/lighting.ts` and dusk/night/rain/fog/snow rendering were not built.** The M3
   spec's "Environment (World 1 palette)" deliverable only asks for the static layer, water, and
   home row; World 1 is `timeOfDay: 'day'`, `weather: 'clear'`, `tint: undefined` in the bible, so
   there is nothing for a lighting pass to draw yet. `game/themes.ts` still carries full
   `timeOfDay`/`weather`/`tint` data for all five worlds (the M3 spec: "the structure must be
   data-driven now"), so M6 has real data to build the lighting/weather layer against - this
   mirrors the M0-M2 report's own precedent of omitting out-of-milestone `draw/` files rather than
   stubbing them.
5. **Motorbike lean and bus bounce** (bible section 5, "Vehicles") were implemented even though the
   M3 spec's section 4 heading only calls out frog animation by name - both are a few lines, driven
   by the same `elapsed`/lane-speed values already in hand, and directly specified by the bible.
6. **Turtle dive constants duplicated in `render/anim.ts`** rather than exported from
   `game/lanes.ts`, so that file is not touched at all by this render-only concern.

## Bible rules I found ambiguous

1. **Front-face strip size.** Bible section 2: "a strip along its bottom edge, 18% of the *sprite*
   height... 22% darker." Measured against `car.svg` (the authoritative reference), the actual
   strip is ~9% of the full 48px sprite but ~17.3% of the *body* rect's own height (26px) - much
   closer to "18%." I read "sprite height" as shorthand for "the object's own drawn height" and
   applied 18%/22% (default) and 24%/26% (tall: bus/truck) against each vehicle's own body-rect
   height, matching the reference's actual proportions rather than the full 48px canvas.
2. **Blink timing.** "Blink every 3 to 5s" has no stated source of variation. Used a fixed 4s
   period (the midpoint) - see the comment in `render/anim.ts`. Cosmetic only, no gameplay effect.
3. **Home-landing ring duration.** Not specified beyond "Lily pad emits a ring." Used 450ms.
4. **Croc in a home slot.** The bible only specifies `croc.svg` as a 2x1 *lane-mover* template; it
   doesn't say how a 2-tile sprite should sit in a 1-tile home slot. Drawn at its natural size,
   centred on the slot, matching the "wheels poke past the body" bleed philosophy elsewhere in the
   bible - **known limitation:** in the leftmost or rightmost home slot (columns 0 and 12) this
   means half the crocodile is drawn off the canvas edge. Worth a follow-up if Fable wants it
   clamped/scaled down instead.
5. **`DeathCause` values with no bible entry** (`occupied`, `offscreen`, `snake` - all added after
   the original design vocabulary, `snake` unreachable until M6 wires up the hazard). Mapped
   `occupied`/`snake` to the squish tween (matching the M0-M2 report's own precedent for
   `occupied`) and `offscreen` to the drown tween (it only happens riding a platform off the water).
6. **HUD "world and level name (centre)."** No exact format given; used
   `"{WORLD NAME} - L{n}"` (e.g. "SUNNY SUBURB - L1").
7. **Grass "1-tile mowing stripes."** The classic level table has exactly one grass row (the start
   bank); with only one row, whole-row alternation isn't visible. Rendered as four horizontal
   sub-bands within that row instead, which is what actually reads as "mowed lawn stripes" - worth
   confirming this is the intended look once a multi-row grass bank exists in M6.
8. **Canvas backdrop (HUD gutter rows 0/14, and the Title/Game Over full-screen fill).** Not covered
   by the bible; kept the pre-existing dark navy (`#0c0d1a`/`#14162b`) rather than inventing a new
   token.

## Command output

`npm run typecheck`, `npm run lint`, `npm test` (6 files, 51 tests), and `npm run build` all pass
clean with no changes needed beyond the art pass itself. No git commit made, per instructions.

## Known gaps

- Dusk/night/rain/fog/snow rendering (worlds 2-5's `timeOfDay`/`weather`) - deferred to M6, see
  "Deviations" item 4.
- Croc-in-edge-slot canvas bleed - see "Bible rules I found ambiguous" item 4.
- Score popups, particles, screen shake, hit-stop are explicitly M4 and were not touched.
- Gamepad/touch input were not exercised in this milestone (no art changes there); unchanged from
  M0-M2.
