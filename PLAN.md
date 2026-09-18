# Frogger Reimagined: Design & Delivery Plan

Written 2026-09-18 by Fable (design lead). Coding is delegated to cheaper models per section 6.

## 1. Vision

A love letter to Frogger that plays like a modern indie hit: chunky, glossy, constantly animated, with
instant-feeling input and a small reward every few seconds.

Design pillars, in priority order:

1. **Feel first.** A hop must feel instant. Input is buffered, the sim runs at a fixed step, and every
   action has visible and audible feedback.
2. **Looks alive.** Water moves, light changes, weather rolls in, particles fly. Nothing on screen is static.
3. **Fair danger.** Hazards are readable a second before they hit. Deaths feel like the player's fault.
   Near-misses are rewarded, so danger is fun rather than punishing.
4. **Always something new.** Each world changes the look, the hazards, and the music, so the next
   level is worth reaching.

## 2. Game design

### 2.1 Core loop (faithful to the original)

- Play grid: 13 columns x 13 rows. Bottom to top: start bank, 5 road lanes, median, 5 river lanes,
  home bank with 5 lily-pad slots. HUD sits above and below the grid.
- Hop: one tile per press in 4 directions. Roughly 110 ms per hop with an arc and a ground shadow.
  One hop is buffered while the current hop animates, so mashing feels responsive, never laggy.
- Road: each lane has vehicles with a speed, direction, and spacing pattern. Contact means squish.
- River: logs and turtles carry the frog. Some turtles dive on a timer (they blink first). Water means
  drown. Riding off the edge means death.
- Homes: land a frog in each of 5 slots to clear the level. A crocodile can occupy a slot (death). A fly
  can sit in a slot (bonus).
- Timer per frog crossing, starting around 30 s and shrinking with level. Lives: 3, plus one every 20,000 pts.
- Score (final table, `docs/specs/M7-powerups-scoring.md` section 5 - supersedes any earlier
  scoring prose in this document):

  | Action | Points |
  | --- | --- |
  | Forward hop to a new max row | 10 x multiplier |
  | Home | 50 x multiplier + 10 per second remaining |
  | All five homes | 1,000 |
  | Fly | 200 |
  | Lady frog home | 500 |
  | Near-miss | 50 x combo x multiplier |
  | Power-up collected | 100 |
  | Extra life | every 20,000 |

### 2.2 Modern additions

- **Near-miss system.** A vehicle passing through the tile you just left within 150 ms triggers
  "Close call!" and bonus points. Chained near-misses build a combo.
- **Hop streak multiplier.** Consecutive forward hops without pausing build a x1 to x4 multiplier.
  Waiting or stepping back resets it. Rewards confident play.
- **Power-ups** that spawn on logs and the median: Bubble Shield (one free hit), Freeze Frame (traffic
  and river stop for 3 s), Rewind Clock (+10 s), Mega Hop (next hop covers 2 tiles).
- **Expanded hazard roster.** Cars, trucks, buses, motorbikes (fast, thin), trains on a rail lane with a
  crossing bell and 1.5 s of flashing lights, trams, snakes on the median and on logs, otters that
  knock you off a log, oil slicks that slide you one extra tile, ice floes that crack after 2 s of
  standing, jet skis.
- **Five themed worlds, 3 levels each, then Endless mode.**
  1. Sunny Suburb. Daytime. Classic hazards. Gentle tutorial pacing.
  2. Coastal Highway. Dusk. Wider lanes, faster traffic, motorbikes, jet skis.
  3. Neon City. Night with rain. Headlights, trams, oil slicks, puddle reflections.
  4. Misty Marsh. Dawn fog with fireflies. Snakes, otters, lots of diving turtles.
  5. Frozen Fjord. Snow. Ice floes that crack, trains, slower and heavier vehicles.
  Endless: procedurally generated lane sets with rising difficulty and a local leaderboard.
- **Day and night with weather** as a visual system tied to each world.
- **Unlockable frog skins** (palette swaps and hats) earned by milestones. Cosmetic only.
- **Local two-player** (stretch): two frogs at once, arrows vs WASD, race or shared lives.

### 2.3 Feel and juice checklist

