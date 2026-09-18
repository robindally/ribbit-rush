import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { gameEvents } from '../core/events';
import type { SaveData } from '../core/save';
import * as music from '../audio/music';
import * as particles from '../fx/particles';
import * as popups from '../fx/popups';
import * as shake from '../fx/shake';
import * as transitions from '../fx/transitions';
import { CANVAS_WIDTH, CANVAS_HEIGHT, RIVER_ROWS, ROAD_ROWS, TILE } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import { createCampaignWorld } from '../game/world';
import type { World } from '../game/world';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import { buildStaticLayer, drawHomeSlots, drawStaticLayer } from '../render/draw/background';
import { drawFrog, drawLaneMovers, drawRailSignals } from '../render/draw/entities';
import { drawAudioHint, drawHud } from '../render/draw/hud';
import { drawLighting } from '../render/draw/lighting';
import { drawWeather, updateWeather } from '../render/draw/weather';
import { createBlinkState, tickBlink, type BlinkState } from '../render/anim';
import { drawPlatformContactShadows, drawWaterAnimated } from '../render/draw/water';
import { GameOverScene } from './gameOver';
import { LevelIntroScene } from './levelIntro';
import { PauseScene } from './pause';

// A home-landing animation stays visible (icon pulse + lily-pad ring, ART_BIBLE.md section 5) for
// at most this long; entries older than this are pruned each frame.
const HOME_ANIM_MAX_S = 0.5;
// Dev-only "L" then up to two digits level jump (docs/specs/M6-worlds.md section 6). If the
// second digit doesn't arrive within this window, the single digit typed so far commits.
const LEVEL_JUMP_COMMIT_MS = 900;

