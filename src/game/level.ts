// Level definitions: the 15 campaign levels from docs/LEVELS.md, plus the post-15 loop. See
// ARCHITECTURE.md section 10 and docs/specs/M6-worlds.md section 6.
//
// Data shape: each world's *base* table (its first level, e.g. level 1 for world 1, level 4 for
// world 2) is written out as a `LaneSeed[]` matching docs/LEVELS.md's own per-world table exactly.
// A world's other two levels are written as their own `LaneSeed[]` too (not derived/patched in
// code) so every level is directly comparable, row by row, against its LEVELS.md bullet - but
// every lane speed that LEVELS.md does *not* explicitly restate for that level is written as
// `<base value> * <level's speed mult>` (the exact "Speed mult" column from the difficulty spine
// table) rather than a pre-computed decimal, so the base number and the multiplier are both
// visible and the arithmetic itself can't be transcribed wrong. Explicitly-restated numbers (a
// replaced lane's own stated speed/period, a new killer mover's own stated speed) are written
// literally, exactly as LEVELS.md gives them - see "Deviations" in docs/specs/M6-report.md for the
// judgment call this implies (an explicit per-level number has no "base" to scale, so it carries
// forward unchanged into any later level that doesn't itself restate it).

import { HOME_ROW, MEDIAN_ROW, START_ROW } from './constants';
import { createFloeState } from './lanes';
import type { DiveDef, LaneDef, LaneKind, LevelDef, MoverType } from './types';

// --- Small data DSL (docs/specs/M6-worlds.md section 6: "Keep the data as tables, not code") ---

interface MoverSeed {
  type: MoverType;
  width: number;
  offset: number;
  dive?: DiveDef;
  /** Overrides the lane's own speed for this one mover (jet skis, otters, snakes). */
  speed?: number;
}

interface LaneSeed {
  row: number;
  kind: LaneKind;
  speed: number;
  period: number;
  movers: MoverSeed[];
}

interface HazardSeed {
  col: number;
  row: number;
  type: 'oil';
}

function mv(
  type: MoverType,
  width: number,
  offset: number,
  extra: Partial<Pick<MoverSeed, 'dive' | 'speed'>> = {},
): MoverSeed {
  return { type, width, offset, ...extra };
}

function ln(row: number, kind: LaneKind, speed: number, period: number, movers: MoverSeed[]): LaneSeed {
  return { row, kind, speed, period, movers };
}

/** Adds the rows every level shares (home, start bank, and - unless the world's own dynamic rows
 * already include one, e.g. world 4's snake median - an empty median), sorted by row. */
function withStatics(dynamic: LaneSeed[]): LaneSeed[] {
  const lanes = [...dynamic, ln(HOME_ROW, 'home', 0, 1, []), ln(START_ROW, 'bank', 0, 1, [])];
  if (!dynamic.some((l) => l.row === MEDIAN_ROW)) {
    lanes.push(ln(MEDIAN_ROW, 'median', 0, 1, []));
  }
  return lanes.sort((a, b) => a.row - b.row);
}

/** Speed mult column, docs/LEVELS.md "Difficulty spine" table - the same three values repeat for
 * index 1/2/3 within every world. Index 1 (mult 1.00) needs no multiplier at all, so every world's
 * first level below writes its base speeds bare, with no `* MULT_1`. */
const MULT_2 = 1.1;
const MULT_3 = 1.2;

// Motorbike width is stated as 0.6 everywhere it's introduced in docs/LEVELS.md (world 1 level 3,
// world 2's base row 10, world 2 level 5's row 9); used as the default wherever a motorbike
// mover's width isn't independently restated (world 3, world 5 level 15).
const MOTORBIKE_W = 0.6;
// Bible section 4: "Otter (1x1)". Neither jet ski nor otter/median-swimming-snake widths are given
// in docs/LEVELS.md's mover text (unlike the bible-specified snake width below) - see
// docs/specs/M6-report.md "Deviations" for the judgment call on jet ski's width.
const JETSKI_W = 1;
const OTTER_W = 1;
// docs/LEVELS.md world 4 row 7 gives "snake w1.5 @0" explicitly; used as the standard snake width
// (median and river-swimming) throughout, matching bible section 4's "Snake (1.5x1)".
const SNAKE_W = 1.5;

// ============================================================================================
// World 1: Sunny Suburb (levels 1-3) - docs/LEVELS.md "World 1"
// ============================================================================================

