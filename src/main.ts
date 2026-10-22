import './ui/style.css'
import './ui/hud.css'
import './ui/screens.css'
import { renderer } from './core/gl'
import { input } from './core/input'
import { audio } from './core/audio'
import { save } from './core/save'
import { game } from './game/game'
import { ui } from './ui/ui'
import { TitleScreen } from './ui/screens/title'

const s = save.load().settings
renderer.renderScale = s.renderScale
renderer.post.bloom = s.bloom
renderer.init(document.getElementById('gl') as HTMLCanvasElement, document.getElementById('fx') as HTMLCanvasElement)
input.init(document.body)
ui.init(document.getElementById('ui')!)

const unlockAudio = () => {
  audio.unlock()
  audio.volumes(s.master, s.music, s.sfx)
}
window.addEventListener('pointerdown', unlockAudio)
window.addEventListener('keydown', unlockAudio)

ui.push(new TitleScreen())

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  input.update(dt)
  game.frame(dt)
  input.endFrame()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// debug handle for automated tests
;(window as any).__pf = { game, save, ui, renderer, input, audio }
