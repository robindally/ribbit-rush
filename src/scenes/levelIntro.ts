// Level intro card: world name, "Level N", and up to four hazard icons for the new things in this
// level, shown 1.2s or until input. Simple version now - M8 polishes (docs/specs/M6-worlds.md
// section 7). Renders the Play scene beneath it (frozen, like PauseScene) plus a dim overlay and a
// cream card, matching ART_BIBLE.md section 8's "Cards" ("Rounded 24px panel in cream at 96%
// alpha, ink text, world accent stripe along the top").

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { popInputOwner, pushInputOwner } from '../core/input';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction, LevelDef } from '../game/types';
import { drawCard, INK } from '../render/ui';
import type { Renderer } from '../render/renderer';

const INTRO_DURATION_S = 1.2;

/** Up to four icons per level for "the new things in this level," each with a short label (M8
 * spec section 1: "hazard icons with labels") - one entry per level's own docs/LEVELS.md
 * difficulty-spine "New thing" column. Levels not listed (there are none past 15 today) fall back
 * to no icons. */
const NEW_THING_ICONS: Record<number, { sprite: string; label: string }[]> = {
  1: [],
  2: [{ sprite: 'turtle', label: 'Turtles' }],
  3: [{ sprite: 'motorbike', label: 'Motorbike' }],
  4: [{ sprite: 'jetski', label: 'Jet ski' }],
  5: [{ sprite: 'motorbike', label: 'Motorbike' }],
  6: [{ sprite: 'log-mid', label: 'Shorter logs' }],
  7: [
    { sprite: 'tram', label: 'Tram' },
    { sprite: 'oil', label: 'Oil slick' },
  ],
  8: [
    { sprite: 'oil', label: 'Oil slick' },
    { sprite: 'taxi', label: 'Taxis' },
  ],
  9: [{ sprite: 'turtle', label: 'Diving turtles' }],
  10: [{ sprite: 'snake', label: 'Snake' }],
  11: [{ sprite: 'otter', label: 'Otter' }],
  12: [{ sprite: 'snake', label: 'Snakes' }],
  13: [
    { sprite: 'floe-2', label: 'Ice floes' },
    { sprite: 'train-engine', label: 'Train' },
  ],
  14: [{ sprite: 'floe-2', label: 'Ice floes' }],
  15: [
    { sprite: 'train-engine', label: 'Train' },
    { sprite: 'motorbike', label: 'Motorbike' },
    { sprite: 'snake', label: 'Snake' },
    { sprite: 'oil', label: 'Oil slick' },
  ],
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

  enter(): void {
    // Purely to keep PlayScene's on-screen d-pad/pause button (raw canvas listeners, never
    // un-registered just because they're covered - see core/input.ts's `pushInputOwner` doc
    // comment) silent while this card is up; this scene has no pointer controls of its own.
    pushInputOwner(this);
  }

  exit(): void {
    popInputOwner(this);
  }

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
    const w = CANVAS_WIDTH * 0.76;
    const h = CANVAS_HEIGHT * 0.36;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentA);

    r.text(theme.name.toUpperCase(), CANVAS_WIDTH / 2, y + h * 0.26, {
      size: 20,
      weight: 700,
      align: 'center',
      color: INK,
    });
    r.text(`LEVEL ${this.levelNumber}`, CANVAS_WIDTH / 2, y + h * 0.46, {
      size: 28,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const icons = NEW_THING_ICONS[this.levelNumber] ?? [];
    if (icons.length > 0) {
      const spacing = TILE * 1.1;
      const startX = CANVAS_WIDTH / 2 - ((icons.length - 1) * spacing) / 2;
      const iconY = y + h * 0.66;
      icons.forEach(({ sprite, label }, i) => {
        const cx = startX + i * spacing;
        r.sprite(sprite, cx, iconY);
        r.text(label, cx, iconY + TILE * 0.62, { size: 10, weight: 600, align: 'center', color: INK });
      });
    }

    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.t * Math.PI * 2));
    r.ctx.save();
    r.ctx.globalAlpha = pulse;
    r.text('TAP OR PRESS TO GO!', CANVAS_WIDTH / 2, y + h * 0.92, {
      size: 13,
      weight: 700,
      align: 'center',
      color: theme.palette.accentB,
    });
    r.ctx.restore();
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
