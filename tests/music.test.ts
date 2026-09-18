// Pure-function tests for the music sequencer and its data: step timing, note-to-frequency, and
// pattern validation (docs/specs/M5-audio.md section 4: "No AudioContext in tests"). Neither
// `src/audio/music.ts` nor `src/audio/music-data.ts` touches an AudioContext at import time, so
// importing them here is safe.

import { describe, expect, it } from 'vitest';
import { midiToFreq, stepDurationS } from '../src/audio/music';
import { validateWorldPatterns, WORLD_MUSIC } from '../src/audio/music-data';
import type { NoteEvent, WorldMusicDef } from '../src/audio/music-data';

describe('stepDurationS', () => {
  it('is one 16th note at the given BPM', () => {
    // 120 BPM: a quarter note is 0.5s, a 16th is a quarter of that.
    expect(stepDurationS(120)).toBeCloseTo(0.125, 10);
  });

  it('scales inversely with tempo', () => {
    expect(stepDurationS(60)).toBeCloseTo(0.25, 10);
    expect(stepDurationS(240)).toBeCloseTo(0.0625, 10);
  });

  it('matches every world\'s own BPM without producing a zero/negative duration', () => {
    for (const def of Object.values(WORLD_MUSIC)) {
      expect(stepDurationS(def.bpm)).toBeGreaterThan(0);
    }
  });
});

describe('midiToFreq', () => {
  it('A4 (MIDI 69) is 440Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  it('C4 (MIDI 60, middle C) is ~261.63Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
  });

  it('an octave up doubles the frequency', () => {
    expect(midiToFreq(81)).toBeCloseTo(midiToFreq(69) * 2, 6);
  });

  it('an octave down halves the frequency', () => {
    expect(midiToFreq(57)).toBeCloseTo(midiToFreq(69) / 2, 6);
  });
});

describe('validateWorldPatterns', () => {
  it('every shipped world (1-5) has every note step in 0..15 and every pitched note in its scale', () => {
    for (const def of Object.values(WORLD_MUSIC)) {
      expect(validateWorldPatterns(def)).toEqual([]);
    }
  });

  it('each world has a 5- or 7-note scale (pentatonic or diatonic) as the spec describes', () => {
    // World 1 is pentatonic (5 notes); the rest are 7-note modes.
    expect(WORLD_MUSIC[1].scale).toHaveLength(5);
    for (const world of [2, 3, 4, 5] as const) {
      expect(WORLD_MUSIC[world].scale).toHaveLength(7);
    }
  });

  it('flags a step outside 0..15', () => {
    const bad: WorldMusicDef = {
      ...WORLD_MUSIC[1],
      tracks: { lead: [[{ step: 16, note: 72, length: 1, vel: 0.5 } as NoteEvent]] },
    };
    const errors = validateWorldPatterns(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/step 16 out of range/);
  });

  it('flags a pitched-track note outside the world scale', () => {
    // World 1 is C major pentatonic (C D E G A) - an F (pitch class 5) isn't in it.
    const bad: WorldMusicDef = {
      ...WORLD_MUSIC[1],
      tracks: { bass: [[{ step: 0, note: 65, length: 2, vel: 0.8 } as NoteEvent]] }, // F4
    };
    const errors = validateWorldPatterns(bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/not in scale/);
  });

  it('does not scale-check the percussive tracks (kick/snare/hat carry fixed drum notes)', () => {
    // Kick's placeholder note (36) is not itself required to be in any world's scale.
    const def = WORLD_MUSIC[1];
    const kickNotes = def.tracks.kick?.flat().map((n) => n.note) ?? [];
    expect(kickNotes.length).toBeGreaterThan(0);
    expect(validateWorldPatterns(def)).toEqual([]);
  });
});

describe('world music definitions', () => {
  it('every world has at least one track', () => {
    for (const def of Object.values(WORLD_MUSIC)) {
      expect(Object.keys(def.tracks).length).toBeGreaterThan(0);
    }
  });

  it('every bar in every track has 16 possible step slots at most (steps are unique per bar is not required, but none exceed the grid)', () => {
    for (const def of Object.values(WORLD_MUSIC)) {
      for (const bars of Object.values(def.tracks)) {
        for (const bar of bars ?? []) {
          for (const n of bar) {
            expect(n.step).toBeGreaterThanOrEqual(0);
            expect(n.step).toBeLessThanOrEqual(15);
          }
        }
      }
    }
  });
});
