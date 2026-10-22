import { input, type Action } from '../core/input'
import { audio } from '../core/audio'
import { css, type RGB } from '../core/math'

/** Base class for every menu / overlay. Elements with `data-nav` are focusable with keyboard & gamepad. */
export class Screen {
  el: HTMLElement
  /** pauses the world while this screen is on the stack */
  modal = true
  /** dialogs keep the screen below them visible */
  overlay = false
  /** seconds during which input is ignored (prevents accidental picks) */
  lock = 0

  constructor(cls: string, html = '') {
    this.el = document.createElement('div')
    this.el.className = 'screen ' + cls
    this.el.innerHTML = html
  }
  enter() {}
  exit() {}
  /** (re)build the DOM — called again after a language switch */
  render() {}
  update(_dt: number) {}
  /** handle an action; return true if consumed */
  action(_a: Action): boolean {
    return false
  }
  back() {
    audio.sfx('uiBack')
    ui.pop()
  }
  $<T extends HTMLElement = HTMLElement>(sel: string) {
    return this.el.querySelector(sel) as T
  }
  $$<T extends HTMLElement = HTMLElement>(sel: string) {
    return [...this.el.querySelectorAll(sel)] as T[]
  }
  /** bind a click handler to every element matching `sel` */
  on(sel: string, fn: (el: HTMLElement) => void) {
    for (const b of this.$$(sel)) b.addEventListener('click', () => fn(b))
  }
}

