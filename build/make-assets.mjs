// Store art + icon pipeline: `npm run assets`. Sources are the generated paintings in build/art and steam/art.
// Output: build/icon.png, build/icon.ico, public/favicon.png, steam/assets/*.png
import sharp from 'sharp'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const root = path.join(import.meta.dirname, '..')
const at = (...p) => path.join(root, ...p)
const out = at('steam', 'assets')
fs.mkdirSync(out, { recursive: true })

// ───────────────────────────── font ─────────────────────────────
// librsvg only sees fonts fontconfig knows; FreeType here can't read WOFF, so unpack it to a TTF and
// register it through a throwaway Pango text render (sharp adds `fontfile` to the fontconfig app set).
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
  const ttf = path.join(os.tmpdir(), path.basename(file, '.woff') + '.ttf')
  fs.writeFileSync(ttf, Buffer.concat([head, ...body]))
  return ttf
}
const fontfile = woffToTtf(at('node_modules', '@fontsource', 'orbitron', 'files', 'orbitron-latin-900-normal.woff'))
await sharp({ text: { text: 'PRISMFALL', font: 'Orbitron', fontfile } }).png().toBuffer()

// ───────────────────────────── logo ─────────────────────────────
const SPECTRUM = ['#ff3b5c', '#ff8a3d', '#ffd23d', '#3dff8b', '#3dfff2', '#3da5ff', '#a35bff', '#ff4dff']

/** 'PRISMFALL' wordmark: dark keyline, wide spectral glow, chromatic split, gradient fill, glass sheen, refracted beam. */
async function logo() {
  const W = 2600, H = 760, cx = W / 2, by = 470, fs_ = 300
  const stops = SPECTRUM.map((c, i) => `<stop offset="${(i / (SPECTRUM.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')
  const text = (attrs) =>
    `<text x="${cx}" y="${by}" text-anchor="middle" font-family="Orbitron" font-weight="900" font-size="${fs_}" letter-spacing="18" ${attrs}>PRISMFALL</text>`
  const beam = (y, color, a, w) => `<rect x="${cx - 1150}" y="${y}" width="2300" height="${w}" rx="${w / 2}" fill="url(#fade)" style="fill:${color}" opacity="${a}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="spec" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>
    <linearGradient id="sheen" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.08"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="beamW" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="beamS" x1="0" x2="1" y1="0" y2="0">${SPECTRUM.map((c, i) => {
      const o = i / (SPECTRUM.length - 1)
      return `<stop offset="${o.toFixed(3)}" stop-color="${c}" stop-opacity="${(1 - Math.abs(o - 0.5) * 2 * 0.9).toFixed(2)}"/>`
    }).join('')}</linearGradient>
    <filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="34"/></filter>
    <filter id="soft" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="haze" x="-10%" y="-400%" width="120%" height="900%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  ${text('fill="url(#spec)" opacity="0.95" filter="url(#glow)"')}
  ${text('fill="none" stroke="#04050d" stroke-width="26" stroke-linejoin="round" opacity="0.9"')}
  ${text('fill="#ff2040" opacity="0.55" transform="translate(-9 0)" filter="url(#soft)"')}
  ${text('fill="#2060ff" opacity="0.55" transform="translate(9 0)" filter="url(#soft)"')}
  ${text('fill="url(#spec)"')}
  ${text('fill="url(#sheen)"')}
  ${text('fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="3"')}
  <rect x="${cx - 1150}" y="${by + 52}" width="2300" height="26" fill="url(#beamS)" filter="url(#haze)" opacity="0.9"/>
  <rect x="${cx - 1150}" y="${by + 60}" width="2300" height="10" rx="5" fill="url(#beamS)"/>
  <rect x="${cx - 700}" y="${by + 63}" width="1400" height="4" rx="2" fill="url(#beamW)"/>
</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer().then((b) => sharp(b).trim({ threshold: 1 }).png().toBuffer())
}

const LOGO = await logo()

// ───────────────────────────── capsules ─────────────────────────────
/** cover-crop a painting to w×h; focus is the crop anchor (0..1 on each axis) */
async function art(src, w, h, fx = 0.5, fy = 0.5) {
  const m = await sharp(src).metadata(), k = Math.max(w / m.width, h / m.height)
  const rw = Math.round(m.width * k), rh = Math.round(m.height * k)
  return sharp(src).resize(rw, rh, { kernel: 'lanczos3' }).extract({ left: Math.round((rw - w) * fx), top: Math.round((rh - h) * fy), width: w, height: h })
    .sharpen({ sigma: k > 1 ? 1 : 0.6 }).png().toBuffer()
}

