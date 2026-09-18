// Power-up and lady-frog placement/selection logic. Pure and unit-tested; driven from
// `game/world.ts` (which owns the mutable per-attempt state and timing). Rendering of the badge,
// the shield bubble, the freeze vignette, the mega-hop chevron, and the lady frog live in
// `render/draw/powerups.ts`. See docs/specs/M7-powerups-scoring.md section 1-2 and
// docs/ARCHITECTURE.md sections 6 (lanes/movers) and 9 (events).

import type { Rng } from '../core/rng';
import { COLS } from './constants';
import { isPlatformNow, moverInstances, moverX } from './lanes';
import type { LaneDef, MoverDef, MoverType, PowerupKind } from './types';

export const POWERUP_KINDS: readonly PowerupKind[] = ['shield', 'freeze', 'clock', 'megahop'];

/** Spec section 1: "Weights: Shield 30, Freeze 25, Clock 25, Mega Hop 20." */
const POWERUP_WEIGHTS: Record<PowerupKind, number> = {
  shield: 30,
  freeze: 25,
  clock: 25,
  megahop: 20,
};

/** Weighted pick over `POWERUP_WEIGHTS` using the level's seeded RNG (spec section 1: "Use the
 * level's seeded RNG"). */
export function pickPowerupKind(rng: Rng): PowerupKind {
  const total = POWERUP_KINDS.reduce((sum, k) => sum + POWERUP_WEIGHTS[k], 0);
  let roll = rng.range(0, total);
  for (const kind of POWERUP_KINDS) {
    roll -= POWERUP_WEIGHTS[kind];
    if (roll < 0) return kind;
  }
  return POWERUP_KINDS[POWERUP_KINDS.length - 1]; // floating-point safety net, never hit in practice
}

/** Power-up badges ride log/turtle/floe platforms; a crocodile mover (unused in the real campaign,
 * but technically a `PLATFORM_TYPES` entry - see `game/lanes.ts`) is excluded as a spawn surface -
 * resting a bonus on the thing that eats you reads wrong. */
const POWERUP_PLATFORM_TYPES: readonly MoverType[] = ['log', 'turtle', 'floe'];

/** A `MoverDef` currently valid to place something on top of: `row` is its lane's row, `x` is its
 * current centre-ish tile position (see `offsetInMover`), and `mover`/`offsetInMover` together let
 * the caller keep tracking the same physical platform instance frame to frame (`ridingX` below). */
export interface PlatformCandidate {
  row: number;
  mover: MoverDef;
  x: number;
  offsetInMover: number;
}

/** Every currently-valid (surfaced, not mid-dive/sunk) platform of `types` across every `river`
 * lane in `lanes`, at simulation time `elapsed`. Pure aside from reading (never mutating) the
 * lanes. */
export function collectPlatformCandidates(
  lanes: readonly LaneDef[],
  elapsed: number,
  types: readonly MoverType[] = POWERUP_PLATFORM_TYPES,
): PlatformCandidate[] {
  const out: PlatformCandidate[] = [];
  for (const lane of lanes) {
    if (lane.kind !== 'river') continue;
    for (const mover of lane.movers) {
      if (!types.includes(mover.type)) continue;
      if (!isPlatformNow(mover, elapsed)) continue;
      const offsetInMover = mover.width / 2; // centred on the platform
      out.push({ row: lane.row, mover, x: moverX(lane, mover) + offsetInMover, offsetInMover });
    }
  }
  return out;
}

/** A rider glued to a specific platform instance (recomputed every frame from the mover's own,
 * possibly-wrapped, live offset - see `ridingX`), or `null` for something sitting on the static
 * median. */
export interface RideRef {
  mover: MoverDef;
  offsetInMover: number;
}

/** The rider's current x, tracking whatever `ride.mover` is doing right now (including wrap) -
 * the same technique `game/world.ts` already uses to carry the frog on a platform
 * (`frog.x += hit.speed * dt`), except here it's re-derived from the mover's live offset each
 * frame rather than integrated, so it also naturally freezes when Freeze Frame stops `stepLane`
 * from advancing that offset at all. */
