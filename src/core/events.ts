// Generic typed event bus. Two instances are exported: `gameEvents` for GameEvent (gameplay ->
// audio/FX/popups/HUD) and `inputEvents` for InputAction (input sources -> the active scene).
// Gameplay code only ever calls `emit`; it never imports audio or rendering modules directly.

import type { GameEvent, InputAction } from '../game/types';

export interface EventBus<T extends { type: string }> {
  on<K extends T['type']>(type: K, listener: (event: Extract<T, { type: K }>) => void): void;
  off<K extends T['type']>(type: K, listener: (event: Extract<T, { type: K }>) => void): void;
  /** Subscribe to every event regardless of type. Returns an unsubscribe function. */
  onAny(listener: (event: T) => void): () => void;
  emit(event: T): void;
}

export function createEventBus<T extends { type: string }>(): EventBus<T> {
  const listeners = new Map<string, Set<(event: T) => void>>();
  const anyListeners = new Set<(event: T) => void>();

  function on<K extends T['type']>(
    type: K,
    listener: (event: Extract<T, { type: K }>) => void,
  ): void {
    let set = listeners.get(type);
    if (!set) {
      set = new Set();
      listeners.set(type, set);
    }
    set.add(listener as (event: T) => void);
  }

  function off<K extends T['type']>(
    type: K,
    listener: (event: Extract<T, { type: K }>) => void,
  ): void {
    listeners.get(type)?.delete(listener as (event: T) => void);
  }

  function onAny(listener: (event: T) => void): () => void {
    anyListeners.add(listener);
    return () => anyListeners.delete(listener);
  }

  function emit(event: T): void {
    listeners.get(event.type)?.forEach((fn) => fn(event));
    anyListeners.forEach((fn) => fn(event));
  }

  return { on, off, onAny, emit };
}

export const gameEvents: EventBus<GameEvent> = createEventBus<GameEvent>();
export const inputEvents: EventBus<InputAction> = createEventBus<InputAction>();
