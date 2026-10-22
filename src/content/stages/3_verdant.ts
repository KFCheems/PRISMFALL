import { l } from '../../core/i18n'
import { hex } from '../../core/math'
import type { StageDef } from '../../game/types'

/**
 * Verdant Lattice — life & reach. Sporelings leave lingering hazards, menders sustain the swarm (kill
 * them first), hives pour out motes, weavers lay ring-burst fire, and leapers telegraph their landings.
 * Rates match the throughput curve; hives add pressure through spawns rather than the wave counter.
 */
export default {
  id: 'verdant', order: 3, unlockAfter: 'crimson',
  name: l('Verdant Lattice', '翠绿晶格'),
  desc: l('A lattice that grows to swallow every light.', '一座不断生长、妄图吞噬一切光芒的晶格。'),
  palette: { c0: hex('#020d06'), c1: hex('#0f5a2a'), c2: hex('#0b6e4a'), grid: hex('#3dff8b') },
  bgStyle: 1, gridA: 0.26, music: 'stage3', duration: 600, hp: 1.6, dmg: 1.15,
  waves: [
    { from: 0, to: 60, rate: [0.7, 1.2], pool: [['sporeling', 4], ['leaper', 1]], cap: 70 },
    { from: 60, to: 180, rate: [1.1, 1.7], pool: [['sporeling', 3], ['leaper', 2], ['weaver', 1]], cap: 110 },
    { from: 180, to: 360, rate: [1.7, 2.4], pool: [['sporeling', 3], ['leaper', 2], ['weaver', 2], ['mender', 1]], cap: 165 },
    { from: 360, to: 480, rate: [2.4, 3.2], pool: [['sporeling', 3], ['leaper', 2], ['weaver', 2], ['mender', 1], ['hive', 1]], cap: 225 },
    { from: 480, to: 600, rate: [3.2, 4.3], pool: [['sporeling', 2], ['leaper', 3], ['weaver', 2], ['mender', 1], ['hive', 1]], cap: 285 },
  ],
  events: [
    { at: 40, kind: 'ring', enemy: 'sporeling', n: 14 },
    { at: 100, kind: 'elite', enemy: 'leaper' },
    { at: 150, kind: 'swarm', enemy: 'leaper', n: 5 },
    { at: 210, kind: 'custom', run: (w) => { for (let i = 0; i < 1; i++) { const [x, y] = w.spawnPoint(); w.spawnEnemy('hive', x, y) } } },
    { at: 270, kind: 'elite', enemy: 'weaver' },
    { at: 330, kind: 'ring', enemy: 'sporeling', n: 20 },
    { at: 390, kind: 'wall', enemy: 'weaver', n: 6 },
    { at: 450, kind: 'elite', enemy: 'mender' },
    { at: 510, kind: 'swarm', enemy: 'leaper', n: 7 },
    { at: 570, kind: 'burst', enemy: 'sporeling', n: 24 },
  ],
  boss: 'matriarch',
} satisfies StageDef