const W1_L1: LaneSeed[] = [
  // Row 2/row 5 periods raised from LEVELS.md's original 16/14 to 18/16 (design review fix-up 3b:
  // period >= COLS + widest mover for every lane, no allowlisted shortfalls) - offsets scaled
  // proportionally and rounded to 0.5, see docs/specs/M6-report.md's "Fix-up" section.
  ln(2, 'river', 1.6, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(3, 'river', -1.2, 15, [mv('turtle', 2, 0), mv('turtle', 2, 5), mv('turtle', 2, 10)]),
  ln(4, 'river', 2.4, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(5, 'river', -1.0, 16, [mv('log', 2, 0), mv('log', 2, 5), mv('log', 2, 10.5)]),
  ln(6, 'river', 1.4, 16, [mv('turtle', 3, 0), mv('turtle', 3, 8)]),
  ln(8, 'road', -2.2, 16, [mv('truck', 2, 0), mv('truck', 2, 8)]),
  ln(9, 'road', 1.5, 15, [mv('car', 1, 0), mv('car', 1, 5), mv('car', 1, 10)]),
  ln(10, 'road', -3.0, 17, [mv('sports', 1, 0), mv('sports', 1, 8.5)]),
  ln(11, 'road', 1.2, 16, [mv('bus', 2, 0), mv('bus', 2, 6), mv('bus', 2, 12)]),
  ln(12, 'road', -1.6, 14, [mv('car', 1, 0), mv('taxi', 1, 4.5), mv('car', 1, 9.5)]),
];

// Level 2: "turtle groups at row 3 @10 and row 6 @8 dive (up 4s down 2s, phase 0 and 2)."
const W1_L2: LaneSeed[] = [
  ln(2, 'river', 1.6 * MULT_2, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(3, 'river', -1.2 * MULT_2, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5),
    mv('turtle', 2, 10, { dive: { up: 4, down: 2, phase: 0 } }),
  ]),
  ln(4, 'river', 2.4 * MULT_2, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(5, 'river', -1.0 * MULT_2, 16, [mv('log', 2, 0), mv('log', 2, 5), mv('log', 2, 10.5)]),
  ln(6, 'river', 1.4 * MULT_2, 16, [
    mv('turtle', 3, 0),
    mv('turtle', 3, 8, { dive: { up: 4, down: 2, phase: 2 } }),
  ]),
  ln(8, 'road', -2.2 * MULT_2, 16, [mv('truck', 2, 0), mv('truck', 2, 8)]),
  ln(9, 'road', 1.5 * MULT_2, 15, [mv('car', 1, 0), mv('car', 1, 5), mv('car', 1, 10)]),
  ln(10, 'road', -3.0 * MULT_2, 17, [mv('sports', 1, 0), mv('sports', 1, 8.5)]),
  ln(11, 'road', 1.2 * MULT_2, 16, [mv('bus', 2, 0), mv('bus', 2, 6), mv('bus', 2, 12)]),
  ln(12, 'road', -1.6 * MULT_2, 14, [mv('car', 1, 0), mv('taxi', 1, 4.5), mv('car', 1, 9.5)]),
];

// Level 3: "row 10 becomes motorbikes: speed -3.6, period 14.6, motorbike w0.6 @0 and @7.5. All
// turtles from level 2 still dive."
const W1_L3: LaneSeed[] = [
  ln(2, 'river', 1.6 * MULT_3, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(3, 'river', -1.2 * MULT_3, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5),
    mv('turtle', 2, 10, { dive: { up: 4, down: 2, phase: 0 } }),
  ]),
  ln(4, 'river', 2.4 * MULT_3, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(5, 'river', -1.0 * MULT_3, 16, [mv('log', 2, 0), mv('log', 2, 5), mv('log', 2, 10.5)]),
  ln(6, 'river', 1.4 * MULT_3, 16, [
    mv('turtle', 3, 0),
    mv('turtle', 3, 8, { dive: { up: 4, down: 2, phase: 2 } }),
  ]),
  ln(8, 'road', -2.2 * MULT_3, 16, [mv('truck', 2, 0), mv('truck', 2, 8)]),
  ln(9, 'road', 1.5 * MULT_3, 15, [mv('car', 1, 0), mv('car', 1, 5), mv('car', 1, 10)]),
  // Row 10 motorbike lane: period raised 12 -> 14.6 (13 + widest 0.6 + 1), offset scaled and
  // rounded to 0.5 (fix-up 3b).
  ln(10, 'road', -3.6, 14.6, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7.5)]),
  ln(11, 'road', 1.2 * MULT_3, 16, [mv('bus', 2, 0), mv('bus', 2, 6), mv('bus', 2, 12)]),
  ln(12, 'road', -1.6 * MULT_3, 14, [mv('car', 1, 0), mv('taxi', 1, 4.5), mv('car', 1, 9.5)]),
];