export const svgIcon = (inner: string, color: RGB | string, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 64 64" style="color:${typeof color === 'string' ? color : css(color)}">${inner}</svg>`

const OTHER: Action[] = ['tabL', 'tabR', 'reroll', 'banish', 'skip', 'pause', 'dash', 'overdrive']

class UI {
  root!: HTMLElement
  /** banners live under the screens so modals always cover them */
  layer!: HTMLElement
  /** toasts float above everything */
  over!: HTMLElement
  stack: Screen[] = []
  focus: HTMLElement | null = null
  /** callbacks run after a language switch (HUD etc.) */
  langHooks = new Set<() => void>()

  init(root: HTMLElement) {
    this.root = root
    this.layer = document.createElement('div')
    this.layer.className = 'layer banners'
    this.over = document.createElement('div')
    this.over.className = 'layer toasts'
    root.append(this.layer, this.over)
    root.addEventListener('pointerover', (e) => {
      // Only a real pointer movement may move the selection. When a screen opens, the mouse is often left
      // sitting over whatever has just appeared underneath it; that must not silently change the pick.
      if (performance.now() - input.mouse.lastMove > 120) return
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
      if (t && this.top?.el.contains(t) && t !== this.focus && !t.hasAttribute('disabled')) this.setFocus(t, true, true)
    })
    root.addEventListener(
      'click',
      (e) => {
        if (this.top && this.top.lock > 0) {
          e.stopPropagation()
          e.preventDefault()
          return
        }
        // clickable button prompts in the footer bars
        const p = (e.target as HTMLElement).closest<HTMLElement>('[data-prompt]')
        if (p && this.top?.el.contains(p)) this.trigger(p.dataset.prompt as Action)
      },
      true,
    )
    // the body swallows wheel events (input.ts); scroll lists manually
    root.addEventListener('wheel', (e) => {
      const sc = (e.target as HTMLElement).closest<HTMLElement>('.scroll')
      if (sc) sc.scrollTop += e.deltaY
    })
    input.onDevice = (d) => document.body.classList.toggle('pad', d === 'pad')
  }

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1]
  }

  get blocking() {
    return this.stack.some((s) => s.modal)
  }

  private sync() {
    this.root.classList.toggle('modal', this.blocking)
  }

  push(s: Screen) {
    if (!s.overlay) this.top?.el.classList.add('under')
    this.stack.push(s)
    this.root.insertBefore(s.el, this.over)
    s.enter()
    input.consume()
    requestAnimationFrame(() => s.el.classList.add('in'))
    this.focus = null
    this.autoFocus()
    this.sync()
  }

  pop() {
    const s = this.stack.pop()
    if (!s) return
    s.exit()
    s.el.classList.remove('in')
    s.el.classList.add('out')
    setTimeout(() => s.el.remove(), 260)
    this.top?.el.classList.remove('under')
    input.consume()
    this.autoFocus()
    this.sync()
  }

  /** replace the whole stack with a single screen */
  reset(s?: Screen) {
    while (this.stack.length) {
      const o = this.stack.pop()!
      o.exit()
      o.el.remove()
    }
    this.focus = null
    if (s) this.push(s)
    this.sync()
  }

  replace(s: Screen) {
    const o = this.stack.pop()
    if (o) {
      o.exit()
      o.el.remove()
    }
    this.push(s)
  }

  /** rebuild a screen's DOM in place, keeping the focused element's position */
  rerender(s: Screen) {
    const idx = s === this.top && this.focus ? this.focusables().indexOf(this.focus) : -1
    s.render()
    if (s !== this.top) return
    const all = this.focusables()
    this.focus = null
    if (idx >= 0 && all[idx]) this.setFocus(all[idx], true)
    else this.autoFocus()
  }

  /** re-render everything after a language switch */
  relang() {
    for (const s of this.stack) this.rerender(s)
    this.langHooks.forEach((f) => f())
  }

  autoFocus() {
    const s = this.top
    if (!s) return (this.focus = null)
    const keep = this.focus && s.el.contains(this.focus) && this.focus.isConnected
    if (!keep) {
      const first = s.el.querySelector<HTMLElement>('[data-nav].default:not([disabled])') ?? this.focusables()[0]
      this.setFocus(first ?? null, true)
    }
  }

  focusables(): HTMLElement[] {
    const s = this.top
    if (!s) return []
    return [...s.el.querySelectorAll<HTMLElement>('[data-nav]')].filter((e) => !e.hasAttribute('disabled') && e.offsetParent !== null)
  }

  /** `pointer` = focus came from mouse hover (screens may choose not to treat it as a selection) */
  setFocus(el: HTMLElement | null, silent = false, pointer = false) {
    this.focus?.classList.remove('focus')
    this.focus = el
    if (!el) return
    el.classList.add('focus')
    if (!pointer) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    el.dispatchEvent(new CustomEvent('focusin-nav', { bubbles: true, detail: { pointer } }))
    if (!silent) audio.sfx('uiMove')
  }

  /** spatial navigation: nearest focusable in the pressed direction */
  nav(dir: 'up' | 'down' | 'left' | 'right') {
    const all = this.focusables()
    if (!all.length) return
    const cur = this.focus && all.includes(this.focus) ? this.focus : null
    if (!cur) return this.setFocus(all[0])
    const a = cur.getBoundingClientRect()
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2
    let best: HTMLElement | null = null, bs = Infinity
    for (const el of all) {
      if (el === cur) continue
      const b = el.getBoundingClientRect()
      const bx = b.left + b.width / 2, by = b.top + b.height / 2
      const dx = bx - ax, dy = by - ay
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy
      const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
      if (main <= 2) continue
      const score = main + cross * 2.5
      if (score < bs) {
        bs = score
        best = el
      }
    }
    if (best) this.setFocus(best)
    else {
      // wrap around within the same row/column
      const sorted = all.slice().sort((p, q) => {
        const P = p.getBoundingClientRect(), Q = q.getBoundingClientRect()
        return dir === 'up' || dir === 'down' ? P.top - Q.top : P.left - Q.left
      })
      const pickEl = dir === 'up' || dir === 'left' ? sorted[sorted.length - 1] : sorted[0]
      if (pickEl !== cur) this.setFocus(pickEl)
    }
  }

  /** run an action on the top screen as if its button had been pressed */
  trigger(a: Action) {
    const s = this.top
    if (!s || s.lock > 0) return
    if (a === 'confirm') {
      if (!s.action('confirm') && this.focus) this.press(this.focus)
    } else if (!s.action(a) && a === 'back') s.back()
  }

  private press(el: HTMLElement) {
    if (el.hasAttribute('disabled')) audio.sfx('uiDeny')
    else el.click()
  }

  update(dt: number) {
    const s = this.top
    if (!s) return
    s.lock -= dt
    s.el.classList.toggle('locked', s.lock > 0)
    s.update(dt)
    if (s.lock > 0 || this.top !== s) return
    for (const d of ['up', 'down', 'left', 'right'] as const) if (input.pressed(d) && !s.action(d)) this.nav(d)
    if (this.top !== s) return
    if (input.pressed('confirm') && !s.action('confirm') && this.focus) this.press(this.focus)
    if (this.top !== s) return
    if (input.pressed('back') && !s.action('back')) s.back()
    if (this.top !== s) return
    for (const a of OTHER) if (input.pressed(a)) s.action(a)
  }

  /** large centered announcement (paused & hidden while a modal screen is open) */
  banner(title: string, sub = '', color: RGB = [1, 1, 1]) {
    const b = document.createElement('div')
    b.className = 'banner'
    b.style.setProperty('--c', css(color))
    b.innerHTML = `<div class="banner-title" data-t="${title}">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`
    b.addEventListener('animationend', (e) => e.target === b && b.remove())
    this.layer.appendChild(b)
  }

  /** small corner notification */
  toast(html: string, color: RGB = [1, 0.85, 0.3]) {
    const t = document.createElement('div')
    t.className = 'toast'
    t.style.setProperty('--c', css(color))
    t.innerHTML = html
    this.over.appendChild(t)
    setTimeout(() => t.classList.add('out'), 4200)
    setTimeout(() => t.remove(), 4800)
  }
}

export const ui = new UI()
