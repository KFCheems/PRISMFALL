// Exposes window.native (NativeBridge in src/game/meta.ts) to the sandboxed renderer.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('native', {
  quit: () => ipcRenderer.send('quit'),
  setFullscreen: (on) => ipcRenderer.send('fullscreen', !!on),
  achieve: (id) => ipcRenderer.send('achieve', id),
  steam: process.argv.includes('--pf-steam=1'),
})
