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
  LADY_FROG_MIN_LEVEL,
  LADY_FROG_SPAWN_CHANCE,
  NEAR_MISS_COMBO_WINDOW_S,
  NEAR_MISS_SCORE_PER_COMBO,
  NEAR_MISS_WATCH_S,
  POWERUP_COLLECT_RADIUS,
  POWERUP_DESPAWN_S,
  POWERUP_MIN_LEVEL,
  POWERUP_SPAWN_CHANCE,
  REWIND_CLOCK_BONUS_S,
  START_LIVES,
} from './constants';
import { killerHitType, platformAt, vehicleHits } from './collision';
import {
  endlessDifficultyForCrossing,
  endlessWorldForCrossing,
  makeEndlessCrossing,
} from './endless';
import {
  bufferHop,
  computeHopTarget,
  computeMegaHopTarget,
  consumeHop,
  createFrog,
  createHopBuffer,
} from './frog';
import type { HopBuffer } from './frog';
import { getLevel } from './level';
import { isTrainWarningActive, stepFloeState, stepLane } from './lanes';
import {
  chooseLadyFrogSpawn,
  choosePowerupSpawn,
  freezeLaneTimeScale,
  isFreezeActive,
  nearestSafePlatformX,
  pickPowerupKind,
  ridingX,
} from './powerups';
import type { RideRef } from './powerups';
import {
  advanceStreak,
  createStreakState,
  extraLivesEarned,
  flyScore,
  forwardHopScore,
  homeScore,
  ladyFrogScore,
  levelClearScore,
  powerupCollectScore,
} from './scoring';
import type { RunStats, StreakHopKind, StreakState } from './scoring';
import type {
  DeathCause,
  Dir,
  Frog,
  HomeSlotState,
  LaneDef,
  LevelDef,
  MoverType,
  PowerupKind,
} from './types';

/** Maps a killer mover's type to the death it inflicts. `snake` reuses the `DeathCause` value the
 * type already had (M3 report: "snake unreachable until M6 wires up the hazard" - this closes that
 * gap). Every other killer type (vehicles, jetski, otter) is a solid hit - squish, the same tween
 * `render/anim.ts` already plays for every undocumented `DeathCause` - see docs/specs/M6-report.md
 * "Deviations" for the jetski/otter judgment call. */
