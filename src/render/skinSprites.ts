// M9: applies a frog skin to the running game by recolouring `frog-idle`/`frog-jump`'s raw SVG
// text (`game/skins.ts`'s `recolorFrogSvg`) and overwriting the already-rasterised sprite caches
// in `render/sprites.ts` under their *existing* names/scales - so every current draw call site
// (`render/draw/entities.ts`'s `drawFrog`, `render/draw/hud.ts`'s lives icons, `scenes/title.ts`'s
// hero and logo-peek frog) picks up the new skin automatically, with no changes needed at any of
// them. See docs/specs/M9-endless-skins.md section 2.

import { getSkin, recolorFrogSvg } from '../game/skins';
import { getRawSpriteSource, rasterizeSvgSource, setAtlasSprite, setScaledSprite } from './sprites';

/** The two (name, scale) pairs the rest of the codebase actually rasterises `frog-idle` at above
 * 1x - `scenes/title.ts`'s `HERO_SCALE`/`LOGO_FROG_SCALE`. `frog-jump` is only ever drawn at 1x. */
const HERO_SCALES = [1.5, 3];

let currentSkinId = 'classic';
let applying: Promise<void> | null = null;

export function currentSkin(): string {
  return currentSkinId;
}

/** Recolours and re-rasterises `frog-idle`/`frog-jump` for `skinId`, then overwrites every sprite
 * cache entry the rest of the renderer already reads from. Safe to call repeatedly (e.g. every
 * time the Title's skin picker selects a new swatch); a call for the skin already applied is a
 * no-op. Callers that need the reskin to have actually landed before their next render (the Title
 * picker, `window.__rr.skins.select`) should await it; `main.ts`'s boot-time call is fire-and-forget
 * since the very first frame using the default 'classic' skin needs no recolour at all. */
export async function applySkin(skinId: string): Promise<void> {
  const skin = getSkin(skinId);
  currentSkinId = skin.id;

  const idleSource = getRawSpriteSource('frog-idle');
  const jumpSource = getRawSpriteSource('frog-jump');
  const alpha = skin.ghost ? 0.7 : 1;

  const work: Promise<void>[] = [];

  if (idleSource) {
    const recoloredIdle = recolorFrogSvg(idleSource, skin);
    work.push(
      rasterizeSvgSource(recoloredIdle, 1, alpha).then((img) => setAtlasSprite('frog-idle', img)),
    );
    for (const scale of HERO_SCALES) {
      work.push(
        rasterizeSvgSource(recoloredIdle, scale, alpha).then((img) =>
          setScaledSprite('frog-idle', scale, img),
        ),
      );
    }
  }

  if (jumpSource) {
    const recoloredJump = recolorFrogSvg(jumpSource, skin);
    work.push(
      rasterizeSvgSource(recoloredJump, 1, alpha).then((img) => setAtlasSprite('frog-jump', img)),
    );
  }

  const p = Promise.all(work).then(() => undefined);
  applying = p;
  await p;
  if (applying === p) applying = null;
}

/** The hat overlay sprite name for the current skin, or null (docs/specs/M9-endless-skins.md
 * section 2's hat table). Only ever the 1x asset - hats aren't rasterised at any other scale. */
export function currentHatSprite(): string | null {
  const hat = getSkin(currentSkinId).hat;
  return hat ? `hat-${hat}` : null;
}
