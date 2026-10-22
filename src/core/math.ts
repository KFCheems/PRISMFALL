export type RGB = [number, number, number]

export const TAU = Math.PI * 2

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
export const randi = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1))
export const chance = (p: number) => Math.random() < p
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by))
export const angle = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax)
export const approach = (v: number, target: number, step: number) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target))
export const damp = (a: number, b: number, rate: number, dt: number) => lerp(a, b, 1 - Math.exp(-rate * dt))
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export function turnToward(cur: number, target: number, maxStep: number) {
  const d = wrapAngle(target - cur)
  return cur + clamp(d, -maxStep, maxStep)
}

export function weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0
  for (const it of items) total += Math.max(0, weight(it))
  if (total <= 0) return undefined
  let r = Math.random() * total
  for (const it of items) {
    r -= Math.max(0, weight(it))
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** distance from point to segment, squared */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1)
  return dist2(px, py, ax + dx * t, ay + dy * t)
}

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k]
export const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`

export function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

export const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t * t * t,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
}

export function fmtTime(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function fmtNum(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K'
  return String(Math.round(n))
}
