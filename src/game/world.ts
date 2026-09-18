// One running level: owns the frog, lanes, timer, and homes. Pure simulation - no rendering, no
// audio - so it is directly unit-testable. See ARCHITECTURE.md section 8.

import type { Rng } from '../core/rng';
import { createRng } from '../core/rng';
import { gameEvents } from '../core/events';
import {
  COLS,
  DEATH_S,
  HOME_COLS,
  HOME_HAZARD_MAX_S,
  HOME_HAZARD_MIN_S,
  HOME_ROW,
  HOP_S,
  NEAR_MISS_COMBO_WINDOW_S,
  NEAR_MISS_SCORE_PER_COMBO,
  NEAR_MISS_WATCH_S,
  START_LIVES,
} from './constants';
import { platformAt, vehicleHits } from './collision';
import { bufferHop, computeHopTarget, consumeHop, createFrog, createHopBuffer } from './frog';
import type { HopBuffer } from './frog';
import { makeClassicLevel } from './level';
import { stepLane } from './lanes';
import {
  advanceStreak,
  createStreakState,
  extraLivesEarned,
  flyScore,
  forwardHopScore,
  homeScore,
  levelClearScore,
} from './scoring';
import type { StreakHopKind, StreakState } from './scoring';
import type { DeathCause, Dir, Frog, HomeSlotState, LaneDef, LevelDef } from './types';

const TIMER_LOW_S = 5; // docs/specs/M4-juice.md section 8

/** Combo state for the near-miss chain: consecutive near-misses within `NEAR_MISS_COMBO_WINDOW_S`
 * of each other build the combo; a longer gap restarts it at 1. Pure and exported so the chaining
 * rule is directly unit-testable. See docs/specs/M4-juice.md section 5. */
export interface NearMissState {
  combo: number;
  at: number;
}