Squash-and-stretch on landing. Arc plus shadow on every hop. Dust puff on ground landing. Ripple ring
when landing on a log. Splash with bubbles on drowning. Flatten with tire tracks on squish. Small
screen shake on death, micro-punch on reaching home. 80 ms hit-stop on death. Slow motion at 0.3x for
400 ms on the final home. Floating score popups. Level-clear fanfare with confetti fireflies. Smooth
scene transitions (wipe or iris).

## 3. Art direction

**Style: "toy-box".** Chunky rounded vector shapes, saturated palettes, glossy highlights, soft drop
shadows. Slight three-quarter top-down view so vehicles and logs show a top face and a thin front
face, reading as 3D without any 3D code. Think Crossy Road's cheer, rendered in 2D.

- **Frog.** Big round eyes, wide smile, bright green with a lighter belly. Squashes to about 1.3x width
  on landing and stretches tall mid-hop. Four facing directions.
- **Lighting rule.** One global light from the top-left. Every sprite has a highlight top-left and a
  shade bottom-right. Time-of-day is a tint layer over the scene. At night, headlight cones, lily-pad
  glow, and lamp posts are drawn as additive gradients.
- **Water.** Layered sine-wave bands, drifting specular streaks, foam at log edges, sky colour
  reflected in the water. Rain adds expanding rings.
- **Road.** Asphalt with subtle noise, dashed lane lines, puddles at night that reflect lights.
- **Type.** A rounded display face (Fredoka or Baloo, self-hosted) for titles and HUD, a tabular
  numeral style for the score so digits do not jitter.
- **UI.** Chunky buttons with a solid bottom edge, recoloured per world.
- **Palettes.** Six swatches per world: sky, ground, road, water, accent A, accent B. Defined in the art bible.

**Asset approach.** Fable hand-authors the hero sprites as SVG (frog in 4 directions plus squash frames,
8 vehicles, logs in 3 lengths, turtle in 3 frames, crocodile, snake, otter, fly, lady frog, 4 power-ups,
lily pad, home slot). They are rasterised once at load to offscreen canvases at device pixel ratio.
Environment, lighting, weather, and effects are drawn procedurally in code from the art bible.

## 4. Audio direction

Everything is synthesised with the Web Audio API, so there are no audio files to source or license.

- SFX: hop (short pitch-down sine), splash (filtered noise burst), squish (low thud with a crunch),
  horns (detuned square waves), croak, home-landing chime, fanfare arpeggio, tick-tock under 5 s.
- Music: a small step sequencer (bass, lead, hi-hat) with a scale and tempo per world, so each world
  has its own loop. Tempo nudges up in the last 5 s of the timer.
- Settings: master, music, and SFX volume, plus mute. Real tracks can be swapped in later if you have any.

## 5. Technical design

- **Stack.** TypeScript, Vite, no framework, Canvas 2D, Web Audio, localStorage. Vitest for logic
  tests. ESLint and Prettier. Static build that deploys anywhere.
- **Loop.** Fixed-step simulation (60 Hz) with interpolated rendering. Logical resolution 13 x 15
  tiles at 48 px (624 x 720), scaled and letterboxed to the viewport. Portrait-friendly, works on phones.
- **Input.** Keyboard (arrows and WASD), touch (swipe and tap zones), Gamepad API. One-hop buffer.
- **Determinism.** Seeded random number generator per level so Endless can later support daily seeds.
- **Modules.**
  - `core/`: loop, input, audio, save, rng
  - `game/`: grid, frog, lanes (vehicle, log, turtle, train, floe), collision, powerups, scoring,
    levels (data), themes (palettes, weather)
  - `render/`: layered renderer (sky, water, road, entities, fx, lighting, ui), sprite atlas
  - `scenes/`: Boot, Title, LevelIntro, Play, Pause, GameOver, Results, Settings
  - `fx/`: particles, shake, hit-stop, popups
- **Performance rules.** Pre-rasterise sprites, never create gradients per frame, cap particles at
  around 400, pool entities, one canvas.

## 6. Team and model routing

