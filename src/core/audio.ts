// Web Audio engine. Stubbed as a no-op for M0-M2: no audio or SFX synthesis yet (that lands in
// M5). Gameplay never calls this directly (see ARCHITECTURE.md section 9) - only scenes/main.ts
// would, and they don't need to for the classic core either.

export interface AudioEngine {
  resume(): void;
  setMasterVolume(v: number): void;
  setMusicVolume(v: number): void;
  setSfxVolume(v: number): void;
  playSfx(name: string): void;
}

export function createAudioEngine(): AudioEngine {
  return {
    resume() {
      /* no-op until M5 */
    },
    setMasterVolume() {
      /* no-op until M5 */
    },
    setMusicVolume() {
      /* no-op until M5 */
    },
    setSfxVolume() {
      /* no-op until M5 */
    },
    playSfx() {
      /* no-op until M5 */
    },
  };
}
