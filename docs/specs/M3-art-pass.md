# Spec M3: Art pass 1

Goal: replace every placeholder with the real look for World 1 (Sunny Suburb), following
`docs/ART_BIBLE.md` exactly. Gameplay does not change. Read the art bible fully, then
`docs/ARCHITECTURE.md` section 11, then this spec.

Fable has placed the reference sprites in `assets/sprites/`: `frog-idle`, `frog-jump`, `car`,
`log-end`, `log-mid`, `turtle`, `lilypad`. Study them before drawing anything new. Every new sprite
must look like it came from the same hand.

## Deliverables

### 1. Sprite pipeline

- `render/sprites.ts` loads every SVG in `assets/sprites` via Vite `import.meta.glob('/assets/sprites/*.svg', { query: '?raw', import: 'default', eager: true })`, rasterises each to an offscreen canvas at `TILE * dpr` per tile (width from the SVG viewBox), and exposes `sprite(name)`.
- Sprites are drawn centred on the mover's collision rect. A mover of width w tiles uses a sprite
  of `ceil(w)` tiles, so a 1.5-tile pickup uses a 2-tile sprite with the body drawn 72 px wide,
  centred.
- Vehicles face right in the SVG. Flip horizontally for lanes with negative speed. Turtles face
  left in the SVG. Flip for positive speed.
- Logs are composed: `log-end` at the left, `width - 2` copies of `log-mid`, then `log-end` flipped
  at the right. A width-2 log is just the two ends.
- Frog faces up in the SVG. Rotate 90, 180, 270 degrees for right, down, left.

### 2. New sprites (agent-authored, per art bible section 4)

Create as SVG in `assets/sprites/` following `car.svg` as the template:
`taxi` (1x1), `sports` (1x1), `pickup` (2x1, body 72 px), `van` (2x1, body 72 px), `truck` (2x1),
`bus` (2x1), `motorbike` (1x1, body 29 px wide), `croc` (2x1), `fly` (1x1, body about 20 px),
`hedge` (1x1 tileable), `kerb` (1x1 tileable strip).

Rules from the bible that reviewers will check: wheels poke 3 px past the body edges, front face
strip on every solid object, one top-left white highlight at about 22%, no black outlines, the
palette hex values exactly.

### 3. Environment (World 1 palette)

Implement `game/themes.ts` with the `WorldTheme` shape below and the World 1 values from the
bible. Other worlds come in M6, but the structure must be data-driven now.

```ts
export interface WorldTheme {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  palette: { grassA: string; grassB: string; road: string; laneLine: string; median: string;
             water: string; waterLight: string; waterDeep: string; accentA: string; accentB: string };
  timeOfDay: 'day' | 'dusk' | 'night' | 'dawn';
  weather: 'clear' | 'rain' | 'fog' | 'snow';
  tint?: string;   // rgba
}
```

- **Static layer.** Pre-render grass stripes with tufts, road with speckle, dashed lane lines,
  kerbs, median, home row hedge and soil strip, river banks with foam lines, to an offscreen canvas
  once per level (seeded RNG for tufts and speckle). Blit it each frame.
- **Water.** Drawn per frame under the platforms: base fill, three lighter streak bands per river
  row offset by sine, moving with the lane direction, and drifting 6 px specular dashes at 1.5x lane
  speed. Under each platform a 2 px `waterDeep` contact shadow.
- **Home row.** Lily pad sprite in each empty slot, frog-idle on filled slots, croc sprite in a
  croc slot, fly sprite in a fly slot.

### 4. Frog animation (art bible section 5)

- Hop: scale Y 1.0 to 1.25 at t=0.4, 0.8 at landing, recover to 1.0 over 90 ms with scale X 1.3
  during the squash. Arc 0.4 tile. `frog-jump` between t=0.15 and t=0.85.
- Idle: breathe scale 1 plus or minus 0.02 at 1 Hz; blink every 3 to 5 s (eyelid ellipse in
  frogBody over each eye for 100 ms, drawn in code over the sprite).
- Shadow: `renderer.shadow` ellipse under the frog, stays on the ground during a hop and shrinks to
  70% at the apex.
- Deaths: squish (scale Y 0.15, X 1.6 over 120 ms, hold, fade, two tyre marks), drown (scale 0.6,
  sink 6 px, alpha to 0 over 400 ms), timeout (three red blinks then squish fade), croc and hedge
  use squish. Particles come in M4; do only the sprite tweens now.
- Home landing: scale to 1.2 and back over 200 ms.

### 5. Turtle dive visuals

Sinking: over 0.5 s scale to 0.85 and alpha to 0.45, then invisible while down, reverse on rise.
Blink twice (alpha dips) in the last 0.6 s before sinking.

### 6. HUD and Title in Fredoka

- Import `@fontsource/fredoka` weights 400, 600, 700 in `main.ts`. Wait for `document.fonts.ready`
  before the first frame.
- HUD per bible section 8: SCORE left, world and level centre, HI right, cream with 3 px ink outline;
  lives as small `frog-idle` icons bottom-left; timer bar bottom-right with the colour ramp and the
  pulse under 5 s.
- Title: logo treatment from bible section 1 (letters drawn individually with alternating rotation,
  vertical gradient, extruded edge, top highlight), animated river band behind it using the water
  renderer, the frog hero at 3x idle-breathing beside the logo, "Press any key or tap to start"
  pulsing, hi-score.
- Pause and Game Over cards per bible section 8 (rounded cream panel, ink text, accent stripe).

### 7. Performance

- Cache every gradient and pattern. No `createLinearGradient` or `createPattern` inside the frame.
- Static layer offscreen canvas as above.
- Confirm 60 fps in Chrome devtools with the performance panel; note the frame time in the report.

## Acceptance

1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.
2. A screenshot of the Title and of Play at level 1 is saved to `docs/screens/m3-title.png` and
   `docs/screens/m3-play.png` (use Playwright if convenient, or describe how to capture).
3. No placeholder rectangles remain anywhere.
4. Every hex value used matches the bible. Grep the code for `#` and compare.
5. The frog reads as the same character as `assets/sprites/frog-idle.svg` at every rotation.

## Handoff

Write `docs/specs/M3-report.md` with what was built, deviations, frame time, and a list of every
new sprite for Fable to review. Do not commit.
