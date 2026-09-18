// Game Over card (M8 spec section 1, restyled onto the shared UI kit): score, hi-score, the M7 run
// statistics, Retry and Title buttons, and - on a qualifying score - the arcade-style three-letter
// leaderboard name entry from M7 (kept as-is: it already works well with keyboard and touch, and
// deliberately bypasses the normal InputAction pipeline the same way this file's own doc comment
// on `attachNameEntryInput` explains).

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import type { LeaderboardEntry, SaveData } from '../core/save';
import {
  insertLeaderboardEntry,
  qualifiesForLeaderboard,
  recordBestLevel,
  writeSave,
} from '../core/save';
import * as transitions from '../fx/transitions';
import type { RunStats } from '../game/scoring';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import { roundRect } from '../render/draw/background';
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
import { PlayScene } from './play';
import { TitleScene } from './title';

const DANGER = '#FF4D4D';
const GOLD = '#FFC83D';

const LETTERS = 3;
const ALPHABET_LEN = 26;

function letterChar(index: number): string {
  return String.fromCharCode(65 + index);
}

/** `DeathCause` keys read a bit terse on a small card - a short, still-recognisable label. */
const DEATH_LABEL: Record<string, string> = {
  squish: 'Squish',
  drown: 'Drown',
  timeout: 'Timeout',
  croc: 'Croc',
  hedge: 'Hedge',
  snake: 'Snake',
  offscreen: 'Off-screen',
  occupied: 'Occupied',
};

function topDeathCause(deathsByCause: RunStats['deathsByCause']): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [cause, count] of Object.entries(deathsByCause)) {
    if ((count ?? 0) > bestCount) {
      bestCount = count ?? 0;
      best = cause;
    }
  }
  return best ? `${DEATH_LABEL[best] ?? best} x${bestCount}` : null;
}

export class GameOverScene implements Scene {
  private qualifies: boolean;
  private nameEntryDone: boolean;
  private letters: number[];
  private cursor = 0;
  private focus = new FocusManager();
  private buttonRects: { retry: Rect; title: Rect } = {
    retry: { x: 0, y: 0, w: 0, h: 0 },
    title: { x: 0, y: 0, w: 0, h: 0 },
  };

