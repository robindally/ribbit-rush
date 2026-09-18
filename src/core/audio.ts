// Web Audio engine: SFX synthesis, the master/music/sfx gain graph, volume/mute persistence, the
// lazy AudioContext-on-gesture unlock, and the voice cap. See docs/specs/M5-audio.md sections 1-2
// and docs/ARCHITECTURE.md section 9 (events). `src/audio/music.ts` is the sequencer that hangs
// its own nodes off this module's shared graph (`getContext`/`getMusicFilter`) - see that file for
// the split rationale.
//
// Self-subscribes to `GameEvent` for every SFX trigger, per the milestone rule that audio reacts
// to events rather than being called directly by gameplay code (the `fx/` modules are the model -
// see docs/specs/M4-report.md). A handful of purely presentational triggers (menu confirm sounds,
// the title's start-up croak) have no `GameEvent` of their own, so scenes call `playSfx` directly
// for those, exactly like `fx/transitions.ts` is called directly by scenes for the iris wipe.
//
// No AudioContext (or any DOM/`window` access) happens at import time - only inside `init()` and
// the functions it wires up - so importing this module (transitively, via `audio/music.ts`) is
// safe in Vitest, which has no AudioContext. See "No AudioContext in tests" in
// docs/specs/M5-audio.md section 4.

import { gameEvents } from './events';
import type { SaveData } from './save';
import { writeSave } from './save';

// --- Public types ---

export const SFX_NAMES = [
  'hop',
  'landGround',
  'landPlatform',
  'bonk',
  'splash',
  'squish',
  'timeout',
  'croak',
  'home',
  'fly',
  'levelClear',
  'nearMiss',
  'streakUp',
  'extraLife',
  'tick',
  'horn',
  'powerup',
  'freeze',
  'uiMove',
  'uiConfirm',
] as const;

export type SfxName = (typeof SFX_NAMES)[number];

export interface AudioStats {
  /** Total SFX voices started since boot, by name. */
  byName: Record<string, number>;
  /** Total SFX voices started since boot, across every name. */
  total: number;
}

// --- Graph state (all null until the first user gesture creates the AudioContext) ---

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

let currentSave: SaveData | null = null;
let started = false; // true once the AudioContext exists (first gesture happened)
let ambientEnabled = false;
let ambientTimer: ReturnType<typeof setTimeout> | null = null;
let muteKeyAttached = false;
let gestureListenersAttached = false;

const unlockListeners: (() => void)[] = [];
const stats: AudioStats = { byName: {}, total: 0 };

interface Voice {
  stop: (fadeS?: number) => void;
}
const MAX_VOICES = 16;
const activeVoices: Voice[] = [];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 0..100 save value -> 0..1 gain. */
function pct(v: number): number {
  return clamp01(v / 100);
}

// --- Lifecycle ---

/**
 * Wires the engine to `save` (read for initial volumes/mute, written back on every change),
 * installs the first-gesture AudioContext unlock, the `M` mute toggle, and every GameEvent
 * subscription. Call once at boot (see `src/main.ts`). Safe to call in a DOM-less environment
 * only in the sense that it no-ops correctly there is not a documented requirement - main.ts is
 * the only real caller.
 */
export function init(save: SaveData): void {
  currentSave = save;
  attachGestureUnlock();
  attachMuteKey();
}

function attachGestureUnlock(): void {
  if (gestureListenersAttached || typeof window === 'undefined') return;
  gestureListenersAttached = true;
  const unlock = (): void => {
    resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchstart', unlock, { passive: true });
}

function attachMuteKey(): void {
  if (muteKeyAttached || typeof window === 'undefined') return;
  muteKeyAttached = true;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') toggleMute();
  });
}

/** Creates the AudioContext on first call (a user gesture); resumes it on later calls if the
 * browser auto-suspended it (e.g. tab was backgrounded). No-op with no `window`/AudioContext
 * (tests). */