export function advanceNearMissCombo(prev: NearMissState | null, now: number): NearMissState {
  if (prev && now - prev.at <= NEAR_MISS_COMBO_WINDOW_S) {
    return { combo: prev.combo + 1, at: now };
  }
  return { combo: 1, at: now };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface HazardState {
  slot: number;
  timeLeft: number;
}

export class World {
  frog: Frog;
  level: LevelDef;
  lanes: LaneDef[];
  homes: HomeSlotState[];
  score = 0;
  lives = START_LIVES;
  levelNumber: number;
  timeLeft: number;
  elapsed = 0;
  gameOver = false;
  /** Total near-misses this run (run stats, ART_BIBLE.md section 9's game-over screen). */
  nearMissCount = 0;
  streak: StreakState = createStreakState();

  private rng: Rng;
  private hopBuffer: HopBuffer = createHopBuffer();
  private crocState: HazardState | null = null;
  private flyState: HazardState | null = null;
  private hazardRollAccumulator = { croc: 0, fly: 0 };
  private nearMissState: NearMissState | null = null;
  private nearMissWatch: { row: number; x: number; expiresAt: number } | null = null;
  private timerLowFired = false;
  private tickAccumulator = 0;

  constructor(level: LevelDef, levelNumber = 1, seed = 1) {
    this.level = level;
    this.lanes = level.lanes;
    this.levelNumber = levelNumber;
    this.rng = createRng(seed);
    this.frog = createFrog();
    this.homes = HOME_COLS.map(() => null);
    this.timeLeft = level.timeLimit;
  }

  laneAt(row: number): LaneDef | undefined {
    return this.lanes.find((l) => l.row === row);
  }

  queueHop(dir: Dir): void {
    if (this.gameOver) return;
    if (this.frog.state === 'idle') {
      this.tryHop(dir);
    } else if (this.frog.state === 'hopping') {
      bufferHop(this.hopBuffer, dir);
    }
    // dying/dead/home: input ignored
  }

  update(dt: number): void {
    if (this.gameOver) return;

    if (this.frog.state === 'dying') {
      this.frog.stateT += dt;
      if (this.frog.stateT >= DEATH_S) this.afterDeath();
      return;
    }

    this.elapsed += dt;
    for (const lane of this.lanes) stepLane(lane, dt);
    this.updateHomeHazards(dt);
    this.updateNearMissWatch();

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.die('timeout');
      return;
    }
    this.updateTimerLow(dt);

    if (this.frog.state === 'hopping') {
      this.frog.hopT = Math.min(1, this.frog.hopT + dt / HOP_S);
      this.frog.x = lerp(this.frog.fromX, this.frog.toX, this.frog.hopT);

      if (this.frog.hopT >= 1) {
        // Landing: run the full row resolution for the row just reached, before anything else
        // (including a buffered hop starting a new one) can move the frog again this tick.
        this.frog.state = 'idle';
        this.frog.stateT = 0; // seconds in current state - render-only use (landing squash decay)
        this.onLanded();
        return;
      }

      if (this.frog.hopT >= 0.5) {
        // Mid-hop: only a vehicle hit against the target row counts (row already committed at
        // hop start); no platform/drown check runs while airborne. See ARCHITECTURE.md
        // section 7, "Hop-time collision rule".
        const lane = this.laneAt(this.frog.row);
        if (lane) {
          const hitbox: [number, number] = [this.frog.x + 0.2, this.frog.x + 0.8];
          if (vehicleHits(lane, hitbox)) this.die('squish');
        }
      }
      return;
    }

    if (this.frog.state === 'idle') {
      this.resolveRowEffects(dt);
    }
  }

  // --- Hop lifecycle ---

  private tryHop(dir: Dir): void {
    const target = computeHopTarget(this.frog, dir);
    if (target.blocked) {
      gameEvents.emit({ type: 'bonk', x: this.frog.x, row: this.frog.row });
      return;
    }

    this.frog.fromX = this.frog.x;
    this.frog.fromRow = this.frog.row;
    this.frog.toX = target.toX;
    this.frog.toRow = target.toRow;
    this.frog.row = target.toRow; // commit immediately; x tweens continuously to toX
    this.frog.hopT = 0;
    this.frog.facing = dir;
    this.frog.state = 'hopping';
    this.frog.stateT = 0; // "seconds in current state" (ARCHITECTURE.md section 7) - render-only
    // use (squash/stretch timing), no gameplay logic reads this during 'hopping'.
    gameEvents.emit({ type: 'hop', dir, forward: dir === 'up' });
  }

  private onLanded(): void {
    const frog = this.frog;

    // Streak multiplier (docs/specs/M4-juice.md section 6): advanced from the just-completed
    // hop's facing (still the hop's own direction - the frog doesn't turn again until its next
    // hop starts), before this landing's own score is computed, so a hop that completes a chain
    // scores at its new, raised multiplier immediately.
    const kind: StreakHopKind =
      frog.facing === 'up' ? 'forward' : frog.facing === 'down' ? 'backward' : 'side';
    const prevMultiplier = this.streak.multiplier;
    this.streak = advanceStreak(this.streak, kind, this.elapsed);
    if (this.streak.multiplier > prevMultiplier) {
      gameEvents.emit({
        type: 'score',
        delta: 0,
        x: frog.x,
        row: frog.row,
        label: `x${this.streak.multiplier}`,
      });
    }

    if (frog.row < frog.maxRow) {
      frog.maxRow = frog.row;
      const delta = forwardHopScore(true) * this.streak.multiplier;
      this.addScore(delta, `+${delta}`);
    }

    // Near-miss watch (docs/specs/M4-juice.md section 5): arm only when the tile just vacated
    // was a road lane. The watch itself is checked every simulation step in `update()` while it
    // remains armed.
    const fromLane = this.laneAt(frog.fromRow);
    if (fromLane?.kind === 'road') {
      this.nearMissWatch = {
        row: frog.fromRow,
        x: frog.fromX,
        expiresAt: this.elapsed + NEAR_MISS_WATCH_S,
      };
    }

    const lane = this.laneAt(frog.row);
    gameEvents.emit({
      type: 'land',
      surface: lane?.kind === 'river' ? 'platform' : 'ground',
      x: frog.x,
      row: frog.row,
    });

    this.resolveLandingRow();
    if (this.gameOver || (this.frog.state as Frog['state']) === 'dying') return;

    const next = consumeHop(this.hopBuffer);
    if (next) this.tryHop(next);
  }

  /** Checks the tile watched by an armed near-miss window every step; see `onLanded`. */
  private updateNearMissWatch(): void {
    const watch = this.nearMissWatch;
    if (!watch) return;

    const lane = this.laneAt(watch.row);
    const hitbox: [number, number] = [watch.x + 0.2, watch.x + 0.8];
    if (lane && vehicleHits(lane, hitbox)) {
      this.nearMissWatch = null;
      this.triggerNearMiss();
      return;
    }
    if (this.elapsed >= watch.expiresAt) {
      this.nearMissWatch = null;
    }
  }

  private triggerNearMiss(): void {
    const combo = advanceNearMissCombo(this.nearMissState, this.elapsed);
    this.nearMissState = combo;
    this.nearMissCount += 1;
    gameEvents.emit({ type: 'nearMiss', combo: combo.combo });
    const delta = NEAR_MISS_SCORE_PER_COMBO * combo.combo * this.streak.multiplier;
    this.addScore(delta, `CLOSE CALL! +${delta}`);
  }

  private updateTimerLow(dt: number): void {
    if (!this.timerLowFired && this.timeLeft < TIMER_LOW_S) {
      this.timerLowFired = true;
      gameEvents.emit({ type: 'timerLow' });
      this.tickAccumulator = 0;
    }
    if (!this.timerLowFired) return;

    this.tickAccumulator += dt;
    while (this.tickAccumulator >= 1) {
      this.tickAccumulator -= 1;
      gameEvents.emit({ type: 'tick' });
    }
  }

  /**
   * Full row resolution for the row the frog just landed on (hopT reached 1): home row as
   * today, a road row runs the vehicle check, a river row drowns the frog unless a platform is
   * under its centre. See ARCHITECTURE.md section 7, "Hop-time collision rule".
   */
  private resolveLandingRow(): void {
    const frog = this.frog;
    if (frog.row === HOME_ROW) {
      this.resolveHomeLanding();
      return;
    }

    const lane = this.laneAt(frog.row);
    if (!lane) return;

    if (lane.kind === 'road') {
      const hitbox: [number, number] = [frog.x + 0.2, frog.x + 0.8];
      if (vehicleHits(lane, hitbox)) this.die('squish');
      return;
    }

    if (lane.kind === 'river') {
      const centre = frog.x + 0.5;
      if (!platformAt(lane, centre, this.elapsed)) this.die('drown');
    }
  }

  private resolveRowEffects(dt: number): void {
    const lane = this.laneAt(this.frog.row);
    if (!lane) return;

    if (lane.kind === 'road') {
      const hitbox: [number, number] = [this.frog.x + 0.2, this.frog.x + 0.8];
      if (vehicleHits(lane, hitbox)) this.die('squish');
      return;
    }

    if (lane.kind === 'river') {
      const centre = this.frog.x + 0.5;
      const hit = platformAt(lane, centre, this.elapsed);
      if (hit) {
        if (this.frog.state === 'idle') {
          this.frog.x += hit.speed * dt;
        }
        this.checkOffscreen();
      } else {
        this.die('drown');
      }
    }
  }

  private checkOffscreen(): void {
    const centre = this.frog.x + 0.5;
    if (centre < 0 || centre > COLS) this.die('offscreen');
  }

  // --- Homes ---

  private resolveHomeLanding(): void {
    const col = Math.round(this.frog.x);
    const slot = (HOME_COLS as readonly number[]).indexOf(col);
    if (slot < 0) {
      // Should be unreachable - hedge blocking prevents landing on a non-slot column.
      this.die('hedge');
      return;
    }

    const occupant = this.homes[slot];
    if (occupant === 'frog') {
      this.die('occupied');
      return;
    }
    if (occupant === 'croc') {
      this.die('croc');
      return;
    }

    if (occupant === 'fly') {
      this.clearHazard('fly', slot);
      const flyDelta = flyScore(); // fly bonus is not streak-multiplied (spec section 6)
      this.addScore(flyDelta, `+${flyDelta} FLY`);
    }

    this.homes[slot] = 'frog';
    const bonus = this.timeLeft;
    const homeDelta = homeScore(bonus) * this.streak.multiplier;
    this.addScore(homeDelta, `+${homeDelta}`);
    gameEvents.emit({ type: 'home', slot, timeLeft: this.timeLeft, bonus: occupant === 'fly' });

    if (this.homes.every((h) => h === 'frog')) {
      const clearDelta = levelClearScore(); // not streak-multiplied (spec section 6)
      this.addScore(clearDelta, `+${clearDelta}`);
      gameEvents.emit({ type: 'levelClear', level: this.levelNumber });
      this.loadNextLevel();
      return;
    }

    this.respawnFrogOnly();
  }

  private updateHomeHazards(dt: number): void {
    this.tickHazard('croc', dt, this.level.homes.crocChance);
    this.tickHazard('fly', dt, this.level.homes.flyChance);
  }

  private tickHazard(kind: 'croc' | 'fly', dt: number, chance: number): void {
    const active = kind === 'croc' ? this.crocState : this.flyState;
    if (active) {
      active.timeLeft -= dt;
      if (active.timeLeft <= 0) this.clearHazard(kind, active.slot);
      return;
    }

    this.hazardRollAccumulator[kind] += dt;
    while (this.hazardRollAccumulator[kind] >= 1) {
      this.hazardRollAccumulator[kind] -= 1;
      if (!this.rng.chance(chance)) continue;
      const emptySlots = this.homes.map((h, i) => (h === null ? i : -1)).filter((i) => i >= 0);
      if (emptySlots.length === 0) break;
      const slot = this.rng.pick(emptySlots);
      const timeLeft = this.rng.range(HOME_HAZARD_MIN_S, HOME_HAZARD_MAX_S);
      this.homes[slot] = kind;
      const state: HazardState = { slot, timeLeft };
      if (kind === 'croc') this.crocState = state;
      else this.flyState = state;
      break;
    }
  }

  private clearHazard(kind: 'croc' | 'fly', slot: number): void {
    if (this.homes[slot] === kind) this.homes[slot] = null;
    if (kind === 'croc') this.crocState = null;
    else this.flyState = null;
  }

  // --- Death / respawn / progression ---

  private die(cause: DeathCause): void {
    if (this.frog.state === 'dying' || this.frog.state === 'dead') return;
    this.frog.state = 'dying';
    this.frog.deathCause = cause;
    this.frog.stateT = 0;
    this.streak = createStreakState(); // death resets the streak (spec section 6)
    this.nearMissWatch = null;
    gameEvents.emit({ type: 'death', cause, x: this.frog.x, row: this.frog.row });
  }

  private afterDeath(): void {
    this.lives -= 1;
    if (this.lives <= 0) {
      this.gameOver = true;
      this.frog.state = 'dead';
      gameEvents.emit({ type: 'gameOver', score: this.score });
      return;
    }
    this.respawnFrogOnly();
  }

  private respawnFrogOnly(): void {
    this.frog = createFrog();
    this.timeLeft = this.level.timeLimit;
    this.hopBuffer = createHopBuffer();
    // Per-attempt home hazards clear; already-filled slots stay filled.
    this.crocState = null;
    this.flyState = null;
    this.hazardRollAccumulator = { croc: 0, fly: 0 };
    this.nearMissWatch = null;
    this.timerLowFired = false;
    this.tickAccumulator = 0;
    for (let i = 0; i < this.homes.length; i++) {
      const value = this.homes[i];
      if (value === 'croc' || value === 'fly') this.homes[i] = null;
    }
  }

  private loadNextLevel(): void {
    this.levelNumber += 1;
    this.level = makeClassicLevel(this.levelNumber);
    this.lanes = this.level.lanes;
    this.homes = HOME_COLS.map(() => null);
    this.respawnFrogOnly();
  }

  private addScore(delta: number, label?: string): void {
    if (delta === 0) return;
    const prev = this.score;
    this.score += delta;
    gameEvents.emit({ type: 'score', delta, x: this.frog.x, row: this.frog.row, label });
    const extra = extraLivesEarned(prev, this.score);
    for (let i = 0; i < extra; i++) {
      this.lives += 1;
      gameEvents.emit({ type: 'extraLife', x: this.frog.x, row: this.frog.row });
    }
  }
}

/** Builds a World for classic level `n`, generating the level from the fixed lane table. */
export function createClassicWorld(n: number, seed = 1): World {
  return new World(makeClassicLevel(n), n, seed);
}
