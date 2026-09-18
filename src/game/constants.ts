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

// Power-ups (M7: docs/specs/M7-powerups-scoring.md section 1)
export const POWERUP_MIN_LEVEL = 2; // no power-ups before this level
export const POWERUP_SPAWN_CHANCE = 0.25; // rolled once at the start of each attempt
export const POWERUP_DESPAWN_S = 12;
export const POWERUP_COLLECT_RADIUS = 0.5; // tiles, centre-to-centre
export const POWERUP_COLLECT_SCORE = 100;
export const FREEZE_DURATION_S = 3; // lanes fully stopped
export const FREEZE_RESUME_S = 0.5; // then ramp back up to full speed
export const REWIND_CLOCK_BONUS_S = 10;
export const MEGA_HOP_ARC_TILES = 0.7; // vs. the normal 0.4 tile hop arc

// Lady frog (M7: docs/specs/M7-powerups-scoring.md section 2)
export const LADY_FROG_MIN_LEVEL = 3;
export const LADY_FROG_SPAWN_CHANCE = 0.2; // rolled once at the start of each attempt
export const LADY_FROG_SCORE = 500;

// Near-miss (docs/specs/M4-juice.md section 5)
export const NEAR_MISS_WATCH_S = 0.15; // how long the vacated tile is watched after a hop lands
export const NEAR_MISS_COMBO_WINDOW_S = 2; // consecutive near-misses within this chain the combo
export const NEAR_MISS_SCORE_PER_COMBO = 50; // delta = this * combo * streak multiplier

// Streak multiplier (docs/specs/M4-juice.md section 6)
export const STREAK_GAP_S = 0.35; // forward hops must land less than this apart to chain
export const STREAK_IDLE_RESET_S = 0.6; // any idle gap over this resets the streak
export const STREAK_HOPS_PER_TIER = 3; // every N consecutive forward hops raises the multiplier
export const STREAK_MULTIPLIER_CAP = 4;

// Canvas logical size
export const CANVAS_WIDTH = COLS * TILE; // 624
export const CANVAS_HEIGHT = ROWS * TILE; // 720

// M8: Endless mode (wiring is M9) unlocks once the player has ever reached this campaign level
// (docs/specs/M8-ui-input.md section 1: "locked until level 15 has been reached"). Matches
// game/level.ts's own 15-level campaign (past this, getLevel loops world 5).
export const ENDLESS_UNLOCK_LEVEL = 15;