export function resume(): void {
  if (typeof window === 'undefined') return;
  const Ctor = window.AudioContext;
  if (!Ctor) return;
  if (!ctx) {
    ctx = new Ctor();
    buildGraph(ctx);
    applyVolumesFromSave();
    started = true;
    for (const fn of unlockListeners) fn();
    unlockListeners.length = 0;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function buildGraph(context: AudioContext): void {
  master = context.createGain();
  musicGain = context.createGain();
  sfxGain = context.createGain();
  musicFilter = context.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 1200;
  musicFilter.Q.value = 0.7;

  // Safety limiter on the master bus (docs/specs/M6-worlds.md audio fix item): the headless
  // audio-probe (scripts/audio-probe.mjs) found several worlds' simultaneous synth voices
  // (kick+snare+hat+bass+lead+pad+bell all at once) summing past 0dBFS - world 3 peaked at 1.54
  // and world 4 at 1.62 (both clip) before this. A DynamicsCompressorNode catches every world's
  // mix generically; world 3's pad/arpeggio gains are additionally trimmed in
  // `src/audio/music-data.ts` since compression alone still left its RMS too hot - see
  // docs/specs/M6-report.md for the full before/after numbers.
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;

  musicFilter.connect(musicGain);
  musicGain.connect(master);
  sfxGain.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);
}

function applyVolumesFromSave(): void {
  const now = ctx?.currentTime ?? 0;
  const save = currentSave;
  if (!save || !master || !musicGain || !sfxGain) return;
  const muteMul = save.settings.muted ? 0 : 1;
  master.gain.setTargetAtTime(pct(save.settings.master) * muteMul, now, 0.01);
  musicGain.gain.setTargetAtTime(pct(save.settings.music), now, 0.01);
  sfxGain.gain.setTargetAtTime(pct(save.settings.sfx), now, 0.01);
}

/** Whether the AudioContext exists yet (first gesture happened). Drives the HUD's
 * "tap for sound" hint. */
export function hasStarted(): boolean {
  return started;
}

// --- Volume / mute (docs/specs/M5-audio.md section 1) ---

function setVolume(key: 'master' | 'music' | 'sfx', v: number): void {
  if (!currentSave) return;
  currentSave.settings[key] = clamp(v, 0, 100);
  applyVolumesFromSave();
  writeSave(currentSave);
}

export function setMasterVolume(v: number): void {
  setVolume('master', v);
}
export function setMusicVolume(v: number): void {
  setVolume('music', v);
}
export function setSfxVolume(v: number): void {
  setVolume('sfx', v);
}

export function setVolumes(v: Partial<{ master: number; music: number; sfx: number }>): void {
  if (v.master !== undefined) setVolume('master', v.master);
  if (v.music !== undefined) setVolume('music', v.music);
  if (v.sfx !== undefined) setVolume('sfx', v.sfx);
}

export function toggleMute(): void {
  if (!currentSave) return;
  currentSave.settings.muted = !currentSave.settings.muted;
  applyVolumesFromSave();
  writeSave(currentSave);
}

export function isMuted(): boolean {
  return currentSave?.settings.muted ?? false;
}

// --- Shared graph accessors (used by `audio/music.ts`) ---

export function getContext(): AudioContext | null {
  return ctx;
}

/** The node music tracks should connect into: sequencer output -> musicFilter -> music gain ->
 * master (docs/specs/M5-audio.md section 1). Also the node `music.ts` automates for
 * setIntensity/death-duck (it owns the *behaviour*, this module owns the *node*). */
export function getMusicFilter(): BiquadFilterNode | null {
  return musicFilter;
}

/** Registers `fn` to run exactly once, the moment the AudioContext is created. Lets
 * `audio/music.ts` queue a `play()` requested before the first gesture (e.g. the title screen's
 * music, requested at boot). Safe to call before `init()`/`resume()` - just pushes to an array. */
export function onUnlock(fn: () => void): void {
  if (started) fn();
  else unlockListeners.push(fn);
}

// --- Voice cap + panning ---

function registerVoice(v: Voice): void {
  activeVoices.push(v);
  if (activeVoices.length > MAX_VOICES) {
    const oldest = activeVoices.shift();
    oldest?.stop(0.008);
  }
}

function unregisterVoice(v: Voice): void {
  const i = activeVoices.indexOf(v);
  if (i >= 0) activeVoices.splice(i, 1);
}

/** `pan = (col - 6) / 6 * 0.6` (docs/specs/M5-audio.md section 1). `col` may be fractional (the
 * frog's continuous river/road x) or omitted for events with no position, which centres the pan. */
function panFromCol(col: number | undefined): number {
  if (col === undefined) return 0;
  return clamp(((col - 6) / 6) * 0.6, -1, 1);
}

function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) return noiseBuffer;
  const len = Math.max(1, Math.floor(context.sampleRate * 1));
  const buf = context.createBuffer(1, len, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** attack/decay envelope on a GainNode's `gain` param, ramp-only (no clicks). Returns the time the
 * envelope finishes (attack + decay). */
function envAD(param: AudioParam, t0: number, attackS: number, decayS: number, peak: number): number {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0.0001, t0);
  param.linearRampToValueAtTime(Math.max(0.0001, peak), t0 + Math.max(0.001, attackS));
  param.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.001, attackS) + Math.max(0.001, decayS));
  return t0 + attackS + decayS;
}

