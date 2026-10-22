import { save } from '../core/save'
import { loc } from '../core/i18n'
import type { RunResult, ShopDef } from './types'
import { ACHIEVEMENTS, CHARACTERS, STAGES, charById, weaponById } from './registry'
import type { World } from './world'

/** Optional native bridge exposed by the Electron preload (absent in the browser). */
export interface NativeBridge {
  quit(): void
  setFullscreen(on: boolean): void
  achieve(id: string): void
  steam: boolean
}
declare global {
  interface Window {
    native?: NativeBridge
  }
}

export interface Unlock {
  kind: 'achievement' | 'char' | 'stage' | 'weapon' | 'asc'
  id: string
  label: string
}

/** unlock listeners (UI toasts) */
export const unlockListeners: ((u: Unlock) => void)[] = []

function announce(u: Unlock) {
  unlockListeners.forEach((f) => f(u))
}

export const isCharUnlocked = (id: string) => {
  const c = charById.get(id)!
  return save.data.chars.includes(id) || (!c.unlock && !c.cost)
}

export const isStageUnlocked = (id: string) => {
  const s = STAGES.find((x) => x.id === id)!
  return !s.unlockAfter || save.data.cleared[s.unlockAfter] !== undefined
}

/** highest ascension selectable on a stage */
export const maxAscension = (stageId: string) => (save.data.cleared[stageId] ?? -1) + 1

function unlockAchievement(id: string, out: Unlock[]) {
  const d = save.data
  if (d.achievements.includes(id)) return
  const a = ACHIEVEMENTS.find((x) => x.id === id)!
  d.achievements.push(id)
  window.native?.achieve(id)
  const u: Unlock = { kind: 'achievement', id, label: loc(a.name) }
  out.push(u)
  announce(u)
  if (a.reward?.char && !d.chars.includes(a.reward.char)) {
    d.chars.push(a.reward.char)
    const c = charById.get(a.reward.char)!
    const cu: Unlock = { kind: 'char', id: c.id, label: loc(c.name) }
    out.push(cu)
    announce(cu)
  }
  if (a.reward?.weapon && !d.weapons.includes(a.reward.weapon)) {
    d.weapons.push(a.reward.weapon)
    const wd = weaponById.get(a.reward.weapon)
    const wu: Unlock = { kind: 'weapon', id: a.reward.weapon, label: wd ? loc(wd.name) : a.reward.weapon }
    out.push(wu)
    announce(wu)
  }
  if (a.reward?.lumens) d.lumens += a.reward.lumens
}

export function checkAchievements(c: { run?: RunResult; w?: World }): Unlock[] {
  const out: Unlock[] = []
  for (const a of ACHIEVEMENTS) {
    if (save.data.achievements.includes(a.id)) continue
    if (a.check({ ...c, save: save.data })) unlockAchievement(a.id, out)
  }
  if (out.length) save.write()
  return out
}

/** Bank the run into the save file. Returns everything newly unlocked. */
export function finishRun(r: RunResult): Unlock[] {
  const d = save.data, st = d.stats
  d.lumens += r.lumens
  st.lumensEarned += r.lumens
  st.kills += r.kills
  st.runs++
  st.time += r.time
  st.elites += r.elites
  st.bosses += r.bosses
  st.fusions += r.fusions
  st.overdrives += r.overdrives
  st.chests += r.chests
  st.bestLevel = Math.max(st.bestLevel, r.level)
  st.bestKills = Math.max(st.bestKills, r.kills)
  if (r.win) st.wins++
  else st.deaths++
  d.history.unshift({ char: r.char, stage: r.stage, asc: r.asc, win: r.win, time: r.time, kills: r.kills, level: r.level, lumens: r.lumens })
  d.history.length = Math.min(d.history.length, 30)
  const out: Unlock[] = []
  if (r.win && !r.endless) {
    const before = d.cleared[r.stage]
    d.cleared[r.stage] = Math.max(before ?? -1, r.asc)
    const wins = (d.charWins[r.char] ??= [])
    if (!wins.includes(r.stage)) wins.push(r.stage)
    if (before === undefined)
      for (const s of STAGES)
        if (s.unlockAfter === r.stage) out.push({ kind: 'stage', id: s.id, label: loc(s.name) })
    if ((before ?? -1) < r.asc) out.push({ kind: 'asc', id: r.stage, label: `${r.asc + 1}` })
  }
  out.push(...checkAchievements({ run: r }))
  save.write()
  return out
}

export function buyChar(id: string) {
  const c = charById.get(id)!
  if (!c.cost || save.data.lumens < c.cost || isCharUnlocked(id)) return false
  save.data.lumens -= c.cost
  save.data.chars.push(id)
  save.write()
  return true
}

export const allChars = () => CHARACTERS

const shopLevels = () => Object.values(save.data.shop).reduce((a, b) => a + b, 0)

/** price of the next level of a Forge upgrade (rises slightly with total purchases) */
export const shopPrice = (d: ShopDef) => Math.round(d.cost * ((save.data.shop[d.id] ?? 0) + 1) * (1 + 0.05 * shopLevels()))

export function buyShop(d: ShopDef) {
  const lv = save.data.shop[d.id] ?? 0, price = shopPrice(d)
  if (lv >= d.max || save.data.lumens < price) return false
  save.data.lumens -= price
  save.data.forgeSpent += price
  save.data.shop[d.id] = lv + 1
  save.write()
  return true
}

/** refund every Forge purchase at full price */
export function refundShop() {
  const total = save.data.forgeSpent
  save.data.lumens += total
  save.data.forgeSpent = 0
  save.data.shop = {}
  save.write()
  return total
}
