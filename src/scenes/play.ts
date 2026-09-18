import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { gameEvents } from '../core/events';
import {
  isTopInputOwner,
  isTouchCapable,
  popInputOwner,
  popTouchExclusion,
  pushInputOwner,
  pushTouchExclusion,
} from '../core/input';
import { recordBestLevel, writeSave, type SaveData } from '../core/save';
import * as music from '../audio/music';
import * as particles from '../fx/particles';
import * as popups from '../fx/popups';
import * as shake from '../fx/shake';
import * as transitions from '../fx/transitions';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  HOME_TIME_BONUS_PER_S,
  RIVER_ROWS,
  ROAD_ROWS,
  TILE,
} from '../game/constants';
import { getWorldTheme, type WorldTheme } from '../game/themes';
import { freezeLaneTimeScale, POWERUP_KINDS } from '../game/powerups';
import { createCampaignWorld } from '../game/world';
import type { World } from '../game/world';
import type { Dir, InputAction, PowerupKind } from '../game/types';
import type { Renderer } from '../render/renderer';
import { buildStaticLayer, drawHomeSlots, drawStaticLayer } from '../render/draw/background';
import { drawFrog, drawLaneMovers, drawRailSignals } from '../render/draw/entities';
import { drawAudioHint, drawHud } from '../render/draw/hud';
import { drawLighting } from '../render/draw/lighting';
import {
  drawFreezeVignette,
  drawLadyFrogOnBack,
  drawLadyFrogOnField,
  drawMegaHopChevron,
  drawPowerupBadge,
  drawShieldBubble,
} from '../render/draw/powerups';
import { drawWeather, updateWeather } from '../render/draw/weather';
import { createBlinkState, tickBlink, type BlinkState } from '../render/anim';
import { drawPlatformContactShadows, drawWaterAnimated } from '../render/draw/water';
import { clientToLogical, drawTouchButton, inRect, setPageVignette, type Rect } from '../render/ui';
import { GameOverScene } from './gameOver';
import { LevelIntroScene } from './levelIntro';
import { PauseScene } from './pause';
import { ResultsScene } from './results';

// A home-landing animation stays visible (icon pulse + lily-pad ring, ART_BIBLE.md section 5) for
// at most this long; entries older than this are pruned each frame.
const HOME_ANIM_MAX_S = 0.5;
// Dev-only "L" then up to two digits level jump (docs/specs/M6-worlds.md section 6). If the
// second digit doesn't arrive within this window, the single digit typed so far commits.
const LEVEL_JUMP_COMMIT_MS = 900;

interface TouchButtonDef {
  id: string;
  dir?: Dir;
  glyph: string;
  rect: Rect;
  onPress: () => void;
}

/** Captured synchronously inside the `levelClear` `GameEvent` handler, *before*
 * `World.loadNextLevel()` (called right after the event is emitted, same synchronous call stack)
 * advances `world.level`/`world.levelNumber` - see `scenes/results.ts`'s own doc comment for why
 * the timing here matters. */
