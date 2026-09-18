# Spec M7: Power-ups, bonuses, and scoring meta

Goal: the four power-ups, the lady frog escort, run statistics, and a local leaderboard. Read
`docs/PLAN.md` section 2.2, `docs/ART_BIBLE.md` sections 3 and 4 (power-up badges), and
`docs/ARCHITECTURE.md` sections 9 and 12.

## 1. Power-ups (`game/powerups.ts`)

- From level 2, one power-up may be active on the field at a time. At the start of each attempt
  roll 25%; on success place it on a random platform in rows 2 to 6 (it rides with the platform)
  or on the median at a random column. It despawns after 12 s or when collected.
- Collect by landing on its tile (centre within 0.5 tile). Emit `powerup` with `kind`.
- Kinds and effects:
  - **Bubble Shield.** The next death is cancelled: the frog is pushed back to the tile it hopped
    from (or the nearest safe platform if in water) and the shield pops with a burst. Lasts until
    used or the attempt ends. Draw a translucent blue bubble around the frog.
  - **Freeze Frame.** All lanes stop for 3 s, then resume over 0.5 s. Draw a light-blue vignette
    and frost the HUD edge. Timer keeps running.
  - **Rewind Clock.** +10 s on the timer, capped at the level limit. Big "+10s" popup.
  - **Mega Hop.** The next forward hop covers 2 tiles with a higher arc (0.7 tile). Draw a lime
    up-chevron above the frog until used. Side hops do not consume it.
- Weights: Shield 30, Freeze 25, Clock 25, Mega Hop 20.

## 2. Fly and lady frog

- Fly in a home slot is already scored (+200). Add the fly sprite bobbing.
- **Lady frog.** From level 3, 20% per attempt: a pink frog sits on a random log in rows 2 to 6.
  Landing on her tile picks her up; she rides on the frog's back. Reaching home with her scores
  +500 and a "LADY FROG!" popup. Dying drops her.

## 3. Run statistics (`game/scoring.ts`)

Track per run: score, level reached, homes, deaths by cause, near-misses, best combo, best
streak multiplier, power-ups collected, time played. Show them on Game Over.

## 4. Leaderboard (`core/save.ts`)

- Top 10 by score with `{ name, score, world, level, date }`.
- On a qualifying Game Over, a three-letter name entry (arcade style) with keyboard and touch
  (tap the letter to cycle). Default the name to the last one used.
- Leaderboard screen from the Title.

## 5. Scoring table (final)

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

## 6. Tests

Power-up placement never lands on water without a platform; shield cancels each death cause
correctly; mega hop two-tile target obeys bounds and hedges; leaderboard insert, sort, and cap at 10.

## Acceptance

Typecheck, lint, tests, build pass. Each power-up is collectable and visibly does its thing.
Screenshots `docs/screens/m7-shield.png`, `m7-freeze.png`, `m7-leaderboard.png`.

## Handoff

`docs/specs/M7-report.md`. Do not commit.