  private onRawKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onRawTouchEnd: ((e: TouchEvent) => void) | null = null;
  private letterBoxRects: { x: number; y: number; w: number; h: number }[] = [];

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
    private score: number,
    private stats: RunStats,
  ) {
    if (score > this.save.hiScore) this.save.hiScore = score;
    recordBestLevel(this.save, stats.levelReached);
    writeSave(this.save);

    this.qualifies = qualifiesForLeaderboard(this.save.leaderboard, score);
    this.nameEntryDone = !this.qualifies;

    const defaultName = (this.save.lastName || 'AAA')
      .toUpperCase()
      .padEnd(LETTERS, 'A')
      .slice(0, LETTERS);
    this.letters = Array.from({ length: LETTERS }, (_, i) => {
      const code = defaultName.charCodeAt(i) - 65;
      return code >= 0 && code < ALPHABET_LEN ? code : 0;
    });
  }

  enter(): void {
    if (!this.nameEntryDone) this.attachNameEntryInput();
    this.registerButtons();
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement) this.focus.attach(canvas);
    pushActiveFocusManager(this.focus);
  }

  exit(): void {
    this.detachNameEntryInput();
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  update(dt: number): void {
    transitions.update(dt);
  }

  private registerButtons(): void {
    const w = CANVAS_WIDTH * 0.82;
    const h = CANVAS_HEIGHT * 0.6;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    const buttonW = (w - 56 - 16) / 2;
    const buttonY = y + h - 62;
    this.buttonRects = {
      retry: { x: x + 28, y: buttonY, w: buttonW, h: 44 },
      title: { x: x + 28 + buttonW + 16, y: buttonY, w: buttonW, h: 44 },
    };
    this.focus.clear();
    this.focus.add({
      id: 'retry',
      kind: 'button',
      rect: this.buttonRects.retry,
      disabled: !this.nameEntryDone,
      onActivate: () => this.retry(),
    });
    this.focus.add({
      id: 'title',
      kind: 'button',
      rect: this.buttonRects.title,
      disabled: !this.nameEntryDone,
      onActivate: () => this.toTitle(),
    });
  }

  private retry(): void {
    if (!this.nameEntryDone) return;
    transitions.play(() => this.scenes.replace(new PlayScene(this.scenes, this.save)));
  }

  private toTitle(): void {
    if (!this.nameEntryDone) return;
    transitions.play(() => this.scenes.replace(new TitleScene(this.scenes, this.save)));
  }

  // --- Arcade-style three-letter name entry (M7 spec section 4) ---
  //
  // Deliberately bypasses the normal InputAction pipeline: a keyboard hop already maps
  // left/right/up/down cleanly, but a touch tap always synthesises `{type:'hop',dir:'up'}` with no
  // position (core/input.ts's "a tap hops up"), which can't drive "tap a letter to cycle" at all.
  // Raw listeners (same precedent as PlayScene's dev level-jump key and audio.ts's mute key) let
  // keyboard and touch be handled independently without the two fighting over the same gesture.
  // While active, `onAction`/the Retry-Title buttons are disabled (registered but `disabled: true`
  // above, and `onAction` itself early-returns) - both re-enable the instant a name is confirmed.

  private attachNameEntryInput(): void {
    this.onRawKeyDown = (e: KeyboardEvent): void => {
      const code = e.code;
      const key = e.key;
      if (code === 'ArrowLeft' || key === 'ArrowLeft') {
        this.cursor = (this.cursor + LETTERS - 1) % LETTERS;
        audio.playSfx('uiMove');
      } else if (code === 'ArrowRight' || key === 'ArrowRight') {
        this.cursor = (this.cursor + 1) % LETTERS;
        audio.playSfx('uiMove');
      } else if (code === 'ArrowUp' || key === 'ArrowUp') {
        this.cycleLetter(this.cursor, 1);
      } else if (code === 'ArrowDown' || key === 'ArrowDown') {
        this.cycleLetter(this.cursor, -1);
      } else if (code === 'Enter' || code === 'Space' || key === 'Enter' || key === ' ') {
        this.confirmName();
      }
    };
    window.addEventListener('keydown', this.onRawKeyDown);

    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement) {
      this.onRawTouchEnd = (e: TouchEvent): void => {
        const t = e.changedTouches[0];
        if (!t) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const lx = ((t.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
        const ly = ((t.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
        const hit = this.hitLetterBox(lx, ly);
        if (hit !== null) this.cycleLetter(hit, 1);
      };
      canvas.addEventListener('touchend', this.onRawTouchEnd, { passive: true });
    }
  }

  private detachNameEntryInput(): void {
    if (this.onRawKeyDown) window.removeEventListener('keydown', this.onRawKeyDown);
    this.onRawKeyDown = null;
    if (this.onRawTouchEnd) {
      const canvas = document.getElementById('game');
      canvas?.removeEventListener('touchend', this.onRawTouchEnd);
    }
    this.onRawTouchEnd = null;
  }

  private hitLetterBox(x: number, y: number): number | null {
    for (let i = 0; i < this.letterBoxRects.length; i++) {
      const b = this.letterBoxRects[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return null;
  }

  private cycleLetter(index: number, dir: 1 | -1): void {
    this.letters[index] = (this.letters[index] + dir + ALPHABET_LEN) % ALPHABET_LEN;
    audio.playSfx('uiMove');
  }

  private confirmName(): void {
    const name = this.letters.map(letterChar).join('');
    this.save.lastName = name;
    const entry: LeaderboardEntry = {
      name,
      score: this.score,
      world: this.stats.world,
      level: this.stats.levelReached,
      date: new Date().toISOString().slice(0, 10),
    };
    this.save.leaderboard = insertLeaderboardEntry(this.save.leaderboard, entry);
    writeSave(this.save);
    this.nameEntryDone = true;
    this.detachNameEntryInput();
    this.registerButtons(); // re-registers Retry/Title as enabled now that entry is done
    audio.playSfx('uiConfirm');
  }

  // --- Render ---

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.82;
    const h = CANVAS_HEIGHT * 0.6;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentB);

    r.text('GAME OVER', CANVAS_WIDTH / 2, y + h * 0.12, {
      size: 30,
      weight: 700,
      align: 'center',
      color: DANGER,
    });
    r.text(`SCORE ${this.score}`, CANVAS_WIDTH / 2, y + h * 0.2, {
      size: 20,
      weight: 600,
      align: 'center',
      color: INK,
    });
    r.text(`HI-SCORE ${this.save.hiScore}`, CANVAS_WIDTH / 2, y + h * 0.26, {
      size: 15,
      weight: 600,
      align: 'center',
      color: GOLD,
      outline: INK,
    });

    this.renderStats(r, CANVAS_WIDTH / 2, y + h * 0.36);

    if (!this.nameEntryDone) {
      this.renderNameEntry(r, CANVAS_WIDTH / 2, y + h * 0.56);
    } else if (this.qualifies) {
      r.text('Saved to the leaderboard!', CANVAS_WIDTH / 2, y + h * 0.56, {
        size: 15,
        weight: 600,
        align: 'center',
        color: theme.palette.accentA,
      });
    }

    drawButton(
      r,
      this.buttonRects.retry,
      'RETRY',
      {
        hover: this.focus.isHovered('retry'),
        pressed: this.focus.isPressed('retry'),
        focused: this.focus.isFocused('retry'),
        disabled: !this.nameEntryDone,
      },
      { accent: theme.palette.accentA },
    );
    drawButton(
      r,
      this.buttonRects.title,
      'TITLE',
      {
        hover: this.focus.isHovered('title'),
        pressed: this.focus.isPressed('title'),
        focused: this.focus.isFocused('title'),
        disabled: !this.nameEntryDone,
      },
      { accent: theme.palette.accentA },
    );

    transitions.render(r);
  }

  private renderStats(r: Renderer, cx: number, y: number): void {
    const s = this.stats;
    const line1 = `Level ${s.levelReached}  |  Homes ${s.homesFilled}  |  Power-ups ${s.powerupsCollected}`;
    const line2 = `Near-miss x${s.nearMisses} (best combo x${s.bestCombo})  |  Best streak x${s.bestMultiplier}`;
    const cause = topDeathCause(s.deathsByCause);
    const line3 = `Time played ${Math.round(s.timePlayedS)}s${cause ? `  |  Most deaths: ${cause}` : ''}`;

    r.text(line1, cx, y, { size: 13, weight: 500, align: 'center', color: INK });
    r.text(line2, cx, y + 16, { size: 13, weight: 500, align: 'center', color: INK });
    r.text(line3, cx, y + 32, { size: 12, weight: 500, align: 'center', color: INK });
  }

  private renderNameEntry(r: Renderer, cx: number, y: number): void {
    r.text('NEW HIGH SCORE - ENTER YOUR NAME', cx, y - 20, {
      size: 13,
      weight: 600,
      align: 'center',
      color: DANGER,
    });

    const boxW = 34;
    const boxH = 38;
    const gap = 10;
    const totalW = boxW * LETTERS + gap * (LETTERS - 1);
    const startX = cx - totalW / 2;

    this.letterBoxRects = [];
    for (let i = 0; i < LETTERS; i++) {
      const bx = startX + i * (boxW + gap);
      const by = y - boxH / 2;
      this.letterBoxRects.push({ x: bx, y: by, w: boxW, h: boxH });

      r.ctx.save();
      r.ctx.fillStyle = i === this.cursor ? '#FFF2C2' : '#FFFFFF';
      roundRect(r, bx, by, boxW, boxH, 8);
      r.ctx.restore();

      if (i === this.cursor) {
        r.ctx.save();
        r.ctx.strokeStyle = GOLD;
        r.ctx.lineWidth = 2.5;
        r.ctx.beginPath();
        const radius = 8;
        r.ctx.moveTo(bx + radius, by);
        r.ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, radius);
        r.ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, radius);
        r.ctx.arcTo(bx, by + boxH, bx, by, radius);
        r.ctx.arcTo(bx, by, bx + boxW, by, radius);
        r.ctx.closePath();
        r.ctx.stroke();
        r.ctx.restore();
      }

      r.text(letterChar(this.letters[i]), bx + boxW / 2, by + boxH / 2 + 1, {
        size: 24,
        weight: 700,
        align: 'center',
        color: INK,
      });
    }

    r.text(
      'Arrows: move / cycle - tap a letter to cycle - confirm to accept',
      cx,
      y + boxH / 2 + 18,
      {
        size: 11,
        weight: 500,
        align: 'center',
        color: INK,
      },
    );
  }

  onAction(a: InputAction): void {
    if (!this.nameEntryDone) return; // driven entirely by the raw listeners above while active
    if (transitions.isActive()) return; // ignore input mid-wipe
    if (this.focus.handleAction(a)) return;
    if (a.type === 'confirm' || a.type === 'back') this.toTitle();
  }
}