/** A one-shot voice bus: `busGain -> panner -> sfxGain`. Every SFX recipe below builds its
 * oscillators/noise into `bus.input` and calls `bus.finish(endTime)` once scheduled so the voice
 * cap and cleanup timer know when it's done. */
function createVoiceBus(pan: number): { input: GainNode; finish: (endTimeS: number) => void } | null {
  if (!ctx || !sfxGain) return null;
  const input = ctx.createGain();
  input.gain.value = 1;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  input.connect(panner);
  panner.connect(sfxGain);

  const voice: Voice = {
    stop(fadeS = 0.01) {
      const now = ctx?.currentTime ?? 0;
      input.gain.cancelScheduledValues(now);
      input.gain.setTargetAtTime(0, now, fadeS / 3);
      setTimeout(
        () => {
          try {
            input.disconnect();
            panner.disconnect();
          } catch {
            /* already disconnected */
          }
        },
        (fadeS + 0.02) * 1000,
      );
    },
  };
  registerVoice(voice);

  return {
    input,
    finish(endTimeS: number) {
      const now = ctx?.currentTime ?? 0;
      const delayMs = Math.max(0, (endTimeS - now) * 1000) + 40;
      setTimeout(() => {
        unregisterVoice(voice);
        try {
          input.disconnect();
          panner.disconnect();
        } catch {
          /* already disconnected */
        }
      }, delayMs);
    },
  };
}

function recordVoice(name: SfxName): void {
  stats.byName[name] = (stats.byName[name] ?? 0) + 1;
  stats.total += 1;
}

export function getStats(): AudioStats {
  return stats;
}

// --- SFX recipes (docs/specs/M5-audio.md section 2) ---
//
// Durations/frequencies follow the spec table; a few recipes ("A2 D90", "220, lowpass 900") are
// terse shorthand and the exact envelope split is a judgment call, same as M4's fx/ recipes -
// documented in docs/specs/M5-report.md.

interface SfxOpts {
  pan?: number;
  /** Semitone shift, used by nearMiss ("up one semitone per combo"). */
  semitones?: number;
}

function freq(midi: number, semitoneShift = 0): number {
  return 440 * Math.pow(2, (midi + semitoneShift - 69) / 12);
}

function sweepOsc(
  bus: AudioNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  durS: number,
  attackS: number,
  decayS: number,
  peak: number,
): number {
  if (!ctx) return t0;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.linearRampToValueAtTime(f1, t0 + durS);
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(bus);
  const end = envAD(gain.gain, t0, attackS, decayS, peak);
  osc.start(t0);
  osc.stop(end + 0.02);
  return end;
}

function toneBeep(
  bus: AudioNode,
  type: OscillatorType,
  f: number,
  t0: number,
  durS: number,
  peak = 0.6,
): number {
  return sweepOsc(bus, type, f, f, t0, durS, 0.005, Math.max(0.01, durS - 0.005), peak);
}

function noiseBurst(
  bus: AudioNode,
  t0: number,
  durS: number,
  filterType: BiquadFilterType,
  freqStart: number,
  freqEnd: number,
  peak: number,
  q = 1,
): number {
  if (!ctx) return t0;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(freqStart, t0);
  filt.frequency.linearRampToValueAtTime(freqEnd, t0 + durS);
  const gain = ctx.createGain();
  src.connect(filt);
  filt.connect(gain);
  gain.connect(bus);
  const end = envAD(gain.gain, t0, 0.004, Math.max(0.01, durS - 0.004), peak);
  src.start(t0);
  src.stop(end + 0.02);
  return end;
}

type SfxBuilder = (bus: AudioNode, t0: number, opts: SfxOpts) => number; // returns end time

