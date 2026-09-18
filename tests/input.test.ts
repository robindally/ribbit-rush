import { describe, expect, it } from 'vitest';
import { mapKeyToAction } from '../src/core/input';

describe('mapKeyToAction: code -> key fallback', () => {
  it('maps a hop from key when code is empty (virtual keyboards/automation send no code)', () => {
    expect(mapKeyToAction({ code: '', key: 'ArrowUp' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'ArrowDown' })).toEqual({ type: 'hop', dir: 'down' });
    expect(mapKeyToAction({ code: '', key: 'ArrowLeft' })).toEqual({ type: 'hop', dir: 'left' });
    expect(mapKeyToAction({ code: '', key: 'ArrowRight' })).toEqual({ type: 'hop', dir: 'right' });
  });

  it('maps wasd via key fallback in either case', () => {
    expect(mapKeyToAction({ code: '', key: 'w' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'W' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: '', key: 'a' })).toEqual({ type: 'hop', dir: 'left' });
    expect(mapKeyToAction({ code: '', key: 's' })).toEqual({ type: 'hop', dir: 'down' });
    expect(mapKeyToAction({ code: '', key: 'D' })).toEqual({ type: 'hop', dir: 'right' });
  });

  it('maps confirm and pause via key fallback', () => {
    expect(mapKeyToAction({ code: '', key: 'Enter' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: '', key: ' ' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: '', key: 'Escape' })).toEqual({ type: 'pause' });
    expect(mapKeyToAction({ code: '', key: 'p' })).toEqual({ type: 'pause' });
    expect(mapKeyToAction({ code: '', key: 'P' })).toEqual({ type: 'pause' });
  });

  it('returns null for an unmapped key when code is empty', () => {
    expect(mapKeyToAction({ code: '', key: 'Tab' })).toBeNull();
  });

  it('does not change behaviour when code is present, even if unrecognised', () => {
    // key alone would map to a hop, but a present (if unrecognised) code must win and refuse it.
    expect(mapKeyToAction({ code: 'Unidentified', key: 'ArrowUp' })).toBeNull();
  });

  it('maps normally from code when code is present (unchanged behaviour)', () => {
    expect(mapKeyToAction({ code: 'ArrowUp', key: 'ArrowUp' })).toEqual({ type: 'hop', dir: 'up' });
    expect(mapKeyToAction({ code: 'KeyD', key: 'd' })).toEqual({ type: 'hop', dir: 'right' });
    expect(mapKeyToAction({ code: 'Enter', key: 'Enter' })).toEqual({ type: 'confirm' });
    expect(mapKeyToAction({ code: 'KeyP', key: 'p' })).toEqual({ type: 'pause' });
  });
});