function deathCauseForKiller(type: MoverType): DeathCause {
  return type === 'snake' ? 'snake' : 'squish';
}

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

  // --- Endless mode (M9: docs/specs/M9-endless-skins.md section 1, docs/LEVELS.md "Endless") ---

  /** 'campaign' unless built via `createEndlessWorld`. `levelNumber` above doubles as the current
   * crossing number in endless mode (the HUD shows it as "CROSSING N" instead of a level name -
   * `render/draw/hud.ts`) - reusing the same field keeps every existing "which attempt is this"
   * bookkeeping (the static-layer cache key in `scenes/play.ts`, `RunStats.levelReached`) correct
   * for both modes with no duplicate counter. */
  mode: 'campaign' | 'endless' = 'campaign';
  /** Endless-only: the current crossing's difficulty `d` (docs/LEVELS.md "Endless": starts at 1.2,
   * +0.04 per crossing). Meaningless in campaign mode. */
  difficulty = 1.2;

  // --- Power-ups and lady frog (M7: docs/specs/M7-powerups-scoring.md sections 1-2) ---

  /** The one power-up currently on the field, or null. Public so render/ can read its
   * kind/row/x directly (see `render/draw/powerups.ts`) and the dev hook can force one. */
  powerup: { kind: PowerupKind; ageS: number; row: number; x: number; ride: RideRef | null } | null =
    null;
  /** The lady frog on the field (not yet picked up), or null. */
  ladyFrog: { row: number; x: number; ride: RideRef } | null = null;
  /** True once she's been picked up - rides the frog's back until home or a death. */
  carryingLadyFrog = false;
  /** Bubble Shield armed: the next `die()` call is cancelled instead of killing the frog. */
  shieldActive = false;
  /** Mega Hop armed: the next forward ('up') hop covers 2 tiles instead of 1. */
  megaHopActive = false;
  /** Seconds since Freeze Frame started, or null when inactive - see `advanceFreeze`. */
  freezeElapsed: number | null = null;

  private rng: Rng;
  /** Endless-only: a dedicated RNG stream for crossing generation (`loadNextCrossing`), kept
   * entirely separate from `rng` above (per-attempt home-hazard/power-up rolls) so the sequence of
   * generated crossings depends only on how many crossings have been *completed* - never on how
   * many attempts/deaths it took to get there - which is what makes the Daily seed option
   * reproducible (`tests/endless.test.ts`'s "daily seed determinism" case tests the pure generator
   * directly; this field is what keeps real gameplay matching that same guarantee). */
  private crossingRng: Rng;
  private hopBuffer: HopBuffer = createHopBuffer();
  private crocState: HazardState | null = null;
  private flyState: HazardState | null = null;
  private hazardRollAccumulator = { croc: 0, fly: 0 };
  private nearMissState: NearMissState | null = null;
  private nearMissWatch: { row: number; x: number; expiresAt: number } | null = null;
  private timerLowFired = false;
  private tickAccumulator = 0;

  // --- Run statistics (M7 section 3), never reset by `startAttempt`/`respawnFrogOnly` - these
  // aggregate across the whole run, not just the current attempt. See `getRunStats()`.
  private homesFilledTotal = 0;
  private deathsByCause: Partial<Record<DeathCause, number>> = {};
  private bestNearMissCombo = 0;
  private bestStreakMultiplier = 1;
  private powerupsCollected = 0;
  /** Rows currently inside their train's 1.5s crossing-warning window, so `trainWarning` fires
   * once per approach rather than every tick - reset the instant the warning window closes so the
   * next lap can warn again (M6: docs/LEVELS.md "new mover and lane rules"). */
  private trainWarned = new Set<number>();

  constructor(
    level: LevelDef,
    levelNumber = 1,
    seed = 1,
    mode: 'campaign' | 'endless' = 'campaign',
    crossingRng?: Rng,
  ) {
    this.mode = mode;
    this.level = level;
    this.lanes = level.lanes;
    this.levelNumber = levelNumber;
    this.rng = createRng(seed);
    this.crossingRng = crossingRng ?? createRng(seed + 1);
    this.frog = createFrog();
    this.homes = HOME_COLS.map(() => null);
    this.timeLeft = level.timeLimit;
    this.startAttempt();
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
    const laneTimeScale = this.advanceFreeze(dt);
    for (const lane of this.lanes) stepLane(lane, dt * laneTimeScale);
    this.updatePowerupField(dt);
    this.updateLadyFrogField();
    this.updateHomeHazards(dt);
    this.updateNearMissWatch();
    this.updateTrainWarnings();

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
        // Mid-hop: only a killer hit against the target row counts (row already committed at
        // hop start); no platform/drown check runs while airborne. See ARCHITECTURE.md
        // section 7, "Hop-time collision rule", extended by M6 to every lane kind (killer movers
        // - docs/LEVELS.md "new mover and lane rules").
        const lane = this.laneAt(this.frog.row);
        if (lane) {
          const hitbox: [number, number] = [this.frog.x + 0.2, this.frog.x + 0.8];
          const killer = killerHitType(lane, hitbox);
          if (killer) this.die(deathCauseForKiller(killer));
        }
      }
      return;
    }

    if (this.frog.state === 'idle') {
      this.resolveRowEffects(dt);
      this.checkPickups();
    }
  }

  // --- Power-ups and lady frog (M7) ---

  /** Advances an active Freeze Frame and returns this frame's lane `dt` multiplier (spec section
   * 1: "All lanes stop for 3s, then resume over 0.5s. Timer keeps running") - 1 when no freeze is
   * active. Only the value fed into `stepLane` uses this; the frog's own hop timer and the level
   * countdown always run at full speed, so the player can still act while lanes are frozen. */
  private advanceFreeze(dt: number): number {
    if (this.freezeElapsed === null) return 1;
    this.freezeElapsed += dt;
    const scale = freezeLaneTimeScale(this.freezeElapsed);
    if (!isFreezeActive(this.freezeElapsed)) this.freezeElapsed = null;
    return scale;
  }

  /** Re-glues a platform-riding power-up to its platform's live (possibly frozen) position, and
   * ages its 12s despawn timer using real time (unaffected by Freeze Frame - a "field timer", not
   * lane motion). */
  private updatePowerupField(dt: number): void {
    const p = this.powerup;
    if (!p) return;
    if (p.ride) {
      const lane = this.laneAt(p.row);
      if (lane) p.x = ridingX(lane, p.ride);
    }
    p.ageS += dt;
    if (p.ageS >= POWERUP_DESPAWN_S) this.powerup = null;
  }

  private updateLadyFrogField(): void {
    const l = this.ladyFrog;
    if (!l) return;
    const lane = this.laneAt(l.row);
    if (lane) l.x = ridingX(lane, l.ride);
  }

  /** Collection/pickup by proximity (spec: "collect by landing on its tile, centre within 0.5
   * tile") - checked every idle step (not only the instant of landing) so a power-up/lady-frog
   * riding the very platform the frog is already standing on still gets picked up once it drifts
   * close enough. */
  private checkPickups(): void {
    const frog = this.frog;
    if (frog.state !== 'idle') return;

    const p = this.powerup;
    if (p && frog.row === p.row && Math.abs(frog.x - p.x) <= POWERUP_COLLECT_RADIUS) {
      this.collectPowerup(p.kind);
    }

    const l = this.ladyFrog;
    if (l && frog.row === l.row && Math.abs(frog.x - l.x) <= POWERUP_COLLECT_RADIUS) {
      this.pickUpLadyFrog();
    }
  }

  private collectPowerup(kind: PowerupKind): void {
    this.powerup = null;
    this.powerupsCollected += 1;
    const delta = powerupCollectScore();
    this.addScore(delta, `+${delta}`);
    gameEvents.emit({ type: 'powerup', kind });
    this.applyPowerupEffect(kind);
  }

  private applyPowerupEffect(kind: PowerupKind): void {
    switch (kind) {
      case 'shield':
        this.shieldActive = true;
        break;
      case 'freeze':
        this.freezeElapsed = 0;
        break;
      case 'clock':
        this.timeLeft = Math.min(this.level.timeLimit, this.timeLeft + REWIND_CLOCK_BONUS_S);
        // Big "+10s" popup (spec section 1) - a delta:0 score event, the same trick `onLanded`
        // already uses for the streak-multiplier badge popup, so `fx/popups.ts` needs no changes.
        gameEvents.emit({
          type: 'score',
          delta: 0,
          x: this.frog.x,
          row: this.frog.row,
          label: '+10s',
        });
        break;
      case 'megahop':
        this.megaHopActive = true;
        break;
    }
  }

  private pickUpLadyFrog(): void {
    this.ladyFrog = null;
    this.carryingLadyFrog = true;
    gameEvents.emit({ type: 'ladyFrogPickup', x: this.frog.x, row: this.frog.row });
  }

  /** Rolls this attempt's power-up/lady-frog spawns (spec: "at the start of each attempt roll
   * 25%"/"20% per attempt") and clears every per-attempt power-up state - called once per fresh
   * attempt (constructor, and the end of `respawnFrogOnly`/thus `loadLevel`). Never touches the
   * run-level stats fields (`homesFilledTotal` etc.), which aggregate across the whole run. */
  private startAttempt(): void {
    this.powerup = null;
    this.ladyFrog = null;
    this.carryingLadyFrog = false;
    this.shieldActive = false;
    this.megaHopActive = false;
    this.freezeElapsed = null;

    if (this.levelNumber >= POWERUP_MIN_LEVEL && this.rng.chance(POWERUP_SPAWN_CHANCE)) {
      this.spawnPowerup();
    }
    if (this.levelNumber >= LADY_FROG_MIN_LEVEL && this.rng.chance(LADY_FROG_SPAWN_CHANCE)) {
      this.spawnLadyFrog();
    }
  }

  private spawnPowerup(): void {
    const kind = pickPowerupKind(this.rng);
    const spawn = choosePowerupSpawn(this.lanes, this.rng, this.elapsed);
    this.powerup = { kind, ageS: 0, row: spawn.row, x: spawn.x, ride: spawn.ride };
  }

  private spawnLadyFrog(): void {
    const spawn = chooseLadyFrogSpawn(this.lanes, this.rng, this.elapsed);
    if (spawn && spawn.ride) this.ladyFrog = { row: spawn.row, x: spawn.x, ride: spawn.ride };
  }

  /** Dev-only (docs/specs/M7-powerups-scoring.md: "add window.__rr.powerups with a spawn(kind)
   * helper so the reviewer can force each kind" - see `src/scenes/play.ts`'s dev hook). Places a
   * power-up on the field immediately, bypassing the level gate and the 25% roll. */
  forceSpawnPowerup(kind: PowerupKind): void {
    const spawn = choosePowerupSpawn(this.lanes, this.rng, this.elapsed);
    this.powerup = { kind, ageS: 0, row: spawn.row, x: spawn.x, ride: spawn.ride };
  }

  /** Dev-only: applies a power-up's effect immediately, as if just collected (no score/field
   * change) - lets the reviewer see Freeze/Shield/Mega Hop's effect without having to walk over
   * a spawned badge first. */
  forceActivatePowerup(kind: PowerupKind): void {
    this.applyPowerupEffect(kind);
  }

  /** Dev-only: places the lady frog on a random log immediately. */
  forceSpawnLadyFrog(): void {
    this.spawnLadyFrog();
  }

  /** Dev-only: skips straight to "carrying" the lady frog, bypassing pickup. */
  forceCarryLadyFrog(): void {
    this.ladyFrog = null;
    this.carryingLadyFrog = true;
  }

  // --- Hop lifecycle ---

  private tryHop(dir: Dir): void {
    const usingMegaHop = this.megaHopActive && dir === 'up';
    const target = usingMegaHop ? computeMegaHopTarget(this.frog) : computeHopTarget(this.frog, dir);
    if (target.blocked) {
      gameEvents.emit({ type: 'bonk', x: this.frog.x, row: this.frog.row });
      return; // Mega Hop stays armed on a blocked attempt - not consumed until it actually lands.
    }
    if (usingMegaHop) this.megaHopActive = false;

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
    this.bestStreakMultiplier = Math.max(this.bestStreakMultiplier, this.streak.multiplier);
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
    this.bestNearMissCombo = Math.max(this.bestNearMissCombo, combo.combo);
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
   * today, everything else runs `resolveRowHazard` (any lane kind: road/rail vehicle-style
   * kills, median snakes, river killers-and-no-platform-drowning), then an oil slide if the
   * landing tile has one. See ARCHITECTURE.md section 7, "Hop-time collision rule", and M6's
   * docs/LEVELS.md "new mover and lane rules".
   */
  private resolveLandingRow(): void {
    const frog = this.frog;
    if (frog.row === HOME_ROW) {
      this.resolveHomeLanding();
      return;
    }
    if (this.resolveRowHazard(frog.row, frog.x)) return;
    this.applyOilSlide();
  }

  /**
   * Whether standing at `(row, x)` right now is fatal: a killer-type mover overlapping the
   * hitbox (docs/LEVELS.md: "in any lane kind, even while riding a platform"), or - river lanes
   * only, and only once no killer already got there first - no platform under the centre. Calls
   * `die()` and returns true on a hit; pure aside from that. Shared by the landing resolution
   * above and the continuous idle check below, and by the post-oil-slide tile.
   */
  private resolveRowHazard(row: number, x: number): boolean {
    const lane = this.laneAt(row);
    if (!lane) return false;

    const hitbox: [number, number] = [x + 0.2, x + 0.8];
    const killer = killerHitType(lane, hitbox);
    if (killer) {
      this.die(deathCauseForKiller(killer));
      return true;
    }

    if (lane.kind === 'river') {
      const centre = x + 0.5;
      if (!platformAt(lane, centre, this.elapsed)) {
        this.die('drown');
        return true;
      }
    }
    return false;
  }

  /** M6 oil slide (docs/LEVELS.md "new mover and lane rules"): landing on an oil-decorated tile
   * slides the frog one further tile in the same direction as the hop that just landed there,
   * blocked at the grid edge or a hedge column (reuses `computeHopTarget`'s own bounds/hedge
   * logic). The new tile is then hazard-checked too - "the slide can land the frog under a
   * vehicle; that is the point." Not chained: only ever one slide per landing. */
  private applyOilSlide(): void {
    const frog = this.frog;
    const col = Math.round(frog.x);
    const hazard = this.level.hazardTiles?.find(
      (h) => h.type === 'oil' && h.row === frog.row && h.col === col,
    );
    if (!hazard) return;

    const target = computeHopTarget({ x: frog.x, row: frog.row }, frog.facing);
    if (target.blocked) return; // blocked at the grid edge or into a hedge: no slide

    const fromX = frog.x;
    const fromRow = frog.row;
    frog.x = target.toX;
    frog.row = target.toRow;
    gameEvents.emit({ type: 'oilSlide', x: frog.x, row: frog.row, fromX, fromRow });

    if (frog.row === HOME_ROW) {
      this.resolveHomeLanding();
      return;
    }
    this.resolveRowHazard(frog.row, frog.x);
  }

  private resolveRowEffects(dt: number): void {
    const lane = this.laneAt(this.frog.row);
    if (!lane) return;

    if (this.resolveRowHazard(this.frog.row, this.frog.x)) return;

    if (lane.kind === 'river') {
      const centre = this.frog.x + 0.5;
      const hit = platformAt(lane, centre, this.elapsed);
      if (hit) {
        if (this.frog.state === 'idle') {
          this.frog.x += hit.speed * dt;
        }
        if (hit.mover.type === 'floe' && hit.mover.floe) {
          hit.mover.floe = stepFloeState(hit.mover.floe, dt, true);
          if (hit.mover.floe.state === 'sunk') {
            this.die('drown');
            return;
          }
        }
        this.checkOffscreen();
      }
      // else: resolveRowHazard already drowned the frog above (no platform under the centre).
    }
  }

  /** Fires `trainWarning` once, 1.5s before a rail lane's train leading edge enters the screen,
   * and re-arms once the warning window closes so the next approach can warn again (M6:
   * docs/LEVELS.md "new mover and lane rules"). */
  private updateTrainWarnings(): void {
    for (const lane of this.lanes) {
      if (lane.kind !== 'rail') continue;
      for (const mover of lane.movers) {
        if (mover.type !== 'train') continue;
        const active = isTrainWarningActive(lane, mover, COLS);
        if (active && !this.trainWarned.has(lane.row)) {
          this.trainWarned.add(lane.row);
          gameEvents.emit({ type: 'trainWarning', row: lane.row });
        } else if (!active) {
          this.trainWarned.delete(lane.row);
        }
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
    this.homesFilledTotal += 1;

    if (this.carryingLadyFrog) {
      this.carryingLadyFrog = false;
      const ladyDelta = ladyFrogScore();
      this.addScore(ladyDelta, `+${ladyDelta} LADY FROG`);
    }

    const bonus = this.timeLeft;
    const homeDelta = homeScore(bonus) * this.streak.multiplier;
    this.addScore(homeDelta, `+${homeDelta}`);
    gameEvents.emit({ type: 'home', slot, timeLeft: this.timeLeft, bonus: occupant === 'fly' });

    if (this.mode === 'endless') {
      // M9: "one crossing = one frog reaching any home slot; homes never fill in Endless" - unlike
      // campaign, a single landing always ends the crossing immediately, at a bonus scaled by the
      // *current* streak multiplier (docs/LEVELS.md "Endless": "Score: standard scoring plus 100
      // per crossing times the current streak multiplier").
      const crossingDelta = 100 * this.streak.multiplier;
      this.addScore(crossingDelta, `+${crossingDelta} CROSSING`);
      this.loadNextCrossing();
      return;
    }

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
    if (this.shieldActive) {
      this.consumeShield();
      return;
    }
    this.deathsByCause[cause] = (this.deathsByCause[cause] ?? 0) + 1;
    this.frog.state = 'dying';
    this.frog.deathCause = cause;
    this.frog.stateT = 0;
    this.streak = createStreakState(); // death resets the streak (spec section 6)
    this.nearMissWatch = null;
    this.carryingLadyFrog = false; // dropped on death (M7 spec section 2)
    gameEvents.emit({ type: 'death', cause, x: this.frog.x, row: this.frog.row });
  }

  /** Bubble Shield rescue (M7 spec section 1): cancels the death that would otherwise have
   * happened, pushing the frog back to the tile it hopped from - or, if the current row is a
   * river (a drown/offscreen death), the nearest currently-safe platform in that same lane. Fully
   * resets the frog back to a settled 'idle' state so no further hop/landing logic re-runs this
   * tick. */
  private consumeShield(): void {
    this.shieldActive = false;
    const frog = this.frog;
    const lane = this.laneAt(frog.row);

    let targetX = frog.fromX;
    let targetRow = frog.fromRow;
    if (lane && lane.kind === 'river') {
      const nearest = nearestSafePlatformX(lane, frog.x, this.elapsed);
      if (nearest !== null) {
        targetX = nearest;
        targetRow = frog.row;
      }
    }

    frog.x = targetX;
    frog.row = targetRow;
    frog.fromX = targetX;
    frog.fromRow = targetRow;
    frog.toX = targetX;
    frog.toRow = targetRow;
    frog.hopT = 1;
    frog.state = 'idle';
    frog.stateT = 0;
    gameEvents.emit({ type: 'shieldBroken', x: targetX, row: targetRow });
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
    this.startAttempt(); // M7: fresh per-attempt power-up/lady-frog roll
  }

  private loadNextLevel(): void {
    this.loadLevel(this.levelNumber + 1);
  }

  /** Endless-only (M9): generates the next crossing at the next difficulty step/world theme and
   * resets the frog to the start - mirrors `loadLevel` above almost exactly, just sourced from
   * `game/endless.ts`'s generator instead of `game/level.ts`'s campaign tables. */
  private loadNextCrossing(): void {
    this.levelNumber += 1;
    this.difficulty = endlessDifficultyForCrossing(this.levelNumber);
    const worldId = endlessWorldForCrossing(this.levelNumber);
    this.level = makeEndlessCrossing(this.difficulty, this.crossingRng, worldId);
    this.lanes = this.level.lanes;
    this.homes = HOME_COLS.map(() => null);
    this.trainWarned.clear();
    this.respawnFrogOnly();
  }

  private loadLevel(n: number): void {
    this.levelNumber = n;
    this.level = getLevel(n);
    this.lanes = this.level.lanes;
    this.homes = HOME_COLS.map(() => null);
    this.trainWarned.clear();
    this.respawnFrogOnly();
  }

  /** Dev-only level jump (docs/specs/M6-worlds.md section 6: "pressing L then a digit or two
   * jumps to that level when import.meta.env.DEV"; also used by the reviewer's
   * `scripts/review.mjs --level N` via `window.__rr.jumpToLevel`). Public on purpose - callable
   * from outside the class, unlike the private level-progression methods above. */
  jumpToLevel(n: number): void {
    this.loadLevel(n);
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

  /** A snapshot of this run's statistics (M7 spec section 3), shown on the Game Over card. */
  getRunStats(): RunStats {
    return {
      score: this.score,
      levelReached: this.levelNumber,
      world: this.level.world,
      homesFilled: this.homesFilledTotal,
      deathsByCause: { ...this.deathsByCause },
      nearMisses: this.nearMissCount,
      bestCombo: this.bestNearMissCombo,
      bestMultiplier: this.bestStreakMultiplier,
      powerupsCollected: this.powerupsCollected,
      timePlayedS: this.elapsed,
    };
  }
}

/** Builds a World starting at campaign level `n`, generating it from `game/level.ts`'s tables. */
export function createCampaignWorld(n: number, seed = 1): World {
  return new World(getLevel(n), n, seed);
}

/** Builds a World starting Endless mode at crossing 1, difficulty `startDifficulty` (docs/LEVELS.md
 * "Endless": "Difficulty d starts at 1.2"). `seed` drives both the per-attempt RNG (home hazards -
 * unused today, since Endless crossings are generated with `crocChance`/`flyChance` both 0 - and
 * power-up/lady-frog rolls) and, independently, every crossing this run ever generates (`seed + 1`,
 * `World`'s own `crossingRng`) - passing the same `seed` twice (e.g. the UTC date seed for a Daily
 * run) reproduces an identical run end to end. */
export function createEndlessWorld(startDifficulty = 1.2, seed = Date.now()): World {
  const crossingRng = createRng(seed + 1);
  const worldId = endlessWorldForCrossing(1);
  const level = makeEndlessCrossing(startDifficulty, crossingRng, worldId);
  const world = new World(level, 1, seed, 'endless', crossingRng);
  world.difficulty = startDifficulty;
  return world;
}
