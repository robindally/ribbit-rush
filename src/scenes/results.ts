// Results (level clear) screen (M8 spec section 1): the time bonus counts up with ticks, homes
// filled shown as five pads lighting, "Next" continues; on a world change it shows the next
// world's name and a palette swatch with a 1s reveal. Pushed by PlayScene the instant
// `World.resolveHomeLanding` clears the last home slot and internally advances to the next level
// (see `scenes/play.ts`'s `pendingResults` capture for why the "old" theme has to be grabbed
// *inside* the `levelClear` event handler, before `loadNextLevel()` runs) - `world` is the same
// live `World` PlayScene owns, so by the time this scene is dismissed it already reflects the new
// level, and pushes the usual `LevelIntroScene` for it (same card every other level start shows).

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import * as transitions from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TILE } from '../game/constants';
import type { SkinDef } from '../game/skins';
import { getWorldTheme, type WorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import type { World } from '../game/world';
import type { Renderer } from '../render/renderer';
import {
  drawButton,
  drawCard,
  FocusManager,
  INK,
  pushActiveFocusManager,
  popActiveFocusManager,
  type Rect,
} from '../render/ui';
import { LevelIntroScene } from './levelIntro';
import type { PlayScene } from './play';

type Phase = 'counting' | 'worldReveal' | 'ready';

const COUNT_DURATION_S = 1.1;
const REVEAL_DURATION_S = 1.0;
const PAD_COUNT = 5;

function cardRect(): { w: number; h: number; x: number; y: number } {
  const w = CANVAS_WIDTH * 0.76;
  const h = CANVAS_HEIGHT * 0.58;
  return { w, h, x: (CANVAS_WIDTH - w) / 2, y: (CANVAS_HEIGHT - h) / 2 };
}

export class ResultsScene implements Scene {
  private phase: Phase = 'counting';
  private t = 0;
  private counterValue = 0;
  private padsLit = 0;
  private worldChanged: boolean;
  private focus = new FocusManager();
  private nextRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /** M9: skins newly unlocked by clearing this level (docs/specs/M9-endless-skins.md section 2:
   * "unlock toasts on those cards") - computed once in `enter()` via `PlayScene.bankProgress()`. */
  private newlyUnlockedSkins: SkinDef[] = [];

  constructor(
    private scenes: SceneManager,
    private under: PlayScene,
    private world: World,
    private clearedLevel: number,
    private oldWorldTheme: WorldTheme,
    private timeBonusTotal: number,
  ) {
    this.worldChanged = oldWorldTheme.id !== world.level.world;
  }

  enter(): void {
    const canvas = document.getElementById('game');
    const { w, h, x, y } = cardRect();
    this.nextRect = { x: x + w / 2 - 90, y: y + h - 66, w: 180, h: 44 };
    this.focus.add({
      id: 'next',
      kind: 'button',
      rect: this.nextRect,
      onActivate: () => this.advance(),
    });
    this.focus.focus('next');
    if (canvas instanceof HTMLCanvasElement) this.focus.attach(canvas);
    pushActiveFocusManager(this.focus);
    // M9: unlock checks run at Results (docs/specs/M9-endless-skins.md section 2) - `bestLevel`
    // is already the level just cleared's *next* level by this point (World.loadNextLevel already
    // ran, synchronously, before this scene was even pushed - see scenes/play.ts's own doc comment
    // on PendingResults), so a "clear world W" skin unlocks the instant its world's last level
    // clears, not only at Game Over.
    this.newlyUnlockedSkins = this.under.bankProgress();
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  /** M8 spec section 6: "reduce motion honoured everywhere" - this screen's count-up/pad-stagger
   * and world reveal aren't routed through any `fx/` module (nothing else here needs slow motion,
   * a camera shake, or an iris wipe), so they read `fx/transitions.ts`'s own reduce-motion flag
   * directly and just run faster rather than skip the animation outright - still shows the count
   * and the reveal, just without asking a motion-sensitive player to sit through a full second of
   * movement for either. */
  private countDurationS(): number {
    return transitions.isReduceMotion() ? COUNT_DURATION_S * 0.25 : COUNT_DURATION_S;
  }

  private revealDurationS(): number {
    return transitions.isReduceMotion() ? REVEAL_DURATION_S * 0.25 : REVEAL_DURATION_S;
  }

  update(dt: number): void {
    transitions.update(dt);
    this.t += dt;

    if (this.phase === 'counting') {
      const progress = Math.min(1, this.t / this.countDurationS());
      this.counterValue = Math.round(this.timeBonusTotal * progress);
      const litTarget = Math.floor(progress * PAD_COUNT);
      if (litTarget > this.padsLit) {
        this.padsLit = litTarget;
        audio.playSfx('tick');
      }
      if (progress >= 1) {
        this.counterValue = this.timeBonusTotal;
        this.padsLit = PAD_COUNT;
        this.phase = this.worldChanged ? 'worldReveal' : 'ready';
        this.t = 0;
      }
    } else if (this.phase === 'worldReveal') {
      if (this.t >= this.revealDurationS()) {
        this.phase = 'ready';
        this.t = 0;
      }
    }
  }

  /** Any input skips straight to the end of whatever animation is currently playing (matching
   * `LevelIntroScene`'s own "any input dismisses" precedent, and keeping the reviewer's playbot -
   * which only ever sends hop actions - able to get through this screen); once the animation has
   * fully played out, any input instead advances to the next level's intro card. */
  private advance(): void {
    if (this.phase === 'counting') {
      this.counterValue = this.timeBonusTotal;
      this.padsLit = PAD_COUNT;
      // Let the world-change reveal (if any) still show for a beat rather than vanish instantly -
      // a second input finishes that too.
      this.phase = this.worldChanged ? 'worldReveal' : 'ready';
      this.t = 0;
      return;
    }
    if (this.phase === 'worldReveal') {
      this.phase = 'ready';
      this.t = 0;
      return;
    }
    this.next();
  }

  private next(): void {
    audio.playSfx('uiConfirm');
    this.scenes.pop();
    this.scenes.push(
      new LevelIntroScene(this.scenes, this.under, this.world.level, this.world.levelNumber),
    );
  }

  render(r: Renderer, alpha: number): void {
    this.under.render(r, alpha);

    r.ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const { w, h, x, y } = cardRect();
    drawCard(r, { x, y, w, h }, this.oldWorldTheme.palette.accentA);

    r.text(`LEVEL ${this.clearedLevel} CLEAR!`, CANVAS_WIDTH / 2, y + h * 0.16, {
      size: 24,
      weight: 700,
      align: 'center',
      color: INK,
    });

    // Five pads lighting, left to right.
    const padSpacing = TILE * 1.05;
    const padY = y + h * 0.34;
    const startX = CANVAS_WIDTH / 2 - (padSpacing * (PAD_COUNT - 1)) / 2;
    for (let i = 0; i < PAD_COUNT; i++) {
      const lit = i < this.padsLit;
      const cx = startX + i * padSpacing;
      r.ctx.save();
      if (lit) {
        r.ctx.shadowColor = this.oldWorldTheme.palette.accentA;
        r.ctx.shadowBlur = 12;
      } else {
        r.ctx.globalAlpha = 0.35;
      }
      r.sprite('lilypad', cx, padY, { sx: lit ? 1.1 : 0.9, sy: lit ? 1.1 : 0.9 });
      r.ctx.restore();
    }

    r.text('TIME BONUS', CANVAS_WIDTH / 2, y + h * 0.5, {
      size: 13,
      weight: 600,
      align: 'center',
      color: INK,
    });
    r.text(`+${this.counterValue}`, CANVAS_WIDTH / 2, y + h * 0.6, {
      size: 30,
      weight: 700,
      align: 'center',
      color: this.oldWorldTheme.palette.accentB,
    });

    if (this.newlyUnlockedSkins.length > 0) {
      const names = this.newlyUnlockedSkins.map((s) => s.name).join(', ');
      r.text(`New skin unlocked: ${names}!`, CANVAS_WIDTH / 2, y + h - 78, {
        size: 12,
        weight: 700,
        align: 'center',
        color: this.oldWorldTheme.palette.accentB,
      });
    }

    if (this.worldChanged && this.phase !== 'counting') {
      const revealAlpha =
        this.phase === 'worldReveal' ? Math.min(1, this.t / this.revealDurationS()) : 1;
      const nextTheme = getWorldTheme(this.world.level.world);
      r.ctx.save();
      r.ctx.globalAlpha = revealAlpha;
      r.text(`NEXT WORLD: ${nextTheme.name.toUpperCase()}`, CANVAS_WIDTH / 2, y + h * 0.71, {
        size: 15,
        weight: 700,
        align: 'center',
        color: INK,
      });
      r.ctx.fillStyle = nextTheme.palette.accentA;
      r.ctx.beginPath();
      r.ctx.arc(CANVAS_WIDTH / 2, y + h * 0.78, 10, 0, Math.PI * 2);
      r.ctx.fill();
      r.ctx.restore();
    }

    drawButton(
      r,
      this.nextRect,
      this.phase === 'ready' ? 'NEXT' : 'SKIP',
      {
        hover: this.focus.isHovered('next'),
        pressed: this.focus.isPressed('next'),
        focused: this.focus.isFocused('next'),
      },
      { accent: this.oldWorldTheme.palette.accentA },
    );

    transitions.render(r);
  }

  onAction(_a: InputAction): void {
    if (transitions.isActive()) return;
    this.advance();
  }
}
