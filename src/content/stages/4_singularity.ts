import { l } from '../../core/i18n'
import { hex } from '../../core/math'
import type { StageDef } from '../../game/types'

/**
 * The Singularity — the last fall. Phantoms blink onto you, swarmer packs rush in tiny waves, void eyes carve the arena
 * with laser lines, sentries spiral bullets, and colossi shed motes as they break. The Null Prism waits, multi-phased.
 * This is the bottom of the spectrum; everything here is the sharpest version of what came before.
 */
export default {
  id: 'singularity', order: 4, unlockAfter: 'verdant',
  name: l('The Singularity', '奇点'),
  desc: l('The bottom of the spectrum, where all light ends.', '光谱之底，一切光芒终结之处。'),
  palette: { c0: hex('#06020d'), c1: hex('#3a1a6e'), c2: hex('#5a1a7a'), grid: hex('#b47aff') },
  bgStyle: 3, gridA: 0.24, music: 'stage4', duration: 600, hp: 3.4, dmg: 1.8,
  waves: [
    { from: 0, to: 60, rate: [1.4, 2.8], pool: [['swarmer', 4], ['phantom', 1]], cap: 110 },
    { from: 60, to: 180, rate: [2.6, 4.2], pool: [['swarmer', 3], ['phantom', 2], ['sentry', 1]], cap: 180 },
    { from: 180, to: 360, rate: [3.8, 5.8], pool: [['swarmer', 3], ['phantom', 2], ['sentry', 1], ['void_eye', 1]], cap: 250 },
    { from: 360, to: 480, rate: [5.2, 7.2], pool: [['swarmer', 3], ['phantom', 2], ['sentry', 2], ['void_eye', 1], ['colossus', 1]], cap: 310 },
    { from: 480, to: 600, rate: [6.6, 9.2], pool: [['swarmer', 3], ['phantom', 3], ['sentry', 2], ['void_eye', 2], ['colossus', 1]], cap: 380 },
  ],
  events: [
    { at: 40, kind: 'swarm', enemy: 'swarmer', n: 16 },
    { at: 100, kind: 'elite', enemy: 'phantom' },
    { at: 150, kind: 'ring', enemy: 'sentry', n: 8 },
    { at: 210, kind: 'swarm', enemy: 'phantom', n: 6 },
    { at: 270, kind: 'elite', enemy: 'colossus' },
    { at: 330, kind: 'burst', enemy: 'swarmer', n: 30 },
    { at: 390, kind: 'ring', enemy: 'void_eye', n: 6 },
    { at: 450, kind: 'swarm', enemy: 'phantom', n: 8 },
    { at: 510, kind: 'elite', enemy: 'void_eye' },
    { at: 570, kind: 'burst', enemy: 'swarmer', n: 50 },
  ],
  boss: 'null_prism',
} satisfies StageDef
