// Music sequencer: a lookahead scheduler that plays the per-world patterns from `music-data.ts`
// through the shared graph `core/audio.ts` owns. See docs/specs/M5-audio.md section 3.
//
// Split from `core/audio.ts` per the spec's file assignment ("core/audio.ts is the engine and SFX;
// audio/music.ts is the sequencer"): this module never creates the AudioContext or the
// master/music/sfx gain nodes itself, it only asks `core/audio.ts` for the shared `musicFilter`
// node (sequencer output -> musicFilter -> music gain -> master, per that module's graph) and the
// AudioContext's clock. That keeps the dependency one-directional (music.ts -> core/audio.ts) so
// neither file needs the other at import time in a way that would require a real AudioContext -
// see "No AudioContext in tests" in docs/specs/M5-audio.md section 4: `stepDurationS`/`midiToFreq`
// and the pattern data are plain, context-free functions/data, which is all `tests/music.test.ts`
// touches.
//
// Self-subscribes to `GameEvent` ('timerLow' raises intensity, 'death' ducks the filter for 1s),
// matching the milestone rule and the `fx/*.ts` self-subscribing pattern.

import { gameEvents } from '../core/events';
import * as audioCore from '../core/audio';
import type { NoteEvent, TrackName, WorldMusicDef } from './music-data';
import { TITLE_BPM, WORLD_MUSIC } from './music-data';

const LOOKAHEAD_S = 0.1; // schedule this far ahead of "now"
const SCHEDULER_INTERVAL_MS = 25;
const CROSSFADE_S = 0.8;
const DEATH_DUCK_S = 1;
const DEATH_DUCK_FREQ = 400;
const FILTER_MIN_FREQ = 1200;
const FILTER_MAX_FREQ = 8000;
const TEMPO_INTENSITY_BOOST = 0.08; // +8% tempo at intensity 1

// --- Pure helpers (docs/specs/M5-audio.md section 4: no AudioContext) ---

/** Duration of one 16th-note step at `bpm`, in seconds. */
export function stepDurationS(bpm: number): number {
  return 60 / bpm / 4;
}

/** MIDI note number -> frequency in Hz (A4 = 69 = 440Hz, equal temperament). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function liveBpm(baseBpm: number): number {
  return baseBpm * (1 + TEMPO_INTENSITY_BOOST * intensity);
}

// --- Intensity / death-duck state (shared across every generation) ---

let intensity = 0; // 0..1, docs/specs/M5-audio.md section 3
let duckedUntilS = 0; // AudioContext time the death-duck ends, 0 when not ducked
let deathDuckTimer: ReturnType<typeof setTimeout> | null = null;

export function setIntensity(v: number): void {
  intensity = Math.max(0, Math.min(1, v));
  applyFilterFrequency();
}

export function getIntensity(): number {
  return intensity;
}

function applyFilterFrequency(): void {
  const ctx = audioCore.getContext();
  const filter = audioCore.getMusicFilter();
  if (!ctx || !filter) return;
  if (ctx.currentTime < duckedUntilS) return; // the death duck overrides until it expires
  const freq = FILTER_MIN_FREQ + (FILTER_MAX_FREQ - FILTER_MIN_FREQ) * intensity;
  filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.15);
}

function duckOnDeath(): void {
  const ctx = audioCore.getContext();
  const filter = audioCore.getMusicFilter();
  if (!ctx || !filter) return;
  const now = ctx.currentTime;
  filter.frequency.cancelScheduledValues(now);
  filter.frequency.setTargetAtTime(DEATH_DUCK_FREQ, now, 0.05);
  duckedUntilS = now + DEATH_DUCK_S;
  if (deathDuckTimer) clearTimeout(deathDuckTimer);
  deathDuckTimer = setTimeout(() => {
    duckedUntilS = 0;
    intensity = 0; // a fresh attempt/level starts calm
    applyFilterFrequency();
  }, DEATH_DUCK_S * 1000);
}

gameEvents.on('timerLow', () => setIntensity(1));
gameEvents.on('death', () => duckOnDeath());

// --- Generations: one per active `play()` call. Two can overlap during an 800ms crossfade, each
// with its own bus gain, its own step clock, and its own tempo (so the outgoing track doesn't
// suddenly retime mid-fade). ---

interface Generation {
  id: number;
  def: WorldMusicDef;
  title: boolean;
  bus: GainNode;
  stepIndex: number;
  nextStepTimeS: number;
  dripBarIdx: number; // which bar's drip steps are cached in dripSteps
  dripSteps: [number, number];
  padVoiceGains: GainNode[]; // currently-sustaining pad note gains, for the world-3 kick duck
  fadingOut: boolean;
}

let generations: Generation[] = [];
let nextGenId = 1;
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentWorld: 1 | 2 | 3 | 4 | 5 | null = null;
let currentTitle = false;
let pendingPlay: { world: 1 | 2 | 3 | 4 | 5; title: boolean } | null = null;

export function isPlaying(): boolean {
  return generations.some((g) => !g.fadingOut);
}

export function getCurrentWorld(): (1 | 2 | 3 | 4 | 5) | null {
  return currentWorld;
}

/** Starts (or crossfades to, over 800ms, if something is already playing) `world`'s patterns.
 * `opts.title` plays them at the fixed title tempo with kick/snare dropped (docs/specs/M5-audio.md
 * section 3). Works for all five worlds today even though only world 1 is reachable from real
 * gameplay pre-M6 - M6 will just start calling it with other world ids. */
