# Ribbit Rush: Level Design

Owner: Fable. Fifteen campaign levels across five worlds, then Endless. Each world has a base lane
table; levels within the world apply the modifiers listed under it. Speeds are tiles per second,
positive means moving right. Period is the repeat length in tiles. Widths are in tiles.

## Difficulty spine

| Level | World | Speed mult | Time (s) | Croc chance | Fly chance | New thing |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 Sunny Suburb | 1.00 | 30 | 0.00 | 0.35 | The basics |
| 2 | 1 | 1.10 | 28 | 0.15 | 0.35 | Turtles dive |
| 3 | 1 | 1.20 | 26 | 0.25 | 0.35 | A motorbike lane |
| 4 | 2 Coastal Highway | 1.00 | 28 | 0.30 | 0.35 | Jet skis on the water |
| 5 | 2 | 1.10 | 26 | 0.30 | 0.35 | Two motorbike lanes |
| 6 | 2 | 1.20 | 24 | 0.30 | 0.35 | Short logs |
| 7 | 3 Neon City | 1.00 | 26 | 0.35 | 0.35 | Rain, trams, oil slicks |
| 8 | 3 | 1.10 | 24 | 0.35 | 0.35 | More oil, faster taxis |
| 9 | 3 | 1.20 | 22 | 0.35 | 0.35 | All turtles dive |
| 10 | 4 Misty Marsh | 1.00 | 26 | 0.45 | 0.35 | Fog, snakes on the median |
| 11 | 4 | 1.10 | 24 | 0.45 | 0.35 | Otters in the river |
| 12 | 4 | 1.20 | 22 | 0.45 | 0.35 | Snakes swim too |
| 13 | 5 Frozen Fjord | 1.00 | 24 | 0.50 | 0.35 | Ice floes crack, train lane |
| 14 | 5 | 1.10 | 22 | 0.50 | 0.35 | Two floe lanes |
| 15 | 5 | 1.20 | 20 | 0.50 | 0.35 | Everything at once |

Power-ups (M7) spawn from level 2 onward: one active at a time, 25% chance per attempt, placed on
a random platform or on the median.

## New mover and lane rules needed beyond the classic core

- `MoverDef.speed?: number` overrides the lane speed for that mover, so a river lane can carry
  logs at one speed and a jet ski or otter at another.
- Killer movers: every vehicle type plus `jetski`, `otter`, `snake`. They kill on hitbox overlap
  in any lane kind, even while the frog is riding a platform.
- `median` lanes may carry movers (snakes).
- `rail` lanes hold a `train` (width 6). The crossing signal shows 1.5 s before the train enters
  the screen. Standing on a rail lane is safe until the train arrives.
- `floe` platforms crack after the frog has stood on one for 2 s, then sink over 0.4 s (drown if
  still on it). They reset when off screen.
- `hazardTiles: { col: number; row: number; type: 'oil' }[]` on a level: hopping onto an oil tile
  slides the frog one extra tile in the hop direction (blocked at the grid edge).
- Tram (width 3) is a road mover with a rail drawn under its lane.

## World 1: Sunny Suburb

Day, clear. Classic hazards only.

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +1.6 | 16 | log w4 @0, log w4 @8 |
| 3 | river | -1.2 | 15 | turtle w2 @0, w2 @5, w2 @10 |
| 4 | river | +2.4 | 18 | log w3 @0, log w3 @9 |
| 5 | river | -1.0 | 14 | log w2 @0, w2 @4.5, w2 @9 |
| 6 | river | +1.4 | 16 | turtle w3 @0, w3 @8 |
| 8 | road | -2.2 | 16 | truck w2 @0, truck w2 @8 |
| 9 | road | +1.5 | 15 | car @0, car @5, car @10 |
| 10 | road | -3.0 | 17 | sports @0, sports @8.5 |
| 11 | road | +1.2 | 16 | bus w2 @0, bus w2 @6, bus w2 @12 |
| 12 | road | -1.6 | 14 | car @0, taxi @4.5, car @9.5 |

- Level 1: as above.
- Level 2: turtle groups at row 3 @10 and row 6 @8 dive (up 4 s, down 2 s, phase 0 and 2).
- Level 3: row 10 becomes motorbikes: speed -3.6, period 12, motorbike w0.6 @0 and @6. All turtles
  from level 2 still dive.

## World 2: Coastal Highway

Dusk, clear. Wider gaps but faster, and the water gets hostile.

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +1.8 | 18 | log w3 @0, log w3 @9; jetski @4 speed +4.0 (killer) |
| 3 | river | -1.5 | 16 | turtle w2 @0, w2 @5.5, w2 @11 (the @11 group dives, up 3.5 down 2) |
| 4 | river | +2.6 | 20 | log w4 @0, log w4 @10 |
| 5 | river | -1.3 | 15 | log w2 @0, w2 @5, w2 @10; jetski @2.5 speed -4.5 (killer) |
| 6 | river | +1.6 | 16 | turtle w3 @0, w3 @8 (the @8 group dives, up 4 down 2, phase 1) |
| 8 | road | -3.2 | 18 | sports @0, sports @6, sports @12 |
| 9 | road | +2.0 | 16 | pickup w1.5 @0, van w1.5 @8 |
| 10 | road | -4.0 | 14 | motorbike w0.6 @0, @7 |
| 11 | road | +1.4 | 18 | bus w2 @0, bus w2 @9 |
| 12 | road | -2.4 | 15 | car @0, taxi @5, car @10 |

- Level 4: as above.
- Level 5: row 9 becomes motorbikes too: speed +3.8, period 13, motorbike @0, @6.5.
- Level 6: row 4 logs shrink to w2 @0, w2 @5, w2 @10 at period 15; row 2 loses one log (only @0).

