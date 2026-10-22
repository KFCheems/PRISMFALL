import type { Enemy } from './types'

/** Uniform-grid spatial hash for enemies. Big enemies are inserted into every cell they overlap. */
export class SpatialHash {
  private cells = new Map<number, Enemy[]>()
  private pool: Enemy[][] = []
  private stamp = 0

  constructor(readonly size = 64) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768)
  }

  clear() {
    for (const arr of this.cells.values()) {
      arr.length = 0
      this.pool.push(arr)
    }
    this.cells.clear()
  }

  insert(e: Enemy) {
    const s = this.size
    const x0 = Math.floor((e.x - e.r) / s), x1 = Math.floor((e.x + e.r) / s)
    const y0 = Math.floor((e.y - e.r) / s), y1 = Math.floor((e.y + e.r) / s)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy)
        let arr = this.cells.get(k)
        if (!arr) {
          arr = this.pool.pop() ?? []
          this.cells.set(k, arr)
        }
        arr.push(e)
      }
  }

  /** visit every (unique) enemy whose cell overlaps the AABB around (x,y,r). Return true from cb to stop. */
  query(x: number, y: number, r: number, cb: (e: Enemy) => boolean | void) {
    const s = this.size, q = ++this.stamp
    const x0 = Math.floor((x - r) / s), x1 = Math.floor((x + r) / s)
    const y0 = Math.floor((y - r) / s), y1 = Math.floor((y + r) / s)
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const arr = this.cells.get(this.key(cx, cy))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i]
          if (e.q === q || e.dead) continue
          e.q = q
          if (cb(e)) return
        }
      }
  }
}
