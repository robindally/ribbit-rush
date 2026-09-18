// Reusable UI kit for every menu screen (M8 spec: "Every menu uses it"). Button (pill, accentA
// fill, darker bottom edge, 2px press-down, 3px cream focus ring), Slider, Toggle, Card, and a
// FocusManager that keyboard (arrows/Enter/Escape), gamepad (d-pad/stick/A/B/Start - already
// funnelled into the same InputAction stream by core/input.ts), and pointer (hover/tap) all drive.
// See docs/ART_BIBLE.md section 8 ("Typography and UI") and docs/specs/M8-ui-input.md sections 1-2.
//
// Drawing is stateless (pass the visual state in); interaction state (focus/hover/press/drag) is
// owned by `FocusManager`, one instance per scene, registered once (`enter()`/constructor) and
// queried every render call. Pointer input is read directly off the canvas (mouse + touch) rather
// than through `InputAction`, since a click needs real coordinates; `FocusManager.attach` also
// registers its controls' rects with `core/input.ts`'s touch-exclusion stack so a tap on a button
// never *also* fires a swipe/tap gameplay hop for the same gesture (see `core/input.ts`'s own
// doc comment on `pushTouchExclusion`).

import * as audio from '../core/audio';
import {
  getLastInputDevice,
  isTopInputOwner,
  noteInputDevice,
  popInputOwner,
  popTouchExclusion,
  pushInputOwner,
  pushTouchExclusion,
} from '../core/input';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants';
import type { InputAction } from '../game/types';
import { roundRect } from './draw/background';
import type { Renderer } from './renderer';

export const CREAM = '#FFF7E6';
export const INK = '#1B2A1D';
export const ACCENT_A_FALLBACK = '#FFB640';
const MUTED = '#9AA08C';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// --- Colour helpers ---

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Darkens `hex` toward black by `amount` (0..1). Used for the button's bottom edge (ART_BIBLE.md
 * section 8: "4px bottom edge, 22% darker"). */
