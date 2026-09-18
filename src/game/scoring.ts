// Score, lives, and multiplier helpers. Pure and unit-tested. See ARCHITECTURE.md and
// docs/specs/M0-M2-classic-core.md "Scoring".

import {
  EXTRA_LIFE_SCORE,
  FLY_SCORE,
  FORWARD_HOP_SCORE,
  HOME_SCORE,
  HOME_TIME_BONUS_PER_S,
  LADY_FROG_SCORE,
  LEVEL_CLEAR_SCORE,
  POWERUP_COLLECT_SCORE,
  START_LIVES,
  STREAK_GAP_S,
  STREAK_HOPS_PER_TIER,
  STREAK_IDLE_RESET_S,
  STREAK_MULTIPLIER_CAP,
} from './constants';
import type { DeathCause } from './types';

export { START_LIVES };

/** 10 per hop that reaches a new furthest row (maxRow), 0 otherwise. */
export function forwardHopScore(isNewMaxRow: boolean): number {
  return isNewMaxRow ? FORWARD_HOP_SCORE : 0;
}

/** 50 per home plus 10 per second remaining on the attempt timer. */
export function homeScore(timeLeftS: number): number {
  return HOME_SCORE + Math.max(0, Math.floor(timeLeftS)) * HOME_TIME_BONUS_PER_S;
}

/** 1,000 for clearing all five homes. */
export function levelClearScore(): number {
  return LEVEL_CLEAR_SCORE;
}

/** +200 for landing on a fly-occupied home slot. */
export function flyScore(): number {
  return FLY_SCORE;
}

/** +500 for reaching home while carrying the lady frog (M7: docs/specs/M7-powerups-scoring.md
 * section 2). */
export function ladyFrogScore(): number {
  return LADY_FROG_SCORE;
}

/** +100 for collecting any power-up badge (M7 section 5's scoring table). */
export function powerupCollectScore(): number {
  return POWERUP_COLLECT_SCORE;
}

/** How many extra lives were crossed going from `prevScore` to `nextScore` (every 20,000 pts). */
export function extraLivesEarned(prevScore: number, nextScore: number): number {
  return Math.floor(nextScore / EXTRA_LIFE_SCORE) - Math.floor(prevScore / EXTRA_LIFE_SCORE);
}

export function isGameOver(lives: number): boolean {
  return lives <= 0;
}

// --- Streak multiplier (docs/specs/M4-juice.md section 6) ---
//
// Pure state machine, advanced once per hop *landing* by `game/world.ts` (which knows the
// simulation clock and the hop's direction). Kept here, not in world.ts, per the spec's own file
// assignment, and so the timing rules (350ms chain gap, 600ms idle reset, the side-hop grace
// window) are directly unit-testable without spinning up a World/level.

export type StreakHopKind = 'forward' | 'backward' | 'side';

export interface StreakState {
  streak: number;
  multiplier: number;
  /** Simulation-clock time of the last hop landing of any kind (forward or side); drives the
   * 600ms idle-gap reset. Null before the first hop of an attempt. */
  lastLandAt: number | null;
  /** Simulation-clock time of the most recent side-hop landing not yet resolved by a following
   * forward hop, or null if there is none pending. */
  pendingSideAt: number | null;
}

export function createStreakState(): StreakState {
  return { streak: 0, multiplier: 1, lastLandAt: null, pendingSideAt: null };
}

/** `multiplier = min(4, 1 + floor(streak / 3))` (spec section 6). */
export function streakMultiplier(streak: number): number {
  return Math.min(STREAK_MULTIPLIER_CAP, 1 + Math.floor(streak / STREAK_HOPS_PER_TIER));
}

/**
 * Advances streak state for a hop landing of `kind` at simulation time `now` (seconds). Pure -
 * returns a new state rather than mutating `prev`.
 *
 * Rules (docs/specs/M4-juice.md section 6):
 * - A backward hop always resets to zero.
 * - A side hop doesn't break the streak by itself; it opens a `STREAK_GAP_S` grace window that
 *   must be closed by a forward hop landing, checked the moment that next hop lands.
 * - A forward hop continues the streak (streak + 1) when it either lands within `STREAK_GAP_S` of
 *   the previous forward hop, or rescues a still-open side-hop grace window within that same gap;
 *   otherwise it resets and starts a fresh streak of 1.
 * - Any hop (of any kind) that lands more than `STREAK_IDLE_RESET_S` after the previous landing
 *   resets first, regardless of kind.
 */
export function advanceStreak(prev: StreakState, kind: StreakHopKind, now: number): StreakState {
  const idleGap = prev.lastLandAt !== null && now - prev.lastLandAt > STREAK_IDLE_RESET_S;

  if (kind === 'backward') {
    return { streak: 0, multiplier: 1, lastLandAt: now, pendingSideAt: null };
  }

  if (kind === 'side') {
    if (idleGap) {
      return { streak: 0, multiplier: 1, lastLandAt: now, pendingSideAt: now };
    }
    return { ...prev, lastLandAt: now, pendingSideAt: now };
  }

  // kind === 'forward'
  if (idleGap) {
    const streak = 1;
    return { streak, multiplier: streakMultiplier(streak), lastLandAt: now, pendingSideAt: null };
  }

  const rescuedSide = prev.pendingSideAt !== null && now - prev.pendingSideAt <= STREAK_GAP_S;
  const continuedChain =
    !rescuedSide &&
    prev.pendingSideAt === null &&
    prev.lastLandAt !== null &&
    now - prev.lastLandAt <= STREAK_GAP_S &&
    prev.streak > 0;

  const streak = rescuedSide || continuedChain ? prev.streak + 1 : 1;
  return { streak, multiplier: streakMultiplier(streak), lastLandAt: now, pendingSideAt: null };
}

// --- Run statistics (M7: docs/specs/M7-powerups-scoring.md section 3) ---
//
// `World` owns one `RunStats`-shaped snapshot (assembled by `getRunStats()`) for the whole run
// (every attempt/life, not reset on respawn - only score/level/near-misses/time are meaningful
// across a full run). Shown on the Game Over card (M8 restyles it).

export interface RunStats {
  score: number;
  /** Highest campaign level number reached this run. */
  levelReached: number;
  /** The world (1-5) that level belongs to (post-15 loop levels all report world 5). */
  world: 1 | 2 | 3 | 4 | 5;
  /** Total home slots filled (not just the current level's). */
  homesFilled: number;
  /** Death count by cause; a cancelled (shield-blocked) death is never counted. */
  deathsByCause: Partial<Record<DeathCause, number>>;
  /** Total near-miss triggers (M4). */
  nearMisses: number;
  /** Peak near-miss combo reached this run. */
  bestCombo: number;
  /** Peak hop-streak multiplier reached this run (1-4, M4). */
  bestMultiplier: number;
  powerupsCollected: number;
  timePlayedS: number;
}

export function createRunStats(): RunStats {
  return {
    score: 0,
    levelReached: 1,
    world: 1,
    homesFilled: 0,
    deathsByCause: {},
    nearMisses: 0,
    bestCombo: 0,
    bestMultiplier: 1,
    powerupsCollected: 0,
    timePlayedS: 0,
  };
}
