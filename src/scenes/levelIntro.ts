// Level intro card: world name, "Level N", and up to four hazard icons for the new things in this
// level, shown 1.2s or until input. Simple version now - M8 polishes (docs/specs/M6-worlds.md
// section 7). Renders the Play scene beneath it (frozen, like PauseScene) plus a dim overlay and a
// cream card, matching ART_BIBLE.md section 8's "Cards" ("Rounded 24px panel in cream at 96%
// alpha, ink text, world accent stripe along the top").

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction, LevelDef } from '../game/types';
import { roundRect } from '../render/draw/background';
import type { Renderer } from '../render/renderer';

const CREAM = '#FFF7E6';
const INK = '#1B2A1D';
const INTRO_DURATION_S = 1.2;

/** Up to four icons per level for "the new things in this level" - one sprite name per entry in
 * each level's own docs/LEVELS.md difficulty-spine "New thing" column. Levels not listed (there
 * are none past 15 today) fall back to no icons. */
const NEW_THING_ICONS: Record<number, string[]> = {
  1: [],
  2: ['turtle'],
  3: ['motorbike'],
  4: ['jetski'],
  5: ['motorbike'],
  6: ['log-mid'],
  7: ['tram', 'oil'],
  8: ['oil', 'taxi'],
  9: ['turtle'],
  10: ['snake'],
  11: ['otter'],
  12: ['snake'],
  13: ['floe-2', 'train-engine'],
  14: ['floe-2'],
  15: ['train-engine', 'motorbike', 'snake', 'oil'],
};

export class LevelIntroScene implements Scene {
  private t = 0;
  private dismissed = false;

  constructor(
    private scenes: SceneManager,
    private under: Scene,
    private level: LevelDef,
    private levelNumber: number,
  ) {}

  update(dt: number): void {
    // Frozen underneath, like PauseScene - the timer/traffic shouldn't run while the card is up.
    // Still drives fx/transitions.ts (M7 fix-up): PlayScene.enter() can push this card while the
    // Title -> Play iris is still mid-"opening" (the card can appear within the same frame the
    // level starts), and this module - unlike every scene that calls `transitions.render` - never
    // advanced it, freezing the transition's own timer until the card popped back to PlayScene,
    // where the leftover animation would then visibly resume on top of real gameplay. Since a
    // transition can only ever be closing *into* a scene swap that already happened by the time
    // any card exists, this always reads as the 'opening' phase finishing out, never a fresh wipe.
    this.t += dt;
    if (this.t >= INTRO_DURATION_S) this.dismiss();
    transitions.update(dt);
  }

  render(r: Renderer, alpha: number): void {
    // `this.under` is always PlayScene, whose own render() already ends with
    // `transitions.render(r)` - delegating here (rather than also calling it directly) avoids
    // drawing the transition mask twice in the same frame.
    this.under.render(r, alpha);

    r.ctx.fillStyle = 'rgba(10, 10, 20, 0.55)';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(this.level.world);
    const w = CANVAS_WIDTH * 0.74;
    const h = CANVAS_HEIGHT * 0.3;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;

    r.ctx.save();
    r.ctx.globalAlpha = 0.96;
    r.ctx.fillStyle = CREAM;
    roundRect(r, x, y, w, h, 24);
    r.ctx.restore();

    r.ctx.save();
    roundRect(r, x, y, w, 10, 10);
    r.ctx.fillStyle = theme.palette.accentA;
    r.ctx.fill();
    r.ctx.restore();

    r.text(theme.name.toUpperCase(), CANVAS_WIDTH / 2, y + h * 0.32, {
      size: 22,
      weight: 700,
      align: 'center',
      color: INK,
    });
    r.text(`LEVEL ${this.levelNumber}`, CANVAS_WIDTH / 2, y + h * 0.56, {
      size: 30,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const icons = NEW_THING_ICONS[this.levelNumber] ?? [];
    if (icons.length > 0) {
      const spacing = TILE * 0.9;
      const startX = CANVAS_WIDTH / 2 - ((icons.length - 1) * spacing) / 2;
      const iconY = y + h * 0.8;
      icons.forEach((name, i) => {
        r.sprite(name, startX + i * spacing, iconY);
      });
    }
  }

  onAction(_a: InputAction): void {
    this.dismiss();
  }

  private dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    audio.playSfx('uiConfirm');
    this.scenes.pop();
  }
}