export function play(world: 1 | 2 | 3 | 4 | 5, opts: { title?: boolean } = {}): void {
  const title = opts.title ?? false;
  const ctx = audioCore.getContext();
  const filter = audioCore.getMusicFilter();
  if (!ctx || !filter) {
    pendingPlay = { world, title };
    audioCore.onUnlock(flushPendingPlay);
    return;
  }
  if (currentWorld === world && currentTitle === title && isPlaying()) return; // already there

  const outgoing = generations.filter((g) => !g.fadingOut);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0, ctx.currentTime);
  bus.connect(filter);
  bus.gain.setTargetAtTime(1, ctx.currentTime, CROSSFADE_S / 3);

  const gen: Generation = {
    id: nextGenId++,
    def: WORLD_MUSIC[world],
    title,
    bus,
    stepIndex: 0,
    nextStepTimeS: ctx.currentTime,
    dripBarIdx: -1,
    dripSteps: [0, 0],
    padVoiceGains: [],
    fadingOut: false,
  };
  generations.push(gen);
  currentWorld = world;
  currentTitle = title;

  for (const g of outgoing) {
    g.fadingOut = true;
    g.bus.gain.setTargetAtTime(0, ctx.currentTime, CROSSFADE_S / 3);
    const genId = g.id;
    setTimeout(() => {
      generations = generations.filter((x) => x.id !== genId);
      try {
        g.bus.disconnect();
      } catch {
        /* already disconnected */
      }
    }, CROSSFADE_S * 1000 + 100);
  }

  ensureScheduler();
}

function flushPendingPlay(): void {
  if (!pendingPlay) return;
  const p = pendingPlay;
  pendingPlay = null;
  play(p.world, { title: p.title });
}

/** Fades everything out over 800ms and stops scheduling. */
export function stop(): void {
  pendingPlay = null;
  const ctx = audioCore.getContext();
  currentWorld = null;
  if (!ctx) {
    generations = [];
    return;
  }
  for (const g of generations) {
    g.fadingOut = true;
    g.bus.gain.setTargetAtTime(0, ctx.currentTime, CROSSFADE_S / 3);
  }
  const ids = generations.map((g) => g.id);
  setTimeout(() => {
    generations = generations.filter((g) => !ids.includes(g.id));
    if (generations.length === 0) stopScheduler();
  }, CROSSFADE_S * 1000 + 100);
}

function ensureScheduler(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(tick, SCHEDULER_INTERVAL_MS);
}

function stopScheduler(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

function tick(): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const lookahead = ctx.currentTime + LOOKAHEAD_S;
  for (const gen of generations) {
    const bpm = liveBpm(gen.title ? TITLE_BPM : gen.def.bpm);
    const stepS = stepDurationS(bpm);
    while (gen.nextStepTimeS < lookahead) {
      scheduleStep(gen, gen.stepIndex, gen.nextStepTimeS);
      gen.nextStepTimeS += stepS;
      gen.stepIndex += 1;
    }
  }
  if (generations.length === 0) stopScheduler();
}

// --- Per-step scheduling ---

function barsFor(gen: Generation, track: TrackName): NoteEvent[][] | undefined {
  return gen.def.tracks[track];
}

function eventsAt(bars: NoteEvent[][], stepIndex: number, stepInBar: number): NoteEvent[] {
  const barIdx = Math.floor(stepIndex / 16) % bars.length;
  return bars[barIdx].filter((n) => n.step === stepInBar);
}

