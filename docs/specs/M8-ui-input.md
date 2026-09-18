# Spec M8: UI, settings, and input polish

Goal: every screen in `docs/ART_BIBLE.md` section 9 finished, a settings screen, first-class touch
and gamepad, and a phone that plays it end to end. Read bible sections 8 and 9 and
`docs/ARCHITECTURE.md` section 5.

## 1. Screens

- **Title.** Finish per bible: logo, animated river, frog hero, Start, Endless (locked until level
  15 has been reached). Tuck the 1.5x frog behind the first R so only its eyes and the top of its
  head show above the letter (currently its whole body juts out to the left). Add a grass bank
  along the bottom of the title with the 3x hero sitting on it, and a slow parade of vehicles on a
  road strip between the river band and the bank, so the title feels like the game. Start, Endless (locked until level
  15 has been reached; shows a lock), Leaderboard, Settings, How to play (one card with the
  controls and three tips). Focus ring and keyboard navigation between buttons.
- **Level intro card.** Polished: world accent stripe, world name, level number, hazard icons with
  labels, "Go!" on dismiss.
- **Pause.** Resume, Restart level, Settings, Quit to title. Dim the play field 60%.
- **Game over.** Score, best, run stats from M7, Retry, Title. Name entry when qualifying.
- **Results (level clear).** Time bonus counts up with ticks, homes filled shown as five pads
  lighting, "Next" continues; on a world change show the next world's name and palette swatch
  with a 1 s reveal.

## 2. Settings screen

Master, music, SFX sliders (0 to 100) with live preview; Reduce motion toggle; Key remap for the
four hop directions, confirm, and pause (press the key to bind, Escape cancels); Reset best scores
(with a confirm). Persist in save. Sliders and toggles work with keyboard, touch, and gamepad.

## 3. Touch

- Swipe of 24 px or more in any direction hops that way. A tap hops up. Recognise within 150 ms.
- Optional on-screen d-pad (toggle in settings, default on for touch devices): four translucent
  chunky buttons in the bottom HUD band, 56 px, with press feedback.
- Pause button top-right on touch devices.
- No 300 ms click delay; `touch-action: none`; prevent scroll and pinch on the canvas.

## 4. Gamepad

D-pad and left stick with 0.5 deadzone and edge detection; A confirms, B backs, Start pauses.
Menu navigation with the stick. Show gamepad glyphs in prompts when a pad was the last input.

## 5. Layout

- Portrait phones: the 13 x 15 grid scales to width, HUD bands remain readable at 360 px wide.
- Landscape and desktop: letterboxed with a subtle world-coloured vignette either side.
- Handle `visibilitychange` (pause on hide) and `resize` (re-letterbox without a frame drop).

## 6. Accessibility

Focus visible on every control; all colours in the HUD meet 4.5:1 against their background
(cream on ink outline satisfies this); reduce motion honoured everywhere; a colourblind-safe
check that the timer bar also shrinks, not just recolours.

## Acceptance

1. Typecheck, lint, tests, build pass.
2. Play a full level on a phone-sized viewport (375 x 812) using only touch, in Chrome devtools
   device mode. Screenshot `docs/screens/m8-phone.png`.
3. Play a full level with a gamepad or a gamepad emulator; if none is available, unit test the
   mapping and say so.
4. Every screen in section 1 is reachable and returns correctly.

## Handoff

`docs/specs/M8-report.md`. Do not commit.