export function darken(hex: string, amount: number): string {
  const [r, g, bch] = hexToRgb(hex);
  const f = 1 - amount;
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(bch * f)})`;
}

function strokeRoundRect(
  r: Renderer,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const ctx = r.ctx;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.stroke();
}

// --- Card (ART_BIBLE.md section 8: "Rounded 24px panel in cream at 96% alpha, ink text, world
// accent stripe along the top") ---

export function drawCard(r: Renderer, rect: Rect, accent: string, radius = 24): void {
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = CREAM;
  roundRect(r, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  roundRect(r, rect.x, rect.y, rect.w, 10, 10);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.restore();
}

// --- Button (ART_BIBLE.md section 8: "Pill shape, accentA fill, 4px bottom edge 22% darker, ink
// text, press moves the pill 2px down. Focus ring 3px cream.") ---

export interface ButtonState {
  hover: boolean;
  pressed: boolean;
  focused: boolean;
  disabled?: boolean;
}

export interface ButtonOpts {
  accent?: string;
  size?: number;
  weight?: number;
  sublabel?: string;
  /** Drawn left of the label, e.g. a lock glyph for the locked Endless button. */
  prefix?: string;
}

const PRESS_OFFSET_PX = 2;
const EDGE_H_PX = 4;
const FOCUS_RING_PX = 3;

export function drawButton(
  r: Renderer,
  rect: Rect,
  label: string,
  state: ButtonState,
  opts: ButtonOpts = {},
): void {
  const ctx = r.ctx;
  const accent = opts.accent ?? ACCENT_A_FALLBACK;
  const radius = rect.h / 2;
  const pressY = state.pressed && !state.disabled ? PRESS_OFFSET_PX : 0;
  const fill = state.disabled ? MUTED : accent;

  ctx.save();
  if (state.disabled) ctx.globalAlpha = 0.7;

  // Darker bottom edge, drawn first so it peeks out beneath the (possibly pressed) top pill.
  ctx.fillStyle = darken(fill, 0.22);
  roundRect(r, rect.x, rect.y + EDGE_H_PX, rect.w, rect.h, radius);

  // Top pill.
  ctx.fillStyle = fill;
  roundRect(r, rect.x, rect.y + pressY, rect.w, rect.h, radius);

  if (state.hover && !state.disabled && !state.pressed) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFFFFF';
    roundRect(r, rect.x, rect.y + pressY, rect.w, rect.h, radius);
    ctx.restore();
  }

  if (state.focused) {
    ctx.save();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = FOCUS_RING_PX;
    strokeRoundRect(r, rect.x - 2, rect.y + pressY - 2, rect.w + 4, rect.h + 4, radius + 2);
    ctx.restore();
  }

  const label2 = opts.prefix ? `${opts.prefix} ${label}` : label;
  r.text(label2, rect.x + rect.w / 2, rect.y + pressY + rect.h / 2 - (opts.sublabel ? 6 : 0), {
    size: opts.size ?? 18,
    weight: opts.weight ?? 700,
    align: 'center',
    color: INK,
  });
  if (opts.sublabel) {
    r.text(opts.sublabel, rect.x + rect.w / 2, rect.y + pressY + rect.h / 2 + 12, {
      size: 10,
      weight: 600,
      align: 'center',
      color: INK,
    });
  }
  ctx.restore();
}

// --- Slider ---

export interface SliderState {
  hover: boolean;
  focused: boolean;
  dragging: boolean;
}

export function drawSlider(
  r: Renderer,
  rect: Rect,
  value01: number,
  state: SliderState,
  accent = ACCENT_A_FALLBACK,
): void {
  const ctx = r.ctx;
  const trackH = Math.max(8, rect.h * 0.35);
  const trackY = rect.y + (rect.h - trackH) / 2;
  const v = Math.max(0, Math.min(1, value01));

  ctx.save();
  ctx.fillStyle = 'rgba(255, 247, 230, 0.28)';
  roundRect(r, rect.x, trackY, rect.w, trackH, trackH / 2);
  ctx.fillStyle = accent;
  roundRect(r, rect.x, trackY, Math.max(trackH, rect.w * v), trackH, trackH / 2);
  ctx.restore();

  const knobR = rect.h * 0.42 * (state.dragging ? 1.12 : state.hover ? 1.05 : 1);
  const knobX = rect.x + rect.w * v;
  const knobY = rect.y + rect.h / 2;

  ctx.save();
  ctx.fillStyle = CREAM;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (state.focused) {
    ctx.save();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = FOCUS_RING_PX;
    strokeRoundRect(r, rect.x - 4, rect.y - 2, rect.w + 8, rect.h + 4, rect.h / 2 + 2);
    ctx.restore();
  }
}

// --- Toggle ---

export interface ToggleState {
  hover: boolean;
  focused: boolean;
}

export function drawToggle(
  r: Renderer,
  rect: Rect,
  on: boolean,
  state: ToggleState,
  accent = ACCENT_A_FALLBACK,
): void {
  const ctx = r.ctx;
  ctx.save();
  ctx.fillStyle = on ? accent : 'rgba(27, 42, 29, 0.25)';
  roundRect(r, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
  if (state.hover) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#FFFFFF';
    roundRect(r, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.restore();
  }
  const knobR = rect.h / 2 - 3;
  const knobX = on ? rect.x + rect.w - rect.h / 2 : rect.x + rect.h / 2;
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(knobX, rect.y + rect.h / 2, knobR, 0, Math.PI * 2);
  ctx.fill();

  if (state.focused) {
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = FOCUS_RING_PX;
    strokeRoundRect(r, rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, rect.h / 2 + 3);
  }
  ctx.restore();
}

// --- Touch button (M8 spec section 3: on-screen d-pad + pause button - "56px translucent
// buttons with press feedback") ---
//
// Visually distinct from `drawButton` (menu pills): these sit directly over live gameplay, so
// they're a plain translucent rounded square with a glyph, not an opaque accent-coloured pill.

export function drawTouchButton(r: Renderer, rect: Rect, glyph: string, pressed: boolean): void {
  const ctx = r.ctx;
  const offset = pressed ? 2 : 0;
  ctx.save();
  ctx.globalAlpha = pressed ? 0.55 : 0.3;
  ctx.fillStyle = CREAM;
  roundRect(r, rect.x, rect.y + offset, rect.w, rect.h, rect.h * 0.28);
  ctx.restore();
  r.text(glyph, rect.x + rect.w / 2, rect.y + offset + rect.h / 2, {
    size: rect.h * 0.42,
    weight: 700,
    align: 'center',
    color: CREAM,
  });
}

// --- Action hints (M8 spec section 4: gamepad glyphs when a pad was the last input) ---

export function actionHint(kind: 'confirm' | 'back'): string {
  const device = getLastInputDevice();
  if (device === 'gamepad') return kind === 'confirm' ? '(A)' : '(B)';
  if (device === 'touch') return 'Tap';
  return kind === 'confirm' ? 'Enter' : 'Esc';
}

// --- FocusManager ---

export type ControlKind = 'button' | 'slider' | 'toggle';

export interface ControlDef {
  id: string;
  kind: ControlKind;
  rect: Rect;
  disabled?: boolean;
  /** Slider: 0..1. Toggle: 0 (off) or 1 (on). Unused for buttons. */
  value?: number;
  /** Slider keyboard/gamepad adjust step, default 0.1 (10%). */
  step?: number;
  /** Button/toggle activation (Enter/A/click/tap). */
  onActivate?: () => void;
  /** Slider drag/keyboard adjust, and toggle flip - called with the new 0..1 value. */
  onChange?: (value01: number) => void;
}

/** Client (viewport) coordinates -> the renderer's logical (624x720) coordinate space. Exported
 * for `scenes/play.ts`'s on-screen d-pad/pause button, which need the same conversion
 * `FocusManager` uses internally but aren't focus-navigable menu controls themselves. */
export function clientToLogical(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

export class FocusManager {
  private controls: ControlDef[] = [];
  private order: string[] = [];
  private focusId: string | null = null;
  private hoverId: string | null = null;
  private pressedId: string | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private cancel: (() => void) | undefined;

  private boundMouseMove = (e: MouseEvent): void => this.onPointerMove(e.clientX, e.clientY);
  private boundMouseDown = (e: MouseEvent): void => this.onPointerDown(e.clientX, e.clientY);
  private boundMouseUp = (e: MouseEvent): void => this.onPointerUp(e.clientX, e.clientY);
  private boundTouchStart = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    if (t) this.onPointerDown(t.clientX, t.clientY);
  };
  private boundTouchMove = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    if (t) this.onPointerMove(t.clientX, t.clientY);
  };
  private boundTouchEnd = (e: TouchEvent): void => {
    const t = e.changedTouches[0];
    if (t) this.onPointerUp(t.clientX, t.clientY);
  };
  private hitTestFn = (x: number, y: number): boolean => this.hitAny(x, y);

  add(c: ControlDef): void {
    this.controls.push(c);
    this.order.push(c.id);
  }

  clear(): void {
    this.controls = [];
    this.order = [];
    this.focusId = null;
    this.hoverId = null;
    this.pressedId = null;
  }

  get(id: string): ControlDef | undefined {
    return this.controls.find((c) => c.id === id);
  }

  isFocused(id: string): boolean {
    return this.focusId === id;
  }

  isHovered(id: string): boolean {
    return this.hoverId === id;
  }

  isPressed(id: string): boolean {
    return this.pressedId === id;
  }

  isDragging(id: string): boolean {
    return this.pressedId === id && this.get(id)?.kind === 'slider';
  }

  /** Sets initial keyboard/gamepad focus without simulating a full navigation step (no `uiMove`
   * SFX) - used by screens that want a specific control pre-focused (e.g. Settings' first row). */
  focus(id: string | null): void {
    this.focusId = id;
  }

  attach(canvas: HTMLCanvasElement, opts?: { onCancel?: () => void }): void {
    this.canvas = canvas;
    this.cancel = opts?.onCancel;
    canvas.addEventListener('mousemove', this.boundMouseMove);
    canvas.addEventListener('mousedown', this.boundMouseDown);
    window.addEventListener('mouseup', this.boundMouseUp);
    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    canvas.addEventListener('touchmove', this.boundTouchMove, { passive: true });
    canvas.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    pushTouchExclusion(this.hitTestFn);
    // See core/input.ts's own doc comment on `pushInputOwner`: a scene pushed on top of this one
    // (e.g. Settings over Pause) doesn't `exit()` it, so its raw listeners above stay registered -
    // this token is what keeps them from *acting* while they're covered.
    pushInputOwner(this);
  }

  detach(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchmove', this.boundTouchMove);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
    }
    window.removeEventListener('mouseup', this.boundMouseUp);
    popTouchExclusion(this.hitTestFn);
    popInputOwner(this);
    this.canvas = null;
    this.pressedId = null;
  }

  private hitAny(x: number, y: number): boolean {
    return this.controls.some((c) => inRect(x, y, c.rect));
  }

  private controlAt(x: number, y: number): ControlDef | undefined {
    return this.controls.find((c) => inRect(x, y, c.rect));
  }

  private onPointerMove(clientX: number, clientY: number): void {
    if (!this.canvas || !isTopInputOwner(this)) return;
    const p = clientToLogical(this.canvas, clientX, clientY);
    if (!p) return;
    const hit = this.controlAt(p.x, p.y);
    this.hoverId = hit ? hit.id : null;
    if (this.pressedId) {
      const c = this.get(this.pressedId);
      if (c && c.kind === 'slider') this.setSliderFromPoint(c, p.x);
    }
  }

  private onPointerDown(clientX: number, clientY: number): void {
    if (!this.canvas || !isTopInputOwner(this)) return;
    const p = clientToLogical(this.canvas, clientX, clientY);
    if (!p) return;
    const hit = this.controlAt(p.x, p.y);
    if (!hit) return;
    noteInputDevice('touch');
    this.pressedId = hit.id;
    this.focusId = hit.id;
    if (hit.kind === 'slider' && !hit.disabled) this.setSliderFromPoint(hit, p.x);
  }

  private onPointerUp(clientX: number, clientY: number): void {
    const wasPressed = this.pressedId;
    this.pressedId = null;
    if (!wasPressed || !this.canvas || !isTopInputOwner(this)) return;
    const p = clientToLogical(this.canvas, clientX, clientY);
    if (!p) return;
    const hit = this.controlAt(p.x, p.y);
    if (hit && hit.id === wasPressed && (hit.kind === 'button' || hit.kind === 'toggle')) {
      this.activate(hit);
    }
  }

  private setSliderFromPoint(c: ControlDef, px: number): void {
    if (c.disabled) return;
    const t = Math.max(0, Math.min(1, (px - c.rect.x) / c.rect.w));
    c.value = t;
    c.onChange?.(t);
  }

  private activate(c: ControlDef): void {
    if (c.disabled) {
      audio.playSfx('bonk');
      return;
    }
    if (c.kind === 'toggle') {
      c.value = c.value ? 0 : 1;
      c.onChange?.(c.value);
    }
    audio.playSfx('uiConfirm');
    c.onActivate?.();
  }

  private focused(): ControlDef | undefined {
    return this.focusId ? this.get(this.focusId) : undefined;
  }

  private moveFocus(dir: 1 | -1): void {
    if (this.order.length === 0) return;
    if (this.focusId === null) {
      this.focusId = dir === 1 ? this.order[0] : this.order[this.order.length - 1];
    } else {
      const i = this.order.indexOf(this.focusId);
      this.focusId = this.order[(i + dir + this.order.length) % this.order.length];
    }
    audio.playSfx('uiMove');
  }

  /** Called from a scene's `onAction`. Returns true when the action was consumed (the scene
   * should stop processing it further); false lets the caller fall back to its own handling
   * (e.g. Title starting the game on Enter/tap with nothing focused - the acceptance's own
   * requirement). */
  handleAction(a: InputAction): boolean {
    if (this.controls.length === 0) return false;

    if (a.type === 'hop') {
      if (a.dir === 'up' || a.dir === 'down') {
        this.moveFocus(a.dir === 'down' ? 1 : -1);
        return true;
      }
      if (a.dir === 'left' || a.dir === 'right') {
        const c = this.focused();
        if (c && c.kind === 'slider' && !c.disabled) {
          const step = c.step ?? 0.1;
          const nv = Math.max(0, Math.min(1, (c.value ?? 0) + (a.dir === 'right' ? step : -step)));
          c.value = nv;
          c.onChange?.(nv);
          audio.playSfx('uiMove');
          return true;
        }
        if (this.focusId === null) {
          this.moveFocus(a.dir === 'right' ? 1 : -1);
          return true;
        }
        return false;
      }
    }

    if (a.type === 'confirm') {
      const c = this.focused();
      if (!c) return false;
      this.activate(c);
      return true;
    }

    if (a.type === 'back' || a.type === 'pause') {
      if (this.cancel) {
        this.cancel();
        return true;
      }
      return false;
    }

    return false;
  }
}

// --- Dev/test hook (M8 spec: "Add window.__rr.ui with the focus manager for testing") ---
//
// Tracks whichever FocusManager belongs to the current top-of-stack menu scene, so a reviewer or
// test script can drive it directly (`window.__rr.ui.current.handleAction({type:'confirm'})`) or
// just read its focus state, without needing a reference to the scene instance itself. A stack
// (not a single slot), for the same reason `core/input.ts`'s touch-exclusion/input-owner stacks
// are: a scene pushed on top (e.g. Settings over Pause) is popped without the thing underneath
// ever re-`enter()`-ing, so a single "last write wins" slot would go stale (null) the moment the
// top scene's own `exit()` cleared it, even though Pause's menu is still live and now current
// again. Scenes that own a FocusManager call `pushActiveFocusManager(this.focus)` in `enter()` and
// `popActiveFocusManager(this.focus)` in `exit()`.

const activeFocusManagerStack: FocusManager[] = [];

export function pushActiveFocusManager(fm: FocusManager): void {
  activeFocusManagerStack.push(fm);
}

export function popActiveFocusManager(fm: FocusManager): void {
  const i = activeFocusManagerStack.lastIndexOf(fm);
  if (i >= 0) activeFocusManagerStack.splice(i, 1);
}

export function getActiveFocusManager(): FocusManager | null {
  return activeFocusManagerStack[activeFocusManagerStack.length - 1] ?? null;
}

// --- Page-level letterbox vignette (M8 spec section 5: "Landscape and desktop letterboxed with a
// subtle world-coloured vignette either side") ---
//
// The canvas itself is already exactly the game's own aspect ratio (renderer.ts's `resize`
// letterboxes it via CSS, scaled to fit); the empty space either side (landscape/desktop) or
// above/below (a very tall portrait phone) is the *page* background outside the canvas, styled
// here as a soft radial wash of the current world's accent colour rather than a flat backdrop.
let lastVignetteAccent: string | null = null;

export function setPageVignette(accentHex: string): void {
  if (accentHex === lastVignetteAccent) return;
  lastVignetteAccent = accentHex;
  const body = document.body;
  body.style.background = `radial-gradient(ellipse at center, #14162b 55%, ${accentHex}26 100%)`;
}
