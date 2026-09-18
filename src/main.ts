// Boots the game: renderer, sprites, input, save, scene manager, then starts the loop with the
// Title scene. See ARCHITECTURE.md section 2 and docs/specs/M0-M2-classic-core.md.

import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';

import { createAudioEngine } from './core/audio';
import { attachInput } from './core/input';
import { startLoop, Scenes } from './core/loop';
import { loadSave } from './core/save';
import { setReduceMotion as setHitstopReduceMotion } from './fx/hitstop';
import { setReduceMotion as setShakeReduceMotion } from './fx/shake';
import { setReduceMotion as setTransitionsReduceMotion } from './fx/transitions';
import { createRenderer } from './render/renderer';
import { loadSprites } from './render/sprites';
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

  const atlas = await loadSprites();
  const renderer = createRenderer(canvas, atlas);

  // Fredoka is used for every piece of on-canvas text (HUD, title, cards) from the first frame,
  // so wait for it to be ready rather than risk a fallback-font flash. See ART_BIBLE.md section 8.
  await document.fonts.ready;

  // Audio is a no-op stub until M5; created here so future milestones only need to wire it up.
  createAudioEngine();

  attachInput(canvas);

  const scenes = new Scenes();
  scenes.push(new TitleScene(scenes, save));

  startLoop(scenes, renderer);
}

void boot();
