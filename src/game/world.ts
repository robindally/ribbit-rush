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
  START_LIVES,
} from './constants';
import { platformAt, vehicleHits } from './collision';
import { bufferHop, computeHopTarget, consumeHop, createFrog, createHopBuffer } from './frog';
import type { HopBuffer } from './frog';
import { makeClassicLevel } from './level';
import { stepLane } from './lanes';
import { extraLivesEarned, flyScore, forwardHopScore, homeScore, levelClearScore } from './scoring';
import type { DeathCause, Dir, Frog, HomeSlotState, LaneDef, LevelDef } from './types';

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

  private rng: Rng;
  private hopBuffer: HopBuffer = createHopBuffer();
  private crocState: HazardState | null = null;
  private flyState: HazardState | null = null;
  private hazardRollAccumulator = { croc: 0, fly: 0 };

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

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.die('timeout');
      return;
    }

    if (this.frog.state === 'hopping') {
      this.frog.hopT = Math.min(1, this.frog.hopT + dt / HOP_S);
      this.frog.x = lerp(this.frog.fromX, this.frog.toX, this.frog.hopT);
      if (this.frog.hopT >= 1) {
        this.frog.state = 'idle';
        this.onLanded();
        if (this.gameOver) return;
        const state = this.frog.state as Frog['state'];
        if (state === 'dying' || state === 'home') return;
      }
    }

    const state = this.frog.state as Frog['state'];
    if (state === 'idle' || state === 'hopping') {
      this.resolveRowEffects(dt);
    }
  }

  // --- Hop lifecycle ---

  private tryHop(dir: Dir): void {
    const target = computeHopTarget(this.frog, dir);
    if (target.blocked) {
      gameEvents.emit({ type: 'bonk' });
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
    gameEvents.emit({ type: 'hop', dir, forward: dir === 'up' });
  }

  private onLanded(): void {
    const frog = this.frog;

    if (frog.row < frog.maxRow) {
      frog.maxRow = frog.row;
      this.addScore(forwardHopScore(true));
    }

    if (frog.row === HOME_ROW) {
      this.resolveHomeLanding();
      if (this.gameOver || (this.frog.state as Frog['state']) === 'dying') return;
    }

    const next = consumeHop(this.hopBuffer);
    if (next) this.tryHop(next);
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
      this.die('squish'); // occupied slot: no dedicated DeathCause exists, closest is squish
      return;
    }
    if (occupant === 'croc') {
      this.die('croc');
      return;
    }

    if (occupant === 'fly') {
      this.clearHazard('fly', slot);
      this.addScore(flyScore());
    }

    this.homes[slot] = 'frog';
    const bonus = this.timeLeft;
    this.addScore(homeScore(bonus));
    gameEvents.emit({ type: 'home', slot, timeLeft: this.timeLeft, bonus: occupant === 'fly' });

    if (this.homes.every((h) => h === 'frog')) {
      this.addScore(levelClearScore());
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

  private addScore(delta: number): void {
    if (delta === 0) return;
    const prev = this.score;
    this.score += delta;
    gameEvents.emit({ type: 'score', delta, x: this.frog.x, row: this.frog.row });
    const extra = extraLivesEarned(prev, this.score);
    for (let i = 0; i < extra; i++) {
      this.lives += 1;
      gameEvents.emit({ type: 'extraLife' });
    }
  }
}

/** Builds a World for classic level `n`, generating the level from the fixed lane table. */
export function createClassicWorld(n: number, seed = 1): World {
  return new World(makeClassicLevel(n), n, seed);
}