// ============================================================================================
// World 2: Coastal Highway (levels 4-6) - docs/LEVELS.md "World 2"
// ============================================================================================

const W2_L4: LaneSeed[] = [
  ln(2, 'river', 1.8, 18, [mv('log', 3, 0), mv('log', 3, 9), mv('jetski', JETSKI_W, 4, { speed: 4.0 })]),
  ln(3, 'river', -1.5, 16, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5.5),
    mv('turtle', 2, 11, { dive: { up: 3.5, down: 2, phase: 0 } }),
  ]),
  ln(4, 'river', 2.6, 20, [mv('log', 4, 0), mv('log', 4, 10)]),
  ln(5, 'river', -1.3, 15, [
    mv('log', 2, 0),
    mv('log', 2, 5),
    mv('log', 2, 10),
    mv('jetski', JETSKI_W, 2.5, { speed: -4.5 }),
  ]),
  ln(6, 'river', 1.6, 16, [
    mv('turtle', 3, 0),
    mv('turtle', 3, 8, { dive: { up: 4, down: 2, phase: 1 } }),
  ]),
  ln(8, 'road', -3.2, 18, [mv('sports', 1, 0), mv('sports', 1, 6), mv('sports', 1, 12)]),
  ln(9, 'road', 2.0, 16, [mv('pickup', 1.5, 0), mv('van', 1.5, 8)]),
  ln(10, 'road', -4.0, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 1.4, 18, [mv('bus', 2, 0), mv('bus', 2, 9)]),
  ln(12, 'road', -2.4, 15, [mv('car', 1, 0), mv('taxi', 1, 5), mv('car', 1, 10)]),
];

// Level 5: "row 9 becomes motorbikes too: speed +3.8, period 14.6, motorbike @0, @7.5."
const W2_L5: LaneSeed[] = [
  ln(2, 'river', 1.8 * MULT_2, 18, [
    mv('log', 3, 0),
    mv('log', 3, 9),
    mv('jetski', JETSKI_W, 4, { speed: 4.0 * MULT_2 }),
  ]),
  ln(3, 'river', -1.5 * MULT_2, 16, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5.5),
    mv('turtle', 2, 11, { dive: { up: 3.5, down: 2, phase: 0 } }),
  ]),
  ln(4, 'river', 2.6 * MULT_2, 20, [mv('log', 4, 0), mv('log', 4, 10)]),
  ln(5, 'river', -1.3 * MULT_2, 15, [
    mv('log', 2, 0),
    mv('log', 2, 5),
    mv('log', 2, 10),
    mv('jetski', JETSKI_W, 2.5, { speed: -4.5 * MULT_2 }),
  ]),
  ln(6, 'river', 1.6 * MULT_2, 16, [
    mv('turtle', 3, 0),
    mv('turtle', 3, 8, { dive: { up: 4, down: 2, phase: 1 } }),
  ]),
  ln(8, 'road', -3.2 * MULT_2, 18, [mv('sports', 1, 0), mv('sports', 1, 6), mv('sports', 1, 12)]),
  // Row 9 motorbike lane: period raised 13 -> 14.6 (13 + widest 0.6 + 1), offset scaled and
  // rounded to 0.5 (fix-up 3b).
  ln(9, 'road', 3.8, 14.6, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7.5)]),
  ln(10, 'road', -4.0 * MULT_2, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 1.4 * MULT_2, 18, [mv('bus', 2, 0), mv('bus', 2, 9)]),
  ln(12, 'road', -2.4 * MULT_2, 15, [mv('car', 1, 0), mv('taxi', 1, 5), mv('car', 1, 10)]),
];

