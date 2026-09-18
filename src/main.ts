// Boots the game: renderer, sprites, input, save, scene manager, then starts the loop with the
// Title scene. See ARCHITECTURE.md section 2 and docs/specs/M0-M2-classic-core.md.

import '@fontsource/fredoka';

import { createAudioEngine } from './core/audio';
import { attachInput } from './core/input';
import { startLoop, Scenes } from './core/loop';
import { loadSave } from './core/save';
import { createRenderer } from './render/renderer';
import { loadSprites } from './render/sprites';
import { TitleScene } from './scenes/title';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game canvas element');
  }

  const save = loadSave();
  const atlas = await loadSprites();
  const renderer = createRenderer(canvas, atlas);

  // Audio is a no-op stub until M5; created here so future milestones only need to wire it up.
  createAudioEngine();

  attachInput(canvas);

  const scenes = new Scenes();
  scenes.push(new TitleScene(scenes, save));

  startLoop(scenes, renderer);
}

void boot();
