// Settings screen (M8 spec section 2): master/music/SFX sliders with live preview, a reduce
// motion toggle, key remap for the four hop directions plus confirm/pause (press the key to bind,
// Escape cancels), an on-screen d-pad toggle, and reset best scores (with a confirm). Everything
// persists via core/save.ts. Reachable from the Title or from Pause; just pushed on the stack, so
// popping it (Back, Escape/B, or any input once nothing is mid-bind) returns to whichever pushed
// it.

import type { Scene, SceneManager } from '../core/loop';
import * as audio from '../core/audio';
import { setKeyBindings, type KeyBindings } from '../core/input';
import { type SaveData, writeSave } from '../core/save';
import * as transitions from '../fx/transitions';
import { setReduceMotion as setHitstopReduceMotion } from '../fx/hitstop';
import { setReduceMotion as setShakeReduceMotion } from '../fx/shake';
import { setReduceMotion as setTransitionsReduceMotion } from '../fx/transitions';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import { getWorldTheme } from '../game/themes';
import type { InputAction } from '../game/types';
import type { Renderer } from '../render/renderer';
import {
  drawButton,
  drawCard,
  drawSlider,
  drawToggle,
  FocusManager,
  INK,
  pushActiveFocusManager,
  popActiveFocusManager,
  type Rect,
} from '../render/ui';

type BindAction = keyof KeyBindings;

const BIND_ROWS: { action: BindAction; label: string }[] = [
  { action: 'up', label: 'HOP UP' },
  { action: 'down', label: 'HOP DOWN' },
  { action: 'left', label: 'HOP LEFT' },
  { action: 'right', label: 'HOP RIGHT' },
  { action: 'confirm', label: 'CONFIRM' },
  { action: 'pause', label: 'PAUSE' },
];

const FRIENDLY_KEY: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  Escape: 'Esc',
  Space: 'Space',
};