function scheduleStep(gen: Generation, stepIndex: number, timeS: number): void {
  const stepInBar = stepIndex % 16;
  const bpm = gen.title ? TITLE_BPM : gen.def.bpm;
  const stepS = stepDurationS(liveBpm(bpm));

  if (!gen.title) {
    const kick = barsFor(gen, 'kick');
    if (kick) {
      const hits = eventsAt(kick, stepIndex, stepInBar);
      if (hits.length) {
        triggerKick(gen.bus, timeS);
        duckPads(gen, timeS);
      }
    }
    const snare = barsFor(gen, 'snare');
    if (snare) for (const n of eventsAt(snare, stepIndex, stepInBar)) triggerSnare(gen.bus, timeS, n.vel);
  }

  const hat = barsFor(gen, 'hat');
  if (hat) for (const n of eventsAt(hat, stepIndex, stepInBar)) triggerHat(gen.bus, timeS, n);

  const bass = barsFor(gen, 'bass');
  if (bass) {
    for (const n of eventsAt(bass, stepIndex, stepInBar)) triggerBass(gen.bus, timeS, n, stepS);
  }

  const lead = barsFor(gen, 'lead');
  if (lead) for (const n of eventsAt(lead, stepIndex, stepInBar)) triggerLead(gen.bus, timeS, n, stepS);

  const pad = barsFor(gen, 'pad');
  if (pad) {
    for (const n of eventsAt(pad, stepIndex, stepInBar)) {
      const g = triggerPad(gen.bus, timeS, n, stepS);
      if (g) {
        gen.padVoiceGains.push(g);
        setTimeout(
          () => {
            const i = gen.padVoiceGains.indexOf(g);
            if (i >= 0) gen.padVoiceGains.splice(i, 1);
          },
          (n.length * stepS + 0.1) * 1000,
        );
      }
    }
  }

  const bell = barsFor(gen, 'bell');
  if (bell) for (const n of eventsAt(bell, stepIndex, stepInBar)) triggerBell(gen.bus, timeS, n, stepS);

  if (gen.def.world === 4 && !gen.title) scheduleDrip(gen, stepIndex, stepInBar, timeS);
}

/** World 4's "random drip" embellishment (docs/specs/M5-audio.md section 4's per-world table:
 * "random 'drip' sine notes (2 per bar, high, quiet)"). Not stored in music-data.ts - it's
 * generated at schedule time, two random steps chosen fresh at the start of each bar. */
function scheduleDrip(gen: Generation, stepIndex: number, stepInBar: number, timeS: number): void {
  const barIdx = Math.floor(stepIndex / 16);
  if (barIdx !== gen.dripBarIdx) {
    gen.dripBarIdx = barIdx;
    const a = Math.floor(Math.random() * 16);
    let b = Math.floor(Math.random() * 16);
    if (b === a) b = (b + 1) % 16;
    gen.dripSteps = [a, b];
  }
  if (gen.dripSteps.includes(stepInBar)) {
    const scale = gen.def.scale;
    const pc = scale[Math.floor(Math.random() * scale.length)];
    const note = 84 + pc; // high register (around C6)
    triggerDrip(gen.bus, timeS, note);
  }
}

/** World 3's "pad gain ducking 30% on each kick" - applied generically to whichever pad notes are
 * currently sustaining when a kick fires, so it only has an audible effect on worlds that actually
 * have both a kick and a pad track at once (world 3, today). */
function duckPads(gen: Generation, timeS: number): void {
  for (const g of gen.padVoiceGains) {
    const current = g.gain.value;
    g.gain.setTargetAtTime(current * 0.7, timeS, 0.02);
    g.gain.setTargetAtTime(current, timeS + 0.09, 0.08);
  }
}

// --- Track synths (docs/specs/M5-audio.md section 3) ---

function envAD(param: AudioParam, t0: number, attackS: number, decayS: number, peak: number): number {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.001, attackS));
  param.exponentialRampToValueAtTime(
    0.0001,
    t0 + Math.max(0.001, attackS) + Math.max(0.001, decayS),
  );
  return t0 + attackS + decayS;
}

function triggerKick(bus: AudioNode, t0: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t0);
  osc.frequency.linearRampToValueAtTime(50, t0 + 0.12);
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(bus);
  const end = envAD(gain.gain, t0, 0.002, 0.118, 0.9);
  osc.start(t0);
  osc.stop(end + 0.02);
}

function triggerSnare(bus: AudioNode, t0: number, vel: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = getSharedNoise(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1800;
  const noiseGain = ctx.createGain();
  src.connect(filt);
  filt.connect(noiseGain);
  noiseGain.connect(bus);
  const end1 = envAD(noiseGain.gain, t0, 0.002, 0.148, 0.6 * vel);
  src.start(t0);
  src.stop(end1 + 0.02);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 180;
  const oscGain = ctx.createGain();
  osc.connect(oscGain);
  oscGain.connect(bus);
  const end2 = envAD(oscGain.gain, t0, 0.002, 0.058, 0.4 * vel);
  osc.start(t0);
  osc.stop(end2 + 0.02);
}

function triggerHat(bus: AudioNode, t0: number, n: NoteEvent): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const durS = n.open ? 0.12 : 0.03;
  const src = ctx.createBufferSource();
  src.buffer = getSharedNoise(ctx);
  const filt = ctx.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 6000;
  const gain = ctx.createGain();
  src.connect(filt);
  filt.connect(gain);
  gain.connect(bus);
  const end = envAD(gain.gain, t0, 0.001, durS, n.vel * 0.5);
  src.start(t0);
  src.stop(end + 0.02);
}