// Level 6: "row 4 logs shrink to w2 @0, w2 @5, w2 @10 at period 15; row 2 loses one log (only @0)."
const W2_L6: LaneSeed[] = [
  ln(2, 'river', 1.8 * MULT_3, 18, [mv('log', 3, 0), mv('jetski', JETSKI_W, 4, { speed: 4.0 * MULT_3 })]),
  ln(3, 'river', -1.5 * MULT_3, 16, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5.5),
    mv('turtle', 2, 11, { dive: { up: 3.5, down: 2, phase: 0 } }),
  ]),
  ln(4, 'river', 2.6 * MULT_3, 15, [mv('log', 2, 0), mv('log', 2, 5), mv('log', 2, 10)]),
  ln(5, 'river', -1.3 * MULT_3, 15, [
    mv('log', 2, 0),
    mv('log', 2, 5),
    mv('log', 2, 10),
    mv('jetski', JETSKI_W, 2.5, { speed: -4.5 * MULT_3 }),
  ]),
  ln(6, 'river', 1.6 * MULT_3, 16, [
    mv('turtle', 3, 0),
    mv('turtle', 3, 8, { dive: { up: 4, down: 2, phase: 1 } }),
  ]),
  ln(8, 'road', -3.2 * MULT_3, 18, [mv('sports', 1, 0), mv('sports', 1, 6), mv('sports', 1, 12)]),
  // Row 9's motorbikes were introduced at level 5 with their own literal speed/period (no base
  // table value to scale) - they carry forward unchanged, per this file's header note. (Period
  // 14.6, offset 7.5 per fix-up 3b - same as level 5's own row 9 above.)
  ln(9, 'road', 3.8, 14.6, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7.5)]),
  ln(10, 'road', -4.0 * MULT_3, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 1.4 * MULT_3, 18, [mv('bus', 2, 0), mv('bus', 2, 9)]),
  ln(12, 'road', -2.4 * MULT_3, 15, [mv('car', 1, 0), mv('taxi', 1, 5), mv('car', 1, 10)]),
];

// ============================================================================================
// World 3: Neon City (levels 7-9) - docs/LEVELS.md "World 3"
// ============================================================================================

const W3_L7: LaneSeed[] = [
  ln(2, 'river', 2.0, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(3, 'river', -1.6, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 10),
  ]),
  ln(4, 'river', 2.8, 20, [mv('log', 2, 0), mv('log', 2, 6.5), mv('log', 2, 13)]),
  // Row 5 period raised 16 -> 18 (13 + widest 4 + 1), offset scaled and rounded to 0.5 (fix-up 3b).
  ln(5, 'river', -1.4, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(6, 'river', 1.7, 16, [
    mv('turtle', 3, 0, { dive: { up: 3.5, down: 2, phase: 2 } }),
    mv('turtle', 3, 8),
  ]),
  ln(8, 'road', -2.6, 20, [mv('tram', 3, 0), mv('tram', 3, 10)]),
  ln(9, 'road', 3.0, 15, [mv('taxi', 1, 0), mv('taxi', 1, 5), mv('taxi', 1, 10)]),
  ln(10, 'road', -3.8, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 2.2, 18, [mv('sports', 1, 0), mv('van', 1.5, 6), mv('sports', 1, 12)]),
  ln(12, 'road', -2.0, 16, [mv('car', 1, 0), mv('taxi', 1, 5.5), mv('car', 1, 11)]),
];
const HAZ_L7: HazardSeed[] = [
  { col: 3, row: 9, type: 'oil' },
  { col: 9, row: 11, type: 'oil' },
];

// Level 8: "row 9 taxis speed +3.6; more oil." Oil adds (col 6, row 12), (col 1, row 10).
const W3_L8: LaneSeed[] = [
  ln(2, 'river', 2.0 * MULT_2, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(3, 'river', -1.6 * MULT_2, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 10),
  ]),
  ln(4, 'river', 2.8 * MULT_2, 20, [mv('log', 2, 0), mv('log', 2, 6.5), mv('log', 2, 13)]),
  ln(5, 'river', -1.4 * MULT_2, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(6, 'river', 1.7 * MULT_2, 16, [
    mv('turtle', 3, 0, { dive: { up: 3.5, down: 2, phase: 2 } }),
    mv('turtle', 3, 8),
  ]),
  ln(8, 'road', -2.6 * MULT_2, 20, [mv('tram', 3, 0), mv('tram', 3, 10)]),
  ln(9, 'road', 3.6, 15, [mv('taxi', 1, 0), mv('taxi', 1, 5), mv('taxi', 1, 10)]),
  ln(10, 'road', -3.8 * MULT_2, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 2.2 * MULT_2, 18, [mv('sports', 1, 0), mv('van', 1.5, 6), mv('sports', 1, 12)]),
  ln(12, 'road', -2.0 * MULT_2, 16, [mv('car', 1, 0), mv('taxi', 1, 5.5), mv('car', 1, 11)]),
];
const HAZ_L8: HazardSeed[] = [...HAZ_L7, { col: 6, row: 12, type: 'oil' }, { col: 1, row: 10, type: 'oil' }];

