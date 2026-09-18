// Power-up badges, the Bubble Shield bubble, the Freeze Frame vignette, the Mega Hop chevron, and
// the lady frog (on a log, and riding the frog's back). See docs/specs/M7-powerups-scoring.md,
// docs/ART_BIBLE.md section 3 ("Power-ups are 0.8-tile circular badges. They bob 3px at 1.5Hz and
// pulse a soft glow") and section 4 ("Lady frog... rides on the frog's back").

import { CANVAS_HEIGHT, CANVAS_WIDTH, MEGA_HOP_ARC_TILES, TILE } from '../../game/constants';
import type { Frog, PowerupKind } from '../../game/types';
import { frogHopArc, frogIdleBreath } from '../anim';
import type { Renderer } from '../renderer';

const SPRITE_NAME: Record<PowerupKind, string> = {
  shield: 'powerup-shield',
  freeze: 'powerup-freeze',
  clock: 'powerup-clock',
  megahop: 'powerup-megahop',
};

const BOB_PX = 3;
const BOB_HZ = 1.5;

function bobPx(elapsed: number): number {
  return BOB_PX * Math.sin(elapsed * Math.PI * 2 * BOB_HZ);
}

/** The frog's current screen y (hop arc included, Mega Hop's taller arc detected the same way
 * `render/draw/entities.ts`'s `drawFrog` does) - shared by the shield bubble and the lady-frog-
 * on-back draw so both track the frog exactly, including mid-hop. */
function frogScreenY(frog: Frog): number {
  const groundY = frog.row * TILE + TILE / 2;
  if (frog.state !== 'hopping') return groundY;
  const isMegaHop = Math.abs(frog.toRow - frog.fromRow) === 2;
  const arcTiles = frogHopArc(frog.hopT, isMegaHop ? MEGA_HOP_ARC_TILES : undefined);
  return groundY - arcTiles * TILE;
}

/** A power-up badge riding a platform or sitting on the median: white ring, coloured disc, simple
 * icon (ART_BIBLE.md section 4) - baked into the sprite itself; this only adds the bob and glow
 * pulse animation, which is a render-time concern the sprite can't express. */
export function drawPowerupBadge(
  r: Renderer,
  powerup: { kind: PowerupKind; row: number; x: number },
  elapsed: number,
): void {
  const cx = (powerup.x + 0.5) * TILE;
  const cy = powerup.row * TILE + TILE / 2 + bobPx(elapsed);

  const glowAlpha = 0.2 + 0.15 * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 * BOB_HZ));
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = glowAlpha;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, TILE * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  r.sprite(SPRITE_NAME[powerup.kind], cx, cy);
}

/** Translucent blue bubble around the frog while Bubble Shield is armed (ART_BIBLE.md section 3:
 * "#3E9CE6 bubble on white ring"). */
export function drawShieldBubble(r: Renderer, frog: Frog, elapsed: number): void {
  const cx = (frog.x + 0.5) * TILE;
  const cy = frogScreenY(frog);
  const pulse = 1 + 0.05 * Math.sin(elapsed * Math.PI * 2 * 2);

  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#3E9CE6';
  ctx.beginPath();
  ctx.arc(cx, cy, TILE * 0.62 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** A lime up-chevron hovering above the frog while Mega Hop is armed and not yet used
 * (ART_BIBLE.md section 3: "#8BEA7B double chevron on white ring"). */
export function drawMegaHopChevron(r: Renderer, frog: Frog, elapsed: number): void {
  const cx = (frog.x + 0.5) * TILE;
  const cy = frogScreenY(frog) - TILE * 0.62 + Math.sin(elapsed * Math.PI * 2 * 2) * 2;

  const ctx = r.ctx;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#3FA84A';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dy of [3, -5]) {
    ctx.beginPath();
    ctx.moveTo(-7, dy + 4);
    ctx.lineTo(0, dy - 4);
    ctx.lineTo(7, dy + 4);
    ctx.stroke();
  }
  ctx.restore();
}

/** The lady frog sitting on her log, not yet picked up (ART_BIBLE.md section 4: "frog-idle
 * recoloured to the bible's pink palette with a bow"). Drawn a touch smaller than the player frog
 * so it doesn't read as a second player. */
export function drawLadyFrogOnField(
  r: Renderer,
  ladyFrog: { row: number; x: number },
  elapsed: number,
): void {
  const cx = (ladyFrog.x + 0.5) * TILE;
  const cy = ladyFrog.row * TILE + TILE / 2;
  const breath = frogIdleBreath(elapsed) * 0.7;
  r.sprite('lady-frog', cx, cy, { sx: breath, sy: breath });
}

/** The lady frog riding the player frog's back once picked up (spec section 2: "rides on the
 * frog's back (draw a small pink frog offset up 6px on the frog)"). */
export function drawLadyFrogOnBack(r: Renderer, frog: Frog, elapsed: number): void {
  const cx = (frog.x + 0.5) * TILE;
  const cy = frogScreenY(frog) - 6;
  const breath = frogIdleBreath(elapsed) * 0.55;
  r.sprite('lady-frog', cx, cy, { sx: breath, sy: breath });
}

// --- Freeze Frame vignette (spec section 1: "Draw a light-blue vignette and frost the HUD edge")

const VIGNETTE_MAX_ALPHA = 0.35;
const VIGNETTE_COLOR = '124, 199, 255'; // #7CC7FF, ART_BIBLE.md section 3's Freeze Frame token

let vignetteGradient: CanvasGradient | null = null;

function getVignetteGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  if (!vignetteGradient) {
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const inner = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.3;
    const outer = Math.max(CANVAS_WIDTH, CANVAS_HEIGHT) * 0.72;
    vignetteGradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    vignetteGradient.addColorStop(0, `rgba(${VIGNETTE_COLOR}, 0)`);
    // The vignette reaches full canvas edges (including the HUD bands, top/bottom rows) at its
    // strongest, which is what reads as "frost the HUD edge" - one full-canvas layer covers both.
    vignetteGradient.addColorStop(1, `rgba(${VIGNETTE_COLOR}, 0.9)`);
  }
  return vignetteGradient;
}

/** `intensity` is `1 - freezeLaneTimeScale(t)` (0..1) - full while lanes are fully stopped, fading
 * out over the 0.5s resume window, computed by the caller (`scenes/play.ts`) from
 * `World.freezeElapsed` so this module stays free of any gameplay-timing knowledge. No-ops below a
 * visibility threshold rather than drawing an invisible full-canvas rect every frame. */
export function drawFreezeVignette(r: Renderer, intensity: number): void {
  const clamped = Math.max(0, Math.min(1, intensity));
  if (clamped <= 0.002) return;
  const ctx = r.ctx;
  ctx.save();
  ctx.globalAlpha = clamped * VIGNETTE_MAX_ALPHA;
  ctx.fillStyle = getVignetteGradient(ctx);
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.restore();
}
