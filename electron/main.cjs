// PRISMFALL desktop shell: one window, fullscreen toggles, Steam achievements + overlay.
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

if (!app.requestSingleInstanceLock()) process.exit(0)

// steam_appid.txt (project root in dev, next to the exe when packaged) is for local testing only and is not uploaded:
// a Steam launch provides SteamAppId itself, so a shipped build passes no id. Dev falls back to 480 (Spacewar).
const appIdFile = path.join(app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..'), 'steam_appid.txt')
const appId = (fs.existsSync(appIdFile) && Number(fs.readFileSync(appIdFile, 'utf8').trim())) || (app.isPackaged ? undefined : 480)

let steam = null
try {
  const sw = require('steamworks.js')
  steam = sw.init(appId)
  sw.electronEnableSteamOverlay()
} catch (e) {
  console.log('[steam] not available:', e.message)
}

// audio must start without a click (gamepad-only players, Steam Deck); prefer the discrete GPU on laptops
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('force_high_performance_gpu')

// window state lives in userData; the renderer re-applies its own fullscreen setting via native.setFullscreen
const stateFile = path.join(app.getPath('userData'), 'window.json')
const state = { fullscreen: true, width: 1600, height: 900 }
if (fs.existsSync(stateFile)) Object.assign(state, JSON.parse(fs.readFileSync(stateFile, 'utf8')))
const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state))

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1280,
    minHeight: 720,
    fullscreen: state.fullscreen,
    backgroundColor: '#000',
    title: 'PRISMFALL',
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'), // packaged: exe icon
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      additionalArguments: [`--pf-steam=${steam ? 1 : 0}`],
    },
  })
  win.once('ready-to-show', () => win.show())
  const setFull = (on) => {
    state.fullscreen = on
    saveState()
  }
  win.on('enter-full-screen', () => setFull(true))
  win.on('leave-full-screen', () => setFull(false))
  win.on('resized', () => {
    if (win.isFullScreen() || win.isMaximized()) return
    ;[state.width, state.height] = win.getSize()
    saveState()
  })

  const wc = win.webContents
  wc.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return
    if (i.key === 'F11' || (i.alt && i.key === 'Enter')) {
      e.preventDefault()
      win.setFullScreen(!win.isFullScreen())
    } else if (i.key === 'F12' && !app.isPackaged) wc.toggleDevTools()
  })
  // the game never opens pages: keep the window on the bundled build
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e) => e.preventDefault())

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

Menu.setApplicationMenu(null)

ipcMain.on('quit', () => app.quit())
ipcMain.on('fullscreen', (_, on) => win.setFullScreen(!!on))
ipcMain.on('achieve', (_, id) => steam?.achievement.activate(String(id)))

app.on('second-instance', () => {
  if (win.isMinimized()) win.restore()
  win.focus()
})
app.on('window-all-closed', () => app.quit())
app.whenReady().then(createWindow)
