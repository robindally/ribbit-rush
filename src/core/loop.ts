// Fixed-step loop and scene manager. See ARCHITECTURE.md section 4.

import type { InputAction } from '../game/types';
import * as hitstop from '../fx/hitstop';
import type { Renderer } from '../render/renderer';
import { inputEvents } from './events';
import { pollGamepad } from './input';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(r: Renderer, alpha: number): void;
  onAction?(a: InputAction): void;
}

export interface SceneManager {
  replace(s: Scene): void;
  push(s: Scene): void;
  pop(): void;
  current(): Scene;
}

/**
 * A scene stack. `enter` fires exactly once when a scene is added (push/replace), `exit` fires
 * exactly once when it's removed (pop, or replaced away). Only the top of the stack updates,
 * receives input, and is asked to render - a scene that wants to show what's beneath it (e.g.
 * Pause over Play) renders that scene itself from its own `render`, keeping strictly to the
 * SceneManager interface above.
 */
export class Scenes implements SceneManager {
  private stack: Scene[] = [];

  replace(s: Scene): void {
    const prev = this.stack.pop();
    prev?.exit?.();
    this.stack = [s];
    s.enter?.();
  }

  push(s: Scene): void {
    this.stack.push(s);
    s.enter?.();
  }

  pop(): void {
    const removed = this.stack.pop();
    removed?.exit?.();
  }

  current(): Scene {
    const top = this.stack[this.stack.length - 1];
    if (!top) throw new Error('SceneManager: no active scene');
    return top;
  }
}

const DT = 1 / 60;
const MAX_FRAME_S = 0.25;

export interface LoopHandle {
  stop(): void;
}

export function startLoop(scenes: SceneManager, renderer: Renderer): LoopHandle {
  let accumulator = 0;
  let last = performance.now();
  let running = true;
  let rafId = 0;

  const unsubscribeInput = inputEvents.onAny((action) => {
    scenes.current().onAction?.(action);
  });

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      running = false;
    } else if (rafId) {
      running = true;
      last = performance.now();
      accumulator = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    if (!running) {
      last = now;
      return;
    }

    pollGamepad();

    let frameS = (now - last) / 1000;
    last = now;
    if (frameS > MAX_FRAME_S) frameS = MAX_FRAME_S;

    // Hit-stop / slow motion (ARCHITECTURE.md section 4, docs/specs/M4-juice.md section 3): a
    // hard pause skips the fixed step entirely this frame - the accumulator doesn't advance
    // either, so the same interpolated frame keeps rendering, which *is* the freeze. A slow-mo
    // scale instead shrinks how much simulated time each fixed step advances, without changing
    // how many steps run per real second.
    hitstop.tick(frameS * 1000);
    if (!hitstop.isPaused()) {
      accumulator += frameS;
      const timeScale = hitstop.getTimeScale();
      while (accumulator >= DT) {
        scenes.current().update(DT * timeScale);
        accumulator -= DT;
      }
    }

    const alpha = accumulator / DT;
    renderer.ctx.clearRect(0, 0, renderer.width, renderer.height);
    scenes.current().render(renderer, alpha);
  }

  rafId = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubscribeInput();
    },
  };
}
