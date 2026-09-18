// Boots the game: renderer, sprites, input, save, scene manager, then starts the loop with the
// Title scene. See ARCHITECTURE.md section 2 and docs/specs/M0-M2-classic-core.md.

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';

import * as audio from './core/audio';
import * as music from './audio/music';
import { attachInput, setKeyBindings } from './core/input';
import { startLoop, Scenes } from './core/loop';
import { loadSave } from './core/save';
import { setReduceMotion as setHitstopReduceMotion } from './fx/hitstop';
import { setReduceMotion as setShakeReduceMotion } from './fx/shake';
import { setReduceMotion as setTransitionsReduceMotion } from './fx/transitions';
import { createRenderer } from './render/renderer';
import { loadSprites } from './render/sprites';
import { getActiveFocusManager } from './render/ui';
import { TitleScene } from './scenes/title';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game canvas element');
  }

  const save = loadSave();
  // M8 builds the settings UI; for now `reduceMotion` is read once from the save at boot and
  // applied to every fx module that respects it (docs/specs/M4-juice.md section 10).
  setHitstopReduceMotion(save.settings.reduceMotion);
  setShakeReduceMotion(save.settings.reduceMotion);
  setTransitionsReduceMotion(save.settings.reduceMotion);
  // M8: applies any key remap from a previous session (docs/specs/M8-ui-input.md section 2) -
  // `scenes/settings.ts` calls `setKeyBindings` again live whenever the player rebinds a key.
  setKeyBindings(save.settings.keys);

  const atlas = await loadSprites();
  const renderer = createRenderer(canvas, atlas);

  // Fredoka is used for every piece of on-canvas text (HUD, title, cards) from the first frame,
  // so wait for it to be ready rather than risk a fallback-font flash. See ART_BIBLE.md section 8.
  await document.fonts.ready;

  // Web Audio engine: creates the AudioContext lazily on the first user gesture, reads initial
  // volumes/mute from the save, and self-subscribes to GameEvent for every SFX (docs/specs/
  // M5-audio.md). Scenes call `music.play`/`stop` directly (see scenes/title.ts, scenes/play.ts),
  // the same way M4's fx/transitions.ts is called directly by scenes for presentation.
  audio.init(save);
  if (import.meta.env.DEV) {
    const w = window as unknown as { __rr?: Record<string, unknown> };
    // `devHook()` objects use live getters (stats, started, playing, ...) so they read fresh
    // every time the reviewer inspects them - spreading them (`{ ...audio.devHook() }`) would
    // invoke each getter once and freeze the result as a stale snapshot, so attach `music`'s hook
    // as a plain property on audio's instead of merging the two objects.
    const audioHook = audio.devHook() as Record<string, unknown>;
    audioHook.music = music.devHook();
    // M8 spec: "Add window.__rr.ui with the focus manager for testing" - `current` is a live
    // getter (same "live getters, not a one-time snapshot" precedent `audio.devHook()` already
    // set - see docs/specs/M5-report.md) so it always reflects whichever menu scene is on top.
    w.__rr = {
      ...w.__rr,
      audio: audioHook,
      ui: {
        get current() {
          return getActiveFocusManager();
        },
      },
    };
  }

  attachInput(canvas);

  const scenes = new Scenes();
  scenes.push(new TitleScene(scenes, save));

  startLoop(scenes, renderer);
}

void boot();
