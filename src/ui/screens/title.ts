import { l, loc } from '../../core/i18n'
import { audio } from '../../core/audio'
import { Screen, ui } from '../ui'
import { MainMenu } from './menu'
import pkg from '../../../package.json'

export const VERSION = pkg.version
export const TAGLINE = l('Bend light. Mix color. Survive the fall.', '折射光芒，调和色彩，在坠落中幸存。')

/** inline prism mark: white beam in, spectrum out */
export const PRISM_MARK = `<svg class="prism-mark" viewBox="0 0 240 120">
  <line class="beam" x1="0" y1="78" x2="96" y2="62"/>
  <line class="ray r" x1="134" y1="64" x2="240" y2="40"/>
  <line class="ray g" x1="134" y1="66" x2="240" y2="64"/>
  <line class="ray b" x1="134" y1="68" x2="240" y2="88"/>
  <polygon class="tri" points="120,12 168,100 72,100"/>
</svg>`

export const logoHtml = (cls = '') => `
  <div class="logo-wrap ${cls}">
    ${PRISM_MARK}
    <div class="logo" data-t="PRISMFALL">PRISMFALL</div>
    <div class="tagline">${loc(TAGLINE)}</div>
  </div>`

/** Splash: animated logo, "press any key", then the main menu. */
export class TitleScreen extends Screen {
  private leaving = 0
  private any = () => this.go()

  constructor() {
    super('title menu')
    this.render()
  }

  render() {
    this.el.innerHTML = `
      ${logoHtml('big')}
      <div class="press"><span>${loc(l('Press any key', '按任意键开始'))}</span><i class="pb a">A</i></div>
      <div class="ver">v${VERSION}</div>`
  }

  enter() {
    audio.music('menu')
    window.addEventListener('keydown', this.any)
    this.el.addEventListener('pointerdown', this.any)
  }

  exit() {
    window.removeEventListener('keydown', this.any)
  }

  private go() {
    if (this.leaving) return
    audio.unlock()
    audio.sfx('uiSelect')
    this.leaving = 0.55
    this.el.classList.add('leaving')
  }

  update(dt: number) {
    if (!this.leaving) return
    this.leaving -= dt
    if (this.leaving <= 0) ui.replace(new MainMenu())
  }

  action() {
    this.go()
    return true
  }

  back() {}
}