// Level 9: "every turtle group dives (up 3s, down 2s, phases spread 0, 1.5, 3)." Five groups total
// (row 3's three, row 6's two) in row-then-offset order, phases cycling through the 3-value spread
// - see docs/specs/M6-report.md "Deviations" for this reading.
const W3_L9: LaneSeed[] = [
  ln(2, 'river', 2.0 * MULT_3, 18, [mv('log', 3, 0), mv('log', 3, 9)]),
  ln(3, 'river', -1.6 * MULT_3, 15, [
    mv('turtle', 2, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 1.5 } }),
    mv('turtle', 2, 10, { dive: { up: 3, down: 2, phase: 3 } }),
  ]),
  ln(4, 'river', 2.8 * MULT_3, 20, [mv('log', 2, 0), mv('log', 2, 6.5), mv('log', 2, 13)]),
  ln(5, 'river', -1.4 * MULT_3, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(6, 'river', 1.7 * MULT_3, 16, [
    mv('turtle', 3, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 3, 8, { dive: { up: 3, down: 2, phase: 1.5 } }),
  ]),
  ln(8, 'road', -2.6 * MULT_3, 20, [mv('tram', 3, 0), mv('tram', 3, 10)]),
  // Row 9's taxis kept level 8's own literal +3.6 speed (no base to scale further).
  ln(9, 'road', 3.6, 15, [mv('taxi', 1, 0), mv('taxi', 1, 5), mv('taxi', 1, 10)]),
  ln(10, 'road', -3.8 * MULT_3, 14, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7)]),
  ln(11, 'road', 2.2 * MULT_3, 18, [mv('sports', 1, 0), mv('van', 1.5, 6), mv('sports', 1, 12)]),
  ln(12, 'road', -2.0 * MULT_3, 16, [mv('car', 1, 0), mv('taxi', 1, 5.5), mv('car', 1, 11)]),
];
const HAZ_L9: HazardSeed[] = [...HAZ_L8, { col: 11, row: 9, type: 'oil' }];

// ============================================================================================
// World 4: Misty Marsh (levels 10-12) - docs/LEVELS.md "World 4"
// ============================================================================================

const W4_L10: LaneSeed[] = [
  ln(2, 'river', 1.5, 16, [mv('log', 3, 0), mv('log', 3, 8)]),
  ln(3, 'river', -1.3, 15, [
    mv('turtle', 2, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 1 } }),
    mv('turtle', 2, 10, { dive: { up: 3, down: 2, phase: 2 } }),
  ]),
  ln(4, 'river', 2.2, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(5, 'river', -1.2, 16, [
    mv('turtle', 3, 0, { dive: { up: 3.5, down: 2, phase: 0 } }),
    mv('turtle', 3, 8, { dive: { up: 3.5, down: 2, phase: 1.75 } }),
  ]),
  ln(6, 'river', 1.6, 18, [mv('log', 2, 0), mv('log', 2, 6), mv('log', 2, 12)]),
  // No median mover at level 10 (design review fix-up 3a): fog, diving turtles, and traffic only -
  // the median snake is introduced at level 11 instead. `withStatics` fills row 7 with an empty
  // median lane since no dynamic lane here claims it.
  ln(8, 'road', -1.8, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  ln(9, 'road', 1.4, 16, [mv('pickup', 1.5, 0), mv('pickup', 1.5, 8)]),
  ln(10, 'road', -2.4, 15, [mv('car', 1, 0), mv('car', 1, 7.5)]),
  ln(11, 'road', 1.2, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -1.6, 16, [mv('van', 1.5, 0), mv('car', 1, 8)]),
];

// Level 11: "the median snake is introduced here, not at level 10 (design review fix-up 3a): row 7
// median speed +0.8, period 20, snake w1.5 @0 (killer) - literal, its own first statement, no base
// to scale. Also add otters: row 4 otter @4.5 speed +3.2 (killer), row 6 otter @3 speed +3.0
// (killer)."
const W4_L11: LaneSeed[] = [
  ln(2, 'river', 1.5 * MULT_2, 16, [mv('log', 3, 0), mv('log', 3, 8)]),
  ln(3, 'river', -1.3 * MULT_2, 15, [
    mv('turtle', 2, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 1 } }),
    mv('turtle', 2, 10, { dive: { up: 3, down: 2, phase: 2 } }),
  ]),
  ln(4, 'river', 2.2 * MULT_2, 18, [
    mv('log', 4, 0),
    mv('log', 4, 9),
    mv('otter', OTTER_W, 4.5, { speed: 3.2 }),
  ]),
  ln(5, 'river', -1.2 * MULT_2, 16, [
    mv('turtle', 3, 0, { dive: { up: 3.5, down: 2, phase: 0 } }),
    mv('turtle', 3, 8, { dive: { up: 3.5, down: 2, phase: 1.75 } }),
  ]),
  ln(6, 'river', 1.6 * MULT_2, 18, [
    mv('log', 2, 0),
    mv('log', 2, 6),
    mv('log', 2, 12),
    mv('otter', OTTER_W, 3, { speed: 3.0 }),
  ]),
  ln(7, 'median', 0.8, 20, [mv('snake', SNAKE_W, 0)]),
  ln(8, 'road', -1.8 * MULT_2, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  ln(9, 'road', 1.4 * MULT_2, 16, [mv('pickup', 1.5, 0), mv('pickup', 1.5, 8)]),
  ln(10, 'road', -2.4 * MULT_2, 15, [mv('car', 1, 0), mv('car', 1, 7.5)]),
  ln(11, 'road', 1.2 * MULT_2, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -1.6 * MULT_2, 16, [mv('van', 1.5, 0), mv('car', 1, 8)]),
];

