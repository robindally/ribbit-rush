# Spec M9: Endless mode and frog skins

Goal: a reason to keep playing after the campaign. Read `docs/LEVELS.md` (the Endless section)
and `docs/ART_BIBLE.md` section 3 (frog palette tokens).

## 1. Endless mode

- Unlocked when the player has reached level 15 (save flag `unlocks: ['endless']`). Title shows
  the button locked with a "Reach level 15" hint until then.
- Implement `game/endless.ts` with `makeEndlessCrossing(d: number, rng: Rng, worldId): LevelDef`
  following the LEVELS.md generator rules exactly. One crossing = one frog reaching any home slot;
  homes never fill in Endless, each home landing scores and immediately starts the next crossing
  with a new lane set generated at the new difficulty.
- The theme cycles 1 to 5 every 5 crossings with a 1 s palette crossfade.
- HUD shows "CROSSING N" in place of the level name and the current difficulty as a small badge.
- Separate Endless leaderboard (top 10 by crossings, then score). Daily seed option: a toggle on
  the Endless start card that seeds the RNG from the UTC date, so friends can compare runs.

## 2. Frog skins

Skins recolour the frog sprites at load by replacing the palette tokens in the SVG text before
rasterising (string replace on the hex values), plus an optional hat overlay sprite drawn above
the head that rotates with the frog.

| Skin | Body / dark / light | Hat | Unlock |
| --- | --- | --- | --- |
| Classic | #58D65E / #3FA84A / #8BEA7B | none | default |
| Toad | #C98A4B / #8F5E2E / #E9B77A | none | fill 25 homes total |
| Tree Frog | #9BE85A / #5FA832 / #FFB640 (orange feet) | none | clear world 1 |
| Poison Dart | #3E9CE6 / #1B2A1D / #7CC7FF | none | clear world 2 |
| Ninja | #2B2B2B / #111111 / #E8474B | red headband | clear world 3 |
| Swamp King | #4F7F3A / #2F5A25 / #C9F5A6 | small gold crown | clear world 4 |
| Frost | #F3F7FB / #BFE3FA / #7CC7FF | knitted beanie | clear world 5 |
| Golden | #FFC83D / #C98A0B / #FFF1A8 | none | score 50,000 in one run |
| Ghost | #FFFFFF at 70% alpha / #D9E3EC / #FFFFFF | none | 15 near-misses in one run |

- Skin picker on the Title (a row of frog heads, locked ones greyed with the unlock text).
- The lives icons and the results card use the chosen skin.
- Unlock toasts appear on the results or game-over card when earned.

## 3. Tests

Endless generator produces valid lanes (period rule) for d in {1.2, 2, 3, 4}; theme cycling;
daily seed determinism; unlock rules; skin palette replacement leaves no original hex behind.

## Acceptance

Typecheck, lint, tests, build pass. Screenshots `docs/screens/m9-endless.png` and `m9-skins.png`.
Endless holds 60 fps at d = 3.

## Handoff

`docs/specs/M9-report.md`. Do not commit.
