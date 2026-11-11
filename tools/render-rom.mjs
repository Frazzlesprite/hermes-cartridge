// Render a cartridge headlessly to a PNG through the real adapter, so the
// pane's exact code path is what gets exercised.
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { createCore, SCREEN_WIDTH as W, SCREEN_HEIGHT as H } from '../build/core.node.mjs'

const rom = new Uint8Array(readFileSync(process.argv[2]))
const out = process.argv[3] ?? 'frame.png'
const frames = Number(process.argv[4] ?? 180)

const core = createCore()
const info = await core.loadRom(rom)
console.log('rom:', info.title || '(no title)', 'cgb:', info.isGBC, 'mapper:', info.mapper, 'battery:', info.hasBattery)

const RIGHT = 1 << 3
const start = performance.now()
for (let f = 0; f < frames; f++) {
  core.setInput(f > 30 && f < 120 ? RIGHT : 0)
  core.runFrame()
}
const elapsed = performance.now() - start

const rgba = core.framebufferRGBA()
const colours = new Set()
for (let i = 0; i < rgba.length; i += 4) colours.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])

let hash = 0x811c9dc5
for (let i = 0; i < rgba.length; i++) { hash ^= rgba[i]; hash = Math.imul(hash, 0x01000193) >>> 0 }

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = c ^ (crc >>> 8) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
const raw = Buffer.alloc((W * 3 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0
  for (let x = 0; x < W; x++) {
    const s = (y * W + x) * 4
    raw[y * (W * 3 + 1) + 1 + x * 3] = rgba[s]
    raw[y * (W * 3 + 1) + 2 + x * 3] = rgba[s + 1]
    raw[y * (W * 3 + 1) + 3 + x * 3] = rgba[s + 2]
  }
}
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]))

console.log(JSON.stringify({
  frames,
  msPerFrame: +(elapsed / frames).toFixed(3),
  fps: Math.round(1000 / (elapsed / frames)),
  distinctColours: colours.size,
  hash: hash.toString(16).padStart(8, '0'),
  png: out
}, null, 2))
