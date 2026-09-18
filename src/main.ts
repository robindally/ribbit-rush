// Boots the game: renderer, sprites, input, save, scene manager, then starts the loop with the
// Title scene. See ARCHITECTURE.md section 2 and docs/specs/M0-M2-classic-core.md.

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';

import * as audio from './core/audio';
import * as music from './audio/music';
import { attachInput, setKeyBindings } from './core/input';
import { startLoop, Scenes } from './core/loop';
import { loadSave, writeSave } from './core/save';
import { setReduceMotion as setHitstopReduceMotion } from './fx/hitstop';
import { setReduceMotion as setShakeReduceMotion } from './fx/shake';
import { setReduceMotion as setTransitionsReduceMotion } from './fx/transitions';
import { SKINS } from './game/skins';
import { createRenderer } from './render/renderer';
import { applySkin } from './render/skinSprites';
import { loadSprites } from './render/sprites';
import { getActiveFocusManager } from './render/ui';
import { PlayScene } from './scenes/play';
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

  // M9: recolours the frog sprites to whichever skin was last selected (docs/specs/
  // M9-endless-skins.md section 2: "selection persists in save") *before* the Title's own first
  // render - a no-op for the default 'classic' skin (`game/skins.ts`'s `recolorFrogSvg` short-
  // circuits it), so this costs nothing for the common case.
  await applySkin(save.selectedSkin);

  attachInput(canvas);

  const scenes = new Scenes();
  scenes.push(new TitleScene(scenes, save));

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
      // M9 spec: "add window.__rr.endless (start(d), and the current d)" - `start` jumps straight
      // into a fresh Endless run at difficulty `d` from any scene (Title, mid-game, Game Over...),
      // the same way `jumpToLevel` already lets the reviewer force campaign state; `d` reads back
      // whichever `World` is currently live via `window.__rr.world` (set by `PlayScene`'s own dev
      // hook), so it's `null` outside of an active Endless run rather than stale.
      endless: {
        start: (d = 1.2) => {
          scenes.replace(new PlayScene(scenes, save, { startDifficulty: d, seed: Date.now() }));
        },
        get d() {
          const rr = (window as unknown as { __rr?: { world?: { mode?: string; difficulty?: number } } })
            .__rr;
          return rr?.world?.mode === 'endless' ? (rr.world.difficulty ?? null) : null;
        },
      },
      // M9 spec: "add ... window.__rr.skins (unlockAll, select(name))" - `unlockAll` forces every
      // lifetime stat a skin's unlock could ever check past its own threshold (never lowers one
      // that's already higher); `select` both persists the choice and re-skins the live sprites
      // immediately, the same call the Title's own picker makes.
      skins: {
        names: SKINS.map((s) => s.id),
        unlockAll: () => {
          save.bestLevel = Math.max(save.bestLevel, 15);
          save.hiScore = Math.max(save.hiScore, 50000);
          save.lifetimeHomesFilled = Math.max(save.lifetimeHomesFilled, 25);
          save.bestNearMissesInRun = Math.max(save.bestNearMissesInRun, 15);
          writeSave(save);
        },
        select: (name: string) => {
          save.selectedSkin = name;
          writeSave(save);
          void applySkin(name);
        },
      },
    };
  }

  startLoop(scenes, renderer);
}

void boot();
