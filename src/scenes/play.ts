import type { Scene, SceneManager } from '../core/loop';
import { gameEvents } from '../core/events';
import type { SaveData } from '../core/save';
import { CANVAS_WIDTH, CANVAS_HEIGHT, RIVER_ROWS, ROAD_ROWS } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import { createClassicWorld } from '../game/world';
import type { World } from '../game/world';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { buildStaticLayer, drawHomeSlots, drawStaticLayer } from '../render/draw/background';
import { drawFrog, drawLaneMovers } from '../render/draw/entities';
import { drawHud } from '../render/draw/hud';
import { drawPlatformContactShadows, drawWaterAnimated } from '../render/draw/water';
import { GameOverScene } from './gameOver';
import { PauseScene } from './pause';

// A home-landing animation stays visible (icon pulse + lily-pad ring, ART_BIBLE.md section 5) for
// at most this long; entries older than this are pruned each frame.
const HOME_ANIM_MAX_S = 0.5;

export class PlayScene implements Scene {
  private world: World;
  private unsubscribe: (() => void) | null = null;
  private staticLayer: HTMLCanvasElement;
  private staticLayerLevel = -1;
  private homeAnims = new Map<number, number>();

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.world = createClassicWorld(1, Date.now());
    this.staticLayer = this.buildStaticLayerForCurrentLevel();
    if (import.meta.env.DEV) {
      // Dev-only hook so reviewers and bots can inspect the running world and scene stack.
      (window as unknown as { __rr?: unknown }).__rr = { world: this.world, scenes: this.scenes };
    }
  }

  enter(): void {
    this.unsubscribe = gameEvents.onAny((e) => {
      if (e.type === 'gameOver') {
        this.scenes.replace(new GameOverScene(this.scenes, this.save, e.score));
      } else if (e.type === 'home') {
        this.homeAnims.set(e.slot, 0);
      } else if (e.type === 'levelClear') {
        this.homeAnims.clear();
      }
    });
  }

  exit(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private buildStaticLayerForCurrentLevel(): HTMLCanvasElement {
    this.staticLayerLevel = this.world.levelNumber;
    const theme = getWorldTheme(this.world.level.world);
    return buildStaticLayer(theme, this.world.levelNumber);
  }

  update(dt: number): void {
    this.world.update(dt);
    if (this.world.score > this.save.hiScore) this.save.hiScore = this.world.score;

    for (const [slot, t] of this.homeAnims) {
      const next = t + dt;
      if (next > HOME_ANIM_MAX_S) this.homeAnims.delete(slot);
      else this.homeAnims.set(slot, next);
    }
  }

  onAction(a: InputAction): void {
    if (a.type === 'hop') {
      this.world.queueHop(a.dir);
    } else if (a.type === 'pause') {
      this.scenes.push(new PauseScene(this.scenes, this));
    }
  }

  render(r: Renderer, _alpha: number): void {
    const world = this.world;
    if (this.staticLayerLevel !== world.levelNumber) {
      this.staticLayer = this.buildStaticLayerForCurrentLevel();
    }
    const theme = getWorldTheme(world.level.world);

    r.ctx.fillStyle = '#0c0d1a';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawStaticLayer(r, this.staticLayer);
    drawHomeSlots(r, world.homes, this.homeAnims);

    // River rows: animated water (bands + specular) and platform contact shadows under the
    // movers, then the movers themselves. Road rows after (ARCHITECTURE.md section 11).
    for (const row of RIVER_ROWS) {
      const lane = world.laneAt(row);
      if (!lane) continue;
      drawWaterAnimated(r, lane, theme, world.elapsed);
      drawPlatformContactShadows(r, lane, theme, world.elapsed);
      drawLaneMovers(r, lane, world.elapsed);
    }
    for (const row of ROAD_ROWS) {
      const lane = world.laneAt(row);
      if (lane) drawLaneMovers(r, lane, world.elapsed);
    }

    drawFrog(r, world.frog, world.elapsed);

    drawHud(r, {
      score: world.score,
      hiScore: Math.max(this.save.hiScore, world.score),
      level: world.levelNumber,
      worldName: theme.name,
      lives: world.lives,
      timeLeft: world.timeLeft,
      timeLimit: world.level.timeLimit,
      elapsed: world.elapsed,
    });
  }
}
