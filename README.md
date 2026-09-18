# Ribbit Rush

A browser reimagining of the classic hop-across-traffic-and-rivers game. Guide a frog from the
start bank, across five lanes of traffic, over a river on logs and turtles, and into one of five
home slots - five worlds, fifteen campaign levels, an Endless mode with a daily seed, nine
unlockable frog skins, power-ups, near-miss combos, and a streak multiplier. Built with plain
TypeScript and a single `<canvas>` - no game framework, no build-time asset pipeline beyond Vite.

## Controls

| Input | Action |
| --- | --- |
| Arrow keys / WASD | Hop up / down / left / right |
| Enter / Space | Confirm (also starts the game from the Title) |
| Escape / P | Pause / back |
| Touch | Swipe to hop, tap to hop up, or use the on-screen d-pad |
| Gamepad | D-pad or left stick to hop, A to confirm, B to back, Start to pause |

Keys can be remapped in Settings; a remap only *adds* a trigger, it never removes the defaults, so
Enter/Space always starts the game no matter what's been rebound.

## Run it locally

```bash
npm install
npm run dev
```

Opens a dev server (Vite's default port, 5173) with hot reload.

## Build

```bash
npm run build
```

Outputs a static site to `dist/`. Preview the production build locally with:

```bash
npm run preview
```

## Test

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run - pure game/core logic, no canvas or audio
npm run coverage     # vitest run --coverage
npm run e2e          # builds, then a Playwright smoke test against the production build
```

`npm run e2e` is a separate script (Playwright is a dev dependency only, never bundled into the
game) and isn't part of `npm test`.

## Deploy

`dist/` is a static site - any static host works. Three common ones:

**GitHub Pages** (via the [`gh-pages`](https://www.npmjs.com/package/gh-pages) package; `vite.config.ts`
already sets `base: './'`, so the build works from a project-pages subpath):

```bash
npm run build
npx gh-pages -d dist
```

**Netlify** (via the [Netlify CLI](https://docs.netlify.com/cli/get-started/)):

```bash
npm run build
npx netlify-cli deploy --prod --dir=dist
```

**Vercel** (via the [Vercel CLI](https://vercel.com/docs/cli); Vercel's zero-config Vite preset
picks up the build command and `dist/` output automatically):

```bash
npm run build
npx vercel --prod
```

## Project layout

See `docs/ARCHITECTURE.md` for the full folder layout, the fixed-step loop, and the event system;
`docs/ART_BIBLE.md` for the palette and every sprite/animation spec; `docs/LEVELS.md` for the
per-world level tables; `docs/specs/` for each milestone's spec and report.

## Credits

- **Design**: Fable
- **Code**: Sonnet, implemented against Fable's specs
- **Art and audio**: every sprite (SVG) and every sound (synthesised via the Web Audio API) is
  generated in-repo - no external asset packs or stock libraries

## License

MIT - see `LICENSE`.