const SFX_BUILDERS: Record<SfxName, SfxBuilder> = {
  hop: (bus, t0) => sweepOsc(bus, 'sine', 520, 260, t0, 0.09, 0.002, 0.088, 0.5),

  landGround: (bus, t0) => noiseBurst(bus, t0, 0.04, 'lowpass', 800, 800, 0.18),

  landPlatform: (bus, t0) => {
    const a = toneBeep(bus, 'triangle', 180, t0, 0.06, 0.35);
    const b = noiseBurst(bus, t0, 0.03, 'lowpass', 1200, 1200, 0.2);
    return Math.max(a, b);
  },

  bonk: (bus, t0) => sweepOsc(bus, 'square', 110, 70, t0, 0.08, 0.002, 0.078, 0.4),

  splash: (bus, t0) => {
    const a = noiseBurst(bus, t0, 0.35, 'bandpass', 2000, 400, 0.4, 1.2);
    const b = sweepOsc(bus, 'sine', 120, 120, t0, 0.1, 0.004, 0.096, 0.5);
    return Math.max(a, b);
  },

  squish: (bus, t0) => {
    const a = noiseBurst(bus, t0, 0.12, 'lowpass', 600, 600, 0.4);
    const b = sweepOsc(bus, 'sawtooth', 80, 40, t0, 0.15, 0.004, 0.146, 0.35);
    return Math.max(a, b);
  },

  timeout: (bus, t0) => {
    let t = t0;
    for (let i = 0; i < 3; i++) {
      toneBeep(bus, 'square', 440, t, 0.08, 0.4);
      t += 0.08 + 0.06;
    }
    return SFX_BUILDERS.squish(bus, t, {});
  },

  croak: (bus, t0) => {
    if (!ctx) return t0;
    const durS = 0.22;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 140;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 25;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 40; // amplitude-modulation depth in Hz on the carrier
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const gain = ctx.createGain();
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(bus);
    const end = envAD(gain.gain, t0, 0.01, durS - 0.01, 0.4);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(end + 0.02);
    lfo.stop(end + 0.02);
    return end;
  },

  home: (bus, t0) => {
    const notes = [72, 76, 79, 84]; // C5 E5 G5 C6
    let t = t0;
    let end = t0;
    for (const n of notes) {
      end = toneBeep(bus, 'triangle', freq(n), t, 0.06, 0.45);
      t += 0.06;
    }
    return end;
  },

  fly: (bus, t0) => {
    const end = SFX_BUILDERS.home(bus, t0, {});
    const blipEnd = toneBeep(bus, 'sine', 1400, end, 0.05, 0.4);
    return Math.max(end, blipEnd);
  },

  levelClear: (bus, t0) => {
    const part1 = [72, 76, 79, 84]; // C5 E5 G5 C6
    const part2 = [76, 79, 84, 88]; // E5 G5 C6 E6
    let t = t0;
    for (const n of [...part1, ...part2]) {
      toneBeep(bus, 'triangle', freq(n), t, 0.1, 0.4);
      toneBeep(bus, 'square', freq(n), t, 0.1, 0.15);
      t += 0.1;
    }
    // Closing 600ms chord: C E G, one octave up (C6 E6 G6).
    let end = t;
    for (const n of [84, 88, 91]) {
      end = toneBeep(bus, 'triangle', freq(n), t, 0.6, 0.3);
    }
    return end;
  },

  nearMiss: (bus, t0, opts) => {
    const a = noiseBurst(bus, t0, 0.2, 'bandpass', 600, 3000, 0.35, 1);
    const b = toneBeep(bus, 'sine', 1200 * Math.pow(2, (opts.semitones ?? 0) / 12), t0, 0.08, 0.4);
    return Math.max(a, b);
  },

  streakUp: (bus, t0) => {
    toneBeep(bus, 'sine', 660, t0, 0.06, 0.4);
    return toneBeep(bus, 'sine', 880, t0 + 0.06, 0.06, 0.4);
  },

  extraLife: (bus, t0) => {
    const notes = [60, 64, 67, 72, 76]; // C E G C E
    let t = t0;
    let end = t0;
    for (const n of notes) {
      end = toneBeep(bus, 'triangle', freq(n), t, 0.07, 0.45);
      t += 0.07;
    }
    return end;
  },

  tick: (bus, t0) => toneBeep(bus, 'square', 1000, t0, 0.03, 0.3),

  horn: (bus, t0) => {
    if (!ctx) return t0;
    const durS = 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1500;
    const gain = ctx.createGain();
    filt.connect(gain);
    gain.connect(bus);
    for (const f of [300, 305]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      osc.connect(filt);
      osc.start(t0);
      osc.stop(t0 + durS + 0.02);
    }
    return envAD(gain.gain, t0, 0.01, durS - 0.01, 0.25);
  },

  powerup: (bus, t0) => {
    const a = sweepOsc(bus, 'sine', 400, 1200, t0, 0.1, 0.005, 0.095, 0.4);
    let t = t0 + 0.1;
    let end = a;
    for (let i = 0; i < 3; i++) {
      end = toneBeep(bus, 'sine', 1600 + i * 200, t, 0.04, 0.3);
      t += 0.04;
    }
    return end;
  },

  freeze: (bus, t0) => {
    const a = noiseBurst(bus, t0, 0.4, 'highpass', 3000, 3000, 0.3);
    const b = toneBeep(bus, 'sine', 2400, t0, 0.4, 0.2);
    return Math.max(a, b);
  },

  uiMove: (bus, t0) => toneBeep(bus, 'sine', 600, t0, 0.04, 0.35),

  uiConfirm: (bus, t0) => {
    toneBeep(bus, 'sine', 600, t0, 0.05, 0.4);
    return toneBeep(bus, 'sine', 900, t0 + 0.05, 0.05, 0.4);
  },
};