export function ridingX(lane: LaneDef, ride: RideRef): number {
  return moverX(lane, ride.mover) + ride.offsetInMover;
}

export interface PowerupSpawnPoint {
  row: number;
  x: number;
  ride: RideRef | null;
}

/**
 * Chooses where a freshly-rolled power-up appears (spec section 1: "place it on a random platform
 * in rows 2 to 6 (it rides with the platform) or on the median at a random column"). Reads as a
 * binary choice between the two placement kinds, each rolled 50/50, falling back to the median
 * when no platform candidate exists (a defensive case - every real campaign level has river
 * platforms) - see docs/specs/M7-report.md "Deviations" for this reading; the spec doesn't give an
 * exact split. Never returns a point over bare water with no platform underneath it.
 */
export function choosePowerupSpawn(
  lanes: readonly LaneDef[],
  rng: Rng,
  elapsed: number,
): PowerupSpawnPoint {
  const candidates = collectPlatformCandidates(lanes, elapsed);
  const useMedian = candidates.length === 0 || rng.chance(0.5);
  if (!useMedian) {
    const c = rng.pick(candidates);
    return { row: c.row, x: c.x, ride: { mover: c.mover, offsetInMover: c.offsetInMover } };
  }
  const medianLane = lanes.find((l) => l.kind === 'median');
  const row = medianLane ? medianLane.row : 7;
  const col = rng.int(0, COLS - 1);
  return { row, x: col, ride: null };
}

/** Lady frog placement (spec section 2: "a pink frog sits on a random log in rows 2 to 6") - logs
 * only, no median fallback. `null` when no log currently exists (defensive; every river-bearing
 * level has at least one). */
export function chooseLadyFrogSpawn(
  lanes: readonly LaneDef[],
  rng: Rng,
  elapsed: number,
): PowerupSpawnPoint | null {
  const candidates = collectPlatformCandidates(lanes, elapsed, ['log']);
  if (candidates.length === 0) return null;
  const c = rng.pick(candidates);
  return { row: c.row, x: c.x, ride: { mover: c.mover, offsetInMover: c.offsetInMover } };
}

/** The nearest point currently "on" a platform in `lane` to `x` (clamped into whichever platform
 * instance span is closest), or `null` if the river lane has no currently-valid platform anywhere.
 * Used by Bubble Shield's rescue (spec section 1: "pushed back... to the nearest safe platform if
 * in water"). */
export function nearestSafePlatformX(lane: LaneDef, x: number, elapsed: number): number | null {
  if (lane.kind !== 'river') return null;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const mover of lane.movers) {
    if (!isPlatformNow(mover, elapsed)) continue;
    for (const mx of moverInstances(lane, mover)) {
      const centre = Math.max(mx, Math.min(x, mx + mover.width - 0.001));
      const dist = Math.abs(centre - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = centre;
      }
    }
  }
  return best;
}

// --- Freeze Frame timing (spec section 1: "All lanes stop for 3s, then resume over 0.5s. ...
// Timer keeps running.") ---

export const FREEZE_DURATION_S = 3;
export const FREEZE_RESUME_S = 0.5;

/** Lane `dt` multiplier at `tSinceStart` seconds into an active freeze: 0 while fully stopped,
 * ramping linearly 0 -> 1 over the resume window, then 1 (freeze over). `game/world.ts` multiplies
 * this into the `dt` it passes to `stepLane` - never into the frog's own hop timer or the level
 * countdown, both of which run at full speed throughout (the player can still act; only lane
 * movers freeze). */
export function freezeLaneTimeScale(tSinceStart: number): number {
  if (tSinceStart < FREEZE_DURATION_S) return 0;
  if (tSinceStart < FREEZE_DURATION_S + FREEZE_RESUME_S) {
    return (tSinceStart - FREEZE_DURATION_S) / FREEZE_RESUME_S;
  }
  return 1;
}

/** Whether a freeze started `tSinceStart` seconds ago is still in effect (stopped or resuming). */
export function isFreezeActive(tSinceStart: number): boolean {
  return tSinceStart < FREEZE_DURATION_S + FREEZE_RESUME_S;
}
