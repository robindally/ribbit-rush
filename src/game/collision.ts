// Pure collision helpers: platform lookup and vehicle hit detection. See ARCHITECTURE.md
// section 6 (last paragraph). `t` is the world's elapsed simulation time in seconds, used only
// to resolve turtle dive state (mover x itself comes from the mover's own stored offset).

import { isPlatformNow, moverInstances, moverSpeed } from './lanes';
import type { LaneDef, MoverDef, MoverType } from './types';

export interface PlatformHit {
  mover: MoverDef;
  /** The speed a rider is carried at - the mover's own `speed` override, else the lane's. */
  speed: number;
}

/** The platform (if any) whose span covers `xCenter` in this river lane, else null. */
export function platformAt(lane: LaneDef, xCenter: number, t: number): PlatformHit | null {
  if (lane.kind !== 'river') return null;
  for (const mover of lane.movers) {
    if (!isPlatformNow(mover, t)) continue;
    for (const x of moverInstances(lane, mover)) {
      if (xCenter >= x && xCenter < x + mover.width) {
        return { mover, speed: moverSpeed(lane, mover) };
      }
    }
  }
  return null;
}

/** Whether any vehicle in this road lane overlaps the given `[left, right]` hitbox. Road-lane-only
 * (unchanged since M0-M2); `killerHits` below is the M6-general form used everywhere else. */
export function vehicleHits(lane: LaneDef, hitbox: readonly [number, number]): boolean {
  if (lane.kind !== 'road') return false;
  const [left, right] = hitbox;
  for (const mover of lane.movers) {
    for (const x of moverInstances(lane, mover)) {
      if (left < x + mover.width && right > x) return true;
    }
  }
  return false;
}

// --- Killer movers (M6: docs/specs/M6-worlds.md section 1, docs/LEVELS.md "new mover and lane
// rules") ---
//
// "Every vehicle type plus jetski, otter, snake. They kill on hitbox overlap in any lane kind,
// even while the frog is riding a platform" - unlike `vehicleHits` (road-lane-only, unchanged
// above), `killerHits`/`killerHitType` check a lane's movers by *type*, not by lane `kind`, so the
// same check covers road (cars, tram), rail (train), median (snake), and river (jetski/otter,
// which must kill a frog even while a log/turtle in the same lane would otherwise carry it).

export const KILLER_TYPES: readonly MoverType[] = [
  'car',
  'taxi',
  'sports',
  'pickup',
  'van',
  'truck',
  'bus',
  'motorbike',
  'tram',
  'train',
  'jetski',
  'otter',
  'snake',
];

export function isKillerType(type: MoverType): boolean {
  return KILLER_TYPES.includes(type);
}

/** The type of the first killer-type mover overlapping `hitbox` in this lane, regardless of lane
 * kind, or null if none. Returning the type (not just a boolean) lets a caller map it to a
 * `DeathCause` (e.g. 'snake' vs. a generic squish). */
export function killerHitType(lane: LaneDef, hitbox: readonly [number, number]): MoverType | null {
  const [left, right] = hitbox;
  for (const mover of lane.movers) {
    if (!isKillerType(mover.type)) continue;
    for (const x of moverInstances(lane, mover)) {
      if (left < x + mover.width && right > x) return mover.type;
    }
  }
  return null;
}

/** Whether any killer-type mover in this lane overlaps `hitbox`, regardless of lane kind. */
export function killerHits(lane: LaneDef, hitbox: readonly [number, number]): boolean {
  return killerHitType(lane, hitbox) !== null;
}
