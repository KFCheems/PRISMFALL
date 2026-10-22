import type { Lang } from './i18n'
import { setLang } from './i18n'

export interface Settings {
  lang: Lang
  master: number
  music: number
  sfx: number
  shake: number // 0..1 screen shake strength
  flashes: boolean // false = reduced flashing
  dmgNumbers: boolean
  fullscreen: boolean
  aim: 'auto' | 'manual' // manual = aim with mouse / right stick
  renderScale: number // 0.5..1
  bloom: number // 0..1.5
  showFps: boolean
}

export interface RunRecord {
  char: string
  stage: string
  asc: number
  win: boolean
  time: number
  kills: number
  level: number
  lumens: number
}

export interface SaveData {
  v: 1
  lumens: number
  forgeSpent: number // lumens spent in the Forge (refundable)
  shop: Record<string, number> // shop upgrade id → purchased level
  chars: string[] // unlocked character ids
  stages: string[] // unlocked stage ids
  cleared: Record<string, number> // stage id → highest ascension cleared (absent = never)
  charWins: Record<string, string[]> // char id → stage ids cleared with it
  weapons: string[] // unlocked weapon ids (beyond defaults)
  achievements: string[]
  seen: string[] // codex: ids of weapons/passives/enemies encountered
  stats: {
    kills: number
    runs: number
    wins: number
    deaths: number
    time: number
    bosses: number
    elites: number
    fusions: number
    prismatic: number
    lumensEarned: number
    bestLevel: number
    bestKills: number
    overdrives: number
    chests: number
  }
  history: RunRecord[]
  settings: Settings
  pending: string[] // unlock toasts to show in the menu
}

/** localStorage key. The legacy name is read once so existing saves migrate without loss. */
const KEY = 'prismfall.save.v1'
const LEGACY_KEY = 'prismfall-save-v1'

export const defaultSettings = (): Settings => ({
  lang: navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  master: 0.8,
  music: 0.7,
  sfx: 0.8,
  shake: 1,
  flashes: true,
  dmgNumbers: true,
  fullscreen: true,
  aim: 'auto',
  renderScale: 1,
  bloom: 1,
  showFps: false,
})

const fresh = (): SaveData => ({
  v: 1,
  lumens: 0,
  forgeSpent: 0,
  shop: {},
  chars: [],
  stages: [],
  cleared: {},
  charWins: {},
  weapons: [],
  achievements: [],
  seen: [],
  stats: { kills: 0, runs: 0, wins: 0, deaths: 0, time: 0, bosses: 0, elites: 0, fusions: 0, prismatic: 0, lumensEarned: 0, bestLevel: 0, bestKills: 0, overdrives: 0, chests: 0 },
  history: [],
  settings: defaultSettings(),
  pending: [],
})

class Save {
  data: SaveData = fresh()
  /** the localStorage key this profile lives under (exposed so diagnostics/tests never guess it) */
  readonly key = KEY

  load() {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY)
    const base = fresh()
    if (raw) {
      try {
        const d = JSON.parse(raw) as Partial<SaveData>
        // Spread every top-level field over the defaults, then repair the nested containers individually:
        // an older or truncated save that is missing `shop`/`charWins`/`cleared` must still boot with usable
        // objects, because the Forge and achievement screens iterate them directly.
        this.data = {
          ...base,
          ...d,
          v: 1,
          stats: { ...base.stats, ...(d.stats ?? {}) },
          settings: { ...base.settings, ...(d.settings ?? {}) },
          shop: { ...base.shop, ...(d.shop ?? {}) },
          cleared: { ...base.cleared, ...(d.cleared ?? {}) },
          charWins: { ...base.charWins, ...(d.charWins ?? {}) },
          chars: Array.isArray(d.chars) ? d.chars : base.chars,
          stages: Array.isArray(d.stages) ? d.stages : base.stages,
          weapons: Array.isArray(d.weapons) ? d.weapons : base.weapons,
          achievements: Array.isArray(d.achievements) ? d.achievements : base.achievements,
          seen: Array.isArray(d.seen) ? d.seen : base.seen,
          history: Array.isArray(d.history) ? d.history : base.history,
          pending: Array.isArray(d.pending) ? d.pending : base.pending,
        }
        // a save from before a field existed can have it undefined; make sure the counters are numbers
        for (const k of Object.keys(base.stats) as (keyof SaveData['stats'])[]) {
          if (typeof (this.data.stats as any)[k] !== 'number') (this.data.stats as any)[k] = base.stats[k]
        }
      } catch {
        // a corrupt entry must never brick the game — start clean instead
        this.data = base
      }
    }
    // migrate a legacy save forward on first load
    if (raw && !localStorage.getItem(KEY)) this.write()
    setLang(this.data.settings.lang)
    return this.data
  }

  write() {
    localStorage.setItem(KEY, JSON.stringify(this.data))
  }

  reset() {
    const settings = this.data.settings
    this.data = { ...fresh(), settings }
    this.write()
  }

  see(id: string) {
    if (!this.data.seen.includes(id)) this.data.seen.push(id)
  }
}

export const save = new Save()
