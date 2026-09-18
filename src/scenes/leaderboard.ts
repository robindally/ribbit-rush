// Leaderboard screen: top 10 scores, reachable from the Title (M7 spec section 4), restyled onto
// the shared UI kit for M8. Dismissed by its Back button, Escape/B, or any other input (same
// "any input" precedent every other read-only card in this codebase already uses).

import type { Scene, SceneManager } from '../core/loop';
import type { SaveData } from '../core/save';
import * as transitions from '../fx/transitions';
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

const GOLD = '#FFC83D';
const TAB_MUTED = 'rgba(27, 42, 29, 0.5)';
const TAB_BASELINE = 'rgba(27, 42, 29, 0.18)';

const ROW_SLOTS = 10; // matches core/save.ts's LEADERBOARD_MAX

/** M9: "the Leaderboard screen gets a tab or toggle between Campaign and Endless"
 * (docs/specs/M9-endless-skins.md section 1). */
type BoardTab = 'campaign' | 'endless';

export class LeaderboardScene implements Scene {
  private focus = new FocusManager();
  private backRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private tabRects: Record<BoardTab, Rect> = {
    campaign: { x: 0, y: 0, w: 0, h: 0 },
    endless: { x: 0, y: 0, w: 0, h: 0 },
  };
  private tab: BoardTab = 'campaign';

  constructor(
    private scenes: SceneManager,
    private save: SaveData,
  ) {}

  enter(): void {
    const w = CANVAS_WIDTH * 0.86;
    const h = CANVAS_HEIGHT * 0.78;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    this.backRect = { x: x + w / 2 - 90, y: y + h - 58, w: 180, h: 40 };
    const tabW = 150;
    const tabH = 34;
    const tabGap = 10;
    const tabY = y + h * 0.13;
    this.tabRects = {
      campaign: { x: CANVAS_WIDTH / 2 - tabW - tabGap / 2, y: tabY, w: tabW, h: tabH },
      endless: { x: CANVAS_WIDTH / 2 + tabGap / 2, y: tabY, w: tabW, h: tabH },
    };

    this.focus.clear();
    this.focus.add({
      id: 'tab-campaign',
      kind: 'button',
      rect: this.tabRects.campaign,
      onActivate: () => {
        this.tab = 'campaign';
      },
    });
    this.focus.add({
      id: 'tab-endless',
      kind: 'button',
      rect: this.tabRects.endless,
      onActivate: () => {
        this.tab = 'endless';
      },
    });
    this.focus.add({
      id: 'back',
      kind: 'button',
      rect: this.backRect,
      onActivate: () => this.close(),
    });
    const canvas = document.getElementById('game');
    if (canvas instanceof HTMLCanvasElement)
      this.focus.attach(canvas, { onCancel: () => this.close() });
    pushActiveFocusManager(this.focus);
  }

  exit(): void {
    this.focus.detach();
    popActiveFocusManager(this.focus);
  }

  private close(): void {
    this.scenes.pop();
  }

  update(dt: number): void {
    transitions.update(dt);
  }

  render(r: Renderer, _alpha: number): void {
    r.ctx.fillStyle = '#14162b';
    r.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const theme = getWorldTheme(1);
    const w = CANVAS_WIDTH * 0.86;
    const h = CANVAS_HEIGHT * 0.78;
    const x = (CANVAS_WIDTH - w) / 2;
    const y = (CANVAS_HEIGHT - h) / 2;
    drawCard(r, { x, y, w, h }, theme.palette.accentA);

    r.text('LEADERBOARD', CANVAS_WIDTH / 2, y + h * 0.06, {
      size: 22,
      weight: 700,
      align: 'center',
      color: INK,
    });

    this.renderTabs(r, theme.palette.accentA);

    if (this.tab === 'campaign') this.renderCampaignRows(r, x, y, w, h);
    else this.renderEndlessRows(r, x, y, w, h);

    drawButton(
      r,
      this.backRect,
      'BACK',
      {
        hover: this.focus.isHovered('back'),
        pressed: this.focus.isPressed('back'),
        focused: this.focus.isFocused('back'),
      },
      { accent: theme.palette.accentA },
    );

    transitions.render(r);
  }

