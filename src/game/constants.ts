// Grid, timing, and scoring constants. See docs/ARCHITECTURE.md section 3, 7, 10.

export const TILE = 48; // logical px per tile
export const COLS = 13;
export const ROWS = 15; // rows 0..14, top to bottom

// Row meanings (see ARCHITECTURE.md table)
export const HUD_TOP_ROW = 0;
export const HOME_ROW = 1;
export const RIVER_ROWS = [2, 3, 4, 5, 6] as const;
export const MEDIAN_ROW = 7;
export const ROAD_ROWS = [8, 9, 10, 11, 12] as const;
export const START_ROW = 13;
export const HUD_BOTTOM_ROW = 14;

export const HOME_COLS = [0, 3, 6, 9, 12] as const;

export const FROG_START = { col: 6, row: START_ROW };

// Frog timing
export const HOP_S = 0.11;
export const DEATH_S = 0.9;

// Turtle dive timings not specified per-level by the spec; the spec only says "dive on the
// group at <offset> from level 2". These durations are a reasonable, documented default -
// see docs/specs/M0-M2-report.md for the rationale.
export const TURTLE_DIVE_UP_S = 3;
export const TURTLE_DIVE_DOWN_S = 2;

// Scoring
export const FORWARD_HOP_SCORE = 10;
export const HOME_SCORE = 50;
export const HOME_TIME_BONUS_PER_S = 10;
export const LEVEL_CLEAR_SCORE = 1000;
export const FLY_SCORE = 200;
export const EXTRA_LIFE_SCORE = 20000;
export const START_LIVES = 3;

// Home hazard slot dwell time (croc / fly), seconds
export const HOME_HAZARD_MIN_S = 4;
export const HOME_HAZARD_MAX_S = 8;

// Canvas logical size
export const CANVAS_WIDTH = COLS * TILE; // 624
export const CANVAS_HEIGHT = ROWS * TILE; // 720
