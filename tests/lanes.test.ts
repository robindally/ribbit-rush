import { describe, expect, it } from 'vitest';
import {
  createFloeState,
  isTrainWarningActive,
  laneMaxWidth,
  moverInstances,
  moverRenderOffset,
  moverSpeed,
  moverX,
  secondsUntilLeadingEdgeEnters,
  stepFloeState,
  stepLane,
  TRAIN_WARNING_S,
  wrapValue,
} from '../src/game/lanes';
import { killerHitType, killerHits, platformAt, vehicleHits } from '../src/game/collision';
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

// --- M10: render interpolation (ARCHITECTURE.md section 4: "each mover keeps prevX") ---

describe('stepLane / moverRenderOffset', () => {
  it('records prevOffset every step, one step behind the current offset', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 2,
      period: 10,
      movers: [{ type: 'car', width: 1, offset: 0 }],
    };
    stepLane(lane, 1); // offset 0 -> 2
    expect(lane.movers[0]?.prevOffset).toBe(0);
    expect(lane.movers[0]?.offset).toBe(2);
    stepLane(lane, 1); // offset 2 -> 4
    expect(lane.movers[0]?.prevOffset).toBe(2);
  });

  it('falls back to the current offset (no interpolation) before the first stepLane call', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 2,
      period: 10,
      movers: [{ type: 'car', width: 1, offset: 5 }],
    };
    expect(moverRenderOffset(lane, lane.movers[0] as never, 0.5)).toBe(5);
  });

  it('interpolates linearly between prevOffset and offset by alpha, mid-lane (no wrap)', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 4,
      period: 20,
      movers: [{ type: 'car', width: 1, offset: 0 }],
    };
    stepLane(lane, 1); // 0 -> 4
    expect(moverRenderOffset(lane, lane.movers[0] as never, 0)).toBeCloseTo(0);
    expect(moverRenderOffset(lane, lane.movers[0] as never, 1)).toBeCloseTo(4);
    expect(moverRenderOffset(lane, lane.movers[0] as never, 0.5)).toBeCloseTo(2);
  });

  it('takes the short way around a period wrap instead of jumping backward across the lane', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 1,
      period: 10,
      movers: [{ type: 'car', width: 1, offset: 9.5 }],
    };
    stepLane(lane, 1); // 9.5 + 1 = 10.5, wraps to 0.5
    expect(lane.movers[0]?.prevOffset).toBe(9.5);
    expect(lane.movers[0]?.offset).toBeCloseTo(0.5);
    // Halfway through the step, the mover should be exactly at the wrap boundary (0), not at the
    // midpoint of the *raw* numbers (9.5 and 0.5 average to 5 - the wrong, "teleport back" answer).
    expect(moverRenderOffset(lane, lane.movers[0] as never, 0.5)).toBeCloseTo(0, 5);
  });

  it('wraps the same short way for a leftward (negative-speed) lane', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: -1,
      period: 10,
      movers: [{ type: 'car', width: 1, offset: 0.3 }],
    };
    stepLane(lane, 1); // 0.3 - 1 = -0.7, wraps to 9.3
    expect(moverRenderOffset(lane, lane.movers[0] as never, 0.5)).toBeCloseTo(9.8, 5);
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

// --- M6: killer movers, any lane kind (docs/specs/M6-worlds.md section 1) ---

describe('killerHitType / killerHits', () => {
  it('a snake on a median lane is a killer', () => {
    const lane: LaneDef = {
      row: 7,
      kind: 'median',
      speed: 0,
      period: 20,
      movers: [{ type: 'snake', width: 1.5, offset: 6 }], // x = 6 - 1.5 = 4.5, spans [4.5, 6)
    };
    expect(killerHitType(lane, [5, 5.6])).toBe('snake');
    expect(killerHits(lane, [5, 5.6])).toBe(true);
    expect(killerHits(lane, [0, 0.6])).toBe(false);
  });

  it('a jetski on a river lane is a killer even though jetski is not a platform type', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'jetski', width: 1, offset: 5 }], // x = 5 - 1 = 4, spans [4,5)
    };
    expect(killerHitType(lane, [4.2, 4.8])).toBe('jetski');
  });

  it('a log platform is never a killer', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 0,
      period: 20,
      movers: [{ type: 'log', width: 4, offset: 4 }],
    };
    expect(killerHitType(lane, [1, 2])).toBeNull();
  });

  it('a car on a road lane is still a killer (unchanged from vehicleHits)', () => {
    const lane: LaneDef = {
      row: 9,
      kind: 'road',
      speed: 0,
      period: 20,
      movers: [{ type: 'car', width: 1, offset: 6 }],
    };
    expect(killerHitType(lane, [5.2, 5.8])).toBe('car');
  });
});

// --- M6: MoverDef.speed override (docs/LEVELS.md "new mover and lane rules") ---

describe('moverSpeed', () => {
  it('uses the mover-level override when present, else the lane speed', () => {
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 1.6,
      period: 20,
      movers: [
        { type: 'log', width: 4, offset: 0 },
        { type: 'jetski', width: 1, offset: 4, speed: -4.5 },
      ],
    };
    expect(moverSpeed(lane, lane.movers[0] as never)).toBe(1.6);
    expect(moverSpeed(lane, lane.movers[1] as never)).toBe(-4.5);
  });
});

// --- M6: floe crack/sink (docs/specs/M6-worlds.md section 2, docs/LEVELS.md "new mover and lane
// rules") ---