export class PlayScene implements Scene {
  private world: World;
  private unsubscribe: (() => void) | null = null;
  private staticLayer: HTMLCanvasElement;
  private staticLayerLevel = -1;
  private homeAnims = new Map<number, number>();
  private frogBlink: BlinkState = createBlinkState();
  private lastMultiplier = 1;
  private multiplierPulseT = 1; // >= the pulse window, so it starts settled
  private lastMusicWorld: 1 | 2 | 3 | 4 | 5 | null = null;
  private introShownForLevel = -1;
  private levelJumpBuffer: string | null = null;
  private levelJumpTimer: ReturnType<typeof setTimeout> | null = null;
  private onLevelJumpKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.world = createCampaignWorld(1, Date.now());
    this.staticLayer = this.buildStaticLayerForCurrentLevel();
    particles.setPalette(getWorldTheme(this.world.level.world).palette);
    if (import.meta.env.DEV) {
      // Dev-only hook so reviewers and bots can inspect the running world, scene stack, and fx
      // state (docs/specs/M4-juice.md: "expose fx on it: window.__rr.fx with the particle
      // count"). Merged onto any existing window.__rr (audio's dev hook is installed once at boot
      // by main.ts, docs/specs/M5-audio.md) rather than replacing it wholesale.
      const w = window as unknown as { __rr?: Record<string, unknown> };
      w.__rr = {
        ...w.__rr,
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
        // docs/specs/M6-worlds.md: "add window.__rr.jumpToLevel(n) in DEV so the reviewer's
        // harness (scripts/review.mjs --level N) can start at any level."
        jumpToLevel: (n: number) => this.world.jumpToLevel(n),
      };
    }
  }

  enter(): void {
    this.lastMusicWorld = this.world.level.world;
    music.play(this.world.level.world);
    audio.enableAmbientHorn();
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
    if (import.meta.env.DEV) this.attachLevelJumpKey();
    // Show the level intro card immediately (docs/specs/M6-worlds.md section 7) rather than
    // waiting a frame for `update()` to notice the level number - avoids a one-frame flash of
    // interactive play before the card appears.
    this.introShownForLevel = this.world.levelNumber;
    this.scenes.push(
      new LevelIntroScene(this.scenes, this, this.world.level, this.world.levelNumber),
    );
  }

  exit(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    audio.disableAmbientHorn();
    this.detachLevelJumpKey();
  }

  /** Dev-only: `L` starts collecting digits, up to two, committing (via `world.jumpToLevel`) once
   * two digits arrive or `LEVEL_JUMP_COMMIT_MS` passes since the last one - see
   * docs/specs/M6-worlds.md section 6. Not a gameplay `InputAction` (ARCHITECTURE.md section 5
   * fixes that union), same precedent as `core/audio.ts`'s raw `M` mute-toggle listener. */
  private attachLevelJumpKey(): void {
    this.onLevelJumpKey = (e: KeyboardEvent): void => {
      if (this.levelJumpBuffer === null) {
        if (e.code === 'KeyL' || e.key === 'l' || e.key === 'L') this.levelJumpBuffer = '';
        return;
      }
      const digit = /^Digit(\d)$/.exec(e.code)?.[1] ?? (/^\d$/.test(e.key) ? e.key : null);
      if (digit === null) {
        if (e.code === 'Escape') this.levelJumpBuffer = null;
        return;
      }
      this.levelJumpBuffer += digit;
      if (this.levelJumpTimer) clearTimeout(this.levelJumpTimer);
      if (this.levelJumpBuffer.length >= 2) {
        this.commitLevelJump();
      } else {
        this.levelJumpTimer = setTimeout(() => this.commitLevelJump(), LEVEL_JUMP_COMMIT_MS);
      }
    };
    window.addEventListener('keydown', this.onLevelJumpKey);
  }

  private detachLevelJumpKey(): void {
    if (this.onLevelJumpKey) window.removeEventListener('keydown', this.onLevelJumpKey);
    this.onLevelJumpKey = null;
    if (this.levelJumpTimer) clearTimeout(this.levelJumpTimer);
    this.levelJumpTimer = null;
    this.levelJumpBuffer = null;
  }

  private commitLevelJump(): void {
    const n = this.levelJumpBuffer ? parseInt(this.levelJumpBuffer, 10) : NaN;
    this.levelJumpBuffer = null;
    this.levelJumpTimer = null;
    if (Number.isFinite(n) && n >= 1) this.world.jumpToLevel(n);
  }

  private buildStaticLayerForCurrentLevel(): HTMLCanvasElement {
    this.staticLayerLevel = this.world.levelNumber;
    const theme = getWorldTheme(this.world.level.world);
    return buildStaticLayer(theme, this.world.level, this.world.levelNumber);
  }

  update(dt: number): void {
    this.world.update(dt);
    if (this.world.score > this.save.hiScore) this.save.hiScore = this.world.score;
    tickBlink(this.frogBlink, dt);

    if (this.world.level.world !== this.lastMusicWorld) {
      // Crossfades music the instant the level's world changes (docs/specs/M5-audio.md
      // acceptance #3; M6 is the first milestone where this actually fires from real gameplay).
      this.lastMusicWorld = this.world.level.world;
      music.play(this.world.level.world);
    }

    if (this.world.levelNumber !== this.introShownForLevel) {
      // A new level started this tick (level clear, or a dev jump) - show its intro card
      // (docs/specs/M6-worlds.md section 7). Checked right after `world.update()` so the level
      // number is already current, still inside this same PlayScene.update() call (pushing a
      // scene takes effect for the *next* frame's dispatch, not re-entrantly).
      this.introShownForLevel = this.world.levelNumber;
      this.scenes.push(
        new LevelIntroScene(this.scenes, this, this.world.level, this.world.levelNumber),
      );
    }

    particles.setPalette(getWorldTheme(this.world.level.world).palette);
    particles.update(dt);
    shake.update(dt);
    popups.update(dt);
    transitions.update(dt);
    updateWeather(getWorldTheme(this.world.level.world).weather, dt);

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

    // Fog (world 4) fades movers more than 4 tiles from the frog's column - docs/specs/
    // M6-worlds.md section 2. `undefined` everywhere else, so drawLaneMovers skips the falloff.
    const fogFrogCol = theme.weather === 'fog' ? world.frog.x + 0.5 : undefined;

    // River rows: animated water (bands + specular) and platform contact shadows under the
    // movers, then the movers themselves. Road rows after (ARCHITECTURE.md section 11).
    for (const row of RIVER_ROWS) {
      const lane = world.laneAt(row);
      if (!lane) continue;
      drawWaterAnimated(r, lane, theme, world.elapsed);
      drawPlatformContactShadows(r, lane, theme, world.elapsed);
      drawLaneMovers(r, lane, world.elapsed, theme.weather, fogFrogCol);
    }
    for (const row of ROAD_ROWS) {
      const lane = world.laneAt(row);
      if (lane) drawLaneMovers(r, lane, world.elapsed, theme.weather, fogFrogCol);
    }
    drawRailSignals(r, world.lanes, world.elapsed);

    drawFrog(r, world.frog, world.elapsed, this.frogBlink.blinking);

    drawLighting(r, theme, world.lanes);
    drawWeather(r, theme);

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

    drawAudioHint(r, !audio.hasStarted());
    transitions.render(r);
  }
}