// Level 12: "add a second snake on the median @10 speed +0.8; row 2 gains a swimming snake @4
// speed +2.8 (killer)."
const W4_L12: LaneSeed[] = [
  ln(2, 'river', 1.5 * MULT_3, 16, [
    mv('log', 3, 0),
    mv('log', 3, 8),
    mv('snake', SNAKE_W, 4, { speed: 2.8 }),
  ]),
  ln(3, 'river', -1.3 * MULT_3, 15, [
    mv('turtle', 2, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 1 } }),
    mv('turtle', 2, 10, { dive: { up: 3, down: 2, phase: 2 } }),
  ]),
  ln(4, 'river', 2.2 * MULT_3, 18, [
    mv('log', 4, 0),
    mv('log', 4, 9),
    mv('otter', OTTER_W, 4.5, { speed: 3.2 }),
  ]),
  ln(5, 'river', -1.2 * MULT_3, 16, [
    mv('turtle', 3, 0, { dive: { up: 3.5, down: 2, phase: 0 } }),
    mv('turtle', 3, 8, { dive: { up: 3.5, down: 2, phase: 1.75 } }),
  ]),
  ln(6, 'river', 1.6 * MULT_3, 18, [
    mv('log', 2, 0),
    mv('log', 2, 6),
    mv('log', 2, 12),
    mv('otter', OTTER_W, 3, { speed: 3.0 }),
  ]),
  // Row 7's snake speed carries forward unchanged from its level-11 literal introduction (no base
  // to scale, per this file's header note); the second snake's own +0.8 is likewise literal, per
  // docs/LEVELS.md's level 12 bullet.
  ln(7, 'median', 0.8, 20, [mv('snake', SNAKE_W, 0), mv('snake', SNAKE_W, 10, { speed: 0.8 })]),
  ln(8, 'road', -1.8 * MULT_3, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  ln(9, 'road', 1.4 * MULT_3, 16, [mv('pickup', 1.5, 0), mv('pickup', 1.5, 8)]),
  ln(10, 'road', -2.4 * MULT_3, 15, [mv('car', 1, 0), mv('car', 1, 7.5)]),
  ln(11, 'road', 1.2 * MULT_3, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -1.6 * MULT_3, 16, [mv('van', 1.5, 0), mv('car', 1, 8)]),
];

// ============================================================================================
// World 5: Frozen Fjord (levels 13-15) - docs/LEVELS.md "World 5"
// ============================================================================================

const W5_L13: LaneSeed[] = [
  ln(2, 'river', 1.6, 18, [mv('floe', 3, 0), mv('floe', 3, 9)]),
  ln(3, 'river', -1.4, 16, [mv('log', 3, 0), mv('log', 3, 8)]),
  ln(4, 'river', 2.4, 18, [mv('floe', 2, 0), mv('floe', 2, 6), mv('floe', 2, 12)]),
  ln(5, 'river', -1.2, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5),
    mv('turtle', 2, 10, { dive: { up: 4, down: 2, phase: 0 } }),
  ]),
  // Row 6 period raised 16 -> 18 (13 + widest 4 + 1), offset scaled and rounded to 0.5 (fix-up
  // 3b). Level 14 shrinks this row to w3 logs (period 16 already sufficient), so only the base
  // level 13 table needed the fix.
  ln(6, 'river', 1.5, 18, [mv('log', 4, 0), mv('log', 4, 9)]),
  ln(8, 'rail', -7.0, 40, [mv('train', 6, 0)]),
  ln(9, 'road', 1.6, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  ln(10, 'road', -2.8, 16, [mv('sports', 1, 0), mv('sports', 1, 8)]),
  ln(11, 'road', 1.3, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -2.0, 15, [mv('car', 1, 0), mv('van', 1.5, 5), mv('car', 1, 10.5)]),
];

