import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { gameEvents } from '../core/events';
import {
  getLastInputDevice,
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
import { blendWorldTheme, getWorldTheme, type WorldTheme } from '../game/themes';
import { freezeLaneTimeScale, POWERUP_KINDS } from '../game/powerups';
import { getSkin, unlockedSkinIds, unlockStatsFromSave, type SkinDef } from '../game/skins';
import { createCampaignWorld, createEndlessWorld } from '../game/world';
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
import { BelowCanvasTouchControls } from '../render/touchControls';
import { GameOverScene } from './gameOver';
import { LevelIntroScene } from './levelIntro';
import { PauseScene } from './pause';
import { ResultsScene } from './results';

// A home-landing animation stays visible (icon pulse + lily-pad ring, ART_BIBLE.md section 5) for
// at most this long; entries older than this are pruned each frame.
const HOME_ANIM_MAX_S = 0.5;
// M9: Endless's own theme change (docs/specs/M9-endless-skins.md section 1: "a 1 s palette
// crossfade").
const CROSSFADE_S = 1;
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
  // --- M9 Endless: docs/specs/M9-endless-skins.md section 1 ---
  // The crossfade fires whenever the *rendered* theme's world id changes while in Endless mode
  // (every 5th crossing, `game/endless.ts`'s `endlessWorldForCrossing`) - `from` is the theme it
  // fades away from, `t` counts up 0..1 over `CROSSFADE_S`. Null the rest of the time, including
  // the whole of campaign mode (which already has its own Results-screen "next world" reveal and
  // never needed a live in-canvas crossfade).
  private crossfade: { from: WorldTheme; t: number } | null = null;
  /** How much of this run's `RunStats.homesFilled` has already been folded into
   * `save.lifetimeHomesFilled` - see `bankProgress()`. */
  private lifetimeHomesBanked = 0;
  // M8 fix-up spec item 1: recomputed every `update()` tick (cheap - a couple of comparisons)
  // alongside the on-screen-d-pad-setting poll above, since both can flip the *set* of on-canvas
  // touch buttons `setupTouchButtons()` needs to (re)build.
  private lastOverlayActive = false;
  private lastShowPauseOnCanvas = false;

  // --- Touch: below-canvas d-pad/pause overlay (M8 fix-up spec item 1) when there's enough free
  // space under the canvas for it; otherwise the pre-existing on-canvas overlay below, shrunk and
  // repositioned (M8 fix-up spec items 1-2) ---
  private touchOverlay: BelowCanvasTouchControls | null = null;

  // --- Touch: on-canvas d-pad/pause fallback (default on for touch devices, toggle in Settings) -
  // only populated when `touchOverlay` isn't active (M8 spec section 3, M8 fix-up spec items 1-2)
  // ---
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
    /** M9: present only for an Endless run (`scenes/endlessStart.ts`, `window.__rr.endless.start`)
     * - absent, this is an ordinary campaign run, unchanged from pre-M9. */
    private endlessOpts?: { startDifficulty: number; seed: number },
  ) {
    this.world = endlessOpts
      ? createEndlessWorld(endlessOpts.startDifficulty, endlessOpts.seed)
      : createCampaignWorld(1, Date.now());
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
        // M9: banks lifetime skin-unlock progress (and, for campaign, bestLevel/hiScore) before
        // the card that shows the unlock toast is even constructed - see `bankProgress()`.
        const newlyUnlocked = this.bankProgress();
        const crossingInfo =
          this.world.mode === 'endless' ? { crossings: this.world.levelNumber } : undefined;
        transitions.play(
          () =>
            this.scenes.replace(
              new GameOverScene(
                this.scenes,
                this.save,
                e.score,
                stats,
                crossingInfo,
                newlyUnlocked,
              ),
            ),
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
      // M8 fix-up spec item 1: a below-canvas DOM d-pad/pause overlay, used instead of the
      // on-canvas one whenever there's enough free space under the canvas for it - gated on touch
      // capability up front, same as the on-canvas fallback's own default-on setting.
      if (isTouchCapable()) {
        this.touchOverlay = new BelowCanvasTouchControls(canvas, this, {
          onHop: (dir) => this.world.queueHop(dir),
          onPause: () => this.openPause(),
        });
        this.touchOverlay.setDpadEnabled(this.save.settings.onScreenDpad);
        this.touchOverlay.mount();
      }
    }
    this.setupTouchButtons();
    // Show the level intro card immediately (docs/specs/M6-worlds.md section 7) rather than
    // waiting a frame for `update()` to notice the level number - avoids a one-frame flash of
    // interactive play before the card appears. M9: Endless has no "level" to introduce - the
    // Endless start card (`scenes/endlessStart.ts`) already served that role before this scene
    // ever existed, so it drops straight into the first crossing instead.
    this.introShownForLevel = this.world.levelNumber;
    if (this.world.mode === 'campaign') {
      this.scenes.push(
        new LevelIntroScene(this.scenes, this, this.world.level, this.world.levelNumber),
      );
    }
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
    this.touchOverlay?.unmount();
    this.touchOverlay = null;
    // The run's furthest level reached, for Endless's lock (M8 spec section 1), plus M9's
    // lifetime skin-unlock stats - banked here (not only on Game Over/Results) so quitting to
    // Title mid-run via Pause still counts progress. No card is showing at this point, so the
    // newly-unlocked list (if any) is simply discarded.
    this.bankProgress();
  }

  /** M9: folds this run's progress so far into the save's lifetime skin-unlock stats
   * (`game/skins.ts`), plus (campaign only) `bestLevel`/`hiScore` - called at every checkpoint
   * that can end or pause a run (Results, Game Over, and here on exit/quit), always with the same
   * "add only what hasn't already been counted" accounting so no checkpoint double-counts.
   * Returns whichever skins just became unlocked as a result, for the caller to toast. */
  bankProgress(): SkinDef[] {
    const before = new Set(unlockedSkinIds(unlockStatsFromSave(this.save)));

    const stats = this.world.getRunStats();
    const homesDelta = stats.homesFilled - this.lifetimeHomesBanked;
    if (homesDelta > 0) {
      this.save.lifetimeHomesFilled += homesDelta;
      this.lifetimeHomesBanked = stats.homesFilled;
    }
    this.save.bestNearMissesInRun = Math.max(this.save.bestNearMissesInRun, stats.nearMisses);
    // `World.levelNumber` doubles as the crossing counter in Endless mode (see `game/world.ts`'s
    // own doc comment) - recording it as a campaign "best level" would be nonsense there.
    if (this.world.mode === 'campaign') recordBestLevel(this.save, this.world.levelNumber);
    if (this.world.score > this.save.hiScore) this.save.hiScore = this.world.score;
    writeSave(this.save);

    const after = unlockedSkinIds(unlockStatsFromSave(this.save));
    return after.filter((id) => !before.has(id)).map((id) => getSkin(id));
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

  /** (Re)builds the on-canvas fallback touch buttons - only used when `this.touchOverlay` isn't
   * active (M8 fix-up spec item 1: not enough free space below the canvas for the DOM overlay,
   * e.g. landscape phones and desktop). Called whenever anything that changes *which* buttons
   * should exist changes: the on-screen-d-pad setting, `touchOverlay.active` itself (a window
   * resize/orientation change can flip it live), or the pause button's own visibility condition -
   * see `update()`'s poll below. */
  private setupTouchButtons(): void {
    this.touchButtons = [];
    if (this.touchOverlay?.active) return; // the DOM overlay owns both controls instead

    // M8 fix-up spec items 1-2: shrunk to 48px (from 56) and moved so the cluster never covers the
    // HUD's lives icons or timer bar (both live in the HUD bottom row, y >= CANVAS_HEIGHT - TILE) -
    // anchored to the *top* of that row instead of bleeding into it, over the start bank's left
    // third (a plus/cross cluster, same shape as before - docs/specs/M8-report.md "Deviations" #4
    // on why a single row doesn't work).
    if (this.save.settings.onScreenDpad) {
      const dpadBtn = 48;
      const gap = 6;
      const bottomRowY = CANVAS_HEIGHT - TILE - dpadBtn; // sits exactly on the start bank row
      const topRowY = bottomRowY - dpadBtn - gap;
      const centerX = 100; // within the start bank's left third (0..CANVAS_WIDTH/3 = 0..208)
      const dirs: { id: string; dir: Dir; glyph: string; x: number; y: number }[] = [
        { id: 'dpadUp', dir: 'up', glyph: '▲', x: centerX - dpadBtn / 2, y: topRowY },
        {
          id: 'dpadLeft',
          dir: 'left',
          glyph: '◀',
          x: centerX - dpadBtn * 1.5 - gap,
          y: bottomRowY,
        },
        { id: 'dpadDown', dir: 'down', glyph: '▼', x: centerX - dpadBtn / 2, y: bottomRowY },
        {
          id: 'dpadRight',
          dir: 'right',
          glyph: '▶',
          x: centerX + dpadBtn / 2 + gap,
          y: bottomRowY,
        },
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
    // M8 fix-up spec item 2: never inside the home row (row 1, y 48..96) - lives in the HUD *top*
    // band instead (row 0, y 0..48), between the level-name text (centred) and the right-aligned
    // "HI <score>" text, 32px (down from 36), and only drawn while the last input was actually
    // touch (not just "the device is touch-capable", the pre-fix-up condition) so it doesn't
    // clutter a hybrid touchscreen laptop being driven by mouse/keyboard.
    if (getLastInputDevice() === 'touch') {
      const topY = TILE * 0.55; // matches draw/hud.ts's own HUD-top-row text baseline
      const size = 32;
      this.touchButtons.push({
        id: 'pauseBtn',
        glyph: '⏸',
        rect: { x: CANVAS_WIDTH - 146 - size / 2, y: topY - size / 2, w: size, h: size },
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
      this.touchOverlay?.setDpadEnabled(this.save.settings.onScreenDpad);
      this.setupTouchButtons();
    }
    // M8 fix-up spec items 1-2: `touchOverlay.active` can flip live (a window resize/orientation
    // change crossing the free-space threshold), and the on-canvas pause button's own visibility
    // depends on `getLastInputDevice()`, which changes on ordinary play (first touch). Both are
    // cheap to poll every tick; only rebuild the on-canvas button set when either actually changed.
    const overlayActive = this.touchOverlay?.active ?? false;
    const showPauseOnCanvas = !overlayActive && getLastInputDevice() === 'touch';
    if (
      overlayActive !== this.lastOverlayActive ||
      showPauseOnCanvas !== this.lastShowPauseOnCanvas
    ) {
      this.lastOverlayActive = overlayActive;
      this.lastShowPauseOnCanvas = showPauseOnCanvas;
      this.setupTouchButtons();
    }
    this.world.update(dt);
    if (this.world.score > this.save.hiScore) this.save.hiScore = this.world.score;
    tickBlink(this.frogBlink, dt);

    if (this.world.level.world !== this.lastMusicWorld) {
      // Crossfades music the instant the level's world changes (docs/specs/M5-audio.md
      // acceptance #3; M6 is the first milestone where this actually fires from real gameplay).
      // M9: in Endless mode this is also the trigger for the 1s in-canvas palette crossfade
      // (docs/specs/M9-endless-skins.md section 1) - starting it here, not from a dedicated event,
      // means it fires from the exact same "world id changed" condition the music already uses,
      // so the two can never drift out of sync with each other.
      if (this.world.mode === 'endless') {
        this.crossfade = { from: getWorldTheme(this.lastMusicWorld ?? this.world.level.world), t: 0 };
      }
      this.lastMusicWorld = this.world.level.world;
      music.play(this.world.level.world);
    }
    if (this.crossfade) {
      this.crossfade.t += dt;
      if (this.crossfade.t >= CROSSFADE_S) this.crossfade = null;
    }

    if (this.world.mode === 'campaign' && this.world.levelNumber !== this.introShownForLevel) {
      // A new level started this tick (level clear, or a dev jump) - checked right after
      // `world.update()` so the level number is already current, still inside this same
      // PlayScene.update() call (pushing a scene takes effect for the *next* frame's dispatch,
      // not re-entrantly). A real level clear shows the Results screen first (M8 spec section 1 -
      // time bonus count-up, homes lighting, world-change reveal); it pushes the usual
      // LevelIntroScene itself once dismissed. A dev level jump has no "clear" to celebrate, so
      // it goes straight to the intro card as before. M9: Endless never reaches this branch at
      // all (guarded above) - a crossing's "next" is immediate, with nothing to introduce.
      this.introShownForLevel = this.world.levelNumber;
      if (this.pendingResults) {
        const pr = this.pendingResults;
        this.pendingResults = null;
        this.scenes.push(
          new ResultsScene(
            this.scenes,
            this,
            this.world,
            pr.clearedLevel,
            pr.oldWorldTheme,
            pr.timeBonusTotal,
          ),
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
    // M9: while a palette crossfade is active, blend live and rebuild the static layer's colours
    // every frame instead of only on a level/crossing change - a rare (every 5th crossing), short
    // (1s) cost, and the only way the baked-in static layer (grass/road/hedge fills, not the
    // animated water/lighting drawn live) actually crossfades rather than snapping instantly.
    const theme = this.crossfade
      ? blendWorldTheme(this.crossfade.from, getWorldTheme(world.level.world), this.crossfade.t / CROSSFADE_S)
      : getWorldTheme(world.level.world);
    if (this.crossfade) {
      this.staticLayer = buildStaticLayer(theme, world.level, world.levelNumber);
    } else if (this.staticLayerLevel !== world.levelNumber) {
      this.staticLayer = this.buildStaticLayerForCurrentLevel();
    }
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
      mode: world.mode,
      crossing: world.levelNumber,
      difficulty: world.difficulty,
    });

    for (const b of this.touchButtons) {
      drawTouchButton(r, b.rect, b.glyph, this.pressedTouchButton === b.id);
    }

    drawAudioHint(r, !audio.hasStarted());
    transitions.render(r);
  }
}