/** Plays SFX `name`, panned per `opts.col` (a fractional grid column, centred on 6 - see
 * `panFromCol`), voice-capped at 16 (oldest dropped). No-op until the AudioContext exists. */
export function playSfx(name: SfxName, opts: { col?: number; semitones?: number } = {}): void {
  if (!ctx || !sfxGain) return;
  const pan = panFromCol(opts.col);
  const bus = createVoiceBus(pan);
  if (!bus) return;
  const t0 = ctx.currentTime;
  const end = SFX_BUILDERS[name](bus.input, t0, { pan, semitones: opts.semitones });
  bus.finish(end);
  recordVoice(name);
}

// --- Ambient horn (random road-lane honk while a scene wants it) ---

function scheduleAmbientHorn(): void {
  if (!ambientEnabled || !ctx) return;
  const delayMs = 6000 + Math.random() * 6000;
  ambientTimer = setTimeout(() => {
    if (!ambientEnabled) return;
    playSfx('horn', { col: Math.random() * 12 });
    scheduleAmbientHorn();
  }, delayMs);
}

export function enableAmbientHorn(): void {
  if (ambientEnabled) return;
  ambientEnabled = true;
  if (ctx) scheduleAmbientHorn();
  else onUnlock(scheduleAmbientHorn);
}

export function disableAmbientHorn(): void {
  ambientEnabled = false;
  if (ambientTimer) {
    clearTimeout(ambientTimer);
    ambientTimer = null;
  }
}

// --- GameEvent subscriptions (docs/ARCHITECTURE.md section 9) ---

gameEvents.on('hop', () => playSfx('hop'));

gameEvents.on('bonk', (e) => playSfx('bonk', { col: e.x }));

gameEvents.on('land', (e) => {
  playSfx(e.surface === 'ground' ? 'landGround' : 'landPlatform', { col: e.x });
});

gameEvents.on('death', (e) => {
  const col = e.x;
  if (e.cause === 'drown' || e.cause === 'offscreen') {
    playSfx('splash', { col });
  } else if (e.cause === 'timeout') {
    playSfx('timeout', { col });
  } else {
    // squish, croc, hedge, snake, occupied - table only names squish/croc/hedge explicitly; the
    // remaining two causes are close enough in kind (a solid hit, not a fall) to share the squish
    // sound rather than invent an unspecified one.
    playSfx('squish', { col });
  }
});

gameEvents.on('home', (e) => {
  playSfx(e.bonus ? 'fly' : 'home');
});

gameEvents.on('levelClear', () => playSfx('levelClear'));

gameEvents.on('nearMiss', (e) => playSfx('nearMiss', { semitones: e.combo - 1 }));

gameEvents.on('score', (e) => {
  if (e.label && /^x[2-4]$/.test(e.label)) playSfx('streakUp');
});

gameEvents.on('extraLife', (e) => playSfx('extraLife', { col: e.x }));

gameEvents.on('tick', () => playSfx('tick'));

gameEvents.on('powerup', (e) => playSfx(e.kind === 'freeze' ? 'freeze' : 'powerup'));

// M7: Bubble Shield "pops with a burst" when it cancels a death - reuses the same generic
// power-up chime rather than a new SFX recipe (docs/specs/M7-powerups-scoring.md doesn't call for
// a distinct sound here, and 'powerup' already reads as "a good thing just happened").
gameEvents.on('shieldBroken', (e) => playSfx('powerup', { col: e.x }));

// --- Dev hook (docs/specs/M5-audio.md: "expose window.__rr.audio in dev with setVolumes and a
// list of SFX names so the reviewer can trigger them") ---

export function devHook(): Record<string, unknown> {
  return {
    sfxNames: SFX_NAMES,
    play: (name: SfxName) => playSfx(name),
    setVolumes,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    toggleMute,
    get muted() {
      return isMuted();
    },
    get started() {
      return hasStarted();
    },
    get stats() {
      return getStats();
    },
    get activeVoices() {
      return activeVoices.length;
    },
  };
}

/** Test/dev-only: resets counters and voice tracking so tests/dev sessions don't leak state into
 * each other via this module's singleton (matches the `fx/*.ts` reset() convention). */
export function reset(): void {
  activeVoices.length = 0;
  stats.total = 0;
  for (const k of Object.keys(stats.byName)) delete stats.byName[k];
}
