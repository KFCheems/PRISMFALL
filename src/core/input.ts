export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'confirm' | 'back' | 'pause'
  | 'dash' | 'overdrive'
  | 'reroll' | 'banish' | 'skip'
  | 'tabL' | 'tabR'

const NAV: Action[] = ['up', 'down', 'left', 'right']

const KEYS: Record<Action, string[]> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'NumpadEnter', 'Space'],
  back: ['Escape', 'Backspace'],
  pause: ['Escape', 'KeyP'],
  dash: ['Space', 'ShiftLeft', 'ShiftRight'],
  overdrive: ['KeyQ', 'KeyE'],
  reroll: ['KeyR'],
  banish: ['KeyX'],
  skip: ['KeyF'],
  tabL: ['KeyQ', 'PageUp'],
  tabR: ['KeyE', 'PageDown'],
}

// standard gamepad mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 dpad
const PAD: Record<Action, number[]> = {
  up: [12],
  down: [13],
  left: [14],
  right: [15],
  confirm: [0],
  back: [1],
  pause: [9, 8],
  dash: [0, 5, 7],
  overdrive: [3, 4, 6],
  reroll: [2],
  banish: [3],
  skip: [8],
  tabL: [4],
  tabR: [5],
}

const DEAD = 0.22

class Input {
  private keys = new Set<string>()
  private hit = new Set<string>()
  private rep = new Set<string>()
  private padNow: boolean[] = []
  private padPrev: boolean[] = []
  private stick = { x: 0, y: 0, rx: 0, ry: 0 }
  private navHeld: Record<string, number> = {}
  private navFire = new Set<Action>()
  mouse = { x: 0, y: 0, down: false, clicked: false, lastMove: -1e9 }
  lastDevice: 'kb' | 'pad' = 'kb'
  now = 0
  onDevice?: (d: 'kb' | 'pad') => void

  init(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F11' || (e.code === 'Enter' && e.altKey)) return
      if (!e.repeat) this.hit.add(e.code)
      else this.rep.add(e.code)
      this.keys.add(e.code)
      this.device('kb')
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.keys.clear())
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
      this.mouse.lastMove = this.now
      this.device('kb')
    })
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true
        this.mouse.clicked = true
      }
      this.device('kb')
    })
    window.addEventListener('mouseup', (e) => e.button === 0 && (this.mouse.down = false))
    window.addEventListener('contextmenu', (e) => e.preventDefault())
    target.addEventListener('wheel', (e) => e.preventDefault(), { passive: false })
  }

  private device(d: 'kb' | 'pad') {
    if (this.lastDevice !== d) {
      this.lastDevice = d
      this.onDevice?.(d)
    }
  }

  update(dt: number) {
    this.now += dt
    this.padPrev = this.padNow
    this.padNow = []
    this.stick = { x: 0, y: 0, rx: 0, ry: 0 }
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp || !gp.connected) continue
      gp.buttons.forEach((b, i) => (this.padNow[i] ||= b.pressed || b.value > 0.5))
      const [x = 0, y = 0, rx = 0, ry = 0] = gp.axes
      if (Math.hypot(x, y) > Math.hypot(this.stick.x, this.stick.y)) Object.assign(this.stick, { x, y })
      if (Math.hypot(rx, ry) > Math.hypot(this.stick.rx, this.stick.ry)) Object.assign(this.stick, { rx, ry })
    }
    if (this.padNow.some((b, i) => b && !this.padPrev[i]) || Math.hypot(this.stick.x, this.stick.y) > 0.5) this.device('pad')

    // menu navigation with stick + repeat
    this.navFire.clear()
    const s = this.stick
    const dirs: Record<string, boolean> = {
      up: s.y < -0.55 || !!this.padNow[12],
      down: s.y > 0.55 || !!this.padNow[13],
      left: s.x < -0.55 || !!this.padNow[14],
      right: s.x > 0.55 || !!this.padNow[15],
    }
    for (const a of NAV) {
      if (dirs[a]) {
        const t = (this.navHeld[a] ?? -1) + dt
        if (this.navHeld[a] === undefined) this.navFire.add(a)
        else if (t > 0.38 && Math.floor((t - 0.38) / 0.09) !== Math.floor((t - 0.38 - dt) / 0.09)) this.navFire.add(a)
        this.navHeld[a] = this.navHeld[a] === undefined ? 0 : t
      } else delete this.navHeld[a]
    }
  }

  endFrame() {
    this.hit.clear()
    this.rep.clear()
    this.mouse.clicked = false
  }

  /** forget all edges this frame (use after screen transitions) */
  consume() {
    this.hit.clear()
    this.rep.clear()
    this.navFire.clear()
    this.padPrev = this.padNow.slice()
    for (const k in this.navHeld) this.navHeld[k] = 0
    this.mouse.clicked = false
  }

  held(a: Action) {
    return KEYS[a].some((k) => this.keys.has(k)) || PAD[a].some((b) => this.padNow[b])
  }

  pressed(a: Action) {
    if (KEYS[a].some((k) => this.hit.has(k))) return true
    if (NAV.includes(a)) return this.navFire.has(a) || KEYS[a].some((k) => this.rep.has(k))
    return PAD[a].some((b) => this.padNow[b] && !this.padPrev[b])
  }

  /** movement vector, length ≤ 1 */
  move() {
    let x = 0, y = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1
    if (this.padNow[14]) x -= 1
    if (this.padNow[15]) x += 1
    if (this.padNow[12]) y -= 1
    if (this.padNow[13]) y += 1
    const l = Math.hypot(x, y)
    if (l > 0) return { x: x / l, y: y / l }
    const sl = Math.hypot(this.stick.x, this.stick.y)
    if (sl < DEAD) return { x: 0, y: 0 }
    const k = Math.min(1, (sl - DEAD) / (1 - DEAD)) / sl
    return { x: this.stick.x * k, y: this.stick.y * k }
  }

  /** right-stick aim direction, if deflected */
  stickAim() {
    const { rx, ry } = this.stick
    const l = Math.hypot(rx, ry)
    return l > 0.4 ? { x: rx / l, y: ry / l } : null
  }

  /** true if the mouse moved within the last `sec` seconds */
  mouseActive(sec = 2.5) {
    return this.lastDevice === 'kb' && this.now - this.mouse.lastMove < sec
  }

  rumble(strength = 0.5, ms = 120) {
    for (const gp of navigator.getGamepads?.() ?? []) {
      const act = (gp as any)?.vibrationActuator
      act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })
    }
  }
}

export const input = new Input()
