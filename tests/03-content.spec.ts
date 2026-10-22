import { test, expect, type Page } from '@playwright/test'
import { boot, ErrorLog } from './helpers'

/**
 * Content integrity: every weapon, passive, enemy, boss, stage, fusion and achievement must exist,
 * be reachable and behave. Runs against the live registry rather than re-reading source text.
 */
async function registry(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/game/registry.ts'
    const reg: any = await import(/* @vite-ignore */ path)
    return {
      weapons: reg.WEAPONS.map((d: any) => ({ id: d.id as string, hue: d.hue as string, unlock: (d.unlock ?? null) as string | null, levels: (d.levels?.length ?? 0) as number, hasFire: !!d.fire, hasTick: !!d.tick })),
      passives: reg.PASSIVES.map((d: any) => ({ id: d.id as string, hue: d.hue as string })),
      enemies: reg.ENEMIES.filter((d: any) => !d.boss).map((d: any) => d.id as string),
      bosses: reg.ENEMIES.filter((d: any) => d.boss).map((d: any) => ({ id: d.id as string, hp: d.hp as number, mass: d.mass as number })),
      stages: reg.STAGES.map((s: any) => ({ id: s.id as string, order: s.order as number, boss: s.boss as string, unlockAfter: (s.unlockAfter ?? null) as string | null, waves: s.waves.length as number, events: s.events.length as number, duration: s.duration as number, hp: s.hp as number, dmg: s.dmg as number })),
      chars: reg.CHARACTERS.map((d: any) => ({ id: d.id as string, weapon: d.weapon as string, cost: (d.cost ?? null) as number | null, unlock: (d.unlock ?? null) as string | null })),
      achievements: reg.ACHIEVEMENTS.map((a: any) => ({ id: a.id as string, hidden: !!a.hidden, reward: (a.reward ?? null) as any })),
      shop: reg.SHOP.map((d: any) => ({ id: d.id as string, max: d.max as number, cost: d.cost as number })),
      ascensions: reg.ASCENSIONS.map((a: any) => a.level as number),
    }
  })
}

test.describe('content registry', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('15 weapons across three hues, each with 7 levels and a fire or tick', async ({ page }) => {
    const r = await registry(page)
    expect(r.weapons).toHaveLength(15)
    expect(r.weapons.filter((w) => w.hue === 'R')).toHaveLength(5)
    expect(r.weapons.filter((w) => w.hue === 'G')).toHaveLength(5)
    expect(r.weapons.filter((w) => w.hue === 'B')).toHaveLength(5)
    for (const w of r.weapons) {
      expect(w.levels, `${w.id} must have 6 level-up entries`).toBe(6)
      expect(w.hasFire || w.hasTick, `${w.id} must do something`).toBe(true)
    }
  })

  test('achievement-gated weapons carry their unlock id', async ({ page }) => {
    const r = await registry(page)
    const gated = Object.fromEntries(r.weapons.filter((w) => w.unlock).map((w) => [w.id, w.unlock]))
    expect(gated).toEqual({ refractor: 'first_fusion', sunfall: 'clear_crimson', wisp_swarm: 'kills_10k' })
    const ids = new Set(r.achievements.map((a) => a.id))
    for (const u of Object.values(gated)) expect(ids.has(u as string), `unlock ${u} must be a real achievement`).toBe(true)
  })

  test('15 passives, 5 per hue', async ({ page }) => {
    const r = await registry(page)
    expect(r.passives).toHaveLength(15)
    for (const h of ['R', 'G', 'B']) expect(r.passives.filter((p) => p.hue === h)).toHaveLength(5)
  })

  test('21 normal enemies and 4 bosses with sane stats', async ({ page }) => {
    const r = await registry(page)
    expect(r.enemies).toHaveLength(21)
    expect(new Set(r.enemies).size).toBe(21)
    expect(r.bosses.map((b) => b.id).sort()).toEqual(['matriarch', 'null_prism', 'pyre', 'warden'])
    for (const b of r.bosses) {
      expect(b.hp).toBeGreaterThanOrEqual(6000)
      expect(b.mass).toBeGreaterThanOrEqual(40)
    }
  })

  test('4 stages chain correctly and reference real content', async ({ page }) => {
    const r = await registry(page)
    expect(r.stages.map((s) => s.id)).toEqual(['shallows', 'crimson', 'verdant', 'singularity'])
    expect(r.stages.map((s) => s.order)).toEqual([1, 2, 3, 4])
    expect(r.stages[0].unlockAfter).toBeNull()
    expect(r.stages[1].unlockAfter).toBe('shallows')
    expect(r.stages[2].unlockAfter).toBe('crimson')
    expect(r.stages[3].unlockAfter).toBe('verdant')
    for (const s of r.stages) {
      expect(s.waves).toBeGreaterThanOrEqual(5)
      expect(s.events).toBeGreaterThanOrEqual(8)
      expect(s.duration).toBe(600)
    }
    // stage multipliers rise through the descent (tuned against measured kill throughput)
    expect(r.stages.map((s) => s.hp)).toEqual([1, 1.35, 1.6, 2.1])
    expect(r.stages.map((s) => s.dmg)).toEqual([1, 1.2, 1.15, 1.5])
  })

  test('6 characters, correct starters, and the documented unlock gates', async ({ page }) => {
    const r = await registry(page)
    expect(r.chars).toHaveLength(6)
    const starters = Object.fromEntries(r.chars.map((c) => [c.id, c.weapon]))
    expect(starters).toEqual({ vex: 'pulse_bolt', ember: 'flame_arc', moss: 'spore_field', quill: 'prism_lance', halo: 'blade_ring', null: 'arc_drone' })
    expect(r.chars.find((c) => c.id === 'moss')!.cost).toBe(400)
    expect(r.chars.find((c) => c.id === 'quill')!.cost).toBe(900)
    expect(r.chars.find((c) => c.id === 'halo')!.unlock).toBe('clear_shallows')
    expect(r.chars.find((c) => c.id === 'null')!.unlock).toBe('clear_singularity')
  })

  test('40 achievements, exactly 3 hidden, rewards point at real content', async ({ page }) => {
    const r = await registry(page)
    expect(r.achievements).toHaveLength(40)
    expect(r.achievements.filter((a) => a.hidden)).toHaveLength(3)
    const charIds = new Set(r.chars.map((c) => c.id))
    const weaponIds = new Set(r.weapons.map((w) => w.id))
    for (const a of r.achievements) {
      if (a.reward?.char) expect(charIds.has(a.reward.char), `${a.id} reward char`).toBe(true)
      if (a.reward?.weapon) expect(weaponIds.has(a.reward.weapon), `${a.id} reward weapon`).toBe(true)
    }
  })

  test('19 Forge upgrades and 10 ascension levels', async ({ page }) => {
    const r = await registry(page)
    expect(r.shop).toHaveLength(19)
    expect(r.ascensions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const s of r.shop) expect(s.max).toBeGreaterThan(0)
  })
})