describe('stepFloeState', () => {
  it('stays solid under 2s of standing, then cracks', () => {
    let floe = createFloeState();
    floe = stepFloeState(floe, 1.9, true);
    expect(floe.state).toBe('solid');
    floe = stepFloeState(floe, 0.2, true);
    expect(floe.state).toBe('cracking');
  });

  it('sinks 0.4s after cracking starts (2.4s total)', () => {
    let floe = createFloeState();
    floe = stepFloeState(floe, 2.0, true);
    expect(floe.state).toBe('cracking');
    floe = stepFloeState(floe, 0.39, true);
    expect(floe.state).toBe('cracking');
    floe = stepFloeState(floe, 0.01, true);
    expect(floe.state).toBe('sunk');
  });

  it('does not advance while not being ridden', () => {
    let floe = createFloeState();
    floe = stepFloeState(floe, 1.5, true);
    expect(floe.standingT).toBeCloseTo(1.5);
    floe = stepFloeState(floe, 5, false); // hopped off - frozen, not reset
    expect(floe.standingT).toBeCloseTo(1.5);
    expect(floe.state).toBe('solid');
    floe = stepFloeState(floe, 0.6, true); // hopped back on - resumes from 1.5, not from 0
    expect(floe.state).toBe('cracking');
  });

  it('stays sunk once sunk (terminal until stepLane resets it on wrap)', () => {
    let floe = createFloeState();
    floe = stepFloeState(floe, 2.0, true); // solid -> cracking
    floe = stepFloeState(floe, 0.5, true); // cracking -> sunk (past the 2.4s total)
    expect(floe.state).toBe('sunk');
    floe = stepFloeState(floe, 1, true);
    expect(floe.state).toBe('sunk');
  });
});

describe('stepLane resets a floe on wrap', () => {
  it('resets standingT/state to solid the instant the mover wraps off screen', () => {
    const floe = { standingT: 1.8, state: 'cracking' as const };
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 5,
      period: 10,
      movers: [{ type: 'floe', width: 2, offset: 9, floe }],
    };
    // offset 9 + 5*1 = 14, wraps to 4 (14 % 10) - a wrap happens this step.
    stepLane(lane, 1);
    expect(lane.movers[0]?.floe).toEqual({ standingT: 0, state: 'solid' });
  });

  it('does not reset a floe mid-period (no wrap)', () => {
    const floe = { standingT: 1.8, state: 'cracking' as const };
    const lane: LaneDef = {
      row: 2,
      kind: 'river',
      speed: 1,
      period: 10,
      movers: [{ type: 'floe', width: 2, offset: 2, floe }],
    };
    stepLane(lane, 1); // offset 2 -> 3, no wrap
    expect(lane.movers[0]?.floe).toEqual({ standingT: 1.8, state: 'cracking' });
  });
});

// --- M6: train crossing warning (docs/LEVELS.md "new mover and lane rules") ---

describe('secondsUntilLeadingEdgeEnters / isTrainWarningActive', () => {
  it('a rightward train not yet visible returns positive seconds until its front enters', () => {
    // width 6, speed +7.5 tiles/s: x = offset - 6. Put the front (x + 6 = offset) at -3 tiles,
    // i.e. offset = -3 (wrapped into [0, period)).
    const lane: LaneDef = {
      row: 8,
      kind: 'rail',
      speed: 7.5,
      period: 40,
      movers: [{ type: 'train', width: 6, offset: 37 }], // wrapValue(-3, 40) = 37
    };
    const eta = secondsUntilLeadingEdgeEnters(lane, lane.movers[0] as never, 13);
    expect(eta).not.toBeNull();
    expect(eta as number).toBeCloseTo(3 / 7.5, 5); // 0.4s
    expect(isTrainWarningActive(lane, lane.movers[0] as never, 13)).toBe(true); // 0.4s <= 1.5s
  });

  it('the warning boundary is exactly TRAIN_WARNING_S before entry', () => {
    const speed = 6;
    // front = offset - width + width = offset; want front = -(speed * TRAIN_WARNING_S).
    const offset = 40 - speed * TRAIN_WARNING_S; // wrapped into [0, 40)
    const lane: LaneDef = {
      row: 8,
      kind: 'rail',
      speed,
      period: 40,
      movers: [{ type: 'train', width: 6, offset }],
    };
    const eta = secondsUntilLeadingEdgeEnters(lane, lane.movers[0] as never, 13);
    expect(eta as number).toBeCloseTo(TRAIN_WARNING_S, 5);
    expect(isTrainWarningActive(lane, lane.movers[0] as never, 13)).toBe(true);
  });

  it('is not within the warning window right after entering (next lap is far off)', () => {
    const lane: LaneDef = {
      row: 8,
      kind: 'rail',
      speed: -7,
      period: 40,
      movers: [{ type: 'train', width: 6, offset: 12 }], // x = 12 - 6 = 6: on screen already
    };
    const eta = secondsUntilLeadingEdgeEnters(lane, lane.movers[0] as never, 13);
    expect(eta).not.toBeNull();
    expect(eta as number).toBeGreaterThan(TRAIN_WARNING_S);
    expect(isTrainWarningActive(lane, lane.movers[0] as never, 13)).toBe(false);
  });

  it('a stationary lane never enters', () => {
    const lane: LaneDef = {
      row: 8,
      kind: 'rail',
      speed: 0,
      period: 40,
      movers: [{ type: 'train', width: 6, offset: 0 }],
    };
    expect(secondsUntilLeadingEdgeEnters(lane, lane.movers[0] as never, 13)).toBeNull();
  });
});
