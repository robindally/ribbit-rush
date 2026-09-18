import type { Scene, SceneManager } from '../core/loop';
import { gameEvents } from '../core/events';
import type { SaveData } from '../core/save';
import * as particles from '../fx/particles';
import * as popups from '../fx/popups';
import * as shake from '../fx/shake';
import * as transitions from '../fx/transitions';
import { CANVAS_WIDTH, CANVAS_HEIGHT, RIVER_ROWS, ROAD_ROWS, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import { createClassicWorld } from '../game/world';
import type { World } from '../game/world';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { buildStaticLayer, drawHomeSlots, drawStaticLayer } from '../render/draw/background';
import { drawFrog, drawLaneMovers } from '../render/draw/entities';
import { drawHud } from '../render/draw/hud';
import { createBlinkState, tickBlink, type BlinkState } from '../render/anim';
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
  private frogBlink: BlinkState = createBlinkState();
  private lastMultiplier = 1;
  private multiplierPulseT = 1; // >= the pulse window, so it starts settled

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.world = createClassicWorld(1, Date.now());
    this.staticLayer = this.buildStaticLayerForCurrentLevel();
    particles.setPalette(getWorldTheme(this.world.level.world).palette);
    if (import.meta.env.DEV) {
      // Dev-only hook so reviewers and bots can inspect the running world, scene stack, and fx
      // state (docs/specs/M4-juice.md: "expose fx on it: window.__rr.fx with the particle
      // count").
      (window as unknown as { __rr?: unknown }).__rr = {
        world: this.world,
        scenes: this.scenes,
        fx: {
          get particles() {
            return particles.getActiveCount();
          },
          get popups() {
            return popups.getCount();
          },
          stress: particles.stressFill,
        },
      };
    }
  }

  enter(): void {
    this.unsubscribe = gameEvents.onAny((e) => {
      if (e.type === 'gameOver') {
        const frog = this.world.frog;
        transitions.play(
          () => this.scenes.replace(new GameOverScene(this.scenes, this.save, e.score)),
          (frog.x + 0.5) * TILE,
          frog.row * TILE + TILE / 2,
        );
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
    tickBlink(this.frogBlink, dt);

    particles.setPalette(getWorldTheme(this.world.level.world).palette);
    particles.update(dt);
    shake.update(dt);
    popups.update(dt);
    transitions.update(dt);

    if (this.world.streak.multiplier !== this.lastMultiplier) {
      this.lastMultiplier = this.world.streak.multiplier;
      this.multiplierPulseT = 0;
    } else {
      this.multiplierPulseT += dt;
    }

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

  render(r: Renderer, alpha: number): void {
    const world = this.world;
    if (this.staticLayerLevel !== world.levelNumber) {
      this.staticLayer = this.buildStaticLayerForCurrentLevel();
    }
    const theme = getWorldTheme(world.level.world);

    r.ctx.fillStyle = '#0c0d1a';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Shake + camera punch wrap the play layers only, never the HUD (docs/specs/M4-juice.md
    // sections 2 and 9).
    shake.applyCamera(r.ctx, CANVAS_WIDTH, CANVAS_HEIGHT, world.elapsed);

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

    drawFrog(r, world.frog, world.elapsed, this.frogBlink.blinking);

    particles.render(r, alpha);
    popups.render(r);

    shake.restoreCamera(r.ctx);

    drawHud(r, {
      score: world.score,
      hiScore: Math.max(this.save.hiScore, world.score),
      level: world.levelNumber,
      worldName: theme.name,
      lives: world.lives,
      timeLeft: world.timeLeft,
      timeLimit: world.level.timeLimit,
      elapsed: world.elapsed,
      multiplier: world.streak.multiplier,
      multiplierPulseT: this.multiplierPulseT,
    });

    transitions.render(r);
  }
}
