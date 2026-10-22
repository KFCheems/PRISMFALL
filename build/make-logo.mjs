// Build a transparent-background PRISMFALL wordmark (Steam library logo, 1280x720) straight from the
// vendored Orbitron font, so the alpha is exact and the lettering matches the in-game logo.
import sharp from 'sharp'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const root = 'C:/GameDev/Project/Claude'

// librsvg/fontconfig can't read WOFF — unpack Orbitron 900 to a TTF first (same trick as build/make-assets.mjs).
function woffToTtf(file) {
  const b = fs.readFileSync(file), n = b.readUInt16BE(12)
  const head = Buffer.alloc(12 + n * 16), es = Math.floor(Math.log2(n)), sr = 2 ** es * 16
  head.writeUInt32BE(b.readUInt32BE(4), 0)
  head.writeUInt16BE(n, 4)
  head.writeUInt16BE(sr, 6)
  head.writeUInt16BE(es, 8)
  head.writeUInt16BE(n * 16 - sr, 10)
  let off = head.length
  const body = []
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20, at = b.readUInt32BE(o + 4), comp = b.readUInt32BE(o + 8), orig = b.readUInt32BE(o + 12)
    const raw = b.subarray(at, at + comp), data = comp < orig ? zlib.inflateSync(raw) : raw
    b.copy(head, 12 + i * 16, o, o + 4)
    head.writeUInt32BE(b.readUInt32BE(o + 16), 16 + i * 16)
    head.writeUInt32BE(off, 20 + i * 16)
    head.writeUInt32BE(data.length, 24 + i * 16)
    body.push(data, Buffer.alloc((4 - (data.length % 4)) % 4))
    off += data.length + ((4 - (data.length % 4)) % 4)
  }
  const ttf = path.join(os.tmpdir(), 'prismfall-orbitron-900.ttf')
  fs.writeFileSync(ttf, Buffer.concat([head, ...body]))
  return ttf
}

const W = 1280, H = 720
const fontfile = woffToTtf(path.join(root, 'node_modules/@fontsource/orbitron/files/orbitron-latin-900-normal.woff'))

// 1) render white letters on transparent, big, then use it as an alpha mask
const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Orbitron" font-weight="900" font-size="176" letter-spacing="6" fill="#ffffff">PRISMFALL</text>
</svg>`

const mask = await sharp(Buffer.from(textSvg), { density: 300 }).resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

// 2) spectrum gradient across the width
const STOPS = ['#ff3b5c', '#ff8a3d', '#ffd23d', '#3dff8b', '#3dfff2', '#3da5ff', '#a35bff', '#ff4dff']
const stops = STOPS.map((c, i) => `<stop offset="${(i / (STOPS.length - 1)) * 100}%" stop-color="${c}"/>`).join('')
const grad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`)

// 3) combine: gradient clipped by the letter alpha
const letters = await sharp(grad)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer()

// 4) soft glow behind, plus the thin spectrum underbar (matches title.ts's PRISM_MARK language)
const glow = await sharp(letters).blur(18).modulate({ brightness: 1.6 }).ensureAlpha(0.75).png().toBuffer()
const underbar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="u" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>
  <rect x="150" y="${Math.round(H * 0.705)}" width="${W - 300}" height="4" fill="url(#u)" opacity="0.9"/>
</svg>`)

await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: glow, blend: 'over' },
    { input: letters, blend: 'over' },
    { input: underbar, blend: 'over' },
  ])
  .png()
  .toFile(path.join(root, 'steam/assets/library_logo.png'))

const m = await sharp(path.join(root, 'steam/assets/library_logo.png')).metadata()
console.log('written library_logo.png', m.width + 'x' + m.height, 'alpha:', m.hasAlpha)