// Level 14: "row 3 becomes floes: floe w2 @0, w2 @5.5, w2 @11 at period 16 (two floe lanes with
// row 4); row 6 logs shrink to w3."
const W5_L14: LaneSeed[] = [
  ln(2, 'river', 1.6 * MULT_2, 18, [mv('floe', 3, 0), mv('floe', 3, 9)]),
  ln(3, 'river', -1.4 * MULT_2, 16, [mv('floe', 2, 0), mv('floe', 2, 5.5), mv('floe', 2, 11)]),
  ln(4, 'river', 2.4 * MULT_2, 18, [mv('floe', 2, 0), mv('floe', 2, 6), mv('floe', 2, 12)]),
  ln(5, 'river', -1.2 * MULT_2, 15, [
    mv('turtle', 2, 0),
    mv('turtle', 2, 5),
    mv('turtle', 2, 10, { dive: { up: 4, down: 2, phase: 0 } }),
  ]),
  ln(6, 'river', 1.5 * MULT_2, 16, [mv('log', 3, 0), mv('log', 3, 8)]),
  ln(8, 'rail', -7.0 * MULT_2, 40, [mv('train', 6, 0)]),
  ln(9, 'road', 1.6 * MULT_2, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  ln(10, 'road', -2.8 * MULT_2, 16, [mv('sports', 1, 0), mv('sports', 1, 8)]),
  ln(11, 'road', 1.3 * MULT_2, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -2.0 * MULT_2, 15, [mv('car', 1, 0), mv('van', 1.5, 5), mv('car', 1, 10.5)]),
];

// Level 15: "train period drops to 30; row 10 becomes motorbikes speed -3.8 period 14.6 @0, @7.5;
// row 5 all turtles dive (up 3 down 2, phases 0, 1, 2)."
const W5_L15: LaneSeed[] = [
  ln(2, 'river', 1.6 * MULT_3, 18, [mv('floe', 3, 0), mv('floe', 3, 9)]),
  ln(3, 'river', -1.4 * MULT_3, 16, [mv('floe', 2, 0), mv('floe', 2, 5.5), mv('floe', 2, 11)]),
  ln(4, 'river', 2.4 * MULT_3, 18, [mv('floe', 2, 0), mv('floe', 2, 6), mv('floe', 2, 12)]),
  ln(5, 'river', -1.2 * MULT_3, 15, [
    mv('turtle', 2, 0, { dive: { up: 3, down: 2, phase: 0 } }),
    mv('turtle', 2, 5, { dive: { up: 3, down: 2, phase: 1 } }),
    mv('turtle', 2, 10, { dive: { up: 3, down: 2, phase: 2 } }),
  ]),
  ln(6, 'river', 1.5 * MULT_3, 16, [mv('log', 3, 0), mv('log', 3, 8)]),
  ln(8, 'rail', -7.0 * MULT_3, 30, [mv('train', 6, 0)]),
  ln(9, 'road', 1.6 * MULT_3, 18, [mv('truck', 2, 0), mv('truck', 2, 9)]),
  // Row 10 motorbike lane: period raised 13 -> 14.6 (13 + widest 0.6 + 1), offset scaled and
  // rounded to 0.5 (fix-up 3b).
  ln(10, 'road', -3.8, 14.6, [mv('motorbike', MOTORBIKE_W, 0), mv('motorbike', MOTORBIKE_W, 7.5)]),
  ln(11, 'road', 1.3 * MULT_3, 20, [mv('bus', 2, 0), mv('bus', 2, 10)]),
  ln(12, 'road', -2.0 * MULT_3, 15, [mv('car', 1, 0), mv('van', 1.5, 5), mv('car', 1, 10.5)]),
];

// ============================================================================================
// Assembly
// ============================================================================================

/** Difficulty spine, docs/LEVELS.md "Difficulty spine" table: croc chance, fly chance, and the
 * attempt time limit for levels 1-15 (index n-1). Fly chance is a flat 0.35 throughout. */
const DIFFICULTY_SPINE: { croc: number; fly: number; time: number }[] = [
  { croc: 0.0, fly: 0.35, time: 30 },
  { croc: 0.15, fly: 0.35, time: 28 },
  { croc: 0.25, fly: 0.35, time: 26 },
  { croc: 0.3, fly: 0.35, time: 28 },
  { croc: 0.3, fly: 0.35, time: 26 },
  { croc: 0.3, fly: 0.35, time: 24 },
  { croc: 0.35, fly: 0.35, time: 26 },
  { croc: 0.35, fly: 0.35, time: 24 },
  { croc: 0.35, fly: 0.35, time: 22 },
  { croc: 0.45, fly: 0.35, time: 26 },
  { croc: 0.45, fly: 0.35, time: 24 },
  { croc: 0.45, fly: 0.35, time: 22 },
  { croc: 0.5, fly: 0.35, time: 24 },
  { croc: 0.5, fly: 0.35, time: 22 },
  { croc: 0.5, fly: 0.35, time: 20 },
];

const LEVEL_TABLE: Record<number, { lanes: LaneSeed[]; hazardTiles?: HazardSeed[] }> = {
  1: { lanes: withStatics(W1_L1) },
  2: { lanes: withStatics(W1_L2) },
  3: { lanes: withStatics(W1_L3) },
  4: { lanes: withStatics(W2_L4) },
  5: { lanes: withStatics(W2_L5) },
  6: { lanes: withStatics(W2_L6) },
  7: { lanes: withStatics(W3_L7), hazardTiles: HAZ_L7 },
  8: { lanes: withStatics(W3_L8), hazardTiles: HAZ_L8 },
  9: { lanes: withStatics(W3_L9), hazardTiles: HAZ_L9 },
  10: { lanes: withStatics(W4_L10) },
  11: { lanes: withStatics(W4_L11) },
  12: { lanes: withStatics(W4_L12) },
  13: { lanes: withStatics(W5_L13) },
  14: { lanes: withStatics(W5_L14) },
  15: { lanes: withStatics(W5_L15) },
};

/** Fresh `MoverDef`s each call (never shares mutable state - offset/floe - across `World`
 * instances built from the same level number). */
function toLaneDef(seed: LaneSeed): LaneDef {
  return {
    row: seed.row,
    kind: seed.kind,
    speed: seed.speed,
    period: seed.period,
    movers: seed.movers.map((m) => ({
      type: m.type,
      width: m.width,
      offset: m.offset,
      ...(m.dive ? { dive: { ...m.dive } } : {}),
      ...(m.speed !== undefined ? { speed: m.speed } : {}),
      ...(m.type === 'floe' ? { floe: createFloeState() } : {}),
    })),
  };
}

function worldForLevel(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.ceil(n / 3))) as 1 | 2 | 3 | 4 | 5;
}

