// Seeded RNG (mulberry32) so levels and home hazard rolls are deterministic and replayable
// (Endless mode daily seeds land in a later milestone, but the primitive belongs here now).

export type RngFn = () => number;

export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: RngFn;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p (0..1). */
  chance(p: number): boolean;
  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const range = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));
  const chance = (p: number): boolean => next() < p;
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('Rng.pick: items must be non-empty');
    return item;
  };
  return { next, range, int, chance, pick };
}
