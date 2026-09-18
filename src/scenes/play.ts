import type { Scene, SceneManager } from '../core/loop';
import { gameEvents } from '../core/events';
import type { SaveData } from '../core/save';
import { CANVAS_WIDTH, CANVAS_HEIGHT, RIVER_ROWS, ROAD_ROWS, START_ROW } from '../game/constants';
import { createClassicWorld } from '../game/world';
import type { World } from '../game/world';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { drawBank, drawHomeRow, drawMedian } from '../render/draw/background';
import { drawFrog, drawLaneMovers } from '../render/draw/entities';
import { drawHud } from '../render/draw/hud';
import { drawRoadRow } from '../render/draw/road';
import { drawWaterRow } from '../render/draw/water';
import { GameOverScene } from './gameOver';
import { PauseScene } from './pause';

export class PlayScene implements Scene {
  private world: World;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.world = createClassicWorld(1, Date.now());
    if (import.meta.env.DEV) {
      // Dev-only hook so reviewers and bots can inspect the running world.
      (window as unknown as { __rr?: unknown }).__rr = { world: this.world };
    }
  }

  enter(): void {
    this.unsubscribe = gameEvents.onAny((e) => {
      if (e.type === 'gameOver') {
        this.scenes.replace(new GameOverScene(this.scenes, this.save, e.score));
      }
    });
  }

  exit(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  update(dt: number): void {
    this.world.update(dt);
    if (this.world.score > this.save.hiScore) this.save.hiScore = this.world.score;
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

    r.ctx.fillStyle = '#0c0d1a';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBank(r, START_ROW);
    for (const row of RIVER_ROWS) drawWaterRow(r, row);
    drawMedian(r);
    for (const row of ROAD_ROWS) drawRoadRow(r, row);
    drawHomeRow(r, world.homes);

    // Movers: river rows first, then road rows (ARCHITECTURE.md section 11).
    for (const row of RIVER_ROWS) {
      const lane = world.laneAt(row);
      if (lane) drawLaneMovers(r, lane, world.elapsed);
    }
    for (const row of ROAD_ROWS) {
      const lane = world.laneAt(row);
      if (lane) drawLaneMovers(r, lane, world.elapsed);
    }

    drawFrog(r, world.frog);

    drawHud(r, {
      score: world.score,
      hiScore: Math.max(this.save.hiScore, world.score),
      level: world.levelNumber,
      lives: world.lives,
      timeLeft: world.timeLeft,
      timeLimit: world.level.timeLimit,
    });
  }
}
