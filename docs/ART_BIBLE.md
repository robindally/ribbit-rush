# Ribbit Rush: Art Bible

Owner: Fable. Every visual decision in the game defers to this document. If a spec and this
document disagree, this document wins.

## 1. Identity

- **Title:** RIBBIT RUSH. (Working folder stays `frogger`.)
- **Logo:** the text "RIBBIT RUSH" with no punctuation. Fredoka Bold at 72 px, each letter rotated
  alternately -3 and +3 degrees, lime-to-green vertical gradient (#8BEA7B top to #3FA84A bottom),
  a 5 px dark-green (#2F7A3A) extruded bottom edge, and a soft white highlight across the top
  third. Rendered at device pixel ratio so it is crisp. The hero frog (at 1.5x) sits behind the
  first R with its eyes and the top of its head showing above the letter.
- **Hero frog.** Any frog drawn larger than 1x (title, cards) is rasterised from the SVG at that
  size, never upscaled from the 1x sprite.
- **Mood:** bright, bouncy, generous. Nothing gritty. Danger is cartoon danger.

## 2. Shape language

- **Rounded everything.** Boxes use a corner radius of 25% of the shorter side. Organic things are
  circles and ellipses.
- **No black outlines.** Edges are a 1.5 px inner stroke 15% darker than the fill.
- **Three-quarter top-down.** Every solid object has a top face (main colour) and a front face: a
  strip along its bottom edge, 18% of the object's own drawn height (not the canvas), 22% darker
  than the top. Tall objects (bus, truck, train) use 24% height and 26% darker.
- **Backdrop.** Everything outside the play field (title, cards, letterbox) sits on `backdrop`
  #14162B. The canvas clear colour is the same. The two in-game HUD bands use `hudBand` #0C0D1A,
  a step darker, so the score and lives read against the bright play field.
- **Global light from the top-left.** Each top face carries a soft white ellipse highlight at 22%
  opacity in its top-left third.
- **Shadows are drawn by the renderer, not baked into sprites.** Offset (2, 4) px, blur 6 px,
  rgba(0,0,0,0.28). While the frog is mid-hop the shadow stays on the ground and shrinks to 70%.
- **Sprites face right or up.** Vehicles face +x (right). The frog faces up (north). The renderer
  flips or rotates.

## 3. Palettes

### Global

| Token | Hex | Use |
| --- | --- | --- |
| frogBody | #58D65E | frog top |
| frogDark | #3FA84A | frog haunches, shading |
| frogLight | #8BEA7B | frog feet, highlights |
| frogBelly | #C9F5A6 | jump frame belly hint |
| eyeWhite | #FFFFFF | |
| eyeRing | #2F7A3A | ring around eye, mouth |
| pupil | #1B2A1D | also UI ink |
| cream | #FFF7E6 | HUD text |
| ink | #1B2A1D | UI text on light |
| danger | #FF4D4D | timer low, death flash |
| gold | #FFC83D | bonuses, clock |

### Per world

| World | grassA | grassB | road | laneLine | median | water | waterLight | waterDeep | accentA | accentB | tint |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Sunny Suburb | #74D06B | #66C25E | #4B505A | #EDE8DA | #CFC8B5 | #3E9CE6 | #86CFF7 | #2C7BC4 | #FFB640 | #FF6B6B | none |
| 2 Coastal Highway | #DDC58A | #D1B87A | #3E3B49 | #E0D2B0 | #BFA77C | #2F6FB3 | #FFB07A | #244F86 | #FF7A45 | #9C5BC7 | rgba(255,120,60,0.14) |
| 3 Neon City | #23253C | #1D1F33 | #1E2033 | #3B3F63 | #2C2F4A | #182A55 | #3EF2FF | #0F1A38 | #FF3EA5 | #3EF2FF | rgba(8,10,40,0.42) |
| 4 Misty Marsh | #7FAF80 | #73A274 | #575C55 | #A9AF9E | #8C9682 | #4A8A7C | #9AD2C2 | #35665C | #FFF176 | #C77DFF | fog rgba(222,236,226,0.32) |
| 5 Frozen Fjord | #F3F7FB | #E2EBF3 | #5B6470 | #D9E3EC | #C5D3DF | #3B6FA6 | #BFE3FA | #2A5280 | #7CC7FF | #FF8FA3 | rgba(200,220,255,0.15) |

grassA and grassB alternate as 1-tile mowing stripes running horizontally.

### Frog skins

Skins replace the three frog tokens (body / dark / light) at load. Hats are small overlay sprites
drawn above the head and rotated with the frog. This table is authoritative; the M9 spec mirrors it.

| Skin | Body | Dark | Light | Hat |
| --- | --- | --- | --- | --- |
| Classic | #58D65E | #3FA84A | #8BEA7B | none |
| Toad | #C98A4B | #8F5E2E | #E9B77A | none |
| Tree Frog | #9BE85A | #5FA832 | #FFB640 | none |
| Poison Dart | #3E9CE6 | #1B2A1D | #7CC7FF | none |
| Ninja | #2B2B2B | #111111 | #E8474B | red headband |
| Swamp King | #4F7F3A | #2F5A25 | #C9F5A6 | gold crown |
| Frost | #F3F7FB | #BFE3FA | #7CC7FF | knitted beanie |
| Golden | #FFC83D | #C98A0B | #FFF1A8 | none |
| Ghost | #FFFFFF at 70% alpha | #D9E3EC | #FFFFFF | none |

### Vehicles

| Vehicle | Body | Notes |
| --- | --- | --- |
| car | #E8474B | 1 tile |
| taxi | #F5C518 | 1 tile, black checker strip |
| sports | #2DBFB0 | 1 tile, low, wide glass |
| pickup | #6E9E4A | 1.5 tiles, open bed |
| van | #F1F1F1 | 1.5 tiles |
| truck | cab #3D6BD9, trailer #E9E4D9 | 2 tiles |
| bus | #F28B2E | 2 tiles, window strip |
| motorbike | #2B2B2B, rider #E8474B | 0.6 tile, fast |
| tram | #F0D24C | 3 tiles, pantograph line |
| train | #8E3B46 with #DDDDDD stripe | 6 tiles, rail lane |

Shared: glass #2B3A55 with glint #9FB7E6, wheels #22242A, headlight #FFF1A8, taillight #FF3B3B.

### Nature and pickups

| Thing | Colours |
| --- | --- |
| log | top #9B6B3D, bark lines #7A5230, end rings #C58B5A |
| turtle | shell #5E8C3A, pattern #4C7430, skin #8DBF5A |
| lily pad | #3FAF5A, veins #67CF7A |
| hedge (home row) | #2F8A48, lighter tufts #3FAF5A |
| crocodile | #4F7F3A, belly #8DBF5A, teeth #FFFFFF |
| snake | #C9A24A with #6B4E1E diamonds |
| otter | #7A5230, muzzle #C58B5A |
| fly | #333333, wings rgba(255,255,255,0.6) |
| lady frog | #F48FB1, bow #FF4D8D |
| ice floe | #E6F0F8, cracks #9FB9CF |
| Bubble Shield | #3E9CE6 bubble on white ring |
| Freeze Frame | #7CC7FF snowflake on white ring |
| Rewind Clock | #FFC83D clock on white ring |
| Mega Hop | #8BEA7B double chevron on white ring |

Power-ups are 0.8-tile circular badges. They bob 3 px at 1.5 Hz and pulse a soft glow.

## 4. Sprite specifications

All sprites are SVG with a viewBox in tile units times 48. A 1-tile sprite is `viewBox="0 0 48 48"`.
A 2-tile-wide sprite is `viewBox="0 0 96 48"`. Sprites are rasterised once at load at the device
pixel ratio into offscreen canvases.

Fable authors the reference set. Agents produce the remaining sprites by following the reference
set and the specs below, and Fable reviews every one in a screenshot.

### Fable-authored reference set

| File | Size | Notes |
| --- | --- | --- |
| frog-idle.svg | 1x1 | Faces up. Big eyes, folded haunches, three toes per foot. |
| frog-jump.svg | 1x1 | Legs extended: back legs stretched down, front legs forward. |
| car.svg | 1x1 | Faces right. Template for every vehicle. |
| log-end.svg, log-mid.svg | 1x1 each | Logs are assembled from end + N mids + flipped end. |
| turtle.svg | 1x1 | Faces left (river lane 1 flows left). Renderer flips. |
| lilypad.svg | 1x1 | Home slot when empty. |

### Agent-produced (follow the templates)

- **Vehicles.** Start from car.svg. Keep the wheel placement rule (wheels poke 3 px past the body
  top and bottom edges), the glass shape, and the headlight/taillight positions. Bus and truck are
  taller, so use the 24%/26% front-face rule. Motorbike is a thin body with a round-headed rider.
- **Crocodile (2x1).** Long rounded body, snout with a white tooth zigzag, two eye bumps on top,
  a tail tapering to the left. Belly colour band down the centre.
- **Crocodile in a home slot (`croc-slot`, 1x1).** Not the lane sprite. Open jaws seen from above
  pointing down toward the player, filling the slot: upper jaw at the top with two eye bumps, lower
  jaw below, white tooth zigzags on both, dark mouth interior between them. It must never draw
  outside its tile.
- **Motorbike (1x1, body 29 px wide, faces right).** Two dark wheels in line along the direction
  of travel (front wheel at the right, rear at the left, each about 10 x 6 px), a narrow body
  between them, and the rider on top: a round helmet in the rider colour, 9 px, slightly forward
  of centre, with two small shoulder ellipses behind it. A 1 px headlight dot at the front.
- **Snake (1.5x1).** S-curve body 8 px thick, diamond pattern, small head with two dots for eyes,
  forked tongue.
- **Otter (1x1).** Rounded body, small ears, lighter muzzle, tail trailing.
- **Fly (0.5x0.5).** Dark oval body, two translucent wings, drawn tiny.
- **Lady frog.** frog-idle.svg with the pink palette and a bow between the eyes.
- **Power-ups.** White ring, coloured disc, simple icon in white.
- **Ice floe (2x1).** Irregular rounded polygon, three cracks that grow with the crack state.
- **Hedge tile, kerb, streetlamp, crossing signal.** Simple, rounded, on-palette.

## 5. Animation rules

- **Hop.** 110 ms. Scale Y goes 1.0 to 1.25 at t=0.4, then 0.8 at landing, then back to 1.0 over
  90 ms with scale X at 1.3 during the squash. Arc height 0.4 tile. Use frog-jump between t=0.15
  and t=0.85, frog-idle otherwise.
- **Idle.** Breathe: scale 1 plus or minus 0.02 at 1 Hz. Blink every 3 to 5 s (uniform random
  interval, re-rolled after each blink) by drawing a frogBody ellipse over each eye for 100 ms.
- **Death, squish.** Scale Y to 0.15, scale X to 1.6 over 120 ms, hold 500 ms, fade. Two tyre
  marks appear across the frog.
- **Death, drown.** Frog scales to 0.6 and sinks 6 px with alpha to 0 over 400 ms. Splash ring plus
  8 bubbles rising over 800 ms.
- **Death, timeout.** Frog blinks red three times, then the squish fade.
- **Home landing.** Frog scales to 1.2 and back over 200 ms. Lily pad emits a ring.
- **Turtle dive.** Over 0.5 s scale to 0.85 and alpha to 0.45, then invisible, leaving a ripple
  ring. Reverse on rise. Turtles about to dive blink twice in the last 0.6 s.
- **Vehicles.** No animation except the motorbike leans 4 degrees and the bus bounces 1 px at 4 Hz.
- **Water.** Three lighter streak bands per river row, offset by sine, moving with the lane
  direction. Six-pixel specular dashes drift at 1.5x lane speed.

## 6. Environment rendering

- **Banks.** grassA and grassB in horizontal 1-tile stripes with 3 px lighter tufts scattered by
  the seeded RNG.
- **Road.** road fill, 2 px noise speckle at 6% alpha, dashed laneLine between lanes (dash 12,
  gap 12, 2 px). Kerb line 3 px in median colour at both road edges.
- **Median.** median fill with a 2 px darker kerb line top and bottom, occasional storm drain.
- **River.** water fill. Bank edges get a 4 px waterLight foam line. Under logs and turtles a 2 px
  waterDeep contact shadow.
- **Home row.** hedge fill between slots, lily pads in slots, 6 px darker soil strip along the top.
- **Rail lane (world 5).** Two rails in #6B7280 with sleepers, crossing signal posts at both ends.

## 7. Lighting and weather

Drawn as full-canvas layers after entities and before the HUD.

- **Day.** Nothing.
- **Dusk.** tint layer with `globalCompositeOperation = "multiply"`, then a warm horizontal
  gradient band on the water in waterLight at 20% alpha.
- **Night.** tint layer, then a `"lighter"` pass: headlight cones (radial gradient 3 tiles long,
  headlight colour, 35% to 0%), taillight glow, lily pads glow accentB at 30%, streetlamps at the
  median ends with a 2-tile warm pool.
- **Rain.** 120 streaks 12 px long moving down-left at 900 px/s at 25% alpha. Ring ripples spawn on
  water and on road puddles. Puddles are 3 to 5 ellipses per road row that reflect light colours.
- **Fog.** Two drifting translucent bands (fog tint) plus 30 fireflies (accentA) that drift and
  pulse.
- **Snow.** 80 flakes 2 to 4 px drifting down at 40 px/s with a sine wobble.

## 8. Typography and UI

- **Font.** Fredoka, self-hosted via `@fontsource/fredoka`, weights 400, 600, 700. Score uses
  `font-variant-numeric: tabular-nums` so digits do not jitter.
- **HUD top row.** SCORE (left), world and level name (centre), HI (right). Cream text with a 3 px
  ink outline.
- **HUD bottom row.** Lives as small frog icons (left), timer bar (right, 6 tiles wide, 10 px tall,
  rounded, fill goes frogBody to gold at 40% to danger at 20%, pulses under 5 s).
- **Buttons.** Pill shape, accentA fill, 4 px bottom edge 22% darker, ink text, press moves the pill
  2 px down. Focus ring 3 px cream.
- **Score popups.** Fredoka 600, cream with 3 px ink outline, rise 24 px and fade over 700 ms.
- **Cards** (level intro, pause, game over). Rounded 24 px panel in cream at 96% alpha, ink text,
  world accent stripe along the top.

## 9. Screens

1. **Title.** Logo, animated river behind, frog hero idle-breathing, "Press any key / Tap to start",
   hi-score, settings and leaderboard buttons.
2. **Level intro card.** World name, level number, icons of the hazards in this level, 1.2 s then
   dismisses on input.
3. **Play.** The grid and HUD.
4. **Pause overlay.** Dim, card with Resume, Restart, Settings, Quit.
5. **Game over.** Score, best, near-miss count, streak best, Retry and Title. Leaderboard entry if
   top 10.
6. **Results** (level clear). Time bonus count-up, homes filled, next world reveal on world change.