function triggerBass(bus: AudioNode, t0: number, n: NoteEvent, stepS: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = midiToFreq(n.note);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 600;
  const gain = ctx.createGain();
  osc.connect(filt);
  filt.connect(gain);
  gain.connect(bus);
  const durS = Math.max(0.05, n.length * stepS * 0.9);
  const end = envAD(gain.gain, t0, 0.005, durS, n.vel * 0.6);
  osc.start(t0);
  osc.stop(end + 0.02);
}

function triggerLead(bus: AudioNode, t0: number, n: NoteEvent, stepS: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const f = midiToFreq(n.note);
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2500;
  filt.connect(gain);
  gain.connect(bus);

  // "pulse" approximated as two detuned square oscillators (4 cents) summed.
  for (const cents of [-4, 4]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    osc.detune.value = cents;
    osc.connect(filt);
    osc.start(t0);
    const durS = Math.max(0.04, n.length * stepS * 0.8);
    osc.stop(t0 + durS + 0.03);
  }
  const durS = Math.max(0.04, n.length * stepS * 0.8);
  envAD(gain.gain, t0, 0.004, durS, n.vel * 0.35);
}

function triggerPad(bus: AudioNode, t0: number, n: NoteEvent, stepS: number): GainNode | null {
  const ctx = audioCore.getContext();
  if (!ctx) return null;
  const f = midiToFreq(n.note);
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 900;
  filt.connect(gain);
  gain.connect(bus);

  for (const cents of [-8, 8]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;
    osc.detune.value = cents;
    osc.connect(filt);
    osc.start(t0);
    const durS = n.length * stepS;
    osc.stop(t0 + durS + 0.4);
  }

  const attackS = 0.4;
  const durS = Math.max(attackS + 0.1, n.length * stepS);
  gain.gain.cancelScheduledValues(t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(n.vel, t0 + attackS);
  gain.gain.setTargetAtTime(0.0001, t0 + durS - 0.2, 0.15);
  return gain;
}

function triggerBell(bus: AudioNode, t0: number, n: NoteEvent, stepS: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const f = midiToFreq(n.note);
  const gain = ctx.createGain();
  gain.connect(bus);

  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = f;
  fundamental.connect(gain);
  fundamental.start(t0);

  const partial = ctx.createOscillator();
  partial.type = 'sine';
  partial.frequency.value = f * 2; // octave partial
  const partialGain = ctx.createGain();
  partial.connect(partialGain);
  partialGain.connect(bus);
  partial.start(t0);

  const durS = Math.max(0.15, n.length * stepS);
  const end = envAD(gain.gain, t0, 0.002, durS, n.vel * 0.5);
  envAD(partialGain.gain, t0, 0.001, durS * 0.35, n.vel * 0.35); // fast-decaying octave partial
  fundamental.stop(end + 0.05);
  partial.stop(t0 + durS * 0.35 + 0.05);
}

function triggerDrip(bus: AudioNode, t0: number, note: number): void {
  const ctx = audioCore.getContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = midiToFreq(note);
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(bus);
  const end = envAD(gain.gain, t0, 0.005, 0.3, 0.12);
  osc.start(t0);
  osc.stop(end + 0.02);
}

let sharedNoise: AudioBuffer | null = null;
function getSharedNoise(ctx: AudioContext): AudioBuffer {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  sharedNoise = buf;
  return buf;
}

// --- Dev hook ---

export function devHook(): Record<string, unknown> {
  return {
    play: (world: 1 | 2 | 3 | 4 | 5, title?: boolean) => play(world, { title }),
    stop,
    setIntensity,
    get intensity() {
      return getIntensity();
    },
    get playing() {
      return isPlaying();
    },
    get world() {
      return getCurrentWorld();
    },
  };
}

/** Test/dev-only: stops every generation and clears the scheduler, so tests/dev sessions don't
 * leak state into each other via this module's singleton. */
export function reset(): void {
  for (const g of generations) {
    try {
      g.bus.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  generations = [];
  currentWorld = null;
  pendingPlay = null;
  intensity = 0;
  duckedUntilS = 0;
  if (deathDuckTimer) {
    clearTimeout(deathDuckTimer);
    deathDuckTimer = null;
  }
  stopScheduler();
}