function friendlyKeyName(code: string): string {
  if (FRIENDLY_KEY[code]) return FRIENDLY_KEY[code];
  const key = /^Key([A-Z])$/.exec(code);
  if (key) return key[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  return code;
}

const RESET_ARM_WINDOW_S = 3;
const TOAST_DURATION_S = 1.4;

export class SettingsScene implements Scene {
  private focus = new FocusManager();
  private cardRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rows: Record<string, Rect> = {};
  private awaitingBind: BindAction | null = null;
  private resetArmed = false;
  private resetArmedT = 0;
  private sfxPreviewCooldown = 0;
  private toastText: string | null = null;
  private toastT = 0;
  private onRawKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {
    this.buildLayout();
  }

  enter(): void {
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement)
      this.focus.attach(canvas, { onCancel: () => this.close() });
    this.registerControls();
    pushActiveFocusManager(this.focus);

    this.onRawKeyDown = (e: KeyboardEvent): void => {
      if (!this.awaitingBind) return;
      e.preventDefault();
      if (e.code === 'Escape') {
        this.awaitingBind = null;
        return;
      }
      if (!e.code) return;
      const action = this.awaitingBind;
      this.awaitingBind = null;
      this.save.settings.keys = { ...this.save.settings.keys, [action]: e.code };
      setKeyBindings(this.save.settings.keys);
      writeSave(this.save);
      audio.playSfx('uiConfirm');
    };
    window.addEventListener('keydown', this.onRawKeyDown);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
    if (this.onRawKeyDown) window.removeEventListener('keydown', this.onRawKeyDown);
    this.onRawKeyDown = null;
  }

  private close(): void {
    if (this.awaitingBind) {
      this.awaitingBind = null;
      return;
    }
    this.scenes.pop();
  }

  private buildLayout(): void {
    const w = CANVAS_WIDTH * 0.9;
    const h = CANVAS_HEIGHT * 0.94;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    this.cardRect = { x, y, w, h };

    const rowH = 34;
    const rowGap = 9;
    const controlX = x + w * 0.46;
    const controlW = x + w - 28 - 46 - controlX;
    let cursor = y + 70;

    const addRow = (id: string, rect: Rect): void => {
      this.rows[id] = rect;
      cursor += rowH + rowGap;
    };

    addRow('master', { x: controlX, y: cursor, w: controlW, h: rowH });
    addRow('music', { x: controlX, y: cursor, w: controlW, h: rowH });
    addRow('sfx', { x: controlX, y: cursor, w: controlW, h: rowH });

    const toggleW = 56;
    addRow('reduceMotion', { x: controlX, y: cursor, w: toggleW, h: rowH * 0.72 });
    addRow('onScreenDpad', { x: controlX, y: cursor, w: toggleW, h: rowH * 0.72 });

    cursor += 20; // "CONTROLS" section label
    this.rows.__controlsLabel = { x: x + 28, y: cursor - 16, w: 0, h: 0 };

    const remapW = (w - 56 - 14) / 2;
    for (let i = 0; i < BIND_ROWS.length; i += 2) {
      const left = BIND_ROWS[i];
      const right = BIND_ROWS[i + 1];
      this.rows[`bind_${left.action}`] = { x: x + 28, y: cursor, w: remapW, h: rowH + 6 };
      if (right) {
        this.rows[`bind_${right.action}`] = {
          x: x + 28 + remapW + 14,
          y: cursor,
          w: remapW,
          h: rowH + 6,
        };
      }
      cursor += rowH + 6 + rowGap;
    }

    cursor += 8;
    this.rows.reset = { x: x + w / 2 - 140, y: cursor, w: 280, h: 42 };
    cursor += 42 + 12;
    this.rows.back = { x: x + w / 2 - 90, y: cursor, w: 180, h: 42 };
  }

  private registerControls(): void {
    this.focus.clear();
    const s = this.save.settings;

    this.focus.add({
      id: 'master',
      kind: 'slider',
      rect: this.rows.master,
      value: s.master / 100,
      onChange: (v) => {
        s.master = Math.round(v * 100);
        audio.setMasterVolume(s.master);
        writeSave(this.save);
      },
    });
    this.focus.add({
      id: 'music',
      kind: 'slider',
      rect: this.rows.music,
      value: s.music / 100,
      onChange: (v) => {
        s.music = Math.round(v * 100);
        audio.setMusicVolume(s.music);
        writeSave(this.save);
      },
    });
    this.focus.add({
      id: 'sfx',
      kind: 'slider',
      rect: this.rows.sfx,
      value: s.sfx / 100,
      onChange: (v) => {
        s.sfx = Math.round(v * 100);
        audio.setSfxVolume(s.sfx);
        writeSave(this.save);
        if (this.sfxPreviewCooldown <= 0) {
          audio.playSfx('hop');
          this.sfxPreviewCooldown = 0.18;
        }
      },
    });
    this.focus.add({
      id: 'reduceMotion',
      kind: 'toggle',
      rect: this.rows.reduceMotion,
      value: s.reduceMotion ? 1 : 0,
      onChange: (v) => {
        s.reduceMotion = v === 1;
        setHitstopReduceMotion(s.reduceMotion);
        setShakeReduceMotion(s.reduceMotion);
        setTransitionsReduceMotion(s.reduceMotion);
        writeSave(this.save);
      },
    });
    this.focus.add({
      id: 'onScreenDpad',
      kind: 'toggle',
      rect: this.rows.onScreenDpad,
      value: s.onScreenDpad ? 1 : 0,
      onChange: (v) => {
        s.onScreenDpad = v === 1;
        writeSave(this.save);
      },
    });

    for (const { action } of BIND_ROWS) {
      this.focus.add({
        id: `bind_${action}`,
        kind: 'button',
        rect: this.rows[`bind_${action}`],
        onActivate: () => {
          this.awaitingBind = action;
        },
      });
    }

    this.focus.add({
      id: 'reset',
      kind: 'button',
      rect: this.rows.reset,
      onActivate: () => this.handleReset(),
    });
    this.focus.add({
      id: 'back',
      kind: 'button',
      rect: this.rows.back,
      onActivate: () => this.close(),
    });
  }

  private handleReset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetArmedT = 0;
      return;
    }
    this.save.hiScore = 0;
    this.save.leaderboard = [];
    writeSave(this.save);
    this.resetArmed = false;
    this.toastText = 'Best scores reset';
    this.toastT = 0;
  }

  update(dt: number): void {
    transitions.update(dt);
    if (this.sfxPreviewCooldown > 0) this.sfxPreviewCooldown -= dt;
    if (this.resetArmed) {
      this.resetArmedT += dt;
      if (this.resetArmedT > RESET_ARM_WINDOW_S) this.resetArmed = false;
    }
    if (this.toastText) {
      this.toastT += dt;
      if (this.toastT > TOAST_DURATION_S) this.toastText = null;
    }
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const accent = theme.palette.accentA;
    drawCard(r, this.cardRect, accent);

    r.text('SETTINGS', CANVAS_WIDTH / 2, this.cardRect.y + 34, {
      size: 24,
      weight: 700,
      align: 'center',
      color: INK,
    });

    const s = this.save.settings;
    const labelX = this.cardRect.x + 28;

    this.label(r, labelX, this.rows.master, 'MASTER');
    this.slider(r, 'master', s.master);
    this.label(r, labelX, this.rows.music, 'MUSIC');
    this.slider(r, 'music', s.music);
    this.label(r, labelX, this.rows.sfx, 'SFX');
    this.slider(r, 'sfx', s.sfx);

    this.label(r, labelX, this.rows.reduceMotion, 'REDUCE MOTION');
    this.toggle(r, 'reduceMotion', s.reduceMotion, accent);
    this.label(r, labelX, this.rows.onScreenDpad, 'ON-SCREEN D-PAD');
    this.toggle(r, 'onScreenDpad', s.onScreenDpad, accent);

    // M8 fix-up spec item 4: ink at 70% alpha, not the world's own accentB (world 1's accentB,
    // #FF6B6B, reads as the reserved danger red - ART_BIBLE.md section 3 keeps that colour for the
    // timer and death flash only).
    r.text('CONTROLS - press to bind, Esc cancels', labelX, this.rows.__controlsLabel.y, {
      size: 12,
      weight: 700,
      align: 'left',
      color: 'rgba(27, 42, 29, 0.7)',
    });

    for (const { action, label } of BIND_ROWS) {
      const id = `bind_${action}`;
      const rect = this.rows[id];
      const bound = s.keys[action];
      const display =
        this.awaitingBind === action
          ? 'Press a key...'
          : `${label}: ${friendlyKeyName(bound ?? defaultBindingDisplay(action))}`;
      drawButton(
        r,
        rect,
        display,
        {
          hover: this.focus.isHovered(id),
          pressed: this.focus.isPressed(id),
          focused: this.focus.isFocused(id) || this.awaitingBind === action,
        },
        { accent, size: 12 },
      );
    }

    drawButton(
      r,
      this.rows.reset,
      this.resetArmed ? 'CONFIRM RESET?' : 'RESET BEST SCORES',
      {
        hover: this.focus.isHovered('reset'),
        pressed: this.focus.isPressed('reset'),
        focused: this.focus.isFocused('reset'),
      },
      { accent: this.resetArmed ? '#FF4D4D' : accent },
    );
    drawButton(
      r,
      this.rows.back,
      'BACK',
      {
        hover: this.focus.isHovered('back'),
        pressed: this.focus.isPressed('back'),
        focused: this.focus.isFocused('back'),
      },
      { accent },
    );

    if (this.toastText) {
      r.text(this.toastText, CANVAS_WIDTH / 2, this.rows.back.y + this.rows.back.h + 22, {
        size: 13,
        weight: 600,
        align: 'center',
        color: accent,
      });
    }

    transitions.render(r);
  }

  private label(r: Renderer, x: number, rect: Rect, text: string): void {
    r.text(text, x, rect.y + rect.h / 2, { size: 13, weight: 600, align: 'left', color: INK });
  }

  private slider(r: Renderer, id: 'master' | 'music' | 'sfx', value: number): void {
    const rect = this.rows[id];
    drawSlider(r, rect, value / 100, {
      hover: this.focus.isHovered(id),
      focused: this.focus.isFocused(id),
      dragging: this.focus.isDragging(id),
    });
    r.text(String(value), rect.x + rect.w + 34, rect.y + rect.h / 2, {
      size: 13,
      weight: 700,
      align: 'center',
      color: INK,
    });
  }

  private toggle(
    r: Renderer,
    id: 'reduceMotion' | 'onScreenDpad',
    on: boolean,
    accent: string,
  ): void {
    const rect = this.rows[id];
    drawToggle(
      r,
      rect,
      on,
      { hover: this.focus.isHovered(id), focused: this.focus.isFocused(id) },
      accent,
    );
  }

  onAction(a: InputAction): void {
    if (this.awaitingBind) return; // consumed entirely by the raw keydown listener above
    if (transitions.isActive()) return;
    if (this.focus.handleAction(a)) return;
  }
}

function defaultBindingDisplay(action: BindAction): string {
  const defaults: Record<BindAction, string> = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    confirm: 'Enter',
    pause: 'Escape',
  };
  return defaults[action];
}
