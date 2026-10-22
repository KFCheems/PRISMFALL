import { l } from '../../core/i18n'
import { hex } from '../../core/math'
import type { StageDef } from '../../game/types'

/**
 * Crimson Expanse — raw force. Cinders swarm, lancers teach you to sidestep telegraphs, spitters force
 * you to close distance, bombers demand you keep moving, brutes are walls you route around.
 *
 * Rates follow the same throughput curve as the Shallows, shifted up one notch for a build that has
 * already cleared stage 1 (`hp` scaling makes each body slower to fell, so raw counts stay modest).
 */
export default {
  id: 'crimson', order: 2, unlockAfter: 'shallows',
  name: l('Crimson Expanse', '赤红荒原'),
  desc: l('A furnace where light is burned for fuel.', '一座熔炉，光在此被当作燃料焚烧。'),
  palette: { c0: hex('#0d0403'), c1: hex('#6e1a10'), c2: hex('#7a3a0b'), grid: hex('#ff5a3a') },
  bgStyle: 1, gridA: 0.28, music: 'stage2', duration: 600, hp: 1.35, dmg: 1.2,
  waves: [
    { from: 0, to: 60, rate: [0.7, 1.2], pool: [['cinder', 4], ['lancer', 1]], cap: 70 },
    { from: 60, to: 180, rate: [1.1, 1.6], pool: [['cinder', 3], ['lancer', 2], ['spitter', 1]], cap: 110 },
    { from: 180, to: 360, rate: [1.6, 2.3], pool: [['cinder', 3], ['lancer', 2], ['spitter', 2], ['bomber', 1]], cap: 160 },
    { from: 360, to: 480, rate: [2.3, 3.1], pool: [['cinder', 3], ['lancer', 2], ['spitter', 2], ['bomber', 2], ['brute', 1]], cap: 220 },
    { from: 480, to: 600, rate: [3.1, 4.2], pool: [['cinder', 2], ['lancer', 3], ['spitter', 2], ['bomber', 2], ['brute', 1]], cap: 280 },
  ],
  events: [
    { at: 40, kind: 'ring', enemy: 'cinder', n: 16 },
    { at: 100, kind: 'elite', enemy: 'lancer' },
    { at: 160, kind: 'wall', enemy: 'spitter', n: 8 },
    { at: 220, kind: 'swarm', enemy: 'lancer', n: 5 },
    { at: 280, kind: 'elite', enemy: 'brute' },
    { at: 340, kind: 'burst', enemy: 'bomber', n: 6 },
    { at: 400, kind: 'ring', enemy: 'cinder', n: 24 },
    { at: 470, kind: 'swarm', enemy: 'lancer', n: 6 },
    { at: 520, kind: 'elite', enemy: 'spitter' },
    { at: 570, kind: 'burst', enemy: 'cinder', n: 28 },
  ],
  boss: 'pyre',
} satisfies StageDef
