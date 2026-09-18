import { describe, expect, it } from 'vitest';
import { laneMaxWidth, moverInstances, moverX, stepLane, wrapValue } from '../src/game/lanes';
import { platformAt, vehicleHits } from '../src/game/collision';
import type { LaneDef } from '../src/game/types';

describe('wrapValue', () => {
  it('wraps positive values into [0, period)', () => {
    expect(wrapValue(5, 10)).toBe(5);
    expect(wrapValue(12, 10)).toBe(2);
    expect(wrapValue(20, 10)).toBe(0);
  });

  it('wraps negative values into [0, period)', () => {
    expect(wrapValue(-1, 10)).toBe(9);
    expect(wrapValue(-11, 10)).toBe(9);
  });
});

describe('stepLane / moverX', () => {
  it('advances mover offsets by speed * dt and wraps at the period', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 2,
      period: 10,
      movers: [{ type: 'car', width: 1, offset: 0 }],
    };
    stepLane(lane, 3); // offset 0 -> 6
    expect(lane.movers[0]?.offset).toBe(6);
    stepLane(lane, 3); // offset 6 -> 12 -> wraps to 2
    expect(lane.movers[0]?.offset).toBeCloseTo(2);
  });

  it('computes mover x as offset - laneMaxWidth, so it enters from off-screen', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 1,
      period: 20,
      movers: [
        { type: 'log', width: 4, offset: 0 },
        { type: 'log', width: 2, offset: 5 },
      ],
    };
    expect(laneMaxWidth(lane)).toBe(4);
    expect(moverX(lane, lane.movers[0] as never)).toBe(0 - 4);
    expect(moverX(lane, lane.movers[1] as never)).toBe(5 - 4);
  });

  it('mover position at time t matches the closed-form wrap/offset math', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 1.5,
      period: 15,
      movers: [{ type: 'car', width: 1, offset: 10 }],
    };
    const dt = 1 / 60;
    const steps = 600; // 10 seconds
    for (let i = 0; i < steps; i++) stepLane(lane, dt);
    const expectedOffset = wrapValue(10 + 1.5 * 10, 15);
    expect(lane.movers[0]?.offset).toBeCloseTo(expectedOffset, 5);
  });

  it('produces three period-wrapped instances for render/collision visibility', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 0,
      period: 15,
      movers: [{ type: 'car', width: 1, offset: 10 }],
    };
    const mover = lane.movers[0] as (typeof lane.movers)[number];
    const instances = moverInstances(lane, mover);
    expect(instances).toHaveLength(3);
    expect(instances[1]).toBeCloseTo(instances[0] + 15);
    expect(instances[2]).toBeCloseTo(instances[1] + 15);
  });
});

describe('platformAt', () => {
  it('finds a platform whose span covers the given centre x', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 1,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 4 }], // x = 4 - 4 = 0, spans [0,4)
    };
    expect(platformAt(lane, 2, 0)).not.toBeNull();
    expect(platformAt(lane, 5, 0)).toBeNull();
  });

  it('returns null for non-river lanes', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 1,
      period: 20,
      movers: [{ type: 'car', width: 1, offset: 1 }],
    };
    expect(platformAt(lane, 0.5, 0)).toBeNull();
  });
});

describe('vehicleHits', () => {
  it('detects overlap between a hitbox and a vehicle', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 0,
      period: 20,
      movers: [{ type: 'car', width: 1, offset: 6 }], // x = 6 - 1 = 5, spans [5,6)
    };
    expect(vehicleHits(lane, [5.2, 5.8])).toBe(true);
    expect(vehicleHits(lane, [7, 7.6])).toBe(false);
  });

  it('returns false for non-road lanes', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 4 }],
    };
    expect(vehicleHits(lane, [0, 1])).toBe(false);
  });
});