/** the wordmark scaled to width lw, with a soft dark pool behind it so it reads over busy art */
async function withLogo(bg, w, h, lw, ly, pool = 0.72) {
  const logo = await sharp(LOGO).resize(Math.round(lw)).png().toBuffer(), lm = await sharp(logo).metadata()
  const cy = Math.round(h * ly), top = Math.round(cy - lm.height / 2)
  const shade = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#02030a" stop-opacity="${pool}"/><stop offset="0.6" stop-color="#02030a" stop-opacity="${pool * 0.6}"/>
    <stop offset="1" stop-color="#02030a" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="${w / 2}" cy="${cy}" rx="${lw * 0.72}" ry="${lm.height * 1.5}" fill="url(#g)"/></svg>`
  return sharp(bg).composite([{ input: Buffer.from(shade) }, { input: logo, left: Math.round((w - lm.width) / 2), top }]).png().toBuffer()
}

const WIDE = at('steam', 'art', 'keyart_wide.png'), TALL = at('steam', 'art', 'keyart_tall.png'), HERO = at('steam', 'art', 'hero_wide.png')
const write = (name, buf) => sharp(buf).png({ compressionLevel: 9 }).toFile(path.join(out, name + '.png'))

const capsules = [
  ['header_capsule', 920, 430, WIDE, 0.5, 0.35, 0.8, 0.6],
  ['small_capsule', 462, 174, WIDE, 0.5, 0.5, 0.9, 0.5, 0.82],
  ['main_capsule', 1232, 706, WIDE, 0.5, 0.4, 0.66, 0.62],
  ['vertical_capsule', 748, 896, TALL, 0.5, 0.45, 0.86, 0.8],
  ['library_capsule', 600, 900, TALL, 0.5, 0.5, 0.88, 0.8],
]
for (const [name, w, h, src, fx, fy, lw, ly, pool] of capsules) await write(name, await withLogo(await art(src, w, h, fx, fy), w, h, w * lw, ly, pool))

// store page backdrop: dimmed, softened, fading to black toward the bottom so page text stays readable
{
  const [w, h] = [1438, 810]
  const fade = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="f" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity="0.15"/><stop offset="0.55" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#f)"/></svg>`
  const bg = await sharp(await art(HERO, w, h, 0.5, 0.3)).blur(2.5).modulate({ brightness: 0.55, saturation: 0.85 }).png().toBuffer()
  await write('page_background', await sharp(bg).composite([{ input: Buffer.from(fade) }]).png().toBuffer())
}
// library hero: no text (Steam overlays library_logo on it)
await write('library_hero', await art(HERO, 3840, 1240, 0.5, 0.42))
// library logo: transparent, filling the width
{
  const logo = await sharp(LOGO).resize(1280, 720, { fit: 'inside' }).png().toBuffer(), m = await sharp(logo).metadata()
  await write('library_logo', await sharp({ create: { width: 1280, height: 720, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, left: Math.round((1280 - m.width) / 2), top: Math.round((720 - m.height) / 2) }]).png().toBuffer())
}

// ───────────────────────────── app icon ─────────────────────────────
// big sizes keep the halo; tiny sizes crop tight onto the crystal and get extra punch so it reads at 16–32 px
const ICON = at('build', 'art', 'icon_src.png')
async function icon(size) {
  const m = (await sharp(ICON).metadata()).width, c = Math.round(m * (size <= 32 ? 0.86 : 0.94)), o = Math.round((m - c) / 2)
  const img = sharp(ICON).extract({ left: o, top: o, width: c, height: c }).resize(size, size, { kernel: 'lanczos3' })
  if (size <= 32) return img.modulate({ saturation: 1.25 }).linear(1.15, -10).sharpen({ sigma: 0.5 }).png().toBuffer()
  // larger sizes: rounded tile with a thin spectral rim
  const r = size * 0.2, k = size / 256
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}"/></svg>`
  const rim = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff3b5c"/><stop offset="0.5" stop-color="#3dff8b"/><stop offset="1" stop-color="#3da5ff"/></linearGradient></defs>
    <rect x="${k}" y="${k}" width="${size - 2 * k}" height="${size - 2 * k}" rx="${r - k}" fill="none" stroke="url(#g)" stroke-width="${2 * k}" opacity="0.7"/></svg>`
  return sharp(await img.png().toBuffer())
    .composite([{ input: Buffer.from(rim) }, { input: Buffer.from(mask), blend: 'dest-in' }])
    .png({ compressionLevel: 9 }).toBuffer()
}

/** ICO with PNG-compressed entries (valid since Vista; accepted by rcedit / electron-builder) */
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let off = head.length
  images.forEach(([size, png], i) => {
    const e = 6 + i * 16
    head.writeUInt8(size & 255, e) // 256 is stored as 0
    head.writeUInt8(size & 255, e + 1)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(png.length, e + 8)
    head.writeUInt32LE(off, e + 12)
    off += png.length
  })
  return Buffer.concat([head, ...images.map((x) => x[1])])
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
fs.writeFileSync(at('build', 'icon.ico'), ico(await Promise.all(sizes.map(async (s) => [s, await icon(s)]))))
fs.writeFileSync(at('build', 'icon.png'), await icon(512))
fs.mkdirSync(at('public'), { recursive: true })
fs.writeFileSync(at('public', 'favicon.png'), await icon(64))
console.log('assets written: build/icon.{png,ico}, public/favicon.png, steam/assets/*')
