import { l } from '../../core/i18n'
import { hex } from '../../core/math'
import type { StageDef } from '../../game/types'

/**
 * Nebula Shallows — the first fall. Motes and drifters teach movement; darts (0:45) sharpen dodging, splitters crowd
 * the screen, and a lone Bulwark elite turns into a wall to circle. The Hexwarden waits at 10:00.
 */
export default {
  id: 'shallows', order: 1,
  name: l('Nebula Shallows', '星云浅滩'),
  desc: l('Where the light first falls.', '光最初坠落之处。'),
  palette: { c0: hex('#03040d'), c1: hex('#1a2a6e'), c2: hex('#0b5a7a'), grid: hex('#3a7bff') },
  bgStyle: 0, gridA: 0.3, music: 'stage1', duration: 600, hp: 1, dmg: 1,
  waves: [
    { from: 0, to: 45, rate: [1.0, 2.4], pool: [['mote', 4], ['drifter', 1]], cap: 90 },
    { from: 45, to: 120, rate: [2.2, 3.6], pool: [['mote', 3], ['drifter', 2], ['dart', 1]], cap: 150 },
    { from: 120, to: 300, rate: [3.4, 5.4], pool: [['mote', 3], ['drifter', 2], ['dart', 2], ['splitter', 1]], cap: 220 },
    { from: 300, to: 480, rate: [5.0, 7.0], pool: [['mote', 3], ['drifter', 2], ['dart', 2], ['splitter', 2], ['block', 1]], cap: 300 },
    { from: 480, to: 600, rate: [6.5, 9.0], pool: [['mote', 2], ['drifter', 2], ['dart', 3], ['splitter', 2], ['block', 1]], cap: 380 },
  ],
  events: [
    { at: 30, kind: 'ring', enemy: 'mote', n: 20 },
    { at: 90, kind: 'elite', enemy: 'drifter' },
    { at: 150, kind: 'swarm', enemy: 'dart', n: 8 },
    { at: 210, kind: 'ring', enemy: 'mote', n: 32 },
    { at: 270, kind: 'elite', enemy: 'block' },
    { at: 330, kind: 'wall', enemy: 'drifter', n: 14 },
    { at: 400, kind: 'swarm', enemy: 'dart', n: 10 },
    { at: 460, kind: 'ring', enemy: 'splitter', n: 12 },
    { at: 520, kind: 'elite', enemy: 'splitter' },
    { at: 570, kind: 'burst', enemy: 'mote', n: 40 },
  ],
  boss: 'warden',
} satisfies StageDef