  /** M10: real tabs, not two relabelled `drawButton` pills (the M9 "Known gaps" note this closes) -
   * a shared baseline across the whole row, an accent underline only beneath the *active* tab, bold
   * ink label on the active tab vs. a muted one on the inactive tab, and the kit's own cream focus
   * ring for keyboard/gamepad parity with every other control. */
  private renderTabs(r: Renderer, accent: string): void {
    const tabs: { tab: BoardTab; label: string; id: string }[] = [
      { tab: 'campaign', label: 'CAMPAIGN', id: 'tab-campaign' },
      { tab: 'endless', label: 'ENDLESS', id: 'tab-endless' },
    ];
    const first = this.tabRects.campaign;
    const last = this.tabRects.endless;
    const baselineY = first.y + first.h;

    // One continuous baseline under both tabs, so the active one's underline reads as "part of
    // this row" rather than a floating bar.
    r.ctx.save();
    r.ctx.fillStyle = TAB_BASELINE;
    r.ctx.fillRect(first.x, baselineY - 1, last.x + last.w - first.x, 2);
    r.ctx.restore();

    for (const { tab, label, id } of tabs) {
      const rect = this.tabRects[tab];
      const active = this.tab === tab;
      const hovered = this.focus.isHovered(id);
      const cx = rect.x + rect.w / 2;

      r.ctx.save();
      if (hovered && !active) r.ctx.globalAlpha = 0.85;
      r.text(label, cx, rect.y + rect.h * 0.42, {
        size: 15,
        weight: 700,
        align: 'center',
        color: active ? INK : TAB_MUTED,
      });
      r.ctx.restore();

      if (active) {
        r.ctx.save();
        r.ctx.fillStyle = accent;
        roundRect(r, rect.x + rect.w * 0.1, baselineY - 2, rect.w * 0.8, 3, 1.5);
        r.ctx.fill();
        r.ctx.restore();
      }

      if (this.focus.isFocused(id)) {
        r.ctx.save();
        r.ctx.strokeStyle = '#FFF7E6';
        r.ctx.lineWidth = 2;
        r.ctx.beginPath();
        r.ctx.rect(rect.x + 2, rect.y - 2, rect.w - 4, rect.h + 4);
        r.ctx.stroke();
        r.ctx.restore();
      }
    }
  }

  private renderCampaignRows(r: Renderer, x: number, y: number, w: number, h: number): void {
    const entries = this.save.leaderboard.slice(0, ROW_SLOTS);
    if (entries.length === 0) {
      r.text('No scores yet - be the first!', CANVAS_WIDTH / 2, y + h * 0.45, {
        size: 15,
        weight: 500,
        align: 'center',
        color: INK,
      });
      return;
    }
    const top = y + h * 0.25;
    const bottom = y + h * 0.82;
    const rowH = (bottom - top) / ROW_SLOTS;
    entries.forEach((e, i) => {
      const ry = top + i * rowH + rowH / 2;
      const color = i === 0 ? GOLD : INK;
      r.text(`${i + 1}.`, x + w * 0.07, ry, { size: 14, weight: 700, align: 'left', color });
      r.text(e.name, x + w * 0.17, ry, { size: 14, weight: 700, align: 'left', color });
      r.text(String(e.score), x + w * 0.42, ry, { size: 14, weight: 600, align: 'left', color: INK });
      r.text(`W${e.world}-L${e.level}`, x + w * 0.68, ry, {
        size: 12,
        weight: 500,
        align: 'left',
        color: INK,
      });
      r.text(e.date, x + w * 0.93, ry, { size: 11, weight: 500, align: 'right', color: INK });
    });
  }

  private renderEndlessRows(r: Renderer, x: number, y: number, w: number, h: number): void {
    const entries = this.save.endlessLeaderboard.slice(0, ROW_SLOTS);
    if (entries.length === 0) {
      r.text('No runs yet - be the first!', CANVAS_WIDTH / 2, y + h * 0.45, {
        size: 15,
        weight: 500,
        align: 'center',
        color: INK,
      });
      return;
    }
    const top = y + h * 0.25;
    const bottom = y + h * 0.82;
    const rowH = (bottom - top) / ROW_SLOTS;
    entries.forEach((e, i) => {
      const ry = top + i * rowH + rowH / 2;
      const color = i === 0 ? GOLD : INK;
      r.text(`${i + 1}.`, x + w * 0.07, ry, { size: 14, weight: 700, align: 'left', color });
      r.text(e.name, x + w * 0.17, ry, { size: 14, weight: 700, align: 'left', color });
      r.text(`${e.crossings} crossings`, x + w * 0.42, ry, {
        size: 13,
        weight: 600,
        align: 'left',
        color: INK,
      });
      r.text(String(e.score), x + w * 0.74, ry, { size: 12, weight: 500, align: 'left', color: INK });
      r.text(e.date, x + w * 0.93, ry, { size: 11, weight: 500, align: 'right', color: INK });
    });
  }

  onAction(a: InputAction): void {
    if (transitions.isActive()) return;
    if (this.focus.handleAction(a)) return;
    this.close();
  }
}
