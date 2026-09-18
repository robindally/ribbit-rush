// Pure collision helpers: platform lookup and vehicle hit detection. See ARCHITECTURE.md
// section 6 (last paragraph). `t` is the world's elapsed simulation time in seconds, used only
// to resolve turtle dive state (mover x itself comes from the mover's own stored offset).

import { isPlatformNow, moverInstances } from './lanes';
import type { LaneDef, MoverDef } from './types';

export interface PlatformHit {
  mover: MoverDef;
  /** The lane's signed speed, tiles/s - what a rider is carried at. */
  speed: number;
}

/** The platform (if any) whose span covers `xCenter` in this river lane, else null. */
export function platformAt(lane: LaneDef, xCenter: number, t: number): PlatformHit | null {
  if (lane.kind !== 'river') return null;
  for (const mover of lane.movers) {
    if (!isPlatformNow(mover, t)) continue;
    for (const x of moverInstances(lane, mover)) {
      if (xCenter >= x && xCenter < x + mover.width) {
        return { mover, speed: lane.speed };
      }
    }
  }
  return null;
}

/** Whether any vehicle in this road lane overlaps the given `[left, right]` hitbox. */
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
