/** Test-only globals: the game exposes itself on window.__pf for automation. */
export {}

type Mod<T extends string> = typeof import(T)

declare global {
  interface Window {
    __pf: {
      game: (typeof import('../src/game/game'))['game']
      save: (typeof import('../src/core/save'))['save']
      ui: (typeof import('../src/ui/ui'))['ui']
      renderer: (typeof import('../src/core/gl'))['renderer']
      input: (typeof import('../src/core/input'))['input']
      audio: (typeof import('../src/core/audio'))['audio']
    }
  }
}