interface PendingResults {
  clearedLevel: number;
  oldWorldTheme: WorldTheme;
  timeBonusTotal: number;
}

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
  private pendingResults: PendingResults | null = null;
  private lastOnScreenDpadSetting = false;

  // --- Touch: on-screen d-pad (default on for touch devices, toggle in Settings) and pause
  // button (M8 spec section 3) ---
  private touchButtons: TouchButtonDef[] = [];
  private pressedTouchButton: string | null = null;
  private touchHitTest = (x: number, y: number): boolean =>
    this.touchButtons.some((b) => inRect(x, y, b.rect));
  private onTouchStartRaw = (e: TouchEvent): void => {
    if (!isTopInputOwner(this)) return; // covered by Pause/LevelIntro/Results/GameOver
    const t = e.changedTouches[0];
    if (!t) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const p = clientToLogical(canvas, t.clientX, t.clientY);
    if (!p) return;
    const hit = this.touchButtons.find((b) => inRect(p.x, p.y, b.rect));
    if (hit) this.pressedTouchButton = hit.id;
  };
  private onTouchEndRaw = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    const wasPressed = this.pressedTouchButton;
    this.pressedTouchButton = null;
    if (!t || !wasPressed || !isTopInputOwner(this)) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const p = clientToLogical(canvas, t.clientX, t.clientY);
    if (!p) return;
    const hit = this.touchButtons.find((b) => b.id === wasPressed && inRect(p.x, p.y, b.rect));
    if (hit) hit.onPress();
  };

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.world = createCampaignWorld(1, Date.now());
    this.staticLayer = this.buildStaticLayerForCurrentLevel();
    particles.setPalette(getWorldTheme(this.world.level.world).palette);
    this.lastOnScreenDpadSetting = this.save.settings.onScreenDpad;
    this.setupTouchButtons();
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
        // docs/specs/M7-powerups-scoring.md: "add window.__rr.powerups with a spawn(kind) helper
        // so the reviewer can force each kind." `activate`/`carryLadyFrog` are extra conveniences
        // for screenshotting an effect without needing the frog to walk over the badge first.
        powerups: {
          kinds: POWERUP_KINDS,
          spawn: (kind: PowerupKind) => this.world.forceSpawnPowerup(kind),
          activate: (kind: PowerupKind) => this.world.forceActivatePowerup(kind),
          spawnLadyFrog: () => this.world.forceSpawnLadyFrog(),
          carryLadyFrog: () => this.world.forceCarryLadyFrog(),
        },
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
        const stats = this.world.getRunStats();
        transitions.play(
          () => this.scenes.replace(new GameOverScene(this.scenes, this.save, e.score, stats)),
          (frog.x + 0.5) * TILE,
          frog.row * TILE + TILE / 2,
        );
      } else if (e.type === 'home') {
        this.homeAnims.set(e.slot, 0);
      } else if (e.type === 'levelClear') {
        this.homeAnims.clear();
        // Captured *before* `World.loadNextLevel()` runs (see `PendingResults`'s doc comment) -
        // `this.world.level`/`levelNumber` are still the level just cleared at this exact point.
        this.pendingResults = {
          clearedLevel: e.level,
          oldWorldTheme: getWorldTheme(this.world.level.world),
          timeBonusTotal: Math.max(0, Math.floor(this.world.timeLeft)) * HOME_TIME_BONUS_PER_S,
        };
      }
    });
    if (import.meta.env.DEV) this.attachLevelJumpKey();
    pushTouchExclusion(this.touchHitTest);
    pushInputOwner(this);
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement) {
      canvas.addEventListener('touchstart', this.onTouchStartRaw, { passive: true });
      canvas.addEventListener('touchend', this.onTouchEndRaw, { passive: true });
    }
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
    popTouchExclusion(this.touchHitTest);
    popInputOwner(this);
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement) {
      canvas.removeEventListener('touchstart', this.onTouchStartRaw);
      canvas.removeEventListener('touchend', this.onTouchEndRaw);
    }
    // The run's furthest level reached, for Endless's lock (M8 spec section 1) - recorded here
    // (not only on Game Over) so quitting to Title mid-run via Pause still counts it.
    recordBestLevel(this.save, this.world.levelNumber);
    writeSave(this.save);
  }

  /** Reloads the current level from scratch (fresh homes, fresh frog/timer), keeping score and
   * lives - Pause's "Restart level" (M8 spec section 1). */
  restartLevel(): void {
    this.world.jumpToLevel(this.world.levelNumber);
  }

  /** For Pause's card accent colour (M8 spec section 1) - it doesn't otherwise need `World`. */
  currentWorldId(): 1 | 2 | 3 | 4 | 5 {
    return this.world.level.world;
  }

  private setupTouchButtons(): void {
    this.touchButtons = [];
    // A compact plus/cross cluster (not a single row) so it clears both the HUD's lives icons
    // (bottom-left) and its timer bar (bottom-right) - see docs/specs/M8-report.md "Deviations"
    // for why a single 4-wide row (the spec's own literal "in the bottom HUD band" reading)
    // turned out to overlap the lives icons in practice.
    const dpadBtn = 56;
    const gap = 6;
    const bottomRowY = CANVAS_HEIGHT - dpadBtn - 4;
    const topRowY = bottomRowY - dpadBtn - gap;
    const centerX = 200;
    if (this.save.settings.onScreenDpad) {
      const dirs: { id: string; dir: Dir; glyph: string; x: number; y: number }[] = [
        { id: 'dpadUp', dir: 'up', glyph: '▲', x: centerX - dpadBtn / 2, y: topRowY },
        { id: 'dpadLeft', dir: 'left', glyph: '◀', x: centerX - dpadBtn * 1.5 - gap, y: bottomRowY },
        { id: 'dpadDown', dir: 'down', glyph: '▼', x: centerX - dpadBtn / 2, y: bottomRowY },
        { id: 'dpadRight', dir: 'right', glyph: '▶', x: centerX + dpadBtn / 2 + gap, y: bottomRowY },
      ];
      dirs.forEach((d) => {
        this.touchButtons.push({
          id: d.id,
          dir: d.dir,
          glyph: d.glyph,
          rect: { x: d.x, y: d.y, w: dpadBtn, h: dpadBtn },
          onPress: () => this.world.queueHop(d.dir),
        });
      });
    }
    if (isTouchCapable()) {
      // Sits just below the HUD top row's right-aligned "HI <score>" text (topY ~26, size 18) so
      // the two don't overlap - the HUD text itself never moves for a touch device, so the button
      // has to be the one to get out of its way.
      this.touchButtons.push({
        id: 'pauseBtn',
        glyph: '⏸',
        rect: { x: CANVAS_WIDTH - 42, y: 40, w: 36, h: 36 },
        onPress: () => this.openPause(),
      });
    }
  }

  private openPause(): void {
    if (this.world.gameOver) return;
    this.scenes.push(new PauseScene(this.scenes, this, this.save));
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
    if (this.save.settings.onScreenDpad !== this.lastOnScreenDpadSetting) {
      // Settings (opened from Pause) may have flipped the on-screen d-pad toggle mid-run -
      // rebuild the touch-button set (and its touch-exclusion hit test) once gameplay resumes.
      this.lastOnScreenDpadSetting = this.save.settings.onScreenDpad;
      this.setupTouchButtons();
    }
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
      // A new level started this tick (level clear, or a dev jump) - checked right after
      // `world.update()` so the level number is already current, still inside this same
      // PlayScene.update() call (pushing a scene takes effect for the *next* frame's dispatch,
      // not re-entrantly). A real level clear shows the Results screen first (M8 spec section 1 -
      // time bonus count-up, homes lighting, world-change reveal); it pushes the usual
      // LevelIntroScene itself once dismissed. A dev level jump has no "clear" to celebrate, so
      // it goes straight to the intro card as before.
      this.introShownForLevel = this.world.levelNumber;
      if (this.pendingResults) {
        const pr = this.pendingResults;
        this.pendingResults = null;
        this.scenes.push(
          new ResultsScene(this.scenes, this, this.world, pr.clearedLevel, pr.oldWorldTheme, pr.timeBonusTotal),
        );
      } else {
        this.scenes.push(
          new LevelIntroScene(this.scenes, this, this.world.level, this.world.levelNumber),
        );
      }
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
    } else if (a.type === 'pause' || a.type === 'back') {
      this.openPause();
    }
  }

  render(r: Renderer, alpha: number): void {
    const world = this.world;
    if (this.staticLayerLevel !== world.levelNumber) {
      this.staticLayer = this.buildStaticLayerForCurrentLevel();
    }
    const theme = getWorldTheme(world.level.world);
    setPageVignette(theme.palette.accentA);

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

    // M7: power-up badge and the lady frog (on her log) ride under the frog, drawn with the other
    // river/road-riding things so the frog visibly lands on top of them.
    if (world.powerup) drawPowerupBadge(r, world.powerup, world.elapsed);
    if (world.ladyFrog) drawLadyFrogOnField(r, world.ladyFrog, world.elapsed);

    drawFrog(r, world.frog, world.elapsed, this.frogBlink.blinking);

    if (world.carryingLadyFrog) drawLadyFrogOnBack(r, world.frog, world.elapsed);
    if (world.shieldActive) drawShieldBubble(r, world.frog, world.elapsed);
    if (world.megaHopActive) drawMegaHopChevron(r, world.frog, world.elapsed);

    drawLighting(r, theme, world.lanes);
    drawWeather(r, theme);
    if (world.freezeElapsed !== null) {
      drawFreezeVignette(r, 1 - freezeLaneTimeScale(world.freezeElapsed));
    }

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

    for (const b of this.touchButtons) {
      drawTouchButton(r, b.rect, b.glyph, this.pressedTouchButton === b.id);
    }

    drawAudioHint(r, !audio.hasStarted());
    transitions.render(r);
  }
}