| Role | Model | Owns |
| --- | --- | --- |
| Design lead and reviewer | Fable (this session) | Game design doc, art bible, SVG hero sprites, level tables, architecture and module interfaces, per-milestone specs with acceptance criteria, playtesting in the built-in browser with screenshots, final polish calls |
| Engineer | Sonnet | Every gameplay, rendering, and audio milestone |
| Junior | Haiku | Sprite variants from a Fable template, level data entry, unit tests for pure logic, README, lint fixes |

Process per milestone:

1. Fable writes `docs/specs/M{n}.md` with scope, interfaces, and acceptance criteria.
2. A Sonnet agent implements it, runs tests and the build.
3. Fable plays the result in the built-in browser, screenshots it, and lists fixes.
4. Sonnet (or Haiku for small items) applies fixes. Commit.

Fable never writes gameplay code, only specs, SVG, and reviews, which keeps the expensive model on
the work only it does well.

## 7. Milestones

| # | Milestone | Model | Done when |
| --- | --- | --- | --- |
| M0 | Scaffold: Vite, TS, canvas, fixed-step loop, input with buffer, scene manager | Sonnet | Blank scene runs at 60 fps, keys logged, tests pass |
| M1 | Playable road: grid, frog hop, 5 vehicle lanes, collision, lives, timer, homes, level progression | Sonnet | Full level clearable with placeholder shapes |
| M2 | River: logs, turtles with diving, riding, drowning, crocodile in home slot | Sonnet | Classic Frogger is complete and fair |
| M3 | Art pass 1: SVG sprites wired in, water, road, shadows, hop squash-and-stretch, world 1 palette | Sonnet | Screenshot passes Fable's art-bible review |
| M4 | Juice: particles, shake, hit-stop, ripples, near-miss, streak multiplier, popups, transitions | Sonnet | Every item in section 2.3 is visible |
| M5 | Audio: synthesised SFX and per-world music, volume settings | Sonnet | Full session plays with no silent action |
| M6 | Worlds: 5 themes, day-night and weather, new hazards, 15 level tables | Sonnet + Haiku for data | All 15 levels playable and distinct |
| M7 | Power-ups, fly, lady frog, scoring meta, local leaderboard | Sonnet | Leaderboard persists across reloads |
| M8 | UI: title, level intro cards, pause, game over, results, settings, key remap, touch controls, gamepad | Sonnet | Playable end to end on a phone |
| M9 | Stretch: Endless mode, frog skins, two-player | Sonnet | Whichever you pick in section 9 |
| M10 | QA and release: tests, profiling, mobile pass, build, deploy | Sonnet + Haiku | Deployed URL, 60 fps on a mid-range phone |

Rough agent budget: 10 to 14 Sonnet runs and 6 to 10 Haiku runs, plus Fable review passes.

## 8. Risks

- **"Best looking" with no artist.** Mitigated by Fable-authored sprites, a strict art bible, and a
  screenshot review after every visual milestone.
- **Cheaper models drifting from the design.** Mitigated by interfaces fixed in M0, specs with
  acceptance criteria, and tests on the pure logic.
- **Phone performance.** Mitigated by the performance rules in section 5 and a profiling pass in M10.
- **Trademark.** "Frogger" is Konami's mark. Fine for a private project. Pick an original name before
  publishing anywhere public. Suggestions: Ribbit Rush, Hop Hazard, Croak & Dagger, Lily Pad Express.

## 9. Decisions needed from you

1. Art style: toy-box vector (recommended) or something else such as pixel art or 3D voxel.
2. Platforms: desktop browser only, or phone too. Default is both.
3. Scope: 5 worlds x 3 levels plus Endless, or smaller to start.
4. Assets and name: any sprites, music, or a name you want used, or fully generated. Default is fully generated.
5. Repo and hosting: initialise git and push to GitHub, and where to deploy (GitHub Pages, Vercel, or local only).
6. Stretch priority from M9: Endless, skins, two-player, or none.
7. Budget: whether the agent budget in section 7 is acceptable, or a cap.

## 10. Defaults already chosen

Web, TypeScript, Canvas 2D, no framework. Toy-box vector style. 13 x 13 play grid in a portrait
layout. Five worlds plus Endless. Synthesised audio. Local saves only, no backend. Project lives in
`E:\Games\frogger` (rename is trivial).