## World 3: Neon City

Night, rain. Reflections everywhere, and the road is slick.

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +2.0 | 18 | log w3 @0, log w3 @9 |
| 3 | river | -1.6 | 15 | turtle w2 @0, @5, @10 (@5 dives, up 3 down 2) |
| 4 | river | +2.8 | 20 | log w2 @0, w2 @6.5, w2 @13 |
| 5 | river | -1.4 | 16 | log w4 @0, log w4 @8 |
| 6 | river | +1.7 | 16 | turtle w3 @0, w3 @8 (@0 dives, up 3.5 down 2, phase 2) |
| 8 | road | -2.6 | 20 | tram w3 @0, tram w3 @10 |
| 9 | road | +3.0 | 15 | taxi @0, taxi @5, taxi @10 |
| 10 | road | -3.8 | 14 | motorbike @0, @7 |
| 11 | road | +2.2 | 18 | sports @0, van w1.5 @6, sports @12 |
| 12 | road | -2.0 | 16 | car @0, taxi @5.5, car @11 |

Hazard tiles (oil): level 7: (col 3, row 9), (col 9, row 11). Level 8: add (col 6, row 12),
(col 1, row 10). Level 9: add (col 11, row 9).

- Level 7: as above.
- Level 8: row 9 taxis speed +3.6; more oil.
- Level 9: every turtle group dives (up 3 s, down 2 s, phases spread 0, 1.5, 3).

## World 4: Misty Marsh

Dawn, fog. Vehicles are slower but appear late out of the fog. The wildlife is the threat.

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +1.5 | 16 | log w3 @0, log w3 @8 |
| 3 | river | -1.3 | 15 | turtle w2 @0, @5, @10 (all dive, up 3 down 2, phases 0, 1, 2) |
| 4 | river | +2.2 | 18 | log w4 @0, log w4 @9 |
| 5 | river | -1.2 | 16 | turtle w3 @0, w3 @8 (both dive, up 3.5 down 2, phases 0, 1.75) |
| 6 | river | +1.6 | 18 | log w2 @0, w2 @6, w2 @12 |
| 7 | median | +0.8 | 20 | snake w1.5 @0 (killer) |
| 8 | road | -1.8 | 18 | truck w2 @0, truck w2 @9 |
| 9 | road | +1.4 | 16 | pickup w1.5 @0, pickup w1.5 @8 |
| 10 | road | -2.4 | 15 | car @0, car @7.5 |
| 11 | road | +1.2 | 20 | bus w2 @0, bus w2 @10 |
| 12 | road | -1.6 | 16 | van w1.5 @0, car @8 |

Fog renders vehicles at full alpha only within 4 tiles of the frog's column; beyond that they fade
to 35%. This is visual, not mechanical.

- Level 10: as above.
- Level 11: add otters: row 4 otter @4.5 speed +3.2 (killer), row 6 otter @3 speed +3.0 (killer).
- Level 12: add a second snake on the median @10 speed +0.8; row 2 gains a swimming snake @4
  speed +2.8 (killer).

## World 5: Frozen Fjord

Snow, clear. Heavy traffic, a train, and ice that does not hold.

| Row | Kind | Speed | Period | Movers |
| --- | --- | --- | --- | --- |
| 2 | river | +1.6 | 18 | floe w3 @0, floe w3 @9 |
| 3 | river | -1.4 | 16 | log w3 @0, log w3 @8 |
| 4 | river | +2.4 | 18 | floe w2 @0, floe w2 @6, floe w2 @12 |
| 5 | river | -1.2 | 15 | turtle w2 @0, @5, @10 (@10 dives, up 4 down 2) |
| 6 | river | +1.5 | 16 | log w4 @0, log w4 @8 |
| 8 | rail | -7.0 | 40 | train w6 @0 |
| 9 | road | +1.6 | 18 | truck w2 @0, truck w2 @9 |
| 10 | road | -2.8 | 16 | sports @0, sports @8 |
| 11 | road | +1.3 | 20 | bus w2 @0, bus w2 @10 |
| 12 | road | -2.0 | 15 | car @0, van w1.5 @5, car @10.5 |

- Level 13: as above.
- Level 14: row 3 becomes floes: floe w2 @0, w2 @5.5, w2 @11 at period 16 (two floe lanes with row 4);
  row 6 logs shrink to w3.
- Level 15: train period drops to 30; row 10 becomes motorbikes speed -3.8 period 13 @0, @6.5;
  row 5 all turtles dive (up 3 down 2, phases 0, 1, 2).

## Endless

After level 15 (or from the title once unlocked). A generator with the seeded RNG:

- Difficulty `d` starts at 1.2 and rises by 0.04 per crossing.
- Pick a world theme every 5 crossings, cycling 1 to 5 for the look.
- Each river lane: choose from {log w4, log w3, log w2, turtle w3, turtle w2, floe w3, floe w2}
  weighted by d (short and diving options get likelier as d grows). Speed 1.0 to 2.8 times d, capped
  at 4.5. Period between COLS + width + 2 and COLS + width + 7, shrinking with d.
- Each road lane: choose from the vehicle list by world with speed 1.2 to 3.4 times d, capped at
  5.0; one motorbike lane guaranteed once d > 1.6; a rail lane at 10% once d > 2.0.
- Killers (jet ski, otter, snake) enter at d > 1.8 with 20% per lane.
- Oil at d > 1.5, one to three tiles.
- Time per crossing: `max(14, 26 - 2 * (d - 1))`.
- Score: standard scoring plus 100 per crossing times the current streak multiplier.