test.describe('every weapon fires in a real run', () => {
  let log: ErrorLog
  test.beforeEach(async ({ page }) => {
    log = new ErrorLog(page)
    await boot(page)
  })
  test.afterEach(async ({ page }, info) => log.assertClean(info))

  test('all 15 weapons deal damage at level 1 and level 7', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const reg: any = await import(/* @vite-ignore */ '/src/game/registry.ts' as string)
      const { World }: any = await import(/* @vite-ignore */ '/src/game/world.ts' as string)
      const up: any = await import(/* @vite-ignore */ '/src/game/upgrades.ts' as string)
      const char = reg.CHARACTERS[0], stage = reg.STAGES[0]
      const out: any[] = []
      for (const def of reg.WEAPONS) {
        const row: any = { id: def.id }
        for (const lv of [1, 7]) {
          const w = new World({ char, stage, asc: 0, endless: false } as any, { levelUp() {}, chest() {}, end() {}, banner() {}, boss() {} } as any)
          w.p.weapons.length = 0
          const wi = up.makeWeapon(def.id)
          wi.level = lv
          w.p.weapons.push(wi)
          w.p.recalc()
          w.p.stats.maxHp = 1e12
          w.p.hp = 1e12
          // ring of tanky targets at several radii: fair to melee, orbit and ranged alike
          const dummies: any[] = []
          for (const r of [48, 70, 100, 140]) {
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2
              const d = w.spawnEnemy('block', w.p.x + Math.cos(a) * r, w.p.y + Math.sin(a) * r)
              d.hp = d.maxHp = 1e12; d.speed = 0; d.dmg = 0; d.mass = 1e6
              dummies.push(d)
            }
          }
          const hp0 = dummies.reduce((s, d) => s + d.hp, 0)
          for (let i = 0; i < 60 * 8; i++) {
            for (const d of dummies) { d.x = d.x; d.vx = d.vy = 0; d.kbx = d.kby = 0; if (d.hp < 1) d.hp = 1; d.dead = false }
            w.update(1 / 60)
            w.p.hp = 1e12
          }
          row['lv' + lv] = Math.round(hp0 - dummies.reduce((s, d) => s + d.hp, 0))
        }
        out.push(row)
      }
      return out
    })
    const dead = results.filter((r) => !r.lv1 || !r.lv7)
    expect(dead.map((d) => d.id), 'weapons that never dealt damage').toEqual([])
    // every weapon should scale up with levels, not stall
    const flat = results.filter((r) => r.lv7 <= r.lv1)
    expect(flat.map((d) => d.id), 'weapons that do not scale').toEqual([])
  })
})
