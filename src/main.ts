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
/** consecutive frames that threw; a single bad frame must never stop the game forever */
let faults = 0
let faultShown = false

function frame(now: number) {
  // Schedule the next frame FIRST. If anything below throws, the loop still continues — the previous
  // shape (`requestAnimationFrame` as the last statement) meant one uncaught exception killed the whole
  // game permanently: the window stayed alive showing the last drawn frame, at 0% CPU, with no way to
  // recover short of a restart. That is exactly how a real playthrough ended at stage time 05:15.
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  try {
    input.update(dt)
    game.frame(dt)
    input.endFrame()
    faults = 0
  } catch (err) {
    faults++
    console.error('[prismfall] frame error', err)
    // One transient fault: swallow it and keep running (the next frame usually recovers). A persistent
    // fault means the game is unplayable, so surface it instead of freezing silently on the last frame.
    if (faults >= 30 && !faultShown) {
      faultShown = true
      showFatal(err)
    }
  }
}

/** Put a recoverable error card on screen when the loop keeps failing, rather than a frozen picture. */
function showFatal(err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  const card = document.createElement('div')
  card.setAttribute('role', 'alertdialog')
  card.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(3,4,13,.92);font:14px/1.6 ui-monospace,monospace;color:#e8ecff;padding:32px;text-align:center'
  card.innerHTML =
    `<div style="max-width:720px">
       <div style="font-size:20px;letter-spacing:.14em;color:#ff6d8f;margin-bottom:14px">RUN HALTED</div>
       <p style="opacity:.8;margin:0 0 12px">The game hit a repeated internal error and stopped this run.
       Your profile and anything already saved are intact.</p>
       <pre style="white-space:pre-wrap;text-align:left;background:#0a0d1c;border:1px solid #2a3358;border-radius:8px;padding:12px;max-height:220px;overflow:auto;font-size:12px">${msg.replace(
         /[<>&]/g,
         (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!,
       )}</pre>
       <button id="pf-fatal-back" style="margin-top:16px;padding:10px 22px;border-radius:8px;border:1px solid #3a4a8a;background:#16204a;color:#cfe0ff;font:inherit;cursor:pointer">Back to menu</button>
     </div>`
  document.body.appendChild(card)
  card.querySelector('#pf-fatal-back')?.addEventListener('click', () => {
    faults = 0
    faultShown = false
    card.remove()
    try {
      game.toMenu()
    } catch {
      location.reload()
    }
  })
}

requestAnimationFrame(frame)

// debug handle for automated tests
;(window as any).__pf = { game, save, ui, renderer, input, audio }