function buildLevel(n: number): LevelDef {
  const entry = LEVEL_TABLE[n];
  if (!entry) throw new Error(`level.ts: no table for level ${n}`);
  const spine = DIFFICULTY_SPINE[n - 1];
  return {
    id: `level-${n}`,
    world: worldForLevel(n),
    index: ((n - 1) % 3) + 1,
    name: `Level ${n}`,
    timeLimit: spine.time,
    lanes: entry.lanes.map(toLaneDef),
    homes: { crocChance: spine.croc, flyChance: spine.fly },
    ...(entry.hazardTiles ? { hazardTiles: entry.hazardTiles.map((h) => ({ ...h })) } : {}),
  };
}

/**
 * Builds level `n` from the docs/LEVELS.md tables above. `n` 1-15 is the real campaign; past 15
 * (docs/specs/M6-worlds.md section 6: "After level 15 the campaign loops at level 13 difficulty
 * with the speed multiplier rising 0.05 per loop") it cycles world 5's three levels (13, 14, 15)
 * with every lane's speed (and every killer/platform's own `speed` override) scaled up 5% per
 * full 3-level loop.
 */
export function getLevel(n: number): LevelDef {
  const clamped = Math.max(1, Math.floor(n));
  if (clamped <= 15) return buildLevel(clamped);

  const lap = Math.ceil((clamped - 15) / 3);
  const posInWorld5 = 13 + ((clamped - 16) % 3);
  const base = buildLevel(posInWorld5);
  const mult = 1 + 0.05 * lap;

  return {
    ...base,
    id: `loop-${clamped}`,
    name: `Level ${clamped}`,
    lanes: base.lanes.map((lane) => ({
      ...lane,
      speed: lane.speed * mult,
      movers: lane.movers.map((m) => (m.speed !== undefined ? { ...m, speed: m.speed * mult } : m)),
    })),
  };
}
